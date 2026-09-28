// ---------------------------------------------------------------------------
// Race Timing Run Manager for ESP32-S3 & URA4 RFID Reader
// Precision Stopwatch, BIB Management, Live Finish Line Ingest & Leaderboard
// ---------------------------------------------------------------------------

const RACE_DB_KEY = 'tagmgr_race_runners_v1';
const RACE_STATE_KEY = 'tagmgr_race_state_v1';
const RACE_RAW_KEY = 'tagmgr_race_rawreads_v1';
const RACE_COT_KEY = 'tagmgr_race_cot_v1';
const RACE_WAVE_KEY = 'tagmgr_race_waves_v1';
const RACE_GATEMODE_KEY = 'tagmgr_race_gatemode_v1';
const RACE_DEADZONE_KEY = 'tagmgr_race_deadzone_v1';
const RACE_DUALREADER_KEY = 'tagmgr_race_dualreader_v1';

// Default Cut Off Time (COT) in Milliseconds
const DEFAULT_COT_CONFIG = {
    '5K': 60 * 60 * 1000,      // 01:00:00 (1 Jam)
    '10K': 120 * 60 * 1000,    // 02:00:00 (2 Jam)
    '21K': 210 * 60 * 1000,    // 03:30:00 (3 Jam 30 Menit)
    '42K': 390 * 60 * 1000,    // 06:30:00 (6 Jam 30 Menit)
    'DEFAULT': 90 * 60 * 1000  // 01:30:00 (1 Jam 30 Menit)
};
let raceCotConfig = { ...DEFAULT_COT_CONFIG };

// Default Dead Zone (Blind Window / Durasi Minimal Lari sebelum Finish Sah)
const DEFAULT_DEADZONE_CONFIG = {
    '5K': 12 * 60 * 1000,      // 12 Menit
    '10K': 25 * 60 * 1000,     // 25 Menit
    '21K': 50 * 60 * 1000,     // 50 Menit
    '42K': 120 * 60 * 1000,    // 120 Menit (2 Jam)
    'DEFAULT': 10 * 60 * 1000  // 10 Menit
};
let raceDeadZoneConfig = { ...DEFAULT_DEADZONE_CONFIG };
let raceDeadZoneSettings = {
    preRaceLock: true // Kunci Pra-Lomba: Tolak / abaikan tag pelari jika wave belum start
};

// ── Multi-Reader & Antena Configuration (1, 2, 3, atau Lebih Reader) ───────
const RACE_MULTIREADER_KEY = 'race_multireader_config_v2';
const DEFAULT_MULTI_READER_CONFIG = {
    readers: [
        {
            id: 'R1',
            name: 'Reader 1 (Host ESP32)',
            ip: 'direct',
            isHost: true,
            enabled: true,
            portCount: 8,
            ports: [
                { port: 1, name: 'Ant-1 (Mat Jalur 1)', enabled: true, role: 'AUTO', power: 30 },
                { port: 2, name: 'Ant-2 (Mat Jalur 2)', enabled: true, role: 'AUTO', power: 30 },
                { port: 3, name: 'Ant-3 (Mat Jalur 3)', enabled: true, role: 'AUTO', power: 30 },
                { port: 4, name: 'Ant-4 (Mat Jalur 4)', enabled: true, role: 'AUTO', power: 30 },
                { port: 5, name: 'Ant-5 (Overhead 1)',  enabled: true, role: 'AUTO', power: 30 },
                { port: 6, name: 'Ant-6 (Overhead 2)',  enabled: true, role: 'AUTO', power: 30 },
                { port: 7, name: 'Ant-7 (Side Ant 1)',  enabled: true, role: 'AUTO', power: 30 },
                { port: 8, name: 'Ant-8 (Side Ant 2)',  enabled: true, role: 'AUTO', power: 30 }
            ]
        },
        {
            id: 'R2',
            name: 'Reader 2 (Start Gate Kanan)',
            ip: 'http://192.168.1.117',
            isHost: false,
            enabled: false,
            portCount: 4,
            ports: [
                { port: 1, name: 'R2-Ant-1 (Mat 1)', enabled: true, role: 'START', power: 30 },
                { port: 2, name: 'R2-Ant-2 (Mat 2)', enabled: true, role: 'START', power: 30 },
                { port: 3, name: 'R2-Ant-3 (Mat 3)', enabled: true, role: 'START', power: 30 },
                { port: 4, name: 'R2-Ant-4 (Mat 4)', enabled: true, role: 'START', power: 30 }
            ]
        },
        {
            id: 'R3',
            name: 'Reader 3 (Finish Gate Kiri)',
            ip: 'http://192.168.1.118',
            isHost: false,
            enabled: false,
            portCount: 4,
            ports: [
                { port: 1, name: 'R3-Ant-1 (Mat 1)', enabled: true, role: 'FINISH', power: 30 },
                { port: 2, name: 'R3-Ant-2 (Mat 2)', enabled: true, role: 'FINISH', power: 30 },
                { port: 3, name: 'R3-Ant-3 (Mat 3)', enabled: true, role: 'FINISH', power: 30 },
                { port: 4, name: 'R3-Ant-4 (Mat 4)', enabled: true, role: 'FINISH', power: 30 }
            ]
        }
    ]
};
let multiReaderConfig = JSON.parse(JSON.stringify(DEFAULT_MULTI_READER_CONFIG));
let readerOnlineStatusMap = { R1: true };

// Wave Gun Starts per Category & Gate Mode State
let gateMode = 'auto'; // 'auto' | 'start' | 'finish' | 'split'
let categoryWaves = {
    '5K': { state: 'READY', gunStart: 0, elapsedMs: 0, scheduleStr: '', autoStart: true },
    '10K': { state: 'READY', gunStart: 0, elapsedMs: 0, scheduleStr: '', autoStart: true },
    '21K': { state: 'READY', gunStart: 0, elapsedMs: 0, scheduleStr: '', autoStart: true },
    '42K': { state: 'READY', gunStart: 0, elapsedMs: 0, scheduleStr: '', autoStart: true }
};

let raceTitle = 'RFID Race Run Event';
let raceState = 'READY'; // 'READY', 'RUNNING', 'STOPPED'
let gunStartTime = 0;
let raceElapsedMs = 0;
let raceTimerId = null;
let racePollActive = false;
let raceScanActive = false; // Status whether antenna scanning is active

let runners = []; // { bib, name, category, epc, status: 'REGISTERED'|'STARTED'|'FINISHED'|'OVER_COT'|'DNF', startChipTimeMs, startChipTimeStr, finishChipTimeMs, gunTimeMs, gunTimeStr, chipTimeMs, chipTimeStr, rank }
let finishers = []; // array of finished runners in rank order
let rawReads = []; // raw tag reads buffer (up to 500)
let lastReadMap = new Map(); // epc -> timestamp of last read (anti-duplicate)
let minLapFilterSec = 15; // ignore re-reads within 15 seconds
let activeTab = 'leaderboard'; // 'leaderboard', 'runners', 'raw'
let selectedCategory = 'ALL'; // 'ALL' or specific category (e.g. '5K', '10K')
let selectedRunnerCategory = 'ALL';
let controlFeedFilter = 'ALL'; // 'ALL', 'FINISH', 'START', 'UNREG'
let autoRegisterUnregistered = true; // Auto register unknown tags during start
try {
    const savedAutoReg = localStorage.getItem('tagmgr_race_autoreg_v1');
    if (savedAutoReg !== null) autoRegisterUnregistered = (savedAutoReg === '1');
} catch (e) {}

// Audio Beep generator using Web Audio API
let audioCtx = null;
function racePlayBeep() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880 Hz
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
}

function raceFormatTime(ms) {
    if (!ms || ms < 0) return '00:00:00.00';
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const centis = Math.floor((ms % 1000) / 10);
    const pad = (n, len = 2) => String(n).padStart(len, '0');
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}.${pad(centis)}`;
}

// ---------------------------------------------------------------------------
// Cut Off Time (COT) Helper Functions
// ---------------------------------------------------------------------------
function raceFormatCotStr(ms) {
    if (!ms || ms <= 0) return '00:00:00';
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function raceParseCotStr(str) {
    if (!str) return 0;
    const parts = str.trim().split(':').map(x => parseInt(x, 10) || 0);
    if (parts.length === 3) {
        return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    } else if (parts.length === 2) {
        return (parts[0] * 60 + parts[1]) * 1000;
    } else if (parts.length === 1) {
        return parts[0] * 60 * 1000;
    }
    return 0;
}

function raceGetCotForCategory(cat) {
    if (!cat) return raceCotConfig['DEFAULT'] || (90 * 60 * 1000);
    const key = cat.trim().toUpperCase();
    return raceCotConfig[key] || raceCotConfig['DEFAULT'] || (90 * 60 * 1000);
}

function raceLoadCotConfig() {
    try {
        const raw = localStorage.getItem(RACE_COT_KEY);
        if (raw) raceCotConfig = Object.assign({}, DEFAULT_COT_CONFIG, JSON.parse(raw));
    } catch (e) {
        raceCotConfig = { ...DEFAULT_COT_CONFIG };
    }
}

function raceSaveCotConfig() {
    try {
        localStorage.setItem(RACE_COT_KEY, JSON.stringify(raceCotConfig));
    } catch (e) {}
}

function raceToggleCotDrawer() {
    const el = $('cotDrawer');
    if (!el) return;
    const isOpen = el.style.display !== 'none';
    el.style.display = isOpen ? 'none' : '';
    if (!isOpen) raceRenderCotDrawer();
}

function raceRenderCotDrawer() {
    const container = $('cotGridInputs');
    if (!container) return;
    const cats = raceGetCategories();
    if (!cats.includes('DEFAULT')) cats.push('DEFAULT');

    container.innerHTML = cats.map(cat => {
        const label = (cat === 'DEFAULT') ? 'Default / Lainnya' : `Kategori ${cat}`;
        const ms = raceGetCotForCategory(cat);
        return `
            <div class="cot_item">
                <label>${label}</label>
                <input type="text" id="cot_input_${cat}" class="style_input_text"
                       value="${raceFormatCotStr(ms)}" placeholder="JJ:MM:DD">
            </div>
        `;
    }).join('');
}

function raceSaveCotFromDrawer() {
    const cats = raceGetCategories();
    if (!cats.includes('DEFAULT')) cats.push('DEFAULT');

    cats.forEach(cat => {
        const input = $('cot_input_' + cat);
        if (input && input.value) {
            const ms = raceParseCotStr(input.value);
            if (ms > 0) raceCotConfig[cat.toUpperCase()] = ms;
        }
    });

    raceSaveCotConfig();
    raceUpdateCotDisplay();
    raceRenderLeaderboard();
    toast('✅ Batas Cut Off Time (COT) berhasil disimpan!');
}

function raceApplyCotPreset(preset) {
    if (preset === 'funrun') {
        raceCotConfig['5K'] = 75 * 60 * 1000;   // 01:15:00
        raceCotConfig['10K'] = 150 * 60 * 1000; // 02:30:00
        raceCotConfig['21K'] = 240 * 60 * 1000; // 04:00:00
        raceCotConfig['42K'] = 420 * 60 * 1000; // 07:00:00
        raceCotConfig['DEFAULT'] = 120 * 60 * 1000;
    } else if (preset === 'athletic') {
        raceCotConfig['5K'] = 45 * 60 * 1000;   // 00:45:00
        raceCotConfig['10K'] = 90 * 60 * 1000;  // 01:30:00
        raceCotConfig['21K'] = 180 * 60 * 1000; // 03:00:00
        raceCotConfig['42K'] = 360 * 60 * 1000; // 06:00:00
        raceCotConfig['DEFAULT'] = 60 * 60 * 1000;
    }
    raceRenderCotDrawer();
    raceSaveCotConfig();
    raceUpdateCotDisplay();
    toast(`Preset COT '${preset}' diterapkan`);
}

function raceMarkDnfForUnfinished() {
    const onTrack = runners.filter(r => r.status === 'STARTED' || r.status === 'REGISTERED');
    if (!onTrack.length) {
        toast('Tidak ada peserta yang masih di jalur.');
        return;
    }
    raceShowConfirmModal({
        icon: '🛑',
        title: 'Tutup Finish & Tandai DNF',
        message: `Tandai <b>${onTrack.length} peserta</b> yang masih berada di jalur sebagai <b>DNF (Did Not Finish)</b>?`,
        btnText: '🛑 Tandai DNF',
        btnClass: 'danger',
        onConfirm: () => {
            onTrack.forEach(r => {
                r.status = 'DNF';
                r.notes = (r.notes ? r.notes + ' | ' : '') + 'DNF saat penutupan COT';
            });
            raceSaveRunners();
            raceRenderRunners();
            raceRenderLeaderboard();
            raceRenderRaceResults();
            raceUpdateStats();
            toast(`🛑 ${onTrack.length} peserta di jalur ditandai sebagai DNF.`, 3500);
        }
    });
}

function raceUpdateCotDisplay() {
    const labelEl = $('cotActiveLabel');
    const countEl = $('cotCountdownBadge');
    if (!labelEl || !countEl) return;

    const cats = raceGetCategories();
    const activeCat = (selectedCategory !== 'ALL') ? selectedCategory : (cats[0] || '5K');
    const cotMs = raceGetCotForCategory(activeCat);
    const cotStr = raceFormatCotStr(cotMs);

    if (selectedCategory !== 'ALL') {
        labelEl.textContent = `${activeCat} COT: ${cotStr}`;
    } else {
        const showCats = cats.slice(0, 3);
        const pairs = showCats.map(c => `${c}: ${raceFormatCotStr(raceGetCotForCategory(c))}`).join(' | ');
        labelEl.textContent = pairs + (cats.length > 3 ? ` (+${cats.length - 3} lagi)` : '');
    }

    if (raceState === 'READY' || gunStartTime === 0) {
        countEl.textContent = `(Batas COT: ${cotStr})`;
        labelEl.className = 'cot_badge_pill ok';
        return;
    }

    const diffMs = cotMs - raceElapsedMs;
    if (diffMs > 0) {
        const remainStr = raceFormatTime(diffMs).slice(0, 8);
        if (diffMs < 10 * 60 * 1000) {
            countEl.textContent = `⚠️ Sisa COT: ${remainStr}`;
            labelEl.className = 'cot_badge_pill warn';
        } else {
            countEl.textContent = `⏳ Sisa COT: ${remainStr}`;
            labelEl.className = 'cot_badge_pill ok';
        }
    } else {
        const overStr = raceFormatTime(Math.abs(diffMs)).slice(0, 8);
        countEl.textContent = `⛔ WAKTU HABIS (+${overStr})`;
        labelEl.className = 'cot_badge_pill expired';
    }
}

// ---------------------------------------------------------------------------
// Dead Zone (Blind Window) & Pre-Race Lock Management
// ---------------------------------------------------------------------------
function raceFormatDeadZoneMinutes(ms) {
    if (!ms || ms <= 0) return '10';
    return String(Math.round(ms / 60000));
}

function raceParseDeadZoneMinutes(val) {
    if (!val) return 10 * 60 * 1000;
    const s = String(val).trim();
    if (s.includes(':')) {
        return raceParseCotStr(s);
    }
    const num = parseFloat(s) || 10;
    return Math.round(num * 60 * 1000);
}

function raceGetDeadZoneForCategory(cat) {
    if (!cat) return raceDeadZoneConfig['DEFAULT'] || (10 * 60 * 1000);
    const key = cat.trim().toUpperCase();
    return raceDeadZoneConfig[key] || raceDeadZoneConfig['DEFAULT'] || (10 * 60 * 1000);
}

function raceLoadDeadZoneConfig() {
    try {
        const raw = localStorage.getItem(RACE_DEADZONE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.categories) raceDeadZoneConfig = Object.assign({}, DEFAULT_DEADZONE_CONFIG, parsed.categories);
            else raceDeadZoneConfig = Object.assign({}, DEFAULT_DEADZONE_CONFIG, parsed);
            if (parsed.settings) Object.assign(raceDeadZoneSettings, parsed.settings);
        }
    } catch (e) {
        raceDeadZoneConfig = { ...DEFAULT_DEADZONE_CONFIG };
    }
    raceUpdateDeadZoneSummaryBadge();
}

function raceSaveDeadZoneConfig() {
    try {
        localStorage.setItem(RACE_DEADZONE_KEY, JSON.stringify({
            categories: raceDeadZoneConfig,
            settings: raceDeadZoneSettings
        }));
    } catch (e) {}
    raceUpdateDeadZoneSummaryBadge();
}

function raceUpdateDeadZoneSummaryBadge() {
    const badge = $('deadZoneSummaryBadge');
    if (!badge) return;
    const lockText = raceDeadZoneSettings.preRaceLock ? 'Anti-Lalu: Aktif' : 'Anti-Lalu: Nonaktif';
    const cats = raceGetCategories();
    const showCats = cats.slice(0, 3);
    const pairs = showCats.map(c => `${c}: ${raceFormatDeadZoneMinutes(raceGetDeadZoneForCategory(c))}m`).join(' | ');
    badge.textContent = `${pairs}${cats.length > 3 ? '...' : ''} | ${lockText}`;
    badge.title = `Dead Zone: Durasi minimal lari sebelum finish. Pre-Race Wave Lock: ${raceDeadZoneSettings.preRaceLock ? 'Aktif (Abaikan pelari sebelum start)' : 'Nonaktif'}`;
}

function raceToggleDeadZoneDrawer() {
    const el = $('deadZoneDrawer');
    if (!el) return;
    const isOpen = el.style.display !== 'none';
    el.style.display = isOpen ? 'none' : '';
    if (!isOpen) raceRenderDeadZoneDrawer();
}

function raceRenderDeadZoneDrawer() {
    const container = $('deadZoneGridInputs');
    if (!container) return;
    const cats = raceGetCategories();
    if (!cats.includes('DEFAULT')) cats.push('DEFAULT');

    if ($('chkPreRaceLock')) {
        $('chkPreRaceLock').checked = !!raceDeadZoneSettings.preRaceLock;
    }

    container.innerHTML = cats.map(cat => {
        const label = (cat === 'DEFAULT') ? 'Default / Lainnya' : `Kategori ${cat}`;
        const ms = raceGetDeadZoneForCategory(cat);
        const mins = raceFormatDeadZoneMinutes(ms);
        return `
            <div class="cot_item">
                <label>${label} (Menit):</label>
                <input type="number" min="1" max="600" id="dz_input_${cat}" class="style_input_text font_bold"
                       value="${mins}" placeholder="Menit">
            </div>
        `;
    }).join('');
}

function raceSaveDeadZoneFromDrawer() {
    const cats = raceGetCategories();
    if (!cats.includes('DEFAULT')) cats.push('DEFAULT');

    cats.forEach(cat => {
        const input = $('dz_input_' + cat);
        if (input && input.value) {
            const ms = raceParseDeadZoneMinutes(input.value);
            if (ms > 0) raceDeadZoneConfig[cat.toUpperCase()] = ms;
        }
    });

    if ($('chkPreRaceLock')) {
        raceDeadZoneSettings.preRaceLock = $('chkPreRaceLock').checked;
    }

    raceSaveDeadZoneConfig();
    toast('✅ Pengaturan Dead Zone & Anti Lalu-Lalang berhasil disimpan!');
}

function raceApplyDeadZonePreset(type) {
    if (type === 'standard') {
        raceDeadZoneConfig['5K'] = 12 * 60 * 1000;
        raceDeadZoneConfig['10K'] = 25 * 60 * 1000;
        raceDeadZoneConfig['21K'] = 50 * 60 * 1000;
        raceDeadZoneConfig['42K'] = 120 * 60 * 1000;
        raceDeadZoneConfig['DEFAULT'] = 10 * 60 * 1000;
    } else if (type === 'short') {
        raceDeadZoneConfig['5K'] = 8 * 60 * 1000;
        raceDeadZoneConfig['10K'] = 18 * 60 * 1000;
        raceDeadZoneConfig['21K'] = 40 * 60 * 1000;
        raceDeadZoneConfig['42K'] = 90 * 60 * 1000;
        raceDeadZoneConfig['DEFAULT'] = 8 * 60 * 1000;
    } else if (type === 'marathon') {
        raceDeadZoneConfig['5K'] = 15 * 60 * 1000;
        raceDeadZoneConfig['10K'] = 30 * 60 * 1000;
        raceDeadZoneConfig['21K'] = 60 * 60 * 1000;
        raceDeadZoneConfig['42K'] = 150 * 60 * 1000;
        raceDeadZoneConfig['DEFAULT'] = 15 * 60 * 1000;
    }
    raceRenderDeadZoneDrawer();
    raceSaveDeadZoneConfig();
    toast(`Preset Dead Zone '${type}' diterapkan`);
}

// ---------------------------------------------------------------------------
// Multi-Reader & Antena Configuration (1, 2, 3, atau Lebih Reader)
// ---------------------------------------------------------------------------
function raceLoadMultiReaderConfig() {
    try {
        const raw = localStorage.getItem(RACE_MULTIREADER_KEY);
        if (raw) {
            multiReaderConfig = Object.assign({}, DEFAULT_MULTI_READER_CONFIG, JSON.parse(raw));
        } else {
            // Auto migrate old dualReaderConfig if present
            const oldDual = localStorage.getItem('race_dualreader_config_v1');
            if (oldDual) {
                const parsed = JSON.parse(oldDual);
                multiReaderConfig = JSON.parse(JSON.stringify(DEFAULT_MULTI_READER_CONFIG));
                if (multiReaderConfig.readers && multiReaderConfig.readers[1]) {
                    multiReaderConfig.readers[1].enabled = !!parsed.enabled;
                    if (parsed.reader2Ip) multiReaderConfig.readers[1].ip = parsed.reader2Ip;
                }
            } else {
                multiReaderConfig = JSON.parse(JSON.stringify(DEFAULT_MULTI_READER_CONFIG));
            }
        }
    } catch (e) {
        multiReaderConfig = JSON.parse(JSON.stringify(DEFAULT_MULTI_READER_CONFIG));
    }
    raceUpdateReaderStatusBadges();
}

function raceSaveMultiReaderConfig() {
    try {
        localStorage.setItem(RACE_MULTIREADER_KEY, JSON.stringify(multiReaderConfig));
    } catch (e) {}
    raceUpdateReaderStatusBadges();
}

function raceRenderMultiReaderCards(containerId = 'multiReaderContainer') {
    const container = $(containerId);
    if (!container) return;

    let globalPortCounter = 1;
    const html = (multiReaderConfig.readers || []).map((r, rIdx) => {
        const isHost = !!r.isHost;
        const statusKey = r.id;
        const isOnline = readerOnlineStatusMap[statusKey];
        let statusBadge = '';
        if (!r.enabled) {
            statusBadge = '<span class="reader_badge disabled">⚪ Nonaktif</span>';
        } else if (raceState === 'RUNNING' && racePollActive) {
            statusBadge = '<span class="reader_badge polling">🟢 Polling Live</span>';
        } else if (isHost || isOnline) {
            statusBadge = '<span class="reader_badge online">🟢 Online / Siap</span>';
        } else {
            statusBadge = '<span class="reader_badge" style="background:#fef3c7;color:#92400e;border-color:#fcd34d">🟡 Siap (Belum Ping)</span>';
        }

        const portsHtml = (r.ports || []).map((p, pIdx) => {
            const currentGlobalPort = globalPortCounter++;
            return `
                <tr>
                    <td style="text-align:center;font-weight:bold;color:#0f172a">Port ${p.port}</td>
                    <td style="text-align:center;font-family:Consolas,monospace;font-size:11px;color:#64748b">Port ${currentGlobalPort}</td>
                    <td>
                        <input type="text" class="style_input_text font_bold" style="height:26px;font-size:11.5px;color:#0f172a"
                               value="${p.name || (r.id + '-Ant-' + p.port)}"
                               placeholder="Nama / ID Antena..."
                               onchange="raceUpdateAntennaField('${r.id}', ${p.port}, 'name', this.value)">
                    </td>
                    <td style="text-align:center">
                        <select class="style_fieldset_select font_bold" style="height:26px;font-size:11px;padding:0 6px"
                                onchange="raceUpdateAntennaField('${r.id}', ${p.port}, 'role', this.value)">
                            <option value="AUTO" ${p.role === 'AUTO' ? 'selected' : ''}>🔄 Auto (Start & Finish)</option>
                            <option value="START" ${p.role === 'START' ? 'selected' : ''}>🟢 Garis Start Saja</option>
                            <option value="FINISH" ${p.role === 'FINISH' ? 'selected' : ''}>🏁 Garis Finish Saja</option>
                            <option value="SPLIT" ${p.role === 'SPLIT' ? 'selected' : ''}>⏱️ Checkpoint / Split</option>
                        </select>
                    </td>
                    <td style="text-align:center">
                        <input type="checkbox" ${p.enabled !== false ? 'checked' : ''}
                               onchange="raceUpdateAntennaField('${r.id}', ${p.port}, 'enabled', this.checked)">
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="style_fieldset" style="margin-bottom:12px;background:#ffffff;border:1.5px solid #cbd5e1;border-radius:8px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
                <!-- Reader Card Header -->
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;padding-bottom:8px;border-bottom:1px solid #f1f5f9">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <span class="mono font_bold" style="background:#0284c7;color:#ffffff;padding:3px 8px;border-radius:4px;font-size:12px">${r.id}</span>
                        <input type="text" class="style_input_text font_bold" style="width:230px;height:28px;font-size:12.5px;color:#0f172a"
                               value="${r.name}" placeholder="Nama Reader..."
                               onchange="raceUpdateReaderField('${r.id}', 'name', this.value)">
                        <label style="display:flex;align-items:center;gap:4px;font-size:12px;font-weight:bold;cursor:pointer;color:#0f172a">
                            <input type="checkbox" ${r.enabled ? 'checked' : ''}
                                   onchange="raceUpdateReaderField('${r.id}', 'enabled', this.checked)">
                            <span>Aktif</span>
                        </label>
                        ${statusBadge}
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <button type="button" class="style_fieldset_div_button btn_tool" style="height:26px;font-size:11px;padding:0 8px"
                                onclick="raceTestSingleReaderConnection('${r.id}')">
                            ⚡ Ping / Tes
                        </button>
                        ${!isHost ? `
                            <button type="button" class="style_fieldset_div_button btn_tool btn_danger_sm" style="height:26px;font-size:11px;padding:0 8px"
                                    onclick="raceRemoveReader('${r.id}')" title="Hapus Reader ini">
                                🗑️ Hapus
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- Connection & Port Count Settings Row -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px;margin-bottom:10px;background:#f8fafc;padding:8px 10px;border-radius:6px;border:1px solid #e2e8f0;font-size:12px">
                    <div>
                        <span style="color:#64748b;font-weight:600">Koneksi / IP URL:</span><br>
                        ${isHost ? `
                            <span class="mono font_bold" style="color:#059669;display:inline-block;margin-top:4px">Direct Internal Reader (Host ESP32)</span>
                        ` : `
                            <input type="text" class="style_input_text mono" style="width:100%;height:26px;margin-top:2px"
                                   value="${r.ip || 'http://192.168.1.117'}" placeholder="http://192.168.1.117"
                                   onchange="raceUpdateReaderField('${r.id}', 'ip', this.value)">
                        `}
                    </div>
                    <div>
                        <span style="color:#64748b;font-weight:600">Jumlah Port Antena Fisik:</span><br>
                        <select class="style_fieldset_select" style="width:100%;height:26px;margin-top:2px"
                                onchange="raceUpdateReaderPortCount('${r.id}', parseInt(this.value))">
                            <option value="1" ${r.portCount === 1 ? 'selected' : ''}>1 Port Antena</option>
                            <option value="2" ${r.portCount === 2 ? 'selected' : ''}>2 Port Antena</option>
                            <option value="4" ${r.portCount === 4 ? 'selected' : ''}>4 Port Antena</option>
                            <option value="8" ${r.portCount === 8 ? 'selected' : ''}>8 Port Antena</option>
                            <option value="16" ${r.portCount === 16 ? 'selected' : ''}>16 Port Antena</option>
                        </select>
                    </div>
                </div>

                <!-- Antenna Port Table -->
                <div class="tag_table_wrap" style="margin-top:6px">
                    <table class="tag_table" style="font-size:11.5px">
                        <thead>
                            <tr>
                                <th style="width:75px">Port Lokal</th>
                                <th style="width:85px">Global Port</th>
                                <th>Nama / ID Port Antena (Matras / Gate)</th>
                                <th style="width:170px">Fungsi Timing (Role)</th>
                                <th style="width:65px">Aktif</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${portsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function raceAddReader() {
    const existingIds = (multiReaderConfig.readers || []).map(r => r.id);
    let nextNum = existingIds.length + 1;
    let newId = 'R' + nextNum;
    while (existingIds.includes(newId)) {
        nextNum++;
        newId = 'R' + nextNum;
    }

    const defaultIp = `http://192.168.1.${115 + nextNum}`;
    const newReader = {
        id: newId,
        name: `Reader ${nextNum} (Secondary Reader)`,
        ip: defaultIp,
        isHost: false,
        enabled: true,
        portCount: 4,
        ports: [
            { port: 1, name: `${newId}-Ant-1`, enabled: true, role: 'AUTO', power: 30 },
            { port: 2, name: `${newId}-Ant-2`, enabled: true, role: 'AUTO', power: 30 },
            { port: 3, name: `${newId}-Ant-3`, enabled: true, role: 'AUTO', power: 30 },
            { port: 4, name: `${newId}-Ant-4`, enabled: true, role: 'AUTO', power: 30 }
        ]
    };

    multiReaderConfig.readers.push(newReader);
    raceSaveMultiReaderConfig();
    raceRenderMultiReaderCards();
    if ($('configMultiReaderContainer')) raceRenderMultiReaderCards('configMultiReaderContainer');
    toast(`➕ Reader baru [${newId}] berhasil ditambahkan!`, 3500);
}

function raceRemoveReader(readerId) {
    const idx = (multiReaderConfig.readers || []).findIndex(x => x.id === readerId);
    if (idx === -1) return;
    if (multiReaderConfig.readers[idx].isHost) {
        toast('⚠️ Reader Host (ESP32 Utama) tidak boleh dihapus!');
        return;
    }
    const name = multiReaderConfig.readers[idx].name;
    multiReaderConfig.readers.splice(idx, 1);
    raceSaveMultiReaderConfig();
    raceRenderMultiReaderCards();
    if ($('configMultiReaderContainer')) raceRenderMultiReaderCards('configMultiReaderContainer');
    toast(`🗑️ Reader [${readerId}] ${name} berhasil dihapus.`);
}

function raceUpdateReaderField(readerId, field, val) {
    const r = (multiReaderConfig.readers || []).find(x => x.id === readerId);
    if (!r) return;
    if (field === 'ip') {
        let clean = (val || '').trim();
        if (clean && !clean.startsWith('http://') && !clean.startsWith('https://')) {
            clean = 'http://' + clean;
        }
        r.ip = clean;
    } else {
        r[field] = val;
    }
    raceSaveMultiReaderConfig();
    raceRenderMultiReaderCards();
    if ($('configMultiReaderContainer')) raceRenderMultiReaderCards('configMultiReaderContainer');
}

function raceUpdateReaderPortCount(readerId, newCount) {
    const r = (multiReaderConfig.readers || []).find(x => x.id === readerId);
    if (!r) return;
    r.portCount = newCount;
    r.ports = r.ports || [];
    if (r.ports.length < newCount) {
        for (let i = r.ports.length + 1; i <= newCount; i++) {
            r.ports.push({
                port: i,
                name: `${r.id}-Ant-${i}`,
                enabled: true,
                role: 'AUTO',
                power: 30
            });
        }
    } else if (r.ports.length > newCount) {
        r.ports = r.ports.slice(0, newCount);
    }
    raceSaveMultiReaderConfig();
    raceRenderMultiReaderCards();
    if ($('configMultiReaderContainer')) raceRenderMultiReaderCards('configMultiReaderContainer');
}

function raceUpdateAntennaField(readerId, portNum, field, val) {
    const r = (multiReaderConfig.readers || []).find(x => x.id === readerId);
    if (!r || !r.ports) return;
    const p = r.ports.find(x => x.port === portNum);
    if (!p) return;
    p[field] = val;
    raceSaveMultiReaderConfig();
}

function raceTimeoutSignal(ms) {
    try {
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
            return AbortSignal.timeout(ms);
        }
    } catch (e) {}
    return undefined;
}

async function raceTestSingleReaderConnection(readerId) {
    const r = (multiReaderConfig.readers || []).find(x => x.id === readerId);
    if (!r) return;
    if (r.isHost || r.ip === 'direct') {
        toast(`✅ Reader 1 (Host ESP32): Direct Internal Reader Aktif & Terhubung.`, 3000);
        readerOnlineStatusMap[r.id] = true;
        raceRenderMultiReaderCards();
        if ($('configMultiReaderContainer')) raceRenderMultiReaderCards('configMultiReaderContainer');
        return;
    }

    let url = (r.ip || '').trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'http://' + url;
    url = url.replace(/\/+$/, '');

    toast(`⚡ Menghubungi [${r.id}] ${r.name} di ${url}...`);
    try {
        const t0 = performance.now();
        const resp = await fetch(`${url}/InventoryController/tagReportingDataAndIndex`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            signal: raceTimeoutSignal(3500)
        });
        const elapsed = Math.round(performance.now() - t0);
        if (resp.ok) {
            readerOnlineStatusMap[r.id] = true;
            toast(`✅ Koneksi [${r.id}] ${r.name} BERHASIL! (${elapsed}ms) - ${r.portCount} Port Antena Siap.`, 4000);
        } else {
            throw new Error(`HTTP ${resp.status}`);
        }
    } catch (e) {
        readerOnlineStatusMap[r.id] = false;
        toast(`❌ Gagal terhubung ke [${r.id}] di ${url}: ${e.message || 'Timeout / Offline'}. Pastikan IP benar & terhubung ke Wi-Fi/LAN yang sama.`, 5000);
    }
    raceRenderMultiReaderCards();
    if ($('configMultiReaderContainer')) raceRenderMultiReaderCards('configMultiReaderContainer');
}

async function raceTestAllReadersConnection() {
    toast('⚡ Menguji koneksi ke semua reader aktif...');
    for (let r of (multiReaderConfig.readers || [])) {
        if (r.enabled) {
            await raceTestSingleReaderConnection(r.id);
        }
    }
}

function raceGetAntennaInfo(readerIdOrIndex, localOrGlobalPort) {
    let r = null;
    if (typeof readerIdOrIndex === 'string') {
        r = (multiReaderConfig.readers || []).find(x => x.id === readerIdOrIndex);
    } else if (typeof readerIdOrIndex === 'number') {
        r = (multiReaderConfig.readers || [])[readerIdOrIndex - 1];
    }
    if (!r && (multiReaderConfig.readers || []).length) {
        r = multiReaderConfig.readers[0];
    }

    const portNum = Number(localOrGlobalPort) || 1;
    let portObj = null;
    if (r && r.ports) {
        portObj = r.ports.find(p => p.port === portNum) || r.ports[portNum - 1];
    }

    const readerId = r ? r.id : 'R1';
    const readerName = r ? r.name : 'Reader 1 (Host ESP32)';
    const customPortName = portObj ? portObj.name : `Ant-${portNum}`;
    const portRole = portObj ? (portObj.role || 'AUTO') : 'AUTO';
    const readerPortLabel = `${readerId}-P${portNum}`;
    const antennaName = `Port ${portNum}: ${customPortName}`;

    return {
        readerId,
        readerName,
        portNum,
        portName: customPortName,
        role: portRole,
        readerPortLabel,
        antennaName,
        hubName: `[${readerId}] ${readerName}`
    };
}

function raceUpdateReaderStatusBadges() {
    const b1 = $('r1StatusBadge');
    const b2 = $('r2StatusBadge');
    const d1 = $('r1DetailStatus');
    const d2 = $('r2DetailStatus');

    if (b1) {
        if (raceState === 'RUNNING' && racePollActive) {
            b1.className = 'reader_badge polling';
            b1.textContent = 'R1 (Host): 🟢 Polling';
        } else {
            b1.className = 'reader_badge online';
            b1.textContent = 'R1 (Host): 🟢 Online';
        }
    }
    if (b2 && multiReaderConfig.readers && multiReaderConfig.readers[1]) {
        const r2 = multiReaderConfig.readers[1];
        if (!r2.enabled) {
            b2.className = 'reader_badge disabled';
            b2.textContent = `${r2.id}: ⚪ Nonaktif`;
        } else if (raceState === 'RUNNING' && racePollActive) {
            b2.className = 'reader_badge polling';
            b2.textContent = `${r2.id}: 🟢 Polling`;
        } else if (readerOnlineStatusMap[r2.id]) {
            b2.className = 'reader_badge online';
            b2.textContent = `${r2.id}: 🟢 Online`;
        } else {
            b2.className = 'reader_badge';
            b2.textContent = `${r2.id}: 🟡 Siap`;
        }
    }
}

// ---------------------------------------------------------------------------
// Wave Gun Start & Gate Mode Management
// ---------------------------------------------------------------------------
function raceSetGateMode(mode) {
    gateMode = mode;
    ['auto', 'start', 'finish', 'split'].forEach(m => {
        const btn = $('gateMode_' + m);
        if (btn) {
            btn.className = 'gate_mode_btn ' + (m === mode ? (mode === 'start' ? 'start_active' : (mode === 'finish' ? 'finish_active' : 'active')) : '');
        }
        const radio = $('radioGate_' + m);
        if (radio) radio.checked = (m === mode);
        const card = $('gateCard_' + m);
        if (card) {
            const isSel = (m === mode);
            card.style.borderColor = isSel ? '#0284c7' : '#cbd5e1';
            card.style.background = isSel ? '#f0f9ff' : '#ffffff';
            card.style.boxShadow = isSel ? '0 1px 4px rgba(2,132,199,0.2)' : 'none';
        }
        const quickBtn = $('btnGateSelect_' + m);
        if (quickBtn) quickBtn.classList.toggle('active', m === mode);
    });

    const badge = $('gateModeBadge');
    if (badge) {
        const shortLabel = mode === 'auto' ? 'Auto' : (mode === 'start' ? 'Start Saja' : (mode === 'finish' ? 'Finish Saja' : 'Split Port'));
        badge.textContent = `🔄 Gerbang: ${shortLabel}`;
    }

    const phaseBadge = $('gatePhaseStatusBadge');
    const toggleBtn = $('btnToggleGatePhase');
    if (phaseBadge) {
        if (mode === 'start') {
            phaseBadge.textContent = '🟢 FASE START AKTIF (Semua Tag = Start)';
            phaseBadge.className = 'reader_badge online';
            phaseBadge.style.background = '#dcfce7';
            phaseBadge.style.color = '#15803d';
            phaseBadge.style.borderColor = '#86efac';
        } else if (mode === 'finish') {
            phaseBadge.textContent = '🏁 FASE FINISH AKTIF (Semua Tag = Finish)';
            phaseBadge.className = 'reader_badge online';
            phaseBadge.style.background = '#e0f2fe';
            phaseBadge.style.color = '#0369a1';
            phaseBadge.style.borderColor = '#7dd3fc';
        } else if (mode === 'auto') {
            phaseBadge.textContent = '🔄 MODE AUTO (Start ➔ Finish via Dead Zone)';
            phaseBadge.className = 'reader_badge';
            phaseBadge.style.background = '#f8fafc';
            phaseBadge.style.color = '#334155';
            phaseBadge.style.borderColor = '#cbd5e1';
        } else {
            phaseBadge.textContent = '🔀 MODE SPLIT (P1-4: Start | P5-8: Finish)';
            phaseBadge.className = 'reader_badge';
            phaseBadge.style.background = '#f8fafc';
            phaseBadge.style.color = '#7c3aed';
            phaseBadge.style.borderColor = '#ddd6fe';
        }
    }

    if (toggleBtn) {
        if (mode === 'start') {
            toggleBtn.textContent = '🏁 TUTUP START & BUKA FINISH';
            toggleBtn.style.background = '#2563eb';
            toggleBtn.style.borderColor = '#1d4ed8';
        } else if (mode === 'finish') {
            toggleBtn.textContent = '🟢 BUKA KEMBALI FASE START';
            toggleBtn.style.background = '#15803d';
            toggleBtn.style.borderColor = '#166534';
        } else {
            toggleBtn.textContent = '🏁 PAKSA TUTUP START & BUKA FINISH';
            toggleBtn.style.background = '#2563eb';
            toggleBtn.style.borderColor = '#1d4ed8';
        }
    }

    try { localStorage.setItem(RACE_GATEMODE_KEY, mode); } catch (e) {}
    const label = mode === 'auto' ? 'Auto (Start & Finish)' : (mode === 'start' ? 'Gerbang START Saja' : (mode === 'finish' ? 'Gerbang FINISH Saja' : 'Pisah Port Antena (Port 1/2=Start, 3/4=Finish)'));
    toast(`📡 Mode Gerbang RFID: ${label}`);
}

function raceToggleGatePhase() {
    if (gateMode === 'start' || gateMode === 'auto') {
        raceSetGateMode('finish');
        toast('🏁 FASE FINISH DIAKTIFKAN! Seluruh pelari yang kembali dan melintasi matras sekarang akan dicatat sebagai FINISH.', 4500);
    } else {
        raceSetGateMode('start');
        toast('🟢 FASE START DIAKTIFKAN! Seluruh tag yang melintasi garis sekarang akan dicatat sebagai Waktu Mulai (Chip Start).', 4500);
    }
}

function raceLoadGateMode() {
    try {
        const m = localStorage.getItem(RACE_GATEMODE_KEY);
        if (m) gateMode = m;
    } catch (e) {}
    raceSetGateMode(gateMode);
}

function raceLoadWaves() {
    try {
        const raw = localStorage.getItem(RACE_WAVE_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            Object.keys(saved).forEach(k => {
                if (!categoryWaves[k]) categoryWaves[k] = { state: 'READY', gunStart: 0, elapsedMs: 0, scheduleStr: '', autoStart: true };
                Object.assign(categoryWaves[k], saved[k]);
            });
        }
    } catch (e) {}
}

function raceSaveWaves() {
    try {
        localStorage.setItem(RACE_WAVE_KEY, JSON.stringify(categoryWaves));
    } catch (e) {}
}

function raceEnsureCategoryWave(cat) {
    const k = (cat || 'DEFAULT').toUpperCase();
    if (!categoryWaves[k]) {
        categoryWaves[k] = { state: 'READY', gunStart: 0, elapsedMs: 0, scheduleStr: '', autoStart: true, startedManually: false };
    }
    return categoryWaves[k];
}

function raceParseScheduleSeconds(str) {
    if (!str) return -1;
    const parts = str.trim().split(':').map(x => parseInt(x, 10) || 0);
    if (parts.length >= 2) {
        return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
    }
    return -1;
}

function raceStartCategoryWave(cat, isManual = true) {
    const wave = raceEnsureCategoryWave(cat);
    const now = Date.now();
    wave.gunStart = now;
    wave.gunStartStr = new Date(now).toLocaleTimeString();
    wave.state = 'RUNNING';
    wave.elapsedMs = 0;
    if (isManual) {
        wave.startedManually = true;
    }

    if (raceState !== 'RUNNING') {
        gunStartTime = wave.gunStart;
        raceElapsedMs = 0;
        raceState = 'RUNNING';
    }

    racePlayBeep();
    raceSaveWaves();
    raceSaveState();
    raceUpdateControls();
    raceRenderWavePills(true);
    raceUpdateScanButtonUI();

    if (isManual) {
        toast(`▶ MANUAL GUN START: Wave ${cat} dimulai oleh Operator (Jam Start: ${wave.gunStartStr})! Klik 📡 SCAN untuk mengaktifkan antena.`);
    } else {
        toast(`⏰ AUTO GUN START: Wave ${cat} Otomatis Dimulai Sesuai Jam Browser (${wave.gunStartStr})!`, 5000);
    }
}

function raceRenderWavePills(force = false) {
    const container = $('wavePillContainer');
    if (!container) return;
    const cats = raceGetCategories();

    const now = new Date();
    const currentSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    const existingPills = container.querySelectorAll('.wave_pill');
    if (!force && existingPills.length === cats.length) {
        cats.forEach((cat, idx) => {
            const wave = raceEnsureCategoryWave(cat);
            const isRunning = wave.state === 'RUNNING';
            const isStopped = wave.state === 'STOPPED';
            const elapsed = isRunning ? (Date.now() - wave.gunStart) : (wave.elapsedMs || 0);
            const timeStr = raceFormatTime(elapsed).slice(0, 8);

            const pill = existingPills[idx];
            if (!pill) return;

            const btn = pill.querySelector('button');
            const schedSpan = pill.querySelector('.sched_note_span');

            if (btn) {
                if (isRunning) {
                    btn.textContent = `🟢 ${cat} (${timeStr})`;
                    btn.className = 'style_fieldset_div_button btn_tool';
                    btn.disabled = true;
                } else if (isStopped) {
                    btn.textContent = `⏸ ${cat} (${timeStr})`;
                    btn.className = 'style_fieldset_div_button btn_tool';
                    btn.disabled = false;
                } else {
                    btn.textContent = `▶ Start ${cat}`;
                    btn.className = 'style_fieldset_div_button btn_gun_start';
                    btn.disabled = false;
                }
            }

            if (schedSpan) {
                if (wave.scheduleStr && wave.state === 'READY') {
                    const targetSecs = raceParseScheduleSeconds(wave.scheduleStr);
                    if (targetSecs > currentSecs) {
                        const diff = targetSecs - currentSecs;
                        const m = Math.floor(diff / 60);
                        const s = diff % 60;
                        const pad = n => String(n).padStart(2, '0');
                        schedSpan.textContent = `⏰ ${wave.scheduleStr} (Sisa ${pad(m)}:${pad(s)})`;
                        schedSpan.style.color = '#0284c7';
                    } else {
                        schedSpan.textContent = `⏰ ${wave.scheduleStr}`;
                        schedSpan.style.color = '#d97706';
                    }
                    schedSpan.style.display = 'inline';
                } else {
                    schedSpan.style.display = 'none';
                }
            }
        });
        return;
    }

    container.innerHTML = cats.map(cat => {
        const wave = raceEnsureCategoryWave(cat);
        const isRunning = wave.state === 'RUNNING';
        const isStopped = wave.state === 'STOPPED';
        const elapsed = isRunning ? (Date.now() - wave.gunStart) : (wave.elapsedMs || 0);
        const timeStr = raceFormatTime(elapsed).slice(0, 8);

        let btnLabel = `▶ Start ${cat}`;
        if (isRunning) btnLabel = `🟢 ${cat} (${timeStr})`;
        else if (isStopped) btnLabel = `⏸ ${cat} (${timeStr})`;

        return `
            <div class="wave_pill ${isRunning ? 'running' : ''}" data-cat="${cat}">
                <button type="button" class="style_fieldset_div_button ${isRunning ? 'btn_tool' : 'btn_gun_start'}"
                        style="height:22px;font-size:11px;padding:0 6px"
                        onclick="raceStartCategoryWave('${cat}', true)" ${isRunning ? 'disabled' : ''}
                        title="Klik untuk Start Manual oleh Operator">
                    ${btnLabel}
                </button>
                <span class="sched_note_span" style="font-size:10.5px;font-family:Consolas,monospace;font-weight:bold;display:none"></span>
            </div>
        `;
    }).join('');
}

function raceToggleWaveDrawer() {
    const el = $('waveDrawer');
    if (!el) return;
    const isOpen = el.style.display !== 'none';
    el.style.display = isOpen ? 'none' : '';
    if (!isOpen) raceRenderWaveDrawer();
}

function raceRenderWaveDrawer() {
    const container = $('waveGridInputs');
    if (!container) return;
    const cats = raceGetCategories();

    container.innerHTML = cats.map(cat => {
        const wave = raceEnsureCategoryWave(cat);
        return `
            <div class="cot_item">
                <label>Wave ${cat} (Jam Start):</label>
                <input type="text" id="wave_sched_${cat}" class="style_input_text font_bold mono"
                       value="${wave.scheduleStr || ''}" placeholder="06:30:00">
            </div>
        `;
    }).join('');
}

function raceSaveWaveFromDrawer() {
    const cats = raceGetCategories();
    cats.forEach(cat => {
        const input = $('wave_sched_' + cat);
        if (input) {
            const wave = raceEnsureCategoryWave(cat);
            wave.scheduleStr = input.value.trim();
        }
    });
    raceSaveWaves();
    raceRenderWavePills();
    toast('✅ Jadwal Wave per kategori berhasil disimpan!');
}

function raceApplyWaveOffsetSeconds(offsetSecs) {
    const cats = raceGetCategories();
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');

    cats.forEach((cat, idx) => {
        const wave = raceEnsureCategoryWave(cat);
        const t = new Date(now.getTime() + (offsetSecs * 1000) + (idx * 15 * 1000));
        wave.scheduleStr = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
        const input = $('wave_sched_' + cat);
        if (input) input.value = wave.scheduleStr;
    });

    raceSaveWaves();
    raceRenderWavePills();
    toast(`🕒 Jadwal Wave diset mulai +${offsetSecs} detik dari jam browser sekarang!`);
}

function raceApplyWavePreset(preset) {
    const cats = raceGetCategories();
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');

    cats.forEach((cat, idx) => {
        const wave = raceEnsureCategoryWave(cat);
        const t = new Date(now.getTime() + (idx * 15 * 60 * 1000));
        wave.scheduleStr = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
        const input = $('wave_sched_' + cat);
        if (input) input.value = wave.scheduleStr;
    });

    raceSaveWaves();
    raceRenderWavePills();
    toast('Preset Wave selisih 15 menit diterapkan');
}

function raceClearAllWaveSchedules() {
    const cats = raceGetCategories();
    cats.forEach(cat => {
        const wave = raceEnsureCategoryWave(cat);
        wave.scheduleStr = '';
        const input = $('wave_sched_' + cat);
        if (input) input.value = '';
    });
    raceSaveWaves();
    raceRenderWavePills();
    toast('❌ Semua jadwal wave dihapus. Mode Gun Start full manual Operator.');
}

function raceCheckWaveAutoStarts() {
    const now = new Date();
    const currentSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const cats = raceGetCategories();

    cats.forEach(cat => {
        const wave = raceEnsureCategoryWave(cat);
        // Only auto-trigger if wave is currently READY and has a valid schedule string
        if (wave.scheduleStr && wave.state === 'READY') {
            const targetSecs = raceParseScheduleSeconds(wave.scheduleStr);
            if (targetSecs >= 0) {
                // If browser time has reached or passed the target second (within 300 seconds window)
                if (currentSecs >= targetSecs && (currentSecs - targetSecs) < 300) {
                    raceStartCategoryWave(cat, false); // false = triggered automatically
                }
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Continuous Heartbeat & Timer Engine (Runs Always)
// ---------------------------------------------------------------------------
let raceHeartbeatTimer = null;

function raceHeartbeat() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();

    // 1. Update live browser clock in UI
    const browserClockEl = $('browserLiveClock');
    if (browserClockEl) browserClockEl.textContent = timeStr;

    // 2. Actively check auto-starts (even when raceState is READY)
    raceCheckWaveAutoStarts();

    // 3. Update main stopwatch and COT when RUNNING
    const formattedElapsed = raceFormatTime(raceState === 'RUNNING' ? (Date.now() - gunStartTime) : (raceElapsedMs || 0));
    if (raceState === 'RUNNING') {
        raceElapsedMs = Date.now() - gunStartTime;
        const clockEl = $('raceClock');
        if (clockEl) clockEl.textContent = formattedElapsed;
        raceUpdateCotDisplay();
    }
    const miniClockEl = $('leaderboardMiniClock');
    if (miniClockEl) miniClockEl.textContent = formattedElapsed;

    const lbStateBadge = $('leaderboardLiveStateBadge');
    if (lbStateBadge) {
        lbStateBadge.className = 'race_badge ' + (raceState === 'RUNNING' ? 'running' : (raceState === 'STOPPED' ? 'stopped' : 'ready'));
        lbStateBadge.textContent = (raceState === 'RUNNING' ? 'LIVE' : (raceState === 'STOPPED' ? 'PAUSED' : 'SIAP'));
    }

    const lbFinisherEl = $('leaderboardFinisherCount');
    if (lbFinisherEl) lbFinisherEl.textContent = finishers.length;

    // 4. Update live wave countdowns and elapsed timers
    raceRenderWavePills();

    // 5. Update panel-specific live tables if active
    if (activeTab === 'control') raceRenderControlRecentBody();
    else if (activeTab === 'guntime') raceRenderGunTimeStatusTable();
    else if (activeTab === 'cot') raceRenderCotStatusTable();
}

function raceUpdateClock() {
    raceHeartbeat();
}

function raceIsGunTimeRunning() {
    if (raceState === 'RUNNING' && gunStartTime > 0) return true;
    const cats = raceGetCategories();
    return cats.some(c => {
        const w = categoryWaves[c.toUpperCase()];
        return w && w.state === 'RUNNING' && w.gunStart > 0;
    });
}

async function raceToggleScan() {
    if (!raceIsGunTimeRunning()) {
        toast('⚠️ GUN TIME BELUM BERJALAN! Mulai Gun Time terlebih dahulu (secara manual oleh Operator atau tunggu Jam Jadwal Otomatis) sebelum mengaktifkan Scan Antena.', 5000);
        racePlayBeep();
        return;
    }

    if (raceScanActive) {
        await raceStopScan();
    } else {
        await raceStartScan();
    }
}

async function raceStartScan() {
    if (!raceIsGunTimeRunning()) {
        toast('⚠️ Gun Time belum berjalan! Tidak dapat mengaktifkan scan antena.', 4000);
        return;
    }
    raceScanActive = true;
    raceUpdateScanButtonUI();
    toast('📡 ANTENA SCANNING AKTIF! Membaca chip tag peserta di garis start/finish...', 4000);
    racePlayBeep();
    raceStartReaderPolling();
}

async function raceStopScan() {
    raceScanActive = false;
    raceUpdateScanButtonUI();
    toast('⏹ SCAN ANTENA DIHENTIKAN. (Timer Lomba Tetap Berjalan)', 3500);
    raceStopReaderPolling();
}

function raceUpdateScanButtonUI() {
    const btn = $('btnRaceScan');
    if (!btn) return;
    const isGunRunning = raceIsGunTimeRunning();

    if (raceScanActive && isGunRunning) {
        btn.innerHTML = '🔴 STOP SCAN (Antena Aktif)';
        btn.style.background = '#dc2626';
        btn.style.borderColor = '#b91c1c';
        btn.style.color = '#ffffff';
        btn.classList.add('pulse');
    } else {
        btn.innerHTML = '📡 SCAN (Aktifkan Antena)';
        if (!isGunRunning) {
            btn.style.background = '#94a3b8';
            btn.style.borderColor = '#64748b';
            btn.style.color = '#ffffff';
            btn.title = 'Gun Time belum berjalan! Klik Start Gun Time terlebih dahulu.';
        } else {
            btn.style.background = '#0284c7';
            btn.style.borderColor = '#0369a1';
            btn.style.color = '#ffffff';
            btn.title = 'Klik untuk mengaktifkan pembacaan antena RFID';
        }
        btn.classList.remove('pulse');
    }
}

async function raceStartGun(isManual = true) {
    const now = Date.now();
    if (raceState === 'READY') {
        gunStartTime = now;
        raceElapsedMs = 0;
    } else if (raceState === 'STOPPED') {
        gunStartTime = now - raceElapsedMs;
    }

    // Start all ready or stopped waves
    const cats = raceGetCategories();
    cats.forEach(c => {
        const w = raceEnsureCategoryWave(c);
        if (w.state === 'READY' || w.state === 'STOPPED') {
            w.state = 'RUNNING';
            w.gunStart = (w.state === 'READY') ? now : (now - (w.elapsedMs || 0));
            w.gunStartStr = new Date(w.gunStart).toLocaleTimeString();
            if (isManual) w.startedManually = true;
        }
    });

    raceState = 'RUNNING';
    racePlayBeep();
    raceUpdateControls();
    raceSaveWaves();
    raceSaveState();
    raceRenderWavePills(true);
    raceUpdateScanButtonUI();

    if (typeof reportView === 'function') {
        reportView('race_timing', {
            running: true,
            count: finishers.length,
            msg: raceFormatTime(raceElapsedMs).slice(0, 8)
        });
    }

    toast('🏁 GUN TIME DIMULAI (Manual Operator)! Timer berjalan. Klik tombol 📡 SCAN untuk mengaktifkan antena RFID.');
}

async function raceStop() {
    if (raceState !== 'RUNNING') return;
    raceState = 'STOPPED';
    raceScanActive = false;
    const now = Date.now();

    if (raceTimerId) {
        clearInterval(raceTimerId);
        raceTimerId = null;
    }

    // Pause all waves
    Object.keys(categoryWaves).forEach(k => {
        const w = categoryWaves[k];
        if (w.state === 'RUNNING') {
            w.state = 'STOPPED';
            w.elapsedMs = now - w.gunStart;
        }
    });

    raceUpdateClock();
    raceUpdateControls();
    raceSaveWaves();
    raceSaveState();
    raceStopReaderPolling();
    raceRenderWavePills(true);
    raceUpdateScanButtonUI();

    if (typeof reportView === 'function') {
        reportView('race_timing', {
            running: false,
            count: finishers.length,
            msg: 'STOPPED'
        });
    }

    toast('⏹ Lomba Dihentikan (Paused) & Antena Dinonaktifkan');
}

function raceReset() {
    raceShowConfirmModal({
        icon: '🔄',
        title: 'Reset Timer & Lomba',
        message: 'Masukkan Password/PIN pengaman untuk me-reset timer dan seluruh catatan waktu lomba ini:<br><br><span style="color:#b45309;font-size:12px">⚠️ Catatan waktu Gun Start, Chip Start, dan Finish semua peserta akan dikembalikan ke posisi awal (Siap).</span>',
        pin: '1234',
        pinHint: '💡 <i>Ketik PIN <b>1234</b> untuk konfirmasi reset lomba.</i>',
        btnText: '🔄 Ya, Reset Lomba',
        btnClass: 'danger',
        onConfirm: () => {
            raceScanActive = false;
            raceStop();
            raceState = 'READY';
            gunStartTime = 0;
            raceElapsedMs = 0;
            finishers = [];
            lastReadMap.clear();

            // Reset waves
            Object.keys(categoryWaves).forEach(k => {
                categoryWaves[k].state = 'READY';
                categoryWaves[k].gunStart = 0;
                categoryWaves[k].elapsedMs = 0;
            });

            runners.forEach(r => {
                r.status = 'REGISTERED';
                r.startChipTimeMs = 0;
                r.startChipTimeStr = '';
                r.finishChipTimeMs = 0;
                r.gunTimeMs = 0;
                r.gunTimeStr = '';
                r.chipTimeMs = 0;
                r.chipTimeStr = '';
                r.finishTimeMs = null;
                r.finishTimeStr = '';
                r.rank = null;
            });

            raceSaveWaves();
            raceSaveRunners();
            raceSaveState();
            raceUpdateClock();
            raceUpdateControls();
            raceRenderLeaderboard();
            raceRenderRunners();
            raceRenderWavePills(true);
            raceRenderControlRecentBody();
            raceUpdateScanButtonUI();
            raceUpdateStats();
            if ($('finisherBanner')) $('finisherBanner').style.display = 'none';

            if (typeof reportView === 'function') {
                reportView('race_timing', {
                    running: false,
                    count: 0,
                    msg: 'READY 00:00'
                });
            }

            toast('🔄 Timer & Hasil Lomba Berhasil Direset');
        }
    });
}

function raceUpdateControls() {
    const btnStart = $('btnGunStart');
    const btnStop = $('btnStopRace');
    const badge = $('raceStateBadge');

    if (btnStart) {
        if (raceState === 'RUNNING') {
            btnStart.textContent = '🟢 Gun Time Berjalan';
            btnStart.disabled = true;
            btnStart.className = 'style_fieldset_div_button btn_tool';
        } else {
            btnStart.textContent = '▶ START GUN TIME';
            btnStart.disabled = false;
            btnStart.className = 'style_fieldset_div_button btn_gun_start';
        }
    }
    if (btnStop) btnStop.disabled = (raceState !== 'RUNNING');

    if (badge) {
        badge.className = 'race_badge ' + raceState.toLowerCase();
        badge.textContent = (raceState === 'RUNNING') ? 'BERJALAN' : (raceState === 'STOPPED' ? 'DIHENTIKAN' : 'SIAP');
    }

    raceUpdateScanButtonUI();
}

// ---------------------------------------------------------------------------
// Multi-Reader RFID Ingest & Timing Matching (Multi-Reader Concurrent Polling)
// ---------------------------------------------------------------------------
async function raceStartReaderPolling() {
    racePollActive = true;
    raceUpdateReaderStatusBadges();

    // 1. Initialize all active readers in multiReaderConfig
    for (let r of (multiReaderConfig.readers || [])) {
        if (!r.enabled) continue;
        if (r.isHost || r.ip === 'direct') {
            try {
                await reader('/InventoryController/clearCacheTagAndIndex', {}, 6000);
                await reader('/InventoryController/startInventoryRequest', {
                    type: 'Reader-startInventoryRequest',
                    backgroundInventory: false,
                    tagFilter: { tagMemoryBank: 'epc', bitOffset: 0, bitLength: 0, hexMask: null }
                }, 8000);
                readerOnlineStatusMap[r.id] = true;
            } catch (e) {
                readerOnlineStatusMap[r.id] = false;
            }
        } else if (r.ip) {
            let cleanIp = r.ip.replace(/\/+$/, '');
            if (!cleanIp.startsWith('http://') && !cleanIp.startsWith('https://')) cleanIp = 'http://' + cleanIp;
            try {
                await fetch(`${cleanIp}/InventoryController/clearCacheTagAndIndex`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                    signal: raceTimeoutSignal(3000)
                });
                await fetch(`${cleanIp}/InventoryController/startInventoryRequest`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'Reader-startInventoryRequest',
                        backgroundInventory: false,
                        tagFilter: { tagMemoryBank: 'epc', bitOffset: 0, bitLength: 0, hexMask: null }
                    }),
                    signal: raceTimeoutSignal(3000)
                });
                readerOnlineStatusMap[r.id] = true;
            } catch (e) {
                readerOnlineStatusMap[r.id] = false;
            }
        }
    }
    raceUpdateReaderStatusBadges();

    while (racePollActive && raceScanActive && raceIsGunTimeRunning()) {
        const pollPromises = [];
        let globalPortOffset = 0;

        for (let r of (multiReaderConfig.readers || [])) {
            if (!r.enabled) {
                globalPortOffset += (r.portCount || 4);
                continue;
            }

            const currentOffset = globalPortOffset;
            const currentReaderId = r.id;

            if (r.isHost || r.ip === 'direct') {
                pollPromises.push(
                    reader('/InventoryController/tagReportingDataAndIndex', {}, 3500)
                        .then(d => {
                            if (d && Array.isArray(d.data)) {
                                readerOnlineStatusMap[currentReaderId] = true;
                                d.data.forEach(tag => {
                                    const epc = (tag.epcHex || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
                                    const rawPort = tag.antennaPort || 1;
                                    const mappedPort = rawPort + currentOffset;
                                    if (epc) raceHandleTagRead(epc, tag.rssi, mappedPort, currentReaderId, rawPort);
                                });
                            }
                        })
                        .catch(() => { readerOnlineStatusMap[currentReaderId] = false; })
                );
            } else if (r.ip) {
                let cleanIp = r.ip.replace(/\/+$/, '');
                if (!cleanIp.startsWith('http://') && !cleanIp.startsWith('https://')) cleanIp = 'http://' + cleanIp;

                pollPromises.push(
                    fetch(`${cleanIp}/InventoryController/tagReportingDataAndIndex`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                        signal: raceTimeoutSignal(2500)
                    })
                    .then(res => res.ok ? res.json() : null)
                    .then(d => {
                        if (d && Array.isArray(d.data)) {
                            readerOnlineStatusMap[currentReaderId] = true;
                            d.data.forEach(tag => {
                                const epc = (tag.epcHex || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
                                const rawPort = tag.antennaPort || 1;
                                const mappedPort = rawPort + currentOffset;
                                if (epc) raceHandleTagRead(epc, tag.rssi, mappedPort, currentReaderId, rawPort);
                            });
                        }
                    })
                    .catch(() => { readerOnlineStatusMap[currentReaderId] = false; })
                );
            }

            globalPortOffset += (r.portCount || 4);
        }

        await Promise.allSettled(pollPromises);
        await new Promise(r => setTimeout(r, 60));
    }
}

async function raceStopReaderPolling() {
    racePollActive = false;
    for (let r of (multiReaderConfig.readers || [])) {
        if (!r.enabled) continue;
        if (r.isHost || r.ip === 'direct') {
            try {
                await reader('/InventoryController/stopInventoryRequest', { type: 'Reader-stopInventoryRequest' }, 5000);
            } catch (e) {}
        } else if (r.ip) {
            let cleanIp = r.ip.replace(/\/+$/, '');
            if (!cleanIp.startsWith('http://') && !cleanIp.startsWith('https://')) cleanIp = 'http://' + cleanIp;
            try {
                await fetch(`${cleanIp}/InventoryController/stopInventoryRequest`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'Reader-stopInventoryRequest' }),
                    signal: raceTimeoutSignal(3000)
                });
            } catch (e) {}
        }
    }
    raceUpdateReaderStatusBadges();
}

function raceHandleTagRead(epc, rssi, antenna, readerIdOrIndex = 'R1', localPort = null) {
    const now = Date.now();
    let runner = runners.find(r => (r.epc || r.id || '').toUpperCase() === epc);

    // Auto register unknown tags during race if option is enabled
    if (!runner && autoRegisterUnregistered) {
        const newBib = String(runners.length + 101);
        const newName = `Peserta #${newBib}`;
        const cats = raceGetCategories();
        const assignedCat = (cats && cats.length) ? cats[0] : '5K';
        runner = {
            id: epc,
            bib: newBib,
            bibName: `BIB ${newBib}`,
            name: newName,
            gender: 'L',
            event: raceTitle || 'Event Lomba Lari',
            category: assignedCat,
            registered: 'AUTO SCAN',
            bloodType: '—',
            phone: '',
            emergencyPhone: '',
            email: '',
            epc: epc,
            status: 'REGISTERED',
            startChipTimeMs: 0,
            startChipTimeStr: '',
            finishChipTimeMs: 0,
            gunTimeMs: 0,
            gunTimeStr: '',
            chipTimeMs: 0,
            chipTimeStr: '',
            finishTimeMs: null,
            finishTimeStr: '',
            notes: 'Otomatis Didaftarkan saat Scan',
            rank: null
        };
        runners.push(runner);
        raceSaveRunners();
        raceRenderRunners();
        toast(`➕ Tag ${epc.slice(-6)} otomatis didaftarkan sebagai BIB #${newBib}!`, 3000);
    }

    raceProcessRead(epc, rssi, antenna, now, readerIdOrIndex, localPort);
}

function raceProcessRead(epc, rssi, antenna, readTimestampMs, readerIdOrIndex = 'R1', localPort = null) {
    const now = readTimestampMs || Date.now();
    let runner = runners.find(r => (r.epc || r.id || '').toUpperCase() === epc);

    // Multi-Reader Antenna info lookup
    const antInfo = raceGetAntennaInfo(readerIdOrIndex, localPort || antenna);
    const cat = runner ? (runner.category || '5K').toUpperCase() : '5K';
    const wave = categoryWaves[cat] || { state: raceState, gunStart: gunStartTime };

    const portNum = Number(antenna) || 1;
    const readerPortLabel = antInfo.readerPortLabel || `P${portNum}`;
    const hubName = antInfo.hubName || 'Hub-1 (Host ESP32)';
    const antName = antInfo.antennaName || `Ant-${portNum}`;
    const eventName = (runner && runner.event) ? runner.event : (raceTitle || 'Event Lomba Lari');

    let stationName = 'Start/Finish Gate';
    if (antInfo.role === 'START') stationName = 'Start Gate';
    else if (antInfo.role === 'FINISH') stationName = 'Finish Gate';
    else if (antInfo.role === 'SPLIT') stationName = 'Checkpoint Split';
    else if (gateMode === 'start') stationName = 'Start Gate';
    else if (gateMode === 'finish') stationName = 'Finish Gate';
    else if (gateMode === 'split') stationName = (portNum <= 4 ? 'Start Gate' : 'Finish Gate');
    else stationName = (runner && runner.status === 'STARTED') ? 'Finish Gate' : 'Start Gate';

    // Anti-duplicate debounce (2.0 seconds per tag)
    const lastSeen = lastReadMap.get(epc) || 0;
    if (now - lastSeen < 2000) return;
    lastReadMap.set(epc, now);

    // ── 1. PRE-RACE WAVE LOCK (Anti Lalu-Lalang) ───────────────────────────
    if (runner && raceDeadZoneSettings.preRaceLock) {
        const isWaveRunning = (wave && wave.state === 'RUNNING' && wave.gunStart > 0);
        if (!isWaveRunning) {
            const blockItem = {
                id: rawReads.length + 1,
                time: new Date().toLocaleTimeString(),
                fullTime: new Date().toLocaleString(),
                epc: epc,
                tid: '—',
                bib: runner.bib,
                eventName: eventName,
                name: runner.name,
                gender: runner.gender || 'L',
                category: runner.category || '5K',
                station: stationName,
                hubId: hubName,
                antenna: antName,
                readerPort: readerPortLabel,
                rssi: rssi,
                gate: '⛔ BLOCKED (Wave Belum Start)'
            };
            rawReads.unshift(blockItem);
            if (rawReads.length > 500) rawReads.length = 500;
            raceSaveRawReads();
            raceRenderControlRecentBody();
            if (activeTab === 'racedata') raceRenderRaceData();
            return;
        }
    }

    // ── 2. UNREGISTERED TAG (Tag Asing) ───────────────────────────────────
    if (!runner) {
        const unregItem = {
            id: rawReads.length + 1,
            time: new Date().toLocaleTimeString(),
            fullTime: new Date().toLocaleString(),
            epc: epc,
            tid: '—',
            bib: '—',
            eventName: raceTitle || 'Event Lomba Lari',
            name: 'Tag Asing',
            gender: '—',
            category: '—',
            station: stationName,
            hubId: hubName,
            antenna: antName,
            readerPort: readerPortLabel,
            rssi: rssi,
            gate: '📡 TAG ASING'
        };
        rawReads.unshift(unregItem);
        if (rawReads.length > 500) rawReads.length = 500;
        raceSaveRawReads();
        raceRenderControlRecentBody();
        if (activeTab === 'racedata') raceRenderRaceData();
        return;
    }

    // ── 3. ALREADY FINISHED RUNNER ─────────────────────────────────────────
    if (runner.status === 'FINISHED' || runner.status === 'OVER_COT') {
        const finReItem = {
            id: rawReads.length + 1,
            time: new Date().toLocaleTimeString(),
            fullTime: new Date().toLocaleString(),
            epc: epc,
            tid: '—',
            bib: runner.bib,
            eventName: eventName,
            name: runner.name,
            gender: runner.gender || 'L',
            category: runner.category || '5K',
            station: 'Finish Gate',
            hubId: hubName,
            antenna: antName,
            readerPort: readerPortLabel,
            rssi: rssi,
            gate: '🏁 FINISHED (Re-read)'
        };
        rawReads.unshift(finReItem);
        if (rawReads.length > 500) rawReads.length = 500;
        raceSaveRawReads();
        raceRenderControlRecentBody();
        if (activeTab === 'racedata') raceRenderRaceData();
        return;
    }

    // ── 4. DETERMINE GATE EVENT TYPE (Start vs Finish) ─────────────────────
    let isStartEvent = false;
    let isFinishEvent = false;

    if (antInfo.role === 'START') {
        isStartEvent = true;
    } else if (antInfo.role === 'FINISH') {
        isFinishEvent = true;
    } else if (gateMode === 'start') {
        isStartEvent = true;
    } else if (gateMode === 'finish') {
        isFinishEvent = true;
    } else if (gateMode === 'split') {
        if (portNum <= 4) isStartEvent = true;
        else isFinishEvent = true;
    } else {
        if (!runner.startChipTimeMs || runner.status === 'REGISTERED') {
            isStartEvent = true;
        } else if (runner.status === 'STARTED') {
            isFinishEvent = true;
        }
    }

    // ── 5. PROCESS START EVENT (Chip Start) ────────────────────────────────
    if (isStartEvent) {
        if (!runner.startChipTimeMs || runner.status === 'REGISTERED') {
            runner.startChipTimeMs = now;
            runner.startChipTimeStr = new Date(now).toLocaleTimeString();
            runner.status = 'STARTED';

            const startItem = {
                id: rawReads.length + 1,
                time: runner.startChipTimeStr,
                fullTime: new Date().toLocaleString(),
                epc: epc,
                tid: '—',
                bib: runner.bib,
                eventName: eventName,
                name: runner.name,
                gender: runner.gender || 'L',
                category: runner.category || '5K',
                station: 'Start Gate',
                hubId: hubName,
                antenna: antName,
                readerPort: readerPortLabel,
                rssi: rssi,
                gate: '🟢 CHIP START'
            };
            rawReads.unshift(startItem);
            if (rawReads.length > 500) rawReads.length = 500;
            raceSaveRawReads();

            racePlayBeep();
            raceShowStartAlert(runner);
            raceSaveRunners();
            raceRenderRunners();
            raceRenderLeaderboard();
            raceRenderRaceResults();
            raceUpdateStats();
            raceRenderControlRecentBody();
            if (activeTab === 'racedata') raceRenderRaceData();
            return;
        }
    }

    // ── 6. PROCESS FINISH EVENT WITH DEAD ZONE FILTER ──────────────────────
    if (isFinishEvent) {
        const deadZoneMs = raceGetDeadZoneForCategory(runner.category);
        const elapsedSinceStart = runner.startChipTimeMs ? (now - runner.startChipTimeMs) : 0;

        // Check if runner is within DEAD ZONE (in auto mode, prevent premature finish)
        const isDeadZoneBlocked = (gateMode === 'auto') && (runner.startChipTimeMs > 0 && elapsedSinceStart < deadZoneMs);
        if (isDeadZoneBlocked) {
            const elapsedSec = Math.floor(elapsedSinceStart / 1000);
            const deadZoneMin = Math.round(deadZoneMs / 60000);
            const deadItem = {
                id: rawReads.length + 1,
                time: new Date().toLocaleTimeString(),
                fullTime: new Date().toLocaleString(),
                epc: epc,
                tid: '—',
                bib: runner.bib,
                eventName: eventName,
                name: runner.name,
                gender: runner.gender || 'L',
                category: runner.category || '5K',
                station: 'Finish Gate',
                hubId: hubName,
                antenna: antName,
                readerPort: readerPortLabel,
                rssi: rssi,
                gate: `⏳ DEAD ZONE (${elapsedSec}s < ${deadZoneMin}m)`
            };
            rawReads.unshift(deadItem);
            if (rawReads.length > 500) rawReads.length = 500;
            raceSaveRawReads();
            raceRenderControlRecentBody();
            if (activeTab === 'racedata') raceRenderRaceData();
            return;
        }

        // Runner passed Dead Zone -> SAH FINISH!
        const waveGunStart = (wave && wave.gunStart > 0) ? wave.gunStart : gunStartTime;
        runner.finishChipTimeMs = now;
        const actualGunStart = (waveGunStart > 0) ? waveGunStart : runner.startChipTimeMs;
        runner.categoryGunStartStr = (wave && wave.gunStartStr) ? wave.gunStartStr : new Date(actualGunStart).toLocaleTimeString();
        runner.gunStartStr = runner.categoryGunStartStr;
        runner.gunFinishStr = new Date(now).toLocaleTimeString();
        runner.finishChipTimeStr = runner.gunFinishStr;
        runner.gunTimeMs = Math.max(0, now - actualGunStart);
        runner.gunTimeStr = raceFormatTime(runner.gunTimeMs);
        runner.finishTimeMs = runner.gunTimeMs;
        runner.finishTimeStr = runner.gunTimeStr;

        if (runner.startChipTimeMs > 0 && runner.startChipTimeMs <= now) {
            runner.chipTimeMs = now - runner.startChipTimeMs;
            runner.chipTimeStr = raceFormatTime(runner.chipTimeMs);
        } else {
            runner.chipTimeMs = runner.gunTimeMs;
            runner.chipTimeStr = runner.gunTimeStr;
            if (!runner.startChipTimeStr) runner.startChipTimeStr = new Date(actualGunStart).toLocaleTimeString();
        }

        // Cut Off Time evaluation
        const catCotMs = raceGetCotForCategory(runner.category);
        if (catCotMs && runner.gunTimeMs > catCotMs) {
            runner.status = 'OVER_COT';
            runner.isCot = true;
            runner.notes = `Over COT (+${raceFormatTime(runner.gunTimeMs - catCotMs).slice(0, 8)})`;
        } else {
            runner.status = 'FINISHED';
            runner.isCot = false;
            runner.notes = 'Valid Finisher (Sesuai COT)';
        }

        finishers = runners.filter(x => x.status === 'FINISHED' || x.status === 'OVER_COT')
                           .sort((a, b) => (a.finishTimeMs || 0) - (b.finishTimeMs || 0));
        finishers.forEach((x, idx) => x.rank = idx + 1);

        const finItem = {
            id: rawReads.length + 1,
            time: new Date().toLocaleTimeString(),
            fullTime: new Date().toLocaleString(),
            epc: epc,
            tid: '—',
            bib: runner.bib,
            eventName: eventName,
            name: runner.name,
            gender: runner.gender || 'L',
            category: runner.category || '5K',
            station: 'Finish Gate',
            hubId: hubName,
            antenna: antName,
            readerPort: readerPortLabel,
            rssi: rssi,
            gate: runner.status === 'OVER_COT' ? '⚠️ FINISH (Over COT)' : '🏆 FINISH (Sah)'
        };
        rawReads.unshift(finItem);
        if (rawReads.length > 500) rawReads.length = 500;
        raceSaveRawReads();

        racePlayBeep();
        raceShowFinisherAlert(runner);
        raceSaveRunners();
        raceRenderLeaderboard();
        raceRenderRaceResults();
        raceRenderRunners();
        raceUpdateStats();
        raceRenderControlRecentBody();

        if (typeof reportView === 'function') {
            reportView('race_timing', {
                running: true,
                count: finishers.length,
                cell: '#' + runner.bib + ' ' + runner.name,
                msg: runner.chipTimeStr.slice(0, 8),
                epc: epc
            });
        }
    }

    if (activeTab === 'racedata') raceRenderRaceData();
}

function raceShowStartAlert(r) {
    const banner = $('finisherBanner');
    if (!banner) return;
    banner.className = 'scan_banner ok';
    banner.style.background = '#e0f2fe';
    banner.style.borderColor = '#7dd3fc';
    banner.style.color = '#0369a1';
    banner.innerHTML = `👟 <b>CHIP START</b> — [BIB ${r.bib}] <b>${r.name}</b> (${r.category}) Melintasi Garis Start pada ⏱ <b>${r.startChipTimeStr}</b>`;
    banner.style.display = '';
}

function raceShowFinisherAlert(r) {
    const banner = $('finisherBanner');
    if (!banner) return;
    if (r.status === 'OVER_COT') {
        banner.className = 'scan_banner miss';
        const cotStr = raceFormatCotStr(raceGetCotForCategory(r.category));
        banner.innerHTML = `⚠️ <b>FINISH MELEWATI COT #${r.rank}</b> — [BIB ${r.bib}] ${r.name} (${r.category}) | Gun: <b>${r.gunTimeStr}</b> | Chip: <b>${r.chipTimeStr}</b> <span style="font-size:11px;color:#c0392b">(Batas COT: ${cotStr})</span>`;
    } else {
        banner.className = 'scan_banner ok';
        banner.innerHTML = `🏆 <b>FINISH #${r.rank}</b> — [BIB ${r.bib}] <b>${r.name}</b> (${r.category}) | ⏱ Gun: <b>${r.gunTimeStr}</b> | Net Chip: <b>${r.chipTimeStr}</b>`;
    }
    banner.style.display = '';
}

// ---------------------------------------------------------------------------
// Runner & BIB Database Management (13-Column Schema)
// ---------------------------------------------------------------------------
function raceLoadRunners() {
    try {
        const raw = localStorage.getItem(RACE_DB_KEY);
        runners = raw ? JSON.parse(raw) : [];
    } catch (e) { runners = []; }

    runners.forEach((r, idx) => {
        if (!r.id) r.id = r.epc || ('ID' + (r.bib || (idx + 1)));
        if (!r.bibName) {
            const parts = (r.name || '').trim().split(/\s+/);
            r.bibName = parts.length >= 2 ? `${parts[0].toUpperCase()} ${parts[1].charAt(0).toUpperCase()}.` : (r.name ? r.name.toUpperCase() : 'BIB');
        }
        if (!r.gender) {
            const first = (r.name || '').trim().split(/\s+/)[0];
            r.gender = INDO_FEMALE_FIRST_NAMES.includes(first) ? 'P' : 'L';
        }
        if (!r.event) r.event = raceTitle || 'Event Lomba Lari';
        if (!r.registered) r.registered = 'TERDAFTAR';
        if (!r.bloodType) r.bloodType = '—';
        if (r.phone === undefined) r.phone = '';
        if (r.emergencyPhone === undefined) r.emergencyPhone = '';
        if (r.email === undefined) r.email = '';
        if (!r.notes) r.notes = '';
    });

    finishers = runners.filter(r => r.status === 'FINISHED' || r.status === 'OVER_COT')
                       .sort((a, b) => (a.finishTimeMs || 0) - (b.finishTimeMs || 0));
    finishers.forEach((r, idx) => r.rank = idx + 1);
}

function raceSaveRunners() {
    try {
        localStorage.setItem(RACE_DB_KEY, JSON.stringify(runners));
    } catch (e) {}
}

function raceLoadRawReads() {
    try {
        const raw = localStorage.getItem(RACE_RAW_KEY);
        rawReads = raw ? JSON.parse(raw) : [];
    } catch (e) { rawReads = []; }
}

function raceSaveRawReads() {
    try {
        localStorage.setItem(RACE_RAW_KEY, JSON.stringify(rawReads.slice(0, 500)));
    } catch (e) {}
}

function raceLoadState() {
    try {
        const raw = localStorage.getItem(RACE_STATE_KEY);
        if (raw) {
            const st = JSON.parse(raw);
            raceTitle = st.title || 'RFID Race Event';
            raceElapsedMs = st.elapsed || 0;
            if ($('raceTitleInput')) $('raceTitleInput').value = raceTitle;
        }
    } catch (e) {}
}

function raceSaveState() {
    try {
        localStorage.setItem(RACE_STATE_KEY, JSON.stringify({
            title: raceTitle,
            elapsed: raceElapsedMs,
            state: raceState
        }));
    } catch (e) {}
}

function raceToggleExtraRunnerInputs() {
    const el = $('extraRunnerInputs');
    const label = $('toggleExtraInputsLabel');
    if (!el) return;
    const isOpen = el.style.display !== 'none';
    el.style.display = isOpen ? 'none' : 'block';
    if (label) {
        label.textContent = isOpen 
            ? 'Tampilkan Kolom Database (Blood Type, No. HP, Kontak Darurat, Email)' 
            : 'Sembunyikan Kolom Database';
    }
}

function raceAddRunnerFromForm() {
    const bib = ($('newBib') ? $('newBib').value : '').trim();
    const bibNameInput = ($('newBibName') ? $('newBibName').value : '').trim();
    const name = ($('newName') ? $('newName').value : '').trim();
    const gender = ($('newGender') ? $('newGender').value : 'L').trim().toUpperCase();
    const eventName = ($('newEvent') ? $('newEvent').value : '').trim() || raceTitle || 'Event Lomba Lari';
    const cat = ($('newCategory') ? $('newCategory').value : '5K').trim();
    const epc = ($('newEpc') ? $('newEpc').value : '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
    
    const bloodType = ($('newBloodType') ? $('newBloodType').value : '—').trim();
    const phone = ($('newPhone') ? $('newPhone').value : '').trim();
    const emergencyPhone = ($('newEmergency') ? $('newEmergency').value : '').trim();
    const email = ($('newEmail') ? $('newEmail').value : '').trim();

    if (!bib || !name) {
        toast('Nomor BIB dan Nama Peserta wajib diisi');
        return;
    }
    if (runners.some(r => r.bib === bib)) {
        toast('Nomor BIB sudah terdaftar');
        return;
    }

    let bibName = bibNameInput;
    if (!bibName) {
        const parts = name.split(/\s+/);
        if (parts.length >= 2) {
            bibName = `${parts[0].toUpperCase()} ${parts[1].charAt(0).toUpperCase()}.`;
        } else {
            bibName = name.toUpperCase();
        }
    }

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const registered = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    runners.push({
        id: epc || ('ID' + bib),
        bib: bib,
        bibName: bibName,
        name: name,
        gender: (gender === 'P' || gender === 'W' || gender === 'FEMALE') ? 'P' : 'L',
        event: eventName,
        category: cat,
        registered: registered,
        bloodType: bloodType || '—',
        phone: phone || '',
        emergencyPhone: emergencyPhone || '',
        email: email || '',
        epc: epc,
        status: 'REGISTERED',
        startChipTimeMs: 0,
        startChipTimeStr: '',
        finishChipTimeMs: 0,
        gunTimeMs: 0,
        gunTimeStr: '',
        chipTimeMs: 0,
        chipTimeStr: '',
        finishTimeMs: null,
        finishTimeStr: '',
        notes: '',
        rank: null
    });

    raceSaveRunners();
    raceRenderRunners();
    raceRenderRaceResults();
    raceUpdateStats();
    toast(`Peserta #${bib} - ${name} (${gender === 'P' ? 'Wanita' : 'Pria'}) berhasil ditambahkan`);

    if ($('newBib')) $('newBib').value = String(Number(bib) ? Number(bib) + 1 : '');
    if ($('newBibName')) $('newBibName').value = '';
    if ($('newName')) $('newName').value = '';
    if ($('newEpc')) $('newEpc').value = '';
    if ($('newPhone')) $('newPhone').value = '';
    if ($('newEmergency')) $('newEmergency').value = '';
    if ($('newEmail')) $('newEmail').value = '';
    if ($('newName')) $('newName').focus();
}

function raceOpenEditRunnerModal(bib) {
    const r = runners.find(x => x.bib === String(bib));
    if (!r) {
        toast('Data peserta tidak ditemukan');
        return;
    }
    const idx = runners.indexOf(r) + 1;

    if ($('editOriginalBib')) $('editOriginalBib').value = r.bib;
    if ($('editRunnerNo')) $('editRunnerNo').value = idx;
    if ($('editRunnerId')) $('editRunnerId').value = r.id || r.epc || ('ID' + r.bib);
    if ($('editRunnerBib')) $('editRunnerBib').value = r.bib;
    if ($('editRunnerBibName')) $('editRunnerBibName').value = r.bibName || '';
    if ($('editRunnerName')) $('editRunnerName').value = r.name || '';
    if ($('editRunnerGender')) $('editRunnerGender').value = (r.gender === 'P' || r.gender === 'W' || r.gender === 'FEMALE') ? 'P' : 'L';
    if ($('editRunnerEvent')) $('editRunnerEvent').value = r.event || raceTitle || 'Event Lomba Lari';
    if ($('editRunnerCategory')) $('editRunnerCategory').value = r.category || '5K';
    if ($('editRunnerRegistered')) $('editRunnerRegistered').value = r.registered || 'TERDAFTAR';
    if ($('editRunnerBloodType')) $('editRunnerBloodType').value = r.bloodType || '—';
    if ($('editRunnerPhone')) $('editRunnerPhone').value = r.phone || '';
    if ($('editRunnerEmergency')) $('editRunnerEmergency').value = r.emergencyPhone || '';
    if ($('editRunnerEmail')) $('editRunnerEmail').value = r.email || '';

    const modal = $('editRunnerModal');
    if (modal) modal.style.display = 'flex';
}

function raceCloseEditRunnerModal() {
    const modal = $('editRunnerModal');
    if (modal) modal.style.display = 'none';
}

function raceSaveEditRunnerModal() {
    const origBib = $('editOriginalBib') ? $('editOriginalBib').value : '';
    const r = runners.find(x => x.bib === origBib);
    if (!r) {
        toast('Data peserta tidak ditemukan');
        raceCloseEditRunnerModal();
        return;
    }

    const newBib = ($('editRunnerBib') ? $('editRunnerBib').value : '').trim();
    const newName = ($('editRunnerName') ? $('editRunnerName').value : '').trim();

    if (!newBib || !newName) {
        toast('Nomor BIB dan Nama Peserta wajib diisi');
        return;
    }

    if (newBib !== origBib && runners.some(x => x.bib === newBib)) {
        toast(`Nomor BIB ${newBib} sudah digunakan oleh peserta lain!`);
        return;
    }

    const newId = ($('editRunnerId') ? $('editRunnerId').value : '').trim();
    const newBibName = ($('editRunnerBibName') ? $('editRunnerBibName').value : '').trim();
    const newGender = ($('editRunnerGender') ? $('editRunnerGender').value : 'L').trim().toUpperCase();
    const newEvent = ($('editRunnerEvent') ? $('editRunnerEvent').value : '').trim();
    const newCategory = ($('editRunnerCategory') ? $('editRunnerCategory').value : '5K').trim();
    const newRegistered = ($('editRunnerRegistered') ? $('editRunnerRegistered').value : '').trim();
    const newBloodType = ($('editRunnerBloodType') ? $('editRunnerBloodType').value : '—').trim();
    const newPhone = ($('editRunnerPhone') ? $('editRunnerPhone').value : '').trim();
    const newEmergency = ($('editRunnerEmergency') ? $('editRunnerEmergency').value : '').trim();
    const newEmail = ($('editRunnerEmail') ? $('editRunnerEmail').value : '').trim();

    r.bib = newBib;
    r.id = newId || r.id || r.epc || ('ID' + newBib);
    r.bibName = newBibName || (newName ? newName.split(/\s+/)[0].toUpperCase() : '');
    r.name = newName;
    r.gender = (newGender === 'P' || newGender === 'W' || newGender === 'FEMALE') ? 'P' : 'L';
    r.event = newEvent || raceTitle || 'Event Lomba Lari';
    r.category = newCategory;
    r.registered = newRegistered || 'TERDAFTAR';
    r.bloodType = newBloodType || '—';
    r.phone = newPhone;
    r.emergencyPhone = newEmergency;
    r.email = newEmail;
    if (newId && !r.epc) {
        r.epc = newId.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
    }

    raceSaveRunners();
    raceRenderRunners();
    raceRenderLeaderboard();
    raceRenderRaceResults();
    raceCloseEditRunnerModal();
    toast(`✅ Data peserta BIB #${newBib} berhasil diperbarui (13 kolom tersimpan)!`);
}

function raceDeleteRunner(bib) {
    raceShowConfirmModal({
        icon: '🗑️',
        title: 'Hapus Peserta',
        message: `Apakah Anda yakin ingin menghapus data peserta dengan <b>BIB #${bib}</b>?`,
        btnText: '🗑️ Hapus Peserta',
        btnClass: 'danger',
        onConfirm: () => {
            runners = runners.filter(r => r.bib !== bib);
            finishers = finishers.filter(r => r.bib !== bib);
            finishers.forEach((r, idx) => r.rank = idx + 1);
            raceSaveRunners();
            raceRenderRunners();
            raceRenderLeaderboard();
            raceRenderRaceResults();
            raceUpdateStats();
            toast(`Peserta BIB #${bib} telah dihapus.`);
        }
    });
}

async function raceScanTagToForm() {
    toast('Membaca tag RFID untuk peserta...');
    try {
        await reader('/InventoryController/clearCacheTagAndIndex', {}, 4000);
        await reader('/InventoryController/startInventoryRequest', {
            type: 'Reader-startInventoryRequest',
            backgroundInventory: false,
            tagFilter: { tagMemoryBank: 'epc', bitOffset: 0, bitLength: 0, hexMask: null }
        }, 5000);

        const t0 = performance.now();
        let pick = null;
        while (performance.now() - t0 < 3000) {
            const d = await reader('/InventoryController/tagReportingDataAndIndex', {}, 3000);
            if (d && Array.isArray(d.data) && d.data.length > 0) {
                pick = d.data[0];
                break;
            }
            await new Promise(r => setTimeout(r, 50));
        }
        await reader('/InventoryController/stopInventoryRequest', { type: 'Reader-stopInventoryRequest' }, 4000);

        if (pick && pick.epcHex) {
            const clean = pick.epcHex.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
            if ($('newEpc')) $('newEpc').value = clean;
            racePlayBeep();
            toast('Tag terdeteksi: ' + clean.slice(-6));
        } else {
            toast('Tidak ada tag terdeteksi');
        }
    } catch (e) {
        toast('Gagal scan tag: ' + (e.message || ''));
    }
}

// ---------------------------------------------------------------------------
// Indonesian Name Dataset & 13-Column Generator
// ---------------------------------------------------------------------------
const INDO_MALE_FIRST_NAMES = [
    'Budi', 'Ahmad', 'Agus', 'Joko', 'Rian', 'Hendra', 'Eko', 'Rizky', 'Dimas', 'Bayu',
    'Fajar', 'Tri', 'Aditya', 'Wahyu', 'Doni', 'Rudi', 'Arif', 'Ilham', 'Farhan', 'Bagus',
    'Danang', 'Gilang', 'Kevin', 'Reza', 'Indra', 'Satria', 'Galih', 'Rio', 'Vicky', 'Anton'
];

const INDO_FEMALE_FIRST_NAMES = [
    'Siti', 'Dewi', 'Sri', 'Putri', 'Maya', 'Dian', 'Nurul', 'Rina', 'Ayu', 'Nanda',
    'Wulan', 'Anisa', 'Lestari', 'Mega', 'Tari', 'Ratna', 'Citra', 'Intan', 'Gita', 'Fitri',
    'Indah', 'Melati', 'Desi', 'Tiara', 'Anggi', 'Siska', 'Laras', 'Dini', 'Kartika', 'Zahra'
];

const INDO_LAST_NAMES = [
    'Santoso', 'Rahayu', 'Hidayat', 'Prasetyo', 'Lestari', 'Widodo', 'Pratama', 'Gunawan',
    'Wahyudi', 'Wahyuni', 'Nuraini', 'Ramadhan', 'Saputra', 'Nugroho', 'Sari', 'Nugraha',
    'Hartono', 'Kusuma', 'Setiawan', 'Kurniawan', 'Wibowo', 'Utami', 'Susanto', 'Firmansyah',
    'Permana', 'Maulida', 'Fauzi', 'Wijaya', 'Suryono', 'Anggraini', 'Syahputra', 'Purnomo',
    'Irawan', 'Simanjuntak', 'Subagyo', 'Maharani', 'Siregar', 'Nasution', 'Pamungkas', 'Hermawan'
];

const BLOOD_TYPES = ['A', 'B', 'AB', 'O'];

function raceGenerateRandomRunnerData(usedNames, forcedCategory, forcedEpc, bibNum) {
    const isMale = Math.random() >= 0.45;
    const firstList = isMale ? INDO_MALE_FIRST_NAMES : INDO_FEMALE_FIRST_NAMES;
    const gender = isMale ? 'L' : 'P';

    let first = firstList[Math.floor(Math.random() * firstList.length)];
    let last = INDO_LAST_NAMES[Math.floor(Math.random() * INDO_LAST_NAMES.length)];
    let fullName = `${first} ${last}`;

    if (usedNames) {
        let attempt = 0;
        while (usedNames.has(fullName) && attempt < 100) {
            first = firstList[Math.floor(Math.random() * firstList.length)];
            last = INDO_LAST_NAMES[Math.floor(Math.random() * INDO_LAST_NAMES.length)];
            fullName = `${first} ${last}`;
            attempt++;
        }
        usedNames.add(fullName);
    }

    const bibName = `${first.toUpperCase()} ${last.charAt(0).toUpperCase()}.`;
    const eventName = ($('raceTitleInput') && $('raceTitleInput').value.trim()) || raceTitle || 'Event Lomba Lari';
    const bloodType = BLOOD_TYPES[Math.floor(Math.random() * BLOOD_TYPES.length)];
    const phone = '081' + Math.floor(200000000 + Math.random() * 700000000);
    const emergencyPhone = '081' + Math.floor(200000000 + Math.random() * 700000000);
    const emailClean = (first + '.' + last).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const email = `${emailClean}${Math.floor(Math.random() * 89 + 10)}@gmail.com`;

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const registered = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    return {
        id: forcedEpc || ('TAG' + Math.floor(100000 + Math.random() * 900000)),
        bib: String(bibNum || 101),
        bibName: bibName,
        name: fullName,
        gender: gender,
        event: eventName,
        category: forcedCategory || '5K',
        registered: registered,
        bloodType: bloodType,
        phone: phone,
        emergencyPhone: emergencyPhone,
        email: email,
        epc: forcedEpc || '',
        status: 'REGISTERED',
        startChipTimeMs: 0,
        startChipTimeStr: '',
        finishChipTimeMs: 0,
        gunTimeMs: 0,
        gunTimeStr: '',
        chipTimeMs: 0,
        chipTimeStr: '',
        finishTimeMs: null,
        finishTimeStr: '',
        notes: '',
        rank: null
    };
}

// Bulk scan tags close to antenna (e.g. 95 tags) and auto-register as Indonesian runners
async function raceBulkScanAndGenerate() {
    toast('📡 Memulai Scan Massal Tag RFID di dekat antena... (6 detik)', 3000);
    const scannedEpcs = new Set();

    try {
        await reader('/InventoryController/clearCacheTagAndIndex', {}, 4000);
        await reader('/InventoryController/startInventoryRequest', {
            type: 'Reader-startInventoryRequest',
            backgroundInventory: false,
            tagFilter: { tagMemoryBank: 'epc', bitOffset: 0, bitLength: 0, hexMask: null }
        }, 8000);

        const t0 = performance.now();
        while (performance.now() - t0 < 6000) {
            const d = await reader('/InventoryController/tagReportingDataAndIndex', {}, 4000);
            if (d && Array.isArray(d.data)) {
                d.data.forEach(tag => {
                    const epc = (tag.epcHex || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
                    if (epc && epc.length >= 8) scannedEpcs.add(epc);
                });
            }
            await new Promise(r => setTimeout(r, 40));
        }
        await reader('/InventoryController/stopInventoryRequest', { type: 'Reader-stopInventoryRequest' }, 4000);
    } catch (e) {
        toast('Gagal memindai tag: ' + (e.message || ''));
        return;
    }

    if (!scannedEpcs.size) {
        toast('Tidak ada tag RFID yang terdeteksi. Pastikan tag berada di dekat antena.', 4000);
        return;
    }

    const count = raceRegisterEpcs(Array.from(scannedEpcs));
    toast(`✅ Sukses! ${count} peserta baru otomatis terdaftar lengkap dengan 13 kolom & Nama Indonesia.`, 4000);
}

// Import all tags from Box Map into Race Timing runners
function raceImportFromBoxMap() {
    let cells = {};
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/SystemController/boxMap', false);
        xhr.send(null);
        if (xhr.status === 200 && xhr.responseText) {
            const raw = JSON.parse(xhr.responseText);
            Object.keys(raw).forEach(k => {
                if (k !== '#archive' && raw[k]) cells[k] = raw[k];
            });
        }
    } catch (e) {}

    if (!Object.keys(cells).length) {
        try {
            const local = JSON.parse(localStorage.getItem('boxmap_v1') || '{}');
            Object.keys(local).forEach(k => {
                if (k !== '#archive' && local[k]) cells[k] = local[k];
            });
        } catch (e) {}
    }

    const epcs = Object.values(cells).map(e => (e || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase()).filter(e => e.length >= 8);
    const uniqueEpcs = Array.from(new Set(epcs));

    if (!uniqueEpcs.length) {
        toast('Peta Dus (Box Map) masih kosong. Silakan gunakan tombol Scan Massal.', 4000);
        return;
    }

    const count = raceRegisterEpcs(uniqueEpcs);
    toast(`✅ Berhasil mengimpor ${count} peserta dari Peta Dus!`, 4000);
}

// Import all tags from Raw Reads log table into registered runners
async function raceImportFromRawReads() {
    let epcs = [];

    if (rawReads && rawReads.length) {
        rawReads.forEach(r => {
            const clean = (r.epc || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
            if (clean.length >= 8) epcs.push(clean);
        });
    }

    if (!epcs.length) {
        try {
            const savedRaw = JSON.parse(localStorage.getItem(RACE_RAW_KEY) || '[]');
            savedRaw.forEach(r => {
                const clean = (r.epc || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
                if (clean.length >= 8) epcs.push(clean);
            });
        } catch (e) {}
    }

    if (!epcs.length) {
        try {
            const d = await reader('/InventoryController/tagReportingDataAndIndex', {}, 3000);
            if (d && Array.isArray(d.data)) {
                d.data.forEach(t => {
                    const clean = (t.epcHex || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
                    if (clean.length >= 8) {
                        epcs.push(clean);
                        rawReads.unshift({
                            id: rawReads.length + 1,
                            time: new Date().toLocaleTimeString(),
                            epc: clean,
                            tid: '—',
                            bib: '—',
                            eventName: raceTitle || 'Event Lomba Lari',
                            name: 'Tag Asing',
                            gender: '—',
                            category: '—',
                            station: 'Start/Finish Gate',
                            hubId: 'Hub-1 (Host ESP32)',
                            antenna: `Port ${t.antennaPort || 1}`,
                            rssi: t.rssi,
                            gate: '📡 TAG ASING'
                        });
                    }
                });
                if (rawReads.length > 500) rawReads.length = 500;
                raceSaveRawReads();
            }
        } catch (e) {}
    }

    const uniqueEpcs = Array.from(new Set(epcs));
    if (!uniqueEpcs.length) {
        toast('Tabel Race Data masih kosong. Silakan scan tag terlebih dahulu.', 4000);
        return;
    }

    const count = raceRegisterEpcs(uniqueEpcs);
    if (count > 0) {
        toast(`✅ Sukses! ${count} tag dari Race Data berhasil didaftarkan jadi peserta (13 Kolom & Nama Indonesia).`, 4500);
        raceSetTab('runners');
    } else {
        toast(`Semua (${uniqueEpcs.length}) tag di Race Data sudah terdaftar sebagai peserta sebelumnya.`, 3500);
        raceSetTab('runners');
    }
}

function raceClearRawReads() {
    if (!rawReads.length) {
        toast('Log Race Data sudah kosong');
        return;
    }
    if (!confirm('Bersihkan seluruh log transaksi pembacaan Race Data?')) return;
    rawReads = [];
    raceSaveRawReads();
    raceRenderRaceData();
    toast('Race Data berhasil dibersihkan');
}

function raceRegisterEpcs(epcList) {
    const existingEpcs = new Set(runners.map(r => (r.epc || r.id || '').toUpperCase()));
    const usedNames = new Set(runners.map(r => r.name));

    let nextBib = 101;
    runners.forEach(r => {
        const num = parseInt(r.bib, 10);
        if (!isNaN(num) && num >= nextBib) nextBib = num + 1;
    });

    let added = 0;
    const categories = raceGetCategories();

    epcList.forEach((epc, idx) => {
        if (existingEpcs.has(epc)) return;

        const cat = categories[idx % categories.length];
        const runnerObj = raceGenerateRandomRunnerData(usedNames, cat, epc, nextBib++);
        runners.push(runnerObj);

        existingEpcs.add(epc);
        added++;
    });

    rawReads.forEach(r => {
        const clean = (r.epc || '').toUpperCase();
        const match = runners.find(run => (run.epc || run.id || '').toUpperCase() === clean);
        if (match) {
            r.bib = match.bib;
            r.name = match.name;
            r.gender = match.gender || 'L';
            r.category = match.category || (categories[0] || '5K');
            r.eventName = match.event || raceTitle;
        }
    });

    raceSaveRunners();
    raceSaveRawReads();
    raceRenderRunners();
    raceRenderLeaderboard();
    raceRenderRaceResults();
    raceRenderRaceData();
    raceUpdateStats();
    return added;
}

function raceClearAllRunners() {
    if (!runners.length) {
        toast('Daftar peserta sudah kosong');
        return;
    }
    raceShowConfirmModal({
        icon: '🗑️',
        title: 'Hapus Seluruh Peserta',
        message: `Hapus seluruh <b>${runners.length} peserta</b> dan nomor BIB dari database?<br><br><span style="color:#b45309">Tindakan ini tidak dapat dibatalkan.</span>`,
        pin: '1234',
        pinHint: '💡 <i>Ketik PIN <b>1234</b> untuk konfirmasi hapus seluruh peserta.</i>',
        btnText: '🗑️ Hapus Semua Peserta',
        btnClass: 'danger',
        onConfirm: () => {
            runners = [];
            finishers = [];
            lastReadMap.clear();

            rawReads.forEach(r => {
                r.bib = '—';
                r.name = 'Tag Asing';
            });

            raceSaveRunners();
            raceSaveRawReads();
            raceRenderRunners();
            raceRenderLeaderboard();
            raceRenderRaceResults();
            raceRenderRaceData();
            raceRenderControlRecentBody();
            raceUpdateStats();
            toast('Daftar peserta berhasil dikosongkan.');
        }
    });
}

// ---------------------------------------------------------------------------
// 95-Tag Live Simulation Scenario (Antenna 1, 30 dBm, Auto Gate, Deadzone)
// ---------------------------------------------------------------------------
async function raceRunFullSimulationScenario95() {
    toast('🚀 Menyiapkan Simulasi 95 Tag (Antena 1, 30 dBm, Auto Gate, Deadzone)...', 3500);

    // 1. Setting Reader Hardware Power ke 30 dBm (Port 1 Power = 3000)
    try {
        if (typeof readerBaseSet === 'function') {
            await readerBaseSet({
                antennaPower: [
                    { antennaPort: 1, power: 3000 },
                    { antennaPort: 2, power: 3000 },
                    { antennaPort: 3, power: 3000 },
                    { antennaPort: 4, power: 3000 },
                    { antennaPort: 5, power: 3000 },
                    { antennaPort: 6, power: 3000 },
                    { antennaPort: 7, power: 3000 },
                    { antennaPort: 8, power: 3000 }
                ]
            });
        }
    } catch (e) {}

    // 2. Setting Event & Parameters
    raceTitle = 'Simulasi Lomba Lari 95 Tag (30 dBm)';
    if ($('raceTitleInput')) $('raceTitleInput').value = raceTitle;
    raceSyncEventTitle();
    raceSaveState();

    // 3. Station Start & Finish di tempat yang sama (Gate Mode: 'auto')
    raceSetGateMode('auto');

    // 4. Fungsikan Dead Zone & Pre-Race Lock
    raceDeadZoneSettings.preRaceLock = true;
    raceDeadZoneConfig['5K'] = 12 * 60 * 1000;   // 12 Menit
    raceDeadZoneConfig['10K'] = 25 * 60 * 1000;  // 25 Menit
    raceDeadZoneConfig['21K'] = 50 * 60 * 1000;  // 50 Menit
    raceDeadZoneConfig['42K'] = 120 * 60 * 1000; // 120 Menit (2 Jam)
    raceDeadZoneConfig['Master'] = 15 * 60 * 1000; // 15 Menit
    raceDeadZoneConfig['DEFAULT'] = 10 * 60 * 1000;
    raceSaveDeadZoneConfig();

    // 5. Batas Cut Off Time (COT)
    raceCotConfig['5K'] = 60 * 60 * 1000;       // 01:00:00 (1 Jam)
    raceCotConfig['10K'] = 120 * 60 * 1000;     // 02:00:00 (2 Jam)
    raceCotConfig['21K'] = 210 * 60 * 1000;     // 03:30:00 (3 Jam 30 Menit)
    raceCotConfig['42K'] = 390 * 60 * 1000;     // 06:30:00 (6 Jam 30 Menit)
    raceCotConfig['Master'] = 90 * 60 * 1000;   // 01:30:00 (1 Jam 30 Menit)
    raceSaveCotConfig();

    // 6. Reset database lama
    runners = [];
    finishers = [];
    rawReads = [];
    lastReadMap.clear();

    // 7. Generate 95 Peserta Lengkap Acak Seluruh Kategori
    const categoryDistribution = [
        { cat: '5K', count: 25, minSec: 18 * 60, maxSec: 42 * 60, cotSec: 60 * 60 },
        { cat: '10K', count: 25, minSec: 38 * 60, maxSec: 75 * 60, cotSec: 120 * 60 },
        { cat: '21K', count: 20, minSec: 85 * 60, maxSec: 135 * 60, cotSec: 210 * 60 },
        { cat: '42K', count: 15, minSec: 175 * 60, maxSec: 285 * 60, cotSec: 390 * 60 },
        { cat: 'Master', count: 10, minSec: 22 * 60, maxSec: 48 * 60, cotSec: 90 * 60 }
    ];

    const usedNames = new Set();
    let currentBib = 101;
    const allGenRunners = [];

    // Base Simulation Anchor Time (06:00:00 WIB)
    const baseDate = new Date();
    baseDate.setHours(6, 0, 0, 0);
    const baseStartMs = baseDate.getTime();

    // Category Wave Start Times (dengan selisih bertahap per wave)
    const catWaveStarts = {
        '42K': baseStartMs,                       // 06:00:00
        '21K': baseStartMs + (15 * 60 * 1000),    // 06:15:00
        '10K': baseStartMs + (30 * 60 * 1000),    // 06:30:00
        '5K': baseStartMs + (45 * 60 * 1000),     // 06:45:00
        'Master': baseStartMs + (60 * 60 * 1000)  // 07:00:00
    };

    Object.keys(catWaveStarts).forEach(cat => {
        const w = raceEnsureCategoryWave(cat);
        w.state = 'RUNNING';
        w.gunStart = catWaveStarts[cat];
        w.gunStartStr = new Date(catWaveStarts[cat]).toLocaleTimeString();
        w.scheduleStr = w.gunStartStr;
        w.startedManually = true;
    });
    raceSaveWaves();

    // 8. Buat 95 data peserta dan hitung waktu finishnya
    categoryDistribution.forEach(group => {
        for (let i = 0; i < group.count; i++) {
            const epcHex = `E2801170000002000000${String(currentBib).padStart(4, '0')}`;
            const runner = raceGenerateRandomRunnerData(usedNames, group.cat, epcHex, currentBib++);
            
            const waveGunStart = catWaveStarts[group.cat];
            const chipStartDelaySec = Math.floor(2 + Math.random() * 24); // 2s - 26s setelah gun
            const chipStartMs = waveGunStart + (chipStartDelaySec * 1000);

            // Gross time & Net time (beberapa pelari dibuat over cot untuk variasi realistik)
            const isOverCot = (i === group.count - 1 && group.cat !== '42K');
            let runDurationSec = isOverCot 
                ? (group.cotSec + Math.floor(120 + Math.random() * 300))
                : (group.minSec + Math.floor(Math.random() * (group.maxSec - group.minSec)));

            const chipFinishMs = chipStartMs + (runDurationSec * 1000);
            const gunDurationMs = chipFinishMs - waveGunStart;
            const chipDurationMs = chipFinishMs - chipStartMs;

            runner.categoryGunStartStr = new Date(waveGunStart).toLocaleTimeString();
            runner.startChipTimeMs = chipStartMs;
            runner.startChipTimeStr = new Date(chipStartMs).toLocaleTimeString();
            runner.finishChipTimeMs = chipFinishMs;
            runner.finishChipTimeStr = new Date(chipFinishMs).toLocaleTimeString();
            runner.gunFinishStr = runner.finishChipTimeStr;
            runner.gunTimeMs = gunDurationMs;
            runner.gunTimeStr = raceFormatTime(gunDurationMs);
            runner.chipTimeMs = chipDurationMs;
            runner.chipTimeStr = raceFormatTime(chipDurationMs);
            runner.finishTimeMs = gunDurationMs;
            runner.finishTimeStr = runner.gunTimeStr;
            runner.status = isOverCot ? 'OVER_COT' : 'FINISHED';
            runner.notes = isOverCot ? 'Melewati Batas COT' : 'Finish Sah (Garis Sama)';

            allGenRunners.push(runner);
        }
    });

    // 9. Urutkan rank finisher berdasarkan Gun Time
    runners = allGenRunners;
    finishers = runners.filter(r => r.status === 'FINISHED' || r.status === 'OVER_COT')
                       .sort((a, b) => (a.finishTimeMs || 0) - (b.finishTimeMs || 0));
    finishers.forEach((r, idx) => {
        r.rank = idx + 1;
    });

    // 10. Generate Log Transaksi RFID Mentah (Race Data) - Menunjukkan Pre-Race Lock & Dead Zone Filter
    rawReads = [];
    let logSeq = 1;

    // A. Simulasi 8 Tag Pra-Lomba yang ditolak oleh Kunci Pra-Lomba (Pre-Race Wave Lock)
    for (let p = 0; p < 8; p++) {
        const sampleRunner = runners[p * 10];
        const preTime = new Date(baseStartMs - (12 * 60 * 1000) + (p * 45 * 1000));
        rawReads.push({
            id: logSeq++,
            time: preTime.toLocaleTimeString(),
            epc: sampleRunner.epc,
            tid: '—',
            bib: sampleRunner.bib,
            eventName: raceTitle,
            name: sampleRunner.name,
            gender: sampleRunner.gender,
            category: sampleRunner.category,
            station: 'Start/Finish Gate',
            hubId: 'Hub-1 (Host ESP32)',
            antenna: 'Port 1 (30 dBm)',
            rssi: -48 - Math.floor(Math.random() * 12),
            gate: '🛡️ DITOLAK (PRE-RACE LOCK)'
        });
    }

    // B. Log Pembacaan START 95 Tag di Antena 1
    runners.forEach(r => {
        rawReads.push({
            id: logSeq++,
            time: r.startChipTimeStr,
            epc: r.epc,
            tid: '—',
            bib: r.bib,
            eventName: raceTitle,
            name: r.name,
            gender: r.gender,
            category: r.category,
            station: 'Start Gate',
            hubId: 'Hub-1 (Host ESP32)',
            antenna: 'Port 1 (30 dBm)',
            rssi: -42 - Math.floor(Math.random() * 10),
            gate: '🟢 CHIP TIME START'
        });
    });

    // C. Simulasi 6 Tag yang terbaca di Antena 1 saat Dead Zone berjalan (Ditolak / Diabaikan oleh Dead Zone)
    for (let d = 0; d < 6; d++) {
        const sampleRunner = runners[d * 15 + 2];
        const dzTime = new Date(sampleRunner.startChipTimeMs + (3 * 60 * 1000) + (d * 30 * 1000));
        rawReads.push({
            id: logSeq++,
            time: dzTime.toLocaleTimeString(),
            epc: sampleRunner.epc,
            tid: '—',
            bib: sampleRunner.bib,
            eventName: raceTitle,
            name: sampleRunner.name,
            gender: sampleRunner.gender,
            category: sampleRunner.category,
            station: 'Start/Finish Gate',
            hubId: 'Hub-1 (Host ESP32)',
            antenna: 'Port 1 (30 dBm)',
            rssi: -45 - Math.floor(Math.random() * 8),
            gate: '🛡️ DITOLAK (DEAD ZONE BLIND)'
        });
    }

    // D. Log Pembacaan FINISH 95 Tag di Antena 1
    runners.forEach(r => {
        rawReads.push({
            id: logSeq++,
            time: r.finishChipTimeStr,
            epc: r.epc,
            tid: '—',
            bib: r.bib,
            eventName: raceTitle,
            name: r.name,
            gender: r.gender,
            category: r.category,
            station: 'Finish Gate',
            hubId: 'Hub-1 (Host ESP32)',
            antenna: 'Port 1 (30 dBm)',
            rssi: -38 - Math.floor(Math.random() * 12),
            gate: '🏁 FINISH GATE INGEST'
        });
    });

    // Sort Raw Reads chronologically
    rawReads.sort((a, b) => (a.id || 0) - (b.id || 0));

    // 11. Simpan Seluruh State ke LocalStorage
    gunStartTime = baseStartMs;
    raceElapsedMs = 4 * 3600 * 1000;
    raceState = 'RUNNING';

    raceSaveRunners();
    raceSaveRawReads();
    raceSaveState();

    // 12. Render Semua Panel & UI
    raceLoadCategories();
    racePopulateCategorySelects();
    raceUpdateControls();
    raceUpdateStats();
    raceUpdateCotDisplay();
    raceRenderWavePills();
    raceUpdateDeadZoneSummaryBadge();
    raceUpdateReaderStatusBadges();
    raceRenderRunners();
    raceRenderLeaderboard();
    raceRenderRaceResults();
    raceRenderRaceData();
    raceRenderControlRecentBody();
    raceSetTab('leaderboard');

    toast('🎉 SIMULASI SELESAI! 95 Peserta berhasil diproses di Antena 1 (30 dBm) dengan proteksi Dead Zone & Pre-Race Lock.', 6000);
}

// ---------------------------------------------------------------------------
// Category Master Management & CRUD Functions (Tambah, Edit, Hapus Kategori)
// ---------------------------------------------------------------------------
const RACE_CATEGORIES_KEY = 'tagmgr_race_categories_v2';
const DEFAULT_CATEGORIES_LIST = [
    { name: '5K', cotStr: '01:00:00', deadZoneMin: 12, scheduleStr: '06:00:00', desc: '5 Kilometer' },
    { name: '10K', cotStr: '02:00:00', deadZoneMin: 25, scheduleStr: '06:15:00', desc: '10 Kilometer' },
    { name: '21K', cotStr: '03:30:00', deadZoneMin: 50, scheduleStr: '05:30:00', desc: 'Half Marathon' },
    { name: '42K', cotStr: '06:30:00', deadZoneMin: 120, scheduleStr: '05:00:00', desc: 'Full Marathon' },
    { name: 'Master', cotStr: '01:30:00', deadZoneMin: 15, scheduleStr: '', desc: 'Kategori Master' }
];
let raceCategoriesList = [];

function raceLoadCategories() {
    try {
        const raw = localStorage.getItem(RACE_CATEGORIES_KEY);
        if (raw) {
            raceCategoriesList = JSON.parse(raw);
        }
    } catch (e) {}

    if (!Array.isArray(raceCategoriesList) || !raceCategoriesList.length) {
        raceCategoriesList = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES_LIST));
    }

    // Auto-discover any category from registered runners
    const existingNames = new Set(raceCategoriesList.map(c => (c.name || '').toUpperCase()));
    runners.forEach(r => {
        const cat = (r.category || '').trim();
        if (cat && !existingNames.has(cat.toUpperCase())) {
            raceCategoriesList.push({
                name: cat,
                cotStr: '01:00:00',
                deadZoneMin: 10,
                scheduleStr: '',
                desc: ''
            });
            existingNames.add(cat.toUpperCase());
        }
    });

    // Synchronize configs
    raceCategoriesList.forEach(c => {
        const key = c.name.toUpperCase();
        if (c.cotStr && !raceCotConfig[key]) raceCotConfig[key] = raceParseCotStr(c.cotStr);
        if (c.deadZoneMin && !raceDeadZoneConfig[key]) raceDeadZoneConfig[key] = (parseInt(c.deadZoneMin, 10) || 10) * 60 * 1000;
        const wave = raceEnsureCategoryWave(c.name);
        if (c.scheduleStr && !wave.scheduleStr) wave.scheduleStr = c.scheduleStr;
    });

    raceSaveCategories();
}

function raceSaveCategories() {
    try {
        localStorage.setItem(RACE_CATEGORIES_KEY, JSON.stringify(raceCategoriesList));
    } catch (e) {}

    // Synchronize configs
    raceCategoriesList.forEach(c => {
        const key = c.name.toUpperCase();
        if (c.cotStr) raceCotConfig[key] = raceParseCotStr(c.cotStr);
        if (c.deadZoneMin) raceDeadZoneConfig[key] = (parseInt(c.deadZoneMin, 10) || 10) * 60 * 1000;
        const wave = raceEnsureCategoryWave(c.name);
        if (c.scheduleStr) wave.scheduleStr = c.scheduleStr;
    });

    raceSaveCotConfig();
    raceSaveDeadZoneConfig();
    raceSaveWaves();
}

function raceGetCategories() {
    if (!raceCategoriesList || !raceCategoriesList.length) {
        return ['5K', '10K', '21K', '42K', 'Master'];
    }
    return raceCategoriesList.map(c => c.name);
}

function racePopulateCategorySelects() {
    const cats = raceGetCategories();

    // 1. Tambah Peserta (<select id="newCategory">)
    const newCatSelect = $('newCategory');
    if (newCatSelect) {
        const curVal = newCatSelect.value;
        newCatSelect.innerHTML = cats.map(c => `<option value="${c}" ${c === curVal ? 'selected' : ''}>${c}</option>`).join('');
        if (!cats.includes(curVal) && cats.length > 0) newCatSelect.value = cats[0];
    }

    // 2. Edit Peserta (<select id="editRunnerCategory">)
    const editCatSelect = $('editRunnerCategory');
    if (editCatSelect) {
        const curVal = editCatSelect.value;
        editCatSelect.innerHTML = cats.map(c => `<option value="${c}" ${c === curVal ? 'selected' : ''}>${c}</option>`).join('');
        if (curVal && cats.includes(curVal)) editCatSelect.value = curVal;
    }

    // 3. Filter Race Result (<select id="resultCategoryFilter">)
    const resCatSelect = $('resultCategoryFilter');
    if (resCatSelect) {
        const curVal = resCatSelect.value || 'ALL';
        let html = '<option value="ALL">Semua Kategori</option>';
        cats.forEach(c => {
            html += `<option value="${c}" ${c === curVal ? 'selected' : ''}>${c}</option>`;
        });
        resCatSelect.innerHTML = html;
        if (curVal !== 'ALL' && cats.includes(curVal)) resCatSelect.value = curVal;
        else resCatSelect.value = 'ALL';
    }
}

function raceOpenCategoryModal() {
    raceSetTab('categories');
}

function raceCloseCategoryModal() {
    racePopulateCategorySelects();
    raceRenderCategoryFilters();
    raceRenderWavePills();
    raceUpdateCotDisplay();
    raceUpdateDeadZoneSummaryBadge();
    raceRenderLeaderboard();
    raceRenderRaceResults();
}

function raceRenderCategoryTable() {
    const bodies = [$('categoryTableBody'), $('categoryPanelTableBody')].filter(Boolean);
    const summaries = [$('catTotalSummary'), $('catTotalSummaryPanel')].filter(Boolean);
    if (!bodies.length) return;

    summaries.forEach(s => s.textContent = `Total: ${raceCategoriesList.length} Kategori`);

    if (!raceCategoriesList.length) {
        bodies.forEach(b => b.innerHTML = `<tr><td colspan="7" class="empty">Belum ada kategori. Silakan tambah kategori baru di atas.</td></tr>`);
        return;
    }

    const runnerCountByCat = {};
    runners.forEach(r => {
        const cat = (r.category || '').toUpperCase();
        runnerCountByCat[cat] = (runnerCountByCat[cat] || 0) + 1;
    });

    const html = raceCategoriesList.map((cat, idx) => {
        const count = runnerCountByCat[cat.name.toUpperCase()] || 0;
        const wave = categoryWaves[cat.name.toUpperCase()];
        const schedStr = (wave && wave.scheduleStr) ? wave.scheduleStr : (cat.scheduleStr || '—');
        const cotStr = cat.cotStr || raceFormatCotStr(raceGetCotForCategory(cat.name));
        const dzMin = cat.deadZoneMin || raceFormatDeadZoneMinutes(raceGetDeadZoneForCategory(cat.name));

        return `
            <tr>
                <td style="text-align:center;font-size:11px;color:#64748b">${idx + 1}</td>
                <td>
                    <span class="cat_badge font_bold" style="font-size:12px">${cat.name}</span>
                    ${cat.desc ? `<div style="font-size:10.5px;color:#64748b">${cat.desc}</div>` : ''}
                </td>
                <td class="mono font_bold" style="text-align:center;color:#1e293b">${cotStr}</td>
                <td class="mono" style="text-align:center">${dzMin} Menit</td>
                <td class="mono" style="text-align:center;color:#0369a1">${schedStr !== '—' ? `⏰ ${schedStr}` : '—'}</td>
                <td style="text-align:center">
                    <span class="pill_count font_bold" style="font-size:11px">${count} Pelari</span>
                </td>
                <td style="text-align:center">
                    <div style="display:flex;gap:4px;justify-content:center">
                        <button type="button" class="style_fieldset_div_button btn_tool font_bold" style="height:24px;font-size:11px;padding:0 7px"
                                onclick="raceEditCategory('${cat.name}')" title="Edit Kategori">✏️ Edit</button>
                        <button type="button" class="style_fieldset_div_button btn_tool btn_danger_sm" style="height:24px;font-size:11px;padding:0 6px"
                                onclick="raceDeleteCategory('${cat.name}')" title="Hapus Kategori">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    bodies.forEach(b => b.innerHTML = html);
}

function raceEditCategory(name) {
    const cat = raceCategoriesList.find(c => c.name.toUpperCase() === name.toUpperCase());
    if (!cat) return;

    ['', 'Panel'].forEach(sfx => {
        if ($('catFormMode' + sfx)) $('catFormMode' + sfx).value = 'EDIT';
        if ($('catFormOriginalName' + sfx)) $('catFormOriginalName' + sfx).value = cat.name;
        if ($('categoryFormTitle' + sfx)) $('categoryFormTitle' + sfx).innerHTML = `✏️ Edit Kategori: <span style="color:#d97706">${cat.name}</span>`;
        if ($('btnSaveCategory' + sfx)) $('btnSaveCategory' + sfx).textContent = '💾 Simpan Perubahan';
        if ($('btnCancelCategoryEdit' + sfx)) $('btnCancelCategoryEdit' + sfx).style.display = 'inline-block';

        if ($('catInputName' + sfx)) $('catInputName' + sfx).value = cat.name;
        if ($('catInputCot' + sfx)) $('catInputCot' + sfx).value = cat.cotStr || raceFormatCotStr(raceGetCotForCategory(cat.name));
        if ($('catInputDeadZone' + sfx)) $('catInputDeadZone' + sfx).value = cat.deadZoneMin || raceFormatDeadZoneMinutes(raceGetDeadZoneForCategory(cat.name));
        const wave = categoryWaves[cat.name.toUpperCase()];
        if ($('catInputSchedule' + sfx)) $('catInputSchedule' + sfx).value = (wave && wave.scheduleStr) ? wave.scheduleStr : (cat.scheduleStr || '');
        if ($('catInputDesc' + sfx)) $('catInputDesc' + sfx).value = cat.desc || '';
    });

    if ($('catInputNamePanel')) $('catInputNamePanel').focus();
    else if ($('catInputName')) $('catInputName').focus();
}

function raceResetCategoryForm() {
    ['', 'Panel'].forEach(sfx => {
        if ($('catFormMode' + sfx)) $('catFormMode' + sfx).value = 'ADD';
        if ($('catFormOriginalName' + sfx)) $('catFormOriginalName' + sfx).value = '';
        if ($('categoryFormTitle' + sfx)) $('categoryFormTitle' + sfx).innerHTML = '+ Tambah Kategori Baru';
        if ($('btnSaveCategory' + sfx)) $('btnSaveCategory' + sfx).textContent = '💾 Simpan Kategori';
        if ($('btnCancelCategoryEdit' + sfx)) $('btnCancelCategoryEdit' + sfx).style.display = 'none';

        if ($('catInputName' + sfx)) $('catInputName' + sfx).value = '';
        if ($('catInputCot' + sfx)) $('catInputCot' + sfx).value = '01:00:00';
        if ($('catInputDeadZone' + sfx)) $('catInputDeadZone' + sfx).value = '10';
        if ($('catInputSchedule' + sfx)) $('catInputSchedule' + sfx).value = '';
        if ($('catInputDesc' + sfx)) $('catInputDesc' + sfx).value = '';
    });
}
function raceResetCategoryFormPanel() { raceResetCategoryForm(); }

function raceSaveCategoryForm(isPanel = false) {
    const sfx = (isPanel || ($('catInputNamePanel') && $('catInputNamePanel').value)) ? 'Panel' : '';
    const mode = ($('catFormMode' + sfx) ? $('catFormMode' + sfx).value : 'ADD');
    const origName = ($('catFormOriginalName' + sfx) ? $('catFormOriginalName' + sfx).value : '').trim();
    const name = ($('catInputName' + sfx) ? $('catInputName' + sfx).value : '').trim();
    let cotStr = ($('catInputCot' + sfx) ? $('catInputCot' + sfx).value : '01:00:00').trim();
    const dzMin = parseInt($('catInputDeadZone' + sfx) ? $('catInputDeadZone' + sfx).value : '10', 10) || 10;
    const scheduleStr = ($('catInputSchedule' + sfx) ? $('catInputSchedule' + sfx).value : '').trim();
    const desc = ($('catInputDesc' + sfx) ? $('catInputDesc' + sfx).value : '').trim();

    if (!name) {
        toast('Nama Kategori wajib diisi');
        if ($('catInputName' + sfx)) $('catInputName' + sfx).focus();
        return;
    }

    if (!cotStr.includes(':')) cotStr = '01:00:00';

    if (mode === 'ADD') {
        const exists = raceCategoriesList.some(c => c.name.toUpperCase() === name.toUpperCase());
        if (exists) {
            toast(`Kategori "${name}" sudah ada!`);
            return;
        }

        const newCat = {
            name: name,
            cotStr: cotStr,
            deadZoneMin: dzMin,
            scheduleStr: scheduleStr,
            desc: desc
        };
        raceCategoriesList.push(newCat);

        raceSaveCategories();
        racePopulateCategorySelects();
        raceResetCategoryForm();
        raceRenderCategoryTable();
        raceRenderCategoryFilters();
        raceRenderWavePills();
        raceUpdateCotDisplay();
        raceUpdateDeadZoneSummaryBadge();
        toast(`✅ Kategori "${name}" berhasil ditambahkan!`);
    } else {
        // Mode EDIT
        const cat = raceCategoriesList.find(c => c.name.toUpperCase() === origName.toUpperCase());
        if (!cat) {
            toast('Kategori tidak ditemukan');
            raceResetCategoryForm();
            return;
        }

        if (name.toUpperCase() !== origName.toUpperCase()) {
            const exists = raceCategoriesList.some(c => c.name.toUpperCase() === name.toUpperCase());
            if (exists) {
                toast(`Nama kategori "${name}" sudah ada! Gunakan nama lain.`);
                return;
            }

            // RENAME across entire system!
            let updatedRunnerCount = 0;
            runners.forEach(r => {
                if ((r.category || '').toUpperCase() === origName.toUpperCase()) {
                    r.category = name;
                    updatedRunnerCount++;
                }
            });

            rawReads.forEach(r => {
                if ((r.category || '').toUpperCase() === origName.toUpperCase()) {
                    r.category = name;
                }
            });

            // Migrate wave state if exists
            const origWaveKey = origName.toUpperCase();
            const newWaveKey = name.toUpperCase();
            if (categoryWaves[origWaveKey]) {
                categoryWaves[newWaveKey] = categoryWaves[origWaveKey];
                delete categoryWaves[origWaveKey];
            }

            // Migrate COT and Dead Zone configs
            if (raceCotConfig[origWaveKey]) {
                raceCotConfig[newWaveKey] = raceCotConfig[origWaveKey];
                delete raceCotConfig[origWaveKey];
            }
            if (raceDeadZoneConfig[origWaveKey]) {
                raceDeadZoneConfig[newWaveKey] = raceDeadZoneConfig[origWaveKey];
                delete raceDeadZoneConfig[origWaveKey];
            }

            if (selectedCategory.toUpperCase() === origWaveKey) selectedCategory = name;
            if (selectedRunnerCategory.toUpperCase() === origWaveKey) selectedRunnerCategory = name;

            raceSaveRunners();
            raceSaveRawReads();
        }

        cat.name = name;
        cat.cotStr = cotStr;
        cat.deadZoneMin = dzMin;
        cat.scheduleStr = scheduleStr;
        cat.desc = desc;

        raceSaveCategories();
        racePopulateCategorySelects();
        raceResetCategoryForm();
        raceRenderCategoryTable();
        raceRenderCategoryFilters();
        raceRenderWavePills();
        raceUpdateCotDisplay();
        raceUpdateDeadZoneSummaryBadge();
        raceRenderRunners();
        raceRenderLeaderboard();
        raceRenderRaceResults();
        raceRenderRaceData();
        toast(`✅ Kategori "${name}" berhasil diperbarui!`);
    }
}
function raceSaveCategoryFormPanel() { raceSaveCategoryForm(true); }

function raceDeleteCategory(name) {
    const origKey = name.toUpperCase();
    const count = runners.filter(r => (r.category || '').toUpperCase() === origKey).length;

    let fallbackCat = '5K';
    const remaining = raceCategoriesList.filter(c => c.name.toUpperCase() !== origKey);
    if (remaining.length) fallbackCat = remaining[0].name;

    if (count > 0) {
        if (!confirm(`Kategori "${name}" memiliki ${count} peserta terdaftar.\n\nHapus kategori ini? Seluruh peserta (${count} orang) akan dialihkan ke kategori "${fallbackCat}".`)) {
            return;
        }
        runners.forEach(r => {
            if ((r.category || '').toUpperCase() === origKey) {
                r.category = fallbackCat;
            }
        });
        raceSaveRunners();
        raceRenderRunners();
    } else {
        if (!confirm(`Hapus kategori "${name}"?`)) return;
    }

    raceCategoriesList = raceCategoriesList.filter(c => c.name.toUpperCase() !== origKey);
    if (!raceCategoriesList.length) {
        raceCategoriesList = [{ name: '5K', cotStr: '01:00:00', deadZoneMin: 10, scheduleStr: '', desc: '' }];
    }

    delete categoryWaves[origKey];
    delete raceCotConfig[origKey];
    delete raceDeadZoneConfig[origKey];

    if (selectedCategory.toUpperCase() === origKey) selectedCategory = 'ALL';
    if (selectedRunnerCategory.toUpperCase() === origKey) selectedRunnerCategory = 'ALL';

    raceSaveCategories();
    racePopulateCategorySelects();
    raceResetCategoryForm();
    raceRenderCategoryTable();
    raceRenderCategoryFilters();
    raceRenderWavePills();
    raceUpdateCotDisplay();
    raceUpdateDeadZoneSummaryBadge();
    raceRenderLeaderboard();
    raceRenderRaceResults();
    toast(`Kategori "${name}" berhasil dihapus.`);
}

function raceSetLeaderboardCategory(cat) {
    selectedCategory = cat;
    raceRenderCategoryFilters();
    raceRenderLeaderboard();
}

function raceSetRunnerCategory(cat) {
    selectedRunnerCategory = cat;
    raceRenderCategoryFilters();
    raceRenderRunners();
}

function raceRenderCategoryFilters() {
    const categories = raceGetCategories();

    // 1. Leaderboard Filter Bar
    const lbWrap = $('leaderboardCatFilterWrap');
    if (lbWrap) {
        let html = `
            <button type="button" class="cat_filter_btn ${selectedCategory === 'ALL' ? 'active' : ''}"
                    onclick="raceSetLeaderboardCategory('ALL')">
                🏆 Semua
                <span class="pill_count">${finishers.length}</span>
            </button>
        `;
        categories.forEach(cat => {
            const count = finishers.filter(r => (r.category || '').toUpperCase() === cat.toUpperCase()).length;
            html += `
                <button type="button" class="cat_filter_btn ${selectedCategory.toUpperCase() === cat.toUpperCase() ? 'active' : ''}"
                        onclick="raceSetLeaderboardCategory('${cat}')">
                    🏃 ${cat}
                    <span class="pill_count">${count}</span>
                </button>
            `;
        });
        lbWrap.innerHTML = html;
    }

    // 2. Runners Filter Bar
    const runWrap = $('runnersCatFilterWrap');
    if (runWrap) {
        let html = `
            <button type="button" class="cat_filter_btn ${selectedRunnerCategory === 'ALL' ? 'active' : ''}"
                    onclick="raceSetRunnerCategory('ALL')">
                👥 Semua Peserta
                <span class="pill_count">${runners.length}</span>
            </button>
        `;
        categories.forEach(cat => {
            const count = runners.filter(r => (r.category || '').toUpperCase() === cat.toUpperCase()).length;
            html += `
                <button type="button" class="cat_filter_btn ${selectedRunnerCategory.toUpperCase() === cat.toUpperCase() ? 'active' : ''}"
                        onclick="raceSetRunnerCategory('${cat}')">
                    ${cat}
                    <span class="pill_count">${count}</span>
                </button>
            `;
        });
        runWrap.innerHTML = html;
    }
}

// ---------------------------------------------------------------------------
// Render Tables & UI (10 Tabs: Control, Leaderboard, Results, Runners, Race Data, Gun Time, COT, Gate, Dead Zone, Categories)
// ---------------------------------------------------------------------------
function raceSetTab(tab) {
    if (tab === 'raw') tab = 'racedata';
    activeTab = tab;
    sessionStorage.setItem('race_active_tab', tab);
    const allTabs = ['control', 'leaderboard', 'results', 'runners', 'racedata', 'guntime', 'cot', 'gate', 'deadzone', 'categories'];
    allTabs.forEach(t => {
        const btn = $('tabBtn_' + t);
        const panel = $('tabPanel_' + t);
        if (btn) btn.classList.toggle('active', t === tab);
        if (panel) panel.style.display = (t === tab) ? '' : 'none';
    });

    if (tab === 'control') raceRenderControlPanel();
    else if (tab === 'leaderboard') raceRenderLeaderboard();
    else if (tab === 'results') raceRenderRaceResults();
    else if (tab === 'runners') raceRenderRunners();
    else if (tab === 'racedata') raceRenderRaceData();
    else if (tab === 'guntime') raceRenderGunTimePanel();
    else if (tab === 'cot') raceRenderCotPanel();
    else if (tab === 'gate') raceRenderGatePanel();
    else if (tab === 'deadzone') raceRenderDeadZonePanel();
    else if (tab === 'categories') raceRenderCategoriesPanel();
}

function raceRenderControlPanel() {
    raceSyncEventTitle();
    raceUpdateClock();
    raceUpdateControls();
    raceUpdateStats();
    raceRenderWavePills();
    raceUpdateCotDisplay();
    raceUpdateDeadZoneSummaryBadge();
    raceUpdateReaderStatusBadges();
    raceRenderControlRecentBody();
}

function raceSetControlFeedFilter(filter) {
    controlFeedFilter = filter;
    ['ALL', 'FINISH', 'START', 'UNREG'].forEach(f => {
        const btn = $('feedFilter_' + f);
        if (btn) btn.classList.toggle('active', f === filter);
    });
    raceRenderControlRecentBody();
}

function raceToggleAutoRegister(checked) {
    autoRegisterUnregistered = !!checked;
    try {
        localStorage.setItem('tagmgr_race_autoreg_v1', autoRegisterUnregistered ? '1' : '0');
    } catch (e) {}
    toast(autoRegisterUnregistered 
        ? '✅ Auto-Daftar Tag Baru Aktif: Tag baru otomatis diberi nomor BIB saat terbaca di garis start' 
        : 'ℹ️ Auto-Daftar Nonaktif: Hanya tag yang terdaftar yang diproses', 3500);
}

function raceConvertUnregTagToRunner(epc) {
    if (!epc) return;
    const existing = runners.find(r => (r.epc || r.id || '').toUpperCase() === epc.toUpperCase());
    if (existing) {
        toast(`Tag ini sudah terdaftar sebagai BIB #${existing.bib} (${existing.name})`);
        return;
    }
    const newBib = String(runners.length + 101);
    const newName = prompt(`Masukkan nama peserta untuk Tag EPC:\n${epc}`, `Peserta #${newBib}`) || `Peserta #${newBib}`;
    const cats = raceGetCategories();
    const assignedCat = (cats && cats.length) ? cats[0] : '5K';

    const newRunner = {
        id: epc,
        bib: newBib,
        bibName: `BIB ${newBib}`,
        name: newName,
        gender: 'L',
        event: raceTitle || 'Event Lomba Lari',
        category: assignedCat,
        registered: 'MANUAL CONVERT',
        bloodType: '—',
        phone: '',
        emergencyPhone: '',
        email: '',
        epc: epc,
        status: 'REGISTERED',
        startChipTimeMs: 0,
        startChipTimeStr: '',
        finishChipTimeMs: 0,
        gunTimeMs: 0,
        gunTimeStr: '',
        chipTimeMs: 0,
        chipTimeStr: '',
        finishTimeMs: null,
        finishTimeStr: '',
        notes: 'Didaftarkan dari Live Feed',
        rank: null
    };

    runners.push(newRunner);
    rawReads.forEach(x => {
        if ((x.epc || '').toUpperCase() === epc.toUpperCase()) {
            x.bib = newBib;
            x.name = newName;
            x.category = assignedCat;
        }
    });

    raceSaveRunners();
    raceSaveRawReads();
    raceRenderRunners();
    raceRenderLeaderboard();
    raceRenderRaceResults();
    raceRenderControlRecentBody();
    raceUpdateStats();
    toast(`✅ Tag ${epc.slice(-6)} berhasil didaftarkan sebagai BIB #${newBib} (${newName})!`, 4000);
}

function raceSimulateSingleStart() {
    if (raceState !== 'RUNNING') {
        raceStartGun(true);
    }
    const readyRunner = runners.find(r => r.status === 'REGISTERED') || runners[0];
    let epc = '';
    let runner = readyRunner;
    if (!runner) {
        const newBib = String(runners.length + 101);
        epc = `E2801170000002000000${String(newBib).padStart(4, '0')}`;
        runner = {
            id: epc,
            bib: newBib,
            bibName: `BIB ${newBib}`,
            name: `Pelari #${newBib}`,
            gender: 'L',
            event: raceTitle || 'Event Lomba Lari',
            category: '5K',
            registered: 'SIMULATOR',
            bloodType: 'O',
            phone: '',
            emergencyPhone: '',
            email: '',
            epc: epc,
            status: 'REGISTERED',
            startChipTimeMs: 0,
            startChipTimeStr: '',
            finishChipTimeMs: 0,
            gunTimeMs: 0,
            gunTimeStr: '',
            chipTimeMs: 0,
            chipTimeStr: '',
            finishTimeMs: null,
            finishTimeStr: '',
            notes: '',
            rank: null
        };
        runners.push(runner);
    } else {
        epc = runner.epc || runner.id;
    }

    const oldGate = gateMode;
    gateMode = 'start';
    raceHandleTagRead(epc.toUpperCase(), -42, 1, 1);
    gateMode = oldGate;

    toast(`👟 [BIB #${runner.bib}] ${runner.name} - Melintasi Garis Start!`, 3500);
}

function raceSimulateSingleFinisher() {
    if (raceState !== 'RUNNING') {
        raceStartGun(true);
    }

    let startedRunner = runners.find(r => r.status === 'STARTED');
    if (!startedRunner) {
        raceSimulateSingleStart();
        startedRunner = runners.find(r => r.status === 'STARTED');
    }

    if (!startedRunner) return;

    const simulatedElapsedSec = Math.floor(20 * 60 + Math.random() * 120);
    startedRunner.startChipTimeMs = Date.now() - (simulatedElapsedSec * 1000);
    startedRunner.startChipTimeStr = new Date(startedRunner.startChipTimeMs).toLocaleTimeString();

    const oldGate = gateMode;
    gateMode = 'finish';
    raceHandleTagRead((startedRunner.epc || startedRunner.id).toUpperCase(), -38, 1, 1);
    gateMode = oldGate;

    toast(`🏁 [BIB #${startedRunner.bib}] ${startedRunner.name} - FINISH! Gun Time: ${startedRunner.gunTimeStr}`, 4000);
}

function raceSetControlFeedFilter(filter) {
    controlFeedFilter = filter || 'ALL';
    ['ALL', 'FINISH', 'START', 'UNREG'].forEach(f => {
        const btn = $(`feedFilter_${f}`);
        if (btn) {
            if (f === controlFeedFilter) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
    raceRenderControlRecentBody();
}

let raceConfirmCallback = null;
let raceConfirmRequiredPin = null;

function raceShowConfirmModal({
    icon = '⚠️',
    title = 'Konfirmasi Tindakan',
    message = 'Apakah Anda yakin ingin melanjutkan?',
    pin = null,
    pinHint = 'Ketik PIN untuk konfirmasi.',
    btnText = 'Konfirmasi',
    btnClass = 'danger',
    onConfirm = null
}) {
    raceConfirmCallback = onConfirm;
    raceConfirmRequiredPin = pin;

    const modal = $('raceConfirmModal');
    if (!modal) {
        if (pin) {
            const userPin = prompt(`${title}\n${message}\n(Ketik ${pin} untuk konfirmasi):`);
            if (userPin === pin && onConfirm) onConfirm();
            else if (userPin !== null) toast('❌ Password/PIN salah!', 3000);
        } else {
            if (confirm(`${title}\n\n${message}`) && onConfirm) onConfirm();
        }
        return;
    }

    if ($('raceConfirmIcon')) $('raceConfirmIcon').textContent = icon;
    if ($('raceConfirmTitle')) $('raceConfirmTitle').textContent = title;
    if ($('raceConfirmMsg')) $('raceConfirmMsg').innerHTML = message;

    const pinWrap = $('raceConfirmPinWrap');
    const pinInput = $('raceConfirmPinInput');
    const pinErr = $('raceConfirmPinError');
    const pinHintEl = $('raceConfirmPinHint');

    if (pinErr) pinErr.style.display = 'none';

    if (pin) {
        if (pinWrap) pinWrap.style.display = 'block';
        if (pinInput) {
            pinInput.value = '';
            setTimeout(() => {
                pinInput.focus();
                pinInput.select();
            }, 120);
        }
        if (pinHintEl) pinHintEl.innerHTML = pinHint;
    } else {
        if (pinWrap) pinWrap.style.display = 'none';
    }

    const btnOk = $('btnRaceConfirmOk');
    if (btnOk) {
        btnOk.textContent = btnText;
        if (btnClass === 'danger') {
            btnOk.style.background = '#dc2626';
            btnOk.style.borderColor = '#b91c1c';
            btnOk.style.color = '#ffffff';
        } else if (btnClass === 'success') {
            btnOk.style.background = '#16a34a';
            btnOk.style.borderColor = '#15803d';
            btnOk.style.color = '#ffffff';
        } else {
            btnOk.style.background = '#2563eb';
            btnOk.style.borderColor = '#1d4ed8';
            btnOk.style.color = '#ffffff';
        }
    }

    modal.style.display = 'flex';
}

function raceCloseConfirmModal() {
    const modal = $('raceConfirmModal');
    if (modal) modal.style.display = 'none';
    raceConfirmCallback = null;
    raceConfirmRequiredPin = null;
}

function raceExecuteConfirmModal() {
    if (raceConfirmRequiredPin) {
        const pinInput = $('raceConfirmPinInput');
        const userPin = (pinInput ? pinInput.value : '').trim();
        if (userPin !== String(raceConfirmRequiredPin)) {
            const pinErr = $('raceConfirmPinError');
            if (pinErr) pinErr.style.display = 'block';
            if (pinInput) {
                pinInput.focus();
                pinInput.select();
            }
            return;
        }
    }

    const cb = raceConfirmCallback;
    raceCloseConfirmModal();
    if (cb && typeof cb === 'function') {
        cb();
    }
}

function raceResetLiveFeedWithPin() {
    raceShowConfirmModal({
        icon: '🔒',
        title: 'Konfirmasi Reset Live Feed',
        message: 'Masukkan Password/PIN pengaman untuk membersihkan tampilan riwayat Live Feed.<br><br><span style="font-size:11.5px;color:#059669;background:#ecfdf5;border:1px solid #a7f3d0;padding:4px 8px;border-radius:4px;display:inline-block">🛡️ <b>Database Aman:</b> Data peserta, jam start, & ranking finish tetap tersimpan utuh.</span>',
        pin: '1234',
        pinHint: '💡 <i>Ketik PIN <b>1234</b> lalu klik tombol Bersihkan.</i>',
        btnText: '🗑️ Bersihkan Live Feed',
        btnClass: 'danger',
        onConfirm: () => {
            rawReads = [];
            lastReadMap.clear();
            raceSaveRawReads();
            raceRenderControlRecentBody();
            if (activeTab === 'racedata') raceRenderRaceData();
            if ($('finisherBanner')) $('finisherBanner').style.display = 'none';
            toast('✅ Live Feed berhasil dibersihkan (Database Peserta & Waktu Tetap Aman)!', 4000);
        }
    });
}

function raceClearRawReads() {
    raceResetLiveFeedWithPin();
}

function raceRenderControlRecentBody() {
    const thead = $('controlRecentTableHead');
    const tbody = $('controlRecentBody');
    const summary = $('controlRecentSummary');
    if (!tbody) return;

    if ($('chkAutoRegisterUnregistered')) {
        $('chkAutoRegisterUnregistered').checked = autoRegisterUnregistered;
    }

    // Dynamic Filter Counters
    const startedList = runners.filter(r => r.startChipTimeMs > 0 || r.status === 'STARTED' || r.status === 'FINISHED' || r.status === 'OVER_COT');
    const unregList = rawReads.filter(x => x.name === 'Tag Asing' || (x.gate && x.gate.includes('ASING')));

    const btnAll = $('feedFilter_ALL');
    const btnStart = $('feedFilter_START');
    const btnFin = $('feedFilter_FINISH');
    const btnUnreg = $('feedFilter_UNREG');

    if (btnAll) btnAll.innerHTML = `⚡ Semua Aktivitas (${rawReads.length})`;
    if (btnStart) btnStart.innerHTML = `🟢 Data Start (${startedList.length})`;
    if (btnFin) btnFin.innerHTML = `🏆 Data Finish (${finishers.length})`;
    if (btnUnreg) btnUnreg.innerHTML = `📡 Tag Asing (${unregList.length})`;

    // Filter 1: FINISH (🏆 Halaman Finish)
    if (controlFeedFilter === 'FINISH') {
        if (thead) {
            thead.innerHTML = `
                <tr>
                    <th style="width:65px">Rank</th>
                    <th style="width:75px">BIB</th>
                    <th>Nama Peserta</th>
                    <th style="width:55px">Gender</th>
                    <th style="width:80px">Kategori</th>
                    <th style="width:120px">Gun Time</th>
                    <th style="width:120px">Net Chip Time</th>
                    <th style="width:110px">Jam Finish</th>
                    <th style="width:110px">Status</th>
                    <th style="width:70px">Aksi</th>
                </tr>
            `;
        }
        const list = [...finishers].reverse();
        if (summary) summary.textContent = `Menampilkan ${list.length} Peserta Masuk Finish`;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty">Belum ada peserta yang masuk garis finish.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map((r, idx) => {
            const pos = r.rank ? `#${r.rank}` : (idx + 1);
            const genderBadge = r.gender === 'P' ? `<span class="badge_gender_p">P</span>` : `<span class="badge_gender_l">L</span>`;
            const gunStr = r.gunTimeStr || r.finishTimeStr || '—';
            const chipStr = r.chipTimeStr || r.finishTimeStr || '—';
            const finishTimeStr = r.finishChipTimeStr || r.gunFinishStr || '—';
            const statusTag = r.status === 'OVER_COT' 
                ? '<span class="status_tag warn">OVER COT</span>' 
                : '<span class="status_tag ok">🏆 SAH</span>';

            return `
                <tr>
                    <td class="mono font_bold" style="text-align:center">${pos}</td>
                    <td class="mono font_bold" style="text-align:center;color:#0f172a">${r.bib}</td>
                    <td><b>${r.name}</b></td>
                    <td style="text-align:center">${genderBadge}</td>
                    <td><span class="cat_badge">${r.category || '—'}</span></td>
                    <td><span class="gun_time_badge ${r.status === 'OVER_COT' ? 'text_warn' : ''}">${gunStr}</span></td>
                    <td><span class="chip_time_badge">${chipStr}</span></td>
                    <td class="mono" style="font-size:11px;color:#0f172a">${finishTimeStr}</td>
                    <td style="text-align:center">${statusTag}</td>
                    <td style="text-align:center">
                        <button type="button" class="style_fieldset_div_button btn_tool" style="height:22px;font-size:10px;padding:0 5px" onclick="raceOpenEditRunnerModal('${r.bib}')">✏️ Edit</button>
                    </td>
                </tr>
            `;
        }).join('');
        return;
    }

    // Filter 2: START (🟢 Halaman Start)
    if (controlFeedFilter === 'START') {
        if (thead) {
            thead.innerHTML = `
                <tr>
                    <th style="width:50px">No</th>
                    <th style="width:75px">BIB</th>
                    <th>Nama Peserta</th>
                    <th style="width:55px">Gender</th>
                    <th style="width:80px">Kategori</th>
                    <th style="width:115px">Jam Gun Start</th>
                    <th style="width:115px">Jam Chip Start</th>
                    <th style="width:90px">Start Delay</th>
                    <th style="width:130px">Status</th>
                    <th style="width:70px">Aksi</th>
                </tr>
            `;
        }
        const list = [...startedList].sort((a, b) => (b.startChipTimeMs || 0) - (a.startChipTimeMs || 0));
        if (summary) summary.textContent = `Menampilkan ${list.length} Pelari yang Sudah Melintasi Garis Start`;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty">Belum ada pelari yang melintasi garis start.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map((r, idx) => {
            const genderBadge = r.gender === 'P' ? `<span class="badge_gender_p">P</span>` : `<span class="badge_gender_l">L</span>`;
            let statusTag = '<span class="status_tag" style="background:#e0f2fe;color:#0369a1;border-color:#bae6fd">🟢 DI JALUR</span>';
            if (r.status === 'FINISHED') statusTag = '<span class="status_tag ok">🏆 FINISHED</span>';
            else if (r.status === 'OVER_COT') statusTag = '<span class="status_tag warn">⚠️ OVER COT</span>';

            const waveGun = (categoryWaves[r.category] && categoryWaves[r.category].gunStart) || gunStartTime;
            let gunStartDisplay = r.categoryGunStartStr || r.gunStartStr || '—';
            if (gunStartDisplay === '—' && waveGun > 0) {
                gunStartDisplay = new Date(waveGun).toLocaleTimeString();
            }

            let delayStr = '—';
            if (r.startChipTimeMs > 0 && waveGun > 0) {
                const diffSec = Math.max(0, Math.round((r.startChipTimeMs - waveGun) / 1000));
                delayStr = diffSec + 's';
            }

            return `
                <tr>
                    <td class="mono" style="text-align:center;color:#64748b">${idx + 1}</td>
                    <td class="mono font_bold" style="text-align:center;color:#0f172a">${r.bib}</td>
                    <td><b>${r.name}</b></td>
                    <td style="text-align:center">${genderBadge}</td>
                    <td><span class="cat_badge">${r.category || '—'}</span></td>
                    <td class="mono" style="font-size:11px;color:#64748b">${gunStartDisplay}</td>
                    <td class="mono font_bold" style="font-size:11px;color:#0284c7">${r.startChipTimeStr || '—'}</td>
                    <td class="mono font_bold" style="font-size:11px;color:#d97706;text-align:center">${delayStr}</td>
                    <td style="text-align:center">${statusTag}</td>
                    <td style="text-align:center">
                        <button type="button" class="style_fieldset_div_button btn_tool" style="height:22px;font-size:10px;padding:0 5px" onclick="raceOpenEditRunnerModal('${r.bib}')">✏️ Edit</button>
                    </td>
                </tr>
            `;
        }).join('');
        return;
    }

    // Filter 3: UNREG (📡 Tag Asing)
    if (controlFeedFilter === 'UNREG') {
        if (thead) {
            thead.innerHTML = `
                <tr>
                    <th style="width:110px">Tipe Event</th>
                    <th style="width:70px">Aksi</th>
                    <th>ID / Tag EPC</th>
                    <th style="width:110px">Station / Gate</th>
                    <th style="width:90px">Antenna</th>
                    <th style="width:75px">RSSI</th>
                    <th style="width:110px">Status Tag</th>
                    <th style="width:110px">Waktu Jam</th>
                </tr>
            `;
        }
        const list = unregList.slice(0, 30);
        if (summary) summary.textContent = `Menampilkan ${list.length} dari ${unregList.length} Tag Asing Terbaca`;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty">Tidak ada tag asing atau tak dikenal yang terbaca.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map((x, idx) => {
            return `
                <tr>
                    <td style="text-align:center"><span class="status_tag dsq" style="font-size:10.5px;background:#fef3c7;color:#92400e;border-color:#fcd34d">📡 TAG ASING</span></td>
                    <td style="text-align:center">
                        <button type="button" class="style_fieldset_div_button btn_assign" style="height:22px;font-size:10.5px;padding:0 6px" onclick="raceConvertUnregTagToRunner('${x.epc}')">+ BIB</button>
                    </td>
                    <td><b class="mono font_bold" style="font-size:11px;color:#d97706">${x.epc}</b></td>
                    <td style="text-align:center;font-size:11px;color:#475569">${x.station || x.gate || 'Start Gate'}</td>
                    <td style="text-align:center;font-size:11px;color:#475569">${x.antenna ? 'ANT ' + x.antenna : 'ANT 1'}</td>
                    <td class="mono" style="text-align:center;font-size:11px;color:#64748b">${x.rssi ? x.rssi + ' dBm' : '—'}</td>
                    <td style="text-align:center"><span class="status_tag dsq" style="font-size:10.5px">Belum Terdaftar</span></td>
                    <td class="mono" style="font-size:11px;color:#0f172a">${x.time || '—'}</td>
                </tr>
            `;
        }).join('');
        return;
    }

    // Default Filter 4: ALL (⚡ Semua Aktivitas Live Mat Stream)
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th style="width:115px">Tipe / Mat Event</th>
                <th style="width:60px">Posisi</th>
                <th style="width:80px">BIB Number</th>
                <th>Nama Peserta / Tag Info</th>
                <th style="width:55px">Gender</th>
                <th style="width:80px">Kategori</th>
                <th style="width:110px">Gun Time</th>
                <th style="width:110px">Chip Time</th>
                <th style="width:115px">Status / Catatan</th>
                <th style="width:105px">Waktu Jam</th>
            </tr>
        `;
    }
    const list = rawReads.slice(0, 100);
    if (summary) {
        summary.textContent = `Menampilkan ${list.length} dari ${rawReads.length} Transaksi Antena | ${startedList.length} Pelari Start | ${finishers.length} Finish`;
    }

    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty">Belum ada aktivitas pembacaan chip RFID. Jalankan SCAN atau lakukan pembacaan tag di depan antena untuk melihat feed live.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map((x, idx) => {
        const isFin = (x.gate && x.gate.includes('FINISH'));
        const isStart = (x.gate && x.gate.includes('START'));
        const isDz = (x.gate && x.gate.includes('DEAD ZONE'));
        const isPre = (x.gate && (x.gate.includes('PRE-RACE') || x.gate.includes('BLOCKED')));
        const isUnreg = (x.name === 'Tag Asing' || (x.gate && x.gate.includes('ASING')));

        let eventBadge = `<span class="reader_badge">${x.gate || 'READ'}</span>`;
        if (isFin) {
            eventBadge = x.gate.includes('COT') 
                ? `<span class="status_tag warn" style="font-size:10.5px">⚠️ OVER COT</span>` 
                : `<span class="status_tag ok" style="font-size:10.5px">🏆 FINISH</span>`;
        } else if (isStart) {
            eventBadge = `<span class="reader_badge online" style="font-size:10.5px;background:#e0f2fe;color:#0369a1;border-color:#bae6fd">🟢 CHIP START</span>`;
        } else if (isDz) {
            eventBadge = `<span class="deadzone_badge" style="font-size:10.5px">⏳ DEAD ZONE</span>`;
        } else if (isPre) {
            eventBadge = `<span class="status_tag dnf" style="font-size:10.5px">⛔ PRE-RACE</span>`;
        } else if (isUnreg) {
            eventBadge = `<span class="status_tag dsq" style="font-size:10.5px;background:#fef3c7;color:#92400e;border-color:#fcd34d">📡 TAG ASING</span>`;
        }

        const runnerMatch = runners.find(r => (r.bib && String(r.bib) === String(x.bib)) || (r.epc && String(r.epc).toUpperCase() === String(x.epc).toUpperCase()));
        const pos = runnerMatch ? (runnerMatch.rank ? `#${runnerMatch.rank}` : (runnerMatch.status === 'STARTED' ? 'START' : '—')) : '—';
        const bibHtml = (x.bib && x.bib !== '—') 
            ? `<span class="mono font_bold" style="color:#0f172a">${x.bib}</span>` 
            : `<button type="button" class="style_fieldset_div_button btn_assign" style="height:20px;font-size:10px;padding:0 5px" onclick="raceConvertUnregTagToRunner('${x.epc}')">+ BIB</button>`;

        const nameHtml = (x.name && x.name !== 'Tag Asing') 
            ? `<b>${x.name}</b>` 
            : `<span class="mono" style="font-size:11px;color:#d97706">${x.epc || 'Tag Asing'}</span>`;

        const gender = x.gender || (runnerMatch ? runnerMatch.gender : '—');
        const genderBadge = gender === 'P' ? `<span class="badge_gender_p">P</span>` : (gender === 'L' ? `<span class="badge_gender_l">L</span>` : '—');
        const cat = x.category || (runnerMatch ? runnerMatch.category : '—');
        const catHtml = (cat && cat !== '—') ? `<span class="cat_badge">${cat}</span>` : '—';

        const gunStr = runnerMatch ? (runnerMatch.gunTimeStr || runnerMatch.finishTimeStr || '—') : '—';
        const chipStr = runnerMatch ? (runnerMatch.chipTimeStr || runnerMatch.finishTimeStr || '—') : '—';

        let statusText = x.gate || 'Terbaca';
        if (isFin) statusText = runnerMatch && runnerMatch.status === 'OVER_COT' ? 'Finish (Over COT)' : 'Finish Sah';
        else if (isStart) statusText = 'Mulai Lari (Di Jalur)';
        else if (isDz) statusText = 'Di Jalur (Filter Dead Zone)';
        else if (isPre) statusText = 'Ditolak (Wave Belum Start)';
        else if (isUnreg) statusText = 'Tag Asing (Klik +BIB)';

        return `
            <tr>
                <td style="text-align:center">${eventBadge}</td>
                <td class="mono font_bold" style="text-align:center">${pos}</td>
                <td style="text-align:center">${bibHtml}</td>
                <td>${nameHtml}</td>
                <td style="text-align:center">${genderBadge}</td>
                <td>${catHtml}</td>
                <td><span class="gun_time_badge ${runnerMatch && runnerMatch.status === 'OVER_COT' ? 'text_warn' : ''}">${gunStr}</span></td>
                <td><span class="chip_time_badge">${chipStr}</span></td>
                <td style="font-size:11px;color:#475569">${statusText}</td>
                <td class="mono" style="font-size:11px;color:#0f172a">${x.time || '—'}</td>
            </tr>
        `;
    }).join('');
}

function raceSyncEventTitle() {
    const titleVal = ($('raceTitleInput') && $('raceTitleInput').value.trim()) || raceTitle || 'Event Lomba Lari';
    const lbTitle = $('leaderboardEventTitleDisplay');
    if (lbTitle) lbTitle.textContent = titleVal;
}

function raceRenderGunTimePanel() {
    raceRenderWaveDrawer();
    raceRenderGunTimeStatusTable();
}

function raceRenderGunTimeStatusTable(force = false) {
    const tbody = $('gunTimeStatusBody');
    if (!tbody) return;
    const cats = raceGetCategories();

    const existingRows = tbody.querySelectorAll('tr');
    if (!force && existingRows.length === cats.length) {
        cats.forEach((cat, idx) => {
            const wave = raceEnsureCategoryWave(cat);
            const isRunning = (wave.state === 'RUNNING');
            const isStopped = (wave.state === 'STOPPED');
            const elapsed = isRunning ? (Date.now() - wave.gunStart) : (wave.elapsedMs || 0);
            const elapsedStr = raceFormatTime(elapsed);

            const row = existingRows[idx];
            if (!row) return;

            const badgeCell = row.querySelector('.wave_state_cell');
            const startCell = row.querySelector('.wave_start_cell');
            const elapsedCell = row.querySelector('.wave_elapsed_cell');
            const actionBtn = row.querySelector('button');

            if (badgeCell) {
                badgeCell.innerHTML = isRunning 
                    ? '<span class="race_badge running">BERJALAN</span>' 
                    : (isStopped ? '<span class="race_badge stopped">DIHENTIKAN</span>' : '<span class="race_badge ready">SIAP</span>');
            }
            if (startCell) {
                startCell.textContent = wave.gunStartStr || 'Belum Start';
            }
            if (elapsedCell) {
                elapsedCell.textContent = elapsedStr;
            }
            if (actionBtn) {
                if (isRunning) {
                    actionBtn.textContent = '🟢 Berjalan';
                    actionBtn.className = 'style_fieldset_div_button btn_tool';
                    actionBtn.disabled = true;
                } else if (isStopped) {
                    actionBtn.textContent = `▶ Lanjutkan ${cat}`;
                    actionBtn.className = 'style_fieldset_div_button btn_gun_start';
                    actionBtn.disabled = false;
                } else {
                    actionBtn.textContent = `▶ Start ${cat}`;
                    actionBtn.className = 'style_fieldset_div_button btn_gun_start';
                    actionBtn.disabled = false;
                }
            }
        });
        return;
    }

    tbody.innerHTML = cats.map((cat, idx) => {
        const wave = raceEnsureCategoryWave(cat);
        const isRunning = (wave.state === 'RUNNING');
        const isStopped = (wave.state === 'STOPPED');
        const elapsed = isRunning ? (Date.now() - wave.gunStart) : (wave.elapsedMs || 0);
        const elapsedStr = raceFormatTime(elapsed);
        const schedStr = wave.scheduleStr ? `⏰ ${wave.scheduleStr}` : '<span style="color:#94a3b8">—</span>';
        const startStr = wave.gunStartStr || '<span style="color:#94a3b8">Belum Start</span>';

        let badgeHtml = '<span class="race_badge ready">SIAP</span>';
        if (isRunning) badgeHtml = '<span class="race_badge running">BERJALAN</span>';
        else if (isStopped) badgeHtml = '<span class="race_badge stopped">DIHENTIKAN</span>';

        return `
            <tr>
                <td style="text-align:center;color:#64748b">${idx + 1}</td>
                <td><span class="cat_badge font_bold" style="font-size:12px">${cat}</span></td>
                <td class="mono font_bold" style="text-align:center;color:#0369a1">${schedStr}</td>
                <td style="text-align:center" class="wave_state_cell">${badgeHtml}</td>
                <td class="mono wave_start_cell" style="text-align:center;font-weight:600">${startStr}</td>
                <td class="mono font_bold wave_elapsed_cell" style="text-align:center;color:#0f172a">${elapsedStr}</td>
                <td style="text-align:center">
                    <button type="button" class="style_fieldset_div_button ${isRunning ? 'btn_tool' : 'btn_gun_start'}"
                            style="height:24px;font-size:11px;padding:0 8px"
                            onclick="raceStartCategoryWave('${cat}', true)" ${isRunning ? 'disabled' : ''}
                            title="Mulai Gun Start untuk Kategori ${cat}">
                        ${isRunning ? '🟢 Berjalan' : `▶ Start ${cat}`}
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function raceRenderCotPanel() {
    raceRenderCotDrawer();
    raceRenderCotStatusTable();
    raceUpdateCotDisplay();
}

function raceRenderCotStatusTable() {
    const tbody = $('cotStatusTableBody');
    if (!tbody) return;
    const cats = raceGetCategories();

    tbody.innerHTML = cats.map((cat, idx) => {
        const cotMs = raceGetCotForCategory(cat);
        const cotStr = raceFormatCotStr(cotMs);
        const wave = categoryWaves[cat.toUpperCase()] || { state: raceState, gunStart: gunStartTime, elapsedMs: raceElapsedMs };
        const isRunning = (wave.state === 'RUNNING');
        const elapsed = isRunning ? (Date.now() - wave.gunStart) : (wave.elapsedMs || 0);

        let statusStr = '';
        if (wave.state === 'READY' || wave.gunStart === 0) {
            statusStr = '<span style="color:#64748b">⏳ Belum Dimulai</span>';
        } else {
            const diffMs = cotMs - elapsed;
            if (diffMs > 0) {
                const remain = raceFormatTime(diffMs).slice(0, 8);
                if (diffMs < 10 * 60 * 1000) {
                    statusStr = `<span style="color:#b45309;font-weight:bold">⚠️ Sisa: ${remain}</span>`;
                } else {
                    statusStr = `<span style="color:#15803d;font-weight:bold">⏳ Sisa: ${remain}</span>`;
                }
            } else {
                const over = raceFormatTime(Math.abs(diffMs)).slice(0, 8);
                statusStr = `<span style="color:#b91c1c;font-weight:bold">⛔ Habis (+${over})</span>`;
            }
        }

        const validFinished = runners.filter(r => (r.category || '').toUpperCase() === cat.toUpperCase() && r.status === 'FINISHED').length;
        const overCot = runners.filter(r => (r.category || '').toUpperCase() === cat.toUpperCase() && r.status === 'OVER_COT').length;
        const onTrack = runners.filter(r => (r.category || '').toUpperCase() === cat.toUpperCase() && r.status === 'STARTED').length;

        return `
            <tr>
                <td style="text-align:center;color:#64748b">${idx + 1}</td>
                <td><span class="cat_badge font_bold" style="font-size:12px">${cat}</span></td>
                <td class="mono font_bold" style="text-align:center;color:#1e293b">${cotStr}</td>
                <td class="mono" style="text-align:center">${statusStr}</td>
                <td style="text-align:center"><b style="color:#15803d">${validFinished}</b> Pelari</td>
                <td style="text-align:center"><b style="color:#b45309">${overCot}</b> Pelari</td>
                <td style="text-align:center"><b style="color:#0284c7">${onTrack}</b> Pelari</td>
            </tr>
        `;
    }).join('');
}

function raceRenderGatePanel() {
    raceRenderDualReaderDrawer();
    raceSetGateMode(gateMode);
}

function raceRenderDeadZonePanel() {
    raceRenderDeadZoneDrawer();
    raceUpdateDeadZoneSummaryBadge();
}

function raceRenderCategoriesPanel() {
    raceResetCategoryFormPanel();
    raceRenderCategoryTable();
}

// ── 1. Leaderboard: Rank, BIB Number, Participant, Category, Gun Time, Chip Time (With Search & Category Filter)
function raceRenderLeaderboard() {
    const tbody = $('leaderboardBody');
    if (!tbody) return;

    raceRenderCategoryFilters();

    const searchStr = ($('leaderboardSearchInput') ? $('leaderboardSearchInput').value : '').trim().toLowerCase();

    let filtered = (selectedCategory === 'ALL')
        ? finishers
        : finishers.filter(r => (r.category || '').toUpperCase() === selectedCategory.toUpperCase());

    if (searchStr) {
        filtered = filtered.filter(r => {
            const name = (r.name || '').toLowerCase();
            const bib = (r.bib || '').toLowerCase();
            return name.includes(searchStr) || bib.includes(searchStr);
        });
    }

    const summaryEl = $('leaderboardFilterSummary');
    if (summaryEl) {
        if (selectedCategory === 'ALL') {
            summaryEl.innerHTML = `Menampilkan ${filtered.length} dari ${finishers.length} Finisher (Overall)`;
        } else {
            summaryEl.innerHTML = `Kategori <b>${selectedCategory}</b>: Menampilkan ${filtered.length} Finisher`;
        }
    }

    if (!filtered.length) {
        const msg = searchStr
            ? `Tidak ada hasil pencarian untuk "<b>${searchStr}</b>".`
            : (selectedCategory === 'ALL'
                ? 'Belum ada peserta yang masuk finish line.'
                : `Belum ada peserta kategori <b>${selectedCategory}</b> yang masuk finish line.`);
        tbody.innerHTML = `<tr><td colspan="6" class="empty">${msg}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((r, idx) => {
        let rankBadge = '';
        if (idx === 0) rankBadge = `<b class="rank_badge gold">🥇 #1</b>`;
        else if (idx === 1) rankBadge = `<b class="rank_badge silver">🥈 #2</b>`;
        else if (idx === 2) rankBadge = `<b class="rank_badge bronze">🥉 #3</b>`;
        else rankBadge = `<b class="rank_badge">#${idx + 1}</b>`;

        const gunStr = r.gunTimeStr || r.finishTimeStr || '—';
        const chipStr = r.chipTimeStr || r.finishTimeStr || '—';

        return `
            <tr class="${idx === 0 ? 'leader_1' : ''}">
                <td style="text-align:center">${rankBadge}</td>
                <td class="mono font_bold" style="text-align:center;font-size:12px;color:#0f172a">${r.bib}</td>
                <td><b>${r.name}</b></td>
                <td><span class="cat_badge">${r.category || '—'}</span></td>
                <td><span class="gun_time_badge ${r.status === 'OVER_COT' ? 'text_warn' : ''}">${gunStr}</span></td>
                <td><span class="chip_time_badge">${chipStr}</span></td>
            </tr>
        `;
    }).join('');
}

// ── 2. Race Result: Position, BIB Number, Name, Gender, Category, Gun Time Start, Gun Finish Time, Chip Time Start, Chip Finish Time, Gun Time, Chip Time, Status, Notes, Action
function raceRenderRaceResults() {
    const tbody = $('raceResultsBody');
    if (!tbody) return;

    const catSelect = $('resultCategoryFilter');
    if (catSelect) {
        const currentVal = catSelect.value || 'ALL';
        const cats = raceGetCategories();
        let optionsHtml = '<option value="ALL">Semua Kategori</option>';
        cats.forEach(c => {
            optionsHtml += `<option value="${c}" ${currentVal === c ? 'selected' : ''}>${c}</option>`;
        });
        if (catSelect.innerHTML !== optionsHtml) catSelect.innerHTML = optionsHtml;
    }

    const searchStr = ($('resultSearchInput') ? $('resultSearchInput').value : '').trim().toLowerCase();
    const genderVal = ($('resultGenderFilter') ? $('resultGenderFilter').value : 'ALL').toUpperCase();
    const catVal = ($('resultCategoryFilter') ? $('resultCategoryFilter').value : 'ALL').toUpperCase();
    const statusVal = ($('resultStatusFilter') ? $('resultStatusFilter').value : 'ALL').toUpperCase();

    let list = [...runners].sort((a, b) => {
        if (a.status === 'FINISHED' && b.status === 'FINISHED') return (a.finishTimeMs || 0) - (b.finishTimeMs || 0);
        if (a.status === 'FINISHED') return -1;
        if (b.status === 'FINISHED') return 1;
        if (a.status === 'OVER_COT' && b.status === 'OVER_COT') return (a.finishTimeMs || 0) - (b.finishTimeMs || 0);
        if (a.status === 'OVER_COT') return -1;
        if (b.status === 'OVER_COT') return 1;
        return (parseInt(a.bib, 10) || 0) - (parseInt(b.bib, 10) || 0);
    });

    let filtered = list.filter(r => {
        if (genderVal !== 'ALL') {
            const g = (r.gender === 'P' || r.gender === 'W' || r.gender === 'FEMALE') ? 'P' : 'L';
            if (g !== genderVal) return false;
        }
        if (catVal !== 'ALL') {
            if ((r.category || '').toUpperCase() !== catVal) return false;
        }
        if (statusVal !== 'ALL') {
            if ((r.status || '').toUpperCase() !== statusVal) return false;
        }
        if (searchStr) {
            const name = (r.name || '').toLowerCase();
            const bib = (r.bib || '').toLowerCase();
            if (!name.includes(searchStr) && !bib.includes(searchStr)) return false;
        }
        return true;
    });

    const summaryEl = $('resultsFilterSummary');
    if (summaryEl) {
        summaryEl.textContent = `Menampilkan ${filtered.length} dari ${runners.length} Hasil Lomba`;
    }

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="14" class="empty">Tidak ada data hasil lomba yang sesuai filter.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((r, idx) => {
        const pos = r.rank ? `#${r.rank}` : (r.status === 'FINISHED' || r.status === 'OVER_COT' ? `#${idx + 1}` : '—');
        const gender = (r.gender === 'P' || r.gender === 'W' || r.gender === 'FEMALE') ? 'P' : 'L';
        const genderBadge = gender === 'P' 
            ? `<span class="badge_gender_p">P</span>` 
            : `<span class="badge_gender_l">L</span>`;

        const catWave = categoryWaves[(r.category || '5K').toUpperCase()];
        const gunStartStr = (catWave && catWave.gunStartStr) ? catWave.gunStartStr : (r.categoryGunStartStr || r.gunStartStr || '—');
        const gunFinishStr = r.gunFinishStr || r.finishChipTimeStr || '—';
        const chipStartStr = r.startChipTimeStr || '—';
        const chipFinishStr = r.finishChipTimeStr || r.gunFinishStr || '—';
        const gunTimeStr = r.gunTimeStr || r.finishTimeStr || '—';
        const chipTimeStr = r.chipTimeStr || r.finishTimeStr || '—';

        let statusBadge = '<span class="status_tag wait">REGISTERED</span>';
        if (r.status === 'STARTED') statusBadge = '<span class="status_tag ok" style="background:#e0f2fe;color:#0369a1">STARTED</span>';
        else if (r.status === 'FINISHED') statusBadge = '<span class="status_tag ok">FINISHED</span>';
        else if (r.status === 'OVER_COT') statusBadge = '<span class="status_tag warn">OVER COT</span>';
        else if (r.status === 'DNF') statusBadge = '<span class="status_tag dnf">DNF</span>';
        else if (r.status === 'DSQ') statusBadge = '<span class="status_tag dsq">DSQ</span>';

        let noteText = r.notes || '';
        if (!noteText) {
            if (r.status === 'FINISHED') noteText = 'Valid Finisher';
            else if (r.status === 'OVER_COT') noteText = 'Melewati Batas COT';
            else if (r.status === 'DNF') noteText = 'Did Not Finish';
            else if (r.status === 'DSQ') noteText = 'Diskualifikasi';
            else if (r.status === 'STARTED') noteText = 'Sedang Berlari di Jalur';
            else noteText = 'Belum Melintasi Start';
        }

        return `
            <tr>
                <td class="mono font_bold" style="text-align:center">${pos}</td>
                <td class="mono font_bold" style="text-align:center;color:#0f172a">${r.bib}</td>
                <td><b>${r.name}</b></td>
                <td style="text-align:center">${genderBadge}</td>
                <td><span class="cat_badge">${r.category || '—'}</span></td>
                <td class="mono" style="font-size:11px">${gunStartStr}</td>
                <td class="mono" style="font-size:11px">${gunFinishStr}</td>
                <td class="mono" style="font-size:11px">${chipStartStr}</td>
                <td class="mono" style="font-size:11px">${chipFinishStr}</td>
                <td><span class="gun_time_badge ${r.status === 'OVER_COT' ? 'text_warn' : ''}">${gunTimeStr}</span></td>
                <td><span class="chip_time_badge">${chipTimeStr}</span></td>
                <td>${statusBadge}</td>
                <td style="font-size:11px;color:#475569" title="${noteText}">${noteText}</td>
                <td>
                    <button type="button" class="style_fieldset_div_button btn_tool" style="height:22px;padding:0 6px;font-size:10.5px"
                            onclick="raceOpenEditResultModal('${r.bib}')" title="Edit Hasil / Status Juri">✏️ Edit</button>
                </td>
            </tr>
        `;
    }).join('');
}

// ── 3. Peserta & Tag BIB (10-Column Screen Display)
function raceRenderRunners() {
    const tbody = $('runnersBody');
    if (!tbody) return;

    raceRenderCategoryFilters();

    const filtered = (selectedRunnerCategory === 'ALL')
        ? runners
        : runners.filter(r => (r.category || '').toUpperCase() === selectedRunnerCategory.toUpperCase());

    const summaryEl = $('runnersFilterSummary');
    if (summaryEl) {
        summaryEl.textContent = `Menampilkan ${filtered.length} dari ${runners.length} Peserta`;
    }

    if (!filtered.length) {
        const msg = (selectedRunnerCategory === 'ALL')
            ? 'Belum ada peserta terdaftar. Klik tombol <b>📥 Ambil dari Race Data</b> atau <b>📡 Scan Massal Langsung</b> di atas.'
            : `Belum ada peserta terdaftar di kategori <b>${selectedRunnerCategory}</b>.`;
        tbody.innerHTML = `<tr><td colspan="10" class="empty">${msg}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((r, idx) => {
        const noUrut = idx + 1;
        const tagId = r.id || r.epc || '—';
        const bibNo = r.bib || '—';
        const bibName = r.bibName || (r.name ? r.name.split(/\s+/)[0].toUpperCase() : '—');
        const participantName = r.name || '—';
        const gender = (r.gender === 'P' || r.gender === 'W' || r.gender === 'FEMALE') ? 'P' : 'L';
        const genderBadge = gender === 'P' 
            ? `<span class="badge_gender_p" title="Perempuan / Wanita">P (Wanita)</span>`
            : `<span class="badge_gender_l" title="Laki-laki / Pria">L (Pria)</span>`;
        const eventTitle = r.event || raceTitle || 'Event Lomba Lari';
        const category = r.category || '5K';
        const registered = r.registered || 'TERDAFTAR';

        return `
            <tr>
                <td class="mono font_bold" style="text-align:center;color:#64748b">${noUrut}</td>
                <td class="mono" style="font-size:11px" title="${tagId}"><b>${tagId}</b></td>
                <td class="mono font_bold" style="font-size:12px;color:#0f172a">${bibNo}</td>
                <td style="font-weight:700;color:#1e293b;letter-spacing:0.3px">${bibName}</td>
                <td><b>${participantName}</b></td>
                <td>${genderBadge}</td>
                <td style="font-size:11.5px;color:#475569">${eventTitle}</td>
                <td><span class="cat_badge">${category}</span></td>
                <td class="mono" style="font-size:11px;color:#64748b">${registered}</td>
                <td>
                    <div style="display:flex;gap:3px;align-items:center">
                        <button type="button" class="style_fieldset_div_button btn_tool" style="height:22px;padding:0 5px;font-size:10.5px"
                                onclick="raceOpenEditRunnerModal('${r.bib}')" title="Edit 13 Kolom Lengkap Data Peserta">✏️ Edit</button>
                        <button type="button" class="style_fieldset_div_button btn_tool btn_danger_sm" style="height:22px;padding:0 5px;font-size:10.5px"
                                onclick="raceDeleteRunner('${r.bib}')" title="Hapus Peserta">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ── 4. Race Data: No, BIB, Event Name, Name, Gender, Category, EPC, Station, Hub ID, Antenna, Time, Action
function raceRenderRaceData() {
    const tbody = $('raceDataBody');
    if (!tbody) return;

    const searchStr = ($('raceDataSearchInput') ? $('raceDataSearchInput').value : '').trim().toLowerCase();
    const stationFilter = ($('raceDataStationFilter') ? $('raceDataStationFilter').value : 'ALL').toUpperCase();
    const hubFilter = ($('raceDataHubFilter') ? $('raceDataHubFilter').value : 'ALL').toUpperCase();

    let filtered = rawReads.filter(x => {
        if (stationFilter !== 'ALL') {
            const st = (x.station || '').toUpperCase();
            if (!st.includes(stationFilter)) return false;
        }
        if (hubFilter !== 'ALL') {
            const h = (x.hubId || '').toUpperCase();
            if (!h.includes(hubFilter)) return false;
        }
        if (searchStr) {
            const name = (x.name || '').toLowerCase();
            const event = (x.eventName || '').toLowerCase();
            const epc = (x.epc || '').toLowerCase();
            const tid = (x.tid || '').toLowerCase();
            const station = (x.station || '').toLowerCase();
            const hub = (x.hubId || '').toLowerCase();
            const bib = (x.bib || '').toLowerCase();
            if (!name.includes(searchStr) && !event.includes(searchStr) && !epc.includes(searchStr) &&
                !tid.includes(searchStr) && !station.includes(searchStr) && !hub.includes(searchStr) && !bib.includes(searchStr)) {
                return false;
            }
        }
        return true;
    });

    const summaryEl = $('raceDataFilterSummary');
    if (summaryEl) {
        summaryEl.textContent = `Menampilkan ${filtered.length} dari ${rawReads.length} Transaksi Pembacaan RFID`;
    }

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="12" class="empty">Belum ada data transaksi pembacaan RFID yang sesuai filter.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map((x, idx) => {
        const no = idx + 1;
        const bib = (x.bib && x.bib !== '—') ? `<b>${x.bib}</b>` : '<span style="color:#94a3b8">—</span>';
        const eventName = x.eventName || raceTitle || 'Event Lomba Lari';
        const name = (x.name && x.name !== 'Tag Asing') ? `<b>${x.name}</b>` : '<span style="color:#d97706;font-size:11px">Tag Asing</span>';
        const gender = (x.gender === 'P' || x.gender === 'W' || x.gender === 'FEMALE') ? 'P' : (x.gender === 'L' ? 'L' : '—');
        const genderBadge = gender === 'P' ? `<span class="badge_gender_p">P</span>` : (gender === 'L' ? `<span class="badge_gender_l">L</span>` : '—');
        const cat = x.category && x.category !== '—' ? `<span class="cat_badge">${x.category}</span>` : '—';
        const station = x.station || 'Start/Finish Gate';
        const hubId = x.hubId || 'Hub-1 (Host ESP32)';
        const antenna = x.antenna || (x.antennaPort ? `Port ${x.antennaPort}` : 'Port 1');
        const timeStr = x.time || '—';

        return `
            <tr>
                <td class="mono" style="text-align:center;color:#64748b">${no}</td>
                <td class="mono font_bold" style="text-align:center">${bib}</td>
                <td style="font-size:11.5px;color:#334155">${eventName}</td>
                <td>${name}</td>
                <td style="text-align:center">${genderBadge}</td>
                <td>${cat}</td>
                <td class="mono font_bold" style="font-size:11px" title="${x.epc}">${x.epc}</td>
                <td style="font-size:11px;font-weight:600;color:#0369a1">${station}</td>
                <td style="font-size:11px;color:#475569">${hubId}</td>
                <td class="mono" style="font-size:11px">${antenna}</td>
                <td class="mono" style="font-size:11px;color:#0f172a">${timeStr}</td>
                <td>
                    <button type="button" class="style_fieldset_div_button btn_tool btn_danger_sm" style="height:22px;padding:0 5px;font-size:10.5px"
                            onclick="raceDeleteRaceDataRow(${rawReads.indexOf(x)})" title="Hapus baris ini">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

function raceDeleteRaceDataRow(idx) {
    if (idx < 0 || idx >= rawReads.length) return;
    rawReads.splice(idx, 1);
    raceSaveRawReads();
    raceRenderRaceData();
    toast('Baris Race Data berhasil dihapus');
}

// ---------------------------------------------------------------------------
// Edit Race Result Modal (Juri & Timing Control)
// ---------------------------------------------------------------------------
function raceOpenEditResultModal(bib) {
    const r = runners.find(x => x.bib === String(bib));
    if (!r) {
        toast('Data peserta tidak ditemukan');
        return;
    }

    if ($('editResultBib')) $('editResultBib').value = r.bib;
    if ($('editResultRunnerLabel')) $('editResultRunnerLabel').value = `#${r.bib} - ${r.name} (${r.category || '5K'})`;
    if ($('editResultStatus')) $('editResultStatus').value = r.status || 'REGISTERED';
    if ($('editResultGunStart')) $('editResultGunStart').value = r.gunStartStr || r.categoryGunStartStr || '';
    if ($('editResultGunFinish')) $('editResultGunFinish').value = r.gunFinishStr || r.finishChipTimeStr || '';
    if ($('editResultChipStart')) $('editResultChipStart').value = r.startChipTimeStr || '';
    if ($('editResultChipFinish')) $('editResultChipFinish').value = r.finishChipTimeStr || r.gunFinishStr || '';
    if ($('editResultGunTime')) $('editResultGunTime').value = r.gunTimeStr || r.finishTimeStr || '';
    if ($('editResultChipTime')) $('editResultChipTime').value = r.chipTimeStr || r.finishTimeStr || '';
    if ($('editResultNotes')) $('editResultNotes').value = r.notes || '';

    const modal = $('editResultModal');
    if (modal) modal.style.display = 'flex';
}

function raceCloseEditResultModal() {
    const modal = $('editResultModal');
    if (modal) modal.style.display = 'none';
}

function raceSaveEditResultModal() {
    const bib = $('editResultBib') ? $('editResultBib').value : '';
    const r = runners.find(x => x.bib === String(bib));
    if (!r) {
        toast('Data peserta tidak ditemukan');
        raceCloseEditResultModal();
        return;
    }

    const newStatus = ($('editResultStatus') ? $('editResultStatus').value : 'REGISTERED').toUpperCase();
    const newGunStart = ($('editResultGunStart') ? $('editResultGunStart').value : '').trim();
    const newGunFinish = ($('editResultGunFinish') ? $('editResultGunFinish').value : '').trim();
    const newChipStart = ($('editResultChipStart') ? $('editResultChipStart').value : '').trim();
    const newChipFinish = ($('editResultChipFinish') ? $('editResultChipFinish').value : '').trim();
    const newGunTime = ($('editResultGunTime') ? $('editResultGunTime').value : '').trim();
    const newChipTime = ($('editResultChipTime') ? $('editResultChipTime').value : '').trim();
    const newNotes = ($('editResultNotes') ? $('editResultNotes').value : '').trim();

    r.status = newStatus;
    if (newGunStart) { r.gunStartStr = newGunStart; r.categoryGunStartStr = newGunStart; }
    if (newGunFinish) r.gunFinishStr = newGunFinish;
    if (newChipStart) r.startChipTimeStr = newChipStart;
    if (newChipFinish) r.finishChipTimeStr = newChipFinish;
    if (newGunTime) {
        r.gunTimeStr = newGunTime;
        r.finishTimeStr = newGunTime;
        r.gunTimeMs = raceParseCotStr(newGunTime);
        r.finishTimeMs = r.gunTimeMs;
    }
    if (newChipTime) {
        r.chipTimeStr = newChipTime;
        r.chipTimeMs = raceParseCotStr(newChipTime);
    }
    r.notes = newNotes;

    finishers = runners.filter(x => x.status === 'FINISHED' || x.status === 'OVER_COT')
                       .sort((a, b) => (a.finishTimeMs || 0) - (b.finishTimeMs || 0));
    finishers.forEach((x, idx) => x.rank = idx + 1);

    raceSaveRunners();
    raceRenderLeaderboard();
    raceRenderRaceResults();
    raceRenderRunners();
    raceUpdateStats();
    raceCloseEditResultModal();
    toast(`✅ Hasil lomba untuk BIB #${bib} berhasil diperbarui!`);
}

function raceSetRunnerQuickStatus(status) {
    const bib = $('editResultBib') ? $('editResultBib').value : '';
    const r = runners.find(x => x.bib === String(bib));
    if (!r) return;

    r.status = status;
    r.notes = (status === 'DNF') ? 'Did Not Finish (Manual)' : (status === 'DSQ' ? 'Diskualifikasi (Manual Juri)' : r.notes);

    finishers = runners.filter(x => x.status === 'FINISHED' || x.status === 'OVER_COT')
                       .sort((a, b) => (a.finishTimeMs || 0) - (b.finishTimeMs || 0));
    finishers.forEach((x, idx) => x.rank = idx + 1);

    raceSaveRunners();
    raceRenderLeaderboard();
    raceRenderRaceResults();
    raceRenderRunners();
    raceUpdateStats();
    raceCloseEditResultModal();
    toast(`🛑 Status BIB #${bib} diubah menjadi ${status}`);
}

function raceUpdateStats() {
    const started = runners.filter(r => r.status === 'STARTED' || r.status === 'FINISHED' || r.status === 'OVER_COT').length;
    if ($('statTotalRunners')) $('statTotalRunners').textContent = runners.length;
    if ($('statStartedRunners')) $('statStartedRunners').textContent = started;
    if ($('statFinished')) $('statFinished').textContent = finishers.length;
    if ($('statOnTrack')) $('statOnTrack').textContent = Math.max(0, started - finishers.length);
}

// ---------------------------------------------------------------------------
// CSV Import & Export (Exact 13-Column Schema & Results & Race Data)
// ---------------------------------------------------------------------------
function raceParseCsvText(text) {
    const lines = [];
    let currentLine = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];

        if (c === '"') {
            if (inQuotes && next === '"') {
                currentCell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            currentLine.push(currentCell.trim());
            currentCell = '';
        } else if ((c === '\r' || c === '\n') && !inQuotes) {
            if (c === '\r' && next === '\n') i++;
            currentLine.push(currentCell.trim());
            if (currentLine.some(x => x.length > 0)) {
                lines.push(currentLine);
            }
            currentLine = [];
            currentCell = '';
        } else {
            currentCell += c;
        }
    }
    if (currentCell.length > 0 || currentLine.length > 0) {
        currentLine.push(currentCell.trim());
        if (currentLine.some(x => x.length > 0)) lines.push(currentLine);
    }
    return lines;
}

function raceHandleCsvImport(input) {
    if (!input || !input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const content = e.target.result;
            const rows = raceParseCsvText(content);
            if (!rows.length) {
                toast('File CSV kosong');
                return;
            }

            let headerRowIndex = -1;
            let colMap = {
                no: 0,
                id: 1,
                bib: 2,
                bibName: 3,
                name: 4,
                gender: 5,
                event: 6,
                category: 7,
                registered: 8,
                bloodType: 9,
                phone: 10,
                emergencyPhone: 11,
                email: 12
            };

            for (let r = 0; r < Math.min(5, rows.length); r++) {
                const row = rows[r].map(c => c.toLowerCase());
                if (row.some(c => c.includes('bib') || c.includes('participant') || c.includes('nama') || c.includes('peserta'))) {
                    headerRowIndex = r;
                    row.forEach((col, idx) => {
                        if (col === 'no' || col === 'no.' || col === 'nomor') colMap.no = idx;
                        else if (col === 'id' || col === 'epc' || col === 'tag epc' || col === 'tag') colMap.id = idx;
                        else if (col === 'bib' || col === 'bib number' || col === 'bib #' || col === 'no bib') colMap.bib = idx;
                        else if (col === 'bib name' || col === 'nama bib') colMap.bibName = idx;
                        else if (col === 'participant' || col === 'nama' || col === 'nama peserta' || col === 'name') colMap.name = idx;
                        else if (col === 'gender' || col === 'jenis kelamin' || col === 'jk') colMap.gender = idx;
                        else if (col === 'event' || col === 'acara') colMap.event = idx;
                        else if (col === 'category' || col === 'kategori' || col === 'kat') colMap.category = idx;
                        else if (col === 'registered' || col === 'daftar' || col === 'waktu daftar') colMap.registered = idx;
                        else if (col === 'blood type' || col === 'gol darah' || col === 'blood' || col === 'gol. darah') colMap.bloodType = idx;
                        else if (col.includes('hp peserta') || col === 'no. hp peserta' || col === 'no hp' || col === 'phone') colMap.phone = idx;
                        else if (col.includes('darurat') || col.includes('emergency') || col === 'no.hp darurat') colMap.emergencyPhone = idx;
                        else if (col === 'email' || col === 'e-mail') colMap.email = idx;
                    });
                    break;
                }
            }

            const startIdx = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
            let importedCount = 0;
            const existingBibs = new Set(runners.map(r => r.bib));

            for (let i = startIdx; i < rows.length; i++) {
                const row = rows[i];
                if (row.length < 2) continue;

                const bib = (row[colMap.bib] || row[2] || '').trim();
                const name = (row[colMap.name] || row[4] || row[1] || '').trim();
                if (!bib && !name) continue;

                const finalBib = bib || String(runners.length + importedCount + 101);
                if (existingBibs.has(finalBib)) continue;

                const idVal = (row[colMap.id] || row[1] || '').trim();
                const bibNameVal = (row[colMap.bibName] || row[3] || '').trim() || (name ? name.split(/\s+/)[0].toUpperCase() : '');
                const genderVal = (row[colMap.gender] || row[5] || 'L').trim().toUpperCase();
                const gender = (genderVal === 'P' || genderVal === 'W' || genderVal === 'FEMALE' || genderVal === 'WANITA' || genderVal === 'PEREMPUAN') ? 'P' : 'L';
                const eventVal = (row[colMap.event] || row[6] || '').trim() || raceTitle || 'Event Lomba Lari';
                const categoryVal = (row[colMap.category] || row[7] || '5K').trim() || '5K';
                const registeredVal = (row[colMap.registered] || row[8] || '').trim() || 'TERDAFTAR';
                const bloodVal = (row[colMap.bloodType] || row[9] || '—').trim() || '—';
                const phoneVal = (row[colMap.phone] || row[10] || '').trim();
                const emergVal = (row[colMap.emergencyPhone] || row[11] || '').trim();
                const emailVal = (row[colMap.email] || row[12] || '').trim();
                const epcVal = idVal.replace(/[^0-9a-fA-F]/g, '').toUpperCase();

                runners.push({
                    id: idVal || epcVal || ('ID' + finalBib),
                    bib: finalBib,
                    bibName: bibNameVal,
                    name: name || ('Peserta #' + finalBib),
                    gender: gender,
                    event: eventVal,
                    category: categoryVal,
                    registered: registeredVal,
                    bloodType: bloodVal,
                    phone: phoneVal,
                    emergencyPhone: emergVal,
                    email: emailVal,
                    epc: epcVal,
                    status: 'REGISTERED',
                    startChipTimeMs: 0,
                    startChipTimeStr: '',
                    finishChipTimeMs: 0,
                    gunTimeMs: 0,
                    gunTimeStr: '',
                    chipTimeMs: 0,
                    chipTimeStr: '',
                    finishTimeMs: null,
                    finishTimeStr: '',
                    notes: '',
                    rank: null
                });

                existingBibs.add(finalBib);
                importedCount++;
            }

            raceSaveRunners();
            raceLoadCategories();
            racePopulateCategorySelects();
            raceRenderRunners();
            raceRenderLeaderboard();
            raceRenderRaceResults();
            raceRenderWavePills();
            raceUpdateCotDisplay();
            raceUpdateDeadZoneSummaryBadge();
            raceUpdateStats();
            toast(`✅ Berhasil mengimpor ${importedCount} data peserta dari CSV!`, 4500);
        } catch (err) {
            toast(`❌ Gagal membaca file CSV: ${err.message || ''}`, 5000);
        } finally {
            input.value = '';
        }
    };
    reader.readAsText(file);
}

// Ekspor 13 Kolom Data Peserta Lengkap
function raceExportCsv() {
    const title = ($('raceTitleInput') && $('raceTitleInput').value.trim()) || raceTitle || 'Race_Event';
    const catLabel = (selectedCategory === 'ALL') ? 'Overall' : selectedCategory;

    let csv = 'No.,ID,BIB Number,BIB Name,Participant,Gender,Event,Category,Registered,Blood Type,No. Hp Peserta,No.Hp Darurat,email,GunStart,GunTime,ChipTime,StartChipTime,COT_Limit,COT_Status,Rank,CategoryRank,Status\n';

    const targetFinishers = (selectedCategory === 'ALL')
        ? finishers
        : finishers.filter(r => (r.category || '').toUpperCase() === selectedCategory.toUpperCase());

    let rowIdx = 1;
    targetFinishers.forEach((r, idx) => {
        const cotLimitStr = raceFormatCotStr(raceGetCotForCategory(r.category));
        const cotStatus = (r.status === 'OVER_COT') ? 'OVER_COT' : 'VALID_COT';
        const gunStr = r.gunTimeStr || r.finishTimeStr || '';
        const chipStr = r.chipTimeStr || r.finishTimeStr || '';
        const catWave = categoryWaves[(r.category || '5K').toUpperCase()];
        const gunStartStr = (catWave && catWave.gunStartStr) ? catWave.gunStartStr : (r.categoryGunStartStr || '');
        
        const row = [
            rowIdx++,
            `"${r.id || r.epc || ''}"`,
            `"${r.bib}"`,
            `"${r.bibName || ''}"`,
            `"${r.name}"`,
            `"${r.gender || 'L'}"`,
            `"${r.event || title}"`,
            `"${r.category || '5K'}"`,
            `"${r.registered || ''}"`,
            `"${r.bloodType || '—'}"`,
            `"${r.phone || ''}"`,
            `"${r.emergencyPhone || ''}"`,
            `"${r.email || ''}"`,
            `"${gunStartStr}"`,
            `"${gunStr}"`,
            `"${chipStr}"`,
            `"${r.startChipTimeStr || ''}"`,
            `"${cotLimitStr}"`,
            `"${cotStatus}"`,
            r.rank || (idx + 1),
            idx + 1,
            r.status
        ];
        csv += row.join(',') + '\n';
    });

    const targetRunners = (selectedCategory === 'ALL')
        ? runners.filter(r => r.status !== 'FINISHED' && r.status !== 'OVER_COT')
        : runners.filter(r => r.status !== 'FINISHED' && r.status !== 'OVER_COT' && (r.category || '').toUpperCase() === selectedCategory.toUpperCase());

    targetRunners.forEach(r => {
        const cotLimitStr = raceFormatCotStr(raceGetCotForCategory(r.category));
        const catWave = categoryWaves[(r.category || '5K').toUpperCase()];
        const gunStartStr = (catWave && catWave.gunStartStr) ? catWave.gunStartStr : (r.categoryGunStartStr || '');
        
        const row = [
            rowIdx++,
            `"${r.id || r.epc || ''}"`,
            `"${r.bib}"`,
            `"${r.bibName || ''}"`,
            `"${r.name}"`,
            `"${r.gender || 'L'}"`,
            `"${r.event || title}"`,
            `"${r.category || '5K'}"`,
            `"${r.registered || ''}"`,
            `"${r.bloodType || '—'}"`,
            `"${r.phone || ''}"`,
            `"${r.emergencyPhone || ''}"`,
            `"${r.email || ''}"`,
            `"${gunStartStr}"`,
            '""',
            '""',
            `"${r.startChipTimeStr || ''}"`,
            `"${cotLimitStr}"`,
            `"${r.status}"`,
            '"—"',
            '"—"',
            r.status
        ];
        csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `${cleanTitle}_Peserta_${catLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast('✅ File CSV Peserta berhasil diekspor!');
}

// Ekspor 14 Kolom Hasil Lomba (Race Results)
function raceExportResultsCsv() {
    const title = ($('raceTitleInput') && $('raceTitleInput').value.trim()) || raceTitle || 'Race_Event';
    let csv = 'Position,BIB Number,Name,Gender,Category,Gun Time Start,Gun Finish Time,Chip Time Start,Chip Finish Time,Gun Time,Chip Time,Status,Notes\n';

    let list = [...runners].sort((a, b) => {
        if (a.status === 'FINISHED' && b.status === 'FINISHED') return (a.finishTimeMs || 0) - (b.finishTimeMs || 0);
        if (a.status === 'FINISHED') return -1;
        if (b.status === 'FINISHED') return 1;
        if (a.status === 'OVER_COT' && b.status === 'OVER_COT') return (a.finishTimeMs || 0) - (b.finishTimeMs || 0);
        if (a.status === 'OVER_COT') return -1;
        if (b.status === 'OVER_COT') return 1;
        return (parseInt(a.bib, 10) || 0) - (parseInt(b.bib, 10) || 0);
    });

    list.forEach((r, idx) => {
        const pos = r.rank ? r.rank : (r.status === 'FINISHED' || r.status === 'OVER_COT' ? (idx + 1) : '—');
        const catWave = categoryWaves[(r.category || '5K').toUpperCase()];
        const gunStartStr = (catWave && catWave.gunStartStr) ? catWave.gunStartStr : (r.categoryGunStartStr || r.gunStartStr || '');
        const gunFinishStr = r.gunFinishStr || r.finishChipTimeStr || '';
        const chipStartStr = r.startChipTimeStr || '';
        const chipFinishStr = r.finishChipTimeStr || r.gunFinishStr || '';
        const gunTimeStr = r.gunTimeStr || r.finishTimeStr || '';
        const chipTimeStr = r.chipTimeStr || r.finishTimeStr || '';

        const row = [
            `"${pos}"`,
            `"${r.bib}"`,
            `"${r.name}"`,
            `"${r.gender || 'L'}"`,
            `"${r.category || '5K'}"`,
            `"${gunStartStr}"`,
            `"${gunFinishStr}"`,
            `"${chipStartStr}"`,
            `"${chipFinishStr}"`,
            `"${gunTimeStr}"`,
            `"${chipTimeStr}"`,
            `"${r.status}"`,
            `"${r.notes || ''}"`
        ];
        csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `${cleanTitle}_RaceResults_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast('✅ File Race Results CSV berhasil diekspor!');
}

// Ekspor 12 Kolom Transaksi Pembacaan RFID (Race Data)
function raceExportRaceDataCsv() {
    const title = ($('raceTitleInput') && $('raceTitleInput').value.trim()) || raceTitle || 'Race_Event';
    let csv = 'No,BIB,Event Name,Name,Gender,Category,EPC,Station,Hub ID,Antenna,Time\n';

    rawReads.forEach((x, idx) => {
        const row = [
            idx + 1,
            `"${x.bib && x.bib !== '—' ? x.bib : ''}"`,
            `"${x.eventName || title}"`,
            `"${x.name || 'Tag Asing'}"`,
            `"${x.gender || ''}"`,
            `"${x.category || ''}"`,
            `"${x.epc || ''}"`,
            `"${x.station || 'Start/Finish Gate'}"`,
            `"${x.hubId || 'Hub-1'}"`,
            `"${x.antenna || 'Port 1'}"`,
            `"${x.time || ''}"`
        ];
        csv += row.join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `${cleanTitle}_RaceData_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    toast('✅ File Race Data CSV berhasil diekspor!');
}

// ── MANUAL INGEST & TIMING BACKUP (Tembak Manual BIB) ──────────────────────
function raceFocusManualIngest() {
    const panel = $('manualIngestPanel');
    const input = $('manualBibInput');
    if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        panel.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
        panel.style.borderColor = '#16a34a';
        panel.style.boxShadow = '0 0 0 4px rgba(34,197,94,0.3)';
        setTimeout(() => {
            panel.style.borderColor = '#22c55e';
            panel.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        }, 1500);
    }
    if (input) {
        input.focus();
        input.select();
    }
}

function raceToggleManualTimeInput(mode) {
    const customWrap = $('manualCustomTimeWrap');
    if (!customWrap) return;
    if (mode === 'manual') {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        const customInput = $('manualCustomTimeInput');
        if (customInput && !customInput.value) {
            customInput.value = `${hh}:${mm}:${ss}`;
        }
        customWrap.style.display = 'flex';
        if (customInput) customInput.focus();
    } else {
        customWrap.style.display = 'none';
    }
}

function raceLookupManualBib(val) {
    const previewText = $('manualBibPreviewText');
    const statusBadge = $('manualBibStatusBadge');
    if (!previewText) return;

    const trimmed = (val || '').trim();
    if (!trimmed) {
        previewText.innerHTML = '<span style="font-size:11.5px;color:#64748b">Ketik nomor BIB untuk melihat nama & data peserta dari database...</span>';
        if (statusBadge) statusBadge.style.display = 'none';
        return;
    }

    const r = runners.find(x => String(x.bib) === trimmed);
    if (r) {
        const genderBadge = (r.gender === 'P' || r.gender === 'W') ? '<span class="badge_gender_p">P</span>' : '<span class="badge_gender_l">L</span>';
        const catBadge = `<span class="cat_badge">${r.category || '5K'}</span>`;
        
        let statusHtml = '';
        if (r.status === 'REGISTERED' || !r.startChipTimeMs) {
            statusHtml = '<span class="status_tag" style="background:#f1f5f9;color:#475569;border-color:#cbd5e1;font-size:10.5px">⚪ BELUM START</span>';
        } else if (r.status === 'STARTED') {
            statusHtml = `<span class="status_tag" style="background:#e0f2fe;color:#0369a1;border-color:#bae6fd;font-size:10.5px">🟢 DI JALUR (Start: ${r.startChipTimeStr || '—'})</span>`;
        } else if (r.status === 'FINISHED') {
            statusHtml = `<span class="status_tag ok" style="font-size:10.5px">🏆 FINISHED (Net: ${r.chipTimeStr || r.finishTimeStr})</span>`;
        } else if (r.status === 'OVER_COT') {
            statusHtml = `<span class="status_tag warn" style="font-size:10.5px">⚠️ OVER COT (${r.gunTimeStr || '—'})</span>`;
        } else if (r.status === 'DNF') {
            statusHtml = '<span class="status_tag dnf" style="font-size:10.5px">🛑 DNF</span>';
        } else if (r.status === 'DSQ') {
            statusHtml = '<span class="status_tag dsq" style="font-size:10.5px">❌ DSQ</span>';
        }

        previewText.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <b style="font-size:12.5px;color:#0f172a">#${r.bib} - ${r.name}</b>
                ${genderBadge}
                ${catBadge}
                <span style="font-size:11px;color:#64748b">EPC: ${r.epc || '—'}</span>
            </div>
        `;
        if (statusBadge) {
            statusBadge.innerHTML = statusHtml;
            statusBadge.style.display = 'inline-flex';
        }
    } else {
        previewText.innerHTML = `<span style="color:#dc2626;font-size:11.5px;font-weight:600">⚠️ BIB #${trimmed} tidak ada di database! (Akan otomatis dibuat saat ditembak)</span>`;
        if (statusBadge) {
            statusBadge.innerHTML = '<span class="status_tag dsq" style="font-size:10px">Baru</span>';
            statusBadge.style.display = 'inline-flex';
        }
    }
}

function raceHandleManualBibKey(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const val = (event.target.value || '').trim();
        if (!val) return;
        const r = runners.find(x => String(x.bib) === val);
        if (r && r.status === 'STARTED') {
            raceExecuteManualIngest('FINISH');
        } else if (r && (r.status === 'REGISTERED' || !r.startChipTimeMs)) {
            raceExecuteManualIngest('START');
        } else if (gateMode === 'finish') {
            raceExecuteManualIngest('FINISH');
        } else {
            raceExecuteManualIngest('START');
        }
    }
}

function raceParseTimeStringToMs(timeStr) {
    if (!timeStr) return Date.now();
    const parts = timeStr.trim().split(':');
    if (parts.length < 2) return Date.now();
    const now = new Date();
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    let seconds = 0;
    let millis = 0;
    if (parts.length >= 3) {
        const secParts = parts[2].split('.');
        seconds = parseInt(secParts[0], 10) || 0;
        if (secParts.length > 1) {
            millis = parseInt(secParts[1].padEnd(3, '0').slice(0, 3), 10) || 0;
        }
    }
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, seconds, millis);
    return d.getTime();
}

function raceExecuteManualIngest(actionType) {
    const bibInput = $('manualBibInput');
    if (!bibInput) return;
    const bib = bibInput.value.trim();
    if (!bib) {
        toast('⚠️ Silakan masukkan nomor BIB terlebih dahulu!');
        bibInput.focus();
        return;
    }

    // Determine timestamp
    let timeMode = 'auto';
    const radios = document.getElementsByName('manualTimeMode');
    for (let r of radios) {
        if (r.checked) { timeMode = r.value; break; }
    }

    let timestampMs = Date.now();
    let timeStr = new Date(timestampMs).toLocaleTimeString();

    if (timeMode === 'manual') {
        const customTimeInput = $('manualCustomTimeInput');
        const customVal = customTimeInput ? customTimeInput.value.trim() : '';
        if (!customVal) {
            toast('⚠️ Jam manual belum diisi!');
            if (customTimeInput) customTimeInput.focus();
            return;
        }
        timestampMs = raceParseTimeStringToMs(customVal);
        timeStr = new Date(timestampMs).toLocaleTimeString();
    }

    let runner = runners.find(r => String(r.bib) === bib);
    if (!runner) {
        // Auto create runner in database
        runner = {
            id: 'MANUAL-' + bib,
            bib: bib,
            bibName: 'BIB #' + bib,
            name: 'Peserta BIB #' + bib,
            gender: 'L',
            category: '5K',
            event: raceTitle || 'Event Lomba Lari',
            registered: 'MANUAL_ENTRY',
            bloodType: '—',
            phone: '',
            emergencyPhone: '',
            email: '',
            epc: 'MANUAL-' + bib,
            status: 'REGISTERED',
            startChipTimeMs: 0,
            startChipTimeStr: '',
            finishChipTimeMs: 0,
            gunTimeMs: 0,
            gunTimeStr: '',
            chipTimeMs: 0,
            chipTimeStr: '',
            rank: null,
            isCot: false,
            notes: 'Didaftarkan manual oleh operator'
        };
        runners.push(runner);
    }

    const cat = runner.category || '5K';
    const wave = categoryWaves[cat] || { state: raceState, gunStart: gunStartTime };
    const waveGunStart = (wave && wave.gunStart > 0) ? wave.gunStart : gunStartTime;
    const actualGunStart = (waveGunStart > 0) ? waveGunStart : timestampMs;

    if (actionType === 'START') {
        runner.startChipTimeMs = timestampMs;
        runner.startChipTimeStr = timeStr;
        runner.categoryGunStartStr = (wave && wave.gunStartStr) ? wave.gunStartStr : new Date(actualGunStart).toLocaleTimeString();
        runner.gunStartStr = runner.categoryGunStartStr;
        runner.status = 'STARTED';
        runner.notes = `Manual Start (${timeStr})`;

        rawReads.unshift({
            id: rawReads.length + 1,
            time: timeStr,
            fullTime: new Date(timestampMs).toLocaleString(),
            epc: runner.epc || ('BIB-' + runner.bib),
            tid: '—',
            bib: runner.bib,
            eventName: runner.event || raceTitle,
            name: runner.name,
            gender: runner.gender || 'L',
            category: runner.category || '5K',
            station: 'Start Gate (Manual Ingest)',
            hubId: 'Operator Desk',
            antenna: 'Manual Entry',
            readerPort: 'Manual',
            rssi: -30,
            gate: '🟢 MANUAL START (Operator)'
        });

        racePlayBeep();
        toast(`🟢 BIB #${runner.bib} (${runner.name}) BERHASIL DICATAT START pada jam ${timeStr}!`, 3500);
    } else if (actionType === 'FINISH') {
        runner.finishChipTimeMs = timestampMs;
        runner.finishChipTimeStr = timeStr;
        runner.gunFinishStr = timeStr;
        runner.categoryGunStartStr = (wave && wave.gunStartStr) ? wave.gunStartStr : new Date(actualGunStart).toLocaleTimeString();
        runner.gunStartStr = runner.categoryGunStartStr;

        // Gun Time
        runner.gunTimeMs = Math.max(0, timestampMs - actualGunStart);
        runner.gunTimeStr = raceFormatTime(runner.gunTimeMs);
        runner.finishTimeMs = runner.gunTimeMs;
        runner.finishTimeStr = runner.gunTimeStr;

        // Chip Time
        if (runner.startChipTimeMs > 0 && runner.startChipTimeMs <= timestampMs) {
            runner.chipTimeMs = timestampMs - runner.startChipTimeMs;
            runner.chipTimeStr = raceFormatTime(runner.chipTimeMs);
        } else {
            runner.chipTimeMs = runner.gunTimeMs;
            runner.chipTimeStr = runner.gunTimeStr;
            if (!runner.startChipTimeStr) runner.startChipTimeStr = new Date(actualGunStart).toLocaleTimeString();
        }

        // COT Check
        const catCotMs = raceGetCotForCategory(runner.category);
        if (catCotMs && runner.gunTimeMs > catCotMs) {
            runner.status = 'OVER_COT';
            runner.isCot = true;
            runner.notes = `Manual Finish Over COT (+${raceFormatTime(runner.gunTimeMs - catCotMs).slice(0, 8)})`;
        } else {
            runner.status = 'FINISHED';
            runner.isCot = false;
            runner.notes = `Manual Finish (${timeStr})`;
        }

        // Rank Finishers
        finishers = runners.filter(x => x.status === 'FINISHED' || x.status === 'OVER_COT')
                           .sort((a, b) => (a.finishTimeMs || 0) - (b.finishTimeMs || 0));
        finishers.forEach((x, idx) => x.rank = idx + 1);

        rawReads.unshift({
            id: rawReads.length + 1,
            time: timeStr,
            fullTime: new Date(timestampMs).toLocaleString(),
            epc: runner.epc || ('BIB-' + runner.bib),
            tid: '—',
            bib: runner.bib,
            eventName: runner.event || raceTitle,
            name: runner.name,
            gender: runner.gender || 'L',
            category: runner.category || '5K',
            station: 'Finish Gate (Manual Ingest)',
            hubId: 'Operator Desk',
            antenna: 'Manual Entry',
            readerPort: 'Manual',
            rssi: -30,
            gate: runner.status === 'OVER_COT' ? '⚠️ MANUAL FINISH (Over COT)' : '🏆 MANUAL FINISH (Sah)'
        });

        racePlayBeep();
        toast(`🏆 BIB #${runner.bib} (${runner.name}) BERHASIL DICATAT FINISH! Net: ${runner.chipTimeStr} (Gun: ${runner.gunTimeStr})`, 4000);
    }

    if (rawReads.length > 500) rawReads.length = 500;
    raceSaveRawReads();
    raceSaveRunners();
    raceRenderRunners();
    raceRenderLeaderboard();
    raceRenderRaceResults();
    raceUpdateStats();
    raceRenderControlRecentBody();
    if (activeTab === 'racedata') raceRenderRaceData();

    // Reset input for next entry
    bibInput.value = '';
    raceLookupManualBib('');
    bibInput.focus();
}

function raceInit() {
    raceLoadRunners();
    raceLoadRawReads();
    raceLoadCotConfig();
    raceLoadDeadZoneConfig();
    raceLoadMultiReaderConfig();
    raceLoadWaves();
    raceLoadGateMode();
    raceLoadState();
    raceLoadCategories();
    racePopulateCategorySelects();
    raceUpdateControls();
    raceRenderMultiReaderCards();
    const initRaceTab = sessionStorage.getItem('race_active_tab') || 'control';
    raceSetTab(initRaceTab);
    raceSyncEventTitle();
    raceUpdateStats();
    raceUpdateCotDisplay();
    raceRenderWavePills();
    raceUpdateDeadZoneSummaryBadge();
    raceUpdateReaderStatusBadges();

    // Start continuous background heartbeat (updates browser clock & checks auto-start)
    if (raceHeartbeatTimer) clearInterval(raceHeartbeatTimer);
    raceHeartbeatTimer = setInterval(raceHeartbeat, 100);
    raceHeartbeat();
}
