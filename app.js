'use strict';

(() => {
  const POOLS = {
    '8-single': {label: '8-Ball', note: 'Einzel'},
    '9-single': {label: '9-Ball', note: 'Einzel'},
    '10-single': {label: '10-Ball', note: 'Einzel'},
    '14-single': {label: '14/1', note: 'Einzel'},
    '8-double': {label: '8-Ball Doppel', note: '2 gegen 2'}
  };
  const FORMATS = [{best: 1, wins: 1, label: 'Einzelnes Spiel'}, {best: 3, wins: 2, label: '3er Satz'}, {best: 7, wins: 4, label: '5er Satz'}];
  const VARIANTS = {aufnahme: 'Aufnahmewechsel', stoss: 'Stoßwechsel'};
  const STATUSES = {playing: 'Läuft', pending: 'Bestätigung offen', confirmed: 'Bestätigt', disputed: 'Widersprochen', void: 'Annulliert', aborted: 'Abgebrochen'};
  const remoteAuth = window.BillardRemoteAuth;
  const remote = !!remoteAuth?.enabled || /\.github\.io$/i.test(new URL(location.href).hostname);
  const transportError = remote && (!remoteAuth || remoteAuth.configError) ? remoteAuth?.configError || 'Die Verbindung dieser App ist nicht eingerichtet. Bitte die offizielle App-Adresse neu laden.' : '';
  const appBase = new URL('./', location.href);
  const qrImages = new Map();
  const STORAGE = 'merzig-frontend-draft-v1';
  const main = document.querySelector('main');
  const noticeHost = document.querySelector('#notice');
  const connectionHost = document.querySelector('#connection');
  const rules = window.BillardRules;
  const scorekeeper = window.BillardScorekeeper;
  const fx = window.BillardFeatures; /* NEU: Erweiterungen (features.js) */
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const initialWizard = () => ({pool: '8-single', best_of: null, variant: null, points_target: '50', teams: [[''], ['']], step: 1});
  function readDrafts() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE) || '{}') || {}; } catch { return {}; }
  }
  const saved = readDrafts();
  const knownMatches = new Map();
  let matchesRequest = 0;
  let identityEpoch = 0;
  let sessionCheck = null;
  const accountChannel = !remote && typeof window.BroadcastChannel === "function" ? new window.BroadcastChannel("merzig-account-changed") : null;
  const savedWizard = saved.wizard;
  const wizard = savedWizard && POOLS[savedWizard.pool] && Array.isArray(savedWizard.teams) && savedWizard.teams.length === 2 && savedWizard.teams.every(Array.isArray)
    ? {...initialWizard(), ...savedWizard, step: [1, 2, 3].includes(savedWizard.step) ? savedWizard.step : 1}
    : initialWizard();
  if (!FORMATS.some(f => f.best === Number(wizard.best_of))) wizard.best_of = null;
  const state = {
    session: null, sessionError: '', players: null, playersError: '', matches: null, matchesError: '', me: null, meError: '',
    board: null, boardError: '', boardPool: POOLS[saved.boardPool] ? saved.boardPool : '8-single', boardMonth: /^\d{4}-\d{2}$/.test(saved.boardMonth || '') ? saved.boardMonth : currentMonth(), months: [],
    wizard, edits: saved.edits && typeof saved.edits === 'object' ? saved.edits : {}, idem: saved.idem && typeof saved.idem === 'object' ? saved.idem : {},
    authMode: 'login', authName: '', authError: '', returnTo: saved.returnTo || '#spielen', notice: null, busy: '',
    detail: null, detailError: '', historyPool: POOLS[saved.historyPool] ? saved.historyPool : '', historyVariant: VARIANTS[saved.historyVariant] ? saved.historyVariant : '',
    conflicts: {}, wizardConflict: false, lastSync: null, networkFailed: false, routeEpoch: 0, loading: false, installPrompt: null, storageFailed: false,
    homeBoard: null, homeBoardError: '', joinInput: '', joinError: '',
    rulesDiscipline: '8', lobbies: null, lobbiesError: '', lobby: null, lobbyError: '', lobbyConflict: false, lobbyPending: null, installed: false, installPlatformChoice: ''
  };

  function persist() {
    try {
      // Only nonsecret input drafts and opaque retry keys. No sessions, PINs, players, ratings or server matches.
      const idem = Object.fromEntries(Object.entries(state.idem).filter(([key]) => !key.startsWith('auth:')).slice(-100));
      sessionStorage.setItem(STORAGE, JSON.stringify({accountId: state.session?.user?.id || null, wizard: state.wizard, edits: state.edits, idem, boardPool: state.boardPool, boardMonth: state.boardMonth, historyPool: state.historyPool, historyVariant: state.historyVariant, returnTo: state.returnTo}));
    } catch { state.storageFailed = true; }
  }
  function currentMonth() {
    const parts = new Intl.DateTimeFormat('en', {timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit'}).formatToParts(new Date());
    return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
  }
  function date(value, includeTime = true) {
    if (!value) return 'Noch nicht bestätigt';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'Zeitpunkt nicht verfügbar';
    return new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', ...(includeTime ? {hour: '2-digit', minute: '2-digit'} : {})}).format(dt) + (includeTime ? ' Uhr' : '');
  }
  function monthLabel(month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return month;
    return new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin', month: 'long', year: 'numeric'}).format(new Date(`${month}-15T12:00:00Z`));
  }
  const format = m => FORMATS.find(f => f.best === Number(m.best_of)) || (Number(m.best_of) === 5 ? {best: 5, wins: 3, label: 'Historischer 3er Satz (BO5)'} : null);
  const formatLabel = m => format(m)?.label || 'Format nicht verfügbar';
  const targetWins = m => format(m)?.wins || Number(m.target_wins);
  const poolLabel = pool => POOLS[pool]?.label || 'Disziplin nicht verfügbar';
  const teamName = team => (team || []).map(p => p.name).join(' & ');
  const teamLabel = (m, i) => `${m.pool === '8-double' ? `Team ${i ? 'B' : 'A'} · ` : ''}${teamName(m.teams?.[i])}`;
  const matchURL = id => `#partie/${encodeURIComponent(id)}`;
  const badge = status => `<span class="badge ${Object.hasOwn(STATUSES, status) ? status : ''}">${e(STATUSES[status] || 'Status unbekannt')}</span>`;
  const openProposal = m => ['pending', 'disputed'].includes(m?.status) ? m.proposal : null;
  const activeMatch = m => ['playing', 'pending', 'disputed'].includes(m?.status);
  const busyText = normal => state.busy ? 'Wird gesendet …' : normal;
  const loading = text => `<div class="loading" role="status">${e(text)}</div>`;
  const retry = (action, text = 'Erneut laden') => `<button type="button" class="btn small" data-action="${e(action)}">${e(text)}</button>`;
  const errorBlock = (message, action) => `<div class="callout error" role="alert"><p>${e(message)}</p>${action ? retry(action) : ''}</div>`;
  const blank = (heading, body) => `<div class="empty-state"><h3>${e(heading)}</h3><p>${e(body)}</p></div>`;
  function notify(text, error = false, kind = 'general') { state.notice = {text, error, kind}; renderNotice(); }
  function clearWizardNotice() { if (state.notice?.kind === 'wizard') { state.notice = null; renderNotice(); } }
  function refreshWizardNotice() { if (state.notice?.kind === 'wizard') { const error = validateWizard(state.wizard.step === 1 ? 1 : 2); if (error) notify(error, true, 'wizard'); else clearWizardNotice(); } }
  function renderNotice() {
    noticeHost.innerHTML = state.notice ? `<div class="notice ${state.notice.error ? 'error' : ''}" ${state.notice.error ? 'role="alert"' : 'role="status"'}><p>${e(state.notice.text)}</p><button class="close-button" data-action="dismiss" aria-label="Hinweis schließen" type="button">×</button></div>` : '';
  }
  function connection() {
    const offline = !navigator.onLine;
    connectionHost.hidden = !offline && !state.networkFailed;
    connectionHost.innerHTML = offline ? 'Offline · Entwürfe bleiben in diesem Tab. Speichern und Laden brauchen eine Verbindung.' : state.networkFailed ? 'Der Server ist nicht erreichbar. <button class="text-button" data-action="refresh" type="button">Verbindung prüfen</button>' : '';
  }
  class ApiError extends Error {
    constructor(message, status = 0) { super(message); this.status = status; }
  }
  async function request(path, {method = 'GET', body, key} = {}) {
    if (transportError) throw new ApiError(transportError);
    const epoch = identityEpoch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const headers = {Accept: 'application/json'};
      if (method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        if (!remote && state.session?.csrf_token) headers['X-CSRF-Token'] = state.session.csrf_token;
        if (key) headers['Idempotency-Key'] = key;
      }
      let response;
      try { response = await (remote ? remoteAuth.fetchAPI(path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal}) : fetch(`/api${path}`, {method, credentials: 'same-origin', cache: 'no-store', headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal})); }
      catch (error) { if (remote && error.status === 401) { expireSession(); throw new ApiError(error.message, 401); } if (remoteAuth?.configError) throw new ApiError(remoteAuth.configError); state.networkFailed = true; connection(); throw new ApiError(method === 'GET' ? 'Keine Serverantwort. Bitte Verbindung prüfen und erneut laden.' : 'Keine Serverbestätigung erhalten. Der Ausgang ist unklar. Dein Entwurf bleibt erhalten; eine identische Wiederholung verwendet denselben Sicherheitsschlüssel.'); }
      if (epoch !== identityEpoch) throw new ApiError('Das Profil hat sich geändert. Bitte den neuen Stand prüfen.', 419);
      state.networkFailed = false;
      connection();
      let data;
      try { data = await response.json(); } catch { throw new ApiError('Die Serverantwort konnte nicht gelesen werden. Bitte erneut versuchen; dein Entwurf bleibt erhalten.', response.status); }
      if (epoch !== identityEpoch) throw new ApiError('Das Profil hat sich geändert. Bitte neu prüfen.', 419);
      if (!response.ok) {
        if (response.status === 401 && !['/login', '/register'].includes(path)) expireSession();
        throw new ApiError(typeof data.detail === 'string' ? data.detail : `Die Anfrage wurde abgelehnt (${response.status}). Bitte Eingaben prüfen.`, response.status);
      }
      return data;
    } finally { clearTimeout(timer); }
  }
  async function retryKey(scope, body) {
    const text = JSON.stringify(body);
    const bytes = new TextEncoder().encode(text);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    const slot = `${scope.startsWith('auth:') ? scope : `${state.session?.user?.id || 'guest'}:${scope}`}`;
    if (state.idem[slot]?.digest !== digest) state.idem[slot] = {digest, key: crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('')};
    persist();
    return state.idem[slot].key;
  }
  async function verifyIdentity() {
    if (!state.session?.authenticated) throw new ApiError("Bitte zuerst selbst anmelden.", 401);
    const expected=state.session.user.id, epoch=identityEpoch, actual=await request("/session");
    if(epoch!==identityEpoch) throw new ApiError("Das Profil hat sich geändert. Bitte neu prüfen.",419);
    if(!actual.authenticated || actual.user?.id!==expected || actual.csrf_token!==state.session.csrf_token){
      const target=route().view==="invite"?location.hash:"#spielen";
      resetPrivateState();state.session=actual;state.returnTo=target;alignOwnPlayer();persist();render();
      throw new ApiError("Das Profil hat sich in einem anderen Tab geändert. Vorherige Eingaben wurden entfernt. Bitte neu prüfen.",419);
    } return epoch;
  }
  async function write(path,body,scope){
    const epoch=["/login","/register"].includes(path)?identityEpoch:await verifyIdentity();
    const key=await retryKey(scope,body);
    if(epoch!==identityEpoch)throw new ApiError("Das Profil hat sich geändert. Bitte neu prüfen.",419);
    return request(path,{method:"POST",body,key});
  }
  function resetPrivateState({keepWizard=false}={}) {
    ++identityEpoch;++matchesRequest;++state.routeEpoch;sessionCheck=null;
    state.homeBoard=null;state.homeBoardError="";
    state.me=null;state.meError="";state.matches=null;state.matchesError="";state.players=null;state.playersError="";state.detail=null;state.detailError="";
    state.lobbies=null;state.lobbiesError="";state.lobby=null;state.lobbyError="";state.lobbyPending=null;state.lobbyConflict=false;
    state.edits={};state.idem={};state.conflicts={};state.wizardConflict=false;state.lastSync=null;
    state.wizard=keepWizard?{...initialWizard(),pool:state.wizard.pool,best_of:state.wizard.best_of,variant:state.wizard.variant,points_target:state.wizard.points_target,step:Math.min(2,state.wizard.step)}:initialWizard();
    state.authName="";state.authError="";knownMatches.clear();scorekeeper.clear();scorekeeper.discardInputs();
    for (const source of qrImages.values()) URL.revokeObjectURL(source); qrImages.clear();
  }
  function announceIdentityChange(){accountChannel?.postMessage("changed");}
  async function checkCurrentSession(){if(sessionCheck)return sessionCheck;sessionCheck=loadSession().finally(()=>{sessionCheck=null;});return sessionCheck;}
  function acknowledge(scope) {
    const slot = scope.startsWith('auth:') ? scope : `${state.session?.user?.id || 'guest'}:${scope}`;
    delete state.idem[slot];
    persist();
  }
  function expireSession(){const target=location.hash||"#spielen";resetPrivateState();state.session={authenticated:false};state.returnTo=target;persist();notify("Deine Sitzung ist abgelaufen. Bitte erneut anmelden. Private Eingaben wurden entfernt.",true);location.hash="#profil";}
  async function loadSession(){
    const epoch=identityEpoch;state.sessionError="";
    try{const session=await request("/session");if(epoch!==identityEpoch)return;
      if(session.authenticated&&(!session.user||(!remote&&!session.csrf_token)))throw new ApiError("Die Sitzung ist unvollständig.");
      const previous=state.session?.user?.id??saved.accountId??null,next=session.user?.id||null;
      if(previous!==next)resetPrivateState({keepWizard:!previous});state.session=session;alignOwnPlayer();persist();
    }catch(err){if(epoch===identityEpoch){state.session=null;state.sessionError=err.message;}}
  }
  function alignOwnPlayer() {
    if (!state.session?.authenticated) return;
    const w = state.wizard;
    const size = w.pool === '8-double' ? 2 : 1;
    if (String(w.teams?.[0]?.[0] || '') !== String(state.session.user.id) || w.teams.some(t => t.length !== size)) {
      w.teams = size === 2 ? [[String(state.session.user.id), ''], ['', '']] : [[String(state.session.user.id)], ['']];
      if (w.step === 3) w.step = 2;
    }
    persist();
  }
  async function loadPlayers() {
    state.playersError = '';
    try { const data = await request('/players'); state.players = data.players; }
    catch (err) { state.playersError = err.message; }
  }
  function acceptMatch(m, detail = false) {
    const previous = knownMatches.get(m.id);
    if (previous && previous.version > m.version) m = previous;
    knownMatches.set(m.id, m);
    if ((detail && route().id === m.id) || state.detail?.id === m.id) state.detail = m;
    if (state.matches) state.matches = state.matches.map(old => old.id === m.id ? m : old);
    if (state.me?.matches) state.me.matches = state.me.matches.map(old => old.id === m.id ? m : old);
    scorekeeper.updateMatch(m);
    return m;
  }
  async function loadMatches() {
    const sequence = ++matchesRequest, userId = state.session?.user?.id;
    state.matchesError = '';
    try { const data = await request('/matches'); if (sequence !== matchesRequest || userId !== state.session?.user?.id) return; state.matches = data.matches.map(m => acceptMatch(m)); state.lastSync = new Date().toISOString(); await scorekeeper.overview(state.matches); }
    catch (err) { if (sequence === matchesRequest) state.matchesError = err.message; }
  }
  async function loadMe() {
    const epoch = identityEpoch, userId = state.session?.user?.id;
    state.meError = '';
    try {
      const data = await request('/me');
      if (epoch !== identityEpoch || userId !== state.session?.user?.id) return;
      data.matches = (data.matches || []).map(m => acceptMatch(m));
      state.me = data; state.lastSync = new Date().toISOString();
    } catch (err) { if (epoch === identityEpoch && userId === state.session?.user?.id) state.meError = err.message; }
  }
  async function loadHomeBoard() {
    const epoch = identityEpoch, userId = state.session?.user?.id, month = currentMonth();
    state.homeBoardError = '';
    try {
      const data = await request('/leaderboard?' + new URLSearchParams({pool: '8-single', month}));
      if (epoch !== identityEpoch || userId !== state.session?.user?.id || month !== currentMonth()) return;
      if (data.pool === '8-single' && data.month === month) state.homeBoard = data;
    } catch (err) { if (epoch === identityEpoch && userId === state.session?.user?.id) state.homeBoardError = err.message; }
  }
  async function loadBoard() {
    const pool = state.boardPool, month = state.boardMonth;
    state.boardError = '';
    try {
      const data = await request(`/leaderboard?${new URLSearchParams({pool, month})}`);
      if (pool !== state.boardPool || month !== state.boardMonth) return;
      state.board = data;
      state.months = Array.isArray(data.months) ? data.months.filter(m => /^\d{4}-\d{2}$/.test(m)) : [];
      state.lastSync = new Date().toISOString();
    } catch (err) { if (pool === state.boardPool && month === state.boardMonth) state.boardError = err.message; }
  }
  async function loadDetail(id) {
    state.detailError = '';
    try { const data = await request(`/matches/${encodeURIComponent(id)}`); const m = acceptMatch(data.match, true); state.lastSync = new Date().toISOString(); await scorekeeper.loadMatch(m); }
    catch (err) { state.detailError = err.message; }
  }
  function route() {
    const hash = location.hash.replace(/^#/, '').split('/');
    if (hash[0] === 'partie' && hash[1]) { try { return {tab: 'spielen', view: 'match', id: decodeURIComponent(hash[1])}; } catch { return {tab: 'spielen', view: 'home'}; } }
    if(hash[0]==='beitreten'&&hash.length===2&&hash[1]){try{const id=decodeURIComponent(hash[1]);if(id&&!/[\s/]/.test(id))return {tab:'spielen',view:'invite',id};}catch{}}
    if(hash[0]==='beitreten'&&hash.length===1)return {tab:'spielen',view:'join'};
    if(hash[0]==='installieren')return {tab:'profil',view:'install'};
    if (hash[0] === 'rangliste') return {tab: 'rangliste', view: 'board'};
    /* NEU */ if (hash[0] === 'erfolge') return {tab: 'erfolge', view: 'erfolge'};
    /* NEU */ if (hash[0] === 'events') return {tab: 'events', view: 'events'};
    /* NEU */ if (hash[0] === 'tv') return {tab: 'events', view: 'tv', id: hash[1] ? decodeURIComponent(hash[1]) : 'haupt'};
    /* NEU */ if (hash[0] === 'statistik') return {tab: hash[1] ? 'rangliste' : 'profil', view: 'statistik', id: hash[1] ? decodeURIComponent(hash[1]) : 'me'};
    /* NEU */ if (hash[0] === 'spieler' && hash[1]) return {tab: hash[1] === 'me' ? 'profil' : 'rangliste', view: 'spieler', id: decodeURIComponent(hash[1])};
    /* NEU */ if (hash[0] === 'turnier' && hash[1]) return {tab: 'events', view: 'turnier', id: decodeURIComponent(hash[1])};
    /* NEU */ if (hash[0] === 'tisch' && hash[1]) { try { return {tab: 'spielen', view: 'tisch', id: decodeURIComponent(hash[1])}; } catch { return {tab: 'spielen', view: 'tisch', id: ''}; } }
    /* NEU */ if (hash[0] === 'profil-bearbeiten') return {tab: 'profil', view: 'profil-bearbeiten'};
    /* NEU */ if (hash[0] === 'admin') { try { return {tab: 'admin', view: 'admin', section: hash[1] || 'uebersicht', id: hash[2] ? decodeURIComponent(hash[2]) : null}; } catch { return {tab: 'admin', view: 'admin', section: 'uebersicht'}; } }
    if (hash[0] === 'regeln') return {tab: 'regeln', view: 'rules'};
    if (hash[0] === 'profil') return {tab: 'profil', view: 'profile', help: hash[1] === 'hilfe'};
    if (hash[0] === 'spielen' && hash[1] === 'neu') return {tab: 'spielen', view: 'wizard'};
    return {tab: 'spielen', view: 'home'};
  }
  async function refreshRoute({quiet = false, focus = false} = {}) {
    if (rules.isOpen() || scorekeeper.isOpen()) return;
    const epoch = ++state.routeEpoch;
    const r = route();
    if (!quiet) { state.loading = true; render(); }
    await Promise.all([
      state.session?.authenticated ? loadMatches() : null,
      state.session?.authenticated && ['home','invite'].includes(r.view) ? loadLobbies() : null,
      state.session?.authenticated && r.view==='invite' ? loadLobby(r.id) : null,
      r.view === 'board' ? loadBoard() : null,
      state.session?.authenticated && r.view === 'wizard' ? loadPlayers() : null,
      state.session?.authenticated && ['profile','home'].includes(r.view) ? loadMe() : null,
      state.session?.authenticated && r.view === 'home' ? loadHomeBoard() : null,
      state.session?.authenticated && r.view === 'match' ? loadDetail(r.id) : null,
      fx ? fx.load(r.view, state, r) : null /* NEU */
    ]);
    if (epoch !== state.routeEpoch) return;
    state.loading = false;
    render();
    if (rules.isOpen() || scorekeeper.isOpen()) return;
    if (focus) {
      main.focus({preventScroll: true});
      if (r.help) document.querySelector('#hilfe')?.scrollIntoView();
      else window.scrollTo({top: 0, behavior: 'instant'});
    }
  }
  function render() {
    // A request already in flight may finish while the PDF is open. Keep the editor DOM intact.
    if (rules.isOpen() || scorekeeper.isOpen()) return;
    const active = document.activeElement;
    const focusId = active?.id && main.contains(active) ? active.id : null;
    const selection = focusId && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    const r = route();
    document.body.classList.toggle('view-home', r.view === 'home');
    if (fx && r.view !== 'tv') document.body.classList.remove('fx-tv-mode'); /* NEU */
    scorekeeper.renderResume();
    document.querySelectorAll('[data-tab]').forEach(link => {
      if (link.dataset.tab === r.tab) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    const account = document.querySelector('#account-link');
    account.textContent = state.session?.authenticated ? 'Du spielst als '+state.session.user.name : 'Anmelden';
    const switchButton=document.querySelector('#profile-switch');if(switchButton)switchButton.hidden=!state.session?.authenticated;
    document.title = `${r.view === 'join' ? 'Beitreten' : r.view === 'install' ? 'Zum Startbildschirm' : r.view === 'invite' ? 'Einladung' : r.view === 'rules' ? 'Regeln' : r.view === 'match' ? 'Partie' : r.view === 'wizard' ? 'Partie starten' : r.view === 'erfolge' ? 'Erfolge' : r.view === 'events' ? 'Events' : r.view === 'tv' ? 'Café-Bildschirm' : r.view === 'statistik' ? 'Statistik' : r.view === 'spieler' ? 'Spielerprofil' : r.view === 'profil-bearbeiten' ? 'Profil bearbeiten' : r.view === 'admin' ? 'Café-Verwaltung' : r.tab === 'rangliste' ? 'Rangliste' : r.tab === 'profil' ? 'Profil' : 'Spielen'} · Billardcafé Merzig Rangliste`;
    const matchRules = document.querySelector('#match-rules-button');
    const showMatchRules = r.view === 'match' && state.session?.authenticated && state.detail?.id === r.id && activeMatch(state.detail);
    matchRules.hidden = !showMatchRules;
    document.body.classList.toggle('has-match-rules', !!showMatchRules);
    if (state.session === null && !['board','rules','install','join','events','tv','spieler','statistik'].includes(r.view)) {
      main.innerHTML = state.sessionError ? `<div class="narrow">${errorBlock(state.sessionError, 'session-retry')}</div>` : loading('Sitzung wird geprüft …');
      return;
    }
    if(r.view==='join') main.innerHTML=renderJoin();
    else if(r.view==='install') main.innerHTML=renderInstall();
    else if(r.view==='invite') main.innerHTML=renderInvite();
    else if (r.view === 'rules') main.innerHTML = rules.renderPage(state.rulesDiscipline);
    else if (r.view === 'board') main.innerHTML = renderBoard();
    else if (r.view === 'wizard') main.innerHTML = renderWizard();
    else if (r.view === 'match') main.innerHTML = renderMatch();
    else if (r.view === 'profile' && fx?.isStaff(state)) main.innerHTML = fx.staffAccount(state); /* NEU: Café-Konten ohne Spielerprofil */
    else if (r.view === 'profile') main.innerHTML = (fx && state.session?.authenticated ? fx.profileTop(state) : '') + renderProfile(); /* NEU: Spielerkarte oben */
    else if (fx && ['erfolge','events','tv','statistik','spieler','profil-bearbeiten','admin','tisch','turnier'].includes(r.view)) main.innerHTML = fx.view(r.view, state, r); /* NEU */
    else main.innerHTML = renderHome();
    if (state.busy) main.querySelectorAll('button, input, select, textarea').forEach(el => { el.disabled = true; });
    if (focusId) {
      const replacement = document.getElementById(focusId);
      if (replacement && !replacement.disabled) {
        replacement.focus({preventScroll: true});
        if (selection && replacement.type !== 'password') { try { replacement.setSelectionRange(...selection); } catch { /* Number and select inputs have no text selection. */ } }
      }
    }
    renderNotice();
    connection();
    if (fx?.afterRender) fx.afterRender(state, r); /* NEU */
  }

  function homeMatchRow(m) {
    const proposal = openProposal(m), source = m.result || proposal;
    const review = !!proposal && (m.can_confirm || m.can_dispute);
    const title = review ? 'Ergebnis prüfen' : m.status === 'playing' ? 'Partie fortsetzen' : m.status === 'disputed' ? 'Ergebnis klären' : 'Bestätigung offen';
    const label = review ? 'DEINE BESTÄTIGUNG' : m.status === 'playing' ? 'LÄUFT' : m.status === 'disputed' ? 'RÜCKFRAGE' : 'WARTET AUF GEGENSEITE';
    const score = source ? ' · ' + source.score_a + ' : ' + source.score_b : '';
    return '<a class="home-match-row '+(review?'needs-confirmation':'')+'" href="'+e(matchURL(m.id))+'"><span class="home-row-icon" aria-hidden="true">'+(review?'✓':'↗')+'</span><span class="home-row-copy"><small>'+e(label+' · '+poolLabel(m.pool))+'</small><strong>'+e(title)+'</strong><span>'+e(teamName(m.teams?.[0])+' gegen '+teamName(m.teams?.[1])+score)+'</span></span><span class="home-chevron" aria-hidden="true">›</span></a>';
  }
  function renderHome() {
    const signed = !!state.session?.authenticated;
    const active = signed ? (state.matches || []).filter(activeMatch).sort((a,b) => Number(!!b.can_confirm || !!b.can_dispute)-Number(!!a.can_confirm || !!a.can_dispute) || String(b.created_at).localeCompare(String(a.created_at))) : [];
    const rating = signed ? state.me?.ratings?.['8-single'] : null;
    const board = state.homeBoard?.pool === '8-single' && state.homeBoard.month === currentMonth() ? state.homeBoard : null;
    const ownMonth = signed ? board?.rows?.find(row => row.player?.id === state.session.user.id) : null;
    const rank = rating ? rating.rank || 'Platzierung' : state.meError ? 'Nicht verfügbar' : 'Wird geladen …';
    const place = ownMonth?.place != null ? 'Platz '+ownMonth.place : ownMonth?.provisional ? 'Platzierung' : state.homeBoardError ? 'Nicht verfügbar' : board ? 'Noch offen' : 'Wird geladen …';
    let body;
    if (!signed) body = '<div class="home-empty"><h3>Dein Profil am Tisch</h3><p>Melde dich mit deinem eigenen Nickname an, um zu spielen und Ergebnisse zu bestätigen.</p><a class="btn small" href="#profil">Anmelden / Registrieren</a></div>';
    else if (!state.matches && state.loading) body = loading('Deine Partien werden geladen …');
    else body = (state.matchesError ? errorBlock(state.matchesError,'refresh') : '') + (active.length ? active.map(homeMatchRow).join('') : state.matches && !state.matchesError ? '<div class="home-empty"><h3>Der Tisch ist frei.</h3><p>Starte eine Partie oder lass dich einladen.</p></div>' : '');
    return '<div class="home-screen"><section class="home-greeting"><div><p class="eyebrow">'+(signed?'DEIN PROFIL':'BILLARDCAFÉ MERZIG')+'</p><h1>'+(signed?'Hallo, '+e(state.session.user.name)+'.':'Willkommen am Tisch.')+'</h1><p>Bereit für die nächste Partie?</p></div><span class="home-eight" aria-hidden="true">8</span></section>'+(signed?'<section class="home-profile-strip" aria-label="Deine 8-Ball-Wertung"><div><span>DEINE LIGA · 8-BALL</span><strong>'+e(rank)+'</strong>'+(rating&&!rating.rank?'<small>'+e(rating.placement_games||0)+'/4 bestätigt</small>':'')+'</div><div><span>MONAT</span><strong>'+e(place)+'</strong></div><a href="#profil" aria-label="Dein Profil ansehen">↗</a></section>':'')+'<div class="home-start-actions"><a href="#spielen/neu" class="home-start"><span>Partie starten</span><span aria-hidden="true">→</span></a><a href="#beitreten" class="home-join"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10V4h6M14 4h6v6M4 14v6h6M20 14v6h-6M8 8h2v2H8zM14 14h2v2h-2zM18 16v2"/></svg><span>Beitreten<small>Link oder QR</small></span></a></div>'+(fx?fx.home(signed):'')+'<section aria-labelledby="active-title"><div class="home-section-heading"><h2 id="active-title">Für dich</h2>'+(signed?'<button class="text-button" data-action="refresh" type="button">'+(active.length?active.length+' offen':'Aktualisieren')+'</button>':'')+'</div>'+body+'</section>'+renderOwnLobbies()+installHTML()+syncNote()+'</div>';
  }
  function renderJoin() {
    return '<div class="narrow join-entry"><a class="back-link" href="#spielen">← Spielen</a><div class="page-heading"><p class="eyebrow">Zusammen an den Tisch</p><h1>Partie beitreten</h1><p class="muted">Lass dir den Einladungslink schicken oder scanne den QR-Code mit deiner Handykamera.</p></div><section class="panel"><h2>Einladungslink öffnen</h2><form data-form="join"><label class="field"><span>Link einfügen</span><input id="join-link" type="text" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" required value="'+e(state.joinInput)+'" placeholder="Einladungslink" aria-describedby="join-note'+(state.joinError?' join-error':'')+'"></label>'+(state.joinError?'<p id="join-error" class="editor-validation invalid" role="alert">'+e(state.joinError)+'</p>':'')+'<button class="btn primary full" type="submit">Einladung ansehen →</button><p id="join-note" class="hint">Du siehst die Personen und dein eigenes Profil, bevor du ausdrücklich beitrittst. Der Link meldet dich nicht als jemand anderes an.</p></form></section>'+loopbackHint()+'</div>';
  }
  function resolveInviteInput(value) {
    try {
      const url = new URL(String(value).trim(), location.href), own = new URL(location.href);
      const isOwn = url.origin === own.origin && url.pathname === appBase.pathname;
      const legacy = remote && url.origin === remoteAuth.apiBase && url.pathname === '/';
      if ((!isOwn && !legacy) || url.username || url.password || url.search) return null;
      const parts = url.hash.slice(1).split('/');
      if (parts.length !== 2 || parts[0] !== 'beitreten') return null;
      const id = decodeURIComponent(parts[1]);
      return /^[A-Za-z0-9_-]{16,128}$/.test(id) ? lobbyURL(id) : null;
    } catch { return null; }
  }
  function syncNote() {
    return state.lastSync && state.session?.authenticated ? `<p class="hint">Stand ${e(date(state.lastSync))} · Sichtbare Ansicht wird etwa alle 45 Sekunden aktualisiert.</p>` : '';
  }
  function personalOutcome(m) {
    if (!state.session?.authenticated || !m.result || ['aborted', 'void'].includes(m.status)) return '';
    const side = m.teams?.findIndex(team => team.some(p => p.id === state.session.user.id)) ?? -1;
    const scores = [m.result.score_a, m.result.score_b];
    if (side < 0 || !scores.every(n => Number.isSafeInteger(n) && n >= 0) || scores[0] === scores[1]) return '';
    return scores[side] > scores[1 - side] ? 'win' : 'loss';
  }
  function historyTime(m) {
    for (const value of [m.played_at, m.created_at]) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const time = Date.parse(value);
      if (Number.isFinite(time)) return {value, time};
    }
    return {value: null, time: -Infinity};
  }
  function matchCard(m, context = 'active') {
    const history = context === 'history';
    const proposal = openProposal(m), result = history && m.result ? m.result : proposal || m.result;
    const outcome = history ? personalOutcome(m) : '';
    const played = history ? historyTime(m) : null;
    const stamp = history ? (played.value ? `<time datetime="${e(played.value)}">${e(date(played.value))}</time>` : 'Spielzeit unbekannt') : e(m.confirmed_at ? date(m.confirmed_at) : date(m.created_at));
    const score = `<span class="score ${result ? '' : 'vs'}">${result ? `${e(result.score_a)} : ${e(result.score_b)}` : 'vs.'}</span>`;
    const historyScore = `<span class="history-result">${score}${outcome ? `<span class="history-outcome ${outcome}"><span class="history-outcome-dot" aria-hidden="true"></span>${outcome === 'win' ? 'Sieg' : 'Niederlage'}</span>` : ''}</span>`;
    const attention = proposal && m.can_confirm ? 'Deine Bestätigung ist gefragt' : proposal?.is_correction ? 'Korrektur zur Prüfung' : m.status === 'pending' ? 'Wartet auf Gegenseite' : m.status === 'disputed' ? 'Ergebnis gemeinsam klären' : m.status === 'playing' ? 'Ergebnis eintragen' : '';
    return `<a class="match-card${history ? ' history-card' : ''}" href="${e(matchURL(m.id))}"><div class="match-card-top"><span class="match-card-meta">${e(poolLabel(m.pool))} · ${e(formatLabel(m))}${m.variant ? ` · ${e(VARIANTS[m.variant] || m.variant)}` : ''}</span>${badge(m.status)}</div><div class="teams-row"><div class="team">${e(teamName(m.teams?.[0]))}</div>${history ? historyScore : score}<div class="team">${e(teamName(m.teams?.[1]))}</div></div><div class="match-card-bottom"><span>${stamp}${proposal ? history && proposal.is_correction ? (m.status === 'disputed' ? ' · Korrektur bestritten' : ' · Korrektur offen') : ' · Vorschlag' : ''}</span><span class="attention">${e(attention)} <span aria-hidden="true">→</span></span></div></a>`;
  }

  function renderWizard() {
    const w = state.wizard;
    const f = format(w);
    const step = w.step;
    let content = '';
    if (step === 1) {
      content = `<fieldset><legend>Welche Disziplin spielt ihr?</legend><div class="choices disciplines">${Object.entries(POOLS).map(([key, pool]) => `<button class="choice" type="button" data-pool="${key}" aria-pressed="${w.pool === key}"><strong>${pool.label}</strong><small>${pool.note}</small></button>`).join('')}</div></fieldset><fieldset><legend>Welches Format? <span class="muted">Pflichtauswahl</span></legend><div class="choices">${FORMATS.map(fm => `<button class="choice" type="button" data-format="${fm.best}" aria-pressed="${Number(w.best_of) === fm.best}"><strong>${fm.label}</strong></button>`).join('')}</div><p class="hint">Eine abgeschlossene Begegnung zählt einmal für die Platzierung – unabhängig vom Format.</p></fieldset>${w.pool === '8-double' ? `<fieldset><legend>Wie wechselt ihr im Doppel?</legend><div class="choices variants"><button type="button" class="choice" data-variant="aufnahme" aria-pressed="${w.variant === 'aufnahme'}"><strong>Aufnahmewechsel</strong><small>Eine Person spielt die ganze Aufnahme. Bei der nächsten Teamaufnahme wechselt der Partner.</small></button><button type="button" class="choice" data-variant="stoss" aria-pressed="${w.variant === 'stoss'}"><strong>Stoßwechsel</strong><small>Die Partner wechseln sich bei jedem Stoß innerhalb der Aufnahme ab.</small></button></div></fieldset>` : ''}${w.pool === '14-single' ? `<label class="field"><span>Punkteziel je Runde</span><input id="points-target" type="number" min="10" max="200" step="1" inputmode="numeric" required value="${e(w.points_target)}" data-wizard="points_target"><small>10 bis 200 Punkte. Vorauswahl: 50. Jede gewonnene Runde zählt als Satzsieg.</small></label>` : ''}<div class="actions"><a href="#spielen" class="btn">Zur Übersicht</a><button type="button" data-action="wizard-next" class="btn primary">Personen wählen →</button></div>`;
    } else if (!state.session?.authenticated) {
      content = `<div class="callout"><p>Disziplin und Format bleiben gespeichert. Melde dich an, um die Personen auszuwählen.</p></div><a class="btn primary full" href="#profil" data-action="login-for-wizard">Jetzt anmelden</a><div class="actions"><button class="btn" type="button" data-action="wizard-back">← Zurück</button></div>`;
    } else if (step === 2) {
      const size = w.pool === '8-double' ? 2 : 1;
      content = `<h2>${size === 2 ? 'Zwei Teams. Vier Personen.' : 'Wer steht am Tisch?'}</h2><p class="muted">Du spielst selbst mit. Alle Personen benötigen ein eigenes registriertes Profil.</p><div class="invite-choice"><h3>Mit eigenem Handy beitreten</h3><p>Jede Person meldet sich selbst an und wählt ihre Seite.</p><button class="btn primary" type="button" data-action="create-lobby">Per QR-Code oder Link einladen</button></div><h3>Oder registrierte Personen auswählen</h3>${state.playersError ? errorBlock(state.playersError, 'players-retry') : ''}${!state.players ? loading('Registrierte Personen werden geladen …') : `<div class="form-grid teams-grid">${[0, 1].map(team => `<section class="team-panel"><h3>${size === 2 ? `Team ${team ? 'B' : 'A'}` : team ? 'Gegenseite' : 'Du'}</h3>${Array.from({length: size}, (_, slot) => playerSelect(team, slot)).join('')}</section>`).join('')}</div><p class="hint">Jede Person kann nur einmal teilnehmen.${size === 2 ? ' Beide Teammitglieder erhalten den vollen gemeinsamen Sieg oder die gemeinsame Niederlage.' : ''}</p>`}<div class="actions"><button class="btn" type="button" data-action="wizard-back">← Zurück</button><button class="btn primary" type="button" data-action="wizard-next" ${!state.players ? 'disabled' : ''}>Partie prüfen →</button></div>`;
    } else {
      content = `<h2>Alles bereit?</h2><p class="muted">Prüft die Angaben vor dem ersten Stoß. Die Partie wird erst nach der Serverbestätigung angelegt.</p><dl class="summary-list"><div><dt>Disziplin</dt><dd>${e(poolLabel(w.pool))}</dd></div><div><dt>Format</dt><dd>${e(f?.label)}<br><small class="muted">BO${e(f?.best)} · zuerst ${e(f?.wins)} ${f?.wins === 1 ? 'Sieg' : 'Siege'}</small></dd></div>${w.variant ? `<div><dt>Wechsel</dt><dd>${e(VARIANTS[w.variant])}</dd></div>` : ''}${w.pool === '14-single' ? `<div><dt>Punkteziel</dt><dd>${e(w.points_target)} je Runde</dd></div>` : ''}${[0, 1].map(team => `<div><dt>${w.pool === '8-double' ? `Team ${team ? 'B' : 'A'}` : team ? 'Gegenseite' : 'Du'}</dt><dd>${e(w.teams[team].map(playerName).join(' & '))}</dd></div>`).join('')}</dl>${fx ? fx.matchup(w, state) : ''}<div class="callout"><p>Beide Seiten dürfen zuerst eintragen. Die Gegenseite bestätigt oder widerspricht auf ihrem eigenen Handy im eigenen angemeldeten Profil. Im Doppel reicht genau eine Person des gegnerischen Teams für alle vier.</p></div>${state.playersError ? errorBlock(state.playersError, 'players-retry') : ''}<div class="actions"><button class="btn" type="button" data-action="wizard-back">← Zurück</button><button class="btn primary" type="button" data-action="start-match">${busyText('Partie starten')}</button></div>`;
    }
    return `<div class="narrow"><a href="#spielen" class="back-link">← Spielen</a><div class="page-heading"><p class="eyebrow">Neue Begegnung</p><h1>Partie starten</h1><p class="muted">${step === 1 ? 'Erst festlegen. Dann anstoßen.' : `${e(poolLabel(w.pool))}${f ? ` · ${e(f.label)}` : ''}`}</p></div><ol class="steps" aria-label="Fortschritt">${['Disziplin & Format', 'Personen & Teams', 'Prüfen & starten'].map((label, i) => `<li class="${step === i + 1 ? 'active' : step > i + 1 ? 'complete' : ''}" ${step === i + 1 ? 'aria-current="step"' : ''}>Schritt ${i + 1}<span>${label}</span></li>`).join('')}</ol>${state.wizardConflict ? '<div class="callout warning"><p>Der Start wurde wegen eines Konflikts abgelehnt. Lade die registrierten Personen ausdrücklich neu und prüfe deine Auswahl. Dein Entwurf bleibt erhalten.</p><button class="btn small" type="button" data-action="players-retry">Serverstand laden</button></div>' : ''}<div class="panel">${content}</div>${state.storageFailed ? '<p class="hint">Dieser Browser erlaubt keine Entwurfsspeicherung. Lass den Tab geöffnet.</p>' : '<p class="hint">Dein Entwurf bleibt beim Tabwechsel und Neuladen in diesem Browser-Tab erhalten.</p>'}<button class="text-button" type="button" data-action="wizard-reset">Entwurf zurücksetzen</button></div>`;
  }
  function playerName(id) {
    if (String(id) === String(state.session?.user?.id)) return state.session.user.name;
    return state.players?.find(p => String(p.id) === String(id))?.name || 'Person nicht verfügbar';
  }
  function playerSelect(team, slot) {
    const value = String(state.wizard.teams[team]?.[slot] || '');
    const own = team === 0 && slot === 0;
    const used = state.wizard.teams.flat().map(String).filter(Boolean);
    const players = state.players || [];
    return `<label class="field"><span>${own ? 'Dein Profil' : `Person ${slot + 1}`}</span><select id="player-${team}-${slot}" data-team="${team}" data-slot="${slot}" required ${own ? 'disabled' : ''}><option value="">Person auswählen</option>${own ? `<option value="${e(state.session.user.id)}" selected>${e(state.session.user.name)} (du)</option>` : `${value && !players.some(p => String(p.id) === value) ? `<option value="${e(value)}" selected>Person nicht mehr verfügbar</option>` : ''}${players.map(p => `<option value="${e(p.id)}" ${String(p.id) === value ? 'selected' : ''} ${used.includes(String(p.id)) && String(p.id) !== value ? 'disabled' : ''}>${e(p.name)}</option>`).join('')}`}</select></label>`;
  }
  function validateWizard(step = 3) {
    const w = state.wizard;
    if (!POOLS[w.pool]) return 'Bitte eine Disziplin auswählen.';
    if (!FORMATS.some(f => f.best === Number(w.best_of))) return 'Bitte vor dem Start ein aktuelles Format auswählen.';
    if (w.pool === '8-double' && !VARIANTS[w.variant]) return 'Bitte Aufnahmewechsel oder Stoßwechsel auswählen.';
    if (w.pool === '14-single' && (!/^\d+$/.test(String(w.points_target)) || Number(w.points_target) < 10 || Number(w.points_target) > 200)) return 'Das Punkteziel muss eine ganze Zahl zwischen 10 und 200 sein.';
    if (step < 2) return '';
    if (!state.session?.authenticated) return 'Bitte zuerst anmelden. Dein Entwurf bleibt erhalten.';
    if (!state.players || state.playersError) return 'Bitte die registrierten Personen erneut laden.';
    const ids = w.teams.flat(), size = w.pool === '8-double' ? 2 : 1;
    if (w.teams.some(t => t.length !== size) || ids.some(id => typeof id !== 'string' || id.length === 0)) return 'Bitte alle Personen auswählen.';
    if (new Set(ids).size !== ids.length) return 'Jede Person darf nur einmal teilnehmen.';
    if (!ids.includes(state.session.user.id)) return 'Du musst selbst an der Partie teilnehmen.';
    if (ids.some(id => !state.players.some(p => p.id === id))) return 'Eine ausgewählte Person ist nicht mehr verfügbar. Bitte Auswahl prüfen.';
    return '';
  }

  function authGate(text) {
    return `<div class="narrow"><div class="empty-state"><p class="eyebrow">Dein Profil am Tisch</p><h1>Bitte anmelden</h1><p>${e(text)}</p><a class="btn primary" href="#profil" data-action="login-return">Zur Anmeldung</a></div></div>`;
  }
  function ensureEdit(m, open = false) {
    const id = String(m.id);
    let edit = state.edits[id];
    if (!edit || typeof edit !== 'object' || !Array.isArray(edit.rounds)) {
      const source = openProposal(m) || m.result;
      edit = {
        baseVersion: m.version, proposalId: m.proposal?.id ?? null, open,
        score_a: source ? String(source.score_a) : '', score_b: source ? String(source.score_b) : '',
        rounds: source?.rounds?.length ? source.rounds.map(r => ({a: String(r.a), b: String(r.b), winner_id: r.winner_id ?? '', reason: r.reason ?? ''})) : [{a: '', b: ''}],
        reason: '', disputeReason: '', voidReason: ''
      };
      state.edits[id] = edit;
      persist();
    }
    return edit;
  }
  function staleEdit(m) {
    const edit = state.edits[String(m.id)];
    return !!state.conflicts[String(m.id)] || !!edit && (Number(edit.baseVersion) !== Number(m.version) || (edit.proposalId ?? null) !== (m.proposal?.id ?? null));
  }
  function conflictPanel(m) {
    if (['aborted', 'void'].includes(m.status) || m.pool === '14-single' && !directResultAllowed(m) && !m.proposal) return '';
    if (m.status === 'confirmed' && !state.edits[String(m.id)]?.open && !m.can_confirm && !m.can_dispute) return '';
    if (!staleEdit(m)) return '';
    const reviewed = state.conflicts[String(m.id)] === 'review';
    return `<div class="callout warning" role="status"><p><strong>Der Serverstand muss geprüft werden.</strong><br>Deine Eingaben bleiben erhalten. Lade den aktuellen Stand und vergleiche Ergebnis und Vorschlag, bevor du erneut sendest.</p><button class="btn small" type="button" data-action="detail-refresh">Aktuellen Stand laden</button>${reviewed ? '<button class="btn small" type="button" data-action="adopt-version">Stand geprüft · Entwurf beibehalten</button>' : ''}</div>`;
  }
  function directResultAllowed(m) { return !!m.result || scorekeeper.disputeRecoveryAllowed(m) || scorekeeper.legacyAllowed(m); }
  function manualCorrection(m) { return m.pool === '14-single' && (!!m.result || scorekeeper.disputeRecoveryAllowed(m)); }
  function confirmationHelp(m) {
    return m.pool === '8-double'
      ? 'Jede der vier Personen darf zuerst eintragen. Genau eine Person der Gegenseite bestätigt auf ihrem eigenen Handy im eigenen angemeldeten Profil für alle vier. Die eintragende Person und ihr Partner bestätigen den eigenen Vorschlag nicht.'
      : 'Beide Seiten dürfen zuerst eintragen. Die Gegenseite öffnet die Partie auf ihrem eigenen Handy im eigenen angemeldeten Profil und bestätigt dort. Erst dann wird die Begegnung gewertet.';
  }
  function correctionRoundFields(m, round, index) {
    if (!manualCorrection(m)) return '';
    return `${scorekeeper.disputeRecoveryAllowed(m) && index >= scorekeeper.originalRoundCount(m) ? '<p class="hint">Zusätzliche manuell erfasste, tatsächlich gespielte Runde · kein ursprüngliches Spielblatt.</p>' : ''}<div class="form-grid"><label class="field"><span>Runde ${index + 1}: Sieger ausdrücklich wählen</span><select id="round-${index}-winner" data-round="${index}" data-round-field="winner_id" required><option value="">Rundensieger wählen</option>${m.teams.flat().map(p => `<option value="${e(p.id)}" ${p.id === round.winner_id ? 'selected' : ''}>${e(p.name)}</option>`).join('')}</select></label><label class="field"><span>Rundenbegründung bei Aufgabe oder abweichendem Punktestand</span><textarea id="round-${index}-reason" data-round="${index}" data-round-field="reason" maxlength="1000">${e(round.reason || '')}</textarea></label></div>`;
  }
  function renderMatch() {
    if (!state.session?.authenticated) return authGate('Melde dich an, um deine Partie und ihre Ergebnisse zu sehen. Deine Eingaben bleiben erhalten.');
    const id = route().id;
    const m = state.detail && String(state.detail.id) === id ? state.detail : null;
    if (!m) return `<div class="narrow"><a class="back-link" href="#spielen">← Offene Partien</a>${state.detailError ? errorBlock(state.detailError, 'detail-refresh') : loading('Partie wird geladen …')}</div>`;
    const edit = ensureEdit(m, !!m.can_propose && !m.result);
    const source = m.result || openProposal(m);
    const canEdit = m.can_propose && !['void', 'aborted', 'pending'].includes(m.status);
    const correction = !!m.result;
    const proposal = openProposal(m);
    const ownSide = m.teams?.findIndex(team => team.some(p => p.id === state.session.user.id)) ?? -1;
    return `<div class="narrow live-match"><a class="back-link" href="#spielen">← Zurück</a><div class="live-heading"><p class="eyebrow">BILLARDCAFÉ MERZIG / RANGLISTE</p><div class="live-title-line"><h1>Am Tisch</h1>${badge(m.status)}</div><p class="muted">${m.status === 'playing' ? 'Die Partie ist noch nicht abgeschlossen.' : m.status === 'pending' ? 'Das Ergebnis wartet auf Bestätigung.' : m.status === 'confirmed' ? 'Die Partie ist gemeinsam bestätigt.' : m.status === 'disputed' ? 'Klärt das Ergebnis miteinander.' : 'Diese Partie ist beendet.'}</p></div><div class="live-mode-line"><span>${e(poolLabel(m.pool))}</span><span>${e(formatLabel(m))}</span>${m.variant ? `<span>${e(VARIANTS[m.variant] || m.variant)}</span>` : ''}${m.points_target ? `<span>${e(m.points_target)} Punkte je Runde</span>` : ''}</div><div class="scoreboard live-scoreboard"><div class="live-score-pair">${[0,1].map(side => `<div class="live-score-side"><strong>${e(teamName(m.teams?.[side]))}</strong><small>${ownSide < 0 ? '' : side === ownSide ? (m.pool==='8-double'?'Dein Team':'Du') : 'Gegenseite'}</small><b>${source ? e(side===0?source.score_a:source.score_b) : '–'}</b></div>${side===0?'<span class="live-score-divider" aria-hidden="true">:</span>':''}`).join('')}</div><p class="score-caption">${m.status === 'aborted' ? 'Abgebrochen · ohne Wertung' : m.status === 'void' ? 'Annulliert · ohne Wertung' : m.result ? 'Aktuell gewertetes Ergebnis' : proposal ? 'Ergebnisvorschlag · noch nicht gewertet' : 'Partie läuft · noch kein Ergebnis eingetragen'}</p>${roundsSummary(source?.rounds,m)}${m.result && m.confirmed_at ? `<p class="confirmed-time">Bestätigt am ${e(date(m.confirmed_at))} · Europe/Berlin</p>` : ''}${proposal && m.result ? `<div class="result-block"><h3>${proposal.is_correction ? 'Korrektur vorgeschlagen · noch nicht gewertet' : 'Neuer Ergebnisvorschlag'}</h3><div class="teams-row"><span class="muted">${e(teamName(m.teams?.[0]))}</span><span class="score">${e(proposal.score_a)} : ${e(proposal.score_b)}</span><span class="muted">${e(teamName(m.teams?.[1]))}</span></div>${roundsSummary(proposal.rounds,m)}</div>` : ''}</div>${proposal ? `<div class="callout ${m.status === 'disputed' ? 'warning' : ''}"><p><strong>${proposal.is_correction ? 'Korrektur zur Prüfung' : 'Ergebnis zur Prüfung'}</strong><br>${e(proposalStatus(m))}</p>${proposal.reason ? `<p>Begründung: ${e(proposal.reason)}</p>` : ''}${proposal.is_correction ? '<p>Das bisher bestätigte Ergebnis bleibt bis zur Annahme der Korrektur gewertet.</p>' : ''}</div>` : ''}${m.status === 'void' ? '<div class="callout warning"><p>Diese Partie wurde annulliert. Sie bleibt im Verlauf sichtbar und zählt nicht zur Wertung.</p></div>' : ''}${typeof m.dispute_reason === 'string' ? `<div class="callout warning"><p>Widerspruch: ${e(m.dispute_reason)}</p></div>` : ''}${typeof m.void_reason === 'string' ? `<p class="muted">Grund der Annullierung: ${e(m.void_reason)}</p>` : ''}${m.pool === '14-single' && m.result ? '<div class="callout"><p><strong>Aktuell akzeptiertes Ergebnis</strong><br>Das oben angezeigte Ergebnis ist für die Wertung maßgeblich. Die gespeicherten Original-Spielblätter dokumentieren den unveränderten ursprünglichen Verlauf. Eine begründete Ersatzkorrektur wird erst durch die Bestätigung der Gegenseite wirksam.</p></div>' : ''}${scorekeeper.panel(m)}${m.status === 'aborted' ? '<div class="callout"><p>Abgebrochen. Der Verlauf bleibt erhalten; keine Siege, Niederlagen, Rangänderungen oder Platzierungsbegegnung.</p></div>' : ''}${state.detailError ? errorBlock(state.detailError, 'detail-refresh') : ''}${conflictPanel(m)}${proposal && (m.can_confirm || m.can_dispute) ? `<section class="panel"><h2>${proposal.is_correction ? 'Korrektur prüfen' : 'Stimmt das Ergebnis?'}</h2><p class="muted">Prüfe die Seiten und ${m.pool === '14-single' ? 'alle Rundenergebnisse' : 'Spielstände'}. ${e(confirmationHelp(m))}</p>${m.can_confirm ? `<button type="button" class="btn primary full" data-action="confirm-result" ${staleEdit(m) ? 'disabled' : ''}>${busyText(proposal.is_correction ? 'Korrektur bestätigen' : 'Ergebnis bestätigen')}</button>` : ''}${m.can_dispute ? `<form data-form="dispute"><label class="field editor-reason"><span>Begründung für einen Widerspruch</span><textarea id="dispute-reason" data-edit="disputeReason" required maxlength="1000" placeholder="Was stimmt am Ergebnis nicht?">${e(edit.disputeReason)}</textarea></label><button class="btn" type="submit" ${staleEdit(m) ? 'disabled' : ''}>${busyText('Mit Begründung widersprechen')}</button></form>` : ''}</section>` : ''}${canEdit && !edit.open && directResultAllowed(m) ? `<section class="panel"><h2>${correction ? 'Ergebnis korrigieren' : 'Ergebnis festhalten'}</h2><p class="muted">${correction ? 'Eine begründete Korrektur benötigt erneut die Bestätigung der Gegenseite.' : 'Trage das vollständige Ergebnis der Begegnung ein.'}</p><button class="btn" type="button" data-action="open-editor">${correction ? 'Korrektur vorschlagen' : 'Ergebnis eintragen'}</button></section>` : ''}${edit.open && !['aborted', 'void'].includes(m.status) && directResultAllowed(m) ? resultEditor(m, edit, canEdit) : ''}${scorekeeper.abortPanel(m)}<details><summary>Zeitpunkte &amp; Verlauf</summary><dl class="summary-list"><div><dt>Angelegt</dt><dd>${e(date(m.created_at))}</dd></div><div><dt>Gespielt / beendet</dt><dd>${m.played_at ? e(date(m.played_at)) : 'Noch nicht erfasst'}</dd></div><div><dt>Bestätigt</dt><dd>${m.confirmed_at ? e(date(m.confirmed_at)) : 'Noch nicht bestätigt'}</dd></div></dl><p class="hint">Alle Zeiten in Europe/Berlin. Für den Ranglistenmonat zählt die endgültige Bestätigung.</p>${renderAudit(m)}</details>${state.session.user.is_admin && m.status !== 'void' ? `<details class="admin-panel"><summary>Administration · Partie annullieren</summary><p>Die Partie bleibt im Verlauf. Die Wertung wird serverseitig neu berechnet.</p><form data-form="void"><label class="field"><span>Pflichtbegründung</span><textarea data-edit="voidReason" required maxlength="1000" placeholder="Warum wird diese Partie annulliert?">${e(edit.voidReason)}</textarea></label><button class="btn danger" type="submit" ${staleEdit(m) ? 'disabled' : ''}>${busyText('Partie mit Begründung annullieren')}</button></form></details>` : ''}<div class="actions"><button class="btn small" data-action="detail-refresh" type="button">Serverstand aktualisieren</button><a href="#profil" class="text-button">Zum eigenen Verlauf</a></div>${syncNote()}</div>`;
  }
  function proposalStatus(m) {
    const proposer = m.teams?.flat().find(p => String(p.id) === String(m.proposal?.proposer_id));
    const prefix = proposer ? `Vorschlag von ${proposer.name}. ` : '';
    if (m.status === 'disputed') return `${prefix}Es wurde widersprochen. Bitte klärt das Ergebnis miteinander und reicht einen passenden Vorschlag ein.`;
    return `${prefix}${m.can_confirm ? 'Du kannst diesen Vorschlag im eigenen angemeldeten Profil als Gegenseite bestätigen.' : 'Die Gegenseite bestätigt im eigenen angemeldeten Profil auf ihrem Handy.'}${m.pool === '8-double' ? ' Genau eine Person des gegnerischen Teams bestätigt einmal für alle vier.' : ''}`;
  }
  function roundsSummary(rounds,m) {
    return Array.isArray(rounds) && rounds.length ? `<ol class="round-summary" aria-label="Rundenergebnisse">${rounds.map((r, i) => `<li>R${i + 1}: ${e(r.a)} : ${e(r.b)}${r.winner_id ? ` · Sieger: ${e(m?.teams?.flat().find(p => p.id === r.winner_id)?.name || 'nicht verfügbar')}` : ''}${r.reason ? ` · ${e(r.reason)}` : ''}</li>`).join('')}</ol>` : '';
  }
  function renderAudit(m) {
    // Optional backend additions; never infer events that the server did not supply.
    const events = m.audit_events || m.audit || m.events;
    if (!Array.isArray(events)) return '';
    const labels = {created: 'Partie angelegt', result_proposed: 'Ergebnis vorgeschlagen', confirmed: 'Ergebnis bestätigt', disputed: 'Ergebnis widersprochen', correction_proposed: 'Korrektur vorgeschlagen', void: 'Partie annulliert', voided: 'Partie annulliert', aborted: 'Partie abgebrochen'};
    return `<ul class="activity-list">${events.map(event => `<li><strong>${e(labels[event.action || event.event_type || event.type] || event.label || 'Partie aktualisiert')}</strong>${event.created_at || event.at ? `<time>${e(date(event.created_at || event.at))}</time>` : ''}${event.reason ? `<p>${e(event.reason)}</p>` : ''}</li>`).join('')}</ul>`;
  }
  function resultEditor(m, edit, allowed) {
    const correction = !!m.result;
    const validation = validateResult(m, edit);
    return `<section class="panel result-editor" aria-labelledby="result-title"><h2 id="result-title">${correction ? 'Korrektur vorschlagen' : 'Ergebnis eintragen'}</h2><p class="muted">${m.pool === '14-single' ? `Alle Runden mit Punkten erfassen. Ziel je Runde: ${e(m.points_target)}; zum Satzgewinn: ${e(targetWins(m))} gewonnene ${targetWins(m) === 1 ? 'Runde' : 'Runden'}. Foulpunkte dürfen negativ sein, z. B. 50 : -1. Ein legaler letzter Stoß darf das Punkteziel überschreiten.` : `Gewonnene Spiele eintragen. Eine Seite muss genau ${e(targetWins(m))} erreichen, die andere bleibt darunter.`}</p>${!allowed ? '<div class="callout warning"><p>Der aktuelle Serverstatus erlaubt gerade keinen neuen Vorschlag. Dein Entwurf bleibt erhalten.</p></div>' : ''}${manualCorrection(m) ? '<div class="callout"><p>Begründete Ersatzkorrektur: Nur tatsächlich gespielte Runden erfassen; weitere gespielte Runden dürfen bis zum BO-Limit ergänzt werden. Pro Runde Punkte und Rundensieger ausdrücklich festlegen. Bei Aufgabe, Unterschreiten des Ziels oder widersprechendem Punktestand ist eine Rundenbegründung erforderlich. Die Original-Spielblätter bleiben unverändert und lesbar.</p></div>' : ''}<form data-form="result">${m.pool === '14-single' ? `<div id="round-fields">${edit.rounds.map((round, i) => `<div class="round-row"><span class="round-number" aria-label="Runde ${i + 1}">R${i + 1}</span>${['a', 'b'].map((side, team) => `<label class="field"><span>${e(teamName(m.teams?.[team]))} · R${i + 1}</span><input id="round-${i}-${side}" type="text" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="z. B. -1" required value="${e(round[side])}" data-round="${i}" data-side="${side}"></label>`).join('')}<button class="round-remove" type="button" data-remove-round="${i}" aria-label="Runde ${i + 1} entfernen" ${edit.rounds.length <= 1 ? 'disabled' : ''}>×</button></div>${correctionRoundFields(m, round, i)}`).join('')}</div><div class="round-actions"><button class="btn small" type="button" data-action="add-round" ${edit.rounds.length >= Number(m.best_of) ? 'disabled' : ''}>+ Runde hinzufügen</button><output class="derived-score" id="derived-score" aria-live="polite">Satzstand: ${validation.score ? `${validation.score.score_a} : ${validation.score.score_b}` : '– : –'}</output></div>` : `<div class="score-inputs"><label class="field"><span>${e(teamLabel(m, 0))}</span><input id="score-a" type="number" inputmode="numeric" min="0" max="${e(targetWins(m))}" step="1" required value="${e(edit.score_a)}" data-edit="score_a"></label><span class="separator" aria-hidden="true">:</span><label class="field"><span>${e(teamLabel(m, 1))}</span><input id="score-b" type="number" inputmode="numeric" min="0" max="${e(targetWins(m))}" step="1" required value="${e(edit.score_b)}" data-edit="score_b"></label></div>`}<p id="result-validation" class="editor-validation ${validation.error ? 'invalid' : ''}" aria-live="polite">${e(validation.error || 'Das Ergebnis ist vollständig. Es wird erst nach der Bestätigung der Gegenseite gewertet.')}</p>${correction || m.status === 'disputed' ? `<label class="field editor-reason"><span>${correction || scorekeeper.disputeRecoveryAllowed(m) ? 'Begründung der Korrektur (Pflicht)' : 'Erläuterung zum neuen Vorschlag (optional)'}</span><textarea id="result-reason" data-edit="reason" ${correction || scorekeeper.disputeRecoveryAllowed(m) ? 'required' : ''} maxlength="1000" placeholder="Was wurde berichtigt?">${e(edit.reason)}</textarea></label>` : ''}<div class="actions"><button class="btn" type="button" data-action="close-editor">Entwurf einklappen</button><button class="btn primary" type="submit" ${!allowed || staleEdit(m) ? 'disabled' : ''}>${busyText(correction ? 'Korrektur einreichen' : 'Ergebnis vorschlagen')}</button></div><p class="hint">${m.pool === '8-double' ? 'Nur das gemeinsame Teamergebnis wird erfasst. ' : ''}${e(confirmationHelp(m))} Du erhältst eine Sendebestätigung, sobald der Server den Vorschlag angenommen hat.</p></form></section>`;
  }
  function validateResult(m, edit) {
    const wins = targetWins(m);
    const integer = value => /^\d+$/.test(String(value));
    const signedInteger = value => /^[+-]?\d+$/.test(String(value)) && Number.isSafeInteger(Number(value));
    if (m.pool !== '14-single') {
      if (!integer(edit.score_a) || !integer(edit.score_b)) return {error: 'Bitte beide Spielstände als ganze Zahlen eingeben.'};
      const a = Number(edit.score_a), b = Number(edit.score_b);
      if (!((a === wins && b < wins) || (b === wins && a < wins))) return {error: `Eine Seite muss genau ${wins} ${wins === 1 ? 'Spiel' : 'Spiele'} gewinnen. Die andere Seite bleibt darunter.`};
      return {score: {score_a: a, score_b: b, rounds: null}};
    }
    const target = Number(m.points_target);
    let a = 0, b = 0, error = '';
    const rounds = [];
    if (!edit.rounds.length || edit.rounds.length > Number(m.best_of)) return {error: 'Die Anzahl der Runden passt nicht zum Format.'};
    for (let i = 0; i < edit.rounds.length; i++) {
      if (a >= wins || b >= wins) { error = `Runde ${i + 1} liegt nach dem Satzende. Bitte diese und weitere Runden entfernen.`; break; }
      const r = edit.rounds[i];
      if (!signedInteger(r.a) || !signedInteger(r.b)) { error = `Bitte die Punkte für beide Seiten in Runde ${i + 1} als ganze Zahlen eintragen. Foulpunkte dürfen negativ sein.`; break; }
      const ra = Number(r.a), rb = Number(r.b);
      if (manualCorrection(m)) {
        const side = m.teams.findIndex(team => team.some(p => p.id === r.winner_id));
        const reason = String(r.reason || '').trim();
        if (side < 0) { error = `Runde ${i + 1}: Bitte einen Mitspieler dieser Partie ausdrücklich als Sieger auswählen.`; break; }
        if (reason.length > 1000) { error = `Runde ${i + 1}: Die Begründung darf höchstens 1000 Zeichen enthalten.`; break; }
        const points = side === 0 ? ra : rb, other = side === 0 ? rb : ra;
        if ((points < target || points <= other) && !reason) { error = `Runde ${i + 1}: Bitte Aufgabe oder die vom Punktestand abweichende Siegerwahl begründen.`; break; }
        if (side === 0) a++; else b++;
        rounds.push({a: ra, b: rb, winner_id: r.winner_id, reason: reason || null});
      } else {
        if (!((ra >= target && rb < target) || (rb >= target && ra < target))) { error = `Runde ${i + 1}: Eine Seite erreicht mindestens ${target} Punkte, die andere bleibt darunter.`; break; }
        if (ra >= target) a++; else b++;
        rounds.push({a: ra, b: rb});
      }
    }
    const score = {score_a: a, score_b: b, rounds};
    if (!error && a < wins && b < wins) error = `Der Satz ist noch nicht vollständig. Eine Seite benötigt ${wins} gewonnene ${wins === 1 ? 'Runde' : 'Runden'}.`;
    return {error, score};
  }
  function updateValidation() {
    if (route().view !== 'match' || !state.detail) return;
    const result = validateResult(state.detail, ensureEdit(state.detail));
    const hint = document.querySelector('#result-validation');
    if (hint) { hint.textContent = result.error || 'Das Ergebnis ist vollständig. Es wird erst nach der Bestätigung der Gegenseite gewertet.'; hint.classList.toggle('invalid', !!result.error); }
    const out = document.querySelector('#derived-score');
    if (out) out.textContent = `Satzstand: ${result.score ? `${result.score.score_a} : ${result.score.score_b}` : '– : –'}`;
  }

  function renderBoard() {
    const data = state.board && state.board.pool === state.boardPool && state.board.month === state.boardMonth ? state.board : null;
    const months = [...new Set([currentMonth(), state.boardMonth, ...state.months])].sort().reverse();
    let body = '';
    if (!data && !state.boardError) body = loading('Monatsrangliste wird geladen …');
    if (state.boardError) body += errorBlock(state.boardError, 'refresh');
    if (data) body += data.rows?.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Monatsrangliste, bei Bedarf seitlich scrollen"><table><caption class="sr-only">${e(poolLabel(data.pool))}, ${e(monthLabel(data.month))}</caption><thead><tr><th scope="col">Platz</th><th scope="col">Nickname</th><th scope="col">Rang</th><th class="numeric" scope="col"><abbr title="Begegnungen">Sp.</abbr></th><th class="numeric" scope="col"><abbr title="Siege">S</abbr></th><th class="numeric" scope="col"><abbr title="Niederlagen">N</abbr></th></tr></thead><tbody>${data.rows.map(row => `<tr ${String(row.player.id) === String(state.session?.user?.id) ? 'class="own-row"' : ''}><td class="place">${row.provisional || row.place == null ? '–' : e(row.place)}</td><th class="player-name" scope="row">${e(row.player.name)}${String(row.player.id) === String(state.session?.user?.id) ? '<small>Dein Profil</small>' : ''}</th><td><span class="rank-label">${e(row.rank || 'Platzierung')}</span>${row.provisional || !row.rank ? `<span class="placement-label">${e(Math.min(4, Number(row.placement_games) || 0))}/4 bestätigt</span>` : ''}${row.protected_until ? `<span class="placement-label">Geschützt bis ${e(date(row.protected_until, false))}</span>` : ''}</td><td class="numeric">${e(row.games)}</td><td class="numeric">${e(row.wins)}</td><td class="numeric">${e(row.losses)}</td></tr>`).join('')}</tbody></table></div>` : blank(state.boardMonth === currentMonth() ? 'Neuer Monat. Freier Tisch.' : 'Hier wurde noch nicht gewertet.', `Für ${monthLabel(state.boardMonth)} gibt es in ${poolLabel(state.boardPool)} noch keine bestätigten Begegnungen. Dein persönlicher Rang wird über Monate hinweg weitergeführt.`);
    return `<div class="page-heading"><p class="eyebrow">Monatswertung · Europe/Berlin</p><h1>Rangliste</h1><p class="muted">Am Tisch erspielt. Gemeinsam bestätigt.</p></div><div class="filters"><label class="field"><span>Disziplin</span><select id="board-pool" data-filter="boardPool">${poolOptions(state.boardPool)}</select></label><label class="field"><span>Monat</span><select id="board-month" data-filter="boardMonth">${months.map(month => `<option value="${e(month)}" ${month === state.boardMonth ? 'selected' : ''}>${e(monthLabel(month))}${month === currentMonth() ? ' · aktuell' : ''}</option>`).join('')}</select></label><button type="button" class="btn" data-action="refresh">Aktualisieren</button></div>${fx ? fx.board(data, body, state) : body}<p class="table-caption">Sp. = Begegnungen · S = Siege · N = Niederlagen. Vor dem ersten Rang: vier bestätigte Begegnungen je Disziplin. Angaben der Tabelle beziehen sich auf den gewählten Monat.</p><div class="callout"><p>Für den Monat zählt die endgültige Bestätigung des Ergebnisses in Europe/Berlin. Deine persönliche Spielstärke und dein Rang werden in den nächsten Monat übernommen. Die Monatstabelle startet leer.</p><p>4., 3., 2. und 1. Café-Liga sind unsere vorläufigen Café-Ligen, keine offiziellen Fargo- oder Elo-Einstufungen.</p><a href="#profil/hilfe">Mehr zur Wertung</a></div>`;
  }
  function poolOptions(selected, all = false) {
    return `${all ? `<option value="" ${!selected ? 'selected' : ''}>Alle Disziplinen</option>` : ''}${Object.entries(POOLS).map(([key, pool]) => `<option value="${key}" ${selected === key ? 'selected' : ''}>${pool.label}${key !== '8-double' ? ' · Einzel' : ''}</option>`).join('')}`;
  }
  function renderProfile() {
    if (remote && !state.session?.authenticated) return installHTML() + '<div class="auth-panel"><div class="auth-intro"><p class="eyebrow">Dein Platz am Tisch</p><h1>Willkommen zurück.</h1><p class="muted">Deine Partien und dein persönlicher Rang.</p></div><section class="panel"><p>Für Anmeldung oder Registrierung öffnet sich kurz die geschützte Profilseite. Danach kommst du hierher zurück.</p><button class="btn primary full" type="button" data-action="remote-login">Anmelden / Registrieren</button><p class="hint">Du wählst dein eigenes Profil. Eine Einladung trittst du anschließend ausdrücklich bei.</p></section><a href="#rangliste">Rangliste ohne Anmeldung ansehen</a></div>' + helpHTML();
    if (!state.session?.authenticated) return installHTML() + `<div class="auth-panel"><div class="auth-intro"><p class="eyebrow">Dein Platz am Tisch</p><h1>${state.authMode === 'register' ? 'Profil anlegen' : 'Willkommen zurück.'}</h1><p class="muted">Ein Nickname. Deine sechsstellige PIN.<br>Deine Partien und dein persönlicher Rang.</p></div><div class="panel"><div class="auth-modes" aria-label="Anmeldung oder Registrierung"><button type="button" data-auth-mode="login" aria-pressed="${state.authMode === 'login'}">Anmelden</button><button type="button" data-auth-mode="register" aria-pressed="${state.authMode === 'register'}">Registrieren</button></div>${state.authError ? errorBlock(state.authError) : ''}<form data-form="auth"><label class="field"><span>Nickname</span><input id="auth-name" name="name" type="text" autocomplete="username" required maxlength="40" value="${e(state.authName)}" placeholder="Dein Name am Tisch" autocapitalize="none" spellcheck="false"></label><label class="field"><span>Persönliche PIN · 6 Ziffern</span><input id="auth-pin" class="pin-field" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="${state.authMode === 'register' ? 'new-password' : 'current-password'}" required placeholder="••••••" aria-describedby="pin-help"><small id="pin-help">${state.authMode === 'register' ? 'Wähle eine eigene PIN und behalte sie für dich. Jede Person registriert ihr Profil selbst.' : 'Deine PIN wird nicht als Entwurf gespeichert.'}</small></label><button class="btn primary full" type="submit">${busyText(state.authMode === 'register' ? 'Eigenes Profil registrieren' : 'Anmelden')}</button></form></div><p class="auth-note">Ohne E-Mail. Keine automatisch angelegten Mitspieler.<br><a href="#rangliste">Rangliste ohne Anmeldung ansehen</a></p><button class="text-button" type="button" data-action="clear-drafts">Lokale Eingabeentwürfe löschen</button></div>${helpHTML()}`;
    const me = state.me;
    return `<div class="profile-header"><div><p class="eyebrow">Dein Profil</p><h1>${e(state.session.user.name)}</h1><p class="muted">Fünf Disziplinen. Dein persönlicher Fortschritt.</p></div><button class="btn small" type="button" data-action="profile-switch">${busyText('Profil wechseln')}</button></div>${state.meError ? errorBlock(state.meError, 'refresh') : ''}${!me && state.loading ? loading('Profil wird geladen …') : ''}${me ? `<section aria-labelledby="ratings-title"><h2 id="ratings-title" class="sr-only">Persönliche Wertungen</h2><div class="rating-grid">${Object.keys(POOLS).map(pool => ratingCard(pool, me.ratings?.[pool])).join('')}</div>${fx ? fx.profileExtras() : ''}</section><section aria-labelledby="history-title"><div class="section-heading"><h2 id="history-title">Dein Partienverlauf</h2><button class="text-button" type="button" data-action="refresh">Aktualisieren</button></div><div class="filters"><label class="field"><span>Disziplin</span><select id="history-pool" data-filter="historyPool">${poolOptions(state.historyPool, true)}</select></label><label class="field"><span>Doppel-Wechselart</span><select id="history-variant" data-filter="historyVariant" ${state.historyPool && state.historyPool !== '8-double' ? 'disabled' : ''}><option value="">Beide Wechselarten</option>${Object.entries(VARIANTS).map(([value, label]) => `<option value="${value}" ${state.historyVariant === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>${renderHistory(me.matches || [])}</section>` : ''}${helpHTML()}${installHTML()}`;
  }
  function ratingCard(pool, rating) {
    if (!rating) return `<article class="rating-card"><h3>${e(poolLabel(pool))}</h3><p class="rank">Noch keine Wertung</p><p class="hint">Für diese Disziplin liegen keine Profilwerte vor.</p></article>`;
    const n = Math.max(0, Math.min(4, Number(rating.placement_games) || 0));
    return `<article class="rating-card"><h3>${e(poolLabel(pool))}</h3><p class="rank">${e(rating.rank || 'Platzierung')}</p><p class="hint">${n < 4 ? `${n}/4 Begegnungen bestätigt` : 'Platzierung abgeschlossen'}</p>${n < 4 ? `<progress max="4" value="${n}" aria-label="${e(poolLabel(pool))}: ${n} von 4 Platzierungsbegegnungen"></progress>` : ''}${fx ? fx.ratingExtras(pool, rating) : ''}<p class="protection">${rating.protected_until ? `Rang geschützt bis ${e(date(rating.protected_until, false))}` : ''}</p><div class="stats"><div><b>${e(rating.games ?? '–')}</b><span>Partien</span></div><div><b>${e(rating.wins ?? '–')}</b><span>Siege</span></div><div><b>${e(rating.losses ?? '–')}</b><span>Niederlagen</span></div></div>${pool === '8-double' ? '<p class="hint">Persönlich · beide Wechselarten</p>' : ''}</article>`;
  }
  function renderHistory(matches) {
    const filtered = matches.filter(m => (!state.historyPool || m.pool === state.historyPool) && (!state.historyVariant || m.pool === '8-double' && m.variant === state.historyVariant)).sort((a, b) => {
      const at = historyTime(a).time, bt = historyTime(b).time;
      return at !== bt ? (at > bt ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return filtered.length ? `<div class="row-list">${filtered.map(m => matchCard(m, 'history')).join('')}</div>` : blank('Noch keine Partien in dieser Auswahl.', matches.length ? 'Wähle eine andere Disziplin oder Wechselart, um weitere Partien zu sehen.' : 'Deine angelegten und bestätigten Begegnungen erscheinen hier.');
  }
  function helpHTML() {
    return `<section id="hilfe" class="help" aria-labelledby="help-title"><p class="eyebrow">Gut zu wissen</p><h2 id="help-title">Fair spielen. Klar werten.</h2><details ${route().help ? 'open' : ''}><summary>Wann bekomme ich meinen ersten Rang?</summary><p>Nach vier bestätigten, abgeschlossenen Begegnungen in einer Disziplin erscheint dein erster Rang. Ein Einzelspiel, 3er Satz oder 5er Satz zählt jeweils als eine Begegnung. Zusätzliche Anwesenheits-, Tages- oder Wartebedingungen gibt es nicht.</p><p>Alle starten mit derselben verdeckten Spielstärke. Jede bestätigte Begegnung verändert sie, auch während der Platzierung. Sie wird hier nicht als Zahl angezeigt.</p></details><details><summary>Welche Formate gibt es?</summary><p><strong>Einzelnes Spiel:</strong> BO1, zuerst 1 Sieg.<br><strong>3er Satz:</strong> Höchstens drei Spiele; wer zwei gewinnt, gewinnt den Satz.<br><strong>5er Satz:</strong> BO7, zuerst 4 Siege.</p><p>Das Format wird vor jeder Partie festgelegt. Bei 14/1 gilt das gewählte Punkteziel für jede einzelne Runde; gewonnene Runden entscheiden den Satz.</p></details><details><summary>Wie wird Doppel gewertet?</summary><p>Beide Teammitglieder erhalten den vollen gemeinsamen Sieg oder die gemeinsame Niederlage. Individuelle Beiträge werden nicht erfasst. Dein persönlicher Doppelrang ist vom Einzel getrennt und bleibt bei Partnerwechseln bestehen.</p><p>Aufnahmewechsel: Ein Partner spielt die ganze Aufnahme, bei der nächsten Teamaufnahme ist der andere dran. Stoßwechsel: Die Partner wechseln sich bei jedem Stoß ab. Beide Varianten teilen die persönliche Doppelwertung und lassen sich im Verlauf getrennt filtern.</p></details><details><summary>Monatswechsel, Ränge &amp; Rangschutz</summary><p>Für den Monat einer Begegnung zählt die endgültige Bestätigung in Europe/Berlin, nicht ihr Start oder Spielende. Die Monatstabelle enthält nur Personen mit einem bestätigten Ergebnis in diesem Monat. Der aktuelle Monat startet leer; Spielstärke und Rang bleiben über Monats- und Jahresgrenzen bestehen.</p><p>Ein neuer Rang ist bis zum nächsten Monatsbeginn geschützt. Währenddessen verändern auch Niederlagen die verdeckte Spielstärke. Der Kalender allein stuft niemanden herab. Ein angezeigter geschützter Rang kann deshalb von der aktuellen Spielstärke abweichen.</p><p>4., 3., 2. und 1. Café-Liga sind unsere vorläufigen Café-Ligen. Sie sind keine offiziellen Fargo- oder Elo-Werte. Die Reihenfolge der Rangliste wird vom Server bestimmt; verborgene Werte werden nicht veröffentlicht.</p></details><details><summary>Bestätigen, widersprechen &amp; korrigieren</summary><p>Beide Seiten dürfen das Ergebnis zuerst eintragen, unabhängig davon, wer die Partie angelegt hat. Die Gegenseite bestätigt oder widerspricht auf ihrem eigenen Handy im eigenen angemeldeten Profil. Im Doppel bestätigt genau eine Person des gegnerischen Teams einmal für alle vier; die eintragende Person und ihr Partner bestätigen den eigenen Vorschlag nicht. Erst diese Bestätigung zählt für Sieg, Niederlage, Rang und Platzierung.</p><p>Auch eine spätere Korrektur braucht eine Begründung und die Zustimmung der Gegenseite. Bis dahin bleibt das alte bestätigte Ergebnis sichtbar und gewertet. Angenommene historische Korrekturen können frühere Monatstabellen ändern.</p></details><details><summary>Verbindung, Entwürfe &amp; Installation</summary><p>Zum Laden und Speichern ist eine Verbindung nötig. Ohne Serverbestätigung zeigen wir keinen Speichererfolg. Nicht geheime Formulareingaben bleiben für diesen Browser-Tab erhalten; PIN und Sitzung werden nicht als Entwurf gespeichert. Beim Abmelden oder Profilwechsel werden private Eingabeentwürfe dieses Tabs entfernt.</p><p>Bei einem Versionskonflikt bleibt dein Entwurf erhalten. Lade den Serverstand ausdrücklich und prüfe ihn vor dem erneuten Senden. Offline werden keine Schreibvorgänge vorgemerkt oder automatisch nachgeholt.</p><p>Du kannst die Anwendung über das Browsermenü zum Startbildschirm hinzufügen. Offline ist nur die Oberfläche verfügbar, keine privaten Partien oder Ranglistendaten.</p></details></section>`;
  }

  const lobbyURL = id => '#beitreten/' + encodeURIComponent(id);
  function inviteURL(id) {
    const url = new URL(location.href);
    return appBase.href + lobbyURL(id);
  }
  function loopbackHint() {
    const host = new URL(location.href).hostname;
    return /^(localhost|127(?:\.\d+){3}|\[?::1\]?)$/i.test(host) ? '<div class="callout warning"><p><strong>Private Vorschau auf diesem Gerät.</strong>QR-Code und Link funktionieren hier. Andere Handys erreichen diese localhost-Adresse nicht. Es ist noch kein öffentlich erreichbarer Handy-Link eingerichtet.</p></div>' : '';
  }
  async function loadLobbies() {
    const epoch=identityEpoch;state.lobbiesError='';
    try { const data=await request('/lobbies');if(epoch===identityEpoch)state.lobbies=data.lobbies; }
    catch(err){if(epoch===identityEpoch)state.lobbiesError=err.message;}
  }
  function acceptLobby(lobby) {
    if(!lobby?.id || !['waiting','started','cancelled','expired'].includes(lobby.status))throw new ApiError('Kein bestätigter Einladungsstand erhalten. Bitte identisch erneut versuchen.');
    if(route().view==='invite'&&route().id===lobby.id) {
      if(!state.lobby||state.lobby.id!==lobby.id||state.lobby.version<=lobby.version)state.lobby=lobby;
    }
    if(state.lobbies)state.lobbies=state.lobbies.filter(old=>old.id!==lobby.id).concat(lobby.status==='waiting'&&lobby.is_member?[lobby]:[]);
    return lobby;
  }
  async function loadLobby(id) {
    if(!id)return;const epoch=identityEpoch;state.lobbyError='';
    try{const data=await request('/lobbies/'+encodeURIComponent(id));if(epoch!==identityEpoch||route().view!=='invite'||route().id!==id)return;acceptLobby(data.lobby);
      if(remote && data.lobby.status==='waiting' && !qrImages.has(id)){
        try {
          const response=await remoteAuth.fetchAPI('/lobbies/'+encodeURIComponent(id)+'/qr?url='+encodeURIComponent(inviteURL(id)),{method:'GET',headers:{Accept:'image/svg+xml'}});
          if(!response.ok)throw new Error();
          const image=URL.createObjectURL(await response.blob());
          if(epoch!==identityEpoch||route().view!=='invite'||route().id!==id){URL.revokeObjectURL(image);return;}
          qrImages.set(id,image);
        } catch { /* The complete invitation link remains available when QR loading fails. */ }
      }
    }
    catch(err){if(epoch===identityEpoch&&route().view==='invite'&&route().id===id)state.lobbyError=err.message;}
  }
  function renderOwnLobbies() {
    if(!state.session?.authenticated)return '';
    const lobbies=state.lobbies||[];
    if(!lobbies.length&&!state.lobbiesError)return '';
    return '<section class="own-lobbies" aria-labelledby="lobbies-title"><div class="section-heading"><h2 id="lobbies-title">Deine Einladungen</h2><button class="text-button" type="button" data-action="refresh">Aktualisieren</button></div>'+(state.lobbiesError?errorBlock(state.lobbiesError,'refresh'):'')+'<div class="row-list">'+lobbies.map(l=>'<a class="match-card" href="'+e(lobbyURL(l.id))+'"><div class="match-card-top"><strong>'+e(poolLabel(l.pool))+' · '+e(formatLabel(l))+'</strong><span class="badge pending">Wartet auf Personen</span></div><p>'+e(teamName(l.teams[0])||'Seite A frei')+' · '+e(teamName(l.teams[1])||'Seite B frei')+'</p><span class="hint">Einladung öffnen →</span></a>').join('')+'</div></section>';
  }
  function inviteQR(lobby) {
    const source=remote ? qrImages.get(lobby.id) : '/api/lobbies/'+encodeURIComponent(lobby.id)+'/qr?url='+encodeURIComponent(inviteURL(lobby.id));
    return source ? '<img class="invite-qr" width="240" height="240" src="'+e(source)+'" alt="QR-Code zum Öffnen dieser Einladung">' : '<p class="hint">QR-Code derzeit nicht verfügbar. Du kannst den vollständigen Einladungslink teilen.</p>';
  }
  function renderInvite() {
    if(!state.session?.authenticated) {
      state.returnTo=location.hash;persist();
      return authGate('Öffne die Einladung mit deinem eigenen Profil. Anmelden oder Registrieren tritt keiner Partie automatisch bei.')+installHTML()+loopbackHint();
    }
    const lobby=state.lobby?.id===route().id?state.lobby:null;
    let body=state.lobbyError?errorBlock(state.lobbyError,'lobby-refresh'):'';
    if(!lobby)return '<div class="narrow"><a class="back-link" href="#spielen">← Spielen</a>'+body+(!state.lobbyError?loading('Einladung wird geladen …'):'')+'</div>';
    const capacity=lobby.pool==='8-double'?2:1,waiting=lobby.status==='waiting',url=inviteURL(lobby.id);
    const pending=state.lobbyPending;
    body+='<section class="panel lobby-panel"><div class="section-heading"><div><p class="eyebrow">'+e(poolLabel(lobby.pool))+'</p><h1>Zusammen an den Tisch</h1></div><button class="btn small" type="button" data-action="lobby-refresh">Aktualisieren</button></div><p>'+e(formatLabel(lobby))+(lobby.variant?' · '+e(VARIANTS[lobby.variant]):'')+(lobby.pool==='14-single'?' · '+e(lobby.points_target)+' Punkte je Runde':'')+'</p><div class="own-identity"><p>Du spielst als <strong>'+e(state.session.user.name)+'</strong>.</p><button type="button" class="btn small" data-action="profile-switch">Profil wechseln</button></div>';
    if(state.lobbyConflict)body+='<div class="callout warning" role="status"><p>Die Einladung hat sich geändert. Lade den aktuellen Stand und prüfe Teams und freie Plätze, bevor du erneut handelst.</p></div>';
    if(pending&&!state.busy)body+='<div class="callout warning" role="status"><p>Keine Serverbestätigung erhalten. Wiederhole dieselbe Aktion unverändert oder lade den aktuellen Stand. Es wird nichts automatisch gesendet.</p></div>';
    body+='<div class="form-grid teams-grid">'+[0,1].map(side=>'<section class="team-panel"><h2>'+e(capacity===2?'Team '+(side?'B':'A'):'Seite '+(side?'B':'A'))+'</h2><ul class="lobby-roster">'+Array.from({length:capacity},(_,slot)=>'<li>'+(lobby.teams[side]?.[slot]?e(lobby.teams[side][slot].name)+(lobby.teams[side][slot].id===state.session.user.id?' <small>(du)</small>':''):'<span class="muted">Noch frei</span>')+'</li>').join('')+'</ul>'+(waiting&&!lobby.is_member&&(lobby.can_join||[]).includes(side)?'<button class="btn primary full" type="button" data-action="lobby-join" data-side="'+side+'" '+(state.lobbyConflict||pending&&(pending.action!=='join'||pending.payload.side!==side)?'disabled':'')+'>'+busyText('Seite '+(side?'B':'A')+' beitreten')+'</button>':'')+'</section>').join('')+'</div>';
    if(waiting){
      body+='<p class="hint">'+(lobby.is_member?'Du bist dabei. Die erstellende Person startet, sobald alle Plätze belegt sind.':'Du trittst nur durch einen ausdrücklichen Klick deiner gewählten Seite bei.')+'</p>';
      if(lobby.can_start)body+='<div class="actions"><button class="btn primary full" type="button" data-action="lobby-start" '+(state.lobbyConflict?'disabled':'')+'>'+busyText('Partie starten')+'</button></div>';
      else if(lobby.creator_id===state.session.user.id)body+='<p class="hint">Warte, bis alle Personen mit ihren eigenen Profilen beigetreten sind.</p>';
      body+='<div class="invite-share"><h2>Andere einladen</h2><p>QR-Code scannen oder Link auf dem eigenen Handy öffnen. Jede Person meldet sich selbst an.</p>'+inviteQR(lobby)+'<label class="field"><span>Einladungslink</span><input id="invite-link" type="url" readonly value="'+e(url)+'"></label><div class="actions compact"><button class="btn" type="button" data-action="copy-invite">Link kopieren</button>'+(typeof navigator.share==='function'?'<button class="btn" type="button" data-action="share-invite">Link teilen</button>':'')+'</div><p class="hint">Der Link enthält weder PIN noch Anmeldung. Einladung gültig bis '+e(date(lobby.expires_at))+'.</p></div>'+loopbackHint();
      body+='<div class="actions compact">'+(lobby.can_leave?'<button class="btn" type="button" data-action="lobby-leave">Einladung verlassen</button>':'')+(lobby.can_cancel?'<button class="btn danger" type="button" data-action="lobby-cancel">Einladung absagen</button>':'')+'</div><p class="hint">Einladung wird etwa alle 5 Sekunden aktualisiert, solange diese Ansicht frei ist.</p>';
    }else if(lobby.status==='started')body+='<div class="callout"><p>Die Partie wurde gestartet.</p>'+(lobby.is_member&&lobby.match_id?'<a class="btn primary" href="'+e(matchURL(lobby.match_id))+'">Partie öffnen</a>':'<p>Du bist nicht Teil dieser Partie. Nur die teilnehmenden Profile können sie öffnen.</p>')+'</div>';
    else body+='<div class="callout"><p>Diese Einladung wurde '+(lobby.status==='expired'?'nach 24 Stunden beendet.':'abgesagt.')+' Ein Beitritt ist nicht mehr möglich.</p><a class="btn" href="#spielen">Zur Übersicht</a></div>';
    return '<div class="narrow"><a class="back-link" href="#spielen">← Spielen</a>'+body+'</section></div>';
  }
  async function createLobby() {
    const error=validateWizard(1);if(error){notify(error,true);return;}
    if(!state.session?.authenticated){state.returnTo='#spielen/neu';persist();location.hash='#profil';return;}
    const w=state.wizard,payload={pool:w.pool,best_of:Number(w.best_of),variant:w.pool==='8-double'?w.variant:null,points_target:w.pool==='14-single'?Number(w.points_target):null};
    await perform('create-lobby',async()=>{
      const data=await write('/lobbies',payload,'create-lobby');acceptLobby(data.lobby);acknowledge('create-lobby');
      state.lobby=data.lobby;state.lobbyConflict=false;state.wizard=initialWizard();alignOwnPlayer();location.hash=lobbyURL(data.lobby.id);
      notify('Die Einladung ist vom Server angelegt. Du bist auf Seite A dabei.');await loadLobbies();
    });
  }
  async function mutateLobby(action,sideValue) {
    const lobby=state.lobby;if(!lobby||route().view!=='invite'||route().id!==lobby.id||state.lobbyConflict)return;
    if(lobby.status!=='waiting')return;
    const side=Number(sideValue);
    if(action==='join'&&(!Number.isInteger(side)||!(lobby.can_join||[]).includes(side)))return;
    if(action!=='join'&&!lobby['can_'+action])return;
    const old=state.lobbyPending;
    if(old&&(old.action!==action||action==='join'&&old.payload.side!==side)){notify('Bitte dieselbe unbestätigte Aktion wiederholen oder zuerst aktualisieren.',true);return;}
    const payload=old?old.payload:{...(action==='join'?{side}:{}),expected_version:lobby.version};
    state.lobbyPending={action,payload};
    await perform('lobby-'+action,async()=>{
      const data=await write('/lobbies/'+encodeURIComponent(lobby.id)+'/'+action,payload,'lobby:'+lobby.id+':'+action);
      acceptLobby(data.lobby);acknowledge('lobby:'+lobby.id+':'+action);state.lobbyPending=null;state.lobbyConflict=false;
      if(data.match&&data.lobby.is_member){acceptMatch(data.match);state.detail=data.match;location.hash=matchURL(data.match.id);}
      notify(action==='join'?'Der Server hat deinen Beitritt bestätigt.':action==='leave'?'Du hast die Einladung verlassen.':action==='cancel'?'Die Einladung wurde abgesagt.':'Die Partie ist gestartet.');
      await loadLobbies();
    });
  }
  async function copyInvite() {
    if(!state.lobby)return;const url=inviteURL(state.lobby.id);
    try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(url);notify('Einladungslink kopiert.');}
    catch{
      const input=document.getElementById('invite-link');input?.focus();input?.select();input?.setSelectionRange(0,url.length);
      let copied=false;try{copied=!!document.execCommand?.('copy');}catch{}
      notify(copied?'Einladungslink kopiert.':'Link ist markiert. Kopiere ihn über das Auswahlmenü oder halte ihn auf dem Handy gedrückt.',!copied);
    }
  }
  async function shareInvite() {
    if(!state.lobby||typeof navigator.share!=='function')return;
    try{await navigator.share({title:'Billardcafé Merzig Rangliste · Einladung',text:'Öffne die Einladung mit deinem eigenen Profil.',url:inviteURL(state.lobby.id)});}
    catch(err){if(err.name!=='AbortError')notify('Teilen ist hier nicht verfügbar. Kopiere den Einladungslink.',true);}
  }
  function installHTML() {
    return '<div class="install-row"><p><strong>Die Rangliste als App</strong>Direkt vom Handy-Startbildschirm öffnen.</p><a class="btn small" href="#installieren">Installationshilfe</a></div>';
  }
  function standalone(){return !!(state.installed||navigator.standalone||window.matchMedia?.('(display-mode: standalone)').matches);}
  function installPlatform(){
    const ua=navigator.userAgent||'';
    return /iPad|iPhone|iPod/.test(ua)||/Macintosh/.test(ua)&&navigator.maxTouchPoints>1?'ios':/Android/.test(ua)?'android':'other';
  }
  function renderInstall(){
    const device=installPlatform(),platform=state.installPlatformChoice||(device==='android'?'android':'ios'),installed=standalone();
    const choices=[['ios','Apple','iPhone / iPad · Safari'],['android','Android','Chrome']].map(([id,label,detail])=>'<button id="install-platform-'+id+'" type="button" class="install-platform-choice" data-install-platform="'+id+'" aria-pressed="'+(platform===id)+'" aria-controls="install-guide"><strong>'+label+'</strong><span>'+detail+'</span></button>').join('');
    const instructions=platform==='ios'?'<ol class="install-steps"><li>Öffne diese Website in <strong>Safari</strong>.</li><li>Öffne <strong>Teilen</strong> – direkt über das Teilen-Symbol oder über das <strong>Seitenmenü → Teilen</strong>.</li><li>Wähle <strong>Zu Home-Bildschirm hinzufügen</strong>.</li><li>Aktiviere <strong>Als Web-App öffnen</strong>, falls angeboten, und tippe auf <strong>Hinzufügen</strong>.</li></ol>':'<ol class="install-steps"><li>Öffne diese Website in <strong>Chrome</strong>.</li><li>Tippe rechts neben der Adressleiste auf das Menü <strong>⋮</strong>.</li><li>Wähle <strong>Installieren und Verknüpfung erstellen → Installieren</strong>. Je nach Chrome-Version heißt es auch <strong>App installieren</strong> oder <strong>Zum Startbildschirm hinzufügen</strong>.</li><li>Bestätige das Hinzufügen auf deinem Handy.</li></ol>';
    const nativeInstall=!installed&&platform==='android'&&device==='android'&&state.installPrompt?'<button class="btn primary" type="button" data-action="install">Jetzt installieren</button><p class="hint">Chrome öffnet den Installationsdialog auf diesem Gerät.</p>':'';
    return '<div class="narrow install-help"><a class="back-link" href="#spielen">← Spielen</a><div class="page-heading"><p class="eyebrow">App aufs Handy</p><h1>Wie installiere ich die App?</h1><p class="muted">Wähle dein Handy. Die Anleitung zeigt dir die nächsten Schritte.</p></div>'+(installed?'<div class="callout"><p><strong>Bereits als App geöffnet</strong><br>Du kannst direkt weiterspielen oder die Anleitung für ein anderes Handy ansehen.</p><a class="btn small" href="#spielen">Weiterspielen</a></div>':'')+'<div class="install-platforms" role="group" aria-label="Handy auswählen">'+choices+'</div><section id="install-guide" class="panel install-guide" aria-labelledby="install-guide-title"><h2 id="install-guide-title">'+(platform==='ios'?'Auf dem iPhone oder iPad':'Auf einem Android-Handy')+'</h2>'+nativeInstall+instructions+'<p class="install-finish">Danach findest du <strong>Merzig Rangliste</strong> als Symbol auf deinem Startbildschirm.</p><p class="hint">Das Hinzufügen ist freiwillig. Partien laden und speichern braucht eine Internetverbindung.</p></section>'+loopbackHint()+'</div>';
  }

  async function perform(label, operation) {
    if (state.busy) return;
    const origin = route();
    state.busy = label;
    state.notice = null;
    render();
    try { await operation(); }
    catch (err) {
      if (err.status === 409) {
        if (origin.view === 'match') state.conflicts[origin.id] = 'needs-refresh';
        if (origin.view === 'wizard') state.wizardConflict = true;
        if(origin.view==='invite'){state.lobbyConflict=true;state.lobbyPending=null;}
        notify(`${err.message} Dein Entwurf bleibt erhalten. Bitte den aktuellen Serverstand ausdrücklich laden und prüfen.`, true);
      } else if (err.status !== 401 || !state.notice) notify(err.message || 'Die Anfrage ist fehlgeschlagen. Bitte erneut versuchen.', true);
    } finally { state.busy = ''; persist(); render(); }
  }
  async function syncAfterMutation(match) {
    if (!match || match.id == null || !STATUSES[match.status]) throw new ApiError('Die Serverantwort enthält keinen bestätigten Partiestand. Dein Entwurf bleibt erhalten; bitte identisch erneut versuchen.');
    if (match) {
      acceptMatch(match, true);
      delete state.edits[String(match.id)];
      delete state.conflicts[String(match.id)];
    }
    if (state.session?.authenticated) await Promise.all([loadMatches(), loadMe()]);
  }
  async function startMatch() {
    if (state.wizardConflict) { notify('Bitte zuerst den Serverstand ausdrücklich laden und deine Auswahl prüfen.', true); return; }
    const error = validateWizard();
    if (error) { notify(error, true); return; }
    const w = state.wizard;
    const payload = {pool: w.pool, best_of: Number(w.best_of), variant: w.pool === '8-double' ? w.variant : null, teams: w.teams.map(team => team.slice()), points_target: w.pool === '14-single' ? Number(w.points_target) : null};
    await perform('start', async () => {
      const data = await write('/matches', payload, 'create-match');
      if (!data.match?.id || !STATUSES[data.match.status]) throw new ApiError('Die Serverantwort enthält keine Partie. Bitte identisch erneut versuchen.');
      acknowledge('create-match');
      state.wizard = initialWizard(); alignOwnPlayer(); persist();
      state.detail = data.match;
      location.hash = matchURL(data.match.id);
      notify('Die Partie wurde vom Server angelegt. Viel Spaß am Tisch.');
      await syncAfterMutation(data.match);
    });
  }
  function editableMatch() {
    const m = state.detail;
    if (!m || route().view !== 'match' || route().id !== String(m.id)) { notify('Bitte zuerst die Partie laden.', true); return null; }
    if (staleEdit(m)) { notify('Bitte den aktuellen Serverstand laden und prüfen. Dein Entwurf bleibt erhalten.', true); return null; }
    return m;
  }
  async function sendResult() {
    const m = editableMatch();
    if (!m) return;
    if (!m.can_propose || ['void', 'aborted', 'pending'].includes(m.status)) { notify('Für den aktuellen Serverstatus ist kein Vorschlag möglich. Bitte die Partie aktualisieren.', true); return; }
    if (!directResultAllowed(m)) { notify('Diese Partie verwendet Live-Spielblätter. Bitte das vollständige erste Satzergebnis dort vorschlagen.', true); return; }
    const edit = ensureEdit(m);
    const result = validateResult(m, edit);
    if (result.error) { notify(result.error, true); document.querySelector('#result-validation')?.scrollIntoView({block: 'center'}); return; }
    const reason = edit.reason.trim(), correction = !!m.result;
    if ((correction || scorekeeper.disputeRecoveryAllowed(m)) && !reason) { notify('Bitte die Korrektur begründen.', true); document.querySelector('#result-reason')?.focus(); return; }
    if (reason.length > 1000) { notify('Die Korrekturbegründung darf höchstens 1000 Zeichen enthalten.', true); return; }
    const payload = {...result.score, expected_version: Number(edit.baseVersion), ...(correction || reason ? {reason} : {})};
    await perform('result', async () => {
      const data = await write(`/matches/${encodeURIComponent(m.id)}/${correction ? 'correction' : 'result'}`, payload, `${m.id}:${correction ? 'correction' : 'result'}`);
      await syncAfterMutation(data.match);
      acknowledge(`${m.id}:${correction ? 'correction' : 'result'}`);
      notify(correction ? 'Der Server hat die Korrektur zur Prüfung angenommen. Das alte bestätigte Ergebnis bleibt bis zur Bestätigung gewertet.' : 'Der Server hat den Ergebnisvorschlag angenommen. Die Bestätigung der Gegenseite steht noch aus.');
    });
  }
  async function confirmResult() {
    const m = editableMatch();
    if (!m || !m.can_confirm || !openProposal(m)) return;
    const payload = {proposal_id: m.proposal.id, expected_version: Number(ensureEdit(m).baseVersion)};
    const correction = m.proposal.is_correction;
    await perform('confirm', async () => {
      const data = await write(`/matches/${encodeURIComponent(m.id)}/confirm`, payload, `${m.id}:confirm`);
      await syncAfterMutation(data.match);
      acknowledge(`${m.id}:confirm`);
      notify(correction ? 'Die Korrektur ist vom Server bestätigt und wird jetzt gewertet.' : 'Das Ergebnis ist vom Server bestätigt. Diese Begegnung wird jetzt gewertet.');
    });
  }
  async function disputeResult() {
    const m = editableMatch();
    if (!m || !m.can_dispute || !openProposal(m)) return;
    const edit = ensureEdit(m), reason = edit.disputeReason.trim();
    if (!reason) { notify('Bitte den Widerspruch begründen.', true); return; }
    if (reason.length > 1000) { notify('Die Begründung darf höchstens 1000 Zeichen enthalten.', true); return; }
    const payload = {proposal_id: m.proposal.id, expected_version: Number(edit.baseVersion), reason};
    await perform('dispute', async () => {
      const data = await write(`/matches/${encodeURIComponent(m.id)}/dispute`, payload, `${m.id}:dispute`);
      await syncAfterMutation(data.match);
      acknowledge(`${m.id}:dispute`);
      notify('Der Widerspruch wurde vom Server gespeichert. Klärt das Ergebnis bitte miteinander.');
    });
  }
  async function voidMatch() {
    const m = editableMatch();
    if (!m || !state.session?.user?.is_admin || m.status === 'void') return;
    const edit = ensureEdit(m), reason = edit.voidReason.trim();
    if (!reason) { notify('Bitte die Annullierung begründen.', true); return; }
    if (reason.length > 1000) { notify('Die Begründung darf höchstens 1000 Zeichen enthalten.', true); return; }
    const payload = {reason, expected_version: Number(edit.baseVersion)};
    await perform('void', async () => {
      const data = await write(`/admin/matches/${encodeURIComponent(m.id)}/void`, payload, `${m.id}:void`);
      await syncAfterMutation(data.match);
      acknowledge(`${m.id}:void`);
      notify('Die Partie wurde vom Server annulliert. Sie bleibt im Verlauf sichtbar.');
    });
  }
  async function authenticate(form) {
    if (remote) { await startRemoteLogin(); return; }
    const name = form.elements.name.value.trim(), pin = form.elements.pin.value;
    state.authName = name;
    if (!name || !/^[0-9]{6}$/.test(pin)) { state.authError = 'Bitte Nickname und eine PIN mit genau 6 Ziffern eingeben.'; render(); return; }
    // PIN exists only for this request, never in state, logs or browser storage.
    form.elements.pin.value = '';
    const mode = state.authMode;
    state.authError = '';
    await perform('auth', async () => {
      try {
        const session = await write(`/${mode}`, {name, pin}, `auth:${mode}`);
        if (!session.authenticated || !session.user || !session.csrf_token) throw new ApiError('Die Anmeldung wurde nicht vollständig bestätigt. Bitte erneut versuchen.');
        acknowledge(`auth:${mode}`);
        resetPrivateState({keepWizard:!state.session?.authenticated});
        state.session=session;state.sessionError='';announceIdentityChange();
        alignOwnPlayer();
        await loadMatches();
        notify(mode === 'register' ? 'Dein Profil wurde vom Server registriert. Du bist angemeldet.' : 'Du bist angemeldet.');
        const target = /^#(spielen(?:\/neu)?|partie\/[^/]+|beitreten\/[^/]+|installieren|rangliste|profil(?:\/hilfe)?)$/.test(state.returnTo) ? state.returnTo : '#spielen';
        state.returnTo = '#spielen';
        if (location.hash === target) await refreshRoute(); else location.hash = target;
      } catch (err) { state.authError = err.message; throw err; }
    });
  }
  async function startRemoteLogin(purpose='login') {
    persist();
    if (transportError) { notify(transportError,true); return; }
    await perform('auth', async () => remoteAuth.begin({purpose, returnTo: state.returnTo || '#spielen'}));
  }
  async function logout(switchProfile=false){
    const target=route().view==="invite"?location.hash:state.returnTo.startsWith("#beitreten/")?state.returnTo:"#spielen";
    if(remote) {
      await perform("logout",async()=>{
        let failed=false;
        try { await remoteAuth.logout(); } catch { failed=true; }
        finally { resetPrivateState();state.session={authenticated:false};state.returnTo=switchProfile?target:"#spielen";persist();location.hash="#profil"; }
        if(switchProfile) await remoteAuth.begin({purpose:"account",returnTo:target});
        else notify(failed?"Du bist auf diesem Gerät abgemeldet. Die Serverbestätigung war nicht erreichbar.":"Du bist abgemeldet. Private Eingabeentwürfe dieses Tabs wurden entfernt.",failed);
      }); return;
    }
    await perform("logout",async()=>{const data=await write("/logout",{},"logout");if(!data.ok)throw new ApiError("Das Abmelden wurde nicht bestätigt.");
      resetPrivateState();state.session={authenticated:false};state.returnTo=switchProfile?target:"#spielen";state.authMode="login";announceIdentityChange();persist();location.hash="#profil";
      notify(switchProfile?"Melde dich mit deinem eigenen Nickname und deiner PIN an oder registriere dein eigenes Profil. Danach entscheidest du selbst über den Beitritt.":"Du bist abgemeldet. Private Eingabeentwürfe dieses Tabs wurden entfernt.");
    });
  }
  function moveWizard(delta) {
    if (delta > 0) {
      const error = validateWizard(state.wizard.step === 1 ? 1 : 2);
      if (error) { notify(error, true, 'wizard'); return; }
    }
    clearWizardNotice();
    state.wizard.step = Math.max(1, Math.min(3, state.wizard.step + delta));
    if (state.wizard.step === 2 && !state.session?.authenticated) { state.returnTo = '#spielen/neu'; }
    persist(); render(); main.focus({preventScroll: true}); window.scrollTo({top: 0, behavior: 'instant'});
  }
  async function explicitDetailRefresh() {
    if (route().view !== 'match') return;
    const id = route().id;
    await refreshRoute();
    if (!state.detailError && state.detail && String(state.detail.id) === id && staleEdit(state.detail)) {
      state.conflicts[id] = 'review';
      notify('Der aktuelle Serverstand ist geladen. Vergleiche ihn mit deinem Entwurf und bestätige die Prüfung, bevor du erneut sendest.');
      render();
    }
  }

  document.addEventListener('click', async event => {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.dataset.action === 'skip-content') { event.preventDefault(); main.focus(); return; }
    if (target.dataset.action === 'dismiss') { state.notice = null; renderNotice(); return; }
    if (target.dataset.action === 'open-match-rules') {
      if (route().view === 'match' && String(state.detail?.id) === route().id) rules.openForMatch(state.detail, target);
      return;
    }
    if (state.busy && target.tagName === 'BUTTON') return;
    if (target.dataset.installPlatform) {
      const platform = target.dataset.installPlatform;
      if (!['ios','android'].includes(platform) || route().view !== 'install') return;
      state.installPlatformChoice = platform;
      render();
      document.getElementById('install-platform-'+platform)?.focus({preventScroll: true});
      return;
    }
    if (target.dataset.rulesDiscipline && rules.hasDiscipline(target.dataset.rulesDiscipline)) {
      state.rulesDiscipline = target.dataset.rulesDiscipline; render();
      main.querySelector(`[data-rules-discipline="${state.rulesDiscipline}"]`)?.focus(); return;
    }
    if (target.dataset.rulesSection) { rules.open(target.dataset.rulesSection, {trigger: target}); return; }
    if (target.dataset.pool) {
      const pool = target.dataset.pool;
      if (!POOLS[pool] || pool === state.wizard.pool) return;
      state.wizard.pool = pool; state.wizard.variant = null; state.wizard.best_of = null; state.wizard.points_target = '50';
      state.wizard.teams = pool === '8-double' ? [['', ''], ['', '']] : [[''], ['']]; alignOwnPlayer();
      clearWizardNotice(); persist(); render(); main.querySelector(`[data-pool="${pool}"]`)?.focus(); return;
    }
    if (target.dataset.format) {
      state.wizard.best_of = Number(target.dataset.format); refreshWizardNotice(); persist(); render(); main.querySelector(`[data-format="${state.wizard.best_of}"]`)?.focus(); return;
    }
    if (target.dataset.variant) {
      state.wizard.variant = target.dataset.variant; refreshWizardNotice(); persist(); render(); main.querySelector(`[data-variant="${state.wizard.variant}"]`)?.focus(); return;
    }
    if (target.dataset.authMode) { state.authMode = target.dataset.authMode; state.authError = ''; render(); document.querySelector('#auth-name')?.focus(); return; }
    if (target.dataset.removeRound !== undefined && state.detail) {
      const edit = ensureEdit(state.detail), index = Number(target.dataset.removeRound);
      if (edit.rounds.length > 1) { edit.rounds.splice(index, 1); persist(); render(); document.querySelector('#derived-score')?.focus(); }
      return;
    }
    const action = target.dataset.action;
    if (!action) return;
    if (action === 'login-return' || action === 'login-for-wizard') {
      state.returnTo = action === 'login-for-wizard' ? '#spielen/neu' : location.hash; persist(); return;
    }
    if (action === 'remote-login') { await startRemoteLogin(); return; }
    if (action === 'refresh') {
      if (state.session === null) await loadSession();
      await refreshRoute(); return;
    }
    if (action === 'session-retry') { await loadSession(); await refreshRoute(); return; }
    if (action === 'players-retry') { await loadPlayers(); if (!state.playersError) state.wizardConflict = false; render(); return; }
    if (action === 'detail-refresh') { await explicitDetailRefresh(); return; }
    if (action === 'adopt-version' && state.detail && state.conflicts[route().id] === 'review') {
      const edit = ensureEdit(state.detail); edit.baseVersion = state.detail.version; edit.proposalId = state.detail.proposal?.id ?? null;
      delete state.conflicts[route().id]; persist(); render(); notify('Aktueller Stand übernommen. Deine Eingaben sind unverändert; prüfe sie vor dem Senden.'); return;
    }
    if (action === 'wizard-next') { moveWizard(1); return; }
    if (action === 'wizard-back') { moveWizard(-1); return; }
    if (action === 'wizard-reset') { state.wizard = initialWizard(); state.wizardConflict = false; alignOwnPlayer(); persist(); render(); notify('Der Partieentwurf wurde zurückgesetzt.'); return; }
    if (action === 'clear-drafts') {
      state.wizard = initialWizard(); state.edits = {}; state.idem = {}; state.returnTo = '#spielen'; scorekeeper.discardInputs(); persist(); render(); notify('Die lokalen Eingabeentwürfe wurden gelöscht. Serverpartien bleiben im Verlauf.'); return;
    }
    if (action === 'start-match') { await startMatch(); return; }
    if (action === 'confirm-result') { await confirmResult(); return; }
    if(action==='logout'||action==='profile-switch'){await logout(action==='profile-switch');return;}
    if(action==='create-lobby'){await createLobby();return;}
    if(action==='lobby-refresh'){state.lobbyPending=null;await loadLobby(route().id);if(!state.lobbyError)state.lobbyConflict=false;render();return;}
    if(['lobby-join','lobby-leave','lobby-start','lobby-cancel'].includes(action)){await mutateLobby(action.slice(6),target.dataset.side);return;}
    if(action==='copy-invite'){await copyInvite();return;}
    if(action==='share-invite'){await shareInvite();return;}
    if (action === 'open-editor' && state.detail) { ensureEdit(state.detail).open = true; persist(); render(); document.querySelector('#result-title')?.scrollIntoView({block: 'start'}); return; }
    if (action === 'close-editor' && state.detail) { ensureEdit(state.detail).open = false; persist(); render(); return; }
    if (action === 'add-round' && state.detail) {
      const edit = ensureEdit(state.detail);
      if (edit.rounds.length < Number(state.detail.best_of)) { edit.rounds.push({a: '', b: ''}); persist(); render(); document.querySelector(`#round-${edit.rounds.length - 1}-a`)?.focus(); }
      return;
    }
    if (action === 'install' && state.installPrompt) {
      const prompt = state.installPrompt; state.installPrompt = null; try { await prompt.prompt(); await prompt.userChoice; } catch { notify('Die Installation wurde nicht abgeschlossen. Nutze das Browsermenü.', true); } render();
    }
  });
  main.addEventListener('submit', async event => {
    const form = event.target.closest('form');
    if (!form) return;
    event.preventDefault();
    if (state.busy || !form.reportValidity()) return;
    if (form.dataset.form === 'join') {
      const target = resolveInviteInput(state.joinInput);
      if (!target) { state.joinError = 'Bitte einen vollständigen Einladungslink dieser Rangliste einfügen.'; render(); document.querySelector('#join-link')?.focus(); return; }
      state.joinError = ''; location.hash = target; return;
    }
    if (form.dataset.form === 'auth') await authenticate(form);
    if (form.dataset.form === 'result') await sendResult();
    if (form.dataset.form === 'dispute') await disputeResult();
    if (form.dataset.form === 'void') await voidMatch();
  });
  main.addEventListener('input', event => {
    const input = event.target;
    if (input.id === 'join-link') { state.joinInput = input.value; state.joinError = ''; return; }
    if (input.id === 'auth-name') { state.authName = input.value; return; }
    if (input.id === 'auth-pin') return;
    if (input.dataset.wizard) { state.wizard[input.dataset.wizard] = input.value; refreshWizardNotice(); persist(); return; }
    if (!state.detail || route().view !== 'match') return;
    const edit = ensureEdit(state.detail);
    if (input.dataset.edit) edit[input.dataset.edit] = input.value;
    if (input.dataset.round !== undefined) {
      const round = edit.rounds[Number(input.dataset.round)];
      const field = input.dataset.roundField || input.dataset.side;
      if (round && ['a', 'b', 'winner_id', 'reason'].includes(field)) round[field] = input.value;
    }
    persist(); updateValidation();
  });
  main.addEventListener('change', async event => {
    const input = event.target;
    if (input.dataset.round !== undefined && input.dataset.roundField && state.detail) {
      const round = ensureEdit(state.detail).rounds[Number(input.dataset.round)];
      if (round && ['winner_id', 'reason'].includes(input.dataset.roundField)) { round[input.dataset.roundField] = input.value; persist(); updateValidation(); }
      return;
    }
    if (input.dataset.team !== undefined) {
      state.wizard.teams[Number(input.dataset.team)][Number(input.dataset.slot)] = input.value; persist();
      const id = input.id; render(); document.getElementById(id)?.focus(); return;
    }
    const filter = input.dataset.filter;
    if (!filter) return;
    state[filter] = input.value;
    if (filter === 'historyPool' && state.historyPool && state.historyPool !== '8-double') state.historyVariant = '';
    persist();
    if (filter.startsWith('board')) { state.board = null; await refreshRoute(); document.getElementById(input.id)?.focus(); }
    else { render(); document.getElementById(input.id)?.focus(); }
  });

  window.addEventListener('hashchange', () => {
    if(route().view==='invite'&&state.lobby?.id!==route().id){state.lobby=null;state.lobbyError='';state.lobbyPending=null;state.lobbyConflict=false;}
    if (route().view === 'match' && String(state.detail?.id) !== route().id) { state.detail = null; state.detailError = ''; }
    refreshRoute({focus: true});
  });
  window.addEventListener('offline', connection);
  window.addEventListener('online', () => { state.networkFailed = false; connection(); });
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; if(route().view==='install'&&!state.busy)render(); });
  window.addEventListener('appinstalled',()=>{state.installPrompt=null;state.installed=true;if(route().view==='install')render();});
  if(remote) remoteAuth?.onIdentityChange(()=>{
    const target=route().view==='invite'?location.hash:'#spielen';
    resetPrivateState();state.session={authenticated:false};state.returnTo=target;persist();
    notify('Die Anmeldung hat sich geändert. Private Eingaben wurden entfernt. Bitte dein Profil erneut prüfen.',true);render();
  });
  accountChannel?.addEventListener('message',()=>{const target=route().view==='invite'?location.hash:'#spielen';resetPrivateState();state.session=null;state.returnTo=target;persist();render();checkCurrentSession().then(()=>refreshRoute());});
  window.addEventListener('focus',()=>{if(!state.busy)checkCurrentSession().then(()=>refreshRoute({quiet:true}));});
  setInterval(()=>{
    if(document.hidden||state.busy||!state.session?.authenticated||!navigator.onLine||rules.isOpen()||scorekeeper.isOpen()||document.querySelector('dialog[open]')||document.activeElement?.matches('input, select, textarea, button, summary'))return;
    if(route().view!=='invite'||state.lobby?.status!=='waiting'||state.lobbyPending||state.lobbyConflict)return;loadLobby(route().id).then(render);
  },5000);
  document.addEventListener('visibilitychange', () => { if (!rules.isOpen() && !scorekeeper.isOpen() && !document.hidden && state.session !== null && !state.busy) { checkCurrentSession().then(()=>{if(route().view==='rules'&&state.session?.authenticated)loadMatches();else refreshRoute({quiet:true});}); } });
  setInterval(() => {
    if (rules.isOpen() || scorekeeper.isOpen() || document.hidden || state.busy || state.session === null || !navigator.onLine) return;
    if (route().view === 'rules') { if (state.session.authenticated) loadMatches(); return; }
    if (!state.session.authenticated && route().view !== 'board') return;
    if (['wizard','invite'].includes(route().view) || document.activeElement?.matches('input, select, textarea, summary, button')) return;
    refreshRoute({quiet: true});
  }, 45000);
  async function init() {
    if(remote) remoteAuth?.clearPending();
    connection();
    if (route().view === 'rules') render();
    await loadSession();
    if (state.session?.authenticated) await loadMatches();
    await refreshRoute();
    window.BillardOpening?.ready({
      hasActiveMatch: !!state.matches?.some(activeMatch),
      failed: !!(state.sessionError || state.matchesError || state.networkFailed)
    });
    if (route().help) document.querySelector('#hilfe')?.scrollIntoView();
    if ('serviceWorker' in navigator && window.isSecureContext && !window.BillardDemo) {
      try { await navigator.serviceWorker.register('./sw.js', {scope: './'}); }
      catch { /* Online app remains fully usable if installation is unavailable. */ }
    }
  }
  window.BillardApp = {request, write, notify, render, route, state}; /* NEU: Schnittstelle für features.js */
  scorekeeper.init({read:request,write,acknowledge,user:()=>state.session?.authenticated?state.session.user:null,
    formatLabel,poolLabel,date,notify,render,
    currentMatchId:()=>route().view === 'match' ? route().id : null,
    findMatch:id=>[state.detail,...(state.matches||[]),...(state.me?.matches||[])].find(m=>m&&String(m.id)===String(id)),
    updateMatch:acceptMatch,
    afterMatch:async m=>{acceptMatch(m);await Promise.all([loadMatches(),loadMe()]);render();}
  });
  init();
})();
