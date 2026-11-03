# Café-App-Erweiterungen – Übergabe

Diese Erweiterungen bauen auf der bestehenden Rangliste auf. Partien, Bestätigung durch den Gegner und Wertung bleiben unverändert.

**Stand:** Die Oberfläche ist fertig und läuft im Prototyp mit einem Demo-Server im Browser (`demo-api.js`) und erfundenen Daten. Am echten Server wurde nichts verändert. Damit die neuen Bereiche live funktionieren, muss der Server die unten beschriebenen Endpunkte liefern. Antwortformen und Berechnungen stehen als lauffähiges Beispiel in `demo-api.js`.

Ausprobieren: siehe **LOKAL-TESTEN.md** (Windows: Doppelklick auf `Demo starten.bat`).

---

## 1. Funktionen im Überblick

**Für Spieler**

| Bereich | Wo | Kurz |
|---|---|---|
| Monatsliga | Rangliste | Vier Café-Ligen je Disziplin. Sieg 3, Niederlage 1, +1 gegen eine höhere Liga, höchstens 3 Wertungen pro Gegner und Monat. Siegerpodest je Liga. Die bisherige Tabelle bleibt als „Gesamttabelle“. |
| Stufe & Fortschritt | Profil → Wertungskarten | Stufe I–III innerhalb der Liga mit Liga-Pfad. Die Spielstärke-Zahl bleibt verborgen. Disziplinen stehen untereinander. |
| Gewinnchance & Vorgabe | Partie starten | „Du gewinnst etwa 3 von 10 Spielen“ und ein freiwilliger Vorgabe-Vorschlag |
| Profil | `#profil`, `#profil-bearbeiten`, `#spieler/<id>` | Profilbild (Kugel, Vorlage oder eigenes Foto), Motto, Lieblingsdisziplin, Titel, Vitrine mit bis zu 3 Trophäen, Sichtbarkeit (alle / nur Angemeldete / nur ich) |
| Statistik | `#statistik[/<id>]` | Spielstärke-Verlauf auf dem Billardtisch (ohne Zahlen), Form der letzten 10, Wettbewerbe, Monate, Wochentage, häufigste Gegner |
| Erfolge | `#erfolge` | Bonusheft (10 Stempel = Gutschein), Wochenaufgaben, 14 Abzeichen in Bronze/Silber/Gold |
| Gutscheine | Erfolge → Bonusheft | Einmal-Code mit QR. Die Theke prüft und löst ein, der Rabatt wird normal in der Kasse gebucht. Auf Wunsch nur an einem Standort gültig. |
| Events | `#events` | An- und Abmeldung, Teilnehmerzahl, Sponsor, Standort mit Hinweis „Ort geändert“ |
| Turniere | `#turnier/<id>` | Öffentlicher Turnierbaum mit Ergebnissen und Siegern |
| Tisch-QR | `#tisch/<kürzel>` | Tisch und Belegung ansehen, „Hier spielen“ merkt den Tisch für 4 Stunden |
| Benachrichtigungen | Profil | Push nach Themen (siehe Abschnitt 8) |
| Als App | überall | Installierbar, startet offline, Kurzbefehle (siehe Abschnitt 8) |

**Für das Café** (eigene Konten ohne Spielerprofil, siehe Abschnitt 3)

| Bereich | Route | Kurz |
|---|---|---|
| Übersicht | `#admin` | Offene Streitfälle und Gutscheine, neue Spieler, auffällige Paarungen, letzte Aktionen, Gutschein einlösen |
| Turniere | `#admin/turniere[/<id>]` | K.-o.-System mit Setzliste und Freilosen, Tische zuweisen, Ergebnisse eintragen, Preise vergeben |
| Café-TV | `#admin/tv` | Bildschirme umschalten, Durchsagen, Folien, Bilder und Videos, Sponsor-Banner |
| Monatsabschluss | `#admin/monat` | Vorschläge für Monatssieger, Champion, Stammgast und Aufsteiger bestätigen, tauschen oder ablehnen |
| Spieler | `#admin/spieler[/<id>]` | Auszeichnung verleihen oder entziehen, Gutschein, Stempel, PIN zurücksetzen, sperren, Doppelprofile zusammenführen, Foto entfernen |
| Gutscheine | `#admin/gutscheine[/neu]` | Prüfen und einlösen, verteilen an Spieler, Liga, Aktive, Event-Teilnehmer oder als Codes ohne Empfänger |
| Streitfälle | `#admin/streit` | Widersprochene Partien entscheiden oder annullieren |
| Belohnungen | `#admin/katalog` | Eigene Pokale, Medaillen, Titel und Gutschein-Vorlagen |
| Events | `#admin/events` | Anlegen, bearbeiten, verlegen |
| Tische & QR | `#admin/tische` | Tische je Standort, druckfertige QR-Karten, Code erneuern |
| Orte | `#admin/orte` | Standorte mit Adresse (das Stammhaus ist fest) |
| Wochenaufgaben | `#admin/aufgaben` | Höchstens 5 eigene Aufgaben |
| Protokoll | `#admin/protokoll` | Jede Aktion mit Zeit, Person, Rolle und Begründung, nicht löschbar |

---

## 2. Dateien

| Datei | Zweck |
|---|---|
| `app.js` | Bestehende App. Nur kleine Einhängepunkte, alle mit `/* NEU */` markiert: Routen, Laden, Rendern, Profil für Café-Konten, `window.BillardApp` |
| `index.html` | Bindet die neuen Dateien ein, Tabs „Erfolge“ und „Events“, Meta-Tags für die installierte App |
| `features.js` / `features.css` | Alle Spieler-Funktionen, Bausteine wie Avatar, Kugeln und Turnierbaum, Konto-Seite für Café-Konten |
| `admin.js` | Café-Verwaltung |
| `theme.css` | Design „Nachttisch“ (nur Optik) |
| `pwa.js` | Installationshinweis, Update-Hinweis, Push-Einstellungen |
| `sw.js` | Service Worker: Offline-Start, Updates, Push |
| `manifest.webmanifest`, `icons/` | App-Manifest, Icons (auch maskierbar), Badge, Kurzbefehl-Icons, Screenshots |
| `fonts.css`, `fonts/` | Selbst gehostete Schriften (siehe Abschnitt 6) |
| `icons.js` | 45 Icons von game-icons.net als SVG-Pfade, Aufruf `BCMIcon('trophy')` |
| `tv.html`, `tv-start.js`, `tv-player.js`, `tv-player.css` | Eigenständiger Café-Bildschirm für Fernseher |
| `vendor/qrcode.js` | qrcode-generator (MIT) für Gutschein-, Tisch- und TV-QR-Codes, lokal wegen der CSP |
| `demo.html`, `tv-demo.html`, `demo-config.js`, `demo-api.js` | **Nur Demo.** Gehören nicht in die Live-Seite (`index.html` lädt sie nicht). |
| `Demo starten.bat` + `tools/demo-server.ps1` (Windows), `Demo starten (Mac).command` + `tools/demo-server.pl` (Mac), `tools/demo_server.py` (Linux) | Lokaler Demo-Server ohne Installation, App und Fernseher gekoppelt |
| `tools/build_demo.py` | Erzeugt `demo.html` und `tv-demo.html` aus `index.html` und `tv.html` neu |
| `tools/build_icons.py` | Erzeugt `icons.js` aus dem game-icons-Repository |

---

## 3. Rollen & Navigation

- **Rolle am Sitzungs-Objekt:** `user.role` = `owner` (Inhaber) | `staff` (Theke) | `null` (Spieler). `user.is_admin` bleibt für die bestehende Annullier-Funktion (= Inhaber).
- **Café-Konten** haben kein Spielerprofil: keine Erfolge, keine Wertung, kein „Spielen“, und sie erscheinen nicht in der Rangliste.
  - **Navigation:** Verwaltung · Turniere · Café-TV · Rangliste (nur ansehen) · Konto.
  - **Weiterleitung:** Spielerseiten leiten auf `#admin` um.
  - **Konto:** Die Kontoseite zeigt, was die Rolle darf.
- **Inhaber:** darf alles.
- **Theke:**
  - Übersicht, Gutscheine prüfen und einlösen, Streitfälle ansehen, Events pflegen
  - Turnierergebnisse eintragen und Tische zuweisen
  - Bildschirme umschalten und Durchsagen machen
  - Tische und QR-Karten ansehen und drucken
- **Rechteprüfung:** Der Server prüft jede Anfrage selbst und antwortet ohne passende Rolle mit 403.
- **Begründung:** Schreibende Aktionen mit Spielerbezug brauchen eine Begründung (`reason`, mindestens 3 Zeichen) und erzeugen einen Protokolleintrag.

---

## 4. Was der Server liefern muss

Alle Pfade liegen unter `/api`. Dort, wo es hier nicht anders steht, entspricht die Antwortform der Umsetzung in `demo-api.js`.

### 4.1 Bestehende Antworten, ergänzt

- `GET /me` → je Wertung zusätzlich `tier` (1–3), `progress` (0–1, grob) und `next_rank`.
- `GET /leaderboard` → je Zeile zusätzlich `league_points`, `bonus`, `tier`, `player.ball`, `player.title` und `player.av` (Profilbild). Dazu kommt `titles: {champion, regular, climber}`.
- `GET /players` muss das eigene Profil enthalten. Darauf verlässt sich „Partie starten“.

### 4.2 Spieler & öffentlich

| Methode & Pfad | Zweck |
|---|---|
| `GET /odds?pool&opponent&wins` | `{game_win_probability, provisional, suggestion: {race_self, race_opponent} \| null}` |
| `GET /profile/{id\|me}`, `POST /profile` | Profil lesen und speichern: `motto`, `ball`, `favorite_pool`, `title_id`, `showcase`, `visibility`, `avatar_type` (`ball`\|`preset`\|`photo`), `preset_id`, `photo` (data-URL, JPEG/PNG/WebP, höchstens ca. 300 KB). Private Profile: andere sehen nur Name und Kugel. |
| `GET /stats/{id\|me}` | `bands`, `history` je Disziplin (`{t, r}`), `per_pool`, `form`, `streak`, `rivals`, `weekdays`, `months` |
| `GET /achievements` | `{week, badges, stamps: {count, goal, reward, vouchers}, unseen}` |
| `POST /achievements/seen` | `{count}`. Hinweise bleiben gespeichert, bis die App sie bestätigt. |
| `POST /vouchers` | Gutschein aus 10 Stempeln erzeugen |
| `GET /events` | Events mit `venue: {id, name, address, main}`, `venue_note`, `venue_changed`, `registered` |
| `POST /events/{id}/register` | `{register: true \| false}` |
| `GET /venues` | Standorte (`?all=1` auch archivierte) |
| `GET /tables?venue=` | Tische eines Standorts: `{no, name, kind, status: busy\|free, since, sensor}`. Kommt aus dem Kugelfach-Sensor, ohne Namen. |
| `GET /tables/{kürzel}` | Tisch zum QR-Code, 404 bei ungültigem Code |
| `GET /tournaments[/{id}]` | Laufende und beendete Turniere mit Turnierbaum |
| `GET /feed` | `{items}`: Neuigkeiten für den Café-Bildschirm |
| `GET /quests` | Aktuelle Wochenaufgaben ohne persönlichen Stand (für den Bildschirm) |
| `GET /tv/screen/{id}` | Alles, was ein Bildschirm zeigt, in einer Antwort. Öffentlich und ohne personenbezogene Daten außer Spielernamen in Liga und Turnier. |
| `GET /push/settings` | `{enabled, topics, key}`. `key` ist der öffentliche VAPID-Schlüssel (Base64url). |
| `POST /push/subscribe` | `{subscription, topics}` |
| `POST /push/unsubscribe` | Push für dieses Gerät abmelden |
| `POST /push/topics` | `{topics}` mit Werten aus `matches`, `rewards`, `events` |

### 4.3 Café-Verwaltung (`/admin/…`)

| Bereich | Endpunkte |
|---|---|
| Übersicht | `GET /admin/overview` |
| Monatsabschluss | `GET /admin/month-close?month=` · `POST /admin/month-close/decide {month, key, decision: approve\|reject\|swap, player_id?, reason}` · `POST /admin/month-close/approve-all {month, reason?}`. Monatstitel entstehen erst nach Bestätigung, höchstens eine Auszeichnung pro Person. |
| Spieler | `GET /admin/players?q=` · `GET /admin/players/{id}` · `POST /admin/players/{id}/(award\|revoke\|stamps\|voucher\|pin-reset\|block\|merge\|remove-photo)` |
| Gutscheine | `GET /admin/vouchers?status=open\|redeemed\|expired\|all` · `GET /admin/vouchers/{code}` · `POST /admin/vouchers/{code}/redeem {venue_id}` (409 schon eingelöst oder falscher Standort, 410 abgelaufen) · `POST /admin/vouchers/preview` · `POST /admin/vouchers/issue {template\|custom, title?, valid_days?, note?, venue_id?, target: players\|liga\|active\|event\|all\|none, …, reason}` · `GET /admin/vouchers/batches`. Der alte Spieler-Endpunkt `/vouchers/{code}/redeem` ist jetzt nur fürs Café. |
| Streitfälle | `GET /admin/matches` · `POST /admin/matches/{id}/resolve {score_a, score_b, reason}` · `POST /admin/matches/{id}/void {reason}` |
| Belohnungen | `GET/POST /admin/catalog {name, kind: pokal\|medaille\|titel\|gutschein, tier \| valid_days, venue_id?, description?, sponsor?}` · `POST /admin/catalog/{id}/archive` |
| Events | `POST /admin/events {id?, type, title, starts_at, venue_id, venue_note?, place, price, capacity\|null, sponsor?, description}` · `POST /admin/events/{id}/delete`. Ein Ortswechsel benachrichtigt die Angemeldeten. |
| Wochenaufgaben | `GET/POST /admin/quests` · `POST /admin/quests/{id}/delete` |
| Orte | `POST /admin/venues {id?, name, address, note?}` · `POST /admin/venues/{id}/archive` |
| Tische | `GET /admin/tables` · `POST /admin/tables {id?, no, venue_id, kind, name?, sensor_id?}` · `POST /admin/tables/{id}/new-code {reason}` · `POST /admin/tables/{id}/toggle` |
| Turniere | `GET /admin/tournaments[/{id}]` · `POST /admin/tournaments` · `POST /admin/tournaments/{id}/(settings\|players\|prizes\|start\|live\|award\|delete)` (Inhaber) · `POST /admin/tournaments/{id}/(result\|table\|reset)` (auch Theke) |
| Café-TV | `GET /admin/tv` · `POST /admin/tv/announce {text, minutes}` · `POST /admin/tv/announce/clear` · `POST /admin/tv/screens/{id}/mode {mode, tournament_id?, slide_id?}` (auch Theke) · `POST /admin/tv/settings {seconds, footer}` · `POST /admin/tv/slides` · `POST /admin/tv/screens[/{id}/delete]` · `POST /admin/tv/media[/{id}/(slide\|banner\|delete)]` (Inhaber) |
| Protokoll | `GET /admin/audit?player=&action=` |

---

## 5. Regeln & Schutz vor Missbrauch

- Nur beidseitig bestätigte Partien zählen. Wo möglich, nur mit gleichzeitig belegtem Tisch laut Sensor.
- Derselbe Gegner zählt höchstens dreimal pro Monat für Liga, Aufgaben und Abzeichen.
- Stempel: höchstens einer pro Spieltag, dazu die Wochenaufgaben.
- Höchstens ein Monatspreis pro Person. Auffällige Paarungen (5 oder mehr Partien derselben zwei Spieler im Monat) werden markiert, das Café entscheidet.
- Turnierpartien zählen im Prototyp **nicht** für die Spielstärke. Ob sie im Echtbetrieb zählen sollen, entscheidet das Café.

---

## 6. Design, Schriften, Icons & Lizenzen

- **Design „Nachttisch“** (`theme.css`): Filzgrün, Messing, Holz der Bande, Kreideblau für Zustände wie „frei“. Es ändert nur die Optik, keine Logik.
- **Motive:** Liga-Zeichen sind Billardkugeln 1–4. Scroll- und Fortschrittsbalken haben die Form eines Queues, Punkte die Form von Kreidewürfeln, unter Überschriften liegt eine Bande mit Diamanten, Wochenaufgaben stehen auf einer Kreidetafel.
- **Schriften:** Barlow Condensed, Manrope und Caveat liegen **selbst gehostet** unter `fonts/`, auf lateinische Zeichen reduziert, als WOFF. Lizenz: SIL Open Font License 1.1; die Lizenztexte liegen daneben. So gibt es keine Anfragen an Google, und die CSP `font-src 'self'` passt.
- **Icons:** game-icons.net (Lorc & Delapouite), **CC BY 3.0**. Die Namensnennung steht im Footer und muss bleiben.
- **QR-Code-Bibliothek:** qrcode-generator, MIT. Die Lizenz liegt in `vendor/`.

---

## 7. Datenschutz

- Anmeldung weiterhin nur mit Nickname und PIN, ohne E-Mail.
- **Fotos:**
  - Sie sind optional und werden auf dem Handy auf 256 px zugeschnitten und als JPEG gesendet. Der Server bekommt so nie das Original mit Standortdaten.
  - Das Café kann Fotos entfernen. Beim Löschen des Kontos müssen sie mit gelöscht werden.
  - Im Echtbetrieb sollten Fotos als Datei gespeichert werden statt als data-URL in der Datenbank.
- **Private Profile:** Andere sehen nur Name und Kugel.
- **Tisch-QR-Code:** Er enthält nur ein zufälliges Kürzel, die App fragt keinen Standort ab. Der Kartenlink bei Events ist nur ein Link zu OpenStreetMap, es wird nichts eingebettet.
- **Café-Bildschirm:** Die Tische erscheinen ohne Namen.
- **Push:** Nachrichten bleiben kurz und ohne private Details. Abmelden geht jederzeit.
- **Vor dem Start nötig:** Datenschutzerklärung und Impressum aktualisieren (Fotos, Push, Turniere) und den Server-Standort in Deutschland oder der EU wählen. Das ist kein Rechtsrat, bitte einmal prüfen lassen.

---

## 8. Web-App (PWA)

- **Installieren:**
  - Manifest mit Name „Billardcafé“, Farben passend zum Design, maskierbaren Icons, Monochrom-Badge, Kurzbefehlen (Partie starten, Rangliste, Erfolge, Events) und Screenshots.
  - iPhone: eigenes Apple-Touch-Icon und Statusleiste im App-Modus.
  - Auf dem Handy zeigt die Startseite einen ausblendbaren Hinweis „Als App installieren“. Unter Android öffnet er den Installationsdialog, sonst die vorhandene Anleitung `#installieren`.
- **Offline-Start:** `sw.js` hält die Oberfläche, die Erweiterungen, Schriften und Icons vor. API-Antworten werden nie zwischengespeichert.
- **Updates:** Eine neue Version wird im Hintergrund geladen und erst nach „Neu laden“ übernommen, damit keine Eingabe verloren geht. **Vor jeder Veröffentlichung die Cache-Version in `sw.js` hochzählen** (aktuell `merzig-shell-v13`).
- **Push-Benachrichtigungen:**
  - **Themen:** Partien & Turniere, Gutscheine & Auszeichnungen, Events.
  - **Versand:** über eine Web-Push-Bibliothek wie `web-push` (Node) oder `pywebpush` (Python). Der private VAPID-Schlüssel bleibt auf dem Server.
  - **Inhalt:** `{title, body, url, tag}`. Abonnements, die mit 404 oder 410 antworten, löschen.
  - **Auslöser (Vorschlag):**
    - Bestätigung angefragt oder Ergebnis bestätigt
    - Turnierpartie aufgerufen
    - neuer Gutschein oder neue Auszeichnung
    - Event morgen
    - Ortsänderung
  - **iPhone:** Push kommt nur an, wenn die App auf dem Home-Bildschirm liegt (ab iOS 16.4). Die Karte im Profil erklärt das.
  - **Ohne Server-Unterstützung** zeigt die Karte „Der Server unterstützt Benachrichtigungen noch nicht“. Alles andere läuft normal.

---

## 9. Café-TV

- **Bildschirme:**
  - Jeder Fernseher öffnet einmalig seine TV-Adresse `tv.html?bildschirm=<id>`. Kopieren lässt sie sich unter *Café-TV → TV-Adresse*, dort gibt es auch einen QR-Code.
  - In der App zeigt `#tv/<id>` dieselbe Ansicht.
  - Je Bildschirm lassen sich Name, Standort und „Tische links“ einstellen.
- **Anzeigen (umschalten durch Inhaber und Theke):**
  - Folien im Wechsel
  - Turnieransicht: großer Turnierbaum, „Jetzt am Tisch“, „Als Nächstes“, Ergebnisse
  - Siegerehrung
  - eine Folie dauerhaft
- **Folien (Inhaber):**
  - Automatische Folien: Turnierbaum live, Siegerehrung, Monatsliga, nächstes Event, Neu im Café, Wochenaufgaben.
  - Eigene Folien: Text mit Symbol oder Foto, etwa „Getränk der Woche“.
  - Bilder und Videos als eigene Folie, Bilder auch als Sponsor-Banner unten.
  - Sortieren und an- und ausschalten, Sekunden pro Folie und Laufzeile einstellen.
- **Durchsagen:** Text für 1 bis 30 Minuten groß auf allen Bildschirmen, vorzeitig beendbar.
- **Videos:** Sie laufen stumm bis zum Ende, höchstens 3 Minuten. Bilder werden auf 1920 × 1080 verkleinert.
- **TV-tauglich:**
  - Der Player ist eigenständig und ohne die ganze App.
  - Er ist in einfachem JavaScript geschrieben (ES2015, ohne `?.`, `??`, async/await und Objekt-Spread) und nutzt einfaches CSS ohne `clamp`, `:has` und Flex-`gap`.
  - Die Bühne ist fest 1920 × 1080 und wird auf jede Auflösung skaliert.
  - Der Mauszeiger wird ausgeblendet, ein Vollbild-Knopf erscheint bei Bewegung. Wake Lock hält den Bildschirm an, wo der Browser es kann.
  - Abruf alle 10 Sekunden. Bei Netzproblemen bleibt die letzte Ansicht stehen.
- **Tipp:** Ein Fire-TV-Stick oder Mini-PC im Kiosk-Modus ist zuverlässiger als der eingebaute TV-Browser.

---

## 10. Für den Echtbetrieb noch offen

1. Server-Endpunkte aus Abschnitt 4 umsetzen, jede Anfrage mit eigener Rechteprüfung.
2. Café-Konten mit eigener, sicherer Anmeldung, nicht nur per Nickname.
3. **Dateispeicher** für Profilfotos, TV-Bilder und Videos, mit Prüfung von Typ (Magic Bytes) und Größe.
4. **Kugelfach-Sensor und Kasse** über die Tisch-ID (`sensor_id`) anbinden.
5. Beim Anlegen einer Partie `table_id` mitschicken. Das ermöglicht Wochenaufgaben pro Standort.
6. Die Basis-Adresse in Tisch- und TV-QR-Codes fest auf die öffentliche Domain setzen statt `location.href`.
7. Push-Versand mit VAPID-Schlüsseln (Abschnitt 8).
8. Bei gelöschten Events die Angemeldeten benachrichtigen.
9. Entscheidungen fürs Café: Zählen Turnierpartien für die Wertung? Welche Preise und Gutscheine gibt es, welche Sponsoren?
10. Optional: QR-Scan per Kamera an der Theke, Gutschein in der Wallet, Store-Apps (siehe unten).

**Store-Apps (später):** Die Web-App lässt sich mit Capacitor für Android und iOS verpacken. Für iOS braucht es dafür echte App-Funktionen wie Kamera-Scan und Push, sonst lehnt Apple ab. Android ginge alternativ als Trusted Web Activity; das braucht eine eigene Domain wegen der Datei `assetlinks.json`.

---

## 11. Demo & lokal testen

- **Demo-Seiten:** `demo.html` (App) und `tv-demo.html` (Bildschirm) verwenden dieselben Dateien wie die echte App, aber `demo-config.js` und `demo-api.js` statt des Servers. Im Prototyp-Balken oben wechselt man zwischen Spieler, Inhaber und Theke (`POST /demo/switch`, nur Demo).
- **Starten:**
  - Windows: `Demo starten.bat`
  - Mac: `Demo starten (Mac).command` (Safari ab 15.4)
  - Linux: `python3 tools/demo_server.py`
  - App und Bildschirm sind gekoppelt, auch mit einem Fernseher im WLAN (Details in LOKAL-TESTEN.md).
- **Neu erzeugen:** Nach Änderungen an `index.html` oder `tv.html` mit `python tools/build_demo.py`. Mit `--paket` entsteht zusätzlich ein eigenständiger Ordner `demo-build/`.
