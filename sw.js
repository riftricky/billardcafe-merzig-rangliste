'use strict';
const CACHE = 'merzig-shell-v13';
const SHELL = ['./', './index.html', './app.css', './opening.css', './opening.js', './deployment-config.js', './remote-auth.js', './branding/cafe-logo.svg', './scorekeeper.css', './rules.js', './scorekeeper.js', './app.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  /* NEU: Erweiterungen, Schriften und Icons, damit die App-Oberfläche auch offline startet */
  './fonts.css', './fonts/barlow-condensed-500.woff', './fonts/barlow-condensed-600.woff', './fonts/barlow-condensed-700.woff', './fonts/manrope-var.woff', './fonts/caveat-var.woff',
  './theme.css', './features.css', './tv-player.css', './vendor/qrcode.js', './icons.js', './tv-player.js', './pwa.js', './features.js', './admin.js',
  './icons/icon-maskable-192.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/badge-96.png'];
const shellURLs = new Set(SHELL.map(path => new URL(path, self.registration.scope).href));
const canCache = response => response.ok && response.type === 'basic' && !response.headers.has('set-cookie') && !/private|no-store/i.test(response.headers.get('cache-control') || '');
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all([...shellURLs].map(async url => {
    const response = await fetch(url, {credentials: 'omit', cache: 'reload'});
    if (!response.ok) throw new Error('Shell unavailable');
    if (canCache(response)) await cache.put(url, response);
  }))));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('merzig-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Exact allowlist: never intercept APIs, writes, private pages, or arbitrary URLs.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search || !shellURLs.has(url.href)) return;
  event.respondWith(fetch(request).then(response => {
    if (canCache(response)) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || Response.error()));
});

/* NEU: Neue Version erst nach Bestätigung in der App übernehmen („Neu laden“), damit keine Eingabe verloren geht. */
self.addEventListener('message', event => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
});

/* NEU: Push-Benachrichtigungen. Der Server schickt {title, body, url, tag}; der Inhalt bleibt kurz und ohne private Details. */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {body: event.data?.text() || ''}; }
  const scope = self.registration.scope;
  const target = new URL(typeof data.url === 'string' ? data.url : './#spielen', scope);
  event.waitUntil(self.registration.showNotification(String(data.title || 'Billardcafé Merzig').slice(0, 80), {
    body: String(data.body || '').slice(0, 240),
    icon: new URL('./icons/icon-192.png', scope).href,
    badge: new URL('./icons/badge-96.png', scope).href,
    tag: typeof data.tag === 'string' ? data.tag.slice(0, 64) : undefined,
    lang: 'de',
    data: {url: target.origin === self.location.origin && target.href.startsWith(scope) ? target.href : scope}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) return open.navigate(url).then(c => (c || open).focus()).catch(() => open.focus());
    return self.clients.openWindow(url);
  }));
});
