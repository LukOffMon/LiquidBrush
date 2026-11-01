#!/usr/bin/env python3
"""Comprueba que cada canción de musica/*.json responde en la URL pública de su bucket.

    python3 tools/check_r2.py            # informe
    python3 tools/check_r2.py --apartar  # mueve las que no existen a tools/pendientes.json

Las URL públicas de r2.dev tienen límite de velocidad: se consulta despacio y se reintenta.
Las canciones apartadas no aparecen en la app; cuando se suban, vuelve a ejecutar con
--recuperar para devolverlas a su lista.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PENDING = ROOT / 'tools' / 'pendientes.json'


def bases():
    app = (ROOT / 'app.js').read_text(encoding='utf-8')
    return dict(re.findall(r"name: '(\w+)',\s*list: '[^']+',\s*base: '([^']+)'", app))


def size_of(base, key):
    url = base + '/' + '/'.join(urllib.parse.quote(p) for p in key.split('/'))
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'Mozilla/5.0'})
            return int(urllib.request.urlopen(req, timeout=30).headers.get('Content-Length') or 0)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return 0
        except Exception:  # noqa: BLE001 — red o límite de velocidad: se reintenta
            pass
        time.sleep(3 + attempt * 4)
    return None


def check(name, base, rows):
    with ThreadPoolExecutor(4) as pool:
        return list(pool.map(lambda r: size_of(base, r['src']), rows))


def main():
    apartar, recuperar = '--apartar' in sys.argv, '--recuperar' in sys.argv
    pending = json.loads(PENDING.read_text(encoding='utf-8')) if PENDING.exists() else {}
    for name, base in bases().items():
        path = ROOT / 'musica' / f'{name}.json'
        rows = json.loads(path.read_text(encoding='utf-8'))
        if recuperar and pending.get(name):
            back = pending[name]
            sizes = check(name, base, back)
            rows += [r for r, s in zip(back, sizes) if s]
            pending[name] = [r for r, s in zip(back, sizes) if not s]
            print(f'{name}: recuperadas {sum(1 for s in sizes if s)}')
        sizes = check(name, base, rows)
        missing = [r for r, s in zip(rows, sizes) if s == 0]
        unknown = [r for r, s in zip(rows, sizes) if s is None]
        total = sum(s for s in sizes if s)
        print(f'{name:7} {len(rows):5} canciones · {total / 1e9:5.2f} GB · faltan {len(missing)} · sin respuesta {len(unknown)}')
        for r in missing[:5]:
            print('   falta:', r['src'])
        if apartar and missing:
            pending.setdefault(name, []).extend(missing)
            rows = [r for r, s in zip(rows, sizes) if s != 0]
        if apartar or recuperar:
            path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if apartar or recuperar:
        pending = {k: v for k, v in pending.items() if v}
        PENDING.write_text(json.dumps(pending, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('pendientes:', {k: len(v) for k, v in pending.items()})


if __name__ == '__main__':
    main()
