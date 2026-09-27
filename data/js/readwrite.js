// Read / Write tag pages. Kept beside reader.js rather than in it: this is the
// one page that changes what is physically stored on a tag, and keeping it
// separate makes that boundary obvious.

// Bank defaults, copied from the reader's own page: EPC starts at word 2
// (words 0-1 are the CRC and PC), reserve holds the kill and access passwords,
// and 6 words is the usual EPC length.
const RW_BANK_DEFAULTS = {
    epc:     { offset: 2, length: 6 },
    reserve: { offset: 0, length: 4 },
    tid:     { offset: 0, length: 6 },
    user:    { offset: 0, length: 6 }
};

function rwBankChanged() {
    const d = RW_BANK_DEFAULTS[$('rwBank').value];
    if (!d) return;
    put('rwOffset', d.offset);
    put('rwLength', d.length);
}

// The optional select-by-filter, shared shape with the Inventory page.
function rwFilter() {
    if (!chk('cbFilter')) return null;
    const mask = $('filterData').value.trim();
    if (!mask) return undefined;      // undefined = reject, null = no filter
    return {
        tagMemoryBank: $('select_filterBank').value,
        bitOffset: Number($('filterOffset').value),
        bitLength: Number($('filterLength').value),
        hexMask: mask
    };
}

function rwParams(withData) {
    const p = {
        hexAccessPassword: $('rwPassword').value.trim() || '00000000',
        tagMemoryBank: $('rwBank').value,
        wordOffset: Number($('rwOffset').value),
        wordLength: Number($('rwLength').value)
    };
    if (withData) p.hexTagData = $('rwData').value.trim();
    return p;
}

function rwRead() {
    const f = rwFilter();
    if (f === undefined) { toast(t('filterDataRequired')); return; }

    const param = { type: 'Reader-tagReadRequest', tagParameters: rwParams(false) };
    if (f) param.tagFilter = f;

    if (typeof reportView === 'function') reportView('readwrite', { msg: 'BACA DATA...' });

    reader('/ReadController/tagReadRequest', param, 30000)
        .then(d => {
            if (d.code === 0) {
                put('rwData', d.hexTagData);
                if (typeof reportView === 'function') reportView('readwrite', { epc: d.hexTagData, msg: 'BACA OK' });
                toast(t('success'));
            } else {
                put('rwData', '');
                if (typeof reportView === 'function') reportView('readwrite', { epc: '', msg: 'BACA GAGAL' });
                toast(d.message || t('failure'));
            }
        })
        .catch(e => {
            if (typeof reportView === 'function') reportView('readwrite', { epc: '', msg: 'BACA ERROR' });
            toast(e.message || t('failure'));
        });
}

function rwWrite() {
    const f = rwFilter();
    if (f === undefined) { toast(t('filterDataRequired')); return; }
    if (!$('rwData').value.trim()) { toast(t('writeDataRequired')); return; }

    // Writing is not reversible: the old contents are gone once this lands.
    if (!confirm(t('rwWriteWarn'))) return;

    const param = { type: 'Reader-tagWriteRequest', tagParameters: rwParams(true) };
    if (f) param.tagFilter = f;

    if (typeof reportView === 'function') reportView('readwrite', { msg: 'TULIS DATA...' });

    reader('/WriteController/tagWriteRequest', param, 30000)
        .then(d => {
            if (d.code === 0) {
                if (typeof reportView === 'function') reportView('readwrite', { epc: $('rwData').value.trim(), msg: 'TULIS OK' });
                toast(t('success'));
            } else {
                if (typeof reportView === 'function') reportView('readwrite', { epc: '', msg: 'TULIS GAGAL' });
                toast(d.message || t('failure'));
            }
        })
        .catch(e => {
            if (typeof reportView === 'function') reportView('readwrite', { epc: '', msg: 'TULIS ERROR' });
            toast(e.message || t('failure'));
        });
}

function rwInit() {
    i18n();
    if (typeof reportView === 'function') reportView('readwrite', { msg: 'SIAP' });
    if ($('rwBank')) {
        $('rwBank').addEventListener('change', rwBankChanged);
        rwBankChanged();
    }
    if ($('cbFilter')) {
        $('cbFilter').addEventListener('change', function () {
            $('fieldsetFilter').style.display = this.checked ? '' : 'none';
        });
    }
    // Same helper the Inventory page uses, so the length tracks the hex mask.
    if ($('filterData')) {
        $('filterData').addEventListener('input', function () {
            const digits = this.value.replace(/[^0-9a-fA-F]/g, '').length;
            if (digits === 0) return;
            $('filterLength').value = digits * 4;
        });
    }
}
