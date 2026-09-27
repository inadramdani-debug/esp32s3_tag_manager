#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

// Field groups, mirroring the fieldsets on the config-base page.
// Each group is validated and answered independently so one bad field
// cannot hide the result of the others.
struct AppConfig {
    // --- device ---
    char deviceName[33] = "ESP32S3-TAG";
    char location[33]   = "";

    // --- reader ---
    // Where the URA4 reader lives. Stored as text rather than an IPAddress so
    // it round-trips through NVS and the web UI without conversion.
    char ura4Host[16] = "192.168.99.3";
    uint16_t ura4Port = 8080;

    // --- oled ---
    bool    oledEnable     = true;
    uint8_t oledBrightness = 0xFF;
    bool    oledFlip       = false;
};

extern AppConfig cfg;

void configLoad();   // NVS -> cfg, missing keys keep their defaults
void configSave();   // cfg -> NVS

// Applies the request body to cfg and fills `out` with a per-group result,
// e.g. out["oled"] = {"code":0,"message":"success"}. Groups that fail
// validation are reported and left unchanged; the rest still apply.
void configApply(JsonVariantConst in, JsonObject out);

// Serialises cfg into a response body, e.g. out["oled"]["oledEnable"] = true.
void configToJson(JsonObject out);
