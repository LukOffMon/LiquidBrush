/* =========================================================
   LiquidBrush — service worker (modo offline)
   - La app (HTML, CSS, JS, logo) se guarda para abrir sin conexión.
   - Las listas de canciones de Supabase se sirven desde la red y,
     sin conexión, desde la última copia guardada.
   - Los MP3 descargados desde la app viven en AUDIO_CACHE y se
     reproducen desde ahí (con soporte de rangos para poder adelantar).
   ========================================================= */
const VERSION = 'v4';
const SHELL_CACHE = `liquidbrush-shell-${VERSION}`;
const DATA_CACHE = 'liquidbrush-data';
const AUDIO_CACHE = 'liquidbrush-audio';

const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'logo.svg',
  'manifest.webmanifest',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'tracks.json',
  'cloudflare-tracks.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('liquidbrush-shell-') && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Red primero; si falla, la copia guardada
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await caches.match('index.html');
      if (shell) return shell;
    }
    throw error;
  }
}

// Copia guardada al instante y se actualiza en segundo plano
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

// El reproductor pide el audio por trozos (Range); se recortan del archivo guardado
async function serveAudio(request, cached) {
  const range = request.headers.get('range');
  if (!range) return cached;
  const blob = await cached.blob();
  const size = blob.size;
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  let start = 0;
  let end = size - 1;
  if (match) {
    if (match[1]) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), size - 1);
    } else if (match[2]) {
      start = Math.max(0, size - Number(match[2]));
    }
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.destination === 'audio' || /\.mp3$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(AUDIO_CACHE)
        .then((cache) => cache.match(request.url))
        .then((cached) => (cached ? serveAudio(request, cached) : fetch(request)))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (url.pathname.includes('/rest/v1/')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
  }
});
