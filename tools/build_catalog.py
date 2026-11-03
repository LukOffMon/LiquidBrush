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
    'cuarto-pastel': 13,
    'seda-nocturna': 9,
    'acido-lento': 7,
    'lluvia-lenta': 3,
    'neon-eterno': 15,
    'brillo-disco': 6,
    'perreo-nocturno': 14,
    'dembow-anejo': 8,
    'trap-lunar': 11,
    'rima-cruda': 5,
    'trueno-clasico': 12,
    'humo-dorado': 2,
    'vinilo-rosa': 10,
    'seul-brillante': 1,
    'tokio-electrico': 4,
    'riviera-francesa': 16,
    'verano-tropical': 17,
    'ciudad-furia': 18,
    'nube-purpura': 19,
    'tekk-fantasma': 20,
    'senal-rota': 21,
    'corazon-roto': 22,
    'ola-fria': 23,
    'barrio-sur': 24,
    'calle-cromo': 25,
    'alma-latina': 26
}

# Playlists que antes llevaban diseño generado y ahora tienen imagen: siguen ocupando su turno
# para que las demás no cambien de diseño al regenerar el catálogo.
ART_SLOT_KEPT = {'tekk-fantasma'}
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
    ('cuarto-pastel', 'Cuarto Pastel', 'Bedroom pop y pop soñador: The Marías, PinkPantheress, Clairo, Malcolm Todd, beabadoobee y TV Girl.', [
        'The Marías', 'PinkPantheress', 'Malcolm Todd', 'Clairo', 'Imogen Heap', 'TV Girl', 'Grimes', 'Milky',
        'The Cardigans', 'beabadoobee', 'Cuco', 'Eyedress', 'Flight Facilities', 'JVKE',
        'Dana and Alden', 'girl in red', 'Anna of the North', 'Suki Waterhouse', 'Cafuné', 'd4vd', 'Shelly', 'rusowsky', 'Magdalena Bay', 'Coco & Clair Clair', 'The Two Lips', 'Quelle Rox', 'Yazida', 'berryblue', 'Cannelle', 'greek', 'maye', 'RPLK', 'Triathalon', 'Amber Yezel', '54 Ultra', 'Princess Chelsea', 'Mattyeux', 'Bratty', 'Katzù Oso', 'INOHA', 'The Walters', 'Will Paquin', 'Besos', 'Ramona', 'Beach Bunny', 'Alex G', 'Miniature Tigers', 'Rex Orange County', 'MARINA', 'Hank Heaven', 'The Autocollants', 'Joy Again', 'Moonshine']),
    ('seda-nocturna', 'Seda Nocturna', 'R&B y pop de madrugada: Steve Lacy, The Weeknd, Frank Ocean, SZA, Doja Cat y Kali Uchis.', [
        'Steve Lacy', 'Kali Uchis', 'Daniel Caesar', 'Ravyn Lenae', 'The Weeknd', 'Frank Ocean', 'Doja Cat', 'Rihanna',
        'Ariana Grande', 'Demi Lovato', 'SZA', 'PARTYNEXTDOOR', 'Chris Brown', 'Cassie', 'Amaarae', 'Montell Fish', 'Joji',
        'Labrinth', 'ZAYN', 'Shakira', 'JMSN', 'Justin Timberlake', 'Estelle', 'Tyler', 'Matt Martians', 'N.E.R.D',
        'WILLOW', 'Childish Gambino', 'Kaash Paige', 'Nelly Furtado', 'Selena Gomez', 'Gwen Stefani', 'Chappell Roan',
        'Billie Eilish', 'Melanie Martinez', 'Ari Abdul', 'Isabel LaRosa', 'Chris Grey', 'The Kid LAROI', 'Lily Allen',
        'Tainy', 'benny blanco', 'Wafia', 'Artemas', 'JAWNY', 'FKA twigs', 'Smerz', 'Omar Apollo', 'KAYTRANADA', 'Ambar Lucid', 'Michi', 'Helado Negro']),
    ('acido-lento', 'Ácido Lento', 'Psicodelia e indie que flota: Tame Impala, Inner Wave, Mild High Club, Crumb, The Strokes y Gorillaz.', [
        'Tame Impala', 'Gorillaz', 'Justice', 'Theophilus London', 'ZHU', 'The Strokes', 'Chris Rainbow',
        'Ax and the Hatchetmen', 'Coldplay', 'Sports', 'Cannons', 'Hotel Ugly', 'F3miii', 'Empire Of The Sun', 'Mareux',
        'Vacations', 'Foster The People', 'Inner Wave', 'Mild High Club', 'Jakob', 'Billy Uomo', 'Hector Gachan',
        'Luna Luna', 'Mark Whalen', 'Michael Seyer', "Her's", 'No Vacation', 'Divino Niño', 'Crumb', 'The Symposium',
        'Mellow Fellow', 'Banes World', 'Kowloon', 'The Buttertones', 'BOYO', 'Air', 'The Garden', 'Jean Dawson',
        'TEMPOREX', 'Dr. Dog', 'The Drums', 'Mother Mother', 'Cults', 'Dayglow',
        'Joy Again', 'Beach Weather', 'Yot Club', 'Dominic Fike', 'Nicholas Bonnin', 'Oliver Tree', 'Cage The Elephant', 'Harmless', 'Vansire', 'The Space Ocean', 'Mind’s Eye', 'Roar', 'Hot Freaks', 'Bedroom', 'Memo Boy', 'Panchiko', 'Housecall', 'Blood Nose', 'A-Wall', 'The Long Faces', 'Puzzle', 'late night drive home', 'That Handsome Devil', 'The Rare Occasions', 'Temper City', 'untitled', 'juju<3', 'Verzache', 'Seekae', 'Not For Radio', 'Orca', 'Sunshine Boysclub', 'daste.', 'Golf Trip', 'Los Retros', 'Monogem', 'El Guincho', 'Scissor Sisters', 'Phantogram', 'Santigold', 'The Cat Empire']),
    ('riviera-francesa', 'Riviera Francesa', "French touch y nu-disco de verano: Polo & Pan, L'Impératrice, Parcels, Metronomy, Miel De Montagne y Myd.", [
        'Polo & Pan', "L'Impératrice", 'Parcels', 'Metronomy', 'Miel De Montagne', 'Myd', 'Paradis', 'Flavien Berger', 'Darius', 'Clea Vincent', 'Papooz', 'Bleu Toucan', 'Alastair Lane', 'Nice Guys', 'Billy Bahama', 'Lewis OfMan', 'AGAV', 'Self Sabotage', 'Anoraak', 'NEIL FRANCES', 'Mou', 'warner case', 'Pépite', 'Miami Horror', 'Marine Neuilly', 'Else', 'Pitto', 'Eme Sarav']),
    ('lluvia-lenta', 'Lluvia Lenta', 'Melancolía de guitarra y niebla: Mac DeMarco, Radiohead, The Smiths, Jeff Buckley y Cigarettes After Sex.', [
        'Mac DeMarco', 'Jeff Buckley', 'The Smiths', 'The Cranberries', 'Suicide', 'Current Joys', 'Feist', 'The Sundays',
        'Beach House', 'Cigarettes After Sex', 'Slowdive', 'Strawberry Guy', 'Cocteau Twins', 'Arctic Monkeys', 'Weezer',
        'Portishead', 'Radiohead', 'Faye Webster', 'Lykke Li', 'John + Jane Q. Public', 'Twenty One Pilots',
        'Chase Atlantic', 'The Neighbourhood', 'Lana Del Rey', 'Mitski', 'Men I Trust', 'Matt Maltese', 'Pedro Guerra',
        'bôa', 'Frankie Cosmos', 'Liana Flores', 'Ricky Montgomery', 'Julien Marchal', 'Izzamuzzic', 'Øneheart',
        'reidenshi', 'Glaede', 'Umi Not Human', 'salvia palth', 'Sir Chloe', 'Two Feet', 'Vance Joy', 'Black Country, New Road', 'Black Country']),
    ('senal-rota', 'Señal Rota', 'Hyperpop, digicore y emo de internet: Jane Remover, underscores, kmoe, celai, guitarbf y punchy.', [
        'Jane Remover', 'kmoe', 'juno', 'underscores', 'That Kid', 'Frost Children', 'AKRIILA', 'celai', 'guitarbf', 'punchy', 'wizardjit', 'aubri!', 'kiheir', 'schizocat', 'morgue vault', 'Piggybank112', 'ankle', 'Anxiety', 'Junshi', '67', '⎍⧮⫽⩘⧅⦔⨬⧇⩕⥉⦾⫰⧪⦑⧛⨳']),
    ('tekk-fantasma', 'Ghost Case', 'Hardtekk, jumpstyle y slowed de madrugada: STØMPWRLD, ythotkk, SAIBOTAJE, Snow Strippers, DJ ZUP RAlii y akkiemi.', [
        'STØMPWRLD', 'ythotkk', 'SAIBOTAJE', 'DudePlaya', 'quincke', 'dxnkwer', 'DJ ZUP RAlii', 'angelhard', 'dopamine.', 'waypoint on noclip', 'ZXVABEAT', 'shck', 'ASKL hon', 'HALATNOST', 'cvzxeov', 'Blaulicht 112', 'STAKILLAZ', 'LXXVEME', 'akkiemi', 'xn88ax', 'YXMI', 'rukzi', 'eiby', 'DISGRACEMODE', 'Slixshøt', 'Der Aztekke', 'grindgwap', 'EL$E', 'DJ UNIVXRSEL', 'kerosyn', 'latex fruit', 'Tanin Jazz', 'Aiden Music', 'Maretu', 'Akula', 'HEXXO', 'Didi Early Rave', 'Dutch Disorder', 'skalpas', 'Vampyx', 'ZWE1HVNDXR', 'meowscles', 'dj 1lusha', 'Ivan Giannovani', 'dj trippie flameboy', 'play it twice', 'Dj Svevsx', 'Marc Acardipane', 'ilyhiryu', 'vyrval', 'ovg!', 'Daniela Alvira', 'vivi baby', 'Remika', 'Stxlkin', 'luvwillow', 'decaying', 'relapse', 'Stady', 'chrmbchrmb', 'Console Allstars', 'rusino', 'Isaac Reign', 'Miss Papaya', 'Fixupboy', 'Deezo', 'Batro', 'Tokyo Ghetto Pussy', 'Janina', 'luu', 'leafonia', 'rukiawaa', 'Snow Strippers', 'Goreshit', 'Resonant']),
    ('corazon-roto', 'Corazón Roto', 'Emo y scenecore de internet: pupsies, Punkinloveee, h4rtbrkr, Boy Fantasy, Beach Bunny en bajón y Cuntsniffer.', [
        'pupsies', 'Punkinloveee', 'Boy Fantasy', 'Aidan Swank', 'pichuu', 'bloodsekai', 'odihu', 'blair', 'h4teboy', 'morgue', 'korpsebunny', 'backw666s', 'Rebzyyx', 'lexycat', 'dolldamage', 'thai body dump', 'Broken Toy Airplanes', 'disoc8', 'flywoah', 'iamsodead', 'duskydemise', 'duskydemise archive', 'voidvoice717', 'kofun', 'Lida', 's0rrow', 's0nder', 'mthu', 'h4rtbrkr', 'Cuntsniffer', 'Parting Gift', 'Clarion', 'twentythree', 'i wanna be a jack-o-lantern', 'Mistvale', 'zombiwebz', 'crayon', 'shambles', 'retardead', 'coldwntr', 'Belowground', 'spawncamped', 'Anhero', 'Lil Watermark', 'redize', 'kaysnoto', 'Crustsox', 'Loser64', 'Fried By Fluoride', 'overtonight', 'wifiskeleton', 'laydownrot', 'LyteSpeed', 'Mars Argo', '1stress', 'tnfmb', 'proderics', 'Stxlkin']),
    ('ola-fria', 'Ola Fría', 'Post-punk ruso, coldwave y doomer: Kino, Intelligency, Crystal Castles, Soft Blade, NEMIGA y SEREBRO.', [
        'Kino', 'Crystal Castles', 'Intelligency', 'Soft Blade', 'SEREBRO', 'Pompeya', 'NEMIGA', 'ALYSS', 'Dj Kazantip', 'Sexy Sushi', 'Garcon Maigre', 'ta1ls', 'Aests', 'Maple', 'ONDA ANDAR', 'егорbez', 'Moya Mishel', 'Luna', 'Eldzhey', 'angel vox', 'My', 'Перемотка', 'Антоха МС', 'Марія Чайковська', 'Михей', 'Girls Rituals', 'N95', 'DJ Quads', 'cg', 'Czxxze', 'theroux', 'Aircraft', 'Molchat Doma', 'Gradusy', 'IOWA', 'Irma', 'Buerak', 'Tima Belorusskih', 'Masha i Medvedi', 'Lolita', 'MIGAS', 'plenka', 'ZXNITH', 'Kill Eva', 'whylovly', 'Qypedo', 'edwuard', 'Второй Ка', 'Дайте танк (!)', 'Катя Лель', 'Сова', 'конец солнечных дней', 'лезвием ножа.', '10дней', 'слушай экзорцист']),
    ('neon-eterno', 'Neón Eterno', 'Synth pop de los 80, eurodance de los 90 y pista de los 2000: Depeche Mode, Haddaway, Daft Punk y Black Eyed Peas.', [
        'Depeche Mode', 'Bronski Beat', 'Men At Work', 'Soft Cell', 'Chris Isaak', 'Blondie', 'Eurythmics',
        'Laura Branigan', 'R.E.M.', 'A Flock Of Seagulls', 'The Human League', 'Billy Idol', 'Daryl Hall & John Oates',
        'Simple Minds', 'Real Life', 'Michael Sembello', 'The Smashing Pumpkins', 'The Verve', 'Tears For Fears',
        'The Cars', 'New Order', 'Joy Division', 'Duran Duran', 'When In Rome', 'Twin Tribes', 'The Cure', 'The Romantics',
        'Orchestral Manoeuvres In The Dark', 'The Police', 'Blur', 'Spandau Ballet', 'Alice Deejay', 'Andronicus',
        'Michael Gray', 'Crystal Waters', 'Robert Miles', 'Bob Sinclar', 'Modjo', 'La Bouche', 'Haddaway', 'Ace of Base',
        'Mr. President', 'Global Deejays', 'Technotronic', 'Scatman John', 'Timbaland', 'David Guetta', 'Kylie Minogue',
        'Madonna', 'Eiffel 65', 'Stardust', 'Darude', 'Stromae', 'Junior Senior', 'will.i.am', 'Flo Rida',
        'Black Eyed Peas', 'LMFAO', 'SNAP!', 'Culture Beat', 'Calvin Harris', 'Daft Punk', 'Gesaffelstein',
        'M83', 'Yeah Yeah Yeahs', 'Aaron Smith', 'Olivia Newton-John', 'Emmanuel', 'Gloria Estefan', 'The Rah Band', ]),
    ('brillo-disco', 'Brillo Disco', 'Disco, funk y soul para la pista: Michael Jackson, Bee Gees, Earth, Wind & Fire, Prince y Stevie Wonder.', [
        'Michael Jackson', 'Paul McCartney', 'Bee Gees', 'Barry White', 'Earth', 'Kool & The Gang', 'Patrice Rushen',
        'A Taste Of Honey', 'KC & The Sunshine Band', 'Rick James', 'Bobby Caldwell', 'George Michael', 'Grover Washington',
        'Rod Stewart', 'Player', 'Bob Marley & The Wailers', 'Jamiroquai', 'Baccara', 'Tavares', 'Gloria Gaynor', 'ABBA',
        'Andy Gibb', 'Diana Ross', 'Stevie Wonder', 'Prince', 'Marvin Gaye']),
    ('perreo-nocturno', 'Perreo Nocturno', 'Neoperreo, dembow mexa y club latino: DENNA LA PORRI, Doony Graff, Yeyo, Jose Alatorre, MJ Nebreda y funk brasileño.', [
        'La Obsesion', 'Jose Alatorre', 'DENNA LA PORRI', 'Doony Graff', 'Yeyo', 'Sayuri & Sopholov', 'La Vendicion',
        'Nana Nina', 'La Mafia del Amor', 'JAYSEE', 'hennessyyy', 'Yng Lvcas', 'Cachirula', 'Veronica', 'Nasty Vato',
        'Kinto Piso', 'La Zanta Xit', 'TBX', 'Alanis Yuki', 'Jessvel Peyret', 'xosa', 'LoveUikari', 'nusar3000',
        'Ya Ice Dilan', 'El Bogueto', 'Lil Bru', 'Mike', 'Kauxx', 'MC Sam', 'Macaia', 'Aln MC', 'Je Tupinikin', 'DJ Cozy',
        'VULGO', 'Rayo & Toby', 'Gonzalo Genek', 'Anestesia', 'Bb trickz', 'lila sky', 'Chzter', 'Cherry Chola', '1tbsp',
        'MJ Nebreda', 'Sajiva', 'Midfug', 'La Zowi', 'Ruzzo Doblezz', 'Wk', 'Mime 871', 'Simpson Ahuevo', 'Mike Lamadrid',
        '3BallMTY', 'CA7RIEL & Paco Amoroso', 'DJ ROOTS', 'Tramposos', 'Foudeqush', 'Cortex', 'ROSALÍA', 'AQUIHAYAQUIHAY',
        'LATIN MAFIA', 'Delinquent', 'ShyBully', 'Juanpa Gordoa', '3delincuentes', 'A.C.O', 'Bizor',
        'Bolishe One', 'FLVCKKA', 'Joss ML', 'Enayy', 'Alicia te quiero', 'MXLVIXJE', 'morenoguapo', 'Muelas De Gallo',
        'Ivan de la Rioja', 'Angelicca', 'iza tkm', 'la intimidad', 'paxheko', 'Yered!!', 'Dinamarca']),
    ('barrio-sur', 'Barrio Sur', 'Trap romántico y cumbia rkt de Argentina: One Flyt, JCKC, tomas metrikf, Sosa 66s y T4CHO.', [
        'One Flyt', 'JCKC', 'tomas metrikf', 'Vasti Yan', 'Sosa 66s', 'T4CHO', 'Cerounno', 'Troubless', 'Malandro', 'Ema', 'Ilsmokee', 'Deyco', 'Nazareno gutierrez', 'Carrion GodBle$$', 'T&K', '008RACCA', 'Gabryel', 'Lizorzo', 'Klens', 'Cheim', 'Franky Style', 'Niño Condor', 'Tian vck', 'Mugshot', 'ESE MG', 'Natán', 'GZ', 'MECHAYRXMEO', 'wrld one', 'CORBA']),
    ('calle-cromo', 'Calle Cromo', 'La nueva escuela española: Stereo Madness, Guxo, Lu Jr, LEÏTI, Enry-K, Ralphie Choo y superreservao.', [
        'Stereo Madness', 'Guxo', 'Lu Jr', 'LEÏTI', 'D.Valentino', 'Enry-K', 'Teo Lucadamo', 'ukd', 'Gatti', 'WEST DUBAI', 'mita', 'SAM DAVIES', 'UGLY', 'Icy Vedo', 'Ralphie Choo', 'duna', 'superreservao', 'Estrellas Del Rap Nacional', 'Nico', 'Semon', "L'haine", 'Fuji', 'Elio Toffana']),
    ('dembow-anejo', 'Dembow Añejo', 'Reggaetón de la vieja escuela y cumbia: Daddy Yankee, Don Omar, Arcángel, Wisin & Yandel y Kumbia Kings.', [
        'Daddy Yankee', 'Don Omar', 'Arcángel', 'Arcangel', 'Wisin & Yandel', 'Yandel', 'Plan B', 'J Alvarez',
        'Jowell & Randy', 'Tony Dize', 'Angel Y Khriz', 'Héctor "El Father"', 'Randy Nota Loca', 'Ivy Queen',
        'Yaga & Mackie', 'Baby Rasta y Gringo', 'Sammy & Falsetto', 'Ñengo Flow', 'Nengo Flow', 'Zion', 'Alex Rose',
        'Reykon', 'Maluma', 'Farruko', 'DJ Luian', 'Franco "El Gorilla"', 'A.B. Quintanilla III',
        'A.B. Quintanilla III Y Los Kumbia Kings', 'Kumbia Kings', 'Cruz Martinez presenta Los Super Reyes', 'Impacto Mc',
        'Calo', 'Millonario & W. Corona', 'El Pelón del Mikrophone', 'América Sierra', 'Los Telez', 'Xandy Almeida']),
    ('trap-lunar', 'Trap Lunar', 'Trap latino para la madrugada: Yan Block, Omar Courtz, Bad Bunny, Duki, Myke Towers y Bryant Myers.', [
        'Yan Block', 'Omar Courtz', 'Bad Bunny', 'Rauw Alejandro', 'Myke Towers', 'Cris MJ', 'Bryant Myers', 'Jon Z',
        'Pablo Chill-E', 'Young Cister', 'SAIKO', 'Pressure 9X19', 'Aleman', 'Alemán', 'Luigi 21 Plus', 'Slayter', 'ROA',
        'Lil Naay', 'J Abdiel', 'Jay Wheeler', 'Duki', 'YSY A', 'Novato El Flow', 'Boy Wonder CF', 'Trap Capos',
        'FloyyMenor', 'KAROL G', 'Maria Becerra', 'Nicki Nicole', 'Emilia', 'LIT killah', 'Bardero$', 'C.R.O',
        'Alex Gargolas', 'Lxmb Gold', 'JOSTIN JA', 'KIDDWERO', 'Tokischa']),
    ('rima-cruda', 'Rima Cruda', 'Rap en español y de EE. UU.: Cruzzi, Charles Ans, Gera MX, Kendrick Lamar, Drake y Canserbero.', [
        'Cruzzi', 'Charles Ans', 'Gera MX', 'Adan Cruz', 'Milo j', 'Delaossa', 'Choclock', 'Flavio Rodriguez', 'Ka-b',
        'C. Tangana', 'Trueno', 'Rels B', 'Neto Peña', 'Señor Marrano', 'The Guadaloops', 'Canserbero', 'Micro TDH',
        'Bhavi', 'Drake', 'Kendrick Lamar', 'Travis Scott', 'Kanye West', 'XXXTENTACION', 'G-Eazy', 'French Montana',
        'Nafeesisboujee', 'Jordan Adetunji', 'Metro Boomin', 'A AP Ferg', 'Mac Miller', 'Felp 22', 'Shamanes Crew',
        'Robot95', 'Logan Hate', 'Armand Hammer', 'Kaydy Cain', 'Ana Tijoux']),
    ('nube-purpura', 'Nube Púrpura', 'Cloud rap, plugg y underground: LUCKI, Lelo, void, empireofyu, Xavier Wulf, Trefuego y Yung Lean.', [
        'LUCKI', 'Lucki', 'Lelo', 'void', 'empireofyu', 'khxznq', 'ProdWithFlavor', 'Trefuego', 'Xavier Wulf', 'BONES', 'Spaceli Vietnam', 'Khalil', 'Kuhsigh', 'QUANTRELL', 'BashfortheWorld', 'Sharkey', 'Zachariehs', 'Kingman Irving', 'Manny Laurenko', 'Savvy Melado', 'ilyTOMMY', 'dedwrite', 'VVS $.', '22francc', 'Barretta', 'dreaming.', 'Ejmonix', 'KYSLINGO', 'LandonBeck', 'FLVSHY', 'Trey Bands', 'reptilianshrine', 'Big Tonka Cuh', 'ssjishmael', 'GHOSTYY', 'sativa', 'Lil Maru', 'kush', 'neptune', 'feelinmyself', 'C Choppa', 'CHASETHEMONEY', 'Harrykahanhai', 'Paulie Leparik', 'skyemane', 'Freddie Dredd', 'Yung Lean', 'are you really fine?', 'Sematary']),
    ('trueno-clasico', 'Trueno Clásico', 'Rock de colección y metal: Deep Purple, AC/DC, Led Zeppelin, Queen, Metallica y Pink Floyd.', [
        'Santana', 'Queen', 'Elton John', 'America', 'Fleetwood Mac', 'Pink Floyd', 'Maroon 5', 'Crowded House',
        'Deep Purple', 'Led Zeppelin', 'No Doubt', 'The Kinks', 'Electric Light Orchestra', 'The Rolling Stones',
        'Lenny Kravitz', 'AC/DC', 'Black Sabbath', 'Eagles', 'Joe Walsh', 'Green Day', 'Audioslave', 'The Doors', 'Cream',
        'Pantera', 'KISS', 'Derek & The Dominos', 'Metallica', 'Linkin Park', 'Van Halen', "Guns N' Roses", 'David Bowie',
        'Foghat', 'Red Hot Chili Peppers', 'Nirvana', 'Yes', 'Mountain', 'The Dirty Mac', 'Iron Maiden', 'Megadeth',
        'George Thorogood & The Destroyers', 'UFO', 'Blue Öyster Cult', 'Almendra', 'Serú Girán',
        'Seru Giran', 'Pescado Rabioso', 'Los Pericos', 'Los Cafres', 'Pierce The Veil', 'Sleeping With Sirens', 'Whitesnake']),
    ('ciudad-furia', 'Ciudad Furia', 'Rock en español de culto: Soda Stereo, Los Bunkers, Cerati, Enanitos Verdes, Café Tacvba y Los Prisioneros.', [
        'Soda Stereo', 'Gustavo Cerati', 'Los Bunkers', 'Los Prisioneros', 'Los Enanitos Verdes', 'Café Tacvba', 'Andrés Calamaro', 'Andres Calamaro', 'Los Abuelos De La Nada', 'Charly García', 'Charly Garcia', 'Hombres G', 'Fito Paez', 'Los Rodriguez', 'Babasonicos', 'Spinetta Jade', 'Mikel Erentxun', 'Duncan Dhu', 'Vilma Palma e Vampiros', 'Los Tres', 'Indios', 'La Gusana Ciega', 'Viejas Locas', 'Danza Invisible', 'Maldita Vecindad Y Los Hijos Del 5to. Patio', 'Los Auténticos Decadentes', 'Los Tetas', 'La Unión', 'La Mosca', 'Miranda!', 'Glup!', 'Odisseo', 'Surfistas Del Sistema', 'Macha Y El Bloque Depresivo', 'Chico Trujillo', 'Bandalos Chinos', 'Julius Popper', 'Esteman', 'León Larregui']),
    ('alma-latina', 'Alma Latina', 'Indie y alternativo latino: Mon Laferte, Zoé, Natalia Lafourcade, Little Jesus, Chicano Batman y Buscabulla.', [
        'Mon Laferte', 'Zoé', 'Natalia Lafourcade', 'Julieta Venegas', 'Carla Morrison', 'Little Jesus', 'Siddhartha', 'Ed Maverick', 'Vanessa Zamora', 'Ximena Sariñana', 'Silvana Estrada', 'Caloncho', 'La Vida Bohème', 'Buscabulla', 'Monsieur Periné', 'Chicano Batman', 'Jósean Log', 'Me Estás Matando', 'Elsa y Elmar', 'Manu Chao', 'Jasper', 'RENEE', 'Okills', 'Technicolor Fabrics', 'Camilo Séptimo', 'Cienfue', 'Gepe', 'Estereomance', 'Los Espiritus', '424', 'Protistas', 'MKRNI', 'Diamante Eléctrico', 'TOURISTA', 'Marineros', 'Teleradio Donoso', 'Rey Pila', 'Reyno', 'Tita', 'Los Wálters', 'Conociendo Rusia', 'CLUBZ', '¿Téo?', 'Adanowsky', 'Arawato', 'Chango Menas', 'Comisario Pantera', 'Duck Fizz', 'El Zar', 'Gustavo Castellanos', 'Isla de Caras', 'Las Ligas Menores', 'babas tutsipop']),
    ('verano-tropical', 'Verano Tropical', 'Cumbia pop e indie bailable: YoSoyMatt, Eva de Marce, Los Eclipses, Disco Bahía, ZTVZ y Karen y Los Remedios.', [
        'YoSoyMatt', 'Eva de Marce', 'Los Eclipses', 'Karen y Los Remedios', 'Disco Bahía', 'ZTVZ', 'LaDí', 'le venado', 'Weste', 'Soultade', 'vonnside', 'Chloé Silva', 'CERO39', 'Acid Coco', 'MIEL', 'Tenda', 'Todo El Verano', 'Real Cumbia Activa RCA', 'chicarica', 'PANTERA BLUE', 'Jaycc', 'Tutankhamun', 'Perro Salchicha', 'Shmiks', 'Tati Falco', 'Emally Villa', 'Elia y Elizabeth', 'French Braids', 'Epilogio', 'NAFTA', 'Los Amigos Invisibles', 'Vita Set', 'Young Tender', 'Plastical People', 'Mermelada de Pepino', 'Daniel Craft', 'Bobui']),
    ('humo-dorado', 'Humo Dorado', 'Jazz, fusión y crooners: Frank Sinatra, Julie London, Chet Baker, Ella Fitzgerald, Thundercat y Sade.', [
        'Frank Sinatra', 'Frank Sark', 'Antônio Carlos Jobim', 'Catherine Russell', 'Al Bowlly', 'Stan Getz',
        'Julie London', 'Tommy Dorsey', 'Chet Baker', 'Dean Martin', 'Henry Mancini', 'Etta James', 'Nat King Cole Trio',
        'Sarah Vaughan', 'Irene Kral', 'Ella Fitzgerald', "Anita O'Day", 'Billie Holiday', 'Ava Gardner',
        'Ernestine Anderson', 'Etta Jones', 'The Mills Brothers', 'Ray Charles', 'John Coltrane Quartet', 'John Coltrane',
        'Jack Jones', 'Jeri Southern', 'Lester Young', 'Kay Starr', 'Dakota Staton', 'Lorez Alexandria', 'Doris Day',
        'Peggy Lee', 'Wayne Newton', 'Sade', 'Laufey', 'Celeste', 'Olivia Dean', 'Amy Winehouse', 'Ebony Loren',
        'Durand Jones & The Indications', 'The Dave Brubeck Quartet', 'Martial Solal', 'Thundercat', 'DOMi & JD BECK',
        'Paul Grant', 'Ley Soul', 'Gotts Street Park', 'kuala', 'The Brothers Nylon', 'berlioz', 'ridgeclub',
        'Jean-Luc Ponty', 'Flea', 'Molly Lewis', 'Weather Report', 'Professor Creepshow', 'jomm',
        'John Wasson', 'Bolden.', 'Siberia', 'Patchwork Inc.', 'Macabre Plaza', 'Hank Levy', 'Aurora Ave.',
        'Nathanial Young', 'SERAPHINE NOIR', 'SEQUOIA', 'Evan Jacobson', 'Rob Araujo', 'Chihiro Yamanaka']),
    ('vinilo-rosa', 'Vinilo Rosa', 'Pop, doo-wop y soul de los 50 a los 70: Tom Jones, Brenda Lee, The Ronettes, Carpenters y The Beatles.', [
        'Tom Jones', 'Ricky Nelson', 'The Mamas & The Papas', 'The Turtles', 'Lesley Gore', 'Dusty Springfield',
        'Engelbert Humperdinck', 'Jerry Lee Lewis', 'Brenda Lee', 'Carpenters', "Gilbert O'Sullivan", 'The Supremes',
        'Shocking Blue', 'Dion & The Belmonts', 'Roy Orbison', 'Lou Rawls', 'Four Tops', 'The Platters', 'The Beach Boys',
        'Dionne Warwick', 'Chuck Berry', 'The Hollies', 'The Beatles', 'The Five Stairsteps', 'The Notations',
        'The Sha La Das', 'The Flamingos', 'The Ronettes', 'The Little Dippers', 'Jimmy Clanton', 'Frankie Avalon',
        'Paul Anka', 'Patti Page', 'Frankie Valli', 'Cass Elliot', 'Ronnie McDowell', 'John Lennon', 'She & Him']),
    ('seul-brillante', 'Seúl Brillante', 'K-pop de escenario: ENHYPEN, BTS, Stray Kids, EXO, ATEEZ, NewJeans y TXT.', [
        'ENHYPEN', 'BTS', 'Stray Kids', 'EXO', 'TOMORROW X TOGETHER', 'GOT7', 'NCT', 'NCT 127', 'WayV', 'P1Harmony',
        'TAEMIN', 'j-hope', 'CORTIS', 'LNGSHOT', 'LE SSERAFIM', 'KATSEYE', 'KARD', 'SHINee', 'X1', 'B.I', 'KAI', 'YEONJUN',
        'Jackson Wang', 'Dynamicduo', "Girls' Generation-Oh!GG", 'NewJeans', 'ONE OR EIGHT', 'ATEEZ', 'XG', 'Jay Park',
        'Jung Kook', 'JAEHYUN', 'LEEHI', 'Wonder Girls']),
    ('tokio-electrico', 'Tokio Eléctrico', 'J-rock, kawaii metal y city pop: BABYMETAL, Hanabie, ATARASHII GAKKO! y Masayoshi Takanaka.', [
        'Masayoshi Takanaka', 'BABYMETAL', 'Broken By The Scream', '花冷え。', 'KAQRIYOTERROR', 'ATARASHII GAKKO!', 'LADYBABY',
        'Yousei Teikoku', 'the peggies', 'Fujii Kaze', 'Lamp']),
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
FALLBACK_IMAGE = 'icon-512.png'


def share_slug(track_id):
    return re.sub(r'[^a-z0-9]+', '-', track_id.lower()).strip('-')


def share_page(title, description, image, target, kind='music.song'):
    e = lambda v: html.escape(str(v), quote=True)
    url = SITE_URL + image
    size = '512' if image == FALLBACK_IMAGE else '600'
    return f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)} — Liquid Bullet</title>
<meta name="description" content="{e(description)}">
<meta property="og:site_name" content="Liquid Bullet">
<meta property="og:type" content="{kind}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:image" content="{e(url)}">
<meta property="og:image:width" content="{size}">
<meta property="og:image:height" content="{size}">
<meta name="twitter:card" content="summary">
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


def write_share_pages(tracks, playlists):
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
        pages[name] = share_page(f"{t['title']} · {artist}" if t['artist'] else t['title'], description,
                                 cover_of[pl['id']] if pl else FALLBACK_IMAGE, f"?t={urllib.parse.quote(t['id'])}")
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
    catalog = {'version': 1, 'genres': genres, 'playlists': out, 'aliases': aliases}
    (ROOT / 'catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding='utf-8')
    shared = write_share_pages(tracks, out)
    print(f'{shared} páginas para compartir en s/')
    covered = sum(len(p['trackIds']) for p in out)
    print(f'{len(tracks)} canciones, {len(unique)} únicas, {covered} en {len(out)} playlists')
    for p in out:
        print(f"  {len(p['trackIds']):4d}  {p['name']}  [{p['cover']['type']}]")
    if unknown:
        print(f'Artistas sin playlist (van a {names[DEFAULT_PLAYLIST]}): ' + ', '.join(sorted(unknown)))


if __name__ == '__main__':
    main()
