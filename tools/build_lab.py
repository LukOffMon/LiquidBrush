#!/usr/bin/env python3
"""Genera lab.html (Liquid Lab, el sitio aparte de Lab) a partir de index.html.

Liquid Lab usa el mismo app.js y styles.css que Liquid Bullet (mismo algoritmo, misma biblioteca,
mismas playlists guardadas en el navegador o en la cuenta), pero se abre como un sitio propio:
sin reproductor, sin pestañas y con su portada. Lo que se guarda o se manda a escuchar desde Lab
vuelve a Liquid Bullet (app.js: LAB_MODE y la «entrega» liquidbrush:lab-handoff).

  python3 tools/build_lab.py           # escribe lab.html
  python3 tools/build_lab.py --check   # falla si lab.html no está al día con index.html

bump_version.py lo ejecuta solo. No edites lab.html a mano: cambia index.html o este script.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
LAB = ROOT / 'lab.html'

SITE = 'https://lukoffmon.github.io/LiquidBrush/'
TITLE = 'Liquid Lab — el laboratorio de mezclas de Liquid Bullet'
DESCRIPTION = 'Liquid Lab: mezcla estilos, artistas y canciones y crea playlists a tu medida. Lo que guardes aparece en tu Liquid Bullet.'

HERO = """        <header class="lab-hero" aria-labelledby="labHeroTitle">
          <p class="lab-hero-eyebrow">Liquid Lab</p>
          <h1 id="labHeroTitle" class="lab-hero-title">Tu laboratorio de mezclas</h1>
          <p class="lab-hero-text">Combina estilos, artistas y canciones, y ajusta cuánto quieres descubrir. Lo que guardes aparece en tu Liquid Bullet como una playlist más, y «Escuchar» te lleva a Liquid con la mezcla sonando.</p>
        </header>
"""


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise SystemExit(f'build_lab.py: no se encontró exactamente una vez en index.html:\n{old}')
    return text.replace(old, new)


def build():
    html = INDEX.read_text(encoding='utf-8')
    html = replace_once(html, '<html lang="es" data-theme="chrome">', '<html lang="es" data-theme="chrome" data-mode="lab">')
    html = replace_once(html, '<title>Liquid Bullet</title>', f'<title>{TITLE}</title>')
    html = replace_once(html, '<meta name="description" content="Liquid Bullet — música que se derrite: tu reproductor web personal, surrealista y cromado.">',
                        f'<meta name="description" content="{DESCRIPTION}">')
    html = replace_once(html, '<meta property="og:title" content="Liquid Bullet">', '<meta property="og:title" content="Liquid Lab">')
    html = replace_once(html, '<meta property="og:description" content="Música que se derrite: tu reproductor web personal, surrealista y cromado.">',
                        f'<meta property="og:description" content="{DESCRIPTION}">')
    html = replace_once(html, f'<meta property="og:url" content="{SITE}">', f'<meta property="og:url" content="{SITE}lab.html">')
    html = replace_once(html, '<meta name="twitter:title" content="Liquid Bullet">', '<meta name="twitter:title" content="Liquid Lab">')
    html = replace_once(html, f'<link rel="canonical" href="{SITE}">', f'<link rel="canonical" href="{SITE}lab.html">')
    # Marca: «Liquid Lab», y el logo lleva de vuelta a Liquid Bullet
    html = replace_once(html, '<a class="brand" href="./" aria-label="Liquid Bullet, inicio">', '<a class="brand" href="./" aria-label="Volver a Liquid Bullet">')
    html = replace_once(html, '<span class="brand-name">Liquid<span>Bullet</span></span>', '<span class="brand-name">Liquid<span>Lab</span></span>')
    html = replace_once(html, '      <div class="topbar-actions">',
                        '      <div class="topbar-actions">\n      <a class="btn lab-back" href="./" aria-label="Volver a Liquid Bullet"><svg class="icon" aria-hidden="true"><use href="#i-back"></use></svg><span>Volver a Liquid</span></a>')
    html = replace_once(html, '        <div id="labPanel" class="lab" hidden></div>', HERO + '        <div id="labPanel" class="lab" hidden></div>')
    note = '<!-- Generado por tools/build_lab.py a partir de index.html: no lo edites a mano -->\n'
    return html.replace('<!DOCTYPE html>\n', '<!DOCTYPE html>\n' + note, 1)


def main():
    html = build()
    if '--check' in sys.argv:
        if not LAB.exists() or LAB.read_text(encoding='utf-8') != html:
            raise SystemExit('lab.html no está al día con index.html: ejecuta python3 tools/build_lab.py')
        print('· lab.html al día')
        return
    LAB.write_text(html, encoding='utf-8')
    print('· lab.html generado')


if __name__ == '__main__':
    main()
