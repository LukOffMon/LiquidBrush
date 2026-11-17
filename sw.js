/* =========================================================
   Liquid Bullet — service worker (modo offline)
   - La app (HTML, CSS, JS, logo) se guarda para abrir sin conexión.
   - La lista de canciones se sirve desde la red y, sin conexión,
     desde la última copia guardada.
   - Los MP3 descargados desde la app viven en AUDIO_CACHE y se
     reproducen desde ahí (con soporte de rangos para poder adelantar).
   ========================================================= */
const VERSION = 'v90';
const SHELL_CACHE = `liquidbrush-shell-${VERSION}`;
const DATA_CACHE = 'liquidbrush-data';
const AUDIO_CACHE = 'liquidbrush-audio';

const SHELL = [
  './',
  'index.html',
  'lab.html',
  'styles.css?v=76',
  'app.js?v=79',
  'favicon.png',
  'logo.svg',
  'manifest.webmanifest',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png'
];

// Listas de canciones (~2 MB): se guardan aparte y sin bloquear. Antes iban en SHELL y, si una sola
// fallaba (red lenta, bucket caído), cache.addAll rechazaba entera y la actualización no se instalaba.
const DATA_FILES = [
  'tracks.json',
  'musica/pepper.json',
  'musica/salt.json',
  'musica/brush3.json',
  'musica/db4.json',
  'musica/db5.json',
  'musica/db6.json',
  'catalog.json'
];

// v89: se piden saltándose la caché HTTP del navegador (GitHub Pages la deja 10 min). Antes podía
// guardarse un index.html viejo que pedía un app.js?v= que ya no estaba guardado: sin conexión, la app
// se quedaba en blanco
const fresh = (file) => new Request(file, { cache: 'reload' });

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL.map(fresh))
        .then(() => Promise.allSettled(DATA_FILES.map((file) => cache.add(fresh(file))))))
  );
  // No se activa sola: la app avisa «Hay una versión nueva» y la aplica al pulsar Actualizar
});

// v80: lista en memoria de los MP3 descargados. Así, una canción que NO está descargada no pasa por el
// service worker: el navegador la pide directamente (antes cada trozo del audio daba un rodeo por aquí,
// y en móviles con poca memoria eso hacía que la música se trabara o se cortara)
let audioKeys = null;
let audioKeysLoading = null;
// v89: si llega un aviso mientras se lee la lista, se vuelve a leer al acabar. Antes ese aviso se perdía:
// al descargar una playlist (muchos avisos seguidos) las últimas canciones no entraban en la lista y,
// sin conexión, el service worker las mandaba a la red y no sonaban
let audioKeysStale = false;
function loadAudioKeys() {
  if (audioKeysLoading) {
    audioKeysStale = true;
    return audioKeysLoading;
  }
  audioKeysStale = false;
  audioKeysLoading = caches.open(AUDIO_CACHE)
    .then((cache) => cache.keys())
    .then((keys) => { audioKeys = new Set(keys.map((key) => key.url)); })
    .catch(() => { audioKeys = null; })
    .finally(() => { audioKeysLoading = null; })
    .then(() => (audioKeysStale ? loadAudioKeys() : undefined));
  return audioKeysLoading;
}
loadAudioKeys();

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'AUDIO_CHANGED') {
    // La canción recién guardada (o quitada) cuenta al momento, sin esperar a releer la lista
    const { url, removed } = event.data;
    if (audioKeys && typeof url === 'string') {
      if (removed) audioKeys.delete(url);
      else audioKeys.add(url);
    }
    if (removed && audioBlob.url === url) audioBlob = { url: null, blob: null };
    event.waitUntil(loadAudioKeys());
  }
  if (event.data?.type === 'GET_VERSION') event.source?.postMessage({ type: 'VERSION', version: VERSION });
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

// Una respuesta que llegó tras una redirección no se puede entregar a una navegación (Chrome/Android da
// error y la app no abre): se copia limpia
async function cleanResponse(response) {
  if (!response?.redirected) return response;
  return new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers: response.headers });
}

// v89: cuánto se espera a la red antes de abrir con lo guardado. Con «poca cobertura» (hay señal pero no
// datos) la red no falla: se queda colgada un minuto o más, y la app tardaba una eternidad en abrir
const NAV_TIMEOUT_MS = 3500;
const DATA_TIMEOUT_MS = 6000;
const isDataFile = (url) => /\.json$/i.test(url.pathname);

// Las páginas se guardan sin la parte «?...»: un enlace compartido (?cancion=...) ya no deja su propia
// copia vieja de la página, que después se abría sin conexión con un app.js que ya no existía
function navKey(request) {
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  return url.href;
}

async function fromCache(request, cache) {
  const navigate = request.mode === 'navigate';
  const cached = navigate
    ? await cache.match(navKey(request)) || await cache.match(request, { ignoreSearch: true })
    : await cache.match(request);
  if (cached) return cached;
  if (navigate) {
    const shell = await caches.match('index.html', { ignoreSearch: true }) || await caches.match('./');
    if (shell) return shell;
  }
  // Otra versión del mismo archivo (app.js?v=...) es mejor que nada
  return caches.match(request, { ignoreSearch: true });
}

// Red primero; si falla, tarda demasiado o no hay conexión, la copia guardada
async function networkFirst(request, cacheName, bypassHttpCache = false) {
  const cache = await caches.open(cacheName);
  const navigate = request.mode === 'navigate';
  // Los archivos de la app se piden siempre frescos (GitHub Pages los deja 10 min en caché)
  const network = fetch(bypassHttpCache ? new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' }) : request)
    .then((response) => {
      if (response.ok) cache.put(navigate ? navKey(request) : request, response.clone()).catch(() => {});
      return response;
    });
  network.catch(() => {});
  const clean = (response) => (navigate ? cleanResponse(response) : response);
  // Sin conexión: directo a lo guardado, sin esperar a que la red falle
  if (self.navigator.onLine === false) {
    const cached = await fromCache(request, cache);
    if (cached) return clean(cached);
    return network;
  }
  let timer;
  const slow = new Promise((resolve) => { timer = setTimeout(resolve, isDataFile(new URL(request.url)) ? DATA_TIMEOUT_MS : NAV_TIMEOUT_MS); })
    .then(() => fromCache(request, cache));
  try {
    // Lo primero que llegue: la red, o la copia guardada si la red se hace esperar
    const winner = await Promise.race([network, slow.then((cached) => cached || network)]);
    return clean(winner);
  } catch (error) {
    const cached = await fromCache(request, cache);
    if (cached) return clean(cached);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// La caché de portadas, fondos y fuentes no crece sin fin: se quitan las más antiguas
const DATA_CACHE_LIMIT = 600;
let trimming = null;
function trimCache(cache) {
  if (trimming) return trimming;
  trimming = cache.keys()
    .then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - DATA_CACHE_LIMIT)).map((key) => cache.delete(key))))
    .catch(() => {})
    .finally(() => { trimming = null; });
  return trimming;
}

// Copia guardada al instante y se actualiza en segundo plano
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') {
        cache.put(request, response.clone()).then(() => { if (!cached) trimCache(cache); });
      }
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

// v90: el archivo de la canción que suena se lee del almacenamiento UNA vez y se reutiliza. Antes cada
// trozo que pedía el reproductor (iPhone pide muchos) volvía a leer el MP3 entero (8–10 MB) a memoria:
// sin conexión la canción tardaba muchísimo en cargar y el navegador acababa cerrando la página
let audioBlob = { url: null, blob: null };
function blobFor(url, cached) {
  if (audioBlob.url !== url) {
    const blob = cached.blob();
    audioBlob = { url, blob };
    blob.catch(() => { if (audioBlob.blob === blob) audioBlob = { url: null, blob: null }; });
  }
  return audioBlob.blob;
}

// El reproductor pide el audio por trozos (Range); se recortan del archivo guardado
async function serveAudio(request, cached) {
  const range = request.headers.get('range');
  // Copia opaca (servidor sin CORS): no se puede recortar, se entrega entera
  if (!range || cached.type === 'opaque') return cached;
  const blob = await blobFor(request.url, cached);
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

  // Emisoras en directo y streams de Liquid ATK (audio de otros sitios que no es un MP3): no pasan por aquí.
  // Nunca se descargan, y un directo sin fin no debe depender de que el service worker siga despierto
  const isMp3 = /\.mp3$/i.test(url.pathname);
  const ownAudio = url.origin === self.location.origin || /\.r2\.dev$/i.test(url.hostname);
  if (request.destination === 'audio' && !isMp3 && !ownAudio) return;

  if (request.destination === 'audio' || isMp3) {
    // No está descargada: directa a la red, sin rodeo
    if (audioKeys && !audioKeys.has(request.url)) return;
    // v82: iOS apaga el service worker a menudo y al despertar no recuerda qué está descargado. Antes, en
    // ese rato, TODO el audio pasaba por aquí a trozos (Safari se atascaba o se quedaba en silencio).
    // Con conexión va directo a la red; sin conexión se busca la copia guardada.
    if (!audioKeys) {
      loadAudioKeys();
      if (self.navigator.onLine !== false) return;
    }
    event.respondWith(
      caches.open(AUDIO_CACHE)
        .then((cache) => cache.match(request.url))
        .then((cached) => (cached ? serveAudio(request, cached) : fetch(request)))
    );
    return;
  }

  // Portadas e iconos no cambian: se sirven de la caché al instante
  if (url.origin === self.location.origin && /\/covers\/|\.(png|jpg|svg)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, SHELL_CACHE, true));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
  }
});
