#include "config.h"
#include <Preferences.h>

AppConfig cfg;

static Preferences prefs;
static const char* NVS_NS  = "tagmgr";
static const char* NVS_KEY = "app";   // single JSON blob, not one key per field

// ---------------------------------------------------------------------------
// result helpers — every group answers for itself
// ---------------------------------------------------------------------------
static void ok(JsonObject& out, const char* g) {
    out[g]["code"]    = 0;
    out[g]["message"] = "success";
}
static void fail(JsonObject& out, const char* g, const char* msg) {
    out[g]["code"]    = 1;
    out[g]["message"] = msg;
}

// Four dot-separated octets, each 0-255. Deliberately strict: this string is
// handed straight to EthernetClient::connect().
static bool isIPv4(const char* s) {
    int octets = 0;
    while (*s && octets < 4) {
        int value = 0, digits = 0;
        while (*s >= '0' && *s <= '9') {
            value = value * 10 + (*s - '0');
            if (++digits > 3 || value > 255) return false;
            s++;
        }
        if (digits == 0) return false;
        octets++;
        if (octets < 4) {
            if (*s != '.') return false;
            s++;
        }
    }
    return octets == 4 && *s == '\0';
}

// ---------------------------------------------------------------------------
// NVS
// ---------------------------------------------------------------------------
void configLoad() {
    // opened read-write so the namespace is created on first boot; a read-only
    // open of a missing namespace just logs an error and yields nothing
    prefs.begin(NVS_NS, false);
    String blob = prefs.getString(NVS_KEY, "");
    prefs.end();
    if (blob.isEmpty()) return;   // first boot: struct defaults stand

    JsonDocument doc;
    if (deserializeJson(doc, blob)) return;   // corrupt blob: keep defaults

    // Same nesting configToJson() writes — reading these keys from the root
    // silently yields nothing and the defaults come back on every boot.
    JsonObjectConst dev = doc["device"];
    strlcpy(cfg.deviceName, dev["deviceName"] | cfg.deviceName, sizeof(cfg.deviceName));
    strlcpy(cfg.location,   dev["location"]   | cfg.location,   sizeof(cfg.location));

    JsonObjectConst rd = doc["reader"];
    strlcpy(cfg.ura4Host, rd["ura4Host"] | cfg.ura4Host, sizeof(cfg.ura4Host));
    cfg.ura4Port = rd["ura4Port"] | cfg.ura4Port;

    JsonObjectConst ol = doc["oled"];
    cfg.oledEnable     = ol["oledEnable"]     | cfg.oledEnable;
    cfg.oledBrightness = ol["oledBrightness"] | (int)cfg.oledBrightness;
    cfg.oledFlip       = ol["oledFlip"]       | cfg.oledFlip;
}

void configSave() {
    JsonDocument doc;
    configToJson(doc.to<JsonObject>());

    String blob;
    serializeJson(doc, blob);

    prefs.begin(NVS_NS, false);
    prefs.putString(NVS_KEY, blob);
    prefs.end();
}

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------
void configToJson(JsonObject out) {
    JsonObject dev = out["device"].to<JsonObject>();
    dev["deviceName"] = cfg.deviceName;
    dev["location"]   = cfg.location;

    JsonObject rd = out["reader"].to<JsonObject>();
    rd["ura4Host"] = cfg.ura4Host;
    rd["ura4Port"] = cfg.ura4Port;

    JsonObject ol = out["oled"].to<JsonObject>();
    ol["oledEnable"]     = cfg.oledEnable;
    ol["oledBrightness"] = cfg.oledBrightness;
    ol["oledFlip"]       = cfg.oledFlip;
}

// ---------------------------------------------------------------------------
// write — validate per group, apply what passes
// ---------------------------------------------------------------------------
void configApply(JsonVariantConst in, JsonObject out) {
    bool dirty = false;

    // ---- device ----
    if (in["device"].is<JsonObjectConst>()) {
        JsonObjectConst g = in["device"];
        const char* name = g["deviceName"] | "";
        const char* loc  = g["location"]   | "";
        if (strlen(name) == 0)          fail(out, "device", "deviceName is required");
        else if (strlen(name) > 32)     fail(out, "device", "deviceName too long (max 32)");
        else if (strlen(loc) > 32)      fail(out, "device", "location too long (max 32)");
        else {
            strlcpy(cfg.deviceName, name, sizeof(cfg.deviceName));
            strlcpy(cfg.location,   loc,  sizeof(cfg.location));
            ok(out, "device");
            dirty = true;
        }
    }

    // ---- reader ----
    // A bad host here means the board can no longer reach the reader at all,
    // so it is validated as four octets before being accepted.
    if (in["reader"].is<JsonObjectConst>()) {
        JsonObjectConst g = in["reader"];
        const char* host = g["ura4Host"] | cfg.ura4Host;
        int port = g["ura4Port"] | (int)cfg.ura4Port;
        if (!isIPv4(host))       fail(out, "reader", "ura4Host must be an IPv4 address");
        else if (port < 1 || port > 65535) fail(out, "reader", "ura4Port out of range (1-65535)");
        else {
            strlcpy(cfg.ura4Host, host, sizeof(cfg.ura4Host));
            cfg.ura4Port = port;
            ok(out, "reader");
            dirty = true;
        }
    }

    // ---- oled ----
    if (in["oled"].is<JsonObjectConst>()) {
        JsonObjectConst g = in["oled"];
        int bright = g["oledBrightness"] | (int)cfg.oledBrightness;
        if (bright < 0 || bright > 255) fail(out, "oled", "oledBrightness out of range (0-255)");
        else {
            cfg.oledEnable     = g["oledEnable"] | cfg.oledEnable;
            cfg.oledFlip       = g["oledFlip"]   | cfg.oledFlip;
            cfg.oledBrightness = bright;
            ok(out, "oled");
            dirty = true;
        }
    }

    if (dirty) configSave();
}
