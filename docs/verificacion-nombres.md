# Verificación de nombres de canciones (noviembre 2026)

Se comprobaron **las 3.931 filas** de `musica/*.json` contra el catálogo público de Deezer
(búsqueda por artista + título; si no aparecía, búsqueda libre y luego solo por título),
comparando título, artista y duración. El script y la caché quedaron fuera del repositorio;
el resultado está aquí.

## Resultado

| | Canciones |
| --- | ---: |
| Título y artista coinciden con la versión publicada | 3.718 (94,6 %) |
| Coinciden, pero Deezer devolvió primero un cover/karaoke (el nombre está bien) | ~120 |
| Solo existen en SoundCloud/YouTube o con otro alfabeto (ruso, japonés): nombre correcto | ~75 |
| Mal nombradas o con datos erróneos | **10** (corregidas abajo) |
| Dudosas: necesitan que alguien las escuche | 9 |

En resumen: la colección está **muy bien nombrada**. Lo que fallaba eran restos del archivo de
origen en el título y duraciones mal leídas del MP3 (archivos VBR), no canciones con el nombre
de otra.

## Corregido

Los `id` no cambian (favoritas, playlists e historial siguen funcionando) y `sync_r2.py`
respeta estos valores al volver a sincronizar.

| Tipo | Canción | Antes → Ahora |
| --- | --- | --- |
| Título | Blondie | `Heart Of Glass [24-Bit Digitally Remastered 01] - Remastered 2001` → `Heart Of Glass - Remastered 2001` |
| Título | The Weeknd, Playboi Carti | `Timeless (feat Playboi Carti)` → `Timeless (feat. Playboi Carti)` |
| Duración | pupsies – Bedtime Stories | 27:41 → 3:37 |
| Duración | Toshiki Soejima, Takuya Kuroda, edbl – Resonance | 51:30 → 3:28 |
| Duración | Lionmilk – fantasy | 64:31 → 2:32 |
| Duración | Night Tempo – Digital Detox | 62:22 → 2:24 |
| Duración | JW Francis, Paul Cherry – Row Row | 56:49 → 3:16 |
| Duración | Enry-K – 8 DIOPTRíAS | 44:08 → 2:23 |
| Duración | Troubless, Dj Secio, J3UNO – Fuego (Da Roots) | 22:54 → 3:06 |
| Duración | One Flyt, Ema, Ventu Beats – que dificil me la haces | 9:42 → 2:16 |

Además, en la app: **«Tyler, The Creator»** (y Earth, Wind & Fire; Crosby, Stills & Nash) ya no
se parte en dos artistas por la coma: antes salían «Tyler» y «The Creator» por separado en
Artistas, Lab y radios.

## Para revisar a mano (no se cambió nada)

| Canción | Qué pasa | Pista |
| --- | --- | --- |
| Jose Alatorre – `losdelmomento.com` (salt, 001-100/035, 2:11) | El título es la web de donde se bajó, no la canción | Por duración, probablemente **«yo no soy»** (2:04) o **«unico amor»** (2:03) |
| rlax – `190` (db4, 33:10) | Duración probablemente mal leída; no está en Deezer | Escuchar y corregir `duration` |
| One Flyt, Ventu Beats – `El primer día` (pepper, 123:40) | Duración imposible; no está en Deezer | Escuchar y corregir `duration` |
| Eyedress, Paul Cherry – Dancing with My Demons (0:34) | La publicada dura 3:42: ¿archivo cortado? | Volver a subir el MP3 |
| pupsies – sunshine beach ★ (0:32) | La publicada dura 2:14 | ¿Archivo cortado? |
| VARIATION – Stuck In Heaven (0:34) | La publicada dura 1:42 | ¿Archivo cortado? |
| Witness – Intermission (0:43) | La publicada dura 2:47 | ¿Archivo cortado? |
| hurtsick, Cxryn – let me in to your solitude. (1:00) | La publicada dura 2:05 | ¿Archivo cortado? |
| ukd, badthing – 99ers (0:32) | No aparece en Deezer | Comprobar el archivo |

Títulos que parecen raros pero **son así de verdad**: `la_pochi.wav` (tomas metrikf),
`sekairotten` (sekairotten), `8 DIOPTRíAS`, `Restless` de **Untitled** (el artista se llama así),
`DÁKITI – Spotify Singles`, y los títulos en japonés de Masayoshi Takanaka.
