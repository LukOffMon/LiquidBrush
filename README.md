# LiquidBrush

Reproductor web personal de estética surrealista y cromada (temas "Surrealista" (por defecto) y "Minimalista"), 100 % estático (HTML + CSS + JS) y listo para GitHub Pages.

El tema "Surrealista" incluye una escena animada: esfera de cromo en el horizonte, suelo de ajedrez, nubes, gotas de metal líquido, ojos que siguen el cursor y un reloj derretido cuyas agujas solo avanzan mientras suena la música.

## Publicar en GitHub Pages

1. **Settings → Pages** → *Source: Deploy from a branch* → rama `main`, carpeta `/ (root)` → **Save**.
2. En unos minutos estará en `https://<tu-usuario>.github.io/<nombre-del-repo>/`.

## Añadir tus canciones (Cloudflare R2)

La música vive en buckets de Cloudflare R2. Cada bucket tiene su lista de canciones en la carpeta [`musica/`](musica/) de este repositorio. No hay base de datos: la app lee esas listas y reproduce los MP3 directamente desde cada bucket.

| Lista | Bucket | URL pública |
| --- | --- | --- |
| [`musica/pepper.json`](musica/pepper.json) | `liquidpepper4db` | `https://pub-cb798ce2901a49a6a6363d57fbd5ee19.r2.dev` |
| [`musica/b05e.json`](musica/b05e.json) | — | `https://pub-b05e243e7441423f9c4a25dfe8411da3.r2.dev` |
| [`musica/brush3.json`](musica/brush3.json) | `liquidbrush3db3` | `https://pub-342aee3eb054410cb02224940f684884.r2.dev` |

Para sumar otro bucket: añade una entrada en `CONFIG.sources` (en `app.js`) con `name`, `list` y `base`, crea `musica/<name>.json` y añádelo a la lista `SHELL` de `sw.js`.

Cada fila del archivo:

```json
{
  "id": "mi-playlist-001",
  "title": "Mi canción",
  "artist": "Yo",
  "album": "Mi playlist",
  "duration": "3:45",
  "src": "Mi playlist/001 - mi-cancion.mp3"
}
```

- `album` es la **playlist**: cada valor distinto aparece como una playlist separada.
- `src` es la ruta del MP3 dentro del bucket (`Mi playlist/001 - mi-cancion.mp3`): la app le pone delante la URL pública (`base` en `CONFIG.sources`, en `app.js`). También admite una URL completa.
- `cover` (opcional) y `lyrics` (opcional) funcionan igual que `src` y que en `tracks.json`.
- `id` debe ser único y no cambiar nunca: favoritas, playlists propias e historial se guardan por `id`.

Para sumar música: sube los MP3 al bucket (una carpeta por playlist), añade sus filas a la lista de ese bucket en `musica/` y vuelve a generar el catálogo (ver más abajo).

### Letras

Si `lyrics` está vacío, la app busca la letra automáticamente en [LRCLIB](https://lrclib.net) (gratis, sin clave; muchas vienen sincronizadas) y la guarda en el navegador. Funciona mejor cuando la canción tiene `artist` y `duration` correctos. Si escribes tu propia letra en `lyrics`, se usa esa.

## Biblioteca, playlists y favoritas

- **Biblioteca**: todas las canciones, con orden configurable (playlists, título, artista, duración).
- **Playlists**: las de LiquidBrush (las del catálogo o, sin catálogo, una por cada `album`), **Mis playlists** y las automáticas *Escuchadas hace poco* y *Tus más escuchadas*.
- **Mis playlists** se crean en la app (nombre, icono y color) con el botón ＋ de cada canción. Se guardan **solo en ese navegador** (localStorage): si se borra la caché o los datos del sitio, se pierden. Se puede descargar o importar una copia de seguridad en JSON.

## Catálogo de playlists de base

[`catalog.json`](catalog.json) define las playlists de base (por género y mezclas de varios géneros), su descripción, su portada (imágenes de [`covers/`](covers/) o un diseño generado) y el género de cada canción. Se genera con:

```bash
python3 tools/build_catalog.py
```

El script lee todas las listas de `musica/`, clasifica cada canción por artista (o por su playlist de origen), quita duplicados y arma las listas. Vuelve a ejecutarlo cada vez que añadas música.

## Transiciones DJ y estadísticas

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

Si no carga ninguna lista de `musica/`, la app usa `tracks.json`. Cada canción:

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
- `src` y `cover` deben ser URLs **públicas** (Cloudflare R2, Backblaze B2, Cloudinary…).
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
