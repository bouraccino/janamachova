/* janamachova.cz – progressive enhancements.
   Everything here is optional: the page is fully readable with JS disabled. */
(function () {
  'use strict';

  var html = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- loader ---------- */
  var ready = false;
  function setReady() {
    if (ready) return;
    ready = true;
    html.classList.add('is-ready');
    setTimeout(function () { html.classList.add('is-done'); }, 1000);
  }
  if (reduceMotion) {
    setReady();
  } else {
    var minDelay = new Promise(function (r) { setTimeout(r, 400); });
    var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    Promise.all([minDelay, fonts]).then(setReady, setReady);
    setTimeout(setReady, 2200); /* hard cap, whatever happens */
  }

  /* ---------- image fade-in ---------- */
  var fades = [].slice.call(document.querySelectorAll('img[data-fade]'));
  fades.forEach(function (img) {
    var mark = function () { img.classList.add('is-loaded'); };
    if (img.complete && img.naturalWidth > 0) mark();
    else { img.addEventListener('load', mark); img.addEventListener('error', mark); }
  });
  setTimeout(function () { fades.forEach(function (img) { img.classList.add('is-loaded'); }); }, 3000);

  /* ---------- header: solid after scroll, hide on scroll down ---------- */
  var header = document.getElementById('header');
  var lastY = window.pageYOffset;
  var ticking = false;
  function onScrollHeader() {
    var y = window.pageYOffset;
    header.classList.toggle('is-scrolled', y > 24);
    if (y > 240 && y > lastY + 4 && !document.body.classList.contains('menu-open')) header.classList.add('is-hidden');
    else if (y < lastY - 4 || y <= 240) header.classList.remove('is-hidden');
    lastY = y;
  }
  onScrollHeader();
  header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });

  /* ---------- mobile menu ---------- */
  var burger = document.getElementById('burger');
  var menu = document.getElementById('menu');
  var behind = [].slice.call(document.querySelectorAll('#obsah, footer, .skip')); /* covered by the open menu */
  function setMenu(open) {
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Zavřít menu' : 'Otevřít menu');
    menu.classList.toggle('is-open', open);
    if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
    behind.forEach(function (el) { if (open) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
    document.body.classList.toggle('menu-open', open);
    if (open) header.classList.remove('is-hidden');
  }
  burger.addEventListener('click', function () { setMenu(burger.getAttribute('aria-expanded') !== 'true'); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') { setMenu(false); burger.focus(); } });
  var wideQuery = window.matchMedia ? window.matchMedia('(min-width: 900px)') : null;
  if (wideQuery) {
    var onWide = function (e) { if (e.matches) setMenu(false); };
    if (wideQuery.addEventListener) wideQuery.addEventListener('change', onWide);
    else if (wideQuery.addListener) wideQuery.addListener(onWide);
  }

  /* ---------- reveal on scroll ---------- */
  var reveals = [].slice.call(document.querySelectorAll('[data-reveal]'));
  var inHero = function (el) { return !!el.closest('.hero'); };
  /* Hero children sit in the first viewport by design; CSS holds them until .is-ready, so the stagger is preserved. */
  reveals.filter(inHero).forEach(function (el) { el.classList.add('is-visible'); });
  var scrollReveals = reveals.filter(function (el) { return !inHero(el); });
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    scrollReveals.forEach(function (el) {
      /* whatever is already on screen (restored scroll position, hash) shows at once */
      var r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) el.classList.add('is-visible');
      else io.observe(el);
    });
  } else {
    scrollReveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- marquee pause ---------- */
  var marquee = document.querySelector('.marquee');
  var marqueeToggle = document.getElementById('marqueeToggle');
  if (marquee && marqueeToggle && !reduceMotion) {
    marqueeToggle.hidden = false;
    marqueeToggle.addEventListener('click', function () {
      var paused = !marquee.classList.contains('is-paused');
      marquee.classList.toggle('is-paused', paused);
      marqueeToggle.setAttribute('aria-pressed', paused ? 'true' : 'false');
      marqueeToggle.textContent = paused ? 'Spustit' : 'Pozastavit';
    });
  }

  /* ---------- parallax on photo bands ---------- */
  var px = [].slice.call(document.querySelectorAll('[data-parallax]'));
  function onParallax() {
    if (reduceMotion) return;
    var vh = window.innerHeight;
    px.forEach(function (img) {
      var box = img.parentElement.getBoundingClientRect();
      if (box.bottom < 0 || box.top > vh) return;
      var p = (box.top + box.height / 2 - vh / 2) / (vh / 2 + box.height / 2); /* -1 .. 1 */
      var shift = -p * box.height * 0.08;
      img.style.transform = 'translate3d(0,' + shift.toFixed(1) + 'px,0)';
    });
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () { onScrollHeader(); onParallax(); ticking = false; });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onParallax();

  /* ---------- counters ---------- */
  var counters = [].slice.call(document.querySelectorAll('[data-count]'));
  function targetFor(el) {
    if (el.getAttribute('data-count') === 'years') return Math.max(25, new Date().getFullYear() - 2000);
    return parseInt(el.getAttribute('data-count'), 10) || 0;
  }
  counters.forEach(function (el) { el.textContent = String(targetFor(el)); });

  /* ---------- copy buttons ---------- */
  var canCopy = !!(navigator.clipboard && navigator.clipboard.writeText);
  [].slice.call(document.querySelectorAll('.copy')).forEach(function (btn) {
    if (!canCopy) return;
    btn.hidden = false;
    var label = btn.textContent;
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(btn.getAttribute('data-copy')).then(function () {
        btn.textContent = 'Zkopírováno';
        setTimeout(function () { btn.textContent = label; }, 1600);
      }, function () {});
    });
  });

  /* ---------- light / dark toggle ---------- */
  var toggle = document.getElementById('themeToggle');
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function currentTheme() {
    var set = html.getAttribute('data-theme');
    if (set === 'dark' || set === 'light') return set;
    return (darkQuery && darkQuery.matches) ? 'dark' : 'light';
  }
  function applyThemeMeta() {
    var meta = document.getElementById('themeColor');
    if (meta) { meta.setAttribute('content', currentTheme() === 'dark' ? '#121214' : '#ece8e1'); meta.removeAttribute('media'); }
    if (toggle) toggle.setAttribute('aria-label', currentTheme() === 'dark' ? 'Přepnout světlý režim' : 'Přepnout tmavý režim');
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      applyThemeMeta();
    });
    applyThemeMeta();
    if (darkQuery) {
      var onScheme = function () { applyThemeMeta(); };
      if (darkQuery.addEventListener) darkQuery.addEventListener('change', onScheme);
      else if (darkQuery.addListener) darkQuery.addListener(onScheme);
    }
  }

  /* ---------- QR tile: click keeps the light (universally scannable) version ---------- */
  var qr = document.querySelector('.pay__qr');
  if (qr) {
    qr.setAttribute('role', 'button'); qr.setAttribute('tabindex', '0'); qr.setAttribute('aria-pressed', 'false');
    qr.setAttribute('aria-label', 'Přepnout světlou verzi QR kódu');
    var flip = function () {
      if (currentTheme() !== 'dark') return; /* in light mode the code is already light */
      var on = qr.classList.toggle('is-light'); qr.setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    qr.addEventListener('click', flip);
    qr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  }

  /* ---------- footer year ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Czech typography: no line break after one-letter words ---------- */
  var main = document.getElementById('obsah');
  if (main && window.NodeFilter) {
    var reTest = /(^|[\s(–—„])[kKsSvVzZoOuUaAiI]\s(?=\S)/;
    var walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode && n.parentNode.nodeName;
        if (p === 'SCRIPT' || p === 'STYLE' || p === 'TIME') return NodeFilter.FILTER_REJECT;
        return reTest.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var s = node.nodeValue, prev;
      /* repeat so that "a i fyzické" binds both words */
      do { prev = s; s = s.replace(/(^|[\s(–—„])([kKsSvVzZoOuUaAiI])\s(?=\S)/g, '$1$2 '); } while (s !== prev);
      if (s !== node.nodeValue) node.nodeValue = s;
    });
  }
})();
