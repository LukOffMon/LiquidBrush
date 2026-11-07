#!/usr/bin/env python3
"""Biblioteca de imágenes de Liquid Bullet: genera imagenes.json (lo lee imagenes.html).

Cada imagen del proyecto tiene un TIPO, que dice para qué (y solo para qué) se usa:

  portada-playlist  covers/cover-NN.jpg (+ -sm.jpg)          portada de una playlist de Liquid Bullet
  portada-propia    covers/propias/propia-NN.jpg (+ -sm.jpg)  portada que la persona elige para SUS playlists
  icono-cancion     covers/songs/song-NN.jpg (+ -sm.jpg)      icono que llevan las canciones
  fondo             wallpapers/NN.jpg                         fondo de pantalla de la app
  icono-fondo       wallpapers/icons/NN.jpg (+ -thumb.jpg)    botón para elegir el fondo
  avatar            avatars/avatar-NN.jpg (+ -sm.jpg)         foto de perfil de la cuenta
  icono-app         icon-*.png, apple-touch-icon.png, favicon.png, logo.svg
  compartir         og-image.jpg                              miniatura de los enlaces
  captura           screenshots/*.jpg                         capturas para la tienda/PWA

Para sumar una imagen nueva: guárdala en la carpeta de su tipo con el siguiente número libre
(p. ej. covers/cover-45.jpg y covers/cover-45-sm.jpg) y ejecuta este script. El «uso» se
calcula solo (qué playlist lleva cada portada, cuántas canciones cada icono…); las portadas de
playlist que aún no usa ninguna playlist quedan marcadas como reservadas («reserved») para la
próxima entrega de música (se asignan en FIXED_COVERS de build_catalog.py). Las notas
escritas a mano en imagenes.json («label» y «notes») se conservan.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'imagenes.json'
RESERVED_USAGE = 'Reservada: lista para una playlist nueva en una futura entrega de música'

TYPES = {
    'portada-playlist': {'name': 'Portadas de playlist', 'folder': 'covers/', 'size': '600 × 600 px + versión -sm de 320 px',
                         'use': 'Solo como portada de su playlist (oficial o automática). Nunca para otra cosa: ni decoración, ni avatares, ni collages.'},
    'portada-propia': {'name': 'Portadas para tus playlists', 'folder': 'covers/propias/', 'size': '600 × 600 px + versión -sm de 320 px',
                       'use': 'Solo para las playlists que crea cada persona: se eligen en Nueva playlist / Editar playlist → Portada. Nunca se asignan a las playlists de base (catalog.json) ni a las automáticas, ni se usan para otra cosa.'},
    'icono-cancion': {'name': 'Iconos de canción', 'folder': 'covers/songs/', 'size': '600 × 600 px + versión -sm de 320 px',
                      'use': 'Solo como icono de su canción: cada canción usa el suyo y se reparten por igual entre todas las canciones. Nunca para otra cosa.'},
    'fondo': {'name': 'Fondos de pantalla', 'folder': 'wallpapers/', 'size': 'vertical, ~1600 px de alto',
              'use': 'Fondo de la app (Ajustes → Fondo). Se puede reutilizar: collage de bienvenida de la cuenta, decoración.'},
    'icono-fondo': {'name': 'Iconos de fondo', 'folder': 'wallpapers/icons/', 'size': 'cuadrado + -thumb',
                    'use': 'Botón para cambiar de fondo y selector. Se puede reutilizar: icono de playlists propias, collage de bienvenida. No como avatar: eso es solo de las fotos de perfil.'},
    'avatar': {'name': 'Fotos de perfil', 'folder': 'avatars/', 'size': '512 × 512 px + versión -sm de 160 px',
               'use': 'Solo como foto de perfil de la cuenta, y solo existen en el selector de avatar (crear cuenta y Tu cuenta). Nunca para otra cosa: ni fondos, ni portadas, ni iconos, ni collages.'},
    'icono-app': {'name': 'Iconos de la app', 'folder': '/', 'size': '192, 512 y 180 px',
                  'use': 'Solo como icono de la app instalada, pestaña y logo.'},
    'compartir': {'name': 'Imagen para compartir', 'folder': '/', 'size': '1200 × 630 px',
                  'use': 'Solo como miniatura de los enlaces compartidos de la app.'},
    'captura': {'name': 'Capturas', 'folder': 'screenshots/', 'size': 'según dispositivo',
                'use': 'Solo para el manifest (instalar la app) y la página de review.'},
}


def wallpaper_names():
    text = (ROOT / 'app.js').read_text(encoding='utf-8')
    return dict(re.findall(r"\{ id: '(\d+)', name: '([^']+)'", text))


def propia_names():
    # Los nombres salen de PORTADAS_PROPIAS en app.js (lo que se ve en el selector)
    text = (ROOT / 'app.js').read_text(encoding='utf-8')
    block = text.split('const PORTADAS_PROPIAS = [', 1)[1].split('];', 1)[0] if 'const PORTADAS_PROPIAS = [' in text else ''
    return dict(re.findall(r"\{ id: '(\d+)', name: '([^']+)' \}", block))


def main():
    previous = {}
    if OUT.exists():
        previous = {img['file']: img for img in json.loads(OUT.read_text(encoding='utf-8')).get('images', [])}
    catalog = json.loads((ROOT / 'catalog.json').read_text(encoding='utf-8'))
    cover_use = {}
    for pl in catalog.get('playlists', []):
        src = (pl.get('cover') or {}).get('src')
        if src:
            cover_use.setdefault(src, []).append(pl['name'])
    cover_use.setdefault('covers/cover-27.jpg', []).append('Escuchadas hace poco (automática)')
    cover_use.setdefault('covers/cover-28.jpg', []).append('Tus más escuchadas (automática)')
    song_count = {}
    files = catalog.get('songCoverFiles', [])
    for index in catalog.get('songCovers', {}).values():
        if 0 <= index < len(files):
            song_count[files[index]] = song_count.get(files[index], 0) + 1
    walls = wallpaper_names()

    images = []

    def add(kind, file, small=None, usage='', label='', reserved=False):
        old = previous.get(file, {})
        entry = {
            'file': file, 'small': small, 'type': kind,
            'label': old.get('label') or label,
            'usage': usage,
            'notes': old.get('notes', ''),
        }
        if reserved:
            entry['reserved'] = True
        images.append(entry)

    for path in sorted((ROOT / 'covers').glob('cover-[0-9][0-9].jpg')):
        rel = f'covers/{path.name}'
        sm = f'covers/{path.stem}-sm.jpg'
        names = cover_use.get(rel, [])
        # Las que aún no tienen playlist quedan reservadas para la próxima entrega de música
        add('portada-playlist', rel, sm if (ROOT / sm).exists() else None,
            ', '.join(names) if names else RESERVED_USAGE, f'Portada {path.stem[-2:]}', reserved=not names)
    nombres_propia = propia_names()
    for path in sorted((ROOT / 'covers' / 'propias').glob('propia-[0-9][0-9].jpg')):
        rel = f'covers/propias/{path.name}'
        sm = f'covers/propias/{path.stem}-sm.jpg'
        add('portada-propia', rel, sm if (ROOT / sm).exists() else None,
            'Portada a elegir para tus playlists (nunca las de base)', nombres_propia.get(path.stem[-2:], f'Portada propia {path.stem[-2:]}'))
    for path in sorted((ROOT / 'covers' / 'songs').glob('song-[0-9][0-9].jpg')):
        rel = f'covers/songs/{path.name}'
        sm = f'covers/songs/{path.stem}-sm.jpg'
        add('icono-cancion', rel, sm if (ROOT / sm).exists() else None,
            f'{song_count.get(rel, 0)} canciones', f'Icono {path.stem[-2:]}')
    for path in sorted((ROOT / 'wallpapers').glob('[0-9][0-9].jpg')):
        add('fondo', f'wallpapers/{path.name}', None, 'Fondo de pantalla', walls.get(path.stem, f'Fondo {path.stem}'))
    for path in sorted((ROOT / 'wallpapers' / 'icons').glob('[0-9][0-9].jpg')):
        thumb = f'wallpapers/icons/{path.stem}-thumb.jpg'
        add('icono-fondo', f'wallpapers/icons/{path.name}', thumb if (ROOT / thumb).exists() else None,
            f'Botón del fondo {path.stem}', walls.get(path.stem, f'Icono {path.stem}'))
    nombres_avatar = ['Sol', 'Rostros', 'Querubín', 'Alien', 'Muñeca', 'Caballero', 'Máscara', 'Hechicera']
    for i, path in enumerate(sorted((ROOT / 'avatars').glob('avatar-[0-9][0-9].jpg'))):
        sm = f'avatars/{path.stem}-sm.jpg'
        add('avatar', f'avatars/{path.name}', sm if (ROOT / sm).exists() else None,
            f'Foto de perfil {path.stem[-2:]} (selector de avatar)', nombres_avatar[i] if i < len(nombres_avatar) else f'Avatar {path.stem[-2:]}')
    for name, label in [('icon-512.png', 'Icono 512'), ('icon-192.png', 'Icono 192'), ('icon-maskable-512.png', 'Icono adaptable (Android)'),
                        ('apple-touch-icon.png', 'Icono iPhone'), ('favicon.png', 'Favicon'), ('logo.svg', 'Logo')]:
        if (ROOT / name).exists():
            add('icono-app', name, None, 'Icono de la app', label)
    if (ROOT / 'og-image.jpg').exists():
        add('compartir', 'og-image.jpg', None, 'Miniatura de enlaces (Open Graph)', 'Imagen para compartir')
    for path in sorted((ROOT / 'screenshots').glob('*.jpg')):
        add('captura', f'screenshots/{path.name}', None, 'Manifest y review', path.stem.replace('-', ' ').capitalize())

    data = {'types': TYPES, 'images': images}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    counts = {}
    for img in images:
        counts[img['type']] = counts.get(img['type'], 0) + 1
    print(f'imagenes.json: {len(images)} imágenes', counts)
    reserved = [img['file'] for img in images if img.get('reserved')]
    if reserved:
        print(f'Portadas reservadas para futuras entregas de música: {len(reserved)} (' + ', '.join(Path(f).stem for f in reserved) + ')')


if __name__ == '__main__':
    main()
