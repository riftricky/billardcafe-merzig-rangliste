# Prototyp lokal testen (App + Café-Bildschirm)

## Windows – ohne Installation
1. Im Projektordner **„Demo starten.bat“** doppelklicken.
2. Es öffnen sich zwei Browserfenster:
   - die App (`demo.html`)
   - der Café-Bildschirm (`tv-demo.html`)
3. Oben im Prototyp-Balken zwischen **Spieler**, **Inhaber** und **Theke** wechseln. Als Inhaber unter *Café-TV* den Bildschirm umschalten oder eine Durchsage machen. Das Bildschirm-Fenster zeigt die Änderung nach wenigen Sekunden.
4. Beenden: das schwarze Fenster schließen.

Fragt Windows nach der Firewall, für **private Netzwerke** erlauben. Nur dann kann der Fernseher zugreifen.

## Fernseher, Tablet oder zweiter Monitor
- **Zweiter Monitor oder Fernseher per HDMI am Laptop:** das Fenster „Café-Bildschirm“ hinüberziehen und mit **F11** auf Vollbild schalten.
- **Fernseher oder Fire-TV-Stick im selben WLAN:** die Adresse öffnen, die im schwarzen Fenster steht, z. B. `http://192.168.178.20:8765/tv-demo.html?bildschirm=haupt`. Für die Turnierecke `?bildschirm=turnier` verwenden.
  - Der Fernseher zeigt dann live, was in der Demo-App am Laptop eingestellt wird.
  - Die Demo-App muss dafür am Laptop geöffnet bleiben.
  - Hochgeladene Videos laufen in der Demo nur auf dem Laptop. Bilder funktionieren überall.

## Mac (Safari, Chrome oder Firefox)
1. Im Projektordner **„Demo starten (Mac).command“** doppelklicken.
   - Beim ersten Mal meldet macOS oft, die Datei stamme von einem „nicht verifizierten Entwickler“. Dann **Rechtsklick → Öffnen → Öffnen**. Das ist nur einmal nötig.
   - Startet sie gar nicht, einmal im Terminal ausführbar machen: `chmod +x "Demo starten (Mac).command"`.
2. Ein Terminal-Fenster zeigt die Adressen. Im Standard-Browser, meist Safari, öffnen sich App und Café-Bildschirm.
3. Fragt macOS, ob eingehende Verbindungen erlaubt werden, auf **Erlauben** klicken. Nur dann erreicht der Fernseher den Mac.
4. Beenden: das Terminal-Fenster schließen oder **Ctrl+C** drücken.

Der Starter braucht keine Installation; er nutzt das bei macOS mitgelieferte Perl (`tools/demo-server.pl`).
- Safari ab Version 15.4 wird unterstützt.
- Den Café-Bildschirm in Safari mit **Ctrl+Cmd+F** oder dem Knopf „Vollbild“ auf Vollbild schalten.

## Linux
`python3 tools/demo_server.py` im Projektordner starten. Das funktioniert genauso wie unter Windows.

## Gut zu wissen
- Die Demo nutzt **erfundene Daten** und keinen echten Server. Neu laden setzt alles zurück.
- Wer `index.html` oder `tv.html` ändert, erzeugt die Demo-Seiten neu: `python tools/build_demo.py`. Das braucht Python; Änderungen an JS- und CSS-Dateien wirken ohne diesen Schritt.
- `python tools/build_demo.py --paket` legt zusätzlich einen eigenständigen Ordner `demo-build/` zum Weitergeben an.
