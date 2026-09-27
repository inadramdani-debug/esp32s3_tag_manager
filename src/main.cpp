#include <Arduino.h>
#include <Ethernet.h>
#include "config.h"
#include "net.h"
#include "web.h"
#include "oled.h"
#include "ura4.h"

static const uint8_t LED_PIN = 2;   // onboard LED on DevKitC-1

void setup() {
    Serial.begin(115200);
    delay(300);
    Serial.println();
    Serial.println("=== ESP32-S3 Tag Manager ===");

    pinMode(LED_PIN, OUTPUT);

    configLoad();
    Serial.printf("[cfg] device=%s location=%s\n", cfg.deviceName, cfg.location);

    if (netBegin()) {
        Serial.printf("[net] ready: http://%s/\n", netIP().toString().c_str());
    } else {
        Serial.println("[net] starting web server anyway (link may come up later)");
    }

    oledBegin();
    webBegin();

    // The web server is listening from this point, so say so on the panel: the
    // address to browse to, and whether the reader is already answering. On a
    // cold start the reader may still be booting — it takes about a minute.
    oledBootSplash();
    oledUpdate();
}

void loop() {
    webLoop();
    oledUpdate();

    // heartbeat blip so the board is visibly alive without a serial console
    static uint32_t last = 0;
    if (millis() - last > 1000) {
        last = millis();
        digitalWrite(LED_PIN, netConnected() ? HIGH : (millis() / 500) % 2);
    }
}
