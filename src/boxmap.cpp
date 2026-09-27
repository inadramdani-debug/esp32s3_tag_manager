#include "boxmap.h"
#include <LittleFS.h>

// ---------------------------------------------------------------------------
// Box map storage. A JSON blob written and read whole; see boxmap.h for why it
// lives on the board and in LittleFS rather than in NVS or localStorage.
//
// The blob is held in RAM once loaded so a read is a string copy rather than a
// flash read per page open. 8 KB is the cap — comfortably more than 96 cells of
// EPC plus their cell ids (about 3 KB), and a bound is needed because the
// contents arrive from the network.
// ---------------------------------------------------------------------------
static const char* BOXMAP_PATH = "/boxmap.json";

static String s_blob;

void boxMapLoad() {
    s_blob = "";
    if (!LittleFS.exists(BOXMAP_PATH)) return;

    File f = LittleFS.open(BOXMAP_PATH, "r");
    if (!f) return;
    s_blob = f.readString();
    f.close();
    Serial.printf("[boxmap] %u bytes loaded\n", s_blob.length());
}

bool boxMapSave(const String& json) {
    if (json.length() > BOXMAP_MAX_BYTES) return false;

    File f = LittleFS.open(BOXMAP_PATH, "w");
    if (!f) return false;
    size_t written = f.print(json);
    f.close();
    if (written != json.length()) return false;

    boxMapLoad();
    return true;
}

String boxMapText() {
    return s_blob;
}

static const char* MAPS_DIR = "/maps";

static String sanitizeMapName(const String& name) {
    String out = "";
    for (size_t i = 0; i < name.length(); i++) {
        char c = name[i];
        if (isalnum((unsigned char)c) || c == '_' || c == '-' || c == ' ') {
            out += (c == ' ' ? '_' : c);
        }
    }
    if (out.length() == 0) out = "unnamed";
    return out;
}

String boxMapListNamed() {
    if (!LittleFS.exists(MAPS_DIR)) {
        LittleFS.mkdir(MAPS_DIR);
    }
    File root = LittleFS.open(MAPS_DIR);
    if (!root || !root.isDirectory()) return "[]";

    String out = "[";
    bool first = true;
    File file = root.openNextFile();
    while (file) {
        String fname = file.name();
        if (fname.endsWith(".json")) {
            String name = fname.substring(0, fname.length() - 5);
            if (name.startsWith("/maps/")) name = name.substring(6);
            else if (name.startsWith("maps/")) name = name.substring(5);
            else if (name.startsWith("/")) name = name.substring(1);
            if (!first) out += ",";
            out += "\"" + name + "\"";
            first = false;
        }
        file = root.openNextFile();
    }
    out += "]";
    return out;
}

bool boxMapSaveNamed(const String& name, const String& json) {
    if (json.length() > BOXMAP_MAX_BYTES) return false;
    if (!LittleFS.exists(MAPS_DIR)) {
        LittleFS.mkdir(MAPS_DIR);
    }
    String sname = sanitizeMapName(name);
    String path = String(MAPS_DIR) + "/" + sname + ".json";
    File f = LittleFS.open(path.c_str(), "w");
    if (!f) return false;
    size_t written = f.print(json);
    f.close();
    return (written == json.length());
}

String boxMapLoadNamed(const String& name) {
    String sname = sanitizeMapName(name);
    String path = String(MAPS_DIR) + "/" + sname + ".json";
    if (!LittleFS.exists(path.c_str())) return "";
    File f = LittleFS.open(path.c_str(), "r");
    if (!f) return "";
    String content = f.readString();
    f.close();
    return content;
}

bool boxMapDeleteNamed(const String& name) {
    String sname = sanitizeMapName(name);
    String path = String(MAPS_DIR) + "/" + sname + ".json";
    if (LittleFS.exists(path.c_str())) {
        return LittleFS.remove(path.c_str());
    }
    return false;
}

