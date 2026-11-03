#!/bin/bash
# Startet die Demo der Billardcafé-Rangliste auf dem Mac (App + Café-Bildschirm). Nichts zu installieren.
# Erster Start: Rechtsklick → „Öffnen“ (macOS fragt bei Dateien aus dem Internet einmal nach).
cd "$(dirname "$0")" || exit 1
PORT="${DEMO_PORT:-8765}"
clear
echo ""
echo "  Billardcafé Merzig · Demo startet …"

# Server starten (Perl ist auf jedem Mac vorhanden; sonst Python 3)
if command -v perl >/dev/null 2>&1; then
  DEMO_PORT="$PORT" perl tools/demo-server.pl > /tmp/billard-demo-$$.log 2>&1 &
elif command -v python3 >/dev/null 2>&1 && xcode-select -p >/dev/null 2>&1; then
  python3 tools/demo_server.py --port "$PORT" --kein-browser > /tmp/billard-demo-$$.log 2>&1 &
else
  echo "  Weder Perl noch Python gefunden. Bitte Python 3 installieren (python.org)."; read -r -p "  Enter zum Schließen"; exit 1
fi
SERVER=$!
aufraeumen() { trap - INT TERM HUP EXIT; kill $SERVER 2>/dev/null; rm -f /tmp/billard-demo-$$.log; echo ""; echo "  Demo beendet."; exit 0; }
trap aufraeumen INT TERM HUP EXIT

# warten, bis der Server antwortet
for i in $(seq 1 50); do
  if curl -s -o /dev/null "http://localhost:$PORT/demo.html"; then break; fi
  if ! kill -0 $SERVER 2>/dev/null; then echo ""; cat /tmp/billard-demo-$$.log; read -r -p "  Enter zum Schließen"; exit 1; fi
  sleep 0.2
done

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
clear
echo ""
echo "  Billardcafé Merzig · Demo läuft"
echo "  ------------------------------------------------------------"
echo "  App (Spieler/Inhaber/Theke):   http://localhost:$PORT/demo.html"
echo "  Café-Bildschirm auf diesem Mac: http://localhost:$PORT/tv-demo.html?bildschirm=haupt"
if [ -n "$IP" ]; then
echo "  Fernseher/Tablet im WLAN:       http://$IP:$PORT/tv-demo.html?bildschirm=haupt"
fi
echo "  (Turnierecke: ?bildschirm=turnier)"
echo ""
echo "  Fragt macOS, ob eingehende Verbindungen erlaubt werden: „Erlauben“, damit der Fernseher zugreifen kann."
echo "  Beenden: dieses Fenster schließen oder Ctrl+C."
echo ""

open "http://localhost:$PORT/demo.html"
sleep 1
open "http://localhost:$PORT/tv-demo.html?bildschirm=haupt"
wait $SERVER
