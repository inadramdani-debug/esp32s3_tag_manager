// Box Map: which tag sits in which box of the carton, and which boxes failed
// to read.
//
// The carton is 3 layers x 8 rows x 4 columns = 96 cells.
//
// The reason a cell is filled by *clicking it and then reading* — rather than
// by scanning the carton and numbering the tags in the order they arrive — is
// that the reader reports tags in an arbitrary order. Measured on this unit,
// three tags 20 cm apart first appeared at 0.4s, 0.7s and 4.2s, and in another
// run at 0.1s, 0.1s and 38.8s. Order therefore carries no positional
// information at all. What does carry it is knowing which box the tag was in
// when it was read, which is exactly what the click gives.
//
// A scan afterwards is then a set membership test — "did we hear this cell's
// EPC?" — which needs no ordering and is what makes the missing-cell report
// trustworthy.

const BOX_LAYERS = 3, BOX_ROWS = 8, BOX_COLS = 4;
const BOX_CELLS  = BOX_LAYERS * BOX_ROWS * BOX_COLS;
const BOX_KEY    = 'boxmap_v1';

let boxCells  = {};    // cell id -> EPC
let boxSel    = null;  // cell id currently selected
let boxSeen   = null;  // Set of EPCs heard in the last scan; null before any scan
let boxBusy   = false; // a read or scan is running
let boxAbort  = false; // set by the Stop press to end the current run early

const boxId    = (l, r, c) => 'L' + l + 'R' + r + 'C' + c;
const boxNorm  = epc => (epc || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
const boxShort = epc => epc ? epc.slice(-6) : '';

// ---------------------------------------------------------------------------
// storage
//
// The map lives on the board (/boxmap.json via /SystemController/boxMap), not in
// this browser. That makes it the same map from every tablet and phone, and
// clearing site data no longer destroys the registration work. localStorage is
// kept only as a fallback for the case where the board is unreachable — see
// boxLoad().
//
// Saving is explicit (the Save button) rather than on every cell change: a
// registration session touches all 96 cells, and 96 flash writes to record one
// sitting is pointless churn for storage that wears out.
// ---------------------------------------------------------------------------
let boxDirty = false;   // cells changed since the last successful save

// ---------------------------------------------------------------------------
// archive of cleared cells
//
// Clearing a cell used to be the one destructive action with no way back: the
// EPC was dropped and, once the map was saved, the board's copy was overwritten
// too. So every cell that gets cleared or overwritten is recorded here first.
//
// Kept on the board alongside the map rather than in this browser, for the same
// reason the map is: whoever clears a cell may not be whoever needs it back.
// Stored under its own key ("#archive") inside the same JSON blob, so no extra
// endpoint and no extra firmware state — and the board, which never parses the
// blob, needs no change at all.
// ---------------------------------------------------------------------------
const BOX_ARCHIVE_KEY = '#archive';
let boxArchive = [];    // newest first: { id, epc, at }

function boxArchiveLoad(raw) {
    boxArchive = (raw && Array.isArray(raw)) ? raw : [];
}

function boxArchiveAdd(id, epc) {
    if (!epc) return;
    // One entry per EPC: re-clearing the same value must not fill the list with
    // copies of itself.
    boxArchive = boxArchive.filter(e => boxNorm(e.epc) !== boxNorm(epc));
    boxArchive.unshift({ id: id, epc: epc, at: Date.now() });
    // Trimmed by size, not by a fixed count: an entry is ~90 bytes, and the
    // board refuses the whole blob over its cap. With all 96 cells filled,
    // 100 entries keeps the blob near 11 KB of the 16 KB the board allows —
    // measured, 60 entries already reaches 8.1 KB, so a larger list would
    // start failing to save exactly when the archive is most needed.
    while (boxArchive.length > 100) boxArchive.length = 100;
}

// Puts `epc` into `id`, archiving whatever was there first. Returns the value
// that was replaced, or '' if the cell was empty.
//
// Both write paths (typing an EPC, and reading a tag into the cell) go through
// here. They were separate before, and only the clear button archived — so
// typing over a cell lost the previous EPC with no way back, the same loss the
// archive exists to prevent.
function boxReplace(id, epc) {
    const prior = boxNorm(boxCells[id]);
    if (prior && prior !== boxNorm(epc)) boxArchiveAdd(id, boxCells[id]);
    boxCells[id] = epc;
    return prior;
}

function boxPayload() {
    const out = Object.assign({}, boxCells);
    if (boxArchive.length) out[BOX_ARCHIVE_KEY] = boxArchive;
    return out;
}

// Splits a stored blob back into cells and archive.
function boxSplit(raw) {
    const obj = (raw && typeof raw === 'object') ? raw : {};
    boxArchiveLoad(obj[BOX_ARCHIVE_KEY]);
    const cells = {};
    Object.keys(obj).forEach(k => { if (k !== BOX_ARCHIVE_KEY) cells[k] = obj[k]; });
    return cells;
}

function boxLoad() {
    // Synchronous XHR on purpose: boxInit needs the map before the first render,
    // and an async load would paint an empty grid then repaint. This runs once,
    // from this device's LAN, so the block is a few milliseconds.
    let local = null;
    try { local = JSON.parse(localStorage.getItem(BOX_KEY) || 'null'); }
    catch (e) { local = null; }

    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/SystemController/boxMap', false);
        xhr.send(null);
        if (xhr.status === 200) {
            const raw = (xhr.responseText || '').trim();
            boxCells = raw ? boxSplit(JSON.parse(raw)) : {};

            // First run after the map moved from this browser to the board: the
            // board is empty but this device still holds a map. Adopt it rather
            // than showing an empty grid, and push it up so the other devices
            // see it too. Only when the board has nothing — a non-empty board
            // copy always wins, or opening the page on an old device would roll
            // the shared map back to that device's stale snapshot.
            const localCells = local ? boxSplit(local) : {};
            if (!Object.keys(boxCells).length && Object.keys(localCells).length) {
                boxCells = localCells;
                boxArchiveLoad(local[BOX_ARCHIVE_KEY]);
                boxSave();                 // marks dirty
                boxSaveNow(true);          // and sends it
                toast(t('boxLoaded') + '  (' + Object.keys(localCells).length + ')');
                return;
            }
            boxDirty = false;
            boxSaveState();
            return;
        }
    } catch (e) {
        // Unreachable or unparseable: fall through to the local copy rather
        // than presenting an empty map, which would look like the work is gone.
    }
    boxCells = local ? boxSplit(local) : {};
    boxDirty = true;   // whatever we loaded is not confirmed on the board
    boxSaveState();
}

// Local mirror only. Keeps the map recoverable if the board is swapped or
// unreachable; the board copy is the source of truth.
function boxSave() {
    try { localStorage.setItem(BOX_KEY, JSON.stringify(boxPayload())); } catch (e) {}
    boxDirty = true;
    boxSaveState();
}

function boxSaveState() {
    const el = $('saveState');
    if (!el) return;
    if (boxBusy) { el.textContent = ''; return; }
    el.textContent = boxDirty ? t('unsaved') : '';
    el.style.color = '#c9302c';
}

// Writes the map to the board. Every mutation goes through here, so the board
// is never more than one edit behind.
//
// `silent` means "do not toast" — used by the callers that put their own message
// up, so a failure is folded into that one message. It matters: toast() has a
// single slot, and a failure toasted from here was being replaced a moment later
// by the caller's "cell assigned", leaving the user told the opposite of what
// happened. Returns true on success.
function boxSaveNow(silent) {
    boxSaveState();
    return fetch('/SystemController/boxMap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(boxPayload())
    }).then(r => r.json()).then(d => {
        if (d.code !== 0) throw new Error(d.message || t('boxSaveFail'));
        boxDirty = false;
        boxSaveState();
        if (!silent) toast(t('boxSaved'));
        return true;
    }).catch(e => {
        // The local mirror still holds the change, so nothing is lost — but the
        // board copy is the one every other device reads, so it is reported.
        boxSaveState();   // keeps "unsaved changes" up until a save really lands
        if (!silent) toast(t('boxSaveFail') + ': ' + (e.message || ''));
        return false;
    });
}

// ---------------------------------------------------------------------------
// duplicate EPCs
//
// Nothing stops the same tag being read into two cells — a tag moved during
// registration, or one read twice because two boxes were open. A duplicate
// silently breaks the scan result: whichever of the two cells is heard is
// marked green and the other red, so the missing-cell list points at a box
// whose tag is physically somewhere else. So it is counted and shown, and the
// cells involved are marked, rather than being allowed to sit there quietly.
// ---------------------------------------------------------------------------
function boxDuplicates() {
    const byEpc = {};
    Object.keys(boxCells).forEach(id => {
        const e = boxNorm(boxCells[id]);
        if (!e) return;
        (byEpc[e] = byEpc[e] || []).push(id);
    });
    const dup = {};
    Object.keys(byEpc).forEach(e => { if (byEpc[e].length > 1) dup[e] = byEpc[e]; });
    return dup;
}

// ---------------------------------------------------------------------------
// grid & layer filter (portrait / C5 optimization)
// ---------------------------------------------------------------------------
let boxActiveLayer = 0; // 0 = all, 1 = layer 1, 2 = layer 2, 3 = layer 3

function boxSetLayerFilter(l) {
    boxActiveLayer = Number(l) || 0;
    for (let i = 0; i <= BOX_LAYERS; i++) {
        const btn = $('tabLayer' + i);
        if (btn) btn.classList.toggle('active', i === boxActiveLayer);
    }
    boxRenderGrid();
}

function boxNextCell(id) {
    if (!id) return boxId(1, 1, 1);
    const m = id.match(/^L(\d+)R(\d+)C(\d+)$/);
    if (!m) return id;
    let l = parseInt(m[1]), r = parseInt(m[2]), c = parseInt(m[3]);
    c++;
    if (c > BOX_COLS) {
        c = 1;
        r++;
        if (r > BOX_ROWS) {
            r = 1;
            l++;
            if (l > BOX_LAYERS) {
                l = 1;
            }
        }
    }
    return boxId(l, r, c);
}

function boxAdvanceSelection() {
    if ($('cbAutoNext') && $('cbAutoNext').checked && boxSel) {
        const nextId = boxNextCell(boxSel);
        if (nextId && nextId !== boxSel) {
            boxPick(nextId);
            const nextL = parseInt(nextId.charAt(1));
            if (boxActiveLayer !== 0 && boxActiveLayer !== nextL) {
                boxSetLayerFilter(nextL);
            }
        }
    }
}

function boxPick(id) {
    boxSel = id;
    // Show what is in the cell in the edit box, so it can be corrected rather
    // than retyped from scratch.
    if ($('cellEpc')) $('cellEpc').value = boxCells[id] || '';
    boxRenderGrid();
    if (typeof reportView === 'function') {
        reportView('boxmap', { cell: id, epc: boxCells[id] || '', count: Object.keys(boxCells).length, msg: 'PILIH SEL' });
    }
}

// Sets the selected cell from the EPC box. The same destination as reading a
// tag into the cell, for when the tag cannot be brought to the reader — already
// packed, or the EPC is known from a list.
//
// async and awaited by its callers so the save indicator reflects the board
// write having finished, rather than merely having been started.
async function boxSetEpc() {
    if (!boxSel) {
        // If no cell is selected yet, pick the first cell L1R1C1 automatically
        boxPick(boxId(1, 1, 1));
    }
    const epc = boxNorm($('cellEpc') && $('cellEpc').value);
    if (epc.length < 8) { toast(t('boxShortEpc')); return false; }

    const already = Object.keys(boxCells).filter(id => id !== boxSel && boxNorm(boxCells[id]) === epc);
    boxReplace(boxSel, epc);
    boxSave();
    boxRenderGrid();
    if (typeof reportView === 'function') {
        reportView('boxmap', { cell: boxSel, epc: epc, count: Object.keys(boxCells).length, msg: 'PASANG EPC' });
    }
    const ok = await boxSaveNow(true);
    if (!ok) {
        // Not saved: say that, and not "assigned", which is what this call
        // otherwise reports.
        toast(t('boxSaveFail') + ' — ' + boxSel, 3000);
        return false;
    }

    // Reusing the value means it is no longer something that was lost, so it
    // drops out of the cleared-cells list rather than sitting there as a
    // duplicate of the cell it was just restored into.
    const wasArchived = boxArchive.some(e => boxNorm(e.epc) === epc);
    if (wasArchived) {
        boxArchive = boxArchive.filter(e => boxNorm(e.epc) !== epc);
        boxSave();
        boxSaveNow(true);
        boxRenderArchive();
    }

    let msg = boxSel + ' ← ' + boxShort(epc);
    if (already.length) msg += '  ⚠ ' + t('boxDupWarn') + ' ' + already.join(', ');
    toast(msg, already.length ? 4000 : 1800);

    // Auto Advance to next cell if enabled (C5 fast workflow)
    boxAdvanceSelection();
    return true;
}

// Empties one cell. Separate from reading into it: clearing is how a wrong or
// superseded assignment is undone without disturbing the other 95.
//
// The EPC goes into the archive on the way out, so the cell can be filled again
// from the "cleared cells" list instead of being re-read off the tag. This is
// the only place a value is lost, which is why the archive is written here and
// not only in the manual-entry path.
async function boxClearCell() {
    if (!boxSel) { toast(t('boxNeedAssign')); return; }
    if (!boxCells[boxSel]) { toast(t('boxCellCleared')); return; }
    if (!confirm(t('boxClearCellConfirm') + '  ' + boxSel)) return;

    boxArchiveAdd(boxSel, boxCells[boxSel]);
    delete boxCells[boxSel];
    if ($('cellEpc')) $('cellEpc').value = '';
    boxSave();
    boxRenderGrid();
    if (typeof reportView === 'function') {
        reportView('boxmap', { cell: boxSel, epc: '', count: Object.keys(boxCells).length, msg: 'HAPUS SEL' });
    }
    await boxSaveNow(true);
    boxRenderArchive();
    toast(t('boxCellCleared') + ': ' + boxSel + '  ·  ' + t('boxArchived'));
}

// Refills the selected cell from the archive. This is the way back from a clear.
async function boxRestoreEpc(epc) {
    if (!boxSel) { toast(t('boxNeedAssign')); return; }
    if ($('cellEpc')) $('cellEpc').value = epc;
    await boxSetEpc();
}

// Drops the archive. The cells themselves are untouched — this only discards the
// list of values that were cleared.
function boxClearArchive() {
    if (!boxArchive.length) return;
    if (!confirm(t('boxArchiveClearConfirm'))) return;
    boxArchive = [];
    boxSave();
    boxSaveNow(true);
    boxRenderArchive();
}

let archiveVisible = false;

function boxToggleArchive() {
    const box = $('archiveBox');
    if (!box) return;
    if (!boxArchive.length) {
        toast(t('boxArchiveEmpty'));
        return;
    }
    archiveVisible = (box.style.display === 'none' || !box.style.display);
    box.style.display = archiveVisible ? '' : 'none';
    if (archiveVisible) {
        boxRenderArchive();
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function boxRenderArchive() {
    const box = $('archiveBox'), body = $('archiveBody'), count = $('archiveCount');
    if (!box || !body) return;

    if (count) count.textContent = boxArchive.length;
    if (!boxArchive.length) {
        box.style.display = 'none';
        archiveVisible = false;
        body.innerHTML = '';
        return;
    }

    // Newest first, capped so a long history cannot push the table down the page.
    body.innerHTML = boxArchive.slice(0, 40).map(e =>
        '<tr><td class="mono">' + e.id + '</td>' +
        '<td class="mono">' + e.epc + '</td>' +
        '<td>' + (e.at ? new Date(e.at).toLocaleString() : '') + '</td>' +
        '<td><button class="style_fieldset_div_button" style="width:auto;padding:0 10px" ' +
        'onclick="boxRestoreEpc(\'' + e.epc + '\')">' + t('boxRestore') + '</button></td>' +
        '</tr>').join('');
}

function boxRenderGrid() {
    const area = $('gridArea');
    if (!area) return;

    const dup = boxDuplicates();
    const dupCells = new Set();
    Object.keys(dup).forEach(e => dup[e].forEach(id => dupCells.add(id)));

    let html = '';
    for (let l = 1; l <= BOX_LAYERS; l++) {
        if (boxActiveLayer !== 0 && boxActiveLayer !== l) continue;
        html += '<fieldset class="style_fieldset layer_card" data-layer="' + l + '">' +
                '<legend class="layer_title">' + t('layer') + ' ' + l + '</legend>' +
                '<div class="box_grid">';
        for (let r = 1; r <= BOX_ROWS; r++) {
            for (let c = 1; c <= BOX_COLS; c++) {
                const id  = boxId(l, r, c);
                const epc = boxCells[id] || '';
                let cls = 'box_cell';
                if (id === boxSel) cls += ' sel';
                if (epc) cls += ' filled';
                // Only after a scan is there anything to say about whether the
                // cell's tag was heard; before that the colours would be noise.
                if (boxSeen && epc) cls += boxSeen.has(boxNorm(epc)) ? ' ok' : ' miss';
                if (dupCells.has(id)) cls += ' dup';

                // The title is where the full EPC lives — the cell only has room
                // for the last six characters. The duplicate note names the
                // *other* cells holding this EPC, not this one.
                let title = epc || t('empty');
                if (dupCells.has(id)) {
                    const others = dup[boxNorm(epc)].filter(x => x !== id);
                    title += '  — ' + t('boxDupWarn') + ' ' + others.join(', ');
                }

                const posLabel = boxActiveLayer !== 0 ? ('R' + r + 'C' + c) : ('L' + l + 'R' + r + 'C' + c);
                html += '<div class="' + cls + '" onclick="boxPick(\'' + id + '\')"' +
                        ' title="' + title + '">' +
                        '<span class="box_pos">' + posLabel + '</span>' +
                        '<span class="box_epc">' + (epc ? boxShort(epc) : '·') + '</span>' +
                        '</div>';
            }
        }
        html += '</div></fieldset>';
    }
    area.innerHTML = html;

    if ($('selCell')) $('selCell').textContent = boxSel || '—';
    const filledCount = Object.keys(boxCells).length;
    if ($('fillCount')) $('fillCount').textContent = filledCount;
    if ($('fillPercent')) {
        const pct = ((filledCount / BOX_CELLS) * 100).toFixed(0);
        $('fillPercent').textContent = '(' + pct + '%)';
    }

    const nDup = Object.keys(dup).length;
    if ($('dupCount')) $('dupCount').textContent = nDup;
    if ($('dupWrap')) $('dupWrap').style.display = nDup ? '' : 'none';
}

// ---------------------------------------------------------------------------
// progress
// ---------------------------------------------------------------------------
function boxBar(show) {
    if ($('scanBarWrap')) $('scanBarWrap').style.display = show ? '' : 'none';
}

// `frac` is 0..1, or null to leave the bar where it is. The label is set
// separately because a scan and a single-cell read report different things.
function boxProgress(frac, label) {
    if (frac != null && $('scanBarFill')) {
        $('scanBarFill').style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
    }
    if (label != null && $('scanState')) $('scanState').textContent = label;
}

// Reflects the running state in the button itself, so the button is the
// indicator: it reads Scan when idle and Stop while running.
function boxSetRunning(on) {
    boxBusy = on;
    const b = $('btnScanBox');
    if (b) {
        b.textContent = on ? t('boxStop') : t('boxScan');
        b.classList.toggle('running', on);
    }
    const r = $('btnReadCell');
    if (r) r.disabled = on;
}

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------
async function boxStart() {
    await reader('/InventoryController/clearCacheTagAndIndex', {}, 10000);
    return reader('/InventoryController/startInventoryRequest', {
        type: 'Reader-startInventoryRequest',
        backgroundInventory: false,
        tagFilter: { tagMemoryBank: 'epc', bitOffset: 0, bitLength: 0, hexMask: null }
    }, 12000);
}

function boxStop() {
    return reader('/InventoryController/stopInventoryRequest',
                  { type: 'Reader-stopInventoryRequest' }, 12000).catch(() => {});
}

// Polls for `seconds` and returns a Map of EPC -> tag, reads summed. Same
// back-to-back polling as the Inventory page, for the same reason: the reader
// drops reports nobody collects, so a gap in polling loses reads outright.
//
// Returns early when boxAbort is set, which is what the Stop press does.
async function boxCollect(seconds, label) {
    const secs = Math.max(1, Number(seconds) || 1);
    const per  = new Map();
    let stopped = false;

    boxAbort = false;
    boxBar(true);
    boxProgress(0, label + ' 0 / ' + secs + 's');

    try { await boxStart(); }
    catch (e) { toast(e.message || t('failure')); boxBar(false); return { per, stopped: false, failed: true }; }

    const t0 = performance.now();
    while ((performance.now() - t0) / 1000 < secs) {
        if (boxAbort) { stopped = true; break; }
        try {
            const d = await reader('/InventoryController/tagReportingDataAndIndex', {}, 8000);
            ((d && d.data) || []).forEach(tag => {
                const epc = boxNorm(tag.epcHex);
                if (!epc) return;
                const cur = per.get(epc);
                if (!cur) per.set(epc, Object.assign({}, tag, { epcHex: epc, count: tag.count || 0 }));
                else {
                    cur.count += tag.count || 0;
                    cur.rssi = tag.rssi;
                    cur.antennaPort = tag.antennaPort;
                }
            });
        } catch (e) { break; }
        const el = (performance.now() - t0) / 1000;
        boxProgress(el / secs, label + ' ' + Math.min(el, secs).toFixed(0) + ' / ' + secs + 's  ·  ' +
                               per.size + ' ' + t('boxTagsHeard'));
        await new Promise(r => setTimeout(r, 20));
    }
    await boxStop();
    return { per, stopped };
}

// Reads the tag in the selected box into that cell. The click is what makes
// this unambiguous; the read itself only has to answer "which tag is here".
async function boxReadIntoSel() {
    if (boxBusy) return;
    if (!boxSel) { toast(t('boxNeedAssign')); return; }

    boxSetRunning(true);
    if (typeof reportView === 'function') {
        reportView('boxmap', { cell: boxSel, count: Object.keys(boxCells).length, msg: 'BACA TAG...' });
    }
    const { per, stopped } = await boxCollect(5, t('boxReading'));
    boxSetRunning(false);

    if (!per.size) {
        boxProgress(1, t('boxReadDone') + '  ·  0 ' + t('boxTagsHeard'));
        if (typeof reportView === 'function') {
            reportView('boxmap', { cell: boxSel, count: Object.keys(boxCells).length, msg: 'TAG NIHIL' });
        }
        toast(t('boxNoTags'));
        return;
    }

    // Strongest first: when several tags answer, the one in the box being read
    // is normally the closest to the antenna. If more than one was heard the
    // toast says so, since that is the case where the pick could be wrong.
    const pick = [...per.values()].sort((a, b) => (b.rssi || -999) - (a.rssi || -999))[0];

    // Where this EPC was already registered, if anywhere. The cell is still
    // overwritten — the tag really was read here — but the caller is told, and
    // both cells stay marked until the duplicate is resolved by hand.
    const already = Object.keys(boxCells)
        .filter(id => id !== boxSel && boxNorm(boxCells[id]) === pick.epcHex);

    boxReplace(boxSel, pick.epcHex);
    boxSave();
    boxRenderGrid();
    if ($('cellEpc')) $('cellEpc').value = pick.epcHex;
    if (typeof reportView === 'function') {
        reportView('boxmap', { cell: boxSel, epc: pick.epcHex, count: Object.keys(boxCells).length, msg: 'BACA OK' });
    }
    await boxSaveNow(true);
    boxRenderArchive();

    boxProgress(1, t('boxReadDone') + '  ·  ' + per.size + ' ' + t('boxTagsHeard') +
                   (stopped ? '  ·  ' + t('boxStopped') : ''));

    let msg = boxSel + ' ← ' + boxShort(pick.epcHex);
    if (already.length) msg += '  ⚠ ' + t('boxDupWarn') + ' ' + already.join(', ');
    if (per.size > 1)    msg += '  (' + per.size + ' ' + t('boxTagsHeard') + ')';
    toast(msg, already.length ? 4000 : 1800);

    // Auto-advance selection to next cell
    boxAdvanceSelection();
}

function boxUpdateScanBanner(heardCount, missingCount, unregCount) {
    const banner = $('scanResultBanner');
    if (!banner) return;
    if (missingCount === 0 && unregCount === 0 && heardCount >= BOX_CELLS) {
        banner.className = 'scan_banner ok';
        banner.innerHTML = '✅ LENGKAP: Semua ' + heardCount + ' / 96 Tag Dus Terbaca Sempurna (100% PASS)';
        banner.style.display = '';
    } else if (missingCount > 0 || unregCount > 0) {
        banner.className = 'scan_banner warn';
        banner.innerHTML = '⚠️ PERIKSA DUS: ' + heardCount + ' / 96 Tag Terbaca. Kurang: ' + missingCount + ' Tag Hilang / Belum Terbaca!';
        banner.style.display = '';
    } else {
        banner.className = 'scan_banner ok';
        banner.innerHTML = '✅ HASIL SCAN: ' + heardCount + ' Tag Terbaca.';
        banner.style.display = '';
    }
}

// Scans the whole carton and reports which cells were not heard.
async function boxScanBox() {
    // Second press while running = stop. The reader is told to stop too, so it
    // is not left scanning after the button goes back to Scan.
    if (boxBusy) { boxAbort = true; return; }

    boxSetRunning(true);
    if (typeof reportView === 'function') {
        reportView('boxmap_scan', { running: true, count: 0, msg: 'PINDAI DUS' });
    }
    const secs = Number($('boxScanSec') && $('boxScanSec').value) || 10;
    const { per, stopped } = await boxCollect(secs, t('boxScanning'));
    boxSetRunning(false);

    boxSeen = new Set(per.keys());
    boxRenderGrid();
    boxRenderResults(per);

    const missing = Object.keys(boxCells).filter(id => !boxSeen.has(boxNorm(boxCells[id]))).length;
    const unreg   = BOX_CELLS - Object.keys(boxCells).length;

    boxUpdateScanBanner(per.size, missing, unreg);

    if (typeof reportView === 'function') {
        reportView('boxmap_scan', { running: false, count: per.size, msg: stopped ? 'STOP' : 'SELESAI' });
    }

    boxProgress(1, t(stopped ? 'boxStopped' : 'boxScanDone') + '  ·  ' + per.size + ' ' + t('boxTagsHeard') +
                   '  ·  ' + t('boxMissing') + ': ' + missing +
                   (unreg ? '  ·  ' + unreg + ' ' + t('boxUntagged') : ''));

    toast(t('boxMissing') + ': ' + missing +
          (unreg ? '  + ' + unreg + ' ' + t('boxUntagged') : ''));

    // Auto-send to external REST API / Webhook if enabled
    const apiCfg = boxGetApiSettings();
    if (apiCfg.autoSendOnScan && apiCfg.url) {
        boxSendToApi(true);
    }
}

function boxRenderResults(per) {
    // A cell counts as "not read" when no tag was heard for it. Cells that were
    // never assigned an EPC are included, with the EPC column empty: from the
    // carton's point of view an unregistered box is a box with no tag read.
    const missing = [];
    for (let l = 1; l <= BOX_LAYERS; l++)
        for (let r = 1; r <= BOX_ROWS; r++)
            for (let c = 1; c <= BOX_COLS; c++) {
                const id  = boxId(l, r, c);
                const epc = boxCells[id] || '';
                if (epc && boxSeen.has(boxNorm(epc))) continue;
                missing.push({ l, r, c, epc });
            }

    if ($('missingCount')) $('missingCount').textContent = missing.length;
    if ($('missingBody')) {
        $('missingBody').innerHTML = missing.length
            ? missing.map(m => '<tr><td>' + m.l + '</td><td>' + m.r + '</td><td>' + m.c +
                               '</td><td class="mono">' + (m.epc || '—') + '</td></tr>').join('')
            : '<tr><td colspan="4" class="empty">' + t('boxAllFound') + '</td></tr>';
    }

    // Tags heard that no cell claims: a tag in the wrong box, a spare on the
    // bench, or an EPC entered wrongly. Worth surfacing rather than ignoring.
    const known = new Set(Object.keys(boxCells).map(id => boxNorm(boxCells[id])));
    const extra = [...per.values()].filter(x => !known.has(x.epcHex));
    if ($('unexpectedCount')) $('unexpectedCount').textContent = extra.length;
    if ($('unexpectedBody')) {
        $('unexpectedBody').innerHTML = extra.map(x =>
            '<tr><td class="mono">' + x.epcHex + '</td><td>' + (x.rssi != null ? x.rssi : '') +
            '</td><td>' + (x.antennaPort != null ? x.antennaPort : '') +
            '</td><td>' + (x.count != null ? x.count : '') + '</td></tr>').join('');
    }
    if ($('unexpectedBox')) $('unexpectedBox').style.display = extra.length ? '' : 'none';
}

function boxClearMap() {
    if (!confirm(t('boxClearConfirm'))) return;
    // Every cell goes into the archive before being dropped, so "Clear Map" is
    // recoverable too — otherwise it would be the one irreversible action here,
    // and 96 registrations is a lot of work to lose to a mis-click.
    Object.keys(boxCells).forEach(id => boxArchiveAdd(id, boxCells[id]));

    boxCells = {};
    boxSeen  = null;
    boxSel   = null;
    if ($('cellEpc')) $('cellEpc').value = '';
    boxSave();
    boxRenderGrid();
    boxBar(false);
    if (typeof reportView === 'function') {
        reportView('boxmap', { cell: '', epc: '', count: 0, msg: 'KOSONGKAN' });
    }
    // Clear the copy on the board too, not just this browser's.
    fetch('/SystemController/boxMapClear', { method: 'POST' }).catch(() => {});
    boxSaveNow(true);
    boxRenderArchive();
    if ($('missingCount')) $('missingCount').textContent = 0;
    if ($('missingBody')) $('missingBody').innerHTML =
        '<tr><td colspan="4" class="empty">' + t('noTags') + '</td></tr>';
    if ($('unexpectedBox')) $('unexpectedBox').style.display = 'none';
}

// ---------------------------------------------------------------------------
// database / profiles management (save & recall maps)
// ---------------------------------------------------------------------------
const DB_NAME = 'tagmgr_boxmap_profiles';
let boxProfiles = [];

function getLocalProfiles() {
    try {
        return JSON.parse(localStorage.getItem(DB_NAME) || '{}');
    } catch (e) {
        return {};
    }
}

function setLocalProfiles(obj) {
    try {
        localStorage.setItem(DB_NAME, JSON.stringify(obj));
    } catch (e) {}
}

async function boxLoadProfilesList() {
    const sel = $('savedMapSelect');
    if (!sel) return;

    let names = new Set();

    // 1. Fetch from board LittleFS
    try {
        const r = await fetch('/SystemController/boxMapList');
        const d = await r.json();
        if (d.code === 0 && Array.isArray(d.maps)) {
            d.maps.forEach(m => names.add(m));
        }
    } catch (e) {}

    // 2. Also merge local storage profiles
    const localMap = getLocalProfiles();
    Object.keys(localMap).forEach(k => names.add(k));

    boxProfiles = Array.from(names).sort();

    // Populate select element
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">' + t('boxSelectProfile') + '</option>';
    boxProfiles.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
    });

    if (boxProfiles.includes(currentVal)) {
        sel.value = currentVal;
    }
}

function boxOnSelectProfile() {
    const sel = $('savedMapSelect');
    const input = $('profileNameInput');
    if (sel && input && sel.value) {
        input.value = sel.value;
    }
}

async function boxSaveNamedProfile() {
    const input = $('profileNameInput');
    const name = (input ? input.value : '').trim();
    if (!name) {
        toast(t('boxNameRequired'));
        if (input) input.focus();
        return;
    }

    const payload = boxPayload();

    // Save to local storage
    const localMap = getLocalProfiles();
    localMap[name] = payload;
    setLocalProfiles(localMap);

    // Save to board LittleFS
    try {
        await fetch('/SystemController/boxMapSaveNamed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, data: payload })
        });
    } catch (e) {}

    toast(t('boxProfileSaved') + ': ' + name);
    await boxLoadProfilesList();
    const sel = $('savedMapSelect');
    if (sel) sel.value = name;
}

async function boxLoadNamedProfile() {
    const sel = $('savedMapSelect');
    const input = $('profileNameInput');
    const name = (input && input.value.trim()) || (sel && sel.value) || '';
    if (!name) {
        toast(t('boxNameRequired'));
        return;
    }

    let data = null;

    // 1. Try loading from board
    try {
        const r = await fetch('/SystemController/boxMapLoadNamed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name })
        });
        const d = await r.json();
        if (d.code === 0 && d.data) {
            data = d.data;
        }
    } catch (e) {}

    // 2. Fallback to local storage
    if (!data) {
        const localMap = getLocalProfiles();
        data = localMap[name];
    }

    if (!data) {
        toast(t('failure') + ': ' + name);
        return;
    }

    boxCells = boxSplit(data);
    boxSeen = null;
    boxSel = null;
    if ($('cellEpc')) $('cellEpc').value = '';
    boxSave();
    boxRenderGrid();
    boxRenderArchive();
    await boxSaveNow(true);
    toast(t('boxProfileLoaded') + ': ' + name + ' (' + Object.keys(boxCells).length + ' ' + t('boxCellsFilled') + ')');
}

async function boxDeleteNamedProfile() {
    const sel = $('savedMapSelect');
    const input = $('profileNameInput');
    const name = (input && input.value.trim()) || (sel && sel.value) || '';
    if (!name) {
        toast(t('boxNameRequired'));
        return;
    }

    if (!confirm(t('boxProfileDeleteConfirm') + ' "' + name + '"?')) return;

    // 1. Delete from local storage
    const localMap = getLocalProfiles();
    delete localMap[name];
    setLocalProfiles(localMap);

    // 2. Delete from board
    try {
        await fetch('/SystemController/boxMapDeleteNamed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name })
        });
    } catch (e) {}

    if (input) input.value = '';
    toast(t('boxProfileDeleted') + ': ' + name);
    await boxLoadProfilesList();
}

// ---------------------------------------------------------------------------
// export / import (JSON & CSV)
// ---------------------------------------------------------------------------
function boxExportJson() {
    const input = $('profileNameInput');
    const name = (input && input.value.trim()) || 'boxmap_' + new Date().toISOString().slice(0,10);
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(boxPayload(), null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', dataStr);
    dl.setAttribute('download', name + '.json');
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
}

function boxExportCsv() {
    const input = $('profileNameInput');
    const name = (input && input.value.trim()) || 'boxmap_' + new Date().toISOString().slice(0,10);
    let csv = 'Layer,Row,Col,CellID,EPC,Status\n';
    for (let l = 1; l <= BOX_LAYERS; l++) {
        for (let r = 1; r <= BOX_ROWS; r++) {
            for (let c = 1; c <= BOX_COLS; c++) {
                const id = boxId(l, r, c);
                const epc = boxCells[id] || '';
                const status = epc ? 'ASSIGNED' : 'EMPTY';
                csv += `${l},${r},${c},${id},"${epc}",${status}\n`;
            }
        }
    }
    const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    const dl = document.createElement('a');
    dl.setAttribute('href', dataStr);
    dl.setAttribute('download', name + '.csv');
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
}

function boxImportJson(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const raw = JSON.parse(e.target.result);
            const imported = boxSplit(raw);
            if (imported && typeof imported === 'object') {
                boxCells = imported;
                boxSeen = null;
                boxSel = null;
                if ($('cellEpc')) $('cellEpc').value = '';
                boxSave();
                boxRenderGrid();
                boxRenderArchive();
                await boxSaveNow(true);
                toast(t('boxImportSuccess') + ' (' + Object.keys(boxCells).length + ' ' + t('boxCellsFilled') + ')');
            } else {
                toast(t('boxImportInvalid'));
            }
        } catch (err) {
            toast(t('boxImportInvalid'));
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

function boxInit() {
    boxLoad();
    boxRenderGrid();
    boxRenderArchive();
    boxLoadProfilesList();
    boxSetRunning(false);
    if (typeof reportView === 'function') {
        reportView('boxmap', { count: Object.keys(boxCells).length, msg: 'SIAP' });
    }
    if ($('missingCount')) $('missingCount').textContent = 0;
    if ($('missingBody')) $('missingBody').innerHTML =
        '<tr><td colspan="4" class="empty">' + t('noTags') + '</td></tr>';
}

// Chainway C5 & barcode/RFID hardware scanner wedge listener
document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        const active = document.activeElement;
        if (active && active.id === 'cellEpc') {
            e.preventDefault();
            boxSetEpc();
        }
    }
});

// ---------------------------------------------------------------------------
// REST API / Webhook & JSON Data Export
// ---------------------------------------------------------------------------
const API_SETTINGS_KEY = 'tagmgr_api_config';

function boxGetApiSettings() {
    try {
        return Object.assign({
            url: '',
            method: 'POST',
            authHeader: '',
            autoSendOnScan: false
        }, JSON.parse(localStorage.getItem(API_SETTINGS_KEY) || '{}'));
    } catch (e) {
        return { url: '', method: 'POST', authHeader: '', autoSendOnScan: false };
    }
}

function boxSaveApiSettings() {
    const url = ($('apiUrlInput') ? $('apiUrlInput').value : '').trim();
    const method = ($('apiMethodSelect') ? $('apiMethodSelect').value : 'POST') || 'POST';
    const authHeader = ($('apiAuthInput') ? $('apiAuthInput').value : '').trim();
    const autoSendOnScan = !!($('apiAutoSendCb') && $('apiAutoSendCb').checked);

    const cfg = { url, method, authHeader, autoSendOnScan };
    localStorage.setItem(API_SETTINGS_KEY, JSON.stringify(cfg));
    toast(t('apiConfigSaved'));
    boxCloseApiModal();
}

function boxOpenApiModal() {
    const cfg = boxGetApiSettings();
    if ($('apiUrlInput')) $('apiUrlInput').value = cfg.url;
    if ($('apiMethodSelect')) $('apiMethodSelect').value = cfg.method || 'POST';
    if ($('apiAuthInput')) $('apiAuthInput').value = cfg.authHeader || '';
    if ($('apiAutoSendCb')) $('apiAutoSendCb').checked = !!cfg.autoSendOnScan;
    const m = $('apiConfigModal');
    if (m) m.style.display = 'flex';
}

function boxCloseApiModal() {
    const m = $('apiConfigModal');
    if (m) m.style.display = 'none';
}

function boxGenerateReportJson() {
    const dup = boxDuplicates();
    const dupCells = new Set();
    Object.keys(dup).forEach(e => dup[e].forEach(id => dupCells.add(id)));

    const cellsList = [];
    const missingList = [];
    let filledCount = 0;
    const heardCount = boxSeen ? boxSeen.size : 0;

    for (let l = 1; l <= BOX_LAYERS; l++) {
        for (let r = 1; r <= BOX_ROWS; r++) {
            for (let c = 1; c <= BOX_COLS; c++) {
                const id = boxId(l, r, c);
                const epc = boxCells[id] || '';
                let status = 'EMPTY';
                if (epc) {
                    filledCount++;
                    if (boxSeen) {
                        const matched = boxSeen.has(boxNorm(epc));
                        status = matched ? 'MATCHED' : 'MISSING';
                        if (!matched) {
                            missingList.push({ layer: l, row: r, col: c, cell_id: id, expected_epc: epc });
                        }
                    } else {
                        status = 'ASSIGNED';
                    }
                }
                cellsList.push({
                    cell_id: id,
                    layer: l,
                    row: r,
                    col: c,
                    epc: epc,
                    status: status,
                    is_duplicate: dupCells.has(id)
                });
            }
        }
    }

    const unreg = BOX_CELLS - filledCount;
    const isPass = boxSeen && missingList.length === 0 && unreg === 0;

    const inputName = $('profileNameInput') && $('profileNameInput').value.trim();
    const selName = $('savedMapSelect') && $('savedMapSelect').value;
    const profileName = inputName || selName || 'active_carton_map';

    return {
        event: 'box_carton_report',
        device_ip: location.hostname || 'esp32',
        profile_name: profileName,
        timestamp: new Date().toISOString(),
        summary: {
            total_capacity: BOX_CELLS,
            filled_cells: filledCount,
            tags_heard: heardCount,
            missing_count: missingList.length,
            unregistered_cells: unreg,
            status: boxSeen ? (isPass ? 'PASS' : 'FAIL') : 'READY',
            completion_rate: ((filledCount / BOX_CELLS) * 100).toFixed(1) + '%'
        },
        missing_cells: missingList,
        cells: cellsList
    };
}

async function boxSendToApi(isAuto = false) {
    const cfg = boxGetApiSettings();
    if (!cfg.url) {
        if (!isAuto) {
            boxOpenApiModal();
            toast(t('apiUrlRequired'));
        }
        return false;
    }

    const payload = boxGenerateReportJson();
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.authHeader) {
        headers['Authorization'] = cfg.authHeader;
    }

    toast(t('apiSending'));
    try {
        const res = await fetch(cfg.url, {
            method: cfg.method || 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            toast('✅ API OK (' + res.status + ') - Data terkirim!');
            return true;
        } else {
            toast('⚠️ API Error (' + res.status + ' ' + res.statusText + ')', 4000);
            return false;
        }
    } catch (err) {
        toast('❌ API Gagal: ' + (err.message || 'Network Error'), 4000);
        return false;
    }
}

function boxCopyJson() {
    const payload = boxGenerateReportJson();
    const str = JSON.stringify(payload, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(str).then(() => {
            toast(t('jsonCopied'));
        }).catch(() => {
            boxFallbackCopy(str);
        });
    } else {
        boxFallbackCopy(str);
    }
}

function boxFallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        toast(t('jsonCopied'));
    } catch (e) {
        toast(t('copyFailed'));
    }
    document.body.removeChild(ta);
}

