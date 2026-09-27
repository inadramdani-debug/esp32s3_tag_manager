#include "net.h"
#include <SPI.h>
#include <Ethernet.h>

// ---------------------------------------------------------------------------
// W5500 bring-up.
//
// Wiring (override in platformio.ini):
//   SCK=12  MISO=13  MOSI=11  CS=10  RST=14
//
// Two earlier attempts failed on this board and are recorded here so nobody
// retries them:
//   1. The ESP-IDF esp_eth W5500 driver rejects a negative int_gpio_num and
//      has no polling mode, so it cannot work with INT unconnected.
//   2. The Arduino core's bundled Ethernet library is RMII-only (LAN8720 etc)
//      and has no W5500 support at all.
// The standalone arduino-libraries/Ethernet driver polls, so it needs no INT.
// It drives the W5500's own hardware sockets and never touches lwIP, which is
// why esp_http_server cannot be layered on top of it (see web.cpp).
// ---------------------------------------------------------------------------
#ifndef PIN_ETH_SCK
#define PIN_ETH_SCK  12
#endif
#ifndef PIN_ETH_MISO
#define PIN_ETH_MISO 13
#endif
#ifndef PIN_ETH_MOSI
#define PIN_ETH_MOSI 11
#endif
#ifndef PIN_ETH_CS
#define PIN_ETH_CS   10
#endif
#ifndef PIN_ETH_RST
#define PIN_ETH_RST  14
#endif

// The module's own MAC reads as all-zero, so one is always supplied here
// rather than letting the driver fall back to the blank on-chip value.
static byte s_mac[6] = {0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0xED};

bool netBegin(uint32_t timeoutMs) {
    // Hardware reset first: the module needs it after a cold power-up.
    if (PIN_ETH_RST >= 0) {
        pinMode(PIN_ETH_RST, OUTPUT);
        digitalWrite(PIN_ETH_RST, LOW);
        delay(50);
        digitalWrite(PIN_ETH_RST, HIGH);
        delay(150);
    }

    // Order matters here. The library detects the chip once, on the first call
    // that needs it, and caches the result forever (W5100Class::init has a
    // static `initialized` guard). If anything touches the Ethernet object
    // before Ethernet.init() has stored our CS pin, detection runs against the
    // library's default SS pin, fails, and hardwareStatus() then reports
    // "no hardware" for the rest of the boot even though the W5500 is answering
    // on the bus. So: set the pin, start SPI, force detection, and only then
    // trust hardwareStatus().
    Ethernet.init(PIN_ETH_CS);
    SPI.begin(PIN_ETH_SCK, PIN_ETH_MISO, PIN_ETH_MOSI, PIN_ETH_CS);
    Ethernet.linkStatus();   // forces W5100.init() now that the CS pin is set

    if (Ethernet.hardwareStatus() == EthernetNoHardware) {
        Serial.println("[net] W5500 not detected on the SPI bus");
        return false;
    }
    Serial.println("[net] W5500 detected");

    // Link negotiation takes a couple of seconds, and linkStatus() reads the
    // PHY directly rather than waiting, so poll before deciding it is unplugged.
    uint32_t t0 = millis();
    while (Ethernet.linkStatus() != LinkON && millis() - t0 < 5000) delay(100);
    if (Ethernet.linkStatus() != LinkON) {
        Serial.println("[net] no link after 5s (cable unplugged?)");
        return false;
    }
    Serial.printf("[net] link up after %lums\n", millis() - t0);

#if USE_DHCP
    Serial.printf("[net] DHCP (up to %lums)...\n", (unsigned long)timeoutMs);
    if (Ethernet.begin(s_mac, timeoutMs, 3000) == 0) {
        Serial.println("[net] DHCP failed, falling back to static");
        Ethernet.begin(s_mac, IPAddress(STATIC_IP_A, STATIC_IP_B, STATIC_IP_C, STATIC_IP_D),
                       IPAddress(STATIC_IP_A, STATIC_IP_B, STATIC_IP_C, STATIC_GW_D),
                       IPAddress(STATIC_IP_A, STATIC_IP_B, STATIC_IP_C, STATIC_GW_D),
                       IPAddress(STATIC_MASK_A, STATIC_MASK_B, STATIC_MASK_C, STATIC_MASK_D));
    }
#else
    Ethernet.begin(s_mac, IPAddress(STATIC_IP_A, STATIC_IP_B, STATIC_IP_C, STATIC_IP_D),
                   IPAddress(STATIC_IP_A, STATIC_IP_B, STATIC_IP_C, STATIC_GW_D),
                   IPAddress(STATIC_IP_A, STATIC_IP_B, STATIC_IP_C, STATIC_GW_D),
                   IPAddress(STATIC_MASK_A, STATIC_MASK_B, STATIC_MASK_C, STATIC_MASK_D));
#endif

    Serial.printf("[net] IP %s\n", Ethernet.localIP().toString().c_str());
    return (uint32_t)Ethernet.localIP() != 0;
}

bool netConnected() {
    // Polled hard by the OLED and the heartbeat, and a link flap is not worth a
    // live PHY read several times a second.
    static uint32_t lastCheck = 0;
    static bool     lastState = false;
    uint32_t now = millis();
    if (now - lastCheck < 1000) return lastState;
    lastCheck = now;
    lastState = (Ethernet.linkStatus() == LinkON);
    return lastState;
}

IPAddress netIP() {
    return Ethernet.localIP();
}

String netMac() {
    char buf[18];
    snprintf(buf, sizeof(buf), "%02X:%02X:%02X:%02X:%02X:%02X",
             s_mac[0], s_mac[1], s_mac[2], s_mac[3], s_mac[4], s_mac[5]);
    return String(buf);
}

String netSpeed() {
    switch (Ethernet.linkStatus()) {
        case LinkON:  return String("100Mbps");
        case LinkOFF: return String("down");
        default:      return String("-");
    }
}
