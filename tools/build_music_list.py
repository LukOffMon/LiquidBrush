#!/usr/bin/env python3
"""Toda la música de Liquid Bullet en un TXT (musica-liquid.txt), con el máximo detalle.

Se ve y se descarga desde la Biblioteca de imágenes (imagenes.html → «Toda la música»).
Por cada canción: título, artista y con quién canta, género(s) (el principal primero), playlist
y su descripción, duración, versión (slowed, sped up, remix…), en qué versión de la app llegó,
su icono, el archivo MP3 y su carpeta, el enlace para compartir y su id. Al final, el resumen por
género, por playlist y por artista.

También escribe musica-liquid.json: el resumen corto que lee imagenes.html sin bajar el TXT entero.

Lo ejecuta tools/build_catalog.py cada vez que cambia la música; también se puede correr solo:
  python3 tools/build_music_list.py
"""
import datetime
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_catalog as bc  # noqa: E402

ROOT = bc.ROOT
OUT_TXT = ROOT / 'musica-liquid.txt'
OUT_JSON = ROOT / 'musica-liquid.json'
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

# Versiones especiales que se reconocen en el título
VERSIONES = [
    (r'super\s*slowed', 'Super slowed'), (r'slowed', 'Slowed'), (r'sped\s*up|speed\s*up', 'Sped up'),
    (r'nightcore', 'Nightcore'), (r'reverb', 'Con reverb'), (r'remix|\brmx\b', 'Remix'), (r'\bedit\b', 'Edit'),
    (r'\bmix\b', 'Mix'), (r'live|en vivo|ao vivo', 'En vivo'), (r'acoustic|ac[uú]stic', 'Acústica'),
    (r'remaster', 'Remasterizada'), (r'instrumental', 'Instrumental'), (r'demo\b', 'Demo'),
    (r'cover\b', 'Cover'), (r'version|versi[oó]n', 'Versión alternativa'), (r'radio\s*(edit|version|mix)', 'Radio edit'),
]


def fecha_es(d):
    return f'{d.day} de {MESES[d.month - 1]} de {d.year}'


def segundos(duracion):
    partes = [int(p) for p in re.findall(r'\d+', str(duracion or ''))]
    if not partes:
        return 0
    total = 0
    for p in partes:
        total = total * 60 + p
    return total


def horas(total):
    h, resto = divmod(total, 3600)
    return f'{h} h {resto // 60} min'


# Estas se reconocen en cualquier parte del título («ICH VERACHTE - SLOWED», «song sped up»)
EN_CUALQUIER_PARTE = {'Super slowed', 'Slowed', 'Sped up', 'Nightcore'}


def versiones_de(titulo):
    t = titulo.lower()
    # El resto, solo entre paréntesis o tras « - » («Video Killed the Radio Star» no es un radio edit)
    extra = ' '.join(re.findall(r'[\(\[]([^\)\]]*)[\)\]]', t) + t.split(' - ')[1:])
    vistas = []
    for patron, nombre in VERSIONES:
        donde = t if nombre in EN_CUALQUIER_PARTE else extra
        if re.search(patron, donde) and nombre not in vistas:
            if nombre == 'Slowed' and 'Super slowed' in vistas:
                continue
            vistas.append(nombre)
    return vistas


def con_quien(track):
    """Artistas acreditados además del principal, y los «feat.» del título."""
    artistas = [a.strip() for a in str(track['artist']).split(',') if a.strip()]
    extra = artistas[1:]
    m = re.search(r'[\(\[]\s*(?:feat\.?|ft\.?|featuring|con|with)\s+([^\)\]]+)[\)\]]', track['title'], re.I)
    if m:
        for nombre in re.split(r',|&| y | and ', m.group(1)):
            nombre = nombre.strip()
            if nombre and nombre.lower() not in {a.lower() for a in artistas + extra}:
                extra.append(nombre)
    return artistas[:1], extra


def cargar():
    """Canciones con su archivo MP3 (los JSON de musica/ tal cual)."""
    canciones = []
    for path in sorted((ROOT / 'musica').glob('*.json')):
        for row in json.loads(path.read_text(encoding='utf-8')):
            canciones.append({'id': f'{path.stem}:{row["id"]}', 'bucket': path.stem, 'title': row.get('title', ''),
                              'artist': row.get('artist', ''), 'duration': row.get('duration', ''), 'src': row.get('src', '')})
    return canciones


def main():
    catalogo = json.loads((ROOT / 'catalog.json').read_text(encoding='utf-8'))
    canciones = cargar()
    por_id = {c['id']: c for c in canciones}
    descripciones = {pid: desc for pid, _, desc, _ in bc.PLAYLISTS}
    playlist_de = {}
    for pl in catalogo['playlists']:
        for tid in pl['trackIds']:
            playlist_de[tid] = pl
    lista_generos = catalogo['generos']['lista']
    generos_de = {tid: [lista_generos[int(i)] for i in v.split('.')] for tid, v in catalogo['generos']['canciones'].items() if v}
    iconos = catalogo.get('songCoverFiles', [])
    icono_de = {tid: iconos[i] for tid, i in catalogo.get('songCovers', {}).items() if 0 <= i < len(iconos)}

    # En qué versión de la app llegó cada canción (novedades.json; antes de eso, «desde el principio»)
    novedades = json.loads((ROOT / 'novedades.json').read_text(encoding='utf-8')) if (ROOT / 'novedades.json').exists() else {}
    llegada = {}
    for release in novedades.get('releases', []):
        for s in release.get('songs', []):
            if isinstance(s, dict) and s.get('id'):
                llegada.setdefault(s['id'], f"{release['version']} ({release.get('date', '')})".replace(' ()', ''))
    for s in novedades.get('nuevaMusica', []):
        if isinstance(s, dict) and s.get('id'):
            llegada.setdefault(s['id'], 'próxima versión (aún sin publicar)')
    primera = min((r['version'] for r in novedades.get('releases', []) if r.get('songs')), key=lambda v: int(v[1:]), default='')

    # Las que se ven en la app: las de las playlists (las copias repetidas se ocultan)
    visibles = [por_id[tid] for pl in catalogo['playlists'] for tid in pl['trackIds'] if tid in por_id]
    vistos = set()
    unicas = []
    for c in visibles:
        if c['id'] not in vistos:
            vistos.add(c['id'])
            unicas.append(c)
    copias_de = Counter()
    original = {bc.song_key(c)[1]: c['id'] for c in unicas}
    for c in canciones:
        if c['id'] not in vistos and bc.song_key(c)[1] in original:
            copias_de[original[bc.song_key(c)[1]]] += 1
    ocultas = len(canciones) - len(unicas)

    clave = lambda c: (bc.norm(c['artist'].split(',')[0]) or c['artist'].lower(), bc.norm(c['title']) or c['title'].lower())
    unicas.sort(key=clave)

    total_seg = sum(segundos(c['duration']) for c in unicas)
    cuenta_genero = Counter(g for c in unicas for g in generos_de.get(c['id'], []))
    cuenta_principal = Counter(generos_de[c['id']][0] for c in unicas if generos_de.get(c['id']))
    cuenta_artista = Counter()
    nombre_artista = {}
    for c in unicas:
        principal, extra = con_quien(c)
        for a in principal + extra:
            k = bc.artist_key(a)
            cuenta_artista[k] += 1
            nombre_artista.setdefault(k, a)
    varios = sum(1 for c in unicas if len(generos_de.get(c['id'], [])) > 1)
    hoy = datetime.date.today()

    lineas = []
    w = lineas.append
    w('LIQUID BULLET · TODA LA MÚSICA')
    w('=' * 72)
    w(f'Actualizado: {fecha_es(hoy)}')
    w(f'Canciones: {len(unicas)} (más {ocultas} copias repetidas que la app oculta)')
    w(f'Artistas: {len(cuenta_artista)}')
    w(f'Duración total: {horas(total_seg)}')
    w(f'Géneros: {len(cuenta_genero)} · {varios} canciones son de más de un género')
    w(f'Playlists: {len(catalogo["playlists"])}')
    w(f'Web: {bc.SITE_URL}')
    w('')
    w('Cómo leer cada canción')
    w('-' * 72)
    w('Género(s): el primero es el principal. Si una canción es de varios géneros, salen todos')
    w('           y se indica cuántos son, p. ej. «3 géneros: Alternativo (principal), Metal, Rock».')
    w('Playlist:  la playlist de Liquid donde está (su ambiente, no su género).')
    w('Versión:   slowed, sped up, remix, en vivo… si el título lo indica.')
    w(f'Llegó en:  la versión de la app en que se sumó («desde el principio» = antes de {primera or "las novedades"}).')
    w('Copias:    otras subidas idénticas de la misma canción que la app oculta.')
    w('Ordenadas por artista (A-Z) y, dentro de cada artista, por título.')
    w('')
    w('')
    w('CANCIONES')
    w('=' * 72)
    artista_actual = None
    for n, c in enumerate(unicas, 1):
        principal, extra = con_quien(c)
        artista = principal[0] if principal else 'Sin artista'
        if bc.artist_key(artista) != artista_actual:
            artista_actual = bc.artist_key(artista)
            w('')
            w(f'■ {artista} · {cuenta_artista[artista_actual]} {"canción" if cuenta_artista[artista_actual] == 1 else "canciones"}')
            w('')
        gens = generos_de.get(c['id'], [])
        pl = playlist_de.get(c['id'])
        w(f'{n:04d}. {c["title"]}')
        w(f'      Artista: {artista}')
        if extra:
            w(f'      Con: {", ".join(extra)}')
        if len(gens) > 1:
            w(f'      Géneros ({len(gens)}): {gens[0]} (principal), {", ".join(gens[1:])}')
        elif gens:
            w(f'      Género: {gens[0]}')
        if pl:
            w(f'      Playlist: {pl["name"]} · {descripciones.get(pl["id"], pl.get("description", ""))}')
        w(f'      Duración: {c["duration"] or "desconocida"}')
        versiones = versiones_de(c['title'])
        if versiones:
            w(f'      Versión: {", ".join(versiones)}')
        w(f'      Llegó en: {llegada.get(c["id"], "desde el principio")}')
        if icono_de.get(c['id']):
            w(f'      Icono: {icono_de[c["id"]]}')
        if copias_de[c['id']]:
            w(f'      Copias ocultas: {copias_de[c["id"]]}')
        w(f'      Archivo: {c["src"]} (carpeta «{c["bucket"]}»)')
        w(f'      Enlace: {bc.SITE_URL}s/t-{bc.share_slug(c["id"])}.html')
        w(f'      ID: {c["id"]}')

    w('')
    w('')
    w('RESUMEN POR GÉNERO')
    w('=' * 72)
    w('Canciones de cada género (una canción de varios géneros cuenta en cada uno) · y en cuántas es el principal')
    for g, n in sorted(cuenta_genero.items(), key=lambda x: (-x[1], x[0])):
        w(f'{g:<28} {n:>5} canciones · principal en {cuenta_principal[g]}')
    w('')
    w('')
    w('RESUMEN POR PLAYLIST')
    w('=' * 72)
    for pl in catalogo['playlists']:
        tids = [t for t in pl['trackIds'] if t in por_id]
        seg = sum(segundos(por_id[t]['duration']) for t in tids)
        w(f'{pl["name"]} · {len(tids)} canciones · {horas(seg)}')
        w(f'    {descripciones.get(pl["id"], pl.get("description", ""))}')
    w('')
    w('')
    w('RESUMEN POR ARTISTA')
    w('=' * 72)
    w('Canciones de cada artista (también como invitado), de más a menos')
    for k, n in sorted(cuenta_artista.items(), key=lambda x: (-x[1], x[0])):
        w(f'{nombre_artista[k]} · {n}')
    w('')
    texto = '\n'.join(lineas) + '\n'
    OUT_TXT.write_text(texto, encoding='utf-8')

    resumen = {
        'archivo': OUT_TXT.name, 'actualizado': hoy.isoformat(), 'fecha': fecha_es(hoy),
        'canciones': len(unicas), 'copiasOcultas': ocultas, 'artistas': len(cuenta_artista),
        'duracion': horas(total_seg), 'generos': len(cuenta_genero), 'variosGeneros': varios,
        'playlists': len(catalogo['playlists']), 'bytes': len(texto.encode('utf-8')),
        'topGeneros': [[g, n] for g, n in cuenta_genero.most_common(12)],
    }
    OUT_JSON.write_text(json.dumps(resumen, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{OUT_TXT.name}: {len(unicas)} canciones, {len(cuenta_artista)} artistas, {resumen["bytes"] // 1024} KB')


if __name__ == '__main__':
    main()
