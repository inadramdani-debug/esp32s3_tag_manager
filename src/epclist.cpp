#include "epclist.h"
#include <LittleFS.h>

// ---------------------------------------------------------------------------
// EPC whitelist, held in RAM and mirrored to /epc.txt.
//
// Parsing is deliberately tolerant: lines are trimmed, CR from CRLF files is
// dropped, blank lines and lines starting with '#' are ignored, and a stray
// space or dash inside an EPC is removed. Lists get pasted in from spreadsheets
// and scans, and rejecting the whole file over one stray character would be
// worse than normalising it.
// ---------------------------------------------------------------------------
static const char* EPC_PATH = "/epc.txt";

static String* s_list  = nullptr;
static uint16_t s_count = 0;
static uint16_t s_cap   = 0;

static void freeList() {
    if (s_list) { delete[] s_list; s_list = nullptr; }
    s_count = 0;
    s_cap = 0;
}

// Normalises one line into an EPC: uppercase, hex characters only.
static String normalise(const String& raw) {
    String out;
    out.reserve(raw.length());
    for (size_t i = 0; i < raw.length(); i++) {
        char c = raw[i];
        if (c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '-' || c == ':') continue;
        if (c >= 'a' && c <= 'f') c = c - 'a' + 'A';
        out += c;
    }
    return out;
}

static bool addEntry(const String& epc) {
    if (epc.length() == 0) return true;
    // Skip duplicates so re-appending a list is harmless.
    for (uint16_t i = 0; i < s_count; i++) if (s_list[i] == epc) return true;
    if (s_count >= s_cap) return false;
    s_list[s_count++] = epc;
    return true;
}

// Grows the array in chunks; reallocating per line would thrash the heap.
static bool ensureCapacity(uint16_t want) {
    if (want <= s_cap) return true;
    uint16_t next = s_cap ? s_cap : 64;
    while (next < want) next *= 2;
    String* bigger = new (std::nothrow) String[next];
    if (!bigger) return false;
    for (uint16_t i = 0; i < s_count; i++) bigger[i] = s_list[i];
    if (s_list) delete[] s_list;
    s_list = bigger;
    s_cap = next;
    return true;
}

static void parseInto(const String& text) {
    int start = 0;
    while (start <= (int)text.length()) {
        int nl = text.indexOf('\n', start);
        if (nl < 0) nl = text.length();
        String line = text.substring(start, nl);
        start = nl + 1;
        line.trim();
        if (line.length() == 0 || line[0] == '#') continue;
        String epc = normalise(line);
        if (epc.length() == 0) continue;
        if (!ensureCapacity(s_count + 1)) break;   // out of heap: keep what we have
        addEntry(epc);
    }
}

void epcListLoad() {
    freeList();
    if (!LittleFS.exists(EPC_PATH)) return;

    File f = LittleFS.open(EPC_PATH, "r");
    if (!f) return;
    String text = f.readString();
    f.close();
    parseInto(text);
    Serial.printf("[epc] %u entries loaded\n", s_count);
}

bool epcListSave(const String& text) {
    if (text.length() > EPC_LIST_MAX_BYTES) return false;

    File f = LittleFS.open(EPC_PATH, "w");
    if (!f) return false;
    size_t written = f.print(text);
    f.close();
    if (written != text.length()) return false;

    epcListLoad();
    return true;
}

bool epcListAppend(const String& text) {
    String merged = epcListText();
    if (merged.length() && !merged.endsWith("\n")) merged += "\n";
    merged += text;
    if (merged.length() > EPC_LIST_MAX_BYTES) return false;

    File f = LittleFS.open(EPC_PATH, "w");
    if (!f) return false;
    size_t written = f.print(merged);
    f.close();
    if (written != merged.length()) return false;

    epcListLoad();
    return true;
}

bool epcListClear() {
    freeList();
    if (LittleFS.exists(EPC_PATH)) LittleFS.remove(EPC_PATH);
    return true;
}

String epcListText() {
    String out;
    for (uint16_t i = 0; i < s_count; i++) {
        out += s_list[i];
        out += '\n';
    }
    return out;
}

uint16_t epcListCount() { return s_count; }
bool epcListEmpty()     { return s_count == 0; }

bool epcListContains(const String& epc) {
    if (s_count == 0) return true;   // no list: allow everything
    String want = normalise(epc);
    for (uint16_t i = 0; i < s_count; i++) {
        if (s_list[i] == want) return true;
    }
    return false;
}
