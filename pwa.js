/* NEU: Web-App-Ausbau – Installationshinweis, Update-Hinweis und Push-Benachrichtigungen.
   Der Server braucht für Push: GET /api/push/settings, POST /api/push/subscribe, POST /api/push/unsubscribe (siehe UEBERGABE.md). */
(() => {
  'use strict';
  const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const app = () => window.BillardApp;
  const gi = n => window.BCMIcon ? window.BCMIcon(n) : '';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* privater Modus: nur bis zum Neuladen */ } }
  };
  const TOPICS = [
    ['matches', 'Partien & Turniere', 'Bestätigung angefragt, Ergebnis bestätigt, du bist am Tisch dran'],
    ['rewards', 'Gutscheine & Auszeichnungen', 'neuer Gutschein, Pokal oder Abzeichen'],
    ['events', 'Events', 'Erinnerung vor dem Event, Ortsänderung, neue Turniere']
  ];
  const P = {push: null, pushError: '', busy: false, reg: null, waiting: null};

  const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mobile = () => window.matchMedia?.('(pointer: coarse)').matches;
  const pushSupported = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const demo = () => !!window.BillardDemo;

  // ---------- Installieren ----------
  function installChip(state) {
    if (standalone() || !mobile() || store.get('bcm-install-chip') === 'zu') return '';
    const native = !!state?.installPrompt;
    return `<section class="pwa-chip" aria-label="App installieren">${gi('smartphone')}<div><strong>Als App installieren</strong><small>Mit einem Tipp vom Startbildschirm öffnen${ios() ? '' : ' – auch mit Benachrichtigungen'}.</small></div>
      ${native ? '<button type="button" class="btn small primary" data-action="install">Installieren</button>' : '<a class="btn small primary" href="#installieren">So geht’s</a>'}
      <button type="button" class="pwa-x" data-pwa="chip-close" aria-label="Hinweis ausblenden">×</button></section>`;
  }

  // ---------- Update-Hinweis ----------
  function updateBanner() {
    if (document.querySelector('.pwa-update')) return;
    const el = document.createElement('div');
    el.className = 'pwa-update'; el.setAttribute('role', 'status');
    el.innerHTML = `${gi('stars-stack')}<span>Neue Version der App ist da.</span><button type="button" class="btn small primary" data-pwa="update">Neu laden</button>`;
    document.body.append(el);
  }
  async function watchUpdates() {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
    if (!reg) return;
    P.reg = reg;
    const track = w => { if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { P.waiting = w; updateBanner(); } }); };
    if (reg.waiting && navigator.serviceWorker.controller) { P.waiting = reg.waiting; updateBanner(); }
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }

  // ---------- Push ----------
  async function loadPush() {
    try { P.push = await app().request('/push/settings'); P.pushError = ''; }
    catch (er) { P.push = null; P.pushError = er.status === 404 ? 'Der Server unterstützt Benachrichtigungen noch nicht.' : er.message; }
  }
  function keyBytes(b64) {
    const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  }
  async function enable() {
    if (P.busy) return; P.busy = true; app().render();
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Benachrichtigungen sind für diese Seite blockiert. Du kannst sie in den Einstellungen des Browsers wieder erlauben.' : 'Ohne deine Erlaubnis kommen keine Benachrichtigungen.');
      const topics = P.push?.topics?.length ? P.push.topics : TOPICS.map(t => t[0]);
      let subscription = null;
      if (!demo()) {
        const reg = await navigator.serviceWorker.ready;
        if (!P.push?.key) throw new Error('Der Server unterstützt Benachrichtigungen noch nicht.');
        const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: keyBytes(P.push.key)});
        subscription = sub.toJSON();
      }
      P.push = await app().write('/push/subscribe', {subscription, topics}, 'push-on:' + Date.now());
      app().notify('Benachrichtigungen sind an.');
    } catch (er) { app().notify(er.message, true); }
    P.busy = false; app().render();
  }
  async function disable() {
    if (P.busy) return; P.busy = true;
    try {
      if (!demo()) { const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); }
      P.push = await app().write('/push/unsubscribe', {}, 'push-off:' + Date.now());
      app().notify('Benachrichtigungen sind aus.');
    } catch (er) { app().notify(er.message, true); }
    P.busy = false; app().render();
  }
  async function toggleTopic(id) {
    const cur = new Set(P.push?.topics || []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    try { P.push = await app().write('/push/topics', {topics: [...cur]}, 'push-topics:' + [...cur].join() + Date.now()); } catch (er) { app().notify(er.message, true); }
    app().render();
  }
  async function test() {
    const title = 'Billardcafé Merzig', body = 'So sieht eine Benachrichtigung aus. 🎱';
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) await reg.showNotification(title, {body, icon: './icons/icon-192.png', badge: './icons/badge-96.png', tag: 'test'});
      else new Notification(title, {body, icon: './icons/icon-192.png'});
    } catch (er) { app().notify('Testnachricht ging nicht: ' + er.message, true); }
  }
  // Demo: Nachrichten aus der App zusätzlich als Systembenachrichtigung, wenn der Tab im Hintergrund ist
  function local(text) {
    if (!demo() || !P.push?.enabled || !('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
    try { new Notification('Billardcafé Merzig', {body: String(text).slice(0, 240), icon: './icons/icon-192.png', tag: 'demo'}); } catch { /* manche Browser nur über Service Worker */ }
  }

  function pushCard(state) {
    if (!state?.session?.authenticated || state.session.user?.role) return '';
    let body;
    if (!pushSupported() && !(demo() && 'Notification' in window)) {
      body = ios() && !standalone()
        ? `<p class="hint">Auf dem iPhone kommen Benachrichtigungen, sobald die App auf dem Home-Bildschirm liegt (ab iOS 16.4).</p><a class="btn small" href="#installieren">So installierst du die App</a>`
        : '<p class="hint">Dieser Browser kann keine Benachrichtigungen empfangen.</p>';
    } else if (!P.push && !P.pushError) {
      body = '<p class="hint">Wird geladen …</p>';
    } else if (P.pushError) {
      body = `<p class="hint">${e(P.pushError)}</p>`;
    } else if (!P.push.enabled) {
      const blocked = 'Notification' in window && Notification.permission === 'denied';
      body = `<p class="hint">Nur, was du auswählst – kein Werbe-Spam. Abschalten jederzeit hier.</p>
        ${blocked ? '<p class="hint pwa-warn">Benachrichtigungen sind im Browser für diese Seite blockiert. Erlaube sie dort in den Website-Einstellungen.</p>' : `<button type="button" class="btn primary" data-pwa="push-on" ${P.busy ? 'disabled' : ''}>${gi('megaphone')} Benachrichtigungen einschalten</button>`}`;
    } else {
      const on = new Set(P.push.topics || []);
      body = `<div class="nt-radio-list pwa-topics">${TOPICS.map(([id, n, s]) => `<button type="button" role="switch" aria-checked="${on.has(id)}" data-pwa="topic" data-t="${id}"><span class="pwa-switch" aria-hidden="true"></span><span><strong>${n}</strong><small>${s}</small></span></button>`).join('')}</div>
        <div class="ad-actions"><button type="button" class="btn small" data-pwa="push-test">Testnachricht</button><button type="button" class="btn small" data-pwa="push-off">Ausschalten</button></div>`;
    }
    return `<section class="fx-card pwa-push" aria-labelledby="pwa-push-title"><div class="section-heading"><h2 id="pwa-push-title">${gi('megaphone')}Benachrichtigungen</h2>${P.push?.enabled ? '<span class="badge confirmed">An</span>' : ''}</div>${body}</section>`;
  }

  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-pwa]');
    if (!el) return;
    const a = el.dataset.pwa;
    if (a === 'chip-close') { store.set('bcm-install-chip', 'zu'); el.closest('.pwa-chip')?.remove(); }
    if (a === 'update' && P.waiting) { el.disabled = true; P.waiting.postMessage({type: 'skip-waiting'}); }
    if (a === 'push-on') enable();
    if (a === 'push-off') disable();
    if (a === 'push-test') test();
    if (a === 'topic') toggleTopic(el.dataset.t);
  });

  let started = false;
  window.BCMPwa = {
    installChip, pushCard, local, standalone,
    async load(view, state) {
      if (!started) { started = true; document.documentElement.classList.toggle('pwa-standalone', standalone()); setTimeout(watchUpdates, 1500); }
      if (view === 'profile' && state?.session?.authenticated && !state.session.user?.role) await loadPush();
    }
  };
})();
