#include "oled.h"
#include "config.h"
#include "net.h"
#include "web.h"
#include "ura4.h"
#include <Wire.h>
#include <U8g2lib.h>

// SSD1306 128x64 on I2C. U8g2 handles both SSD1306 and SH1106 offsets,
// so swapping panels later is a one-line change here.
#ifndef PIN_OLED_SDA
#define PIN_OLED_SDA 8
#endif
#ifndef PIN_OLED_SCL
#define PIN_OLED_SCL 9
#endif
#ifndef OLED_ADDR
#define OLED_ADDR 0x3C
#endif

static U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);
static uint32_t s_lastDraw = 0;

void oledBegin() {
    if (!cfg.oledEnable) return;
    Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
    u8g2.setI2CAddress(OLED_ADDR << 1);   // U8g2 wants the 8-bit form
    u8g2.begin();
    u8g2.setFlipMode(cfg.oledFlip ? 1 : 0);
    u8g2.setContrast(cfg.oledBrightness);
}

void oledApplySettings() {
    if (!cfg.oledEnable) {
        u8g2.clearDisplay();
        u8g2.setPowerSave(1);
        return;
    }
    u8g2.setPowerSave(0);
    u8g2.setFlipMode(cfg.oledFlip ? 1 : 0);
    u8g2.setContrast(cfg.oledBrightness);
    s_lastDraw = 0;   // force a redraw on the next loop
}

void oledUpdate() {
    if (!cfg.oledEnable) return;

    uint32_t now = millis();
    if (now - s_lastDraw < 250) return;   // 4 fps
    s_lastDraw = now;

    u8g2.clearBuffer();

    String view = oledGetView();
    String lastEpc = oledGetLastEpc();
    String lastCell = oledGetLastCell();
    String lastMsg = oledGetLastMsg();
    uint16_t count = invStatusCount();
    bool running = invStatusRunning();
    uint32_t lastSeen = oledGetLastSeen();
    bool isRecent = (lastSeen > 0 && (now - lastSeen < 120000)); // active within last 2 mins

    char line[48];
    IPAddress ip = netIP();

    // ---- Mode 1: Box Map / Read Tag Into Cell / Cell Assignment ----
    if (view == "boxmap" || (lastCell.length() > 0 && lastEpc.length() > 0)) {
        // Line 1: Header + Cell
        u8g2.setFont(u8g2_font_6x10_tf);
        snprintf(line, sizeof(line), "[BOX MAP] %s", lastCell.length() ? lastCell.c_str() : "TAG");
        u8g2.drawStr(0, 10, line);
        u8g2.drawHLine(0, 12, 128);

        // Line 2: Action / Status
        snprintf(line, sizeof(line), "%s (Fill: %u)", 
                 lastMsg.length() ? lastMsg.c_str() : "TAG READ", count);
        u8g2.drawStr(0, 23, line);

        // Line 3 & 4: EPC in Monospace font
        if (lastEpc.length() > 0) {
            String epc1 = "EPC:" + lastEpc.substring(0, 16);
            String epc2 = "    " + lastEpc.substring(16, 32);
            u8g2.drawStr(0, 36, epc1.c_str());
            if (lastEpc.length() > 16) {
                u8g2.drawStr(0, 48, epc2.c_str());
            }
        } else {
            u8g2.drawStr(0, 36, "EPC: [Empty Cell]");
        }

        // Line 5: IP / Footer
        if ((uint32_t)ip != 0) snprintf(line, sizeof(line), "IP:%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
        else snprintf(line, sizeof(line), "LAN: %s", netConnected() ? "LINK" : "DOWN");
        u8g2.drawStr(0, 62, line);
    }
    // ---- Mode 2: Box Map Full Scan ----
    else if (view == "boxmap_scan") {
        u8g2.setFont(u8g2_font_6x10_tf);
        u8g2.drawStr(0, 10, "[SCAN DUS CARTON]");
        u8g2.drawHLine(0, 12, 128);

        u8g2.setFont(u8g2_font_7x14_tf);
        snprintf(line, sizeof(line), "%s", running ? "SCANNING..." : "SCAN SELESAI");
        u8g2.drawStr(0, 28, line);

        u8g2.setFont(u8g2_font_6x10_tf);
        snprintf(line, sizeof(line), "Heard: %u / 96 Tags", count);
        u8g2.drawStr(0, 44, line);

        if ((uint32_t)ip != 0) snprintf(line, sizeof(line), "IP:%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
        else snprintf(line, sizeof(line), "LAN: %s", netConnected() ? "LINK" : "DOWN");
        u8g2.drawStr(0, 60, line);
    }
    // ---- Mode 2.5: Race Timing Run Mode ----
    else if (view == "race_timing") {
        u8g2.setFont(u8g2_font_6x10_tf);
        snprintf(line, sizeof(line), "RACE TIMING [%s]", running ? "RUN" : "STOP");
        u8g2.drawStr(0, 10, line);
        u8g2.drawHLine(0, 12, 128);

        // Big Time / Finisher Count
        u8g2.setFont(u8g2_font_7x14_tf);
        if (lastMsg.length() > 0) {
            snprintf(line, sizeof(line), "%s", lastMsg.c_str());
            u8g2.drawStr(0, 28, line);
        } else {
            snprintf(line, sizeof(line), "Finished: %u", count);
            u8g2.drawStr(0, 28, line);
        }

        // Last Finisher info
        u8g2.setFont(u8g2_font_6x10_tf);
        if (lastCell.length() > 0) {
            snprintf(line, sizeof(line), "%s", lastCell.c_str());
            u8g2.drawStr(0, 44, line);
        } else if (lastEpc.length() > 0) {
            String shortEpc = lastEpc.length() > 16 ? lastEpc.substring(0, 16) + ".." : lastEpc;
            snprintf(line, sizeof(line), "Tag: %s", shortEpc.c_str());
            u8g2.drawStr(0, 44, line);
        } else {
            snprintf(line, sizeof(line), "Finished: %u Runners", count);
            u8g2.drawStr(0, 44, line);
        }

        if ((uint32_t)ip != 0) snprintf(line, sizeof(line), "IP:%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
        else snprintf(line, sizeof(line), "LAN: %s", netConnected() ? "LINK" : "DOWN");
        u8g2.drawStr(0, 60, line);
    }
    // ---- Mode 3: Inventory Mode ----
    else if (view == "inventory" || invViewActive()) {
        u8g2.setFont(u8g2_font_6x10_tf);
        snprintf(line, sizeof(line), "INVENTORY  [%s]", running ? "RUNNING" : "STOP");
        u8g2.drawStr(0, 10, line);
        u8g2.drawHLine(0, 12, 128);

        // Big Tag Count
        u8g2.setFont(u8g2_font_9x15_tf);
        snprintf(line, sizeof(line), "TAGS: %u", count);
        u8g2.drawStr(0, 30, line);

        // Last EPC
        u8g2.setFont(u8g2_font_6x10_tf);
        if (lastEpc.length() > 0) {
            String shortEpc = lastEpc.length() > 16 ? lastEpc.substring(0, 16) + ".." : lastEpc;
            snprintf(line, sizeof(line), "EPC: %s", shortEpc.c_str());
            u8g2.drawStr(0, 46, line);
        } else {
            u8g2.drawStr(0, 46, "Menunggu Tag RFID...");
        }

        if ((uint32_t)ip != 0) snprintf(line, sizeof(line), "IP:%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
        else snprintf(line, sizeof(line), "LAN: %s", netConnected() ? "LINK" : "DOWN");
        u8g2.drawStr(0, 60, line);
    }
    // ---- Mode 4: Read/Write Tag ----
    else if (view == "readwrite" || (lastEpc.length() > 0 && isRecent)) {
        u8g2.setFont(u8g2_font_6x10_tf);
        snprintf(line, sizeof(line), "READ/WRITE  %s", lastMsg.c_str());
        u8g2.drawStr(0, 10, line);
        u8g2.drawHLine(0, 12, 128);

        u8g2.drawStr(0, 24, "DATA TAG:");
        if (lastEpc.length() > 0) {
            String epc1 = lastEpc.substring(0, 18);
            String epc2 = lastEpc.substring(18, 36);
            u8g2.drawStr(0, 36, epc1.c_str());
            if (lastEpc.length() > 18) u8g2.drawStr(0, 48, epc2.c_str());
        }

        if ((uint32_t)ip != 0) snprintf(line, sizeof(line), "IP:%u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
        else snprintf(line, sizeof(line), "LAN: %s", netConnected() ? "LINK" : "DOWN");
        u8g2.drawStr(0, 60, line);
    }
    // ---- Mode 5: Default System Dashboard ----
    else {
        u8g2.setFont(u8g2_font_6x10_tf);
        u8g2.drawStr(0, 10, cfg.deviceName[0] ? cfg.deviceName : "ESP32-S3 TAG MGR");
        if (cfg.location[0]) u8g2.drawStr(0, 22, cfg.location);
        else u8g2.drawStr(0, 22, "URA4 RFID MANAGER");

        snprintf(line, sizeof(line), "LAN: %s %s", netConnected() ? "ONLINE" : "OFFLINE", netSpeed().c_str());
        u8g2.drawStr(0, 36, line);

        if ((uint32_t)ip == 0) snprintf(line, sizeof(line), "IP: no link");
        else snprintf(line, sizeof(line), "IP: %u.%u.%u.%u", ip[0], ip[1], ip[2], ip[3]);
        u8g2.drawStr(0, 48, line);

        uint32_t secs = now / 1000;
        snprintf(line, sizeof(line), "Up %luh%02lum | Ready", secs / 3600, (secs / 60) % 60);
        u8g2.drawStr(0, 60, line);
    }

    u8g2.sendBuffer();
}

void oledShowMessage(const char* line1, const char* line2) {
    if (!cfg.oledEnable) return;
    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_6x10_tf);
    if (line1) u8g2.drawStr(0, 24, line1);
    if (line2) u8g2.drawStr(0, 42, line2);
    u8g2.sendBuffer();
}

void oledBootSplash(uint32_t holdMs) {
    if (!cfg.oledEnable) return;

    uint32_t t0 = millis();
    while (millis() - t0 < holdMs) {
        u8g2.clearBuffer();
        u8g2.setFont(u8g2_font_6x10_tf);

        u8g2.drawStr(0, 10, cfg.deviceName);

        char line[40];
        IPAddress ip = netIP();
        if ((uint32_t)ip == 0) {
            snprintf(line, sizeof(line), "LAN: %s (no IP)", netConnected() ? "LINK" : "DOWN");
        } else {
            snprintf(line, sizeof(line), "http://%u.%u.%u.%u/", ip[0], ip[1], ip[2], ip[3]);
        }
        u8g2.drawStr(0, 24, line);

        bool ready = webReady();
        bool rdOnline = ura4Ping(150);

        snprintf(line, sizeof(line), "WEB: %s", ready ? "READY" : "WAIT...");
        u8g2.drawStr(0, 38, line);

        snprintf(line, sizeof(line), "URA4: %s", rdOnline ? "ONLINE" : "BOOTING...");
        u8g2.drawStr(0, 52, line);

        u8g2.sendBuffer();

        if (ready && rdOnline && (millis() - t0 >= 1500)) {
            break;
        }

        delay(200);
    }
}

