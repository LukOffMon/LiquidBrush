# LiquidBrush

Reproductor web personal de estética surrealista y cromada (tema "Cromo Surreal" por defecto), 100 % estático (HTML + CSS + JS) y listo para GitHub Pages.

El tema "Cromo Surreal" incluye una escena animada: esfera de cromo en el horizonte, suelo de ajedrez, nubes, gotas de metal líquido, ojos que siguen el cursor y un reloj derretido cuyas agujas solo avanzan mientras suena la música.

## Publicar en GitHub Pages

1. **Settings → Pages** → *Source: Deploy from a branch* → rama `main`, carpeta `/ (root)` → **Save**.
2. En unos minutos estará en `https://<tu-usuario>.github.io/<nombre-del-repo>/`.

## Añadir tus canciones (Supabase)

La app lee la tabla `tracks` del proyecto Supabase **LoopMusiK** (nombre original del proyecto) (configurado en `CONFIG.supabase` de `app.js`). Para añadir una canción no hace falta tocar GitHub:

1. **Storage → `loopmusik-audio` → Upload**: sube los MP3 sueltos (Supabase **no descomprime** archivos .zip) y las carátulas si quieres. Los nombres de archivo no pueden llevar tildes, ñ ni símbolos como `[ ] # % ? ¿ ¡`.
2. **Table Editor → `tracks` → Insert row**: rellena `title`, `artist`, `album`, `duration`, `lyrics` y:
   - `src`: el nombre del archivo en el bucket (p. ej. `mi-cancion.mp3` o `album/mi-cancion.mp3`) o una URL completa.
   - `cover`: igual que `src` (opcional).
   - `position`: orden en la lista.
   - `is_published`: desmárcalo para ocultar la canción sin borrarla.

La tabla es de solo lectura para la web (RLS); solo se edita desde el panel de Supabase.

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
