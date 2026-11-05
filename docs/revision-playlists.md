# Revisión de playlists (noviembre 2026)

Se revisaron **las 41 playlists y sus 3.917 canciones**, una por una. El listado completo, ya corregido, está en [playlists-completas.md](playlists-completas.md).

## Cómo se hizo

1. **Listado completo** de cada playlist, artista por artista y canción por canción.
2. **Revisión a mano** de cada artista contra lo que promete su playlist.
3. **Comprobación en Deezer** de los 1.446 artistas: el género de sus discos y sus artistas parecidos. Se marcaron 58 posibles choques; la mayoría eran falsas alarmas (Deezer confunde artistas con el mismo nombre) y se quedaron como estaban.
4. **Corrección** en la tabla `PLAYLISTS` de `tools/build_catalog.py` y nuevo `catalog.json`.

Las playlists se arman **por artista**: cada artista va a una sola playlist, y en una colaboración manda el primero que esté en la tabla. Por eso un artista mal puesto arrastraba todas sus canciones (como ShyBully en Perreo Nocturno).

## Resultado: 110 canciones cambiadas de playlist

Favoritas, playlists propias e historial no se tocan (van por id de canción). Las playlists propias que tengas no cambian.

### Perreo Nocturno → Rima Cruda (26)

- **Gonzalo Genek, Daske Gaitán**: Dimelo — Rap.
- **Wk**: Todo Está Bien · Una Canción para el Final de la Película · Mía More II · Corazón de Cristal · El Amor, Locura, Todo — Rap mexicano (sus parecidos son Mime 871, Charles Ans y Proof).
- **Mime 871**: Seda Al Mar · Ser Inapropiado · Ramillete de Nardos — Rap mexicano (Santiago Insane, Aczino).
- **A.C.O**: Voy tranquilo · Mirador de estrellas · Buscándote — Rap latino (Al2 El Aldeano, Canserbero); colabora con Charles Ans.
- **Simpson Ahuevo**: Manos de Anillo · Ponte Bien Buena · Mextasis · Despierto — Rap alternativo mexicano (Charles Ans, La Banda Bastön).
- **Mike Lamadrid**: Pausa · Ojos Vendados — Rap mexicano (Adán Cruz, Gera MX).
- **Anestesia**: Año 3: De Lunes a Domingo · Año 9: Lléname de Amor — Rap mexicano (Charles Ans, Neto Peña).
- **Mime 871, Latin Geisha**: El Abismo Mira En Ti — Rap mexicano (Santiago Insane, Aczino).
- **Mike Lamadrid, Prodbenji**: Ella es un 10 — Rap mexicano (Adán Cruz, Gera MX).
- **Bizor, Bolishe One**: El Hilo Rojo — Rap mexicano.
- **A.C.O, Charles Ans**: De Madrugada — Rap latino (Al2 El Aldeano, Canserbero); colabora con Charles Ans.
- **Mike Lamadrid, YoungKidz**: Limbo — Rap mexicano (Adán Cruz, Gera MX).
- **Muelas De Gallo, Ivan de la Rioja**: No Love — Rap mexicano.

### Perreo Nocturno → Calle Cromo (18)

- **ROSALÍA**: PIENSO EN TU MIRÁ - Cap.3: Celos — Española: nueva escuela, no club latino.
- **Bb trickz, Chapo 240**: Algo bien — Rap de la nueva escuela española.
- **Bb trickz, Fusil Ametrallalo**: las mías son peluche — Rap de la nueva escuela española.
- **nusar3000, GIANNI BATISTA**: MOTA · JUGO · nosesitukieres · REFRIGERANTE · GUARANÁ · FRANGO · PIZZA PLANET · compay51 — Nueva escuela española (Dinamarca, rusowsky, Ralphie Choo).
- **nusar3000**: NASKAR · LEVANTE · ALCANCÍA · TAUSERT — Nueva escuela española (Dinamarca, rusowsky, Ralphie Choo).
- **nusar3000, Pj Sin Suela**: BENDECIDO — Nueva escuela española (Dinamarca, rusowsky, Ralphie Choo).
- **nusar3000, Azuleja**: SHEFTEK — Nueva escuela española (Dinamarca, rusowsky, Ralphie Choo).
- **nusar3000, Israel Fernández**: ROSA DE JERICÓ — Nueva escuela española (Dinamarca, rusowsky, Ralphie Choo).

### Perreo Nocturno → Alma Latina (13)

- **LATIN MAFIA, Omar Apollo**: Hecho para ti — Alternativo latino (Jesse Baez, HUMBE).
- **CA7RIEL & Paco Amoroso**: MI DIOSA · COSAS RICAS · Ola Mina Xd — Alternativo argentino (funk, rap, rock).
- **Foudeqush, Ludwig Göransson**: Con La Brisa — «Con La Brisa» (banda sonora de Black Panther): alternativo latino, no perreo.
- **Juanpa Gordoa, ND Kobi', Donovan Morales**: Congelados - Remix — Pop alternativo mexicano.
- **Juanpa Gordoa**: Starlove — Pop alternativo mexicano.
- **AQUIHAYAQUIHAY**: Tiempo Perfecto — Alternativo latino (Jesse Baez, YOSHI).
- **LATIN MAFIA**: Yo siempre contesto. — Alternativo latino (Jesse Baez, HUMBE).
- **iza tkm**: dormiré sin ti · cuídame de mi — Pop alternativo latino (AKRIILA, Dinamarca, rusowsky).
- **iza tkm, Berdu**: soñando despierta — Pop alternativo latino (AKRIILA, Dinamarca, rusowsky).
- **Alanis Yuki**: Dimelo — Alternativo latino (iza tkm, LATIN MAFIA).

### Lluvia Lenta → Seda Nocturna (8)

- **Chase Atlantic**: Meddle About · Right Here · Friends · Into It · Slow Down · OHMAMI · Swim — R&B alternativo de madrugada.
- **Chase Atlantic, GOON DES GARCONS***: Consume (feat. Goon Des Garcons) — R&B alternativo de madrugada.

### Seda Nocturna → Neón Eterno (8)

- **Nelly Furtado, Timbaland**: Promiscuous — Pop de pista de los 2000 («Promiscuous», «Maneater»).
- **Nelly Furtado**: Say It Right · Maneater — Pop de pista de los 2000 («Promiscuous», «Maneater»).
- **Gwen Stefani**: Luxurious — Pop de pista de los 2000.
- **Estelle, Kanye West**: American Boy — «American Boy»: pop de pista de los 2000.
- **Justin Timberlake**: Rock Your Body — Pop de pista de los 2000.
- **Gwen Stefani, Johnny Vulture**: Bubble Pop Electric — Pop de pista de los 2000.
- **Gwen Stefani, Eve**: Rich Girl — Pop de pista de los 2000.

### Trueno Clásico → Ciudad Furia (8)

- **Almendra**: A Estos Hombres Tristes — Rock argentino de culto.
- **Serú Girán**: Frecuencia Modulada - 2019 Remasterizado · Peperina · Salir De La Melancolía — Rock argentino de culto.
- **Pescado Rabioso**: Cementerio Club · Las Habladurias del Mundo — Rock argentino de culto.
- **Los Pericos**: Pupilas Lejanas — Rock / reggae argentino.
- **Los Cafres**: Tus Ojos — Reggae argentino de culto.

### Ácido Lento → Lluvia Lenta (3)

- **Coldplay**: Adventure of a Lifetime · Sparks · Yellow — Rock melancólico de guitarra, no psicodelia.

### Humo Dorado → Seda Nocturna (2)

- **Ley Soul**: Intergalactic Janet · Into Sands — R&B alternativo (Hotel Ugly, Brynn Elise), no jazz.

### Lluvia Lenta → Ghost Case (2)

- **Øneheart, reidenshi**: snowfall — Ambient slowed de internet.
- **Izzamuzzic, Julien Marchal**: Shootout — Electrónica oscura / slowed.

### Perreo Nocturno → Corazón Roto (2)

- **ShyBully**: Shy · Tattoo — Pop alternativo / emo (en Deezer va con Your Anxiety Buddy y SlumpAbe), no perreo: es tu ejemplo de «Tattoo».

### Cuarto Pastel → Calle Cromo (2)

- **rusowsky, Dinamarca**: mwah :3 — Nueva escuela española, no bedroom pop.
- **rusowsky, DRUMMIE, Barry B**: bla bla bla — Nueva escuela española, no bedroom pop.

### Cuarto Pastel → Humo Dorado (2)

- **Dana and Alden**: Baby, You’re Gonna Miss That Plane · Dragonfly — Dúo de jazz.

### Perreo Nocturno → Humo Dorado (2)

- **Cortex**: Prélude à Go Round · Devil's Dance — Jazz-funk francés de los 70, no club latino.

### Seda Nocturna → Londres Rosa (1)

- **Lily Allen**: Smile — Pop británico.

### Seda Nocturna → Ola Tibia (1)

- **Michi**: Night Moves — Indie bailable (Yot Club, Harmless).

### Lluvia Lenta → Riviera Francesa (1)

- **Lykke Li, The Magician**: I Follow Rivers - The Magician Remix — El remix de The Magician es nu-disco.

### Perreo Nocturno → Ghost Case (1)

- **Delinquent, KCAT, Mike Delinquent Project**: My Destiny - Slowed — Slowed / electrónica de madrugada.

### Cuarto Pastel → Chicle Tóxico (1)

- **Moonshine**: Gucci Flip Flops x Careless Whisper - Viral Version — Mashup viral sped up.

### Perreo Nocturno → Neón Eterno (1)

- **1tbsp, Soltera**: Soulseek — House / club (Mall Grab, Confidence Man).

### Cuarto Pastel → Perreo Nocturno (1)

- **Amber Yezel**: BRUJERÍA — Reguetón («BRUJERÍA»).

### Perreo Nocturno → Infierno Rosa (1)

- **La Zowi, Flynt Hustle**: Putas - Remix — Trap de la calle española (Pipo Beatz, Albany, Yung Beef).

### Perreo Nocturno → Dembow Añejo (1)

- **Rayo & Toby**: Movimiento de Caderas — Reggaetón de la vieja escuela.

### Lluvia Lenta → Rima Cruda (1)

- **Pedro Guerra, Cruzzi**: Con Los Dos En La Cabeza — Colaboración con Cruzzi: rap.

### Seda Nocturna → Rima Cruda (1)

- **N.E.R.D**: Bobby James — Hip hop de Pharrell, no R&B de madrugada.

### Seda Nocturna → Alma Latina (1)

- **Helado Negro**: There Must Be a Song Like You — Indie latino electrónico, no R&B.

### Humo Dorado → Café Lento (1)

- **Professor Creepshow**: Life Is Meant 2 Be Hard — Lofi hip hop (Jazz Playaz).

### Humo Dorado → Vinilo Rosa (1)

- **Wayne Newton**: Danke Schoen — «Danke Schoen»: pop de los 60.

## Descripciones actualizadas

- **Rima Cruda**: suma a Wk en la descripción.
- **Ola Fría**: ahora dice también «pop ruso» (Lolita, Masha i Medvedi, Tima Belorusskih…), que ya estaba ahí.
- **Londres Rosa**: suma a Lily Allen.
- **Ciudad Furia**: suma a Serú Girán.
- **Neón Eterno**: suma a Gwen Stefani y Nelly Furtado.
- **Alma Latina**: suma a LATIN MAFIA y CA7RIEL & Paco Amoroso.

## Se quedaron donde estaban (revisado)

- **Ola Fría**: el pop ruso (Lolita, Катя Лель, Eldzhey…) no encaja en post-punk, pero no hay otra playlist en ruso: se amplió la descripción.
- **Neón Eterno**: el rock de los 80 y 90 (The Police, R.E.M., Smashing Pumpkins, The Verve) encaja como «lo de los 80 y 90».
- **Trueno Clásico**: Maroon 5, No Doubt, Green Day o Linkin Park son rock de radio; Pierce The Veil y Sleeping With Sirens, post-hardcore.
- **Nube Púrpura**: Sematary, BONES o Yung Lean salen en Deezer como metal o alternativo, pero son underground / cloud rap.
- **Seda Nocturna**: Billie Eilish, Melanie Martinez y Tyler, The Creator; pop oscuro y R&B alternativo de madrugada.

En la app, además, **«Black Country, New Road»** ya no se parte en dos artistas por la coma.
