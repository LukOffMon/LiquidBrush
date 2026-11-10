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
import hashlib
import json
import html
import random
import urllib.parse
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COVER_IMAGES = 0  # todas las imágenes están asignadas a mano en FIXED_COVERS
# Portada de cada playlist (covers/cover-NN.jpg). Las que no están aquí llevan un diseño generado.
FIXED_COVERS = {
    'sueno-pastel': 2,
    'indie-soleado': 49,
    'garaje-indie': 24,
    'verano-lofi': 39,
    'domingo-lento': 52,
    'cosmos-acido': 23,
    'niebla-triste': 32,
    'reverb-infinito': 21,
    'rock-alterno': 40,
    'pop-sombrio': 47,
    'pop-estelar': 7,
    'pop-2000': 9,
    'rnb-nocturno': 10,
    'rnb-dorado': 48,
    'funk-eterno': 37,
    'bola-disco': 22,
    'neon-80': 18,
    'french-touch': 4,
    'pista-house': 46,
    'euforia-dance': 44,
    'rave-fantasma': 54,
    'club-jersey': 1,
    'glitch-pop': 53,
    'emo-pixelado': 3,
    'cripta-digital': 6,
    'invierno-ruso': 13,
    'humo-plugg': 51,
    'rap-americano': 12,
    'vieja-escuela': 17,
    'jazz-y-rima': 42,
    'japon-nocturno': 36,
    'rap-latino': 55,
    'trap-sureno': 33,
    'trap-espanol': 5,
    'nueva-escuela': 31,
    'reggaeton-hoy': 38,
    'perreo-clandestino': 16,
    'reggaeton-clasico': 43,
    'pop-latino': 50,
    'latino-alterno': 14,
    'indie-mexa': 20,
    'cumbia-indie': 35,
    'rock-austral': 25,
    'rock-hispano': 8,
    'rock-clasico': 19,
    'metal-pesado': 30,
    'jazz-lounge': 26,
    'damas-del-jazz': 15,
    'alma-blues': 45,
    'swing-de-salon': 34,
    'rocola-dorada': 11,
    'bolero-eterno': 41,
    'brillo-kpop': 29
}

# Playlists que antes llevaban diseño generado y ahora tienen imagen: siguen ocupando su turno
# para que las demás no cambien de diseño al regenerar el catálogo.
ART_SLOT_KEPT = set()
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
    ('sueno-pastel', 'Sueño Pastel', 'Bedroom pop y pop soñador: The Marías, PinkPantheress, TV Girl, Eyedress, Cuco y Malcolm Todd.', [
        'The Marías', 'PinkPantheress', 'TV Girl', 'Eyedress', 'Cuco', 'Malcolm Todd', 'Magdalena Bay',
        'Coco & Clair Clair', 'The Two Lips', 'maye', 'Grimes', 'd4vd', 'Shelly', 'Quelle Rox', 'Mattyeux',
        'Imogen Heap', 'Milky', 'Anna of the North', 'Yazida', 'berryblue', 'Cannelle', 'greek', 'RPLK',
        'Triathalon', 'Princess Chelsea', 'Bratty', 'Katzù Oso', 'INOHA', 'Will Paquin', 'Besos', 'Ramona',
        'Hank Heaven', 'The Autocollants', 'Sunrise Academy', 'Remy Bond', 'Neggy Gemmy', 'SAISO CUPID', 'PLAYROOM',
        'Temachii', 'Molina', 'g hao', 'VARIATION'
    ]),
    ('indie-soleado', 'Indie Soleado', "Indie pop de guitarras brillantes y jangle: Her's, Hotel Ugly, Vacations, No Vacation, Harmless y Not For Radio.", [
        "Her's", 'Hotel Ugly', 'Vacations', 'No Vacation', 'Harmless', 'Not For Radio', 'Los Retros', 'Banes World',
        'Vansire', 'Roar', 'Luna Luna', 'The Drums', 'Ax and the Hatchetmen', 'Sports', 'F3miii', 'Mareux', 'Jakob',
        'Billy Uomo', 'Mellow Fellow', 'Kowloon', 'TEMPOREX', 'Cults', 'Dayglow', 'Nicholas Bonnin',
        'The Space Ocean', 'Mind’s Eye', 'Bedroom', 'Memo Boy', 'Puzzle', 'untitled', 'juju<3', 'Verzache', 'Orca',
        'Sunshine Boysclub', 'daste.', 'The Cat Empire', 'Balu Brigada', 'Enjoy', 'Turkey', 'Stennes', 'Golf Trip'
    ]),
    ('garaje-indie', 'Garaje Indie', 'Indie rock de garaje y guitarras con ganas: Beach Bunny, 54 Ultra, The Strokes, Arctic Monkeys, The Cardigans y beabadoobee.', [
        'Beach Bunny', '54 Ultra', 'The Strokes', 'Arctic Monkeys', 'The Cardigans', 'beabadoobee',
        'late night drive home', 'The Rare Occasions', 'Current Joys', 'Weezer', 'The Symposium', 'Panchiko',
        'girl in red', 'The Walters', 'Alex G', 'Miniature Tigers', 'Rex Orange County', 'Cannons',
        'The Buttertones', 'The Garden', 'Dr. Dog', 'Mother Mother', 'Joy Again', 'Beach Weather',
        'Cage The Elephant', 'Hot Freaks', 'Housecall', 'Blood Nose', 'A-Wall', 'The Long Faces',
        'That Handsome Devil', 'Temper City', 'Ricky Montgomery', 'Two Feet', 'Black Country', 'Palace',
        'Yeah Yeah Yeahs', 'Black Country, New Road'
    ]),
    ('verano-lofi', 'Verano Lo-fi', 'Garaje lo-fi y psicodelia de dormitorio: Inner Wave, Yot Club, Hot Flash Heat Wave, Jordana, april june y almost monday.', [
        'Inner Wave', 'Yot Club', 'Hot Flash Heat Wave', 'Jordana', 'april june', 'almost monday', 'half•alive',
        'Blood Cultures', 'Orchid Mantis', 'Michi', 'Schoolgirl Byebye'
    ]),
    ('domingo-lento', 'Domingo Lento', 'Slacker rock y soft rock de sonrisa ladeada: Mac DeMarco, Paul Cherry, Dent May, Mild High Club, Hector Gachan y Mark Whalen.', [
        'Mac DeMarco', 'Paul Cherry', 'Dent May', 'Mild High Club', 'Hector Gachan', 'Mark Whalen', 'Michael Seyer',
        'Chris Rainbow', 'JW Francis', 'bob junior', 'Kendra Morris', 'Ghouljaboy', 'Tahiti 80',
        'The Undercover Dream Lovers'
    ]),
    ('cosmos-acido', 'Cosmos Ácido', 'Psicodelia y pop cósmico de sintetizador: Tame Impala, Empire Of The Sun, Djo, MGMT, Divino Niño y Crumb.', [
        'Tame Impala', 'Empire Of The Sun', 'Djo', 'MGMT', 'Divino Niño', 'Crumb', 'BOYO', 'Air',
        'Theophilus London', 'Foster The People', 'El Guincho', 'The Avalanches', "Melody's Echo Chamber"
    ]),
    ('niebla-triste', 'Niebla Triste', 'Indie melancólico, dream pop y folk íntimo: Mitski, Strawberry Guy, Lana Del Rey, Cigarettes After Sex, Clairo y Beach House.', [
        'Mitski', 'Strawberry Guy', 'Lana Del Rey', 'Cigarettes After Sex', 'Clairo', 'Beach House', 'Laufey',
        'Faye Webster', 'Men I Trust', 'Matt Maltese', 'Cafuné', 'Alice Phoebe Lou', 'Feist',
        'John + Jane Q. Public', 'Frankie Cosmos', 'Liana Flores', 'salvia palth', 'Sir Chloe', 'Vance Joy',
        'Haley Heynderickx', 'B l o m s t', 'Mazzy Star', 'Julien Marchal', 'reidenshi', 'Glaede', 'Umi Not Human'
    ]),
    ('reverb-infinito', 'Reverb Infinito', "Shoegaze y dream pop de reverb eterna: Cocteau Twins, Part Time, Aphex Twin, Tamaryn, 800 cherries y Alison's Halo.", [
        'Cocteau Twins', 'Part Time', 'Aphex Twin', 'Tamaryn', '800 cherries', "Alison's Halo",
        "You'll Never Get to Heaven", 'Dean Blunt', 'Slowdive', 'my bloody valentine', 'Pale Saints',
        "Autumn's Grey Solace", 'Mediavolo', 'Strange Boutique', 'spirit blue', 'Cryogeyser', 'An April March',
        'Starflyer 59', 'The Radio Dept.', 'Rumskib', 'LSD and the Search for God', 'Chromatics', 'ESPRIT 空想',
        'Night Tapes', 'BUBBLE TEA AND CIGARETTES'
    ]),
    ('rock-alterno', 'Rock Alterno', 'Rock alternativo y britpop de los 80 y 90: Radiohead, bôa, The Smiths, Jeff Buckley, The Cranberries y The Sundays.', [
        'Radiohead', 'bôa', 'The Smiths', 'Jeff Buckley', 'The Cranberries', 'The Sundays', 'Coldplay', 'Green Day',
        'The Smashing Pumpkins', 'The Cure', 'Suicide', 'R.E.M.', 'The Verve', 'Joy Division', 'Blur',
        'The Stone Roses', 'Crowded House', 'No Doubt', 'Lenny Kravitz', 'Audioslave', 'Red Hot Chili Peppers',
        'Nirvana', 'Hole'
    ]),
    ('pop-sombrio', 'Pop Sombrío', 'Pop alternativo oscuro y alt R&B: Joji, Billie Eilish, Twenty One Pilots, Chase Atlantic, The Neighbourhood y Gorillaz.', [
        'Joji', 'Billie Eilish', 'Twenty One Pilots', 'Chase Atlantic', 'The Neighbourhood', 'Gorillaz',
        'Oliver Tree', 'Melanie Martinez', 'Dominic Fike', 'WILLOW', 'Ari Abdul', 'Isabel LaRosa', 'Chris Grey',
        'Artemas', 'JAWNY', 'Jean Dawson', 'Phantogram', 'Santigold', 'Lykke Li', 'Portishead'
    ]),
    ('pop-estelar', 'Pop Estelar', 'Pop de estrellas de hoy: Harry Styles, Suki Waterhouse, Ariana Grande, Doja Cat, Taylor Swift y Dua Lipa.', [
        'Harry Styles', 'Suki Waterhouse', 'Ariana Grande', 'Doja Cat', 'Taylor Swift', 'Dua Lipa', 'Chappell Roan',
        'Charli xcx', 'Selena Gomez', 'Lorde', 'Olivia Rodrigo', 'Labrinth', 'Sabrina Carpenter', 'Tove Lo', 'JVKE',
        'MARINA', 'Lous and The Yakuza', 'Ashe', 'Damiano David', 'Lily Allen', 'Demi Lovato', 'ZAYN',
        'The Kid LAROI', 'benny blanco', 'Wafia', 'Troye Sivan', 'Scissor Sisters'
    ]),
    ('pop-2000', 'Pop 2000', 'Los himnos pop de los 2000 y 2010: Rihanna, Beyoncé, Lady Gaga, Bruno Mars, Britney Spears y Gwen Stefani.', [
        'Rihanna', 'Beyonce', 'Lady Gaga', 'Bruno Mars', 'Britney Spears', 'Gwen Stefani', 'Katy Perry', 'Madonna',
        'Nelly Furtado', 'Justin Timberlake', 'Adele', 'Gloria Estefan', 'Sia', 'Robyn', 'Christina Aguilera',
        'Carly Rae Jepsen', 'Avril Lavigne', 'Kylie Minogue', 'Black Eyed Peas', 'LMFAO', 'Kesha', 'Ellie Goulding',
        'Timbaland', 'Stromae', 'Junior Senior', 'will.i.am', 'Flo Rida', 'Estelle', 'Mike Posner',
        'Olly Alexander (Years & Years)', 'Jennifer Lopez', 'Maroon 5'
    ]),
    ('rnb-nocturno', 'R&B Nocturno', 'R&B contemporáneo de madrugada: Omar Apollo, The Weeknd, Kali Uchis, Steve Lacy, Daniel Caesar y PARTYNEXTDOOR.', [
        'Omar Apollo', 'The Weeknd', 'Kali Uchis', 'Steve Lacy', 'Daniel Caesar', 'PARTYNEXTDOOR', 'Ambar Lucid',
        'SZA', 'Chris Brown', 'Montell Fish', 'Ley Soul', 'Ravyn Lenae', 'Frank Ocean', 'Cassie', 'Amaarae', 'JMSN',
        'Kaash Paige', 'FKA twigs', 'Smerz', 'Trinidad Cardona', "VVV [Trippin'you]", 'JEY'
    ]),
    ('rnb-dorado', 'R&B Dorado', "R&B y neo soul de los 90 y 2000: Aaliyah, Destiny's Child, Usher, TLC, Erykah Badu y Alicia Keys.", [
        'Aaliyah', "Destiny's Child", 'USHER', 'TLC', 'Erykah Badu', 'Alicia Keys', 'Whitney Houston',
        'Janet Jackson', "D'Angelo", 'Mary J. Blige', 'Mariah Carey', 'Ne-Yo', 'Brandy', 'Toni Braxton',
        'Boyz II Men', 'Jodeci', 'Ginuwine', 'Ciara', 'En Vogue', '112', 'Craig David', 'Monica', 'Mario',
        'Keyshia Cole', 'Musiq Soulchild', 'Jill Scott', 'Maxwell', 'Amerie', 'Ashanti', 'Mya', 'SWV',
        'Blackstreet', 'Dru Hill', 'Joe', 'K-Ci & JoJo', 'Jagged Edge', 'Solange', 'H.E.R.', 'Kelis', 'Bilal',
        'Tony! Toni! Tone!'
    ]),
    ('funk-eterno', 'Funk Eterno', 'Funk, soul y pop negro de los 70 y 80: Michael Jackson, Stevie Wonder, Prince, Earth, Wind & Fire, Barry White y Kool & The Gang.', [
        'Michael Jackson', 'Stevie Wonder', 'Prince', 'Earth', 'Barry White', 'Kool & The Gang', 'Marvin Gaye',
        'Rick James', 'The Jackson 5', 'The Jacksons', 'Commodores', 'Sly & The Family Stone', 'Grover Washington',
        'Bob Marley & The Wailers', 'Al Green', 'Parliament', 'George Clinton', 'James Brown',
        'James Brown & The Famous Flames', 'Zapp', 'Cameo', 'The Gap Band', 'Rose Royce', "The O'Jays"
    ]),
    ('bola-disco', 'Bola Disco', 'Disco y boogie para la pista: Bee Gees, ABBA, Donna Summer, George Michael, Jamiroquai y CHIC.', [
        'Bee Gees', 'ABBA', 'Donna Summer', 'George Michael', 'Jamiroquai', 'CHIC', 'KC & The Sunshine Band',
        'Diana Ross', 'Sister Sledge', 'Purple Disco Machine', 'Patrice Rushen', 'Rod Stewart', 'Gloria Gaynor',
        'Chaka Khan', 'Boney M.', 'Evelyn Champagne King', 'Laura Branigan', 'Olivia Newton-John', 'Paul McCartney',
        'A Taste Of Honey', 'Bobby Caldwell', 'Player', 'Baccara', 'Tavares', 'Andy Gibb', 'Heatwave', 'Joe Bataan',
        'Michael Angelo', 'Rufus', 'Village People', 'Cheryl Lynn', 'Thelma Houston', 'Anita Ward', 'Lipps Inc.',
        'Sylvester', 'The Trammps', 'Odyssey', 'McFadden & Whitehead', 'Shalamar', 'The Whispers', 'Lionel Richie',
        'Teena Marie', 'Cerrone', 'Irene Cara', 'The Pointer Sisters', 'Hot Chocolate', 'Billy Ocean', 'LaBelle',
        'Amii Stewart'
    ]),
    ('neon-80', 'Neón 80', 'Synth pop y new wave de los 80: Depeche Mode, Billy Idol, Chris Isaak, Duran Duran, The Police y Men At Work.', [
        'Depeche Mode', 'Billy Idol', 'Chris Isaak', 'Duran Duran', 'The Police', 'Men At Work', 'Blondie',
        'A Flock Of Seagulls', 'Daryl Hall & John Oates', 'New Order', 'Bronski Beat', 'Soft Cell', 'Eurythmics',
        'The Human League', 'Simple Minds', 'Real Life', 'Michael Sembello', 'Tears For Fears', 'The Cars',
        'When In Rome', 'Twin Tribes', 'The Romantics', 'Orchestral Manoeuvres In The Dark', 'Spandau Ballet',
        'Emmanuel', 'F.R. David'
    ]),
    ('french-touch', 'French Touch', "French touch, nu-disco y electrónica francesa: Polo & Pan, Daft Punk, L'Impératrice, Justice, Miel De Montagne y Metronomy.", [
        'Polo & Pan', 'Daft Punk', "L'Impératrice", 'Justice', 'Miel De Montagne', 'Metronomy', 'Darius',
        'Lewis OfMan', 'Paradis', 'Myd', 'Flavien Berger', 'Clea Vincent', 'Bleu Toucan', 'Alastair Lane',
        'NEIL FRANCES', 'Parcels', 'Papooz', 'Nice Guys', 'Billy Bahama', 'AGAV', 'Self Sabotage', 'Anoraak',
        'warner case', 'Pépite', 'Miami Horror', 'Else', 'Pitto', 'Eme Sarav', 'Michael Gray', 'Bob Sinclar',
        'Modjo', 'Stardust', 'The Rah Band', 'Mou', 'Marine Neuilly'
    ]),
    ('pista-house', 'Pista House', 'House, big beat y electrónica de club: Fred again.., KAYTRANADA, Eric Prydz, Disclosure, Fatboy Slim y ZHU.', [
        'Fred again..', 'KAYTRANADA', 'Eric Prydz', 'Disclosure', 'Fatboy Slim', 'ZHU', 'The Chemical Brothers',
        'Basement Jaxx', 'Royksopp', 'Caribou', 'Peggy Gou', 'Flight Facilities', 'Seekae', 'Monogem',
        'Gesaffelstein', 'M83', 'FISHER', 'BICEP', 'Jamie xx', 'Faithless', 'Armand Van Helden', 'LCD Soundsystem',
        'Duck Sauce', 'Martin Solveig', 'Joel Corry', 'Kungs', 'MEDUZA', 'Lilly Wood and The Prick'
    ]),
    ('euforia-dance', 'Euforia Dance', 'EDM de festival y eurodance de los 90: Calvin Harris, Avicii, Swedish House Mafia, David Guetta, Major Lazer y Galantis.', [
        'Calvin Harris', 'Avicii', 'Swedish House Mafia', 'David Guetta', 'Major Lazer', 'Galantis', 'Clean Bandit',
        'Kygo', 'Zedd', 'SNAP!', 'Culture Beat', 'Martin Garrix', 'Skrillex', 'deadmau5', 'Tiesto',
        'The Chainsmokers', 'Dj Kazantip', 'Русский размер', 'Alice Deejay', 'Andronicus', 'Crystal Waters',
        'Robert Miles', 'La Bouche', 'Haddaway', 'Ace of Base', 'Mr. President', 'Global Deejays', 'Technotronic',
        'Scatman John', 'Eiffel 65', 'Darude', 'Aaron Smith', '1tbsp', 'Robin Schulz', 'Jack Ü', '99 Souls', 'Kyla',
        'Alan Walker', 'Marshmello', 'Alesso', 'Seeb', 'Years & Years', 'DJ Paleface', 'Crazy Cousinz'
    ]),
    ('rave-fantasma', 'Rave Fantasma', 'Hardtekk, jumpstyle y rave de madrugada: akkiemi, ythotkk, STØMPWRLD, DJ ZUP RAlii, latex fruit y Marc Acardipane.', [
        'akkiemi', 'ythotkk', 'STØMPWRLD', 'DJ ZUP RAlii', 'latex fruit', 'Marc Acardipane', 'ilyhiryu',
        'waypoint on noclip', 'STAKILLAZ', 'luu', 'rukiawaa', 'Snow Strippers', 'SAIBOTAJE', 'DudePlaya', 'quincke',
        'dxnkwer', 'angelhard', 'ZXVABEAT', 'shck', 'ASKL hon', 'HALATNOST', 'cvzxeov', 'Blaulicht 112', 'LXXVEME',
        'YXMI', 'rukzi', 'eiby', 'DISGRACEMODE', 'Slixshøt', 'Der Aztekke', 'grindgwap', 'EL$E', 'Tanin Jazz',
        'Aiden Music', 'Maretu', 'Akula', 'Didi Early Rave', 'Dutch Disorder', 'Vampyx', 'ZWE1HVNDXR', 'meowscles',
        'dj 1lusha', 'Ivan Giannovani', 'dj trippie flameboy', 'Dj Svevsx', 'vyrval', 'ovg!', 'Daniela Alvira',
        'vivi baby', 'Remika', 'luvwillow', 'decaying', 'relapse', 'Stady', 'chrmbchrmb', 'Console Allstars',
        'rusino', 'Fixupboy', 'Deezo', 'Batro', 'Tokyo Ghetto Pussy', 'Janina', 'Resonant', 'Delinquent',
        'Øneheart', 'Izzamuzzic', 'dopamine.', 'xn88ax', 'DJ UNIVXRSEL', 'kerosyn', 'HEXXO', 'skalpas',
        'play it twice', 'leafonia'
    ]),
    ('club-jersey', 'Club Jersey', 'Jersey club, nightcore y sped up: nusar3000, Miss Papaya, Aidan Swank, Luci4, Jxrsey y Isaac Reign.', [
        'nusar3000', 'Miss Papaya', 'Aidan Swank', 'Luci4', 'Jxrsey', 'Isaac Reign', 'LyteSpeed', 'sekairotten',
        'Velocite', 'A k i', 'banaruu', 'Chanelfather', 'juugmarioracks', 'Kempachii', 'noble lion', 'ewshem',
        'animegirl88', 'Barcellos Marcia', 'Moonshine', 'Mushkaa', '8belial', 'Safety Trance', 'GIANNI BATISTA',
        'Azuleja'
    ]),
    ('glitch-pop', 'Glitch Pop', 'Hyperpop y digicore: Jane Remover, AKRIILA, juno, celai, schizocat y morgue vault.', [
        'Jane Remover', 'AKRIILA', 'juno', 'celai', 'schizocat', 'morgue vault', 'Arca', 'kmoe', 'underscores',
        'That Kid', 'Frost Children', 'punchy', 'aubri!', 'kiheir', 'Piggybank112', 'ankle', 'Junshi', '67',
        'guitarbf', 'wizardjit', 'Anxiety', '⎍⧮⫽⩘⧅⦔⨬⧇⩕⥉⦾⫰⧪⦑⧛⨳'
    ]),
    ('emo-pixelado', 'Emo Pixelado', 'Emo y scenecore de internet: pupsies, h4rtbrkr, Cuntsniffer, Punkinloveee, i wanna be a jack-o-lantern y Boy Fantasy.', [
        'pupsies', 'h4rtbrkr', 'Cuntsniffer', 'Punkinloveee', 'i wanna be a jack-o-lantern', 'Boy Fantasy', 'odihu',
        'h4teboy', 'overtonight', 'mthu', 'Fried By Fluoride', 'Rebzyyx', 's0rrow', 'shambles', 'retardead',
        'spawncamped', 'Anhero', 'kaysnoto', 'Crustsox', 'ShyBully', 'pichuu', 'thai body dump',
        'Broken Toy Airplanes', 'disoc8', 'flywoah', 'voidvoice717', 'kofun', 'Lida', 's0nder', 'Parting Gift',
        'Clarion', 'twentythree', 'Mistvale', 'crayon', 'coldwntr', 'Lil Watermark', 'Loser64', 'laydownrot',
        'Mars Argo', 'tnfmb', 'proderics', 'Stxlkin', 'lexycat', 'dolldamage', 'Belowground', 'redize', '1stress'
    ]),
    ('cripta-digital', 'Cripta Digital', 'Emo gótico, cloud oscuro y horrorcore: morgue, blair, zombiwebz, wifiskeleton, korpsebunny y khxznq.', [
        'morgue', 'blair', 'zombiwebz', 'wifiskeleton', 'korpsebunny', 'khxznq', 'Sematary', 'backw666s',
        'iamsodead', 'duskydemise', 'duskydemise archive', 'lungskull', 'Im gonna die alone', 'Goreshit',
        'never goodbye', 'keepsecrets', 'xolu', 'fxdedthemm', 'Yen', 'Blackblood3d', 'kiraso', 'axxturel',
        'kaisexistence', 'lieu', 'osquinn', 'icedancer', 'bloodsekai', 'witchbox', 'Nishatentachi', 'oinkasf',
        'hurtsick', 'rlax', 'knwbttr', 'Quincy Divine'
    ]),
    ('invierno-ruso', 'Invierno Ruso', 'Post-punk ruso, coldwave y pop ruso: Intelligency, Перемотка, Kino, Crystal Castles, Soft Blade y Sexy Sushi.', [
        'Intelligency', 'Перемотка', 'Kino', 'Crystal Castles', 'Soft Blade', 'Sexy Sushi', 'Maple', 'ONDA ANDAR',
        'Luna', 'Антоха МС', 'Gradusy', 'Второй Ка', 'Дайте танк (!)', 'SEREBRO', 'Pompeya', 'ALYSS',
        'Garcon Maigre', 'ta1ls', 'Aests', 'егорbez', 'Moya Mishel', 'Eldzhey', 'angel vox', 'My',
        'Марія Чайковська', 'Михей', 'Girls Rituals', 'N95', 'DJ Quads', 'Czxxze', 'theroux', 'Aircraft',
        'Molchat Doma', 'IOWA', 'Irma', 'Buerak', 'Tima Belorusskih', 'Masha i Medvedi', 'Lolita', 'MIGAS',
        'plenka', 'ZXNITH', 'Kill Eva', 'whylovly', 'edwuard', 'Катя Лель', 'Сова', 'конец солнечных дней',
        'лезвием ножа.', 'слушай экзорцист', 'ЭЛЕВЕН ЭЙТ', 'собакой сдохъ', 'урал гайсин', 'soit pas jaloux',
        'tremera', 'keyoo', 'NEMIGA', 'cg', 'Qypedo', '10дней'
    ]),
    ('humo-plugg', 'Humo Plugg', 'Cloud rap, plugg y underground: void, LUCKI, ProdWithFlavor, Lelo, Trefuego y Xavier Wulf.', [
        'void', 'LUCKI', 'ProdWithFlavor', 'Lelo', 'Trefuego', 'Xavier Wulf', 'Spaceli Vietnam', 'Kuhsigh',
        'QUANTRELL', 'BashfortheWorld', 'Manny Laurenko', 'empireofyu', 'Khalil', 'Sharkey', 'Zachariehs',
        'Kingman Irving', 'Savvy Melado', 'ilyTOMMY', 'dedwrite', 'VVS $.', '22francc', 'Barretta', 'Ejmonix',
        'KYSLINGO', 'LandonBeck', 'FLVSHY', 'Trey Bands', 'Big Tonka Cuh', 'ssjishmael', 'sativa', 'Lil Maru',
        'kush', 'feelinmyself', 'C Choppa', 'CHASETHEMONEY', 'Harrykahanhai', 'Paulie Leparik', 'skyemane',
        'Freddie Dredd', 'are you really fine?', 'BONES', 'dreaming.', 'reptilianshrine', 'GHOSTYY', 'neptune'
    ]),
    ('rap-americano', 'Rap Americano', 'Rap de EE. UU. de los 2010 a hoy: Tyler, The Creator, Armand Hammer, Kanye West, Drake, Childish Gambino y Kendrick Lamar.', [
        'Tyler', 'Armand Hammer', 'Kanye West', 'Drake', 'Childish Gambino', 'Kendrick Lamar', 'G-Eazy',
        'Mac Miller', 'Matt Martians', 'Kid Cudi', 'Nipsey Hussle', 'Travis Scott', 'XXXTENTACION',
        'French Montana', 'Nafeesisboujee', 'Jordan Adetunji', 'Metro Boomin', 'A AP Ferg', 'N.E.R.D', 'Yung Lean',
        'A$AP Ferg'
    ]),
    ('vieja-escuela', 'Vieja Escuela', 'La edad de oro del hip hop: Outkast, The Notorious B.I.G., 2Pac, Eminem, JAY-Z y Nas.', [
        'Outkast', 'The Notorious B.I.G.', '2Pac', 'Eminem', 'JAY-Z', 'Nas', 'A Tribe Called Quest', 'Dr. Dre',
        'Ms. Lauryn Hill', 'Missy Elliott', 'Snoop Dogg', 'Madvillain', 'De La Soul', 'Fugees', 'Beastie Boys',
        'MF DOOM', 'Wu-Tang Clan', 'Mobb Deep', 'Lupe Fiasco', 'Common', 'The Pharcyde', 'Gang Starr', 'RunD.M.C.',
        'Method Man', 'Mos Def', 'Black Star', 'J Dilla', 'Slum Village', 'Cypress Hill', 'House Of Pain',
        'Warren G'
    ]),
    ('jazz-y-rima', 'Jazz y Rima', 'Jazz rap, boom bap y jazzhop: Kero One, Jazz Liberatorz, 3582, Marcus D, Witness y Glad2Mecha.', [
        'Kero One', 'Jazz Liberatorz', '3582', 'Marcus D', 'Witness', 'Glad2Mecha', 'Example',
        'Boho Fau & Elevated Soul', 'Emapea', 'Pat D', 'The Globetroddas', 'Mndsgn', 'Mountain Brothers',
        'Lady Paradox', 'Bush Babees', 'J. Rawls', 'Mathematik', 'Peebs The Prophet', 'Dela', 'Cru', '14', 'Okvsho',
        'Teebs', 'edbl', 'Blazo', 'Oliver Crosby', 'Spaze Windu', 'A.O.', 'BROCKBEATS', 'Green Assassin Dollar',
        'Iam6teen', 'Sinj Clarke', 'Telemakus', 'Sweet William', 'The Offline', 'fat jon', 'TOMC', 'FloFilz',
        'Cise Star', 'Thes One', 'Funky DL', 'Rikinish', 'Medasin', 'Lionmilk', 'Professor Creepshow'
    ]),
    ('japon-nocturno', 'Japón Nocturno', 'Jazzhop, beats japoneses y city pop: Masayoshi Takanaka, Nujabes, Shing02, Yakkle, Force Of Nature y TSUTCHIE.', [
        'Masayoshi Takanaka', 'Nujabes', 'Shing02', 'Yakkle', 'Force Of Nature', 'TSUTCHIE', 'Ljones',
        'DJ Mitsu The Beats', 'Uyama Hiroto', 'Kyo Itachi', 'tajima hal', 'haruka nakamura', 'Nitsua',
        'Shingo Sekiguchi', 'MIDICRONICA', 'Pase Rock', 'clammbon', 'Scott Matelic', 'STUTS', 'Toshiki Soejima',
        'mabanua', 'Michael Kaneko', 'EVISBEATS', '16FLIP', 'Night Tempo', 'DJ FRIP a.k.a. BeatLab',
        'YOUR SONG IS GOOD', 'the peggies', 'Fujii Kaze', 'Lamp', 'Makoto Matsushita', 'DOOPEES', 'MEITEI',
        'Bajune Tobeta', 'Modal.s', 'JJJ'
    ]),
    ('rap-latino', 'Rap Latino', 'Rap en español de México y Latinoamérica: Cruzzi, Charles Ans, Wk, A.C.O, Mike Lamadrid y Simpson Ahuevo.', [
        'Cruzzi', 'Charles Ans', 'Wk', 'A.C.O', 'Mike Lamadrid', 'Simpson Ahuevo', 'Adan Cruz', 'Mime 871',
        'Mr. Knightowl', 'Iluminatik', 'Señor Marrano', 'The Guadaloops', 'Anestesia', 'Cartel De Santa', 'Gera MX',
        'Choclock', 'Flavio Rodriguez', 'Ka-b', 'Canserbero', 'Micro TDH', 'Felp 22', 'Robot95', 'Logan Hate',
        'Ana Tijoux', 'Mellow Man Ace', 'Bizor', 'Muelas De Gallo', 'Gonzalo Genek', 'Tankeone', 'Neto Peña',
        'Shamanes Crew'
    ]),
    ('trap-sureno', 'Trap Sureño', 'Trap y RKT de Argentina y Chile: One Flyt, Duki, Milo j, tomas metrikf, Sosa 66s y Pablo Chill-E.', [
        'One Flyt', 'Duki', 'Milo j', 'tomas metrikf', 'Sosa 66s', 'Pablo Chill-E', 'YSY A', 'Trueno', 'Malandro',
        'Niño Condor', 'Cris MJ', 'Pressure 9X19', 'Aleman', 'ROA', 'Trap Capos', 'Nicki Nicole', 'Emilia', 'Bhavi',
        'Alemán', 'JCKC', 'T4CHO', 'Cerounno', 'Troubless', 'Ema', 'Ilsmokee', 'Deyco', 'Nazareno gutierrez',
        'Carrion GodBle$$', 'T&K', '008RACCA', 'Klens', 'Cheim', 'Franky Style', 'Tian vck', 'Mugshot', 'ESE MG',
        'Natán', 'GZ', 'MECHAYRXMEO', 'Young Cister', 'Slayter', 'Lil Naay', 'FloyyMenor', 'Maria Becerra',
        'LIT killah', 'Bardero$', 'C.R.O', 'Alex Gargolas', 'KIDDWERO', 'Kiddye', 'Félix Vestre', 'Young Weapon',
        'Vasti Yan', 'Gabryel', 'Lizorzo', 'wrld one', 'CORBA'
    ]),
    ('trap-espanol', 'Trap Español', 'Trap y rap de España: Yung Beef, Kaydy Cain, C. Tangana, Xiyo, Rels B y ladiferencia2006.', [
        'Yung Beef', 'Kaydy Cain', 'C. Tangana', 'Xiyo', 'Rels B', 'ladiferencia2006', 'Bb trickz', 'ROSALÍA',
        'Quevedo', 'WEST DUBAI', 'UGLY', 'Icy Vedo', 'Estrellas Del Rap Nacional', "L'haine", 'Bad Gyal',
        'Omar Montes', 'El Malilla', 'Albany', 'La Zowi', 'Kidd Keo', 'Delaossa'
    ]),
    ('nueva-escuela', 'Nueva Escuela', 'La nueva escuela española, entre pop, electrónica y rap: rusowsky, Ralphie Choo, Stereo Madness, Guxo, Lu Jr y LEÏTI.', [
        'rusowsky', 'Ralphie Choo', 'Stereo Madness', 'Guxo', 'Lu Jr', 'LEÏTI', 'Enry-K', 'Teo Lucadamo',
        'superreservao', 'duna', 'Nico', 'Fuji', 'Elio Toffana', 'D.Valentino', 'ukd', 'Gatti', 'mita',
        'SAM DAVIES', 'Semon'
    ]),
    ('reggaeton-hoy', 'Reggaetón Hoy', 'Reggaetón y trap latino de ahora: Bad Bunny, J Balvin, KAROL G, Rauw Alejandro, Maluma y Ozuna.', [
        'Bad Bunny', 'J Balvin', 'KAROL G', 'Rauw Alejandro', 'Maluma', 'Ozuna', 'Nicky Jam', 'Yan Block',
        'Novato El Flow', 'Feid', 'Omar Courtz', 'Myke Towers', 'Tainy', 'Jon Z', 'SAIKO', 'Luigi 21 Plus',
        'Boy Wonder CF', 'Alvaro Diaz', 'Sech', 'Lunay', 'Manuel Turizo', 'Young Miko', 'Bryant Myers', 'J Abdiel',
        'Jay Wheeler', 'Tokischa', 'iZaak'
    ]),
    ('perreo-clandestino', 'Perreo Clandestino', 'Neoperreo, dembow mexa y funk brasileño: Doony Graff, Jose Alatorre, Yeyo, DENNA LA PORRI, La Obsesion y xosa.', [
        'Doony Graff', 'Jose Alatorre', 'Yeyo', 'DENNA LA PORRI', 'La Obsesion', 'xosa', 'El Bogueto', '3BallMTY',
        'Ruzzo Doblezz', 'Sayuri & Sopholov', 'Nana Nina', 'JAYSEE', 'Cachirula', 'LoveUikari', 'Chzter',
        'Onemillionkisses', 'MC Kevinho', 'La Vendicion', 'hennessyyy', 'Nasty Vato', 'lila sky', 'Midfug',
        'la intimidad', 'Dinamarca', 'GSAD', 'La Mafia del Amor', 'Yng Lvcas', 'Veronica', 'Kinto Piso',
        'Jessvel Peyret', 'Ya Ice Dilan', 'Lil Bru', 'Mike', 'Kauxx', 'MC Sam', 'Macaia', 'Je Tupinikin', 'DJ Cozy',
        'VULGO', 'Sajiva', 'DJ ROOTS', '3delincuentes', 'FLVCKKA', 'Joss ML', 'MXLVIXJE', 'Ikoniko', 'Mamx',
        'Tuere Chorito', 'Uzielito Mix', 'Ivy Wavy', 'yngdean', 'Amber Yezel', 'La Zanta Xit', 'TBX', 'Aln MC',
        'Cherry Chola', 'MJ Nebreda', 'Tramposos', 'Bolishe One', 'Enayy', 'Alicia te quiero', 'morenoguapo',
        'Ivan de la Rioja', 'Angelicca', 'paxheko', 'Yered!!', 'Zalzuki'
    ]),
    ('reggaeton-clasico', 'Reggaetón Clásico', 'Reggaetón de la vieja escuela y cumbia: Daddy Yankee, Don Omar, Wisin & Yandel, Arcángel, Plan B y Farruko.', [
        'Daddy Yankee', 'Don Omar', 'Wisin & Yandel', 'Arcángel', 'Plan B', 'Farruko', 'Yandel', 'J Alvarez',
        'Ñengo Flow', 'A.B. Quintanilla III', 'Tego Calderon', 'Jowell & Randy', 'Héctor "El Father"', 'Ivy Queen',
        'Zion & Lennox', 'Calle 13', 'Tony Dize', 'Angel Y Khriz', 'Randy Nota Loca', 'Yaga & Mackie',
        'Baby Rasta y Gringo', 'Sammy & Falsetto', 'Zion', 'Alex Rose', 'Reykon', 'DJ Luian', 'Franco "El Gorilla"',
        'A.B. Quintanilla III Y Los Kumbia Kings', 'Kumbia Kings', 'Cruz Martinez presenta Los Super Reyes',
        'Impacto Mc', 'Calo', 'Millonario & W. Corona', 'El Pelón del Mikrophone', 'América Sierra', 'Los Telez',
        'Xandy Almeida', 'Rayo & Toby', 'J-King y Maximan', 'Alexis y Fido', 'Tito El Bambino', 'Wisin'
    ]),
    ('pop-latino', 'Pop Latino', 'Pop latino de radio, de los 90 a hoy: Shakira, Maná, Ricky Martin, Enrique Iglesias, Juanes y CNCO.', [
        'Shakira', 'Mana', 'Ricky Martin', 'Enrique Iglesias', 'Juanes', 'CNCO', 'Romeo Santos', 'Thalia',
        'Juan Luis Guerra 4.40', 'Selena', 'Marc Anthony', 'Carlos Vives', 'Prince Royce', 'NATTI NATASHA',
        'Paulina Rubio', 'Aventura', 'Chayanne', 'CD9', 'Jesse & Joy', 'Luis Fonsi', 'Celia Cruz', 'RBD',
        'Laura Pausini', 'Anitta', 'Danny Ocean', 'Kim Loaiza', 'Camilo', 'Sebastian Yatra', 'Morat', 'Camila',
        'Reik', 'Sin Bandera', 'Elvis Crespo', 'Los Del Rio', 'Ricardo Arjona', 'La Oreja de Van Gogh', 'Belinda',
        'Gente De Zona', 'Franco De Vita', 'Alejandro Fernandez', 'Ha Ash', 'Miami Sound Machine'
    ]),
    ('latino-alterno', 'Latino Alterno', 'Pop alternativo y canción latina: Bandalos Chinos, Mon Laferte, Julieta Venegas, Natalia Lafourcade, LATIN MAFIA y Buscabulla.', [
        'Bandalos Chinos', 'Mon Laferte', 'Julieta Venegas', 'Natalia Lafourcade', 'LATIN MAFIA', 'Buscabulla',
        'CA7RIEL & Paco Amoroso', 'Monsieur Periné', 'Adanowsky', 'Carla Morrison', 'Ed Maverick', 'Vanessa Zamora',
        'Ximena Sariñana', 'Silvana Estrada', 'Caloncho', 'Elsa y Elmar', 'Gepe', 'DannyLux', 'HUMBE', 'La Gabi',
        '424', 'Tita', 'Isla de Caras', 'Helado Negro', 'Kevin Kaarl', 'Natt Calma'
    ]),
    ('indie-mexa', 'Indie Mexa', 'Indie y rock alternativo de México: Cisne Elocuente, Café Tacvba, Zoé, Enjambre, Little Jesus y CLUBZ.', [
        'Cisne Elocuente', 'Café Tacvba', 'Zoé', 'Zoe', 'Cafe Tacvba', 'Enjambre', 'Little Jesus', 'CLUBZ', 'Nsqk',
        'Chicano Batman', 'Diamante Eléctrico', 'iza tkm', 'Juanpa Gordoa', 'Siddhartha', 'La Vida Bohème',
        'Jósean Log', 'Me Estás Matando', 'babas tutsipop', 'Alanis Yuki', 'RØZ', 'Mi Compa el Chino', 'Jasper',
        'RENEE', 'Okills', 'Technicolor Fabrics', 'Camilo Séptimo', 'Cienfue', 'Estereomance', 'Los Espiritus',
        'Protistas', 'MKRNI', 'TOURISTA', 'Marineros', 'Teleradio Donoso', 'Rey Pila', 'Reyno', 'Los Wálters',
        'Conociendo Rusia', '¿Téo?', 'Arawato', 'Chango Menas', 'Comisario Pantera', 'Duck Fizz', 'El Zar',
        'Gustavo Castellanos', 'Las Ligas Menores', 'te vi en un planetario', 'Kameleba', 'Sebastian Alvarez',
        'Jota Ce', 'AQUIHAYAQUIHAY', 'Foudeqush', 'Rebe', 'Pablo Alhach', '1702', 'Aldo Peláez', 'Bmontee', 'Youka',
        'Teo'
    ]),
    ('cumbia-indie', 'Cumbia Indie', 'Cumbia pop, tropical e indie bailable: YoSoyMatt, Los Eclipses, Disco Bahía, ZTVZ, Soultade y PANTERA BLUE.', [
        'YoSoyMatt', 'Los Eclipses', 'Disco Bahía', 'ZTVZ', 'Soultade', 'PANTERA BLUE', 'Karen y Los Remedios',
        'le venado', 'Weste', 'Plastical People', 'Gondwana', 'Eva de Marce', 'LaDí', 'vonnside', 'Chloé Silva',
        'CERO39', 'Tenda', 'Todo El Verano', 'Real Cumbia Activa RCA', 'chicarica', 'Jaycc', 'Tutankhamun',
        'Tati Falco', 'French Braids', 'NAFTA', 'Los Amigos Invisibles', 'Vita Set', 'Young Tender',
        'Mermelada de Pepino', 'Bobui', 'Patricio Alvarado', 'UNIVERSE', 'Acid Coco', 'MIEL', 'Perro Salchicha',
        'Shmiks', 'Emally Villa', 'Elia y Elizabeth', 'Epilogio', 'Daniel Craft', 'UnDOMENICO'
    ]),
    ('rock-austral', 'Rock Austral', 'Rock argentino y chileno de culto: Soda Stereo, Los Bunkers, Gustavo Cerati, Los Enanitos Verdes, Los Prisioneros y Andrés Calamaro.', [
        'Soda Stereo', 'Los Bunkers', 'Gustavo Cerati', 'Los Enanitos Verdes', 'Los Prisioneros', 'Andrés Calamaro',
        'Charly García', 'Fito Paez', 'Los Fabulosos Cadillacs', 'Babasonicos', 'Los Tres', 'Miranda!',
        'Serú Girán', 'Luis Alberto Spinetta', 'Los Rodriguez', 'Vilma Palma e Vampiros',
        'Los Auténticos Decadentes', 'Pescado Rabioso', 'Virus', 'La Ley', 'Sui Generis', 'Los Abuelos De La Nada',
        'Spinetta Jade', 'Viejas Locas', 'Los Tetas', 'La Mosca', 'Macha Y El Bloque Depresivo', 'Chico Trujillo',
        'Almendra', 'Los Pericos', 'Los Cafres', 'Divididos', 'Sumo', 'El Mato a un Policia Motorizado',
        'Los Piojos', 'La Renga', 'Patricio Rey y sus Redonditos de Ricota', 'Bersuit Vergarabat'
    ]),
    ('rock-hispano', 'Rock Hispano', 'Rock en español de México, Colombia y España: Odisseo, Caifanes, León Larregui, Hombres G, Héroes del Silencio y Mecano.', [
        'Odisseo', 'Caifanes', 'León Larregui', 'Hombres G', 'Heroes Del Silencio', 'Mecano', 'Molotov',
        'Aterciopelados', 'Maldita Vecindad Y Los Hijos Del 5to. Patio', 'Glup!', 'Surfistas Del Sistema',
        'Esteman', 'Los Vaguens', 'El Tri', 'Bunbury', 'Mikel Erentxun', 'Duncan Dhu', 'Indios', 'La Gusana Ciega',
        'Danza Invisible', 'La Unión', 'Julius Popper', 'Fobia', 'Jaguares', 'Radio Futura', 'Los Planetas',
        'Vetusta Morla', 'Love of Lesbian', 'Panteon Rococo', 'El Ultimo De La Fila', 'Manu Chao'
    ]),
    ('rock-clasico', 'Rock Clásico', 'Rock de los 60 y 70, del blues rock al progresivo: Deep Purple, AC/DC, Queen, Led Zeppelin, Santana y Pink Floyd.', [
        'Deep Purple', 'AC/DC', 'Queen', 'Led Zeppelin', 'Santana', 'Pink Floyd', 'The Doors', 'Cream', 'Van Halen',
        'Elton John', 'The Rolling Stones', 'KISS', 'America', 'Fleetwood Mac', 'Electric Light Orchestra',
        'David Bowie', 'Foghat', 'The Kinks', 'Eagles', 'Joe Walsh', 'Derek & The Dominos', 'Yes', 'Mountain',
        'The Dirty Mac', 'George Thorogood & The Destroyers', 'Blue Öyster Cult', 'Neil Young', 'Gary Moore'
    ]),
    ('metal-pesado', 'Metal Pesado', "Metal, nu metal, post-hardcore y kawaii metal: Deftones, BABYMETAL, 花冷え。, Metallica, Black Sabbath y Guns N' Roses.", [
        'Deftones', 'BABYMETAL', '花冷え。', 'Metallica', 'Black Sabbath', "Guns N' Roses", 'Sleeping With Sirens',
        'Broken By The Scream', 'Pantera', 'Linkin Park', 'Iron Maiden', 'Megadeth', 'UFO', 'Pierce The Veil',
        'Whitesnake', 'KAQRIYOTERROR', 'LADYBABY', 'Yousei Teikoku'
    ]),
    ('jazz-lounge', 'Jazz Lounge', 'Jazz, soul y bossa nova para la sobremesa: Sade, Amy Winehouse, Antônio Carlos Jobim, Frank Sark, Chet Baker y berlioz.', [
        'Sade', 'Amy Winehouse', 'Antônio Carlos Jobim', 'Frank Sark', 'Chet Baker', 'berlioz', 'Thundercat',
        'Stan Getz', 'John Coltrane Quartet', 'Celeste', 'Olivia Dean', 'Dana and Alden', 'Tommy Dorsey',
        'Henry Mancini', 'John Coltrane', 'Lester Young', 'Ebony Loren', 'Durand Jones & The Indications',
        'The Dave Brubeck Quartet', 'Martial Solal', 'DOMi & JD BECK', 'Paul Grant', 'Gotts Street Park', 'kuala',
        'The Brothers Nylon', 'ridgeclub', 'Jean-Luc Ponty', 'Flea', 'Molly Lewis', 'Weather Report', 'jomm',
        'John Wasson', 'Bolden.', 'Siberia', 'Patchwork Inc.', 'Macabre Plaza', 'Hank Levy', 'Aurora Ave.',
        'Nathanial Young', 'SERAPHINE NOIR', 'SEQUOIA', 'Evan Jacobson', 'Rob Araujo', 'Chihiro Yamanaka', 'Cortex',
        'Venda', 'Clyde Otis', 'George Shearing Quintet', 'Cannonball Adderley'
    ]),
    ('damas-del-jazz', 'Damas del Jazz', "Jazz vocal a media luz: Julie London, Blossom Dearie, Irene Kral, Jeri Southern, Anita O'Day y Ava Gardner.", [
        'Julie London', 'Blossom Dearie', 'Irene Kral', 'Jeri Southern', "Anita O'Day", 'Ava Gardner', 'Kay Starr',
        'Doris Day', 'Peggy Lee'
    ]),
    ('alma-blues', 'Alma Blues', 'Voces de blues, soul y jazz clásico: Dinah Washington, Nancy Wilson, Aretha Franklin, Billie Holiday, Etta James y Etta Jones.', [
        'Dinah Washington', 'Nancy Wilson', 'Aretha Franklin', 'Billie Holiday', 'Etta James', 'Etta Jones',
        'Ray Charles', 'Catherine Russell', 'Sarah Vaughan', 'Ernestine Anderson', 'Dakota Staton',
        'Lorez Alexandria'
    ]),
    ('swing-de-salon', 'Swing de Salón', 'Crooners y swing de big band: Frank Sinatra, Bobby Darin, Nat King Cole, Louis Armstrong, Ella Fitzgerald y Nat King Cole Trio.', [
        'Frank Sinatra', 'Bobby Darin', 'Nat King Cole', 'Louis Armstrong', 'Ella Fitzgerald', 'Nat King Cole Trio',
        'Al Bowlly', 'The Mills Brothers', 'Dean Martin', 'Jack Jones', 'Natalie Cole'
    ]),
    ('rocola-dorada', 'Rocola Dorada', "Pop, doo-wop y soul de los 50 a los 70: Tom Jones, Gilbert O'Sullivan, Brenda Lee, Lesley Gore, Dusty Springfield y Carpenters.", [
        'Tom Jones', "Gilbert O'Sullivan", 'Brenda Lee', 'Lesley Gore', 'Dusty Springfield', 'Carpenters',
        'The Beatles', 'The Mamas & The Papas', 'Engelbert Humperdinck', 'Jerry Lee Lewis', 'The Hollies',
        'Frankie Valli', 'John Lennon', 'George Harrison', 'Thee Sacred Souls', 'Ricky Nelson', 'The Turtles',
        'The Supremes', 'Shocking Blue', 'Dion & The Belmonts', 'Roy Orbison', 'Lou Rawls', 'Four Tops',
        'The Platters', 'The Beach Boys', 'Dionne Warwick', 'Chuck Berry', 'The Five Stairsteps', 'The Notations',
        'The Sha La Das', 'The Flamingos', 'The Ronettes', 'The Little Dippers', 'Jimmy Clanton', 'Frankie Avalon',
        'Paul Anka', 'Patti Page', 'Cass Elliot', 'Ronnie McDowell', 'She & Him', 'Ritchie Valens', '10cc',
        'Tommy James & The Shondells', 'Jim Croce', 'Bread', 'Seals and Crofts', 'Todd Rundgren', 'Chicago',
        'Gerry Rafferty', 'Lola Marsh', 'The San Francisco TKOs', 'Thee Sinseers', 'Los Tranquilos', 'Los Buenos',
        'The Cheaters', 'Wayne Newton'
    ]),
    ('bolero-eterno', 'Bolero Eterno', 'Baladas, boleros y románticas de siempre: José José, Luis Miguel, Los Tres Caballeros, Germán Valdés "Tin Tan", Los Solitarios y Alejandro Sanz.', [
        'José José', 'Luis Miguel', 'Los Tres Caballeros', 'Germán Valdés "Tin Tan"', 'Los Solitarios',
        'Alejandro Sanz', 'Nelson Ned', "Los Freddy's", 'La Sonora Santanera', 'Jeanette', 'Juan Gabriel',
        "Los Baby's", 'Grupo Santa Cecilia', 'Victor Yturbe "El Piruli"', 'María de Jesús Vázquez',
        'Lalo Rodriguez'
    ]),
    ('brillo-kpop', 'Brillo K-pop', 'K-pop de escenario: ENHYPEN, BTS, Stray Kids, EXO, LNGSHOT y TOMORROW X TOGETHER.', [
        'ENHYPEN', 'BTS', 'Stray Kids', 'EXO', 'LNGSHOT', 'TOMORROW X TOGETHER', 'CORTIS', 'ATEEZ', 'GOT7', 'NCT',
        'WayV', 'P1Harmony', 'TAEMIN', 'j-hope', 'KAI', 'NewJeans', 'Wonder Girls', 'ATARASHII GAKKO!', 'NCT 127',
        'LE SSERAFIM', 'KATSEYE', 'KARD', 'SHINee', 'X1', 'B.I', 'YEONJUN', 'Jackson Wang', 'Dynamicduo',
        "Girls' Generation-Oh!GG", 'ONE OR EIGHT', 'XG', 'Jay Park', 'Jung Kook', 'JAEHYUN', 'LEEHI'
    ]),
]

DEFAULT_PLAYLIST = 'sueno-pastel'

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


# ---------- Géneros de verdad (tools/generos.py) ----------
from generos import GENEROS, POR_PLAYLIST, ARTISTAS  # noqa: E402

GENERO_INDICE = {clave: i for i, (clave, _) in enumerate(GENEROS)}
ARTISTA_GENEROS = {artist_key(a): g.split() for a, g in ARTISTAS.items()}


def generos_de(track):
    """Géneros de una canción: los de su primer artista con géneros apuntados o los de su playlist."""
    for artist in str(track['artist']).split(','):
        key = artist_key(artist)
        if key in ARTISTA_GENEROS:
            return ARTISTA_GENEROS[key]
        if key in ARTIST_PLAYLIST:
            return POR_PLAYLIST[ARTIST_PLAYLIST[key]].split()
    return POR_PLAYLIST[DEFAULT_PLAYLIST].split()


def generos_catalogo(tracks):
    """{'lista': nombres, 'canciones': {id: '3.7'}} (índices en la lista, el principal primero)."""
    usadas = {g for v in list(POR_PLAYLIST.values()) + list(ARTISTAS.values()) for g in v.split()}
    desconocidas = usadas - set(GENERO_INDICE)
    if desconocidas:
        raise SystemExit(f'tools/generos.py: géneros que no están en GENEROS: {sorted(desconocidas)}')
    faltan = {pid for pid, *_ in PLAYLISTS} - set(POR_PLAYLIST)
    if faltan:
        raise SystemExit(f'tools/generos.py: playlists sin géneros en POR_PLAYLIST: {sorted(faltan)}')
    canciones = {}
    for t in tracks:
        lista = list(dict.fromkeys(generos_de(t)))
        canciones[t['id']] = '.'.join(str(GENERO_INDICE[g]) for g in lista)
    return {'lista': [nombre for _, nombre in GENEROS], 'canciones': canciones}


def song_key(t):
    # Títulos en japonés u otros alfabetos: se comparan tal cual (norm los dejaría vacíos)
    title = norm(re.sub(r'\(.*?\)|\[.*?\]', '', t['title'])) or t['title'].strip().lower()
    return title, f"{title}~{norm(str(t['artist']).split(',')[0])}"


# ---------- Enlaces para compartir ----------
# Cada canción y cada playlist tiene una página mínima en s/ con su portada en las etiquetas
# Open Graph: WhatsApp, Instagram, Telegram o iMessage leen esas etiquetas (no ejecutan JS) y
# muestran la miniatura. Quien abre el enlace va directo a la app.
SITE_URL = 'https://lukoffmon.github.io/LiquidBrush/'
SHARE_DIR = ROOT / 's'
FALLBACK_IMAGE = 'og-image.jpg'  # 1200×630: sale grande en WhatsApp, X, etc.


def share_slug(track_id):
    return re.sub(r'[^a-z0-9]+', '-', track_id.lower()).strip('-')


def share_page(title, description, image, target, kind='music.song'):
    e = lambda v: html.escape(str(v), quote=True)
    url = SITE_URL + image
    wide = image == FALLBACK_IMAGE
    width, height = ('1200', '630') if wide else ('600', '600')
    card = 'summary_large_image' if wide else 'summary'
    return f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{e(title)} — Liquid Bullet</title>
<meta name="description" content="{e(description)}">
<meta property="og:site_name" content="Liquid Bullet">
<meta property="og:type" content="{kind}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:image" content="{e(url)}">
<meta property="og:image:width" content="{width}">
<meta property="og:image:height" content="{height}">
<meta name="twitter:card" content="{card}">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(description)}">
<meta name="twitter:image" content="{e(url)}">
<meta name="theme-color" content="#100d1c">
<link rel="icon" href="../logo.svg" type="image/svg+xml">
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#100d1c;color:#f1eefc;font:16px system-ui,sans-serif;text-align:center}}img{{width:180px;height:180px;border-radius:22px;object-fit:cover}}a{{color:#7ef9ff}}</style>
<script>location.replace('../' + {json.dumps(target)} + location.hash);</script>
</head>
<body>
<main><img src="../{e(image)}" alt=""><h1>{e(title)}</h1><p><a href="../{e(target)}">Abrir en Liquid Bullet</a></p></main>
</body>
</html>
'''


# ---------- Portadas de canciones ----------
# Cada canción lleva uno de los iconos de covers/songs/ (song-NN.jpg). El reparto es aleatorio pero
# equilibrado (cada icono se usa casi las mismas veces) y estable: una canción conserva su icono al
# regenerar, las nuevas reciben el icono menos usado y, si se suman iconos, algunas canciones
# pasan a los nuevos para que todos queden parejos.
SONG_COVER_DIR = ROOT / 'covers' / 'songs'


def assign_song_covers(tracks, previous_files, previous_map):
    files = [p.name for p in sorted(SONG_COVER_DIR.glob('song-[0-9][0-9].jpg'))]
    if not files:
        return [], {}
    ids = {t['id'] for t in tracks}
    kept = {}
    for tid, index in previous_map.items():
        name = Path(previous_files[index]).name if isinstance(index, int) and 0 <= index < len(previous_files) else None
        if tid in ids and name in files:
            kept[tid] = name
    counts = {name: 0 for name in files}
    for name in kept.values():
        counts[name] += 1
    rng = random.Random(20261103)
    pending = sorted(ids - kept.keys())
    rng.shuffle(pending)
    for tid in pending:
        low = min(counts.values())
        name = rng.choice([n for n in files if counts[n] == low])
        kept[tid] = name
        counts[name] += 1
    # Iconos nuevos: pasan canciones al azar desde los más usados hasta quedar parejos
    while max(counts.values()) - min(counts.values()) > 1:
        most = max(files, key=lambda n: (counts[n], n))
        least = min(files, key=lambda n: (counts[n], n))
        tid = rng.choice(sorted(t for t, n in kept.items() if n == most))
        kept[tid] = least
        counts[most] -= 1
        counts[least] += 1
    index = {name: i for i, name in enumerate(files)}
    return [f'covers/songs/{n}' for n in files], {tid: index[kept[tid]] for tid in sorted(kept)}


def write_share_pages(tracks, playlists, song_cover_of=None):
    SHARE_DIR.mkdir(exist_ok=True)
    cover_of = {p['id']: (p['cover']['src'] if p['cover']['type'] == 'image' else FALLBACK_IMAGE) for p in playlists}
    by_track = {tid: p for p in playlists for tid in p['trackIds']}
    # Las copias que no están en ninguna playlist toman la de la copia que se quedó
    by_song = {song_key(t)[1]: by_track[t['id']] for t in tracks if t['id'] in by_track}
    pages = {}
    for p in playlists:
        pages[f"p-{p['id']}.html"] = share_page(
            p['name'], f"Playlist · {len(p['trackIds'])} canciones · {p['description']}",
            cover_of[p['id']], f"?p={urllib.parse.quote(p['id'])}", 'music.playlist')
    for t in tracks:
        pl = by_track.get(t['id']) or by_song.get(song_key(t)[1])
        artist = t['artist'] or 'Liquid Bullet'
        description = f"{artist} · {pl['name']}" if pl else artist
        name = f"t-{share_slug(t['id'])}.html"
        if name in pages:
            raise SystemExit(f'Enlace repetido: {name}')
        image = (song_cover_of or {}).get(t['id']) or (cover_of[pl['id']] if pl else FALLBACK_IMAGE)
        pages[name] = share_page(f"{t['title']} · {artist}" if t['artist'] else t['title'], description,
                                 image, f"?t={urllib.parse.quote(t['id'])}")
    # Mezclas de "Mis playlists": la lista va en el enlace (#…), la miniatura es el logo
    pages['mix.html'] = share_page('Una playlist para ti', 'Ábrela en Liquid Bullet: música que se derrite.', FALLBACK_IMAGE, '?mix=1', 'music.playlist')
    for old in SHARE_DIR.glob('*.html'):
        if old.name not in pages:
            old.unlink()
    for name, body in pages.items():
        path = SHARE_DIR / name
        if not path.exists() or path.read_text(encoding='utf-8') != body:
            path.write_text(body, encoding='utf-8')
    return len(pages)


# ---------- Música nueva en el parche ----------
# Cada vez que se suma música, las canciones nuevas (las que no estaban en el catálogo anterior)
# se apuntan en novedades.json → "nuevaMusica". tools/bump_version.py las pasa a la versión que se
# publica ("songs"), y la app las lista en el aviso de actualización y en Ajustes → Novedades.
NOVEDADES = ROOT / 'novedades.json'


def note_new_music(unique, previous):
    known = set((previous or {}).get('genres', {}))
    if not known or not NOVEDADES.exists():
        return 0
    data = json.loads(NOVEDADES.read_text(encoding='utf-8'))
    pending = [s for s in data.get('nuevaMusica', []) if isinstance(s, dict)]
    have = {s.get('id') for s in pending}
    for release in data.get('releases', []):
        have.update(s.get('id') for s in release.get('songs', []) if isinstance(s, dict))
    added = [{'id': t['id'], 'artist': t['artist'], 'title': t['title']}
             for t in unique if t['id'] not in known and t['id'] not in have]
    if not added:
        return 0
    data['nuevaMusica'] = pending + added
    NOVEDADES.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return len(added)


def main():
    tracks = load_tracks()

    # Una sola copia por canción (misma canción y mismo artista principal)
    seen, unique = set(), []
    for t in tracks:
        # Títulos en japonés u otros alfabetos: se comparan tal cual (norm los dejaría vacíos)
        title, key = song_key(t)
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
    # Y sus géneros de verdad (Rock, Indie…), para filtrar la biblioteca: ver tools/generos.py
    generos = generos_catalogo(tracks)

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
            if pid in ART_SLOT_KEPT:
                art_i += 1
        elif i in image_slots:
            cover = {'type': 'image', 'src': f'covers/cover-{images.pop():02d}.jpg'}
        else:
            cover = {'type': 'art', 'style': ART_STYLES[art_i % len(ART_STYLES)], 'color': art_colors[art_i % len(art_colors)]}
            art_i += 1
        out.append({'id': pid, 'name': name, 'description': description, 'cover': cover, 'trackIds': [t['id'] for t in items]})

    # Copias borradas del bucket por ser idénticas a otra: la app redirige favoritas y playlists propias
    aliases_file = ROOT / 'tools' / 'aliases.json'
    aliases = json.loads(aliases_file.read_text(encoding='utf-8')) if aliases_file.exists() else {}
    previous = {}
    if (ROOT / 'catalog.json').exists():
        previous = json.loads((ROOT / 'catalog.json').read_text(encoding='utf-8'))
    # Los iconos se reparten entre las canciones que se ven (sin copias), así cada icono sale las
    # mismas veces en la app (o con una de diferencia). Cada copia oculta lleva el icono de su original.
    song_files, song_covers = assign_song_covers(unique, previous.get('songCoverFiles', []), previous.get('songCovers', {}))
    original = {song_key(t)[1]: t['id'] for t in unique}
    for t in tracks:
        if t['id'] in song_covers:
            continue
        twin = original.get(song_key(t)[1])
        if twin in song_covers:
            song_covers[t['id']] = song_covers[twin]
        elif song_files:
            # Excluida de las playlists (no se ve): un icono fijo según su id
            song_covers[t['id']] = int(hashlib.md5(t['id'].encode()).hexdigest(), 16) % len(song_files)
    nuevas = note_new_music(unique, previous)
    catalog = {'version': 1, 'genres': genres, 'generos': generos, 'playlists': out, 'aliases': aliases,
               'songCoverFiles': song_files, 'songCovers': song_covers}
    (ROOT / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding='utf-8')
    shared = write_share_pages(tracks, out, {tid: song_files[i] for tid, i in song_covers.items()})
    # Se cuentan las canciones que se ven en la app (sin copias): ahí es donde deben salir parejos
    uses = {i: 0 for i in range(len(song_files))}
    for t in unique:
        uses[song_covers[t['id']]] += 1
    if uses:
        print(f'Portadas de canciones: {len(song_files)} iconos, entre {min(uses.values())} y {max(uses.values())} canciones cada uno')
    print(f'{shared} páginas para compartir en s/')
    covered = sum(len(p['trackIds']) for p in out)
    print(f'{len(tracks)} canciones, {len(unique)} únicas, {covered} en {len(out)} playlists')
    for p in out:
        print(f"  {len(p['trackIds']):4d}  {p['name']}  [{p['cover']['type']}]")
    if nuevas:
        print(f'Música nueva: {nuevas} canciones apuntadas en novedades.json (nuevaMusica); bump_version.py las pasa al parche')
    if unknown:
        print(f'Artistas sin playlist (van a {names[DEFAULT_PLAYLIST]}): ' + ', '.join(sorted(unknown)))
    # Toda la música en un TXT para la Biblioteca de imágenes (musica-liquid.txt)
    import build_music_list
    build_music_list.main()


if __name__ == '__main__':
    main()
