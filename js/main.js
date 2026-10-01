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
    var minDelay = new Promise(function (r) { setTimeout(r, 650); });
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

  /* ---------- mobile menu ---------- */
  var burger = document.getElementById('burger');
  var menu = document.getElementById('menu');
  function setMenu(open) {
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Zavřít menu' : 'Otevřít menu');
    menu.classList.toggle('is-open', open);
    if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
    document.body.classList.toggle('menu-open', open);
    if (open) header.classList.remove('is-hidden');
  }
  burger.addEventListener('click', function () { setMenu(burger.getAttribute('aria-expanded') !== 'true'); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') { setMenu(false); burger.focus(); } });
  window.matchMedia('(min-width: 900px)').addEventListener('change', function (e) { if (e.matches) setMenu(false); });

  /* ---------- reveal on scroll ---------- */
  var reveals = [].slice.call(document.querySelectorAll('[data-reveal]'));
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
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
  function runCounter(el) {
    var target = targetFor(el);
    if (reduceMotion) { el.textContent = String(target); return; }
    var start = null, dur = 1300;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(eased * target));
      if (t < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { runCounter(en.target); cio.unobserve(en.target); } });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { cio.observe(el); });
  } else {
    counters.forEach(function (el) { el.textContent = String(targetFor(el)); });
  }

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

  /* ---------- footer year ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- Czech typography: no line break after one-letter words ---------- */
  var main = document.getElementById('obsah');
  if (main && window.NodeFilter) {
    var re = /(^|[\s(–—])([kKsSvVzZoOuUaAiI])\s(?=\S)/g;
    var walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode && n.parentNode.nodeName;
        if (p === 'SCRIPT' || p === 'STYLE' || p === 'TIME') return NodeFilter.FILTER_REJECT;
        return re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(function (node) { node.nodeValue = node.nodeValue.replace(re, '$1$2 '); });
  }
})();
