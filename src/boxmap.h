#pragma once
#include <Arduino.h>

// Box map: the tag assigned to each cell of the carton (3 layers x 8 rows x
// 4 columns = 96 cells), stored as a single JSON blob.
//
// Kept on the board rather than in the browser's localStorage for two reasons:
// the map is then the same one from every tablet and phone that opens the page,
// and clearing site data on one device no longer destroys the registration work.
// Same reasoning as the EPC whitelist in epclist.h.
//
// NVS is not used: one entry holding ~96 EPCs plus JSON overhead lands right at
// NVS's per-value size limit, with no headroom for a longer per-cell record
// later. LittleFS has the room.
//
// The board never parses the blob — it stores the bytes and hands them back. So
// nothing here needs to know which cell holds which tag; the browser owns the
// format and can extend it without a firmware change.
// The blob also carries an archive of cleared cells (under a "#archive" key the
// browser adds), because clear and overwrite are otherwise unrecoverable. That
// is what drives the size: measured, 96 cells alone are ~3.4 KB, and adding 100
// archive entries brings the whole blob to about 11 KB. 16 KB matches the EPC
// list's cap and leaves room for both at their maximum.
#ifndef BOXMAP_MAX_BYTES
#define BOXMAP_MAX_BYTES 16384
#endif

// Loads the stored blob into RAM. Safe to call repeatedly.
void boxMapLoad();

// Replaces the stored blob. Returns false if it is too large or the write
// failed. On success the in-RAM copy is refreshed.
bool boxMapSave(const String& json);

// The stored blob, empty when nothing has been saved yet.
String boxMapText();

// Named map profile support
String boxMapListNamed();
bool   boxMapSaveNamed(const String& name, const String& json);
String boxMapLoadNamed(const String& name);
bool   boxMapDeleteNamed(const String& name);
