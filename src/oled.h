#pragma once
#include <Arduino.h>

void oledBegin();
void oledUpdate();          // call from loop; redraws at most a few times/sec
void oledApplySettings();   // call after config changes (brightness/flip/enable)

// Shows a "WAIT"/"READY" screen with the address to browse to and whether the
// reader is answering. WAIT turns to READY the moment port 80 accepts a
// connection. holdMs is the ceiling, not the duration: a board that never gets a
// link falls through to the live view instead of sitting there. uint32_t because
// the reader-reboot splash asks for 90s, which does not fit in 16 bits.
void oledBootSplash(uint32_t holdMs = 6000);

// Draws a two-line message immediately, bypassing the normal status view. Used
// while a long blocking operation runs and the loop cannot redraw: the subnet
// scan takes ~26s and the board serves nothing meanwhile, so without this the
// panel looks frozen and the operation looks like it did nothing.
void oledShowMessage(const char* line1, const char* line2);
