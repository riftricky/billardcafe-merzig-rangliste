/* NEU: TV-Player für den Café-Bildschirm.
   Läuft eigenständig (tv.html) und in der App (#tv/<bildschirm>).
   Bewusst einfaches JavaScript (ES2015, ohne ?. / ?? / async / Objekt-Spread), damit auch ältere
   Smart-TV-Browser (Tizen, webOS, Fire TV, Android TV) die Ansicht darstellen.
   Die Bühne ist fest 1920 × 1080 Pixel und wird auf jede Bildschirmgröße skaliert. */
(function () {
  'use strict';
  var W = 1920, H = 1080;
  var BALL = ['#f3ecdc', '#f0bf2e', '#2a62c0', '#d33a2e', '#6e3fa3', '#e8732a', '#2c8a4f', '#8b2c2b', '#151515'];
  var S = {root: null, fetch: null, screen: 'haupt', data: null, rev: null, i: 0, slideTimer: null, poll: null, clock: null, hideTimer: null, closeHref: '', wake: null};

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
  function icon(n, cls) { return window.BCMIcon ? window.BCMIcon(n, cls || '') : ''; }
  function ballColor(n) { n = Number(n) || 0; return BALL[n > 8 ? n - 8 : n] || BALL[0]; }
  function ball(n, size) { var c = ballColor(n); return '<span class="tvp-ball' + (n > 8 ? ' stripe' : '') + '" style="width:' + size + 'px;height:' + size + 'px;background:' + c + '"><b>' + (n || '') + '</b></span>'; }
  function hm(iso) { var d = new Date(iso); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function mins(iso) { var m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000)); return m < 60 ? m + ' Min' : Math.floor(m / 60) + ' Std ' + ('0' + (m % 60)).slice(-2); }
  function dateLong(iso) { var d = new Date(iso), wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()]; return wd + ', ' + ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '. · ' + hm(iso) + ' Uhr'; }

  // ---------- Bausteine ----------
  function player(p, score, win) {
    return '<div class="tvp-p' + (p ? '' : ' tbd') + (win ? ' win' : '') + '">' + (p ? ball(p.ball, 34) : '<span class="tvp-dot"></span>') + '<span class="tvp-n">' + (p ? esc(p.name) : 'offen') + '</span><b>' + (score == null ? '' : score) + '</b></div>';
  }
  function match(m, big) {
    if (!m || m.status === 'bye') return '';
    var live = m.status === 'live' ? '<span class="tvp-live">' + (m.table_no ? 'Tisch ' + m.table_no : 'läuft') + '</span>' : '';
    var head = m.round || live ? '<div class="tvp-mhead"><span class="tvp-round">' + esc(m.round || '') + '</span>' + live + '</div>' : '';
    return '<div class="tvp-m ' + m.status + (big ? ' big' : '') + '">' + head + player(m.a, m.score_a, m.win === 'a') + player(m.b, m.score_b, m.win === 'b') + '</div>';
  }
  function bracket(t, compact) {
    var cols = t.rounds.map(function (r) {
      return '<section class="tvp-col"><h3>' + esc(r.name) + '</h3><div class="tvp-ms">' + r.matches.map(function (m) { return match(m); }).join('') + '</div></section>';
    }).join('');
    if (t.third) cols += '<section class="tvp-col tvp-third"><h3>Platz 3</h3><div class="tvp-ms">' + match(t.third) + '</div></section>';
    var first = t.rounds[0] ? t.rounds[0].matches.filter(function (m) { return m.status !== 'bye'; }).length : 0;
    var dense = first > 8 ? ' xdense' : first > 4 ? ' dense' : '';
    return '<div class="tvp-bracket' + (compact ? ' compact' : '') + dense + '">' + cols + '</div>';
  }
  function podium(t) {
    if (!t || !t.places) return '';
    function col(pl, cls, h) {
      var ps = t.places[pl] || [];
      return '<div class="tvp-pod ' + cls + '"><div class="tvp-pod-names">' + ps.map(function (p) { return '<span>' + ball(p.ball, 92) + '<strong>' + esc(p.name) + '</strong></span>'; }).join('') + '</div><b style="height:' + h + 'px">' + icon(pl === 1 ? 'podium-winner' : pl === 2 ? 'podium-second' : 'podium-third') + pl + '</b></div>';
    }
    return '<div class="tvp-podium">' + col(2, 'p2', 200) + col(1, 'p1', 290) + col(3, 'p3', 150) + '</div>';
  }

  // ---------- Folien ----------
  function slideHTML(sl) {
    if (!sl) return '<div class="tvp-empty">' + icon('pool-triangle') + '<p>Gleich geht es weiter.</p></div>';
    if (sl.type === 'leaders') return '<h2>' + esc(sl.title) + '</h2><ul class="tvp-leaders">' + sl.rows.map(function (r) { return '<li>' + ball(r.no, 76) + '<span class="tvp-who"><small>' + esc(r.liga) + '</small><strong>' + esc(r.name) + '</strong></span><b>' + r.points + ' P.</b></li>'; }).join('') + '</ul>';
    if (sl.type === 'bracket') {
      if (!S.data.screen.show_tables) return '<h2>' + icon('organigram', 'tvp-h-ic') + esc(sl.title) + ' · live</h2>' + bracket(sl.t, true);
      var t = sl.t;
      return '<h2>' + icon('organigram', 'tvp-h-ic') + esc(sl.title) + ' · live</h2><div class="tvp-two"><div><h3 class="tvp-h3">Jetzt am Tisch</h3>' + (t.live.length ? t.live.slice(0, 3).map(function (m) { return match(m, true); }).join('') : '<p class="tvp-muted">Gleich geht es weiter.</p>') +
        '</div><div>' + (t.next.length ? '<h3 class="tvp-h3">Als Nächstes</h3>' + t.next.slice(0, 2).map(function (m) { return match(m); }).join('') : '') + (t.results.length ? '<h3 class="tvp-h3">Ergebnisse</h3>' + t.results.slice(0, 2).map(function (m) { return match(m); }).join('') : '') + '</div></div>';
    }
    if (sl.type === 'podium') return '<h2>' + icon('trophy', 'tvp-h-ic') + esc(sl.title) + '</h2>' + podium(sl.t);
    if (sl.type === 'event') return '<h2>' + esc(sl.title) + '</h2><p class="tvp-big">' + esc(sl.name) + '</p><p class="tvp-sub">' + esc(dateLong(sl.when)) + (sl.price ? ' · ' + esc(sl.price) : '') + '</p>' + (sl.venue ? '<p class="tvp-sub tvp-venue">' + icon('position-marker') + esc(sl.venue.name) + ' · ' + esc(sl.venue.address) + '</p>' : '') + (sl.seats ? '<p class="tvp-sub">' + esc(sl.seats) + '</p>' : '');
    if (sl.type === 'list') return '<h2>' + esc(sl.title) + '</h2><ul class="tvp-list">' + sl.items.map(function (x) { return '<li><strong>' + esc(x.title) + '</strong>' + (x.text ? '<span>' + esc(x.text) + '</span>' : '') + '</li>'; }).join('') + '</ul>' + (sl.note ? '<p class="tvp-sub">' + esc(sl.note) + '</p>' : '');
    if (sl.type === 'media') return sl.video ? '<div class="tvp-media"><video src="' + esc(sl.video) + '" autoplay muted playsinline preload="auto"></video></div>' + (sl.sponsor ? '<p class="tvp-credit">präsentiert von ' + esc(sl.sponsor) + '</p>' : '')
      : '<div class="tvp-media"><img src="' + esc(sl.image) + '" alt=""></div>' + (sl.sponsor ? '<p class="tvp-credit">präsentiert von ' + esc(sl.sponsor) + '</p>' : '');
    if (sl.type === 'custom') {
      if (sl.image || sl.video) return '<div class="tvp-feature"><div class="tvp-feature-pic">' + (sl.video ? '<video src="' + esc(sl.video) + '" autoplay muted loop playsinline></video>' : '<img src="' + esc(sl.image) + '" alt="">') + '</div><div class="tvp-feature-text"><h2>' + esc(sl.title) + '</h2><p class="tvp-big">' + esc(sl.text) + '</p></div></div>';
      return '<div class="tvp-custom">' + icon(sl.icon || 'stars-stack', 'tvp-custom-ic') + '<h2>' + esc(sl.title) + '</h2>' + (sl.text ? '<p class="tvp-big">' + esc(sl.text) + '</p>' : '') + '</div>';
    }
    return '';
  }
  function tournamentScreen(sl) {
    var t = sl.t;
    if (sl.type === 'podium' || t.status === 'finished') return '<div class="tvp-tour-full"><h1 class="tvp-tour-title">' + icon('trophy', 'tvp-h-ic') + 'Siegerehrung · ' + esc(t.name) + '</h1>' + podium(t) + '</div>';
    var side = '<section class="tvp-side"><h3>' + icon('pool-table-corner', 'tvp-h-ic') + 'Jetzt am Tisch</h3>' + (t.live.length ? t.live.map(function (m) { return match(m, true); }).join('') : '<p class="tvp-muted">Gleich geht es weiter.</p>') +
      (t.next.length ? '<h3>Als Nächstes</h3>' + t.next.map(function (m) { return match(m); }).join('') : '') +
      (t.results.length ? '<h3>Letzte Ergebnisse</h3>' + t.results.slice(0, 3).map(function (m) { return match(m); }).join('') : '') + '</section>';
    return '<div class="tvp-tour"><div class="tvp-tour-head"><h1>' + icon('organigram', 'tvp-h-ic') + esc(t.name) + '</h1><span>' + esc(t.pool_label) + ' · Race to ' + t.race_to + ' · ' + t.players + ' Teilnehmer</span></div><div class="tvp-tour-body"><section class="tvp-tour-tree">' + bracket(t) + '</section>' + side + '</div></div>';
  }

  // ---------- Bühne ----------
  function current() { var d = S.data; if (!d || !d.slides.length) return null; return d.slides[S.i % d.slides.length]; }
  function render() {
    if (!S.root || !S.data) return;
    var d = S.data, sl = current(), tour = !!sl && (d.screen.mode === 'tournament' || d.screen.mode === 'podium');
    var tables = d.screen.show_tables ? '<section class="tvp-tables"><h2>Tische</h2><ul>' + d.tables.map(function (t) { return '<li class="' + t.status + '"><span class="tvp-no">' + t.no + '</span><span class="tvp-time"' + (t.status === 'busy' ? ' data-since="' + esc(t.since) + '"' : '') + '>' + (t.status === 'busy' ? mins(t.since) : 'frei') + '</span><small>' + (t.status === 'busy' ? 'läuft' : 'QR am Tisch scannen') + '</small></li>'; }).join('') + '</ul></section>' : '';
    var dots = d.slides.length > 1 ? '<div class="tvp-dots">' + d.slides.map(function (_, n) { return '<i class="' + (n === S.i % d.slides.length ? 'on' : '') + '"></i>'; }).join('') + '</div>' : '';
    var banner = d.banners.length ? '<div class="tvp-banner"><img src="' + esc(d.banners[Math.floor(Date.now() / 20000) % d.banners.length].src) + '" alt=""></div>' : '';
    var body = tour ? tournamentScreen(sl) : (tables + '<section class="tvp-slide' + (sl && (sl.type === 'media') ? ' media' : '') + '">' + slideHTML(sl) + dots + '</section>');
    S.root.innerHTML = '<div class="tvp-stage" id="tvp-stage">' +
      '<div class="tvp-head"><img src="./icons/icon.svg" alt=""><div><strong>' + esc(d.venue.name) + '</strong><span>Rangliste · live</span></div><time id="tvp-clock"></time></div>' +
      '<div class="tvp-main' + (d.screen.show_tables && !tour ? '' : ' wide') + '">' + body + '</div>' +
      '<div class="tvp-foot">' + banner + (d.footer ? '<p>' + esc(d.footer) + '</p>' : '') + '</div>' +
      announcementHTML() + '</div>' +
      '<div class="tvp-ctrl" id="tvp-ctrl"><button type="button" id="tvp-fs">Vollbild</button>' + (S.closeHref ? '<a href="' + esc(S.closeHref) + '">Schließen</a>' : '') + '</div>';
    fit(); tick(); bindVideo();
  }
  function announcementHTML() { var a = S.data && S.data.announcement; return a ? '<div class="tvp-ann">' + icon('megaphone', 'tvp-ann-ic') + '<p>' + esc(a.text) + '</p></div>' : ''; }
  function fit() {
    var st = document.getElementById('tvp-stage'); if (!st || !S.root) return;
    var w = S.root.clientWidth || window.innerWidth, h = S.root.clientHeight || window.innerHeight;
    var k = Math.min(w / W, h / H);
    st.style.transform = 'translate(' + Math.round((w - W * k) / 2) + 'px,' + Math.round((h - H * k) / 2) + 'px) scale(' + k + ')';
  }
  function tick() {
    var c = document.getElementById('tvp-clock'); if (c) c.textContent = hm(new Date().toISOString());
    var els = S.root ? S.root.querySelectorAll('[data-since]') : [];
    for (var n = 0; n < els.length; n++) els[n].textContent = mins(els[n].getAttribute('data-since'));
  }
  function schedule() {
    clearTimeout(S.slideTimer);
    var sl = current(); if (!S.data || S.data.slides.length < 2) return;
    if (sl && sl.type === 'media' && sl.video) return; // Video: weiter, wenn es zu Ende ist (bindVideo)
    S.slideTimer = setTimeout(next, Math.max(5, S.data.seconds || 12) * 1000);
  }
  function next() { S.i++; render(); schedule(); }
  function bindVideo() {
    var v = S.root && S.root.querySelector('.tvp-media video'); if (!v) return;
    var done = false, go = function () { if (!done) { done = true; next(); } };
    v.addEventListener('ended', go); v.addEventListener('error', function () { setTimeout(go, 3000); });
    setTimeout(go, 180000); // Sicherheitsnetz: höchstens 3 Minuten pro Video
    var p = v.play && v.play(); if (p && p.catch) p.catch(function () { setTimeout(go, 3000); });
  }
  function load(first) {
    return S.fetch('/tv/screen/' + encodeURIComponent(S.screen)).then(function (d) {
      var changed = !S.data || d.rev !== S.rev || JSON.stringify(d.announcement) !== JSON.stringify(S.data.announcement);
      var tablesChanged = S.data && JSON.stringify(d.tables) !== JSON.stringify(S.data.tables);
      S.data = d; S.rev = d.rev;
      if (first || changed) { if (S.i >= d.slides.length) S.i = 0; render(); schedule(); }
      else if (tablesChanged && !(current() && current().video)) render();
    }).catch(function () { /* Netzfehler: letzte Ansicht bleibt stehen, nächster Versuch beim nächsten Abruf */ });
  }
  function showCtrl() {
    var c = document.getElementById('tvp-ctrl'); if (!c) return;
    c.className = 'tvp-ctrl show'; document.body.style.cursor = '';
    clearTimeout(S.hideTimer); S.hideTimer = setTimeout(function () { var x = document.getElementById('tvp-ctrl'); if (x) x.className = 'tvp-ctrl'; document.body.style.cursor = 'none'; }, 3000);
  }
  function fullscreen() {
    var el = document.documentElement, rq = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (rq) { try { rq.call(el); } catch (e) { /* TV ohne Vollbild-Funktion */ } }
    wake();
  }
  function wake() { try { if (navigator.wakeLock && !S.wake) navigator.wakeLock.request('screen').then(function (l) { S.wake = l; l.addEventListener('release', function () { S.wake = null; }); }).catch(function () {}); } catch (e) { /* nicht unterstützt */ } }
  function onClick(ev) { if (ev.target && ev.target.id === 'tvp-fs') fullscreen(); }
  function onVis() { if (document.visibilityState === 'visible') { S.wake = null; wake(); load(true); } }

  window.BCMTvPlayer = {
    start: function (opts) {
      this.stop();
      S.root = opts.root; S.fetch = opts.fetch; S.screen = opts.screen || 'haupt'; S.closeHref = opts.closeHref || ''; S.i = 0; S.data = null; S.rev = null;
      if (opts.cached && opts.cached.screen && opts.cached.screen.id === S.screen) { S.data = opts.cached; S.rev = opts.cached.rev; render(); schedule(); }
      load(true);
      S.poll = setInterval(load, opts.pollMs || 10000);
      S.clock = setInterval(tick, 15000);
      window.addEventListener('resize', fit); document.addEventListener('mousemove', showCtrl); document.addEventListener('keydown', showCtrl);
      document.addEventListener('click', onClick); document.addEventListener('visibilitychange', onVis);
      wake();
    },
    remount: function (root) { S.root = root; render(); load(); },
    stop: function () {
      clearTimeout(S.slideTimer); clearInterval(S.poll); clearInterval(S.clock); clearTimeout(S.hideTimer);
      S.slideTimer = S.poll = S.clock = S.hideTimer = null;
      window.removeEventListener('resize', fit); document.removeEventListener('mousemove', showCtrl); document.removeEventListener('keydown', showCtrl);
      document.removeEventListener('click', onClick); document.removeEventListener('visibilitychange', onVis);
      if (S.wake && S.wake.release) { try { S.wake.release(); } catch (e) { /* egal */ } }
      S.wake = null; S.root = null; document.body.style.cursor = '';
    },
    get screen() { return S.screen; },
    get running() { return !!S.poll; },
    get data() { return S.data; }
  };
})();
