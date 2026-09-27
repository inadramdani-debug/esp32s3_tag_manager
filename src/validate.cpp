#include "validate.h"

// ---------------------------------------------------------------------------
// Range checks for reader settings.
//
// The reader validates nothing: `frequency.region = 999` came back code 0 and
// stored 231. So each field is checked here before the update is forwarded.
//
// The bounds come from the reader's own UI where it has one (the frequency
// dropdown lists six regions; antenna power is a 1-30 dropdown) and from the
// hardware's own limits otherwise. They are deliberately loose where the real
// limit is unknown — the point is to stop obviously meaningless values, not to
// second-guess the reader about edge cases.
// ---------------------------------------------------------------------------

// Regions offered by the reader's own page: China, China2, Europe, USA, Korea,
// Japan. Anything else is not a region the firmware knows how to tune.
static bool validRegion(int r) {
    const int ok[] = {1, 2, 4, 8, 22, 50};
    for (int v : ok) if (v == r) return true;
    return false;
}

// A helper that reports the first out-of-range field it finds.
static const char* checkRange(JsonVariantConst v, const char* key, int lo, int hi,
                              const char* msg) {
    if (!v.is<JsonObjectConst>()) return nullptr;
    JsonVariantConst f = v[key];
    if (f.isNull()) return nullptr;          // absent: nothing to check
    if (!f.is<int>()) return msg;
    int n = f.as<int>();
    return (n < lo || n > hi) ? msg : nullptr;
}

const char* validateBaseConfig(JsonVariantConst in) {
    // ---- frequency ----
    if (in["frequency"].is<JsonObjectConst>()) {
        JsonVariantConst r = in["frequency"]["region"];
        if (!r.isNull()) {
            if (!r.is<int>() || !validRegion(r.as<int>())) {
                return "frequency.region must be one of 1,2,4,8,22,50";
            }
        }
    }

    // ---- antenna power: 1-30 dBm, the range the reader's own dropdown offers ----
    if (in["antennaPower"].is<JsonArrayConst>()) {
        for (JsonVariantConst a : in["antennaPower"].as<JsonArrayConst>()) {
            const char* e = checkRange(a, "power", 1, 30,
                                       "antennaPower.power must be 1-30");
            if (e) return e;
            int port = a["antennaPort"] | 0;
            if (port < 1 || port > 8) return "antennaPower.antennaPort must be 1-8";
        }
    }

    // ---- antenna enable ----
    if (in["antennaEnabledState"].is<JsonArrayConst>()) {
        for (JsonVariantConst a : in["antennaEnabledState"].as<JsonArrayConst>()) {
            int port = a["antennaPort"] | 0;
            if (port < 1 || port > 8) {
                return "antennaEnabledState.antennaPort must be 1-8";
            }
        }
    }

    // ---- search mode: the reader offers S0-S3 and targets A/B ----
    if (in["inventorySearchMode"].is<JsonObjectConst>()) {
        JsonVariantConst q = in["inventorySearchMode"]["querySession"];
        if (!q.isNull()) {
            const char* s = q.as<const char*>();
            if (!s || strlen(s) != 2 || s[0] != 'S' || s[1] < '0' || s[1] > '3') {
                return "querySession must be S0-S3";
            }
        }
        JsonVariantConst t = in["inventorySearchMode"]["queryTarget"];
        if (!t.isNull()) {
            const char* s = t.as<const char*>();
            if (!s || (strcmp(s, "A") != 0 && strcmp(s, "B") != 0)) {
                return "queryTarget must be A or B";
            }
        }
    }

    // ---- memory bank ----
    if (in["inventoryMemoryBank"].is<JsonObjectConst>()) {
        JsonVariantConst b = in["inventoryMemoryBank"]["memoryBank"];
        if (!b.isNull()) {
            const char* s = b.as<const char*>();
            if (!s || (strcmp(s, "epc") != 0 && strcmp(s, "epc+tid") != 0 &&
                       strcmp(s, "epc+tid+user") != 0)) {
                return "memoryBank must be epc, epc+tid or epc+tid+user";
            }
        }
        // Word counts, not bytes. 0 means "not used", which is valid.
        const char* e = checkRange(in["inventoryMemoryBank"], "wordUserOffset",
                                   0, 255, "wordUserOffset must be 0-255");
        if (e) return e;
        e = checkRange(in["inventoryMemoryBank"], "wordUserLength",
                       0, 255, "wordUserLength must be 0-255");
        if (e) return e;
    }

    // ---- tag reporting ----
    if (in["tagReporting"].is<JsonObjectConst>()) {
        JsonVariantConst g = in["tagReporting"];
        if (g["duplicateTagFilter"].is<JsonObjectConst>()) {
            const char* e = checkRange(g["duplicateTagFilter"], "filterByTime",
                                       0, 3600, "filterByTime must be 0-3600 seconds");
            if (e) return e;
        }
        // RSSI is negative dBm; -100..0 covers anything a reader can report.
        if (g["rssiFilter"].is<JsonObjectConst>()) {
            const char* e = checkRange(g["rssiFilter"], "rssiIsGreateThan",
                                       -100, 0, "rssiIsGreateThan must be -100 to 0");
            if (e) return e;
        }
        JsonVariantConst m = g["tagReportingMode"]["mode"];
        if (!m.isNull()) {
            const char* s = m.as<const char*>();
            if (!s || (strcmp(s, "realTime") != 0 &&
                       strcmp(s, "afterStopInventory") != 0)) {
                return "tagReportingMode must be realTime or afterStopInventory";
            }
        }
    }

    // ---- heartbeat ----
    if (in["heartbeatPacket"].is<JsonObjectConst>()) {
        const char* e = checkRange(in["heartbeatPacket"], "intervalTime",
                                   1, 3600, "intervalTime must be 1-3600 seconds");
        if (e) return e;
    }

    // ---- link frequency: the four rates the reader's dropdown offers ----
    if (in["linkFrequency"].is<JsonObjectConst>()) {
        JsonVariantConst v = in["linkFrequency"]["value"];
        if (!v.isNull()) {
            const char* s = v.as<const char*>();
            const char* ok[] = {"DSB_ASK_FM0_40KHz", "PR_ASK_Miller4_250KHz",
                                "PR_ASK_Miller4_300KHz", "DSB_ASK_FM0_400KHz"};
            bool found = false;
            for (const char* o : ok) if (s && strcmp(s, o) == 0) found = true;
            if (!found) return "linkFrequency.value is not a known rate";
        }
    }

    return nullptr;
}
