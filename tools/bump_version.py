#!/usr/bin/env python3
"""Sube las versiones para que los navegadores (y el service worker) bajen la app nueva.

  python3 tools/bump_version.py          # ?v= de styles.css y app.js + VERSION de sw.js + hash CSP
  python3 tools/bump_version.py --csp    # solo recalcula el hash del script en línea (CSP)

Córrelo antes de publicar cada vez que cambies app.js, styles.css, index.html o sw.js.
"""
import base64
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
SW = ROOT / 'sw.js'


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
    html = update_csp(html)
    INDEX.write_text(html, encoding='utf-8')
    print('· index.html actualizado')


if __name__ == '__main__':
    main()
