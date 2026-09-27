#include "web.h"
#include "config.h"
#include "net.h"
#include "oled.h"
#include "ura4.h"
#include "epclist.h"
#include "boxmap.h"
#include "validate.h"
#include <Ethernet.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <ESP.h>

// ---------------------------------------------------------------------------
// Minimal HTTP/1.1 server on top of EthernetServer.
//
// esp_http_server cannot be used here: it runs on lwIP sockets, while the
// Ethernet library drives the W5500's own hardware sockets and never touches
// lwIP. A ping answers (the chip handles ARP/ICMP itself) but no TCP port is
// ever listening, so the server has to be built on EthernetServer instead.
//
// One request per connection, Connection: close. Responses carry an explicit
// Content-Length so nothing needs chunked encoding.
//
// Routes are plain string comparisons; add new ones in route() below.
//
// One listening socket is not enough. A W5500 socket serves exactly one
// connection, and EthernetServer::begin() allocates only one, so as soon as two
// requests overlap the extra SYNs land on a port with nothing listening and the
// browser gives up. That is invisible with curl (serialised) but shows up as
// broken images and missing CSS, since a browser fetches a dozen assets at once.
// So listen on several sockets and pump them all.
// ---------------------------------------------------------------------------
static const uint8_t LISTEN_SOCKETS = 4;

// EthernetServer leaves begin(uint16_t) pure virtual, so the port argument has
// to be swallowed by a subclass before the no-arg overload can be called.
class WebServer80 : public EthernetServer {
public:
    WebServer80() : EthernetServer(80) {}
    void begin(uint16_t port = 0) override {
        (void)port;
        EthernetServer::begin();
    }
};

static WebServer80 s_servers[LISTEN_SOCKETS];

static void markUp();   // stamps and logs the moment the port opens

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
static const char* mimeFor(const char* path) {
    const char* dot = strrchr(path, '.');
    if (!dot) return "text/plain";
    if (!strcmp(dot, ".html")) return "text/html";
    if (!strcmp(dot, ".css"))  return "text/css";
    if (!strcmp(dot, ".js"))   return "application/javascript";
    if (!strcmp(dot, ".json")) return "application/json";
    if (!strcmp(dot, ".png"))  return "image/png";
    if (!strcmp(dot, ".svg"))  return "image/svg+xml";
    if (!strcmp(dot, ".ico"))  return "image/x-icon";
    return "text/plain";
}

static void sendBody(EthernetClient& c, const String& body);

static void sendJson(EthernetClient& c, JsonDocument& doc, int status = 200) {
    String body;
    serializeJson(doc, body);
    c.print("HTTP/1.1 ");
    c.print(status);
    c.print(status == 200 ? " OK\r\n" : " Bad Request\r\n");
    c.print("Content-Type: application/json\r\n");
    c.print("Content-Length: ");
    c.print(body.length());
    c.print("\r\nConnection: close\r\n\r\n");
    sendBody(c, body);
}

// ---------------------------------------------------------------------------
// Sending a body.
//
// Print::print(String) hands the whole string to a single write(), and
// EthernetClient::write -> EthernetClass::socketSend() caps one call at
// W5100.SSIZE — 2048 bytes unless ETHERNET_LARGE_BUFFERS is defined, which this
// build does not. Anything longer is therefore truncated at 2048 and *still
// reported as written*, so the response goes out with a Content-Length that
// promises more than it delivers and the client hangs or errors partway.
//
// Found with the box map blob: a 11062-byte map saved fine but read back as
// "IncompleteRead(2048 bytes read, 9014 more expected)". Any body that can
// exceed 2 KB has to be chunked, so every body goes through here.
// ---------------------------------------------------------------------------
static void sendBody(EthernetClient& c, const String& body) {
    // 1 KB per SPI write, same as sendFile(), so a socket send is a handful of
    // rounds rather than one per byte.
    static const size_t CHUNK = 1024;
    size_t sent = 0;
    while (sent < body.length()) {
        size_t n = body.length() - sent;
        if (n > CHUNK) n = CHUNK;
        size_t wrote = c.write((const uint8_t*)body.c_str() + sent, n);
        if (!wrote) break;      // socket gone: stop rather than spin
        sent += wrote;
    }
}

// For relaying a response we did not build: the body is already JSON text and
// the status is the reader's own, so the reason phrase is left empty rather
// than claiming "OK" or "Bad Gateway" for a code we did not choose.
static void sendRawJson(EthernetClient& c, const String& body, int status) {
    c.print("HTTP/1.1 ");
    c.print(status);
    c.print("\r\nContent-Type: application/json\r\n");
    c.print("Content-Length: ");
    c.print(body.length());
    c.print("\r\nConnection: close\r\n\r\n");
    sendBody(c, body);
}

static void send404(EthernetClient& c) {
    const char* body = "not found";
    c.print("HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: ");
    c.print(strlen(body));
    c.print("\r\nConnection: close\r\n\r\n");
    c.print(body);
}

static void sendFile(EthernetClient& c, const char* path) {
    if (!LittleFS.exists(path)) { send404(c); return; }

    File f = LittleFS.open(path, "r");
    if (!f) { send404(c); return; }

    c.print("HTTP/1.1 200 OK\r\nContent-Type: ");
    c.print(mimeFor(path));
    c.print("\r\nContent-Length: ");
    c.print(f.size());
    // Let the browser keep assets between page switches. Without this every
    // navigation re-downloaded the CSS and both scripts over a fresh TCP
    // connection, which is what made switching pages feel like a pause.
    // 60s is short enough that a re-upload shows up on its own.
    c.print("\r\nCache-Control: max-age=60\r\nConnection: close\r\n\r\n");

    // 1 KB per SPI write instead of 512: the CSS and both scripts are 10-24 KB,
    // and each write is a round of SPI traffic to the W5500.
    uint8_t buf[1024];
    while (f.available()) {
        size_t n = f.read(buf, sizeof(buf));
        if (!n) break;
        c.write(buf, n);
    }
    f.close();
}

// Decodes a percent-encoded form value. Needed because the browser sends the
// reader payload as `data=<url-encoded json>`, and the board has to look inside
// that JSON to validate it before forwarding.
static String urlDecode(const String& in) {
    String out;
    out.reserve(in.length());
    for (int i = 0; i < (int)in.length(); i++) {
        char c = in[i];
        if (c == '%' && i + 2 < (int)in.length()) {
            auto hex = [](char h) -> int {
                if (h >= '0' && h <= '9') return h - '0';
                if (h >= 'a' && h <= 'f') return h - 'a' + 10;
                if (h >= 'A' && h <= 'F') return h - 'A' + 10;
                return -1;
            };
            int hi = hex(in[i + 1]), lo = hex(in[i + 2]);
            if (hi >= 0 && lo >= 0) {
                out += (char)((hi << 4) | lo);
                i += 2;
                continue;
            }
        }
        out += c;
    }
    return out;
}

// Reads one CRLF-terminated line, giving up after timeoutMs of silence.
static bool readLine(EthernetClient& c, String& out, uint32_t timeoutMs) {
    out = "";
    uint32_t t0 = millis();
    while (millis() - t0 < timeoutMs) {
        if (!c.available()) { delay(1); continue; }
        char ch = c.read();
        if (ch == '\n') return true;
        if (ch != '\r') out += ch;
        t0 = millis();
    }
    return false;
}

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------
static void hDeviceInfo(EthernetClient& c) {
    JsonDocument out;
    out["code"]      = 0;
    out["chip"]      = ESP.getChipModel();
    out["cores"]     = ESP.getChipCores();
    out["cpuMhz"]    = ESP.getCpuFreqMHz();
    out["mac"]       = netMac();
    out["ip"]        = netIP().toString();
    out["linkUp"]    = netConnected();
    out["speed"]     = netSpeed();
    out["uptimeSec"] = millis() / 1000;
    out["freeHeap"]  = ESP.getFreeHeap();
    out["flashSize"] = ESP.getFlashChipSize();
    out["sdk"]       = ESP.getSdkVersion();
    out["firmware"]  = "0.5.0";
    out["ura4"]      = cfg.ura4Host;
    out["ura4Port"]  = ura4Port();
    sendJson(c, out);
}

// Read: whole config in one round-trip, so the page opens with one request.
static void hQuery(EthernetClient& c) {
    JsonDocument out;
    out["type"] = "Reader-queryBaseConfigurationResponse";
    out["code"] = 0;
    configToJson(out["result"].to<JsonObject>());
    sendJson(c, out);
}

// Write: per-group result, mirroring the original's contract.
static void hUpdate(EthernetClient& c, const String& body) {
    JsonDocument in;
    if (deserializeJson(in, body)) {
        JsonDocument out;
        out["type"]    = "Reader-updateBaseConfigurationResponse";
        out["code"]    = 1;
        out["message"] = "malformed JSON body";
        sendJson(c, out, 400);
        return;
    }

    JsonDocument out;
    out["type"] = "Reader-updateBaseConfigurationResponse";
    JsonObject result = out["result"].to<JsonObject>();
    configApply(in.as<JsonVariantConst>(), result);

    oledApplySettings();

    // top-level code is 0 only when every group that was sent succeeded
    bool allOk = true;
    for (JsonPair kv : result) {
        if (kv.value()["code"].as<int>() != 0) { allOk = false; break; }
    }
    out["code"] = allOk ? 0 : 1;
    sendJson(c, out);
}

static void hReboot(EthernetClient& c) {
    JsonDocument out;
    out["code"]    = 0;
    out["message"] = "rebooting";
    sendJson(c, out);
    c.stop();
    delay(200);
    ESP.restart();
}

// Sweeps the subnet for the reader. Blocking (tens of seconds), which is why it
// is a route the user asks for rather than something the board does at boot.
// The response carries every address that answered HTTP on the reader's port.
static void hScan(EthernetClient& c) {
    // The sweep blocks the loop for ~26s and nothing else is served meanwhile,
    // so say so on the panel. Without it the page just hangs and the button
    // looks like it did nothing.
    oledShowMessage("FIND READER", "scanning subnet...");

    IPAddress found[8];
    uint8_t n = ura4Scan(found, 8);

    JsonDocument out;
    out["code"] = 0;
    out["hosts"] = JsonArray();
    for (uint8_t i = 0; i < n; i++) out["hosts"].add(found[i].toString());
    out["current"] = cfg.ura4Host;
    out["port"]    = ura4Port();
    sendJson(c, out);

    oledShowMessage("FIND READER",
                    n ? "found - tap it in page" : "no reader found");
}

// ---------------------------------------------------------------------------
// Changing the reader's own network settings moves it, possibly to an address
// nobody knows — DHCP will hand it whatever the server decides, and a static
// change is typed by hand. Either way the board would be left pointing at an
// address that no longer answers.
//
// So after forwarding a network update that succeeded, sweep the subnet and
// adopt whatever is listening on the reader's port now. The sweep costs ~26s,
// which is why this runs only for this one route and only on success.
//
// The reader answers `currentIP` but has no query for its DHCP/static mode
// (seven plausible function names all came back empty, and the reader's own
// page never reads it back either — it just defaults the radio to DHCP). So the
// board cannot know in advance where the reader will land; it has to look.
// ---------------------------------------------------------------------------
static void adoptNewReaderAddress(const String& updateResponse) {
    // The reader's update responses put the group at the TOP level, not under a
    // "result" key: {"message":"","ethernetIp":{"code":0,...}}. Looking for
    // res["result"] found nothing and this returned before ever scanning.
    JsonDocument res;
    if (deserializeJson(res, updateResponse)) return;

    bool anyOk = false;
    for (JsonPair kv : res.as<JsonObject>()) {
        if (kv.value().is<JsonObject>() && kv.value()["code"].as<int>() == 0) {
            anyOk = true;
            break;
        }
    }
    if (!anyOk) {
        Serial.println("[net] update did not succeed, not rescanning");
        return;
    }

    Serial.println("[net] reader settings changed, rescanning for it");
    IPAddress found[8];
    uint8_t n = ura4Scan(found, 8);
    if (n == 0) {
        Serial.println("[net] reader not found after the change");
        return;
    }

    // Prefer the address we already had, in case several hosts answer.
    IPAddress pick = found[0];
    for (uint8_t i = 0; i < n; i++) {
        if (found[i].toString() == cfg.ura4Host) pick = found[i];
    }

    String as = pick.toString();
    if (as == cfg.ura4Host) {
        Serial.printf("[net] reader still at %s\n", as.c_str());
        return;
    }
    strlcpy(cfg.ura4Host, as.c_str(), sizeof(cfg.ura4Host));
    configSave();
    Serial.printf("[net] reader moved to %s, saved\n", as.c_str());
}

// ---------------------------------------------------------------------------
// EPC whitelist.
//
// The list lives on the board so any tablet or phone sees the same one, and it
// survives a browser cache clear. The browser does the matching: it already has
// every tag in hand, and a round-trip per tag would be absurd.
// ---------------------------------------------------------------------------
static void hEpcGet(EthernetClient& c) {
    JsonDocument out;
    out["code"]  = 0;
    out["count"] = epcListCount();
    out["text"]  = epcListText();
    sendJson(c, out);
}

// Accepts either `text` (replace) or `append` (add to what is there).
static void hEpcSet(EthernetClient& c, const String& body) {
    JsonDocument in;
    if (deserializeJson(in, body)) {
        sendRawJson(c, "{\"code\":1,\"message\":\"malformed JSON body\"}", 400);
        return;
    }

    bool ok;
    if (in["append"].is<const char*>()) {
        ok = epcListAppend(in["append"].as<String>());
    } else if (in["text"].is<const char*>()) {
        ok = epcListSave(in["text"].as<String>());
    } else {
        sendRawJson(c, "{\"code\":1,\"message\":\"send text or append\"}", 400);
        return;
    }

    if (!ok) {
        String err = "{\"code\":1,\"message\":\"list too large (max ";
        err += EPC_LIST_MAX_BYTES;
        err += " bytes) or write failed\"}";
        sendRawJson(c, err, 400);
        return;
    }

    JsonDocument out;
    out["code"]  = 0;
    out["count"] = epcListCount();
    sendJson(c, out);
}

// Rebooting the reader takes it off the network for about a minute, and it may
// come back on a different address. Show the splash so whoever is standing at
// the board can see when it is ready again rather than watching a dead IP.
static void hReaderReboot(EthernetClient& c) {
    Ura4Result r = ura4Post("/DeviceRebootController/deviceRebootRequest",
                            "data={\"type\":\"Reader-deviceRebootRequest\"}", 8000);
    if (r.status == 0) {
        String err = "{\"code\":1,\"message\":\"URA4 unreachable at ";
        err += ura4IP().toString();
        err += ":" + String(ura4Port()) + "\"}";
        sendRawJson(c, err, 502);
        return;
    }
    sendRawJson(c, r.body, r.status);

    // Only if the reader actually accepted it.
    if (r.body.indexOf("\"code\":0") >= 0) oledBootSplash(90000);
}

// ---------------------------------------------------------------------------
// Which page a client is looking at, for the OLED.
//
// The browser reports this on every poll and once when a page opens, and the
// board just displays it. Deliberately NOT a route that queries the reader
// itself: the reader does one RF operation at a time, so a second poller on the
// board would contend with the browser's and slow tag reading down — the exact
// opposite of what is wanted.
//
// "Open" is tracked separately from "running": the Inventory screen should be
// on the panel as soon as the page is opened, showing 0, not only once Start has
// been pressed. The tags stay on screen after a stop, so the page being open is
// the right condition throughout.
// ---------------------------------------------------------------------------
static uint16_t s_invCount    = 0;
static bool     s_invRunning  = false;
static bool     s_invPage     = false;   // Inventory page has been opened
static uint32_t s_invLastSeen = 0;
static String   s_lastEpc     = "";
static String   s_lastCell    = "";
static String   s_lastMsg     = "";
static String   s_view        = "";

static void hInvStatus(EthernetClient& c, const String& body) {
    JsonDocument in;
    if (!deserializeJson(in, body)) {
        if (in["count"].is<uint16_t>() || in["count"].is<int>()) {
            s_invCount = in["count"].as<uint16_t>();
        }
        if (in["running"].is<bool>()) {
            s_invRunning = in["running"].as<bool>();
        }
        const char* v = in["view"] | "";
        if (v && strlen(v) > 0) s_view = String(v);
        if (s_view == "inventory") s_invPage = true;

        const char* epc = in["epc"] | "";
        if (epc && strlen(epc) > 0) s_lastEpc = String(epc);

        const char* cell = in["cell"] | "";
        if (cell && strlen(cell) > 0) s_lastCell = String(cell);

        const char* msg = in["msg"] | "";
        if (msg && strlen(msg) > 0) s_lastMsg = String(msg);

        s_invLastSeen = millis();
    }
    // No body worth returning; the caller does not wait on this.
    sendRawJson(c, "{\"code\":0}", 200);
}

// Read by the OLED.
uint16_t invStatusCount()   { return s_invCount; }
bool     invStatusRunning() { return s_invRunning; }
bool     invViewActive()    { return s_invPage; }
String   oledGetView()      { return s_view; }
String   oledGetLastEpc()   { return s_lastEpc; }
String   oledGetLastCell()  { return s_lastCell; }
String   oledGetLastMsg()   { return s_lastMsg; }
uint32_t oledGetLastSeen()  { return s_invLastSeen; }

static void hEpcClear(EthernetClient& c) {
    epcListClear();
    JsonDocument out;
    out["code"]  = 0;
    out["count"] = 0;
    sendJson(c, out);
}

// ---------------------------------------------------------------------------
// Box map. Opaque pass-through: the browser owns the JSON, the board only keeps
// the bytes. GET returns the blob as text/plain rather than wrapping it in an
// envelope — the browser can then hand it straight to JSON.parse without the
// board having to embed and re-escape a document inside another one.
// ---------------------------------------------------------------------------
static void hBoxMapGet(EthernetClient& c) {
    String body = boxMapText();
    c.print("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ");
    c.print(body.length());
    c.print("\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n");
    sendBody(c, body);
}

static void hBoxMapSet(EthernetClient& c, const String& body) {
    // Raw body, deliberately not JSON-parsed: whatever shape the browser stores
    // is its business, and rejecting it here would mean the two ends have to
    // agree on a schema the board does not otherwise care about.
    if (!boxMapSave(body)) {
        String err = "{\"code\":1,\"message\":\"map too large (max ";
        err += BOXMAP_MAX_BYTES;
        err += " bytes) or write failed\"}";
        sendRawJson(c, err, 400);
        return;
    }
    JsonDocument out;
    out["code"]  = 0;
    out["bytes"] = (uint32_t)body.length();
    sendJson(c, out);
}

static void hBoxMapClear(EthernetClient& c) {
    boxMapSave("");
    JsonDocument out;
    out["code"] = 0;
    sendJson(c, out);
}

static void hBoxMapList(EthernetClient& c) {
    String listJson = boxMapListNamed();
    JsonDocument out;
    out["code"] = 0;
    JsonDocument listDoc;
    deserializeJson(listDoc, listJson);
    out["maps"] = listDoc.as<JsonArray>();
    sendJson(c, out);
}

static void hBoxMapSaveNamed(EthernetClient& c, const String& body) {
    JsonDocument in;
    if (deserializeJson(in, body)) {
        sendRawJson(c, "{\"code\":1,\"message\":\"malformed JSON body\"}", 400);
        return;
    }
    const char* name = in["name"] | "";
    if (!name || strlen(name) == 0) {
        sendRawJson(c, "{\"code\":1,\"message\":\"name is required\"}", 400);
        return;
    }
    String mapData;
    if (in["data"].is<JsonObject>() || in["data"].is<JsonArray>()) {
        serializeJson(in["data"], mapData);
    } else if (in["data"].is<const char*>()) {
        mapData = in["data"].as<String>();
    } else {
        mapData = boxMapText();
    }

    if (!boxMapSaveNamed(name, mapData)) {
        sendRawJson(c, "{\"code\":1,\"message\":\"failed to save named map\"}", 500);
        return;
    }
    JsonDocument out;
    out["code"] = 0;
    out["name"] = name;
    sendJson(c, out);
}

static void hBoxMapLoadNamed(EthernetClient& c, const String& body) {
    JsonDocument in;
    if (deserializeJson(in, body)) {
        sendRawJson(c, "{\"code\":1,\"message\":\"malformed JSON body\"}", 400);
        return;
    }
    const char* name = in["name"] | "";
    String content = boxMapLoadNamed(name);
    if (content.length() == 0) {
        sendRawJson(c, "{\"code\":1,\"message\":\"named map not found\"}", 404);
        return;
    }
    boxMapSave(content);

    JsonDocument out;
    out["code"] = 0;
    out["name"] = name;
    JsonDocument mapDoc;
    deserializeJson(mapDoc, content);
    out["data"] = mapDoc.as<JsonObject>();
    sendJson(c, out);
}

static void hBoxMapDeleteNamed(EthernetClient& c, const String& body) {
    JsonDocument in;
    if (deserializeJson(in, body)) {
        sendRawJson(c, "{\"code\":1,\"message\":\"malformed JSON body\"}", 400);
        return;
    }
    const char* name = in["name"] | "";
    bool ok = boxMapDeleteNamed(name);
    JsonDocument out;
    out["code"] = ok ? 0 : 1;
    out["message"] = ok ? "deleted" : "not found";
    sendJson(c, out);
}

// ---------------------------------------------------------------------------
// URA4 proxy.
//
// The reader's control API lives on its own port 8080 as POST endpoints taking
// an x-www-form-urlencoded `data=<json>` body. Rather than mirror each of its
// dozens of controllers, one generic route forwards to /<Controller>/<Action>
// and relays the answer. The browser then talks only to the board.
//
// The body is forwarded byte for byte: re-encoding it would mean parsing and
// rebuilding JSON for no gain, and the reader is the one that validates it.
// ---------------------------------------------------------------------------
static void hUra4(EthernetClient& c, const String& path, const String& body) {
    Ura4Result r = ura4Post(path.c_str(), body, 8000);

    // status 0 means no HTTP answer at all — the reader is off, unplugged, or
    // on another subnet. Anything else is the reader's own verdict and is
    // relayed unchanged so the caller can tell a 404 from a 500.
    if (r.status == 0) {
        String err = "{\"code\":1,\"message\":\"URA4 unreachable at ";
        err += ura4IP().toString();
        err += ":";
        err += String(ura4Port());
        err += "\"}";
        sendRawJson(c, err, 502);
        return;
    }
    sendRawJson(c, r.body, r.status);
}

static void route(EthernetClient& c, const String& method, const String& path,
                  const String& body) {
    // ---- served by the board itself ----
    // Checked BEFORE the proxy below: the board's own paths sit under
    // /SystemController/ and /BoardConfiguration/, and the first of those
    // contains "Controller/", so the proxy would otherwise swallow it and the
    // reader would answer 404 for a route the board owns.
    if (method == "POST" && path == "/BoardConfiguration/queryBaseConfigurationRequest")  return hQuery(c);
    if (method == "POST" && path == "/BoardConfiguration/updateBaseConfigurationRequest") return hUpdate(c, body);
    if (method == "GET"  && path == "/SystemController/deviceInfo") return hDeviceInfo(c);
    if (method == "POST" && path == "/SystemController/reboot")     return hReboot(c);
    if (method == "POST" && path == "/SystemController/scanReader") return hScan(c);
    if (method == "GET"  && path == "/SystemController/epcList")    return hEpcGet(c);
    if (method == "POST" && path == "/SystemController/epcList")    return hEpcSet(c, body);
    if (method == "POST" && path == "/SystemController/epcClear")   return hEpcClear(c);
    if (method == "GET"  && path == "/SystemController/boxMap")     return hBoxMapGet(c);
    if (method == "POST" && path == "/SystemController/boxMap")     return hBoxMapSet(c, body);
    if (method == "POST" && path == "/SystemController/boxMapClear") return hBoxMapClear(c);
    if (method == "GET"  && path == "/SystemController/boxMapList")       return hBoxMapList(c);
    if (method == "POST" && path == "/SystemController/boxMapSaveNamed")  return hBoxMapSaveNamed(c, body);
    if (method == "POST" && path == "/SystemController/boxMapLoadNamed")  return hBoxMapLoadNamed(c, body);
    if (method == "POST" && path == "/SystemController/boxMapDeleteNamed") return hBoxMapDeleteNamed(c, body);
    if (method == "POST" && path == "/SystemController/readerReboot") return hReaderReboot(c);
    if (method == "POST" && path == "/SystemController/inventoryStatus") return hInvStatus(c, body);

    // ---- forwarded to the reader ----
    // Any /<Something>Controller/<Action> is relayed verbatim. Note the reader
    // requires a `functionList` on queryBaseConfigurationRequest — without it it
    // stalls ~3s and answers with an empty body. The frontend supplies it, so
    // the body never needs decoding or rewriting here.
    if (method == "POST" && path.startsWith("/") && path.indexOf("Controller/") > 0 &&
        path.indexOf("..") < 0) {
        // The reader returns code 0 for values it cannot use (region 999 was
        // accepted and stored as 231), so a base-config update is checked here
        // first. The body is form-encoded, hence the decode before parsing.
        if (path == "/BaseConfigurationController/updateBaseConfigurationRequest") {
            String json = body;
            if (json.startsWith("data=")) json = json.substring(5);
            json.replace("+", " ");
            json = urlDecode(json);

            JsonDocument in;
            if (!deserializeJson(in, json)) {
                const char* err = validateBaseConfig(in.as<JsonVariantConst>());
                if (err) {
                    String msg = "{\"code\":1,\"message\":\"";
                    msg += err;
                    msg += "\"}";
                    sendRawJson(c, msg, 400);
                    return;
                }
            }
            return hUra4(c, path, body);
        }

        // A network update can move the reader, so the reply is captured and the
        // board re-finds it before answering. Other routes just relay.
        if (path == "/NetworkConfigurationController/updateNetworkConfigurationRequest") {
            Ura4Result r = ura4Post(path.c_str(), body, 8000);
            if (r.status == 0) {
                String err = "{\"code\":1,\"message\":\"URA4 unreachable at ";
                err += ura4IP().toString();
                err += ":" + String(ura4Port()) + "\"}";
                sendRawJson(c, err, 502);
                return;
            }
            adoptNewReaderAddress(r.body);
            sendRawJson(c, r.body, r.status);
            return;
        }
        return hUra4(c, path, body);
    }

    if (method == "GET") {
        const char* p = path.c_str();
        if (path == "/") p = "/index.html";
        // reject traversal before it ever reaches LittleFS
        if (strstr(p, "..") == nullptr) return sendFile(c, p);
    }
    send404(c);
}

static void handleClient(EthernetClient& c) {
    String line;
    if (!readLine(c, line, 3000) || line.length() == 0) { c.stop(); return; }

    int sp1 = line.indexOf(' ');
    if (sp1 < 0) { c.stop(); return; }
    int sp2 = line.indexOf(' ', sp1 + 1);

    String method = line.substring(0, sp1);
    String path   = (sp2 > 0) ? line.substring(sp1 + 1, sp2) : line.substring(sp1 + 1);

    int contentLength = 0;
    while (readLine(c, line, 3000) && line.length() > 0) {
        if (line.startsWith("Content-Length:")) contentLength = line.substring(15).toInt();
    }

    String body;
    body.reserve(contentLength);
    uint32_t t0 = millis();
    while ((int)body.length() < contentLength && millis() - t0 < 3000) {
        if (!c.available()) { delay(1); continue; }
        body += (char)c.read();
        t0 = millis();
    }

    route(c, method, path, body);
    c.stop();
}

// ---------------------------------------------------------------------------
void webBegin() {
    LittleFS.begin(true);   // format on first boot
    epcListLoad();
    boxMapLoad();
    // A socket only becomes a real listener here if the chip is already in INIT
    // for it. EthernetServer::available() re-arms any that are not, so a failure
    // is not fatal — it just means the port opens on the first loop pass instead.
    for (uint8_t i = 0; i < LISTEN_SOCKETS; i++) s_servers[i].begin();
    // Stamped right after begin(), so the reported time is the port opening and
    // not the first loop pass that happens to notice.
    if (webReady()) markUp();
    Serial.printf("[web] listening on :80 across %u sockets\n", LISTEN_SOCKETS);
}

// Nothing tells the caller when the board became reachable, so log it: an IP is
// printed seconds before the port accepts anything, and a curl in between just
// gets "connection refused". Stamped the moment a listener exists, which is
// earlier than the first loop pass that can serve a request.
static uint32_t s_upMs = 0;

static void markUp() {
    if (s_upMs) return;
    s_upMs = millis() ? millis() : 1;
    Serial.printf("[web] :80 open after %lums\n", (unsigned long)s_upMs);
}

bool webReady() {
    for (uint8_t i = 0; i < LISTEN_SOCKETS; i++) if (s_servers[i]) return true;
    return false;
}

uint32_t webUpMs() { return s_upMs; }

void webLoop() {
    if (!s_upMs && webReady()) markUp();

    // Keep draining until every socket is idle. Serving one request per loop()
    // pass is what lets a second connection time out while the first is busy.
    for (uint8_t i = 0; i < LISTEN_SOCKETS; i++) {
        for (int guard = 0; guard < 8; guard++) {
            EthernetClient c = s_servers[i].available();
            if (!c) break;
            handleClient(c);
        }
    }
}
