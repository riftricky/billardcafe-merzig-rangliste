"""Erzeugt icons.js aus einem Checkout von https://github.com/game-icons/icons (CC BY 3.0, Lorc & Delapouite).

  git clone --depth 1 --filter=blob:none --sparse https://github.com/game-icons/icons gi
  (cd gi && git sparse-checkout set --no-cone '/delapouite/*' '/lorc/*')
  python tools/build_icons.py gi

Neue Icons: Namen unten in ICONS ergänzen ('autor/name'), Skript erneut ausführen."""
import json, pathlib, re, sys

ICONS = '''delapouite/pool-triangle delapouite/eight-ball lorc/trophy delapouite/trophy-cup delapouite/podium delapouite/podium-winner
lorc/laurel-crown lorc/crown lorc/medal delapouite/sport-medal delapouite/stars-stack delapouite/calendar delapouite/ticket
delapouite/coffee-cup delapouite/present delapouite/stamper delapouite/tabletop-players delapouite/whistle lorc/target-arrows
lorc/crossed-swords lorc/lightning-trio delapouite/flag-objective delapouite/shop delapouite/meeple-group delapouite/teacher
delapouite/slingshot delapouite/shaking-hands lorc/two-shadows delapouite/hand-ok delapouite/stairs-goal delapouite/histogram
delapouite/person lorc/scroll-unfurled delapouite/position-marker delapouite/house delapouite/progression
delapouite/pool-table-corner delapouite/smartphone delapouite/organigram delapouite/film-projector delapouite/megaphone
delapouite/podium-second delapouite/podium-third delapouite/checklist delapouite/laptop'''.split()

def main(src):
    root = pathlib.Path(src); out = {}
    for n in ICONS:
        s = (root / f'{n}.svg').read_text(encoding='utf-8')
        out[n.split('/')[1]] = ' '.join(d for d in re.findall(r'<path[^>]*\sd="([^"]+)"', s) if d != 'M0 0h512v512H0z')
    target = pathlib.Path(__file__).resolve().parent.parent / 'icons.js'
    head, tail = target.read_text(encoding='utf-8').split('  const P = ', 1)
    tail = tail.split(';\n', 1)[1]
    target.write_text(head + '  const P = ' + json.dumps(out, separators=(',', ':')) + ';\n' + tail, encoding='utf-8')
    print(f'{len(out)} Icons nach {target} geschrieben')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'gi')
