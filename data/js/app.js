// Shell + i18n: [EN, ID] pairs, with the active index kept in localStorage.
// Follows the URA4 web UI's structure, but its CN column holds Indonesian here., one shared toast, and pages swapped
// into #pageDiv instead of a real navigation.
//
// The reader's own control API is reached through the board (see web.cpp), so
// every call below is a plain POST to /<Controller>/<Action> on the board.

const Lang_EN = 0, Lang_ID = 1;
let lang_flag = Number(localStorage.getItem('lang_flag') ?? Lang_EN);

const L = {
    Inventory: ['Inventory', 'Inventori'],
    boxMap: ['Box Map', 'Peta Dus'],
    raceTiming: ['Race Timing', 'Timing Race'],
    ReadWrite: ['Read-Write', 'Baca-Tulis'],
    LockKill: ['Lock-Kill', 'Kunci-Hapus'],
    Config: ['Config', 'Konfigurasi'],
    Base: ['Base', 'Dasar'],
    Network: ['Network', 'Jaringan'],
    Gpio: ['GPIO', 'GPIO'],
    Mqtt: ['MQTT', 'MQTT'],
    ReaderMode: ['Reader Mode', 'Mode Pembaca'],
    Log: ['Log', 'Log'],
    DeviceInfo: ['Device Info', 'Info Perangkat'],
    Update: ['Upgrade', 'Pemutakhiran'],
    TransferFiles: ['Transfer Files', 'Transfer Berkas'],
    get: ['Get', 'Ambil'],
    set: ['Set', 'Simpan'],
    success: ['success', 'berhasil'],
    failure: ['failure', 'gagal'],
    reboot: ['Reboot', 'Mulai ulang'],
    rebootConfirm: ['Reboot the device?', 'Mulai ulang perangkat?'],

    // ---- inventory ----
    start: ['Start', 'Mulai'],
    stop: ['Stop', 'Berhenti'],
    clearData: ['Clear Data', 'Hapus Data'],
    tagCount: ['Tag Count', 'Jumlah Tag'],
    inventoryCount: ['Inventory Count', 'Jumlah Bacaan'],
    time: ['Time', 'Waktu'],
    index: ['Index', 'No'],
    epc: ['EPC', 'EPC'],
    tid: ['TID', 'TID'],
    user: ['USER', 'USER'],
    pc: ['PC', 'PC'],
    rssi: ['RSSI', 'RSSI'],
    count: ['Count', 'Jumlah'],
    antenna: ['Ant', 'Ant'],
    noTags: ['No tags yet', 'Belum ada tag'],
    inventoryTime: ['Inventory Time', 'Durasi Inventori'],
    backgroundInventory: ['Background Inventory', 'Inventori Latar Belakang'],
    filter: ['Filter', 'Filter'],
    filterBank: ['Filter Bank', 'Bank Filter'],
    filterOffset: ['Filter Offset', 'Offset Filter'],
    filterLength: ['Filter Length', 'Panjang Filter'],
    filterData: ['Filter Data', 'Data Filter'],
    filterDataRequired: ['Filter Data cannot be Empty', 'Data Filter tidak boleh kosong'],
    filterOptional: ['(opsional — kosongkan bila tidak memakai filter pembaca)',
                     '(opsional - biarkan kosong bila tidak memakai filter pembaca)'],
    inventoryTimeInvalid: ['Inventory Time Invalid', 'Durasi Inventori tidak valid'],
    startSuccess: ['Inventory start success', 'Inventori dimulai'],
    startFailure: ['Inventory start failure', 'Inventori gagal dimulai'],
    running: ['Running…', 'Berjalan…'],
    readerOffline: ['Reader offline', 'Pembaca tidak terhubung'],
    loadFirst: ['Read the current settings first', 'Ambil dulu pengaturan saat ini'],
    ipInvalid: ['IP address is invalid', 'Alamat IP tidak valid'],
    fieldRequired: ['Required', 'Wajib diisi'],
    dns2: ['DNS2', 'DNS2'],
    readerConn: ['Reader Connection', 'Koneksi Pembaca'],
    readerIp: ['Reader IP', 'IP Pembaca'],
    scan: ['Scan', 'Pindai'],
    scanning: ['Scanning…', 'Memindai…'],
    scanHint: ['If the address is unknown, Scan sweeps the subnet for the reader.', 'Jika alamatnya tidak diketahui, Pindai akan menelusuri seluruh jaringan untuk mencari pembaca.'],
    scanFound: ['Found', 'Ditemukan'],
    scanNone: ['No reader found', 'Pembaca tidak ditemukan'],
    findReader: ['Find Reader', 'Cari Pembaca'],
    rebootReader: ['Reboot Reader', 'Mulai Ulang Pembaca'],
    rebootBoard: ['Reboot Board', 'Mulai Ulang Board'],
    rebootReaderConfirm: ['Reboot the reader? Any inventory stops, and it takes about a minute to come back.', 'Mulai ulang pembaca? Inventori akan berhenti, dan pembaca perlu sekitar 1 menit untuk siap kembali.'],
    rebootBoardConfirm: ['Reboot the board (ESP32)? The reader is not affected.', 'Mulai ulang board (ESP32)? Pembaca tidak terpengaruh.'],
    netMoves: ['Note: changing network settings moves the reader. The board re-finds and saves its new address automatically.', 'Catatan: mengubah pengaturan jaringan akan memindahkan pembaca. Board akan mencari dan menyimpan alamat barunya secara otomatis.'],
    netAdopted: ['Reader address updated', 'Alamat pembaca diperbarui'],
    whitelist: ['Whitelist', 'Daftar Putih'],
    wlHint: ['Only EPCs in the list appear in the main table; unlisted ones are listed separately. An empty list allows everything.', 'Hanya EPC dalam daftar yang muncul di tabel utama; yang tidak terdaftar ditampilkan terpisah. Daftar kosong berarti semua lolos.'],
    wlLoad: ['Load List', 'Muat Daftar'],
    wlAppend: ['Append', 'Tambah'],
    wlReplace: ['Replace', 'Ganti'],
    wlClear: ['Clear List', 'Kosongkan Daftar'],
    wlSaved: ['Saved', 'Tersimpan'],
    wlUnknown: ['Unlisted', 'Tidak Terdaftar'],

    // ---- box map (layer/row/column grid of a carton) ----
    boxMap: ['Box Map', 'Peta Dus'],
    boxMapHint: ['Click a cell, then read the tag in it. Assigning a tag to the cell you clicked is what fixes its position — read order is not positional.',
                 'Klik satu sel, lalu baca tag di kotak itu. Menempelkan tag ke sel yang Anda klik itulah yang menentukan posisinya — urutan bacaan bukan urutan posisi.'],
    layer: ['Layer', 'Layer'],
    row: ['Row', 'Baris'],
    col: ['Col', 'Kolom'],
    cell: ['Cell', 'Sel'],
    readIntoCell: ['Read Tag', 'Baca Tag'],
    newTag: ['New tag', 'Tag baru'],
    assigned: ['Assigned', 'Terisi'],
    empty: ['Empty', 'Kosong'],
    boxScan: ['Scan Box', 'Pindai Dus'],
    boxVerify: ['Verify', 'Verifikasi'],
    boxClearMap: ['Clear Map', 'Reset Peta'],
    boxClearConfirm: ['Clear the whole tag map? The 96 cell assignments are lost.', 'Hapus seluruh peta tag? Ke-96 isi sel akan hilang.'],
    boxReadFirst: ['Read a tag first', 'Baca tag dulu'],
    boxNoTags: ['No tag detected in 5s — is the tag in the reader field?', 'Tidak ada tag terdeteksi dalam 5s — apakah tag ada di jangkauan pembaca?'],
    boxNeedAssign: ['Select a cell first', 'Pilih sel dulu'],
    boxCellsFilled: ['cells filled', 'sel terisi'],
    boxMissing: ['Missing cells', 'Sel belum terbaca'],
    boxUnexpected: ['Tags not in the map', 'Tag di luar peta'],
    boxAllFound: ['All 96 cells read', 'Ke-96 sel terbaca'],
    boxUntagged: ['Unregistered', 'Belum terdaftar'],
    boxAssignBtn: ['Assign EPC', 'Pasang EPC'],
    autoNext: ['Auto-Next', 'Auto Maju'],
    allLayers: ['All Layers (96)', 'Semua Layer (96)'],
    layer1Tab: ['Layer 1 (32)', 'Layer 1 (32)'],
    layer2Tab: ['Layer 2 (32)', 'Layer 2 (32)'],
    layer3Tab: ['Layer 3 (32)', 'Layer 3 (32)'],
    boxFilter: ['Show', 'Tampilkan'],
    boxAll: ['All', 'Semua'],
    boxLayerN: ['Layer', 'Layer'],
    boxScanning: ['Scanning', 'Memindai'],
    boxReading: ['Reading tag…', 'Membaca tag…'],
    boxScanDone: ['Scan finished', 'Pindai selesai'],
    boxReadDone: ['Read finished', 'Pembacaan selesai'],
    boxStopped: ['Stopped', 'Dihentikan'],
    boxTagsHeard: ['tags heard', 'tag terdengar'],
    boxDup: ['Duplicate EPCs', 'EPC ganda'],
    boxDupWarn: ['Already in', 'Sudah terpasang di'],
    boxStop: ['Stop', 'Hentikan'],
    boxDeleteCell: ['Clear Cell', 'Kosongkan Sel'],
    boxClearCellConfirm: ['Clear this cell?', 'Kosongkan sel ini?'],
    boxSaved: ['Saved to board', 'Tersimpan di board'],
    boxSaveFail: ['Save failed', 'Gagal menyimpan'],
    boxLoaded: ['Map loaded from board', 'Peta dimuat dari board'],
    boxCellCleared: ['Cell cleared', 'Sel dikosongkan'],
    boxShortEpc: ['EPC must be at least 8 hex characters', 'EPC minimal 8 karakter hex'],
    save: ['Save', 'Simpan'],
    saving: ['Saving…', 'Menyimpan…'],
    unsaved: ['Unsaved changes', 'Ada perubahan belum disimpan'],

    // ---- box map database / profiles ----
    boxActions: ['Tag Operations', 'Operasi Tag'],
    boxCellTarget: ['Target Cell & EPC', 'Sel Target & EPC'],
    boxMapDatabase: ['Map Profiles & Database', 'Database & Profil Peta'],
    boxSaveProfile: ['Save As', 'Simpan'],
    boxLoadProfile: ['Load', 'Muat'],
    boxDeleteProfile: ['Delete', 'Hapus'],
    boxProfileName: ['Profile Name', 'Nama Profil'],
    boxSelectProfile: ['Select saved map...', '-- Pilih Peta Tersimpan --'],
    boxExportJson: ['Export JSON', 'Ekspor JSON'],
    boxExportCsv: ['Export CSV', 'Ekspor CSV'],
    boxImportJson: ['Import JSON', 'Impor JSON'],
    boxProfileSaved: ['Profile saved', 'Profil tersimpan'],
    boxProfileLoaded: ['Profile loaded', 'Profil dimuat'],
    boxProfileDeleted: ['Profile deleted', 'Profil dihapus'],
    boxProfileDeleteConfirm: ['Delete this saved map profile?', 'Hapus profil peta tersimpan ini?'],
    boxNameRequired: ['Please enter a profile name', 'Silakan masukkan nama profil'],
    boxImportSuccess: ['Map imported successfully', 'Peta berhasil diimpor'],
    boxImportInvalid: ['Invalid map file format', 'Format berkas peta tidak valid'],
    sendApi: ['Send to API', 'Kirim API'],
    copyJson: ['Copy JSON', 'Salin JSON'],
    apiConfig: ['API / Webhook', 'API / Webhook'],
    apiUrl: ['API Endpoint URL', 'URL Endpoint API'],
    apiAuth: ['Authorization Header (Optional)', 'Header Otorisasi (Opsional)'],
    apiAutoSend: ['Auto-send to API after carton scan', 'Otomatis kirim ke API setelah scan dus'],
    apiMethod: ['Method', 'Metode'],
    testApi: ['Test Send', 'Tes Kirim'],
    cancel: ['Cancel', 'Batal'],
    apiUrlRequired: ['Please set API URL in settings', 'Masukkan URL API di pengaturan'],
    apiConfigSaved: ['API settings saved', 'Pengaturan API tersimpan'],
    apiSending: ['Sending to API...', 'Mengirim data ke API...'],
    jsonCopied: ['JSON copied to clipboard!', 'JSON disalin ke clipboard!'],
    copyFailed: ['Failed to copy', 'Gagal menyalin'],

    // ---- box map: cleared-cell archive ----
    boxArchive: ['Cleared / replaced', 'Dikosongkan / diganti'],
    boxArchiveEmpty: ['Archive is empty', 'Arsip kosong'],
    boxArchiveHint: ['Values cleared or overwritten, newest first. Select a cell, then Restore to put one back.',
                     'Nilai yang dikosongkan atau tertimpa, terbaru dulu. Pilih sel, lalu Pulihkan untuk memasangnya kembali.'],
    boxArchiveClear: ['Discard list', 'Buang daftar'],
    boxArchiveClearConfirm: ['Discard the list of cleared cells? The cells themselves are not affected, but the values will no longer be recoverable.',
                             'Buang daftar sel yang dikosongkan? Isi sel tidak terpengaruh, tetapi nilainya tidak bisa dipulihkan lagi.'],
    boxArchived: ['saved to the list', 'masuk ke daftar'],
    boxRestore: ['Restore', 'Pulihkan'],
    boxWhen: ['When', 'Kapan'],
    wlCount: ['List entries', 'Isi daftar'],
    wlTooLarge: ['List too large', 'Daftar terlalu besar'],
    wlPlaceholder: ['One EPC per line; # for comments', 'Satu EPC per baris; # untuk komentar'],
    wlWipeConfirm: ['Replacing with an empty box deletes the whole list. Continue?', 'Mengganti dengan kotak kosong akan menghapus seluruh daftar. Lanjutkan?'],
    // ---- read / write ----
    parameter: ['Parameter', 'Parameter'],
    rwBank: ['Memory Bank', 'Bank Memori'],
    rwOffset: ['Word Offset', 'Offset Kata'],
    rwLength: ['Word Length', 'Panjang Kata'],
    rwPassword: ['Access Password', 'Kata Sandi Akses'],
    rwData: ['Tag Data', 'Data Tag'],
    read: ['Read', 'Baca'],
    write: ['Write', 'Tulis'],
    writeDataRequired: ['Write data cannot be Empty', 'Data tulis tidak boleh kosong'],
    rwBusy: ['Reader is busy inventorying', 'Pembaca sedang sibuk inventori'],
    rwNotFound: ['Tag not found (may be out of range)', 'Tag tidak ditemukan (mungkin di luar jangkauan)'],
    rwWriteWarn: ['Writing permanently changes the tag data and cannot be undone. Continue?', 'Menulis akan mengubah data tag secara permanen dan tidak bisa dibatalkan. Lanjutkan?'],
    netWarn: ['Changing network settings can make the reader unreachable. Continue?', 'Mengubah pengaturan jaringan bisa membuat pembaca tidak terjangkau. Lanjutkan?'],

    // ---- config groups ----
    device: ['Device', 'Perangkat'],
    deviceName: ['Device Name', 'Nama Perangkat'],
    location: ['Location', 'Lokasi'],
    oled: ['OLED Display', 'Tampilan OLED'],
    oledEnable: ['Enable', 'Aktifkan'],
    brightness: ['Brightness', 'Kecerahan'],
    flip180: ['Rotate 180°', 'Putar 180°'],

    power: ['Power', 'Daya'],
    ant: ['Ant', 'Ant'],
    frequency: ['Frequency', 'Frekuensi'],
    searchMode: ['Search Mode', 'Mode Pencarian'],
    memoryBank: ['Memory Bank', 'Bank Memori'],
    tagReporting: ['Tag Reporting', 'Pelaporan Tag'],
    heartbeatPacket: ['Heartbeat', 'Detak'],
    linkFrequency: ['Link Frequency', 'Frekuensi Tautan'],
    buzzerForInventory: ['Buzzer', 'Buzzer'],
    tagfocus: ['TagFocus', 'TagFocus'],
    fastID: ['FastID', 'FastID'],
    afterNetworkDisconnected: ['After Network Lost', 'Setelah Jaringan Putus'],

    session: ['Session', 'Sesi'],
    target: ['Target', 'Target'],
    wordUserOffset: ['User Offset', 'Offset User'],
    wordUserLength: ['User Length', 'Panjang User'],
    dupFilter: ['Duplicate Tag Filter', 'Filter Tag Duplikat'],
    filterTime: ['Filter Time', 'Waktu Filter'],
    rssiFilter: ['RSSI Filter', 'Filter RSSI'],
    rssiGt: ['RSSI is greater than', 'RSSI lebih besar dari'],
    reportMode: ['Reporting Mode', 'Mode Pelaporan'],
    realTime: ['Real Time', 'Waktu Nyata'],
    afterStop: ['After Stop Inventory', 'Setelah Inventori Berhenti'],
    hbEnable: ['Enable Interval', 'Aktifkan Interval'],
    hbInterval: ['Interval Time', 'Interval'],
    second: ['s', 'dtk'],
    enable: ['Enable', 'Aktifkan'],
    cacheTags: ['Cache Tags', 'Simpan Tag di Cache'],
    currentIP: ['Current IP', 'IP Saat Ini'],
    ethernet: ['Ethernet', 'Ethernet'],
    wifi: ['WiFi', 'WiFi'],
    tcpServicePort: ['TCP Service Port', 'Port Layanan TCP'],
    gpo: ['GPO', 'GPO'],
    gpi: ['GPI', 'GPI'],
    normalConfig: ['Normal Config', 'Konfigurasi Normal'],
    iot: ['IoT', 'IoT'],
    readerMode: ['Reader Mode', 'Mode Pembaca'],
    readerRole: ['Reader Role', 'Peran Pembaca'],
    triggerMode: ['Trigger Mode', 'Mode Pemicu'],
    log: ['Log', 'Log'],
    refresh: ['Refresh', 'Muat Ulang'],
    clearLog: ['Clear', 'Kosongkan'],

    // Same in both languages, but every entry must be a [CN, EN] array: t()
    // indexes it with lang_flag, so a plain string yields a single character.
    chip: ['Chip', 'Chip'],
    cores: ['Cores', 'Inti'],
    cpu: ['CPU', 'CPU'],
    mac: ['MAC', 'MAC'],
    ip: ['IP', 'IP'],
    link: ['Link', 'Tautan'],
    speed: ['Speed', 'Kecepatan'],
    uptime: ['Uptime', 'Waktu Aktif'],
    freeHeap: ['Free Heap', 'Memori Bebas'],
    flash: ['Flash', 'Flash'],
    sdk: ['SDK', 'SDK'],
    firmware: ['Firmware', 'Firmware'],
    reader: ['URA4', 'URA4'],

    // ---- reader config extras ----
    gateway: ['Gateway', 'Gateway'],
    subnetMask: ['Subnet Mask', 'Subnet Mask'],
    dns1: ['DNS1', 'DNS1'],
    dns2: ['DNS2', 'DNS2'],
    dhcp: ['DHCP', 'DHCP'],
    staticIp: ['Static', 'Statik'],
    ipSettings: ['IP Settings', 'Pengaturan IP'],
    ipAddress: ['IP Address', 'Alamat IP'],
    wifiSwitch: ['WiFi Switch', 'Sakelar WiFi'],
    accessPassword: ['Password', 'Kata Sandi'],
    security: ['Security', 'Keamanan'],
    proxy: ['Proxy', 'Proxy'],
    auto: ['Auto', 'Otomatis'],
    rawData: ['Raw Data', 'Data Raw'],
    jsonData: ['JSON Data', 'Data JSON'],
    tcpServicePort: ['TCP Service Port', 'Port Layanan TCP'],
    gpo: ['GPO', 'GPO'],
    gpi: ['GPI', 'GPI'],
    high: ['High', 'Tinggi'],
    low: ['Low', 'Rendah'],
    normalConfig: ['Normal Config', 'Konfigurasi Normal'],
    iot: ['IoT', 'IoT'],
    yes: ['Yes', 'Ya'],
    no: ['No', 'Tidak'],
    hostName: ['Host Name', 'Nama Host'],
    clientId: ['Client ID', 'Client ID'],
    userName: ['User Name', 'Nama Pengguna'],
    userPsw: ['Password', 'Kata Sandi'],
    publishTopics: ['Publish Topics', 'Topik Publikasi'],
    tagEventTopic: ['Tag Event Topic', 'Topik Event Tag'],
    heartbeatTopic: ['Heartbeat Topic', 'Topik Detak'],
    subscribeTopic: ['Subscribe Topic', 'Topik Langganan'],
    add: ['Add', 'Tambah'],
    topics: ['Topics', 'Topik'],
    productKey: ['Product Key', 'Product Key'],
    productSecret: ['Product Secret', 'Product Secret'],
    deviceName: ['Device Name', 'Nama Perangkat'],
    deviceSecret: ['Device Secret', 'Device Secret'],
    iotEnable: ['Enable', 'Aktifkan'],
    readerRole: ['Reader Role', 'Peran Pembaca'],
    protocol: ['Protocol', 'Protokol'],
    dataType: ['Data Type', 'Tipe Data'],
    triggerInventoryMode: ['Trigger Mode', 'Mode Pemicu'],
    signal: ['Signal', 'Sinyal'],
    stopDelayTime: ['Stop Delay', 'Tunda Berhenti'],
    startCondition: ['Start Condition', 'Kondisi Mulai'],
    stopCondition: ['Stop Condition', 'Kondisi Berhenti'],
    debug: ['Debug', 'Debug'],
    level: ['Level', 'Level'],
    browserLog: ['Browser Log', 'Log Browser'],
    open: ['Open', 'Buka'],
    close: ['Close', 'Tutup'],
    readerSettings: ['Reader Settings', 'Pengaturan Pembaca'],
    antPort: ['Ant', 'Ant'],
    port: ['Port', 'Port'],
    gatewayCurrent: ['Gateway (current)', 'Gateway (saat ini)'],
    subnetCurrent: ['Subnet Mask (current)', 'Subnet Mask (saat ini)'],
    mqttEnable: ['MQTT Master', 'Sakelar Utama MQTT'],
    normalEnable: ['Enable Normal', 'Aktifkan Normal'],
    iotEnableLabel: ['Enable IoT', 'Enable IoT'],
    todo: ['This page is not implemented yet.', 'Halaman ini belum dibuat.'],
    // GPO/GPI labels are the same in both languages, but t() indexes the entry
    // with lang_flag, so a plain string would yield a single character.
    gpo1: ['GPO1', 'GPO1'],
    gpo2: ['GPO2', 'GPO2'],
    gpo3: ['GPO3', 'GPO3'],
    gpo4: ['GPO4', 'GPO4'],
    gpo5: ['GPO5', 'GPO5'],
    gpo6: ['GPO6', 'GPO6'],
    gpi1: ['GPI1', 'GPI1'],
    gpi2: ['GPI2', 'GPI2'],
    gpi3: ['GPI3', 'GPI3'],
    gpi4: ['GPI4', 'GPI4'],

    // ---- race timing ----
    raceTiming: ['Race Timing', 'Timing Balap / Lari'],
    gunStart: ['Gun Start', 'Mulai Lomba (Gun Start)'],
    stopRace: ['Stop Race', 'Hentikan Lomba'],
    resetRace: ['Reset Race', 'Reset Lomba'],
    raceTimer: ['Race Clock', 'Waktu Lomba'],
    leaderboard: ['Live Leaderboard', 'Papan Peringkat'],
    runnersList: ['Runners Database', 'Daftar Peserta (BIB)'],
    rawReads: ['Raw RFID Reads', 'Log Tag Mentah'],
    bibNumber: ['BIB #', 'No. BIB'],
    runnerName: ['Runner Name', 'Nama Peserta'],
    category: ['Category', 'Kategori'],
    chipEpc: ['Tag EPC', 'EPC Tag RFID'],
    finishTime: ['Finish Time', 'Waktu Finish'],
    rank: ['Rank', 'Peringkat'],
    registeredRunners: ['Registered', 'Terdaftar'],
    finishedRunners: ['Finished', 'Finish'],
    onTrackRunners: ['On Track', 'Masih Lari'],
    addRunner: ['Add Runner', 'Tambah Peserta'],
    minLapFilter: ['Min Re-read (s)', 'Filter Re-read (dtk)'],
    exportResults: ['Export Results', 'Ekspor Hasil'],
    raceTitle: ['Race Event Title', 'Nama Event Lomba'],
    raceReady: ['Ready to start', 'Siap dimulai'],
    raceRunning: ['Race in progress', 'Lomba sedang berlangsung'],
    raceStopped: ['Race stopped', 'Lomba dihentikan'],
    finisherAlert: ['New Finisher', 'Peserta Masuk Finish']
};
const t = k => (L[k] ? L[k][lang_flag] : k);
const $ = id => document.getElementById(id);
const chk = id => $(id).checked;

const PAGES = ['inventory', 'box_map', 'race_timing', 'read_write', 'lock_kill', 'device_info', 'upgrade',
               'transfer', 'config_base', 'config_network', 'config_gpio',
               'config_mqtt', 'config_reader', 'config_log'];

function showPage(page) {
    if (PAGES.indexOf(page) < 0) page = PAGES[0];
    $('pageDiv').innerHTML = '<iframe src="' + page + '.html"></iframe>';
    sessionStorage.setItem('page', page);
    if (page === 'inventory') reportView('inventory');
    else if (page === 'box_map') reportView('boxmap');
    else if (page === 'race_timing') reportView('race_timing');
    else if (page === 'read_write') reportView('readwrite');
    else reportView('default');

    if (window.innerWidth <= 768 && $('checkbox')) {
        $('checkbox').checked = false;
    }
}

function toggleSecondUl() {
    $('second_ul').classList.toggle('open');
    $('configSecondUlImage').classList.toggle('open');
}

function toggleRaceSecondUl() {
    const ul = $('race_second_ul');
    const icon = $('raceSecondUlImage');
    if (ul) ul.classList.toggle('open');
    if (icon) icon.classList.toggle('open');

    const curPage = sessionStorage.getItem('page');
    if (curPage !== 'race_timing') {
        const curTab = sessionStorage.getItem('race_active_tab') || 'leaderboard';
        showRaceTab(curTab);
    }
}

function showRaceTab(tab) {
    sessionStorage.setItem('race_active_tab', tab);

    const ul = $('race_second_ul');
    const icon = $('raceSecondUlImage');
    if (ul && !ul.classList.contains('open')) ul.classList.add('open');
    if (icon && !icon.classList.contains('open')) icon.classList.add('open');

    const curPage = sessionStorage.getItem('page');
    if (curPage === 'race_timing') {
        try {
            const ifr = $('pageDiv') ? $('pageDiv').querySelector('iframe') : null;
            if (ifr && ifr.contentWindow && typeof ifr.contentWindow.raceSetTab === 'function') {
                ifr.contentWindow.raceSetTab(tab);
                return;
            }
        } catch (e) {}
    }

    showPage('race_timing');
}

function langChange() {
    lang_flag = lang_flag === Lang_EN ? Lang_ID : Lang_EN;
    localStorage.setItem('lang_flag', lang_flag);
    location.reload();
}

// The toast element lives in the shell, but every page runs in its own iframe,
// so from a page this looks up into the parent document. Without that lookup
// #toast was missing on every sub-page and toast() returned early — no message
// ever appeared, from any page, for any reason.
function toast(msg, duration = 1800) {
    let doc = document;
    let m = doc.getElementById('toast');
    if (!m && window.parent && window.parent !== window) {
        try {
            doc = window.parent.document;
            m = doc.getElementById('toast');
        } catch (e) {
            doc = null;   // cross-origin parent: nothing we can do
        }
    }
    if (!m) return;

    m.textContent = msg;
    m.classList.add('show');
    clearTimeout(m._t);
    m._t = setTimeout(() => m.classList.remove('show'), duration);
}

function i18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPh);
    });
}

// ---------------------------------------------------------------------------
// transport to the reader, via the board
// ---------------------------------------------------------------------------
// The reader expects an x-www-form-urlencoded body of `data=<json>`, which is
// what its own pages send. Anything else and it answers with an empty body.
function reader(path, payload, timeoutMs) {
    const body = 'data=' + encodeURIComponent(JSON.stringify(payload || {}));
    const opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
    };
    if (timeoutMs) {
        try {
            if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
                opts.signal = AbortSignal.timeout(timeoutMs);
            }
        } catch (e) {}
    }
    return fetch(path, opts).then(r => {
        if (r.status === 502) throw new Error(t('readerOffline'));
        return r.json();
    });
}

// ---------------------------------------------------------------------------
// inventory
//
// Follows the reader's own page: tags accumulate in a local list and are only
// ever added or updated, never removed. An earlier version re-rendered straight
// from each poll, so a tag the reader had not re-reported in that instant
// vanished from the table — which is what "tags sometimes disappear" was.
//
// The reader also only emits the fields the configured memory bank covers, so
// tidHex/userHex are absent unless that bank is selected in Config Base.
// ---------------------------------------------------------------------------
let invTags = [];        // by index, mirrors the reader's own ordering
let invCount = 0;        // total reads, summed from each tag's count
let invRunning = false;
let invTimer = null;     // poll chain
let invStopTimer = null; // autostop, mirrors the reader's own
let invStartTime = 0;
let invView = '';      // which page this client is showing, for the board's OLED

function invSetRunning(on) {
    invRunning = on;
    const b = $('btnStart');
    if (b) {
        // A <button> shows its textContent, not its value — setting .value
        // (which works for <input type="button">) left the label stuck on Start.
        b.textContent = on ? t('stop') : t('start');
        b.classList.toggle('running', on);
    }
    // Clearing mid-run would wipe the list while the reader keeps reporting
    // into it, so it is disabled until the inventory stops (as on the reader's
    // own page).
    const clr = $('btnClearData');
    if (clr) clr.disabled = on;
}

function invRender() {
    const body = $('tbody');
    if (!body) return;
    $('tagCount').textContent = invTags.length;
    $('inventoryCount').textContent = invCount;

    if (!invTags.length) {
        body.innerHTML = '<tr><td colspan="8" class="empty">' + t('noTags') + '</td></tr>';
        return;
    }
    body.innerHTML = invTags.map((x, i) =>
        '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td class="mono">' + (x.epcHex || '') + '</td>' +
        '<td class="mono">' + (x.tidHex || '') + '</td>' +
        '<td class="mono">' + (x.userHex || '') + '</td>' +
        '<td>' + (x.rssi != null ? x.rssi : '') + '</td>' +
        '<td class="mono">' + (x.pcHex || '') + '</td>' +
        '<td>' + (x.antennaPort != null ? x.antennaPort : '') + '</td>' +
        '<td>' + (x.count != null ? x.count : '') + '</td>' +
        '</tr>').join('');
}

// ---------------------------------------------------------------------------
// EPC whitelist.
//
// The reader's own hardware filter does not work on this unit, so the list is
// matched here: every tag the reader reports is checked against the set, and
// anything not on it is kept aside instead of being shown as a normal tag.
//
// Held as a Set for O(1) lookup — a 100-entry list checked against a fast
// stream of tags is not the place for a linear scan.
// ---------------------------------------------------------------------------
let wlSet = new Set();
let wlLoaded = false;
let unknownTags = [];   // tags seen that are not on the list

function wlNormalise(epc) {
    return (epc || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
}

function wlAllowed(epc) {
    if (!wlSet.size) return true;   // no list configured: allow everything
    return wlSet.has(wlNormalise(epc));
}

function wlRebuild(text) {
    wlSet = new Set();
    (text || '').split(/\r?\n/).forEach(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return;
        const epc = wlNormalise(t);
        if (epc) wlSet.add(epc);
    });
    wlLoaded = true;
    const c = $('wlCount');
    if (c) c.textContent = wlSet.size;
}

function wlLoad() {
    return fetch('/SystemController/epcList')
        .then(r => r.json())
        .then(d => {
            wlRebuild(d.text);
            // The textarea has to be filled too. Loading only into memory left
            // the box looking empty while the board held a list — and pressing
            // Replace then wrote that emptiness back, wiping it.
            const ta = $('wlText');
            if (ta) ta.value = d.text || '';
            return d;
        })
        .catch(() => { wlLoaded = true; });
}

// Sends the textarea either as a replacement or as an append.
function wlSave(append) {
    const ta = $('wlText');
    const text = ta ? ta.value : '';

    // Replacing with an empty box would silently delete the whole list, which
    // is almost never what someone means. Clearing is what the Clear button is
    // for, so this asks first.
    if (!append && !text.trim() && wlSet.size > 0) {
        if (!confirm(t('wlWipeConfirm'))) return;
    }

    const body = append ? { append: text } : { text: text };
    fetch('/SystemController/epcList', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(r => r.json()).then(d => {
        if (d.code !== 0) { toast(d.message || t('failure')); return; }
        toast(t('wlSaved') + ' (' + d.count + ')');
        wlLoad();
    }).catch(() => toast(t('failure')));
}

function wlClear() {
    fetch('/SystemController/epcClear', { method: 'POST' })
        .then(r => r.json())
        .then(() => { toast(t('success')); wlLoad(); invRender(); })
        .catch(() => toast(t('failure')));
}

// Applies one poll. An empty list is ignored rather than clearing the table:
// the reader stops reporting the instant an inventory pauses, and wiping the
// table then is what made tags appear to vanish. The reader's own page behaves
// the same way — it only acts when there is something to act on.
//
// Tags are keyed by EPC, NOT by the reader's `index`. Measured: the reader
// renumbers index mid-inventory (one tag went from index 2 to index 3 and came
// back flagged isNewTag), so keying on it produced the same tag twice in the
// table. The EPC is the tag's actual identity and does not move.
function invApply(data) {
    const list = data && data.data;
    if (!list || !list.length) return;

    let added = false;
    let unknownAdded = false;

    list.forEach(tag => {
        const key = wlNormalise(tag.epcHex);

        // Whitelist: a tag not on the list never reaches the main table.
        if (!wlAllowed(tag.epcHex)) {
            const seen = unknownTags.find(u => wlNormalise(u.epcHex) === key);
            if (seen) {
                seen.count += tag.count || 0;
                seen.rssi = tag.rssi;
                seen.antennaPort = tag.antennaPort;
            } else {
                unknownTags.push(Object.assign({}, tag));
                unknownAdded = true;
            }
            return;
        }

        const known = invTags.find(t => wlNormalise(t.epcHex) === key);
        if (!known) {
            invTags.push(tag);
            invCount += tag.count || 0;
            added = true;
        } else {
            known.rssi = tag.rssi;
            known.antennaPort = tag.antennaPort;
            known.count += tag.count || 0;
            invCount += tag.count || 0;
        }
    });

    if (added) {
        invRender();
    } else {
        invUpdateCells(list);
    }
    if (unknownAdded) invRenderUnknown();

    $('tagCount').textContent = invTags.length;
    $('inventoryCount').textContent = invCount;

    const lastTag = list && list.length ? list[list.length - 1] : null;
    sendInvStatus(lastTag ? { epc: lastTag.epcHex } : {});
}

// Unlisted tags get their own list rather than being folded into the table:
// seeing them at all is the point, since an unexpected EPC is worth noticing.
function invRenderUnknown() {
    const body = $('unknownBody');
    if (!body) return;
    const n = $('unknownCount');
    if (n) n.textContent = unknownTags.length;
    const box = $('unknownBox');
    if (box) box.style.display = unknownTags.length ? '' : 'none';

    body.innerHTML = unknownTags.map(x =>
        '<tr>' +
        '<td class="mono">' + (x.epcHex || '') + '</td>' +
        '<td>' + (x.rssi != null ? x.rssi : '') + '</td>' +
        '<td>' + (x.antennaPort != null ? x.antennaPort : '') + '</td>' +
        '<td>' + (x.count != null ? x.count : '') + '</td>' +
        '</tr>').join('');
}

// Refreshes only the cells that change for tags already on screen.
// Refreshes only the cells that change for tags already on screen. The row is
// found by EPC for the same reason the merge is: the reader's index moves, and
// using it here would have written values into the wrong row.
function invUpdateCells(list) {
    const tbody = $('tbody');
    if (!tbody) return;
    list.forEach(tag => {
        const key = wlNormalise(tag.epcHex);
        const i = invTags.findIndex(t => wlNormalise(t.epcHex) === key);
        if (i < 0) return;
        const row = tbody.rows[i];
        if (!row) return;
        const t = invTags[i];
        row.cells[4].textContent = t.rssi != null ? t.rssi : '';
        row.cells[6].textContent = t.antennaPort != null ? t.antennaPort : '';
        row.cells[7].textContent = t.count != null ? t.count : '';
    });
}

// Polls back-to-back with no idle gap, like the reader's own page: any delay
// between polls is added straight onto how long a newly seen tag takes to show.
function invPoll() {
    clearTimeout(invTimer);
    if (!invRunning) return;
    reader('/InventoryController/tagReportingDataAndIndex', {}, 8000)
        .then(d => { invApply(d); invPoll(); })
        .catch(e => { invSetRunning(false); toast(e.message || t('failure')); });
}

function invStart() {
    if (!invRunning && invCount === 0) { invTags = []; invRender(); }

    const secs = Number($('inventoryTime') && $('inventoryTime').value);
    if ($('inventoryTime') && $('inventoryTime').value !== '' &&
        (isNaN(secs) || secs <= 0)) {
        toast(t('inventoryTimeInvalid'));
        return;
    }

    const param = {
        type: 'Reader-startInventoryRequest',
        backgroundInventory: chk('bgInventoryTrue'),
        tagFilter: { tagMemoryBank: 'epc', bitOffset: 0, bitLength: 0, hexMask: null }
    };
    // The reader filter is opt-in by filling the mask in. It is NOT enough for
    // the options panel to be open: that panel also holds the whitelist, which
    // is unrelated to the reader filter, so requiring a mask just because the
    // panel is open blocked Start for anyone using only the whitelist.
    const mask = $('filterData') ? $('filterData').value.trim() : '';
    if (mask) {
        param.tagFilter = {
            tagMemoryBank: $('select_filterBank').value,
            bitOffset: Number($('filterOffset').value),
            bitLength: Number($('filterLength').value),
            hexMask: mask
        };
    }
    if ($('inventoryTime').value !== '') {
        param.stopInventoryCondition = { autostop: { delayTime: { time: secs * 1000 } } };
    }

    reader('/InventoryController/startInventoryRequest', param, 12000)
        .then(d => {
            if (d.code === 0) {
                invSetRunning(true);
                invStartTime = performance.now();
                invTick();
                toast(t('startSuccess'));
                invPoll();

                // Stop from this side too, at the same moment the reader stops
                // itself. The reader's own autostop halts scanning but sends no
                // event, so without this the UI kept counting past the limit
                // and still showed Stop as if an inventory were running.
                clearTimeout(invStopTimer);
                if ($('inventoryTime').value !== '' && secs > 0) {
                    invStopTimer = setTimeout(invStop, secs * 1000);
                }
            } else {
                toast(t('startFailure'));
            }
        })
        .catch(e => toast(e.message || t('startFailure')));
}

function invStop() {
    clearTimeout(invStopTimer);
    invSetRunning(false);
    clearTimeout(invTimer);
    reader('/InventoryController/stopInventoryRequest', { type: 'Reader-stopInventoryRequest' }, 12000)
        .then(() => {})
        .catch(() => {});
}

// Elapsed-time readout, refreshed on animation frames like the reader's page.
// Stops at the configured limit rather than running on: the reader is done
// scanning by then, so a counter still climbing is simply wrong.
function invTick() {
    if (!invRunning) return;
    const el = $('time');
    const limit = Number($('inventoryTime') && $('inventoryTime').value);
    const elapsed = (performance.now() - invStartTime) / 1000;
    if (el) el.textContent = elapsed.toFixed(1);
    if (!isNaN(limit) && limit > 0 && elapsed >= limit) return;
    requestAnimationFrame(invTick);
}

function invClear() {
    reader('/InventoryController/clearCacheTagAndIndex', {}, 10000)
        .then(() => {
            invTags = [];
            unknownTags = [];
            invCount = 0;
            if ($('time')) $('time').textContent = '0';
            invRender();
            invRenderUnknown();
        })
        .catch(e => toast(e.message || t('failure')));
}

// Tells the board that the Inventory page is in use, so its OLED switches to
// the tag count. One-way on purpose: the board never switches back on its own,
// so losing the browser or walking away leaves the count on screen. The board
// needs the count itself refreshed, which is why this rides along with the poll.
function reportView(name, extra) {
    invView = name;
    sendInvStatus(extra);
}

function sendInvStatus(extra) {
    // Fire-and-forget on purpose: the next poll must not wait on this, and the
    // board does no reader I/O for it, so it cannot slow the tag stream down.
    const payload = Object.assign({
        count: invTags.length,
        running: invRunning,
        view: invView
    }, extra || {});
    fetch('/SystemController/inventoryStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch(() => {});
}

window.addEventListener('beforeunload', () => {
    // Say goodbye so the panel does not wait out the timeout, and stop any
    // inventory so the reader is not left scanning.
    sendInvStatus();
    if (invRunning) invStop();
});

function invInit() {
    invSetRunning(false);
    invRender();
    wlLoad();
    reportView('inventory');
    // One checkbox opens both the reader filter and the whitelist.
    if ($('cbOptions')) {
        $('cbOptions').addEventListener('change', function () {
            const on = this.checked ? '' : 'none';
            $('fieldsetOptions').style.display = on;
            $('wlBox').style.display = on;
        });
    }
    // Filter Length follows the hex mask: 1 hex digit is 4 bits, so 24 digits
    // is 96 bits. Counting them by hand is the easy mistake to make here.
    // The field stays editable — typing a length by hand works until the mask
    // changes again, which is when it re-syncs.
    if ($('filterData')) {
        $('filterData').addEventListener('input', function () {
            // Ignore separators: masks are often pasted as "E2 00 19" or
            // "E2:00:19", which would otherwise inflate the count.
            const digits = this.value.replace(/[^0-9a-fA-F]/g, '').length;
            if (digits === 0) return;   // leave the length alone while empty
            $('filterLength').value = digits * 4;
        });
    }
    // Start from a clean slate, as the reader's own page does. Without this the
    // reader may still hold tags from a previous run, and their indices would
    // not line up with a freshly emptied table.
    invClear();
}

// ---------------------------------------------------------------------------
// config groups — one map drives both directions, so Set and Get cannot drift
// ---------------------------------------------------------------------------
const GROUP_FIELDS = {
    device: { deviceName: 'deviceName', location: 'location' },
    reader: { ura4Host: 'ura4Host', ura4Port: 'ura4Port' },
    oled:   { oledEnable: 'oledEnable', oledBrightness: 'oledBrightness',
              oledFlip: 'oledFlip' }
};

function put(id, v) {
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
}

function readCtl(id) {
    const el = $(id);
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number')   return Number(el.value);
    return el.value;
}

function applyGroup(group, data) {
    const fields = GROUP_FIELDS[group];
    if (!fields) return;
    for (const key of Object.keys(fields)) {
        if (key in data) put(fields[key], data[key]);
    }
    if (group === 'oled') applyOledPreview();
}

function applyOledPreview() {
    const on = chk('oledEnable');
    $('oledBrightness').disabled = !on;
    $('oledFlip').disabled = !on;
}

function setGroup(group) {
    const body = { [group]: {} };
    for (const [key, id] of Object.entries(GROUP_FIELDS[group])) {
        body[group][key] = readCtl(id);
    }
    fetch('/BoardConfiguration/updateBaseConfigurationRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(r => r.json()).then(res => {
        const g = res.result && res.result[group];
        toast(g && g.code === 0 ? t('success') : (g ? g.message : t('failure')));
    }).catch(() => toast(t('failure')));
}

function getGroup(group) {
    fetch('/BoardConfiguration/queryBaseConfigurationRequest', { method: 'POST' })
        .then(r => r.json()).then(res => {
            if (!res.result || !res.result[group]) return;
            applyGroup(group, res.result[group]);
            toast(t('success'));
        }).catch(() => toast(t('failure')));
}

function loadBoardConfig() {
    fetch('/BoardConfiguration/queryBaseConfigurationRequest', { method: 'POST' })
        .then(r => r.json()).then(res => {
            if (!res.result) return;
            for (const g of Object.keys(GROUP_FIELDS)) applyGroup(g, res.result[g] || {});
        }).catch(() => {});
}

// ---------------------------------------------------------------------------
// reader config — one fieldset per group, mirroring the reader's own pages
// ---------------------------------------------------------------------------
const BASE_FUNCTIONS = ['antennaPower', 'antennaEnabledState', 'frequency',
    'inventorySearchMode', 'inventoryMemoryBank', 'tagReporting',
    'heartbeatPacket', 'buzzerForInventory', 'tagfocus', 'fastID',
    'linkFrequency', 'afterNetworkDisconnected'];

// Fetches the reader's base configuration and hands the parsed result to `cb`.
function readerBaseConfig(cb) {
    reader('/BaseConfigurationController/queryBaseConfigurationRequest',
        { type: 'Reader-queryBaseConfigurationRequest',
          functionList: BASE_FUNCTIONS.map(name => ({ name })) }, 12000)
        .then(cb)
        .catch(e => toast(e.message || t('failure')));
}

// A generic fieldset: reads its controls into the request body, POSTs, and
// reports the group's own code so one bad group cannot hide the others.
function readerSet(path, payload, onDone) {
    reader(path, payload, 12000)
        .then(d => {
            toast(d.code === 0 ? t('success') : (d.message || t('failure')));
            if (onDone) onDone(d);
        })
        .catch(e => toast(e.message || t('failure')));
}

// ---------------------------------------------------------------------------
// device info
// ---------------------------------------------------------------------------
function loadDeviceInfo() {
    fetch('/SystemController/deviceInfo').then(r => r.json()).then(d => {
        const up = s => `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m ${s % 60}s`;
        // Labels go through t(), not the raw L entry: every entry is a
        // [CN, EN] array, so using L.x directly printed the whole array.
        const rows = [
            [t('chip'), d.chip], [t('cores'), d.cores], [t('cpu'), d.cpuMhz + ' MHz'],
            [t('mac'), d.mac], [t('ip'), d.ip],
            [t('link'), d.linkUp ? 'up' : 'down'], [t('speed'), d.speed],
            [t('uptime'), up(d.uptimeSec)],
            [t('freeHeap'), (d.freeHeap / 1024).toFixed(1) + ' KB'],
            [t('flash'), (d.flashSize / 1024 / 1024).toFixed(0) + ' MB'],
            [t('reader'), d.ura4 + ':' + d.ura4Port],
            [t('sdk'), d.sdk], [t('firmware'), d.firmware]
        ];
        $('infoGrid').innerHTML = rows
            .map(([k, v]) => `<div>${k}</div><div>${v ?? '-'}</div>`).join('');
    }).catch(() => toast(t('failure')));
}

// Reboots the ESP32 board. The reader is untouched.
function doReboot() {
    if (!confirm(t('rebootBoardConfirm'))) return;
    fetch('/SystemController/reboot', { method: 'POST' })
        .then(() => toast(t('success')))
        .catch(() => toast(t('failure')));
}

// Reboots the URA4 reader. It goes away for about a minute, so the page is
// told rather than left guessing why everything stopped answering.
function readerReboot() {
    if (!confirm(t('rebootReaderConfirm'))) return;
    // Through the board's own route, not the generic proxy: the board puts a
    // "READY" splash on its OLED so whoever is at the device can see when the
    // reader is back, instead of watching a dead address.
    fetch('/SystemController/readerReboot', { method: 'POST' })
        .then(r => r.json())
        .then(d => {
            if (d.code !== 0) { toast(d.message || t('failure')); return; }
            toast(t('success') + ' — ' + t('rebootReader'));
        })
        .catch(() => toast(t('failure')));
}

// ---------------------------------------------------------------------------
// bootstrap — only runs in index.html, where #pageDiv exists
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
    i18n();
    if (!$('pageDiv')) return;

    $('langImage').src = 'image/lang_' + (lang_flag === Lang_ID ? 'id' : 'en') + '.png';
    showPage(sessionStorage.getItem('page') || PAGES[0]);
});
