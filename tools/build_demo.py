#!/usr/bin/env python3
"""Erzeugt die Demo-Seiten des Prototyps (erfundene Daten, kein echter Server).

  python tools/build_demo.py          -> demo.html und tv-demo.html im Projektordner (nach Änderungen an index.html/tv.html neu erzeugen)
  python tools/build_demo.py --paket  -> zusätzlich ein eigenständiger Ordner ./demo-build/ zum Weitergeben

Lokal testen: „Demo starten.bat“ (Windows) oder  python tools/demo_server.py  (Mac/Linux).
"""
import os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'demo-build')
FILES = ['app.js', 'app.css', 'opening.js', 'opening.css', 'rules.js', 'scorekeeper.js', 'scorekeeper.css',
         'icons.js', 'pwa.js', 'fonts.css', 'manifest.webmanifest', 'tv-player.js', 'tv-player.css', 'tv-start.js', 'features.js', 'admin.js', 'features.css', 'theme.css',
         'demo-api.js', 'demo-config.js', 'demo.html', 'tv-demo.html']
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Caveat:wght@500;700&family=Manrope:wght@400;500;600;700;800&display=swap">')
BAR = ('<div class="fx-demo-bar" role="note"><strong>Prototyp</strong><span>Erfundene Daten · neu laden setzt alles zurück.</span>'
       '<span class="fx-demo-roles" role="group" aria-label="Demo-Ansicht"><button type="button" data-demo-as="player" aria-pressed="true">Spieler</button>'
       '<button type="button" data-demo-as="owner" aria-pressed="false">Inhaber</button><button type="button" data-demo-as="staff" aria-pressed="false">Theke</button></span></div>')
NOTE = '<!-- AUTOMATISCH ERZEUGT von tools/build_demo.py aus {src} – nicht von Hand ändern. -->\n'


def read(name):
    with open(os.path.join(ROOT, name), encoding='utf-8') as fh:
        return fh.read()


def write(path, text):
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)


def demo_index():
    html = read('index.html')
    html = re.sub(r'\s*<meta http-equiv="Content-Security-Policy"[^>]*>', '', html)
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)
    html = html.replace('<script src="./remote-auth.js" defer></script>', '')
    html = html.replace('<script src="./deployment-config.js" defer></script>',
                        '<script src="./demo-config.js" defer></script>\n  <script src="./demo-api.js" defer></script>')
    html = html.replace('<div id="app-shell">', '<div id="app-shell">\n  ' + BAR, 1)
    html = re.sub(r'<title>[^<]*</title>', '<title>Billardcafé Merzig · Demo</title>', html, count=1)
    return html.replace('<!doctype html>', '<!doctype html>\n' + NOTE.format(src='index.html'), 1)


def demo_tv():
    html = read('tv.html')
    html = re.sub(r'\s*<meta http-equiv="Content-Security-Policy"[^>]*>', '', html)
    html = html.replace('<script src="./deployment-config.js"></script>',
                        '<script>window.BCM_DEMO_TV = true;</script>\n  <script src="./demo-config.js"></script>\n  <script src="./demo-api.js"></script>')
    html = re.sub(r'<title>[^<]*</title>', '<title>Café-Bildschirm · Demo</title>', html, count=1)
    return html.replace('<!doctype html>', '<!doctype html>\n' + NOTE.format(src='tv.html'), 1)


def main():
    write(os.path.join(ROOT, 'demo.html'), demo_index())
    write(os.path.join(ROOT, 'tv-demo.html'), demo_tv())
    print('Erzeugt: demo.html, tv-demo.html')
    if '--paket' in sys.argv:
        shutil.rmtree(OUT, ignore_errors=True)
        os.makedirs(OUT)
        for f in FILES:
            shutil.copy(os.path.join(ROOT, f), OUT)
        for d in ['icons', 'branding', 'vendor', 'fonts']:
            shutil.copytree(os.path.join(ROOT, d), os.path.join(OUT, d))
        shutil.copy(os.path.join(ROOT, 'demo.html'), os.path.join(OUT, 'index.html'))
        print('Paket gebaut:', OUT)


if __name__ == '__main__':
    sys.exit(main())
