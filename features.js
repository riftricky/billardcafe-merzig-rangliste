'use strict';
/*
 * ERWEITERUNGEN (Prototyp)
 * ------------------------
 * Liga-Wertung pro Café-Liga, Titel des Monats, Stufen & Fortschritt, Gewinnchance,
 * Wochenaufgaben, Bonusheft mit Gutschein, Abzeichen, Events und Café-Bildschirm.
 *
 * Alle Daten kommen über BillardApp.request(...) vom Server (bzw. in der Demo von demo-api.js).
 * Benötigte neue Endpunkte: siehe UEBERGABE.md.
 */
(() => {
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const app = () => window.BillardApp;
  const HERE_KEY = 'bcm-am-tisch';
  function readHere() { try { const h = JSON.parse(sessionStorage.getItem(HERE_KEY) || 'null'); return h && Date.now() - h.at < 4 * 3600000 ? h : null; } catch { return null; } }
  function saveHere(h) { try { h ? sessionStorage.setItem(HERE_KEY, JSON.stringify(h)) : sessionStorage.removeItem(HERE_KEY); } catch { /* ohne Speicher nur bis zum Neuladen */ } }
  const fx = {here: null, achievements: null, events: null, tables: null, feed: null, odds: {}, boardMode: 'liga', tvTimer: null, tvSlide: 0, clock: null};
  const ROMAN = ['', 'I', 'II', 'III'];
  // Icons aus icons.js (game-icons.net, CC BY 3.0)
  const gi = (n, cls = '', label = '') => window.BCMIcon ? window.BCMIcon(n, cls, label) : '';
  const BADGE_ICON = {'erste-kugel': 'eight-ball', gesellig: 'meeple-group', mentor: 'teacher', allrounder: 'pool-triangle', serie: 'lightning-trio', riesentoeter: 'slingshot',
    treue: 'coffee-cup', serie141: 'progression', doppelpack: 'two-shadows', fairplay: 'hand-ok', turnier: 'crossed-swords', aufsteiger: 'stairs-goal', monatssieger: 'laurel-crown', champion: 'crown'};
  const EVENT_ICON = {Turnier: 'trophy-cup', Einsteigerabend: 'teacher', Doppel: 'two-shadows', Siegerehrung: 'podium-winner', Aktion: 'present'};
  function honorIcon(t) {
    if (String(t.id || '').startsWith('bd-') && BADGE_ICON[t.id.slice(3)]) return BADGE_ICON[t.id.slice(3)];
    const n = String(t.name || '');
    return /Champion/.test(n) ? 'crown' : /Monatssieger/.test(n) ? 'laurel-crown' : /Stammgast/.test(n) ? 'coffee-cup' : /Aufsteiger/.test(n) ? 'stairs-goal'
      : /Fair/.test(n) ? 'hand-ok' : /Turnier/.test(n) ? 'crossed-swords' : /Helfer|Mentor/.test(n) ? 'teacher' : 'stars-stack';
  }
  const isStaff = state => !!(state?.session?.authenticated && state.session.user?.role);
  const mapLink = v => `https://www.openstreetmap.org/search?query=${encodeURIComponent(v.address)}`;
  const venueLine = (v, prefix = '') => v ? `<span class="nt-venue ${v.main ? '' : 'other'}">${gi('position-marker')}${prefix}${e(v.name)}</span>` : '';
  const LIGEN = ['1. Café-Liga', '2. Café-Liga', '3. Café-Liga', '4. Café-Liga'];
  const PRIZES = {'1. Café-Liga': '1 Tischstunde + Gravur', '2. Café-Liga': '1 Tischstunde', '3. Café-Liga': '1 Tischstunde', '4. Café-Liga': '1 Tischstunde'};
  const BALL = ['#f2c230','#2463b8','#d2392f','#6b3fa0','#e8742a','#2d8a4e','#8a2b2b','#1b1b1b','#f2c230','#2463b8'];
  const time = v => new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}).format(new Date(v)) + ' Uhr';
  const minutes = since => Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 60000));
  const duration = since => { const m = minutes(since); return m < 60 ? `${m} Min` : `${Math.floor(m / 60)} Std ${String(m % 60).padStart(2, '0')}`; };

  async function get(key, path) {
    try { fx[key] = await app().request(path); fx[key + 'Error'] = ''; }
    catch (err) { fx[key + 'Error'] = err.message; }
  }
  async function getInto(bucket, id, path) {
    try { (fx[bucket] ||= {})[id] = await app().request(path); fx[bucket + 'Error'] = ''; }
    catch (err) { fx[bucket + 'Error'] = err.message; }
  }
  async function load(view, state, r = {}) {
    const signed = !!state.session?.authenticated && !isStaff(state);
    if (isStaff(state) && (['home', 'erfolge', 'profil-bearbeiten', 'tisch'].includes(view) || (view === 'statistik' && (!r.id || r.id === 'me')))) { location.replace('#admin'); return; }
    const jobs = [];
    if (view === 'turnier' && r.id) { fx.tour = null; jobs.push(get('tour', '/tournaments/' + encodeURIComponent(r.id))); }
    if (view === 'events') jobs.push(get('tours', '/tournaments'));
    if (signed && ['profile', 'profil-bearbeiten'].includes(view)) jobs.push(getInto('profiles', 'me', '/profile/me'));
    if (view !== 'profil-bearbeiten') fx.draft = null;
    if (view === 'admin' && window.BillardAdmin) jobs.push(window.BillardAdmin.load(state, r));
    if (['spieler', 'statistik'].includes(view) && r.id) {
      jobs.push(getInto('profiles', r.id, '/profile/' + encodeURIComponent(r.id)));
      jobs.push(getInto('stats', r.id, '/stats/' + encodeURIComponent(r.id)));
    }
    if (fx.here === null) fx.here = readHere() || false;
    if (view === 'tisch' && r.id) { fx.scan = null; jobs.push(get('scan', '/tables/' + encodeURIComponent(r.id))); }
    if (view === 'home') jobs.push(get('tables', '/tables' + (fx.here ? '?venue=' + encodeURIComponent(fx.here.venue.id) : '')));
    if (['home', 'events'].includes(view)) jobs.push(get('events', '/events'));
    if (signed && ['home', 'erfolge', 'profile'].includes(view)) jobs.push(get('achievements', '/achievements'));
    if (window.BCMPwa) jobs.push(window.BCMPwa.load(view, state));
    await Promise.all(jobs);
    const unseen = fx.achievements?.unseen;
    if (unseen?.length) { app().notify('🎱 ' + unseen.join(' · ')); window.BCMPwa?.local(unseen.join(' · ')); fx.achievements.unseen = []; app().write('/achievements/seen', {count: unseen.length}, 'seen:' + Date.now()).catch(() => {}); }
  }

  // ---------- Start-Bildschirm ----------
  function home(signed) {
    const free = fx.tables?.tables?.filter(t => t.status === 'free').length;
    const total = fx.tables?.tables?.length;
    const next = fx.events?.events?.[0];
    const week = fx.achievements?.week || [];
    const done = week.filter(q => q.done).length;
    const h = fx.here;
    return `${window.BCMPwa ? window.BCMPwa.installChip(app().state) : ''}${h ? `<section class="fx-here" aria-label="Dein Tisch">${gi('pool-table-corner', 'fx-here-ic')}<div><span class="fx-tile-label">Du spielst an</span><strong>Tisch ${h.no}${h.name ? ` · ${e(h.name)}` : ''}</strong><small>${e(h.venue.name)}</small></div><button type="button" class="btn small" data-fx="leave-table">Verlassen</button></section>` : ''}
    <section class="fx-home" aria-label="Im Café">
      <a class="fx-tile" href="#tv"><span class="fx-tile-label">Tische jetzt${h && !h.venue.main ? ` · ${e(h.venue.name)}` : ''}</span><strong>${free == null ? '…' : `${free} von ${total} frei`}</strong><span class="fx-tables-mini" aria-hidden="true">${(fx.tables?.tables || []).map(t => `<i class="${t.status}"></i>`).join('')}</span></a>
      ${signed ? `<a class="fx-tile" href="#erfolge"><span class="fx-tile-label">Wochenaufgaben</span><strong>${week.length ? `${done} von ${week.length} geschafft` : '…'}</strong><span class="fx-tile-sub">${fx.achievements ? `${fx.achievements.stamps.count}/10 Stempel im Bonusheft` : ''}</span></a>` : ''}
      ${next ? `<a class="fx-tile fx-tile-wide" href="#events"><span class="fx-tile-label">Nächstes Event · ${e(next.type)}</span><strong>${e(next.title)}</strong><span class="fx-tile-sub">${e(time(next.starts_at))}${next.registered ? ' · du bist dabei' : ''}</span></a>` : ''}
    </section>`;
  }

  // ---------- Bausteine: Avatar & Lorbeer ----------
  const hue = name => [...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 17);
  const initials = name => String(name).replace(/[^A-Za-zÄÖÜäöüß0-9 -]/g, '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  const BALLC = ['#f3ecdc', '#f0bf2e', '#2a62c0', '#d33a2e', '#6e3fa3', '#e8732a', '#2c8a4f', '#8b2c2b', '#151515'];
  const ballColor = n => BALLC[n > 8 ? n - 8 : n] || BALLC[0];
  // Profilbild-Vorlagen: eigene Billard-Motive als SVG (keine fremden Grafiken)
  const PRESETS = {
    acht: ['Die Acht', '<radialGradient id="g" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#1d6a4c"/><stop offset="1" stop-color="#0b3324"/></radialGradient><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="54" r="32" fill="#111"/><circle cx="50" cy="52" r="13" fill="#fbf8ee"/><text x="50" y="59" font-family="Georgia,serif" font-weight="700" font-size="18" text-anchor="middle" fill="#111">8</text><ellipse cx="38" cy="36" rx="9" ry="5" fill="#fff" opacity=".35" transform="rotate(-30 38 36)"/>'],
    queues: ['Gekreuzte Queues', '<rect width="100" height="100" fill="#3b2214"/><rect width="100" height="100" fill="url(#w)" opacity=".5"/><linearGradient id="w" x1="0" x2="1"><stop offset="0" stop-color="#5a3423"/><stop offset="1" stop-color="#2b170e"/></linearGradient><g transform="rotate(45 50 50)"><rect x="47" y="2" width="6" height="96" rx="3" fill="#e2c88f"/><rect x="47" y="60" width="6" height="38" rx="3" fill="#151515"/><rect x="47" y="2" width="6" height="5" rx="2" fill="#3d74ad"/><rect x="47" y="7" width="6" height="4" fill="#f3ecdc"/></g><g transform="rotate(-45 50 50)"><rect x="47" y="2" width="6" height="96" rx="3" fill="#e2c88f"/><rect x="47" y="60" width="6" height="38" rx="3" fill="#151515"/><rect x="47" y="2" width="6" height="5" rx="2" fill="#3d74ad"/><rect x="47" y="7" width="6" height="4" fill="#f3ecdc"/></g><circle cx="50" cy="80" r="9" fill="#f3ecdc"/>'],
    kreide: ['Kreide', '<rect width="100" height="100" fill="#14263a"/><path d="M50 22 78 36 50 50 22 36Z" fill="#b9dbf7"/><path d="M22 36 50 50 50 80 22 66Z" fill="#6aa6dd"/><path d="M78 36 50 50 50 80 78 66Z" fill="#3d74ad"/><ellipse cx="50" cy="36" rx="9" ry="4.5" fill="#2b5f95"/><circle cx="74" cy="22" r="2" fill="#b9dbf7" opacity=".6"/><circle cx="24" cy="78" r="1.6" fill="#b9dbf7" opacity=".5"/>'],
    dreieck: ['Das Dreieck', '<rect width="100" height="100" fill="#0f3b2b"/><path d="M50 16 86 80H14Z" fill="none" stroke="#8f5a34" stroke-width="6" stroke-linejoin="round"/><g stroke="#000" stroke-opacity=".25"><circle cx="50" cy="38" r="8" fill="#f0bf2e"/><circle cx="41" cy="54" r="8" fill="#2a62c0"/><circle cx="59" cy="54" r="8" fill="#d33a2e"/><circle cx="32" cy="69" r="8" fill="#6e3fa3"/><circle cx="50" cy="69" r="8" fill="#111"/><circle cx="68" cy="69" r="8" fill="#e8732a"/></g>'],
    tasche: ['Eingelocht', '<rect width="100" height="100" fill="#14573f"/><circle cx="84" cy="16" r="30" fill="#c9a25e"/><circle cx="84" cy="16" r="24" fill="#050505"/><circle cx="58" cy="40" r="13" fill="#d33a2e"/><circle cx="58" cy="40" r="5.5" fill="#fbf8ee"/><text x="58" y="43" font-family="Georgia,serif" font-weight="700" font-size="8" text-anchor="middle">3</text><path d="M30 78 48 56" stroke="#f3ecdc" stroke-width="2" stroke-dasharray="3 4" opacity=".6"/><circle cx="26" cy="82" r="9" fill="#f3ecdc"/>'],
    pokal: ['Pokal', '<rect width="100" height="100" fill="#5b1f1a"/><path d="M32 22h36v14c0 14-8 22-18 22s-18-8-18-22Z" fill="#e2bd70"/><path d="M32 26h-8c0 10 5 15 11 16M68 26h8c0 10-5 15-11 16" fill="none" stroke="#e2bd70" stroke-width="4" stroke-linecap="round"/><rect x="46" y="57" width="8" height="10" fill="#c9a25e"/><path d="M36 67h28l3 11H33Z" fill="#c9a25e"/><path d="M40 26v10c0 7 3 12 7 14" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>'],
    neun: ['Die Neun', '<rect width="100" height="100" fill="#13324a"/><clipPath id="b"><circle cx="50" cy="52" r="32"/></clipPath><g clip-path="url(#b)"><rect width="100" height="100" fill="#f6f1e4"/><rect y="34" width="100" height="36" fill="#f0bf2e"/></g><circle cx="50" cy="52" r="13" fill="#fbf8ee"/><text x="50" y="59" font-family="Georgia,serif" font-weight="700" font-size="18" text-anchor="middle" fill="#111">9</text><ellipse cx="38" cy="34" rx="9" ry="5" fill="#fff" opacity=".45" transform="rotate(-30 38 34)"/>'],
    lampe: ['Tischlampe', '<rect width="100" height="100" fill="#0a1a12"/><path d="M28 58 72 58 92 100H8Z" fill="#ffd68c" opacity=".18"/><rect x="0" y="86" width="100" height="14" fill="#14573f"/><rect x="48" y="0" width="4" height="30" fill="#8f6b32"/><path d="M30 46 38 30H62L70 46Z" fill="#1d6a4c" stroke="#c9a25e" stroke-width="2"/><ellipse cx="50" cy="47" rx="20" ry="4" fill="#ffe7b0"/>']
  };
  const presetURL = id => PRESETS[id] ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs></defs>${PRESETS[id][1]}</svg>`) : '';
  // Avatar: eigenes Foto, Vorlage oder die eigene Billardkugel mit Initialen
  function avatar(name, ring = '', size = 44, ballNo = 0, av = null) {
    const src = av?.type === 'photo' && av.photo ? av.photo : av?.type === 'preset' ? presetURL(av.preset) : '';
    if (src) return `<span class="fx-av pic ${ring}" style="--s:${size}px" aria-hidden="true"><img src="${e(src)}" alt="" loading="lazy" decoding="async"></span>`;
    if (!ballNo) return `<span class="fx-av ${ring}" style="--h:${hue(name)};--s:${size}px" aria-hidden="true"><span>${e(initials(name))}</span></span>`;
    return `<span class="fx-av ballav ${ballNo > 8 ? 'stripe' : ''} ${ring}" style="--s:${size}px;--bc:${ballColor(ballNo)}" aria-hidden="true"><span><i>${e(initials(name))}</i></span></span>`;
  }
  const pAvatar = (pl, ring = '', size = 44) => avatar(pl?.name || '?', ring, size, pl?.ball || 0, pl?.av);
  function laurel(cls = '') {
    // zwei Lorbeerzweige als Bogen aus Blättern
    const leaves = side => Array.from({length: 8}, (_, i) => {
      const t = -70 + i * 18, a = t * Math.PI / 180, r = 46;
      const x = 60 + side * Math.cos(a) * r, y = 56 - Math.sin(a) * r;
      const rot = side * (-t + 28);
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4" ry="9.5" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }).join('');
    return `<svg class="fx-laurel ${cls}" viewBox="0 0 120 110" aria-hidden="true"><defs><linearGradient id="fxg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c2"/><stop offset=".5" stop-color="#e8b85f"/><stop offset="1" stop-color="#a8702a"/></linearGradient></defs><g fill="url(#fxg)" stroke="none">${leaves(1)}${leaves(-1)}</g></svg>`;
  }
  const crown = '<svg class="fx-crown" viewBox="0 0 40 26" aria-hidden="true"><path d="M3 22 1 6l10 8 9-12 9 12 10-8-2 16Z" fill="url(#fxg)" stroke="#5a3a12" stroke-width="1"/><circle cx="20" cy="15" r="2.6" fill="#5fe3d3"/></svg>';

  const ligaNo = liga => Number(String(liga).slice(0, 1)) || 0;
  // Liga als Billardkugel 1–4 (0 = weiße Kugel für „Neu“)
  const ball = (n, size = 40, cls = '') => `<span class="nt-ball b${n} ${cls}" style="--bs:${size}px" aria-hidden="true">${n ? `<b>${n}</b>` : ''}</span>`;
  const emblem = (liga, size = 40, cls = '') => ball(ligaNo(liga), size, cls);
  // Avatar mit Messing-, Silber- oder Bronzering
  const framed = (name, metal, size, ballNo = 0, av = null) => `<span class="nt-ring ${metal}" style="--fs:${size}px">${avatar(name, '', Math.round(size - 8), ballNo, av)}</span>`;
  // Platzhalter für den späteren Pokal (Strichzeichnung)
  const trophy = '<svg class="nt-trophy" viewBox="0 0 64 64" aria-hidden="true"><path d="M20 10h24v14a12 12 0 0 1-24 0V10Z"/><path d="M20 14h-7a7 7 0 0 0 9 10M44 14h7a7 7 0 0 1-9 10M32 36v9M24 54h16M26 45h12l2 9H24l2-9Z"/></svg>';

  // ---------- Rangliste: Monatsliga mit Podium ----------
  function board(data, tableHTML, state) {
    const tabs = `<div class="fx-switch" role="tablist" aria-label="Ansicht der Rangliste"><button type="button" role="tab" data-fx="board-mode" data-mode="liga" aria-selected="${fx.boardMode === 'liga'}">Monatsliga</button><button type="button" role="tab" data-fx="board-mode" data-mode="table" aria-selected="${fx.boardMode === 'table'}">Gesamttabelle</button></div>`;
    if (fx.boardMode === 'table' || !data || !data.rows?.length) return tabs + tableHTML;
    const me = String(state.session?.user?.id || '');
    const groups = [...LIGEN.map(liga => ({key: liga, label: liga.replace(' Café-Liga', ''), rows: data.rows.filter(r => r.rank === liga)})),
      {key: 'neu', label: 'Neu', rows: data.rows.filter(r => r.provisional)}].filter(g => g.rows.length);
    groups.forEach(g => g.rows.sort((a, b) => b.league_points - a.league_points || b.wins - a.wins));
    const mine = groups.find(g => g.rows.some(r => String(r.player.id) === me));
    if (!groups.some(g => g.key === fx.liga)) fx.liga = mine?.key || groups[0]?.key;
    const g = groups.find(x => x.key === fx.liga);
    const top = g.rows.slice(0, 3), rest = g.rows.slice(3);
    const order = [top[1], top[0], top[2]];
    const ringOf = i => ['gold', 'silver', 'bronze'][i];
    const podium = top.length ? `<section class="fx-podium" aria-label="Top 3 der ${e(g.label === 'Neu' ? 'Platzierung' : g.key)}">
      <div class="nt-lamp" aria-hidden="true"></div>
      ${order.map(r => { if (!r) return '<div class="fx-pod empty"></div>'; const i = top.indexOf(r);
        return `<a href="#spieler/${e(r.player.id)}" class="fx-pod p${i + 1} ${String(r.player.id) === me ? 'own' : ''}"><div class="fx-pod-frame">${framed(r.player.name, ringOf(i), i === 0 ? 96 : 72, r.player.ball, r.player.av)}<span class="fx-pod-no">${i + 1}</span></div><strong>${e(r.player.name)}</strong><span class="fx-pts-pill"><b>${r.league_points}</b> P.</span><div class="nt-plinth"><span>${i + 1}</span></div></a>`; }).join('')}
    </section>` : '';
    const row = (r, i) => `<li><a href="#spieler/${e(r.player.id)}" class="fx-row ${String(r.player.id) === me ? 'own' : ''}">${pAvatar(r.player, '', 42)}<span class="fx-row-main"><strong>${e(r.player.name)}${String(r.player.id) === me ? ' <em>du</em>' : ''}</strong>${r.player.title ? `<span class="fx-title-line">${e(r.player.title)}</span>` : ''}<span class="fx-row-tags">${r.tier ? `<span class="fx-tag">Stufe ${ROMAN[r.tier]}</span>` : `<span class="fx-tag">${Math.min(4, r.placement_games)}/4 Platzierung</span>`}${r.bonus ? `<span class="fx-tag gold">+${r.bonus} Bonus</span>` : ''}<span class="fx-row-rec">${r.wins}–${r.losses}</span></span></span><span class="fx-row-end"><b>${String(i + 1).padStart(2, '0')}</b><small>${r.league_points} P.</small></span></a></li>`;
    const ownIndex = g.rows.findIndex(r => String(r.player.id) === me);
    const ownRow = mine && mine.key !== g.key ? mine.rows.find(r => String(r.player.id) === me) : null;
    const sticky = ownIndex >= 3 ? g.rows[ownIndex] : ownIndex < 0 ? ownRow : null;
    const stickyPos = ownIndex >= 0 ? ownIndex + 1 : mine ? mine.rows.indexOf(ownRow) + 1 : 0;
    const titles = data.titles || {};
    const fame = [
      ['Stammgast', titles.regular?.player?.name, titles.regular ? `${titles.regular.days} Spieltage` : '', '1 Tischstunde', 'silver', titles.regular?.player],
      ['Champion des Hauses', titles.champion?.player?.name, '1. Café-Liga · Platz 1', 'Wanderpokal', 'gold', titles.champion?.player],
      ['Aufsteiger', titles.climber?.player?.name, 'größter Sprung', 'Sponsorpreis', 'bronze', titles.climber?.player]
    ];
    return tabs + `
      <nav class="fx-ligen" aria-label="Café-Liga wählen">${groups.map(x => `<button type="button" data-fx="liga" data-liga="${e(x.key)}" aria-pressed="${x.key === g.key}">${x.key === 'neu' ? ball(0, 40) : emblem(x.key, 40)}<small>${x.key === 'neu' ? 'Neu' : e(x.label) + ' Liga'}</small></button>`).join('')}</nav>
      <p class="fx-prize-line">${g.key === 'neu' ? 'Nach vier bestätigten Begegnungen geht es in die erste Café-Liga.' : `Monatssieg der ${e(g.key)}: <b>${e(PRIZES[g.key])}</b>`}</p>
      ${podium}
      ${rest.length ? `<ol class="fx-rows" start="4">${rest.map((r, i) => row(r, i + 3)).join('')}</ol>` : ''}
      ${sticky ? `<div class="fx-own-sticky" aria-label="Deine Platzierung">${pAvatar(sticky.player, '', 40)}<span class="fx-row-main"><strong>${e(sticky.player.name)}</strong><small>${e(mine.key === 'neu' ? 'In der Platzierung' : mine.key)}${ownIndex < 0 ? ' · andere Liga' : ''}</small></span><span class="fx-row-end"><b>${String(stickyPos).padStart(2, '0')}</b><small>${sticky.league_points} P.</small></span></div>` : ''}
      <section class="fx-fame" aria-labelledby="fx-fame-title">
        <div class="nt-fame-head">${trophy}<div><span class="eyebrow">Hall of Fame</span>
        <h2 id="fx-fame-title" class="fx-month">${e(new Intl.DateTimeFormat('de-DE', {month: 'long', year: 'numeric'}).format(new Date(data.month + '-15T12:00:00Z')))}</h2></div></div>
        <div class="fx-fame-grid">${fame.map(([t, name, sub, prize, ring, pl]) => `<article class="fx-fame-card ${ring}">${framed(name || '–', ring, ring === 'gold' ? 72 : 58, data.rows.find(x => x.player.id === pl?.id)?.player.ball || 0, data.rows.find(x => x.player.id === pl?.id)?.player.av)}<span class="fx-fame-title">${e(t)}</span><strong>${e(name || 'noch offen')}</strong><small>${e(sub)}</small><span class="fx-prize">${e(prize)}</span></article>`).join('')}</div>
      </section>
      <p class="fx-rules">Monatsliga: Sieg 3 Punkte, Niederlage 1 Punkt fürs Mitspielen, +1 gegen eine höhere Café-Liga. Derselbe Gegner zählt höchstens dreimal im Monat. Höchstens ein Monatspreis pro Person.</p>`;
  }

  // ---------- Profil: Stufe & Fortschritt ----------
  function ratingExtras(pool, rating) {
    if (!rating?.rank || !rating.tier) return '';
    const order = ['4. Café-Liga', '3. Café-Liga', '2. Café-Liga', '1. Café-Liga'];
    const cur = order.indexOf(rating.rank);
    const pct = Math.round((rating.progress || 0) * 100);
    return `${emblem(rating.rank, 40, 'fx-card-emblem')}<div class="fx-path" aria-label="Liga-Pfad: ${e(rating.rank)}, Stufe ${rating.tier} von 3">
      <ol>${order.map((l, i) => `<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}">${emblem(l, 40)}</li>`).join('')}</ol>
      <div class="fx-bar"><i style="width:${(cur * 100 + pct) / 4}%"></i></div>
      <p><b>Stufe ${ROMAN[rating.tier]}</b> ${rating.next_rank ? `· nächstes Ziel: ${e(rating.next_rank)}` : '· höchste Liga erreicht'}</p>
    </div>`;
  }
  function profileExtras() {
    const a = fx.achievements;
    if (!a) return '';
    const earned = a.badges.filter(b => b.tier > 0).length;
    return `<a class="fx-tile fx-tile-wide fx-profile-link" href="#erfolge"><span class="fx-tile-label">Erfolge</span><strong>${earned} von ${a.badges.length} Abzeichen · ${a.stamps.count}/10 Stempel</strong><span class="fx-tile-sub">Wochenaufgaben, Bonusheft und Abzeichen ansehen →</span></a>`;
  }

  // ---------- Disziplinen als Kugeln ----------
  const POOLBALL = {'8-single': 8, '9-single': 9, '10-single': 10, '14-single': 14, '8-double': 8};
  const POOLNAME = {'8-single': '8-Ball', '9-single': '9-Ball', '10-single': '10-Ball', '14-single': '14/1', '8-double': '8-Ball Doppel'};
  const poolBall = (pool, size = 30) => pool === '8-double'
    ? `<span class="nt-dbl" style="--bs:${size}px">${numBall(8, size * .8)}${numBall(8, size * .8)}</span>`
    : numBall(POOLBALL[pool] || 8, size);
  function numBall(n, size = 30, cls = '') {
    return `<span class="nt-nball ${n > 8 ? 'stripe' : ''} ${cls}" style="--bs:${Math.round(size)}px;--bc:${ballColor(n)}" aria-hidden="true"><b>${n}</b></span>`;
  }

  // ---------- Diagramm auf dem Billardtisch ----------
  function tableChart(points, bands, opts = {}) {
    const W = 360, H = 232, x0 = 30, y0 = 26, x1 = 330, y1 = 190;
    if (!points || points.length < 2) return `<div class="nt-table-empty">Noch zu wenige Partien für einen Verlauf.</div>`;
    const ts = points.map(p => p.t), rs = points.map(p => p.r);
    const tmin = Math.min(...ts), tmax = Math.max(...ts) || tmin + 1;
    const rmin = Math.min(...rs, ...bands.map(b => b.min)) - 40, rmax = Math.max(...rs, ...bands.map(b => b.min)) + 40;
    const X = t => x0 + (t - tmin) / Math.max(1, tmax - tmin) * (x1 - x0);
    const Y = r => y1 - (r - rmin) / (rmax - rmin) * (y1 - y0);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.r).toFixed(1)}`).join(' ');
    const area = `${path} L${X(tmax).toFixed(1)} ${y1} L${x0} ${y1} Z`;
    // Liga-Bahnen: Grenzen als Kreidelinien, Liga-Kugeln an der Bande
    const edges = [rmin, ...bands.map(b => b.min).sort((a, b) => a - b), rmax];
    const lanes = [];
    for (let k = 0; k < edges.length - 1; k++) {
      const lo = Math.max(edges[k], rmin), hi = Math.min(edges[k + 1], rmax);
      if (hi <= lo) continue;
      const liga = 4 - k;
      lanes.push({liga, y: (Y(lo) + Y(hi)) / 2, top: Y(hi), bottom: Y(lo)});
    }
    const lines = bands.filter(b => b.min > rmin && b.min < rmax).map(b => `<line x1="${x0}" x2="${x1}" y1="${Y(b.min).toFixed(1)}" y2="${Y(b.min).toFixed(1)}" class="nt-band"/>`).join('');
    const laneBalls = lanes.filter(l => l.bottom - l.top > 14).map(l => `<g transform="translate(15 ${l.y.toFixed(1)})"><circle r="8.5" fill="${ballColor(l.liga)}" stroke="rgba(0,0,0,.35)"/><circle r="4.6" fill="#fbf8ee"/><text y="2.6" class="nt-lane-no">${l.liga}</text></g>`).join('');
    // Monate als Diamanten auf der Bande
    const ticks = [];
    const d = new Date(tmin); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() <= tmax) { ticks.push(d.getTime()); d.setUTCMonth(d.getUTCMonth() + 1); }
    const tickEls = ticks.map(t => `<path d="M${X(t).toFixed(1)} ${y1 + 13} l3.5 3.5 -3.5 3.5 -3.5 -3.5Z" class="nt-diamond"/><text x="${X(t).toFixed(1)}" y="${H - 4}" class="nt-axis">${new Intl.DateTimeFormat('de-DE', {month: 'short', timeZone: 'UTC'}).format(new Date(t))}</text>`).join('');
    const last = points[points.length - 1];
    const pockets = [[x0 - 8, y0 - 8], [(x0 + x1) / 2, y0 - 11], [x1 + 8, y0 - 8], [x0 - 8, y1 + 8], [(x0 + x1) / 2, y1 + 11], [x1 + 8, y1 + 8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" class="nt-pocket"/>`).join('');
    const id = 'c' + Math.random().toString(36).slice(2, 7);
    return `<figure class="nt-table-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(opts.label || 'Verlauf der Spielstärke')}">
      <defs>
        <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3423"/><stop offset="1" stop-color="#2b170e"/></linearGradient>
        <radialGradient id="${id}f" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#1d6a4c"/><stop offset="1" stop-color="#0b3324"/></radialGradient>
        <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0dcab" stop-opacity=".35"/><stop offset="1" stop-color="#f0dcab" stop-opacity="0"/></linearGradient>
        <filter id="${id}g" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
      </defs>
      <rect x="2" y="2" width="${W - 4}" height="${y1 + 30}" rx="20" fill="url(#${id}w)"/>
      <rect x="${x0 - 8}" y="${y0 - 8}" width="${x1 - x0 + 16}" height="${y1 - y0 + 16}" rx="6" fill="#0a2c1f"/>
      <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" fill="url(#${id}f)"/>
      <rect x="${x0 - 8}" y="${y0 - 8}" width="${x1 - x0 + 16}" height="${y1 - y0 + 16}" rx="6" fill="none" stroke="#c9a25e" stroke-opacity=".5"/>
      ${pockets}${lines}
      <path d="${area}" fill="url(#${id}a)"/>
      <path d="${path}" class="nt-line-glow" filter="url(#${id}g)"/>
      <path d="${path}" class="nt-line"/>
      <circle cx="${X(last.t).toFixed(1)}" cy="${Y(last.r).toFixed(1)}" r="7" class="nt-cue"/>
      ${laneBalls}${tickEls}
    </svg>${opts.caption ? `<figcaption>${e(opts.caption)}</figcaption>` : ''}</figure>`;
  }

  // ---------- Vitrine: Pokale, Medaillen, Abzeichen ----------
  const METAL = ['', 'bronze', 'silver', 'gold'];
  function trophyIcon(t, size = 64) {
    const m = METAL[t.tier] || 'gold';
    if (t.kind === 'pokal') return `<svg class="nt-cup ${m}" viewBox="0 0 64 72" style="width:${size}px" aria-hidden="true"><path class="cup" d="M16 8h32v16c0 11-7 19-16 19S16 35 16 24Z"/><path class="arm" d="M16 12H8c0 9 4 14 10 15M48 12h8c0 9-4 14-10 15"/><path class="cup" d="M28 42h8v8h-8z"/><path class="base" d="M20 50h24l3 10H17z"/><rect class="plate" x="14" y="60" width="36" height="8" rx="2"/><path class="shine" d="M22 12v12c0 6 3 10 6 12"/></svg>`;
    return `<span class="nt-medal ${m}" style="--ms:${size * .8}px" aria-hidden="true"><i></i><b>${gi(honorIcon(t)) || e((t.name || '?').slice(0, 1))}</b></span>`;
  }
  function shelf(items, emptyText) {
    if (!items.length) return `<div class="nt-shelf empty">${gi('pool-triangle', 'nt-empty-ic')}<p>${e(emptyText)}</p></div>`;
    return `<div class="nt-shelf">${items.map(t => `<figure class="nt-shelf-item">${trophyIcon(t, 60)}<figcaption><strong>${e(t.name)}</strong><small>${e(t.sub)}</small></figcaption></figure>`).join('')}</div>`;
  }

  // ---------- Spielerprofil ----------
  function profileCard(pr, opts = {}) {
    const pl = pr.player, c = pr.card;
    const show = (c.showcase || []).map(id => pr.trophies.find(t => t.id === id)).filter(Boolean);
    const ratings = Object.entries(pr.ratings || {});
    const rate = pr.summary.games ? Math.round(pr.summary.wins / pr.summary.games * 100) : 0;
    return `<section class="nt-profile" aria-label="Spielerprofil ${e(pl.name)}">
      <div class="nt-profile-head">
        <span class="nt-ring gold" style="--fs:104px">${avatar(pl.name, '', 96, c.ball, pl.av)}</span>
        <div class="nt-profile-id">
          <h1>${e(pl.name)}</h1>
          ${pl.title ? `<span class="nt-ribbon">${e(pl.title)}</span>` : ''}
          ${c.motto ? `<p class="nt-motto">„${e(c.motto)}“</p>` : ''}
        </div>
      </div>
      <div class="nt-chips">
        <span class="nt-chip">${poolBall(c.favorite_pool, 20)} Lieblingsdisziplin: ${e(POOLNAME[c.favorite_pool])}</span>
        ${pr.summary.since ? `<span class="nt-chip">Am Tisch seit ${e(new Intl.DateTimeFormat('de-DE', {month: 'long', year: 'numeric'}).format(new Date(pr.summary.since)))}</span>` : ''}
        ${pr.self ? `<span class="nt-chip">${{public: 'Sichtbar für alle', members: 'Nur für angemeldete Spieler', hidden: 'Nur für dich sichtbar'}[c.visibility]}</span>` : ''}
      </div>
      <div class="nt-kpis">
        <div><b>${pr.summary.games}</b><span>Partien</span></div>
        <div><b>${rate}<small>%</small></b><span>Siegquote</span></div>
        <div><b>${pr.summary.wins}</b><span>Siege</span></div>
      </div>
      ${ratings.length ? `<div class="nt-ligen-row">${ratings.map(([pool, r]) => `<div title="${e(POOLNAME[pool])}: ${e(r.rank || 'Platzierung')}">${poolBall(pool, 26)}<span>${e(POOLNAME[pool])}</span>${r.rank ? emblem(r.rank, 22) : `<em>${r.placement_games}/4</em>`}</div>`).join('')}</div>` : ''}
      <h2 class="nt-sub">Vitrine</h2>
      ${shelf(show, pr.self ? 'Wähle unter „Profil bearbeiten“ bis zu drei Stücke für deine Vitrine.' : 'Noch nichts ausgestellt.')}
      <div class="nt-actions">${opts.actions || ''}</div>
    </section>`;
  }
  function profileTop(state) {
    const pr = fx.profiles?.me;
    if (!pr) return '';
    return profileCard(pr, {actions: `<a class="btn primary small" href="#profil-bearbeiten">Profil bearbeiten</a><a class="btn small" href="#statistik">Statistik</a><a class="btn small" href="#spieler/${e(pr.player.id)}">So sehen dich andere</a>`}) + (window.BCMPwa ? window.BCMPwa.pushCard(state) : '') + '<h2 class="nt-sub nt-sub-account">Wertungen & Partien</h2>';
  }
  function spieler(state, r) {
    const pr = fx.profiles?.[r.id];
    if (!pr) return fx.profilesError ? `<div class="callout error"><p>${e(fx.profilesError)}</p></div>` : '<div class="loading" role="status">Profil wird geladen …</div>';
    const back = '<a href="#rangliste" class="back-link">← Rangliste</a>';
    if (pr.hidden) return `${back}<div class="empty-state">${pAvatar(pr.player, '', 72)}<h2>${e(pr.player.name)}</h2><p>Dieses Profil ist privat. Die Platzierung in der Rangliste bleibt sichtbar.</p></div>`;
    const st = fx.stats?.[r.id];
    const pool = pr.card.favorite_pool && st?.history?.[pr.card.favorite_pool] ? pr.card.favorite_pool : Object.keys(st?.history || {})[0];
    const actions = pr.self ? '<a class="btn primary small" href="#profil-bearbeiten">Profil bearbeiten</a><a class="btn small" href="#statistik">Ganze Statistik</a>' : `<a class="btn primary small" href="#spielen/neu">Partie starten</a><a class="btn small" href="#statistik/${e(pr.player.id)}">Ganze Statistik</a>`;
    return `${back}${profileCard(pr, {actions})}
      ${st && pool ? `<section class="fx-card"><div class="section-heading"><h2>Spielstärke · ${e(POOLNAME[pool])}</h2></div>${tableChart(st.history[pool], st.bands, {caption: 'Die Linie zeigt den Verlauf, die Kugeln an der Bande die Café-Ligen. Werte bleiben verborgen.'})}</section>` : ''}`;
  }

  // ---------- Statistik-Seite ----------
  function statistik(state, r) {
    const id = r.id;
    const st = fx.stats?.[id], pr = fx.profiles?.[id];
    if (fx.statsError && !st) return `<div class="callout error"><p>${e(fx.statsError)}</p></div>`;
    if (!st || !pr) return '<div class="loading" role="status">Statistik wird geladen …</div>';
    const pools = Object.keys(st.history);
    if (!pools.includes(fx.statPool)) fx.statPool = pools.includes(pr.card?.favorite_pool) ? pr.card.favorite_pool : pools[0];
    const pool = fx.statPool;
    const tot = Object.values(st.per_pool).reduce((a, v) => ({g: a.g + v.games, w: a.w + v.wins}), {g: 0, w: 0});
    const maxPool = Math.max(1, ...Object.values(st.per_pool).map(v => v.games));
    const maxWd = Math.max(1, ...st.weekdays);
    const maxMonth = Math.max(1, ...st.months.map(m => m.games));
    const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const name = pr.player?.name || '';
    return `${id === 'me' ? '<a href="#profil" class="back-link">← Profil</a>' : `<a href="#spieler/${e(id)}" class="back-link">← ${e(name)}</a>`}
      <div class="page-heading nt-stat-head">${pAvatar(pr.player, '', 56)}<div><p class="eyebrow">Statistik</p><h1>${e(name)}</h1></div></div>
      <div class="nt-kpis big">
        <div><b>${tot.g}</b><span>Partien</span></div>
        <div><b>${tot.g ? Math.round(tot.w / tot.g * 100) : 0}<small>%</small></b><span>Siegquote</span></div>
        <div><b>${st.streak.best}</b><span>Beste Serie</span></div>
        <div><b>${st.streak.current}</b><span>Aktuelle Serie</span></div>
      </div>
      <section class="fx-card">
        <div class="section-heading"><h2>Spielstärke-Verlauf</h2></div>
        <div class="nt-pool-pick" role="tablist" aria-label="Disziplin wählen">${pools.map(p => `<button type="button" role="tab" data-fx="stat-pool" data-pool="${p}" aria-selected="${p === pool}">${poolBall(p, 26)}<span>${e(POOLNAME[p])}</span></button>`).join('')}</div>
        ${tableChart(st.history[pool], st.bands, {label: `Spielstärke-Verlauf ${POOLNAME[pool]}`, caption: 'Jede bestätigte Partie bewegt die Linie. Die Kugeln an der Bande zeigen, in welcher Café-Liga du gerade spielst.'})}
      </section>
      <section class="fx-card">
        <div class="section-heading"><h2>Form · letzte 10</h2><span class="fx-count">${st.form.filter(f => f.won).length} S · ${st.form.filter(f => !f.won).length} N</span></div>
        <div class="nt-form">${st.form.map(f => `<span class="nt-form-item ${f.won ? 'won' : 'lost'}" title="${e(POOLNAME[f.pool])} gegen ${e(f.opponent)} · ${e(f.score)}">${numBall(POOLBALL[f.pool], 30, f.won ? '' : 'dim')}<small>${f.won ? 'S' : 'N'}</small></span>`).join('')}</div>
        <p class="hint">Volle Kugel = Sieg, matte Kugel = Niederlage. Die Kugel zeigt die Disziplin.</p>
      </section>
      <section class="fx-card">
        <div class="section-heading"><h2>Wettbewerbe</h2></div>
        <ul class="nt-pools">${Object.entries(st.per_pool).map(([p, v]) => `<li>${poolBall(p, 34)}<div class="nt-pool-main"><div class="nt-pool-top"><strong>${e(POOLNAME[p])}</strong>${v.rank ? `<span class="nt-pool-rank">${emblem(v.rank, 18)} ${e(v.rank)}</span>` : '<span class="nt-pool-rank">Platzierung</span>'}</div>
          <div class="nt-wl" style="--all:${(v.games / maxPool * 100).toFixed(1)}%"><i style="width:${v.games ? (v.wins / v.games * 100).toFixed(1) : 0}%"></i></div>
          <div class="nt-pool-nums"><span><b>${v.wins}</b> Siege</span><span><b>${v.losses}</b> Niederlagen</span><span><b>${v.games ? Math.round(v.wins / v.games * 100) : 0}%</b></span></div></div></li>`).join('')}</ul>
      </section>
      <section class="fx-card">
        <div class="section-heading"><h2>Partien pro Monat</h2></div>
        <div class="nt-months">${st.months.map(m => `<div class="nt-month"><div class="nt-month-bar" style="height:${(m.games / maxMonth * 100).toFixed(1)}%" title="${m.games} Partien, ${m.wins} Siege"><i style="height:${m.games ? (m.wins / m.games * 100).toFixed(1) : 0}%"></i></div><b>${m.games}</b><span>${e(new Intl.DateTimeFormat('de-DE', {month: 'short', timeZone: 'UTC'}).format(new Date(m.month + '-15T12:00:00Z')))}</span></div>`).join('')}</div>
        <p class="hint"><span class="nt-key win"></span> Siege <span class="nt-key"></span> Niederlagen</p>
      </section>
      <section class="fx-card">
        <div class="section-heading"><h2>Lieblingstage</h2></div>
        <div class="nt-weekdays">${st.weekdays.map((n, i) => `<div><span class="nt-wd-ball" style="--k:${(0.35 + n / maxWd * .65).toFixed(2)}"></span><b>${n}</b><small>${WD[i]}</small></div>`).join('')}</div>
      </section>
      <section class="fx-card">
        <div class="section-heading"><h2>Häufigste Gegner</h2></div>
        <ul class="nt-rivals">${st.rivals.map(rv => `<li><a href="#spieler/${e(rv.player.id)}">${pAvatar(rv.player, '', 40)}<span class="nt-rival-main"><strong>${e(rv.player.name)}</strong><span class="nt-wl small"><i style="width:${(rv.wins / (rv.wins + rv.losses) * 100).toFixed(1)}%"></i></span></span><span class="nt-rival-score"><b>${rv.wins}</b>:<b>${rv.losses}</b></span></a></li>`).join('')}</ul>
      </section>`;
  }

  // ---------- Profil bearbeiten ----------
  function editor(state) {
    const pr = fx.profiles?.me;
    if (!state.session?.authenticated) return '<div class="empty-state"><h2>Bitte anmelden</h2><a class="btn primary" href="#profil">Zur Anmeldung</a></div>';
    if (!pr) return '<div class="loading" role="status">Profil wird geladen …</div>';
    const d = fx.draft ||= {...pr.card, showcase: [...pr.card.showcase]};
    const vis = [['public', 'Alle', 'Jede Person, die die Rangliste öffnet'], ['members', 'Angemeldete Spieler', 'Nur Personen mit eigenem Profil'], ['hidden', 'Nur ich', 'In der Rangliste stehst du weiter, dein Profil bleibt zu']];
    const preview = {...pr, player: {...pr.player, ball: d.ball, av: {type: d.avatar_type, preset: d.preset_id, photo: d.photo}, title: pr.titles.find(t => t.id === d.title_id)?.name || null}, card: {...d}};
    return `<a href="#profil" class="back-link">← Profil</a>
      <div class="page-heading"><p class="eyebrow">Dein Auftritt</p><h1>Profil bearbeiten</h1></div>
      <div class="nt-edit">
        <section class="fx-card"><h2 class="nt-sub">Profilbild</h2>
          <div class="nt-av-modes" role="radiogroup" aria-label="Art des Profilbilds">${[['ball', 'Kugel'], ['preset', 'Vorlage'], ['photo', 'Eigenes Foto']].map(([k, n]) => `<button type="button" role="radio" aria-checked="${d.avatar_type === k}" data-fx="av-mode" data-mode="${k}">${n}</button>`).join('')}</div>
          ${d.avatar_type === 'preset' ? `<div class="nt-preset-pick" role="radiogroup" aria-label="Vorlage wählen">${Object.entries(PRESETS).map(([id, [label]]) => `<button type="button" role="radio" aria-checked="${d.preset_id === id}" data-fx="pick-preset" data-preset="${id}"><img src="${presetURL(id)}" alt=""><span>${e(label)}</span></button>`).join('')}</div>`
          : d.avatar_type === 'photo' ? `<div class="nt-photo">${d.photo ? `<img src="${e(d.photo)}" alt="Dein Profilbild">` : '<span class="nt-photo-empty" aria-hidden="true">?</span>'}
              <div><label class="btn primary small nt-file">Foto wählen<input id="fx-photo" type="file" accept="image/*"></label>${d.photo ? '<button type="button" class="btn small" data-fx="photo-remove">Entfernen</button>' : ''}
              <p class="hint">Wird quadratisch zugeschnitten und verkleinert. Nur Bilder von dir – das Café kann unpassende Bilder entfernen. ${d.visibility === 'hidden' ? 'Dein Profil ist privat: andere sehen weiter deine Kugel.' : ''}</p></div></div>`
          : `<p class="hint">Deine Kugel mit Initialen – ganz ohne Foto.</p><div class="nt-ball-pick" role="radiogroup" aria-label="Kugel wählen">${Array.from({length: 15}, (_, i) => i + 1).map(n => `<button type="button" role="radio" aria-checked="${d.ball === n}" data-fx="pick-ball" data-ball="${n}" aria-label="Kugel ${n}">${numBall(n, 40)}</button>`).join('')}</div>`}
        </section>
        <section class="fx-card"><h2 class="nt-sub">Motto</h2>
          <label class="field"><span>Ein Satz über dich am Tisch</span><input id="fx-motto" data-fxin="motto" maxlength="80" value="${e(d.motto)}" placeholder="z. B. Lieber Safety als Sorry."></label>
          <p class="hint" id="fx-motto-count">${(d.motto || '').length}/80 Zeichen</p>
          <label class="field"><span>Lieblingsdisziplin</span><select id="fx-pool" data-fxin="favorite_pool">${Object.entries(POOLNAME).map(([k, v]) => `<option value="${k}" ${d.favorite_pool === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        </section>
        <section class="fx-card"><h2 class="nt-sub">Titel</h2><p class="hint">Steht unter deinem Namen – in der Rangliste und auf deinem Profil.</p>
          <div class="nt-radio-list">${[{id: '', name: 'Kein Titel', sub: ''}, ...pr.titles].map(t => `<button type="button" role="radio" aria-checked="${(d.title_id || '') === t.id}" data-fx="pick-title" data-id="${e(t.id)}"><span class="nt-radio"></span><span><strong>${e(t.name)}</strong>${t.sub ? `<small>${e(t.sub)}</small>` : ''}</span></button>`).join('')}</div>
        </section>
        <section class="fx-card"><h2 class="nt-sub">Vitrine</h2><p class="hint">Wähle bis zu drei Stücke, die andere auf deinem Profil sehen. <b>${d.showcase.length}/3</b></p>
          <div class="nt-trophy-pick">${pr.trophies.map(t => `<button type="button" aria-pressed="${d.showcase.includes(t.id)}" data-fx="pick-trophy" data-id="${e(t.id)}" ${!d.showcase.includes(t.id) && d.showcase.length >= 3 ? 'disabled' : ''}>${trophyIcon(t, 44)}<strong>${e(t.name)}</strong><small>${e(t.sub)}</small></button>`).join('')}</div>
        </section>
        <section class="fx-card"><h2 class="nt-sub">Wer darf dein Profil sehen?</h2>
          <div class="nt-radio-list">${vis.map(([k, n, s]) => `<button type="button" role="radio" aria-checked="${d.visibility === k}" data-fx="pick-vis" data-vis="${k}"><span class="nt-radio"></span><span><strong>${n}</strong><small>${s}</small></span></button>`).join('')}</div>
        </section>
        <section class="nt-edit-preview"><h2 class="nt-sub">Vorschau</h2>${profileCard(preview)}</section>
        <div class="nt-save-bar"><a class="btn" href="#profil" data-fx="edit-cancel">Abbrechen</a><button type="button" class="btn primary" data-fx="edit-save">Speichern</button></div>
      </div>`;
  }

  // ---------- Neue Partie: Gewinnchance ----------
  function matchup(w, state) {
    if (w.pool === '8-double' || w.pool === '14-single') return '';
    const opp = w.teams?.[1]?.[0];
    if (!opp) return '';
    const wins = ({1: 1, 3: 2, 7: 4})[Number(w.best_of)] || 3;
    const key = `${w.pool}:${opp}:${wins}`;
    const data = fx.odds[key];
    if (!data) {
      fx.odds[key] = 'loading';
      app().request('/odds?' + new URLSearchParams({pool: w.pool, opponent: opp, wins})).then(d => { fx.odds[key] = d; app().render(); }).catch(() => { fx.odds[key] = 'error'; app().render(); });
      return `<div class="fx-odds">Gewinnchance wird berechnet …</div>`;
    }
    if (data === 'loading') return `<div class="fx-odds">Gewinnchance wird berechnet …</div>`;
    if (data === 'error') return '';
    const oppName = state.players?.find(p => String(p.id) === String(opp))?.name || 'Gegenseite';
    const p = data.game_win_probability, pct = Math.round(p * 100);
    const ratio = `etwa ${Math.min(9, Math.max(1, Math.round(p * 10)))} von 10 Spielen`;
    return `<section class="fx-odds" aria-label="Gewinnchance">
      <span class="fx-tile-label">Vor dem Anstoß</span>
      <p>Laut Spielstärke gewinnst du ${ratio} gegen ${e(oppName)}.${data.provisional ? ' <small>(noch ungenau – Platzierung läuft)</small>' : ''}</p>
      <div class="fx-odds-bar" role="img" aria-label="Du ${pct} Prozent, ${e(oppName)} ${100 - pct} Prozent je Spiel"><i style="width:${pct}%"><span>Du ${pct} %</span></i><span>${e(oppName)} ${100 - pct} %</span></div>
      ${data.suggestion ? `<p class="hint">Fairer Vorschlag (freiwillig): du spielst auf <b>${data.suggestion.race_self}</b>, ${e(oppName)} auf <b>${data.suggestion.race_opponent}</b>. Die Wertung berücksichtigt das automatisch, weil jedes Spiel einzeln zählt.</p>` : '<p class="hint">Ausgeglichene Partie – keine Vorgabe nötig.</p>'}
    </section>`;
  }

  // ---------- Erfolge ----------
  function erfolge(state) {
    if (!state.session?.authenticated) return `<div class="narrow"><div class="empty-state"><p class="eyebrow">Erfolge</p><h1>Bitte anmelden</h1><p>Wochenaufgaben, Bonusheft und Abzeichen gehören zu deinem Profil.</p><a class="btn primary" href="#profil">Zur Anmeldung</a></div></div>`;
    const a = fx.achievements;
    if (!a) return fx.achievementsError ? `<div class="narrow"><div class="callout error"><p>${e(fx.achievementsError)}</p></div></div>` : '<div class="loading" role="status">Erfolge werden geladen …</div>';
    const s = a.stamps;
    const open = s.vouchers.filter(v => !v.redeemed_at);
    const stampBalls = Array.from({length: s.goal}, (_, i) => `<span class="fx-ball ${i < s.count ? 'on' : ''} ${i === 7 ? 'eight' : ''} ${i >= 8 ? 'stripe' : ''}" style="--ball:${BALL[i]}" aria-hidden="true"><b>${i + 1}</b></span>`).join('');
    return `<div class="page-heading"><p class="eyebrow">Dein Fortschritt</p><h1>Erfolge</h1><p class="muted">Mitspielen lohnt sich – nicht nur gewinnen.</p></div>
      <section class="fx-card fx-stamps" aria-labelledby="fx-stamps-title">
        <div class="section-heading"><h2 id="fx-stamps-title">${gi('stamper', 'h-ic')}Bonusheft</h2><span class="fx-count">${s.count}/${s.goal}</span></div>
        <div class="fx-rack" role="img" aria-label="${s.count} von ${s.goal} Stempeln">${stampBalls}</div>
        <p class="hint">Einen Stempel gibt es pro Spieltag mit belegtem Tisch und für jede Wochenaufgabe. Bei ${s.goal} Stempeln: <b>${e(s.reward)}</b>.</p>
        <button type="button" class="btn primary" data-fx="voucher-new" ${s.count < s.goal ? 'disabled' : ''}>${s.count < s.goal ? `Noch ${s.goal - s.count} Stempel bis zum Gutschein` : 'Gutschein erstellen'}</button>
        ${s.vouchers.length ? `<ul class="fx-vouchers">${s.vouchers.map(v => `<li>${gi('ticket', 'fx-v-ic')}<span><strong>${e(v.title)}</strong>${v.note ? `<small>${e(v.note)}</small>` : ''}${venueLine(v.venue, 'Gilt nur im ')}<small>${v.source ? `${e(v.source)} · ` : ''}${v.redeemed_at ? `eingelöst am ${e(new Date(v.redeemed_at).toLocaleDateString('de-DE'))}` : `gültig bis ${e(new Date(v.valid_until).toLocaleDateString('de-DE'))}`}</small></span>${v.redeemed_at ? '<span class="badge confirmed">Eingelöst</span>' : `<button type="button" class="btn small" data-fx="voucher-show" data-code="${e(v.code)}">An der Theke zeigen</button>`}</li>`).join('')}</ul>` : ''}
        ${open.length ? '' : '<p class="hint fx-demo-hint">Demo-Tipp: Bestätige auf „Spielen“ das offene Ergebnis gegen Bande-Bernd – das bringt Stempel.</p>'}
      </section>
      <section class="fx-card nt-board" aria-labelledby="fx-week-title">
        <div class="section-heading"><h2 id="fx-week-title">${gi('target-arrows', 'h-ic')}Wochenaufgaben</h2><span class="fx-count">${a.week.filter(q => q.done).length}/${a.week.length}</span></div>
        <ul class="fx-quests">${a.week.map(q => `<li class="${q.done ? 'done' : ''}"><span class="fx-check" aria-hidden="true">${q.done ? '✓' : ''}</span><span><strong>${e(q.title)}</strong><small>${e(q.text)}</small></span><span class="fx-quest-meta">${q.progress}/${q.goal}<small>${e(q.reward)}</small></span></li>`).join('')}</ul>
        <p class="hint">Neue Aufgaben jeden Montag. Das Café kann eigene Aufgaben einstellen, zum Beispiel für ruhige Wochentage.</p>
      </section>
      <section class="fx-card" aria-labelledby="fx-badges-title">
        <div class="section-heading"><h2 id="fx-badges-title">${gi('sport-medal', 'h-ic')}Abzeichen</h2><span class="fx-count">${a.badges.filter(b => b.tier).length}/${a.badges.length}</span></div>
        <ul class="fx-badges">${a.badges.map(b => {
          const levels = b.steps.length > 1 ? ['Bronze', 'Silber', 'Gold'] : ['Erreicht'];
          const level = b.tier ? levels[b.tier - 1] : 'Noch offen';
          return `<li class="tier-${b.steps.length > 1 ? b.tier : (b.tier ? 3 : 0)}"><span class="fx-medal" aria-hidden="true">${gi(BADGE_ICON[b.id]) || `<b>${e(b.title.slice(0, 1))}</b>`}</span><span><strong>${e(b.title)}</strong><small>${e(b.text)}</small><small class="fx-level">${e(level)}${b.next != null ? ` · ${Math.min(b.value, b.next)}/${b.next} ${e(b.unit)}` : ''}</small></span></li>`;
        }).join('')}</ul>
      </section>
      <dialog id="fx-voucher" class="fx-dialog" aria-labelledby="fx-voucher-title"></dialog>`;
  }
  function voucherDialog(code) {
    const v = fx.achievements?.stamps.vouchers.find(x => x.code === code);
    const dlg = document.querySelector('#fx-voucher');
    if (!v || !dlg) return;
    let qr = '';
    try { const q = window.qrcode(0, 'M'); q.addData(`BCM-GUTSCHEIN:${v.code}`); q.make(); qr = q.createSvgTag({cellSize: 6, margin: 2, scalable: true}); } catch { qr = ''; }
    dlg.innerHTML = `<div class="fx-dialog-body"><p class="eyebrow">Gutschein · einmalig</p><h2 id="fx-voucher-title">${e(v.title)}</h2>${v.venue ? `<p class="fx-v-venue">${gi('position-marker')}<span>Gilt nur im <strong>${e(v.venue.name)}</strong><small>${e(v.venue.address)}</small></span></p>` : ''}
      <div class="fx-qr">${qr || '<p class="hint">QR-Code nicht verfügbar – der Code unten genügt.</p>'}</div>
      <p class="fx-code">${e(v.code)}</p>
      <p class="hint">Zeig diesen Code an der Theke. Das Personal scannt ihn, die App markiert ihn sofort als eingelöst, und der Rabatt wird ganz normal in der Kasse gebucht.</p>
      ${document.querySelector('[data-demo-as]') ? '<div class="fx-staff"><span class="fx-tile-label">Demo</span><p class="hint">Oben im Prototyp-Balken auf „Theke“ wechseln und unter Verwaltung → Gutscheine diesen Code prüfen und einlösen.</p></div>' : ''}
      <button type="button" class="btn" data-fx="dialog-close">Schließen</button></div>`;
    dlg.showModal();
  }

  // ---------- Events ----------
  function events(state) {
    const list = fx.events?.events;
    const signed = !!state.session?.authenticated;
    if (!list) return fx.eventsError ? `<div class="callout error"><p>${e(fx.eventsError)}</p></div>` : '<div class="loading" role="status">Events werden geladen …</div>';
    return `<div class="page-heading"><p class="eyebrow">Im Billardcafé Merzig</p><h1>Events</h1><p class="muted">Turniere, Einsteigerabende und Siegerehrungen.</p></div>
      ${(fx.tours?.tournaments || []).filter(t => !t.event_id).map(t => `<a class="fx-tour-banner" href="#turnier/${e(t.id)}">${gi(t.status === 'finished' ? 'trophy' : 'organigram', 'fx-tour-ic')}<span><span class="fx-tile-label">${t.status === 'finished' ? 'Turnier beendet' : 'Turnier läuft'} · ${e(t.pool_label)}</span><strong>${e(t.name)}</strong><small>${t.status === 'finished' && t.places ? `Sieger: ${e(t.places[1][0].name)}` : `${t.players.length} Teilnehmer · Turnierbaum ansehen`}</small></span></a>`).join('')}
      <div class="row-list">${list.map(ev => `<article class="fx-event ${ev.venue && !ev.venue.main ? 'other-venue' : ''}">
        <div class="fx-event-date"><span>${e(new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin', weekday: 'short'}).format(new Date(ev.starts_at)))}</span><strong>${e(new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin', day: '2-digit'}).format(new Date(ev.starts_at)))}</strong><span>${e(new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin', month: 'short'}).format(new Date(ev.starts_at)))}</span></div>
        <div class="fx-event-body"><span class="fx-tile-label">${gi(EVENT_ICON[ev.type] || 'calendar', 'fx-ev-ic')}${e(ev.type)} · ${e(new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit'}).format(new Date(ev.starts_at)))} Uhr${ev.place ? ` · ${e(ev.place)}` : ''}</span><h3>${e(ev.title)}</h3>
          ${ev.venue ? (ev.venue.main && !ev.venue_changed && !ev.venue_note ? `<p class="fx-ev-venue main">${gi('house')}<span>${e(ev.venue.name)}</span></p>`
            : `<p class="fx-ev-venue ${ev.venue.main ? '' : 'other'}">${gi(ev.venue.main ? 'house' : 'position-marker')}<span><strong>${e(ev.venue.name)}</strong>${ev.venue_changed ? '<em class="fx-moved">Ort geändert</em>' : !ev.venue.main ? '<em class="fx-moved soft">Anderer Ort</em>' : ''}<small>${e(ev.venue.address)}</small>${ev.venue_note ? `<small class="fx-ev-note">${e(ev.venue_note)}</small>` : ''}<a class="text-button fx-map" href="${mapLink(ev.venue)}" target="_blank" rel="noopener noreferrer">Auf der Karte zeigen</a></span></p>`) : ''}<p>${e(ev.description)}</p>
          ${(() => { const t = (fx.tours?.tournaments || []).find(x => x.event_id === ev.id); return t ? `<a class="fx-tour-link" href="#turnier/${e(t.id)}">${gi('organigram')}Turnierbaum ${t.status === 'finished' ? '& Sieger' : 'live'} ansehen</a>` : ''; })()}
          <p class="fx-event-meta"><span>${e(ev.price)}</span>${ev.capacity ? `<span>${ev.participants}/${ev.capacity} angemeldet</span>` : ''}${ev.sponsor ? `<span>präsentiert von ${e(ev.sponsor)}</span>` : ''}</p>
          ${ev.capacity ? (signed ? `<button type="button" class="btn small ${ev.registered ? '' : 'primary'}" data-fx="event-register" data-id="${e(ev.id)}" data-register="${ev.registered ? '0' : '1'}">${ev.registered ? 'Abmelden' : 'Ich bin dabei'}</button>${ev.registered ? '<span class="fx-in">✓ Du bist angemeldet</span>' : ''}` : '<a class="btn small" href="#profil">Zum Anmelden einloggen</a>') : ''}
        </div></article>`).join('')}</div>
      <div class="callout"><p>Erinnerungen an Events kommen nur, wenn du sie im Profil einschaltest – getrennt nach Turnieren, Einsteigerabenden und Aktionen.</p><a href="#tv">Café-Bildschirm-Ansicht öffnen</a></div>`;
  }

  // ---------- Café-Bildschirm ----------
  // ---------- Turnierbaum (Admin, Café-TV, öffentlich) ----------
  function bracket(t, opts = {}) {
    if (!t?.rounds?.length) return '<p class="hint">Der Turnierbaum entsteht beim Start.</p>';
    const side = (p, score, win, m) => `<div class="tb-p ${p ? '' : 'tbd'} ${win ? 'win' : ''}">${p ? pAvatar(p, '', opts.tv ? 30 : 24) : '<span class="tb-dot"></span>'}<span class="tb-n">${p ? e(p.name) : (m.status === 'bye' ? 'Freilos' : 'offen')}</span><b>${score ?? ''}</b></div>`;
    const match = (m, label = '') => {
      if (m.status === 'bye' && opts.hideByes) return '';
      const act = opts.admin && m.a && m.b && m.status !== 'bye' && t.status !== 'draft';
      return `<div class="tb-m ${m.status}">${label ? `<span class="tb-label">${e(label)}</span>` : ''}${side(m.a, m.score_a, m.winner && m.winner.id === m.a?.id, m)}${side(m.b, m.score_b, m.winner && m.winner.id === m.b?.id, m)}
        <div class="tb-meta">${m.status === 'live' ? `<span class="tb-live">${m.table_no ? `Tisch ${m.table_no}` : 'läuft'}</span>` : m.status === 'bye' ? '<span>Freilos</span>' : m.status === 'done' ? '<span>beendet</span>' : m.a && m.b ? '<span>bereit</span>' : '<span>wartet</span>'}
        ${act ? (m.status === 'done' ? `<button type="button" class="text-button" data-ad="tm-reset" data-m="${e(m.id)}">zurücksetzen</button>` : `<button type="button" class="btn small" data-ad="tm-table" data-m="${e(m.id)}">${m.table_no ? 'Tisch' : 'Tisch zuweisen'}</button><button type="button" class="btn small primary" data-ad="tm-result" data-m="${e(m.id)}">Ergebnis</button>`) : ''}</div></div>`;
    };
    return `<div class="tb ${opts.tv ? 'tb-tv' : ''}" style="--rounds:${t.rounds.length}">${t.rounds.map(r => `<section class="tb-round"><h3>${e(r.name)}</h3><div class="tb-ms">${r.matches.map(m => match(m)).join('')}</div></section>`).join('')}
      ${t.third ? `<section class="tb-round tb-third"><h3>Platz 3</h3><div class="tb-ms">${match(t.third)}</div></section>` : ''}</div>`;
  }
  function podium(t, big = false) {
    if (!t?.places) return '';
    const col = (pl, cls) => `<div class="tb-pod ${cls}">${(t.places[pl] || []).map(p => `<span>${pAvatar(p, '', big ? 64 : 44)}<strong>${e(p.name)}</strong></span>`).join('')}<b>${gi(pl === 1 ? 'podium-winner' : pl === 2 ? 'podium-second' : 'podium-third')}${pl}</b></div>`;
    return `<div class="tb-podium ${big ? 'big' : ''}">${col(2, 'p2')}${col(1, 'p1')}${col(3, 'p3')}</div>`;
  }
  function turnier() {
    if (fx.tourError) return `<div class="callout error"><p>${e(fx.tourError)}</p></div>`;
    const t = fx.tour?.tournament; if (!t) return '<div class="loading" role="status">Turnier wird geladen …</div>';
    return `<a class="back-link" href="#events">← Events</a><div class="page-heading"><p class="eyebrow">${gi('organigram')} Turnier · ${e(t.pool_label)} · Race to ${t.race_to}</p><h1>${e(t.name)}</h1><p class="muted">${t.status === 'finished' ? 'Beendet' : 'Läuft gerade'} · ${e(t.venue.name)} · ${t.players.length} Teilnehmer</p></div>
      ${t.places ? `<section class="fx-card"><div class="section-heading"><h2>${gi('trophy', 'h-ic')}Sieger</h2></div>${podium(t)}</section>` : ''}
      <section class="fx-card"><div class="section-heading"><h2>${gi('organigram', 'h-ic')}Turnierbaum</h2></div>${bracket(t, {hideByes: true})}</section>`;
  }

  // ---------- Konto für Inhaber & Theke (kein Spielerprofil) ----------
  function staffAccount(state) {
    const u = state.session.user, owner = u.role === 'owner';
    const link = (h, ic, t, s) => `<a class="ad-tile" href="${h}">${gi(ic, 'ad-tile-ic')}<b class="st-ic">${gi(ic)}</b><span>${t}</span><small>${s}</small></a>`;
    return `<div class="page-heading"><p class="eyebrow">Café-Konto</p><h1>${e(u.name)}</h1><p class="muted">${owner ? 'Inhaber' : 'Theke'} · zur Bedienung und Aufsicht – ohne Spielerprofil, Wertung oder Fortschritt.</p></div>
      <div class="ad-tiles st-tiles">${link('#admin', 'histogram', 'Übersicht', 'Gutscheine, Streitfälle, Neue')}${link('#admin/turniere', 'organigram', 'Turniere', 'Ergebnisse & Tische')}${link('#admin/tv', 'film-projector', 'Café-TV', owner ? 'Folien & Durchsagen' : 'Durchsagen')}${link('#admin/gutscheine', 'ticket', 'Gutschein einlösen', 'Code prüfen')}</div>
      <section class="fx-card"><div class="section-heading"><h2>${gi('checklist', 'h-ic')}Was dieses Konto darf</h2></div><ul class="fx-scan-list">${(owner
        ? ['Turniere anlegen, starten, Ergebnisse eintragen und Preise vergeben', 'Café-Bildschirm einrichten: Folien, Reihenfolge, eigene Texte, Durchsagen', 'Auszeichnungen, Gutscheine, Stempel, Sperren – alles mit Begründung im Protokoll', 'Orte, Tische und QR-Codes verwalten']
        : ['Turnierergebnisse eintragen und Tische zuweisen', 'Durchsagen auf dem Café-Bildschirm', 'Gutscheine prüfen und einlösen', 'Streitfälle einsehen']).map(x => `<li>${gi('eight-ball')}${x}</li>`).join('')}</ul>
      <p class="hint">Café-Konten tauchen nicht in der Rangliste auf. Zum Mitspielen bitte ein eigenes Spielerprofil verwenden.</p>
      <button type="button" class="btn" data-action="profile-switch">Abmelden / Profil wechseln</button></section>`;
  }

  // ---------- Café-Bildschirm: übernimmt tv-player.js (gleicher Player wie tv.html auf dem Fernseher) ----------
  function tv() { return '<div id="tvp-root" class="tvp-root" aria-label="Café-Bildschirm"></div>'; }
  function startTv(screen) {
    const root = document.querySelector('#tvp-root'); const P = window.BCMTvPlayer;
    if (!root || !P) return;
    if (P.running && P.screen === screen) { P.remount(root); return; }
    P.start({root, screen, fetch: path => app().request(path), cached: P.data, closeHref: app().state.session?.user?.role ? '#admin/tv' : '#events', pollMs: 8000});
  }
  function stopTv() { if (window.BCMTvPlayer?.running) window.BCMTvPlayer.stop(); }

  // ---------- Tisch (nach dem Scannen des QR-Codes) ----------
  function tisch(state) {
    if (fx.scanError) return `<div class="narrow"><div class="empty-state">${gi('pool-table-corner', 'nt-empty-ic')}<p class="eyebrow">QR-Code</p><h1>Unbekannter Tisch</h1><p>${e(fx.scanError)}</p><a class="btn primary" href="#spielen">Zur Startseite</a></div></div>`;
    const t = fx.scan?.table;
    if (!t) return '<div class="loading" role="status">Tisch wird gesucht …</div>';
    const signed = !!state.session?.authenticated;
    const isHere = fx.here && fx.here.id === t.id;
    return `<div class="narrow fx-scan">
      <div class="page-heading"><p class="eyebrow">${gi('position-marker')} ${e(t.venue.name)}</p><h1>Tisch ${t.no}</h1>${t.name ? `<p class="muted">${e(t.name)} · ${e(t.kind)}</p>` : `<p class="muted">${e(t.kind)}</p>`}</div>
      <div class="fx-scan-card ${t.status}">${gi('pool-table-corner', 'fx-scan-ic')}<div><span class="fx-tile-label">${t.sensor ? 'Laut Kugelfach' : 'Status'}</span><strong>${t.status === 'busy' ? `belegt seit ${duration(t.since)}` : 'frei'}</strong>${t.status === 'busy' ? '<small>Die Zeit startet, sobald die Kugeln ausgegeben sind.</small>' : '<small>Kugeln an der Theke holen – dann läuft die Tischzeit.</small>'}</div></div>
      ${signed ? `<button type="button" class="btn primary full" data-fx="join-table">${isHere ? 'Du bist an diesem Tisch – weiter zu „Spielen“' : 'Hier spielen und Partie eintragen'}</button>`
        : `<a class="btn primary full" href="#profil">Anmelden und mitspielen</a><a class="btn full fx-mt" href="#rangliste">Rangliste ansehen</a>`}
      <ul class="fx-scan-list"><li>${gi('eight-ball')}Partien an diesem Tisch zählen für Rangliste und Monatsliga.</li><li>${gi('stamper')}Ein Spieltag im Café bringt einen Stempel im Bonusheft.</li><li>${gi('smartphone')}Der Code verrät nur die Tischnummer. Deinen Standort fragt die App nicht ab.</li></ul>
    </div>`;
  }

  // ---------- Ansichten & Klicks ----------
  function view(name, state, r = {}) {
    document.body.classList.toggle('fx-tv-mode', name === 'tv');
    if (name !== 'tv') stopTv();
    if (name === 'erfolge') return erfolge(state);
    if (name === 'events') return events(state);
    if (name === 'tisch') return tisch(state);
    if (name === 'turnier') return turnier();
    if (name === 'statistik') return statistik(state, r);
    if (name === 'spieler') return spieler(state, r);
    if (name === 'profil-bearbeiten') return editor(state);
    if (name === 'admin') return window.BillardAdmin ? window.BillardAdmin.view(state, r) : '';
    if (name === 'tv') { setTimeout(() => startTv(r.id || 'haupt')); return tv(); }
    return '';
  }
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-fx]');
    if (!el) return;
    const action = el.dataset.fx;
    if (action === 'join-table' && fx.scan?.table) { const t = fx.scan.table; fx.here = {id: t.id, no: t.no, name: t.name, venue: t.venue, at: Date.now()}; saveHere(fx.here); app().notify(`Tisch ${t.no} gemerkt – viel Spaß!`); location.hash = '#spielen'; return; }
    if (action === 'leave-table') { fx.here = false; saveHere(null); app().render(); return; }
    if (action === 'board-mode') { fx.boardMode = el.dataset.mode; app().render(); return; }
    if (action === 'liga') { fx.liga = el.dataset.liga; app().render(); return; }
    if (action === 'stat-pool') { fx.statPool = el.dataset.pool; app().render(); return; }
    if (fx.draft && ['pick-ball', 'pick-title', 'pick-trophy', 'pick-vis', 'av-mode', 'pick-preset', 'photo-remove'].includes(action)) {
      const d = fx.draft, y = window.scrollY;
      if (action === 'pick-ball') { d.ball = Number(el.dataset.ball); d.avatar_type = 'ball'; }
      if (action === 'av-mode') { d.avatar_type = el.dataset.mode; if (d.avatar_type === 'preset' && !d.preset_id) d.preset_id = Object.keys(PRESETS)[0]; }
      if (action === 'pick-preset') d.preset_id = el.dataset.preset;
      if (action === 'photo-remove') d.photo = null;
      if (action === 'pick-title') d.title_id = el.dataset.id || null;
      if (action === 'pick-vis') d.visibility = el.dataset.vis;
      if (action === 'pick-trophy') { const id = el.dataset.id; d.showcase = d.showcase.includes(id) ? d.showcase.filter(x => x !== id) : [...d.showcase, id].slice(0, 3); }
      app().render(); window.scrollTo(0, y); return;
    }
    if (action === 'edit-cancel') { fx.draft = null; return; }
    if (action === 'edit-save') {
      el.disabled = true;
      try {
        const saved = await app().write('/profile', {avatar_type: fx.draft.avatar_type === 'photo' && !fx.draft.photo ? 'ball' : fx.draft.avatar_type, preset_id: fx.draft.preset_id, photo: fx.draft.avatar_type === 'photo' ? fx.draft.photo : null, motto: fx.draft.motto, ball: fx.draft.ball, favorite_pool: fx.draft.favorite_pool, title_id: fx.draft.title_id, showcase: fx.draft.showcase, visibility: fx.draft.visibility}, 'profile:' + JSON.stringify(fx.draft));
        (fx.profiles ||= {}).me = saved; fx.profiles[saved.player.id] = saved; fx.draft = null;
        app().notify('Profil gespeichert.'); location.hash = '#profil';
      } catch (err) { app().notify(err.message, true); el.disabled = false; }
      return;
    }
    if (action === 'dialog-close') { el.closest('dialog')?.close(); return; }
    if (action === 'voucher-show') { voucherDialog(el.dataset.code); return; }
    try {
      if (action === 'voucher-new') {
        el.disabled = true;
        const {voucher} = await app().write('/vouchers', {}, 'voucher-new');
        await get('achievements', '/achievements'); app().render(); voucherDialog(voucher.code);
      }
      if (action === 'voucher-redeem') {
        const out = document.querySelector('#fx-redeem-result');
        try { await app().write(`/vouchers/${encodeURIComponent(el.dataset.code)}/redeem`, {}, 'redeem:' + el.dataset.code); out.textContent = '✓ Gültig – jetzt eingelöst. Rabatt in der Kasse buchen.'; el.disabled = true; await get('achievements', '/achievements'); }
        catch (err) { out.textContent = err.message; }
      }
      if (action === 'event-register') {
        el.disabled = true;
        await app().write(`/events/${encodeURIComponent(el.dataset.id)}/register`, {register: el.dataset.register === '1'}, 'event:' + el.dataset.id + ':' + el.dataset.register);
        await get('events', '/events'); app().render();
        app().notify(el.dataset.register === '1' ? 'Du bist angemeldet. Bis dann am Tisch!' : 'Du bist abgemeldet.');
      }
    } catch (err) { app().notify(err.message, true); el.disabled = false; }
  });
  document.addEventListener('close', event => { if (event.target.id === 'fx-voucher') app().render(); }, true);

    document.addEventListener('input', event => {
    const el = event.target.closest('[data-fxin]');
    if (!el || !fx.draft) return;
    fx.draft[el.dataset.fxin] = el.value;
    const c = document.querySelector('#fx-motto-count'); if (c && el.dataset.fxin === 'motto') c.textContent = `${el.value.length}/80 Zeichen`;
  });
  // Foto hochladen: quadratisch zuschneiden, auf 256 px verkleinern, als JPEG
  document.addEventListener('change', event => {
    if (event.target.id !== 'fx-photo' || !fx.draft) return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { app().notify('Bitte eine Bilddatei wählen.', true); return; }
    if (file.size > 15 * 1024 * 1024) { app().notify('Das Bild ist zu groß (höchstens 15 MB).', true); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      fx.draft.photo = c.toDataURL('image/jpeg', .85); fx.draft.avatar_type = 'photo';
      const y = window.scrollY; app().render(); window.scrollTo(0, y);
    };
    img.onerror = () => { URL.revokeObjectURL(url); app().notify('Dieses Bild lässt sich nicht öffnen. Bitte JPG oder PNG versuchen.', true); };
    img.src = url;
  });
  document.addEventListener('change', event => {
    const el = event.target.closest('[data-fxin]');
    if (el && fx.draft) { fx.draft[el.dataset.fxin] = el.value; if (el.tagName === 'SELECT') { const y = window.scrollY; app().render(); window.scrollTo(0, y); } }
  });
  const NAV_ICON = {spielen: 'eight-ball', rangliste: 'podium', erfolge: 'sport-medal', events: 'calendar', profil: 'person'};
  function navIcons() {
    if (!window.BCMIcon) return;
    document.querySelectorAll('.bottom-nav a[data-tab]').forEach(a => {
      const n = NAV_ICON[a.dataset.tab]; const old = a.querySelector('svg:not(.gi)');
      if (n && old) old.outerHTML = gi(n);
    });
  }
  window.BillardFeatures = {load, home, board, ratingExtras, profileExtras, profileTop, matchup, view,
    afterRender: (state, r) => { if (r.view !== 'tv') stopTv(); navIcons(); document.body.classList.toggle('fx-staff', isStaff(state)); if (isStaff(state)) { const l = document.querySelector('#account-link'); if (l) l.textContent = `Café-Konto: ${state.session.user.name}`; } window.BillardAdmin?.afterRender(state, r); },
    isStaff, staffAccount,
    ui: {avatar, pAvatar, trophyIcon, numBall, poolBall, emblem, POOLNAME, presetURL, PRESETS, gi, bracket, podium}};
})();
