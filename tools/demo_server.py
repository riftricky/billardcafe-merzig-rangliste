#!/usr/bin/env python3
"""Lokaler Demo-Server (Mac/Linux, gleiche Funktion wie tools/demo-server.ps1 unter Windows).

  python3 tools/demo_server.py [--port 8765] [--kein-browser]

Öffnet die Demo-App (demo.html) und den Café-Bildschirm (tv-demo.html). Fernseher im selben WLAN:
http://<IP dieses Rechners>:8765/tv-demo.html?bildschirm=haupt – zeigt live, was in der Demo-App eingestellt wird.
"""
import http.server, json, os, socket, sys, threading, webbrowser
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RELAY = {}
LOCK = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _relay_id(self):
        p = unquote(urlparse(self.path).path)
        if p.startswith('/demo-relay/tv/'):
            sid = p[len('/demo-relay/tv/'):]
            if sid and all(c.isalnum() or c in '-_' for c in sid):
                return sid
        return None

    def do_GET(self):
        sid = self._relay_id()
        if sid is not None:
            with LOCK:
                body = RELAY.get(sid)
            if body is None:
                self.send_response(404); self.send_header('Content-Length', '0'); self.end_headers(); return
            self.send_response(200); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body); return
        if urlparse(self.path).path == '/':
            self.path = '/demo.html'
        super().do_GET()

    def do_POST(self):
        sid = self._relay_id()
        n = int(self.headers.get('Content-Length') or 0)
        if sid is None or n > 30 * 1024 * 1024:
            self.send_response(405); self.send_header('Content-Length', '0'); self.end_headers(); return
        body = self.rfile.read(n)
        with LOCK:
            RELAY[sid] = body
        self.send_response(204); self.end_headers()


def lan_ips():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('10.255.255.255', 1)); ip = s.getsockname()[0]; s.close()
        return [] if ip.startswith('127.') else [ip]
    except OSError:
        return []


def main():
    port = int(sys.argv[sys.argv.index('--port') + 1]) if '--port' in sys.argv else 8765
    srv = http.server.ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print(f'\n  Billardcafé Merzig · Demo läuft\n  App:              http://localhost:{port}/demo.html\n  Café-Bildschirm:  http://localhost:{port}/tv-demo.html?bildschirm=haupt')
    for ip in lan_ips():
        print(f'  Fernseher (WLAN): http://{ip}:{port}/tv-demo.html?bildschirm=haupt')
    print('  Beenden: Strg+C\n')
    if '--kein-browser' not in sys.argv:
        webbrowser.open(f'http://localhost:{port}/demo.html')
        threading.Timer(1.0, lambda: webbrowser.open(f'http://localhost:{port}/tv-demo.html?bildschirm=haupt')).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
