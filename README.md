# Liquid Bullet

> Antes se llamaba LiquidBrush. El repositorio, los buckets y las claves de guardado del navegador (`liquidbrush:*`) mantienen el nombre anterior para no perder favoritas, playlists ni descargas.

Reproductor web personal de estética surrealista y cromada (temas "Surrealista" (por defecto), "Minimalista", "Yem" (noche, naranja y plata con destellos verdes) y "Ébano" (casi negro, marfil y oro, con letra Times New Roman), todos con acabado Liquid Glass), 100 % estático (HTML + CSS + JS) y listo para GitHub Pages.

El tema "Surrealista" incluye una escena animada: esfera de cromo en el horizonte, suelo de ajedrez, nubes, gotas de metal líquido, ojos que siguen el cursor y un reloj derretido cuyas agujas solo avanzan mientras suena la música.

## Publicar en GitHub Pages

1. **Settings → Pages** → *Source: Deploy from a branch* → rama `main`, carpeta `/ (root)` → **Save**.
2. En unos minutos estará en `https://<tu-usuario>.github.io/<nombre-del-repo>/`.

## Añadir tus canciones (Cloudflare R2)

La música vive en **4 buckets** de Cloudflare R2, cada uno en una cuenta distinta (10 GB gratis por cuenta). Cada bucket tiene su lista de canciones en la carpeta [`musica/`](musica/) de este repositorio. No hay base de datos: la app lee esas listas y reproduce los MP3 directamente desde cada bucket.

| Lista | Bucket | URL pública |
| --- | --- | --- |
| [`musica/pepper.json`](musica/pepper.json) | `liquidpepper4db` | `https://pub-cb798ce2901a49a6a6363d57fbd5ee19.r2.dev` |
| [`musica/salt.json`](musica/salt.json) | `liquidsaltdb5` | `https://pub-b05e243e7441423f9c4a25dfe8411da3.r2.dev` |
| [`musica/brush3.json`](musica/brush3.json) | `liquidbrush3db3` | `https://pub-342aee3eb054410cb02224940f684884.r2.dev` |
| [`musica/db4.json`](musica/db4.json) | 4.º bucket | `https://pub-0854e4225565462db16fa787cf2ab81c.r2.dev` |

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

- `album` (opcional) se deja vacío: todas las canciones van a la Biblioteca y las playlists las genera `tools/build_catalog.py`.
- `src` es la ruta del MP3 dentro del bucket (`Mi playlist/001 - mi-cancion.mp3`): la app le pone delante la URL pública (`base` en `CONFIG.sources`, en `app.js`). También admite una URL completa.
- `cover` (opcional) y `lyrics` (opcional) funcionan igual que `src` y que en `tracks.json`.
- `id` debe ser único y no cambiar nunca: favoritas, playlists propias e historial se guardan por `id`.

Para sumar música: sube los MP3 al bucket (una carpeta por playlist) y ejecuta:

```bash
python3 tools/sync_r2.py
python3 tools/build_catalog.py
```

`sync_r2.py` lista cada bucket, crea una fila por MP3 (todas a la Biblioteca; título y artista sacados de `001 - Artista - Título.mp3`; duración leída del propio archivo) y respeta lo que hayas editado a mano en las filas que ya existían. Cada bucket está en una cuenta distinta de Cloudflare y necesita su clave de API de R2 en variables de entorno: `R2_PEPPER_*`, `R2_SALT_*` y `R2_BRUSH3_*` (`ACCESS_KEY_ID` y `SECRET_ACCESS_KEY` de cada una).

### Letras

Si `lyrics` está vacío, la app busca la letra automáticamente en [LRCLIB](https://lrclib.net) (gratis, sin clave; muchas vienen sincronizadas) y la guarda en el navegador. Funciona mejor cuando la canción tiene `artist` y `duration` correctos. Si escribes tu propia letra en `lyrics`, se usa esa.

## Continuar donde lo dejaste

Al abrir la app vuelve a poner la última canción que sonaba, en el segundo exacto y con su cola («Continúa donde lo dejaste»); basta pulsar ▶. Se guarda cada pocos segundos, al pausar y al cerrar o esconder la app. Como todo lo personal de la app, vive en el navegador de cada persona (localStorage): cada navegador y cada dispositivo recuerda lo suyo.

## Cola «A continuación» y temporizador

- **A continuación** (botón de lista en el reproductor o tecla Q): muestra lo que va a sonar, permite saltar a cualquier canción o quitarla. Desde el botón ＋ de cualquier canción: **Reproducir a continuación** o **Al final de la cola**, sin cortar lo que suena.
- **Temporizador** (luna en el reproductor o tecla T): pausa la música a los 15, 30, 45, 60 o 90 minutos, o al terminar la canción actual. El volumen baja poco a poco en los últimos segundos.

## Biblioteca, playlists y favoritas

- **Biblioteca**: todas las canciones, con orden configurable (playlists, título, artista, duración).
- **Playlists**: las de Liquid Bullet (las del catálogo o, sin catálogo, una por cada `album`), **Mis playlists** y las automáticas *Escuchadas hace poco* y *Tus más escuchadas*.
- **Mis playlists** se crean en la app (nombre, icono y color) con el botón ＋ de cada canción. Se guardan **solo en ese navegador** (localStorage): si se borra la caché o los datos del sitio, se pierden. Se puede descargar o importar una copia de seguridad en JSON.

## Inicio, Artistas y radio

Liquid funciona como Spotify, pero con tu colección de MP3: todo se calcula en el navegador con tus canciones, lo que escuchas y tus favoritas.

- **Inicio** (la app abre aquí): saludo según la hora, accesos rápidos (fijadas, tus playlists y tus estilos más escuchados), **Tus mixes del día** (uno por estilo favorito, mitad conocidas y mitad por descubrir; cambian cada día), **Hecho para ti** (Descubre semanal con canciones que aún no has oído, De nuevo y En repetición), artistas que sigues, **Radios** y **Explora tus estilos**.
- **Artistas**: todos los artistas de la colección, primero los que sigues. Cada uno tiene su página con sus canciones, en qué playlists aparece, artistas parecidos, **Seguir** y **Radio**. Tocar el artista en Sonando abre su página; debajo de la letra está **Acerca del artista**.
- **Radio**: empieza por un artista (o por una canción, desde el ＋) y se renueva sola con artistas parecidos, sin fin.
- **Buscar**: al tocar el buscador salen tus **búsquedas recientes** (con Borrar) y los estilos para explorar; los resultados muestran también artistas.
- **A continuación**: botón **Editar** para reordenar arrastrando del asa, y abajo Aleatorio, Repetir y Temporizador.
- **Portadas**: todas son fotos. Cada canción usa la foto de su playlist; Escuchadas hace poco y Tus más escuchadas tienen la suya (`covers/cover-27` y `cover-28`).

## Compartir

- Botón **Compartir** (flecha hacia arriba) en el panel Sonando, en cada playlist y en el ＋ de cada canción. Abre una **tarjeta con la portada** (tres fondos a elegir) para compartir como imagen en Historias o Estados, o guardarla, y los botones **Compartir enlace** y **Copiar enlace**.
- Cada canción y cada playlist de Liquid Bullet tiene su página en [`s/`](s/) con la portada en las etiquetas Open Graph, así **el enlace siempre sale con miniatura**. Las canciones usan la portada de su playlist. Quien lo abre entra directo a la app con esa canción lista o esa playlist abierta.
- Las playlists propias viajan dentro del enlace (`s/mix.html#…`, hasta 150 canciones) y se guardan solas en «Mis playlists» de quien lo abre; su miniatura es el logo.
- `tools/build_catalog.py` regenera las páginas de `s/` cada vez que se ejecuta. Si el sitio cambia de dirección, actualiza `SITE_URL` en ese script.

## Lab

Pestaña **Lab** (en el móvil, botón de la barra inferior):

- **Mezcla estilos**: eliges varias playlists-estilo y Lab las combina por turnos, sin repetir canción ni (cuando se puede) artista seguido.
- **Suma artistas**: buscador para añadir artistas a la mezcla.
- **Tamaño** (20, 40, 60 o 100) y **solo lo que no he escuchado**.
- La mezcla se reproduce o se **guarda como playlist propia**.
- **Si te gusta…**: eliges un artista y recomienda otros por colaboraciones y estilo compartido.

## Contacto

Abajo del panel «Sonando» y en **Ajustes → Ayuda** hay un atajo a officiallukamon@gmail.com para ideas, mensajes o reportar errores.

## Tutorial de bienvenida

La primera vez que alguien abre la app sale un recorrido de 7 pasos que resalta cada parte. Queda marcado como visto en el navegador (`liquidbrush:tour`) y no vuelve a salir; se puede repetir desde **Ajustes → Ayuda**.

## Catálogo de playlists de base

[`catalog.json`](catalog.json) define las 15 playlists de base (Cuarto Pastel, Seda Nocturna, Ácido Lento, Lluvia Lenta, Neón Eterno, Brillo Disco, Perreo Nocturno, Dembow Añejo, Trap Lunar, Rima Cruda, Trueno Clásico, Humo Dorado, Vinilo Rosa, Seúl Brillante y Tokio Eléctrico), su descripción, su portada (imágenes de [`covers/`](covers/)) y el estilo de cada canción. Se genera con:

```bash
python3 tools/build_catalog.py
```

El script lee toda la Biblioteca (`musica/*.json`), quita duplicados y pone cada canción en exactamente una playlist según su artista (la tabla `PLAYLISTS` del script). Si sube un artista nuevo, va a Cuarto Pastel y el script avisa para que lo añadas a la playlist que le toque. Vuelve a ejecutarlo cada vez que añadas música.

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
| Q | Cola «A continuación» |
| T | Temporizador de apagado |
| / | Buscar |
