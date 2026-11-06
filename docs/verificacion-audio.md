# Revisión del audio de toda la biblioteca (noviembre 2026)

Se descargó y escuchó «por máquina» **cada uno de los 3.931 MP3** de los 5 buckets (las 3.921 canciones publicadas más las 10 quitadas en la v47, que sirvieron de control). Para cada archivo:

1. **Datos técnicos** con ffprobe/ffmpeg: duración real, errores de decodificación, silencios largos, volumen.
2. **Huella acústica** (Chromaprint) de la canción entera, comparada con el fragmento oficial de 30 s de Deezer de esa canción. Calibrado con la propia biblioteca: la misma grabación da 60–100 % de coincidencia; canciones distintas, 6 % de media y nunca más de 22 %. Umbral: ≥ 50 % verificada, 25–50 % otra versión (remaster, en vivo, edit).
3. **Video de origen**: cada MP3 guarda en sus etiquetas el enlace de YouTube del que salió; se leyó el título real de los 3.840 videos.
4. **Audio repetido**: se comparó la huella de todas las canciones entre sí para encontrar archivos idénticos con nombres distintos.

Las 10 canciones de control quitadas en la v47 salieron marcadas, todas.

## Resultado

| | Canciones |
| --- | ---: |
| Verificadas por huella con el fragmento oficial | 3.295 |
| Otra versión de la misma canción (remaster, en vivo, edit) | 61 |
| Sin fragmento oficial, pero el video de origen es esa canción | 256 |
| Revisadas a mano y correctas (otro alfabeto, remasters, versiones lentas) | 21 |
| **Audio equivocado: quitadas** | **288** |

Quedan **3.633 canciones** en la app. Problemas técnicos (archivos rotos, cortes, errores de decodificación): **ninguno**; el único archivo mudo era un audio equivocado y está en la lista.

### Cómo se decidió

Solo se quitó una canción cuando **dos señales independientes** decían lo mismo: la huella no coincide con su fragmento oficial **y** el video de origen es otra canción, o su audio es idéntico al de otra canción de la biblioteca. Las versiones distintas de la misma canción (en vivo, remaster, radio edit, versión lenta) **se quedan**.

Se quedaron tras revisarlas a mano, aunque alguna señal fallaba: títulos en otro alfabeto (メタり！！/METALI!!, ゆめうつつ, ライフ・ゴーズ・オン, 憧れのセーシェル諸島, サヨナラ・・・・・・FUJIさん, BEZ TEBYA/без тебя, Х_х 2), Deep Purple (remasters de 1995/2002 con otra duración en Deezer), «SI NO ES CONTIGO - REMIX», «Taboo» de Don Omar, «DÁKITI – Spotify Singles», «Fantasmas En Mi Cama», «acs angel», «Besorg's mir», «Have You Ever Been Mellow», «Cara Dolce Kyoko (Alone Again)» y «Trash ass goth track».

## Quitadas

Siguen en su bucket, pero no salen en la app. Están en [`tools/excluidas.json`](../tools/excluidas.json) y `sync_r2.py` las salta. **Para recuperar una:** sube el MP3 correcto con el mismo nombre de archivo y bórrala de esa lista.

### 104 con el audio de otra canción de la biblioteca

Al descargarlas se bajó el video equivocado: su archivo es, nota por nota, otra canción (casi siempre una que ya está en la app con su nombre correcto).

| Bucket | Canción | Lo que suena en realidad |
| --- | --- | --- |
| brush3 | DENNA LA PORRI, Uzielito Mix – PRINCIPEZZA | «Bye Bye - DENNALAPORRI \| (prod. @UzielitoMixTv) (Visualizer)» (la misma grabación que «DENNA LA PORRI, Uzielito Mix – BYE BYE») |
| brush3 | Ebony Loren – All In My Head | «Meet You Again (Reimagined)» (la misma grabación que «Ebony Loren, Jason LaPierre – Meet You Again - Reimagined») |
| brush3 | Mark Whalen – Why Can't I Grow a Mustache? | «Mark Whalen - Oh Susan» (la misma grabación que «Mark Whalen – Oh Susan») |
| db4 | 1stress, pupsies – I STILL LOVE YOU | «pupsies ‘misery.’ (Official Lyric Video)» (la misma grabación que «pupsies – misery.») |
| db4 | 3582 – MC² (Instrumental) | «MC²» (la misma grabación que «3582 – MC²») |
| db4 | babas tutsipop – suave acento | «babas tutsipop - todo lo que pasa (videoclip)» (la misma grabación que «babas tutsipop – todo lo que pasa») |
| db4 | babas tutsipop – tu liga del pelo | «babas tutsipop - todo lo que pasa (videoclip)» (la misma grabación que «babas tutsipop – todo lo que pasa») |
| db4 | bloodsekai – let me be with u | «Can't Stop Crying» (la misma grabación que «h4teboy – Can't Stop Crying») |
| db4 | bloodsekai, pupsies – losing my magical mind | «pupsies - misery. (Lyrics)» |
| db4 | Boho Fau & Elevated Soul – Cafe Au Lait | «Boho Fau & Elevated Soul-Sweet Tea» (la misma grabación que «Boho Fau & Elevated Soul – Sweet Tea») |
| db4 | Boho Fau & Elevated Soul – Really, Truly | «Boho Fau & Elevated Soul - Open Mic» (la misma grabación que «Boho Fau & Elevated Soul – Open Mic») |
| db4 | Cisne Elocuente – Iluminado | «Manantial» (la misma grabación que «Cisne Elocuente – Manantial») |
| db4 | Cisne Elocuente – Luz Cegadora | «Flor Del Mar» (la misma grabación que «Cisne Elocuente – Flor Del Mar») |
| db4 | Cisne Elocuente – Vuélvete a Mí | «Sola - Cisne Elocuente (LEDA)» (la misma grabación que «Cisne Elocuente – Sola») |
| db4 | Cisne Elocuente, Julio César Lucero – Arrebol | «Sola - Cisne Elocuente (LEDA)» (la misma grabación que «Cisne Elocuente – Sola») |
| db4 | Cisne Elocuente, Julio César Lucero – Composé | «Sola - Cisne Elocuente (LEDA)» (la misma grabación que «Cisne Elocuente – Sola») |
| db4 | Cisne Elocuente, Julio César Lucero – Orbe | «Austral» (la misma grabación que «Cisne Elocuente, Julio César Lucero – Austral») |
| db4 | Cisne Elocuente, Julio César Lucero – Rhode | «Joven» (la misma grabación que «Cisne Elocuente – Joven») |
| db4 | duskydemise, aatsu – dawn | «bedrott» (la misma grabación que «duskydemise – bedrott») |
| db4 | h4rtbrkr – falling for it | «I Hate You» (la misma grabación que «h4rtbrkr – I Hate You») |
| db4 | h4teboy – Tired of You | «Bpill» |
| db4 | h4teboy, ddlion – I Was Bored | «Bpill» |
| db4 | Intelligency – Immigrant | «Technojazz» (la misma grabación que «Intelligency – Technojazz») |
| db4 | leafonia – its like im not even here - instrumental slowed | «it’s like i’m not even here (slowed)» (la misma grabación que «mthu – it’s like i’m not even here - slowed») |
| db4 | never goodbye – I dont like me eitherr | «i dont like me either» (la misma grabación que «never goodbye – i dont like me either») |
| db4 | pupsies – IDGAF IF ITS GONNA END LIKE THIS | «pupsies ‘misery.’ (Official Lyric Video)» (la misma grabación que «pupsies – misery.») |
| db4 | pupsies – is it really that nice though | «pupsies- misery. (Official Visualizer)» |
| db4 | pupsies – its nice to have fun sometimes! | «pupsies ‘misery.’ (Official Lyric Video)» (la misma grabación que «pupsies – misery.») |
| db4 | pupsies – lost prayer | «pupsies - misery. (Lyrics)» |
| db4 | pupsies – loved you | «abnormal» (la misma grabación que «pupsies – abnormal») |
| db4 | pupsies – misunderstooddd | «pupsies - misery. (Lyrics)» |
| db4 | pupsies – REMEMBER | «pupsies ‘misery.’ (Official Lyric Video)» (la misma grabación que «pupsies – misery.») |
| db4 | pupsies – still need your help | «pupsies- misery. (Official Visualizer)» |
| db4 | pupsies – take ur medication | «abnormal» (la misma grabación que «pupsies – abnormal») |
| db4 | Shingo Sekiguchi – Elevator Lover | «Shingo Sekiguchi - North Wing [Official Audio]» (la misma grabación que «Shingo Sekiguchi – North Wing») |
| db4 | Yakkle – Metabolism | «Just Meditating (feat. 2rabu)» |
| db4 | Yakkle, Shing02, DnZ – Big City Lights (Here I Come) [feat. Shing02 & DnZ] | «Just Meditating (feat. 2rabu)» |
| db5 | Dent May – I Don't Like You (But I Love You) | «Dent May - "I Remember..." (Official Music Video)» (la misma grabación que «Dent May – I Remember...») |
| db5 | Dent May – I-55 | «Dent May - "Crying Laughing" (Official Video)» (la misma grabación que «Dent May – Crying Laughing») |
| db5 | Dent May, Jordana – Coasting On Fumes | «Dent May - "Crying Laughing" (Official Video)» (la misma grabación que «Dent May – Crying Laughing») |
| db5 | Eyedress, The Drums, Paul Cherry – DINNER TIME | «Mac DeMarco // "My Kind Of Woman"» (la misma grabación que «Mac DeMarco – My Kind of Woman») |
| db5 | Fr1zi, LoveUikari – RIBETERA | «LA POLICÍA» (la misma grabación que «Fr1zi, LoveUikari, ElevenKD – LA POLICÍA») |
| db5 | Frank Sinatra – I Love You - Remastered | «Somethin' Stupid (2008 Remastered)» (la misma grabación que «Frank Sinatra, Nancy Sinatra – Somethin' Stupid») |
| db5 | Hot Flash Heat Wave – Blue | «Sky So Blue» (la misma grabación que «Hot Flash Heat Wave – Sky So Blue») |
| db5 | Hot Flash Heat Wave – Details | «Hot Flash Heat Wave - Floating» (la misma grabación que «Hot Flash Heat Wave – Floating») |
| db5 | Hot Flash Heat Wave – Everybody's Goth These Days | «Eurythmics, Annie Lennox, Dave Stewart - Sweet Dreams (Are Made Of This) (Official Video)» (la misma grabación que «Eurythmics, Annie Lennox, Dave Stewart – Sweet Dreams (Are Made of This) - 2005 Remaster») |
| db5 | Hot Flash Heat Wave – Malibu | «Hot Flash Heat Wave- Floating» (la misma grabación que «Hot Flash Heat Wave – Floating») |
| db5 | Ikoniko, Fuentes Prod, Novato El Flow – Pretty Putty | «Dolce Queen» (la misma grabación que «Novato El Flow, Fuentes Prod – Dolce Queen») |
| db5 | Inner Wave – 50 | «One in a Million» (la misma grabación que «Inner Wave – One in a Million») |
| db5 | Inner Wave – King's Cup | «1 4 2 - Inner Wave» (la misma grabación que «Inner Wave – 1 4 2») |
| db5 | Inner Wave – O | «Inner Wave - ginger (Official Audio)» (la misma grabación que «Inner Wave – ginger») |
| db5 | Inner Wave, Huron John – Fever : Huron John | «The Smiths - Back To The Old House (Official Audio)» (la misma grabación que «The Smiths – Back to the Old House - 2011 Remaster») |
| db5 | KIDDWERO, Brun$4vr <3 – KeTeAzoTeE | «nAkOyMakUarRo» (la misma grabación que «KIDDWERO, Brun$4vr<3 – nAkOyMakUarRo») |
| db5 | Paul Cherry – Triumph, Love, Humanity | «Chris Brown - Under The Influence (Audio)» (la misma grabación que «Chris Brown – Under The Influence») |
| db5 | Schoolgirl Byebye, Inner Wave – Automatic | «Inner Wave - CHILD (Official Lyric Video)» (la misma grabación que «Inner Wave – CHILD») |
| db5 | Suki Waterhouse – Jukebox | «Suki Waterhouse - Weirdo (Official Lyric Video)» (la misma grabación que «Suki Waterhouse – Weirdo») |
| pepper | Cerounno, Vinyltracker – MVP | «Cerounno & Vinyltracker - ¿En dónde estoy? (Video Oficial)» (la misma grabación que «Cerounno, Vinyltracker – En donde estoy») |
| pepper | Cerounno, Vinyltracker, Jonas Sanche – Aprendo, perdono, olvido | «Cerounno, Vinyltracker - ¿En dónde estoy? (Audio)» (la misma grabación que «Cerounno, Vinyltracker – En donde estoy») |
| pepper | cg – August - Best Part | «2026 DJ SongSound Check New SongJBLDjGanaDj Song RemixHard BassSpeaker Check DjBass Boosted» |
| pepper | JCKC, One Flyt – una banda | «sin mi reina» (la misma grabación que «One Flyt, JCKC – sin mi reina») |
| pepper | La Obsesion, Doony Graff, Vic Gunn, Novato El Flow, Yeyo, Nasty Vato, Viglezz, Onemillionkisses – RedyPaMorir | «La Obsesión, Yeyo, Doony Graff, Novato El Flow - La Obsesión» (la misma grabación que «La Obsesion, Yeyo, Doony Graff, Novato El Flow – La Obsesión») |
| pepper | La Vendicion, La Obsesion, Yeyo, Doony Graff – TENGA PA Q SE ENTRETENGA | «LADYHOY» (la misma grabación que «La Vendicion, La Obsesion, Yeyo, Doony Graff – LADYHOY») |
| pepper | Mac DeMarco – B^) | «Mac DeMarco // On the Level (Official Audio)» (la misma grabación que «Mac DeMarco – On the Level») |
| pepper | One Flyt – 03:27 | «kemujer - ONE FLYT (prod. vasti yan)» (la misma grabación que «One Flyt, Vasti Yan – kemujer») |
| pepper | One Flyt – mi peor pecado | «kemujer - ONE FLYT (prod. vasti yan)» (la misma grabación que «One Flyt, Vasti Yan – kemujer») |
| pepper | One Flyt – No Sé Si Te Pregunté | «Lewis OfMan - Siesta Freestyle feat. Alicia Te Quiero (Official Video)» (la misma grabación que «Lewis OfMan, Alicia te quiero – Siesta Freestyle») |
| pepper | One Flyt, Vasti Yan – bloqueame a todas | «kemujer - ONE FLYT (prod. vasti yan)» (la misma grabación que «One Flyt, Vasti Yan – kemujer») |
| pepper | One Flyt, Vasti Yan – si estas con otro me muero | «mireamor» (la misma grabación que «One Flyt, Parker, Kromano – mireamor») |
| pepper | Sexy Sushi, Rebeka Warrior, Mitch Silver – L'Idole Des Connes | «SEXY SUSHI - À BIEN REGARDER, RACHIDA» (la misma grabación que «Sexy Sushi, Rebeka Warrior, Mitch Silver – À bien regarder, Rachida») |
| pepper | Sosa 66s – Alas | «Sosa 66s - Princesa (Video Oficial)» (la misma grabación que «Sosa 66s – Princesa») |
| pepper | Stereo Madness – Cocaína y Cristal | «B.A.I.L.A.R» (la misma grabación que «Stereo Madness – B.A.I.L.A.R») |
| pepper | Troubless, Dj Secio – - Bonus Track | «2026 DJ SongSound Check New SongJBLDjGanaDj Song RemixHard BassSpeaker Check DjBass Boosted» |
| salt | celai – krawl | «shatter... war torn bastard» (la misma grabación que «celai – shatter... war torn bastard») |
| salt | DENNA LA PORRI, Legorreta – BOMBA | «Pekoritas Mix - DENNALAPORRI \| (prod. @elakkka @LaDembowGang @xosababyy) (Visualizer)» (la misma grabación que «DENNA LA PORRI, elakkka, La Dembow Gang – PEKORITAS MIX») |
| salt | Doony Graff – BELIKONA | «MTY» (la misma grabación que «Doony Graff, Ezya, Fntwxy – MTY») |
| salt | Doony Graff – Pekoro | «HONDA» (la misma grabación que «Doony Graff, Ezya – HONDA») |
| salt | Doony Graff – RIP Mr. Pomel | «PONGASE DE A P» (la misma grabación que «Doony Graff, Ezya, Tuere Chorito – PONGASE DE A P») |
| salt | Doony Graff – Sereno Moreno | «Ñero Session 17 - Alu Mix, Doony Graff, Ezya» (la misma grabación que «Alu Mix, Doony Graff, Ezya – Ñero Session 17») |
| salt | Doony Graff, Ezya – PANAMIUR | «PONGASE DE A P» (la misma grabación que «Doony Graff, Ezya, Tuere Chorito – PONGASE DE A P») |
| salt | Doony Graff, Ezya – te quiero mucho | «sucias» (la misma grabación que «Doony Graff, Ezya, Josa El Menor – sucias») |
| salt | Doony Graff, Ezya – tu canción mas pegada es la mia menos topada | «Doony Graff, EZYA - MONICA (Video Oficial)» (la misma grabación que «Doony Graff, Ezya – Monica») |
| salt | Doony Graff, Ezya – Vecinita | «Doony Graff, EZYA - MONICA (Video Oficial)» (la misma grabación que «Doony Graff, Ezya – Monica») |
| salt | Enry-K, CARLA – BUMBUMBUM | «ENRY-K & CRÁNEO - CIENTÍFICO» (la misma grabación que «Enry-K, Cráneo – CIENTÍFICO») |
| salt | Ikoniko, Doony Graff, Fuentes Prod – SABOR FERRARI | «sucias» (la misma grabación que «Doony Graff, Ezya, Josa El Menor – sucias») |
| salt | KIDDWERO – LaNEtAdElPlaneTa(Prod.Cod3x) | «nAkOyMakUarRo» (la misma grabación que «KIDDWERO, Brun$4vr<3 – nAkOyMakUarRo») |
| salt | La Obsesion, Doony Graff, Nasty Vato, Novato El Flow, Viglezz – #OBSSECHUGG | «AltaFarra» (la misma grabación que «La Obsesion, Novato El Flow, Vic Gunn, Nasty Vato, Dulzón, Josa El Menor – AltaFarra») |
| salt | La Obsesion, Doony Graff, Yeyo, Bby Gangsta, Onemillionkisses – xxxTravagancia | «La Obsesión, Yeyo, Doony Graff, Novato El Flow - La Obsesión» (la misma grabación que «La Obsesion, Yeyo, Doony Graff, Novato El Flow – La Obsesión») |
| salt | La Obsesion, Nasty Vato, Vic Gunn, Doony Graff, Fuentes Prod – RAMPAMPAMPAM | «AltaFarra» (la misma grabación que «La Obsesion, Novato El Flow, Vic Gunn, Nasty Vato, Dulzón, Josa El Menor – AltaFarra») |
| salt | La Obsesion, Yeyo, Doony Graff, Novato El Flow, Josa El Menor, Vic Gunn, Malo, Viglezz – Dos16 (feat. Josa El Menor, Vic Gunn, Malo & Viglezz) | «Esclavaremix2 — La Obsesion, Yeyo, Malo, Doony Graff, Novato El Flow, Josa, Vic Gunn & Viglezz» (la misma grabación que «La Obsesion, Yeyo, Malo, Doony Graff, Novato El Flow, Josa El Menor, Vic Gunn, Viglezz – Esclavaremix2 (feat. Novato El Flow, Josa El Menor, Vic Gunn & Viglezz)») |
| salt | La Zanta Xit – Que La Música No Pare | «Radiohead - Exit Music (For a film) Subtitulada en Español / Inglés» (la misma grabación que «Radiohead – Exit Music (For A Film)») |
| salt | le venado – Weird Fishes | «Radiohead - Weird Fishes / Arpeggi» (la misma grabación que «Radiohead – Weird Fishes / Arpeggi») |
| salt | Lu Jr – Criminal | «Lu Jr - mal de ti (Lyrics Video)» (la misma grabación que «Lu Jr – Mal de ti») |
| salt | Lu Jr – Redflag | «Lu Jr - mal de ti (Lyrics Video)» (la misma grabación que «Lu Jr – Mal de ti») |
| salt | Novato El Flow, Fuentes Prod – CHICHAGIRL | «Dolce Queen» (la misma grabación que «Novato El Flow, Fuentes Prod – Dolce Queen») |
| salt | nusar3000, GIANNI BATISTA – JUGO | «GUARANÁ» (la misma grabación que «nusar3000, GIANNI BATISTA – GUARANÁ») |
| salt | nusar3000, GIANNI BATISTA – MOTA | «FRANGO» (la misma grabación que «nusar3000, GIANNI BATISTA – FRANGO») |
| salt | nusar3000, GIANNI BATISTA – REFRIGERANTE | «GUARANÁ» (la misma grabación que «nusar3000, GIANNI BATISTA – GUARANÁ») |
| salt | Real Cumbia Activa RCA – La Isla En El Sol, Pt. 1 | «La Isla En El Sol, Pt. 2» (la misma grabación que «Real Cumbia Activa RCA – La Isla En El Sol, Pt. 2») |
| salt | Stereo Madness – Botines Blancos | «Medicine Pa La Flu» (la misma grabación que «Stereo Madness – Medicine Pa La Flu») |
| salt | Stereo Madness – Calor, Como Loca | «Soda Stereo - De Música Ligera (Official Video)» (la misma grabación que «Soda Stereo – De Música Ligera - Remasterizado 2007») |
| salt | TBX, DENNA LA PORRI – OYE MORENO | «Sola- Denna La Porri, Moodjas (Video Oficial)» (la misma grabación que «DENNA LA PORRI, Moodjaas – SOLA») |
| salt | The Marías – I Like It | «The Marías - All I Really Want Is You (Official Audio)» (la misma grabación que «The Marías – All I Really Want Is You») |
| salt | Vic Gunn, Doony Graff, Ezya – Griselda | «La Obsesión, Yeyo, Doony Graff, Novato El Flow - La Obsesión» (la misma grabación que «La Obsesion, Yeyo, Doony Graff, Novato El Flow – La Obsesión») |
| salt | void – 24 Songs | «The Neighbourhood - Void (Official Audio)» (la misma grabación que «The Neighbourhood – Void») |

### 184 con el audio de una canción que no es la suya

La huella no coincide con la canción y el video de origen es otra (a veces de otro artista; en algunos casos, un video que ni siquiera es música).

| Bucket | Canción | Lo que suena en realidad |
| --- | --- | --- |
| brush3 | Aln MC – Gloss | «Unity (Acoustic) - Alan x Walkers \| Sapphire» |
| brush3 | Laufey – Where or When | «Laufey - Questions for the Universe (Official Audio)» |
| brush3 | Professor Creepshow – Life Is Meant 2 Be Hard | «Lucifer 4x01 Lucifer sings Creep» |
| brush3 | Tommy Dorsey, Frank Sinatra – Fools Rush In (Where Angels Fear To Tread) - Restored 2024 | «You'd be so Nice to come Home to - Ambrose, Anne Shelton (vocal) 1939 78 rpm Decca F 8327» |
| db4 | 14, Shing02 – Real With You (feat. Shing02) | «愛密集 i miss you - Shing02 + Yakkle» |
| db4 | 54 Ultra – Sunday | «54 Ultra - Tell Me (Official Audio)» |
| db4 | backw666s – still the same | «rack city» |
| db4 | Bajune Tobeta – Clair de lune | «Orezi - My Queen (Official Video)» |
| db4 | Belowground – Suicide Note | «Belowground - demoralized» |
| db4 | Boho Fau & Elevated Soul – Coffee House Swingin' f. Nile River | «I'll Be...» |
| db4 | Boho Fau & Elevated Soul – Vibin' | «Coffee House Swingin' (ins)» |
| db4 | cg – August - Best Part | «80,000 Watt Sound Check2026 DJ SongsDJ GanJBL Bass BoostedSpeaker Test SoundHard BassDJ Remix» |
| db4 | Cisne Elocuente – 49 Días | «Juli Charleston & El Cisne Elocuente - Manantial \| Sofar Buenos Aires» |
| db4 | Cisne Elocuente – Abismo De Amor | «Dante Spinetta,en vivo rebelión,1er tema de su nuevo disco» |
| db4 | Cisne Elocuente – Justo En La Mitad | «Camilo - Favorito (Official Video)» |
| db4 | Cisne Elocuente – Vicosurf | «Simón» |
| db4 | Daniel Craft – Suéltate | «Daniel Craft-Realidad (AUDIO)» |
| db4 | Dela – We Will All B Free | «Madcon – Don’t Worry feat. Ray Dalton [Official Video]» |
| db4 | DJ UNIVXRSEL – Kanden | «DJ UNIVXRSEL - KURAYAMI NO NAKA» |
| db4 | dolldamage – online presence | «Dolldamage - Slaughtered (432Hz)» |
| db4 | dolldamage – wanna hurt u | «ashtray ₊ ⊹» |
| db4 | dopamine. – Dark Triad | «CORTISOL SPIKE (Slowed)» |
| db4 | g hao – Experiment 002 | «g hao - THRU DIS HELL (Official Visualizer)» |
| db4 | h4rtbrkr – c u girl | «"I HATE YOU!" Anakin Skywalker x After Dark \| Slowed x Edit» · dura 5:02 y la oficial 0:51 |
| db4 | h4rtbrkr – riotgrrrlll | «benice2me» |
| db4 | HEXXO – GAT1T0_STYL3RZ | «FLIP_PHONE_TERROR» |
| db4 | hurtsick, Cxryn – let me in to your solitude. | «famous» |
| db4 | Isla de Caras – Despacio | «Chicas Como Vos» |
| db4 | J. Rawls – Falling | «J. Rawls - A Tribute to Dilla (turntable 7" edit)» |
| db4 | JJJ – #02 untitled | «Moving» |
| db4 | Kero One – Ain't That Somethin? | «Kero One - In Liberdade (Feat. Kesna Music)» |
| db4 | Kero One – Deep Space Instro (Bonus Track) | «Kero Uno - Falling apart (ft. Lindsay Olsen) ~ Relaxing chillhop music» · termina con 236 s de silencio; muy bajo (-84.3 dB máx.) |
| db4 | kerosyn – ATMOS | «Kerosene 8d audio \| Use Headphones \| Surround SFX \| HD \| 4k \| Edit Songs» |
| db4 | knwbttr, gutskira – nothing ever lasts. | «for you» |
| db4 | kofun – mu | «crying to my trombone» |
| db4 | Lady Paradox, Pat D – I Wanna Feel Days | «Lady Paradox & Gadget - Memory Package - Mood Swings» |
| db4 | lexycat – lollipop | «jinx〜♡» |
| db4 | Ljones – ArtOfficial Strawberries | «Ljones - To The Grove» |
| db4 | Ljones – Jazz Technician | «Ljones - Dead Leaves» |
| db4 | Medasin – Up and Down | «Medasin - Get By (ft. Cautious Clay)» |
| db4 | MEITEI – Heiwa | «MEITEI NINGOL \| AJ MAISNAM \| GEMS CHONGTHAM \| Prod.by VISS NINGTHOUJA» |
| db4 | Mistvale, kaysnoto – Bed Rotting on a Friday | «dream girl» |
| db4 | Modal.s – Introducing! My Self | «HOW TO INTRODUCE YOURSELF IN A CREATIVE WAY \| EUNICE ANN TUMOLVA» |
| db4 | Molina – I am your house | «Molina - Hey Kids (Official Video)» |
| db4 | Mountain Brothers – Dig It | «Day Jobs» |
| db4 | Nishatentachi – My Thoughts As I Ruin My Life | «yen - i miss u and im at this point in my life (Instrumental)» |
| db4 | oinkasf, karphloz – 2016 | «wish she loved me the same (feat. poppyseed & Piggybank112)» |
| db4 | pichuu – bruised knees xP | «xoxo ᐸ3» |
| db4 | pichuu – strawberry ˚.⋆ | «blehhhhghhh..» |
| db4 | Plastical People – Perfect Love | «Plastical People - Shock en mi costa \| Ritmo Natural» |
| db4 | play it twice – Bring It Fine - Slowed | «instinctt (audio) {slowed+reverb}» |
| db4 | pupsies – scars | «i could never let go» |
| db4 | pupsies – sunshine beach ★ | «Patrick Stewart dead» · dura 0:31 y la oficial 2:14 |
| db4 | pupsies, deathsuppressant – other people make me sick !! | «Stellar - Bad News ft. Black Gryph0n & Baasik (Official Lyric Video)» |
| db4 | pupsies, loony – FEW SMALL PROBLEMS | «"money money green green" Kaytoven - MONEY! (Lyrics) Good Loyal Thots Remix» |
| db4 | Quincy Divine – Signs | «Quincy Divine WARNING» |
| db4 | redize – heartbreaker | «Jon Pardi - Friday Night Heartbreaker (Official Audio)» · dura 3:25 y la oficial 2:03 |
| db4 | redize, Sandysaddog – hey, i love you | «love letter» |
| db4 | reptilianshrine – How It Go | «The Strokes - Reptilia (Official HD Video)» |
| db4 | Rikinish – Beautiful Life | «Rikinish - The Game (Official Video) ft. Jane the Message, Kensho Kuma» |
| db4 | Rob, Jack Lahana, Bandalos Chinos – 1 % | «Rob & Jack Lahana - Haute saison feat. Giorgio Poi & Gordon Tracks (Official Audio)» |
| db4 | SAIBOTAJE – NIGHTMARE - Super Slowed | «wush_2 - 77yolan 2nd part(Ultra Slowed)» |
| db4 | SAIBOTAJE – Vanilla | «[osu!mania 4K] Yatsume Ana [x1.1] 999,843 - 100%» |
| db4 | skalpas – Bring It Fine | «Bruce Springsteen - Fire - Lyrics» |
| db4 | Thes One – Be Strong | «Thes One - Pretty Girls» |
| db4 | UnDOMENICO – Descombinado | «Tal vez me Perdí» |
| db4 | VARIATION – Stuck In Heaven | «NOGA EREZ - Stuck in Heaven» · dura 0:34 y la oficial 1:42 |
| db4 | Vita Set – Si No Hay Con Quién Bailar | «Vita Set - Anoche (Single)» |
| db4 | Witness – Intermission | «TADC Episode 6 but with Thomas Sound Effects» · dura 0:43 y la oficial 2:47 |
| db4 | Witness – Watercolors | «Witness - Holden Caulfield [Feat. Unsung]» |
| db4 | xn88ax, 11eter, Frostekk – RIFTWALK | «BADDREAMS» |
| db4 | Yakkle – Stronger | «Byonkola - Ykee Benda Latest Ugandan Music HD» |
| db4 | zombiwebz – 2033 | «a stupid terrible song i made on the fourth of july haha» |
| db4 | zombiwebz – scattered thoughts in a very scattered mind | «vodka kisses» |
| db5 | 8.am, Ruzzo Doblezz, Tennessee Beats – Canina | «Brasiñero» |
| db5 | bob junior, Hot Flash Heat Wave – Red | «bob junior feat. Jordana - Just Go (Visualizer)» |
| db5 | Dent May – I Want To Believe | «EYEDRESS - SOMETHING ABOUT YOU FEAT. DENT MAY (OFFICIAL VIDEO)» |
| db5 | Eyedress, Paul Cherry – Dancing with My Demons | «Guitars are Never Animated Correctly...» · dura 0:34 y la oficial 3:42 |
| db5 | GSAD – S3xy Fantasia | «ROA - FANTASÍA (Official Video)» |
| db5 | Hot Flash Heat Wave – Lilies | «gutter girl - hot flash heat wave (sped up)» |
| db5 | Inner Wave – I Almost Lost This | «Inner Wave» |
| db5 | Jordana, Paul Cherry – My Idol - demo | «CORTIS (코르티스) 'JoyRide' Official MV» |
| db5 | JW Francis, Paul Cherry – I Love You 2 | «The Four Seasons - Sherry (Official Audio)» |
| db5 | Nasty Vato, Novato El Flow, YOUNG MAFIA – DESPLIEGUE | «Novato El Flow, Ruzzo Doblezz y Fntwxy - nova+ruzzo+fantawy » · dura 2:45 y la oficial 1:27 |
| db5 | Nat King Cole – Around The World - Remastered | «An Affair To Remember» |
| db5 | Paul Cherry – Butterfly Beach | «Crazy Town - Butterfly (Official Video)» |
| db5 | Paul Cherry – Hey There, Brother | «I Want You Back» |
| db5 | Paul Cherry – The Addicts | «Don Louis - Addict (Official Visualizer)» |
| db5 | Paul Cherry – This High | «Paul Cherry - Waverunner (Official Audio)» |
| db5 | Ruzzo Doblezz, Fuentes Prod, Novato El Flow, Nasty Vato, Dulzón – ZAZAZA | «ARRIBANI (feat. YOUNG MAFIA)» |
| db5 | Suki Waterhouse – Notting Hill | «Suki Waterhouse - Seasons (Official Lyric Video)» |
| db5 | Zalzuki – Antídoto 80085 | «2 Bellakos» |
| pepper | 424 – Gala | «424 - Cediendo» |
| pepper | Broken By The Scream – アイハキミノモノ | «Kocchi Muite, Amore» |
| pepper | CORBA, One Flyt – No Quiero Nada Sin Vos | «Cali Y El Dandee, DANNA - Nada» |
| pepper | Cortex – Devil's Dance | «L'enfant samba» |
| pepper | Cruzzi, La Pantera – G WAGON | «HOW DOES IT FEEL» |
| pepper | Franky Style – Baby | «Tengo una Baby» |
| pepper | Gabryel – OKUPA | «GABRYEL - EL VAGO Y LA PRIMERA DAMA (Visualizer)» |
| pepper | Helado Negro – There Must Be a Song Like You | «Helado Negro - Aguas Frías (Official Visualizer)» |
| pepper | Intelligency – Into the Summer | «INTELLIGENCY - Libido» |
| pepper | KAQRIYOTERROR – Pity pantomime | «KAQRIYOTERROR - Who are U? / Lyrics Video (Romaji, English)» |
| pepper | L'haine – KIM | «HABANERA L'haine» |
| pepper | Lizorzo – Domingo | «Lizorzo - PRINCIPIOS DE UN PRINCIPE ( Video Oficial )» |
| pepper | Mime 871, Latin Geisha – El Abismo Mira En Ti | «Mime 871 - La Sonrisa De Las Musas (Prod. x Doctor Destino)» |
| pepper | NEMIGA – Рукава | «NEMIGA - Беларуский саунд (feat. FREDDY RED) \| Audio» |
| pepper | One Flyt – Kenpazdescansen | «06. One Flyt "no vuelvas por mi salario $$$" (prod. ventubeats)» |
| pepper | One Flyt – Los Pies en la Tierra | «Cris MJ - 7 Trompetas (Video Oficial)» |
| pepper | One Flyt – Lunes | «Clair de Lune (Studio Version)» |
| pepper | One Flyt – onelove | «Bazanji - One Flight Away (Official Audio)» |
| pepper | One Flyt – SI YO FUERA EL MOMO | «Big Stan Deejay Santa Cruz - Si Fuera Yo (Video Oficial)» |
| pepper | PANTERA BLUE – Ese AURA | «PANTERA BLUE - ENVERGADURA (Official Video)» |
| pepper | Ruzzo Doblezz, Ezya – Butaka | «Ruzzo Doblezz - Cuer0o (Prod. EZYA)» |
| pepper | Semon – Sin querernos | «Pongámonos De Acuerdo» |
| pepper | Shamanes Crew – Madre Tierra | «Aroma Tropical» |
| pepper | T4CHO – Viaje de 10 minutos | «MACO - Viaje de Ida (Letra Oficial)» |
| pepper | Tita – Si Tú Estás Bien | «Holanda - EL DE LA TINTA, Angel Cervantes & Sahir Montoya (Audio)» |
| pepper | Tramposos – Benditos | «ElGrabeZN - 18. BIEN PIRATAZ Ft. Zlayer, Owsk, Roer, Mike.(Prod. Owsk@Ukrecks).(BENDITA ESENCIA)» |
| pepper | Vanessa Zamora, DAMALEONA – Malas Amistades | «VANESSA ZAMORA — TRASCENDER (Official Video)» |
| pepper | wrld one, One Flyt, Lisan – TE AMO TODA | «Bob Marley & The Wailers - One Love / People Get Ready (Official Music Video)» |
| salt | Acid Coco – Soñando | «Seguimos Sonriendo» |
| salt | Anxiety, poser – talk to me one more time | «PARTYOF2 - poser (OFFICIAL VIDEO)» |
| salt | celai – locksmith | «Leo Dan - Celia (En Vivo) ft. Palito Ortega» |
| salt | celai – quits | «STELLA LEFTY - I know I know (SAiiLOR Remix) - UK Garage TikTok Version [Official Audio]» |
| salt | celai – witches | «Celia of the Seals» · dura 3:04 y la oficial 1:30 |
| salt | Cherry Chola, Chico Sonido – The Pink Room | «1tbsp - Pink Dress (feat. Cherry Chola) [Official Video]» |
| salt | D.Valentino – instante | «heartbreaker» · dura 2:26 y la oficial 1:20 |
| salt | Disco Bahía – Marbrisa | «Disco Bahía - Radiocaset (Lyric Visualizer)» |
| salt | dreaming., numb the pain, rehab – my hatred kept me alive (till death 4) | «Zevia - till death frees me (Official Lyric)» |
| salt | Elia y Elizabeth, RELATIN, Kartell – Ponte Bajo El Sol - Kartell Remix | «Elia y Elizabeth y Franc Moody - Alegria (Franc Moody Remix)» |
| salt | Emally Villa – BABY YO | «KHEA, Emilia - TU Y YO (Official Video)» |
| salt | Epilogio – Los Perros Van Al Cielo | «La Oreja de Van Gogh - Epifania (Audio)» |
| salt | Gatti, Koboss Beats, Ilyam – CON NADIE//VVS | «HIPERLAXA - GATTI (videoclip oficial)» |
| salt | GHOSTYY – Do You Want (remix) | «Trouble With Love (Mr Ghosty Remix)» |
| salt | Golf Trip – Soul Brother | «Golf Trip - Killing Flowers» |
| salt | guitarbf – crybaby | «SonAr fx - Atlantis Multimode Modulation - Modern Flanger + Distortion» |
| salt | guitarbf – something feels off | «Let me throw away my life if i want to hahahahaahaaghagaajkhaga» |
| salt | guitarbf, casper's pishogue – shes a 10 but shes psycho | «hi psycho girl» |
| salt | Guxo – 0'0 | «Guxo - CEO (Official Video)» |
| salt | Guxo, Logal, eestsyde.xo – Glock Rosa | «Guxo - Nuevo Mundo (Official Music Video)» |
| salt | Harmless – Bridges | «Hannah Don't Lurk (Official Audio) - Harmless» |
| salt | JAYSEE, Msvnto – Es una adicción | «Control - GSAD, CR Montz, Jaysee» |
| salt | Khalil – Must B Nice | «Khalid - Talk (Official Video)» |
| salt | khxznq – Dropped Out | «Disco Lines & Tinashe - No Broke Boys (Official Audio)» |
| salt | La Obsesion, fafabian – Pollito83Exclusive | «La Obsesión Factory - Chichabeba \| GALLERY SESSION» |
| salt | LaDí – noche fina | «BAD BUNNY x ROSALÍA - LA NOCHE DE ANOCHE (Video Oficial)» |
| salt | Lewis OfMan – Un amour au super u | «Lewis OfMan - Plein De Bisous (feat. Milena Leblanc)» |
| salt | Los+RibeteroZ, Fr1zi, LoveUikari, ElevenKD – Date Grasa | «Pa Eso Es - Los+RibeteroZ x Kid Moonsta» |
| salt | Marine Neuilly – Confetti | «Marine Neuilly - Bijou \| LESIXTYNINE MUSIQUE \| LSN039» |
| salt | MIEL – Centro | «MIEL - Orquídeas (Videoclip Oficial)» |
| salt | mita – envidia de mi | «POBRECITA // Jonathan Herrera ft Aimep3, Chinomente» |
| salt | MJ Nebreda, Nick León – Bubalú | «MJ Nebreda, La Goony Chonga - Perreo Oscuro» |
| salt | Mou – Ça va le faire | «Mou - Victoires de la musique» |
| salt | neptune, tuneski – Moon | «Lucki - Neptune (prod. StoopidXool)» |
| salt | nusar3000 – ALCANCÍA | «ALEJANDRIA» · dura 2:36 y la oficial 1:28 |
| salt | nusar3000 – LEVANTE | «INSOMNIA» |
| salt | nusar3000 – NASKAR | «MELAZA - nusar3000, Six Sex» |
| salt | nusar3000, GIANNI BATISTA – compay51 | «MOTA - nusar3000» |
| salt | nusar3000, Israel Fernández – ROSA DE JERICÓ | «MUSHKAR3000 - nusar3000, Mushkaa» |
| salt | nusar3000, Pj Sin Suela – BENDECIDO | «Natalia Lacunza, nusar3000 - SIMELLAMA (nusar3000 Remix / Visualizer)» |
| salt | PANTERA BLUE – AMÉ | «Aunque no quiera te amaré» |
| salt | PANTERA BLUE – Sofía y yo | «No es personal» |
| salt | Perro Salchicha – Como Pompa | «Ahora Resulta Voz De Mando Con Letra (sin censura)» |
| salt | punchy – Untreated Scars | «Papa Roach - Scars (Official Music Video)» |
| salt | punchy – what you lookin at | «Five Finger Death Punch - Got Your Six (Official Audio)» · dura 2:58 y la oficial 1:01 |
| salt | Purpple K, xosa, Doony Graff – Low Low | «Jorja Smith - Blue Lights \| A COLORS SHOW» |
| salt | reptilianshrine – Cop Killer | «Skrillex - First Of The Year (Equinox) [Official Audio]» |
| salt | Ruzzo Doblezz, TBX – Dicaprio | «Jose Alatorre @ruzzodoblezz - descontrol [Visualizer]» |
| salt | Sa!koro, Doony Graff – guerrilla | «LA NAVE - sa!koro + doony graff + chugg type beat» |
| salt | SAM DAVIES, LEÏTI, iseekarlo – Cuenta a 0 | «SAM DAVIES x Leïti Sene - Vuitres (Official Music Video)» |
| salt | Shmiks, J Güero – Lucy y El Tigre (J Güero Remix) | «Valeria Vix Ft Giu Giu El Tigre (2012 Remix)» |
| salt | Stereo Madness – Chica Cósmica | «Sólo Pienso En Ti» |
| salt | Stereo Madness – Fiebre | «Échale Más» |
| salt | Stereo Madness – Pesadilla En El Club | «STEREO EXTREMENESS - FULL SHOWCASE» · dura 1:39 y la oficial 3:41 |
| salt | Tati Falco – Haydee | «Tati Falco - Tercera Vencida» |
| salt | Tati Falco – Los Estimados | «Tati Falco - "Anzuelo" VideoClip» |
| salt | Tennessee Beats, bbbartex, xosa, Jossed – Marroneo | «Reggaetonasty» |
| salt | ukd, badthing – 99ers | «K&K Project - Hour Glass (Teaser)» |
| salt | Vansire – From the Subway Train - Extended Version | «Part of the Dream» |
| salt | void, empireofyu – SUMMERTIME | «SUMMERTIME 2» |
| salt | vonnside – www | «Suncircus - vonnside» |
| salt | wizardjit – other .way | «dnt sleep #true2000s» |
| salt | ZTVZ – Báilame Así | «ZTVZ - Tú (Visualizer)» |
| salt | ⎍⧮⫽⩘⧅⦔⨬⧇⩕⥉⦾⫰⧪⦑⧛⨳ – late | «[free] crayon x bunii x overtonight indie rock type beat - "im not around"» |

## Notas

- «Stateside» de PinkPantheress suena con la versión con Zara Larsson (es la misma canción, por eso se queda).
- «These Foolish Things» (Ella Fitzgerald y Louis Armstrong) dura 7:40: es la versión completa del disco y la huella coincide.
- Las favoritas o playlists propias que tuvieran una canción quitada simplemente dejan de mostrarla; nada se rompe.
