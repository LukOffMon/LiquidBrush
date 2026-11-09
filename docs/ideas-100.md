# Liquid Bullet: 100 ideas y las 40 elegidas (v63)

Lluvia de ideas del 9 de noviembre de 2026 sobre `main` (v62) para mejorar el uso, la interfaz y los detalles de Liquid. Antes de proponer nada se repasó lo que ya tiene la app (DJ, cola editable, letras sincronizadas con desfase, ecualizador, temporizador, Lab, Stats, cuentas, descargas, deslizar la portada, Media Session, tutorial…), para no repetir lo que ya existe.

**Cómo se eligieron las 40.** Cada idea se puntuó por cuánto se nota al usar la app (impacto), cuánto riesgo tiene de romper algo y si encaja con cómo funciona Liquid: una web estática sin servidor propio, con los datos en el navegador o en la cuenta, en teléfono y escritorio. Se eligieron las de impacto claro, riesgo bajo y que se pueden comprobar en el navegador. Quedaron fuera las que ya existían, las que necesitan un servidor o un permiso molesto y las que son proyectos grandes por sí solas.

Leyenda: ✅ = elegida y hecha en v63 · ✅ extra = hecha, pero va dentro de otra idea y no cuenta entre las 40 · ✗ = descartada (con el motivo).

## Reproductor

| # | Idea | |
|---|---|---|
| 1 | Tocar el tiempo total lo cambia a tiempo restante («−1:12»), y se recuerda | ✅ |
| 2 | Al pasar el ratón por la barra de progreso, el minuto exacto donde caerías | ✅ |
| 3 | Rueda del ratón sobre el volumen para subirlo y bajarlo | ✅ |
| 4 | Rueda del ratón sobre la barra de progreso: ±5 s | ✅ |
| 5 | Porcentaje de volumen a la vista al cambiarlo | ✅ |
| 6 | Doble toque en la portada de Sonando = Me gusta, con un corazón que late | ✅ |
| 7 | La pestaña del navegador lleva ▶ mientras suena | ✅ |
| 8 | Pantalla encendida mientras lees la letra sincronizada en Sonando | ✅ |
| 9 | Deslizar el mini reproductor a los lados cambia de canción (como la portada) | ✅ |
| 10 | Si una canción no carga, el aviso trae «Reintentar» | ✅ |
| 11 | Velocidad distinta de 1× visible en el reproductor (tocarla vuelve a 1×) | ✅ |
| 12 | Mantener pulsado «siguiente» para avanzar rápido | ✗ choca con el toque normal en móvil |
| 13 | Botones ±10 s en la pantalla de bloqueo | ✗ se anularon a propósito: en iPhone quitarían anterior/siguiente |
| 14 | Crossfade configurable | ✗ ya existe (Transiciones DJ) |
| 15 | Normalizar el volumen entre canciones | ✗ necesita analizar cada MP3 (Web Audio con CORS) |
| 16 | Reproducción sin cortes (gapless) | ✗ los MP3 traen silencio propio; poco efecto |
| 17 | Mini reproductor flotante (Picture-in-Picture) | ✗ API solo en Chrome de escritorio |
| 18 | Anunciar la canción a lectores de pantalla | ✗ ya existe |

## Teclado

| # | Idea | |
|---|---|---|
| 19 | «?» abre la ayuda de atajos (también en Ajustes → Ayuda) | ✅ |
| 20 | F: Me gusta a la que suena | ✅ |
| 21 | A: menú de la que suena (playlist, cola, radio, compartir…) | ✅ |
| 22 | C: ir a la que suena en la lista | ✅ |
| 23 | X: una canción al azar de toda la biblioteca | ✅ |
| 24 | Mayús + clic en una canción: al final de la cola; Ctrl/⌘ + clic: a continuación | ✅ |
| 25 | ↑/↓ para moverse entre canciones de la lista | ✅ extra, va con la 30 |
| 26 | J/L para ±10 s como YouTube | ✗ L ya abre la letra |
| 27 | Atajos configurables | ✗ demasiado para el uso que tendría |

## Listas y búsqueda

| # | Idea | |
|---|---|---|
| 28 | Botón flotante «La que suena» cuando no está a la vista | ✅ |
| 29 | Botón «Volver arriba» en listas largas | ✅ |
| 30 | En el buscador, ↓ pasa a los resultados | ✅ |
| 31 | Intro en el buscador reproduce el primer resultado (con teclado físico) | ✅ |
| 32 | Resaltar en los resultados las palabras buscadas | ✅ |
| 33 | Al pasar el cursor por una canción: cuántas veces la escuchaste y cuándo | ✅ |
| 34 | Etiqueta «Nueva» en las canciones que llegaron hace poco | ✅ |
| 35 | Bordes que se desvanecen en las filas de chips (indican que hay más) | ✅ |
| 36 | Seleccionar varias canciones a la vez | ✗ proyecto grande (modo selección en toda la lista) |
| 37 | Arrastrar una canción a la cola | ✗ el arrastre ya está en la cola; desde la lista choca con el desplazamiento |
| 38 | Filtros por década | ✗ los MP3 no traen el año |
| 39 | Filtro por duración | ✗ ya se puede ordenar por duración |
| 40 | Búsqueda por voz | ✗ API desigual entre navegadores y pide micrófono |
| 41 | Recordar dónde ibas en la lista al volver a ella | ✗ ya vuelve por el historial |

## Letras

| # | Idea | |
|---|---|---|
| 42 | Tamaño de la letra A− / A+, recordado | ✅ |
| 43 | Copiar la letra | ✅ |
| 44 | La letra deja de seguir la canción unos segundos si la recorres a mano | ✅ |
| 45 | «Traducir» también en las letras sincronizadas (antes no salía: error) | ✅ |
| 46 | Modo karaoke a pantalla completa | ✗ proyecto aparte |
| 47 | Compartir un verso como imagen | ✗ ya existe la tarjeta para compartir; mezclarla con letra es grande |
| 48 | Editar la letra a mano | ✗ no hay dónde guardarla para todos |

## Cola

| # | Idea | |
|---|---|---|
| 49 | Vaciar lo que viene, con «Deshacer» | ✅ |
| 50 | Mezclar una vez lo que viene | ✅ |
| 51 | La cola dice a qué hora termina («termina sobre las 22:41») | ✅ |
| 52 | Duración de la cola | ✗ ya existe |
| 53 | Guardar la cola como playlist | ✗ ya existe |
| 54 | Historial de colas anteriores | ✗ poco uso para su coste |

## Canción y playlists

| # | Idea | |
|---|---|---|
| 55 | Copiar «Artista – Título» desde el menú de la canción | ✅ |
| 56 | Buscar la canción en YouTube o Spotify | ✗ saca a la persona de Liquid |
| 57 | Ordenar las canciones dentro de una playlist propia | ✗ se puede reordenar en la cola; en playlists es un proyecto aparte |
| 58 | Carpetas de playlists | ✗ grande; pocas personas tienen tantas |
| 59 | Playlists colaborativas | ✗ necesita servidor compartido |
| 60 | Portada automática en mosaico para playlists propias | ✗ ya existe |
| 61 | Duplicar playlist | ✗ ya existe |

## Inicio y descubrir

| # | Idea | |
|---|---|---|
| 62 | Canción del día: una distinta cada día, de las que aún no has escuchado | ✅ |
| 63 | «Hace un mes» y «Hace un año»: lo que sonaba entonces | ✅ |
| 64 | Saludo según la hora | ✗ ya existe |
| 65 | Mixes por estado de ánimo | ✗ los mixes del día y la daylist ya lo cubren |
| 66 | «Para esta noche / para entrenar» | ✗ sin datos de energía de cada canción |
| 67 | Racha de días escuchando | ✗ ya existe en Stats |
| 68 | Notificaciones de música nueva | ✗ pide permiso de notificaciones; el aviso de actualización ya lo cuenta |

## Stats

| # | Idea | |
|---|---|---|
| 69 | Descargar tu historial completo en CSV (Excel, Google Sheets) | ✅ |
| 70 | Resumen anual estilo «Wrapped» | ✗ proyecto aparte |
| 71 | Comparar meses | ✗ Stats ya compara con el mes anterior |
| 72 | Géneros más escuchados | ✗ ya existe (con géneros reales desde v62) |

## Interfaz y apariencia

| # | Idea | |
|---|---|---|
| 73 | Texto seleccionado con el color del tema | ✅ |
| 74 | Barras de desplazamiento finas con el acento (ratón) | ✅ |
| 75 | En Sonando, los géneros reales bajo el artista (salía el nombre de la playlist) | ✅ |
| 76 | Indicador de carga en el botón de reproducir | ✗ ya existe |
| 77 | Esqueletos mientras carga | ✗ ya existen |
| 78 | Tema automático claro/oscuro según la hora | ✗ el Taller de temas ya da el control |
| 79 | Modo horizontal para el móvil | ✗ diseño aparte para pocas personas |
| 80 | Más fondos de pantalla | ✗ necesita imágenes nuevas (se suman en la Biblioteca de imágenes) |
| 81 | Vista compacta de la lista | ✗ choca con el tamaño de texto que ya se elige |

## Robustez y errores

| # | Idea | |
|---|---|---|
| 82 | Avisos con botón dentro de un diálogo abierto quedaban debajo y no se podían tocar (error) | ✅ |
| 83 | Prueba inestable de Lab (medía mientras cambiaba de página) | ✅ extra (arreglo de la prueba, no de la app) |
| 84 | Aviso al perder y recuperar la conexión | ✗ ya existe |
| 85 | Reintentar sola una canción cortada | ✗ ya existe |
| 86 | Saltar canciones que no cargan | ✗ ya existe |
| 87 | Informe de errores | ✗ ya existe (Ajustes → Ayuda) |

## Cuenta, compartir y app

| # | Idea | |
|---|---|---|
| 88 | Compartir una canción desde un minuto concreto | ✗ cambia los enlaces de `s/` (4.700 páginas) |
| 89 | Iniciar sesión con Google | ✗ necesita configurar OAuth en el Worker |
| 90 | Perfiles públicos | ✗ servidor y privacidad |
| 91 | Atajos en el icono de la app | ✗ ya existen (`shortcuts` del manifest) |
| 92 | Recibir canciones compartidas desde otras apps | ✗ ya existe (`share_target`) |
| 93 | Widget en la pantalla de inicio | ✗ la web no puede crear widgets |

## Accesibilidad

| # | Idea | |
|---|---|---|
| 94 | Ayuda de atajos accesible y el tiempo restante usable con teclado | ✅ extra, va con la 1 y la 19 |
| 95 | Respetar «reducir movimiento» en todo lo nuevo | ✅ extra, va con la 6, la 28 y la 34 |
| 96 | Saltar al contenido | ✗ ya existe |
| 97 | Alto contraste | ✗ el Taller de temas ya ajusta el contraste solo |
| 98 | Subtítulos de la letra en voz alta | ✗ fuera del propósito de la app |
| 99 | Tamaño del texto | ✗ ya existe |
| 100 | Vibración al tocar | ✗ ya existe |

## Las 40 hechas en v63

- Reproductor: 1-11 (11)
- Teclado: 19-24 (6)
- Listas y búsqueda: 28-35 (8)
- Letras: 42-45 (4)
- Cola: 49-51 (3)
- Canción: 55 (1)
- Inicio: 62-63 (2)
- Stats: 69 (1)
- Interfaz: 73-75 (3)
- Errores: 82 (1)

Total: 40. Además, las extras 25, 83, 94 y 95.
