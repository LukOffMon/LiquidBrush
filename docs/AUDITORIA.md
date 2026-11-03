# Auditoría de Liquid Bullet: referencia Spotify = 100

Fecha: 2026-11-03 · Versión auditada: `app.js?v=22` / `sw.js v33` · Método: lectura del código (`app.js` 6.1k líneas, `styles.css` 5.3k, `sw.js`) y pruebas automatizadas con Chromium headless (390×844 y 1440×900): arranque en frío y en caliente, clics en ráfaga, botones Atrás/Adelante, almacenamiento lleno, datos corruptos en `localStorage`, modo sin conexión, entradas de texto enormes.

Cada hallazgo marcado **[VERIFICADO]** se reprodujo en el navegador. **[CORREGIDO]** significa que el arreglo está en este commit y se volvió a probar.

---

## 1. Matriz de calificación

| Módulo / flujo | Nota | Motivo principal |
| --- | --- | --- |
| Reproducción (play, cola, DJ, reanudar) | **78** | Muy completa (crossfade, reanudar en el segundo exacto, salto de canciones rotas, sesión de medios). Pierde puntos por el reproductor que ocupa ~24 % de la pantalla en móvil y por no tener *gapless* real. |
| Navegación e historial | **35 → 80** | Antes, «Atrás» sacaba de la app desde cualquier vista y no cerraba ventanas (en Android eso cierra la PWA). Además hay dos menús (pestañas arriba y barra abajo) que hacen lo mismo. |
| Búsqueda | **62 → 72** | Rápida (con *debounce* y paneles de recientes), pero el texto seguía escrito al cambiar a Inicio o Lab sin filtrar nada, y una búsqueda larga ensanchaba la página a 38.000 px. |
| Biblioteca, playlists y artistas | **70** | Buen modelo (playlists propias, fijar, compartir con tarjeta). La página de artista lanzaba un `TypeError` cada vez que se abría, y Enter en «Nueva playlist» descartaba la playlist. |
| Letras | **72 → 80** | Sincronizadas y con caché. Al saltar canciones seguidas se hacían 2–3 peticiones por salto y LRCLIB devolvía 429. La caché crecía sin límite. |
| Persistencia y resiliencia | **45 → 75** | Todo vive en `localStorage` (≈1,7 M caracteres ya al arrancar). Al llenarse, favoritas y playlists dejaban de guardarse sin aviso. La cola de reproducción (~350 KB) se reescribía de forma síncrona en cada cambio de canción. |
| Offline / PWA | **74** | Buen *service worker* (rangos de audio, red primero para la app). Sin conexión la app abre y muestra la última canción. Falta indicar qué se puede escuchar y sincronizar descargas en segundo plano. |
| Rendimiento percibido | **60** | LCP 0,94 s en frío sin limitar red (en 4G real será de 2,5 a 3,5 s). Hay 4 tareas largas (60–111 ms) al arrancar. Cada visita descarga ~2 MB (`catalog.json` 736 KB + listas 712 KB con `no-cache`) y compara 1,3 MB de JSON en el hilo principal. Se cargan 6 familias tipográficas de Google Fonts. CLS 0,064 (aceptable). |
| Microinteracciones y diseño | **66** | Identidad visual fuerte y propia (Liquid Glass, escenas surrealistas, rebote al tocar). En contra: la tipografía de rotulador en textos pequeños se lee mal, hay botones táctiles de menos de 24 px (`djToggle`, barra de progreso) y las pestañas se cortan («Favorit…»). |
| Accesibilidad | **58** | Hay `aria-label`, `sr-only` y atajos de teclado, pero el contraste sobre los fondos animados es variable, los objetivos táctiles son pequeños y la letra decorativa se usa en el cuerpo de texto. |
| Arquitectura del código | **40** | Un único IIFE de 6.100 líneas con estado global mutable, sin módulos, tipos, *linter* ni pruebas, y 2.981 páginas HTML estáticas (12 MB) en el repositorio. Funciona, pero cada cambio es arriesgado. |
| Crecimiento y retención (PLG) | **38** | Tiene ganchos interesantes (Lab, mixes del día, estadísticas, radio). Pero no hay cuentas ni sincronización: borrar los datos del navegador borra al usuario entero. |
| **Global ponderado** | **≈58 → 66** | |

---

## 2. Lista negra de bugs (causa raíz)

| # | Severidad | Bug | Causa raíz | Estado |
| --- | --- | --- | --- | --- |
| B1 | Crítica | «Atrás» (navegador o gesto de Android) sale de la app desde cualquier vista y no cierra ventanas | Ninguna vista generaba entradas en el historial (`pushState`/`popstate` no se usaban) | **[VERIFICADO][CORREGIDO]** |
| B2 | Crítica | Con `localStorage` lleno, favoritas, playlists y ajustes dejan de guardarse sin aviso | `storage.set` se tragaba `QuotaExceededError`, y las letras se guardaban una por canción sin límite | **[VERIFICADO][CORREGIDO]**: se liberan letras (LRU de 300) y la copia de la biblioteca, se reintenta y se avisa si aun así no cabe |
| B3 | Alta | Abrir cualquier artista lanza `TypeError: Cannot read properties of null (reading 'dataset')` | `updateDownloadUI` recorría todas las `.pl-hero`, y la cabecera de artista no tiene `data-key` ni `.playlist-meta` | **[VERIFICADO][CORREGIDO]** |
| B4 | Alta | Enter en el nombre de «Nueva playlist» descarta la playlist | El envío implícito del formulario usa el primer botón *submit*, que era «Cancelar» | **[VERIFICADO][CORREGIDO]** |
| B5 | Alta | Saltar canciones en ráfaga provoca respuestas 429 de LRCLIB | Cada `loadTrack` lanzaba enseguida 1–2 peticiones de letra, sin *debounce* ni tiempo límite | **[VERIFICADO][CORREGIDO]**: 25 saltos ahora generan 1 petición; tiempo límite de 10 s |
| B6 | Media | Una búsqueda de 5.000 caracteres ensancha la página a 38.025 px (scroll horizontal) | `#listInfo` muestra «resultados para «…»» sin `overflow-wrap`, y el campo no tenía `maxlength` | **[VERIFICADO][CORREGIDO]** |
| B7 | Media | El texto de búsqueda sigue escrito en Inicio y Lab sin filtrar nada, y Playlists muestra «Resultados» sin explicar por qué | Cambiar de sección no limpiaba `state.query` | **[VERIFICADO][CORREGIDO]** |
| B8 | Media | Se escriben de forma síncrona ~350 KB en cada cambio de canción | `resume.saveQueue()` serializaba la cola entera (cola y cola base) en cada `loadTrack` | **[CORREGIDO]**: se escribe cuando el navegador está libre (`requestIdleCallback`) y siempre en `pagehide` y al ocultar la app |
| B9 | Baja | En los chips de Lab el número va pegado al nombre («Cuarto Pastel202») | `.lab-chip` usaba `gap`, pero su `display` era `block` | **[VERIFICADO][CORREGIDO]** |
| B10 | Baja | Al arrancar se crea una entrada de vista falsa | En `setView`, `state.lastArtist` vale `undefined` la primera vez y `!== null` lo da por cambiado | Neutralizado en `navHistory.push` (compara con la entrada actual) |
| B11 | Media | ~2 MB de JSON en cada visita y un `JSON.stringify` de 1,3 MB solo para comparar | `fetch(..., {cache:'no-cache'})` en todas las listas, sin ETag ni versión | Pendiente (ver Fase 3) |
| B12 | Media | En móvil, el reproductor fijo ocupa ~200 de 844 px | Mini reproductor y controles completos se apilan en la parte de abajo | Pendiente (rediseño) |

---

## 3. Brechas frente a Spotify (dónde se rompe la ilusión)

1. **Nada se sincroniza.** En Spotify tu biblioteca te sigue a cualquier dispositivo. Aquí cambiar de móvil o borrar los datos del navegador es perder todo. Exportar a JSON no basta.
2. **Dos menús para lo mismo.** Pestañas arriba y barra abajo apuntan a las mismas vistas. Spotify usa una sola barra inferior con 3–4 destinos.
3. **El reproductor se come la pantalla.** Spotify usa un mini reproductor de 56–64 px que se expande a pantalla completa con un gesto. Aquí son ~200 px fijos.
4. **No hay rutas.** No hay URL por vista (`/playlist/x`, `/artist/y`), así que recargar la página o enviar un enlace no lleva a la misma pantalla. El historial que se añadió en este commit mantiene la URL a propósito para no romper los enlaces `?t=` y `?p=`.
5. **No hay *skeletons*.** La primera visita muestra «Cargando canciones…» como texto; Spotify pinta la estructura al instante.
6. **Tipografía.** La letra de rotulador en metadatos y textos pequeños baja la legibilidad. Spotify reserva la letra expresiva para titulares.

> **Riesgo que bloquea cualquier inversión:** los MP3 son música comercial con derechos (Radiohead, Michael Jackson, Gorillaz…) servida desde buckets públicos de R2. Para uso personal es una zona gris; como producto es inviable sin licencias. Antes de pensar en financiación, el modelo tiene que pasar por una de estas vías: (a) un reproductor para la música propia del usuario (*bring your own library*, archivos locales o su propio almacenamiento), (b) catálogo con licencia o *royalty-free*, o (c) una capa encima de Spotify o Apple Music usando sus SDK oficiales.

---

## 4. Plan de refactorización

### 4.1 Arreglos inmediatos (incluidos en este commit)
B1–B10 de la tabla anterior. Versiones de caché subidas (`app.js?v=23`, `styles.css?v=20`, `sw.js v34`) para que los navegadores reciban el código nuevo.

### 4.2 Siguientes 2 semanas: experiencia de primer nivel
1. **Datos fuera del hilo principal y sin redescarga.** Generar `catalog.json` y las listas con un hash de contenido (`catalog.<hash>.json`) más un `manifest.json` pequeño. El cliente pide solo el manifiesto (≈1 KB) y descarga las listas cuando cambia el hash. Guardar la biblioteca en IndexedDB (no en `localStorage`) y dejar de comparar con `stringify`.
2. **Una sola navegación.** Quitar las pestañas de arriba en móvil y pasar Favoritas y Artistas a la Biblioteca como filtros o chips, como hace Spotify.
3. **Reproductor de dos estados.** Mini reproductor de 64 px que se expande a pantalla completa (deslizar hacia arriba o tocar), con transición compartida de la carátula (`view-transition-name: cover`).
4. **Rutas reales** con `history.pushState('/LiquidBrush/?v=playlist&id=…')` (compatible con GitHub Pages) para que recargar la página conserve la pantalla.
5. **Skeletons** en Inicio y Biblioteca mientras llegan los datos (bloques con `background: linear-gradient(...)` y `animation: shimmer`).
6. **Tipografía:** Inter para el cuerpo y los metadatos; la letra de rotulador solo en H1/H2. Objetivos táctiles de al menos 44×44 px.
7. **Calidad:** dividir `app.js` en módulos ES (`player/`, `library/`, `lyrics/`, `storage/`, `ui/`) con Vite. Añadir ESLint, pruebas de Playwright con los mismos escenarios de esta auditoría (ráfagas, Atrás, cuota llena, sin conexión) en CI, y Sentry para errores como B3, que nadie veía.

### 4.3 Funciones clave y producto defendible
| Función | Por qué retiene |
| --- | --- |
| **Cuenta y sincronización** (Supabase: favoritas, playlists, historial, posición) | Elimina el mayor motivo de abandono (perder los datos) y es la base de todo lo demás |
| **Wrapped / Liquid Recap mensual** compartible (ya tienes `renderStats` y `drawShareCard`) | Crecimiento viral sin costo; Spotify lo convierte en un evento anual |
| **Lab como generador social** («Tú × Ana»: combina las bibliotecas de dos personas) | Efecto red; cada mezcla es una invitación |
| **Escuchar en grupo** (WebRTC o Supabase Realtime: misma cola y mismo segundo) | Hábito con amigos, difícil de copiar con un producto sin backend |
| **Temas y fondos generativos como identidad** (tu ventaja estética real) | Diferenciación: Spotify no deja personalizar; aquí la piel de la app es parte del producto |
| **Racha diaria y «Descubre» semanal con notificación push** (la PWA ya tiene SW) | Motivo para volver cada semana |

---

## 5. Cómo se verificó

Scripts de Playwright (Chromium headless) que, sobre `python3 -m http.server`:
- miden tareas largas, LCP y CLS en arranque en frío y en caliente;
- pulsan «Siguiente» 25 veces en ráfaga y cuentan las peticiones a LRCLIB y las respuestas 429 (antes: varios 429; ahora: 1 petición y 0 errores);
- navegan Inicio → Biblioteca → Playlists → playlist y comprueban Atrás/Adelante, también con la cola y los ajustes abiertos;
- llenan `localStorage` al 100 % y añaden una favorita (antes no se guardaba; ahora se guarda y se liberan letras antiguas);
- escriben 5.000 caracteres en el buscador y miden `scrollWidth`;
- abren un artista y comprueban que no aparece `pageerror`;
- crean una playlist con Enter y la cancelan con «Cancelar»;
- abren un enlace compartido `s/t-….html` para confirmar que `?t=` sigue funcionando.
