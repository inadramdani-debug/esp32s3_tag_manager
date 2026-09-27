#pragma once
#include <Arduino.h>

// EPC whitelist.
//
// The reader's own hardware filter does not work on this unit — every mask
// tried, including a full-EPC exact match, returned zero tags while the same
// inventory unfiltered returned them — so the whitelist is applied here
// instead: the board reports every tag it sees and the browser matches it
// against this list.
//
// Stored as a plain text file on LittleFS, one EPC per line, rather than in
// NVS: NVS is meant for small key/value pairs and a few thousand EPCs would
// crowd it out. The file is held in RAM once loaded (16 bytes per EPC plus
// overhead, so a few thousand entries is tens of KB) and lookups are exact
// string compares.
//
// 16 KB of file is the cap, which is roughly 750 EPCs at 24 hex characters
// per line. That is deliberate: an unbounded read would grow the in-RAM list
// until the heap ran out.
#ifndef EPC_LIST_MAX_BYTES
#define EPC_LIST_MAX_BYTES 16384
#endif

// Loads the list into RAM. Safe to call repeatedly.
void epcListLoad();

// Replaces the stored list with `text` (one EPC per line, blank lines and
// "#" comments ignored). Returns false if the text is too large or the write
// failed. On success the in-RAM copy is refreshed.
bool epcListSave(const String& text);

// Appends `text` to the stored list. Duplicates are dropped.
bool epcListAppend(const String& text);

// Removes every entry.
bool epcListClear();

// Serialises the list back out, one EPC per line.
String epcListText();

uint16_t epcListCount();

// True when the list is empty, in which case callers should treat every tag as
// allowed rather than as unknown.
bool epcListEmpty();

// Exact match, case-insensitive. Returns true when the list is empty, so an
// unconfigured board behaves exactly as it did before the whitelist existed.
bool epcListContains(const String& epc);
