#!/usr/bin/env python3
"""Genera catalog.json: género de cada canción y las playlists de base de LiquidBrush.

Lee las canciones de las mismas fuentes que la app (los dos proyectos de Supabase y
cloudflare-tracks.json), asigna un género por artista (o por la playlist de origen)
y arma las playlists por género y las mezclas. Ejecútalo cada vez que se sume música:

    python3 tools/build_catalog.py
"""
import json
import random
import re
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [
    ('', 'https://kvylexeicpvjrvhpizsz.supabase.co', 'sb_publishable__E4pzkc1jZe8u9UtpWglHg_Z9KFYPso'),
    ('extra:', 'https://pikoruycbgwjrxqxaajl.supabase.co', 'sb_publishable_lraxIbb_tQtXr7y-yAa15Q_OqWrDmUN'),
]
COVER_IMAGES = 15  # covers/cover-01.jpg … cover-15.jpg se reparten al azar
# Portadas elegidas a mano para una playlist concreta (covers/cover-16.jpg en adelante)
FIXED_COVERS = {
    'corazon-en-reparacion': 16,
    'rimas-del-barrio': 17,
    'vinilo-de-papa': 18,
    'atardecer-en-la-costa': 19,
}
ART_STYLES = ['orbits', 'stripes', 'waves', 'sun', 'rings', 'grid', 'bars', 'blobs', 'checker', 'dots', 'zigzag', 'eclipse']


def norm(text):
    text = unicodedata.normalize('NFD', str(text or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def load_tracks():
    tracks = []
    for prefix, url, key in SOURCES:
        req = urllib.request.Request(
            f'{url}/rest/v1/tracks?select=id,title,artist,album,duration&order=position.asc,id.asc',
            headers={'apikey': key, 'User-Agent': 'Mozilla/5.0'})
        for row in json.load(urllib.request.urlopen(req, timeout=30)):
            tracks.append({**row, 'id': f'{prefix}{row["id"]}'})
    for row in json.loads((ROOT / 'cloudflare-tracks.json').read_text()):
        tracks.append({k: row[k] for k in ('title', 'artist', 'album', 'duration')} | {'id': f'cloudflare:{row["id"]}'})
    return tracks


# ---------- Géneros ----------
GENRE_ARTISTS = {
    'Reggaetón clásico': ['nengo flow', 'de la ghetto', 'don omar', 'j alvarez', 'farruko', 'yandel', 'hector el father',
                          'zion', 'alex rose', 'sammy falsetto', 'jowell', 'daddy yankee', 'arcangel', 'wisin'],
    'Trap latino': ['yan block', 'omar courtz', 'de la rose', 'cris mj', 'bad bunny', 'myke towers', 'jay wheeler',
                    'bryant myers', 'saiko', 'pablo chill e', 'young cister', 'rauw alejandro', 'lil naay', 'pressure9x19',
                    'aleman', 'luigi 21 plus', 'slayter', 'roa', 'jon z', 'anuel'],
    'Rap en español': ['gera mx', 'adan cruz', 'charles ans', 'iqlover', 'rels b', 'cruzzi', 'cruz cafune', 'choclock',
                       'delaossa', 'ka b', 'flavio rodriguez', 'c tangana', 'trueno', 'anestesia', 'bb trickz'],
    'Hip hop': ['xxxtentacion'],
    'Kawaii metal & J-rock': ['babymetal', 'hanabie', 'atarashii gakko', 'ladybaby', 'broken by the scream',
                              'yousei teikoku', 'kaqriyoterror'],
    'K-pop': ['enhypen'],
    'Eurodance': ['robin s', 'nightcrawlers', 'moloko', 'fake blood', 'edward maya', 'kylie minogue', 'alice deejay', 'andronicus', 'michael gray', 'crystal waters', 'robert miles', 'bob sinclar', 'snap',
                  'modjo', 'la bouche', 'haddaway', 'ace of base', 'mr president', 'global deejays', 'technotronic',
                  'scatman', 'eiffel 65', 'daft punk', 'stardust', 'darude', 'stromae', 'bronski beat'],
    'Pop Y2K': ['gorillaz', 'pet shop boys', 'justin timberlake', 'nelly furtado', 'timbaland', 'lmfao', 'will i am', 'calvin harris', 'flo rida', 'black eyed peas',
                'capital cities', 'junior senior', 'madonna', 'yososmatt', 'yosoymatt', 'maroon 5', 'no doubt'],
    'Disco & funk': ['bee gees', 'earth wind fire', 'kool the gang', 'a taste of honey', 'patrice rushen', 'rick james',
                     'barry white', 'rod stewart', 'the rolling stones', 'player'],
    'Rock clásico': ['queen', 'led zeppelin', 'deep purple', 'the kinks', 'electric light orchestra', 'america',
                     'fleetwood mac', 'elton john', 'santana', 'lenny kravitz'],
    'Soul & soft': ['sade', 'grover washington', 'crowded house', 'the cardigans', 'men at work', 'spandau ballet',
                    'george michael', 'bob marley', 'daryl hall', '10cc', 'billy idol'],
    'Club latino': ['nusar3000', 'mj nebreda', 'lila sky', 'cherry chola', '1tbsp', 'soltera', 'nana nina', 'chzter',
                    'midfug', 'valgur', 'ralphie choo', 'nathy peluso', 'lizz', 'safety trance', 'perra inmunda',
                    'sajiva', 'grls', 'alex vs alex', 'simona', 'brava', 'alanis yuki', 'melodie', 'pieri', 'bovskey',
                    'kinara', 'kitty kawaii'],
    'Rock argentino': ['spinetta', 'pescado rabioso', 'invisible', 'almendra', 'seru giran', 'charly garcia',
                       'patricio rey', 'andres calamaro', 'illya kuryaki', 'virus', 'luca prodan', 'los gardelitos',
                       'viejas locas', 'gustavo pena'],
    'Post-hardcore & emo': ['pierce the veil', 'sleeping with sirens', 'flyleaf', 'title fight', 'superheaven'],
    'Shoegaze & grunge': ['nirvana', 'deftones', 'chevelle', 'wisp', 'narrow head', 'whirr', 'glare', 'team sleep',
                          'flyingfish', 'panchiko'],
}
TITLE_GENRES = [
    (r'rhythm is a dancer|heads will roll|cant get you out|sweet dreams', 'Eurodance'),
    (r'^play hard|^baby remastered', 'Pop Y2K'),
    (r'babymetal', 'Kawaii metal & J-rock'),
]
ALBUM_GENRES = {
    'DiscoBse': 'Neoperreo', 'YK 3': 'Neoperreo', '3kTHEATRE': 'Neoperreo', 'FlushDePorroTeAmoYei': 'Trap latino',
    'OyeComoVa': 'Rock clásico', 'Grunge-Def': 'Shoegaze & grunge', 'Alternativo Triste': 'Alternativo',
    'Metal Pesado': 'Metal', 'Indie Vibes': 'Indie',
    'Rock argentino': 'Rock argentino', 'Disco & house': 'Disco & funk',
    'Trip hop & dream pop': 'Trip hop & dream pop', 'City pop & jazz funk': 'City pop & jazz funk',
    'Bedroom pop': 'Bedroom pop', 'The Marías': 'Bedroom pop', 'Tame Impala': 'Psicodelia', 'Indie mix': 'Indie',
    'New wave 80s': 'New wave & synth pop', 'Lo-fi & rarezas': 'Lo-fi & joyas de internet', 'Indie argentino': 'Indie argentino',
}
# Algunas playlists de origen mandan sobre el artista (p. ej. Nirvana en Alternativo Triste)
ALBUM_FIRST = {'Alternativo Triste', 'Metal Pesado', 'Indie Vibes', 'Rock argentino', 'Trip hop & dream pop',
               'City pop & jazz funk', 'Bedroom pop', 'The Marías', 'Tame Impala', 'New wave 80s', 'Lo-fi & rarezas'}


def genre_of(track):
    if track['album'] in ALBUM_FIRST:
        return ALBUM_GENRES[track['album']]
    artist = f' {norm(track["artist"])} '
    for genre, names in GENRE_ARTISTS.items():
        if any(f' {name} ' in artist for name in names):
            return genre
    title = norm(track['title'])
    for pattern, genre in TITLE_GENRES:
        if re.search(pattern, title):
            return genre
    return ALBUM_GENRES.get(track['album'], 'Otros')


# ---------- Playlists ----------
SAD_ARTISTS = ['cigarettes after sex', 'radiohead', 'the smiths', 'tv girl', 'current joys', 'mac demarco', 'charles ans',
               'adan cruz', 'gera mx', 'joji', 'the marias', 'vacations', 'rels b', 'xxxtentacion', 'sade',
               'crowded house', 'no doubt', 'clairo', 'malcolm todd', 'mazzy star', 'portishead', 'lana del rey', 'jeff buckley', 'massive attack']
SAD_TITLES = r'\b(ya no siento nada|te quiero mucho|amor como estas|corazon|triste|cry|creep|miserable|alone|careless)\b'
DREAM_ARTISTS = ['tame impala', 'parcels', 'daft punk', 'robert miles', 'cigarettes after sex', 'pink floyd', 'whirr',
                 'wisp', 'narrow head', 'flyingfish', 'l imperatrice', 'justice', 'night tapes', 'deftones', 'modjo',
                 'stardust', 'sade', 'bo a', 'boa', 'cocteau twins', 'mazzy star', 'beach house', 'air', 'portishead',
                 'massive attack', 'masayoshi takanaka', 'tomoko aran', 'kid loco', 'gorillaz', 'empire of the sun',
                 'mild high club', 'cocteau twins']
SUNNY_ARTISTS = ['sports', 'almost monday', 'parcels', 'balu brigada', 'wallows', 'bob marley', 'santana', 'rels b',
                 'weezer', 'the cardigans', 'earth wind fire', 'kool the gang', 'foster the people', 'good neighbours',
                 'c tangana', 'nelly furtado', 'jamiroquai', 'boney m', 'masayoshi takanaka', 'bruno mars', 'anri',
                 'childish gambino', 'the marias', 'clairo', 'mac demarco', 'paul cherry', 'dominic fike']
EXCLUDE_TITLES = r'reaccion|subscribe to the channel'


def seconds(duration):
    try:
        parts = [int(p) for p in str(duration).split(':')]
    except ValueError:
        return 0
    total = 0
    for part in parts:
        total = total * 60 + part
    return total


def has_artist(track, names):
    artist = f' {norm(track["artist"])} '
    return any(f' {name} ' in artist for name in names)


def interleave(groups, limit, rng):
    """Mezcla por turnos entre grupos (géneros) para que la lista no se agrupe."""
    pools = [rng.sample(g, len(g)) for g in groups if g]
    out = []
    while pools and len(out) < limit:
        for pool in list(pools):
            if pool:
                out.append(pool.pop())
            if not pool:
                pools.remove(pool)
            if len(out) >= limit:
                break
    return out


def main():
    tracks = load_tracks()
    genres = {t['id']: genre_of(t) for t in tracks}

    # Una sola copia por canción (las playlists de origen repiten temas)
    seen, unique = set(), []
    for t in tracks:
        # Títulos en japonés u otros alfabetos: se comparan tal cual (norm los dejaría vacíos)
        key = norm(re.sub(r'\(.*?\)|\[.*?\]', '', t['title'])) or t['title'].strip().lower()
        if not key or key in seen or re.search(EXCLUDE_TITLES, norm(t['title'])):
            continue
        seen.add(key)
        unique.append(t)

    by_genre = {}
    for t in unique:
        by_genre.setdefault(genres[t['id']], []).append(t)
    g = lambda *names: [t for name in names for t in by_genre.get(name, [])]
    rng = random.Random(2026)
    sec = lambda t: seconds(t['duration'])

    neo = g('Neoperreo')
    half = len(neo) // 2
    playlists = [
        ('perreo-subterraneo', 'Perreo Subterráneo', 'Neoperreo mexa y dembow del under: DENNALAPORRI, Doony Graff, EZYA, Yeyo y compañía. Volumen 1.', neo[:half]),
        ('bellakeo-digital', 'Bellakeo Digital', 'La otra mitad del neoperreo: beats sucios, voces con autotune y perreo hasta el suelo. Volumen 2.', neo[half:]),
        ('club-cibernetico', 'Club Cibernético', 'Club latino experimental: nusar3000, MJ Nebreda, Lila Sky, Cherry Chola y el sonido de la pista del futuro.', g('Club latino')),
        ('reggaeton-de-oro', 'Reggaetón de Oro', 'Los clásicos del reggaetón que no envejecen: Ñengo Flow, Don Omar, Farruko, Zion, De La Ghetto.', g('Reggaetón clásico')),
        ('trap-lunar', 'Trap Lunar', 'Trap latino para la madrugada: Yan Block, Omar Courtz, Myke Towers, Bryant Myers y más.', g('Trap latino')),
        ('rimas-del-barrio', 'Rimas del Barrio', 'Rap en español con flow y letras: Cruzzi, Rels B, Charles Ans, C. Tangana, Trueno.', g('Rap en español', 'Hip hop')),
        ('tokyo-headbang', 'Tokyo Headbang', 'Kawaii metal y rock japonés: BABYMETAL, Hanabie, ATARASHII GAKKO! y un toque de K-pop.', g('Kawaii metal & J-rock', 'K-pop')),
        ('eurodance-eterno', 'Eurodance Eterno', 'Los himnos de pista de los 90 y 2000: Haddaway, Eiffel 65, Daft Punk, Robert Miles, Darude.', g('Eurodance')),
        ('fiesta-y2k', 'Fiesta Y2K', 'Pop fiestero de los 2000: LMFAO, Nelly Furtado, Timbaland, Black Eyed Peas, Calvin Harris.', g('Pop Y2K')),
        ('bola-de-espejos', 'Bola de Espejos', 'Disco, funk y groove para mover los hombros: Bee Gees, Michael Jackson, Jamiroquai, CHIC, Bruno Mars.', g('Disco & funk')),
        ('rock-nacional-eterno', 'Rock Nacional Eterno', 'Lo mejor del rock argentino: Spinetta, Pescado Rabioso, Serú Girán, Charly García, los Redondos y Calamaro.', g('Rock argentino')),
        ('vinilo-de-papa', 'Vinilo de Papá', 'Rock clásico de colección: Queen, Led Zeppelin, Santana, Fleetwood Mac, Deep Purple.', g('Rock clásico')),
        ('seda-y-saxofon', 'Seda y Saxofón', 'Soul, soft rock y baladas elegantes: Sade, George Michael, Spandau Ballet, Bob Marley.', g('Soul & soft')),
        ('grunge-def', 'Grunge-Def', 'Grunge, shoegaze y nu metal: Nirvana, Deftones, Chevelle, Whirr, Narrow Head.', g('Shoegaze & grunge')),
        ('gritos-en-el-diario', 'Gritos en el Diario', 'Post-hardcore y emo para cantar a todo pulmón: Pierce The Veil, Sleeping With Sirens, Title Fight.', g('Post-hardcore & emo')),
        ('lluvia-en-la-ventana', 'Lluvia en la Ventana', 'Alternativo melancólico: Radiohead, Cigarettes After Sex, The Smiths, TV Girl, The Cure.', g('Alternativo')),
        ('martillo-sonico', 'Martillo Sónico', 'Metal sin piedad: Gojira, Mastodon, Slipknot, Megadeth, Death, Meshuggah.', g('Metal')),
        ('humo-y-terciopelo', 'Humo y Terciopelo', 'Trip hop y dream pop: Portishead, Massive Attack, Cocteau Twins, Mazzy Star y Sade.', g('Trip hop & dream pop')),
        ('tokio-1984', 'Tokio 1984', 'City pop japonés y jazz funk: Masayoshi Takanaka, Tomoko Aran, Anri, Kingo Hamada y Shakatak.', g('City pop & jazz funk')),
        ('universo-marias', 'Universo Marías', 'Todo The Marías en un solo lugar, con sus colaboraciones con Bad Bunny, Cuco, Eyedress y más.',
         [t for t in unique if has_artist(t, ['the marias'])]),
        ('habitacion-rosa', 'Habitación Rosa', 'Bedroom pop para soñar despierto: PinkPantheress, Clairo, Malcolm Todd, Grimes, beabadoobee.', g('Bedroom pop')),
        ('corriente-impala', 'Corriente Impala', 'Kevin Parker en estado puro: Tame Impala y sus colaboraciones con Justice, Gorillaz, Thundercat y ZHU.',
         [t for t in unique if has_artist(t, ['tame impala']) or 'tame impala' in norm(t['title'])]),
        ('neon-1984', 'Neón 1984', 'New wave y synth pop de los 80: Depeche Mode, New Order, Duran Duran, Tears For Fears, Billy Idol.', g('New wave & synth pop')),
        ('cassette-perdido', 'Cassette Perdido', 'Lo-fi, soul raro y joyas escondidas de internet: Mild High Club, Mac DeMarco, Paul Cherry y rarezas sin nombre.', g('Lo-fi & joyas de internet')),
        ('indie-argento', 'Indie Argento', 'La nueva escena argentina: Cisne Elocuente, Quemarlo Todo Por Error, Bandalos Chinos y joyas del under.', g('Indie argentino')),
        ('verano-indie', 'Verano Indie', 'Indie pop soleado: Balu Brigada, Tame Impala, Sports, almost monday, Parcels.', g('Indie')),
        # ---------- Mezclas ----------
        ('manejando-3am', 'Manejando a las 3 AM', 'Mezcla nocturna para la carretera vacía: trap, alternativo, indie, shoegaze y rap suave.',
         interleave([g('Trap latino'), g('Alternativo'), g('Indie'), g('Shoegaze & grunge'), g('Rap en español'), g('City pop & jazz funk')], 45, rng)),
        ('modo-bestia', 'Modo Bestia', 'Para el gym o para romper cosas: metal, neoperreo duro, trap y eurodance a todo volumen.',
         interleave([g('Metal'), g('Neoperreo'), g('Trap latino'), g('Eurodance'), g('Kawaii metal & J-rock')], 50, rng)),
        ('corazon-en-reparacion', 'Corazón en Reparación', 'Canciones tristes de todos los géneros, del rap al shoegaze, para sanar despacio.',
         interleave([[t for t in unique if has_artist(t, SAD_ARTISTS) or re.search(SAD_TITLES, norm(t['title']))]], 45, rng)),
        ('fiesta-en-la-azotea', 'Fiesta en la Azotea', 'Perreo, reggaetón clásico, eurodance, disco y pop Y2K: la fiesta completa sin cambiar de lista.',
         interleave([g('Neoperreo'), g('Reggaetón clásico'), g('Eurodance'), g('Pop Y2K'), g('Disco & funk'), g('Club latino')], 60, rng)),
        ('domingo-con-resaca', 'Domingo con Resaca', 'Bajito y sin prisas: soul, indie, alternativo y rap tranquilo para el día después.',
         interleave([g('Soul & soft'), g('Indie'), g('Alternativo'), g('Trip hop & dream pop'), [t for t in g('Rap en español') if has_artist(t, ['rels b', 'charles ans', 'adan cruz'])]], 40, rng)),
        ('viaje-astral', 'Viaje Astral', 'Psicodelia, dream pop y electrónica flotante: Tame Impala, Parcels, Daft Punk, Robert Miles, shoegaze.',
         interleave([[t for t in unique if has_artist(t, DREAM_ARTISTS) and sec(t) < 1200]], 40, rng)),
        ('atardecer-en-la-costa', 'Atardecer en la Costa', 'Sol, arena y buena onda: indie soleado, clásicos, Santana, Bob Marley y algo de rap suave.',
         interleave([[t for t in unique if has_artist(t, SUNNY_ARTISTS)]], 40, rng)),
        ('caos-bonito', 'Caos Bonito', 'Un género distinto en cada canción: del metal al disco y del perreo al shoegaze. Para valientes.',
         interleave([v for k, v in sorted(by_genre.items())], 60, rng)),
        ('cafe-a-medianoche', 'Café a Medianoche', 'Trip hop, city pop, soul y jazz para la madrugada tranquila, con una taza en la mano.',
         interleave([g('Trip hop & dream pop'), g('City pop & jazz funk'), g('Soul & soft')], 40, rng)),
        ('ruleta-rusa', 'Ruleta Rusa', 'Una selección al azar de toda la biblioteca. Dale play sin mirar.',
         rng.sample(unique, min(50, len(unique)))),
        ('joyitas-express', 'Joyitas Express', 'Puras canciones de menos de 2:30. Ideal para cuando hay poco tiempo.',
         interleave([[t for t in unique if 0 < sec(t) <= 150]], 50, rng)),
        ('epicas-6-minutos', 'Épicas de +6 Minutos', 'Canciones largas para perderse: solos, viajes y finales eternos.',
         sorted([t for t in unique if 360 <= sec(t) < 1200], key=sec, reverse=True)[:40]),
    ]

    order = [i for i, p in enumerate(playlists) if p[0] not in FIXED_COVERS]
    rng.shuffle(order)
    image_slots = set(order[:COVER_IMAGES])
    images = rng.sample(range(1, COVER_IMAGES + 1), COVER_IMAGES)
    art_colors = ['#ff7ad9', '#7ef9ff', '#ffe27a', '#7a5cff', '#ff5f6d', '#3ddc97', '#ff9f43', '#c5cddb', '#9b5cff', '#00e5ff', '#f4a261', '#e9c46a']
    out, art_i = [], 0
    for i, (pid, name, description, items) in enumerate(playlists):
        if not items:
            continue
        if pid in FIXED_COVERS:
            cover = {'type': 'image', 'src': f'covers/cover-{FIXED_COVERS[pid]:02d}.jpg'}
        elif i in image_slots:
            cover = {'type': 'image', 'src': f'covers/cover-{images.pop():02d}.jpg'}
        else:
            cover = {'type': 'art', 'style': ART_STYLES[art_i % len(ART_STYLES)], 'color': art_colors[art_i % len(art_colors)]}
            art_i += 1
        out.append({'id': pid, 'name': name, 'description': description, 'cover': cover, 'trackIds': [t['id'] for t in items]})

    # Copias borradas del bucket por ser idénticas a otra: la app redirige favoritas y playlists propias
    aliases_file = ROOT / 'tools' / 'aliases.json'
    aliases = json.loads(aliases_file.read_text()) if aliases_file.exists() else {}
    catalog = {'version': 1, 'genres': genres, 'playlists': out, 'aliases': aliases}
    (ROOT / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=1))
    print(f'{len(tracks)} canciones, {len(unique)} únicas, {len(out)} playlists')
    for p in out:
        print(f"  {len(p['trackIds']):4d}  {p['name']}  [{p['cover']['type']}]")
    counts = {}
    for gname in genres.values():
        counts[gname] = counts.get(gname, 0) + 1
    print(sorted(counts.items(), key=lambda kv: -kv[1]))


if __name__ == '__main__':
    main()
