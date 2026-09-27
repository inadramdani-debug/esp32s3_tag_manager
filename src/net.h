#pragma once
#include <Arduino.h>

// W5500 over SPI, driven by the standalone Arduino Ethernet library (polling,
// no INT pin required). See net.cpp for why this replaced the ESP-IDF driver.
//
// Returns true once an IP address is held.
bool netBegin(uint32_t timeoutMs = 15000);

bool      netConnected();
IPAddress netIP();
String    netMac();
String    netSpeed();
