// Reader configuration pages. Kept in its own file because app.js is the shell
// (nav, i18n, toast) while everything here talks to the URA4 reader.

// The reader requires a `functionList` naming what it should return. Without it
// it stalls ~3s and answers with a zero-length body, or `no function !`.
function readerBaseQuery(names) {
    return reader('/BaseConfigurationController/queryBaseConfigurationRequest',
        { type: 'Reader-queryBaseConfigurationRequest',
          functionList: names.map(name => ({ name })) }, 15000);
}

function readerBaseSet(payload) {
    payload.type = 'Reader-updateBaseConfigurationRequest';
    return reader('/BaseConfigurationController/updateBaseConfigurationRequest',
        payload, 15000);
}

// Reports a per-group result.
//
// Almost every group answers `{<group>:{code,message}}`. tagReporting is the
// exception: it reports PER SUB-GROUP one level deeper, with no `code` on the
// group itself —
//
//   {"tagReporting":{"duplicateTagFilter":{"code":0,...},
//                    "rssiFilter":{...},"tagReportingMode":{...}}}
//
// Reading `d.tagReporting.code` there yields undefined, which is neither 0 nor
// a message, so every successful Set on that fieldset reported "failure" while
// the value had in fact been applied (verified by reading it back). So: use the
// group's own code when it has one, otherwise collect the sub-codes, and only
// call it a success when every one of them is 0.
function reportGroup(d, group) {
    const g = d && d[group];
    if (!g) { toast((d && d.message) || t('failure')); return; }

    if (g.code !== undefined) {
        toast(g.code === 0 ? t('success') : (g.message || d.message || t('failure')));
        return;
    }

    const subs = Object.keys(g).filter(k => g[k] && typeof g[k] === 'object' &&
                                            g[k].code !== undefined);
    if (!subs.length) { toast(d.message || t('failure')); return; }

    const bad = subs.find(k => g[k].code !== 0);
    toast(bad ? (g[bad].message || d.message || t('failure')) : t('success'));
}

// ---------------------------------------------------------------------------
// Base: one round-trip for the whole page.
//
// Every fieldset used to fetch on its own, which meant ~9 simultaneous
// requests. The board listens on only a few sockets and talks to the reader one
// request at a time, so some of those lost the race and the page came up with
// fields silently empty. One query carrying every function name avoids that and
// is far quicker against the reader.
// ---------------------------------------------------------------------------
const BASE_ALL = ['antennaPower', 'antennaEnabledState', 'frequency',
    'inventorySearchMode', 'inventoryMemoryBank', 'tagReporting',
    'heartbeatPacket', 'buzzerForInventory', 'tagfocus', 'fastID',
    'linkFrequency', 'afterNetworkDisconnected'];

// Set guards. If the page never managed to read the reader's current settings,
// the form is showing blank/default controls — and pressing Set would then write
// those blanks over the real configuration. Observed: a failed load left the
// antenna checkboxes empty, and Set disabled every antenna on the reader.
// So refuse to write until a successful read has populated the form.
let baseStateLoaded = false;

function baseReady() {
    if (baseStateLoaded) return true;
    toast(t('loadFirst'));
    return false;
}

function baseApply(d) {
    baseStateLoaded = true;
    (d.antennaPower || []).forEach(a => put('ant' + a.antennaPort + 'Power', a.power));
    (d.antennaEnabledState || []).forEach(a => put('ant' + a.antennaPort + 'On', a.enable));

    if (d.frequency) put('frequency', d.frequency.region);

    if (d.inventorySearchMode) {
        put('queryTarget', d.inventorySearchMode.queryTarget);
        put('querySession', d.inventorySearchMode.querySession);
    }

    const m = d.inventoryMemoryBank;
    if (m) {
        put('memoryBank', m.memoryBank);
        put('wordUserOffset', m.wordUserOffset);
        put('wordUserLength', m.wordUserLength);
    }

    const r = d.tagReporting;
    if (r) {
        if (r.duplicateTagFilter) {
            put('dupFilter', r.duplicateTagFilter.enable);
            put('filterByTime', r.duplicateTagFilter.filterByTime);
        }
        if (r.rssiFilter) {
            put('rssiFilter', r.rssiFilter.enable);
            put('rssiIsGreateThan', r.rssiFilter.rssiIsGreateThan);
        }
        if (r.tagReportingMode) put('tagReportingMode', r.tagReportingMode.mode);
    }

    if (d.heartbeatPacket) {
        put('intervalEnable', d.heartbeatPacket.enable);
        put('intervalTime', d.heartbeatPacket.intervalTime);
    }

    if (d.linkFrequency) put('linkFrequency', d.linkFrequency.value);
    if (d.buzzerForInventory) put('buzzerEnable', d.buzzerForInventory.enable);
    if (d.tagfocus) put('tagfocus', d.tagfocus.enable);
    if (d.fastID) put('fastID', d.fastID.enable);
    if (d.afterNetworkDisconnected) put('cacheTags', d.afterNetworkDisconnected.cacheTags);
}

// Get for a single group. The reader answers all groups in one round-trip
// anyway, so this re-reads everything and re-applies it — one request instead
// of nine, which is what the board can actually serve at once.
function baseGetAll() {
    return readerBaseQuery(BASE_ALL).then(d => { baseApply(d); return d; });
}

// ---------------------------------------------------------------------------
// Base: power
// ---------------------------------------------------------------------------
function baseGetPower() {
    baseGetAll().then(() => toast(t('success')))
        .catch(e => toast(e.message || t('failure')));
}

function baseSetPower() {
    if (!baseReady()) return;
    const list = [];
    for (let i = 1; i <= 8; i++) {
        const el = $('ant' + i + 'Power');
        if (el) list.push({ antennaPort: i, power: Number(el.value) });
    }
    readerBaseSet({ antennaPower: list })
        .then(d => reportGroup(d, 'antennaPower'))
        .catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// Base: antenna enable
// ---------------------------------------------------------------------------
function baseGetAntState() {
    baseGetAll().then(() => toast(t('success')))
        .catch(e => toast(e.message || t('failure')));
}

function baseSetAntState() {
    if (!baseReady()) return;
    const list = [];
    for (let i = 1; i <= 8; i++) {
        const el = $('ant' + i + 'On');
        if (el) list.push({ antennaPort: i, enable: el.checked });
    }
    readerBaseSet({ antennaEnabledState: list })
        .then(d => reportGroup(d, 'antennaEnabledState'))
        .catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// Base: frequency
// ---------------------------------------------------------------------------
function baseGetFrequency() {
    baseGetAll().then(() => toast(t('success')))
        .catch(e => toast(e.message || t('failure')));
}

function baseSetFrequency() {
    if (!baseReady()) return;
    readerBaseSet({ frequency: { region: Number($('frequency').value) } })
        .then(d => reportGroup(d, 'frequency'))
        .catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// Base: search mode
// ---------------------------------------------------------------------------
function baseGetSearchMode() {
    baseGetAll().then(() => toast(t('success')))
        .catch(e => toast(e.message || t('failure')));
}

function baseSetSearchMode() {
    if (!baseReady()) return;
    readerBaseSet({ inventorySearchMode: {
        queryTarget: $('queryTarget').value,
        querySession: $('querySession').value
    }}).then(d => reportGroup(d, 'inventorySearchMode'))
       .catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// Base: memory bank
// ---------------------------------------------------------------------------
function baseGetMemoryBank() {
    baseGetAll().then(() => toast(t('success')))
        .catch(e => toast(e.message || t('failure')));
}

function baseSetMemoryBank() {
    if (!baseReady()) return;
    // Number(), not the raw .value. The reader's own page sends these as
    // strings and the reader accepts that, but the board validates the payload
    // before forwarding it and requires real integers — so the string form was
    // rejected here with "wordUserOffset must be 0-255" however valid the
    // number was. Every other Set on this page already converts; this one did
    // not, which is why only this button failed.
    // Same empty-box guard as the filters: Number('') is 0, and 0 is a valid
    // value here (0 means "not used"), so an unfilled box would be stored as a
    // real setting instead of being refused. baseReady() only proves that *a*
    // read succeeded, not that it carried this group — if the reader answered
    // without inventoryMemoryBank these two boxes stay empty while the form
    // counts as loaded. The reader's own page refuses them too.
    if ($('wordUserOffset').value.trim() === '') {
        toast(t('wordUserOffset') + ' — ' + t('fieldRequired'));
        return;
    }
    if ($('wordUserLength').value.trim() === '') {
        toast(t('wordUserLength') + ' — ' + t('fieldRequired'));
        return;
    }

    readerBaseSet({ inventoryMemoryBank: {
        memoryBank: $('memoryBank').value,
        wordUserOffset: Number($('wordUserOffset').value),
        wordUserLength: Number($('wordUserLength').value)
    }}).then(d => reportGroup(d, 'inventoryMemoryBank'))
       .catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// Base: tag reporting
// ---------------------------------------------------------------------------
function baseGetTagReporting() {
    baseGetAll().then(() => toast(t('success')))
        .catch(e => toast(e.message || t('failure')));
}

function baseSetTagReporting() {
    if (!baseReady()) return;

    // An empty box is not "off" — Number('') is 0, which the reader accepts, so
    // the guard has to be here or the empty value is stored as a real setting.
    // Measured on this unit: duplicate filter ON with window 0 gives 69 reads in
    // 10s against 4 with window 10, i.e. the filter silently does nothing while
    // its checkbox looks enabled. The RSSI one is worse — rssiIsGreateThan 0
    // means "stronger than 0 dBm", which no tag can be, so the table comes back
    // empty. Same guard, and same messages, as the reader's own page.
    if (chk('dupFilter') && $('filterByTime').value.trim() === '') {
        toast(t('filterTime') + ' — ' + t('fieldRequired'));
        return;
    }
    if (chk('rssiFilter') && $('rssiIsGreateThan').value.trim() === '') {
        toast(t('rssiGt') + ' — ' + t('fieldRequired'));
        return;
    }

    readerBaseSet({ tagReporting: {
        duplicateTagFilter: {
            enable: chk('dupFilter'),
            filterByTime: Number($('filterByTime').value)
        },
        rssiFilter: {
            enable: chk('rssiFilter'),
            rssiIsGreateThan: Number($('rssiIsGreateThan').value)
        },
        tagReportingMode: { mode: $('tagReportingMode').value }
    }}).then(d => reportGroup(d, 'tagReporting'))
       .catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// Base: heartbeat
// ---------------------------------------------------------------------------
function baseGetHeartbeat() {
    baseGetAll().then(() => toast(t('success')))
        .catch(e => toast(e.message || t('failure')));
}

function baseSetHeartbeat() {
    if (!baseReady()) return;
    readerBaseSet({ heartbeatPacket: {
        enable: chk('intervalEnable'),
        intervalTime: Number($('intervalTime').value)
    }}).then(d => reportGroup(d, 'heartbeatPacket'))
       .catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// Base: link frequency + the four toggles (buzzer, tagfocus, fastID, cacheTags)
// ---------------------------------------------------------------------------
function baseGetLinkFrequency() {
    baseGetAll().then(() => toast(t('success')))
        .catch(e => toast(e.message || t('failure')));
}

function baseSetLinkFrequency() {
    if (!baseReady()) return;
    readerBaseSet({ linkFrequency: { value: $('linkFrequency').value } })
        .then(d => reportGroup(d, 'linkFrequency'))
        .catch(e => toast(e.message || t('failure')));
}

// These four save on change, as on the reader's own page.
function baseSetToggle(group, payload) {
    const p = {};
    p[group] = payload;
    readerBaseSet(p)
        .then(d => reportGroup(d, group))
        .catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// Network
//
// The reader only answers three query functions here — currentIP, wifi and
// tcpServicePort. There is no "ethernet" query (an earlier version asked for
// one and silently got nothing back), so the Ethernet fieldset is populated
// from currentIP and has no Get of its own.
//
// Payload shapes are the reader's own: ethernetIp / wifiIp / wifiSwitch /
// tcpServicePort, each with ipSettings plus a nested ipv4. See
// /uhf_config_network.html on the reader.
// ---------------------------------------------------------------------------
function netQuery(names) {
    return reader('/NetworkConfigurationController/queryNetworkConfigurationRequest',
        { type: 'Reader-queryNetworkConfigurationRequest',
          functionList: names.map(name => ({ name })) }, 15000);
}

function netSet(payload) {
    payload.type = 'Reader-updateNetworkConfigurationRequest';
    return reader('/NetworkConfigurationController/updateNetworkConfigurationRequest',
        payload, 15000);
}

function netGetCurrent() {
    netQuery(['currentIP', 'wifi', 'tcpServicePort']).then(d => {
        const ip = d.currentIP && d.currentIP.ipv4;
        if (ip) {
            put('currentIp', ip.ip);
            put('currentGateway', ip.gateway);
            put('currentSubnetMask', ip.subnetMask);
            put('currentDns1', ip.dns1);
            put('currentDns2', ip.dns2);
            // Seed the Ethernet form with the live values, since the reader has
            // no way to read back what was configured.
            put('ethernetIp', ip.ip);
            put('ethernetGateway', ip.gateway);
            put('ethernetSubnetMask', ip.subnetMask);
            put('ethernetDns1', ip.dns1);
            put('ethernetDns2', ip.dns2);
        }
        if (d.wifi) put('wifiOn', d.wifi.state === 'on');
        const p = d.tcpServicePort;
        if (p) { put('rawData', p.rawData); put('jsonData', p.jsonData); }
        toast(t('success'));
    }).catch(e => toast(e.message || t('failure')));
}

// DNS2 is optional: this reader reports it as an empty string, so requiring it
// blocked Set every time with "IP address is invalid" and the settings could
// never be saved. The reader's own page validates it too, which means the same
// button is broken there — worth knowing, but not worth copying.
// Only the fields a static configuration genuinely needs are required.
function netSetEthernet() {
    const staticMode = $('ethStatic') && $('ethStatic').checked;
    if (staticMode) {
        // Each field is checked with the validator that fits it: the subnet
        // mask is not an address and would fail validateIPAddress.
        const checks = [
            ['ethernetIp', t('ipAddress'), validateIPAddress],
            ['ethernetSubnetMask', t('subnetMask'), validateSubnetMask],
            ['ethernetGateway', t('gateway'), validateIPAddress],
            ['ethernetDns1', t('dns1'), validateIPAddress]
        ];
        for (const [id, label, fn] of checks) {
            const v = $(id).value.trim();
            if (!v) { toast(t('fieldRequired') + ': ' + label); return; }
            if (!fn(v)) { toast(label + ' — ' + t('ipInvalid')); return; }
        }
        // DNS2 may be blank, but a value that is present must still be valid.
        const dns2 = $('ethernetDns2').value.trim();
        if (dns2 && !validateIPAddress(dns2)) {
            toast(t('dns2') + ' — ' + t('ipInvalid'));
            return;
        }
    }
    if (!confirm(t('netWarn'))) return;

    netSet({ ethernetIp: {
        ipSettings: staticMode ? 'static' : 'dhcp',
        ipv4: {
            ip: $('ethernetIp').value.trim(),
            subnetMask: $('ethernetSubnetMask').value.trim(),
            gateway: $('ethernetGateway').value.trim(),
            dns1: $('ethernetDns1').value.trim(),
            dns2: $('ethernetDns2').value.trim()
        }
    }}).then(d => reportGroup(d, 'ethernetIp'))
       .catch(e => toast(e.message || t('failure')));
}

// The wifi switch is its own endpoint, sent on change like the reader's page.
function netSetWifiSwitch(on) {
    netSet({ wifiSwitch: { on: on ? 'on' : 'off' } })
        .then(d => reportGroup(d, 'wifiSwitch'))
        .catch(e => toast(e.message || t('failure')));
}

function netGetWifi() {
    netQuery(['wifi']).then(d => {
        if (d.wifi) put('wifiOn', d.wifi.state === 'on');
        toast(t('success'));
    }).catch(e => toast(e.message || t('failure')));
}

function netGetPort() {
    netQuery(['tcpServicePort']).then(d => {
        const p = d.tcpServicePort;
        if (p) { put('rawData', p.rawData); put('jsonData', p.jsonData); }
        toast(t('success'));
    }).catch(e => toast(e.message || t('failure')));
}

// Ports: a value already used by another service comes back as
// code 166 "Port Conflict!", which reportGroup surfaces as-is.
function netSetPort() {
    netSet({ tcpServicePort: {
        rawData: Number($('rawData').value),
        jsonData: Number($('jsonData').value)
    }}).then(d => reportGroup(d, 'tcpServicePort'))
       .catch(e => toast(e.message || t('failure')));
}

// Same validator the reader's own page uses. Note it rejects anything starting
// with 255, which is why a subnet mask must NOT go through it — see
// validateSubnetMask below.
function validateIPAddress(ip) {
    return /^(?!255\.)(?:\d{1,2}|1\d{2}|2[0-4]\d|25[0-5])\.(?:\d{1,2}|1\d{2}|2[0-4]\d|25[0-5])\.(?:\d{1,2}|1\d{2}|2[0-4]\d|25[0-5])\.(?:\d{1,2}|1\d{2}|2[0-4]\d|25[0-5])$/.test(ip);
}

// A subnet mask is four octets that must be contiguous ones followed by zeros:
// 255.255.255.0, 255.255.0.0, 255.0.0.0, and so on. Validating it with
// validateIPAddress rejected every mask, because they all start with 255.
function validateSubnetMask(mask) {
    const parts = (mask || '').split('.');
    if (parts.length !== 4) return false;
    const ok = ['0', '128', '192', '224', '240', '248', '252', '254', '255'];
    return parts.every(p => ok.indexOf(p) >= 0) && parts[0] === '255';
}

// ---------------------------------------------------------------------------
// GPIO — GPO is writable, GPI is read-only
// ---------------------------------------------------------------------------
function gpioGet() {
    reader('/GpioController/queryGpiStateRequest', {}, 10000).then(d => {
        for (let i = 1; i <= 4; i++) {
            const el = $('gpi' + i);
            if (el && d['GPI' + i]) el.value = d['GPI' + i];
        }
        toast(t('success'));
    }).catch(e => toast(e.message || t('failure')));
}

function gpioSetGpo() {
    reader('/GpioController/updateGpioRequest', {
        type: 'Reader-gpioRequest',
        gpo: {
            gpo1: $('gpo1').value, gpo2: $('gpo2').value,
            gpo3: $('gpo3').value, gpo4: $('gpo4').value,
            wiegandData0: $('gpo5').value, wiegandData1: $('gpo6').value
        }
    }, 10000).then(d => reportGroup(d, 'gpo'))
           .catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// MQTT
// ---------------------------------------------------------------------------
function mqttQuery(names) {
    return reader('/MqttConfigurationController/queryMqttConfigurationRequest',
        { type: 'Reader-queryMqttConfigurationRequest',
          functionList: names.map(name => ({ name })) }, 15000);
}

function mqttGet() {
    mqttQuery(['normalConfig', 'iot']).then(d => {
        put('mqttEnable', !!d.enable);
        const n = d.normalConfiguration;
        if (n) {
            put('normalConfigEnable', !!n.enable);
            const p = n.normalParameters || {};
            put('mqttHostName', p.hostName || '');
            put('mqttClientId', p.clientId || '');
            put('mqttUserName', p.userName || '');
            put('mqttPort', p.port >= 0 ? p.port : '');
            const pub = (p.topics && p.topics.publish) || {};
            put('mqttTagEventTopic', (pub.tagEventTopic && pub.tagEventTopic.topic) || '');
            put('mqttHeartbeatTopic', (pub.heartbeatEventTopic && pub.heartbeatEventTopic.topic) || '');
        }
        const iot = d.iot && d.iot.aliyun;
        if (iot) {
            put('iotEnable', !!iot.enable);
            const p = iot.aliyunParameters || {};
            put('iotHostName', p.hostName || '');
            put('iotClientId', p.clientId || '');
            put('iotUserName', p.userName || '');
            put('iotPort', p.port >= 0 ? p.port : '');
            put('iotDeviceName', p.deviceName || '');
            put('iotTopics', (p.topics && p.topics.publish && p.topics.publish.tagEventTopic
                              && p.topics.publish.tagEventTopic.topic) || '');
        }
        toast(t('success'));
    }).catch(e => toast(e.message || t('failure')));
}

function mqttSetNormal() {
    reader('/MqttConfigurationController/updateMqttConfigurationRequest', {
        type: 'Reader-updateMqttConfigurationRequest',
        enable: chk('mqttEnable'),
        normalConfiguration: {
            enable: chk('normalConfigEnable'),
            normalParameters: {
                hostName: $('mqttHostName').value,
                clientId: $('mqttClientId').value,
                userName: $('mqttUserName').value,
                password: $('mqttPsw').value,
                port: Number($('mqttPort').value) || 0,
                topics: {
                    publish: {
                        tagEventTopic: { topic: $('mqttTagEventTopic').value },
                        heartbeatEventTopic: { topic: $('mqttHeartbeatTopic').value }
                    }
                }
            }
        }
    }, 15000).then(d => reportGroup(d, 'normalConfiguration'))
            .catch(e => toast(e.message || t('failure')));
}

function mqttSetIot() {
    reader('/MqttConfigurationController/updateMqttConfigurationRequest', {
        type: 'Reader-updateMqttConfigurationRequest',
        enable: chk('mqttEnable'),
        iot: {
            aliyun: {
                enable: chk('iotEnable'),
                aliyunParameters: {
                    hostName: $('iotHostName').value,
                    clientId: $('iotClientId').value,
                    userName: $('iotUserName').value,
                    password: $('iotPsw').value,
                    port: Number($('iotPort').value) || 0,
                    productKey: $('iotProductKey').value,
                    productSecret: $('iotProductSecret').value,
                    deviceName: $('iotDeviceName').value,
                    deviceSecret: $('iotDeviceSecret').value,
                    topics: { publish: { tagEventTopic: { topic: $('iotTopics').value } } }
                }
            }
        }
    }, 15000).then(d => reportGroup(d, 'iot'))
            .catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// Reader work mode
// ---------------------------------------------------------------------------
function rmGet() {
    reader('/ReaderWorkModeController/queryReaderWorkModeRequest',
        { type: 'Reader-queryReaderWorkModeRequest' }, 15000).then(d => {
        put('readerRole', d.readerRole);
        put('triggerMode', d.triggerInventoryMode);
        const ep = d.remoteServerEndpoint;
        if (ep) {
            put('protocol', ep.protocol);
            put('serviceHostName', ep.hostName);
            put('servicePort', ep.port);
            put('dataType', ep.dataType);
        }
        toast(t('success'));
    }).catch(e => toast(e.message || t('failure')));
}

function rmSet() {
    reader('/ReaderWorkModeController/updateReaderWorkModeRequest', {
        type: 'Reader-updateReaderWorkModeRequest',
        readerRole: $('readerRole').value,
        triggerInventoryMode: $('triggerMode').value,
        remoteServerEndpoint: {
            protocol: $('protocol').value,
            hostName: $('serviceHostName').value,
            port: Number($('servicePort').value) || 0,
            dataType: $('dataType').value
        }
    }, 15000).then(d => {
        toast(d.code === 0 ? t('success') : (d.message || t('failure')));
    }).catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
function logGet() {
    reader('/LoggerController/queryLoggerRequest',
        { type: 'Reader-queryLoggerRequest' }, 10000).then(d => {
        const p = d.loggerParameter;
        if (p) { put('logDebug', !!p.debug); put('logLevel', p.level); }
        toast(t('success'));
    }).catch(e => toast(e.message || t('failure')));
}

function logSet() {
    reader('/LoggerController/updateLoggerRequest', {
        type: 'Reader-updateLoggerRequest',
        loggerParameter: {
            debug: chk('logDebug'),
            level: Number($('logLevel').value)
        }
    }, 10000).then(d => toast(d.code === 0 ? t('success') : (d.message || t('failure'))))
            .catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// Reader connection: subnet scan.
//
// The board sweeps its own /24 and answers with every host that replied on the
// reader's port. Blocking on the board (tens of seconds), so the button is
// disabled and the label changed while it runs.
// ---------------------------------------------------------------------------
function readerScan() {
    const b = $('btnScan') || $('btnFind');
    const origText = b ? b.textContent : '';
    const out = $('scanResult');
    if (b) { b.disabled = true; b.textContent = t('scanning'); }
    if (out) out.textContent = '';

    fetch('/SystemController/scanReader', { method: 'POST' })
        .then(r => r.json())
        .then(d => {
            const hosts = d.hosts || [];
            if (!hosts.length) {
                toast(t('scanNone'));
                if (out) out.textContent = t('scanNone');
                return;
            }
            // Clicking a result fills the field so it can be saved with Set.
            // The anchor carries the address in a data attribute and is wired
            // up after insertion, rather than inline onclick with nested
            // quotes — that nesting is what broke this file once already.
            if (out) {
                out.textContent = t('scanFound') + ': ';
                // With no IP field on the page (Device Info), clicking adopts the
                // address outright; where there is one (Config Base), it fills it
                // so the change can still be reviewed before Set.
                const hasField = !!$('ura4Host');
                hosts.forEach(h => {
                    const a = document.createElement('a');
                    a.href = 'javascript:void(0)';
                    a.className = 'scan_hit';
                    a.textContent = h;
                    a.addEventListener('click',
                        () => hasField ? pickReader(h) : readerAdopt(h));
                    out.appendChild(a);
                    out.appendChild(document.createTextNode(' '));
                });
            }
            toast(t('scanFound') + ' ' + hosts.length);
        })
        .catch(e => toast(e.message || t('failure')))
        .finally(() => {
            if (b) { b.disabled = false; b.textContent = origText; }
        });
}

function pickReader(host) {
    put('ura4Host', host);
    toast(host);
}

// Adopts an address straight from a scan, for pages that have no IP field
// (Device Info). Saves it to the board so every page picks it up.
function readerAdopt(host) {
    fetch('/BoardConfiguration/updateBaseConfigurationRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reader: { ura4Host: host, ura4Port: 8080 } })
    }).then(r => r.json()).then(d => {
        const g = d.result && d.result.reader;
        toast(g && g.code === 0 ? t('netAdopted') + ' ' + host : t('failure'));
        if (typeof loadDeviceInfo === 'function') loadDeviceInfo();
    }).catch(() => toast(t('failure')));
}
