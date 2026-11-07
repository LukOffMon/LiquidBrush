# Liquid Bullet

> Antes se llamaba LiquidBrush. El repositorio, los buckets y las claves de guardado del navegador (`liquidbrush:*`) mantienen el nombre anterior para no perder favoritas, playlists ni descargas.

Reproductor web personal de estética surrealista y cromada (temas "Surrealista" (por defecto), "Minimalista", "Yem" (noche, naranja y plata con destellos verdes) y "Ébano" (casi negro, marfil y oro, con letra Times New Roman), todos con acabado Liquid Glass), 100 % estático (HTML + CSS + JS) y listo para GitHub Pages.

El tema "Surrealista" incluye una escena animada: esfera de cromo en el horizonte, suelo de ajedrez, nubes, gotas de metal líquido, ojos que siguen el cursor y un reloj derretido cuyas agujas solo avanzan mientras suena la música.

## Publicar en GitHub Pages

1. **Settings → Pages** → *Source: Deploy from a branch* → rama `main`, carpeta `/ (root)` → **Save**.
2. En unos minutos estará en `https://<tu-usuario>.github.io/<nombre-del-repo>/`.

## Añadir tus canciones (Cloudflare R2)

La música vive en **5 buckets** de Cloudflare R2, cada uno en una cuenta distinta (10 GB gratis por cuenta). Cada bucket tiene su lista de canciones en la carpeta [`musica/`](musica/) de este repositorio. No hay base de datos: la app lee esas listas y reproduce los MP3 directamente desde cada bucket.

| Lista | Bucket | URL pública |
| --- | --- | --- |
| [`musica/pepper.json`](musica/pepper.json) | `liquidpepper4db` | `https://pub-cb798ce2901a49a6a6363d57fbd5ee19.r2.dev` |
| [`musica/salt.json`](musica/salt.json) | `liquidsaltdb5` | `https://pub-b05e243e7441423f9c4a25dfe8411da3.r2.dev` |
| [`musica/brush3.json`](musica/brush3.json) | `liquidbrush3db3` | `https://pub-342aee3eb054410cb02224940f684884.r2.dev` |
| [`musica/db4.json`](musica/db4.json) | `liquidbulletdb66` | `https://pub-0854e4225565462db16fa787cf2ab81c.r2.dev` |
| [`musica/db5.json`](musica/db5.json) | 5.º bucket | `https://pub-864cd199a5e04cb0b5faf77320b1e47b.r2.dev` |

Para sumar otro bucket: añade una entrada en `CONFIG.sources` (en `app.js`) con `name`, `list` y `base`, crea `musica/<name>.json` y añádelo a la lista `DATA_FILES` de `sw.js`.

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

Al abrir la app vuelve a poner la última canción que sonaba, en el segundo exacto y con su cola («Continúa donde lo dejaste»); basta pulsar reproducir. Se guarda cada pocos segundos, al pausar y al cerrar o esconder la app. Como todo lo personal de la app, vive en el navegador de cada persona (localStorage): cada navegador y cada dispositivo recuerda lo suyo.

## Cola «A continuación» y temporizador

- **A continuación** (botón de lista en el reproductor o tecla Q): muestra lo que va a sonar, permite saltar a cualquier canción o quitarla. Desde el botón + de cualquier canción: **Reproducir a continuación** o **Al final de la cola**, sin cortar lo que suena.
- **Temporizador** (luna en el reproductor o tecla T): pausa la música a los 15, 30, 45, 60 o 90 minutos, o al terminar la canción actual. El volumen baja poco a poco en los últimos segundos.

## Biblioteca, playlists y favoritas

- **Biblioteca**: todas las canciones, con orden configurable (playlists, título, artista, duración).
- **Playlists**: las de Liquid Bullet (las del catálogo o, sin catálogo, una por cada `album`), **Mis playlists** y las automáticas *Escuchadas hace poco* y *Tus más escuchadas*.
- **Mis playlists** se crean en la app (nombre, **portada**, icono y color). Las 11 portadas de [`covers/propias/`](covers/propias/) son solo para las playlists de cada persona: `build_catalog.py` nunca las usa y `check_site.py` falla si el catálogo de base lleva alguna. Para sumar una, guarda `propia-NN.jpg` (600 px) y `propia-NN-sm.jpg` (320 px), añádela a `PORTADAS_PROPIAS` en `app.js` y ejecuta `tools/build_image_library.py` con el botón + de cada canción. Se guardan **solo en ese navegador** (localStorage): si se borra la caché o los datos del sitio, se pierden. Se puede descargar o importar una copia de seguridad en JSON.

## Inicio, Artistas y radio

Liquid funciona como Spotify, pero con tu colección de MP3: todo se calcula en el navegador con tus canciones, lo que escuchas y tus favoritas.

- **Inicio** (la app abre aquí), hecho con lo que de verdad escuchas:
  - resumen de tu semana y **accesos rápidos** con lo último que pusiste (playlists, artistas, radios) y tus fijadas;
  - **Tu daylist**: lo que sueles poner en este momento del día (madrugada, mañana, tarde, noche); cambia 4 veces al día;
  - **Selección rápida** (como en YouTube Music): 16 canciones; cada una arranca su propia radio;
  - **Tus mixes del día**: uno por cada «familia» de artistas que escuchas (el artista y sus parecidos), mitad conocidas y mitad por descubrir;
  - **Porque escuchaste…** (tus artistas de estos días y sus parecidos), **Hecho para ti** (Radar de novedades, Descubre semanal, En repetición, Joyas olvidadas, De nuevo, tu día de la semana, Hace un año, Sin estrenar), **Artistas por descubrir**, artistas que sigues, **Radios** y **Explora tus estilos** (primero los tuyos).
- **El algoritmo de Liquid** (todo en el navegador): segundos reales escuchados por canción y día con vida media de 14 días, las canciones que saltas antes de 30 s (cuentan en contra; terminarla recupera puntos), cuándo sonó cada una por última vez (`liquidbrush:heard`), favoritas, artistas que sigues, colaboraciones, estilo compartido y los artistas que escuchas los mismos días.
- **Aleatorio sin repeticiones**: orden aleatorio ponderado en el que lo que sonó hace poco (horas o días) va al final y lo que saltas sale menos; nunca el mismo artista en las últimas canciones ni más de dos seguidas del mismo estilo, y la misma canción repetida suena una sola vez.
- **Botones de reproducir sincronizados**: el de la playlist, el del artista, los mixes de Inicio y Lab muestran pausa mientras suenan y, al tocarlos de nuevo, pausan o reanudan (no vuelven a empezar).
- **Artistas**: todos los artistas de la colección, primero los que sigues. Cada uno tiene su página con sus canciones, en qué playlists aparece, artistas parecidos, **Seguir** y **Radio**. Tocar el artista en Sonando abre su página; debajo de la letra está **Acerca del artista**.
- **Radio**: empieza por un artista (o por una canción, desde el +) y se renueva sola con artistas parecidos, sin fin.
- **Géneros**: los 45 estilos (playlists de base) se agrupan en 13 géneros amplios (Pop, Indie y alternativo, R&B, soul y funk, Electrónica y baile, Hyperpop y emo, Rap y hip hop, Reggaetón y trap latino, Latino alternativo, Rock y metal, Jazz y swing, Beats y lo-fi, Clásicos y baladas, K-pop y J-pop). En la Biblioteca, Buscar y Favoritas hay una fila de **géneros** y, al elegir uno, sus estilos; en Lab se pueden mezclar géneros enteros además de estilos. La tabla `GENRES` de `tools/build_catalog.py` los define (cada playlist en exactamente uno; el script falla si falta alguna) y van en `catalog.json` → `generos`.
- **Buscar**: al tocar el buscador salen tus **búsquedas recientes** (con Borrar) y los estilos para explorar; los resultados muestran también artistas.
- **A continuación**: botón **Editar** para reordenar arrastrando del asa, y abajo Aleatorio, Repetir y Temporizador.
- **Portadas**: todas son imágenes. Las playlists usan `covers/cover-NN.jpg` (Escuchadas hace poco y Tus más escuchadas, `cover-27` y `cover-28`; Velo Sónico y Niebla Pesada, `cover-29` y `cover-30`; Vampiro Digital, Chicle Tóxico, Verso Azul, Otoño Modal, Café Lento y Beat Nipón, `cover-31` a `cover-36`; Sol Sintético, Londres Rosa, Ola Tibia, Cereza Suave, Terciopelo Azul, Luna Swing e Infierno Rosa, `cover-37` a `cover-43`; Cuenta Atrás y Balada Eterna, `cover-44` y `cover-45`; Euforia Ibiza y Fiebre Latina, `cover-46` y `cover-47`). `cover-48` y `cover-49` están **reservadas** para las playlists nuevas de futuras entregas de música (la Biblioteca de imágenes las marca así). Cada canción lleva uno de los 52 iconos de [`covers/songs/`](covers/songs/), repartidos al azar y por igual entre las canciones que se ven (76 o 77 por icono; las copias ocultas llevan el icono de su original). `tools/build_catalog.py` guarda el reparto en `catalog.json`: cada canción conserva su icono y las nuevas reciben el menos usado. Para sumar iconos, añade `song-53.jpg` (600 px) y `song-53-sm.jpg` (320 px): al regenerar, algunas canciones pasan a los nuevos para que todos queden parejos. Los enlaces compartidos de canciones usan ese icono como miniatura.

## Compartir

- Botón **Compartir** (flecha hacia arriba) en el panel Sonando, en cada playlist y en el + de cada canción. Abre una **tarjeta con la portada** (tres fondos a elegir) para compartir como imagen en Historias o Estados, o guardarla, y los botones **Compartir enlace** y **Copiar enlace**.
- Cada canción y cada playlist de Liquid Bullet tiene su página en [`s/`](s/) con la portada en las etiquetas Open Graph, así **el enlace siempre sale con miniatura**. Las canciones usan la portada de su playlist. Quien lo abre entra directo a la app con esa canción lista o esa playlist abierta.
- Las playlists propias viajan dentro del enlace (`s/mix.html#…`, hasta 150 canciones) y se guardan solas en «Mis playlists» de quien lo abre; su miniatura es el logo.
- `tools/build_catalog.py` regenera las páginas de `s/` cada vez que se ejecuta. Si el sitio cambia de dirección, actualiza `SITE_URL` en ese script.

## Liquid Lab (sitio aparte)

Lab vive en su propio sitio, [`lab.html`](lab.html) (**Liquid Lab**): la pestaña **Lab** de Liquid (y el botón de la barra inferior en el móvil) lleva ahí. Usa el mismo `app.js`, `styles.css`, biblioteca y gustos que Liquid Bullet, pero sin reproductor ni navegación.

- **Guardar en Liquid**: guarda la mezcla como playlist propia (en el navegador y, con cuenta, en la nube) y vuelve a Liquid con ella abierta.
- **Escuchar en Liquid**, **A la cola**, tocar una canción de la mezcla, «Si te gusta…» y **Radio**: vuelven a Liquid con la mezcla sonando o en la cola.
- El paso de Lab a Liquid es una «entrega» en `localStorage` (`liquidbrush:lab-handoff`, caduca a los 10 minutos) que Liquid recoge al abrir. Lab no toca «Continúa donde lo dejaste».
- `lab.html` **se genera** desde `index.html` con `python3 tools/build_lab.py` (lo hace `tools/bump_version.py`); `tools/check_site.py` falla si no está al día. No lo edites a mano.

Lo que ofrece Liquid Lab:

- **Recetas** de un toque: Lo mejor de ti, Descubrimiento profundo, Joyas olvidadas, Para este momento, Un artista por canción y Sal de tu burbuja.
- **Mezcla estilos** (primero los tuyos) y **suma artistas y canciones semilla** (una canción trae su artista, sus parecidos y su estilo).
- **Ajustes**: duración en canciones (20–100) o minutos (30 min, 1 h, 2 h), **Descubrimiento** de «solo conocidas» a «solo nuevas», máximo por artista y orden **mezclada** o **viaje de estilos**.
- El resultado se edita (botón Quitar en cada canción), se reproduce, va **a la cola** o se **guarda como playlist propia**.
- **Si te gusta…**: artistas parecidos (colaboraciones, estilo y lo que escuchas los mismos días), con botón Radio.
- **Tu ADN musical**: tus estilos en porcentaje, cuántos artistas escuchas, cuánto es nuevo para ti y tu momento del día.

## Contacto

Abajo del panel «Sonando» y en **Ajustes → Ayuda** hay un atajo a officiallukamon@gmail.com para ideas, mensajes o reportar errores.

## Tutorial de bienvenida

La primera vez que alguien abre la app sale un recorrido de 7 pasos que resalta cada parte. Queda marcado como visto en el navegador (`liquidbrush:tour`) y no vuelve a salir; se puede repetir desde **Ajustes → Ayuda**.

## Catálogo de playlists de base

[`catalog.json`](catalog.json) define las 45 playlists de base (Cuarto Pastel, Londres Rosa, Seda Nocturna, Ácido Lento, Sol Sintético, Ola Tibia, Cereza Suave, Riviera Francesa, Lluvia Lenta, Velo Sónico, Señal Rota, Ghost Case, Chicle Tóxico, Corazón Roto, Vampiro Digital, Ola Fría, Neón Eterno, Euforia Ibiza, Brillo Disco, Fiebre Latina, Perreo Nocturno, Barrio Sur, Calle Cromo, Infierno Rosa, Cuenta Atrás, Dembow Añejo, Trap Lunar, Rima Cruda, Verso Azul, Nube Púrpura, Trueno Clásico, Niebla Pesada, Ciudad Furia, Alma Latina, Verano Tropical, Humo Dorado, Terciopelo Azul, Luna Swing, Balada Eterna, Otoño Modal, Café Lento, Beat Nipón, Vinilo Rosa, Seúl Brillante y Tokio Eléctrico), su descripción, su portada (imágenes de [`covers/`](covers/)) y el estilo de cada canción. Se genera con:

```bash
python3 tools/build_catalog.py
```

El script lee toda la Biblioteca (`musica/*.json`), quita duplicados y pone cada canción en exactamente una playlist según su artista (la tabla `PLAYLISTS` del script). La revisión completa de noviembre de 2026 (qué canción va en cada playlist y por qué se movió) está en [`docs/revision-playlists.md`](docs/revision-playlists.md), y el listado entero en [`docs/playlists-completas.md`](docs/playlists-completas.md). Si sube un artista nuevo, va a Cuarto Pastel y el script avisa para que lo añadas a la playlist que le toque. Vuelve a ejecutarlo cada vez que añadas música.

## Transiciones DJ y estadísticas

- **Transiciones DJ** (interruptor, tecla D): mezcla la canción que termina con la siguiente usando dos reproductores; la duración es configurable (3–12 s) y se acorta en canciones cortas.
- **Stats**: minutos por día, horas favoritas, géneros, artistas, tendencias frente al mes anterior y canciones del mes. Se calculan con un registro guardado solo en el navegador.

## Instalarla como app

Liquid Bullet es una PWA: se instala desde el navegador, sin tienda de apps. Instalada abre a pantalla completa con su icono, sin barra del navegador, arranca al instante (la app vive en el teléfono gracias a `sw.js`) y el sistema la trata como una app de música (controles en la pantalla de bloqueo, sigue sonando con la pantalla apagada).

- **Android** (Chrome, Edge, Samsung Internet): **Ajustes → App en tu teléfono → Instalar Liquid Bullet**, o el menú ⋮ → *Instalar app*. A partir de la segunda visita la app lo sugiere una vez.
- **iPhone/iPad**: Compartir (el cuadrado con la flecha hacia arriba) → *Añadir a pantalla de inicio*. Apple no deja mostrar un botón de instalar: la app enseña los pasos en Ajustes.
- Las actualizaciones llegan solas al abrirla (no hay que reinstalar).

## Modo ultraligero

**Ajustes → Rendimiento → Modo ultraligero**: la versión más rápida de la app, para teléfonos lentos o con poca batería. Quita el vidrio (desenfoques), sombras, animaciones, transiciones, el fondo y la escena surrealista, el visualizador y el color tomado de la portada, y usa las letras del sistema (no descarga ninguna tipografía). Además no pinta (ni descarga) las miniaturas de las listas, usa la portada pequeña en Sonando, no vibra, acorta Inicio y no calcula las filas fuera de pantalla (`content-visibility`). Se aplica antes de pintar la página y se recuerda; al desactivarlo vuelven tus ajustes de apariencia tal como estaban. En un móvil emulado: la carga pasa de ~9,8 s a ~2 s de trabajo y en reposo la app deja de trabajar por completo.

## Ocultar playlists

Abre una playlist y toca el **ojo tachado**: deja de verse en Playlists, Inicio (accesos, mixes del día, Explora), Buscar y Lab. No se borra nada: sus canciones siguen en la Biblioteca y los enlaces compartidos funcionan. Se vuelven a mostrar en **Ajustes → Contenido oculto** (una a una o «Mostrar todas»). Se guarda solo en este navegador (`liquidbrush:hidden-playlists`).

## Cuando otra app corta la música

Si TikTok, Instagram o una llamada le quitan el audio, la música se pausa y Liquid Bullet lo recuerda. Vuelve a sonar sola cuando hay una señal de que se puede: en iPhone cuando iOS avisa que terminó la interrupción, en Android cuando el navegador devuelve el audio (sonidos cortos), y en todos los casos al volver a Liquid Bullet un instante o al pulsar reproducir en la pantalla de bloqueo o la notificación, sin abrir la app. No reanuda si se desconectaron los auriculares, ni tras más de 3 horas.

Lo que **no** puede hacer ninguna web (ni Spotify): enterarse de que cerraste TikTok si nadie la avisa. Android e iOS no le dicen a la app interrumpida que la otra terminó; reintentar en bucle le quitaría el audio a TikTok cada pocos segundos.

## Actualizaciones con aviso

Cuando se publica una versión nueva, la app lo detecta (al abrirla, al volver a ella y cada 30 min) y muestra **«Hay una versión nueva de Liquid Bullet»** con **Actualizar**, **Luego** y **¿Qué trae?** (el detalle del parche, oculto hasta que lo pides). Actualizar guarda la canción y el segundo exacto, recarga y sigue sonando. El service worker nuevo espera a que lo pidas (no se activa solo).

Las notas salen de [`novedades.json`](novedades.json): al publicar, añade arriba un bloque con `version`, `date`, `title` e `items` y ejecuta `python3 tools/bump_version.py`. También se ven en **Ajustes → Ayuda → Novedades de esta versión**.

**Música nueva en el parche**: cada vez que se suma música, el aviso de actualización y Novedades listan **todas las canciones nuevas** de esa versión (toca una para escucharla, o «Escuchar todas»). Va solo: `tools/build_catalog.py` apunta las canciones que no estaban en el catálogo anterior en `novedades.json` → `nuevaMusica`, y `tools/bump_version.py` las pasa a `songs` del bloque de arriba cuando su `version` es la que se publica (si no coincide, avisa y espera). Orden al sumar música: subir los MP3 y listarlos en `musica/`, `build_catalog.py`, bloque nuevo arriba en `novedades.json` con la versión siguiente y `bump_version.py`.

## Cuentas (opcionales)

Sin cuenta, la app funciona igual que siempre (todo en el navegador). Con cuenta, favoritas, playlists, escucha y ajustes se sincronizan entre dispositivos. La primera vez que se abre la app tras la actualización sale la hoja de cuenta; «Seguir sin cuenta» la cierra y no vuelve a salir. En **Ajustes → Tu cuenta** siempre están *Iniciar sesión* / *Cerrar sesión*.

- **Servidor**: Worker de Cloudflare en [`cuentas/`](cuentas/) (`https://liquid-cuentas.liquidbulletofficial.workers.dev`) con D1 `liquid-cuentas-db` (cuentas, sesiones, códigos), R2 privado `liquid-cuentas` (datos de cada persona), Turnstile y freno por IP. Plan completo: [`docs/Liquid-Bullet-Cuentas-Plan.pdf`](docs/Liquid-Bullet-Cuentas-Plan.pdf).
- **Correo**: los códigos salen de `liquidbulletofficial@gmail.com` por SMTP con contraseña de aplicación (pueden llegar a Spam; la app lo avisa).
- **Contraseñas**: el navegador estira la contraseña (PBKDF2, 600.000 vueltas) y el Worker guarda PBKDF2(HMAC(pimienta, clave)). Nunca viaja ni se guarda en claro.
- **Archivo por persona**: `cuentas/<id>/datos.json.gz` y `escucha-AAAA.json.gz`, con ids de canción de 7 caracteres, fechas en minutos y solo lo que cambió (si nada cambió, no se escribe).
- **Publicar el Worker**: `cd cuentas && npm install && npx wrangler deploy` (con `CLOUDFLARE_API_TOKEN`). Tablas: `npm run migrar`. Secretos (`wrangler secret put`): `SMTP_PASS`, `PIMIENTA`, `FIRMA`, `TURNSTILE_SECRETO`, `ADMIN`. **No pierdas `PIMIENTA` ni `FIRMA`**: sin ellas, las contraseñas guardadas dejan de valer.

## Páginas aparte

- [`review.html`](review.html): review interactiva de Liquid Bullet (qué trae, nota por apartados, simulador del algoritmo, temas, comparativa, preguntas).
- [`imagenes.html`](imagenes.html): **Biblioteca de imágenes**. Cada imagen tiene un tipo (portada de playlist, icono de canción, fondo, icono de fondo, icono de la app, compartir, captura) y se usa solo para eso. Para sumar una: guárdala en la carpeta de su tipo con el siguiente número libre y ejecuta `python3 tools/build_image_library.py` (regenera [`imagenes.json`](imagenes.json) con dónde se usa cada una; las notas escritas a mano se conservan). Las portadas de playlist que aún no usa ninguna playlist salen como **Reservadas**: están dispuestas a ser usadas en futuras entregas de música (hoy, `cover-48` y `cover-49`).

## Verificación de nombres

[`docs/verificacion-nombres.md`](docs/verificacion-nombres.md): las 3.931 canciones comparadas con Deezer (título, artista y duración), lo corregido y lo que queda por revisar a mano.

[`docs/verificacion-audio.md`](docs/verificacion-audio.md): el audio de cada MP3 comprobado (huella acústica contra el fragmento oficial, video de origen y audios repetidos) y las 288 canciones quitadas por sonar a otra canción.

## Modo offline

- La app se puede **instalar** (ver arriba) y abre sin conexión gracias a `sw.js`, que guarda la app y la última lista de canciones.
- Cada playlist tiene un botón **Descargar**: guarda sus MP3 en el dispositivo para escucharlos sin internet. Púlsalo de nuevo para detener la descarga; cuando la playlist está completa, sirve para quitar las descargas.
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
| Mayús + ← / → | Canción anterior / siguiente |
| Mayús + ↑ / ↓ | Subir / bajar volumen |
| 0 … 9 | Saltar al 0 %, 10 % … 90 % de la canción |
| Mayús + , / Mayús + . | Más lenta / más rápida |
| Esc | Cerrar Sonando (móvil) |

En las pestañas: ← / →, Inicio y Fin. La rueda del ratón sobre el volumen lo sube o baja.

## En el teléfono

Liquid está pensada primero para el móvil:

- **Sonando a pantalla completa**: toca el mini-reproductor o deslízalo hacia arriba. Se cierra con la flecha hacia abajo, deslizando hacia abajo o con «Atrás». En horizontal se ve en dos columnas.
- **Mini-reproductor de una fila** (portada, título, reproducir y siguiente) con la barra de progreso como una línea fina.
- **Gestos**: desliza la portada a los lados para cambiar de canción; mantén pulsada una canción para abrir su menú +.
- **Índice A–Z** a la derecha de la Biblioteca cuando se ordena por título o artista.
- Avisos con **Deshacer** al quitar canciones o borrar playlists (pasan 30 días en la **Papelera**).

## Más funciones

- **Búsqueda** por varias palabras, sin acentos, con erratas («gorilaz feel») y dentro de las letras ya guardadas.
- **Inicio → Hecho para ti**: Novedades (lo que llegó desde tu última visita; también como número en el icono de la app instalada), Tu <día de la semana>, Hace un año y Sin estrenar.
- **No me gusta** (en el + de una canción): deja de salir en mixes, radios y Descubre.
- **Añadir todas**: el botón de añadir junto a reproducir añade lo que estás viendo (búsqueda, filtro, artista) a una playlist.
- **Guardar la cola** como playlist (botón Guardar en «A continuación»).
- **Exportar .m3u** de cualquier playlist e **importar** .m3u o texto con líneas «Artista - Título».
- **Letras**: ajustar el desfase (±0,5 s, se recuerda por canción), Traducir y buscar en la web si no hay.
- **Sonido**: velocidad 0,75×–1,5× sin cambiar el tono y fundido corto al pausar.
- **Descargas y espacio** (Ajustes): espacio usado, borrar todo y «Descargar favoritas» automáticamente.
- **Accesos directos** de la app instalada (Buscar, Favoritas, Biblioteca, Lab) y **compartir hacia Liquid** desde otras apps.
- **Privacidad e informe de errores** en Ajustes → Ayuda (los errores se guardan solo en el navegador y se envían si tú quieres).

## Antes de publicar

Sin compilar nada: el sitio se publica tal cual. Hay herramientas para no romperlo:

```bash
python3 tools/bump_version.py   # sube ?v= de app.js/styles.css, VERSION de sw.js y el hash de la CSP
python3 tools/check_site.py     # listas, catálogo, CSP, versiones y archivos del service worker
python3 tools/find_duplicates.py  # canciones repetidas y artistas escritos de varias formas
```

- `index.html` lleva una **Content-Security-Policy** con el hash del script en línea. Si lo editas, corre `python3 tools/bump_version.py --csp` o el navegador lo bloqueará.
- Los scripts de `tools/` solo usan Python 3 estándar (no hay que instalar nada).

Con Node instalado (`npm install` una vez):

```bash
npm run check   # sintaxis + tools/check_site.py
npm run lint    # ESLint
npm test        # tests en el navegador (móvil y escritorio) con Playwright
```

GitHub Actions corre todo esto en cada push a `main` y en cada pull request (`.github/workflows/ci.yml`).
