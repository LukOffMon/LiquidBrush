#!/usr/bin/env python3
"""Busca canciones repetidas y artistas escritos de varias formas en musica/*.json.

No cambia nada: imprime un informe para decidir qué limpiar.

  python3 tools/find_duplicates.py            # informe en texto
  python3 tools/find_duplicates.py --json     # lo mismo en JSON

- Canciones repetidas: mismo artista y título (sin acentos, mayúsculas, «- Remaster»,
  «(feat. …)», «.mp3»…) en una o varias listas.
- Artistas parecidos: nombres que solo cambian en acentos, mayúsculas o signos
  («The Marías» / «The Marias»), o a una letra de distancia («Gorilaz» / «Gorillaz»).
  Los que valga la pena unificar van a tools/aliases.json.
"""
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def norm(text):
    text = unicodedata.normalize('NFD', str(text or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def clean_title(title):
    title = re.sub(r'\.mp3$', '', str(title or ''), flags=re.I)
    title = re.sub(r'\s*[([](feat|ft|with|prod)\b.*?[)\]]', '', title, flags=re.I)
    title = re.sub(r'\s+-\s+.*(remaster|version|edit|mix|live|mono|stereo).*$', '', title, flags=re.I)
    return norm(title)


def main_artist(artist):
    return norm(re.split(r',|&| x | feat\.? | ft\.? ', str(artist or ''), flags=re.I)[0])


def distance(a, b, limit=1):
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        row = [i]
        for j, cb in enumerate(b, 1):
            row.append(min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (ca != cb)))
        if min(row) > limit:
            return limit + 1
        prev = row
    return prev[-1]


def load_rows():
    rows = []
    for path in sorted((ROOT / 'musica').glob('*.json')):
        for row in json.loads(path.read_text(encoding='utf-8')):
            rows.append({**row, '_list': path.stem})
    return rows


def report(rows):
    songs = defaultdict(list)
    for row in rows:
        songs[(main_artist(row.get('artist')), clean_title(row.get('title')))].append(row)
    duplicates = [
        {'artist': group[0].get('artist'), 'title': group[0].get('title'),
         'copies': [{'list': r['_list'], 'id': r.get('id'), 'src': r.get('src')} for r in group]}
        for key, group in songs.items() if key[1] and len(group) > 1
    ]

    spellings = defaultdict(set)
    for row in rows:
        name = str(row.get('artist') or '').split(',')[0].strip()
        # Nombres sin letras latinas (cirílico, japonés…) se comparan tal cual
        key = norm(name) or name.lower()
        if name:
            spellings[key].add(name)
    same = [sorted(names) for names in spellings.values() if len(names) > 1]
    keys = sorted(k for k in spellings if len(k) >= 5)
    close = []
    for i, a in enumerate(keys):
        for b in keys[i + 1:i + 40]:
            if a[0] == b[0] and distance(a, b) == 1:
                close.append(sorted(spellings[a] | spellings[b]))
    return {'duplicates': duplicates, 'sameArtist': same, 'similarArtists': close}


def main():
    result = report(load_rows())
    if '--json' in sys.argv:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    print(f"Canciones repetidas: {len(result['duplicates'])}")
    for d in result['duplicates']:
        where = ', '.join(f"{c['list']}" for c in d['copies'])
        print(f"  · {d['artist']} — {d['title']}  [{where}]")
    print(f"\nArtistas escritos de varias formas: {len(result['sameArtist'])}")
    for names in result['sameArtist']:
        print('  · ' + '  /  '.join(names))
    print(f"\nArtistas casi iguales (revisar a mano): {len(result['similarArtists'])}")
    for names in result['similarArtists']:
        print('  · ' + '  /  '.join(names))


if __name__ == '__main__':
    main()
