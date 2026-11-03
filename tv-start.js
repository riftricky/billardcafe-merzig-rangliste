/* NEU: Startet den Café-Bildschirm auf tv.html. Einfaches JavaScript für ältere TV-Browser. */
(function () {
  'use strict';
  function param(name) {
    var m = new RegExp('[?&#]' + name + '=([^&#]+)').exec(location.search + location.hash);
    return m ? decodeURIComponent(m[1]) : '';
  }
  var cfg = window.BillardDeployment || {};
  var base = cfg.apiBase ? String(cfg.apiBase).replace(/\/$/, '') : '';
  function get(path) {
    var url = base + '/api' + path;
    if (window.fetch) return window.fetch(url, {cache: 'no-store', credentials: base ? 'omit' : 'same-origin', headers: {Accept: 'application/json'}}).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    return new Promise(function (ok, fail) {
      var x = new XMLHttpRequest(); x.open('GET', url, true); x.setRequestHeader('Accept', 'application/json');
      x.onload = function () { if (x.status >= 200 && x.status < 300) { try { ok(JSON.parse(x.responseText)); } catch (e) { fail(e); } } else fail(new Error(x.status)); };
      x.onerror = function () { fail(new Error('Netz')); }; x.send();
    });
  }
  // Demo: Der Bildschirm holt sich den Stand von der Demo-App – im selben Browser (anderer Tab/Fenster)
  // oder über den lokalen Demo-Server von einem anderen Gerät (z. B. dem Fernseher im WLAN).
  var channel = null; try { if (window.BCM_DEMO && window.BroadcastChannel) channel = new BroadcastChannel('bcm-demo-tv'); } catch (e) { channel = null; }
  function viaChannel(screen) {
    return new Promise(function (ok, fail) {
      if (!channel) { fail(new Error('kein Kanal')); return; }
      var id = Math.random().toString(36).slice(2), done = false;
      var t = setTimeout(function () { if (!done) { done = true; channel.removeEventListener('message', on); fail(new Error('keine App offen')); } }, 700);
      function on(ev) { var d = ev.data || {}; if (d.type === 'payload' && d.id === id && !done) { done = true; clearTimeout(t); channel.removeEventListener('message', on); ok(d.data); } }
      channel.addEventListener('message', on); channel.postMessage({type: 'get', id: id, screen: screen});
    });
  }
  function viaRelay(screen) {
    return window.fetch('./demo-relay/tv/' + encodeURIComponent(screen), {cache: 'no-store'}).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  var demoGet = function (path) {
    var m = /^\/tv\/screen\/([^/?#]+)/.exec(path);
    if (!m) return get(path);
    var screen = decodeURIComponent(m[1]);
    return viaChannel(screen).catch(function () { return viaRelay(screen); }).catch(function () { return get(path); });
  };
  function boot() { window.BCMTvPlayer.start({root: document.getElementById('tv'), fetch: window.BCM_DEMO ? demoGet : get, screen: param('bildschirm') || 'haupt', pollMs: 10000}); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
