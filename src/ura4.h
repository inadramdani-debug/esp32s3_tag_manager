#pragma once
#include <Arduino.h>

// HTTP client for the URA4 RFID reader.
//
// The reader exposes its control API over the same port as its web UI
// (8080), so no extra port is needed. Requests are the same shape its own
// pages use: POST with an application/x-www-form-urlencoded body holding
// `data=<json>`. The board acts as a pass-through, forwarding the browser's
// body verbatim rather than re-encoding it.
//
// Every call is bounded by a timeout so an unreachable reader cannot wedge
// the main loop, and by a body cap so a large tag list cannot exhaust the heap.
#ifndef URA4_MAX_BODY
#define URA4_MAX_BODY 16384
#endif

struct Ura4Result {
    bool   ok    = false;   // transport reached the reader
    int    status = 0;      // HTTP status code
    String body;            // response body as received
};

// POSTs to the reader. `body` is sent as-is; pass an already form-encoded
// payload. `timeoutMs` covers connect and read together.
Ura4Result ura4Post(const char* path, const String& body, uint32_t timeoutMs = 5000);

bool      ura4Reachable();
IPAddress ura4IP();      // from cfg, falling back to the default if unparsable
uint16_t  ura4Port();

// TCP-only reachability probe with a short connect timeout. Used for the OLED
// status line, where a full ura4Post() would block for up to a second on every
// redraw. Returns as soon as the handshake succeeds or the timeout expires.
bool ura4Ping(uint16_t timeoutMs = 300);

// Sweeps the board's own /24 for anything answering HTTP on the reader's port.
// Found addresses are appended to `found` (up to maxFound). Blocking, so it is
// driven from a route rather than the main loop. Returns how many were found.
uint8_t ura4Scan(IPAddress* found, uint8_t maxFound);
