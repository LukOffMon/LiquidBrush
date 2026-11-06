# Liquid Bullet: auditoría completa y 300 mejoras

Revisión del 6 de noviembre de 2026 sobre `main` (`5989a85`). Abarca todo el repositorio: `index.html`, `app.js` (9.969 líneas), `styles.css` (6.600), `sw.js`, `manifest.webmanifest`, el Worker de `cuentas/`, `tools/`, `tests/`, `s/` (≈4.000 páginas), `review.html`, `imagenes.html`, `404.html`, los datos (`musica/*.json`, `catalog.json`) y los recursos gráficos. El sitio se abrió en Chromium como Pixel 7 y como escritorio de 1440×900.

Leyenda: 🔥 = alto impacto, hacer primero · ✅ = comprobado en el código o en el navegador (los demás puntos son propuestas).

---

## 0. Cómo está estructurado (mapa)

| Capa | Archivos | Qué hace |
|---|---|---|
| **Shell** | `index.html` (893 l.) | CSP en `<meta>`, script inline de tema y fuentes antes de pintar, escena SVG surrealista, topbar, `main.layout` (Sonando + Biblioteca), `footer.player`, `bottom-nav` y 10 `<dialog>` (playlist, añadir, cola, papelera, compartir, temporizador, ajustes, tour, cuenta) |
| **Lógica** | `app.js` (un único IIFE) | Configuración → Estado → DOM → Utilidades → Fondos → Carga de datos → Novedades → Offline → Playlists → Mis playlists → DJ → Registro de escucha → Stats → Vistas → Búsqueda → Inicio/Artistas/Radio → Compartir → Índice A–Z → Historial → Sonando → Cola → Temporizador → Reanudar → Reproducción → Letras → Fondo dinámico → Ecualizador → Visualizador → Temas → Escena → Interrupciones → Media Session → Eventos → Fondo vivo → PWA → **Cuenta** (API, PBKDF2, Turnstile, pantallas) → Tour → Ajustes → Inicio |
| **Estilos** | `styles.css` | 4 temas (`chrome`, `minimal`, `yem`, `ebano`), 42 `@media`, 34 `backdrop-filter`, 27 `!important`, modo `ultra`/`lite`/`no-motion` |
| **Offline** | `sw.js` (v51) | Caché del shell con *network-first*, portadas con *stale-while-revalidate* (límite de 600), audio descargado con soporte de `Range` |
| **Datos** | `musica/*.json` (5 × ~200 KB), `catalog.json` (982 KB), `tracks.json` (respaldo vacío) | ~3.900 canciones en 5 buckets R2, 43 playlists, géneros, alias y portadas por canción |
| **Backend** | `cuentas/` (Worker + D1 + R2 + Turnstile + Rate Limiting + Cron) | Alta/confirmación por código, entrar, renovar con rotación de token, recuperar, perfil, dispositivos, datos `gz` con ETag |
| **Herramientas** | `tools/*.py` | `sync_r2`, `build_catalog` (genera `s/`), `build_image_library`, `bump_version`, `check_site`, `check_r2`, `find_duplicates` |
| **Calidad** | `tests/app.spec.js` (16 tests de Playwright), `eslint.config.js`, CI en GitHub Actions | |
| **Páginas aparte** | `review.html`, `imagenes.html`, `404.html`, `s/*.html` | Reseña interactiva, biblioteca de imágenes, error y páginas para compartir con Open Graph |

**Medido en la primera visita:** FCP de 240 ms en móvil y 300 ms en escritorio (muy bien); **4,9 MB transferidos en móvil y 6,0 MB en escritorio**, con 91 y 97 peticiones; **2,3 MB escritos en `localStorage` nada más abrir** (1,8 MB `library-cache` + 480 KB `resume-queue`); 1.219 nodos del DOM; la hoja de cuenta, el tutorial y un aviso aparecen seguidos.

---

## 1. Hallazgos comprobados: errores y riesgos (21)

1. 🔥✅ **El Cron deja datos huérfanos en R2.** `limpieza()` borra en R2 los archivos de solo 50 usuarios (`LIMIT 50`), pero luego el `DELETE FROM usuarios WHERE borrar_el < ?` borra **a todos** los vencidos. Desde el usuario 51, sus datos quedan para siempre en R2, sin dueño (un problema de privacidad y de RGPD). Solución: borrar en D1 solo los ids procesados (`DELETE … WHERE id IN (…)`).
2. 🔥✅ **Cerrar sesión no corta el acceso al momento.** `autenticar()` solo verifica la firma del pase (15 min) y no mira `sesiones.revocada`. Tras «Cerrar en todos los dispositivos» o «Cerrar» un dispositivo robado, ese pase sigue leyendo y escribiendo `/datos` hasta 15 minutos. Solución: comprobar la sesión en las rutas que escriben (o bajar el pase a 5 min y guardar una lista de revocados en KV).
3. 🔥✅ **`localStorage` al borde del límite.** Abrir la app escribe 2,3 MB de golpe: `library-cache` ocupa 1,8 MB y `resume-queue` 480 KB, porque guarda `queue` **y** `base` con ids largos para toda la biblioteca. Con letras en caché, Stats y el historial, los ~5 MB de Safari se llenan y las escrituras empiezan a fallar en silencio. Pasar la caché a IndexedDB y guardar la cola como índices o ids cortos de 7 caracteres (ya existen para la cuenta).
4. 🔥✅ **El `JSON.parse` de 1,8 MB al arrancar bloquea el hilo principal** en teléfonos lentos, justo en la carga, cuando la app «abre al instante con la biblioteca de la última visita». Usar IndexedDB (clon estructurado) o un `Worker`.
5. 🔥✅ **Tres capas de bienvenida seguidas en la primera visita:** hoja de cuenta → al cerrarla, el tutorial (`tourDialog`) → y además el aviso «Sigues sin cuenta…». Es el peor momento para pedir cosas. Dejar que suene música primero y ofrecer la cuenta después (por ejemplo, al marcar la primera favorita).
6. ✅ **El aviso «Sigues sin cuenta» tapa la tarjeta de la daylist** en el centro de la pantalla del móvil y usa una tipografía distinta del resto. Moverlo encima del mini-reproductor, con la letra del tema.
7. ✅ **El botón «Ajustes» de la barra superior se corta** por el borde derecho a 412 px (Pixel 7). En el móvil, dejar solo el icono.
8. ✅ **La barra superior es translúcida y el texto pasa por debajo** al desplazarse («Descubre semanal / Nunca las has escuchado» se lee a través del goteo). Darle un fondo más opaco, o un degradado de máscara.
9. ✅ **El mini-reproductor deja ver el contenido a través** («Selección rápida», «Sol Sintético» se leen detrás de «Mr. Vain»), lo que resta legibilidad a título y artista.
10. ✅ **Navegación duplicada en el móvil:** píldoras (Inicio, Biblioteca, Playlists, Artistas, Favoritas) **y** barra inferior (Inicio, Buscar, Biblioteca, Playlists, Lab). Cuatro destinos repetidos y dos sistemas que compiten.
11. ✅ **La letra se pide a LRCLIB al cargar, antes de pulsar Reproducir.** Gasta datos y envía título y artista a un tercero sin que la persona haya escuchado nada. Pedirla al reproducir o al abrir la letra.
12. ✅ **El saludo y la daylist se contradicen:** «Buenas noches» junto a «Tu viernes de madrugada». Usar los mismos tramos horarios en los dos sitios.
13. ✅ **«Y artistas parecidos» se repite debajo de cada radio:** es ruido. Mejor «con X, Y» (dos artistas reales).
14. ✅ **El código por correo se puede reintentar más de lo previsto:** pedir un código nuevo pone `intentos = 0`. Hay 5 intentos por código y 5 códigos por hora, o sea 25 intentos por hora y por correo, y más si se reparte entre IPs. Llevar la cuenta de intentos por correo y ventana, no por código.
15. ✅ **`origenPermitido` acepta cualquier `http://localhost:*`** en producción. Cualquier página local del dispositivo puede llamar a la API con un pase robado. Limitarlo a un entorno de desarrollo (`env.DEV`).
16. ✅ **`/datos` no revisa `borrar_el`:** una cuenta con borrado programado puede seguir escribiendo datos que se van a borrar. O se bloquea la escritura, o se avisa.
17. ✅ **`DATOS_MAX` confía primero en `Content-Length`** y luego lee el cuerpo entero en memoria con `arrayBuffer()`. Con *chunked* (sin longitud) se leen 2 MB+ antes de rechazar. Usar `request.body` con un lector que corte al pasar el límite.
18. ✅ **Las versiones van a mano en tres sitios:** `sw.js` `VERSION='v51'`, `styles.css?v=37`, `app.js?v=40`, y además el `SHELL`. Un olvido y queda un shell viejo. Que `bump_version.py` genere *hashes* de contenido en los tres.
19. ✅ **El `SHELL` del SW precarga los 5 `musica/*.json` y `catalog.json` (~2 MB)** en `install`. Si falla uno, falla `addAll` y no se instala la actualización. Instalar los datos con `Promise.allSettled` y aparte del shell.
20. ✅ **La CSP permite `connect-src https:` e `img-src https:`** de forma genérica. Se puede cerrar a R2 (5 hosts), LRCLIB, el Worker, Turnstile y Google Fonts.
21. ✅ **`tracks.json` está vacío (`[]`):** el «respaldo» documentado en el README no respalda nada. O se llena con 20 canciones de demostración, o se quita del flujo.

---

## 2. Arquitectura y código (18)

22. 🔥 Partir `app.js` (≈438 KB, un solo IIFE) en módulos ES nativos (`<script type="module">`), sin compilador, siguiendo los 60 bloques que ya marca el archivo: `player/`, `library/`, `home/`, `lab/`, `stats/`, `cuenta/`, `ui/`.
23. Cargar con `import()` diferido lo que no hace falta al abrir: Stats, Lab, cuenta (~1.700 líneas), tutorial, tarjeta para compartir y ecualizador.
24. Separar `styles.css` por tema (`themes/chrome.css`…) y cargar solo el activo (el script inline ya conoce el tema).
25. Una sola capa `store` con un esquema versionado (`schemaVersion`) y migraciones, en lugar de 35 claves `liquidbrush:*` sueltas.
26. Un bus de eventos interno (`emit('track:change')`) en vez de llamadas cruzadas entre secciones: así el reproductor, Inicio y Stats dejan de depender unos de otros.
27. Un único lugar para el estado de reproducción (una máquina de estados `idle → loading → playing → paused → error`), que evita los botones desincronizados.
28. Plantillas `<template>` en `index.html` para filas, tarjetas y chips, en vez de crearlas a mano con `createElement`.
29. Añadir comprobación de tipos con JSDoc + `// @ts-check` y `tsc --noEmit` en CI, sin pasar a TypeScript.
30. Reemplazar los `innerHTML` de iconos por un `icon(name)` que cree el `<svg><use>` con la API del DOM (hay 20 usos).
31. Centralizar la función `esc()` de la cuenta en Utilidades y hacer que la regla de ESLint `no-unsanitized` obligue a usarla.
32. Bajar los 27 `!important` de `styles.css` con `@layer` (reset, base, temas, utilidades).
33. Tokens de diseño en `:root` (espaciado, radios, sombras, z-index) y documentarlos en `imagenes.html` o en una página de estilo.
34. Pasar las constantes mágicas (30 s de salto, 14 días de vida media, 600 entradas de caché…) a un `TUNING` comentado y en un solo sitio.
35. Llevar `CONFIG.sources` a `musica/sources.json`, que hoy se repite en `app.js`, `sw.js`, `index.html` (`dns-prefetch`) y el README.
36. Cuidar los `requestAnimationFrame` (12) y `setInterval` (6): pararlos todos en `visibilitychange` y comprobar que ninguno sigue con la pestaña oculta.
37. Una única función `fetchJSON` con tiempo de espera, reintentos y `AbortController` (hoy cada sección hace su propio `fetch`).
38. Con 182 `addEventListener`, conviene delegar eventos por vista (un manejador por contenedor) y `AbortController` para quitarlos al cambiar de vista.
39. Medir con `PerformanceObserver` (*long tasks*) y publicar un objetivo de rendimiento: ninguna tarea de más de 50 ms al abrir.

## 3. Rendimiento y carga (20)

40. 🔥 Reducir los 4,9–6 MB de la primera visita: la mayor parte son portadas JPG y fondos. Pasar a **AVIF/WebP** con `<picture>` (entre −40 % y −60 %).
41. 🔥 Un `catalog.json` compacto: 982 KB con `songCovers` por id. Usar tablas de índices (arrays paralelos) y quitar los campos repetidos. Objetivo: menos de 250 KB.
42. Unir los 5 `musica/*.json` en un solo `library.json` generado (una petición en lugar de 6) con ids cortos.
43. Cargar `songCovers` y `aliases` en diferido: no hacen falta para pintar Inicio.
44. `fetchpriority="high"` en la portada de Sonando y en la primera fila de Inicio, y `loading="lazy"` y `decoding="async"` en el resto.
45. `srcset` con 160/320/600 px en las portadas de canciones (hoy hay `-sm` y grande, sin `srcset`).
46. Comprimir `wallpapers/` (3,5 MB, 50 imágenes) y servir la versión del ancho de la pantalla.
47. Autoalojar las fuentes con `font-display: swap`, solo los subconjuntos `latin` y `latin-ext`, y precargar la del titular. Así se quitan el viaje a Google y la fuga de privacidad.
48. `size-adjust` y `ascent-override` en la fuente de reserva para que no salte el texto cuando llega Permanent Marker.
49. `content-visibility: auto` en todas las secciones de Inicio, no solo en el modo ultraligero.
50. Virtualizar la Biblioteca completa (~3.900 filas) con una ventana de 40 filas reciclables.
51. Precalcular en `build_catalog.py` los «parecidos» de artistas, en vez de calcularlos en el navegador en cada visita.
52. Mover a un `Worker` web el cálculo del algoritmo (mixes, daylist, Descubre), que bloquea el hilo principal en móviles de gama baja.
53. `navigator.connection.saveData` → activar el modo ultraligero automáticamente o sugerirlo.
54. Detectar un dispositivo lento (`deviceMemory <= 2` o `hardwareConcurrency <= 4`) y ofrecer el modo ultraligero en el primer arranque.
55. La escena surrealista con muchas capas `backdrop-filter` (34): limitar el desenfoque a 2–3 superficies grandes y usar fondos semiopacos en el resto.
56. Pausar las animaciones CSS de la escena con `animation-play-state: paused` cuando la pestaña no se ve o no suena nada.
57. Precargar con `<link rel="preload" as="audio">` (o `fetch` de un rango) los primeros 256 KB de la siguiente canción de la cola, para que el cambio sea instantáneo.
58. Presupuesto de rendimiento en CI con Lighthouse CI (LCP < 2,5 s en 4G lenta y JS < 200 KB al abrir).
59. Cachear `catalog.json` con `ETag` y pedirlo con `If-None-Match` en segundo plano: casi nunca cambia.

## 4. Almacenamiento, PWA y modo offline (18)

60. 🔥 Pasar `library-cache`, la letras en caché, el registro de escucha y `heard` a **IndexedDB** (con `idb-keyval` o una envoltura de 30 líneas).
61. 🔥 Guardar la cola de reanudación como `[índices]` o ids de 7 caracteres, y sin `base` cuando coincide con `queue`.
62. Mostrar en Ajustes cuánto ocupa cada cosa (letras, descargas, historial) con un botón «Liberar» por categoría.
63. Ofrecer `navigator.storage.persist()` también al guardar la primera playlist propia, no solo al descargar.
64. Caché de audio con límite y política LRU configurable (por ejemplo, 2 GB) y aviso cuando se acerca.
65. Descargas en segundo plano con **Background Fetch API** (Chrome Android) para que sigan con la app cerrada.
66. «Descargar mis favoritas» y «Descargar lo que más escucho» con un toque.
67. Descarga automática de las 50 más escuchadas con Wi-Fi (opcional).
68. Indicador de descarga por playlist (anillo de progreso en la portada) y total en la barra.
69. Al reconectarse, sincronizar en silencio lo pendiente (`online`) y mostrar un aviso discreto.
70. Si la red cae a mitad de una canción, pasar a la siguiente descargada en vez de quedarse en silencio.
71. `periodicSync` (donde exista) para traer `catalog.json` y novedades sin abrir la app.
72. **App Badging API**: número de canciones nuevas en el icono instalado.
73. En el manifiesto, `shortcuts` con iconos propios (hoy los cuatro usan `icon-192.png`).
74. Añadir al manifiesto `file_handlers` (abrir `.mp3` y `.m3u` locales con Liquid) y `protocol_handlers` (`web+liquid:`).
75. Importar MP3 locales del dispositivo con File System Access u `<input type=file>` a una «Biblioteca local» en IndexedDB.
76. Que la página offline del SW muestre las descargas disponibles cuando falla la navegación sin caché.
77. Revisar `ignoreSearch` en la navegación: `?view=lab` sin conexión debería abrir Lab y no solo `index.html` en Inicio.

## 5. Reproductor y audio (18)

78. 🔥 **Reproducción sin cortes (*gapless*)** entre canciones del mismo álbum: aprovechar los dos reproductores de las transiciones DJ y precargar con antelación.
79. 🔥 **Normalización de volumen**: calcular la sonoridad (LUFS) en `sync_r2.py` y aplicar la ganancia por canción (`gain` en el JSON). Es el detalle que más se nota con MP3 de origen variado.
80. Transición DJ inteligente: saltar los silencios finales e iniciales, que se pueden detectar al sincronizar.
81. «Recortar silencio» al final de las canciones con colas largas (*fade-out* de 30 s).
82. Velocidad de reproducción visible en Sonando (hoy solo con Mayús + , / .), con 0,75×, 1× y 1,25×.
83. Retroceder y avanzar con doble toque en la portada de Sonando (±10 s), como en YouTube.
84. Mantener pulsado «Siguiente» → avance rápido.
85. Recordar el segundo exacto también en canciones largas (más de 10 min) y en mezclas: «Seguir desde 23:14».
86. Ecualizador con preajustes por género y uno por auriculares o altavoz (guardado por dispositivo).
87. El aviso «sin CORS → sin ecualizador» debería explicar cómo arreglarlo y que `check_r2.py` lo compruebe.
88. Si un MP3 da 404, quitarlo de la cola, registrarlo en `liquidbrush:errors` y ofrecer «Informar» con un toque (que rellene el correo con id y URL).
89. Reintento automático con *backoff* ante `stalled` o `waiting` largos, antes de saltar.
90. Media Session: añadir `seekto`, `seekbackward` y `seekforward` con `seekOffset`, y la portada en 96, 256 y 512 px.
91. Cola: «Limpiar lo que queda», «Guardar cola como playlist» y «Deshacer» al quitar.
92. Temporizador: «al terminar el álbum o la playlist» y un deslizador libre (5–180 min).
93. Atajo para «me gusta» (F) y para «no me gusta» (X) en el teclado.
94. Modo coche o modo grande: botones gigantes y alto contraste, con un toque.
95. Compatibilidad con `audioSession.type = 'playback'` (Safari 17+) para mejorar las interrupciones en iOS.

## 6. Algoritmo, Inicio y recomendaciones (18)

96. 🔥 Explicar cada recomendación con una línea: «Porque escuchas Mac DeMarco de noche». Genera confianza y es el detalle que diferencia la app.
97. 🔥 Botones «Más de esto» y «Menos de esto» en cada tarjeta de Inicio, que alimenten los pesos.
98. Que «Selección rápida» cambie de verdad al deslizar para refrescar (*pull-to-refresh*) en Inicio.
99. Daylist con nombre generativo («Tu viernes de madrugada: indie pastel y trap lunar») usando los dos estilos dominantes.
100. Mix de «Enfoque» y otro de «Energía» calculados por BPM y energía (analizarlos una vez en `sync_r2.py`).
101. Usar la tonalidad (*key*) y el BPM para encadenar en la radio y en las transiciones DJ (mezcla armónica).
102. «Redescubre»: canciones con muchas escuchas hace 6+ meses y ninguna en los últimos 60 días.
103. Resumen anual y mensual («Liquid Wrapped») con tarjetas para compartir. Los datos ya están en el registro de escucha.
104. Vista «Hoy hace un año» en Inicio cuando haya datos (ya existe «Hace un año»: destacarla en su fecha).
105. Evitar en un mismo Inicio que dos mixes empiecen por la misma canción o el mismo artista.
106. Penalizar los saltos según el momento: saltar a los 2 s (enfado) no equivale a saltar a los 25 s (no encaja ahora).
107. Que el contexto de un salto cuente: saltar en la radio de X pesa menos que saltar en tus favoritas.
108. Diversidad configurable en Inicio («Más conocidas ↔ Más nuevas») global, no solo en Lab.
109. Arranque en frío: con menos de 30 min de escucha, Inicio debería mostrar los estilos para elegir los favoritos (3 toques) en vez de mixes vacíos o al azar.
110. Que el algoritmo use la hora local de la persona y el día de la semana (comprobar el uso de `getHours`, no UTC).
111. «Radio de esta playlist» (hoy hay radio por artista y por canción).
112. Fijar un mix de Inicio como playlist propia con un toque, para que no cambie mañana.
113. Mostrar en Lab → ADN musical un «antes y después» del mes: cómo cambiaron tus gustos.

## 7. Búsqueda, Biblioteca, Artistas y Playlists (18)

114. 🔥 Búsqueda instantánea con resultados agrupados (Mejor resultado / Canciones / Artistas / Playlists / Letras), como en Spotify, y navegación con el teclado (↑/↓/Enter).
115. Filtros en la búsqueda: duración, estilo, «solo descargadas», «nunca escuchadas».
116. Búsqueda por voz con `SpeechRecognition` donde exista.
117. Resaltar en el resultado el fragmento de letra que coincide.
118. Biblioteca: selección múltiple (mantener pulsado) para añadir varias a una playlist, a la cola o a favoritas.
119. Ordenar por «añadidas recientemente», «más escuchadas» y «última vez escuchada».
120. Página de artista con cabecera grande (portada de su canción más escuchada), «Lo más escuchado» y «Aparece en».
121. «Seguir» artistas con aviso cuando llegan canciones suyas (con Novedades).
122. Playlists propias: portada en mosaico con las 4 primeras portadas (además de icono y color).
123. Carpetas de playlists propias.
124. Reordenar canciones dentro de una playlist propia arrastrando (ya existe para la cola: reutilizar).
125. Descripción editable y «duración total» visible en cada playlist.
126. Exportar a M3U o CSV y importar desde M3U, además de la copia JSON.
127. Detectar duplicados al añadir: «Ya está en esta playlist. ¿Añadirla igual?».
128. Playlists inteligentes (reglas: estilo = X, escuchas > 3, añadida en los últimos 30 días).
129. Favoritas: un orden «Recientes primero» y una sección «Tus favoritas olvidadas».
130. Papelera con caducidad visible («se borra en 23 días») y vaciarla.
131. Índice A–Z también en Artistas.

## 8. Sonando y letras (15)

132. 🔥 Letra sincronizada a pantalla completa con la línea actual grande, tocar una línea para saltar ahí y desplazamiento suave.
133. Corrección manual de desfase con ±0,5 s (ya existe `lyricsOffsets`: hacerla visible con un control).
134. Compartir un fragmento de la letra como tarjeta (en la tarjeta para compartir: elegir 1–4 líneas).
135. Modo karaoke: resaltar por palabra cuando LRCLIB trae marcas de palabra (formato A2).
136. Traducción de la letra (botón «Traducir» que abra Google Translate con el texto, sin API).
137. Si LRCLIB no responde, un mensaje claro con «Reintentar» y «Buscar en la web».
138. Caché de letras con caducidad y tope (hoy crece en `localStorage`).
139. Créditos o información de la canción: año, álbum original y duración (de la verificación con Deezer).
140. Fondo dinámico con transición suave entre portadas (cruzar degradados en 600 ms).
141. Desplazar a la izquierda o la derecha en la portada de Sonando para cambiar de canción (móvil).
142. Deslizar hacia abajo para cerrar Sonando, con física (hoy se cierra con Atrás o Esc).
143. Mostrar «Siguiente: …» en Sonando, debajo de los controles.
144. Visualizador con 3 estilos (barras, onda y ondas líquidas acordes al tema).
145. Modo «Pantalla de bar» o «Ambiente»: Sonando a pantalla completa en escritorio, con la escena surrealista y letra grande (Fullscreen API).
146. Pantalla siempre encendida opcional mientras se ven las letras (Wake Lock API).

## 9. Lab y Stats (14)

147. Lab: «Guardar receta» propia (estilos + semillas + ajustes) para repetirla.
148. Lab: vista previa de la duración y la mezcla de estilos antes de generar.
149. Lab: «Regenerar solo esta canción» (reemplazar una por otra parecida).
150. Lab: «viaje de estilos» con gráfico de la curva (energía o estilo a lo largo de la mezcla).
151. Lab: compartir una receta por enlace (como las playlists propias).
152. Stats: mapa de calor estilo GitHub (día × hora).
153. Stats: «racha» de días seguidos escuchando.
154. Stats: logros discretos («100 horas», «50 artistas nuevos»), sin infantilizar.
155. Stats: comparar con el mes anterior con flechas y porcentajes claros.
156. Stats: exportar a CSV.
157. Stats: gráficos accesibles (tabla alternativa y `aria-describedby`).
158. Stats: horas por estilo a lo largo del año (área apilada).
159. Stats: «Tu canción del mes» con tarjeta para compartir.
160. Stats: aclarar qué cuenta como escucha (por ejemplo, más de 30 s) con una nota.

## 10. Diseño visual, temas y tipografía (18)

161. 🔥 **Legibilidad**: Permanent Marker en versalitas en botones, chips y textos de 3 líneas («Tus mixes siguen aprendiendo de ti») cansa. Dejarla en titulares y logotipo, y usar Inter o Syne en botones y textos.
162. 🔥 Más contraste del texto sobre el fondo de pantalla: velo del 60–70 % detrás de las secciones de Inicio (el wallpaper con mucho detalle compite con el contenido).
163. Un sistema de espaciado de 4/8 px aplicado igual en las tarjetas (hoy varía entre secciones).
164. Una sola escala tipográfica (por ejemplo, 12/14/16/20/28/40) aplicada a los 4 temas.
165. Reducir los radios distintos a 3 (pequeño, mediano y píldora).
166. Estados vacíos ilustrados con la estética surrealista (reloj derretido, ojo) en Favoritas, Mis playlists y búsquedas sin resultados.
167. *Skeletons* con la forma real de las tarjetas mientras carga Inicio.
168. Micro-interacción del corazón (gota de metal líquido que «salpica»), coherente con la marca.
169. Botón de reproducir con transición de forma play↔pausa (*morph* del SVG).
170. Tema que siga al sistema: «Automático» (Minimalista de día y Surrealista de noche) con `prefers-color-scheme`.
171. Un quinto tema de alto contraste (accesibilidad) que respete `prefers-contrast: more`.
172. Color de acento personalizable por tema.
173. `theme-color` dinámico según la portada que suena (la barra del sistema cambia de color en Android).
174. Revisar la coherencia de iconos: mezclar trazo y relleno según la sección resta acabado.
175. Las portadas de canción en lista se ven idénticas por bloques (44 iconos repartidos): ayudaría que cada fila muestre el estilo o el color de su playlist.
176. Animaciones de entrada escalonadas (*stagger*) en las filas de Inicio, de 30–40 ms, que se desactivan con `no-motion`.
177. Transiciones entre vistas con View Transitions API (`document.startViewTransition`): la portada «vuela» de la tarjeta a Sonando.
178. Hacer el goteo de la barra superior *sticky* con efecto de líquido al desplazarse (estiramiento leve), como firma visual.

## 11. Móvil y navegación (14)

179. 🔥 Quitar las píldoras de vistas en el móvil (ya está la barra inferior) y llevar «Artistas» y «Favoritas» dentro de Biblioteca como filtros.
180. Barra superior en el móvil: logo + avatar + engranaje (sin texto «Ajustes»), y el icono de persona dentro del avatar.
181. La barra inferior debería ocultarse al desplazarse hacia abajo y volver al subir (más espacio para el contenido).
182. Mini-reproductor con barra de progreso fina en el borde superior.
183. Deslizar el mini-reproductor a la izquierda o la derecha para cambiar de canción.
184. Zonas táctiles de al menos 44×44 px en los chips, los botones de fila y el índice A–Z.
185. Respeto de `safe-area-inset-*` en el mini-reproductor y en las hojas (revisarlo en un iPhone con isla dinámica).
186. Hojas (`dialog.sheet`) que se cierren deslizando hacia abajo, con un asa visible.
187. Restaurar la posición de desplazamiento de cada vista al volver con Atrás.
188. Retroalimentación háptica corta (`navigator.vibrate(10)`) en favorita, añadir y descargar (ya existe: unificarla).
189. Menú contextual de canción con pulsación larga (móvil) y clic derecho (escritorio).
190. Orientación horizontal en el móvil: Sonando a dos columnas (portada + letra).
191. En tableta, aprovechar 3 columnas (navegación, contenido y Sonando).
192. Atajo de «volver arriba» al tocar la pestaña activa de la barra inferior.

## 12. Bienvenida y cuentas (UX) (16)

193. 🔥 Retrasar la hoja de cuenta: mostrarla tras 10 minutos de escucha o al crear la primera playlist o favorita («Guárdala en la nube»).
194. 🔥 Tutorial de 7 pasos → 3 pasos contextuales (tooltips la primera vez que se usa cada cosa), que no bloqueen.
195. Inicio de sesión sin contraseña: **passkeys** (la tabla `passkeys` ya existe en D1, sin usar).
196. Enlace mágico por correo como alternativa al código de 6 dígitos.
197. `autocomplete="one-time-code"` e `inputmode="numeric"` en el campo del código y autocompletado con WebOTP (Android).
198. Mostrar el estado de sincronización («Sincronizado hace 2 min» / «Sin conexión: se sincronizará luego») en Ajustes → Tu cuenta.
199. Resolver conflictos (412 `cambio_en_otro_dispositivo`) con una fusión automática por campo (CRDT simple: unión de favoritas y última escritura por ajuste) y no con «elige uno».
200. «Descargar todos mis datos» (RGPD) desde la cuenta, en JSON.
201. Borrar la cuenta con confirmación y cuenta atrás visible (ya existe `borrar_el`: mostrarlo).
202. Avisar por correo de cada inicio de sesión desde un dispositivo nuevo.
203. Lista de dispositivos con la última ubicación aproximada (país, con `CF-IPCountry`).
204. El aviso «los códigos pueden llegar a Spam» se puede quitar si se envían con un dominio propio con SPF/DKIM/DMARC (Cloudflare Email Routing o Resend) en lugar de Gmail SMTP.
205. Al iniciar sesión por primera vez con datos locales, preguntar: «¿Subir lo de este dispositivo?» con un resumen (12 playlists y 340 favoritas).
206. Avatar: permitir también una portada de playlist como foto, no solo 8 fotos e inicial.
207. Nombre visible en Inicio («Buenas noches, Luka») cuando hay sesión.
208. Indicador de fuerza de contraseña con razones claras (ya mide: añadir «no uses tu correo»).

## 13. Accesibilidad (14)

209. 🔥 Auditoría con axe-core en los tests de Playwright (`@axe-core/playwright`) en las 6 vistas principales y en el CI.
210. 🔥 Solo hay 3 `aria-live`: anunciar el cambio de canción, añadir a favoritas, descargas y errores en una región `polite` única.
211. Hay un solo `<h1>` y es el título de la canción: cada vista debería tener su propio encabezado de nivel 1 o 2 coherente («Inicio», «Biblioteca»…).
212. Gestión del foco al abrir y cerrar cada `<dialog>`: volver al botón que lo abrió (comprobarlo en los 10).
213. Barra de progreso y volumen con `role="slider"` o `<input type=range>` con `aria-valuetext` («1:23 de 3:45»).
214. Contraste AA en los textos secundarios sobre el fondo de pantalla (gris sobre una imagen cargada).
215. Enlace «Saltar al contenido» y otro «Saltar al reproductor».
216. Las fuentes decorativas no deben usarse en bloques largos (dislexia): opción «Letra legible» en Ajustes.
217. `prefers-reduced-motion`: está en 3 sitios del CSS. Comprobar que la escena, las gotas, el reloj y el visualizador se paran del todo.
218. El índice A–Z necesita etiquetas comprensibles para lectores de pantalla («Ir a la letra M»).
219. Operar la cola con el teclado: mover con Alt+↑/↓ (hoy se reordena solo arrastrando).
220. Que la letra sincronizada no se lea entera en el lector de pantalla a cada cambio (`aria-live="off"` en la lista y anunciar solo con una acción).
221. Usar `lang="en"` en títulos de canciones en inglés detectados (mejora la pronunciación del lector).
222. Probar con VoiceOver en iOS y TalkBack en Android y documentar los resultados en `docs/`.

## 14. Backend de cuentas y seguridad (16)

223. 🔥 Arreglar el Cron (punto 1) y añadir un test con Miniflare.
224. 🔥 Comprobar la revocación de la sesión en `PUT /datos` y en `PATCH /yo` (punto 2).
225. Tests del Worker con `vitest` + `@cloudflare/vitest-pool-workers` (hoy no hay ninguno).
226. Un CI aparte para `cuentas/` con `wrangler deploy --dry-run`.
227. Cabeceras de seguridad en todas las respuestas: `Strict-Transport-Security`, `Cross-Origin-Resource-Policy`.
228. Registro estructurado (JSON) con `ruta`, `estado`, `ms` y un id de petición, sin datos personales, y alertas en Workers Observability cuando suben los 5xx o los `robot`.
229. Freno por cuenta además de por IP en `/entrar` (los ataques distribuidos rotan IPs).
230. `iguales()` sobre hashes de igual longitud: bien. Añadir un retraso aleatorio pequeño en las respuestas `credenciales`.
231. Rotar `FIRMA` sin cerrar todas las sesiones: aceptar dos claves (`FIRMA` y `FIRMA_ANTERIOR`) con un `kid` en el pase.
232. Plan de respaldo de `PIMIENTA` y `FIRMA` (en un gestor de secretos) y prueba de restauración documentada.
233. Copias de D1 con Time Travel documentadas y un ensayo de recuperación.
234. Validar en el servidor el JSON descomprimido (forma y tamaño) para que nadie guarde basura de 2 MB por archivo y año.
235. Límite de años en `escucha-AAAA` (por ejemplo, de 2024 a año actual + 1).
236. `X-Admin` → mejor proteger `/admin/*` con Cloudflare Access que con un secreto en una cabecera.
237. Bajar `SESION_SEG` a 30 días con renovación deslizante (hoy son 60 días fijos tras cada renovación, lo que en la práctica no caduca nunca).
238. Ruta `/salud` con comprobación de D1 y R2 para un monitor externo (UptimeRobot o Cloudflare Health Checks).

## 15. Compartir, SEO y páginas `s/` (12)

239. Las ≈4.000 páginas de `s/` (16 MB en el repositorio): generarlas solo para las playlists y usar una sola página de canción con *Cloudflare Worker* o *Pages Function* que pinte el Open Graph al vuelo. El repositorio queda más ligero y los *diffs* más limpios.
240. Imágenes Open Graph de canción generadas con el título encima (hoy usan solo el icono): más clics en WhatsApp.
241. `review.html` en el sitemap pero la app con `noindex` implícito: decidir la estrategia de SEO (¿se quiere encontrar en Google?) y alinear `robots.txt`, `sitemap.xml` y `canonical`.
242. Datos estructurados `MusicPlaylist` en las páginas de playlist de `s/`.
243. Compartir la canción **en el segundo exacto** (`#t=1:23`).
244. Tarjeta para compartir: un fondo con la portada animada (vídeo corto en MP4 o WebP animado) para Historias.
245. Que las playlists compartidas de más de 150 canciones usen compresión (`CompressionStream` + base64url) en el *hash*, en vez de cortarlas.
246. Código QR en la tarjeta para compartir (para pasarlo de la computadora al teléfono).
247. `share_target`: aceptar también un enlace de Spotify o YouTube y buscar esa canción en la biblioteca.
248. `404.html` usa rutas absolutas `/LiquidBrush/`: si cambia el dominio (por ejemplo, uno propio) se rompe. Usar una constante.
249. Dominio propio (`liquidbullet.app`): da marca, OG más fiable y cookies y orígenes propios para la cuenta.
250. `og:image` de la portada con `og:image:type` y `og:image:secure_url` en todas las páginas de `s/`.

## 16. Datos, catálogo y herramientas (12)

251. 🔥 Esquema JSON (`schemas/track.schema.json`) validado en `check_site.py` para todos los `musica/*.json`.
252. Ids cortos y estables (7 caracteres) en los propios JSON; hoy son rutas largas (`t-db5-1-tame-impala-401-500-488-…`) que inflan todos los almacenamientos.
253. `sync_r2.py`: calcular LUFS, BPM, tonalidad y silencio inicial y final una sola vez por MP3 (con `ffmpeg` y `essentia` o `librosa`) y guardarlo en el JSON.
254. Un `CHANGELOG` de la biblioteca generado (`+232 canciones`), conectado con `novedades.json`.
255. `find_duplicates.py` en CI como aviso (no como error).
256. Pasar `PLAYLISTS` de `build_catalog.py` (artista → playlist) a un `playlists.yaml` editable sin tocar Python.
257. Un `Makefile` o `npm run build:data` que ejecute en orden `sync_r2` → `build_catalog` → `build_image_library` → `bump_version` → `check`.
258. Que `bump_version.py` actualice `sw.js`, `index.html` y `novedades.json` con *hash* del contenido.
259. Tests de Python (`pytest`) para el reparto de iconos, la detección de artista y título y las fusiones de `aliases`.
260. Revisar el reparto de iconos: 44 iconos entre ~3.900 canciones hace que las listas se vean repetitivas. Mejor un icono por artista o por estilo.
261. Listas `pendientes.json` y `excluidas.json`: añadir una nota con el motivo de cada exclusión, para poder revisarla después.
262. `imagenes.json`: comprobar en CI que toda imagen del repositorio se usa y que todo uso existe (detectar huérfanas).

## 17. Calidad: tests, CI y observabilidad (10)

263. 🔥 Tests de regresión visual con `toHaveScreenshot()` en los 4 temas × móvil y escritorio.
264. Tests de reproducción con un MP3 local de 3 s (la red a R2 no siempre está disponible en CI): reproducir, siguiente, cola y reanudar.
265. Test del límite de `localStorage` (llenarlo y comprobar que la app no se rompe).
266. Test offline (`context.setOffline(true)`) de abrir la app, Biblioteca y descargas.
267. Test del flujo de actualización del SW («Hay una versión nueva» → Actualizar → sigue sonando).
268. Registro de errores opcional y anónimo (Sentry con el plan gratuito o un endpoint propio en el Worker), con interruptor en Ajustes y la política de privacidad actualizada.
269. Métricas Web Vitals anónimas (`web-vitals` + `sendBeacon` al Worker) para ver LCP e INP reales.
270. Lighthouse CI con presupuestos (punto 58) y comentario en cada PR.
271. Dependabot o Renovate para `package.json`, `cuentas/package.json` y las Actions.
272. Pre-commit con `eslint`, `node --check` y `check_site.py` (con `lefthook` o `husky`).

## 18. Legal, privacidad y riesgo (8)

273. 🔥 **Riesgo de derechos**: los MP3 comerciales están en buckets **públicos** (`pub-*.r2.dev`) listados en el código y el README. Cualquiera puede descargarlos o enlazarlos y gastar el ancho de banda. Servir el audio con URLs firmadas de corta duración desde el Worker, o al menos restringir por `Referer` con una regla de Cloudflare, y no publicar las URLs en el README.
274. 🔥 **Las portadas de playlists usan arte de un manga comercial** (visible en Inicio y Explora). Para un proyecto público, conviene arte propio o con licencia (la estética surrealista propia ya es fuerte).
275. Página de privacidad propia (`privacidad.html`) enlazada desde la hoja de cuenta, con lo que hoy está en Ajustes → Ayuda.
276. Avisar de forma explícita que LRCLIB y Google Fonts reciben datos (ya se dice en Ajustes) y ofrecer «Letras: no buscar en internet».
277. Términos de uso breves y un correo de contacto para retirada de contenido (DMCA).
278. Edad mínima y consentimiento en el alta (RGPD y COPPA).
279. Registro de qué datos guarda el Worker, durante cuánto tiempo y por qué (90 días de `actividad`: documentarlo).
280. No poner el correo personal (`officiallukamon@gmail.com`) en la interfaz y el README: usar el oficial de Liquid o un formulario.

## 19. Detalles ganadores (diferenciadores) (20)

281. 🔥 **«Derretir» la interfaz con la música**: el reloj derretido ya avanza solo con la música. Llevarlo más lejos haciendo que el goteo de la barra superior y las gotas reaccionen al ritmo del analizador (o al BPM precalculado cuando no hay CORS).
282. 🔥 **Modo Vinilo**: Sonando con un disco que gira al ritmo, se puede arrastrar para hacer *scratch* (cambia `playbackRate`) y suena el crujido al soltar la aguja.
283. **Cápsula del tiempo**: «Hace un año a esta hora escuchabas…» como notificación local o tarjeta en Inicio.
284. **Mixtape para alguien**: una playlist propia con dedicatoria y portada en cinta de casete, compartida por enlace, que se abre con una animación de casete.
285. **Escucha conjunta**: dos personas sincronizadas (WebRTC o Durable Object) con el mismo reloj de reproducción y reacciones.
286. **Radio de la colección**: todos los que abren la app a la misma hora oyen lo mismo (semilla por hora), con un contador de oyentes. Cuesta poco y crea comunidad.
287. **Tema según la portada**: generar los colores del tema completo a partir de la portada que suena (Material You).
288. **Letras con tipografía cinética** en el tema Surrealista: las palabras se derriten al terminar la línea.
289. **Modo Despertador**: alarma con *fade-in* desde una playlist (con la pestaña abierta o la app instalada).
290. **Tu canción de hoy**: una sola recomendación diaria, con explicación, en un widget o en la tarjeta destacada de Inicio.
291. **Huella sonora** compartible: un póster generativo único (SVG) con tu ADN musical del mes, en la estética surrealista.
292. **Atajos de gesto** en Sonando: girar dos dedos para el volumen y tocar con tres para la favorita.
293. **Modo lluvia o ambiente**: mezclar sonido de lluvia, vinilo o cafetería por encima de la música (Web Audio).
294. **Huevos de pascua surrealistas**: tocar el ojo 7 veces → tema secreto; mantener el reloj → la música se ralentiza («derretida», 0,8× con eco).
295. **Mezcla nocturna automática**: desde las 23 h, transiciones más largas, menos energía y el temporizador sugerido.
296. **Narrador DJ** opcional: una frase sintetizada (`speechSynthesis`) entre bloques de la radio («Sigue L'Impératrice, porque te gustó Parcels»).
297. **Notas por canción**: escribir un recuerdo asociado a una canción, que aparece al volver a escucharla.
298. **Picture-in-Picture** del mini-reproductor (Document PiP API) en escritorio: controles flotando sobre otras ventanas.
299. **Control desde el reloj y el coche**: probar y pulir Media Session para Android Auto y Wear OS (portadas a 512 px, títulos cortos).
300. **«Liquid en vivo»**: una página pública (`/ahora`) opcional que muestre lo que suena ahora con tu avatar, para compartirla en la bio.

---

## Orden recomendado (las 15 primeras)

1. Arreglar el Cron de cuentas (#1) y la revocación de sesiones (#2): seguridad y privacidad.
2. Pasar la biblioteca, la cola y la caché de letras de `localStorage` a IndexedDB (#3, #4, #60, #61).
3. Simplificar la primera visita: primero la música, luego la cuenta y un tutorial corto (#5, #193, #194).
4. Arreglos visuales del móvil: barra superior, aviso, transparencias y navegación duplicada (#6–#10, #179, #180).
5. Pedir la letra solo al reproducir (#11).
6. Bajar el peso de la primera carga con AVIF/WebP y un catálogo compacto (#40–#42).
7. Legibilidad y contraste de la tipografía (#161, #162).
8. Normalización de volumen y reproducción sin cortes (#78, #79).
9. Explicar las recomendaciones y añadir «Más / menos de esto» (#96, #97).
10. Revisar los riesgos de derechos (#273, #274).
11. axe-core y regresión visual en CI (#209, #263).
12. Tests del Worker (#225).
13. Versiones con *hash* automático (#18, #258).
14. Dividir `app.js` en módulos con carga diferida (#22, #23).
15. Un diferenciador visible: modo Vinilo o interfaz que se derrite con la música (#281, #282).
