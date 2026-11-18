#!/usr/bin/env python3
"""Miniaturas de 160 px (-xs.jpg) de cada portada local, para gastar menos memoria.

  python3 tools/build_thumbs.py

Una portada de 320 px ocupa ~400 KB de RAM ya decodificada, aunque se vea a 40 px; la de 160 px,
~100 KB. La app (fitSrc en app.js) elige -xs, -sm o la grande según el tamaño en pantalla.
Recorre covers/** y crea X-xs.jpg junto a cada X-sm.jpg que aún no la tenga. Requiere Pillow.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SIZE = 160


def main():
    made = 0
    for small in sorted((ROOT / 'covers').rglob('*-sm.jpg')):
        target = small.with_name(small.name[:-len('-sm.jpg')] + '-xs.jpg')
        if target.exists() and target.stat().st_mtime >= small.stat().st_mtime:
            continue
        with Image.open(small) as im:
            im = im.convert('RGB')
            im.thumbnail((SIZE, SIZE), Image.LANCZOS)
            im.save(target, 'JPEG', quality=74, optimize=True, progressive=False)
        made += 1
    print(f'· {made} miniaturas -xs creadas')


if __name__ == '__main__':
    main()
