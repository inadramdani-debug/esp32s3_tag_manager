#pragma once
#include <Arduino.h>

void webBegin();
void webLoop();

// True once a socket is really in LISTEN on port 80, i.e. a browser can connect
// this instant. The address is set seconds earlier, while the port still refuses
// connections — that gap is what makes a cold boot look dead.
bool     webReady();
uint32_t webUpMs();   // millis() at the first moment it was ready

// Inventory & OLED state reported by the browser / system
uint16_t invStatusCount();
bool     invStatusRunning();   // Start pressed, inventory actually scanning
bool     invViewActive();      // Inventory page has been opened (sticky)
String   oledGetView();
String   oledGetLastEpc();
String   oledGetLastCell();
String   oledGetLastMsg();
uint32_t oledGetLastSeen();
