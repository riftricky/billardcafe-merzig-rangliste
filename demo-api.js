'use strict';
/*
 * DEMO-SERVER IM BROWSER
 * ----------------------
 * Ersetzt für die Prototyp-Vorschau den echten Server. Alle Anfragen an /api/…
 * werden hier beantwortet – mit erfundenen Spielern und Partien.
 * Es wird NICHTS an den echten Server gesendet, nichts dauerhaft gespeichert.
 * Neu laden = alles wieder wie am Anfang.
 *
 * Die Endpunkte unter "Neue Endpunkte" zeigen, was der echte Server für die
 * Erweiterungen zusätzlich liefern müsste (siehe UEBERGABE.md).
 */
(() => {
  // ---------- Hilfsfunktionen ----------
  let seed = 20261031;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = list => list[Math.floor(rnd() * list.length)];
  const DAY = 86400000;
  const berlinParts = d => Object.fromEntries(new Intl.DateTimeFormat('en', {timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23'}).formatToParts(d).map(p => [p.type, p.value]));
  const monthOf = d => { const p = berlinParts(new Date(d)); return `${p.year}-${p.month}`; };
  const dayOf = d => { const p = berlinParts(new Date(d)); return `${p.year}-${p.month}-${p.day}`; };
  const iso = t => new Date(t).toISOString();
  const now = () => Date.now();
  const startOfMonth = () => { const p = berlinParts(new Date()); return Date.now() - ((Number(p.day) - 1) * DAY) - Number(p.hour) * 3600000 - 1; };
  const startOfWeek = () => { const p = berlinParts(new Date()); const wd = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(p.weekday); return Date.now() - wd * DAY - Number(p.hour) * 3600000 - 1; };
  const nextMonthStart = () => { const p = berlinParts(new Date()); let y = Number(p.year), m = Number(p.month) + 1; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}-01T00:00:00+01:00`; };

  // ---------- Spieler (erfunden) ----------
  const ME = 'p1';
  const names = ['Kreidefuchs','Bande-Bernd','Lena','Max','Jojo','Sascha','Tine','Kalle','Mira','Deniz','Ole','Ronja','Fritzi','Paul','Ahmet','Svenja','Timo','Nico','Hanna','Luca','Emre','Charly','Benni','Ilka'];
  const skill = [1085,1130,1215,1290,1010,940,1160,880,1250,1060,990,1110,905,1040,1335,975,1190,860,1020,1095,1265,930,1000,950];
  const players = names.map((name, i) => ({id: `p${i + 1}`, name, skill: skill[i]}));
  const byId = id => players.find(p => p.id === id);
  const POOLS = ['8-single','9-single','10-single','14-single','8-double'];
  const RANKS = [[1140,'1. Café-Liga'],[1050,'2. Café-Liga'],[960,'3. Café-Liga'],[-1e9,'4. Café-Liga']];
  const rankOf = r => RANKS.find(([min]) => r >= min)[1];
  const rankIndex = r => RANKS.findIndex(([min]) => r >= min); // 0 = beste Liga

  // Wertung je Disziplin: Elo pro einzelnem Spiel (wie vorgeschlagen)
  const ratings = {};      // ratings[pool][playerId] = {r, games(Begegnungen), wins, losses, history:[{t,r}]}
  POOLS.forEach(pool => { ratings[pool] = {}; players.forEach(p => { ratings[pool][p.id] = {r: 1000, games: 0, wins: 0, losses: 0, history: []}; }); });
  const K = rec => rec.games < 10 ? 40 : rec.r >= 1250 ? 12 : 20;
  const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
  function applyMatch(m) {
    if (m.status !== 'confirmed' || !m.result) return;
    const R = ratings[m.pool];
    const side = i => m.teams[i].map(p => R[p.id]);
    const avg = recs => recs.reduce((s, x) => s + x.r, 0) / recs.length;
    const A = side(0), B = side(1);
    const games = m.pool === '14-single' ? [[m.result.score_a > m.result.score_b ? 1 : 0, 1]] : [[m.result.score_a, m.result.score_a + m.result.score_b]];
    for (const [wonA, total] of games) {
      const ea = expected(avg(A), avg(B));
      const delta = total ? (wonA - ea * total) : 0;
      A.forEach(x => { x.r += K(x) * delta; });
      B.forEach(x => { x.r -= K(x) * delta; });
    }
    const aWon = m.result.score_a > m.result.score_b;
    A.forEach(x => { x.games++; aWon ? x.wins++ : x.losses++; x.history.push({t: Date.parse(m.confirmed_at), r: x.r}); });
    B.forEach(x => { x.games++; aWon ? x.losses++ : x.wins++; x.history.push({t: Date.parse(m.confirmed_at), r: x.r}); });
  }

  // ---------- Partien erzeugen (letzte ~80 Tage, ein Drittel im aktuellen Monat) ----------
  const matches = [];
  let nextId = 1;
  const FORMATS = [[1,1],[5,3],[7,4]];
  function playRace(a, b, wins) { // a,b = Spielstärke; liefert Spielstand
    let sa = 0, sb = 0; const pa = expected(a, b);
    while (sa < wins && sb < wins) { rnd() < pa ? sa++ : sb++; }
    return [sa, sb];
  }
  function makeMatch({pool, teams, t, result, status = 'confirmed', bestOf, proposal = null}) {
    const id = `m${nextId++}`;
    return {id, version: 1, pool, best_of: bestOf, variant: pool === '8-double' ? 'aufnahme' : null, points_target: pool === '14-single' ? 50 : null,
      teams: teams.map(team => team.map(p => ({id: p.id, name: p.name}))), status, result, proposal,
      created_at: iso(t - 40 * 60000), played_at: iso(t - 5 * 60000), confirmed_at: status === 'confirmed' ? iso(t) : null,
      can_confirm: false, can_dispute: false, can_propose: false,
      audit_events: [{action: 'created', created_at: iso(t - 40 * 60000)}, {action: 'result_proposed', created_at: iso(t - 5 * 60000)}, ...(status === 'confirmed' ? [{action: 'confirmed', created_at: iso(t)}] : [])]};
  }
  const monthStart = startOfMonth();
  const times = [];
  for (let i = 0; i < 230; i++) {
    const inMonth = i % 3 === 0;
    const from = inMonth ? monthStart : now() - 80 * DAY, to = inMonth ? now() - 30 * 60000 : monthStart;
    let t = from + rnd() * Math.max(60000, to - from);
    const p = berlinParts(new Date(t)); t += (19 - Number(p.hour)) * 3600000 + rnd() * 3 * 3600000; // abends
    if (t > now() - 20 * 60000) t = now() - 20 * 60000 - rnd() * 3600000;
    times.push(t);
  }
  times.sort((a, b) => a - b);
  for (const t of times) {
    const roll = rnd();
    const pool = roll < .55 ? '8-single' : roll < .78 ? '9-single' : roll < .86 ? '10-single' : roll < .93 ? '14-single' : '8-double';
    const size = pool === '8-double' ? 2 : 1;
    const pool4 = [...players].sort(() => rnd() - .5);
    // Kreidefuchs spielt etwas öfter mit, damit das Demo-Profil gefüllt ist
    if (rnd() < .16 && !pool4.slice(0, size * 2).some(p => p.id === ME)) pool4.unshift(byId(ME));
    const unique = [...new Map(pool4.map(p => [p.id, p])).values()];
    const teams = [unique.slice(0, size), unique.slice(size, size * 2)];
    const strength = team => team.reduce((s, p) => s + p.skill, 0) / team.length;
    if (pool === '14-single') {
      const aWins = rnd() < expected(strength(teams[0]), strength(teams[1]));
      matches.push(makeMatch({pool, teams, t, bestOf: 1, result: {score_a: aWins ? 1 : 0, score_b: aWins ? 0 : 1}}));
    } else {
      const [best, wins] = pick(FORMATS.slice(1));
      const [sa, sb] = playRace(strength(teams[0]), strength(teams[1]), wins);
      matches.push(makeMatch({pool, teams, t, bestOf: best, result: {score_a: sa, score_b: sb}}));
    }
  }
  matches.forEach(applyMatch);
  // Offene Bestätigung für das Demo-Profil: Bande-Bernd hat ein Ergebnis eingetragen
  const pending = makeMatch({pool: '8-single', teams: [[byId('p2')], [byId(ME)]], t: now() - 25 * 60000, bestOf: 7, status: 'pending', result: null,
    proposal: {id: 'pr1', score_a: 4, score_b: 2, is_correction: false, reason: null, rounds: null}});
  pending.can_confirm = true; pending.can_dispute = true;
  matches.push(pending);
  // Streitfall zweier anderer Spieler (für das Admin-Panel)
  const disputed = makeMatch({pool: '8-single', teams: [[byId('p3')], [byId('p5')]], t: now() - 2 * DAY, bestOf: 7, status: 'disputed', result: null,
    proposal: {id: 'pr-d1', score_a: 4, score_b: 2, is_correction: false, reason: null, rounds: null}});
  disputed.dispute_reason = 'Es stand 3:4 für mich – im letzten Spiel war die 8 nach Foul versenkt.';
  disputed.audit_events.push({action: 'disputed', created_at: iso(now() - 2 * DAY + 600000), reason: disputed.dispute_reason});
  matches.push(disputed);
  // Auffällige Paarung: viele Partien derselben zwei Spieler im Monat
  for (let k = 0; k < 6; k++) {
    const t = Math.max(startOfMonth() + DAY, now() - (k + 1) * 2.5 * DAY);
    const aWins = k % 2 === 0;
    const m = makeMatch({pool: '8-single', teams: [[byId('p13')], [byId('p18')]], t, bestOf: 5, result: {score_a: aWins ? 3 : 1, score_b: aWins ? 1 : 3}});
    matches.push(m); applyMatch(m);
  }

  // ---------- Gamification-Zustand des Demo-Profils ----------
  const game = {stamps: 9, unseen: [], questsDone: new Set(), playDays: new Set(), registered: new Set(['e3'])};
  const vouchers = [];   // alle Gutscheine aller Spieler: {code, title, valid_until, redeemed_at, redeemed_by, player_id, source}
  let adminRev = 0;      // steigt bei jeder Admin-Änderung (Cache-Schlüssel)
  const STAFF = [{id: 'a1', name: 'Café-Team', role: 'owner'}, {id: 'a2', name: 'Theke', role: 'staff'}];
  const newCode = () => 'BCM-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const confirmedOf = id => matches.filter(m => m.status === 'confirmed' && m.teams.flat().some(p => p.id === id));
  const myConfirmed = () => confirmedOf(ME);
  myConfirmed().filter(m => Date.parse(m.confirmed_at) >= startOfWeek()).forEach(m => game.playDays.add(dayOf(m.confirmed_at)));

  // ---------- Antworten bauen ----------
  const session = {authenticated: true, user: {id: ME, name: 'Kreidefuchs', role: null, is_admin: false}, csrf_token: 'demo'};
  const sideOf = (m, id) => m.teams[0].some(p => p.id === id) ? 0 : m.teams[1].some(p => p.id === id) ? 1 : -1;
  function viewMatch(m) {
    const mine = sideOf(m, session.user?.id) >= 0;
    const copy = JSON.parse(JSON.stringify(m));
    if (!mine) { copy.can_confirm = copy.can_dispute = copy.can_propose = false; }
    return copy;
  }
  function ratingFor(pool, id) {
    const rec = ratings[pool][id];
    if (!rec.games) return null;
    const placed = rec.games >= 4;
    const idx = rankIndex(rec.r);
    const lower = RANKS[idx][0] < -1e8 ? 860 : RANKS[idx][0], upper = idx === 0 ? 1400 : RANKS[idx - 1][0];
    const progress = Math.max(0, Math.min(1, (rec.r - lower) / (upper - lower)));
    const recentRank = rec.history.filter(h => h.t < startOfMonth()).slice(-1)[0];
    const promoted = recentRank && rankIndex(recentRank.r) > idx;
    return {rank: placed ? rankOf(rec.r) : null, placement_games: Math.min(4, rec.games), protected_until: placed && promoted ? nextMonthStart() : null,
      games: rec.games, wins: rec.wins, losses: rec.losses,
      // NEU: Stufe innerhalb der Liga (I–III) und grober Fortschritt – die Spielstärke selbst bleibt verborgen
      tier: placed ? Math.min(3, 1 + Math.floor(progress * 3)) : null, progress: placed ? Math.round(progress * 100) / 100 : null,
      next_rank: placed && idx > 0 ? RANKS[idx - 1][1] : null};
  }
  const lbCache = {};
  function leaderboard(pool, month) {
    const key = pool + month + ':' + matches.filter(m => m.status === 'confirmed').length + ':' + adminRev;
    if (!lbCache[key]) lbCache[key] = leaderboardRaw(pool, month);
    return JSON.parse(JSON.stringify(lbCache[key]));
  }
  function leaderboardRaw(pool, month) {
    const inMonth = matches.filter(m => m.pool === pool && m.status === 'confirmed' && monthOf(m.confirmed_at) === month);
    const rows = new Map();
    for (const m of inMonth) {
      const aWon = m.result.score_a > m.result.score_b;
      m.teams.forEach((team, i) => team.forEach(p => {
        const row = rows.get(p.id) || {player: {id: p.id, name: p.name, ball: cards[p.id]?.ball || 0, av: avOf(p.id)}, games: 0, wins: 0, losses: 0, league_points: 0, bonus: 0, opponents: {}};
        const won = i === 0 ? aWon : !aWon;
        row.games++; won ? row.wins++ : row.losses++;
        // NEU: Monatsliga-Punkte – Sieg 3, Niederlage 1, +1 gegen höhere Liga, max. 3 Wertungen gegen denselben Gegner
        const opp = m.teams[1 - i][0];
        row.opponents[opp.id] = (row.opponents[opp.id] || 0) + 1;
        if (row.opponents[opp.id] <= 3) {
          row.league_points += won ? 3 : 1;
          if (rankIndex(ratings[pool][opp.id].r) < rankIndex(ratings[pool][p.id].r)) { row.league_points++; row.bonus++; }
        }
        rows.set(p.id, row);
      }));
    }
    const list = [...rows.values()].map(row => {
      const rt = ratingFor(pool, row.player.id) || {};
      delete row.opponents;
      return {...row, rank: rt.rank, placement_games: rt.placement_games || 0, provisional: !rt.rank, protected_until: rt.protected_until, tier: rt.tier};
    }).sort((a, b) => (a.provisional - b.provisional) || (ratings[pool][b.player.id].r - ratings[pool][a.player.id].r));
    let place = 0; list.forEach(row => { row.place = row.provisional ? null : ++place; });
    // NEU: Titel des Monats
    const allMonth = matches.filter(m => m.status === 'confirmed' && monthOf(m.confirmed_at) === month);
    const days = {};
    allMonth.forEach(m => m.teams.flat().forEach(p => { (days[p.id] ||= new Set()).add(dayOf(m.confirmed_at)); }));
    const regular = Object.entries(days).sort((a, b) => b[1].size - a[1].size)[0];
    const climb = list.filter(r => r.games >= 5).map(r => {
      const h = ratings[pool][r.player.id].history; const before = h.filter(x => monthOf(x.t) < month).slice(-1)[0]?.r ?? 1000;
      const after = h.filter(x => monthOf(x.t) <= month).slice(-1)[0]?.r ?? before; return {player: r.player, delta: Math.round(after - before)};
    }).sort((a, b) => b.delta - a.delta)[0];
    const champion = list.find(r => !r.provisional && r.rank === '1. Café-Liga');
    const months = [...new Set(matches.filter(m => m.confirmed_at).map(m => monthOf(m.confirmed_at)))].sort().reverse();
    return {pool, month, months, rows: list, titles: {
      regular: regular ? {player: {id: regular[0], name: byId(regular[0]).name}, days: regular[1].size} : null,
      climber: climb && climb.delta > 0 ? {player: climb.player} : null,
      champion: champion ? {player: champion.player} : null}};
  }

  // ---------- Wochenaufgaben, Abzeichen, Bonusheft ----------
  const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  // Wochenaufgaben sind Definitionen, die der Inhaber im Admin-Panel pflegt
  const questDefs = [
    {id: 'q-neu', title: 'Neuer Gegner', text: 'Spiel gegen jemanden, gegen den du noch nie gespielt hast.', type: 'new_opponent', goal: 1},
    {id: 'q-9', title: '9-Ball-Woche', text: 'Spiel zwei Partien 9-Ball.', type: 'pool', pool: '9-single', goal: 2},
    {id: 'q-hoch', title: 'Nach oben fordern', text: 'Spiel gegen jemanden aus einer höheren Café-Liga.', type: 'higher_liga', goal: 1}
  ];
  const QUEST_TYPES = {new_opponent: 'Neuer Gegner', pool: 'Partien einer Disziplin', higher_liga: 'Gegner aus höherer Liga', weekday: 'Partien an einem Wochentag', doubles: 'Doppelpartien', games: 'Partien insgesamt'};
  function quests() {
    const week = myConfirmed().filter(m => Date.parse(m.confirmed_at) >= startOfWeek());
    const earlier = myConfirmed().filter(m => Date.parse(m.confirmed_at) < startOfWeek());
    const opp = m => m.teams[1 - sideOf(m, ME)];
    const knownBefore = new Set(earlier.flatMap(m => opp(m).map(p => p.id)));
    const count = d => {
      if (d.type === 'new_opponent') return week.filter(m => opp(m).some(p => !knownBefore.has(p.id))).length;
      if (d.type === 'pool') return week.filter(m => m.pool === d.pool).length;
      if (d.type === 'higher_liga') return week.filter(m => opp(m).some(p => rankIndex(ratings[m.pool][p.id].r) < rankIndex(ratings[m.pool][ME].r))).length;
      if (d.type === 'weekday') return week.filter(m => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(berlinParts(new Date(m.confirmed_at)).weekday) === Number(d.weekday)).length;
      if (d.type === 'doubles') return week.filter(m => m.pool === '8-double').length;
      return week.length;
    };
    return questDefs.map(d => { const progress = Math.min(d.goal, count(d)); return {id: d.id, title: d.title, text: d.text, progress, goal: d.goal, done: progress >= d.goal, reward: '1 Stempel'}; });
  }
  function updateRewards() {
    for (const q of quests()) if (q.done && !game.questsDone.has(q.id)) { game.questsDone.add(q.id); game.stamps++; game.unseen.push(`Wochenaufgabe „${q.title}“ geschafft · +1 Stempel`); }
    for (const m of myConfirmed()) { const d = dayOf(m.confirmed_at); if (Date.parse(m.confirmed_at) >= startOfWeek() && !game.playDays.has(d)) { game.playDays.add(d); game.stamps++; game.unseen.push('Spieltag im Café · +1 Stempel'); } }
  }
  quests().filter(q => q.done).forEach(q => game.questsDone.add(q.id));

  function badges(pid = ME) {
    const mine = confirmedOf(pid);
    const opps = new Set(mine.flatMap(m => m.teams[1 - sideOf(m, pid)].map(p => p.id)));
    const pools = new Set(mine.map(m => m.pool));
    const won = m => (sideOf(m, pid) === 0) === (m.result.score_a > m.result.score_b);
    let streak = 0, best = 0; mine.forEach(m => { streak = won(m) ? streak + 1 : 0; best = Math.max(best, streak); });
    const giant = Math.max(0, ...mine.filter(won).map(m => {
      const opp = m.teams[1 - sideOf(m, pid)][0];
      return rankIndex(ratings[m.pool][pid].r) - rankIndex(ratings[m.pool][opp.id].r);
    }));
    const days = new Set(mine.map(m => dayOf(m.confirmed_at))).size;
    const doubles = mine.filter(m => m.pool === '8-double').length;
    const mentor = mine.filter(m => m.teams[1 - sideOf(m, pid)].some(p => ratings[m.pool][p.id].games < 6)).length;
    const tiered = (id, title, text, value, steps, unit) => {
      const tier = steps.filter(s => value >= s).length;
      return {id, title, text, value, steps, tier, unit, next: steps[tier] ?? null};
    };
    return [
      tiered('erste-kugel', 'Erste Kugel', 'Deine erste bestätigte Partie.', mine.length, [1], 'Partie'),
      tiered('gesellig', 'Gesellig', 'Verschiedene Gegner am Tisch.', opps.size, [5, 15, 40], 'Gegner'),
      tiered('mentor', 'Mentor', 'Partien gegen Neue in der Platzierung.', mentor, [3, 10, 25], 'Partien'),
      tiered('allrounder', 'Allrounder', 'Verschiedene Disziplinen gespielt.', pools.size, [3, 4, 5], 'Disziplinen'),
      tiered('serie', 'Siegesserie', 'Siege in Folge.', best, [3, 5, 10], 'Siege'),
      tiered('riesentoeter', 'Riesentöter', 'Sieg gegen eine höhere Café-Liga.', giant, [1, 2, 3], 'Ligen höher'),
      tiered('treue', 'Treue Seele', 'Verschiedene Tage im Café gespielt.', days, [10, 25, 50], 'Tage'),
      tiered('serie141', 'Höchstserie 14/1', 'Kugeln am Stück im Live-Spielblatt.', pid === ME ? 22 : 0, [15, 30, 50], 'Kugeln'),
      tiered('doppelpack', 'Doppelpack', 'Doppelpartien gespielt.', doubles, [5, 15, 30], 'Doppel'),
      tiered('fairplay', 'Fair Play', 'Partien ohne Widerspruch.', mine.length, [25, 50, 100], 'Partien'),
      tiered('turnier', 'Turnierspieler', 'Teilnahme, Finale, Turniersieg.', pid === ME ? 1 : 0, [1, 2, 3], 'Stufe'),
      tiered('aufsteiger', 'Aufsteiger', 'Erster Aufstieg in eine höhere Café-Liga.', pid === ME ? 1 : 0, [1], 'Aufstieg'),
      tiered('monatssieger', 'Monatssieger', 'Einmal eine Monatsliga gewonnen.', 0, [1], 'Titel'),
      tiered('champion', 'Champion des Hauses', 'Einmal Platz 1 der 1. Café-Liga.', 0, [1], 'Titel')
    ];
  }

  // ---------- Events, Tische, Neuigkeiten ----------
  const at = (daysAhead, weekdayTarget, hour, minute = 0) => {
    const base = new Date(); const p = berlinParts(base);
    const wd = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(p.weekday);
    let add = (weekdayTarget - wd + 7) % 7; if (add === 0) add = 7; add += daysAhead;
    const d = new Date(base.getTime() + add * DAY); const q = berlinParts(d);
    return `${q.year}-${q.month}-${q.day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+01:00`;
  };
  const events = [
    {id: 'e1', type: 'Einsteigerabend', title: 'Einsteigerabend: Regeln & erste Stöße', starts_at: at(0, 1, 19), place: 'Tische 1–3', description: 'Stammspieler zeigen Grundlagen. Ideal für die ersten Partien in der Rangliste. Queues zum Leihen sind da.', price: 'Tischzeit frei', capacity: 12, participants: 5},
    {id: 'e2', type: 'Turnier', title: '9-Ball-Hausturnier', starts_at: at(0, 4, 19, 30), place: 'Alle Tische', description: 'Doppel-K.-o., Race to 5. Turnierbaum live auf dem Café-Bildschirm. Zählt für das Abzeichen „Turnierspieler“.', price: '10 € Startgeld', capacity: 16, participants: 11, sponsor: 'Musterbrauerei (Demo-Sponsor)'},
    {id: 'e3', type: 'Doppel', title: 'Doppel-Nacht 8-Ball', starts_at: at(7, 5, 20), place: 'Tische 1–4', venue_id: 'v-ufer', venue_note: 'Ausweichort: Im Stammhaus werden die Tücher erneuert.', venue_changed_at: iso(Date.now() - 2 * 86400000), description: 'Partner werden ausgelost – Starke spielen mit Neuen. Zählt für Doppelpack und Mentor.', price: 'Tischzeit halber Preis', capacity: 24, participants: 14},
    {id: 'e4', type: 'Siegerehrung', title: 'Siegerehrung der Monatsligen', starts_at: at(0, 5, 21), place: 'Theke', description: 'Die Monatssieger aller Café-Ligen, Stammgast und Aufsteiger des Monats bekommen ihre Preise.', price: 'frei', capacity: null, participants: null}
  ];
  // Tische mit QR-Code: Der Code enthält nur ein zufälliges Kürzel, keine Tischnummer – so lässt sich ein abfotografierter Code jederzeit ersetzen.
  const token = () => Array.from({length: 10}, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
  const pushPrefs = {enabled: false, topics: ['matches', 'rewards', 'events']};
  const tables = [
    ...Array.from({length: 8}, (_, i) => ({id: 't-haus-' + (i + 1), no: i + 1, venue_id: 'v-haus', name: i === 7 ? 'Snookertisch' : '', kind: i === 7 ? 'Snooker' : 'Pool', sensor_id: 'K' + (i + 1), token: token(), active: true, busy: [1, 2, 4, 5, 7].includes(i + 1), since: now() - [47, 12, 0, 83, 25, 0, 6, 0][i] * 60000})),
    ...Array.from({length: 4}, (_, i) => ({id: 't-ufer-' + (i + 1), no: i + 1, venue_id: 'v-ufer', name: i === 0 ? 'Fenstertisch' : '', kind: 'Pool', sensor_id: '', token: token(), active: true, busy: i === 1, since: now() - 33 * 60000}))
  ];
  const TABLE_KINDS = ['Pool', 'Snooker', 'Karambol'];
  const tableOut = t => ({id: t.id, no: t.no, name: t.name, kind: t.kind, status: t.busy ? 'busy' : 'free', since: t.busy ? iso(t.since) : null, sensor: !!t.sensor_id});
  const feed = [
    'Lena ist in die 1. Café-Liga aufgestiegen',
    'Mira hat das Abzeichen „Riesentöter“ in Silber',
    'Deniz hat zum ersten Mal 14/1 gespielt',
    'Ahmet verteidigt Platz 1 der 1. Café-Liga',
    'Fritzi hat die Platzierung abgeschlossen: 4. Café-Liga',
    'Kalle führt die Monatsliga der 4. Café-Liga an'
  ];

  // ---------- Spielerprofile (Kugel, Motto, Titel, Vitrine) ----------
  const POOL_LABEL = {'8-single': '8-Ball', '9-single': '9-Ball', '10-single': '10-Ball', '14-single': '14/1', '8-double': '8-Ball Doppel'};
  const MOTTOS = ['Erst denken, dann stoßen.', 'Lieber Safety als Sorry.', 'Kreide ist Pflicht.', 'Jeden Dienstag am Tisch 4.', '', '', 'Bande, Bande, Loch.', ''];
  const cards = {};
  const PRESET_IDS = ['acht', 'queues', 'kreide', 'dreieck', 'tasche', 'pokal', 'neun', 'lampe'];
  players.forEach((p, i) => { cards[p.id] = {motto: MOTTOS[i % MOTTOS.length], ball: p.id === ME ? 6 : ((i * 7) % 15) + 1, favorite_pool: i % 3 === 0 ? '9-single' : '8-single', title_id: null, showcase: [], visibility: i === 11 ? 'hidden' : 'public',
    avatar_type: i % 3 === 1 ? 'preset' : 'ball', preset_id: PRESET_IDS[i % PRESET_IDS.length], photo: null}; });
  // Profilbild für andere: privates Profil zeigt nur die Kugel
  const avOf = pid => { const c = cards[pid]; if (!c) return null; const own = pid === session.user?.id;
    if (c.visibility === 'hidden' && !own) return {type: 'ball'};
    return {type: c.avatar_type || 'ball', preset: c.preset_id, photo: c.avatar_type === 'photo' ? c.photo : null}; };
  const monthName = m => new Intl.DateTimeFormat('de-DE', {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(m + '-15T12:00:00Z'));
  const honorCache = {};
  function honors(pid) {
    const key = matches.filter(m => m.status === 'confirmed').length + ':' + game.questsDone.size + ':' + adminRev;
    if (honorCache[pid]?.key === key) return honorCache[pid].list;
    ensureCloses();
    const out = [];
    // Monatstitel gibt es erst, wenn der Inhaber den Monatsabschluss bestätigt hat
    for (const [month, close] of Object.entries(closes)) for (const it of close.items) {
      if (it.status === 'approved' && it.player === pid) out.push({id: `mc-${month}-${it.key}`, name: it.award.name, sub: `${it.pool ? POOL_LABEL[it.pool] + ' · ' : ''}${monthName(month)}`, kind: it.award.kind, tier: it.award.tier, by_cafe: true});
    }
    for (const g of granted[pid] || []) out.push({...g, by_cafe: true});
    for (const b of badges(pid)) if (b.tier) out.push({id: `bd-${b.id}`, name: b.title, sub: b.steps.length > 1 ? ['Bronze', 'Silber', 'Gold'][b.tier - 1] : 'Abzeichen', kind: 'abzeichen', tier: b.steps.length > 1 ? b.tier : 3});
    const list = out.filter(x => !(revoked[pid] || new Set()).has(x.id));
    honorCache[pid] = {key, list};
    return list;
  }
  function cardOf(pid) {
    const c = cards[pid];
    const h = honors(pid);
    if (c.title_id && !h.some(x => x.id === c.title_id)) c.title_id = null;
    c.showcase = c.showcase.filter(id => h.some(x => x.id === id));
    if (!c.title_id && h.length && !c.title_chosen) c.title_id = (h.find(x => x.kind === 'pokal') || h[0]).id;
    if (!c.showcase.length && !c.showcase_chosen) c.showcase = h.filter(x => x.kind !== 'abzeichen' && x.kind !== 'titel').concat(h.filter(x => x.kind !== 'titel')).map(x => x.id).filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
    return {c, h};
  }
  const titleName = pid => { const {c, h} = cardOf(pid); return h.find(x => x.id === c.title_id)?.name || null; };
  const pub = p => ({id: p.id, name: p.name, ball: cards[p.id]?.ball || 0, av: avOf(p.id), title: titleName(p.id)});
  function profile(pid) {
    const p = byId(pid);
    const self = pid === session.user?.id;
    if (cards[pid].visibility === 'hidden' && !self) return {player: {id: p.id, name: p.name, ball: cards[pid].ball, av: {type: 'ball'}}, hidden: true};
    const {c, h} = cardOf(pid);
    const all = confirmedOf(pid);
    const won = m => (sideOf(m, pid) === 0) === (m.result.score_a > m.result.score_b);
    return {player: pub(p), self, card: {...c}, titles: h.filter(x => x.kind !== 'abzeichen' || x.tier === 3), trophies: h.filter(x => x.kind !== 'titel'),
      ratings: Object.fromEntries(POOLS.map(pool => [pool, ratingFor(pool, pid)]).filter(([, v]) => v)),
      summary: {games: all.length, wins: all.filter(won).length, losses: all.length - all.filter(won).length, since: all[0]?.confirmed_at || null}};
  }
  function stats(pid) {
    const all = confirmedOf(pid).sort((a, b) => Date.parse(a.confirmed_at) - Date.parse(b.confirmed_at));
    const won = m => (sideOf(m, pid) === 0) === (m.result.score_a > m.result.score_b);
    let cur = 0, best = 0; all.forEach(m => { cur = won(m) ? cur + 1 : 0; best = Math.max(best, cur); });
    const rivals = {};
    all.forEach(m => m.teams[1 - sideOf(m, pid)].forEach(o => { const r = rivals[o.id] ||= {player: pub(byId(o.id)), wins: 0, losses: 0}; won(m) ? r.wins++ : r.losses++; }));
    const weekdays = [0, 0, 0, 0, 0, 0, 0];
    all.forEach(m => { const wd = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(berlinParts(new Date(m.confirmed_at)).weekday); weekdays[wd]++; });
    const months = [];
    for (let k = 3; k >= 0; k--) { const d = new Date(now()); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - k); const mo = monthOf(d); const ms = all.filter(m => monthOf(m.confirmed_at) === mo); months.push({month: mo, games: ms.length, wins: ms.filter(won).length}); }
    return {
      bands: RANKS.slice(0, 3).map(([min, name]) => ({min, name})),
      history: Object.fromEntries(POOLS.map(pool => [pool, [{t: Date.parse(all[0]?.confirmed_at || now()) - DAY, r: 1000}, ...ratings[pool][pid].history.map(h => ({t: h.t, r: Math.round(h.r)}))]]).filter(([pool]) => ratings[pool][pid].games)),
      per_pool: Object.fromEntries(POOLS.map(pool => { const r = ratings[pool][pid]; return [pool, {games: r.games, wins: r.wins, losses: r.losses, rank: ratingFor(pool, pid)?.rank || null}]; }).filter(([, v]) => v.games)),
      form: all.slice(-10).map(m => ({won: won(m), pool: m.pool, opponent: m.teams[1 - sideOf(m, pid)][0].name, score: sideOf(m, pid) === 0 ? `${m.result.score_a}:${m.result.score_b}` : `${m.result.score_b}:${m.result.score_a}`})),
      streak: {current: cur, best},
      rivals: Object.values(rivals).sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)).slice(0, 4),
      weekdays, months
    };
  }

  // =====================================================================
  // ADMIN: Café-Inhaber („owner“) und Personal an der Theke („staff“)
  // =====================================================================
  const catalog = [
    {id: 'cat-turnier', name: 'Turniersieger 9-Ball', kind: 'pokal', tier: 3, description: 'Sieg beim 9-Ball-Hausturnier.', archived: false},
    {id: 'cat-fairplay', name: 'Fair-Play-Preis', kind: 'medaille', tier: 2, description: 'Für besonders faires Verhalten am Tisch.', archived: false},
    {id: 'cat-helfer', name: 'Café-Helfer', kind: 'titel', tier: 3, description: 'Hilft Neuen beim Einstieg.', archived: false},
    {id: 'cat-stunde', name: '1 Tischstunde gratis', kind: 'gutschein', valid_days: 90, description: 'Einlösbar an jedem Tisch.', archived: false},
    {id: 'cat-getraenk', name: '1 Getränk aufs Haus', kind: 'gutschein', valid_days: 30, sponsor: 'Musterbrauerei (Demo-Sponsor)', description: 'Alkoholfrei oder Bier vom Fass.', archived: false}
  ];
  const KIND_LABEL = {pokal: 'Pokal', medaille: 'Medaille', titel: 'Titel', gutschein: 'Gutschein'};
  const granted = {};    // pid -> [{id, name, kind, tier, sub, granted_at, granted_by, reason}]
  const revoked = {};    // pid -> Set(honor id)
  const blocked = {};    // pid -> {reason, at}
  const merged = {};     // alte pid -> neue pid
  const otherStamps = {};
  const audit = [];
  const closes = {};
  let closesReady = false;
  const staffRole = () => session.authenticated ? session.user?.role || null : null;
  const fmtDate = t => new Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric'}).format(new Date(t));
  const stampsOf = pid => pid === ME ? game.stamps : (otherStamps[pid] ??= (pid.charCodeAt(1) * 7 + pid.length * 3) % 10);
  const playerName = pid => pid ? byId(pid)?.name || pid : 'Ohne Empfänger';
  function log(action, label, pid, detail, reason) {
    audit.unshift({id: 'au' + (audit.length + 1), at: iso(now()), actor: session.user?.name || 'System', role: session.user?.role || 'system', action, label, player_id: pid || null, player_name: pid ? playerName(pid) : null, detail: detail || '', reason: reason || ''});
    adminRev++;
  }
  function inbox(pid, text) { if (pid === ME) game.unseen.push(text); }
  const batches = [];   // Gutschein-Aktionen des Inhabers

  // ---------- Turniere (K.-o.-System mit Setzliste, Freilosen, optional Spiel um Platz 3) ----------
  const tournaments = [];
  const ROUND_NAME = (r, total) => ({1: 'Finale', 2: 'Halbfinale', 3: 'Viertelfinale', 4: 'Achtelfinale'})[total - r] || `Runde ${r + 1}`;
  function seedOrder(size) { let o = [1, 2]; while (o.length < size) { const n = o.length * 2 + 1; o = o.flatMap(x => [x, n - x]); } return o; }
  function seedPlayers(t) {
    if (t.seeding === 'random') return [...t.players].sort(() => Math.random() - .5);
    const r = pid => ratings[t.pool]?.[pid]?.r || 1000;
    return [...t.players].sort((a, b) => r(b) - r(a));
  }
  function buildBracket(t) {
    const seeded = seedPlayers(t);
    let size = 2; while (size < seeded.length) size *= 2;
    const total = Math.log2(size), order = seedOrder(size);
    t.rounds = Array.from({length: total}, (_, r) => Array.from({length: size / 2 ** (r + 1)}, (_, i) => ({id: `m${r}-${i}`, a: null, b: null, score_a: null, score_b: null, winner: null, table_no: null, status: 'open'})));
    t.seeds = Object.fromEntries(seeded.map((pid, i) => [pid, i + 1]));
    t.rounds[0].forEach((m, i) => { m.a = seeded[order[2 * i] - 1] || null; m.b = seeded[order[2 * i + 1] - 1] || null; });
    t.third = t.third_place && size >= 4 ? {id: 'm-3', a: null, b: null, score_a: null, score_b: null, winner: null, table_no: null, status: 'open'} : null;
    t.rounds[0].forEach(m => { if (!m.a || !m.b) { m.winner = m.a || m.b; m.status = 'bye'; advance(t, m); } });
  }
  function locate(t, id) {
    if (t.third?.id === id) return {m: t.third, r: -1, i: 0};
    for (let r = 0; r < t.rounds.length; r++) { const i = t.rounds[r].findIndex(m => m.id === id); if (i >= 0) return {m: t.rounds[r][i], r, i}; }
    return null;
  }
  function advance(t, m) {
    const at = locate(t, m.id); if (!at || at.r < 0) return checkFinished(t);
    const next = t.rounds[at.r + 1]?.[Math.floor(at.i / 2)];
    if (next) next[at.i % 2 === 0 ? 'a' : 'b'] = m.winner;
    if (t.third && at.r === t.rounds.length - 2 && m.status !== 'bye') t.third[at.i % 2 === 0 ? 'a' : 'b'] = m.winner === m.a ? m.b : m.a;
    checkFinished(t);
  }
  function checkFinished(t) {
    const fin = t.rounds[t.rounds.length - 1][0];
    if (fin.winner && (!t.third || t.third.winner || !t.third.a || !t.third.b)) {
      t.status = 'finished'; t.finished_at ||= iso(now());
      const semis = t.rounds.length > 1 ? t.rounds[t.rounds.length - 2].map(m => m.winner === m.a ? m.b : m.a).filter(Boolean) : [];
      t.places = {1: [fin.winner], 2: [fin.winner === fin.a ? fin.b : fin.a], 3: t.third?.winner ? [t.third.winner] : semis};
      feed.unshift(`${playerName(fin.winner)} gewinnt „${t.name}“`);
    }
  }
  const tp = pid => pid ? {...pub(byId(pid)), seed: null} : null;
  function tournamentOut(t, admin = false) {
    const m = x => x && {...x, a: tp(x.a), b: tp(x.b)};
    const total = t.rounds?.length || 0;
    return {id: t.id, name: t.name, pool: t.pool, pool_label: POOL_LABEL[t.pool], race_to: t.race_to, status: t.status, event_id: t.event_id || null, venue: venueOut(t.venue_id), live_on_tv: t.live_on_tv,
      third_place: t.third_place, seeding: t.seeding, starts_at: t.starts_at, finished_at: t.finished_at || null,
      players: t.players.map(pid => ({...pub(byId(pid)), seed: t.seeds?.[pid] || null})),
      rounds: (t.rounds || []).map((ms, r) => ({name: ROUND_NAME(r, total), matches: ms.map(m)})), third: m(t.third),
      places: t.places ? Object.fromEntries(Object.entries(t.places).map(([k, v]) => [k, v.map(pid => pub(byId(pid)))])) : null,
      prizes: admin ? t.prizes : undefined, prizes_awarded: t.prizes_awarded || null};
  }
  function awardPrizes(t, reason) {
    const out = [];
    for (const place of [1, 2, 3]) {
      const pr = t.prizes?.[place] || {}; const k = catalog.find(x => x.id === pr.catalog_id && x.kind !== 'gutschein'); const vk = catalog.find(x => x.id === pr.voucher_id && x.kind === 'gutschein');
      for (const pid of t.places?.[place] || []) {
        if (k) (granted[pid] ||= []).push({id: 'gr-' + Math.random().toString(36).slice(2, 8), catalog_id: k.id, name: k.name, kind: k.kind, tier: k.tier, sub: `${t.name} · Platz ${place}`, granted_at: iso(now()), granted_by: session.user.name, reason: reason || t.name});
        if (vk) issueVoucher(pid, vk.name, vk.valid_days, t.name, vk.venue_id ? {venue_id: vk.venue_id} : {});
        if (k || vk) { inbox(pid, `Glückwunsch zu Platz ${place} bei „${t.name}“!${k ? ` Neu in deiner Vitrine: ${k.name}.` : ''}${vk ? ` Gutschein: ${vk.name}.` : ''}`); out.push(`${place}. ${playerName(pid)}`); }
      }
    }
    t.prizes_awarded = {at: iso(now()), by: session.user.name};
    log('tournament', 'Turnierpreise vergeben', null, `${t.name}: ${out.join(', ') || 'keine Preise hinterlegt'}`, reason);
    adminRev++;
  }

  // ---------- Café-Bildschirm (Café-TV) ----------
  const TV_BUILTIN = {leaders: 'Monatsliga · Führende', tournament: 'Turnierbaum (laufendes Turnier)', podium: 'Siegerehrung (letztes Turnier)', event: 'Nächstes Event', feed: 'Neu im Café', quests: 'Wochenaufgaben'};
  const TV_MODES = {rotation: 'Folien im Wechsel', tournament: 'Turnieransicht', podium: 'Siegerehrung', slide: 'Eine Folie dauerhaft'};
  // Mediathek: Bilder (Getränke, Plakate, Sponsor-Banner) und Videos. Demo: Bilder als data-URL, Videos als blob-URL nur in dieser Sitzung.
  const DEMO_BANNER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 160"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#7a1f12"/><stop offset="1" stop-color="#c2541c"/></linearGradient></defs><rect width="1200" height="160" rx="18" fill="url(#g)"/><circle cx="90" cy="80" r="52" fill="#f6e7c4"/><text x="90" y="96" font-family="Georgia" font-size="46" font-weight="700" text-anchor="middle" fill="#7a1f12">M</text><text x="175" y="78" font-family="Arial" font-size="50" font-weight="700" fill="#fff4dc">MUSTERBRAUEREI</text><text x="177" y="122" font-family="Arial" font-size="26" fill="#ffd9a8">Demo-Sponsor · Frisch vom Fass seit 1898</text></svg>');
  const DEMO_LIMO = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#123b2c"/><circle cx="400" cy="430" r="300" fill="#1c5a40"/><path d="M300 200h200l-30 460a40 40 0 0 1-40 36h-60a40 40 0 0 1-40-36z" fill="#f3d36b" stroke="#fff6d8" stroke-width="10"/><path d="M310 300h180" stroke="#fff6d8" stroke-width="8"/><circle cx="360" cy="420" r="16" fill="#fff6d8" opacity=".7"/><circle cx="420" cy="500" r="11" fill="#fff6d8" opacity=".7"/><circle cx="390" cy="580" r="13" fill="#fff6d8" opacity=".7"/><path d="M440 120l-40 120" stroke="#e8742a" stroke-width="18" stroke-linecap="round"/><circle cx="510" cy="230" r="46" fill="#9ccf4f" stroke="#fff6d8" stroke-width="8"/><text x="400" y="770" font-family="Arial" font-size="40" fill="#fff6d8" text-anchor="middle" opacity=".6">Demo-Bild</text></svg>');
  const media = [
    {id: 'md-banner', kind: 'image', name: 'Musterbrauerei Banner (Demo)', src: DEMO_BANNER, sponsor: 'Musterbrauerei (Demo-Sponsor)', banner: true, created_at: iso(now() - 5 * 86400000)},
    {id: 'md-limo', kind: 'image', name: 'Hauslimo', src: DEMO_LIMO, sponsor: '', banner: false, created_at: iso(now() - 2 * 86400000)}
  ];
  const tv = {seconds: 12, footer: 'Mitmachen: QR-Code am Tisch scannen · Rangliste, Turniere und Bonusheft in der App',
    slides: [{id: 'tournament', on: true}, {id: 'leaders', on: true}, {id: 'c-happy', on: true, custom: true, title: 'Happy Hour', text: 'Montag bis Donnerstag 17–19 Uhr: Tischzeit 30 % günstiger.', icon: 'coffee-cup'},
      {id: 'c-limo', on: true, custom: true, title: 'Getränk der Woche', text: 'Hausgemachte Limo · 0,4 l · 3,20 €', icon: 'coffee-cup', media_id: 'md-limo'}, {id: 'event', on: true}, {id: 'podium', on: true}, {id: 'feed', on: true}, {id: 'quests', on: true}],
    screens: [{id: 'haupt', name: 'Hauptbildschirm (Theke)', venue_id: 'v-haus', show_tables: true, mode: 'rotation', tournament_id: null, slide_id: null},
      {id: 'turnier', name: 'Turnierecke', venue_id: 'v-haus', show_tables: false, mode: 'tournament', tournament_id: 'tu-herbst', slide_id: null}],
    announcement: null, rev: 1};
  const tvOut = () => ({...tv, screens: tv.screens.map(sc => ({...sc, venue: venueOut(sc.venue_id), mode_label: TV_MODES[sc.mode]})), media: media.map(m => ({...m})), builtin: TV_BUILTIN, modes: TV_MODES, announcement: tv.announcement && Date.parse(tv.announcement.until) > now() ? tv.announcement : null});
  // Alles, was ein Bildschirm braucht, in einer Antwort – damit der TV-Player (tv-player.js) einfach und auch auf älteren TV-Browsern läuft.
  function tvBracket(t) {
    if (!t) return null;
    const pn = pid => pid ? {name: playerName(pid), ball: cards[pid]?.ball || 0} : null;
    const m = x => x && {id: x.id, a: pn(x.a), b: pn(x.b), score_a: x.score_a, score_b: x.score_b, win: x.winner ? (x.winner === x.a ? 'a' : 'b') : null, status: x.status, table_no: x.table_no};
    const total = t.rounds?.length || 0;
    const all = (t.rounds || []).flat().concat(t.third ? [t.third] : []);
    const roundOf = id => { if (t.third?.id === id) return 'Platz 3'; for (let r = 0; r < total; r++) if (t.rounds[r].some(x => x.id === id)) return ROUND_NAME(r, total); return ''; };
    return {id: t.id, name: t.name, pool_label: POOL_LABEL[t.pool], race_to: t.race_to, status: t.status, players: t.players.length,
      rounds: (t.rounds || []).map((ms, r) => ({name: ROUND_NAME(r, total), matches: ms.map(m)})), third: m(t.third),
      live: all.filter(x => x.status === 'live').map(x => ({...m(x), round: roundOf(x.id)})),
      next: all.filter(x => x.status === 'open' && x.a && x.b).slice(0, 4).map(x => ({...m(x), round: roundOf(x.id)})),
      results: all.filter(x => x.status === 'done').slice(-4).reverse().map(x => ({...m(x), round: roundOf(x.id)})),
      places: t.places ? Object.fromEntries(Object.entries(t.places).map(([k, v]) => [k, v.map(pid => pn(pid))])) : null};
  }
  function screenPayload(id) {
    seedTournaments();
    const sc = tv.screens.find(x => x.id === id) || tv.screens[0];
    const running = tournaments.find(t => t.status === 'running' && t.live_on_tv);
    const finished = tournaments.filter(t => t.status === 'finished').sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at))[0];
    const month = monthOf(now()), rows = leaderboard('8-single', month).rows.filter(r => !blocked[r.player.id]);
    const next = events.filter(ev => Date.parse(ev.starts_at) > now() - 3 * 3600000)[0];
    const mediaOf = mid => media.find(x => x.id === mid);
    const build = sl => {
      if (sl.custom) { const md = mediaOf(sl.media_id); return {id: sl.id, type: md && !sl.title && !sl.text ? 'media' : 'custom', title: sl.title, text: sl.text, icon: sl.icon, image: md?.kind === 'image' ? md.src : null, video: md?.kind === 'video' ? md.src : null, sponsor: md?.sponsor || ''}; }
      if (sl.id === 'leaders') { const L = RANKS.map(r => r[1]); const out = L.map(liga => { const r = rows.filter(x => x.rank === liga).sort((a, b) => b.league_points - a.league_points)[0]; return r && {liga, no: Number(liga[0]), name: r.player.name, points: r.league_points}; }).filter(Boolean); return out.length ? {id: sl.id, type: 'leaders', title: 'Monatsliga 8-Ball · Führende', rows: out} : null; }
      if (sl.id === 'tournament') return running ? {id: sl.id, type: 'bracket', title: running.name, t: tvBracket(running)} : null;
      if (sl.id === 'podium') return finished?.places ? {id: sl.id, type: 'podium', title: 'Siegerehrung · ' + finished.name, t: tvBracket(finished)} : null;
      if (sl.id === 'event') return next ? {id: sl.id, type: 'event', title: 'Nächstes Event', name: next.title, when: next.starts_at, price: next.price, venue: next.venue_id && next.venue_id !== mainVenue().id ? venueOut(next.venue_id) : null, seats: next.capacity ? `${next.participants + (game.registered.has(next.id) ? 1 : 0)}/${next.capacity} angemeldet – Anmeldung in der App` : ''} : null;
      if (sl.id === 'feed') return {id: sl.id, type: 'list', title: 'Neu im Café', items: feed.slice(0, 6).map(t => ({title: t}))};
      if (sl.id === 'quests') return {id: sl.id, type: 'list', title: 'Wochenaufgaben', items: questDefs.map(q => ({title: q.title, text: q.text})), note: 'Jede erledigte Aufgabe = 1 Stempel im Bonusheft'};
      return null;
    };
    const tsel = sc.tournament_id ? tournaments.find(t => t.id === sc.tournament_id) : null;
    let slides;
    if (sc.mode === 'tournament') { const t = tsel || running || finished; slides = t ? [{id: 'tour', type: t.status === 'finished' ? 'podium' : 'tournament', title: t.name, t: tvBracket(t)}] : []; }
    else if (sc.mode === 'podium') { const t = (tsel && tsel.places ? tsel : finished); slides = t ? [{id: 'pod', type: 'podium', title: 'Siegerehrung · ' + t.name, t: tvBracket(t)}] : []; }
    else if (sc.mode === 'slide') { const sl = tv.slides.find(x => x.id === sc.slide_id); slides = sl ? [build(sl)].filter(Boolean) : []; }
    else slides = tv.slides.filter(sl => sl.on).map(build).filter(Boolean);
    const tbl = tables.filter(t => t.active && t.venue_id === sc.venue_id).sort((a, b) => a.no - b.no).map(tableOut);
    return {screen: {id: sc.id, name: sc.name, mode: sc.mode, show_tables: sc.show_tables && sc.mode === 'rotation'}, venue: venueOut(sc.venue_id), seconds: tv.seconds, footer: tv.footer,
      banners: media.filter(m => m.banner && m.kind === 'image').map(m => ({src: m.src, name: m.sponsor || m.name})), tables: tbl, slides,
      announcement: tvOut().announcement, rev: tv.rev + ':' + adminRev + ':' + matches.length, now: iso(now())};
  }
  let tourSeeded = false;
  function seedTournaments() {
    if (tourSeeded) return; tourSeeded = true;
    const ids = activePlayers().filter(p => p.id !== ME).slice(0, 7).map(p => p.id).concat(ME);
    const cup = {id: 'tu-herbst', name: '8-Ball Herbst-Cup', pool: '8-single', race_to: 3, third_place: true, seeding: 'rating', venue_id: 'v-haus', status: 'running', live_on_tv: true, players: ids, starts_at: iso(now() - 2 * 3600000),
      prizes: {1: {catalog_id: 'cat-turnier', voucher_id: 'cat-stunde'}, 2: {catalog_id: 'cat-fairplay', voucher_id: 'cat-getraenk'}, 3: {catalog_id: '', voucher_id: 'cat-getraenk'}}};
    buildBracket(cup);
    cup.rounds[0].forEach((m, i) => { if (i < 3) { m.score_a = 3; m.score_b = i; m.winner = m.a; m.status = 'done'; advance(cup, m); } });
    cup.rounds[0][3].table_no = 4; cup.rounds[0][3].status = 'live';
    cup.rounds[1][0].table_no = 2; cup.rounds[1][0].status = 'live';
    const ev = events.find(x => x.id === 'e2');
    tournaments.push(cup, {id: 'tu-9ball', name: '9-Ball-Hausturnier', pool: '9-single', race_to: 5, third_place: false, seeding: 'rating', venue_id: 'v-haus', status: 'draft', live_on_tv: true, event_id: 'e2', players: ev ? eventParticipants(ev) : [], starts_at: ev?.starts_at || iso(now() + 4 * 86400000), prizes: {1: {catalog_id: 'cat-turnier', voucher_id: 'cat-stunde'}, 2: {}, 3: {}}});
  }
  // Orte (Standorte): Events und Gutscheine können optional an einen Ort gebunden sein.
  const venues = [
    {id: 'v-haus', name: 'Billardcafé Merzig', address: 'Merzig · Stammhaus (Demo-Adresse)', note: '', main: true, archived: false},
    {id: 'v-ufer', name: 'Café am Saarufer (Demo)', address: 'Beispielweg 5, 66663 Merzig', note: 'Zweitlokal mit 4 Tischen', main: false, archived: false}
  ];
  const mainVenue = () => venues.find(v => v.main);
  const venueOut = id => { const v = venues.find(x => x.id === id) || mainVenue(); return {id: v.id, name: v.name, address: v.address, main: !!v.main}; };
  const vOut = v => ({...v, player: playerName(v.player_id), venue: v.venue_id ? venueOut(v.venue_id) : null});
  const venueOK = id => !id || venues.some(v => v.id === id && !v.archived);
  function issueVoucher(pid, title, days, source, extra = {}) {
    const v = {code: newCode(), title, valid_until: iso(now() + days * DAY), redeemed_at: null, redeemed_by: null, player_id: pid, source, ...extra};
    vouchers.unshift(v); return v;
  }
  function recomputeRatings() {
    POOLS.forEach(pool => players.forEach(p => { ratings[pool][p.id] = {r: 1000, games: 0, wins: 0, losses: 0, history: []}; }));
    matches.filter(m => m.status === 'confirmed').sort((a, b) => Date.parse(a.confirmed_at) - Date.parse(b.confirmed_at)).forEach(applyMatch);
    adminRev++;
  }

  // ---------- Monatsabschluss: Vorschläge, eine Auszeichnung pro Person ----------
  function monthCandidates(month) {
    const out = [];
    for (const pool of ['8-single', '9-single']) {
      const lb = leaderboard(pool, month);
      if (pool === '8-single') out.push({key: 'champion', label: 'Champion des Hauses', pool, award: {name: 'Champion des Hauses', kind: 'pokal', tier: 3}, voucher: '1 Tischstunde gratis',
        candidates: lb.rows.filter(r => r.rank === '1. Café-Liga').map(r => r.player.id), basis: 'Platz 1 der 1. Café-Liga'});
      for (const [, liga] of RANKS) {
        const rows = lb.rows.filter(r => r.rank === liga).sort((a, b) => b.league_points - a.league_points);
        out.push({key: `${pool}-${liga[0]}`, label: `Monatssieger ${liga} · ${POOL_LABEL[pool]}`, pool, award: {name: `Monatssieger ${liga}`, kind: 'pokal', tier: liga[0] === '1' ? 3 : liga[0] === '2' ? 2 : 1}, voucher: '1 Tischstunde gratis',
          candidates: rows.map(r => r.player.id), points: Object.fromEntries(rows.map(r => [r.player.id, r.league_points])), basis: 'meiste Ligapunkte'});
      }
    }
    const days = {};
    matches.filter(m => m.status === 'confirmed' && monthOf(m.confirmed_at) === month).forEach(m => m.teams.flat().forEach(p => { (days[p.id] ||= new Set()).add(dayOf(m.confirmed_at)); }));
    out.push({key: 'regular', label: 'Stammgast des Monats', pool: null, award: {name: 'Stammgast des Monats', kind: 'medaille', tier: 2}, voucher: '1 Tischstunde gratis',
      candidates: Object.entries(days).sort((a, b) => b[1].size - a[1].size).map(([id]) => id), points: Object.fromEntries(Object.entries(days).map(([id, d]) => [id, d.size])), basis: 'meiste Spieltage'});
    const lb8 = leaderboard('8-single', month);
    const deltas = lb8.rows.filter(r => r.games >= 5).map(r => {
      const h = ratings['8-single'][r.player.id]?.history || [];
      const before = h.filter(x => monthOf(x.t) < month).slice(-1)[0]?.r ?? 1000, after = h.filter(x => monthOf(x.t) <= month).slice(-1)[0]?.r ?? before;
      return [r.player.id, Math.round(after - before)];
    }).filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1]);
    out.push({key: 'climber', label: 'Aufsteiger des Monats', pool: null, award: {name: 'Aufsteiger des Monats', kind: 'medaille', tier: 2}, voucher: 'Kreide & Handschuh (Sponsor)',
      candidates: deltas.map(([id]) => id), basis: 'größter Zuwachs an Spielstärke (mind. 5 Partien)'});
    // Regel: höchstens eine Auszeichnung pro Person – wer schon etwas hat, macht Platz für den Nächsten
    const taken = new Set();
    return out.filter(it => it.candidates.length).map(it => {
      const pick = it.candidates.find(id => !taken.has(id) && !blocked[id]);
      const skipped = it.candidates.slice(0, it.candidates.indexOf(pick)).filter(id => taken.has(id));
      if (pick) taken.add(pick);
      return {key: it.key, label: it.label, pool: it.pool, award: it.award, voucher: it.voucher, basis: it.basis, points: it.points || {},
        candidates: it.candidates.slice(0, 6), player: pick || null, proposed: pick || null,
        note: skipped.length ? `Nachrücker: ${skipped.map(playerName).join(', ')} ${skipped.length > 1 ? 'haben' : 'hat'} schon eine Auszeichnung in diesem Monat.` : '',
        status: pick ? 'pending' : 'empty', decided_by: null, decided_at: null, reason: ''};
    });
  }
  function ensureCloses() {
    if (closesReady) return;
    closesReady = true;
    const cur = monthOf(now());
    const months = [...new Set(matches.filter(m => m.confirmed_at).map(m => monthOf(m.confirmed_at)))].filter(m => m < cur).sort();
    months.forEach((month, i) => {
      const items = monthCandidates(month);
      const done = i < months.length - 1;     // ältere Monate sind schon abgeschlossen, der letzte wartet auf den Inhaber
      if (done) items.forEach(it => { if (it.status === 'pending') Object.assign(it, {status: 'approved', decided_by: 'Café-Team', decided_at: `${month}-28T21:00:00+01:00`}); });
      closes[month] = {month, status: done ? 'closed' : 'open', items};
    });
  }
  function approveItem(month, it, reason) {
    it.status = 'approved'; it.decided_by = session.user.name; it.decided_at = iso(now()); it.reason = reason || '';
    const v = issueVoucher(it.player, it.voucher, 90, `Monatsabschluss ${monthName(month)}`);
    inbox(it.player, `Glückwunsch! Du bist „${it.award.name}“ (${monthName(month)}) · Gutschein: ${v.title}`);
    log('month_award', 'Monatsauszeichnung bestätigt', it.player, `${it.label} · ${monthName(month)}`, reason);
  }
  function closeStatus(month) {
    const c = closes[month];
    if (c && c.items.every(it => it.status !== 'pending')) c.status = 'closed';
  }

  // ---------- Gutscheine verteilen: Empfänger auflösen ----------
  const activePlayers = () => players.filter(p => !merged[p.id] && !blocked[p.id]);
  function eventParticipants(ev) {
    // Demo: feste Auswahl als Teilnehmer, dazu Kreidefuchs, wenn angemeldet
    const n = ev.participants || 0;
    const list = activePlayers().filter(p => p.id !== ME).sort((x, y) => (x.id.charCodeAt(1) * 13 + ev.id.length) % 7 - (y.id.charCodeAt(1) * 13 + ev.id.length) % 7).slice(0, n).map(p => p.id);
    if (game.registered.has(ev.id)) list.push(ME);
    return list;
  }
  function resolveIssue(body = {}) {
    let title, days, note = String(body.note || '').trim().slice(0, 80);
    if (body.template === 'custom') {
      title = String(body.title || '').trim(); days = Number(body.valid_days);
      if (title.length < 3 || title.length > 40) return {error: 'Name des Gutscheins: 3 bis 40 Zeichen.'};
      if (!(days >= 1 && days <= 365)) return {error: 'Gültigkeit: 1 bis 365 Tage.'};
    } else {
      const k = catalog.find(x => x.id === body.template && x.kind === 'gutschein' && !x.archived);
      if (!k) return {error: 'Bitte eine Gutschein-Vorlage wählen oder einen eigenen Gutschein anlegen.'};
      title = k.name; days = k.valid_days; note = note || k.description || '';
    }
    const t = body.target; let pids = [], label = '', count = 0;
    if (t === 'players') { pids = [...new Set(body.player_ids || [])].filter(id => byId(id) && !blocked[id] && !merged[id]); label = pids.length === 1 ? playerName(pids[0]) : `${pids.length} ausgewählte Spieler`; if (!pids.length) return {error: 'Bitte mindestens einen Spieler auswählen.'}; }
    else if (t === 'liga') { const pool = POOLS.includes(body.pool) ? body.pool : '8-single'; pids = activePlayers().filter(p => ratingFor(pool, p.id)?.rank === body.liga).map(p => p.id); label = `${body.liga} · ${POOL_LABEL[pool]}`; if (!RANKS.some(r => r[1] === body.liga)) return {error: 'Bitte eine Café-Liga wählen.'}; }
    else if (t === 'active') { const mo = monthOf(now()); pids = activePlayers().filter(p => confirmedOf(p.id).some(m => monthOf(m.confirmed_at) === mo)).map(p => p.id); label = 'Alle, die diesen Monat gespielt haben'; }
    else if (t === 'event') { const ev = events.find(x => x.id === body.event_id); if (!ev) return {error: 'Bitte ein Event wählen.'}; pids = eventParticipants(ev); label = `Teilnehmer: ${ev.title}`; }
    else if (t === 'all') { pids = activePlayers().map(p => p.id); label = 'Alle Spieler'; }
    else if (t === 'none') { count = Number(body.count); if (!(count >= 1 && count <= 50)) return {error: 'Anzahl: 1 bis 50 Codes.'}; label = `${count} Codes ohne Empfänger`; }
    else return {error: 'Bitte auswählen, wer die Gutscheine bekommt.'};
    if (t !== 'none') { count = pids.length; if (!count) return {error: 'Diese Auswahl trifft gerade auf niemanden zu.'}; if (count > 200) return {error: 'Höchstens 200 Gutscheine auf einmal.'}; }
    let venue_id = body.venue_id === undefined ? (body.template !== 'custom' ? catalog.find(x => x.id === body.template)?.venue_id || '' : '') : String(body.venue_id || '');
    if (!venueOK(venue_id)) return {error: 'Diesen Ort gibt es nicht (mehr).'};
    return {title, days, note, target: t, pids, label, count, venue_id};
  }

  // ---------- Übersicht ----------
  function suspicious() {
    const month = monthOf(now()), pairs = {};
    matches.filter(m => m.status === 'confirmed' && monthOf(m.confirmed_at) === month && m.pool !== '8-double').forEach(m => {
      const [a, b] = [m.teams[0][0].id, m.teams[1][0].id].sort();
      const pr = pairs[a + '|' + b] ||= {a, b, count: 0, wins: {[a]: 0, [b]: 0}};
      pr.count++; pr.wins[(m.result.score_a > m.result.score_b ? m.teams[0][0] : m.teams[1][0]).id]++;
    });
    return Object.values(pairs).filter(p => p.count >= 5).sort((x, y) => y.count - x.count).map(p => ({a: pub(byId(p.a)), b: pub(byId(p.b)), count: p.count, wins_a: p.wins[p.a], wins_b: p.wins[p.b]}));
  }
  const disputedList = () => matches.filter(m => m.status === 'disputed').map(m => ({id: m.id, pool: m.pool, best_of: m.best_of, teams: m.teams, proposal: m.proposal, dispute_reason: m.dispute_reason, created_at: m.created_at, version: m.version}));
  function overview() {
    ensureCloses();
    const open = Object.values(closes).find(c => c.status === 'open');
    const today = dayOf(now());
    return {
      role: staffRole(),
      close: open ? {month: open.month, label: monthName(open.month), pending: open.items.filter(i => i.status === 'pending').length} : null,
      disputed: disputedList().length,
      suspicious: suspicious(),
      vouchers_open: vouchers.filter(v => !v.redeemed_at && Date.parse(v.valid_until) > now()).length,
      redeemed_today: vouchers.filter(v => v.redeemed_at && dayOf(v.redeemed_at) === today).map(v => ({code: v.code, title: v.title, player: playerName(v.player_id)})),
      new_players: players.filter(p => !merged[p.id] && ratings['8-single'][p.id]?.games < 4).map(p => pub(p)),
      recent: audit.slice(0, 5)
    };
  }
  function adminPlayer(pid) {
    const p = byId(pid), all = confirmedOf(pid);
    const won = m => (sideOf(m, pid) === 0) === (m.result.score_a > m.result.score_b);
    return {player: {...pub(p), av: {type: cards[pid]?.avatar_type || 'ball', preset: cards[pid]?.preset_id, photo: cards[pid]?.photo}}, has_photo: cards[pid]?.avatar_type === 'photo', blocked: blocked[pid] || null, visibility: cards[pid]?.visibility,
      summary: {games: all.length, wins: all.filter(won).length, last_played: all.slice(-1)[0]?.confirmed_at || null},
      ratings: Object.fromEntries(POOLS.map(pool => [pool, ratingFor(pool, pid)]).filter(([, v]) => v)),
      stamps: stampsOf(pid), honors: honors(pid), revoked: [...(revoked[pid] || [])],
      vouchers: vouchers.filter(v => v.player_id === pid).map(vOut), audit: audit.filter(a => a.player_id === pid)};
  }
  const needReason = body => String(body?.reason || '').trim().length >= 3 ? null : fail(400, 'Bitte eine kurze Begründung angeben (mind. 3 Zeichen).');
  const OWNER_ONLY = 'Nur der Inhaber darf das.';

  async function handleAdmin(parts, method, body, q) {
    const role = staffRole();
    if (!role) return fail(403, 'Nur für das Café-Team.');
    const owner = role === 'owner';
    const [, a, b, c] = parts;
    const reason = String(body?.reason || '').trim();

    if (a === 'overview') return json(200, overview());

    // Gutscheine erstellen und verteilen (nur Inhaber)
    if (a === 'vouchers' && ['issue', 'preview', 'batches'].includes(b)) {
      if (!owner) return fail(403, OWNER_ONLY);
      if (b === 'batches') return json(200, {batches: batches.map(x => ({...x, venue: x.venue_id ? venueOut(x.venue_id) : null, redeemed: vouchers.filter(v => v.batch === x.id && v.redeemed_at).length}))});
      const res = resolveIssue(body);
      if (res.error) return fail(400, res.error);
      if (b === 'preview') return json(200, {count: res.count, recipients: res.pids.slice(0, 12).map(pid => pub(byId(pid))), label: res.label, title: res.title, valid_days: res.days, venue: res.venue_id ? venueOut(res.venue_id) : null});
      const r = needReason(body); if (r) return r;
      const batch = {id: 'b' + (batches.length + 1), title: res.title, note: res.note, venue_id: res.venue_id, valid_days: res.days, target: res.label, count: res.count, created_at: iso(now()), by: session.user.name, reason};
      batches.unshift(batch);
      const created = res.target === 'none'
        ? Array.from({length: res.count}, () => issueVoucher(null, res.title, res.days, 'Aktion', {batch: batch.id, note: res.note, venue_id: res.venue_id}))
        : res.pids.map(pid => { const v = issueVoucher(pid, res.title, res.days, 'Café', {batch: batch.id, note: res.note, venue_id: res.venue_id}); inbox(pid, `Gutschein vom Café: ${res.title}${res.note ? ' – ' + res.note : ''}${res.venue_id ? ` (nur im ${venueOut(res.venue_id).name})` : ''} · gültig bis ${fmtDate(v.valid_until)}`); return v; });
      log('voucher_batch', 'Gutscheine verteilt', res.pids.length === 1 ? res.pids[0] : null, `${res.count}× ${res.title} · ${res.label}${res.venue_id ? ' · nur ' + venueOut(res.venue_id).name : ''}`, reason);
      return json(200, {batch, vouchers: created.map(vOut)});
    }

    // Gutscheine (auch Personal)
    if (a === 'vouchers' && !b) {
      const st = q.get('status') || 'open';
      const list = vouchers.filter(v => st === 'all' || (st === 'open' ? !v.redeemed_at && Date.parse(v.valid_until) > now() : st === 'redeemed' ? !!v.redeemed_at : !v.redeemed_at && Date.parse(v.valid_until) <= now()));
      return json(200, {vouchers: list.map(vOut)});
    }
    if (a === 'vouchers' && b) {
      const v = vouchers.find(x => x.code === decodeURIComponent(b).trim().toUpperCase());
      if (!v) return fail(404, 'Diesen Code gibt es nicht. Bitte Eingabe prüfen.');
      if (!c) return json(200, {voucher: vOut(v)});
      if (c === 'redeem' && method === 'POST') {
        if (v.redeemed_at) return fail(409, `Bereits eingelöst am ${fmtDate(v.redeemed_at)} von ${v.redeemed_by}.`);
        if (Date.parse(v.valid_until) <= now()) return fail(410, `Abgelaufen am ${fmtDate(v.valid_until)}.`);
        if (v.venue_id && body?.venue_id && v.venue_id !== body.venue_id) return fail(409, `Dieser Gutschein gilt nur im ${venueOut(v.venue_id).name}.`);
        v.redeemed_at = iso(now()); v.redeemed_by = session.user.name; v.redeemed_venue = body?.venue_id || mainVenue().id;
        log('voucher_redeemed', 'Gutschein eingelöst', v.player_id, `${v.title} · ${v.code} · ${venueOut(v.redeemed_venue).name}`);
        return json(200, {voucher: vOut(v)});
      }
    }

    // Streitfälle (sehen: alle, entscheiden: Inhaber)
    if (a === 'matches' && !b) return json(200, {matches: disputedList()});
    if (a === 'matches' && b && method === 'POST') {
      if (!owner) return fail(403, OWNER_ONLY);
      const m = matches.find(x => x.id === b);
      if (!m) return fail(404, 'Partie nicht gefunden.');
      const r = needReason(body); if (r) return r;
      if (c === 'void') {
        if (m.status === 'void') return fail(409, 'Die Partie ist schon annulliert.');
        const wasConfirmed = m.status === 'confirmed';
        m.status = 'void'; m.void_reason = reason; m.version++; m.can_confirm = m.can_dispute = m.can_propose = false;
        m.audit_events.push({action: 'void', created_at: iso(now()), reason});
        if (wasConfirmed) recomputeRatings();
        m.teams.flat().forEach(p => inbox(p.id, `Das Café hat eine Partie annulliert: ${reason}`));
        log('match_void', 'Partie annulliert', m.teams[0][0].id, `${POOL_LABEL[m.pool]}: ${m.teams.map(t => t.map(p => p.name).join(' & ')).join(' gegen ')}`, reason);
        return json(200, {match: viewMatch(m)});
      }
      if (c === 'resolve') {
        if (m.status !== 'disputed') return fail(409, 'Nur widersprochene Partien können entschieden werden.');
        const wins = ({1: 1, 3: 2, 5: 3, 7: 4})[m.best_of], sa = Number(body.score_a), sb = Number(body.score_b);
        if (!Number.isInteger(sa) || !Number.isInteger(sb) || Math.max(sa, sb) !== wins || Math.min(sa, sb) >= wins || sa < 0 || sb < 0) return fail(400, `Eine Seite muss genau ${wins} Spiele gewinnen, die andere weniger.`);
        m.result = {score_a: sa, score_b: sb}; m.proposal = null; m.status = 'confirmed'; m.confirmed_at = iso(now()); m.version++;
        m.audit_events.push({action: 'confirmed', created_at: m.confirmed_at, reason: `Vom Café entschieden: ${reason}`});
        applyMatch(m); adminRev++;
        m.teams.flat().forEach(p => inbox(p.id, `Das Café hat eure Partie entschieden: ${sa}:${sb}`));
        log('match_resolved', 'Streitfall entschieden', m.teams[0][0].id, `${m.teams[0].map(p => p.name).join(' & ')} ${sa}:${sb} ${m.teams[1].map(p => p.name).join(' & ')}`, reason);
        return json(200, {match: viewMatch(m)});
      }
    }

    // Events (auch Personal)
    if (a === 'events' && method === 'POST') {
      if (b && c === 'delete') {
        const i = events.findIndex(e => e.id === b); if (i < 0) return fail(404, 'Event nicht gefunden.');
        const [ev] = events.splice(i, 1); log('event_deleted', 'Event gelöscht', null, ev.title); return json(200, {ok: true});
      }
      const title = String(body.title || '').trim(), start = Date.parse(body.starts_at || '');
      if (title.length < 3) return fail(400, 'Bitte einen Titel angeben.');
      if (!Number.isFinite(start)) return fail(400, 'Bitte Datum und Uhrzeit angeben.');
      const cap = body.capacity === '' || body.capacity == null ? null : Number(body.capacity);
      if (cap !== null && !(cap >= 2 && cap <= 64)) return fail(400, 'Plätze: 2 bis 64 oder leer lassen.');
      const venue_id = String(body.venue_id || mainVenue().id);
      if (!venueOK(venue_id)) return fail(400, 'Diesen Ort gibt es nicht (mehr). Bitte einen anderen wählen.');
      const data = {type: String(body.type || 'Event').trim(), title, starts_at: new Date(start).toISOString(), place: String(body.place || '').trim(), venue_id, venue_note: String(body.venue_note || '').trim().slice(0, 120), description: String(body.description || '').trim(), price: String(body.price || '').trim(), capacity: cap, sponsor: String(body.sponsor || '').trim() || undefined};
      const ev = body.id ? events.find(e => e.id === body.id) : null;
      if (ev) {
        const moved = (ev.venue_id || mainVenue().id) !== venue_id;
        Object.assign(ev, data);
        if (moved) {
          const v = venueOut(venue_id); ev.venue_changed_at = iso(now());
          if (game.registered.has(ev.id)) inbox(ME, `Ortsänderung: „${title}“ findet jetzt im ${v.name} statt (${v.address})${data.venue_note ? ' – ' + data.venue_note : ''}`);
          log('event_moved', 'Event-Ort geändert', null, `${title} → ${v.name}`);
        } else log('event_updated', 'Event bearbeitet', null, title);
      }
      else { events.push({id: 'e' + (events.length + 10) + Math.random().toString(36).slice(2, 4), participants: cap ? 0 : null, ...data}); log('event_created', 'Event angelegt', null, title); }
      events.sort((x, y) => Date.parse(x.starts_at) - Date.parse(y.starts_at));
      return json(200, {ok: true});
    }

    // Turniere (Ergebnisse & Tische: alle; anlegen, starten, Preise: Inhaber)
    if (a === 'tournaments') {
      seedTournaments();
      if (method === 'GET' && !b) return json(200, {tournaments: tournaments.map(t => tournamentOut(t, true)), players: activePlayers().map(p => pub(p)), events: events.filter(ev => ev.capacity).map(ev => ({id: ev.id, title: ev.title, starts_at: ev.starts_at})), pools: POOL_LABEL});
      const t = b ? tournaments.find(x => x.id === b) : null;
      if (b && !t) return fail(404, 'Turnier nicht gefunden.');
      if (method === 'GET') return json(200, {tournament: tournamentOut(t, true), players: activePlayers().map(p => pub(p))});
      const ownerOnly = !['result', 'table', 'reset'].includes(c);
      if (ownerOnly && !owner) return fail(403, OWNER_ONLY);
      if (!b) {
        const name = String(body.name || '').trim(); if (name.length < 3 || name.length > 50) return fail(400, 'Name: 3 bis 50 Zeichen.');
        if (!POOLS.includes(body.pool) || body.pool === '8-double') return fail(400, 'Bitte eine Einzel-Disziplin wählen.');
        const race = Number(body.race_to); if (!(race >= 1 && race <= 11)) return fail(400, 'Ausspielziel: 1 bis 11.');
        const ev = events.find(x => x.id === body.event_id);
        const nt = {id: 'tu-' + Math.random().toString(36).slice(2, 7), name, pool: body.pool, race_to: race, third_place: body.third_place === '1' || body.third_place === true, seeding: body.seeding === 'random' ? 'random' : 'rating', venue_id: ev?.venue_id || mainVenue().id, status: 'draft', live_on_tv: true, event_id: ev?.id || null, players: ev ? eventParticipants(ev) : [], starts_at: ev?.starts_at || iso(now()), prizes: {1: {}, 2: {}, 3: {}}};
        tournaments.unshift(nt); log('tournament', 'Turnier angelegt', null, `${name}${ev ? ' · ' + ev.title : ''}`);
        return json(200, {tournament: tournamentOut(nt, true)});
      }
      if (c === 'settings') {
        if (t.status !== 'draft') return fail(409, 'Einstellungen nur vor dem Start änderbar.');
        const race = Number(body.race_to); if (!(race >= 1 && race <= 11)) return fail(400, 'Ausspielziel: 1 bis 11.');
        Object.assign(t, {name: String(body.name || t.name).trim().slice(0, 50), race_to: race, third_place: body.third_place === '1' || body.third_place === true, seeding: body.seeding === 'random' ? 'random' : 'rating'});
        return json(200, {tournament: tournamentOut(t, true)});
      }
      if (c === 'players') {
        if (t.status !== 'draft') return fail(409, 'Teilnehmer nur vor dem Start änderbar.');
        if (body.from_event) { const ev = events.find(x => x.id === t.event_id); if (ev) t.players = [...new Set([...t.players, ...eventParticipants(ev)])]; }
        if (body.toggle) { const id = body.toggle; if (!byId(id)) return fail(400, 'Spieler unbekannt.'); t.players = t.players.includes(id) ? t.players.filter(x => x !== id) : [...t.players, id]; }
        if (t.players.length > 64) return fail(400, 'Höchstens 64 Teilnehmer.');
        return json(200, {tournament: tournamentOut(t, true)});
      }
      if (c === 'prizes') {
        const pr = {}; for (const pl of [1, 2, 3]) pr[pl] = {catalog_id: String(body[`p${pl}_award`] || ''), voucher_id: String(body[`p${pl}_voucher`] || '')};
        t.prizes = pr; return json(200, {tournament: tournamentOut(t, true)});
      }
      if (c === 'start') {
        if (t.status !== 'draft') return fail(409, 'Das Turnier läuft bereits.');
        if (t.players.length < 3) return fail(400, 'Mindestens 3 Teilnehmer.');
        buildBracket(t); t.status = t.status === 'finished' ? 'finished' : 'running'; t.started_at = iso(now());
        t.players.forEach(pid => inbox(pid, `„${t.name}“ hat begonnen – den Turnierbaum siehst du unter Events.`));
        log('tournament', 'Turnier gestartet', null, `${t.name} · ${t.players.length} Teilnehmer`);
        return json(200, {tournament: tournamentOut(t, true)});
      }
      if (c === 'live') { t.live_on_tv = !t.live_on_tv; tv.rev++; return json(200, {tournament: tournamentOut(t, true)}); }
      if (c === 'delete') { if (t.status === 'running') return fail(409, 'Laufende Turniere können nicht gelöscht werden.'); tournaments.splice(tournaments.indexOf(t), 1); log('tournament', 'Turnier gelöscht', null, t.name); return json(200, {ok: true}); }
      if (c === 'award') {
        if (t.status !== 'finished') return fail(409, 'Erst nach dem Finale.');
        if (t.prizes_awarded) return fail(409, 'Die Preise wurden bereits vergeben.');
        awardPrizes(t, reason); return json(200, {tournament: tournamentOut(t, true)});
      }
      const at = locate(t, body.match_id); if (!at) return fail(404, 'Begegnung nicht gefunden.');
      const m = at.m;
      if (c === 'table') { const no = body.table_no === '' || body.table_no == null ? null : Number(body.table_no); if (no !== null && !(no >= 1 && no <= 99)) return fail(400, 'Tischnummer 1 bis 99.'); m.table_no = no; if (m.status !== 'done') m.status = no ? 'live' : 'open'; tv.rev++; return json(200, {tournament: tournamentOut(t, true)}); }
      if (c === 'result') {
        if (t.status !== 'running') return fail(409, 'Das Turnier läuft nicht.');
        if (!m.a || !m.b) return fail(409, 'Die Paarung steht noch nicht fest.');
        if (m.status === 'done') return fail(409, 'Ergebnis steht schon fest – erst zurücksetzen.');
        const sa = Number(body.score_a), sb = Number(body.score_b);
        if (![sa, sb].every(x => Number.isInteger(x) && x >= 0 && x <= t.race_to) || Math.max(sa, sb) !== t.race_to || sa === sb) return fail(400, `Gewonnen ist bei ${t.race_to}. Bitte z. B. ${t.race_to}:${Math.max(0, t.race_to - 2)} eintragen.`);
        Object.assign(m, {score_a: sa, score_b: sb, winner: sa > sb ? m.a : m.b, status: 'done', table_no: m.table_no});
        advance(t, m); tv.rev++;
        log('tournament', 'Turnierergebnis', m.winner, `${t.name}: ${playerName(m.a)} ${sa}:${sb} ${playerName(m.b)}`);
        return json(200, {tournament: tournamentOut(t, true)});
      }
      if (c === 'reset') {
        if (m.status !== 'done') return fail(409, 'Kein Ergebnis zum Zurücksetzen.');
        const next = at.r >= 0 ? t.rounds[at.r + 1]?.[Math.floor(at.i / 2)] : null;
        if (next && next.status === 'done') return fail(409, 'Die nächste Runde ist schon gespielt – erst dort zurücksetzen.');
        if (t.third && at.r === t.rounds.length - 2 && t.third.status === 'done') return fail(409, 'Das Spiel um Platz 3 ist schon gespielt.');
        if (t.prizes_awarded) return fail(409, 'Preise sind schon vergeben.');
        if (next) next[at.i % 2 === 0 ? 'a' : 'b'] = null;
        if (t.third && at.r === t.rounds.length - 2) t.third[at.i % 2 === 0 ? 'a' : 'b'] = null;
        Object.assign(m, {score_a: null, score_b: null, winner: null, status: 'open'});
        t.status = 'running'; t.places = null; t.finished_at = null; tv.rev++;
        log('tournament', 'Turnierergebnis zurückgesetzt', null, `${t.name}: ${playerName(m.a)} – ${playerName(m.b)}`, reason);
        return json(200, {tournament: tournamentOut(t, true)});
      }
      return fail(400, 'Unbekannte Aktion.');
    }

    // Café-TV (Durchsagen: alle; Folien & Einstellungen: Inhaber)
    if (a === 'tv') {
      if (method === 'GET') return json(200, tvOut());
      if (b === 'announce') {
        if (c === 'clear') { tv.announcement = null; tv.rev++; return json(200, tvOut()); }
        const text = String(body.text || '').trim(); const min = Number(body.minutes);
        if (text.length < 3 || text.length > 120) return fail(400, 'Durchsage: 3 bis 120 Zeichen.');
        if (![1, 3, 5, 10, 30].includes(min)) return fail(400, 'Bitte eine Dauer wählen.');
        tv.announcement = {text, until: iso(now() + min * 60000), by: session.user.name}; tv.rev++;
        log('tv', 'Durchsage auf dem Café-Bildschirm', null, text);
        return json(200, tvOut());
      }
      if (b === 'screens' && c && parts[4] === 'mode') {
        seedTournaments();
        const sc = tv.screens.find(x => x.id === c); if (!sc) return fail(404, 'Bildschirm nicht gefunden.');
        if (!TV_MODES[body.mode]) return fail(400, 'Unbekannte Anzeige.');
        if (body.mode === 'slide' && !tv.slides.some(x => x.id === body.slide_id)) return fail(400, 'Bitte eine Folie wählen.');
        if (body.tournament_id && !tournaments.some(t => t.id === body.tournament_id)) return fail(400, 'Turnier nicht gefunden.');
        Object.assign(sc, {mode: body.mode, tournament_id: body.tournament_id || null, slide_id: body.mode === 'slide' ? body.slide_id : null}); tv.rev++;
        log('tv', 'Bildschirm umgeschaltet', null, `${sc.name}: ${TV_MODES[sc.mode]}`); return json(200, tvOut());
      }
      if (!owner) return fail(403, OWNER_ONLY);
      if (b === 'settings') {
        const sec = Number(body.seconds); if (!(sec >= 5 && sec <= 60)) return fail(400, 'Anzeigedauer: 5 bis 60 Sekunden.');
        Object.assign(tv, {seconds: sec, footer: String(body.footer || '').trim().slice(0, 160)}); tv.rev++;
        log('tv', 'Café-Bildschirm eingestellt', null, `${sec} s pro Folie`); return json(200, tvOut());
      }
      if (b === 'screens') {
        if (c && parts[4] === 'delete') { if (tv.screens.length <= 1) return fail(400, 'Ein Bildschirm muss bleiben.'); tv.screens = tv.screens.filter(x => x.id !== c); tv.rev++; return json(200, tvOut()); }
        const name = String(body.name || '').trim(); if (name.length < 2 || name.length > 40) return fail(400, 'Name: 2 bis 40 Zeichen.');
        if (!venueOK(body.venue_id)) return fail(400, 'Bitte einen Standort wählen.');
        const data = {name, venue_id: body.venue_id || mainVenue().id, show_tables: body.show_tables !== '0'};
        const sc = body.id ? tv.screens.find(x => x.id === body.id) : null;
        if (sc) Object.assign(sc, data); else tv.screens.push({id: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) + '-' + Math.random().toString(36).slice(2, 5), mode: 'rotation', tournament_id: null, slide_id: null, ...data});
        tv.rev++; log('tv', sc ? 'Bildschirm bearbeitet' : 'Bildschirm angelegt', null, name); return json(200, tvOut());
      }
      if (b === 'media') {
        if (c && parts[4] === 'delete') { const md = media.find(x => x.id === c); if (!md) return fail(404, 'Nicht gefunden.'); media.splice(media.indexOf(md), 1); tv.slides = tv.slides.filter(sl => !(sl.custom && sl.media_id === c && !sl.title)); tv.slides.forEach(sl => { if (sl.media_id === c) sl.media_id = null; }); tv.rev++; log('tv', 'Medium gelöscht', null, md.name); return json(200, tvOut()); }
        if (c && parts[4] === 'banner') { const md = media.find(x => x.id === c); if (!md || md.kind !== 'image') return fail(400, 'Nur Bilder können Banner sein.'); md.banner = !md.banner; tv.rev++; return json(200, tvOut()); }
        if (c && parts[4] === 'slide') { const md = media.find(x => x.id === c); if (!md) return fail(404, 'Nicht gefunden.'); tv.slides.push({id: 'c-' + Math.random().toString(36).slice(2, 6), on: true, custom: true, title: '', text: '', icon: '', media_id: md.id}); tv.rev++; return json(200, tvOut()); }
        const kind = body.kind === 'video' ? 'video' : 'image', name = String(body.name || '').trim().slice(0, 50) || (kind === 'video' ? 'Video' : 'Bild');
        const src = String(body.src || '');
        if (kind === 'image' && !/^data:image\/(jpeg|png|webp|svg\+xml)[;,]/.test(src)) return fail(400, 'Bitte ein Bild (JPG, PNG, WebP) wählen.');
        if (kind === 'image' && src.length > 2500000) return fail(400, 'Das Bild ist zu groß.');
        if (kind === 'video' && !/^(blob:|https:\/\/)/.test(src)) return fail(400, 'Bitte ein Video (MP4) wählen.');
        const md = {id: 'md-' + Math.random().toString(36).slice(2, 7), kind, name, src, sponsor: String(body.sponsor || '').trim().slice(0, 60), banner: false, created_at: iso(now())};
        media.unshift(md); if (body.as_slide) tv.slides.push({id: 'c-' + Math.random().toString(36).slice(2, 6), on: true, custom: true, title: '', text: '', icon: '', media_id: md.id});
        tv.rev++; log('tv', kind === 'video' ? 'Video hochgeladen' : 'Bild hochgeladen', null, name + (md.sponsor ? ' · ' + md.sponsor : '')); return json(200, tvOut());
      }
      if (b === 'slides') {
        if (Array.isArray(body.order)) { const byIdS = Object.fromEntries(tv.slides.map(x => [x.id, x])); const ord = body.order.filter(id => byIdS[id]); if (ord.length === tv.slides.length) tv.slides = ord.map(id => byIdS[id]); }
        if (body.toggle) { const sl = tv.slides.find(x => x.id === body.toggle); if (sl) sl.on = !sl.on; }
        if (body.delete) tv.slides = tv.slides.filter(x => !(x.custom && x.id === body.delete));
        if (body.custom) {
          const title = String(body.custom.title || '').trim(), text = String(body.custom.text || '').trim();
          if ((title.length < 2 && !body.custom.media_id) || title.length > 40) return fail(400, 'Überschrift: 2 bis 40 Zeichen (oder ein Bild wählen).');
          if (text.length > 200) return fail(400, 'Text: höchstens 200 Zeichen.');
          const sl = body.custom.id ? tv.slides.find(x => x.id === body.custom.id && x.custom) : null;
          const data = {title, text, icon: String(body.custom.icon || 'stars-stack'), media_id: media.some(m => m.id === body.custom.media_id) ? body.custom.media_id : null};
          if (sl) Object.assign(sl, data); else tv.slides.push({id: 'c-' + Math.random().toString(36).slice(2, 6), on: true, custom: true, ...data});
          log('tv', sl ? 'Eigene Folie bearbeitet' : 'Eigene Folie angelegt', null, title);
        }
        tv.rev++; return json(200, tvOut());
      }
      return fail(400, 'Unbekannte Aktion.');
    }

    // Tische & QR-Codes (sehen/drucken: alle, ändern: Inhaber)
    if (a === 'tables' && method === 'GET') return json(200, {tables: tables.map(t => ({...tableOut(t), venue_id: t.venue_id, sensor_id: t.sensor_id, token: t.token, active: t.active})), kinds: TABLE_KINDS});
    if (a === 'tables' && method === 'POST') {
      if (!owner) return fail(403, OWNER_ONLY);
      if (b && c === 'new-code') {
        const t = tables.find(x => x.id === b); if (!t) return fail(404, 'Tisch nicht gefunden.');
        const r = needReason(body); if (r) return r;
        t.token = token(); log('table', 'Neuer QR-Code', null, `Tisch ${t.no} · ${venueOut(t.venue_id).name}`, reason);
        return json(200, {ok: true});
      }
      if (b && c === 'toggle') {
        const t = tables.find(x => x.id === b); if (!t) return fail(404, 'Tisch nicht gefunden.');
        t.active = !t.active; log('table', t.active ? 'Tisch aktiviert' : 'Tisch deaktiviert', null, `Tisch ${t.no} · ${venueOut(t.venue_id).name}`);
        return json(200, {ok: true});
      }
      const no = Number(body.no), venue_id = String(body.venue_id || mainVenue().id);
      if (!Number.isInteger(no) || no < 1 || no > 99) return fail(400, 'Tischnummer: 1 bis 99.');
      if (!venueOK(venue_id)) return fail(400, 'Bitte einen Standort wählen.');
      if (!TABLE_KINDS.includes(body.kind)) return fail(400, 'Bitte die Tischart wählen.');
      if (tables.some(t => t.id !== body.id && t.venue_id === venue_id && t.no === no)) return fail(409, `Tisch ${no} gibt es im ${venueOut(venue_id).name} schon.`);
      const data = {no, venue_id, kind: body.kind, name: String(body.name || '').trim().slice(0, 30), sensor_id: String(body.sensor_id || '').trim().slice(0, 20)};
      const t = body.id ? tables.find(x => x.id === body.id) : null;
      if (t) {
        const moved = t.venue_id !== venue_id || t.no !== no;
        Object.assign(t, data); log('table', 'Tisch bearbeitet', null, `Tisch ${no} · ${venueOut(venue_id).name}${moved ? ' (QR-Code bleibt gültig)' : ''}`);
        return json(200, {table: {...tableOut(t), token: t.token}});
      }
      const nt = {id: 't-' + Math.random().toString(36).slice(2, 7), ...data, token: token(), active: true, busy: false, since: now()};
      tables.push(nt); log('table', 'Tisch angelegt', null, `Tisch ${no} · ${venueOut(venue_id).name}`);
      return json(200, {table: {...tableOut(nt), token: nt.token}});
    }

    if (!owner) return fail(403, OWNER_ONLY);

    // Monatsabschluss
    if (a === 'month-close' && method === 'GET') {
      ensureCloses();
      const months = Object.keys(closes).sort().reverse();
      const month = q.get('month') && closes[q.get('month')] ? q.get('month') : (Object.values(closes).find(x => x.status === 'open')?.month || months[0]);
      const cl = closes[month];
      return json(200, {months: months.map(m => ({month: m, label: monthName(m), status: closes[m].status})), month, label: month ? monthName(month) : '', status: cl?.status,
        items: (cl?.items || []).map(it => ({...it, player: it.player ? pub(byId(it.player)) : null, proposed: it.proposed ? pub(byId(it.proposed)) : null, candidates: it.candidates.filter(id => byId(id)).map(id => ({...pub(byId(id)), points: it.points[id] ?? null}))}))});
    }
    if (a === 'month-close' && method === 'POST') {
      ensureCloses();
      const cl = closes[body.month];
      if (!cl) return fail(404, 'Monat nicht gefunden.');
      if (b === 'approve-all') {
        const open = cl.items.filter(it => it.status === 'pending');
        open.forEach(it => approveItem(body.month, it, reason));
        closeStatus(body.month);
        return json(200, {approved: open.length});
      }
      const it = cl.items.find(x => x.key === body.key);
      if (!it) return fail(404, 'Eintrag nicht gefunden.');
      if (it.status === 'approved') return fail(409, 'Schon bestätigt. Zum Rückgängigmachen die Auszeichnung beim Spieler entziehen.');
      if (body.decision === 'swap') {
        const r = needReason(body); if (r) return r;
        if (!byId(body.player_id)) return fail(400, 'Bitte einen Spieler wählen.');
        const others = cl.items.filter(x => x !== it && x.player === body.player_id && x.status !== 'rejected');
        if (others.length) return fail(409, `${playerName(body.player_id)} hat in diesem Monat schon „${others[0].award.name}“.`);
        it.player = body.player_id; it.note = `Vom Inhaber geändert: ${reason}`;
        approveItem(body.month, it, reason);
      } else if (body.decision === 'reject') {
        const r = needReason(body); if (r) return r;
        it.status = 'rejected'; it.decided_by = session.user.name; it.decided_at = iso(now()); it.reason = reason;
        log('month_rejected', 'Monatsauszeichnung abgelehnt', it.player, `${it.label} · ${monthName(body.month)}`, reason);
      } else approveItem(body.month, it, reason);
      closeStatus(body.month);
      return json(200, {ok: true});
    }

    // Spieler
    if (a === 'players' && !b) {
      const term = (q.get('q') || '').trim().toLowerCase();
      return json(200, {players: players.filter(p => !merged[p.id] && p.name.toLowerCase().includes(term)).map(p => {
        const all = confirmedOf(p.id);
        return {...pub(p), blocked: !!blocked[p.id], games: all.length, last_played: all.slice(-1)[0]?.confirmed_at || null, rank: ratingFor('8-single', p.id)?.rank || null, stamps: stampsOf(p.id)};
      }).sort((x, y) => (y.last_played || '').localeCompare(x.last_played || ''))});
    }
    if (a === 'players' && b) {
      const pid = b; if (!byId(pid)) return fail(404, 'Spieler nicht gefunden.');
      if (!c) return json(200, adminPlayer(pid));
      if (method !== 'POST') return fail(405, 'Nicht erlaubt.');
      const r = needReason(body); if (r) return r;
      if (c === 'award') {
        const k = catalog.find(x => x.id === body.catalog_id && !x.archived && x.kind !== 'gutschein');
        if (!k) return fail(400, 'Bitte eine Auszeichnung aus dem Katalog wählen.');
        const g = {id: 'gr-' + Math.random().toString(36).slice(2, 8), catalog_id: k.id, name: k.name, kind: k.kind, tier: k.tier, sub: `Vom Café verliehen · ${fmtDate(now())}`, granted_at: iso(now()), granted_by: session.user.name, reason};
        (granted[pid] ||= []).push(g);
        inbox(pid, `Das Café hat dir „${k.name}“ verliehen: ${reason}`);
        log('award', `${KIND_LABEL[k.kind]} verliehen`, pid, k.name, reason);
        return json(200, adminPlayer(pid));
      }
      if (c === 'revoke') {
        const h = honors(pid).find(x => x.id === body.honor_id);
        if (!h) return fail(404, 'Diese Auszeichnung hat der Spieler nicht.');
        (revoked[pid] ||= new Set()).add(h.id);
        inbox(pid, `Das Café hat „${h.name}“ zurückgenommen: ${reason}`);
        log('revoke', 'Auszeichnung entzogen', pid, h.name, reason);
        return json(200, adminPlayer(pid));
      }
      if (c === 'stamps') {
        const d = Number(body.delta);
        if (!Number.isInteger(d) || d === 0 || Math.abs(d) > 10) return fail(400, 'Bitte zwischen -10 und +10 Stempeln angeben.');
        const next = Math.max(0, stampsOf(pid) + d);
        if (pid === ME) game.stamps = next; else otherStamps[pid] = next;
        inbox(pid, `${d > 0 ? '+' + d : d} Stempel vom Café: ${reason}`);
        log('stamps', d > 0 ? 'Stempel gutgeschrieben' : 'Stempel abgezogen', pid, `${d > 0 ? '+' : ''}${d} → ${next}`, reason);
        return json(200, adminPlayer(pid));
      }
      if (c === 'voucher') {
        const k = catalog.find(x => x.id === body.catalog_id && !x.archived && x.kind === 'gutschein');
        if (!k) return fail(400, 'Bitte eine Gutschein-Vorlage wählen.');
        const v = issueVoucher(pid, k.name, k.valid_days, 'Café', k.venue_id ? {venue_id: k.venue_id} : {});
        inbox(pid, `Neuer Gutschein vom Café: ${k.name}${k.venue_id ? ` (nur im ${venueOut(k.venue_id).name})` : ''} · gültig bis ${fmtDate(v.valid_until)}`);
        log('voucher_issued', 'Gutschein ausgestellt', pid, `${k.name} · ${v.code}`, reason);
        return json(200, adminPlayer(pid));
      }
      if (c === 'pin-reset') {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        log('pin_reset', 'PIN zurückgesetzt', pid, 'Einmal-Code an der Theke übergeben', reason);
        return json(200, {...adminPlayer(pid), reset: {code, valid_until: iso(now() + DAY)}});
      }
      if (c === 'remove-photo') {
        const cd = cards[pid];
        if (cd.avatar_type !== 'photo') return fail(409, 'Dieser Spieler hat kein eigenes Foto.');
        cd.avatar_type = 'ball'; cd.photo = null;
        inbox(pid, `Das Café hat dein Profilbild entfernt: ${reason}`);
        log('photo_removed', 'Profilbild entfernt', pid, '', reason);
        return json(200, adminPlayer(pid));
      }
      if (c === 'block') {
        if (body.blocked) { blocked[pid] = {reason, at: iso(now())}; log('block', 'Profil gesperrt', pid, '', reason); }
        else { delete blocked[pid]; log('unblock', 'Sperre aufgehoben', pid, '', reason); }
        return json(200, adminPlayer(pid));
      }
      if (c === 'merge') {
        const into = body.into_id;
        if (!byId(into) || into === pid) return fail(400, 'Bitte das Zielprofil wählen.');
        if (pid === ME) return fail(400, 'In der Demo kann das eigene Profil nicht zusammengeführt werden.');
        const intoP = byId(into);
        matches.forEach(m => {
          m.teams = m.teams.map(t => t.map(x => x.id === pid ? {id: into, name: intoP.name} : x));
          if (m.teams[0].some(x => m.teams[1].some(y => y.id === x.id)) && m.status !== 'void') { m.status = 'void'; m.void_reason = 'Profile zusammengeführt (gleiche Person auf beiden Seiten)'; }
        });
        (granted[into] ||= []).push(...(granted[pid] || []));
        vouchers.forEach(v => { if (v.player_id === pid) v.player_id = into; });
        if (into !== ME) otherStamps[into] = stampsOf(into) + stampsOf(pid);
        merged[pid] = into;
        const name = playerName(pid);
        players.splice(players.findIndex(x => x.id === pid), 1);
        recomputeRatings();
        log('merge', 'Profile zusammengeführt', into, `${name} → ${intoP.name}`, reason);
        return json(200, adminPlayer(into));
      }
    }

    // Orte
    if (a === 'venues' && method === 'POST') {
      if (b && c === 'archive') {
        const v = venues.find(x => x.id === b); if (!v) return fail(404, 'Ort nicht gefunden.');
        if (v.main) return fail(400, 'Das Stammhaus kann nicht archiviert werden.');
        if (!v.archived && events.some(ev => ev.venue_id === v.id && Date.parse(ev.starts_at) > now())) return fail(409, 'An diesem Ort sind noch Events geplant. Verlege sie zuerst.');
        v.archived = !v.archived; log('venue', v.archived ? 'Ort archiviert' : 'Ort reaktiviert', null, v.name); return json(200, {venues});
      }
      const name = String(body.name || '').trim(), address = String(body.address || '').trim();
      if (name.length < 3 || name.length > 50) return fail(400, 'Name: 3 bis 50 Zeichen.');
      if (address.length < 5 || address.length > 100) return fail(400, 'Bitte eine Adresse angeben (5 bis 100 Zeichen).');
      const data = {name, address, note: String(body.note || '').trim().slice(0, 100)};
      const v = body.id ? venues.find(x => x.id === body.id) : null;
      if (v) { Object.assign(v, data); log('venue', 'Ort bearbeitet', null, name); }
      else { venues.push({id: 'v-' + Math.random().toString(36).slice(2, 7), main: false, archived: false, ...data}); log('venue', 'Ort angelegt', null, `${name} · ${address}`); }
      return json(200, {venues});
    }

    // Katalog
    if (a === 'catalog' && method === 'GET') return json(200, {catalog: catalog.map(k => ({...k, venue: k.venue_id ? venueOut(k.venue_id) : null}))});
    if (a === 'catalog' && method === 'POST') {
      if (b && c === 'archive') {
        const k = catalog.find(x => x.id === b); if (!k) return fail(404, 'Nicht gefunden.');
        k.archived = !k.archived; log('catalog', k.archived ? 'Vorlage archiviert' : 'Vorlage reaktiviert', null, k.name); return json(200, {catalog});
      }
      const name = String(body.name || '').trim();
      if (name.length < 3 || name.length > 40) return fail(400, 'Name: 3 bis 40 Zeichen.');
      if (!KIND_LABEL[body.kind]) return fail(400, 'Bitte die Art wählen.');
      const k = {id: 'cat-' + Math.random().toString(36).slice(2, 7), name, kind: body.kind, description: String(body.description || '').trim(), archived: false, sponsor: String(body.sponsor || '').trim() || undefined};
      if (body.kind === 'gutschein') { const d = Number(body.valid_days); if (!(d >= 7 && d <= 365)) return fail(400, 'Gültigkeit: 7 bis 365 Tage.'); k.valid_days = d; if (body.venue_id) { if (!venueOK(body.venue_id)) return fail(400, 'Diesen Ort gibt es nicht.'); k.venue_id = body.venue_id; } }
      else { const t = Number(body.tier); if (![1, 2, 3].includes(t)) return fail(400, 'Bitte Bronze, Silber oder Gold wählen.'); k.tier = t; }
      catalog.push(k); log('catalog', 'Vorlage angelegt', null, `${KIND_LABEL[k.kind]}: ${name}`);
      return json(200, {catalog});
    }

    // Wochenaufgaben
    if (a === 'quests' && method === 'GET') return json(200, {quests: questDefs, types: QUEST_TYPES, weekdays: WEEKDAYS, pools: POOL_LABEL});
    if (a === 'quests' && method === 'POST') {
      if (b && c === 'delete') {
        const i = questDefs.findIndex(x => x.id === b); if (i < 0) return fail(404, 'Nicht gefunden.');
        const [d] = questDefs.splice(i, 1); log('quest', 'Wochenaufgabe gelöscht', null, d.title); return json(200, {ok: true});
      }
      const title = String(body.title || '').trim(), goal = Number(body.goal);
      if (title.length < 3 || title.length > 40) return fail(400, 'Titel: 3 bis 40 Zeichen.');
      if (!QUEST_TYPES[body.type]) return fail(400, 'Bitte eine Art wählen.');
      if (!(goal >= 1 && goal <= 10)) return fail(400, 'Ziel: 1 bis 10.');
      if (body.type === 'pool' && !POOL_LABEL[body.pool]) return fail(400, 'Bitte eine Disziplin wählen.');
      if (body.type === 'weekday' && !(Number(body.weekday) >= 0 && Number(body.weekday) <= 6)) return fail(400, 'Bitte einen Wochentag wählen.');
      const d = {title, text: String(body.text || '').trim() || title, type: body.type, goal, pool: body.type === 'pool' ? body.pool : undefined, weekday: body.type === 'weekday' ? Number(body.weekday) : undefined};
      const ex = body.id ? questDefs.find(x => x.id === body.id) : null;
      if (ex) { Object.assign(ex, d); log('quest', 'Wochenaufgabe bearbeitet', null, title); }
      else { if (questDefs.length >= 5) return fail(400, 'Höchstens 5 Aufgaben pro Woche.'); questDefs.push({id: 'q-' + Math.random().toString(36).slice(2, 7), ...d}); log('quest', 'Wochenaufgabe angelegt', null, title); }
      return json(200, {quests: questDefs});
    }

    // Protokoll
    if (a === 'audit') {
      const pid = q.get('player'), act = q.get('action');
      return json(200, {audit: audit.filter(x => (!pid || x.player_id === pid) && (!act || x.action.startsWith(act)))});
    }
    return fail(404, 'Unbekannte Admin-Anfrage.');
  }

  // ---------- Router ----------
  const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
  const fail = (status, detail) => json(status, {detail});
  const needAuth = () => session.authenticated ? null : fail(401, 'Bitte zuerst anmelden.');

  function finishByOpponent(m) {
    // Demo: die Gegenseite bestätigt nach ein paar Sekunden "auf ihrem Handy"
    setTimeout(() => {
      if (m.status !== 'pending' || !m.proposal) return;
      m.result = {score_a: m.proposal.score_a, score_b: m.proposal.score_b};
      m.proposal = null; m.status = 'confirmed'; m.confirmed_at = iso(now()); m.version++;
      m.can_confirm = m.can_dispute = m.can_propose = false;
      m.audit_events.push({action: 'confirmed', created_at: m.confirmed_at});
      applyMatch(m); updateRewards();
      game.unseen.push('Die Gegenseite hat dein Ergebnis bestätigt');
      window.dispatchEvent(new Event('focus'));
    }, 6000);
  }

  async function handle(path, method, body) {
    const url = new URL(path, 'https://demo.local');
    const parts = url.pathname.split('/').filter(Boolean);
    const q = url.searchParams;
    if (url.pathname === '/session') return json(200, session.authenticated ? session : {authenticated: false});
    if (url.pathname === '/demo/switch' && method === 'POST') {
      const st = STAFF.find(x => x.role === body.as);
      if (st) Object.assign(session, {authenticated: true, user: {id: st.id, name: st.name, role: st.role, is_admin: st.role === 'owner'}});
      else Object.assign(session, {authenticated: true, user: {id: ME, name: byId(ME).name, role: null, is_admin: false}});
      return json(200, session);
    }
    if (['/login', '/register'].includes(url.pathname) && method === 'POST') {
      const name = String(body?.name || '').trim();
      if (!name || !/^\d{6}$/.test(String(body?.pin || ''))) return fail(400, 'Bitte Nickname und eine PIN mit genau 6 Ziffern eingeben.');
      const st = STAFF.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (st) { Object.assign(session, {authenticated: true, user: {id: st.id, name: st.name, role: st.role, is_admin: st.role === 'owner'}, csrf_token: 'demo'}); return json(200, session); }
      let p = players.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (p && blocked[p.id]) return fail(403, `Dieses Profil ist gesperrt: ${blocked[p.id].reason} Bitte an der Theke melden.`);
      if (!p) { p = {id: `p${players.length + 1}`, name, skill: 1000}; players.push(p); POOLS.forEach(pool => { ratings[pool][p.id] = {r: 1000, games: 0, wins: 0, losses: 0, history: []}; }); }
      if (!cards[p.id]) cards[p.id] = {motto: '', ball: 1 + players.length % 15, favorite_pool: '8-single', title_id: null, showcase: [], visibility: 'public'};
      Object.assign(session, {authenticated: true, user: {id: p.id, name: p.name, role: null, is_admin: false}, csrf_token: 'demo'});
      return json(200, session);
    }
    if (url.pathname === '/logout') { session.authenticated = false; session.user = null; return json(200, {ok: true}); }
    if (url.pathname === '/players') return needAuth() || json(200, {players: players.map(p => ({id: p.id, name: p.name}))});
    if (url.pathname === '/matches' && method === 'GET') return needAuth() || json(200, {matches: matches.filter(m => sideOf(m, session.user.id) >= 0 && ['playing','pending','disputed'].includes(m.status)).map(viewMatch)});
    if (url.pathname === '/matches' && method === 'POST') {
      if (needAuth()) return needAuth();
      if (body.pool === '14-single') return fail(400, 'Das Live-Spielblatt für 14/1 ist in dieser Demo nicht verfügbar. Bitte eine andere Disziplin wählen.');
      const teams = body.teams.map(t => t.map(id => byId(id)));
      const m = makeMatch({pool: body.pool, teams, t: now(), bestOf: body.best_of, status: 'playing', result: null});
      m.created_at = iso(now()); m.played_at = null; m.audit_events = [{action: 'created', created_at: m.created_at}]; m.can_propose = true;
      matches.push(m); tables[2].busy = true; tables[2].since = now();
      return json(200, {match: viewMatch(m)});
    }
    if (parts[0] === 'matches' && parts[1]) {
      const m = matches.find(x => x.id === parts[1]);
      if (!m) return fail(404, 'Partie nicht gefunden.');
      if (parts[2] === 'sheets') return json(200, {sheets: []});
      if (!parts[2]) return json(200, {match: viewMatch(m)});
      if (method !== 'POST') return fail(405, 'Nicht erlaubt.');
      if (parts[2] === 'result') {
        m.proposal = {id: `pr${nextId++}`, score_a: Number(body.score_a), score_b: Number(body.score_b), is_correction: false, reason: body.reason || null, rounds: null};
        m.status = 'pending'; m.played_at = iso(now()); m.version++; m.can_propose = false; m.can_confirm = false; m.can_dispute = false;
        m.audit_events.push({action: 'result_proposed', created_at: iso(now())});
        tables[2].busy = false;
        finishByOpponent(m);
        return json(200, {match: viewMatch(m)});
      }
      if (parts[2] === 'confirm') {
        m.result = {score_a: m.proposal.score_a, score_b: m.proposal.score_b}; m.proposal = null; m.status = 'confirmed'; m.confirmed_at = iso(now()); m.version++;
        m.can_confirm = m.can_dispute = false; m.audit_events.push({action: 'confirmed', created_at: m.confirmed_at});
        applyMatch(m); updateRewards();
        return json(200, {match: viewMatch(m)});
      }
      if (parts[2] === 'dispute') {
        m.status = 'disputed'; m.dispute_reason = body.reason; m.version++; m.can_confirm = false; m.can_dispute = false; m.can_propose = true;
        m.audit_events.push({action: 'disputed', created_at: iso(now()), reason: body.reason});
        return json(200, {match: viewMatch(m)});
      }
      return fail(400, 'Diese Aktion ist in der Demo nicht verfügbar.');
    }
    if (url.pathname === '/me') {
      if (needAuth()) return needAuth();
      if (session.user.role) return json(200, {ratings: {}, matches: []});
      const id = session.user.id;
      return json(200, {ratings: Object.fromEntries(POOLS.map(pool => [pool, ratingFor(pool, id)]).filter(([, v]) => v)),
        matches: matches.filter(m => sideOf(m, id) >= 0).map(viewMatch)});
    }
    if (url.pathname === '/leaderboard') { const lb = leaderboard(q.get('pool') || '8-single', q.get('month')); lb.rows = lb.rows.filter(r => !blocked[r.player.id]); lb.rows.forEach(r => { r.player.title = titleName(r.player.id); }); return json(200, lb); }
    if (url.pathname === '/lobbies' && method === 'GET') return json(200, {lobbies: []});
    if (parts[0] === 'lobbies') return fail(400, 'Einladungen per QR-Code sind in dieser Demo nicht verfügbar. Bitte die Person direkt auswählen.');
    if (parts[0] === 'admin') return handleAdmin(parts, method, body, q);

    // ===== Neue Endpunkte für die Erweiterungen =====
    if (parts[0] === 'profile' && method === 'GET') {
      const pid = parts[1] === 'me' ? session.user?.id : parts[1];
      if (!pid || !byId(pid)) return fail(404, 'Spieler nicht gefunden.');
      return json(200, profile(pid));
    }
    if (url.pathname === '/profile' && method === 'POST') {
      if (needAuth()) return needAuth();
      const pid = session.user.id, {h} = cardOf(pid), c = cards[pid], ids = new Set(h.map(x => x.id));
      const motto = String(body.motto ?? '').trim();
      if (motto.length > 80) return fail(400, 'Das Motto darf höchstens 80 Zeichen haben.');
      const ballNo = Number(body.ball);
      if (!(ballNo >= 1 && ballNo <= 15)) return fail(400, 'Bitte eine Kugel von 1 bis 15 wählen.');
      const showcase = (body.showcase || []).filter(id => ids.has(id));
      if (showcase.length > 3) return fail(400, 'In der Vitrine ist Platz für drei Stücke.');
      if (body.title_id && !ids.has(body.title_id)) return fail(400, 'Diesen Titel hast du noch nicht erspielt.');
      if (!['public', 'members', 'hidden'].includes(body.visibility)) return fail(400, 'Bitte eine Sichtbarkeit wählen.');
      const avType = ['ball', 'preset', 'photo'].includes(body.avatar_type) ? body.avatar_type : 'ball';
      if (avType === 'preset' && !PRESET_IDS.includes(body.preset_id)) return fail(400, 'Bitte eine Vorlage wählen.');
      if (avType === 'photo' && !/^data:image\/(jpeg|png|webp);base64,/.test(String(body.photo || ''))) return fail(400, 'Bitte ein Foto wählen.');
      if (avType === 'photo' && String(body.photo).length > 400000) return fail(400, 'Das Foto ist zu groß.');
      Object.assign(c, {avatar_type: avType, preset_id: avType === 'preset' ? body.preset_id : c.preset_id, photo: avType === 'photo' ? body.photo : null});
      adminRev++;
      Object.assign(c, {title_chosen: true, showcase_chosen: true, motto, ball: ballNo, favorite_pool: POOLS.includes(body.favorite_pool) ? body.favorite_pool : c.favorite_pool, title_id: body.title_id || null, showcase, visibility: body.visibility});
      return json(200, profile(pid));
    }
    if (parts[0] === 'stats') {
      const pid = parts[1] === 'me' ? session.user?.id : parts[1];
      if (!pid || !byId(pid)) return fail(404, 'Spieler nicht gefunden.');
      if (cards[pid].visibility === 'hidden' && pid !== session.user?.id) return fail(403, 'Dieses Profil ist privat.');
      return json(200, stats(pid));
    }
    if (url.pathname === '/odds') {
      const pool = q.get('pool'), a = ratings[pool]?.[session.user?.id], b = ratings[pool]?.[q.get('opponent')];
      if (!a || !b) return fail(400, 'Keine Einschätzung möglich.');
      const pa = expected(a.r, b.r), wins = Number(q.get('wins')) || 3;
      // Vorschlag: Rennen so wählen, dass beide etwa gleiche Chancen haben
      let best = {a: wins, b: wins, diff: 1};
      for (let ra = Math.ceil(wins / 2); ra <= wins; ra++) for (let rb = Math.ceil(wins / 2); rb <= wins; rb++) {
        if (Math.max(ra, rb) !== wins) continue;
        let p = 0; const memo = {}; // Wahrscheinlichkeit, ra Spiele vor rb zu gewinnen
        const f = (x, y) => x === ra ? 1 : y === rb ? 0 : (memo[x + ',' + y] ??= pa * f(x + 1, y) + (1 - pa) * f(x, y + 1));
        p = f(0, 0); const diff = Math.abs(p - .5); if (diff < best.diff) best = {a: ra, b: rb, diff};
      }
      return json(200, {game_win_probability: Math.round(pa * 100) / 100, provisional: a.games < 4 || b.games < 4,
        suggestion: best.a === best.b ? null : {race_self: best.a, race_opponent: best.b}});
    }
    if (url.pathname === '/achievements') {
      if (needAuth()) return needAuth();
      if (session.user.role) return fail(403, 'Erfolge gibt es nur für Spielerprofile.');
      const unseen = [...game.unseen];   // bleiben bis zur Bestätigung durch den Client (POST /achievements/seen)
      return json(200, {week: quests(), badges: badges(), stamps: {count: game.stamps, goal: 10, reward: '1 Tischstunde gratis', vouchers: vouchers.filter(v => v.player_id === ME).map(vOut)}, unseen});
    }
    if (url.pathname === '/achievements/seen' && method === 'POST') { game.unseen.splice(0, Number(body?.count) || 0); return json(200, {ok: true}); }
    if (url.pathname === '/vouchers' && method === 'POST') {
      if (needAuth()) return needAuth();
      if (session.user.role) return fail(403, 'Nur für Spielerprofile.');
      if (game.stamps < 10) return fail(400, 'Für einen Gutschein brauchst du 10 Stempel.');
      game.stamps -= 10;
      return json(200, {voucher: issueVoucher(ME, '1 Tischstunde gratis', 90, 'Bonusheft')});
    }
    if (parts[0] === 'vouchers' && parts[2] === 'redeem') return handleAdmin(['admin', 'vouchers', parts[1], 'redeem'], 'POST', body, q);
    if (url.pathname === '/venues') return json(200, {venues: venues.filter(v => !v.archived || url.searchParams.get('all')).map(v => ({...v}))});
    if (url.pathname === '/events') return json(200, {events: events.map(ev => ({...ev, venue: venueOut(ev.venue_id), venue_changed: !!ev.venue_changed_at && Date.parse(ev.venue_changed_at) > now() - 14 * DAY, registered: game.registered.has(ev.id), participants: ev.participants == null ? null : ev.participants + (game.registered.has(ev.id) ? 1 : 0)}))});
    if (parts[0] === 'events' && parts[2] === 'register') {
      if (needAuth()) return needAuth();
      body?.register ? game.registered.add(parts[1]) : game.registered.delete(parts[1]);
      return json(200, {ok: true});
    }
    if (url.pathname === '/tables') {
      const vid = venues.some(v => v.id === url.searchParams.get('venue')) ? url.searchParams.get('venue') : mainVenue().id;
      return json(200, {source: 'Gewichtssensor Kugelfach', venue: venueOut(vid), tables: tables.filter(t => t.active && t.venue_id === vid).sort((a, b) => a.no - b.no).map(tableOut)});
    }
    if (url.pathname.startsWith('/tables/')) {
      const t = tables.find(x => x.token === decodeURIComponent(url.pathname.slice(8)) && x.active);
      if (!t) return fail(404, 'Dieser QR-Code ist nicht (mehr) gültig. Bitte kurz an der Theke melden.');
      return json(200, {table: {...tableOut(t), venue: venueOut(t.venue_id)}});
    }
    if (url.pathname === '/feed') return json(200, {items: feed});
    // Push-Einstellungen (Demo: kein echter Push-Dienst, keine Schlüssel)
    if (url.pathname.startsWith('/push/')) {
      if (!session.authenticated || session.user?.role) return fail(403, 'Nur für Spielerprofile.');
      const out = () => json(200, {enabled: pushPrefs.enabled, topics: pushPrefs.topics, key: null, demo: true});
      if (url.pathname === '/push/settings') return out();
      if (method !== 'POST') return fail(405, 'Nicht erlaubt.');
      const allowed = ['matches', 'rewards', 'events'];
      if (url.pathname === '/push/subscribe') { pushPrefs.enabled = true; pushPrefs.topics = (Array.isArray(body?.topics) ? body.topics : allowed).filter(t => allowed.includes(t)); return out(); }
      if (url.pathname === '/push/unsubscribe') { pushPrefs.enabled = false; return out(); }
      if (url.pathname === '/push/topics') { pushPrefs.topics = (Array.isArray(body?.topics) ? body.topics : []).filter(t => allowed.includes(t)); return out(); }
      return fail(404, 'Unbekannt.');
    }
    if (url.pathname === '/quests') return json(200, {quests: questDefs.map(q => ({title: q.title, text: q.text}))});
    if (url.pathname === '/tv') { seedTournaments(); return json(200, tvOut()); }
    if (url.pathname.startsWith('/tv/screen/')) return json(200, screenPayload(decodeURIComponent(url.pathname.slice(11))));
    if (url.pathname === '/tournaments') { seedTournaments(); return json(200, {tournaments: tournaments.filter(t => t.status !== 'draft').map(t => tournamentOut(t))}); }
    if (url.pathname.startsWith('/tournaments/')) { seedTournaments(); const t = tournaments.find(x => x.id === url.pathname.slice(13)); return t ? json(200, {tournament: tournamentOut(t)}) : fail(404, 'Turnier nicht gefunden.'); }
    return fail(404, 'Unbekannte Anfrage.');
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url;
    const u = new URL(href, location.href);
    if (u.origin === location.origin && u.pathname.includes('/api/')) {
      const path = u.pathname.slice(u.pathname.indexOf('/api/') + 4) + u.search;
      let body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch {}
      await new Promise(r => setTimeout(r, 120 + Math.random() * 180)); // kleine Netzwerkverzögerung
      return handle(path, (init.method || 'GET').toUpperCase(), body);
    }
    return realFetch(input, init);
  };
  // Demo: Rollenwechsel über den Prototyp-Balken (Spieler / Inhaber / Theke)
  const markRole = () => document.querySelectorAll('[data-demo-as]').forEach(b => b.setAttribute('aria-pressed', String((session.user?.role || 'player') === b.dataset.demoAs)));
  document.addEventListener('click', async event => {
    const b = event.target.closest('[data-demo-as]');
    if (!b) return;
    await window.fetch(new URL('./api/demo/switch', location.href).href, {method: 'POST', body: JSON.stringify({as: b.dataset.demoAs})});
    markRole();
    location.hash = b.dataset.demoAs === 'player' ? '#spielen' : '#admin';
    window.dispatchEvent(new Event('focus'));
  });
  document.addEventListener('DOMContentLoaded', markRole);
  window.BillardDemo = {active: true};

  // ---------- Demo-Kopplung zum Café-Bildschirm ----------
  // Die TV-Demoseite (tv-demo.html) holt sich den aktuellen Stand dieser App:
  // im selben Browser über BroadcastChannel, von anderen Geräten über den lokalen Demo-Server (tools/demo-server.ps1 / demo_server.py).
  if (!window.BCM_DEMO_TV) {
    try {
      const ch = new BroadcastChannel('bcm-demo-tv');
      ch.onmessage = ev => { const d = ev.data || {}; if (d.type === 'get') ch.postMessage({type: 'payload', id: d.id, data: screenPayload(d.screen)}); };
    } catch { /* ältere Browser: ohne Kopplung */ }
    // Nur bei lokalem Start (Demo-Server im eigenen Netz) – nicht in der Online-Vorschau
    let relay = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname) || location.hostname.endsWith('.local') ? null : false; const last = {};
    const push = async () => {
      if (relay === false) return;
      try {
        for (const sc of tv.screens) {
          const data = screenPayload(sc.id), key = JSON.stringify({...data, now: 0});
          if (last[sc.id] === key) continue;
          const r = await realFetch('./demo-relay/tv/' + encodeURIComponent(sc.id), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
          if (!r.ok) throw new Error(r.status);
          last[sc.id] = key;
        }
        relay = true;
      } catch { if (relay === null) relay = false; }
    };
    setTimeout(push, 1500); setInterval(push, 3000);
  }
})();
