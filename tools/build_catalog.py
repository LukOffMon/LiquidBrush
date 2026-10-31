#!/usr/bin/env python3
"""Genera catalog.json: las playlists de base de Liquid Bullet y el estilo de cada canción.

Lee las canciones de las mismas listas que la app (musica/*.json, una por bucket de R2) y reparte
toda la Biblioteca en las playlists de PLAYLISTS: cada canción va a exactamente una, según su
artista (o el primero de los artistas acreditados que esté en la lista). Ejecútalo cada vez que se
sume música:

    python3 tools/build_catalog.py

Si aparece un artista nuevo que no está en ninguna playlist, la canción va a DEFAULT_PLAYLIST y el
script lo avisa para que se añada donde corresponda.
"""
import json
import random
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COVER_IMAGES = 15  # covers/cover-01.jpg … cover-15.jpg se reparten al azar
# Portadas elegidas a mano para una playlist concreta (covers/cover-16.jpg … cover-19.jpg)
FIXED_COVERS = {}
ART_STYLES = ['orbits', 'stripes', 'waves', 'sun', 'rings', 'grid', 'bars', 'blobs', 'checker', 'dots', 'zigzag', 'eclipse']
EXCLUDE_TITLES = r'reaccion|subscribe to the channel'


def norm(text):
    text = unicodedata.normalize('NFD', str(text or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def load_tracks():
    tracks = []
    for path in sorted((ROOT / 'musica').glob('*.json')):
        for row in json.loads(path.read_text(encoding='utf-8')):
            tracks.append({k: row.get(k, '') for k in ('title', 'artist', 'album', 'duration')} | {'id': f'{path.stem}:{row["id"]}'})
    return tracks


# ---------- Playlists ----------
# (id, nombre de 2 palabras como máximo, descripción, artistas). El orden es el de la app.
PLAYLISTS = [
    ('cuarto-pastel', 'Cuarto Pastel', 'Bedroom pop, R&B suave y pop alternativo: The Marías, PinkPantheress, Clairo, Steve Lacy y Malcolm Todd.', [
        'The Marías', 'PinkPantheress', 'Malcolm Todd', 'WILLOW', 'Clairo', 'Imogen Heap', 'TV Girl', 'Kali Uchis',
        'Grimes', 'Gwen Stefani', 'Milky', 'Estelle', 'Justin Timberlake', 'Steve Lacy', 'Matt Martians', 'The Cardigans',
        'N.E.R.D', 'Tyler', 'Chappell Roan', 'beabadoobee', 'Selena Gomez', 'Tainy', 'Cuco', 'Eyedress', 'benny blanco',
        'Crystal Castles', 'Flight Facilities', 'Childish Gambino', 'Daniel Caesar', 'JVKE', 'Dana and Alden',
        'Ravyn Lenae', 'Frank Ocean', 'The Weeknd', 'Melanie Martinez', 'Doja Cat', 'Rihanna', 'Ariana Grande',
        'Demi Lovato', 'Billie Eilish', 'girl in red', 'JAWNY', 'Anna of the North', 'Artemas', 'Lily Allen',
        'Suki Waterhouse', 'Kaash Paige', 'Nelly Furtado', 'The Kid LAROI', 'Cafuné', 'SZA', 'PARTYNEXTDOOR', 'Joji',
        'Labrinth', 'Montell Fish', 'Shakira', 'ZAYN', 'Chris Brown', 'Cassie', 'Amaarae', 'd4vd']),
    ('acido-lento', 'Ácido Lento', 'Psicodelia e indie que flota: Tame Impala, Inner Wave, Mild High Club, Crumb, The Strokes y Gorillaz.', [
        'Tame Impala', 'Gorillaz', 'Justice', 'Theophilus London', 'ZHU', 'The Strokes', 'Chris Rainbow',
        'Ax and the Hatchetmen', 'Coldplay', 'Sports', 'Cannons', 'Hotel Ugly', 'F3miii', 'Empire Of The Sun', 'Mareux',
        'Vacations', 'Foster The People', 'Inner Wave', 'Mild High Club', 'Jakob', 'Billy Uomo', 'Hector Gachan',
        'Luna Luna', 'Mark Whalen', 'Michael Seyer', "Her's", 'No Vacation', 'Divino Niño', 'Crumb', 'The Symposium',
        'Mellow Fellow', 'Banes World', 'Kowloon', 'The Buttertones', 'BOYO', 'Air', 'The Garden', 'Jean Dawson',
        'Bandalos Chinos', 'Julius Popper', 'TEMPOREX', 'Dr. Dog', 'The Drums', 'Mother Mother', 'Cults', 'Dayglow',
        'Joy Again', 'Beach Weather', 'Yot Club', 'Dominic Fike']),
    ('lluvia-lenta', 'Lluvia Lenta', 'Melancolía de guitarra y niebla: Mac DeMarco, Radiohead, The Smiths, Jeff Buckley y Cigarettes After Sex.', [
        'Mac DeMarco', 'Jeff Buckley', 'The Smiths', 'The Cranberries', 'Suicide', 'Current Joys', 'Feist', 'The Sundays',
        'Beach House', 'Cigarettes After Sex', 'Slowdive', 'Strawberry Guy', 'Cocteau Twins', 'Arctic Monkeys', 'Weezer',
        'Portishead', 'Radiohead', 'Faye Webster', 'Lykke Li', 'John + Jane Q. Public', 'Twenty One Pilots',
        'Chase Atlantic', 'The Neighbourhood', 'Lana Del Rey', 'Mitski', 'Men I Trust', 'Matt Maltese', 'Pedro Guerra',
        'bôa', 'Frankie Cosmos', 'Liana Flores', 'Ricky Montgomery']),
    ('neon-eterno', 'Neón Eterno', 'Synth pop de los 80, eurodance de los 90 y pista de los 2000: Depeche Mode, Haddaway, Daft Punk y Black Eyed Peas.', [
        'Depeche Mode', 'Bronski Beat', 'Men At Work', 'Soft Cell', 'Chris Isaak', 'Blondie', 'Eurythmics',
        'Laura Branigan', 'R.E.M.', 'A Flock Of Seagulls', 'The Human League', 'Billy Idol', 'Daryl Hall & John Oates',
        'Simple Minds', 'Real Life', 'Michael Sembello', 'The Smashing Pumpkins', 'The Verve', 'Tears For Fears',
        'The Cars', 'New Order', 'Joy Division', 'Duran Duran', 'When In Rome', 'Twin Tribes', 'The Cure', 'The Romantics',
        'Orchestral Manoeuvres In The Dark', 'The Police', 'Blur', 'Spandau Ballet', 'Alice Deejay', 'Andronicus',
        'Michael Gray', 'Crystal Waters', 'Robert Miles', 'Bob Sinclar', 'Modjo', 'La Bouche', 'Haddaway', 'Ace of Base',
        'Mr. President', 'Global Deejays', 'Technotronic', 'Scatman John', 'Timbaland', 'David Guetta', 'Kylie Minogue',
        'Madonna', 'Eiffel 65', 'Stardust', 'Darude', 'Stromae', 'Junior Senior', 'will.i.am', 'Flo Rida',
        'Black Eyed Peas', 'YoSoyMatt', 'LMFAO', 'SNAP!', 'Culture Beat', 'Calvin Harris', 'Daft Punk', 'Gesaffelstein',
        'M83', 'Yeah Yeah Yeahs', 'Aaron Smith', 'Olivia Newton-John', 'Emmanuel', 'Gloria Estefan', 'The Rah Band']),
    ('brillo-disco', 'Brillo Disco', 'Disco, funk y soul para la pista: Michael Jackson, Bee Gees, Earth, Wind & Fire, Prince y Stevie Wonder.', [
        'Michael Jackson', 'Paul McCartney', 'Bee Gees', 'Barry White', 'Earth', 'Kool & The Gang', 'Patrice Rushen',
        'A Taste Of Honey', 'KC & The Sunshine Band', 'Rick James', 'Bobby Caldwell', 'George Michael', 'Grover Washington',
        'Rod Stewart', 'Player', 'Bob Marley & The Wailers', 'Jamiroquai', 'Baccara', 'Tavares', 'Gloria Gaynor', 'ABBA',
        'Andy Gibb', 'Diana Ross', 'Stevie Wonder', 'Prince', 'Marvin Gaye']),
    ('perreo-nocturno', 'Perreo Nocturno', 'Perreo, reggaetón, trap, rap y cumbia: DENNA LA PORRI, Daddy Yankee, Cruzzi, Duki, Drake y Kumbia Kings.', [
        'Cruzzi', 'La Obsesion', 'Jose Alatorre', 'DENNA LA PORRI', 'Doony Graff', 'Daddy Yankee', 'Yeyo', 'Charles Ans',
        'Arcángel', 'Arcangel', 'Sayuri & Sopholov', 'Don Omar', 'Milo j', 'Novato El Flow', 'La Vendicion',
        'Wisin & Yandel', 'Yandel', 'Plan B', 'J Alvarez', 'Yan Block', 'Jon Z', 'Trap Capos', 'Boy Wonder CF', 'Nana Nina',
        'Luigi 21 Plus', 'La Mafia del Amor', 'Ka-b', 'Lil Naay', 'JAYSEE', 'hennessyyy', 'Yng Lvcas', 'Cachirula',
        'Veronica', 'Nasty Vato', 'Kinto Piso', 'La Zanta Xit', 'TBX', 'Alanis Yuki', 'Jowell & Randy', 'Jessvel Peyret',
        'xosa', 'LoveUikari', 'nusar3000', 'Ya Ice Dilan', 'Reykon', 'Tony Dize', 'Angel Y Khriz', 'Héctor "El Father"',
        'Randy Nota Loca', 'Ivy Queen', 'Yaga & Mackie', 'Baby Rasta y Gringo', 'Sammy & Falsetto', 'Ñengo Flow',
        'Nengo Flow', 'Maluma', 'Delaossa', 'Choclock', 'Flavio Rodriguez', 'Slayter', 'ROA', 'Pablo Chill-E',
        'Bryant Myers', 'J Abdiel', 'Gera MX', 'El Bogueto', 'Lil Bru', 'Mike', 'Kauxx', 'MC Sam', 'Macaia', 'Aln MC',
        'Je Tupinikin', 'DJ Cozy', 'VULGO', 'Rayo & Toby', 'Gonzalo Genek', 'Omar Courtz', 'Farruko', 'Bad Bunny',
        'Rauw Alejandro', 'Rels B', 'C. Tangana', 'Trueno', 'Cris MJ', 'Aleman', 'Myke Towers', 'Jay Wheeler', 'Zion',
        'Young Cister', 'SAIKO', 'Pressure 9X19', 'Adan Cruz', 'Anestesia', 'Bb trickz', 'lila sky', 'Chzter',
        'Cherry Chola', '1tbsp', 'MJ Nebreda', 'Sajiva', 'Midfug', 'Tokischa', 'FloyyMenor', 'La Zowi', 'Alex Rose',
        'Ruzzo Doblezz', 'Wk', 'Mime 871', 'Simpson Ahuevo', 'Mike Lamadrid', '3BallMTY', 'Drake', 'Kendrick Lamar',
        'Travis Scott', 'Kanye West', 'XXXTENTACION', 'G-Eazy', 'French Montana', 'Nafeesisboujee', 'Duki', 'YSY A',
        'CA7RIEL & Paco Amoroso', 'Franco "El Gorilla"', 'DJ Luian', 'Alemán', 'Alex Gargolas', 'C.R.O', 'Maria Becerra',
        'Nicki Nicole', 'Shamanes Crew', 'DJ ROOTS', 'Tramposos', 'Bhavi', 'Foudeqush', 'Cortex', 'LIT killah', 'Bardero$',
        'ROSALÍA', 'KAROL G', 'Felp 22', 'AQUIHAYAQUIHAY', 'LATIN MAFIA', 'Los Eclipses', 'Delinquent', 'ShyBully',
        'Emilia', 'Juanpa Gordoa', 'A.B. Quintanilla III', 'A.B. Quintanilla III Y Los Kumbia Kings', 'Kumbia Kings',
        'Cruz Martinez presenta Los Super Reyes', 'Impacto Mc', 'Calo', 'Millonario & W. Corona', 'El Pelón del Mikrophone',
        'América Sierra', 'Los Telez', 'Xandy Almeida', 'Canserbero', 'Micro TDH', 'Metro Boomin', 'A AP Ferg',
        'Mac Miller']),
    ('trueno-clasico', 'Trueno Clásico', 'Rock de colección y metal: Deep Purple, AC/DC, Led Zeppelin, Queen, Metallica y Pink Floyd.', [
        'Santana', 'Queen', 'Elton John', 'America', 'Fleetwood Mac', 'Pink Floyd', 'Maroon 5', 'Crowded House',
        'Deep Purple', 'Led Zeppelin', 'No Doubt', 'The Kinks', 'Electric Light Orchestra', 'The Rolling Stones',
        'Lenny Kravitz', 'AC/DC', 'Black Sabbath', 'Eagles', 'Joe Walsh', 'Green Day', 'Audioslave', 'The Doors', 'Cream',
        'Pantera', 'KISS', 'Derek & The Dominos', 'Metallica', 'Linkin Park', 'Van Halen', "Guns N' Roses", 'David Bowie',
        'Foghat', 'Red Hot Chili Peppers', 'Nirvana', 'Yes', 'Mountain', 'The Dirty Mac', 'Iron Maiden', 'Megadeth',
        'George Thorogood & The Destroyers', 'UFO', 'Blue Öyster Cult', 'Charly García', 'Almendra', 'Serú Girán',
        'Seru Giran', 'Pescado Rabioso', 'Gustavo Cerati', 'Soda Stereo', 'Andrés Calamaro', 'Los Abuelos De La Nada',
        'Los Pericos', 'Los Cafres', 'Los Retros', 'Pierce The Veil', 'Sleeping With Sirens', 'Whitesnake']),
    ('humo-dorado', 'Humo Dorado', 'Jazz, fusión, crooners y oldies: Frank Sinatra, Julie London, Chet Baker, Thundercat, Tom Jones y Sade.', [
        'Frank Sinatra', 'Frank Sark', 'Antônio Carlos Jobim', 'Catherine Russell', 'Al Bowlly', 'Stan Getz',
        'Julie London', 'Tommy Dorsey', 'Chet Baker', 'Dean Martin', 'Henry Mancini', 'Etta James', 'Nat King Cole Trio',
        'Sarah Vaughan', 'Irene Kral', 'Ella Fitzgerald', "Anita O'Day", 'Billie Holiday', 'Ava Gardner',
        'Ernestine Anderson', 'Etta Jones', 'The Mills Brothers', 'Ray Charles', 'John Coltrane Quartet', 'John Coltrane',
        'Jack Jones', 'Jeri Southern', 'Lester Young', 'Kay Starr', 'Dakota Staton', 'Lorez Alexandria', 'Doris Day',
        'Peggy Lee', 'Wayne Newton', 'Sade', 'Laufey', 'Celeste', 'Olivia Dean', 'Amy Winehouse', 'Ebony Loren',
        'Durand Jones & The Indications', 'The Dave Brubeck Quartet', 'Martial Solal', 'Tom Jones', 'Ricky Nelson',
        'The Mamas & The Papas', 'The Turtles', 'Lesley Gore', 'Dusty Springfield', 'Engelbert Humperdinck',
        'Jerry Lee Lewis', 'Brenda Lee', 'Carpenters', "Gilbert O'Sullivan", 'The Supremes', 'Shocking Blue',
        'Dion & The Belmonts', 'Roy Orbison', 'Lou Rawls', 'Four Tops', 'The Platters', 'The Beach Boys', 'Dionne Warwick',
        'Chuck Berry', 'The Hollies', 'The Beatles', 'The Five Stairsteps', 'The Notations', 'The Sha La Das',
        'The Flamingos', 'The Ronettes', 'The Little Dippers', 'Jimmy Clanton', 'Frankie Avalon', 'Paul Anka', 'Patti Page',
        'Frankie Valli', 'Cass Elliot', 'Ronnie McDowell', 'Thundercat', 'DOMi & JD BECK', 'Paul Grant', 'Ley Soul',
        'Gotts Street Park', 'kuala', 'The Brothers Nylon', 'berlioz', 'ridgeclub', 'PANTERA BLUE', 'Jean-Luc Ponty',
        'Flea', 'Molly Lewis', 'Weather Report', 'Professor Creepshow', 'jomm', 'John Wasson', 'Bolden.', 'Siberia',
        'Patchwork Inc.', 'Macabre Plaza', 'Hank Levy', 'Aurora Ave.', 'Nathanial Young', 'SERAPHINE NOIR', 'SEQUOIA',
        'Evan Jacobson', 'Rob Araujo', 'Chihiro Yamanaka', 'John Lennon', 'She & Him']),
    ('oriente-electrico', 'Oriente Eléctrico', 'K-pop, J-rock y city pop: ENHYPEN, BTS, Stray Kids, BABYMETAL y Masayoshi Takanaka.', [
        'Masayoshi Takanaka', 'ENHYPEN', 'BTS', 'Stray Kids', 'EXO', 'TOMORROW X TOGETHER', 'GOT7', 'NCT', 'NCT 127',
        'WayV', 'P1Harmony', 'TAEMIN', 'j-hope', 'CORTIS', 'LNGSHOT', 'LE SSERAFIM', 'KATSEYE', 'KARD', 'SHINee', 'X1',
        'B.I', 'KAI', 'YEONJUN', 'Jackson Wang', 'Dynamicduo', "Girls' Generation-Oh!GG", 'NewJeans', 'ONE OR EIGHT',
        'ATEEZ', 'XG', 'Jay Park', 'Jung Kook', 'JAEHYUN', 'LEEHI', 'Wonder Girls', 'BABYMETAL', 'Broken By The Scream',
        '花冷え。', 'KAQRIYOTERROR', 'ATARASHII GAKKO!', 'LADYBABY', 'Yousei Teikoku', 'the peggies', 'Fujii Kaze']),
]
# Destino de las canciones de artistas que aún no están en ninguna playlist
DEFAULT_PLAYLIST = 'cuarto-pastel'

def artist_key(name):
    # Nombres en japonés, coreano…: norm los dejaría vacíos, se comparan tal cual
    return norm(name) or str(name).strip().lower()


ARTIST_PLAYLIST = {artist_key(artist): pid for pid, _, _, artists in PLAYLISTS for artist in artists}


def playlist_of(track):
    """Primera playlist que tenga a alguno de los artistas acreditados (en su orden)."""
    for artist in str(track['artist']).split(','):
        pid = ARTIST_PLAYLIST.get(artist_key(artist))
        if pid:
            return pid
    return None


def main():
    tracks = load_tracks()

    # Una sola copia por canción (misma canción y mismo artista principal)
    seen, unique = set(), []
    for t in tracks:
        # Títulos en japonés u otros alfabetos: se comparan tal cual (norm los dejaría vacíos)
        title = norm(re.sub(r'\(.*?\)|\[.*?\]', '', t['title'])) or t['title'].strip().lower()
        key = f"{title}~{norm(str(t['artist']).split(',')[0])}"
        if not title or key in seen or re.search(EXCLUDE_TITLES, norm(t['title'])):
            continue
        seen.add(key)
        unique.append(t)

    names = {pid: name for pid, name, _, _ in PLAYLISTS}
    members = {pid: [] for pid, _, _, _ in PLAYLISTS}
    unknown = set()
    for t in unique:
        pid = playlist_of(t)
        if not pid:
            unknown.add(t['artist'])
            pid = DEFAULT_PLAYLIST
        members[pid].append(t)
    # El estilo de cada canción (también de las copias repetidas) es el nombre de su playlist
    genres = {t['id']: names[playlist_of(t) or DEFAULT_PLAYLIST] for t in tracks}

    rng = random.Random(2026)
    order = [i for i, p in enumerate(PLAYLISTS) if p[0] not in FIXED_COVERS]
    rng.shuffle(order)
    image_slots = set(order[:COVER_IMAGES])
    images = rng.sample(range(1, COVER_IMAGES + 1), COVER_IMAGES)
    art_colors = ['#ff7ad9', '#7ef9ff', '#ffe27a', '#7a5cff', '#ff5f6d', '#3ddc97', '#ff9f43', '#c5cddb', '#9b5cff', '#00e5ff', '#f4a261', '#e9c46a']
    out, art_i = [], 0
    for i, (pid, name, description, _) in enumerate(PLAYLISTS):
        items = members[pid]
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
    aliases = json.loads(aliases_file.read_text(encoding='utf-8')) if aliases_file.exists() else {}
    catalog = {'version': 1, 'genres': genres, 'playlists': out, 'aliases': aliases}
    (ROOT / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding='utf-8')
    covered = sum(len(p['trackIds']) for p in out)
    print(f'{len(tracks)} canciones, {len(unique)} únicas, {covered} en {len(out)} playlists')
    for p in out:
        print(f"  {len(p['trackIds']):4d}  {p['name']}  [{p['cover']['type']}]")
    if unknown:
        print(f'Artistas sin playlist (van a {names[DEFAULT_PLAYLIST]}): ' + ', '.join(sorted(unknown)))


if __name__ == '__main__':
    main()
