#!/usr/bin/env python3
"""Sube las versiones para que los navegadores (y el service worker) bajen la app nueva.

  python3 tools/bump_version.py          # ?v= de styles.css y app.js + VERSION de sw.js + hash CSP
                                         # + música nueva (novedades.json → nuevaMusica) al parche
  python3 tools/bump_version.py --csp    # solo recalcula el hash del script en línea (CSP)

Córrelo antes de publicar cada vez que cambies app.js, styles.css, index.html o sw.js.
"""
import base64
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
SW = ROOT / 'sw.js'
NOVEDADES = ROOT / 'novedades.json'


def attach_new_music(version):
    """Pasa la música nueva apuntada por build_catalog.py ("nuevaMusica") al parche que se publica.

    Va a la versión de arriba de novedades.json solo si es la que se está publicando (la misma que
    el VERSION nuevo de sw.js): así el aviso «Hay una versión nueva» lista todas las canciones nuevas.
    """
    if not NOVEDADES.exists():
        return
    data = json.loads(NOVEDADES.read_text(encoding='utf-8'))
    pending = data.get('nuevaMusica') or []
    if not pending:
        return
    top = (data.get('releases') or [{}])[0]
    if top.get('version') != version:
        print(f'· novedades.json: {len(pending)} canciones nuevas esperan un bloque "{version}" arriba de "releases"')
        return
    have = {s.get('id') for s in top.get('songs', [])}
    top['songs'] = top.get('songs', []) + [s for s in pending if s.get('id') not in have]
    del data['nuevaMusica']
    NOVEDADES.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'· novedades.json: {len(top["songs"])} canciones nuevas en el parche {version}')


def update_csp(html):
    scripts = re.findall(r'<script>(.*?)</script>', html, re.S)
    hashes = ' '.join("'sha256-%s'" % base64.b64encode(hashlib.sha256(s.encode()).digest()).decode() for s in scripts)
    # Conserva los orígenes extra (p. ej. Turnstile) y sustituye solo los hashes de los scripts en línea
    def rehacer(m):
        otros = [t for t in m.group(1).split() if not t.startswith("'sha256-") and t != "'self'"]
        return "script-src " + ' '.join(["'self'", *otros, hashes])
    return re.sub(r"script-src ([^;\"]*)", rehacer, html, count=1)


def bump(text, name):
    return re.sub(rf'({re.escape(name)}\?v=)(\d+)', lambda m: f'{m.group(1)}{int(m.group(2)) + 1}', text)


def main():
    html = INDEX.read_text(encoding='utf-8')
    if '--csp' not in sys.argv:
        sw = SW.read_text(encoding='utf-8')
        for name in ('styles.css', 'app.js'):
            html = bump(html, name)
            sw = bump(sw, name)
        sw = re.sub(r"const VERSION = 'v(\d+)'", lambda m: f"const VERSION = 'v{int(m.group(1)) + 1}'", sw)
        SW.write_text(sw, encoding='utf-8')
        print('· sw.js:', re.search(r"const VERSION = '(v\d+)'", sw).group(1))
        attach_new_music(re.search(r"const VERSION = '(v\d+)'", sw).group(1))
    html = update_csp(html)
    INDEX.write_text(html, encoding='utf-8')
    print('· index.html actualizado')
    # Liquid Lab (lab.html) se genera a partir de index.html: mismas versiones y misma CSP
    import build_lab
    build_lab.main()


if __name__ == '__main__':
    main()
