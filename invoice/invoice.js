/* =========================================================
   /invoice – faktura v prohlížeči
   Formulář -> živý náhled (HTML) -> PDF (pdfmake) / XLSX (ExcelJS).
   Vše běží jen v prohlížeči, nic se neodesílá. Údaje dodavatele,
   rozepsaná faktura a seznam odběratelů se ukládají do localStorage.
   ========================================================= */
(function () {
  'use strict';

  var STORE_KEY = 'faktura:v1';
  var VAT_RATES = [21, 12, 0];

  // Výchozí údaje dodavatele = veřejné fakturační údaje z janamachova.cz (sekce Kontakt).
  var SUPPLIER_DEFAULTS = {
    s_name: 'Ing. Jana Machová',
    s_tagline: 'soudní znalec',
    s_street: 'Alšova 522/13',
    s_city: '708 00 Ostrava-Poruba',
    s_ico: '69615632',
    s_dic: 'CZ6762010640',
    s_account: '27-2489420287/0100',
    s_phone: '+420 604 163 806',
    s_email: 'jana.machova@volny.cz',
    s_footer: 'Znalec v oboru ekonomika, odvětví ceny a odhady nemovitostí.',
    s_vat: true
  };
  var SUPPLIER_KEYS = Object.keys(SUPPLIER_DEFAULTS);
  var CUSTOMER_KEYS = ['c_name', 'c_street', 'c_city', 'c_ico', 'c_dic'];

  var form = document.getElementById('form');
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var field = function (name) { return form.elements[name]; };

  /* ---------- storage ---------- */
  var store = load();
  function load() {
    try { var s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && typeof s === 'object') return s; } catch (e) {}
    return {};
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  /* ---------- helpers: dates, numbers, text ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseIso(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; }
  function addDays(iso, n) { var d = parseIso(iso) || new Date(); d.setDate(d.getDate() + n); return isoDate(d); }
  function czDate(iso) { var d = parseIso(iso); return d ? d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear() : ''; }
  function daysBetween(a, b) { var x = parseIso(a), y = parseIso(b); return x && y ? Math.round((y - x) / 864e5) : null; }

  function num(v) {
    if (typeof v === 'number') return v;
    var s = String(v || '').replace(/\s| /g, '').replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  // 15000 -> "15 000,00" (mezery jako nezlomitelné, ať se částka nerozdělí na dva řádky)
  function money(n, decimals) {
    decimals = decimals === undefined ? 2 : decimals;
    var neg = n < 0; n = Math.abs(n);
    var parts = n.toFixed(decimals).split('.');
    var int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (neg ? '−' : '') + int + (decimals ? ',' + parts[1] : '');
  }
  function czk(n) { return money(n) + ' Kč'; }
  function qtyFmt(n) { return n % 1 ? money(n, 2).replace(/0$/, '') : money(n, 0); }
  function ascii(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function slug(s) { return ascii(s).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''); }

  /* ---------- IBAN z českého čísla účtu (stejný výpočet jako tools/make-qr.py) ---------- */
  function toIban(acc) {
    acc = String(acc || '').replace(/\s/g, '').toUpperCase();
    if (/^CZ\d{22}$/.test(acc)) return acc;
    var m = /^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/.exec(acc);
    if (!m) return '';
    var bban = m[3] + (m[1] || '0').padStart(6, '0') + m[2].padStart(10, '0');
    var check = 98 - Number(BigInt(bban + '123500') % 97n);
    return 'CZ' + pad(check) + bban;
  }
  function group4(s) { return s.replace(/(.{4})/g, '$1 ').trim(); }

  /* ---------- items ---------- */
  var itemsEl = document.getElementById('items');
  var itemTpl = function () {
    var div = document.createElement('div');
    div.className = 'item';
    div.innerHTML =
      '<label class="field item__desc"><span>Popis</span><input data-k="desc" placeholder="např. Znalecký posudek"></label>' +
      '<label class="field item__qty"><span>Množství</span><input data-k="qty" inputmode="decimal" value="1"></label>' +
      '<label class="field item__unit"><span>MJ</span><input data-k="unit" placeholder="ks"></label>' +
      '<label class="field item__price"><span class="js-price-label">Cena za MJ</span><input data-k="price" inputmode="decimal" placeholder="0,00"></label>' +
      '<label class="field item__vat"><span>DPH</span><select data-k="vat">' + VAT_RATES.map(function (r) { return '<option value="' + r + '">' + r + ' %</option>'; }).join('') + '</select></label>' +
      '<button type="button" class="item__remove" aria-label="Odebrat položku" title="Odebrat položku"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
    return div;
  };
  function addItem(data, focus) {
    var row = itemTpl();
    data = data || {};
    $$('[data-k]', row).forEach(function (inp) {
      var k = inp.getAttribute('data-k');
      if (data[k] !== undefined && data[k] !== null) inp.value = data[k];
    });
    itemsEl.appendChild(row);
    syncRemoveButtons();
    if (focus) $('[data-k="desc"]', row).focus();
    return row;
  }
  function syncRemoveButtons() {
    var rows = $$('.item', itemsEl);
    rows.forEach(function (r) { $('.item__remove', r).disabled = rows.length < 2; });
  }
  itemsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.item__remove');
    if (!btn) return;
    btn.closest('.item').remove();
    syncRemoveButtons();
    update();
  });
  document.getElementById('addItem').addEventListener('click', function () { addItem({ vat: field('s_vat').checked ? 21 : 0 }, true); update(); });

  function readItems() {
    return $$('.item', itemsEl).map(function (row) {
      var o = {};
      $$('[data-k]', row).forEach(function (inp) { o[inp.getAttribute('data-k')] = inp.value; });
      return o;
    });
  }

  /* ---------- state ---------- */
  function readState() {
    var s = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      s[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    s.items = readItems();
    return s;
  }
  function writeFields(obj) {
    Object.keys(obj).forEach(function (k) {
      var el = field(k);
      if (!el || el instanceof RadioNodeList) return;
      if (el.type === 'checkbox') el.checked = !!obj[k]; else el.value = obj[k] == null ? '' : obj[k];
    });
  }

  // Výpočet faktury ze stavu formuláře
  function compute(s) {
    var vatPayer = !!s.s_vat;
    var lines = s.items.map(function (it) {
      var qty = it.qty === '' ? 1 : num(it.qty);
      var price = num(it.price);
      var rate = vatPayer ? num(it.vat) : 0;
      return { desc: it.desc, qty: qty, unit: it.unit, price: price, rate: rate, base: round2(qty * price), filled: !!(it.desc || it.price) };
    }).filter(function (l) { return l.filled; });

    var byRate = {};
    lines.forEach(function (l) { byRate[l.rate] = round2((byRate[l.rate] || 0) + l.base); });
    var vat = Object.keys(byRate).map(Number).sort(function (a, b) { return b - a; }).map(function (r) {
      return { rate: r, base: byRate[r], vat: round2(byRate[r] * r / 100) };
    });
    var base = round2(vat.reduce(function (a, v) { return a + v.base; }, 0));
    var vatSum = round2(vat.reduce(function (a, v) { return a + v.vat; }, 0));
    var iban = toIban(s.s_account);
    return {
      vatPayer: vatPayer,
      transfer: s.payment !== 'Hotově',
      lines: lines,
      vat: vat,
      base: base,
      vatSum: vatSum,
      total: round2(base + (vatPayer ? vatSum : 0)),
      iban: iban
    };
  }

  /* ---------- QR platba (SPAYD) ---------- */
  function spayd(s, c) {
    if (!c.iban || !c.transfer || c.total <= 0) return '';
    var clean = function (v, max) { return ascii(v).replace(/\*/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max); };
    var parts = ['SPD', '1.0', 'ACC:' + c.iban, 'AM:' + c.total.toFixed(2), 'CC:CZK'];
    var due = parseIso(s.due);
    if (due) parts.push('DT:' + s.due.replace(/-/g, ''));
    var vs = (s.vs || '').replace(/\D/g, '').slice(0, 10);
    if (vs) parts.push('X-VS:' + vs);
    var msg = clean('Faktura ' + (s.number || ''), 60);
    if (msg) parts.push('MSG:' + msg);
    var rn = clean(s.s_name, 35);
    if (rn) parts.push('RN:' + rn);
    return parts.join('*');
  }
  // QR jako SVG cesta; rohové značky v modré jako na webu
  function qrSvg(text, dark, finder) {
    if (!text || typeof qrcode !== 'function') return '';
    var qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount(), q = 2, size = n + 2 * q;
    var isFinder = function (r, c) { return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7); };
    var d1 = '', d2 = '';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        var cell = 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
        if (isFinder(r, c)) d2 += cell; else d1 += cell;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" shape-rendering="crispEdges" role="img" aria-label="QR platba">' +
      '<path fill="' + dark + '" d="' + d1 + '"/><path fill="' + finder + '" d="' + d2 + '"/></svg>';
  }

  /* ---------- preview ---------- */
  var sheet = document.getElementById('sheet');
  var wrap = document.getElementById('sheetWrap');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }

  function contactLine(s) {
    return [s.s_email, s.s_phone].filter(Boolean).join('  ·  ');
  }

  function render(s, c) {
    var view = Object.assign({}, s, {
      issued_fmt: czDate(s.issued),
      due_fmt: czDate(s.due),
      taxDate_fmt: czDate(s.taxDate || s.issued),
      total_fmt: czk(c.total),
      s_iban_fmt: c.iban ? group4(c.iban) : '',
      s_contact: contactLine(s)
    });
    $$('[data-bind]', sheet).forEach(function (el) { el.textContent = view[el.getAttribute('data-bind')] || ''; });
    $$('[data-show]', sheet).forEach(function (el) { el.hidden = !view[el.getAttribute('data-show')]; });
    $$('[data-vat-only]').forEach(function (el) { el.hidden = !c.vatPayer; });
    $$('[data-novat-only]').forEach(function (el) { el.hidden = c.vatPayer; });
    $$('[data-transfer-only]', sheet).forEach(function (el) { el.hidden = !c.transfer; });
    form.classList.toggle('novat', !c.vatPayer);
    document.getElementById('thTotal').textContent = c.vatPayer ? 'Celkem bez DPH' : 'Celkem';
    $$('.js-price-label', form).forEach(function (el) { el.textContent = c.vatPayer ? 'Cena/MJ bez DPH' : 'Cena za MJ'; });

    var rows = c.lines.map(function (l) {
      return '<tr><td class="sh-strong">' + esc(l.desc || '—') + '</td>' +
        '<td class="r">' + esc(qtyFmt(l.qty) + (l.unit ? ' ' + l.unit : '')) + '</td>' +
        '<td class="r">' + esc(czk(l.price)) + '</td>' +
        (c.vatPayer ? '<td class="r">' + l.rate + ' %</td>' : '') +
        '<td class="r">' + esc(czk(l.base)) + '</td></tr>';
    }).join('');
    document.getElementById('sheetItems').innerHTML = rows ||
      '<tr class="sh-empty"><td colspan="' + (c.vatPayer ? 5 : 4) + '">Zatím žádná položka</td></tr>';

    document.getElementById('sheetVat').innerHTML = c.vat.map(function (v) {
      return '<tr><td>' + v.rate + ' %</td><td class="r">' + czk(v.base) + '</td><td class="r">' + czk(v.vat) + '</td></tr>';
    }).join('');

    var payload = spayd(s, c);
    document.getElementById('sheetQr').innerHTML = payload
      ? qrSvg(payload, '#141416', '#1a4a94')
      : '<div class="sh-qr__empty">' + (c.iban ? 'Kód se objeví po zadání částky' : 'Doplňte číslo účtu dodavatele') + '</div>';

    document.getElementById('barTotal').textContent = c.total ? czk(c.total) : '';
    field('s_iban').value = c.iban ? group4(c.iban) : '';
    field('s_account').setAttribute('aria-invalid', s.s_account && !c.iban ? 'true' : 'false');
    document.getElementById('supplierSum').textContent = [s.s_name, s.s_account, c.vatPayer ? 'plátce DPH' : 'neplátce DPH'].filter(Boolean).join(' · ');
    $$('.chip[data-due]').forEach(function (b) { b.classList.toggle('is-active', daysBetween(s.issued, s.due) === +b.getAttribute('data-due')); });
    fitSheet();
  }

  function fitSheet() {
    var w = wrap.clientWidth;
    if (!w) return;
    var scale = w / sheet.offsetWidth;
    sheet.style.transform = 'scale(' + scale + ')';
    wrap.style.height = Math.ceil(sheet.offsetHeight * scale) + 'px';
  }
  if (window.ResizeObserver) new ResizeObserver(fitSheet).observe(wrap); else window.addEventListener('resize', fitSheet);

  /* ---------- update loop ---------- */
  var state, calc;
  function update() {
    state = readState();
    calc = compute(state);
    render(state, calc);
    persist();
  }
  function persist() {
    store.supplier = {};
    SUPPLIER_KEYS.forEach(function (k) { store.supplier[k] = state[k]; });
    store.draft = {};
    Object.keys(state).forEach(function (k) { if (SUPPLIER_KEYS.indexOf(k) < 0 && k !== 's_iban') store.draft[k] = state[k]; });
    save();
  }

  var lastIssued = state && state.issued;
  form.addEventListener('input', function (e) {
    var t = e.target;
    // datum zdan. plnění a splatnost se posouvají spolu s datem vystavení
    if (t.name === 'issued') {
      var prev = lastIssued;
      if (!field('taxDate').value || field('taxDate').value === prev) field('taxDate').value = t.value;
      var span = daysBetween(prev, field('due').value);
      if (span != null && span >= 0) field('due').value = addDays(t.value, span);
    }
    if (t.name === 'number') {
      var digits = t.value.replace(/\D/g, '');
      if (!field('vs').dataset.touched) field('vs').value = digits.slice(0, 10);
    }
    if (t.name === 'vs') t.dataset.touched = '1';
    if (t.name === 'c_name') fillCustomer(t.value);
    if (t.name === 's_vat') {
      $$('[data-k="vat"]', itemsEl).forEach(function (sel) { sel.value = t.checked ? '21' : '0'; });
    }
    update();
    lastIssued = field('issued').value;
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  $$('.chip[data-due]').forEach(function (b) {
    b.addEventListener('click', function () {
      field('due').value = addDays(field('issued').value, +b.getAttribute('data-due'));
      update();
    });
  });

  /* ---------- customers (uložení odběratelé) ---------- */
  function customers() { return store.customers || []; }
  function renderCustomerList() {
    document.getElementById('customers').innerHTML = customers().map(function (c) { return '<option value="' + esc(c.c_name) + '">'; }).join('');
  }
  function fillCustomer(name) {
    var hit = customers().filter(function (c) { return c.c_name === name; })[0];
    if (hit) writeFields(hit);
  }
  function rememberCustomer(s) {
    if (!s.c_name) return;
    var c = {}; CUSTOMER_KEYS.forEach(function (k) { c[k] = s[k] || ''; });
    store.customers = [c].concat(customers().filter(function (x) { return x.c_name !== c.c_name; })).slice(0, 50);
    renderCustomerList();
  }

  /* ---------- ARES (veřejný registr; když nepovolí přístup z prohlížeče, vyplní se ručně) ---------- */
  var aresBtn = document.getElementById('ares');
  var aresMsg = document.getElementById('aresMsg');
  aresBtn.addEventListener('click', function () {
    var ico = field('c_ico').value.replace(/\D/g, '');
    aresMsg.classList.remove('is-error');
    if (ico.length < 6) { aresMsg.textContent = 'Zadejte IČO odběratele (8 číslic).'; aresMsg.classList.add('is-error'); return; }
    ico = ico.padStart(8, '0');
    aresBtn.disabled = true;
    aresMsg.textContent = 'Hledám v ARES…';
    fetch('https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/' + ico, { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? 'notfound' : 'http'); return r.json(); })
      .then(function (d) {
        var a = d.sidlo || {};
        var street = [a.nazevUlice || a.nazevCastiObce || a.nazevObce, [a.cisloDomovni, a.cisloOrientacni ? a.cisloOrientacni + (a.cisloOrientacniPismeno || '') : ''].filter(Boolean).join('/')].filter(Boolean).join(' ');
        var psc = a.psc ? String(a.psc).replace(/^(\d{3})(\d{2})$/, '$1 $2') : '';
        var city = a.nazevObce ? a.nazevObce + (a.nazevCastiObce && a.nazevCastiObce !== a.nazevObce ? ' – ' + a.nazevCastiObce : '') : '';
        writeFields({
          c_ico: ico,
          c_name: d.obchodniJmeno || field('c_name').value,
          c_street: street || a.textovaAdresa || '',
          c_city: [psc, city].filter(Boolean).join(' '),
          c_dic: d.dic || ''
        });
        aresMsg.textContent = 'Doplněno z ARES.';
        update();
      })
      .catch(function (err) {
        aresMsg.textContent = err && err.message === 'notfound' ? 'Toto IČO ARES nezná.' : 'ARES se nepodařilo načíst, doplňte údaje ručně.';
        aresMsg.classList.add('is-error');
      })
      .then(function () { aresBtn.disabled = false; });
  });

  /* ---------- numbering ---------- */
  function nextNumber(issued) {
    var y = (parseIso(issued) || new Date()).getFullYear();
    var last = (store.lastNumbers || {})[y] || 0;
    return y + '-' + pad(last + 1);
  }
  function markIssued(s) {
    var m = /^(\d{4})\D*(\d+)$/.exec(s.number || '');
    if (!m) return;
    store.lastNumbers = store.lastNumbers || {};
    store.lastNumbers[m[1]] = Math.max(store.lastNumbers[m[1]] || 0, +m[2]);
  }
  function newInvoice(keepCustomer) {
    var today = isoDate(new Date());
    var span = daysBetween(field('issued').value, field('due').value);
    writeFields({
      number: nextNumber(today), issued: today, taxDate: today,
      due: addDays(today, span != null && span >= 0 ? span : 14), note: ''
    });
    field('vs').value = field('number').value.replace(/\D/g, '');
    delete field('vs').dataset.touched;
    if (!keepCustomer) writeFields({ c_name: '', c_street: '', c_city: '', c_ico: '', c_dic: '' });
    itemsEl.innerHTML = '';
    addItem({ qty: 1, unit: '', vat: field('s_vat').checked ? 21 : 0 });
    aresMsg.textContent = '';
    lastIssued = today;
    update();
  }
  document.getElementById('newInvoice').addEventListener('click', function () {
    newInvoice(false);
    msg('Připravena nová faktura č. ' + field('number').value + '.');
    field('c_name').focus();
  });

  /* ---------- validation ---------- */
  function validate(s, c) {
    var problems = [];
    if (!s.number) problems.push('číslo faktury');
    if (!s.c_name) problems.push('odběratele');
    if (!c.lines.length) problems.push('alespoň jednu položku');
    if (c.transfer && !c.iban) problems.push('platné číslo účtu dodavatele');
    if (problems.length) { msg('Doplňte ještě ' + problems.join(', ') + '.', true); return false; }
    return true;
  }
  var msgEl = document.getElementById('actionMsg');
  function msg(text, isError) { msgEl.textContent = text; msgEl.classList.toggle('is-error', !!isError); }

  function afterExport() {
    markIssued(state);
    rememberCustomer(state);
    save();
  }
  function fileBase(s) { return 'Faktura-' + (slug(s.number) || 'bez-cisla') + (s.c_name ? '-' + slug(s.c_name).slice(0, 40) : ''); }

  /* ---------- lazy loading of the heavy libraries ---------- */
  var loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise(function (res, rej) {
      var el = document.createElement('script');
      el.src = src; el.onload = res; el.onerror = function () { delete loaded[src]; rej(new Error('Nepodařilo se načíst ' + src)); };
      document.head.appendChild(el);
    });
    return loaded[src];
  }
  var FONT_FILES = {
    'PlexSans-Regular.woff': 'vendor/fonts/IBMPlexSans-Regular.woff',
    'PlexSans-Medium.woff': 'vendor/fonts/IBMPlexSans-Medium.woff',
    'PlexSans-SemiBold.woff': 'vendor/fonts/IBMPlexSans-SemiBold.woff',
    'PlexMono-Regular.woff': 'vendor/fonts/IBMPlexMono-Regular.woff',
    'PlexMono-Medium.woff': 'vendor/fonts/IBMPlexMono-Medium.woff'
  };
  function toBase64(buf) {
    var bytes = new Uint8Array(buf), bin = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  }
  var pdfReady;
  function loadPdf() {
    if (pdfReady) return pdfReady;
    pdfReady = Promise.all([
      loadScript('vendor/pdfmake.min.js'),
      Promise.all(Object.keys(FONT_FILES).map(function (name) {
        return fetch(FONT_FILES[name]).then(function (r) { if (!r.ok) throw new Error('font'); return r.arrayBuffer(); })
          .then(function (b) { return [name, toBase64(b)]; });
      }))
    ]).then(function (res) {
      var vfs = {};
      res[1].forEach(function (p) { vfs[p[0]] = p[1]; });
      window.pdfMake.vfs = vfs;
      window.pdfMake.fonts = {
        Plex: { normal: 'PlexSans-Regular.woff', bold: 'PlexSans-SemiBold.woff', italics: 'PlexSans-Regular.woff', bolditalics: 'PlexSans-SemiBold.woff' },
        PlexMedium: { normal: 'PlexSans-Medium.woff', bold: 'PlexSans-SemiBold.woff', italics: 'PlexSans-Medium.woff', bolditalics: 'PlexSans-SemiBold.woff' },
        PlexMono: { normal: 'PlexMono-Regular.woff', bold: 'PlexMono-Medium.woff', italics: 'PlexMono-Regular.woff', bolditalics: 'PlexMono-Medium.woff' }
      };
      return window.pdfMake;
    });
    pdfReady.catch(function () { pdfReady = null; });
    return pdfReady;
  }

  /* ---------- PDF ---------- */
  var INK = '#141416', MUTE = '#6b665d', RULE = '#dcd8d0', BLUE = '#2f63c7', BLUE_INK = '#1a4a94';
  var PAGE_W = 595.28, M_X = 44, COL_GAP = 36, CONTENT_W = PAGE_W - 2 * M_X, COL_W = (CONTENT_W - COL_GAP) / 2;

  function eyebrow(text) {
    return {
      columns: [
        { width: 14, canvas: [{ type: 'line', x1: 0, y1: 4.2, x2: 14, y2: 4.2, lineWidth: 1, lineColor: BLUE }] },
        { width: '*', text: text.toUpperCase(), font: 'PlexMono', bold: true, fontSize: 7, characterSpacing: 1.1, color: MUTE }
      ],
      columnGap: 7
    };
  }
  function dlRows(rows, gapTop) {
    return {
      margin: [0, gapTop == null ? 12 : gapTop, 0, 0],
      stack: rows.filter(Boolean).map(function (r) {
        return {
          columns: [
            { width: 'auto', text: r[0], color: MUTE },
            { width: '*', text: r[1] || '', font: 'PlexMono', fontSize: r[2] || 8.5, alignment: 'right', margin: [0, r[2] ? 1 : 0.3, 0, 0] }
          ],
          columnGap: 10,
          margin: [0, 0, 0, 3]
        };
      })
    };
  }
  function party(title, name, street, city, ids, extra) {
    var st = [
      eyebrow(title),
      { text: name || ' ', fontSize: 12, bold: true, margin: [0, 10, 0, 0], characterSpacing: -0.1 },
      { text: [street || ' ', '\n', city || ' '], color: MUTE, margin: [0, 3, 0, 0] },
      dlRows(ids)
    ];
    return st.concat(extra || []);
  }

  function buildDoc(s, c) {
    var payload = spayd(s, c);
    var supplierExtra = [];
    if (!c.vatPayer) supplierExtra.push({ text: 'NEPLÁTCE DPH', font: 'PlexMono', fontSize: 7, characterSpacing: 0.7, color: BLUE_INK, margin: [0, 3, 0, 0] });
    supplierExtra.push(dlRows([
      c.transfer && ['Bankovní účet', s.s_account],
      c.transfer && ['IBAN', group4(c.iban), 7.5],
      s.vs && ['Variabilní symbol', s.vs],
      ['Způsob platby', s.payment]
    ]));
    var customerExtra = [dlRows([
      ['Datum vystavení', czDate(s.issued)],
      ['Datum splatnosti', czDate(s.due)],
      c.vatPayer && ['Datum zdan. plnění', czDate(s.taxDate || s.issued)]
    ])];

    // položky
    var th = function (t, right) { return { text: t.toUpperCase(), font: 'PlexMono', bold: true, fontSize: 6.5, characterSpacing: 0.9, color: MUTE, alignment: right ? 'right' : 'left', margin: [0, 0, 0, 2] }; };
    var td = function (t, right) { return right ? { text: t, font: 'PlexMono', fontSize: 8.5, alignment: 'right', noWrap: true, margin: [0, 1, 0, 0] } : { text: t, fontSize: 9.5, font: 'PlexMedium' }; };
    var head = [th('Popis'), th('Množství', 1), th('Cena za MJ', 1)];
    if (c.vatPayer) head.push(th('DPH', 1));
    head.push(th(c.vatPayer ? 'Celkem bez DPH' : 'Celkem', 1));
    var body = [head].concat(c.lines.map(function (l) {
      var row = [td(l.desc || '—'), td(qtyFmt(l.qty) + (l.unit ? ' ' + l.unit : ''), 1), td(czk(l.price), 1)];
      if (c.vatPayer) row.push(td(l.rate + ' %', 1));
      row.push(td(czk(l.base), 1));
      return row;
    }));
    var widths = c.vatPayer ? ['*', 'auto', 'auto', 'auto', 'auto'] : ['*', 'auto', 'auto', 'auto'];
    var nRows = body.length;
    var itemsTable = {
      margin: [0, 34, 0, 0],
      table: { headerRows: 1, widths: widths, body: body },
      layout: {
        hLineWidth: function (i) { return i === 0 ? 0 : i === 1 ? 0.75 : 0.5; },
        hLineColor: function (i) { return i === 1 ? INK : RULE; },
        vLineWidth: function () { return 0; },
        paddingLeft: function (i) { return i === 0 ? 0 : 12; },
        paddingRight: function () { return 0; },
        paddingTop: function (i) { return i === 0 ? 0 : 8; },
        paddingBottom: function (i) { return i === 0 ? 4 : 8; }
      }
    };
    void nRows;

    // rekapitulace DPH + celkem
    var sum = [];
    if (c.vatPayer && c.vat.length) {
      var vth = function (t, right) { return { text: t.toUpperCase(), font: 'PlexMono', bold: true, fontSize: 6.5, characterSpacing: 0.9, color: MUTE, alignment: right ? 'right' : 'left' }; };
      var vtd = function (t, right) { return { text: t, font: 'PlexMono', fontSize: 8.5, alignment: right ? 'right' : 'left' }; };
      sum.push({
        table: {
          widths: ['*', 'auto', 'auto'],
          body: [[vth('Sazba'), vth('Základ', 1), vth('DPH', 1)]].concat(c.vat.map(function (v) {
            return [vtd(v.rate + ' %'), vtd(czk(v.base), 1), vtd(czk(v.vat), 1)];
          }))
        },
        layout: {
          hLineWidth: function () { return 0; }, vLineWidth: function () { return 0; },
          paddingLeft: function (i) { return i === 0 ? 0 : 18; }, paddingRight: function () { return 0; },
          paddingTop: function (i) { return i === 0 ? 0 : 2; }, paddingBottom: function (i) { return i === 0 ? 3 : 2; }
        }
      });
    }
    var SUM_W = 262;
    sum.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: SUM_W, y2: 0, lineWidth: 2, lineColor: BLUE }], margin: [0, sum.length ? 8 : 0, 0, 0] });
    sum.push({
      columns: [
        { width: 'auto', text: 'CELKEM K ÚHRADĚ', font: 'PlexMono', bold: true, fontSize: 7, characterSpacing: 1, color: MUTE, margin: [0, 13, 0, 0] },
        { width: '*', text: czk(c.total), fontSize: 20, bold: true, alignment: 'right', characterSpacing: -0.3 }
      ],
      margin: [0, 6, 0, 0]
    });

    var qrBlock = payload ? {
      width: 112,
      table: {
        widths: [96],
        body: [[{
          stack: [
            { text: 'QR PLATBA', font: 'PlexMono', bold: true, fontSize: 5.5, characterSpacing: 0.9, color: BLUE_INK, margin: [0, 0, 0, 5] },
            { svg: qrSvg(payload, INK, BLUE_INK), width: 96 }
          ]
        }]]
      },
      layout: {
        hLineWidth: function () { return 1.5; }, vLineWidth: function () { return 1.5; },
        hLineColor: function () { return BLUE; }, vLineColor: function () { return BLUE; },
        paddingLeft: function () { return 7; }, paddingRight: function () { return 7; },
        paddingTop: function () { return 7; }, paddingBottom: function () { return 7; }
      }
    } : { width: 112, text: '' };

    var content = [
      {
        columns: [
          { width: COL_W, stack: [
            { text: s.s_name || ' ', fontSize: 11, bold: true, characterSpacing: -0.1 },
            { text: (s.s_tagline || '').toUpperCase(), font: 'PlexMono', fontSize: 6.5, characterSpacing: 1.05, color: BLUE_INK, margin: [0, 3, 0, 0] }
          ], margin: [0, 13, 0, 0] },
          { width: COL_W, stack: [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: COL_W, y2: 0, lineWidth: 3, lineColor: BLUE }] },
            { text: [{ text: 'Faktura ' }, { text: s.number || '', color: BLUE_INK }], fontSize: 24, bold: true, characterSpacing: -0.4, margin: [0, 8, 0, 0], noWrap: true },
            c.vatPayer ? { text: 'DAŇOVÝ DOKLAD', font: 'PlexMono', fontSize: 7, characterSpacing: 1.1, color: MUTE, margin: [0, 4, 0, 0] } : { text: '' }
          ] }
        ],
        columnGap: COL_GAP
      },
      {
        columns: [
          { width: COL_W, stack: party('Dodavatel', s.s_name, s.s_street, s.s_city, [s.s_ico && ['IČO', s.s_ico], s.s_dic && ['DIČ', s.s_dic]], supplierExtra) },
          { width: COL_W, stack: party('Odběratel', s.c_name, s.c_street, s.c_city, [s.c_ico && ['IČO', s.c_ico], s.c_dic && ['DIČ', s.c_dic]], customerExtra) }
        ],
        columnGap: COL_GAP,
        margin: [0, 34, 0, 0]
      },
      itemsTable,
      {
        columns: [
          c.transfer ? qrBlock : { width: 112, text: '' },
          { width: '*', text: '' },
          { width: SUM_W, stack: sum }
        ],
        margin: [0, 24, 0, 0],
        unbreakable: true
      }
    ];
    if (s.note) content.push({ text: s.note, margin: [0, 26, 0, 0] });

    var contact = contactLine(s);
    return {
      pageSize: 'A4',
      pageMargins: [M_X, 40, M_X, 56],
      info: { title: 'Faktura ' + (s.number || ''), author: s.s_name || '', subject: 'Faktura', creator: 'janamachova.cz' },
      defaultStyle: { font: 'Plex', fontSize: 9, lineHeight: 1.2, color: INK },
      content: content,
      footer: function (page, pages) {
        return {
          margin: [M_X, 6, M_X, 0],
          stack: [
            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.5, lineColor: RULE }] },
            {
              columns: [
                { width: '*', stack: [
                  s.s_footer ? { text: s.s_footer, fontSize: 7.5, color: MUTE } : { text: '' },
                  contact ? { text: contact, font: 'PlexMono', fontSize: 7, color: MUTE, margin: [0, 2, 0, 0] } : { text: '' }
                ] },
                pages > 1 ? { width: 'auto', text: page + ' / ' + pages, font: 'PlexMono', fontSize: 7, color: MUTE } : { width: 'auto', text: '' }
              ],
              margin: [0, 7, 0, 0]
            }
          ]
        };
      }
    };
  }

  function withBusy(btn, fn) {
    btn.disabled = true;
    return Promise.resolve().then(fn).catch(function (e) {
      console.error(e);
      msg('Něco se nepovedlo: ' + (e && e.message ? e.message : e) + '. Zkuste to prosím znovu.', true);
    }).then(function () { btn.disabled = false; });
  }

  function pdfBlob() {
    return loadPdf().then(function (pdfMake) {
      return new Promise(function (res) { pdfMake.createPdf(buildDoc(state, calc)).getBlob(res); });
    });
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  document.getElementById('pdfDownload').addEventListener('click', function () {
    update();
    if (!validate(state, calc)) return;
    var btn = this;
    withBusy(btn, function () {
      msg('Připravuji PDF…');
      return pdfBlob().then(function (blob) {
        download(blob, fileBase(state) + '.pdf');
        afterExport();
        msg('PDF faktury č. ' + state.number + ' je stažené.');
      });
    });
  });

  document.getElementById('pdfOpen').addEventListener('click', function () {
    update();
    if (!validate(state, calc)) return;
    var win = window.open('', '_blank');   // otevřít hned, jinak by okno zablokoval prohlížeč
    if (win) { try { win.document.title = 'Faktura ' + state.number; win.document.body.style.cssText = 'font-family:sans-serif;color:#666;padding:2em'; win.document.body.textContent = 'Připravuji PDF…'; } catch (e) {} }
    withBusy(this, function () {
      return pdfBlob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        if (win) win.location.href = url; else download(blob, fileBase(state) + '.pdf');
        afterExport();
        msg('');
      }, function (e) { if (win) win.close(); throw e; });
    });
  });

  /* ---------- XLSX ---------- */
  function qrPng(payload, px) {
    var svg = qrSvg(payload, INK, BLUE_INK);
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var cv = document.createElement('canvas');
        cv.width = cv.height = px;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, px, px);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, px, px);
        res(cv.toDataURL('image/png'));
      };
      img.onerror = rej;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  function buildXlsx(s, c) {
    var ExcelJS = window.ExcelJS;
    var wb = new ExcelJS.Workbook();
    wb.creator = s.s_name || '';
    wb.created = new Date();
    var ws = wb.addWorksheet('Faktura ' + (s.number || '').replace(/[\\/?*[\]:]/g, '-'), {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 } },
      views: [{ showGridLines: false }]
    });
    var FONT = 'IBM Plex Sans', MONO = 'IBM Plex Mono';
    var argb = function (hex) { return 'FF' + hex.replace('#', '').toUpperCase(); };
    ws.columns = [
      { width: 18 }, { width: 14 }, { width: 18 }, { width: 3 },
      { width: 18 }, { width: 14 }, { width: 10 }, { width: 16 }
    ];
    // A–C dodavatel, E–H odběratel / položky přes celou šířku
    var r = 1;
    var put = function (addr, value, style) {
      var cell = ws.getCell(addr);
      cell.value = value;
      cell.font = Object.assign({ name: FONT, size: 10, color: { argb: argb(INK) } }, style && style.font);
      if (style && style.align) cell.alignment = style.align;
      if (style && style.numFmt) cell.numFmt = style.numFmt;
      if (style && style.border) cell.border = style.border;
      return cell;
    };
    var label = { font: { name: MONO, size: 8, color: { argb: argb(MUTE) } } };
    var muted = { font: { color: { argb: argb(MUTE) } } };
    var right = { horizontal: 'right' };
    var MONEY = '#,##0.00 "Kč"';

    // hlavička
    ['E', 'F', 'G', 'H'].forEach(function (col) { ws.getCell(col + r).border = { top: { style: 'thick', color: { argb: argb(BLUE) } } }; });
    put('A' + (r + 1), s.s_name, { font: { bold: true, size: 12 } });
    put('A' + (r + 2), (s.s_tagline || '').toUpperCase(), { font: { name: MONO, size: 8, color: { argb: argb(BLUE_INK) } } });
    ws.mergeCells('E' + (r + 1) + ':H' + (r + 1));
    ws.getCell('E' + (r + 1)).value = { richText: [
      { text: 'Faktura ', font: { name: FONT, size: 22, bold: true, color: { argb: argb(INK) } } },
      { text: s.number || '', font: { name: FONT, size: 22, bold: true, color: { argb: argb(BLUE_INK) } } }
    ] };
    ws.getRow(r + 1).height = 32;
    if (c.vatPayer) put('E' + (r + 2), 'DAŇOVÝ DOKLAD', label);
    r += 4;

    // strany
    put('A' + r, '—  DODAVATEL', label);
    put('E' + r, '—  ODBĚRATEL', label);
    r++;
    put('A' + r, s.s_name, { font: { bold: true, size: 12 } });
    put('E' + r, s.c_name, { font: { bold: true, size: 12 } });
    r++;
    put('A' + r, s.s_street, muted); put('E' + r, s.c_street, muted); r++;
    put('A' + r, s.s_city, muted); put('E' + r, s.c_city, muted); r += 2;

    var pairs = function (col, valCol, rows) {
      var rr = r;
      rows.filter(Boolean).forEach(function (p) {
        put(col + rr, p[0], muted);
        put(valCol + rr, p[1], { font: { name: MONO, size: 9 }, align: right });
        rr++;
      });
      return rr;
    };
    var r1 = pairs('A', 'C', [s.s_ico && ['IČO', s.s_ico], s.s_dic && ['DIČ', s.s_dic], !c.vatPayer && ['', 'Neplátce DPH']]);
    var r2 = pairs('E', 'H', [s.c_ico && ['IČO', s.c_ico], s.c_dic && ['DIČ', s.c_dic]]);
    r = Math.max(r1, r2) + 1;
    r1 = pairs('A', 'C', [c.transfer && ['Bankovní účet', s.s_account], c.transfer && ['IBAN', group4(c.iban)], s.vs && ['Variabilní symbol', s.vs], ['Způsob platby', s.payment]]);
    r2 = pairs('E', 'H', [['Datum vystavení', czDate(s.issued)], ['Datum splatnosti', czDate(s.due)], c.vatPayer && ['Datum zdan. plnění', czDate(s.taxDate || s.issued)]]);
    r = Math.max(r1, r2) + 2;

    // položky: Popis (A–D) | Množství (E) | MJ (F) | Cena za MJ (G) / DPH | Celkem (H)
    var thin = { style: 'thin', color: { argb: argb(INK) } };
    var hair = { style: 'hair', color: { argb: argb(RULE) } };
    var heads = c.vatPayer
      ? [['A', 'POPIS'], ['E', 'MNOŽSTVÍ'], ['F', 'CENA ZA MJ'], ['G', 'DPH'], ['H', 'CELKEM BEZ DPH']]
      : [['A', 'POPIS'], ['E', 'MNOŽSTVÍ'], ['G', 'CENA ZA MJ'], ['H', 'CELKEM']];
    'ABCDEFGH'.split('').forEach(function (col) { ws.getCell(col + r).border = { bottom: thin }; });
    heads.forEach(function (h) { put(h[0] + r, h[1], Object.assign({}, label, { align: h[0] === 'A' ? undefined : right, border: { bottom: thin } })); });
    r++;
    var firstItem = r;
    c.lines.forEach(function (l) {
      ws.mergeCells('A' + r + ':D' + r);
      put('A' + r, l.desc || '—', { font: { bold: true }, align: { wrapText: true, vertical: 'top' } });
      put('E' + r, l.qty, { font: { name: MONO, size: 9 }, align: right, numFmt: l.unit ? '#,##0.##" ' + l.unit.replace(/"/g, '') + '"' : '#,##0.##' });
      put(c.vatPayer ? 'F' + r : 'G' + r, l.price, { font: { name: MONO, size: 9 }, align: right, numFmt: MONEY });
      if (c.vatPayer) put('G' + r, l.rate / 100, { font: { name: MONO, size: 9 }, align: right, numFmt: '0 %' });
      put('H' + r, { formula: 'ROUND(E' + r + '*' + (c.vatPayer ? 'F' : 'G') + r + ',2)', result: l.base }, { font: { name: MONO, size: 9 }, align: right, numFmt: MONEY });
      'ABCDEFGH'.split('').forEach(function (col) { ws.getCell(col + r).border = { bottom: hair }; });
      r++;
    });
    var lastItem = r - 1;
    r += 1;

    // rekapitulace
    var sumTop = r;
    if (c.vatPayer) {
      put('E' + r, 'SAZBA', label); put('F' + r, 'ZÁKLAD', Object.assign({}, label, { align: right })); put('H' + r, 'DPH', Object.assign({}, label, { align: right }));
      r++;
      c.vat.forEach(function (v) {
        var rate = v.rate / 100;
        put('E' + r, rate, { font: { name: MONO, size: 9 }, numFmt: '0 %' });
        put('F' + r, { formula: 'SUMIF(G' + firstItem + ':G' + lastItem + ',E' + r + ',H' + firstItem + ':H' + lastItem + ')', result: v.base }, { font: { name: MONO, size: 9 }, align: right, numFmt: MONEY });
        put('H' + r, { formula: 'ROUND(F' + r + '*E' + r + ',2)', result: v.vat }, { font: { name: MONO, size: 9 }, align: right, numFmt: MONEY });
        r++;
      });
    }
    var thick = { style: 'thick', color: { argb: argb(BLUE) } };
    ['E', 'F', 'G', 'H'].forEach(function (col) { ws.getCell(col + r).border = { top: thick }; });
    put('E' + r, 'CELKEM K ÚHRADĚ', Object.assign({}, label, { border: { top: thick }, align: { vertical: 'middle' } }));
    ws.mergeCells('F' + r + ':H' + r);
    var totalFormula = c.vatPayer
      ? 'SUM(F' + (sumTop + 1) + ':F' + (r - 1) + ')+SUM(H' + (sumTop + 1) + ':H' + (r - 1) + ')'
      : 'SUM(H' + firstItem + ':H' + lastItem + ')';
    put('F' + r, { formula: totalFormula, result: c.total }, { font: { bold: true, size: 18 }, align: { horizontal: 'right', vertical: 'middle' }, numFmt: MONEY, border: { top: thick } });
    ws.getRow(r).height = 30;
    var qrRow = sumTop;
    r = Math.max(r + 2, qrRow + 9);   // QR (120 px) zabere ~8 řádků vlevo

    if (s.note) {
      ws.mergeCells('A' + r + ':H' + r);
      put('A' + r, s.note, { align: { wrapText: true, vertical: 'top' } });
      ws.getRow(r).height = Math.max(16, 14 * (s.note.split('\n').length));
      r += 2;
    }
    var foot = [s.s_footer, contactLine(s)].filter(Boolean);
    foot.forEach(function (t, i) {
      ws.mergeCells('A' + r + ':H' + r);
      put('A' + r, t, { font: { name: i ? MONO : FONT, size: 8, color: { argb: argb(MUTE) } }, border: i ? undefined : { top: hair } });
      r++;
    });

    var payload = spayd(s, c);
    var addQr = payload && c.transfer ? qrPng(payload, 360).then(function (dataUrl) {
      var id = wb.addImage({ base64: dataUrl, extension: 'png' });
      ws.addImage(id, { tl: { col: 0.15, row: qrRow - 1 + 0.2 }, ext: { width: 120, height: 120 } });
      put('A' + (qrRow - 1), 'QR PLATBA', { font: { name: MONO, size: 7, color: { argb: argb(BLUE_INK) } } });
    }) : Promise.resolve();
    return addQr.then(function () { return wb.xlsx.writeBuffer(); });
  }

  document.getElementById('xlsxDownload').addEventListener('click', function () {
    update();
    if (!validate(state, calc)) return;
    withBusy(this, function () {
      msg('Připravuji tabulku…');
      return loadScript('vendor/exceljs.min.js').then(function () { return buildXlsx(state, calc); }).then(function (buf) {
        download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileBase(state) + '.xlsx');
        afterExport();
        msg('Tabulka faktury č. ' + state.number + ' je stažená.');
      });
    });
  });

  /* ---------- theme toggle (stejné chování jako na hlavní stránce) ---------- */
  var toggle = document.getElementById('themeToggle');
  toggle.addEventListener('click', function () {
    var html = document.documentElement;
    var set = html.getAttribute('data-theme');
    var dark = set ? set === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  /* ---------- init ---------- */
  function init() {
    var sup = Object.assign({}, SUPPLIER_DEFAULTS, store.supplier || {});
    writeFields(sup);
    renderCustomerList();

    var d = store.draft;
    if (d && d.number) {
      var items = d.items && d.items.length ? d.items : [{}];
      delete d.items;
      writeFields(d);
      items.forEach(function (it) { addItem(it); });
      if (d.vs && d.vs !== String(d.number).replace(/\D/g, '').slice(0, 10)) field('vs').dataset.touched = '1';
      lastIssued = d.issued;
      update();
    } else {
      field('payment').value = 'Převodem';
      newInvoice(false);
    }
    // knihovny pro PDF se načtou na pozadí, ať je tlačítko hned připravené
    var warm = function () { loadPdf().catch(function () {}); };
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 3000 }); else setTimeout(warm, 1500);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSheet);
  }
  init();
})();
