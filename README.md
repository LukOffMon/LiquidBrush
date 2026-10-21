# LiquidBrush

Reproductor web personal de estética surrealista y cromada (temas "Surrealista" (por defecto) y "Minimalista"), 100 % estático (HTML + CSS + JS) y listo para GitHub Pages.

El tema "Surrealista" incluye una escena animada: esfera de cromo en el horizonte, suelo de ajedrez, nubes, gotas de metal líquido, ojos que siguen el cursor y un reloj derretido cuyas agujas solo avanzan mientras suena la música.

## Publicar en GitHub Pages

1. **Settings → Pages** → *Source: Deploy from a branch* → rama `main`, carpeta `/ (root)` → **Save**.
2. En unos minutos estará en `https://<tu-usuario>.github.io/<nombre-del-repo>/`.

## Añadir tus canciones (Supabase)

La app lee la tabla `tracks` de **dos proyectos de Supabase a la vez** (lista `CONFIG.sources` en `app.js`) y junta sus playlists:

| Proyecto | Bucket | Contenido |
| --- | --- | --- |
| `principal` · LoopMusiK (`kvylexeicpvjrvhpizsz`) | `loopmusik-audio` | DiscoBse, OyeComoVa |
| `extra` · cuenta officiallukamon (`pikoruycbgwjrxqxaajl`) | `LiquidBrush2DB` | playlists nuevas |

Además, las canciones guardadas en **Cloudflare R2** (bucket `liquidbrush3db3`, playlist YK 3) se leen de [`cloudflare-tracks.json`](cloudflare-tracks.json), un archivo de este repositorio. Así no ocupan nada en Supabase: cada fila lleva `id`, `title`, `artist`, `album` (la playlist), `duration` y `src` con la URL pública completa del MP3. Para añadir una carpeta nueva, sube los MP3 y un `nombres.txt` con la lista de archivos a esa carpeta del bucket.

El proyecto `extra` se prepara pegando [`supabase/proyecto-extra.sql`](supabase/proyecto-extra.sql) en su SQL Editor. Si un proyecto no responde, se siguen mostrando las canciones del otro. Cada proyecto gratis tiene 1 GB.

Para añadir una canción no hace falta tocar GitHub:

1. **Storage → bucket del proyecto (`loopmusik-audio` o `LiquidBrush2DB`) → Upload**: sube los MP3 sueltos (Supabase **no descomprime** archivos .zip) y las carátulas si quieres. Los nombres de archivo no pueden llevar tildes, ñ ni símbolos como `[ ] # % ? ¿ ¡`.
2. **Table Editor → `tracks` → Insert row**: rellena `title`, `artist`, `duration`, `lyrics` y:
   - `album`: el nombre de la **playlist**. Cada valor distinto aparece como una playlist separada, con su propio encabezado y su filtro.
   - `src`: el nombre del archivo en el bucket (p. ej. `mi-cancion.mp3` o `album/mi-cancion.mp3`) o una URL completa.
   - `cover`: igual que `src` (opcional).
   - `position`: orden en la lista (DiscoBse usa 1–80 y OyeComoVa 101–149, para que cada playlist quede en su bloque).
   - `is_published`: desmárcalo para ocultar la canción sin borrarla.

La tabla es de solo lectura para la web (RLS); solo se edita desde el panel de Supabase.

### Letras

Si `lyrics` está vacío, la app busca la letra automáticamente en [LRCLIB](https://lrclib.net) (gratis, sin clave; muchas vienen sincronizadas) y la guarda en el navegador. Funciona mejor cuando la canción tiene `artist` y `duration` correctos. Si escribes tu propia letra en `lyrics`, se usa esa.

## Biblioteca, playlists y favoritas

- **Biblioteca**: todas las canciones de todas las fuentes, con orden configurable (playlists, título, artista, duración).
- **Playlists**: las de LiquidBrush (una por cada `album` de la base de datos y las guardadas para todos), **Mis playlists** y las automáticas *Escuchadas hace poco* y *Tus más escuchadas*.
- **Mis playlists** se crean en la app (nombre, icono y color) con el botón ＋ de cada canción. Se guardan **solo en ese navegador** (localStorage): si se borra la caché o los datos del sitio, se pierden. Se puede descargar o importar una copia de seguridad en JSON.
- **Guardar para todos**: una playlist propia se publica en la tabla `shared_playlists` del proyecto principal pidiendo la **KeyForSet**. La clave no está en el código: Supabase la guarda como hash y la comprueba en las funciones `save_shared_playlist` / `hide_shared_playlist` (con límite de 10 fallos cada 10 minutos). Se configura con [`supabase/playlists-compartidas.sql`](supabase/playlists-compartidas.sql).

## Catálogo de playlists de base

[`catalog.json`](catalog.json) define las playlists de base (por género y mezclas de varios géneros), su descripción, su portada (imágenes de [`covers/`](covers/) o un diseño generado) y el género de cada canción. Se genera con:

```bash
python3 tools/build_catalog.py
```

El script lee las mismas fuentes que la app, clasifica cada canción por artista (o por su playlist de origen), quita duplicados y arma las listas. Vuelve a ejecutarlo cada vez que añadas música.

## Comentarios, transiciones DJ y estadísticas

- **Comentarios con marca de tiempo**: cada canción admite 5 comentarios por semana. Se guardan por canción (título + artista), no por copia, así que se ven igual aunque la canción esté en varias fuentes, y se actualizan solos cada 25 s, guardados en la tabla `track_comments` del proyecto principal. Solo se ven los de la semana actual (se reinician cada lunes, UTC) y solo se pueden añadir con la función `add_track_comment`. Se marcan sobre la barra de progreso y aparecen en una burbuja al llegar a su segundo.
- **Transiciones DJ** (interruptor, tecla D): mezcla la canción que termina con la siguiente usando dos reproductores; la duración es configurable (3–12 s) y se acorta en canciones cortas.
- **Stats**: minutos por día, horas favoritas, géneros, artistas, tendencias frente al mes anterior y canciones del mes. Se calculan con un registro guardado solo en el navegador.

## Modo offline

- La app se puede **instalar** (en el móvil: *Añadir a pantalla de inicio*) y abre sin conexión gracias a `sw.js`, que guarda la app y la última lista de canciones.
- Cada playlist tiene un botón **⬇ Descargar**: guarda sus MP3 en el dispositivo para escucharlos sin internet. Púlsalo de nuevo para detener la descarga; cuando la playlist está completa, sirve para quitar las descargas.
- Sin conexión, las canciones no descargadas se ven atenuadas y se saltan al pasar a la siguiente.
- Si el servidor del audio no envía CORS (el bucket de R2 sin política CORS), en Android y escritorio se guarda una copia "opaca" que igual suena sin conexión. Safari (iPhone/iPad) no reproduce copias opacas: para descargar ahí las canciones de Cloudflare hay que añadir la política CORS del bucket.
- La app abre al instante con la biblioteca de la última visita (guardada en el navegador) y la actualiza en segundo plano; las listas largas se pintan por partes.
- Si cambias `sw.js`, sube el número de `VERSION` para que los navegadores renueven la app guardada.

## Respaldo: tracks.json

Si Supabase no responde, la app usa `tracks.json`. Cada canción:

```json
{
  "id": 4,
  "title": "Mi canción",
  "artist": "Yo",
  "album": "Mi álbum",
  "duration": "3:45",
  "src": "https://tu-bucket.ejemplo.com/mi-cancion.mp3",
  "cover": "https://tu-bucket.ejemplo.com/mi-caratula.jpg",
  "lyrics": "Línea 1\nLínea 2"
}
```

- `id` debe ser único (los favoritos se guardan por `id`).
- `src` y `cover` deben ser URLs **públicas** (Backblaze B2, Supabase Storage, Cloudinary…).
- `lyrics` es opcional. Texto normal = letra estática. Formato LRC (`[mm:ss.xx] texto` en cada línea) = letra sincronizada.

### CORS (opcional, recomendado)

- **Carátulas**: si el servidor envía `Access-Control-Allow-Origin: *`, el fondo toma el color de la carátula. Sin CORS se usa el color del tema.
- **Audio**: el visualizador funciona siempre (animación simulada). Si tu bucket envía CORS en los MP3 puedes poner `useWebAudioAnalyser: true` en `app.js` para que reaccione a la música real.

## Probar en local

`fetch` no funciona abriendo `index.html` con doble clic. Usa un servidor:

```bash
npx serve .
# o
python3 -m http.server 8000
```

## Atajos de teclado

| Tecla | Acción |
| --- | --- |
| Espacio | Play / Pausa |
| ← / → | −5 s / +5 s |
| N / P | Siguiente / Anterior |
| S | Aleatorio |
| R | Repetir (no / lista / una) |
| M | Silenciar |
| L | Mostrar / ocultar letra |
| / | Buscar |
