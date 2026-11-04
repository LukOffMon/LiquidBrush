#!/usr/bin/env python3
"""Comprobaciones rápidas antes de publicar (las corre también GitHub Actions).

  python3 tools/check_site.py

- Las listas musica/*.json, catalog.json, tracks.json y el manifest son JSON válido.
- Cada canción tiene id, title y src; los id no se repiten dentro de su lista.
- El hash de la Content-Security-Policy coincide con el script en línea de index.html
  (si editas ese script, corre: python3 tools/bump_version.py --csp).
- Las versiones ?v= de index.html coinciden con las de sw.js.
- Existen los archivos que guarda el service worker y los iconos del manifest.
Sale con código 1 si algo falla.
"""
import base64
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors = []
warnings = []


def load_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception as exc:  # noqa: BLE001
        errors.append(f'{path.relative_to(ROOT)}: JSON no válido ({exc})')
        return None


def check_lists():
    total = 0
    for path in sorted((ROOT / 'musica').glob('*.json')):
        rows = load_json(path)
        if not isinstance(rows, list):
            errors.append(f'{path.name}: debe ser una lista')
            continue
        seen = set()
        for i, row in enumerate(rows):
            where = f'{path.name}[{i}]'
            if not isinstance(row, dict):
                errors.append(f'{where}: no es un objeto')
                continue
            for field in ('id', 'title', 'src'):
                if not str(row.get(field) or '').strip():
                    errors.append(f'{where}: falta «{field}»')
            if row.get('id') in seen:
                errors.append(f'{where}: id repetido «{row.get("id")}»')
            seen.add(row.get('id'))
            if row.get('duration') and not re.fullmatch(r'\d{1,3}:\d{2}(:\d{2})?', str(row['duration'])):
                warnings.append(f'{where}: duración rara «{row["duration"]}»')
        total += len(rows)
    print(f'· {total} canciones en musica/*.json')


def check_catalog():
    catalog = load_json(ROOT / 'catalog.json')
    if not isinstance(catalog, dict):
        return
    for key in ('genres', 'playlists'):
        if key not in catalog:
            errors.append(f'catalog.json: falta «{key}»')
    for pl in catalog.get('playlists', []):
        cover = pl.get('cover') if isinstance(pl, dict) else None
        if isinstance(cover, str) and cover.startswith('covers/') and not (ROOT / cover).exists():
            errors.append(f'catalog.json: no existe la portada {cover}')
    load_json(ROOT / 'tracks.json')


def check_csp():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    scripts = re.findall(r'<script>(.*?)</script>', html, re.S)
    expected = {"'sha256-%s'" % base64.b64encode(hashlib.sha256(s.encode()).digest()).decode() for s in scripts}
    found = set(re.findall(r"'sha256-[A-Za-z0-9+/=]+'", html))
    if expected - found:
        errors.append('index.html: la CSP no tiene el hash del script en línea (python3 tools/bump_version.py --csp)')


def check_versions():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    sw = (ROOT / 'sw.js').read_text(encoding='utf-8')
    for name in ('styles.css', 'app.js'):
        page = re.search(rf'{re.escape(name)}\?v=(\d+)', html)
        worker = re.search(rf'{re.escape(name)}\?v=(\d+)', sw)
        if not page or not worker or page.group(1) != worker.group(1):
            errors.append(f'{name}: la versión ?v= de index.html y sw.js no coincide')
    for entry in re.findall(r"^\s*'([^']+)',?$", sw.split('const SHELL = [')[1].split('];')[0], re.M):
        file = entry.split('?')[0]
        if file not in ('./', '') and not (ROOT / file).exists():
            errors.append(f'sw.js: SHELL incluye «{entry}», que no existe')


def check_manifest():
    manifest = load_json(ROOT / 'manifest.webmanifest')
    if not isinstance(manifest, dict):
        return
    for item in manifest.get('icons', []) + manifest.get('screenshots', []):
        if not (ROOT / item['src']).exists():
            errors.append(f'manifest: no existe {item["src"]}')


def main():
    check_lists()
    check_catalog()
    check_csp()
    check_versions()
    check_manifest()
    for w in warnings[:20]:
        print(f'  aviso: {w}')
    if len(warnings) > 20:
        print(f'  … y {len(warnings) - 20} avisos más')
    if errors:
        print('\nErrores:')
        for e in errors:
            print(f'  ✗ {e}')
        sys.exit(1)
    print('✓ Todo en orden')


if __name__ == '__main__':
    main()
