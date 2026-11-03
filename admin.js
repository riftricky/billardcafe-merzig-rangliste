'use strict';
/*
 * CAFÉ-VERWALTUNG (Prototyp)
 * --------------------------
 * Admin-Panel für den Inhaber („owner“) und das Personal an der Theke („staff“).
 * Route: #admin, #admin/<bereich>, #admin/spieler/<id>
 * Alle Daten über BillardApp.request/write an /admin/… (siehe UEBERGABE.md, Abschnitt „Admin“).
 * Rechte prüft der Server; die Oberfläche blendet nur aus, was die Rolle nicht darf.
 */
(() => {
  const app = () => window.BillardApp;
  const ui = () => window.BillardFeatures.ui;
  const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const ad = {tableVenue: null, printIds: null, counter: null, issue: null, issuePreview: null, issueResult: null, voucherStatus: 'open', auditFilter: '', playerQuery: '', month: null, lookup: null, lookupError: '', reset: null};
  const date = (v, time = false) => v ? new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', ...(time ? {hour: '2-digit', minute: '2-digit'} : {})}).format(new Date(v)) + (time ? ' Uhr' : '') : '–';
  const SECTIONS = [
    ['uebersicht', 'Übersicht', ['owner', 'staff']],
    ['turniere', 'Turniere', ['owner', 'staff']],
    ['tv', 'Café-TV', ['owner', 'staff']],
    ['monat', 'Monatsabschluss', ['owner']],
    ['spieler', 'Spieler', ['owner']],
    ['gutscheine', 'Gutscheine', ['owner', 'staff']],
    ['streit', 'Streitfälle', ['owner', 'staff']],
    ['katalog', 'Belohnungen', ['owner']],
    ['events', 'Events', ['owner', 'staff']],
    ['tische', 'Tische & QR', ['owner', 'staff']],
    ['orte', 'Orte', ['owner']],
    ['aufgaben', 'Wochenaufgaben', ['owner']],
    ['protokoll', 'Protokoll', ['owner']]
  ];
  const TAB_ICON = {turniere: 'organigram', tv: 'film-projector', uebersicht: 'histogram', monat: 'laurel-crown', spieler: 'person', gutscheine: 'ticket', streit: 'whistle', katalog: 'trophy', events: 'calendar', tische: 'pool-table-corner', orte: 'position-marker', aufgaben: 'target-arrows', protokoll: 'scroll-unfurled'};
  const gi = (n, cls = '') => window.BCMIcon ? window.BCMIcon(n, cls) : '';
  const ticket = '<span class="ad-ticket" aria-hidden="true">' + (window.BCMIcon ? window.BCMIcon('ticket') : '€') + '</span>';
  const venueList = () => (ad.venues?.venues || []).filter(v => !v.archived);
  const mainVenue = () => (ad.venues?.venues || []).find(v => v.main);
  const venueTag = v => v ? `<span class="nt-venue ${v.main ? '' : 'other'}">${gi('position-marker')}nur ${e(v.name)}</span>` : '';
  const ROLE = {owner: 'Inhaber', staff: 'Theke'};
  const KIND = {pokal: 'Pokal', medaille: 'Medaille', titel: 'Titel', gutschein: 'Gutschein'};
  const TIER = {1: 'Bronze', 2: 'Silber', 3: 'Gold'};
  const role = state => state.session?.authenticated ? state.session.user?.role || null : null;

  async function get(key, path) {
    try { ad[key] = await app().request(path); ad[key + 'Error'] = ''; }
    catch (err) { ad[key + 'Error'] = err.message; }
  }
  async function load(state, r) {
    const rl = role(state); if (!rl) return;
    const s = r.section || 'uebersicht';
    if (s === 'tische') await get('tables', '/admin/tables');
    if (s === 'turniere') await Promise.all([get('tours', '/admin/tournaments'), rl === 'owner' ? get('catalog', '/admin/catalog') : null]);
    if (s === 'tv') await Promise.all([get('tv', '/admin/tv'), get('tours', '/admin/tournaments')]);
    if (['uebersicht', 'gutscheine', 'events', 'orte', 'katalog', 'tische', 'tv'].includes(s)) await get('venues', '/venues' + (s === 'orte' ? '?all=1' : ''));
    if (s === 'uebersicht') await get('overview', '/admin/overview');
    if (s === 'monat') await get('close', '/admin/month-close' + (ad.month ? '?month=' + encodeURIComponent(ad.month) : ''));
    if (s === 'spieler' && !r.id) await get('players', '/admin/players?q=' + encodeURIComponent(ad.playerQuery));
    if (s === 'spieler' && r.id) await Promise.all([get('player', '/admin/players/' + encodeURIComponent(r.id)), get('catalog', '/admin/catalog'), get('players', '/admin/players?q=')]);
    if (s === 'gutscheine' && r.id === 'neu' && rl === 'owner') { await Promise.all([get('catalog', '/admin/catalog'), get('players', '/admin/players?q='), get('events', '/events')]); await previewIssue(); }
    else if (s === 'gutscheine') await Promise.all([get('vouchers', '/admin/vouchers?status=' + ad.voucherStatus), rl === 'owner' ? get('batches', '/admin/vouchers/batches') : null]);
    if (s === 'streit') await get('disputed', '/admin/matches');
    if (s === 'katalog') await get('catalog', '/admin/catalog');
    if (s === 'events') await get('events', '/events');
    if (s === 'aufgaben') await get('quests', '/admin/quests');
    if (s === 'protokoll') await get('audit', '/admin/audit' + (ad.auditFilter ? '?action=' + ad.auditFilter : ''));
  }
  async function reload() { const st = app().state; await load(st, app().route()); app().render(); }

  // ---------- Bausteine ----------
  const err = key => ad[key + 'Error'] ? `<div class="callout error" role="alert"><p>${e(ad[key + 'Error'])}</p></div>` : '';
  const loadingBox = t => `<div class="loading" role="status">${e(t)}</div>`;
  const section = (title, body, extra = '') => `<section class="fx-card ad-card"><div class="section-heading"><h2>${e(title)}</h2>${extra}</div>${body}</section>`;
  const empty = t => `<p class="ad-empty">${e(t)}</p>`;
  function prizeIcon(award, size = 44) { return ui().trophyIcon({kind: award.kind === 'titel' ? 'medaille' : award.kind, tier: award.tier || 3, name: award.name}, size); }

  function shell(state, r, body) {
    const rl = role(state);
    const tabs = SECTIONS.filter(([, , roles]) => roles.includes(rl));
    const cur = r.section || 'uebersicht';
    return `<div class="ad">
      <div class="ad-head"><div><p class="eyebrow">Billardcafé Merzig</p><h1>Café-Verwaltung</h1></div><span class="ad-role ${rl}">${e(ROLE[rl])}</span></div>
      <details class="ad-menu"><summary>${gi(TAB_ICON[cur])}<span><small>Bereich</small>${e((SECTIONS.find(([k]) => k === cur) || [, ''])[1])}</span></summary><nav class="ad-menu-grid" aria-label="Bereiche der Verwaltung">${tabs.map(([k, n]) => `<a href="#admin/${k}" ${k === cur ? 'aria-current="page"' : ''}>${gi(TAB_ICON[k])}${e(n)}</a>`).join('')}</nav></details>
      <nav class="ad-tabs" aria-label="Bereiche der Verwaltung">${tabs.map(([k, n]) => `<a href="#admin/${k}" ${k === cur ? 'aria-current="page"' : ''}>${gi(TAB_ICON[k])}${e(n)}</a>`).join('')}</nav>
      ${body}
    </div>`;
  }

  // ---------- Übersicht ----------
  function viewOverview(state) {
    const o = ad.overview;
    if (!o) return err('overview') || loadingBox('Übersicht wird geladen …');
    const owner = role(state) === 'owner';
    const tile = (href, n, label, sub, tone = '', icon = '') => `<a class="ad-tile ${tone}" href="${href}">${icon ? gi(icon, 'ad-tile-ic') : ''}<b>${e(n)}</b><span>${e(label)}</span>${sub ? `<small>${e(sub)}</small>` : ''}</a>`;
    return `<div class="ad-tiles">
        ${owner && o.close ? tile('#admin/monat', o.close.pending, 'Monatsabschluss', o.close.pending ? `${o.close.label} wartet auf dich` : `${o.close.label} erledigt`, o.close.pending ? 'hot' : '', 'laurel-crown') : ''}
        ${tile('#admin/streit', o.disputed, 'Streitfälle', o.disputed ? 'bitte klären' : 'alles geklärt', o.disputed ? 'hot' : '', 'whistle')}
        ${tile('#admin/gutscheine', o.vouchers_open, 'Offene Gutscheine', `${o.redeemed_today.length} heute eingelöst`, '', 'ticket')}
        ${tile(owner ? '#admin/spieler' : '#admin/uebersicht', o.new_players.length, 'Neue Spieler', 'in der Platzierung', '', 'meeple-group')}
      </div>
      ${section('Gutschein an der Theke', voucherLookupForm())}
      ${o.suspicious.length ? section('Auffällige Paarungen', `<p class="hint">Viele Partien derselben zwei Spieler in diesem Monat mit wechselnden Siegen. Bitte im Blick behalten – die Monatsliga zählt höchstens drei davon.</p><ul class="ad-list">${o.suspicious.map(p => `<li class="ad-row">${ui().pAvatar(p.a, '', 34)}${ui().pAvatar(p.b, '', 34)}<span class="ad-row-main"><strong>${e(p.a.name)} & ${e(p.b.name)}</strong><small>${p.count} Partien · ${p.wins_a}:${p.wins_b} Siege</small></span>${owner ? `<a class="btn small" href="#admin/spieler/${e(p.a.id)}">Ansehen</a>` : ''}</li>`).join('')}</ul>`) : ''}
      ${o.new_players.length ? section('Neu in der Platzierung', `<div class="ad-avatars">${o.new_players.map(p => `<a href="${owner ? '#admin/spieler/' + e(p.id) : '#spieler/' + e(p.id)}">${ui().pAvatar(p, '', 44)}<span>${e(p.name)}</span></a>`).join('')}</div><p class="hint">Tipp: Beim nächsten Einsteigerabend persönlich begrüßen.</p>`) : ''}
      ${owner ? section('Zuletzt im Protokoll', o.recent.length ? auditList(o.recent) : empty('Noch keine Aktionen.'), '<a class="text-button" href="#admin/protokoll">Alles</a>') : ''}`;
  }

  // ---------- Gutscheine ----------
  function voucherLookupForm() {
    const v = ad.lookup, vs = venueList();
    const counter = ad.counter || mainVenue()?.id;
    const wrong = v && v.venue && v.venue.id !== counter;
    return `${vs.length > 1 ? `<label class="field ad-counter"><span>${gi('position-marker')}Diese Theke steht im</span><select id="ad-counter" data-ad-counter>${vs.map(x => `<option value="${e(x.id)}" ${x.id === counter ? 'selected' : ''}>${e(x.name)}</option>`).join('')}</select></label>` : ''}<form class="ad-lookup" data-adform="lookup"><label class="field"><span>Code vom Handy des Gastes</span><input id="ad-code" name="code" autocomplete="off" autocapitalize="characters" placeholder="BCM-XXXX-XXXX" value="${e(ad.lookupCode || '')}"></label><button class="btn primary" type="submit">Prüfen</button></form>
      ${ad.lookupError ? `<p class="ad-msg bad" role="alert">${e(ad.lookupError)}</p>` : ''}
      ${v ? `<div class="ad-voucher ${v.redeemed_at ? 'used' : Date.parse(v.valid_until) < Date.now() || wrong ? 'expired' : 'ok'}">
        <div><strong>${e(v.title)}</strong><small>${e(v.player)} · ${e(v.code)}</small>${v.venue ? `<small class="ad-venue-line ${wrong ? 'bad' : ''}">${gi('position-marker')}${wrong ? `Gilt nur im ${e(v.venue.name)} – nicht hier einlösen.` : `Gilt nur im ${e(v.venue.name)}`}</small>` : ''}<small>${v.redeemed_at ? `Eingelöst am ${date(v.redeemed_at, true)} von ${e(v.redeemed_by)}` : Date.parse(v.valid_until) < Date.now() ? `Abgelaufen am ${date(v.valid_until)}` : `Gültig bis ${date(v.valid_until)} · Quelle: ${e(v.source)}`}</small></div>
        ${!v.redeemed_at && Date.parse(v.valid_until) > Date.now() && !wrong ? `<button type="button" class="btn primary" data-ad="redeem" data-code="${e(v.code)}">Jetzt einlösen</button>` : ''}
      </div><p class="hint">Nach dem Einlösen den Rabatt wie gewohnt in der Kasse buchen.</p>` : ''}`;
  }
  // ---------- Gutscheine erstellen & verteilen ----------
  const LIGEN = ['1. Café-Liga', '2. Café-Liga', '3. Café-Liga', '4. Café-Liga'];
  function issueState() {
    if (!ad.issue) {
      const first = (ad.catalog?.catalog || []).find(k => k.kind === 'gutschein' && !k.archived);
      ad.issue = {template: first?.id || 'custom', venue_id: first?.venue_id || '', title: '', valid_days: 30, note: '', target: 'players', player_ids: [], liga: '4. Café-Liga', pool: '8-single', event_id: ad.events?.events?.find(x => x.capacity)?.id || '', count: 10, reason: '', q: ''};
    }
    return ad.issue;
  }
  const issueBody = () => { const i = ad.issue; return {template: i.template, venue_id: i.venue_id, title: i.title, valid_days: Number(i.valid_days), note: i.note, target: i.target, player_ids: i.player_ids, liga: i.liga, pool: i.pool, event_id: i.event_id, count: Number(i.count), reason: i.reason}; };
  let previewTimer = null;
  async function previewIssue() {
    if (!ad.issue) issueState();
    try { ad.issuePreview = await app().request('/admin/vouchers/preview', {method: 'POST', body: issueBody()}); ad.issuePreviewError = ''; }
    catch (er) { ad.issuePreview = null; ad.issuePreviewError = er.message; }
  }
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(async () => { await previewIssue(); app().render(); }, 250); }
  function viewIssue() {
    if (ad.issueResult) return viewIssueResult();
    if (!ad.catalog || !ad.players || !ad.events) return err('catalog') || loadingBox('Wird vorbereitet …');
    const i = issueState();
    const tpl = (ad.catalog.catalog || []).filter(k => k.kind === 'gutschein' && !k.archived);
    const pv = ad.issuePreview;
    const radio = (name, value, label, sub = '') => `<button type="button" role="radio" aria-checked="${i[name] === value}" data-adi-pick="${name}" data-v="${e(value)}"><span class="nt-radio"></span><span><strong>${e(label)}</strong>${sub ? `<small>${e(sub)}</small>` : ''}</span></button>`;
    const q = i.q.trim().toLowerCase();
    const plist = ad.players.players.filter(p => !p.blocked && (!q || p.name.toLowerCase().includes(q)));
    return `<a class="back-link" href="#admin/gutscheine">← Gutscheine</a>
      <div class="page-heading"><p class="eyebrow">Inhaber</p><h2 class="ad-h">Gutscheine erstellen & verteilen</h2></div>
      ${section('1 · Was gibt es?', `<div class="nt-radio-list">${tpl.map(k => radio('template', k.id, k.name, `${k.valid_days} Tage gültig${k.sponsor ? ' · ' + k.sponsor : ''}`)).join('')}${radio('template', 'custom', 'Eigener Gutschein', 'Name und Gültigkeit selbst festlegen')}</div>
        ${i.template === 'custom' ? `<div class="ad-grid2"><label class="field"><span>Name</span><input id="adi-title" data-adi="title" maxlength="40" value="${e(i.title)}" placeholder="z. B. Happy Hour −50 %"></label><label class="field"><span>Gültig (Tage)</span><input id="adi-days" data-adi="valid_days" type="number" min="1" max="365" value="${e(i.valid_days)}"></label></div>` : ''}
        <label class="field"><span>Hinweis für Gäste (optional)</span><input id="adi-note" data-adi="note" maxlength="80" value="${e(i.note)}" placeholder="z. B. gilt Mo–Do bis 18 Uhr"></label>
        ${venueList().length > 1 ? `<label class="field"><span>Gültig in (optional)</span><select id="adi-venue" data-adi="venue_id"><option value="" ${!i.venue_id ? 'selected' : ''}>Allen Standorten</option>${venueList().map(v => `<option value="${e(v.id)}" ${i.venue_id === v.id ? 'selected' : ''}>nur ${e(v.name)}</option>`).join('')}</select><small class="hint">Die Theke eines anderen Standorts kann ihn dann nicht einlösen.</small></label>` : ''}`)}
      ${section('2 · Wer bekommt ihn?', `<div class="nt-radio-list">
          ${radio('target', 'players', 'Ausgewählte Spieler', i.player_ids.length ? `${i.player_ids.length} ausgewählt` : 'einzeln anklicken')}
          ${radio('target', 'liga', 'Eine Café-Liga', 'z. B. alle aus der 4. Liga zum Ansporn')}
          ${radio('target', 'active', 'Alle, die diesen Monat gespielt haben')}
          ${radio('target', 'event', 'Teilnehmer eines Events')}
          ${radio('target', 'all', 'Alle Spieler')}
          ${radio('target', 'none', 'Ohne Empfänger', 'Codes zum Ausgeben – z. B. auf Flyern oder an Neue')}
        </div>
        ${i.target === 'players' ? `<label class="field ad-mt"><span>Spieler suchen</span><input id="adi-q" data-adi="q" value="${e(i.q)}" placeholder="Nickname" autocomplete="off"></label>
          <div class="ad-pick">${plist.map(p => `<button type="button" aria-pressed="${i.player_ids.includes(p.id)}" data-adi-toggle="${e(p.id)}">${ui().pAvatar(p, '', 30)}<span>${e(p.name)}</span></button>`).join('') || empty('Niemand gefunden.')}</div>` : ''}
        ${i.target === 'liga' ? `<div class="ad-grid2 ad-mt"><label class="field"><span>Café-Liga</span><select id="adi-liga" data-adi="liga">${LIGEN.map(l => `<option ${i.liga === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field"><span>Disziplin</span><select id="adi-pool" data-adi="pool">${Object.entries(ui().POOLNAME).map(([k, n]) => `<option value="${k}" ${i.pool === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>` : ''}
        ${i.target === 'event' ? `<label class="field ad-mt"><span>Event</span><select id="adi-event" data-adi="event_id">${ad.events.events.filter(x => x.capacity).map(x => `<option value="${e(x.id)}" ${i.event_id === x.id ? 'selected' : ''}>${e(x.title)} · ${date(x.starts_at)}</option>`).join('')}</select></label>` : ''}
        ${i.target === 'none' ? `<label class="field ad-mt"><span>Anzahl Codes</span><input id="adi-count" data-adi="count" type="number" min="1" max="50" value="${e(i.count)}"></label>` : ''}`)}
      ${section('3 · Vorschau', ad.issuePreviewError ? `<p class="ad-msg bad">${e(ad.issuePreviewError)}</p>` : pv ? `<div class="ad-ticket-big"><span class="ad-ticket-cut"></span><div><small>Gutschein · ${e(pv.valid_days)} Tage gültig</small><strong>${e(pv.title)}</strong>${i.note ? `<em class="ad-note">${e(i.note)}</em>` : ''}${pv.venue ? `<em class="ad-venue-line">${gi('position-marker')}nur im ${e(pv.venue.name)}</em>` : ''}</div><b>×${pv.count}</b></div>
          <p class="ad-meta">${e(pv.label)}</p>${pv.recipients.length ? `<div class="ad-avatars small">${pv.recipients.map(p => `<span>${ui().pAvatar(p, '', 32)}<span>${e(p.name)}</span></span>`).join('')}${pv.count > pv.recipients.length ? `<span class="ad-more">+${pv.count - pv.recipients.length}</span>` : ''}</div>` : ''}` : loadingBox('Vorschau wird berechnet …'))}
      ${section('4 · Anlass', `<label class="field"><span>Begründung</span><textarea id="adi-reason" data-adi="reason" maxlength="200" rows="2" placeholder="z. B. Danke fürs Mitmachen beim Stadtfest">${e(i.reason)}</textarea><small class="hint">Steht im Protokoll und in der Nachricht an die Spieler.</small></label>
        <button type="button" class="btn primary ad-wide" data-ad="issue-go" ${pv && i.reason.trim().length >= 3 ? '' : 'disabled'}>${pv ? `${pv.count} ${pv.count === 1 ? 'Gutschein' : 'Gutscheine'} ${i.target === 'none' ? 'erstellen' : 'verteilen'}` : 'Gutscheine verteilen'}</button>`)}`;
  }
  function viewIssueResult() {
    const r = ad.issueResult;
    const none = r.vouchers.every(v => !v.player_id);
    return `<div class="page-heading"><p class="eyebrow">Erledigt</p><h2 class="ad-h">${r.vouchers.length} ${r.vouchers.length === 1 ? 'Gutschein' : 'Gutscheine'} ${none ? 'erstellt' : 'verteilt'}</h2></div>
      ${section(r.batch.title, `<p class="hint">${none ? 'Diese Codes gehören noch niemandem. Gib sie auf Papier, per Nachricht oder an der Theke aus – jeder Code gilt einmal.' : 'Die Spieler finden den Gutschein in ihrem Bonusheft und bekommen beim nächsten Öffnen der App eine Nachricht.'}</p>
        ${none ? `<button type="button" class="btn ad-wide" data-ad="copy-all">Alle Codes kopieren</button>` : ''}
        <ul class="ad-list ad-mt">${r.vouchers.map(v => `<li class="ad-row">${ticket}<span class="ad-row-main"><strong class="ad-mono">${e(v.code)}</strong><small>${e(v.player)} · gültig bis ${date(v.valid_until)}</small></span>${none ? `<button type="button" class="btn small" data-ad="copy" data-code="${e(v.code)}">Kopieren</button>` : ''}</li>`).join('')}</ul>
        ${none ? `<textarea id="adi-codes" class="ad-codes" readonly rows="3">${e(r.vouchers.map(v => v.code).join('\n'))}</textarea>` : ''}`)}
      <div class="ad-actions"><button type="button" class="btn primary" data-ad="issue-again">Weitere Gutscheine</button><a class="btn" href="#admin/gutscheine" data-ad="issue-done">Fertig</a></div>`;
  }

  function viewVouchers() {
    const list = ad.vouchers?.vouchers;
    const tabs = [['open', 'Offen'], ['redeemed', 'Eingelöst'], ['expired', 'Abgelaufen'], ['all', 'Alle']];
    const owner = role(app().state) === 'owner';
    const b = ad.batches?.batches || [];
    return (owner ? section('Gutscheine verteilen', `<p class="hint">Eigene Gutscheine oder Vorlagen an einzelne Spieler, eine Liga, Event-Teilnehmer oder alle verteilen – oder Codes ohne Empfänger zum Ausgeben erstellen.</p><a class="btn primary ad-wide" href="#admin/gutscheine/neu">Gutscheine erstellen & verteilen</a>
        ${b.length ? `<h3 class="ad-h3">Letzte Aktionen</h3><ul class="ad-list">${b.slice(0, 5).map(x => `<li class="ad-row"><span class="ad-row-main"><strong>${e(x.title)}</strong><small>${e(x.target)} · ${date(x.created_at)} · ${e(x.by)}</small>${venueTag(x.venue)}<span class="nt-wl small" style="--all:100%"><i style="width:${x.count ? (x.redeemed / x.count * 100).toFixed(1) : 0}%"></i></span></span><span class="ad-row-end"><b class="ad-frac">${x.redeemed}/${x.count}</b><small>eingelöst</small></span></li>`).join('')}</ul>` : ''}`) : '')
      + section('Gutschein einlösen', voucherLookupForm())
      + section('Alle Gutscheine', `<div class="ad-chips">${tabs.map(([k, n]) => `<button type="button" data-ad="vstatus" data-v="${k}" aria-pressed="${ad.voucherStatus === k}">${n}</button>`).join('')}</div>
        ${err('vouchers')}${!list ? loadingBox('Gutscheine werden geladen …') : list.length ? `<ul class="ad-list">${list.map(v => `<li class="ad-row">${ticket}<span class="ad-row-main"><strong>${e(v.title)}</strong><small>${e(v.player)} · ${e(v.code)} · ${e(v.source)}</small>${v.note ? `<small>${e(v.note)}</small>` : ''}${venueTag(v.venue)}</span><span class="ad-row-end">${v.redeemed_at ? `<small>eingelöst ${date(v.redeemed_at)}</small>` : `<small>bis ${date(v.valid_until)}</small>`}</span></li>`).join('')}</ul>` : empty('Keine Gutscheine in dieser Auswahl.')}`);
  }

  // ---------- Monatsabschluss ----------
  function viewMonth() {
    const c = ad.close;
    if (!c) return err('close') || loadingBox('Monatsabschluss wird geladen …');
    const pending = c.items.filter(i => i.status === 'pending').length;
    const badge = st => ({pending: '<span class="ad-st pending">Offen</span>', approved: '<span class="ad-st ok">Bestätigt</span>', rejected: '<span class="ad-st no">Abgelehnt</span>', empty: '<span class="ad-st">Kein Kandidat</span>'})[st];
    return `<div class="ad-chips ad-months">${c.months.map(m => `<button type="button" data-ad="month" data-m="${m.month}" aria-pressed="${m.month === c.month}">${e(m.label)}${m.status === 'open' ? ' •' : ''}</button>`).join('')}</div>
      ${section(c.label, `<p class="hint">Das System schlägt die Sieger vor. Erst mit deiner Bestätigung bekommen die Spieler Pokal, Titel und Gutschein. Regel: höchstens eine Auszeichnung pro Person im Monat – wer schon eine hat, macht Platz für den Nächsten.</p>
        ${pending ? `<button type="button" class="btn primary ad-wide" data-ad="approve-all">Alle ${pending} Vorschläge bestätigen</button>` : `<p class="ad-msg good">Dieser Monat ist abgeschlossen.</p>`}`)}
      <ul class="ad-awards">${c.items.map(it => `<li class="ad-award ${it.status}">
        <div class="ad-award-top">${prizeIcon(it.award, 46)}<div class="ad-award-title"><strong>${e(it.label)}</strong><small>${e(it.basis)} · Preis: ${e(it.voucher)}</small></div>${badge(it.status)}</div>
        ${it.player ? `<div class="ad-award-who">${ui().pAvatar(it.player, '', 40)}<span><strong>${e(it.player.name)}</strong>${it.points?.[it.player.id] != null ? `<small>${e(it.points[it.player.id])} ${it.key === 'regular' ? 'Spieltage' : 'Punkte'}</small>` : ''}</span></div>` : ''}
        ${it.note ? `<p class="ad-note">${e(it.note)}</p>` : ''}
        ${it.reason ? `<p class="ad-note">Begründung: ${e(it.reason)}</p>` : ''}
        ${it.status === 'pending' ? `<div class="ad-actions"><button type="button" class="btn primary small" data-ad="approve" data-key="${e(it.key)}">Bestätigen</button><button type="button" class="btn small" data-ad="swap" data-key="${e(it.key)}">Anderer Spieler</button><button type="button" class="btn small danger" data-ad="reject" data-key="${e(it.key)}">Ablehnen</button></div>` : it.decided_by ? `<p class="ad-meta">${it.status === 'approved' ? 'Bestätigt' : 'Abgelehnt'} von ${e(it.decided_by)} · ${date(it.decided_at)}</p>` : ''}
      </li>`).join('')}</ul>`;
  }

  // ---------- Spieler ----------
  function viewPlayers() {
    const list = ad.players?.players;
    return section('Spieler suchen', `<form class="ad-lookup" data-adform="psearch"><label class="field"><span>Nickname</span><input id="ad-psearch" name="q" value="${e(ad.playerQuery)}" placeholder="z. B. Lena" autocomplete="off"></label><button class="btn" type="submit">Suchen</button></form>`)
      + (err('players') || (!list ? loadingBox('Spieler werden geladen …') : `<ul class="ad-list ad-plist">${list.map(p => `<li><a class="ad-row" href="#admin/spieler/${e(p.id)}">${ui().pAvatar(p, '', 40)}<span class="ad-row-main"><strong>${e(p.name)}${p.blocked ? ' <em class="ad-st no">Gesperrt</em>' : ''}</strong><small>${p.games} Partien · ${p.stamps}/10 Stempel${p.last_played ? ' · zuletzt ' + date(p.last_played) : ''}</small></span><span class="ad-row-end">${p.rank ? ui().emblem(p.rank, 24) : '<small>neu</small>'}</span></a></li>`).join('')}</ul>`));
  }
  function viewPlayer(r) {
    const d = ad.player;
    if (!d || d.player.id !== r.id) return err('player') || loadingBox('Spieler wird geladen …');
    const p = d.player;
    const openV = d.vouchers.filter(v => !v.redeemed_at && Date.parse(v.valid_until) > Date.now());
    return `<a class="back-link" href="#admin/spieler">← Alle Spieler</a>
      <section class="ad-player">
        ${ui().pAvatar(p, '', 72)}
        <div class="ad-player-id"><h2>${e(p.name)}</h2>${p.title ? `<span class="nt-ribbon">${e(p.title)}</span>` : ''}<small>${{public: 'Profil sichtbar für alle', members: 'Profil nur für angemeldete Spieler', hidden: 'Profil privat'}[d.visibility] || ''}</small></div>
      </section>
      ${d.blocked ? `<p class="ad-msg bad">Gesperrt seit ${date(d.blocked.at)}: ${e(d.blocked.reason)}</p>` : ''}
      ${ad.reset?.pid === p.id ? `<div class="ad-msg good" role="status"><strong>Einmal-Code für die neue PIN: <span class="ad-code">${e(ad.reset.code)}</span></strong><br>Nur persönlich an der Theke übergeben. Gültig bis ${date(ad.reset.valid_until, true)}. Wird nicht gespeichert.</div>` : ''}
      <div class="nt-kpis big"><div><b>${d.summary.games}</b><span>Partien</span></div><div><b>${d.summary.wins}</b><span>Siege</span></div><div><b>${d.stamps}</b><span>Stempel</span></div><div><b>${openV.length}</b><span>Gutscheine</span></div></div>
      <div class="ad-action-grid">
        <button type="button" class="btn primary" data-ad="award">Auszeichnung verleihen</button>
        <button type="button" class="btn" data-ad="voucher">Gutschein ausstellen</button>
        <button type="button" class="btn" data-ad="stamps">Stempel ändern</button>
        <button type="button" class="btn" data-ad="pin">PIN zurücksetzen</button>
        <button type="button" class="btn ${d.blocked ? '' : 'danger'}" data-ad="block" data-blocked="${d.blocked ? '0' : '1'}">${d.blocked ? 'Sperre aufheben' : 'Profil sperren'}</button>
        <button type="button" class="btn" data-ad="merge">Doppelprofil zusammenführen</button>
        ${d.has_photo ? '<button type="button" class="btn danger" data-ad="photo-remove">Profilbild entfernen</button>' : ''}
        <a class="btn" href="#spieler/${e(p.id)}">Öffentliches Profil</a>
      </div>
      ${section('Auszeichnungen', d.honors.length ? `<ul class="ad-list">${d.honors.map(h => `<li class="ad-row">${ui().trophyIcon({...h, kind: h.kind === 'abzeichen' || h.kind === 'titel' ? 'medaille' : h.kind}, 34)}<span class="ad-row-main"><strong>${e(h.name)}</strong><small>${e(h.kind === 'abzeichen' ? 'Abzeichen' : KIND[h.kind] || h.kind)} · ${e(h.sub)}</small></span>${h.kind !== 'abzeichen' ? `<button type="button" class="btn small" data-ad="revoke" data-id="${e(h.id)}" data-name="${e(h.name)}">Entziehen</button>` : ''}</li>`).join('')}</ul>` : empty('Noch keine Auszeichnungen.'))}
      ${section('Gutscheine', d.vouchers.length ? `<ul class="ad-list">${d.vouchers.map(v => `<li class="ad-row">${ticket}<span class="ad-row-main"><strong>${e(v.title)}</strong><small>${e(v.code)} · ${e(v.source)}</small></span><span class="ad-row-end"><small>${v.redeemed_at ? 'eingelöst ' + date(v.redeemed_at) : 'bis ' + date(v.valid_until)}</small></span></li>`).join('')}</ul>` : empty('Keine Gutscheine.'))}
      ${section('Protokoll zu diesem Spieler', d.audit.length ? auditList(d.audit) : empty('Noch keine Aktionen des Cafés.'))}`;
  }

  // ---------- Streitfälle ----------
  function viewDisputes(state) {
    const list = ad.disputed?.matches;
    const owner = role(state) === 'owner';
    if (!list) return err('disputed') || loadingBox('Streitfälle werden geladen …');
    if (!list.length) return section('Streitfälle', '<p class="ad-msg good">Keine offenen Streitfälle. Alle Ergebnisse sind geklärt.</p>');
    const pools = ui().POOLNAME;
    return list.map(m => section(`${pools[m.pool]} · ${{1: 'Einzelnes Spiel', 3: '3er Satz', 5: '3er Satz', 7: '5er Satz'}[m.best_of]}`, `
      <div class="ad-vs"><div>${m.teams[0].map(p => `<strong>${e(p.name)}</strong>`).join(' & ')}</div><b>${m.proposal ? `${m.proposal.score_a} : ${m.proposal.score_b}` : '– : –'}</b><div>${m.teams[1].map(p => `<strong>${e(p.name)}</strong>`).join(' & ')}</div></div>
      <p class="ad-note">Vorschlag von ${e(m.teams[0][0].name)}. Widerspruch: „${e(m.dispute_reason)}“</p>
      <p class="ad-meta">Angelegt am ${date(m.created_at, true)}</p>
      ${owner ? `<div class="ad-actions"><button type="button" class="btn primary small" data-ad="resolve-accept" data-id="${e(m.id)}" data-a="${m.proposal?.score_a}" data-b="${m.proposal?.score_b}">Vorschlag ${m.proposal?.score_a}:${m.proposal?.score_b} bestätigen</button><button type="button" class="btn small" data-ad="resolve" data-id="${e(m.id)}">Anderes Ergebnis</button><button type="button" class="btn small danger" data-ad="void" data-id="${e(m.id)}">Annullieren</button></div>` : '<p class="hint">Entscheiden kann nur der Inhaber. Sprich die beiden am besten direkt an.</p>'}`)).join('');
  }

  // ---------- Katalog ----------
  function viewCatalog() {
    const list = ad.catalog?.catalog;
    if (!list) return err('catalog') || loadingBox('Katalog wird geladen …');
    const row = k => `<li class="ad-row ${k.archived ? 'archived' : ''}">${k.kind === 'gutschein' ? '${ticket}' : prizeIcon(k, 34)}<span class="ad-row-main"><strong>${e(k.name)}</strong><small>${e(KIND[k.kind])}${k.tier ? ' · ' + TIER[k.tier] : ''}${k.valid_days ? ` · ${k.valid_days} Tage gültig` : ''}${k.sponsor ? ' · ' + e(k.sponsor) : ''}</small>${k.description ? `<small>${e(k.description)}</small>` : ''}${venueTag(k.venue)}</span><button type="button" class="btn small" data-ad="archive" data-id="${e(k.id)}">${k.archived ? 'Reaktivieren' : 'Archivieren'}</button></li>`;
    return section('Belohnungen', `<p class="hint">Pokale, Medaillen und Titel kannst du Spielern verleihen. Sie erscheinen dann in deren Vitrine und Titelauswahl. Gutschein-Vorlagen stellst du beim Spieler aus.</p><button type="button" class="btn primary ad-wide" data-ad="cat-new">Neue Vorlage anlegen</button>`)
      + section('Auszeichnungen', `<ul class="ad-list">${list.filter(k => k.kind !== 'gutschein').map(row).join('') || empty('Noch keine.')}</ul>`)
      + section('Gutscheine', `<ul class="ad-list">${list.filter(k => k.kind === 'gutschein').map(row).join('') || empty('Noch keine.')}</ul>`);
  }

  // ---------- Events ----------
  function viewEvents() {
    const list = ad.events?.events;
    if (!list) return err('events') || loadingBox('Events werden geladen …');
    return section('Events', `<button type="button" class="btn primary ad-wide" data-ad="event-new">Neues Event</button>`)
      + `<ul class="ad-list">${list.map(ev => `<li class="ad-row ad-event"><span class="ad-date"><b>${e(new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin', day: '2-digit'}).format(new Date(ev.starts_at)))}</b><small>${e(new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin', month: 'short'}).format(new Date(ev.starts_at)))}</small></span><span class="ad-row-main"><strong>${e(ev.title)}</strong><small>${e(ev.type)} · ${date(ev.starts_at, true)}${ev.capacity ? ` · ${ev.participants}/${ev.capacity} angemeldet` : ''}</small>${ev.venue && !ev.venue.main ? `<span class="nt-venue other">${gi('position-marker')}${e(ev.venue.name)}</span>` : ''}</span><span class="ad-row-btns"><button type="button" class="btn small" data-ad="event-edit" data-id="${e(ev.id)}">Bearbeiten</button><button type="button" class="btn small danger" data-ad="event-del" data-id="${e(ev.id)}" data-name="${e(ev.title)}">Löschen</button></span></li>`).join('')}</ul>`;
  }

  // ---------- Turniere ----------
  const TSTATUS = {draft: ['Vorbereitung', ''], running: ['Läuft', 'live'], finished: ['Beendet', 'done']};
  function viewTournaments(state) {
    const d = ad.tours; if (!d) return err('tours') || loadingBox('Turniere werden geladen …');
    const owner = role(state) === 'owner';
    const card = t => `<a class="ad-row ad-tour" href="#admin/turniere/${e(t.id)}">${gi(t.status === 'finished' ? 'trophy' : 'organigram', 'ad-tour-ic')}<span class="ad-row-main"><strong>${e(t.name)}</strong><small>${e(t.pool_label)} · Race to ${t.race_to} · ${t.players.length} Teilnehmer${t.event_id ? ' · aus Event' : ''}</small>${t.status === 'running' ? `<small>${t.rounds.flatMap(r => r.matches).filter(m => m.status === 'live').length} Partien laufen gerade</small>` : t.places ? `<small>Sieger: ${e(t.places[1][0].name)}${t.prizes_awarded ? ' · Preise vergeben' : ' · Preise offen'}</small>` : ''}</span><span class="ad-st ${TSTATUS[t.status][1]}">${TSTATUS[t.status][0]}</span></a>`;
    const by = st => d.tournaments.filter(t => t.status === st);
    return section('Turniere', `<p class="hint">K.-o.-System mit Setzliste nach Spielstärke, Freilosen und optionalem Spiel um Platz 3. ${owner ? 'Du legst Turniere an und vergibst die Preise; die Theke trägt Ergebnisse ein und weist Tische zu.' : 'Du kannst Ergebnisse eintragen und Tische zuweisen.'} Laufende Turniere erscheinen live auf dem Café-Bildschirm.</p>${owner ? '<button type="button" class="btn primary ad-wide" data-ad="tour-new">Neues Turnier</button>' : ''}`)
      + [['running', 'Läuft'], ['draft', 'In Vorbereitung'], ['finished', 'Beendet']].map(([st, n]) => by(st).length ? `<h3 class="ad-h3">${n}</h3><ul class="ad-list">${by(st).map(t => `<li>${card(t)}</li>`).join('')}</ul>` : '').join('');
  }
  function viewTournament(state, id) {
    const d = ad.tours; if (!d) return err('tours') || loadingBox('Turnier wird geladen …');
    const t = d.tournaments.find(x => x.id === id); if (!t) return '<div class="callout warning"><p>Turnier nicht gefunden.</p></div>';
    const owner = role(state) === 'owner', cat = ad.catalog?.catalog || [];
    const head = `<a class="back-link" href="#admin/turniere">← Turniere</a><div class="ad-tour-head"><div><p class="eyebrow">${e(t.pool_label)} · Race to ${t.race_to}${t.third_place ? ' · mit Spiel um Platz 3' : ''}</p><h2 class="ad-h">${e(t.name)}</h2></div><span class="ad-st ${TSTATUS[t.status][1]}">${TSTATUS[t.status][0]}</span></div>`;
    if (t.status === 'draft') {
      const inT = new Set(t.players.map(p => p.id));
      return head + section('Einstellungen', `<p class="hint">Setzliste: ${t.seeding === 'random' ? 'ausgelost' : 'nach Spielstärke – die Stärksten treffen erst spät aufeinander'}. ${t.event_id ? 'Verknüpft mit einem Event.' : ''}</p>${owner ? `<div class="ad-actions"><button type="button" class="btn" data-ad="tour-settings">Einstellungen ändern</button><button type="button" class="btn danger" data-ad="tour-del">Löschen</button></div>` : ''}`)
        + section(`Teilnehmer · ${t.players.length}`, `${t.event_id && owner ? '<button type="button" class="btn ad-wide" data-ad="tour-from-event">Angemeldete aus dem Event übernehmen</button>' : ''}<div class="ad-pick ad-mt">${d.players.map(p => `<button type="button" aria-pressed="${inT.has(p.id)}" ${owner ? `data-ad="tour-toggle" data-p="${e(p.id)}"` : 'disabled'}>${ui().pAvatar(p, '', 30)}<span>${e(p.name)}</span></button>`).join('')}</div>`)
        + prizeSection(t, owner, cat)
        + (owner ? section('Start', `<p class="hint">Beim Start entsteht der Turnierbaum. Bei ${t.players.length} Teilnehmern gibt es ${Math.max(0, 2 ** Math.ceil(Math.log2(Math.max(2, t.players.length))) - t.players.length)} Freilose für die Topgesetzten. Danach sind Teilnehmer und Einstellungen fest.</p><button type="button" class="btn primary ad-wide" data-ad="tour-start" ${t.players.length >= 3 ? '' : 'disabled'}>Turnier starten</button>`) : '');
    }
    return head
      + (t.status === 'running' ? section('Steuerung', `<div class="ad-actions"><button type="button" class="btn ${t.live_on_tv ? 'primary' : ''}" data-ad="tour-live" aria-pressed="${t.live_on_tv}">${gi('film-projector')} ${t.live_on_tv ? 'Live auf dem Café-TV' : 'Nicht auf dem Café-TV'}</button><a class="btn" href="#tv">Café-TV ansehen</a></div><p class="hint">Partie aufrufen: „Tisch zuweisen“ – sie erscheint dann als laufend auf dem Bildschirm. Ergebnis eintragen schiebt den Sieger automatisch weiter.</p>`) : '')
      + (t.places ? section('Platzierungen', ui().podium(t) + (t.prizes_awarded ? `<p class="ad-msg good">Preise vergeben am ${date(t.prizes_awarded.at, true)} von ${e(t.prizes_awarded.by)}.</p>` : owner ? `<button type="button" class="btn primary ad-wide" data-ad="tour-award">${gi('trophy')} Preise jetzt vergeben</button><p class="hint">Pokale/Medaillen landen in der Vitrine, Gutscheine im Bonusheft. Alle Platzierten werden benachrichtigt.</p>` : '<p class="hint">Die Preise vergibt der Inhaber.</p>')) : '')
      + section('Turnierbaum', ui().bracket(t, {admin: true}))
      + (t.status !== 'draft' && !t.prizes_awarded ? prizeSection(t, owner, cat) : '');
  }
  function prizeSection(t, owner, cat) {
    const name = id => cat.find(k => k.id === id)?.name;
    const pr = t.prizes || {};
    const line = pl => { const p = pr[pl] || {}; const parts = [name(p.catalog_id), name(p.voucher_id)].filter(Boolean); return `<li class="ad-row"><span class="ad-place p${pl}">${gi(pl === 1 ? 'podium-winner' : pl === 2 ? 'podium-second' : 'podium-third')}</span><span class="ad-row-main"><strong>Platz ${pl}</strong><small>${parts.length ? e(parts.join(' + ')) : 'kein Preis'}</small></span></li>`; };
    return owner ? section('Preise', `<ul class="ad-list">${[1, 2, 3].map(line).join('')}</ul><button type="button" class="btn ad-wide ad-mt" data-ad="tour-prizes">Preise festlegen</button>`) : '';
  }

  // ---------- Café-TV ----------
  const TV_ICONS = ['coffee-cup', 'stars-stack', 'trophy', 'present', 'calendar', 'megaphone', 'eight-ball', 'pool-triangle', 'ticket', 'crown'];
  const ICON_NAME = {'coffee-cup': 'Tasse', 'stars-stack': 'Sterne', trophy: 'Pokal', present: 'Geschenk', calendar: 'Kalender', megaphone: 'Megafon', 'eight-ball': 'Acht', 'pool-triangle': 'Kugel-Dreieck', ticket: 'Ticket', crown: 'Krone'};
  const tvURL = id => new URL((window.BCM_DEMO ? 'tv-demo.html' : 'tv.html') + '?bildschirm=' + encodeURIComponent(id), location.href.split('#')[0]).href;
  const slideName = (c, sl) => sl.custom ? (sl.title || (c.media.find(m => m.id === sl.media_id)?.name ?? 'Medium')) : c.builtin[sl.id];
  function viewTv(state) {
    const c = ad.tv; if (!c) return err('tv') || loadingBox('Café-TV wird geladen …');
    const owner = role(state) === 'owner', ann = c.announcement, tours = ad.tours?.tournaments || [];
    const MODE_IC = {rotation: 'film-projector', tournament: 'organigram', podium: 'podium-winner', slide: 'stars-stack'};
    const screen = sc => {
      const t = sc.tournament_id ? tours.find(x => x.id === sc.tournament_id) : null, sl = sc.slide_id ? c.slides.find(x => x.id === sc.slide_id) : null;
      return `<li class="ad-screen"><div class="ad-screen-head">${gi('laptop', 'ad-screen-ic')}<div><strong>${e(sc.name)}</strong><small>${e(sc.venue.name)} · zeigt: <b>${e(sc.mode_label)}</b>${t ? ` · ${e(t.name)}` : ''}${sl ? ` · ${e(slideName(c, sl))}` : ''}</small></div></div>
        <div class="ad-modes" role="group" aria-label="Anzeige von ${e(sc.name)}">${Object.entries(c.modes).map(([k, n]) => `<button type="button" data-ad="scr-mode" data-s="${e(sc.id)}" data-mode="${k}" aria-pressed="${sc.mode === k}">${gi(MODE_IC[k])}<span>${e(n)}</span></button>`).join('')}</div>
        <div class="ad-actions"><a class="btn small" href="#tv/${e(sc.id)}">Ansehen</a><button type="button" class="btn small" data-ad="scr-url" data-s="${e(sc.id)}">TV-Adresse</button>${owner ? `<button type="button" class="btn small" data-ad="scr-edit" data-s="${e(sc.id)}">Bearbeiten</button>${c.screens.length > 1 ? `<button type="button" class="btn small danger" data-ad="scr-del" data-s="${e(sc.id)}">Entfernen</button>` : ''}` : ''}</div></li>`;
    };
    const slideRow = (sl, i) => { const md = sl.media_id ? c.media.find(m => m.id === sl.media_id) : null; return `<li class="ad-row ad-slide ${sl.on ? '' : 'archived'}">${md ? `<span class="ad-thumb">${md.kind === 'video' ? gi('film-projector') : `<img src="${e(md.src)}" alt="">`}</span>` : gi(sl.custom ? sl.icon || 'stars-stack' : 'film-projector', 'ad-slide-ic')}<span class="ad-row-main"><strong>${e(slideName(c, sl))}</strong><small>${sl.custom ? (sl.text ? e(sl.text) : md ? (md.kind === 'video' ? 'Video' : 'Bild') + (md.sponsor ? ' · ' + e(md.sponsor) : '') : '') : 'automatisch aus der App'}</small></span>
      ${owner ? `<span class="ad-row-btns"><button type="button" class="btn small" data-ad="tv-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="nach oben">↑</button><button type="button" class="btn small" data-ad="tv-down" data-i="${i}" ${i === c.slides.length - 1 ? 'disabled' : ''} aria-label="nach unten">↓</button><button type="button" class="btn small ${sl.on ? 'primary' : ''}" data-ad="tv-toggle" data-id="${e(sl.id)}" aria-pressed="${sl.on}">${sl.on ? 'An' : 'Aus'}</button>${sl.custom ? `<button type="button" class="btn small" data-ad="tv-edit" data-id="${e(sl.id)}">Bearbeiten</button><button type="button" class="btn small danger" data-ad="tv-del" data-id="${e(sl.id)}">Löschen</button>` : ''}</span>` : ''}</li>`; };
    const mediaItem = m => `<li class="ad-media"><span class="ad-media-pic">${m.kind === 'video' ? `<video src="${e(m.src)}" muted preload="metadata"></video><i>${gi('film-projector')} Video</i>` : `<img src="${e(m.src)}" alt="">`}</span><span class="ad-media-main"><strong>${e(m.name)}</strong><small>${m.sponsor ? 'Sponsor: ' + e(m.sponsor) : m.kind === 'video' ? 'Video' : 'Bild'}${m.banner ? ' · <b class="ad-st done">Banner unten</b>' : ''}</small></span>
      <span class="ad-row-btns"><button type="button" class="btn small" data-ad="md-slide" data-id="${e(m.id)}">Als Folie</button>${m.kind === 'image' ? `<button type="button" class="btn small ${m.banner ? 'primary' : ''}" data-ad="md-banner" data-id="${e(m.id)}" aria-pressed="${m.banner}">Banner</button>` : ''}<button type="button" class="btn small danger" data-ad="md-del" data-id="${e(m.id)}">Löschen</button></span></li>`;
    return section('Bildschirme', `<p class="hint">Jeder Fernseher öffnet einmalig seine TV-Adresse im Browser – danach steuerst du hier, was er zeigt. ${owner ? '' : 'Neue Bildschirme legt der Inhaber an.'}</p><ul class="ad-screens">${c.screens.map(screen).join('')}</ul>${owner ? '<button type="button" class="btn ad-wide ad-mt" data-ad="scr-new">Bildschirm hinzufügen</button>' : ''}`)
      + section('Durchsage', `${ann ? `<div class="ad-ann">${gi('megaphone')}<div><strong>${e(ann.text)}</strong><small>läuft bis ${date(ann.until, true).split(', ').pop()} · ${e(ann.by)}</small></div><button type="button" class="btn small danger" data-ad="tv-ann-clear">Beenden</button></div>` : ''}
        <form class="ad-ann-form" data-adform="announce"><label class="field"><span>Text auf allen Bildschirmen</span><input id="ad-ann" name="text" maxlength="120" placeholder="z. B. Halbfinale startet an Tisch 2" autocomplete="off"></label>
        <label class="field"><span>Wie lange?</span><select name="minutes">${[[1, '1 Minute'], [3, '3 Minuten'], [5, '5 Minuten'], [10, '10 Minuten'], [30, '30 Minuten']].map(([v, n]) => `<option value="${v}" ${v === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="btn primary ad-wide" type="submit">${gi('megaphone')} Durchsage anzeigen</button></form>`)
      + (owner ? section('Bilder & Videos', `<p class="hint">Getränke, Speisekarte, Plakate, Sponsor-Videos oder -Banner. Bilder werden automatisch auf Full-HD verkleinert. Videos am besten als MP4 (H.264), Querformat, ohne Ton – das spielen alle Fernseher ab. Ein Bild als „Banner“ läuft unten auf allen Bildschirmen mit.</p>
        <label class="btn primary ad-wide nt-file">${gi('present')} Bild oder Video hochladen<input id="ad-media-file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"></label>
        ${c.media.length ? `<ul class="ad-list ad-mt">${c.media.map(mediaItem).join('')}</ul>` : empty('Noch keine Bilder oder Videos.')}`) : '')
      + section('Folien im Wechsel', `${owner ? '<p class="hint">Reihenfolge mit ↑ ↓, einzeln an- und ausschalten. Automatische Folien erscheinen nur, wenn es Inhalt gibt.</p>' : '<p class="hint">Folien und Einstellungen ändert der Inhaber.</p>'}
        <ul class="ad-list">${c.slides.map(slideRow).join('')}</ul>${owner ? '<button type="button" class="btn ad-wide ad-mt" data-ad="tv-new">Eigene Folie anlegen</button>' : ''}`)
      + section('Einstellungen', `<ul class="ad-kv"><li><span>Anzeigedauer pro Folie</span><b>${c.seconds} Sekunden</b></li><li><span>Laufzeile unten</span><b>${e(c.footer || '–')}</b></li></ul>${owner ? '<button type="button" class="btn ad-wide ad-mt" data-ad="tv-settings">Einstellungen ändern</button>' : ''}`);
  }

  // ---------- Tische & QR-Codes ----------
  const tableURL = t => location.href.split('#')[0] + '#tisch/' + encodeURIComponent(t.token);
  function qrSVG(text) {
    try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({cellSize: 8, margin: 2, scalable: true}); }
    catch { return ''; }
  }
  const venueName = id => (ad.venues?.venues || []).find(v => v.id === id)?.name || '';
  function tableCard(t) {
    const qr = qrSVG(tableURL(t));
    return `<article class="ad-qr-card">
      <header><span class="ad-qr-brand">${gi('eight-ball')}Billardcafé Merzig</span>${(ad.venues?.venues || []).find(v => v.id === t.venue_id && !v.main) ? `<span class="ad-qr-venue">${e(venueName(t.venue_id))}</span>` : ''}</header>
      <div class="ad-qr-code">${qr || '<p>QR-Bibliothek nicht geladen</p>'}</div>
      <strong class="ad-qr-no">Tisch ${t.no}</strong>${t.name ? `<span class="ad-qr-name">${e(t.name)}</span>` : ''}
      <p class="ad-qr-cta">Scannen · Partie eintragen · Rangliste</p>
      <p class="ad-qr-small">Ohne App-Download. Der Code enthält nur diesen Tisch – keine Standortabfrage.</p>
      <code class="ad-qr-id">${e(t.token)}</code>
    </article>`;
  }
  function viewTables(state) {
    const d = ad.tables; if (!d) return err('tables') || loadingBox('Tische werden geladen …');
    const owner = role(state) === 'owner', vs = venueList();
    const cur = ad.tableVenue && vs.some(v => v.id === ad.tableVenue) ? ad.tableVenue : mainVenue()?.id;
    const list = d.tables.filter(t => t.venue_id === cur).sort((a, b) => a.no - b.no);
    return section('Tische & QR-Codes', `<p class="hint">Jeder Tisch bekommt einen eigenen QR-Code zum Aufkleben oder Aufstellen. Gäste scannen ihn, sehen die Tischzeit und tragen ihre Partie direkt diesem Tisch zu. Der Code enthält nur ein zufälliges Kürzel – wird er abfotografiert oder beschädigt, erzeugst du einfach einen neuen.</p>
        ${vs.length > 1 ? `<div class="ad-chips">${vs.map(v => `<button type="button" data-ad="tvenue" data-v="${e(v.id)}" aria-pressed="${v.id === cur}">${gi(v.main ? 'house' : 'position-marker')} ${e(v.name)}</button>`).join('')}</div>` : ''}
        <div class="ad-actions">${owner ? '<button type="button" class="btn primary" data-ad="table-new">Neuer Tisch</button>' : ''}<button type="button" class="btn" data-ad="print-all" ${list.some(t => t.active) ? '' : 'disabled'}>Alle QR-Codes drucken</button></div>`)
      + `<ul class="ad-list">${list.map(t => `<li class="ad-row ad-table-row ${t.active ? '' : 'archived'}"><span class="ad-table-no ${t.status}">${t.no}</span><span class="ad-row-main"><strong>Tisch ${t.no}${t.name ? ` · ${e(t.name)}` : ''}</strong><small>${e(t.kind)} · ${t.sensor_id ? `Sensor ${e(t.sensor_id)}` : 'ohne Sensor'} · ${!t.active ? 'deaktiviert' : t.status === 'busy' ? `belegt seit ${new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit'}).format(new Date(t.since))} Uhr` : 'frei'}</small></span>
        <span class="ad-row-btns"><button type="button" class="btn small primary" data-ad="table-qr" data-id="${e(t.id)}" ${t.active ? '' : 'disabled'}>QR-Code</button>${owner ? `<button type="button" class="btn small" data-ad="table-edit" data-id="${e(t.id)}">Bearbeiten</button><button type="button" class="btn small" data-ad="table-code" data-id="${e(t.id)}">Neuer Code</button><button type="button" class="btn small" data-ad="table-toggle" data-id="${e(t.id)}">${t.active ? 'Deaktivieren' : 'Aktivieren'}</button>` : ''}</span></li>`).join('') || `<li>${empty('An diesem Standort sind noch keine Tische angelegt.')}</li>`}</ul>`;
  }
  function viewPrint() {
    const d = ad.tables; if (!d) return err('tables') || loadingBox('Wird vorbereitet …');
    const list = (ad.printIds ? d.tables.filter(t => ad.printIds.includes(t.id)) : d.tables.filter(t => t.venue_id === (ad.tableVenue || mainVenue()?.id))).filter(t => t.active).sort((a, b) => a.no - b.no);
    return `<div class="ad-print-ctrl"><a class="back-link" href="#admin/tische">← Tische</a><p class="hint">${list.length} ${list.length === 1 ? 'Karte' : 'Karten'} · vier pro A4-Seite (je 9 × 12 cm). Tipp: auf festem Papier drucken und laminieren oder in einen Tischaufsteller stecken.</p><button type="button" class="btn primary ad-wide" data-ad="print-now">Drucken</button></div>
      <div class="ad-print">${list.map(tableCard).join('')}</div>`;
  }

  // ---------- Orte ----------
  function viewVenues() {
    const list = ad.venues?.venues;
    if (!list) return err('venues') || loadingBox('Orte werden geladen …');
    return section('Orte', `<p class="hint">Events und Gutscheine können an einen Standort gebunden werden – etwa wenn ein Turnier umzieht oder ein Gutschein nur in einem Lokal gilt. Ohne Angabe gilt das Stammhaus bzw. alle Standorte.</p><button type="button" class="btn primary ad-wide" data-ad="venue-new">Neuen Ort anlegen</button>`)
      + `<ul class="ad-list">${list.map(v => `<li class="ad-row ${v.archived ? 'archived' : ''}"><span class="ad-venue-ic">${gi(v.main ? 'house' : 'position-marker')}</span><span class="ad-row-main"><strong>${e(v.name)}${v.main ? ' <span class="badge confirmed">Stammhaus</span>' : ''}</strong><small>${e(v.address)}</small>${v.note ? `<small>${e(v.note)}</small>` : ''}</span><span class="ad-row-btns"><button type="button" class="btn small" data-ad="venue-edit" data-id="${e(v.id)}">Bearbeiten</button>${v.main ? '' : `<button type="button" class="btn small" data-ad="venue-archive" data-id="${e(v.id)}">${v.archived ? 'Reaktivieren' : 'Archivieren'}</button>`}</span></li>`).join('')}</ul>`;
  }

  // ---------- Wochenaufgaben ----------
  function viewQuests() {
    const d = ad.quests;
    if (!d) return err('quests') || loadingBox('Wochenaufgaben werden geladen …');
    const desc = q => q.type === 'pool' ? `${q.goal}× ${d.pools[q.pool]}` : q.type === 'weekday' ? `${q.goal}× am ${d.weekdays[q.weekday]}` : `${d.types[q.type]} · Ziel ${q.goal}`;
    return section('Wochenaufgaben', `<p class="hint">Gelten für alle Spieler, jede erledigte Aufgabe bringt einen Stempel. Höchstens fünf gleichzeitig. Tipp: Aufgaben für ruhige Wochentage füllen den Laden.</p>${d.quests.length < 5 ? '<button type="button" class="btn primary ad-wide" data-ad="quest-new">Neue Aufgabe</button>' : ''}`)
      + `<ul class="ad-list">${d.quests.map(q => `<li class="ad-row"><span class="fx-check" aria-hidden="true"></span><span class="ad-row-main"><strong>${e(q.title)}</strong><small>${e(q.text)}</small><small>${e(desc(q))}</small></span><span class="ad-row-btns"><button type="button" class="btn small" data-ad="quest-edit" data-id="${e(q.id)}">Bearbeiten</button><button type="button" class="btn small danger" data-ad="quest-del" data-id="${e(q.id)}" data-name="${e(q.title)}">Löschen</button></span></li>`).join('')}</ul>`;
  }

  // ---------- Protokoll ----------
  function auditList(list) {
    return `<ol class="ad-audit">${list.map(a => `<li><span class="ad-audit-dot"></span><div><strong>${e(a.label)}</strong>${a.player_name ? ` · <a href="#admin/spieler/${e(a.player_id)}">${e(a.player_name)}</a>` : ''}${a.detail ? `<small>${e(a.detail)}</small>` : ''}${a.reason ? `<small class="ad-reason">„${e(a.reason)}“</small>` : ''}<small class="ad-meta">${date(a.at, true)} · ${e(a.actor)} (${e(ROLE[a.role] || a.role)})</small></div></li>`).join('')}</ol>`;
  }
  function viewAudit() {
    const filters = [['', 'Alle'], ['award', 'Auszeichnungen'], ['month', 'Monatsabschluss'], ['voucher', 'Gutscheine'], ['match', 'Partien'], ['stamps', 'Stempel'], ['block', 'Sperren']];
    const list = ad.audit?.audit;
    return section('Protokoll', `<p class="hint">Jede Aktion des Cafés mit Zeit, Person und Begründung. Nicht löschbar.</p><div class="ad-chips">${filters.map(([k, n]) => `<button type="button" data-ad="afilter" data-f="${k}" aria-pressed="${ad.auditFilter === k}">${n}</button>`).join('')}</div>
      ${err('audit')}${!list ? loadingBox('Protokoll wird geladen …') : list.length ? auditList(list) : empty('Noch keine Einträge in dieser Auswahl.')}`);
  }

  // ---------- Ansicht ----------
  function view(state, r) {
    const rl = role(state);
    if (!rl) return `<div class="narrow"><div class="empty-state"><p class="eyebrow">Café-Verwaltung</p><h1>Kein Zugriff</h1><p>Dieser Bereich ist nur für Inhaber und Personal. Melde dich mit dem Café-Konto an.</p>${document.querySelector('[data-demo-as]') ? '<p class="hint">Demo: Oben im Prototyp-Balken auf „Inhaber“ oder „Theke“ wechseln.</p>' : ''}<a class="btn primary" href="#profil">Zur Anmeldung</a></div></div>`;
    const s = r.section || 'uebersicht';
    const allowed = SECTIONS.find(([k]) => k === s)?.[2].includes(rl);
    if (!allowed) return shell(state, r, '<div class="callout warning"><p>Dieser Bereich ist nur für den Inhaber.</p></div>');
    const body = s === 'uebersicht' ? viewOverview(state) : s === 'monat' ? viewMonth() : s === 'spieler' ? (r.id ? viewPlayer(r) : viewPlayers()) : s === 'gutscheine' ? (r.id === 'neu' ? (rl === 'owner' ? viewIssue() : '<div class="callout warning"><p>Gutscheine verteilen kann nur der Inhaber.</p></div>') : viewVouchers()) : s === 'streit' ? viewDisputes(state) : s === 'katalog' ? viewCatalog() : s === 'events' ? viewEvents() : s === 'turniere' ? (r.id ? viewTournament(state, r.id) : viewTournaments(state)) : s === 'tv' ? viewTv(state) : s === 'orte' ? viewVenues() : s === 'tische' ? (r.id === 'druck' ? viewPrint() : viewTables(state)) : s === 'aufgaben' ? viewQuests() : viewAudit();
    return shell(state, r, body) + '<dialog id="ad-dialog" class="fx-dialog ad-dialog" aria-labelledby="ad-dialog-title"></dialog>';
  }

  // ---------- Dialog mit Formular ----------
  let dlgSubmit = null, dlgFields = [];
  function field(f) {
    const id = 'adf-' + f.id;
    const common = `id="${id}" name="${f.id}" ${f.required ? 'required' : ''}`;
    let input;
    if (f.type === 'select') input = `<select ${common}>${f.options.map(([v, l]) => `<option value="${e(v)}" ${String(f.value ?? '') === String(v) ? 'selected' : ''}>${e(l)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') input = `<textarea ${common} maxlength="${f.max || 300}" rows="3" placeholder="${e(f.placeholder || '')}">${e(f.value || '')}</textarea>`;
    else input = `<input ${common} type="${f.type || 'text'}" value="${e(f.value ?? '')}" ${f.min != null ? `min="${f.min}"` : ''} ${f.maxv != null ? `max="${f.maxv}"` : ''} ${f.step ? `step="${f.step}"` : ''} placeholder="${e(f.placeholder || '')}" autocomplete="off">`;
    return `<label class="field" data-field="${f.id}"><span>${e(f.label)}</span>${input}${f.hint ? `<small class="hint">${e(f.hint)}</small>` : ''}</label>`;
  }
  function applyShowIf() {
    const dlg = document.querySelector('#ad-dialog'); if (!dlg) return;
    const vals = Object.fromEntries([...dlg.querySelectorAll('[name]')].map(el => [el.name, el.value]));
    dlgFields.forEach(f => { if (f.showIf) dlg.querySelector(`[data-field="${f.id}"]`).hidden = !f.showIf(vals); });
  }
  function openForm({title, intro = '', fields = [], submit = 'Speichern', danger = false, onSubmit}) {
    const dlg = document.querySelector('#ad-dialog'); if (!dlg) return;
    dlgFields = fields; dlgSubmit = onSubmit;
    dlg.innerHTML = `<form class="fx-dialog-body" data-adform="dialog" novalidate><h2 id="ad-dialog-title">${e(title)}</h2>${intro ? `<div class="ad-intro">${intro}</div>` : ''}${fields.map(field).join('')}<p class="ad-msg bad" id="ad-dialog-error" role="alert" hidden></p><div class="ad-actions"><button type="button" class="btn" data-ad="dialog-close">Abbrechen</button><button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${e(submit)}</button></div></form>`;
    applyShowIf();
    dlg.showModal();
    dlg.querySelector('input,select,textarea')?.focus();
  }
  const reasonField = (label = 'Begründung', hint = 'Steht im Protokoll und wird dem Spieler angezeigt.') => ({id: 'reason', label, type: 'textarea', required: true, placeholder: 'kurz und sachlich', hint});

  // ---------- Klicks ----------
  async function act(fn, success) {
    try { await fn(); if (success) app().notify(success); await reload(); }
    catch (er) { app().notify(er.message, true); }
  }
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-ad]');
    if (!el) return;
    const a = el.dataset.ad, r = app().route(), w = app().write;
    if (a === 'dialog-close') { el.closest('dialog')?.close(); return; }
    if (a === 'issue-go') {
      el.disabled = true;
      try { ad.issueResult = await w('/admin/vouchers/issue', issueBody(), 'issue:' + JSON.stringify(issueBody())); app().notify(ad.issueResult.vouchers.every(v => !v.player_id) ? 'Codes erstellt.' : 'Gutscheine verteilt. Die Spieler werden benachrichtigt.'); app().render(); window.scrollTo(0, 0); }
      catch (er) { app().notify(er.message, true); el.disabled = false; }
      return;
    }
    if (a === 'issue-again') { ad.issueResult = null; ad.issue = null; await reload(); return; }
    if (a === 'issue-done') { ad.issueResult = null; ad.issue = null; return; }
    if (a === 'copy' || a === 'copy-all') {
      const text = a === 'copy' ? el.dataset.code : ad.issueResult.vouchers.map(v => v.code).join('\n');
      try { await navigator.clipboard.writeText(text); app().notify(a === 'copy' ? 'Code kopiert.' : 'Alle Codes kopiert.'); }
      catch { const ta = document.querySelector('#adi-codes'); if (ta) { ta.focus(); ta.select(); } app().notify('Kopieren ist hier gesperrt – die Codes sind unten markiert.', true); }
      return;
    }
    if (a === 'vstatus') { ad.voucherStatus = el.dataset.v; ad.vouchers = null; app().render(); await reload(); return; }
    if (a === 'afilter') { ad.auditFilter = el.dataset.f; ad.audit = null; app().render(); await reload(); return; }
    if (a === 'month') { ad.month = el.dataset.m; ad.close = null; app().render(); await reload(); return; }
    if (a === 'redeem') {
      el.disabled = true;
      try { const res = await w(`/admin/vouchers/${encodeURIComponent(el.dataset.code)}/redeem`, {venue_id: ad.counter || mainVenue()?.id || ''}, 'redeem:' + el.dataset.code); ad.lookup = res.voucher; app().notify('Eingelöst. Jetzt den Rabatt in der Kasse buchen.'); }
      catch (er) { ad.lookupError = er.message; }
      await reload(); return;
    }
    const month = ad.close?.month, item = key => ad.close?.items.find(i => i.key === key);
    if (a === 'approve') return act(() => w('/admin/month-close/decide', {month, key: el.dataset.key, decision: 'approve'}, 'mc:' + month + el.dataset.key), `Bestätigt: ${item(el.dataset.key).award.name} für ${item(el.dataset.key).player.name}.`);
    if (a === 'approve-all') return openForm({title: 'Alle Vorschläge bestätigen', intro: `<p>Alle offenen Auszeichnungen für ${e(ad.close.label)} werden vergeben. Jeder Gewinner bekommt Pokal oder Medaille, den Titel und seinen Gutschein.</p>`, fields: [{id: 'reason', label: 'Notiz (optional)', type: 'textarea'}], submit: 'Alle bestätigen',
      onSubmit: v => w('/admin/month-close/approve-all', {month, reason: v.reason}, 'mc-all:' + month).then(() => app().notify('Monatsabschluss bestätigt. Die Spieler werden benachrichtigt.'))});
    if (a === 'reject') { const it = item(el.dataset.key); return openForm({title: 'Vorschlag ablehnen', intro: `<p>${e(it.label)} geht in diesem Monat an niemanden.</p>`, fields: [reasonField()], submit: 'Ablehnen', danger: true,
      onSubmit: v => w('/admin/month-close/decide', {month, key: it.key, decision: 'reject', reason: v.reason}, 'mc-rej:' + month + it.key)}); }
    if (a === 'swap') {
      const it = item(el.dataset.key);
      const busy = new Set(ad.close.items.filter(x => x !== it && x.player && x.status !== 'rejected').map(x => x.player.id));
      const free = it.candidates.filter(c => c.id !== it.player?.id && !busy.has(c.id));
      if (!free.length) { app().notify('Alle weiteren Kandidaten haben in diesem Monat schon eine Auszeichnung. Lehne zuerst deren Vorschlag ab oder diesen hier.', true); return; }
      return openForm({title: 'Anderen Spieler wählen', intro: `<p>${e(it.label)}. Zur Auswahl stehen nur Spieler ohne andere Auszeichnung in diesem Monat.</p>`, fields: [{id: 'player_id', label: 'Spieler', type: 'select', options: free.map(c => [c.id, `${c.name}${c.points != null ? ` (${c.points})` : ''}`])}, reasonField()], submit: 'Vergeben',
      onSubmit: v => w('/admin/month-close/decide', {month, key: it.key, decision: 'swap', player_id: v.player_id, reason: v.reason}, 'mc-swap:' + month + it.key + v.player_id)}); }
    // Spieler-Aktionen
    const pid = ad.player?.player.id, path = c => `/admin/players/${encodeURIComponent(pid)}/${c}`;
    const done = res => { if (res?.player) ad.player = res; };
    if (a === 'award') { const opts = (ad.catalog?.catalog || []).filter(k => !k.archived && k.kind !== 'gutschein'); return openForm({title: 'Auszeichnung verleihen', fields: [{id: 'catalog_id', label: 'Auszeichnung', type: 'select', options: opts.map(k => [k.id, `${k.name} · ${KIND[k.kind]}${k.tier ? ' ' + TIER[k.tier] : ''}`])}, reasonField('Wofür?')], submit: 'Verleihen',
      onSubmit: v => w(path('award'), v, 'award:' + pid + v.catalog_id + v.reason).then(done).then(() => app().notify('Verliehen. Der Spieler sieht es beim nächsten Öffnen der App.'))}); }
    if (a === 'voucher') { const opts = (ad.catalog?.catalog || []).filter(k => !k.archived && k.kind === 'gutschein'); return openForm({title: 'Gutschein ausstellen', fields: [{id: 'catalog_id', label: 'Gutschein', type: 'select', options: opts.map(k => [k.id, `${k.name} · ${k.valid_days} Tage`])}, reasonField('Anlass')], submit: 'Ausstellen',
      onSubmit: v => w(path('voucher'), v, 'voucher:' + pid + v.catalog_id + v.reason).then(done).then(() => app().notify('Gutschein ausgestellt.'))}); }
    if (a === 'stamps') return openForm({title: 'Stempel ändern', intro: `<p>Aktuell ${ad.player.stamps}/10 Stempel.</p>`, fields: [{id: 'delta', label: 'Änderung', type: 'number', value: 1, min: -10, maxv: 10, step: 1, hint: 'z. B. 2 oder -1'}, reasonField()], submit: 'Übernehmen',
      onSubmit: v => w(path('stamps'), {delta: Number(v.delta), reason: v.reason}, 'stamps:' + pid + v.delta + v.reason).then(done)});
    if (a === 'pin') return openForm({title: 'PIN zurücksetzen', intro: '<p>Es entsteht ein Einmal-Code, mit dem der Spieler eine neue PIN wählt. Gib ihn nur persönlich an der Theke weiter – nach Ausweis oder wenn du die Person kennst.</p>', fields: [reasonField('Begründung', 'Steht im Protokoll.')], submit: 'Code erzeugen',
      onSubmit: v => w(path('pin-reset'), v, 'pin:' + pid + Date.now()).then(res => { done(res); ad.reset = {pid, ...res.reset}; })});
    if (a === 'block') { const on = el.dataset.blocked === '1'; return openForm({title: on ? 'Profil sperren' : 'Sperre aufheben', intro: on ? '<p>Gesperrte Spieler können sich nicht anmelden und erscheinen nicht in Rangliste und Monatsabschluss. Partien bleiben erhalten.</p>' : '', fields: [reasonField()], submit: on ? 'Sperren' : 'Aufheben', danger: on,
      onSubmit: v => w(path('block'), {blocked: on, reason: v.reason}, 'block:' + pid + on + v.reason).then(done)}); }
    if (a === 'merge') { const others = (ad.players?.players || []).filter(p => p.id !== pid); return openForm({title: 'Doppelprofil zusammenführen', intro: `<p><strong>${e(ad.player.player.name)}</strong> wird in das gewählte Profil übernommen: Partien, Auszeichnungen, Gutscheine und Stempel. Das alte Profil verschwindet. Nur für Personen, die versehentlich zwei Profile angelegt haben.</p>`, fields: [{id: 'into_id', label: 'Behalten wird', type: 'select', options: others.map(p => [p.id, `${p.name} (${p.games} Partien)`])}, reasonField('Begründung', 'Steht im Protokoll.')], submit: 'Zusammenführen', danger: true,
      onSubmit: v => w(path('merge'), v, 'merge:' + pid + v.into_id).then(res => { location.hash = '#admin/spieler/' + encodeURIComponent(res.player.id); })}); }
    if (a === 'photo-remove') return openForm({title: 'Profilbild entfernen', intro: '<p>Das Foto wird gelöscht, der Spieler erscheint wieder mit seiner Kugel und bekommt die Begründung.</p>', fields: [reasonField()], submit: 'Entfernen', danger: true,
      onSubmit: v => w(path('remove-photo'), v, 'photo:' + pid + Date.now()).then(done)});
    if (a === 'revoke') return openForm({title: 'Auszeichnung entziehen', intro: `<p>„${e(el.dataset.name)}“ verschwindet aus Vitrine und Titelauswahl. Der Spieler wird mit Begründung informiert.</p>`, fields: [reasonField()], submit: 'Entziehen', danger: true,
      onSubmit: v => w(path('revoke'), {honor_id: el.dataset.id, reason: v.reason}, 'revoke:' + pid + el.dataset.id).then(done)});
    // Streitfälle
    if (a === 'resolve-accept') return openForm({title: 'Vorschlag bestätigen', intro: `<p>Das Ergebnis ${e(el.dataset.a)}:${e(el.dataset.b)} wird gewertet.</p>`, fields: [reasonField('Begründung', 'z. B. „Mit beiden gesprochen“. Beide Spieler sehen sie.')], submit: 'Bestätigen',
      onSubmit: v => w(`/admin/matches/${encodeURIComponent(el.dataset.id)}/resolve`, {score_a: Number(el.dataset.a), score_b: Number(el.dataset.b), reason: v.reason}, 'res:' + el.dataset.id)});
    if (a === 'resolve') { const m = ad.disputed.matches.find(x => x.id === el.dataset.id); return openForm({title: 'Ergebnis festlegen', fields: [{id: 'score_a', label: m.teams[0].map(p => p.name).join(' & '), type: 'number', min: 0, maxv: 7, value: ''}, {id: 'score_b', label: m.teams[1].map(p => p.name).join(' & '), type: 'number', min: 0, maxv: 7, value: ''}, reasonField()], submit: 'Ergebnis werten',
      onSubmit: v => w(`/admin/matches/${encodeURIComponent(m.id)}/resolve`, {score_a: Number(v.score_a), score_b: Number(v.score_b), reason: v.reason}, 'res:' + m.id + v.score_a + v.score_b)}); }
    if (a === 'void') return openForm({title: 'Partie annullieren', intro: '<p>Die Partie zählt nicht für Wertung, Liga und Erfolge. Sie bleibt im Verlauf sichtbar.</p>', fields: [reasonField()], submit: 'Annullieren', danger: true,
      onSubmit: v => w(`/admin/matches/${encodeURIComponent(el.dataset.id)}/void`, {reason: v.reason}, 'void:' + el.dataset.id)});
    // Katalog
    if (a === 'archive') return act(() => w(`/admin/catalog/${encodeURIComponent(el.dataset.id)}/archive`, {}, 'arch:' + el.dataset.id + Date.now()));
    if (a === 'cat-new') return openForm({title: 'Neue Vorlage', fields: [
      {id: 'name', label: 'Name', required: true, placeholder: 'z. B. Turniersieger 8-Ball'},
      {id: 'kind', label: 'Art', type: 'select', value: 'pokal', options: Object.entries(KIND)},
      {id: 'tier', label: 'Metall', type: 'select', value: '3', options: [['3', 'Gold'], ['2', 'Silber'], ['1', 'Bronze']], showIf: v => v.kind !== 'gutschein'},
      {id: 'valid_days', label: 'Gültig (Tage)', type: 'number', value: 90, min: 7, maxv: 365, showIf: v => v.kind === 'gutschein'},
      {id: 'venue_id', label: 'Gültig in', type: 'select', value: '', options: [['', 'Allen Standorten'], ...venueList().map(v => [v.id, 'nur ' + v.name])], showIf: v => v.kind === 'gutschein' && venueList().length > 1},
      {id: 'sponsor', label: 'Sponsor (optional)', placeholder: 'z. B. Getränkelieferant'},
      {id: 'description', label: 'Beschreibung (optional)', type: 'textarea', max: 140}], submit: 'Anlegen',
      onSubmit: v => w('/admin/catalog', v, 'cat:' + v.name + v.kind)});
    // Events
    if (a === 'event-new' || a === 'event-edit') {
      const ev = a === 'event-edit' ? ad.events.events.find(x => x.id === el.dataset.id) : {};
      const local = ev.starts_at ? new Date(new Date(ev.starts_at).getTime() - new Date(ev.starts_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      return openForm({title: ev.id ? 'Event bearbeiten' : 'Neues Event', fields: [
        {id: 'type', label: 'Art', type: 'select', value: ev.type || 'Turnier', options: ['Turnier', 'Einsteigerabend', 'Doppel', 'Siegerehrung', 'Aktion'].map(x => [x, x])},
        {id: 'title', label: 'Titel', value: ev.title, required: true},
        {id: 'starts_at', label: 'Beginn', type: 'datetime-local', value: local, required: true},
        {id: 'venue_id', label: 'Standort', type: 'select', value: ev.venue_id || mainVenue()?.id || '', options: venueList().map(v => [v.id, v.main ? `${v.name} (Stammhaus)` : v.name]), hint: ev.id ? 'Ändert sich der Standort, bekommen alle Angemeldeten eine Nachricht.' : ''},
        {id: 'venue_note', label: 'Hinweis zum Ort (optional)', value: ev.venue_note, placeholder: 'z. B. Ausweichort wegen Renovierung'},
        {id: 'place', label: 'Tische', value: ev.place, placeholder: 'z. B. Tische 1–4'},
        {id: 'price', label: 'Preis', value: ev.price, placeholder: 'z. B. 10 € Startgeld'},
        {id: 'capacity', label: 'Plätze (leer = ohne Anmeldung)', type: 'number', value: ev.capacity ?? '', min: 2, maxv: 64},
        {id: 'sponsor', label: 'Sponsor (optional)', value: ev.sponsor},
        {id: 'description', label: 'Beschreibung', type: 'textarea', value: ev.description, max: 300}], submit: 'Speichern',
        onSubmit: v => w('/admin/events', {...v, id: ev.id, starts_at: v.starts_at ? new Date(v.starts_at).toISOString() : ''}, 'ev:' + (ev.id || 'new') + v.title + v.starts_at)});
    }
    if (a === 'event-del') return openForm({title: 'Event löschen', intro: `<p>„${e(el.dataset.name)}“ wird entfernt. Angemeldete Spieler sollten Bescheid bekommen.</p>`, submit: 'Löschen', danger: true,
      onSubmit: () => w(`/admin/events/${encodeURIComponent(el.dataset.id)}/delete`, {}, 'evdel:' + el.dataset.id)});
    // Turniere
    const tour = () => ad.tours?.tournaments.find(x => x.id === r.id);
    const tw = (c, body, key) => w(`/admin/tournaments/${encodeURIComponent(r.id)}/${c}`, body, key);
    const tourDone = res => { if (res?.tournament && ad.tours) { const i = ad.tours.tournaments.findIndex(x => x.id === res.tournament.id); if (i >= 0) ad.tours.tournaments[i] = res.tournament; } };
    if (a === 'tour-new') return openForm({title: 'Neues Turnier', fields: [
      {id: 'name', label: 'Name', required: true, placeholder: 'z. B. 8-Ball Winter-Cup'},
      {id: 'pool', label: 'Disziplin', type: 'select', value: '8-single', options: Object.entries(ad.tours?.pools || {}).filter(([k]) => k !== '8-double')},
      {id: 'race_to', label: 'Ausspielziel (Race to)', type: 'number', value: 3, min: 1, maxv: 11},
      {id: 'event_id', label: 'Zu einem Event? (optional)', type: 'select', value: '', options: [['', 'Kein Event'], ...(ad.tours?.events || []).map(ev => [ev.id, `${ev.title} · ${date(ev.starts_at)}`])], hint: 'Angemeldete werden direkt als Teilnehmer übernommen.'},
      {id: 'seeding', label: 'Setzliste', type: 'select', value: 'rating', options: [['rating', 'Nach Spielstärke'], ['random', 'Auslosen']]},
      {id: 'third_place', label: 'Spiel um Platz 3', type: 'select', value: '1', options: [['1', 'ja'], ['0', 'nein']]}], submit: 'Anlegen',
      onSubmit: v => w('/admin/tournaments', v, 'tour:' + v.name + Date.now()).then(res => { location.hash = '#admin/turniere/' + res.tournament.id; })});
    if (a === 'tour-settings') { const t = tour(); return openForm({title: 'Einstellungen', fields: [
      {id: 'name', label: 'Name', value: t.name, required: true},
      {id: 'race_to', label: 'Ausspielziel (Race to)', type: 'number', value: t.race_to, min: 1, maxv: 11},
      {id: 'seeding', label: 'Setzliste', type: 'select', value: t.seeding, options: [['rating', 'Nach Spielstärke'], ['random', 'Auslosen']]},
      {id: 'third_place', label: 'Spiel um Platz 3', type: 'select', value: t.third_place ? '1' : '0', options: [['1', 'ja'], ['0', 'nein']]}], submit: 'Speichern',
      onSubmit: v => tw('settings', v, 'tset:' + r.id + JSON.stringify(v)).then(tourDone)}); }
    if (a === 'tour-toggle') return act(() => tw('players', {toggle: el.dataset.p}, 'tpl:' + r.id + el.dataset.p + Date.now()).then(tourDone));
    if (a === 'tour-from-event') return act(() => tw('players', {from_event: true}, 'tev:' + r.id + Date.now()).then(tourDone), 'Angemeldete übernommen.');
    if (a === 'tour-start') return openForm({title: 'Turnier starten', intro: `<p>${tour().players.length} Teilnehmer. Der Turnierbaum wird erstellt, alle Teilnehmer werden benachrichtigt.</p>`, submit: 'Jetzt starten',
      onSubmit: () => tw('start', {}, 'tstart:' + r.id).then(tourDone).then(() => app().notify('Turnier gestartet – viel Erfolg!'))});
    if (a === 'tour-del') return openForm({title: 'Turnier löschen', intro: `<p>„${e(tour().name)}“ wird entfernt.</p>`, submit: 'Löschen', danger: true, onSubmit: () => tw('delete', {}, 'tdel:' + r.id).then(() => { location.hash = '#admin/turniere'; })});
    if (a === 'tour-live') return act(() => tw('live', {}, 'tlive:' + r.id + Date.now()).then(tourDone));
    if (a === 'tour-award') return openForm({title: 'Preise vergeben', intro: '<p>Die hinterlegten Pokale, Medaillen und Gutscheine gehen an die Platzierten. Das lässt sich nicht rückgängig machen – einzelne Auszeichnungen kannst du später beim Spieler entziehen.</p>', fields: [{id: 'reason', label: 'Notiz (optional)', type: 'textarea'}], submit: 'Preise vergeben',
      onSubmit: v => tw('award', v, 'taward:' + r.id).then(tourDone).then(() => app().notify('Preise vergeben. Die Gewinner werden benachrichtigt.'))});
    if (a === 'tour-prizes') { const t = tour(), cat = (ad.catalog?.catalog || []).filter(k => !k.archived); const aw = [['', 'keine Auszeichnung'], ...cat.filter(k => k.kind !== 'gutschein').map(k => [k.id, `${k.name} (${KIND[k.kind]}${k.tier ? ' ' + TIER[k.tier] : ''})`])], vo = [['', 'kein Gutschein'], ...cat.filter(k => k.kind === 'gutschein').map(k => [k.id, k.name])];
      return openForm({title: 'Preise festlegen', intro: '<p>Neue Pokale oder Gutscheine legst du unter „Belohnungen“ an.</p>', fields: [1, 2, 3].flatMap(pl => [{id: `p${pl}_award`, label: `Platz ${pl}: Auszeichnung`, type: 'select', value: t.prizes?.[pl]?.catalog_id || '', options: aw}, {id: `p${pl}_voucher`, label: `Platz ${pl}: Gutschein`, type: 'select', value: t.prizes?.[pl]?.voucher_id || '', options: vo}]), submit: 'Speichern',
        onSubmit: v => tw('prizes', v, 'tpr:' + r.id + JSON.stringify(v)).then(tourDone)}); }
    const tm = () => { const t = tour(); return [...t.rounds.flatMap(x => x.matches), t.third].find(m => m && m.id === el.dataset.m); };
    if (a === 'tm-result') { const m = tm(), t = tour(); return openForm({title: 'Ergebnis eintragen', intro: `<p>Race to ${t.race_to}: Wer ${t.race_to} Spiele gewinnt, ist weiter.</p>`, fields: [{id: 'score_a', label: m.a.name, type: 'number', min: 0, maxv: t.race_to, value: ''}, {id: 'score_b', label: m.b.name, type: 'number', min: 0, maxv: t.race_to, value: ''}], submit: 'Eintragen',
      onSubmit: v => tw('result', {match_id: m.id, score_a: Number(v.score_a), score_b: Number(v.score_b)}, 'tres:' + r.id + m.id + v.score_a + v.score_b).then(res => { tourDone(res); if (res.tournament.status === 'finished') app().notify('Finale entschieden! Jetzt die Preise vergeben.'); })}); }
    if (a === 'tm-table') { const m = tm(); return openForm({title: `Tisch für ${m.a.name} – ${m.b.name}`, fields: [{id: 'table_no', label: 'Tischnummer (leer = noch keiner)', type: 'number', min: 1, maxv: 99, value: m.table_no ?? ''}], submit: 'Speichern',
      onSubmit: v => tw('table', {match_id: m.id, table_no: v.table_no}, 'ttab:' + r.id + m.id + v.table_no).then(tourDone)}); }
    if (a === 'tm-reset') { const m = tm(); return openForm({title: 'Ergebnis zurücksetzen', intro: `<p>${e(m.a.name)} ${m.score_a}:${m.score_b} ${e(m.b.name)} wird gelöscht. Geht nur, solange die nächste Runde noch nicht gespielt ist.</p>`, fields: [reasonField()], submit: 'Zurücksetzen', danger: true,
      onSubmit: v => tw('reset', {match_id: m.id, reason: v.reason}, 'trs:' + r.id + m.id + Date.now()).then(tourDone)}); }
    // Café-TV
    const tvw = (path, body, key) => w('/admin/tv/' + path, body, key).then(res => { ad.tv = res; });
    if (a === 'tv-ann-clear') return act(() => tvw('announce/clear', {}, 'tvac:' + Date.now()), 'Durchsage beendet.');
    if (a === 'tv-toggle') return act(() => tvw('slides', {toggle: el.dataset.id}, 'tvt:' + el.dataset.id + Date.now()));
    if (a === 'tv-up' || a === 'tv-down') { const ids = ad.tv.slides.map(x => x.id), i = Number(el.dataset.i), j = a === 'tv-up' ? i - 1 : i + 1; [ids[i], ids[j]] = [ids[j], ids[i]]; return act(() => tvw('slides', {order: ids}, 'tvo:' + ids.join() + Date.now())); }
    if (a === 'tv-del') return act(() => tvw('slides', {delete: el.dataset.id}, 'tvd:' + el.dataset.id), 'Folie gelöscht.');
    if (a === 'tv-new' || a === 'tv-edit') { const sl = a === 'tv-edit' ? ad.tv.slides.find(x => x.id === el.dataset.id) : {icon: 'coffee-cup'}; const imgs = ad.tv.media; return openForm({title: sl.id ? 'Folie bearbeiten' : 'Eigene Folie', intro: '<p>Zum Beispiel Getränk der Woche mit Foto, Happy Hour, Turnier-Anmeldung oder ein Sponsor.</p>', fields: [
      {id: 'title', label: 'Überschrift', value: sl.title, placeholder: 'z. B. Getränk der Woche'},
      {id: 'text', label: 'Text (groß)', type: 'textarea', value: sl.text, max: 200, placeholder: 'z. B. Hausgemachte Limo · 0,4 l · 3,20 €'},
      {id: 'media_id', label: 'Bild oder Video (optional)', type: 'select', value: sl.media_id || '', options: [['', 'kein Bild – Symbol verwenden'], ...imgs.map(m => [m.id, `${m.name} (${m.kind === 'video' ? 'Video' : 'Bild'})`])], hint: imgs.length ? 'Eigene Bilder lädst du unter „Bilder & Videos“ hoch.' : 'Noch keine Bilder hochgeladen – das geht unter „Bilder & Videos“.'},
      {id: 'icon', label: 'Symbol', type: 'select', value: sl.icon || 'coffee-cup', options: TV_ICONS.map(x => [x, ICON_NAME[x]]), showIf: v => !v.media_id}], submit: 'Speichern',
      onSubmit: v => tvw('slides', {custom: {...v, id: sl.id}}, 'tvc:' + (sl.id || 'new') + v.title + v.media_id)}); }
    if (a === 'tv-settings') { const c = ad.tv; return openForm({title: 'Café-TV einstellen', fields: [
      {id: 'seconds', label: 'Sekunden pro Folie', type: 'number', value: c.seconds, min: 5, maxv: 60, hint: 'Videos laufen immer bis zum Ende.'},
      {id: 'footer', label: 'Laufzeile unten (leer = keine)', type: 'textarea', value: c.footer, max: 160}], submit: 'Speichern',
      onSubmit: v => tvw('settings', v, 'tvs:' + JSON.stringify(v))}); }
    // Bildschirme
    const scr = () => ad.tv.screens.find(x => x.id === el.dataset.s);
    if (a === 'scr-mode') {
      const sc = scr(), mode = el.dataset.mode, tours = (ad.tours?.tournaments || []).filter(t => t.status !== 'draft');
      const send = extra => tvw(`screens/${encodeURIComponent(sc.id)}/mode`, {mode, ...extra}, 'scm:' + sc.id + mode + JSON.stringify(extra) + Date.now());
      if (mode === 'rotation') return act(() => send({}), `${sc.name}: Folien im Wechsel.`);
      if (mode === 'tournament' || mode === 'podium') {
        const list = mode === 'podium' ? tours.filter(t => t.status === 'finished') : tours;
        if (!list.length) { app().notify(mode === 'podium' ? 'Noch kein beendetes Turnier.' : 'Kein laufendes Turnier – lege unter „Turniere“ eins an.', true); return; }
        return openForm({title: `${sc.name}: ${mode === 'podium' ? 'Siegerehrung' : 'Turnieransicht'}`, fields: [{id: 'tournament_id', label: 'Turnier', type: 'select', value: sc.tournament_id || list[0].id, options: list.map(t => [t.id, `${t.name} · ${t.status === 'finished' ? 'beendet' : 'läuft'}`])}], submit: 'Anzeigen',
          onSubmit: v => send({tournament_id: v.tournament_id}).then(() => app().notify(`${sc.name} zeigt jetzt ${mode === 'podium' ? 'die Siegerehrung' : 'das Turnier'}.`))});
      }
      return openForm({title: `${sc.name}: eine Folie dauerhaft`, intro: '<p>Zum Beispiel ein Sponsor-Video in der Pause oder die Getränkekarte.</p>', fields: [{id: 'slide_id', label: 'Folie', type: 'select', value: sc.slide_id || ad.tv.slides[0].id, options: ad.tv.slides.map(sl => [sl.id, slideName(ad.tv, sl)])}], submit: 'Anzeigen',
        onSubmit: v => send({slide_id: v.slide_id})});
    }
    if (a === 'scr-url') { const sc = scr(), url = tvURL(sc.id), dlg = document.querySelector('#ad-dialog');
      dlg.innerHTML = `<div class="fx-dialog-body"><h2 id="ad-dialog-title">TV-Adresse · ${e(sc.name)}</h2><p>Diese Adresse einmal im Browser des Fernsehers öffnen (oder auf einem Fire-TV-Stick, Chromecast mit Google TV, Mini-PC). Danach steuerst du alles von hier.</p>
        <div class="ad-qr-code ad-tv-qr">${qrSVG(url)}</div><p class="ad-mono ad-break ad-tv-url">${e(url)}</p>
        <ul class="fx-scan-list"><li>${gi('laptop')}Kein Login nötig – der Bildschirm zeigt nur öffentliche Inhalte.</li><li>${gi('film-projector')}Ist der Browser nicht von selbst im Vollbild: Maus bewegen oder Taste drücken → „Vollbild“.</li><li>${gi('smartphone')}Der QR-Code öffnet die Adresse auf einem Handy, z. B. zum Weiterleiten per „Streamen“ / Cast.</li></ul>
        <div class="ad-actions"><button type="button" class="btn primary" data-ad="copy" data-code="${e(url)}">Adresse kopieren</button><button type="button" class="btn" data-ad="dialog-close">Schließen</button></div></div>`;
      dlg.showModal(); return; }
    if (a === 'scr-new' || a === 'scr-edit') { const sc = a === 'scr-edit' ? scr() : {venue_id: mainVenue()?.id, show_tables: true}; return openForm({title: sc.id ? 'Bildschirm bearbeiten' : 'Bildschirm hinzufügen', fields: [
      {id: 'name', label: 'Name', value: sc.name, required: true, placeholder: 'z. B. Turnierecke'},
      {id: 'venue_id', label: 'Standort', type: 'select', value: sc.venue_id, options: venueList().map(v => [v.id, v.name])},
      {id: 'show_tables', label: 'Tische links anzeigen (bei Folien im Wechsel)', type: 'select', value: sc.show_tables ? '1' : '0', options: [['1', 'ja'], ['0', 'nein – Folien über die ganze Breite']]}], submit: 'Speichern',
      onSubmit: v => tvw('screens', {...v, id: sc.id}, 'scr:' + (sc.id || 'new') + v.name)}); }
    if (a === 'scr-del') return openForm({title: 'Bildschirm entfernen', intro: `<p>„${e(scr().name)}“ zeigt danach den Hauptbildschirm.</p>`, submit: 'Entfernen', danger: true, onSubmit: () => tvw(`screens/${encodeURIComponent(el.dataset.s)}/delete`, {}, 'scrd:' + el.dataset.s)});
    // Medien
    if (a === 'md-slide') return act(() => tvw(`media/${encodeURIComponent(el.dataset.id)}/slide`, {}, 'mds:' + el.dataset.id + Date.now()), 'Als Folie hinzugefügt – unter „Folien im Wechsel“ sortieren.');
    if (a === 'md-banner') return act(() => tvw(`media/${encodeURIComponent(el.dataset.id)}/banner`, {}, 'mdb:' + el.dataset.id + Date.now()));
    if (a === 'md-del') return openForm({title: 'Löschen', intro: '<p>Das Bild oder Video verschwindet von allen Bildschirmen.</p>', submit: 'Löschen', danger: true, onSubmit: () => tvw(`media/${encodeURIComponent(el.dataset.id)}/delete`, {}, 'mdd:' + el.dataset.id)});
    // Tische & QR
    if (a === 'tvenue') { ad.tableVenue = el.dataset.v; app().render(); return; }
    if (a === 'print-all') { ad.printIds = null; location.hash = '#admin/tische/druck'; return; }
    if (a === 'print-one') { ad.printIds = [el.dataset.id]; el.closest('dialog')?.close(); location.hash = '#admin/tische/druck'; return; }
    if (a === 'print-now') { window.print(); return; }
    if (a === 'table-qr') {
      const t = ad.tables.tables.find(x => x.id === el.dataset.id), dlg = document.querySelector('#ad-dialog');
      dlg.innerHTML = `<div class="fx-dialog-body"><h2 id="ad-dialog-title">QR-Code · Tisch ${t.no}</h2><div class="ad-qr-preview">${tableCard(t)}</div>
        <p class="hint">Link im Code: <span class="ad-mono ad-break">${e(tableURL(t))}</span></p>
        <div class="ad-actions"><button type="button" class="btn primary" data-ad="print-one" data-id="${e(t.id)}">Drucken</button><button type="button" class="btn" data-ad="qr-svg" data-id="${e(t.id)}">Als SVG speichern</button><button type="button" class="btn" data-ad="copy" data-code="${e(tableURL(t))}">Link kopieren</button></div>
        <button type="button" class="btn ad-wide ad-mt" data-ad="dialog-close">Schließen</button></div>`;
      dlg.showModal(); return;
    }
    if (a === 'qr-svg') {
      const t = ad.tables.tables.find(x => x.id === el.dataset.id), svg = qrSVG(tableURL(t));
      if (!svg) { app().notify('QR-Code konnte nicht erzeugt werden.', true); return; }
      const url = URL.createObjectURL(new Blob([svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')], {type: 'image/svg+xml'}));
      const link = Object.assign(document.createElement('a'), {href: url, download: `qr-tisch-${t.no}-${venueName(t.venue_id).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.svg`});
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); return;
    }
    if (a === 'table-new' || a === 'table-edit') {
      const t = a === 'table-edit' ? ad.tables.tables.find(x => x.id === el.dataset.id) : {venue_id: ad.tableVenue || mainVenue()?.id, kind: 'Pool'};
      const used = ad.tables.tables.filter(x => x.venue_id === t.venue_id).map(x => x.no);
      const nextNo = t.no || (Math.max(0, ...used) + 1);
      return openForm({title: t.id ? `Tisch ${t.no} bearbeiten` : 'Neuer Tisch', intro: t.id ? '<p>Nummer und Standort lassen sich ändern, ohne dass der aufgeklebte QR-Code ungültig wird.</p>' : '<p>Nach dem Anlegen kannst du den QR-Code direkt drucken.</p>', fields: [
        {id: 'venue_id', label: 'Standort', type: 'select', value: t.venue_id, options: venueList().map(v => [v.id, v.main ? `${v.name} (Stammhaus)` : v.name])},
        {id: 'no', label: 'Tischnummer', type: 'number', value: nextNo, min: 1, maxv: 99, required: true},
        {id: 'kind', label: 'Art', type: 'select', value: t.kind, options: (ad.tables.kinds || ['Pool']).map(k => [k, k])},
        {id: 'name', label: 'Bezeichnung (optional)', value: t.name, placeholder: 'z. B. Fenstertisch'},
        {id: 'sensor_id', label: 'Kugelfach-Sensor / Kassen-ID (optional)', value: t.sensor_id, placeholder: 'z. B. K3', hint: 'Damit die Tischzeit aus der Kasse automatisch erscheint.'}], submit: t.id ? 'Speichern' : 'Anlegen',
        onSubmit: v => w('/admin/tables', {...v, no: Number(v.no), id: t.id}, 'table:' + (t.id || 'new') + v.venue_id + v.no).then(res => { ad.tableVenue = v.venue_id; if (!t.id) app().notify(`Tisch ${res.table.no} angelegt. Über „QR-Code“ kannst du ihn jetzt drucken.`); })});
    }
    if (a === 'table-code') { const t = ad.tables.tables.find(x => x.id === el.dataset.id); return openForm({title: `Neuer QR-Code für Tisch ${t.no}`, intro: '<p>Der alte Code funktioniert danach nicht mehr – bitte den neuen ausdrucken und den alten Aufkleber entfernen.</p>', fields: [reasonField('Begründung', 'z. B. „Aufkleber beschädigt“. Steht im Protokoll.')], submit: 'Neuen Code erzeugen', danger: true,
      onSubmit: v => w(`/admin/tables/${encodeURIComponent(t.id)}/new-code`, v, 'tcode:' + t.id + Date.now()).then(() => app().notify('Neuer Code erzeugt. Jetzt drucken und austauschen.'))}); }
    if (a === 'table-toggle') return act(() => w(`/admin/tables/${encodeURIComponent(el.dataset.id)}/toggle`, {}, 'ttog:' + el.dataset.id + Date.now()));
    // Orte
    if (a === 'venue-new' || a === 'venue-edit') {
      const v = a === 'venue-edit' ? ad.venues.venues.find(x => x.id === el.dataset.id) : {};
      return openForm({title: v.id ? 'Ort bearbeiten' : 'Neuer Ort', fields: [
        {id: 'name', label: 'Name', value: v.name, required: true, placeholder: 'z. B. Vereinsheim BC Merzig'},
        {id: 'address', label: 'Adresse', value: v.address, required: true, placeholder: 'Straße, PLZ Ort', hint: 'Spieler sehen sie bei Events und Gutscheinen, mit Link zur Karte.'},
        {id: 'note', label: 'Notiz (optional)', value: v.note, placeholder: 'z. B. Eingang über den Hof'}], submit: 'Speichern',
        onSubmit: x => w('/admin/venues', {...x, id: v.id}, 'venue:' + (v.id || 'new') + x.name)});
    }
    if (a === 'venue-archive') return act(() => w(`/admin/venues/${encodeURIComponent(el.dataset.id)}/archive`, {}, 'varch:' + el.dataset.id + Date.now()));
    // Wochenaufgaben
    if (a === 'quest-new' || a === 'quest-edit') {
      const d = ad.quests, q = a === 'quest-edit' ? d.quests.find(x => x.id === el.dataset.id) : {type: 'weekday', goal: 1, weekday: 1};
      return openForm({title: q.id ? 'Aufgabe bearbeiten' : 'Neue Wochenaufgabe', fields: [
        {id: 'title', label: 'Titel', value: q.title, required: true, placeholder: 'z. B. Dienstagsspieler'},
        {id: 'text', label: 'Beschreibung für Spieler', value: q.text, placeholder: 'z. B. Spiel eine Partie an einem Dienstag.'},
        {id: 'type', label: 'Art', type: 'select', value: q.type, options: Object.entries(d.types)},
        {id: 'pool', label: 'Disziplin', type: 'select', value: q.pool || '9-single', options: Object.entries(d.pools), showIf: v => v.type === 'pool'},
        {id: 'weekday', label: 'Wochentag', type: 'select', value: q.weekday ?? 1, options: d.weekdays.map((n, i) => [i, n]), showIf: v => v.type === 'weekday'},
        {id: 'goal', label: 'Ziel (Anzahl)', type: 'number', value: q.goal, min: 1, maxv: 10}], submit: 'Speichern',
        onSubmit: v => w('/admin/quests', {...v, id: q.id, goal: Number(v.goal)}, 'quest:' + (q.id || 'new') + JSON.stringify(v))});
    }
    if (a === 'quest-del') return openForm({title: 'Aufgabe löschen', intro: `<p>„${e(el.dataset.name)}“ verschwindet sofort aus den Wochenaufgaben.</p>`, submit: 'Löschen', danger: true,
      onSubmit: () => w(`/admin/quests/${encodeURIComponent(el.dataset.id)}/delete`, {}, 'qdel:' + el.dataset.id)});
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-adform]');
    if (!form) return;
    event.preventDefault();
    const kind = form.dataset.adform;
    if (kind === 'lookup') {
      const code = form.code.value.trim().toUpperCase();
      ad.lookupCode = code; ad.lookup = null; ad.lookupError = '';
      if (!code) { ad.lookupError = 'Bitte den Code eingeben.'; app().render(); return; }
      try { ad.lookup = (await app().request('/admin/vouchers/' + encodeURIComponent(code))).voucher; } catch (er) { ad.lookupError = er.message; }
      app().render(); return;
    }
    if (kind === 'announce') {
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try { ad.tv = await app().write('/admin/tv/announce', {text: form.text.value.trim(), minutes: Number(form.minutes.value)}, 'ann:' + Date.now()); app().notify('Durchsage läuft auf dem Café-Bildschirm.'); app().render(); }
      catch (er) { app().notify(er.message, true); btn.disabled = false; }
      return;
    }
    if (kind === 'psearch') { ad.playerQuery = form.q.value.trim(); ad.players = null; app().render(); await reload(); document.querySelector('#ad-psearch')?.focus(); return; }
    if (kind === 'dialog') {
      const vals = Object.fromEntries([...form.querySelectorAll('[name]')].filter(el => !el.closest('[hidden]')).map(el => [el.name, el.value.trim()]));
      const out = form.querySelector('#ad-dialog-error');
      const missing = dlgFields.find(f => f.required && !form.querySelector(`[data-field="${f.id}"]`)?.hidden && !vals[f.id]);
      if (missing) { out.hidden = false; out.textContent = `Bitte „${missing.label}“ ausfüllen.`; return; }
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try { await dlgSubmit(vals); form.closest('dialog').close(); await reload(); }
      catch (er) { out.hidden = false; out.textContent = er.message; btn.disabled = false; }
    }
  });
  // Bild oder Video für das Café-TV: Bilder im Browser auf Full-HD verkleinern
  function shrink(file) {
    return new Promise((ok, fail) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { const k = Math.min(1, 1920 / img.naturalWidth, 1080 / img.naturalHeight), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        const g = c.getContext('2d'); g.fillStyle = '#000'; if (file.type === 'image/jpeg') g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        ok(file.type === 'image/png' && file.size < 900000 ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', .86)); };
      img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('Dieses Bild lässt sich nicht öffnen.')); };
      img.src = url;
    });
  }
  async function upload(file) {
    const video = file.type.startsWith('video/');
    if (video && file.size > 80 * 1024 * 1024) { app().notify('Das Video ist größer als 80 MB. Bitte kürzer oder kleiner exportieren.', true); return; }
    if (!video && file.size > 15 * 1024 * 1024) { app().notify('Das Bild ist größer als 15 MB.', true); return; }
    let src;
    try { src = video ? URL.createObjectURL(file) : await shrink(file); } catch (er) { app().notify(er.message, true); return; }
    openForm({title: video ? 'Video hinzufügen' : 'Bild hinzufügen', intro: video ? '<p>Demo: Das Video bleibt nur bis zum Neuladen erhalten. Im Echtbetrieb wird es auf den Server geladen.</p>' : `<p><img class="ad-upload-preview" src="${e(src)}" alt=""></p>`, fields: [
      {id: 'name', label: 'Name', value: file.name.replace(/\.[^.]+$/, '').slice(0, 50), required: true},
      {id: 'sponsor', label: 'Sponsor (optional)', placeholder: 'z. B. Musterbrauerei', hint: 'Wird auf dem Bildschirm als „präsentiert von …“ gezeigt.'},
      {id: 'as_slide', label: 'Gleich als Folie zeigen?', type: 'select', value: '1', options: [['1', 'ja, als eigene Folie'], ['0', 'nein, nur speichern']]}], submit: 'Hochladen',
      onSubmit: v => app().write('/admin/tv/media', {kind: video ? 'video' : 'image', src, name: v.name, sponsor: v.sponsor, as_slide: v.as_slide === '1'}, 'md:' + v.name + Date.now()).then(res => { ad.tv = res; app().notify(video ? 'Video hinzugefügt.' : 'Bild hinzugefügt.'); })});
  }
  document.addEventListener('change', event => {
    if (event.target.id === 'ad-media-file' && event.target.files?.[0]) { const f = event.target.files[0]; event.target.value = ''; upload(f); return; }
    if (event.target.closest('#ad-dialog')) applyShowIf();
    if (event.target.matches('[data-ad-counter]')) { ad.counter = event.target.value; app().render(); }
  });
  document.addEventListener('input', event => {
    const el = event.target.closest('[data-adi]');
    if (!el || !ad.issue) return;
    ad.issue[el.dataset.adi] = el.value;
    if (el.dataset.adi === 'q') { app().render(); return; }
    if (el.dataset.adi === 'reason') { const b = document.querySelector('[data-ad="issue-go"]'); if (b) b.disabled = !(ad.issuePreview && el.value.trim().length >= 3); return; }
    if (el.dataset.adi !== 'note') schedulePreview(); else { const em = document.querySelector('.ad-ticket-big em.ad-note'); if (em) em.textContent = el.value; }
  });
  document.addEventListener('click', event => {
    const pick = event.target.closest('[data-adi-pick]'), tog = event.target.closest('[data-adi-toggle]');
    if (!ad.issue || (!pick && !tog)) return;
    const y = window.scrollY;
    if (pick) ad.issue[pick.dataset.adiPick] = pick.dataset.v;
    if (pick?.dataset.adiPick === 'template') ad.issue.venue_id = (ad.catalog?.catalog || []).find(k => k.id === pick.dataset.v)?.venue_id || '';
    if (tog) { const id = tog.dataset.adiToggle, l = ad.issue.player_ids; ad.issue.player_ids = l.includes(id) ? l.filter(x => x !== id) : [...l, id]; }
    ad.issuePreview = null; app().render(); window.scrollTo(0, y); schedulePreview();
  });

  // ---------- Navigation: „Verwaltung“ statt „Erfolge“ für das Café-Team ----------
  let navOriginal = null;
  // Café-Konten bekommen eine eigene Navigation: Bedienung statt Spielerfunktionen
  const STAFF_NAV = [['admin', '#admin', 'histogram', 'Verwaltung'], ['turniere', '#admin/turniere', 'organigram', 'Turniere'], ['tv', '#admin/tv', 'film-projector', 'Café-TV'], ['rangliste', '#rangliste', 'podium', 'Rangliste'], ['profil', '#profil', 'person', 'Konto']];
  function afterRender(state) {
    const rl = role(state), nav = document.querySelector('.bottom-nav');
    if (!nav) return;
    if (!navOriginal) navOriginal = nav.innerHTML;
    const r = app().route();
    if (rl) {
      if (nav.dataset.mode !== 'staff') { nav.innerHTML = STAFF_NAV.map(([k, h, ic, n]) => `<a href="${h}" data-tab="${k}">${gi(ic)}<span>${n}</span></a>`).join(''); nav.dataset.mode = 'staff'; }
      const cur = r.view === 'admin' ? (['turniere', 'tv'].includes(r.section) ? r.section : 'admin') : r.tab;
      nav.querySelectorAll('a').forEach(a => a.dataset.tab === cur ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    } else if (nav.dataset.mode === 'staff') {
      nav.innerHTML = navOriginal; delete nav.dataset.mode;
      nav.querySelectorAll('a').forEach(a => a.dataset.tab === r.tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    }
  }

  window.BillardAdmin = {load, view, afterRender};
})();
