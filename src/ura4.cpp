#include "ura4.h"
#include "config.h"
#include "net.h"
#include <Ethernet.h>

// ---------------------------------------------------------------------------
// URA4 HTTP client.
//
// A separate EthernetClient is used per call and closed afterwards. The reader
// sends Content-Length on every response it has produced so far, but rather
// than trust that, the read loop also stops on an empty read and on a total
// timeout, so a chunked or length-less response still terminates.
//
// The address comes from cfg, not from a compile-time constant: the reader can
// move, and a board that cannot be told its address without a reflash is not
// much use in the field.
// ---------------------------------------------------------------------------
IPAddress ura4IP() {
    IPAddress ip;
    if (!ip.fromString(cfg.ura4Host)) {
        // Config is validated on write, so this only happens if the stored
        // value was hand-edited; fall back rather than connecting to 0.0.0.0.
        ip.fromString("192.168.99.3");
    }
    return ip;
}

uint16_t ura4Port() {
    return cfg.ura4Port ? cfg.ura4Port : 8080;
}

Ura4Result ura4Post(const char* path, const String& body, uint32_t timeoutMs) {
    Ura4Result r;
    EthernetClient c;

    if (!c.connect(ura4IP(), ura4Port())) {
        Serial.printf("[ura4] connect to %s:%u failed\n",
                      ura4IP().toString().c_str(), ura4Port());
        return r;
    }

    c.print("POST ");
    c.print(path);
    c.print(" HTTP/1.1\r\nHost: ");
    c.print(ura4IP());
    c.print(":");
    c.print(ura4Port());
    c.print("\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: ");
    c.print(body.length());
    c.print("\r\nConnection: close\r\n\r\n");
    c.print(body);

    uint32_t t0 = millis();
    String raw;
    raw.reserve(2048);
    while (millis() - t0 < timeoutMs) {
        if (!c.available()) {
            if (!c.connected() && raw.length() > 0) break;
            delay(1);
            continue;
        }
        raw += (char)c.read();
        // Cap the buffer: a tag list from a long inventory can be large, and
        // an unbounded String would eat the heap. Callers get a truncated body
        // rather than an OOM.
        if (raw.length() >= URA4_MAX_BODY) {
            Serial.println("[ura4] response truncated at cap");
            break;
        }
        t0 = millis();   // progress resets the clock
    }
    c.stop();

    if (raw.length() == 0) {
        Serial.println("[ura4] empty response");
        return r;
    }

    // "HTTP/1.1 200 OK" — status is the middle token of the first line
    int sp1 = raw.indexOf(' ');
    r.status = raw.substring(sp1 + 1, sp1 + 4).toInt();
    r.ok = (r.status >= 200 && r.status < 400);

    int split = raw.indexOf("\r\n\r\n");
    r.body = (split >= 0) ? raw.substring(split + 4) : raw;

    Serial.printf("[ura4] %s -> %d, %u bytes\n", path, r.status, r.body.length());
    return r;
}

bool ura4Reachable() {
    // A bare TCP connect is the whole answer, and it is far cheaper than a
    // request: no HTTP round-trip, and the timeout can be turned right down.
    // (The old version POSTed to "/" — the reader answers that with a 404, so a
    // reader that was plainly up came back "unreachable".)
    return ura4Ping(500);
}

// A bare TCP connect is enough to answer "is the reader there yet". The OLED
// calls this on a timer, so the cost matters — and connect() BLOCKS for the full
// timeout when nothing answers, which is why that timer is 15s.
bool ura4Ping(uint16_t timeoutMs) {
    EthernetClient c;
    c.setConnectionTimeout(timeoutMs);
    bool ok = c.connect(ura4IP(), ura4Port());
    c.stop();
    return ok;
}

// ---------------------------------------------------------------------------
// Subnet sweep.
//
// connect() blocks: measured 1001 ms to fail at the library's default timeout,
// 2-3 ms to succeed. That made the first version of this sweep take over four
// minutes (254 addresses x 1s), because issuing connects "in the background"
// is not possible — each one waits.
//
// setConnectionTimeout() does work, though, and scales cleanly (500->502ms,
// 200->202ms), so the sweep drops it to 100 ms for the duration. The reader
// answers a handshake in 2-3 ms even over this link, so 100 ms leaves a wide
// margin while cutting the whole /24 to roughly 25s. The timeout is restored
// afterwards.
//
// This blocks the main loop for the duration, so the web UI is unresponsive
// until the sweep finishes — which is why it is a button the user presses
// rather than something done at boot.
// ---------------------------------------------------------------------------
uint8_t ura4Scan(IPAddress* found, uint8_t maxFound) {
    IPAddress base = netIP();
    uint8_t hits = 0;

    for (int host = 1; host <= 254 && hits < maxFound; host++) {
        IPAddress ip(base[0], base[1], base[2], host);
        if (ip == base) continue;      // that is us

        EthernetClient c;
        c.setConnectionTimeout(100);
        if (!c.connect(ip, ura4Port())) { c.stop(); continue; }

        // Open port. Ask for the header only: enough to tell a web server from
        // some other service that happens to listen on this port.
        c.print("GET / HTTP/1.0\r\nConnection: close\r\n\r\n");
        uint32_t t0 = millis();
        String head;
        while (millis() - t0 < 700) {
            while (c.available()) head += (char)c.read();
            if (head.indexOf("\r\n\r\n") >= 0) break;
            if (!c.connected() && !c.available()) break;
            delay(2);
        }
        c.stop();

        if (head.startsWith("HTTP/")) {
            found[hits++] = ip;
            Serial.printf("[scan] %s answered\n", ip.toString().c_str());
        }
    }
    return hits;
}
