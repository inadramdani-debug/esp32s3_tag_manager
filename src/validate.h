#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

// Validation for reader settings that the reader itself does not check.
//
// Measured: sending `frequency.region = 999` to the reader returns code 0
// "success" and stores 231 — a value that means nothing. The reader accepts
// anything, so the board has to be the one that says no. These run before a
// base-configuration update is forwarded.
//
// Returns nullptr when the payload is acceptable, otherwise a short message
// naming the field and its range.
const char* validateBaseConfig(JsonVariantConst in);
