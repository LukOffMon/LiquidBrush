# Crear las 8 playlists en tu Spotify (cuenta gratis)

Este script busca las 792 canciones de los 8 archivos `.txt` y crea en tu Spotify las 8 playlists de 99 canciones (privadas, con su nombre y descripción). **No hace falta Premium.** Tarda unos 10 a 15 minutos.

Necesitas 3 cosas: **Python**, una **app gratis de Spotify para desarrolladores** (es solo un permiso, 2 minutos) y **esta carpeta** descomprimida.

---

## Paso 1 · Descomprime la carpeta

Descomprime el zip (clic derecho → *Extraer todo*) en un lugar fácil, por ejemplo `Descargas\liquid-spotify`. Dentro deben estar `crear_playlists.py` y los 8 archivos `.txt`.

## Paso 2 · Instala Python (si no lo tienes)

**Windows**
1. Entra a **python.org/downloads** y pulsa el botón amarillo *Download Python*.
2. Abre el instalador y, **antes de instalar**, marca la casilla de abajo **«Add python.exe to PATH»**.
3. Pulsa *Install Now* y espera.

**Mac**: entra a python.org/downloads, descarga el instalador para macOS y ábrelo (siguiente, siguiente, instalar).

## Paso 3 · Crea tu app de Spotify (permiso para el script)

1. Entra a **developer.spotify.com/dashboard** e inicia sesión con tu cuenta de Spotify. Acepta los términos si te los pide (y confirma tu correo si Spotify te lo pide).
2. Pulsa **Create app** y rellena:
   - **App name**: `Liquid playlists`
   - **App description**: `Crear mis playlists`
   - **Redirect URIs**: escribe exactamente `http://127.0.0.1:8888/callback` y pulsa **Add**.
   - En **Which API/SDKs are you planning to use?** marca **Web API**.
   - Marca la casilla de los términos y pulsa **Save**.
3. Dentro de la app, entra a **Settings** y copia el **Client ID** (32 letras y números). Lo vas a pegar en el paso 5.
   - El **Client Secret no hace falta**: no lo copies ni se lo des a nadie.

## Paso 4 · Abre una terminal en la carpeta

**Windows**: abre la carpeta `liquid-spotify`, haz clic en la barra de direcciones de arriba (donde dice la ruta), escribe `cmd` y pulsa Enter. Se abre una ventana negra ya situada en esa carpeta.

**Mac**: abre la app *Terminal*, escribe `cd ` (con un espacio), arrastra la carpeta `liquid-spotify` a la ventana y pulsa Enter.

## Paso 5 · Ejecuta el script

1. Primero una prueba (no toca Spotify):

   ```
   python crear_playlists.py --prueba
   ```

   Debe decir «Encontré 8 listas con 792 canciones en total». En Mac usa `python3` en lugar de `python`. En Windows, si dice que no encuentra `python`, usa `py`.

2. Ahora de verdad:

   ```
   python crear_playlists.py
   ```

3. Pega tu **Client ID** y pulsa Enter (solo la primera vez; se guarda en la carpeta).
4. Se abre el navegador: inicia sesión en Spotify si te lo pide y pulsa **Aceptar**. Verás «Listo: ya puedes cerrar esta pestaña».
5. Vuelve a la ventana negra: va mostrando `buscando 37/99 · encontradas 36` por cada playlist. **No la cierres** hasta que diga **«¡Listo!»**.

Al terminar, abre Spotify → **Tu biblioteca**: ahí están las 8 playlists «Liquid · …». En la carpeta queda `resultado.txt` con el enlace de cada una y las canciones que Spotify no tenga en tu país.

---

## Si algo sale mal

| Mensaje | Qué hacer |
| --- | --- |
| `INVALID_CLIENT: Invalid redirect URI` (en el navegador) | En tu app de Spotify → Settings → Redirect URIs debe estar **exactamente** `http://127.0.0.1:8888/callback` (con `127.0.0.1`, no `localhost`). Guarda y vuelve a ejecutar. |
| `INVALID_CLIENT: Invalid client` | El Client ID está mal copiado. Borra el archivo oculto `.spotify-client-id` de la carpeta y vuelve a ejecutar para pegarlo de nuevo. |
| `Spotify respondió 403` | En tu app → **User Management**, añade tu nombre y el correo de tu cuenta de Spotify, guarda y vuelve a ejecutar. |
| Spotify no te deja crear la app o te pide Premium | Spotify cambia a veces las condiciones para desarrolladores. Usa el plan B: **tunemymusic.com** → origen «Texto» → pega cada `.txt` → destino Spotify. |
| `El puerto 8888 está ocupado` | Cierra otros programas o reinicia y vuelve a intentarlo. |
| Se cortó a la mitad | Vuelve a ejecutarlo: las playlists que ya se crearon se saltan solas. Para rehacer una, bórrala en Spotify, o usa `python crear_playlists.py --rehacer` (crea de nuevo todas). |

Privacidad: el script solo habla con Spotify desde tu computadora. Las playlists se crean **privadas**; puedes hacerlas públicas desde Spotify.
