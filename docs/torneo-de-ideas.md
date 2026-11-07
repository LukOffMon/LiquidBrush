# Torneo de ideas (noviembre 2026, v61)

Se postularon **22 ideas nuevas** para Liquid Bullet: ninguna estaba ya en la app ni repetía lo hecho en la [auditoría de 300 mejoras](auditoria-300-mejoras.md). Se enfrentaron con los mismos 5 criterios, de 1 a 5 puntos cada uno (máximo 25):

| Criterio | Qué mide |
| --- | --- |
| **Impacto** | Cuánto cambia el día a día de quien escucha |
| **Originalidad** | Si diferencia a Liquid de cualquier reproductor |
| **Encaje** | Si aprovecha lo que Liquid ya tiene (Biblioteca, géneros, algoritmo, letras, Stats) |
| **Viabilidad** | Si se puede hacer bien **sin servidor**, con MP3 en R2 sin CORS y en iPhone |
| **Riesgo** (invertido) | 5 = no rompe nada ni molesta; 1 = puede estropear la reproducción o la privacidad |

## Resultado

| # | Idea | Imp. | Orig. | Encaje | Viab. | Riesgo | **Total** | Veredicto |
| --: | --- | --: | --: | --: | --: | --: | --: | --- |
| 1 | **Explora por género** (13 géneros en Inicio) | 5 | 3 | 5 | 5 | 5 | **23** | Gana |
| 2 | **Radio de género** sin fin | 5 | 3 | 5 | 5 | 5 | **23** | Gana |
| 3 | **Ruleta de géneros** (prefiere los que menos oyes) | 4 | 5 | 5 | 5 | 5 | **24** | Gana |
| 4 | **Tu canción de hoy** con su porqué | 4 | 4 | 5 | 5 | 5 | **23** | Gana |
| 5 | **Sorpréndeme** (un artista que nunca pusiste) | 4 | 4 | 5 | 5 | 5 | **23** | Gana |
| 6 | **Adivina la canción** (5 rondas de 10 s) | 4 | 5 | 4 | 4 | 4 | **21** | Gana |
| 7 | **Letra a pantalla completa** (karaoke) | 4 | 3 | 5 | 5 | 5 | **22** | Gana |
| 8 | **Paleta de comandos** (Ctrl/⌘ + K) | 3 | 4 | 5 | 5 | 5 | **22** | Gana |
| 9 | **Racha y logros** | 4 | 3 | 5 | 5 | 4 | **21** | Gana |
| 10 | **Tu mes en Liquid** (resumen para compartir) | 4 | 3 | 5 | 5 | 5 | **22** | Gana |
| 11 | **¿Por qué suena esto?** (el algoritmo, explicado) | 4 | 4 | 5 | 5 | 5 | **23** | Gana |
| 12 | Modo fiesta (pantalla grande, QR y cola de invitados) | 4 | 4 | 3 | 2 | 3 | 16 | Fuera |
| 13 | Constelación de artistas (grafo de parecidos) | 3 | 5 | 4 | 3 | 1 | 16 | Fuera |
| 14 | Modo vinilo con *scratch* | 3 | 5 | 3 | 3 | 2 | 16 | Fuera |
| 15 | Notas por canción (un recuerdo privado) | 2 | 3 | 3 | 5 | 2 | 15 | Fuera |
| 16 | Búsqueda por voz | 3 | 2 | 3 | 2 | 5 | 15 | Fuera |
| 17 | Narrador DJ con voz sintetizada | 2 | 5 | 3 | 3 | 2 | 15 | Fuera |
| 18 | Escucha conjunta en vivo | 5 | 4 | 3 | 1 | 0 | 13 | Fuera |
| 19 | Ecualizador | 3 | 1 | 3 | 1 | 4 | 12 | Fuera |
| 20 | Cola colaborativa por QR | 4 | 4 | 2 | 1 | 1 | 12 | Fuera |
| 21 | Filtro por década | 4 | 2 | 3 | 1 | 2 | 12 | Fuera |
| 22 | Despertador musical | 3 | 3 | 2 | 1 | 2 | 11 | Fuera |

## Las 11 ganadoras: qué hacen y por qué entraron

1. **Explora por género.** En Inicio, una tarjeta por cada género amplio (Pop, Rock y metal, Reggaetón y trap latino…) con las portadas de sus estilos, cuántas canciones tiene y un botón **Ver** que abre la Biblioteca ya filtrada. *Por qué:* completa el filtro por géneros con una puerta de entrada visible; antes solo había 45 estilos sueltos.
2. **Radio de género.** Tocar un género pone una radio **sin fin** con todos sus estilos, ponderada por lo que te gusta y dejando al final lo que sonó hace poco. *Por qué:* es lo que más se pide en un reproductor («pon algo de rock») y reutiliza el motor de radio de artistas.
3. **Ruleta de géneros.** Un dado que elige un género **al azar, con más probabilidad para los que menos escuchas**, y arranca su radio. *Por qué:* la idea más original y barata; ataca la burbuja del algoritmo.
4. **Tu canción de hoy.** Una sola canción al día (la misma todo el día), que no está en favoritas y no sonó hace poco, con una línea que explica por qué («Porque escuchas a X, que se parece»). Al tocarla suena y sigue con su radio. *Por qué:* un motivo para abrir Liquid cada día, sin abrumar.
5. **Sorpréndeme.** Un artista de la colección que **nunca pusiste**, elegido entre los parecidos a tus gustos, con su radio. *Por qué:* con casi 2.000 artistas, muchos no se escuchan nunca; ayuda a los artistas que ya están en Liquid.
6. **Adivina la canción.** 5 rondas: suenan 10 segundos de una canción que ya escuchaste (desde el 35 %, para saltar intros) y eliges entre 4 del mismo estilo. Guarda tu mejor marca. Pausa la música al empezar. *Por qué:* convierte la Biblioteca en un juego. Perdió 1 punto de viabilidad y 1 de riesgo porque usa un segundo reproductor (en iPhone necesita tocar para empezar, por eso arranca con un botón).
7. **Letra a pantalla completa.** Botón junto a «Letra» en Sonando (o tecla **K**): la letra sincronizada en grande, centrada en la línea que suena, con el color de la portada; tocar una línea salta a ese momento. *Por qué:* las letras ya existían; aquí ganan un modo karaoke para cantar o proyectar.
8. **Paleta de comandos.** **Ctrl/⌘ + K** abre «Ir a…»: acciones (reproducir, cola, temporizador, ruleta…), radios de género, playlists, artistas y canciones, con flechas e Intro. *Por qué:* hace Liquid rapidísima en el ordenador sin estorbar en el móvil.
9. **Racha y logros.** En Inicio, «Racha de N días · X logros»: 13 logros (En racha, Semana líquida, Explorador de 5 géneros, Todoterreno, Maratón de 2 h, Noctámbulo, Oído absoluto…) con barra de progreso. Se **calculan con tu historial** (no se guarda nada aparte) y se avisa una vez de cada logro nuevo. *Por qué:* motiva a volver y a explorar géneros. Un punto menos de riesgo: la gamificación puede cansar, así que no hay notificaciones.
10. **Tu mes en Liquid.** En Stats (y desde los logros): minutos, canciones distintas, tu género y tu podio de artistas del mes, y **Compartir como imagen** con la tarjeta de siempre. *Por qué:* un «Wrapped» mensual con los datos que Stats ya reunía.
11. **¿Por qué suena esto?** En Sonando: de dónde viene la canción (radio, mix, Lab, playlist), si es nueva para ti, a quién se parece, su estilo y su género, y si la sueles saltar; con atajo a «No me gusta». *Por qué:* transparencia; el algoritmo de Liquid ya sabía todo esto, ahora lo cuenta.

## Las 11 descartadas: por qué no

- **Modo fiesta (16):** necesita un servidor en tiempo real para que los invitados sumen canciones; sin él queda en una pantalla grande que ya cubren el karaoke y las Transiciones DJ.
- **Constelación de artistas (16):** muy vistosa, pero dibujar ~2.000 artistas y sus parecidos es pesado en móviles lentos y se usa poco.
- **Modo vinilo con *scratch* (16):** bonito pero caro de hacer bien; en iPhone cambiar `playbackRate` al arrastrar suena entrecortado.
- **Notas por canción (15):** poco uso esperado y otro dato privado que sincronizar con la cuenta.
- **Búsqueda por voz (15):** la API de voz no existe en Firefox y en Safari es irregular; el buscador con erratas ya cubre el caso.
- **Narrador DJ con voz sintetizada (15):** las voces del sistema suenan robóticas y cortan la música; mejor un texto («¿Por qué suena esto?»).
- **Escucha conjunta en vivo (13):** exige un servidor de sincronización (WebRTC o Durable Objects) y moderación.
- **Ecualizador (12):** los MP3 de R2 no envían CORS; pasar el audio por Web Audio lo dejaría **en silencio**.
- **Cola colaborativa por QR (12):** igual que la escucha conjunta, necesita servidor y cuentas de invitados.
- **Filtro por década (12):** las canciones no tienen año; habría que etiquetar ~4.000 a mano o con un servicio externo.
- **Despertador (11):** la web no puede despertar al teléfono ni sonar con la app cerrada: prometería algo que no cumple.

Quedan apuntadas para cuando haya servidor propio (escucha conjunta, cola colaborativa, modo fiesta) o metadatos de año (filtro por década).

## Auditoría de esta versión

Se recorrieron todas las vistas a 360 px y 1.366 px con Playwright y se revisaron los datos de las 5 listas:

- **Sin errores** de JavaScript ni de consola, **sin desplazamiento lateral** y **ningún botón ni imagen sin nombre accesible**.
- Los botones más pequeños (barra del reproductor en escritorio) miden 28 × 40 px: cumplen el mínimo de 24 px de WCAG 2.2.
- Datos: ninguna canción sin duración ni sin artista; las 25 canciones repetidas que detecta `tools/find_duplicates.py` ya se ocultan en el catálogo (se ve una sola copia; algunas son versiones distintas, como un remix, y se ven las dos); «Mori» y «mori» son artistas distintos.
- Corregido en esta versión: en la paleta, Esc cierra a la primera (antes borraba el texto); la radio de género se renueva sola al acabarse, como la de artistas.
