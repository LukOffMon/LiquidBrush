/* =========================================================
   LiquidBrush — lógica del reproductor
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Configuración ---------- */
  const CONFIG = {
    // Proyectos de Supabase de los que se leen canciones (tabla "tracks" de cada uno).
    // Si todos fallan, se usa tracks.json. Las claves publicables son seguras en el
    // navegador: las tablas solo permiten leer (RLS).
    // En "src" y "cover" basta con poner el nombre del archivo subido al bucket del proyecto.
    sources: [
      {
        name: 'principal',
        url: 'https://kvylexeicpvjrvhpizsz.supabase.co',
        key: 'sb_publishable__E4pzkc1jZe8u9UtpWglHg_Z9KFYPso',
        table: 'tracks',
        bucket: 'loopmusik-audio'
      },
      {
        name: 'extra',
        url: 'https://pikoruycbgwjrxqxaajl.supabase.co',
        key: 'sb_publishable_lraxIbb_tQtXr7y-yAa15Q_OqWrDmUN',
        table: 'tracks',
        bucket: 'LiquidBrush2DB'
      },
      {
        // Canciones guardadas en Cloudflare R2: la lista vive en este repositorio
        // (no ocupa espacio en Supabase) y "src" lleva la URL completa del MP3
        name: 'cloudflare',
        list: 'cloudflare-tracks.json'
      }
    ],
    tracksUrl: 'tracks.json',
    // Playlists de base (por género y mezclas), su portada y el género de cada canción.
    // Lo genera tools/build_catalog.py.
    catalogUrl: 'catalog.json',
    // El visualizador puede leer las frecuencias reales del audio con la Web Audio API,
    // pero SOLO si el servidor del audio (Backblaze B2, Supabase, Cloudinary…) envía la
    // cabecera "Access-Control-Allow-Origin". Si lo activas sin CORS, el audio no sonará.
    // Con false, el visualizador usa una animación simulada que funciona con cualquier URL.
    useWebAudioAnalyser: false
  };

  const KEYS = {
    favorites: 'liquidbrush:favorites',
    theme: 'liquidbrush:theme',
    volume: 'liquidbrush:volume',
    muted: 'liquidbrush:muted',
    shuffle: 'liquidbrush:shuffle',
    repeat: 'liquidbrush:repeat',
    lyricsPrefix: 'liquidbrush:lyrics:',
    playlists: 'liquidbrush:playlists',
    recent: 'liquidbrush:recent',
    plays: 'liquidbrush:plays',
    sort: 'liquidbrush:sort',
    view: 'liquidbrush:view',
    setKey: 'liquidbrush:setkey',
    author: 'liquidbrush:author',
    dj: 'liquidbrush:dj',
    djFade: 'liquidbrush:djfade',
    listen: 'liquidbrush:listen',
    libraryCache: 'liquidbrush:library-cache'
  };

  const LYRICS_API = 'https://lrclib.net/api';

  const THEMES = {
    chrome: '#100d1c',
    minimal: '#f4f3f0'
  };

  const REPEAT_MODES = ['off', 'all', 'one'];
  const REPEAT_LABELS = { off: 'desactivado', all: 'toda la lista', one: 'una canción' };

  const PLACEHOLDER_COVER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#e9edf4"/><stop offset=".5" stop-color="#5a6273"/><stop offset="1" stop-color="#1d1a30"/>' +
    '</linearGradient></defs>' +
    '<rect width="300" height="300" fill="url(#g)"/>' +
    '<path fill="#6b6b6b" d="M150 75v100.6a32 32 0 1 0 18 28.4V115h42V75z"/>' +
    '</svg>'
  );

  // Portada surrealista generada para las canciones sin carátula (y su tono para el fondo)
  function hashString(text) {
    let hash = 2166136261;
    for (const char of text) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function generateArt(seedText) {
    const seed = hashString(seedText);
    const hue = seed % 360;
    const hue2 = (hue + 40 + ((seed >>> 9) % 140)) % 360;
    const shapes = [
      '<circle cx="150" cy="138" r="66" fill="url(#c)"/>',
      `<path d="M58 150Q150 74 242 150Q150 226 58 150Z" fill="#f4f6fb" stroke="url(#c)" stroke-width="7"/><circle cx="150" cy="150" r="30" fill="hsl(${hue2} 80% 58%)"/><circle cx="150" cy="150" r="12" fill="#07060c"/><circle cx="141" cy="141" r="5" fill="#fff"/>`,
      '<path d="M104 70h92v96c0 26-12 30-12 58 0 16-18 16-18 0 0-24-14-26-14-6 0 12-14 12-14 0 0-26-34-30-34-58z" fill="url(#c)"/>',
      '<circle cx="150" cy="140" r="62" fill="none" stroke="url(#c)" stroke-width="15"/><circle cx="190" cy="100" r="18" fill="url(#c)"/>'
    ];
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">' +
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 55% 12%)"/><stop offset=".64" stop-color="hsl(${hue2} 62% 64%)"/><stop offset=".645" stop-color="hsl(${hue} 30% 10%)"/></linearGradient>` +
      `<linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#8a93a6"/><stop offset=".5" stop-color="#232733"/><stop offset=".62" stop-color="hsl(${hue2} 70% 82%)"/><stop offset="1" stop-color="#f4f7fb"/></linearGradient>` +
      '<pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#e9edf4"/><rect x="12" y="12" width="12" height="12" fill="#e9edf4"/></pattern></defs>' +
      '<rect width="300" height="300" fill="url(#s)"/><rect y="194" width="300" height="106" fill="url(#p)" opacity=".28"/>' +
      shapes[(seed >>> 4) % shapes.length] +
      '</svg>';
    return { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), hue };
  }

  /* ---------- Estado ---------- */
  const state = {
    tracks: [],
    libraryTracks: [],
    trackMap: new Map(),
    baseQueue: [],
    queue: [],
    queueIndex: -1,
    queueContext: '',
    currentTrack: null,
    favorites: new Set(),
    // library | playlists | favorites | playlist (una playlist abierta)
    view: 'library',
    openPlaylist: null,
    sort: 'original',
    countedId: null,
    statsOffset: 0,
    query: '',
    shuffle: false,
    repeat: 'off',
    isSeeking: false,
    pendingSeek: null,
    lastVolume: 0.8,
    // Volumen elegido; cada reproductor lo multiplica por su ganancia de mezcla (DJ)
    volume: 0.8,
    lyrics: null,
    activeLyric: -1
  };

  /* ---------- Referencias al DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    audio: $('audio'),
    audio2: $('audio2'),
    commentsCount: $('commentsCount'),
    commentsList: $('commentsList'),
    commentForm: $('commentForm'),
    commentAuthor: $('commentAuthor'),
    commentText: $('commentText'),
    commentSubmit: $('commentSubmit'),
    commentsNote: $('commentsNote'),
    commentMarks: $('commentMarks'),
    commentBubble: $('commentBubble'),
    djToggle: $('djToggle'),
    djFade: $('djFade'),
    djBtn: $('djBtn'),
    statsPanel: $('statsPanel'),
    themeSelect: $('themeSelect'),
    metaTheme: document.querySelector('meta[name="theme-color"]'),
    cover: $('cover'),
    npContext: $('npContext'),
    npTitle: $('npTitle'),
    npArtist: $('npArtist'),
    npAlbum: $('npAlbum'),
    npFavBtn: $('npFavBtn'),
    visualizer: $('visualizer'),
    lyricsPanel: $('lyricsPanel'),
    lyricsBody: $('lyricsBody'),
    lyricsBadge: $('lyricsBadge'),
    searchInput: $('searchInput'),
    tabsBar: document.querySelector('.tabs'),
    lyricsBtn: $('lyricsBtn'),
    favCount: $('favCount'),
    libCount: $('libCount'),
    plCount: $('plCount'),
    viewHead: $('viewHead'),
    listInfo: $('listInfo'),
    playlistGrid: $('playlistGrid'),
    trackList: $('trackList'),
    library: document.querySelector('.library'),
    npAddBtn: $('npAddBtn'),
    keyDialog: $('keyDialog'),
    keyMessage: $('keyMessage'),
    keyInput: $('keyInput'),
    keyRemember: $('keyRemember'),
    plDialog: $('plDialog'),
    plDialogTitle: $('plDialogTitle'),
    plName: $('plName'),
    plEmojis: $('plEmojis'),
    plColors: $('plColors'),
    addDialog: $('addDialog'),
    addTrackName: $('addTrackName'),
    addList: $('addList'),
    addNew: $('addNew'),
    importInput: $('importInput'),
    miniCover: $('miniCover'),
    miniTitle: $('miniTitle'),
    miniArtist: $('miniArtist'),
    shuffleBtn: $('shuffleBtn'),
    prevBtn: $('prevBtn'),
    playBtn: $('playBtn'),
    nextBtn: $('nextBtn'),
    repeatBtn: $('repeatBtn'),
    currentTime: $('currentTime'),
    progress: $('progress'),
    totalTime: $('totalTime'),
    muteBtn: $('muteBtn'),
    volume: $('volume'),
    toast: $('toast')
  };

  /* ---------- Utilidades ---------- */
  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        /* localStorage no disponible (modo privado, cuota llena…) */
        return false;
      }
    }
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }

  function parseDuration(text) {
    if (typeof text !== 'string' || !text.trim()) return 0;
    const parts = text.trim().split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return 0;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }

  const normalize = (text) =>
    String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  function shuffleArray(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  const getTrack = (id) => state.trackMap.get(id);

  function setIcon(button, name) {
    const use = button.querySelector('use');
    if (use) use.setAttribute('href', `#i-${name}`);
  }

  function getDuration() {
    const d = els.audio.duration;
    if (Number.isFinite(d) && d > 0) return d;
    return parseDuration(state.currentTrack?.duration);
  }

  let toastTimer = null;
  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 3200);
  }

  /* ---------- Carga de datos ---------- */
  // Convierte "cancion.mp3" en la URL pública del bucket; las URLs completas se dejan igual
  function resolveMediaUrl(path, source = CONFIG.sources[0]) {
    const value = typeof path === 'string' ? path.trim() : '';
    const { url, bucket } = source || {};
    if (!value || /^(https?:|data:|blob:)/i.test(value) || !url || !bucket) return value;
    const cleanPath = value.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
    return `${url}/storage/v1/object/public/${bucket}/${cleanPath}`;
  }

  async function fetchFromList(source) {
    const response = await fetch(source.list);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    return rows.map((row) => ({ ...row, source }));
  }

  async function fetchFromSupabase(source) {
    if (source.list) return fetchFromList(source);
    const { url, key, table } = source;
    const endpoint = `${url}/rest/v1/${table}?select=*&order=position.asc,id.asc`;
    const response = await fetch(endpoint, { headers: { apikey: key }, cache: 'no-cache' });
    if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
    const rows = await response.json();
    return rows.map((row) => ({ ...row, source }));
  }

  async function fetchFromJson() {
    const response = await fetch(CONFIG.tracksUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  // Lee todos los proyectos en paralelo; uno caído no impide mostrar los demás
  async function fetchTrackData() {
    const results = await Promise.allSettled(CONFIG.sources.map(fetchFromSupabase));
    const rows = [];
    let anyOk = false;
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        anyOk = true;
        rows.push(...result.value);
      } else {
        console.warn(`[LiquidBrush] Supabase "${CONFIG.sources[i].name}" no disponible.`, result.reason);
      }
    });
    if (anyOk) return rows;
    console.warn('[LiquidBrush] Ningún proyecto de Supabase respondió, se usa tracks.json.');
    return fetchFromJson();
  }

  // Convierte una fila de cualquier fuente en una canción de la app. La portada generada
  // (SVG) se crea solo cuando se necesita, no para toda la biblioteca al arrancar.
  function buildTrack(t, i) {
    const title = t.title || 'Sin título';
    const album = t.album || '';
    const source = t.source || CONFIG.sources.find((s) => s.name === t.sourceName) || CONFIG.sources[0];
    const rawId = String(t.id ?? i + 1);
    const coverUrl = resolveMediaUrl(t.cover, source);
    const seed = `${album}|${title}`;
    let art = null;
    const getArt = () => (art ||= generateArt(seed));
    return {
      // Los ids del proyecto principal no llevan prefijo (conserva los favoritos guardados)
      id: source === CONFIG.sources[0] ? rawId : `${source.name}:${rawId}`,
      title,
      // Sin artista se muestra el nombre de la playlist
      artist: t.artist || album || 'Artista desconocido',
      knownArtist: t.artist || '',
      album,
      duration: t.duration || '',
      src: resolveMediaUrl(t.src, source),
      get cover() { return coverUrl || getArt().url; },
      get hue() { return coverUrl ? null : getArt().hue; },
      lyrics: typeof t.lyrics === 'string' ? t.lyrics : '',
      genre: ''
    };
  }

  async function applyTrackData(data) {
    const previousId = state.currentTrack?.id;
    state.tracks = data.filter((t) => t && typeof t.src === 'string' && t.src.trim()).map(buildTrack);
    state.trackMap = new Map(state.tracks.map((t) => [t.id, t]));
    state.tracks.forEach((t) => {
      t.genre = library.catalog?.genres?.[t.id] || '';
      t.songKey = commentKey(t);
    });
    // La Biblioteca muestra una sola copia de cada canción (algunas están en varias fuentes)
    const seenSongs = new Set();
    state.libraryTracks = state.tracks.filter((t) => !seenSongs.has(t.songKey) && seenSongs.add(t.songKey));
    await refreshDownloads();

    // Si la playlist que estaba abierta ya no existe, se vuelve a Playlists
    if (state.view === 'playlist' && !getPlaylist(state.openPlaylist)) state.view = 'playlists';
    const scroll = window.scrollY;
    setView(state.view, { keepScroll: true });
    window.scrollTo(0, scroll);

    if (previousId && getTrack(previousId)) {
      // Llegaron datos nuevos con algo sonando: se conserva la canción y la cola
      state.currentTrack = getTrack(previousId);
    } else if (state.tracks.length) {
      buildQueue((state.tracks.find(isPlayable) || state.tracks[0]).id);
      loadTrack(getTrack(state.queue[state.queueIndex]), false);
    } else {
      els.npContext.textContent = 'Biblioteca vacía';
    }
  }

  // Abre al instante con la biblioteca de la última visita y la actualiza en segundo plano
  async function loadTracks() {
    let cachedRaw = null;
    try { cachedRaw = localStorage.getItem(KEYS.libraryCache); } catch { /* sin localStorage */ }
    let shown = false;
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (Array.isArray(cached.rows) && cached.rows.length) {
          library.catalog = cached.catalog || null;
          library.shared = Array.isArray(cached.shared) ? cached.shared : [];
          await applyTrackData(cached.rows);
          shown = true;
        }
      } catch (error) {
        console.warn('[LiquidBrush] Copia local de la biblioteca dañada; se descarga de nuevo.', error);
      }
    }
    if (!shown) els.listInfo.textContent = 'Cargando canciones…';

    try {
      const [data] = await Promise.all([fetchTrackData(), loadSharedPlaylists(), loadCatalog()]);
      if (!Array.isArray(data)) throw new Error('La lista de canciones debe ser un array');
      const rows = data.map(({ source, ...rest }) => (source ? { ...rest, sourceName: source.name } : rest));
      const fresh = JSON.stringify({ rows, catalog: library.catalog, shared: library.shared });
      if (fresh === cachedRaw) return;
      await applyTrackData(rows);
      try { localStorage.setItem(KEYS.libraryCache, fresh); } catch { /* sin espacio: se descargará la próxima vez */ }
    } catch (error) {
      console.error('[LiquidBrush] Error al cargar las canciones:', error);
      if (shown) return;
      els.listInfo.textContent = '';
      els.npContext.textContent = 'Error de carga';
      const li = document.createElement('li');
      li.className = 'list-empty';
      li.textContent = location.protocol === 'file:'
        ? 'No se pudo cargar tracks.json. Abre la app desde un servidor (GitHub Pages o, en local, "npx serve") en lugar de hacer doble clic en index.html.'
        : 'No se pudieron cargar las canciones. Revisa tu conexión y vuelve a abrir la app.';
      els.trackList.replaceChildren(li);
    }
  }


  /* ---------- Modo offline (descargas) ---------- */
  // Los MP3 descargados se guardan en esta caché; sw.js los sirve cuando no hay conexión
  const AUDIO_CACHE = 'liquidbrush-audio';
  // ~320 kbps, solo para avisar del tamaño aproximado antes de descargar
  const BYTES_PER_SECOND = 40000;
  const offline = {
    supported: 'caches' in window && 'serviceWorker' in navigator,
    downloaded: new Set(),
    jobs: new Map()
  };

  const cacheKey = (src) => new URL(src, location.href).href;
  const isDownloaded = (track) => offline.downloaded.has(cacheKey(track.src));
  const isPlayable = (track) => navigator.onLine || isDownloaded(track);
  const playlistTracks = (key) => playlistTracksOf(getPlaylist(key));

  async function refreshDownloads() {
    if (!offline.supported) return;
    try {
      const keys = await (await caches.open(AUDIO_CACHE)).keys();
      offline.downloaded = new Set(keys.map((request) => request.url));
    } catch (error) {
      console.warn('[LiquidBrush] No se pudieron leer las descargas.', error);
    }
  }

  function formatBytes(bytes) {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
  }

  function updatePlaylistHeader(header) {
    const key = header.dataset.key;
    const name = getPlaylist(key)?.name || '';
    const tracks = playlistTracks(key);
    const saved = tracks.filter(isDownloaded).length;
    const job = offline.jobs.get(key);
    const meta = header.querySelector('.playlist-meta');
    let status = '';
    if (job) status = ` · Descargando ${job.done}/${job.total}…`;
    else if (saved && saved === tracks.length) status = ' · Disponible sin conexión';
    else if (saved) status = ` · ${saved}/${tracks.length} descargadas`;
    meta.textContent = meta.dataset.base + status;

    const button = header.querySelector('.playlist-download');
    if (!button) return;
    const done = !job && saved === tracks.length && tracks.length > 0;
    button.classList.toggle('is-busy', Boolean(job));
    button.classList.toggle('is-done', done);
    setIcon(button, done ? 'download-done' : 'download');
    const label = job
      ? `Detener la descarga de ${name}`
      : done ? `Quitar las descargas de ${name}` : `Descargar ${name} para escuchar sin conexión`;
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  function updateDownloadUI() {
    els.viewHead.querySelectorAll('.pl-hero').forEach(updatePlaylistHeader);
    els.trackList.querySelectorAll('.track').forEach((li) => {
      const track = getTrack(li.dataset.id);
      if (track) li.classList.toggle('is-downloaded', isDownloaded(track));
    });
  }

  async function removeDownloads(key) {
    const name = getPlaylist(key)?.name || '';
    if (!confirm(`¿Quitar las descargas de «${name}»? Ya no se podrá escuchar sin conexión.`)) return;
    const cache = await caches.open(AUDIO_CACHE);
    await Promise.all(playlistTracks(key).map((t) => cache.delete(cacheKey(t.src))));
    await refreshDownloads();
    updateDownloadUI();
    showToast(`Descargas de «${name}» eliminadas.`);
  }

  // iPhone/iPad (incluido el iPad que se presenta como Mac)
  const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Descarga una canción para guardarla en la caché. Si el servidor no envía CORS (p. ej. un bucket
  // de R2 sin política CORS), se guarda una copia "opaca": no se puede leer desde aquí, pero el
  // service worker sí puede entregársela al reproductor. Safari no reproduce copias opacas.
  async function fetchForOffline(track) {
    let response;
    try {
      response = await fetch(track.src, { mode: 'cors', cache: 'no-store' });
    } catch (error) {
      if (IS_IOS) throw Object.assign(new Error('Sin CORS en el servidor del audio'), { cors: true });
      return fetch(track.src, { mode: 'no-cors', cache: 'no-store' });
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return new Response(blob, {
      headers: { 'Content-Type': blob.type || 'audio/mpeg', 'Content-Length': String(blob.size) }
    });
  }

  async function toggleDownload(key) {
    const running = offline.jobs.get(key);
    if (running) {
      running.cancelled = true;
      return;
    }
    const name = getPlaylist(key)?.name || '';
    const tracks = playlistTracks(key);
    const missing = tracks.filter((t) => !isDownloaded(t));
    if (!missing.length) {
      removeDownloads(key);
      return;
    }
    if (!navigator.onLine) {
      showToast('Sin conexión: conéctate para descargar.');
      return;
    }
    const estimate = missing.reduce((sum, t) => sum + parseDuration(t.duration), 0) * BYTES_PER_SECOND;
    const songs = `${missing.length} canci${missing.length === 1 ? 'ón' : 'ones'}`;
    if (!confirm(`¿Descargar ${songs} de «${name}» para escucharlas sin conexión? Ocupará unos ${formatBytes(estimate)} en este dispositivo.`)) return;

    // Pide al navegador que no borre las descargas cuando falte espacio
    navigator.storage?.persist?.().catch(() => {});
    const job = { done: tracks.length - missing.length, total: tracks.length, cancelled: false, noSpace: false };
    offline.jobs.set(key, job);
    updateDownloadUI();

    const cache = await caches.open(AUDIO_CACHE);
    const pending = missing.slice();
    let failed = 0;
    let blockedByCors = 0;
    // Dos descargas a la vez: rápido sin saturar la conexión
    const worker = async () => {
      while (pending.length && !job.cancelled) {
        const track = pending.shift();
        try {
          // Un reintento si falla la red a medias
          const response = await fetchForOffline(track).catch((error) => {
            if (error.cors || error.name === 'QuotaExceededError') throw error;
            return fetchForOffline(track);
          });
          await cache.put(cacheKey(track.src), response);
          offline.downloaded.add(cacheKey(track.src));
          job.done++;
        } catch (error) {
          failed++;
          if (error.cors) blockedByCors++;
          console.warn(`[LiquidBrush] No se pudo descargar «${track.title}».`, error);
          if (error.name === 'QuotaExceededError') {
            job.noSpace = true;
            job.cancelled = true;
          }
        }
        updateDownloadUI();
      }
    };
    await Promise.all([worker(), worker()]);
    offline.jobs.delete(key);
    updateDownloadUI();

    if (job.noSpace) showToast('No queda espacio en el dispositivo para más descargas.');
    else if (job.cancelled) showToast(`Descarga de «${name}» detenida (${job.done}/${job.total}).`);
    else if (blockedByCors) showToast(`En iPhone/iPad, ${blockedByCors} canci${blockedByCors === 1 ? 'ón' : 'ones'} de Cloudflare no se pueden descargar hasta que el bucket tenga CORS activado.`);
    else if (failed) showToast(`«${name}»: ${failed} canci${failed === 1 ? 'ón' : 'ones'} no se pudieron descargar. Pulsa ⬇ para reintentar.`);
    else showToast(`«${name}» lista para escuchar sin conexión.`);
  }

  function updateOnlineStatus(notify = false) {
    const isOffline = !navigator.onLine;
    document.body.classList.toggle('is-offline', isOffline);
    if (notify) showToast(isOffline ? 'Sin conexión: solo suenan las canciones descargadas.' : 'Conexión recuperada.');
  }

  // Sin conexión se saltan las canciones que no están descargadas
  function findPlayable(start, step) {
    const len = state.queue.length;
    for (let n = 0; n < len; n++) {
      const i = (((start + step * n) % len) + len) % len;
      const track = getTrack(state.queue[i]);
      if (track && isPlayable(track)) return i;
    }
    return -1;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
    navigator.serviceWorker.register('sw.js').catch((error) => {
      console.warn('[LiquidBrush] No se pudo activar el modo offline.', error);
    });

    // Al publicarse una versión nueva, se recarga una vez (sin cortar la canción que suena)
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    const reload = () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      if (els.audio.paused) reload();
      else {
        showToast('Hay una versión nueva de LiquidBrush: se aplicará al pausar.');
        els.audio.addEventListener('pause', reload, { once: true });
      }
    });
  }

  /* ---------- Playlists ---------- */
  // Oficiales: las de la base de datos (una por "album").
  // Guardadas para todos: creadas en la app con la KeyForSet (tabla shared_playlists).
  // Mías: solo en este navegador (localStorage). Automáticas: recientes y más escuchadas.
  const PLAYLIST_EMOJIS = ['💿', '🎧', '🔥', '🌙', '🫧', '🪩', '💜', '🖤', '🌈', '⚡', '🍒', '👁️', '🦋', '🌊', '🧠', '✨'];
  const PLAYLIST_COLORS = ['#8a93a6', '#ff7ad9', '#7ef9ff', '#ffe27a', '#7a5cff', '#ff5f6d', '#3ddc97', '#ff9f43'];
  const RECENT_LIMIT = 50;
  const TOP_LIMIT = 30;
  const SORTS = {
    original: 'Orden original',
    genre: 'Género',
    title: 'Título (A-Z)',
    artist: 'Artista (A-Z)',
    long: 'Más largas primero',
    short: 'Más cortas primero'
  };
  const VIEWS = ['library', 'playlists', 'favorites', 'stats'];

  const library = {
    catalog: null,
    shared: [],
    local: [],
    recent: [],
    plays: {}
  };

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const songsLabel = (n) => `${n} canci${n === 1 ? 'ón' : 'ones'}`;
  const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

  function saveLocalPlaylists() {
    if (!storage.set(KEYS.playlists, library.local)) {
      showToast('No se pudo guardar en este navegador (¿modo privado o sin espacio?).');
    }
  }

  function systemPlaylists() {
    if (library.catalog?.playlists?.length) {
      return library.catalog.playlists.map((p) => ({
        key: `sys:${p.id}`, kind: 'system', id: p.id, name: p.name, description: p.description || '',
        cover: p.cover || null, trackIds: Array.isArray(p.trackIds) ? p.trackIds : []
      }));
    }
    // Sin catálogo: una playlist por cada "album" de la base de datos
    const groups = new Map();
    state.tracks.forEach((t) => {
      if (!t.album) return;
      if (!groups.has(t.album)) groups.set(t.album, []);
      groups.get(t.album).push(t.id);
    });
    return [...groups].map(([name, trackIds]) => ({ key: `sys:${name}`, kind: 'system', name, trackIds }));
  }

  function sharedPlaylists() {
    return library.shared.map((p) => ({
      key: `shared:${p.id}`, kind: 'shared', id: p.id, name: p.name,
      emoji: p.emoji, color: p.color, trackIds: Array.isArray(p.track_ids) ? p.track_ids : []
    }));
  }

  function localPlaylists() {
    return library.local.map((p) => ({
      key: `local:${p.id}`, kind: 'local', id: p.id, name: p.name,
      emoji: p.emoji, color: p.color, trackIds: p.trackIds, sharedId: p.sharedId || null
    }));
  }

  function autoPlaylists() {
    const top = Object.entries(library.plays)
      .filter(([id]) => state.trackMap.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_LIMIT)
      .map(([id]) => id);
    return [
      { key: 'auto:recent', kind: 'auto', name: 'Escuchadas hace poco', emoji: '🕘', color: '#7ef9ff', trackIds: library.recent },
      { key: 'auto:top', kind: 'auto', name: 'Tus más escuchadas', emoji: '🏆', color: '#ffe27a', trackIds: top }
    ];
  }

  function getPlaylist(key) {
    if (!key) return null;
    const [kind] = key.split(':');
    const list = { sys: systemPlaylists, shared: sharedPlaylists, local: localPlaylists, auto: autoPlaylists }[kind];
    return list ? list().find((p) => p.key === key) || null : null;
  }

  const playlistTracksOf = (pl) => (pl ? pl.trackIds.map(getTrack).filter(Boolean) : []);
  const findLocal = (id) => library.local.find((p) => p.id === id);

  function recordPlay(id) {
    library.recent = [id, ...library.recent.filter((x) => x !== id)].slice(0, RECENT_LIMIT);
    library.plays[id] = (library.plays[id] || 0) + 1;
    storage.set(KEYS.recent, library.recent);
    storage.set(KEYS.plays, library.plays);
    countPlayInLog(id);
  }

  async function loadCatalog() {
    try {
      const response = await fetch(CONFIG.catalogUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      library.catalog = await response.json();
    } catch (error) {
      console.warn('[LiquidBrush] No se pudo cargar el catálogo de playlists.', error);
    }
  }

  // Portadas generadas (SVG) para las playlists de base que no tienen imagen
  function coverArt(pl) {
    const seed = hashString(pl.id || pl.name);
    const c1 = pl.cover?.color || PLAYLIST_COLORS[seed % PLAYLIST_COLORS.length];
    const hue = seed % 360;
    const c2 = `hsl(${(hue + 200) % 360} 70% 18%)`;
    const r = (n) => ((seed >>> (n % 24)) % 97) / 97;
    let shapes = '';
    switch (pl.cover?.style) {
      case 'orbits':
        for (let i = 0; i < 6; i++) shapes += `<ellipse cx="150" cy="150" rx="${40 + i * 20}" ry="${16 + i * 9}" transform="rotate(${-20 + i * 9} 150 150)" fill="none" stroke="${c1}" stroke-opacity="${0.9 - i * 0.12}" stroke-width="3"/>`;
        shapes += `<circle cx="150" cy="150" r="26" fill="${c1}"/>`;
        break;
      case 'stripes':
        for (let i = -6; i < 12; i++) shapes += `<rect x="${i * 34}" y="-60" width="16" height="420" fill="${c1}" fill-opacity="${0.25 + (i % 3) * 0.25}" transform="rotate(28 150 150)"/>`;
        break;
      case 'waves':
        for (let i = 0; i < 8; i++) shapes += `<path d="M-10 ${80 + i * 22} Q 75 ${50 + i * 22} 150 ${80 + i * 22} T 310 ${80 + i * 22}" fill="none" stroke="${c1}" stroke-opacity="${1 - i * 0.1}" stroke-width="5"/>`;
        break;
      case 'sun':
        for (let i = 0; i < 7; i++) shapes += `<rect x="0" y="${150 + i * 18}" width="300" height="${6 + i}" fill="${c2}"/>`;
        shapes = `<circle cx="150" cy="150" r="92" fill="${c1}"/>${shapes}`;
        break;
      case 'rings':
        for (let i = 0; i < 9; i++) shapes += `<circle cx="${110 + r(i) * 80}" cy="${110 + r(i + 5) * 80}" r="${18 + i * 14}" fill="none" stroke="${c1}" stroke-width="${2 + (i % 3)}" stroke-opacity="${0.35 + (i % 4) * 0.15}"/>`;
        break;
      case 'grid':
        for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) if ((x * 7 + y * 3 + seed) % 4 !== 0) shapes += `<rect x="${18 + x * 46}" y="${18 + y * 46}" width="36" height="36" rx="${(x + y) % 3 * 9}" fill="${c1}" fill-opacity="${0.25 + ((x + y) % 4) * 0.2}"/>`;
        break;
      case 'bars':
        for (let i = 0; i < 14; i++) { const h = 40 + r(i * 3) * 190; shapes += `<rect x="${14 + i * 20}" y="${260 - h}" width="13" height="${h}" rx="6" fill="${c1}" fill-opacity="${0.5 + (i % 2) * 0.4}"/>`; }
        break;
      case 'blobs':
        for (let i = 0; i < 5; i++) shapes += `<circle cx="${40 + r(i * 2) * 220}" cy="${40 + r(i * 2 + 7) * 220}" r="${40 + r(i + 3) * 60}" fill="${i % 2 ? c1 : '#ffffff'}" fill-opacity="${i % 2 ? 0.8 : 0.18}"/>`;
        break;
      case 'checker':
        for (let x = 0; x < 10; x++) for (let y = 5; y < 10; y++) if ((x + y) % 2) shapes += `<rect x="${x * 30}" y="${y * 30}" width="30" height="30" fill="#e9edf4" fill-opacity="0.35"/>`;
        shapes += `<circle cx="150" cy="110" r="60" fill="${c1}"/>`;
        break;
      case 'dots':
        for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) shapes += `<circle cx="${13 + x * 25}" cy="${13 + y * 25}" r="${2 + ((x * y + seed) % 7)}" fill="${c1}" fill-opacity="${0.3 + ((x + y) % 5) * 0.14}"/>`;
        break;
      case 'zigzag':
        for (let i = 0; i < 7; i++) { let d = `M-10 ${50 + i * 34}`; for (let x = 0; x <= 320; x += 40) d += ` L${x} ${50 + i * 34 + (x / 40 % 2 ? -16 : 16)}`; shapes += `<path d="${d}" fill="none" stroke="${c1}" stroke-width="6" stroke-opacity="${1 - i * 0.11}" stroke-linejoin="round"/>`; }
        break;
      default:
        shapes = `<circle cx="150" cy="150" r="100" fill="${c1}"/><circle cx="${175 + r(2) * 20}" cy="${135 + r(4) * 20}" r="92" fill="${c2}"/>`;
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">' +
      `<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="#07060c"/></linearGradient></defs>` +
      `<rect width="300" height="300" fill="url(#b)"/>${shapes}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ---------- Playlists guardadas para todos (Supabase + KeyForSet) ---------- */
  // Viven en el proyecto principal. La clave nunca está en el código: Supabase la comprueba.
  const SHARED_DB = CONFIG.sources[0];

  async function loadSharedPlaylists() {
    try {
      const response = await fetch(`${SHARED_DB.url}/rest/v1/shared_playlists?select=*&hidden=eq.false&order=created_at.asc`, {
        headers: { apikey: SHARED_DB.key },
        cache: 'no-cache'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      library.shared = await response.json();
    } catch (error) {
      console.warn('[LiquidBrush] No se pudieron cargar las playlists guardadas para todos.', error);
    }
  }

  async function supabaseRpc(fn, body) {
    const response = await fetch(`${SHARED_DB.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SHARED_DB.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    if (!response.ok) {
      let message = '';
      try { message = JSON.parse(text).message || ''; } catch { /* respuesta sin JSON */ }
      const error = new Error(message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return text ? JSON.parse(text) : null;
  }

  function readSessionKey() {
    try { return sessionStorage.getItem(KEYS.setKey) || ''; } catch { return ''; }
  }

  function writeSessionKey(value) {
    try {
      if (value) sessionStorage.setItem(KEYS.setKey, value);
      else sessionStorage.removeItem(KEYS.setKey);
    } catch { /* sin sessionStorage */ }
  }

  function openDialog(dialog) {
    return new Promise((resolve) => {
      dialog.returnValue = '';
      dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
      dialog.showModal();
    });
  }

  async function askKey(message) {
    const remembered = readSessionKey();
    if (remembered) return remembered;
    els.keyMessage.textContent = message;
    els.keyInput.value = '';
    const result = await openDialog(els.keyDialog);
    const value = els.keyInput.value;
    els.keyInput.value = '';
    if (result !== 'ok' || !value) return null;
    if (els.keyRemember.checked) writeSessionKey(value);
    return value;
  }

  function handleKeyError(error) {
    if (error.message === 'clave_incorrecta') {
      writeSessionKey('');
      showToast('KeyForSet incorrecta. No se guardó nada.');
    } else if (error.message === 'demasiados_intentos') {
      writeSessionKey('');
      showToast('Demasiados intentos fallidos. Espera 10 minutos y vuelve a probar.');
    } else if (error.status === 404) {
      showToast('El guardado para todos aún no está activado en Supabase.');
    } else {
      console.error('[LiquidBrush] Error al guardar para todos:', error);
      showToast(navigator.onLine ? 'No se pudo guardar. Inténtalo de nuevo.' : 'Sin conexión: conéctate para guardar para todos.');
    }
  }

  async function sharePlaylist(pl) {
    if (!pl.trackIds.length) {
      showToast('La playlist está vacía: añade canciones antes de guardarla.');
      return;
    }
    const verb = pl.sharedId ? 'Actualizar' : 'Guardar';
    const key = await askKey(`${verb} «${pl.name}» para todos. Quedará en la base de datos y la verá cualquiera que abra LiquidBrush, en cualquier dispositivo.`);
    if (!key) return;
    try {
      const id = await supabaseRpc('save_shared_playlist', {
        p_key: key, p_id: pl.sharedId, p_name: pl.name,
        p_emoji: pl.emoji || '', p_color: pl.color || '', p_track_ids: pl.trackIds
      });
      // Ya no es temporal: la copia local deja de hacer falta
      library.local = library.local.filter((p) => p.id !== pl.id);
      saveLocalPlaylists();
      await loadSharedPlaylists();
      openPlaylist(`shared:${id}`);
      showToast(`«${pl.name}» guardada para todos.`);
    } catch (error) {
      handleKeyError(error);
    }
  }

  async function deleteSharedPlaylist(pl) {
    if (!confirm(`¿Eliminar «${pl.name}» para todos? Desaparecerá en todos los dispositivos.`)) return;
    const key = await askKey(`Eliminar «${pl.name}» para todos.`);
    if (!key) return;
    try {
      await supabaseRpc('hide_shared_playlist', { p_key: key, p_id: pl.id });
      await loadSharedPlaylists();
      setView('playlists');
      showToast(`«${pl.name}» eliminada para todos.`);
    } catch (error) {
      handleKeyError(error);
    }
  }

  /* ---------- Mis playlists (solo en este navegador) ---------- */
  function fillChoices(container, name, values, selected, render) {
    container.replaceChildren(...values.map((value) => {
      const label = document.createElement('label');
      label.className = 'choice';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = value;
      input.checked = value === selected;
      const face = document.createElement('span');
      face.className = 'choice-face';
      render(face, value);
      label.append(input, face);
      return label;
    }));
  }

  async function editPlaylistDialog(existing) {
    els.plDialogTitle.textContent = existing ? 'Editar playlist' : 'Nueva playlist';
    els.plName.value = existing?.name || '';
    const emoji = existing?.emoji || PLAYLIST_EMOJIS[Math.floor(Math.random() * PLAYLIST_EMOJIS.length)];
    const color = existing?.color || PLAYLIST_COLORS[Math.floor(Math.random() * PLAYLIST_COLORS.length)];
    fillChoices(els.plEmojis, 'plEmoji', PLAYLIST_EMOJIS, emoji, (face, value) => { face.textContent = value; });
    fillChoices(els.plColors, 'plColor', PLAYLIST_COLORS, color, (face, value) => {
      face.style.background = value;
      face.setAttribute('aria-label', value);
    });
    const result = await openDialog(els.plDialog);
    const name = els.plName.value.trim().slice(0, 60);
    if (result !== 'ok' || !name) return null;
    return {
      name,
      emoji: els.plDialog.querySelector('input[name="plEmoji"]:checked')?.value || emoji,
      color: els.plDialog.querySelector('input[name="plColor"]:checked')?.value || color
    };
  }

  async function createPlaylist(initialTrackIds = []) {
    const data = await editPlaylistDialog(null);
    if (!data) return null;
    const playlist = { id: newId(), ...data, trackIds: [...new Set(initialTrackIds)], sharedId: null, createdAt: Date.now() };
    library.local.push(playlist);
    saveLocalPlaylists();
    return playlist;
  }

  async function editLocalPlaylist(id) {
    const playlist = findLocal(id);
    if (!playlist) return;
    const data = await editPlaylistDialog(playlist);
    if (!data) return;
    Object.assign(playlist, data);
    saveLocalPlaylists();
    renderList();
  }

  function deleteLocalPlaylist(id) {
    const playlist = findLocal(id);
    if (!playlist || !confirm(`¿Eliminar «${playlist.name}» de este dispositivo?`)) return;
    library.local = library.local.filter((p) => p.id !== id);
    saveLocalPlaylists();
    setView('playlists');
    showToast(`«${playlist.name}» eliminada.`);
  }

  function copyToLocal(pl, linkShared = false) {
    const playlist = {
      id: newId(),
      name: linkShared ? pl.name : `${pl.name} (mía)`.slice(0, 60),
      emoji: pl.emoji || '💿',
      color: pl.color || PLAYLIST_COLORS[Math.floor(Math.random() * PLAYLIST_COLORS.length)],
      trackIds: playlistTracksOf(pl).map((t) => t.id),
      sharedId: linkShared ? pl.id : null,
      createdAt: Date.now()
    };
    library.local.push(playlist);
    saveLocalPlaylists();
    openPlaylist(`local:${playlist.id}`);
    showToast(linkShared
      ? 'Copia lista para editar. Cuando termines, pulsa «Actualizar para todos».'
      : `Copiada a tus playlists: «${playlist.name}».`);
  }

  function addToLocal(id, trackId) {
    const playlist = findLocal(id);
    const track = getTrack(trackId);
    if (!playlist || !track) return;
    if (playlist.trackIds.includes(trackId)) {
      showToast(`«${track.title}» ya está en «${playlist.name}».`);
      return;
    }
    playlist.trackIds.push(trackId);
    saveLocalPlaylists();
    showToast(`Añadida a «${playlist.name}»: ${track.title}`);
    if (state.view === 'playlists' || state.openPlaylist === `local:${id}`) renderList();
  }

  function removeFromLocal(id, trackId) {
    const playlist = findLocal(id);
    if (!playlist) return;
    playlist.trackIds = playlist.trackIds.filter((t) => t !== trackId);
    saveLocalPlaylists();
    renderList();
  }

  let addTarget = null;
  function openAddDialog(trackId) {
    const track = getTrack(trackId);
    if (!track) return;
    addTarget = trackId;
    els.addTrackName.textContent = `${track.title} · ${track.artist}`;
    if (!library.local.length) {
      const li = document.createElement('li');
      li.className = 'add-empty';
      li.textContent = 'Aún no tienes playlists propias. Crea una nueva para empezar.';
      els.addList.replaceChildren(li);
    } else {
      els.addList.replaceChildren(...library.local.map((p) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'add-item';
        button.dataset.id = p.id;
        const has = p.trackIds.includes(trackId);
        const emoji = document.createElement('span');
        emoji.className = 'add-emoji';
        emoji.style.background = p.color;
        emoji.textContent = p.emoji;
        const name = document.createElement('span');
        name.className = 'add-name';
        name.textContent = p.name;
        const meta = document.createElement('span');
        meta.className = 'add-meta';
        meta.textContent = has ? 'Ya está aquí' : songsLabel(p.trackIds.length);
        button.disabled = has;
        button.append(emoji, name, meta);
        li.append(button);
        return li;
      }));
    }
    els.addDialog.showModal();
  }

  function exportPlaylists() {
    const data = {
      app: 'LiquidBrush',
      version: 1,
      exportedAt: new Date().toISOString(),
      playlists: library.local,
      favorites: [...state.favorites]
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `liquidbrush-mis-playlists-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast('Copia de seguridad descargada.');
  }

  async function importPlaylists(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.playlists)) throw new Error('Formato no válido');
      let added = 0;
      data.playlists.forEach((p) => {
        if (!p || typeof p.name !== 'string' || !Array.isArray(p.trackIds)) return;
        const duplicate = library.local.some((q) => q.name === p.name && q.trackIds.join() === p.trackIds.join());
        if (duplicate) return;
        library.local.push({
          id: findLocal(p.id) ? newId() : String(p.id || newId()),
          name: p.name.slice(0, 60),
          emoji: typeof p.emoji === 'string' ? p.emoji : '💿',
          color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : PLAYLIST_COLORS[0],
          trackIds: p.trackIds.map(String),
          sharedId: p.sharedId || null,
          createdAt: p.createdAt || Date.now()
        });
        added++;
      });
      if (Array.isArray(data.favorites)) {
        data.favorites.forEach((id) => state.favorites.add(String(id)));
        storage.set(KEYS.favorites, [...state.favorites]);
      }
      saveLocalPlaylists();
      renderList();
      showToast(added ? `Importadas ${added} playlist${added === 1 ? '' : 's'}.` : 'No había playlists nuevas en el archivo.');
    } catch (error) {
      console.warn('[LiquidBrush] No se pudo importar:', error);
      showToast('Ese archivo no es una copia de seguridad de LiquidBrush.');
    }
  }

  /* ---------- Comentarios con marca de tiempo ---------- */
  // Compartidos en Supabase (tabla track_comments): máximo 5 por canción y se reinician
  // cada lunes (UTC). Solo se pueden añadir con la función add_track_comment.
  const COMMENT_LIMIT = 5;
  const COMMENT_REFRESH_MS = 25000;
  const comments = { trackId: null, key: null, list: [], shown: new Set(), lastTime: 0, lastLabel: '', timer: null };

  // Los comentarios son de la canción, no de la copia: la misma canción puede estar en varias
  // fuentes (con ids distintos) y todos deben ver los mismos comentarios.
  function commentKey(track) {
    const slug = (text) => normalize(String(text || '').replace(/\(.*?\)|\[.*?\]/g, ''))
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    const title = slug(track.title) || track.id;
    return `song:${title}~${slug(mainArtist(track))}`.slice(0, 120);
  }
  let bubbleTimer = null;

  function nextCommentReset() {
    const now = new Date();
    const days = ((8 - now.getUTCDay()) % 7) || 7;
    const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days));
    return reset.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  async function loadComments(track, { quiet = false } = {}) {
    const key = commentKey(track);
    if (!quiet) {
      comments.trackId = track.id;
      comments.key = key;
      comments.list = [];
      comments.shown.clear();
      comments.lastTime = 0;
      renderComments();
    }
    try {
      const response = await fetch(
        `${SHARED_DB.url}/rest/v1/track_comments?select=id,at_seconds,body,author&track_id=eq.${encodeURIComponent(key)}&order=at_seconds.asc`,
        { headers: { apikey: SHARED_DB.key }, cache: 'no-store' }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = await response.json();
      if (comments.key !== key) return;
      const changed = rows.length !== comments.list.length || rows.some((r, i) => r.id !== comments.list[i]?.id);
      comments.list = rows;
      if (changed || !quiet) renderComments();
    } catch (error) {
      console.warn('[LiquidBrush] No se pudieron cargar los comentarios.', error);
      if (!quiet && comments.key === key) {
        els.commentsNote.textContent = navigator.onLine
          ? 'No se pudieron cargar los comentarios. Se reintentará en unos segundos.'
          : 'Sin conexión: los comentarios no están disponibles.';
      }
    }
  }

  // Mientras la app está a la vista se buscan comentarios nuevos de otras personas
  function scheduleCommentRefresh() {
    clearInterval(comments.timer);
    comments.timer = setInterval(() => {
      if (document.hidden || !state.currentTrack || !navigator.onLine) return;
      loadComments(state.currentTrack, { quiet: true });
    }, COMMENT_REFRESH_MS);
  }

  function renderCommentMarks() {
    const duration = getDuration();
    els.commentMarks.replaceChildren(...(duration ? comments.list.map((c) => {
      const mark = makeEl('span', 'comment-mark');
      mark.style.left = `${clamp((c.at_seconds / duration) * 100, 0, 100)}%`;
      mark.title = `${formatTime(c.at_seconds)} · ${c.body}`;
      return mark;
    }) : []));
  }

  function renderComments() {
    const count = comments.list.length;
    const full = count >= COMMENT_LIMIT;
    els.commentsCount.textContent = `${count}/${COMMENT_LIMIT}`;
    els.commentsList.replaceChildren(...comments.list.map((c) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'comment-item';
      button.dataset.at = String(c.at_seconds);
      button.setAttribute('aria-label', `Ir a ${formatTime(c.at_seconds)}: ${c.body}`);
      const time = makeEl('span', 'comment-time', formatTime(c.at_seconds));
      const text = makeEl('span', 'comment-text', c.body);
      button.append(time, text);
      if (c.author) button.append(makeEl('span', 'comment-by', c.author));
      li.append(button);
      return li;
    }));
    if (!count) els.commentsList.append(makeEl('li', 'comments-empty', state.currentTrack
      ? 'Nadie ha comentado esta canción esta semana. ¡Sé el primero!'
      : 'Elige una canción para ver sus comentarios.'));
    const disabled = full || !state.currentTrack;
    els.commentText.disabled = disabled;
    els.commentSubmit.disabled = disabled;
    els.commentsNote.textContent = full
      ? `Esta canción ya tiene ${COMMENT_LIMIT} comentarios esta semana. Se reinician el ${nextCommentReset()}.`
      : `Máximo ${COMMENT_LIMIT} por canción. Todos se reinician cada semana (el próximo ${nextCommentReset()}).`;
    renderCommentMarks();
  }

  function updateCommentButton(time) {
    const label = `En ${formatTime(time)}`;
    if (label !== comments.lastLabel) {
      comments.lastLabel = label;
      els.commentSubmit.textContent = label;
    }
  }

  // Muestra el comentario cuando la canción pasa por su segundo
  function checkCommentBubble(time) {
    const previous = comments.lastTime;
    comments.lastTime = time;
    if (time < previous || time - previous > 2) return;
    const hit = comments.list.find((c) => c.at_seconds > previous && c.at_seconds <= time && !comments.shown.has(c.id));
    if (!hit) return;
    comments.shown.add(hit.id);
    els.commentBubble.textContent = `💬 ${formatTime(hit.at_seconds)} · ${hit.body}${hit.author ? ` — ${hit.author}` : ''}`;
    els.commentBubble.hidden = false;
    els.commentBubble.classList.add('is-visible');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      els.commentBubble.classList.remove('is-visible');
      setTimeout(() => { els.commentBubble.hidden = true; }, 300);
    }, 4500);
  }

  async function submitComment() {
    const track = state.currentTrack;
    const body = els.commentText.value.trim();
    if (!track || !body) return;
    const author = els.commentAuthor.value.trim().slice(0, 24);
    storage.set(KEYS.author, author);
    els.commentSubmit.disabled = true;
    try {
      const row = await supabaseRpc('add_track_comment', {
        p_track_id: commentKey(track),
        p_at: Math.floor(els.audio.currentTime || 0),
        p_body: body,
        p_author: author
      });
      if (comments.key === commentKey(track) && row) {
        comments.list = [...comments.list, row].sort((a, b) => a.at_seconds - b.at_seconds);
        comments.shown.add(row.id);
      }
      els.commentText.value = '';
      showToast(`Comentario publicado en ${formatTime(row?.at_seconds || 0)}.`);
    } catch (error) {
      if (error.message === 'limite_comentarios') {
        showToast(`Esta canción ya llegó a ${COMMENT_LIMIT} comentarios esta semana.`);
        loadComments(track);
        return;
      }
      showToast(error.message === 'demasiados_comentarios'
        ? 'Hay muchos comentarios ahora mismo. Prueba en un minuto.'
        : navigator.onLine ? 'No se pudo publicar el comentario.' : 'Sin conexión: no se puede comentar.');
    } finally {
      renderComments();
    }
  }

  /* ---------- Transiciones DJ ---------- */
  // Dos reproductores: al final de cada canción la siguiente entra por el otro y se mezclan
  // con una curva de potencia constante. "Inteligente": la mezcla se acorta en canciones
  // cortas, no se usa con «repetir una» y al saltar a mano es un fundido rápido.
  const decks = [els.audio, els.audio2];
  const dj = { enabled: false, fade: 6, transitioning: false, timer: null, outgoing: null };
  const deckGain = new Map(decks.map((deck) => [deck, 1]));

  function applyVolume(deck) {
    deck.volume = clamp(state.volume * (deckGain.get(deck) ?? 1), 0, 1);
  }

  const otherDeck = (deck) => (deck === decks[0] ? decks[1] : decks[0]);
  // En iOS el volumen no se puede cambiar desde la web: en vez de mezcla larga, un empalme corto
  const smartFade = (duration) => (IS_IOS ? 1 : Math.max(1.5, Math.min(dj.fade, duration * 0.1)));

  function releaseDeck(deck) {
    deck.pause();
    deck.removeAttribute('src');
    deck.load();
    deckGain.set(deck, 1);
    applyVolume(deck);
  }

  function finishCrossfade() {
    clearInterval(dj.timer);
    dj.timer = null;
    if (dj.outgoing && dj.outgoing !== els.audio) releaseDeck(dj.outgoing);
    dj.outgoing = null;
    deckGain.set(els.audio, 1);
    applyVolume(els.audio);
  }

  function startCrossfade(outgoing, incoming, seconds) {
    if (dj.timer) finishCrossfade();
    dj.outgoing = outgoing;
    const startGain = deckGain.get(outgoing) ?? 1;
    deckGain.set(incoming, 0);
    applyVolume(incoming);
    const start = performance.now();
    dj.timer = setInterval(() => {
      const p = clamp((performance.now() - start) / (seconds * 1000), 0, 1);
      deckGain.set(incoming, Math.sin((p * Math.PI) / 2));
      deckGain.set(outgoing, Math.cos((p * Math.PI) / 2) * startGain);
      applyVolume(incoming);
      applyVolume(outgoing);
      if (p >= 1) finishCrossfade();
    }, 50);
  }

  // Elige el reproductor para la siguiente canción y, si toca, empieza la mezcla
  function prepareDeck(autoplay, fade) {
    const outgoing = els.audio;
    const mixing = dj.enabled && fade > 0 && autoplay && !outgoing.paused && Boolean(outgoing.getAttribute('src'));
    dj.transitioning = false;
    if (mixing) {
      els.audio = otherDeck(outgoing);
      els.audio.muted = outgoing.muted;
      startCrossfade(outgoing, els.audio, fade);
    } else {
      if (dj.timer) finishCrossfade();
      const idle = otherDeck(els.audio);
      if (idle.getAttribute('src')) releaseDeck(idle);
    }
  }

  function checkDjTransition() {
    const audio = els.audio;
    if (!dj.enabled || dj.transitioning || audio.paused || state.repeat === 'one') return;
    const duration = audio.duration;
    if (!Number.isFinite(duration) || duration < 45) return;
    const fade = smartFade(duration);
    if (duration - audio.currentTime <= fade) {
      dj.transitioning = true;
      next(false, fade);
    }
  }

  function setDj(enabled, announce = true) {
    dj.enabled = enabled;
    storage.set(KEYS.dj, enabled);
    els.djToggle.checked = enabled;
    els.djBtn.classList.toggle('is-active', enabled);
    els.djBtn.setAttribute('aria-pressed', String(enabled));
    els.djFade.disabled = !enabled;
    if (!enabled && dj.timer) finishCrossfade();
    if (announce) showToast(enabled ? `Transiciones DJ activadas (mezcla de ${dj.fade} s)` : 'Transiciones DJ desactivadas');
  }

  /* ---------- Registro de escucha (para Stats) ---------- */
  // Por día: segundos por canción (s), reproducciones (p) y segundos por hora (h). Solo en este navegador.
  const LISTEN_DAYS = 400;
  const listen = { log: {}, pending: 0, pendingId: null, lastPos: null, dirty: false };

  const dayKey = (date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  function dayEntry(key = dayKey()) {
    if (!listen.log[key]) listen.log[key] = { s: {}, p: {}, h: new Array(24).fill(0) };
    return listen.log[key];
  }

  function trackListening(time) {
    const id = state.currentTrack?.id;
    if (!id) return;
    if (listen.pendingId !== id) {
      flushListening();
      listen.pendingId = id;
      listen.lastPos = time;
      return;
    }
    const delta = time - (listen.lastPos ?? time);
    listen.lastPos = time;
    if (delta > 0 && delta < 3 && !els.audio.paused) listen.pending += delta;
    if (listen.pending >= 30) flushListening();
  }

  function flushListening() {
    if (listen.pendingId && listen.pending > 0) {
      const entry = dayEntry();
      entry.s[listen.pendingId] = Math.round((entry.s[listen.pendingId] || 0) + listen.pending);
      entry.h[new Date().getHours()] = Math.round(entry.h[new Date().getHours()] + listen.pending);
      listen.pending = 0;
      listen.dirty = true;
    }
    if (listen.dirty) saveListening();
  }

  function countPlayInLog(id) {
    const entry = dayEntry();
    entry.p[id] = (entry.p[id] || 0) + 1;
    listen.dirty = true;
    saveListening();
  }

  function saveListening() {
    const keys = Object.keys(listen.log).sort();
    keys.slice(0, Math.max(0, keys.length - LISTEN_DAYS)).forEach((key) => { delete listen.log[key]; });
    storage.set(KEYS.listen, listen.log);
    listen.dirty = false;
  }

  /* ---------- Stats: hábitos de escucha del mes ---------- */
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

  function monthInfo(offset) {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const keys = Array.from({ length: days }, (_, i) => dayKey(new Date(first.getFullYear(), first.getMonth(), i + 1)));
    return { keys, label: `${MONTHS[first.getMonth()]} ${first.getFullYear()}`, year: first.getFullYear(), month: first.getMonth() };
  }

  // Artista principal (sin "ft." ni colaboradores) para agrupar
  const mainArtist = (track) => (track?.knownArtist || '')
    .replace(/\s*\b(ft|feat|featuring)\b\.?.*$/i, '')
    .split(/,| x | & | y /i)[0].trim();

  function aggregate(keys) {
    const result = { seconds: 0, plays: 0, perDay: [], hours: new Array(24).fill(0), weekdays: new Array(7).fill(0),
      tracks: new Map(), artists: new Map(), genres: new Map() };
    keys.forEach((key) => {
      const entry = listen.log[key];
      let daySeconds = 0;
      if (entry) {
        Object.entries(entry.s || {}).forEach(([id, secs]) => {
          daySeconds += secs;
          result.tracks.set(id, (result.tracks.get(id) || 0) + secs);
          const track = getTrack(id);
          const artist = mainArtist(track);
          if (artist) result.artists.set(artist, (result.artists.get(artist) || 0) + secs);
          const genre = track?.genre || 'Sin género';
          result.genres.set(genre, (result.genres.get(genre) || 0) + secs);
        });
        Object.values(entry.p || {}).forEach((n) => { result.plays += n; });
        (entry.h || []).forEach((secs, hour) => { result.hours[hour] += secs || 0; });
      }
      const [y, m, d] = key.split('-').map(Number);
      result.weekdays[new Date(y, m - 1, d).getDay()] += daySeconds;
      result.perDay.push({ key, day: Number(key.slice(8)), seconds: daySeconds });
      result.seconds += daySeconds;
    });
    return result;
  }

  const minutesLabel = (secs) => {
    const minutes = Math.round(secs / 60);
    return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  };
  const topOf = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  function statTile(value, label) {
    const tile = makeEl('div', 'stat-tile');
    tile.append(makeEl('span', 'stat-value', value), makeEl('span', 'stat-label', label));
    return tile;
  }

  function statCard(title, subtitle) {
    const card = makeEl('section', 'stat-card');
    card.append(makeEl('h3', 'stat-title', title));
    if (subtitle) card.append(makeEl('p', 'stat-sub', subtitle));
    return card;
  }

  // Barras verticales de una sola serie; el valor sale al pasar el cursor o tocar la barra
  function columnChart(values, labelFor, tipFor, tickEvery) {
    const max = Math.max(...values, 1);
    const chart = makeEl('div', 'col-chart');
    chart.setAttribute('role', 'img');
    const bars = makeEl('div', 'col-bars');
    values.forEach((value, i) => {
      const col = makeEl('span', 'col');
      col.tabIndex = 0;
      col.dataset.tip = tipFor(value, i);
      col.setAttribute('aria-label', col.dataset.tip);
      const bar = makeEl('span', 'col-bar');
      bar.style.height = value ? `${Math.max(3, (value / max) * 100)}%` : '0';
      col.append(bar);
      bars.append(col);
    });
    const axis = makeEl('div', 'col-axis');
    values.forEach((_, i) => axis.append(makeEl('span', '', i % tickEvery === 0 ? labelFor(i) : '')));
    chart.append(bars, axis);
    return chart;
  }

  // Barras horizontales con etiqueta y valor en texto (se leen sin depender del color)
  function barList(rows, action) {
    const max = Math.max(...rows.map((r) => r.value), 1);
    const list = makeEl('ol', 'bar-list');
    rows.forEach((row) => {
      const li = document.createElement('li');
      const el = action ? document.createElement('button') : makeEl('div');
      if (action) {
        el.type = 'button';
        el.dataset.action = action;
        el.dataset.value = row.key;
      }
      el.className = 'bar-row';
      el.title = row.tip || '';
      const label = makeEl('span', 'bar-label', row.label);
      const track = makeEl('span', 'bar-track');
      const fill = makeEl('span', 'bar-fill');
      fill.style.width = `${Math.max(2, (row.value / max) * 100)}%`;
      track.append(fill);
      el.append(label, track, makeEl('span', 'bar-value', row.text));
      li.append(el);
      list.append(li);
    });
    return list;
  }

  function renderStats() {
    flushListening();
    const info = monthInfo(state.statsOffset);
    const current = aggregate(info.keys);
    const previous = aggregate(monthInfo(state.statsOffset - 1).keys);
    const panel = els.statsPanel;

    if (current.seconds < 60) {
      panel.replaceChildren(makeEl('p', 'list-empty', state.statsOffset === 0
        ? 'Todavía no hay suficiente música este mes. Escucha un rato y vuelve: aquí verás tus minutos, géneros y artistas.'
        : `No hay registros de ${info.label}.`));
      return;
    }

    const activeDays = current.perDay.filter((d) => d.seconds >= 60);
    let streak = 0;
    let run = 0;
    current.perDay.forEach((d) => {
      run = d.seconds >= 60 ? run + 1 : 0;
      streak = Math.max(streak, run);
    });
    const topHour = current.hours.indexOf(Math.max(...current.hours));
    const topWeekday = current.weekdays.indexOf(Math.max(...current.weekdays));

    const tiles = makeEl('div', 'stat-tiles');
    tiles.append(
      statTile(minutesLabel(current.seconds), 'escuchados'),
      statTile(String(current.plays), 'reproducciones'),
      statTile(String(current.tracks.size), 'canciones distintas'),
      statTile(String(current.artists.size), 'artistas'),
      statTile(`${streak} día${streak === 1 ? '' : 's'}`, 'racha más larga'),
      statTile(`${String(topHour).padStart(2, '0')}:00`, `tu hora · más los ${WEEKDAYS[topWeekday]}`)
    );

    const daily = statCard('Minutos por día', `${activeDays.length} de ${info.keys.length} días con música`);
    daily.append(columnChart(
      current.perDay.map((d) => d.seconds / 60),
      (i) => String(i + 1),
      (v, i) => `${i + 1} de ${info.label.split(' ')[0]}: ${Math.round(v)} min`,
      5
    ));

    const hours = statCard('¿A qué hora escuchas?', 'Minutos por hora del día');
    hours.append(columnChart(
      current.hours.map((s) => s / 60),
      (i) => `${i}h`,
      (v, i) => `${String(i).padStart(2, '0')}:00 – ${String(i).padStart(2, '0')}:59: ${Math.round(v)} min`,
      6
    ));

    const genres = statCard('Géneros más escuchados');
    genres.append(barList(topOf(current.genres, 6).map(([name, secs]) => ({
      key: name, label: name, value: secs,
      text: `${Math.round((secs / current.seconds) * 100)} %`, tip: minutesLabel(secs)
    })), 'stats-genre'));

    const artists = statCard('Artistas del mes', 'Toca uno para ver sus canciones');
    artists.append(barList(topOf(current.artists, 8).map(([name, secs]) => ({
      key: name, label: name, value: secs, text: minutesLabel(secs)
    })), 'stats-artist'));

    // Tendencia personal: quién ganó más peso frente al mes anterior
    const trending = [...current.artists.entries()]
      .filter(([, secs]) => secs >= 120)
      .map(([name, secs]) => {
        const before = previous.artists.get(name) || 0;
        const delta = secs / current.seconds - (previous.seconds ? before / previous.seconds : 0);
        return { name, secs, before, delta };
      })
      .filter((a) => a.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);
    const trend = statCard('En tendencia para ti', 'Los que más subieron frente al mes anterior');
    if (trending.length) {
      const list = makeEl('ol', 'trend-list');
      trending.forEach((a) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'trend-row';
        button.dataset.action = 'stats-artist';
        button.dataset.value = a.name;
        button.append(
          makeEl('span', 'trend-name', a.name),
          makeEl('span', a.before ? 'trend-up' : 'trend-new', a.before ? `▲ +${Math.round(a.delta * 100)} pts` : 'Nuevo'),
          makeEl('span', 'trend-time', minutesLabel(a.secs))
        );
        li.append(button);
        list.append(li);
      });
      trend.append(list);
    } else {
      trend.append(makeEl('p', 'stat-sub', 'Sigue escuchando: cuando alguien suba posiciones aparecerá aquí.'));
    }

    const songs = statCard('Canciones del mes');
    const songList = makeEl('ol', 'top-songs');
    topOf(current.tracks, 5).forEach(([id, secs]) => {
      const track = getTrack(id);
      if (!track) return;
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'top-song';
      button.dataset.action = 'stats-play';
      button.dataset.value = id;
      const img = document.createElement('img');
      img.src = track.cover;
      img.alt = '';
      img.width = 40;
      img.height = 40;
      const text = makeEl('span', 'top-song-text');
      text.append(makeEl('span', 'top-song-title', track.title), makeEl('span', 'top-song-meta', `${track.knownArtist || track.genre || ''} · ${minutesLabel(secs)}`));
      button.append(img, text);
      li.append(button);
      songList.append(li);
    });
    songs.append(songList);

    const grid = makeEl('div', 'stat-grid');
    grid.append(daily, hours, genres, artists, trend, songs);
    panel.replaceChildren(tiles, grid, makeEl('p', 'pl-note', 'Tus estadísticas se calculan y guardan solo en este dispositivo.'));
  }

  /* ---------- Vistas: Biblioteca, Playlists y Favoritas ---------- */
  function sortTracks(list) {
    const sorted = list.slice();
    // "¡fuensanta!" o "#OBSSECHUGG" se ordenan por su primera letra
    const sortKey = (text) => text.replace(/^[^\p{L}\p{N}]+/u, '');
    const byTitle = (a, b) => collator.compare(sortKey(a.title), sortKey(b.title));
    switch (state.sort) {
      case 'title': return sorted.sort(byTitle);
      case 'artist': return sorted.sort((a, b) => {
        if (!a.knownArtist !== !b.knownArtist) return a.knownArtist ? -1 : 1;
        return collator.compare(a.knownArtist, b.knownArtist) || byTitle(a, b);
      });
      case 'genre': return sorted.sort((a, b) => collator.compare(a.genre || '~', b.genre || '~') || byTitle(a, b));
      case 'long': return sorted.sort((a, b) => parseDuration(b.duration) - parseDuration(a.duration));
      case 'short': return sorted.sort((a, b) => parseDuration(a.duration) - parseDuration(b.duration));
      default: return sorted;
    }
  }

  function baseTracks() {
    if (state.view === 'favorites') return state.tracks.filter((t) => state.favorites.has(t.id));
    if (state.view === 'playlist') return playlistTracksOf(getPlaylist(state.openPlaylist));
    return sortTracks(state.libraryTracks);
  }

  function getVisibleTracks() {
    const q = normalize(state.query);
    const list = baseTracks();
    if (!q) return list;
    return list.filter((track) => [track.title, track.artist, track.album, track.genre].some((field) => normalize(field).includes(q)));
  }

  function makeButton(className, action, label, icon, text = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.action = action;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-${icon}"></use></svg>`;
    if (text) {
      const span = document.createElement('span');
      span.textContent = text;
      button.append(span);
    }
    return button;
  }

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function playlistCover(pl, size) {
    const tracks = playlistTracksOf(pl);
    // Tarjetas: miniatura de 320 px; la cabecera de la playlist usa la imagen grande
    const src = pl.cover?.type === 'image' ? (size <= 160 ? pl.cover.src.replace(/\.jpg$/, '-sm.jpg') : pl.cover.src)
      : pl.cover?.type === 'art' ? coverArt(pl)
      : pl.kind === 'system' ? tracks[0]?.cover : '';
    if (src) {
      const img = document.createElement('img');
      img.className = 'pl-cover';
      img.src = src;
      img.alt = '';
      img.width = size;
      img.height = size;
      img.loading = 'lazy';
      return img;
    }
    const cover = makeEl('span', 'pl-cover pl-cover-emoji', pl.emoji || '💿');
    cover.style.setProperty('--pl-color', pl.color || PLAYLIST_COLORS[0]);
    cover.setAttribute('aria-hidden', 'true');
    return cover;
  }

  const KIND_LABELS = {
    system: 'Playlist de LiquidBrush',
    shared: 'Guardada para todos',
    local: 'Solo en este dispositivo',
    auto: 'Automática'
  };

  function renderViewHead() {
    const head = els.viewHead;
    const searching = Boolean(normalize(state.query));
    head.className = 'view-head';

    if (state.view === 'playlist') {
      head.replaceChildren(renderPlaylistHead(getPlaylist(state.openPlaylist)));
      return;
    }

    const titles = {
      library: ['Toda tu música', 'Biblioteca'],
      playlists: searching ? ['Buscando en la biblioteca', 'Resultados'] : ['Oficiales, compartidas y tuyas', 'Playlists'],
      favorites: ['Tus corazones', 'Favoritas'],
      stats: [monthInfo(state.statsOffset).label, 'Tus estadísticas']
    };
    const [eyebrow, title] = titles[state.view];
    const text = makeEl('div', 'view-text');
    text.append(makeEl('p', 'view-eyebrow', eyebrow), makeEl('h2', 'view-title', title));

    const actions = makeEl('div', 'view-actions');
    if (state.view === 'stats') {
      const prevMonth = makeButton('icon-btn', 'stats-prev', 'Mes anterior', 'back');
      const nextMonth = makeButton('icon-btn stats-next', 'stats-next', 'Mes siguiente', 'back');
      nextMonth.disabled = state.statsOffset >= 0;
      actions.append(prevMonth, nextMonth);
    } else if (state.view === 'playlists' && !searching) {
      actions.append(
        makeButton('btn btn-primary', 'new-playlist', 'Crear una playlist nueva', 'playlist-add', 'Nueva'),
        makeButton('icon-btn', 'import', 'Importar una copia de seguridad', 'upload'),
        makeButton('icon-btn', 'export', 'Descargar una copia de seguridad de tus playlists', 'download')
      );
    } else {
      actions.append(
        makeButton('icon-btn play-btn view-play', 'play-view', 'Reproducir todo', 'play'),
        makeButton('icon-btn', 'shuffle-view', 'Reproducir en aleatorio', 'shuffle')
      );
      if (state.view === 'library') {
        const label = makeEl('label', 'sort');
        const select = document.createElement('select');
        select.id = 'sortSelect';
        select.setAttribute('aria-label', 'Ordenar la biblioteca');
        Object.entries(SORTS).forEach(([value, name]) => select.append(new Option(name, value, false, value === state.sort)));
        label.append(select);
        actions.append(label);
      }
    }
    head.replaceChildren(text, actions);
  }

  function renderPlaylistHead(pl) {
    const wrap = makeEl('div', 'pl-detail');
    const back = makeButton('btn btn-ghost pl-back', 'back', 'Volver a Playlists', 'back', 'Playlists');
    if (!pl) {
      wrap.append(back, makeEl('p', 'list-empty', 'Esta playlist ya no existe.'));
      return wrap;
    }
    const tracks = playlistTracksOf(pl);
    const total = tracks.reduce((sum, t) => sum + parseDuration(t.duration), 0);

    const header = makeEl('div', 'pl-hero');
    header.dataset.key = pl.key;
    header.style.setProperty('--pl-color', pl.color || 'var(--accent)');
    const text = makeEl('div', 'pl-hero-text');
    const meta = makeEl('span', 'playlist-meta');
    meta.dataset.base = `${songsLabel(tracks.length)} · ${formatTotal(total)}`;
    meta.textContent = meta.dataset.base;
    text.append(makeEl('span', `pl-kind pl-kind-${pl.kind}`, KIND_LABELS[pl.kind]), makeEl('h2', 'pl-hero-name', pl.name));
    if (pl.description) text.append(makeEl('p', 'pl-hero-desc', pl.description));
    text.append(meta);
    header.append(playlistCover(pl, 112), text);

    const actions = makeEl('div', 'pl-actions');
    actions.append(
      makeButton('icon-btn play-btn view-play', 'play-view', `Reproducir ${pl.name}`, 'play'),
      makeButton('icon-btn', 'shuffle-view', 'Reproducir en aleatorio', 'shuffle')
    );
    if (offline.supported && tracks.length) actions.append(makeButton('icon-btn playlist-download', 'download-playlist', 'Descargar', 'download'));
    if (pl.kind === 'local') {
      actions.append(
        makeButton('btn btn-primary', 'share-playlist', 'Guardar para todos con la KeyForSet', 'key', pl.sharedId ? 'Actualizar para todos' : 'Guardar para todos'),
        makeButton('icon-btn', 'edit-playlist', 'Cambiar nombre, icono o color', 'edit'),
        makeButton('icon-btn', 'delete-playlist', 'Eliminar de este dispositivo', 'delete')
      );
    } else if (pl.kind === 'shared') {
      actions.append(
        makeButton('btn', 'copy-shared', 'Hacer una copia para editarla', 'edit', 'Editar'),
        makeButton('icon-btn', 'copy-playlist', 'Copiar a mis playlists', 'playlist-add'),
        makeButton('icon-btn', 'delete-shared', 'Eliminar para todos (pide la KeyForSet)', 'delete')
      );
    } else {
      actions.append(makeButton('btn', 'copy-playlist', 'Copiar a mis playlists', 'playlist-add', 'Copiar a mis playlists'));
      if (pl.key === 'auto:recent' && tracks.length) actions.append(makeButton('icon-btn', 'clear-recent', 'Borrar el historial', 'delete'));
    }
    wrap.append(back, header, actions);

    if (pl.kind === 'local') {
      wrap.append(makeEl('p', 'pl-note', pl.sharedId
        ? 'Copia temporal de una playlist guardada para todos. Pulsa «Actualizar para todos» (pide la KeyForSet) para publicar tus cambios.'
        : 'Esta playlist vive solo en este navegador: si borras la caché o los datos del sitio, se pierde. Pulsa «Guardar para todos» (pide la KeyForSet) para guardarla en la base de datos, o descarga una copia de seguridad desde Playlists.'));
    }
    return wrap;
  }

  function createPlaylistCard(pl) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `pl-card pl-card-${pl.kind}`;
    card.dataset.action = 'open-playlist';
    card.dataset.key = pl.key;
    const count = playlistTracksOf(pl).length;
    card.setAttribute('aria-label', `${pl.name}, ${songsLabel(count)}`);
    const text = makeEl('span', 'pl-card-text');
    text.append(makeEl('span', 'pl-card-name', pl.name));
    if (pl.description) text.append(makeEl('span', 'pl-card-desc', pl.description));
    text.append(makeEl('span', 'pl-card-meta', songsLabel(count)));
    card.append(playlistCover(pl, 160), text);
    if (pl.kind === 'shared') card.append(makeEl('span', 'pl-badge', 'Para todos'));
    if (pl.sharedId) card.append(makeEl('span', 'pl-badge', 'Editando'));
    return card;
  }

  function renderPlaylistGrid() {
    const section = (title, note, playlists, extra) => {
      const wrap = makeEl('section', 'pl-section');
      wrap.append(makeEl('h3', 'pl-section-title', title));
      if (note) wrap.append(makeEl('p', 'pl-note', note));
      const grid = makeEl('div', 'pl-grid');
      playlists.forEach((pl) => grid.append(createPlaylistCard(pl)));
      if (extra) grid.append(extra);
      wrap.append(grid);
      return wrap;
    };
    const newCard = makeButton('pl-card pl-card-new', 'new-playlist', 'Crear una playlist nueva', 'playlist-add', 'Nueva playlist');
    const autos = autoPlaylists().filter((pl) => pl.trackIds.some((id) => state.trackMap.has(id)));

    const parts = [
      section('Playlists de LiquidBrush', '', [...systemPlaylists(), ...sharedPlaylists()]),
      section('Mis playlists', 'Se guardan solo en este navegador. Si borras la caché o los datos del sitio, se perderán: guárdalas para todos con la KeyForSet o descarga una copia de seguridad (botón ⬇ de arriba).', localPlaylists(), newCard)
    ];
    if (autos.length) parts.push(section('Para ti', '', autos));
    els.playlistGrid.replaceChildren(...parts);
  }

  function updateCounts() {
    els.libCount.textContent = String(state.libraryTracks.length);
    els.plCount.textContent = String(systemPlaylists().length + library.shared.length + library.local.length);
    updateFavCount();
  }

  function renderList() {
    const searching = Boolean(normalize(state.query));
    renderViewHead();
    const showStats = state.view === 'stats';
    const showGrid = state.view === 'playlists' && !searching;
    els.playlistGrid.hidden = !showGrid;
    els.statsPanel.hidden = !showStats;
    els.trackList.hidden = showGrid || showStats;
    updateCounts();

    if (showStats) {
      renderStats();
      els.trackList.replaceChildren();
      els.listInfo.textContent = '';
      return;
    }

    if (showGrid) {
      renderPlaylistGrid();
      els.trackList.replaceChildren();
      els.listInfo.textContent = '';
      return;
    }

    const visible = getVisibleTracks();
    const pl = state.view === 'playlist' ? getPlaylist(state.openPlaylist) : null;
    const removable = pl?.kind === 'local';
    const fragment = document.createDocumentFragment();
    // Solo se pintan las primeras filas; el resto se añade al acercarse al final (listas de 1000+)
    list.items = visible;
    list.removable = removable;
    list.rendered = 0;

    if (!visible.length) {
      const li = makeEl('li', 'list-empty');
      if (!state.tracks.length) li.textContent = 'La biblioteca está vacía por ahora.';
      else if (searching) li.textContent = 'No se encontraron canciones.';
      else if (state.view === 'favorites') li.textContent = 'Aún no tienes favoritas. Pulsa el ♥ de una canción para guardarla aquí.';
      else if (pl?.kind === 'local') li.textContent = 'Playlist vacía. Pulsa el ＋ de cualquier canción en la Biblioteca para añadirla aquí.';
      else li.textContent = 'Todavía no hay canciones aquí.';
      fragment.appendChild(li);
    }
    els.trackList.replaceChildren(fragment);
    if (visible.length) appendListChunk(LIST_FIRST_CHUNK);

    const total = visible.length;
    const seconds = visible.reduce((sum, t) => sum + parseDuration(t.duration), 0);
    els.listInfo.textContent = searching
      ? `${total} resultado${total === 1 ? '' : 's'} para «${state.query.trim()}»`
      : state.view === 'playlist' ? '' : `${songsLabel(total)} · ${formatTotal(seconds)}`;
    updateDownloadUI();
  }

  const LIST_FIRST_CHUNK = 40;
  const LIST_CHUNK = 80;
  const list = { items: [], rendered: 0, removable: false, sentinel: null, observer: null };

  function appendListChunk(size = LIST_CHUNK) {
    const end = Math.min(list.items.length, list.rendered + size);
    const fragment = document.createDocumentFragment();
    for (let i = list.rendered; i < end; i++) fragment.appendChild(createTrackItem(list.items[i], i, list.removable));
    list.rendered = end;
    if (!list.sentinel) {
      list.sentinel = makeEl('li', 'list-sentinel');
      list.sentinel.setAttribute('aria-hidden', 'true');
      list.observer = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        // Sigue añadiendo mientras el final esté cerca de la pantalla
        const fill = () => {
          if (list.rendered >= list.items.length || !list.sentinel.isConnected) return;
          appendListChunk();
          if (list.sentinel.getBoundingClientRect().top < window.innerHeight + 1500) requestAnimationFrame(fill);
        };
        fill();
      }, { rootMargin: '0px 0px 1500px 0px' });
    }
    els.trackList.insertBefore(fragment, list.sentinel.isConnected ? list.sentinel : null);
    if (list.rendered < list.items.length) {
      if (!list.sentinel.isConnected) els.trackList.append(list.sentinel);
      list.observer.observe(list.sentinel);
    } else {
      list.observer.unobserve(list.sentinel);
      list.sentinel.remove();
    }
  }

  function setView(view) {
    state.view = view;
    if (view !== 'playlist') state.openPlaylist = null;
    if (VIEWS.includes(view)) storage.set(KEYS.view, view);
    const tabView = view === 'playlist' ? 'playlists' : view;
    els.tabsBar.querySelectorAll('.tab').forEach((tab) => {
      const active = tab.dataset.view === tabView;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    renderList();
  }

  function openPlaylist(key) {
    state.openPlaylist = key;
    setView('playlist');
    els.trackList.closest('.library').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function playTracks(list, shuffle = false) {
    const playable = list.filter(isPlayable);
    if (!playable.length) {
      showToast(navigator.onLine ? 'No hay canciones para reproducir.' : 'Sin conexión: descarga la playlist (⬇) para escucharla offline.');
      return;
    }
    if (shuffle && !state.shuffle) toggleShuffle();
    const start = shuffle ? playable[Math.floor(Math.random() * playable.length)] : playable[0];
    buildQueue(start.id);
    loadTrack(getTrack(state.queue[state.queueIndex]), true, dj.enabled ? 1.5 : 0);
  }

  function formatTotal(seconds) {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }

  function createTrackItem(track, index, removable = false) {
    const li = document.createElement('li');
    li.className = 'track';
    li.dataset.id = track.id;
    if (state.currentTrack?.id === track.id) li.classList.add('is-current');
    if (isDownloaded(track)) li.classList.add('is-downloaded');

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'track-main';
    main.dataset.action = 'play';
    main.setAttribute('aria-label', `Reproducir ${track.title} de ${track.artist}`);

    const num = document.createElement('span');
    num.className = 'track-num';
    const indexEl = document.createElement('span');
    indexEl.className = 'track-index';
    indexEl.textContent = String(index + 1);
    const eq = document.createElement('span');
    eq.className = 'eq';
    eq.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) eq.appendChild(document.createElement('span'));
    num.append(indexEl, eq);

    const img = document.createElement('img');
    img.className = 'track-cover';
    img.src = track.cover;
    img.alt = '';
    img.loading = 'lazy';
    img.width = 46;
    img.height = 46;
    img.addEventListener('error', () => { img.src = PLACEHOLDER_COVER; }, { once: true });

    const text = document.createElement('span');
    text.className = 'track-text';
    const title = document.createElement('span');
    title.className = 'track-title';
    title.style.display = 'block';
    title.textContent = track.title;
    const artist = document.createElement('span');
    artist.className = 'track-artist';
    artist.style.display = 'block';
    // En la Biblioteca se indica de qué playlist viene cada canción
    // En la Biblioteca se indica el género de cada canción
    const tag = track.genre || track.album;
    artist.textContent = track.knownArtist && tag && state.view !== 'playlist'
      ? `${track.knownArtist} · ${tag}`
      : track.knownArtist || tag || track.artist;
    artist.insertAdjacentHTML('afterbegin', '<svg class="icon track-offline" aria-hidden="true"><use href="#i-download-done"></use></svg>');
    text.append(title, artist);

    main.append(num, img, text);

    const actions = document.createElement('span');
    actions.className = 'track-actions';
    actions.append(removable
      ? makeButton('icon-btn track-remove', 'remove', `Quitar ${track.title} de esta playlist`, 'close')
      : makeButton('icon-btn track-add', 'add', `Añadir ${track.title} a una playlist`, 'playlist-add'));

    const fav = document.createElement('button');
    fav.type = 'button';
    fav.className = 'icon-btn fav-btn';
    fav.dataset.action = 'fav';
    fav.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-heart"></use></svg>';
    updateFavButton(fav, state.favorites.has(track.id));
    actions.append(fav);

    const duration = document.createElement('span');
    duration.className = 'track-duration';
    duration.textContent = track.duration || '--:--';

    li.append(main, actions, duration);
    return li;
  }

  function highlightCurrent() {
    const currentId = state.currentTrack?.id;
    els.trackList.querySelectorAll('.track').forEach((li) => {
      li.classList.toggle('is-current', li.dataset.id === currentId);
    });
  }

  /* ---------- Favoritos ---------- */
  function updateFavButton(button, isFav) {
    button.classList.toggle('is-active', isFav);
    button.setAttribute('aria-pressed', String(isFav));
    button.setAttribute('aria-label', isFav ? 'Quitar de favoritos' : 'Añadir a favoritos');
    button.title = isFav ? 'Quitar de favoritos' : 'Añadir a favoritos';
    setIcon(button, isFav ? 'heart-fill' : 'heart');
  }

  function updateFavCount() {
    let count = 0;
    state.favorites.forEach((id) => { if (state.trackMap.has(id)) count++; });
    els.favCount.textContent = String(count);
  }

  function toggleFavorite(id) {
    const track = getTrack(id);
    if (!track) return;
    const added = !state.favorites.has(id);
    if (added) state.favorites.add(id);
    else state.favorites.delete(id);
    storage.set(KEYS.favorites, [...state.favorites]);

    if (state.view === 'favorites') {
      renderList();
    } else {
      const button = els.trackList.querySelector(`.track[data-id="${CSS.escape(id)}"] .fav-btn`);
      if (button) updateFavButton(button, added);
      updateFavCount();
    }
    if (state.currentTrack?.id === id) updateFavButton(els.npFavBtn, added);

    showToast(added ? `♥ Añadida a favoritas: ${track.title}` : `Quitada de favoritas: ${track.title}`);
  }

  /* ---------- Cola de reproducción ---------- */
  function describeContext(start) {
    if (state.query.trim()) return `Búsqueda: «${state.query.trim()}»`;
    if (state.view === 'favorites') return 'Reproduciendo desde Favoritas';
    if (state.view === 'playlist') {
      const pl = getPlaylist(state.openPlaylist);
      if (pl) return `Playlist · ${pl.name}`;
    }
    return 'Reproduciendo desde tu Biblioteca';
  }

  function buildQueue(startId) {
    const start = getTrack(startId);
    // La cola es la lista que se está viendo (Biblioteca ordenada, una playlist, Favoritas…)
    let candidates = getVisibleTracks();
    if (!candidates.some((t) => t.id === startId)) candidates = state.tracks;
    state.baseQueue = candidates.map((t) => t.id);
    state.queueContext = describeContext(start);
    state.queue = state.baseQueue.slice();
    state.queueIndex = Math.max(0, state.queue.indexOf(startId));
    if (state.shuffle) applyShuffle();
  }

  function applyShuffle() {
    const current = state.queue[state.queueIndex];
    const rest = state.baseQueue.filter((id) => id !== current);
    state.queue = current ? [current, ...shuffleArray(rest)] : shuffleArray(state.baseQueue);
    state.queueIndex = 0;
  }

  function unshuffle() {
    const current = state.queue[state.queueIndex];
    state.queue = state.baseQueue.slice();
    state.queueIndex = Math.max(0, state.queue.indexOf(current));
  }

  function playFromList(id) {
    if (state.currentTrack?.id === id) {
      togglePlay();
      return;
    }
    const track = getTrack(id);
    if (track && !isPlayable(track)) {
      showToast('Sin conexión: descarga la playlist (⬇) para escucharla offline.');
      return;
    }
    buildQueue(id);
    loadTrack(getTrack(id), true, dj.enabled ? 1.5 : 0);
  }

  /* ---------- Reproducción ---------- */
  let lyricsDelay = null;
  function loadTrack(track, autoplay = true, fade = 0) {
    if (!track) return;
    state.currentTrack = track;
    state.pendingSeek = null;
    state.countedId = null;

    prepareDeck(autoplay, fade);
    els.audio.src = track.src;

    els.cover.src = track.cover;
    els.cover.alt = `Carátula de ${track.album || track.title}`;
    els.miniCover.src = track.cover;
    els.npContext.textContent = state.queueContext;
    els.npTitle.textContent = track.title;
    els.npArtist.textContent = track.knownArtist || track.genre || track.artist;
    els.npAlbum.textContent = track.knownArtist ? track.genre || track.album : '';
    els.miniTitle.textContent = track.title;
    els.miniArtist.textContent = track.knownArtist || track.genre || track.artist;
    els.npFavBtn.disabled = false;
    els.npAddBtn.disabled = false;
    updateFavButton(els.npFavBtn, state.favorites.has(track.id));
    document.title = `${track.title} · ${track.artist} — LiquidBrush`;

    updateProgressUI(0, parseDuration(track.duration));
    // Al abrir la app (sin reproducir) la letra se busca un poco después para no frenar el arranque
    clearTimeout(lyricsDelay);
    if (autoplay) showLyricsFor(track);
    else {
      renderLyrics('', 'Pulsa ▶ para escuchar; la letra aparecerá aquí.');
      lyricsDelay = setTimeout(() => { if (state.currentTrack === track) showLyricsFor(track); }, 3000);
    }
    highlightCurrent();
    updateDynamicColor(track);
    updateMediaSession(track);
    loadComments(track);

    if (autoplay) play();
  }

  async function play() {
    if (!state.currentTrack) {
      if (!state.tracks.length) return;
      buildQueue(state.tracks[0].id);
      loadTrack(getTrack(state.queue[state.queueIndex]), false);
    }
    setupAudioGraph();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    try {
      await els.audio.play();
    } catch (error) {
      // AbortError: se cambió de canción antes de empezar a sonar; no es un fallo real.
      if (error.name === 'AbortError') return;
      console.error('[LiquidBrush] No se pudo reproducir:', error);
      if (error.name === 'NotAllowedError') {
        showToast('El navegador bloqueó la reproducción automática. Pulsa ▶ para escuchar.');
      } else {
        showToast('No se pudo reproducir la canción. Revisa la URL del audio.');
      }
    }
  }

  function togglePlay() {
    if (!state.currentTrack || els.audio.paused) play();
    else els.audio.pause();
  }

  function next(manual = true, fade = manual && dj.enabled ? 1.5 : 0) {
    if (!state.queue.length) return;
    let index = state.queueIndex + 1;

    if (index >= state.queue.length) {
      if (state.repeat === 'all' || manual) {
        index = 0;
        if (state.shuffle && state.queue.length > 1) {
          // Nueva vuelta aleatoria evitando repetir la última canción al empezar
          const last = state.queue[state.queue.length - 1];
          let shuffled = shuffleArray(state.baseQueue);
          if (shuffled[0] === last) shuffled = [...shuffled.slice(1), last];
          state.queue = shuffled;
        }
      } else {
        // Fin de la lista sin bucle: se detiene al principio de la última canción
        els.audio.pause();
        els.audio.currentTime = 0;
        return;
      }
    }

    if (!navigator.onLine) {
      index = findPlayable(index, 1);
      if (index < 0) {
        els.audio.pause();
        showToast('Sin conexión: no hay canciones descargadas en esta lista.');
        return;
      }
    }
    state.queueIndex = index;
    loadTrack(getTrack(state.queue[index]), true, fade);
  }

  function prev() {
    if (!state.queue.length) return;
    if (els.audio.currentTime > 3) {
      els.audio.currentTime = 0;
      return;
    }
    let index = state.queueIndex - 1;
    if (index < 0) index = state.repeat === 'all' ? state.queue.length - 1 : 0;
    if (!navigator.onLine) index = Math.max(0, findPlayable(index, -1));
    if (index === state.queueIndex) {
      els.audio.currentTime = 0;
      play();
      return;
    }
    state.queueIndex = index;
    loadTrack(getTrack(state.queue[index]), true, dj.enabled ? 1.5 : 0);
  }

  function handleEnded() {
    if (state.repeat === 'one') {
      els.audio.currentTime = 0;
      play();
      return;
    }
    next(false);
  }

  function seekBy(seconds) {
    if (!state.currentTrack) return;
    const duration = getDuration();
    const target = clamp(els.audio.currentTime + seconds, 0, duration || Infinity);
    seekTo(target);
  }

  function seekTo(seconds) {
    if (Number.isFinite(els.audio.duration)) {
      els.audio.currentTime = seconds;
    } else {
      state.pendingSeek = seconds; // se aplicará cuando lleguen los metadatos
    }
    updateProgressUI(seconds, getDuration());
    syncLyrics(seconds, true);
  }

  function setPlayingUI(isPlaying) {
    document.body.classList.toggle('is-playing', isPlaying);
    setIcon(els.playBtn, isPlaying ? 'pause' : 'play');
    els.playBtn.setAttribute('aria-label', isPlaying ? 'Pausar' : 'Reproducir');
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
    if (isPlaying) visualizer.start();
  }

  /* ---------- Modos: aleatorio y bucle ---------- */
  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    if (state.shuffle) applyShuffle();
    else unshuffle();
    storage.set(KEYS.shuffle, state.shuffle);
    updateModeButtons();
    showToast(state.shuffle ? 'Aleatorio activado' : 'Aleatorio desactivado');
  }

  function cycleRepeat() {
    const nextIndex = (REPEAT_MODES.indexOf(state.repeat) + 1) % REPEAT_MODES.length;
    state.repeat = REPEAT_MODES[nextIndex];
    storage.set(KEYS.repeat, state.repeat);
    updateModeButtons();
    showToast(`Repetir: ${REPEAT_LABELS[state.repeat]}`);
  }

  function updateModeButtons() {
    els.shuffleBtn.classList.toggle('is-active', state.shuffle);
    els.shuffleBtn.setAttribute('aria-pressed', String(state.shuffle));
    els.shuffleBtn.setAttribute('aria-label', state.shuffle ? 'Desactivar aleatorio' : 'Activar aleatorio');

    els.repeatBtn.classList.toggle('is-active', state.repeat !== 'off');
    setIcon(els.repeatBtn, state.repeat === 'one' ? 'repeat-one' : 'repeat');
    const label = `Repetir: ${REPEAT_LABELS[state.repeat]}`;
    els.repeatBtn.setAttribute('aria-label', label);
    els.repeatBtn.title = `${label} (R)`;
  }

  /* ---------- Progreso ---------- */
  function updateProgressUI(current, duration) {
    const hasDuration = Number.isFinite(duration) && duration > 0;
    els.progress.max = hasDuration ? String(duration) : '100';
    els.progress.value = hasDuration ? String(clamp(current, 0, duration)) : '0';
    const percent = hasDuration ? clamp((current / duration) * 100, 0, 100) : 0;
    els.progress.style.setProperty('--fill', `${percent}%`);
    els.currentTime.textContent = formatTime(current);
    els.totalTime.textContent = formatTime(duration);
    els.progress.setAttribute('aria-valuetext', `${formatTime(current)} de ${formatTime(duration)}`);
  }

  /* ---------- Volumen ---------- */
  function setVolume(value) {
    const volume = clamp(Number(value) || 0, 0, 1);
    state.volume = volume;
    decks.forEach(applyVolume);
    if (volume > 0) {
      state.lastVolume = volume;
      if (els.audio.muted) decks.forEach((deck) => { deck.muted = false; });
    }
    storage.set(KEYS.volume, volume);
    storage.set(KEYS.muted, els.audio.muted);
    updateVolumeUI();
  }

  function toggleMute() {
    if (els.audio.muted || state.volume === 0) {
      decks.forEach((deck) => { deck.muted = false; });
      if (state.volume === 0) setVolume(state.lastVolume || 0.6);
    } else {
      decks.forEach((deck) => { deck.muted = true; });
    }
    storage.set(KEYS.muted, els.audio.muted);
    updateVolumeUI();
  }

  function updateVolumeUI() {
    const silent = els.audio.muted || state.volume === 0;
    const shown = silent ? 0 : state.volume;
    els.volume.value = String(shown);
    els.volume.style.setProperty('--fill', `${shown * 100}%`);
    els.volume.setAttribute('aria-valuetext', `${Math.round(shown * 100)} %`);
    setIcon(els.muteBtn, silent ? 'volume-mute' : shown < 0.5 ? 'volume-low' : 'volume-high');
    els.muteBtn.setAttribute('aria-label', silent ? 'Activar sonido' : 'Silenciar');
    els.muteBtn.title = silent ? 'Activar sonido (M)' : 'Silenciar (M)';
  }

  /* ---------- Letras (estáticas o sincronizadas en formato LRC) ---------- */
  const LRC_TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

  function parseLyrics(text) {
    if (!text || !text.trim()) return null;
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const synced = [];

    for (const raw of lines) {
      const stamps = [...raw.matchAll(LRC_TIME)];
      if (!stamps.length) continue;
      const content = raw.replace(LRC_TIME, '').trim();
      for (const stamp of stamps) {
        const fraction = stamp[3] ? Number(stamp[3]) / 10 ** stamp[3].length : 0;
        synced.push({ time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction, text: content });
      }
    }

    if (synced.length) {
      synced.sort((a, b) => a.time - b.time);
      return { synced: true, lines: synced };
    }
    return { synced: false, text: text.trim() };
  }

  // Busca la letra en LRCLIB (gratis, sin clave). Devuelve '' si no existe y null si falló la conexión.
  const lyricsCache = new Map();

  async function lyricsRequest(path, retries = 1) {
    const response = await fetch(`${LYRICS_API}${path}`);
    if (response.status === 404) return null;
    if (response.status === 503 && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return lyricsRequest(path, retries - 1);
    }
    if (!response.ok) throw new Error(`LRCLIB HTTP ${response.status}`);
    return response.json();
  }

  function pickLyrics(entry) {
    if (!entry) return '';
    if (entry.instrumental) return '[00:00.00] ♪ Instrumental ♪';
    return entry.syncedLyrics || entry.plainLyrics || '';
  }

  async function fetchLyrics(track) {
    if (lyricsCache.has(track.id)) return lyricsCache.get(track.id);
    const stored = storage.get(KEYS.lyricsPrefix + track.id, null);
    if (typeof stored === 'string') {
      lyricsCache.set(track.id, stored);
      return stored;
    }

    const duration = Math.round(parseDuration(track.duration));
    // Artista principal, sin "ft." ni colaboradores
    const artist = track.knownArtist.replace(/\s*\b(ft|feat)\b\.?.*$/i, '').split(',')[0].trim();
    let text = '';
    try {
      if (artist) {
        const params = new URLSearchParams({ artist_name: artist, track_name: track.title });
        if (duration) params.set('duration', String(duration));
        text = pickLyrics(await lyricsRequest(`/get?${params}`));
      }
      if (!text) {
        const results = await lyricsRequest(`/search?${new URLSearchParams({ q: `${track.title} ${artist}`.trim() })}`);
        if (Array.isArray(results)) {
          // Sin artista conocido solo se acepta si la duración coincide (evita letras equivocadas)
          const matches = results.filter((r) => (duration ? Math.abs(r.duration - duration) <= 4 : Boolean(artist)));
          matches.sort((a, b) => Number(Boolean(b.syncedLyrics)) - Number(Boolean(a.syncedLyrics)));
          text = pickLyrics(matches[0]);
        }
      }
    } catch (error) {
      console.warn('[LiquidBrush] No se pudo obtener la letra:', error);
      return null;
    }
    lyricsCache.set(track.id, text);
    storage.set(KEYS.lyricsPrefix + track.id, text);
    return text;
  }

  function showLyricsFor(track) {
    if (track.lyrics) {
      renderLyrics(track.lyrics);
      return;
    }
    renderLyrics('', 'Buscando la letra…');
    fetchLyrics(track).then((text) => {
      if (state.currentTrack?.id !== track.id) return;
      renderLyrics(text, text === null
        ? 'No se pudo conectar con el servicio de letras. Vuelve a intentarlo en un momento.'
        : 'Letra no disponible para esta canción.');
      syncLyrics(els.audio.currentTime, true);
    });
  }

  function renderLyrics(text, emptyMessage = 'Letra no disponible para esta canción.') {
    state.lyrics = parseLyrics(text);
    state.activeLyric = -1;
    els.lyricsBody.replaceChildren();
    els.lyricsBody.scrollTop = 0;
    els.lyricsBadge.hidden = !state.lyrics?.synced;

    if (!state.lyrics) {
      const p = document.createElement('p');
      p.className = 'lyrics-empty';
      p.textContent = emptyMessage;
      els.lyricsBody.appendChild(p);
      return;
    }

    if (!state.lyrics.synced) {
      const p = document.createElement('p');
      p.className = 'lyrics-static';
      p.textContent = state.lyrics.text;
      els.lyricsBody.appendChild(p);
      return;
    }

    const fragment = document.createDocumentFragment();
    state.lyrics.lines.forEach((line, i) => {
      const p = document.createElement('p');
      p.className = 'lyric-line';
      p.dataset.index = String(i);
      p.textContent = line.text || '♪';
      p.title = `Ir a ${formatTime(line.time)}`;
      fragment.appendChild(p);
    });
    els.lyricsBody.appendChild(fragment);
  }

  function syncLyrics(time, force = false) {
    if (!state.lyrics?.synced) return;
    const lines = state.lyrics.lines;
    let index = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= time + 0.2) index = i;
      else break;
    }
    if (index === state.activeLyric && !force) return;

    const previous = els.lyricsBody.querySelector('.lyric-line.is-active');
    if (previous) previous.classList.remove('is-active');
    state.activeLyric = index;
    if (index < 0) return;

    const current = els.lyricsBody.children[index];
    if (!current) return;
    current.classList.add('is-active');

    if (els.lyricsPanel.open) {
      const body = els.lyricsBody;
      const top = current.offsetTop - body.clientHeight / 2 + current.clientHeight / 2;
      body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }

  /* ---------- Fondo dinámico según la carátula ---------- */
  const colorCache = new Map();

  function applyDynamicColor(rgb) {
    document.body.style.setProperty('--dyn', `rgb(${rgb.map(Math.round).join(', ')})`);
  }

  function resetDynamicColor() {
    document.body.style.removeProperty('--dyn');
  }

  function updateDynamicColor(track) {
    if (track.hue !== null && track.hue !== undefined) {
      applyDynamicColor(hslToRgb(track.hue / 360, 0.65, 0.5));
      return;
    }
    if (colorCache.has(track.id)) {
      const cached = colorCache.get(track.id);
      if (cached) applyDynamicColor(cached);
      else resetDynamicColor();
      return;
    }

    // Se usa una imagen aparte con CORS para poder leer sus píxeles en un canvas
    // sin afectar a la carátula visible (que se muestra aunque el servidor no tenga CORS).
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.decoding = 'async';
    probe.onload = () => {
      const rgb = extractColor(probe);
      colorCache.set(track.id, rgb);
      if (state.currentTrack?.id !== track.id) return;
      if (rgb) applyDynamicColor(rgb);
      else resetDynamicColor();
    };
    probe.onerror = () => {
      colorCache.set(track.id, null);
      if (state.currentTrack?.id === track.id) resetDynamicColor();
    };
    probe.src = track.cover;
  }

  function extractColor(image) {
    try {
      const size = 48;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);

      let r = 0;
      let g = 0;
      let b = 0;
      let weightSum = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        const pr = data[i];
        const pg = data[i + 1];
        const pb = data[i + 2];
        const max = Math.max(pr, pg, pb);
        const min = Math.min(pr, pg, pb);
        const lightness = (max + min) / 510;
        if (lightness < 0.08 || lightness > 0.94) continue; // ignora negros y blancos puros
        const saturation = max === 0 ? 0 : (max - min) / max;
        const weight = 0.15 + saturation * saturation * 3; // prioriza los colores vivos
        r += pr * weight;
        g += pg * weight;
        b += pb * weight;
        weightSum += weight;
      }
      if (!weightSum) return null;
      return tuneColor(r / weightSum, g / weightSum, b / weightSum);
    } catch (error) {
      // Canvas "contaminado": el servidor de la imagen no permite CORS
      return null;
    }
  }

  function tuneColor(r, g, b) {
    const [h, s, l] = rgbToHsl(r, g, b);
    return hslToRgb(h, Math.max(s, 0.45), clamp(l, 0.38, 0.6));
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    if (s === 0) return [l * 255, l * 255, l * 255];
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
  }

  /* ---------- Web Audio (opcional, requiere CORS en el audio) ---------- */
  let audioCtx = null;
  let analyser = null;
  let freqData = null;

  function setupAudioGraph() {
    if (!CONFIG.useWebAudioAnalyser || audioCtx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      audioCtx = new AudioContextClass();
      const source = audioCtx.createMediaElementSource(els.audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch (error) {
      console.warn('[LiquidBrush] Web Audio no disponible, se usa el visualizador simulado.', error);
      analyser = null;
      freqData = null;
    }
  }

  /* ---------- Visualizador (Canvas) ---------- */
  const visualizer = (() => {
    const canvas = els.visualizer;
    const ctx = canvas.getContext('2d');
    const GAP = 4;
    const IDLE_LEVEL = 0.05;
    let width = 0;
    let height = 0;
    let bars = [];
    let rafId = null;
    let lastFrame = 0;
    let onScreen = true;
    let colors = { a: '#1db954', b: '#1ed760', glow: 0 };
    const FRAME_MS = 1000 / 30; // 30 fps bastan para unas barras y ahorran batería

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = clamp(Math.floor(width / 11), 12, 64);
      if (bars.length !== count) {
        bars = Array.from({ length: count }, (_, i) => bars[i] ?? IDLE_LEVEL);
      }
      draw();
    }

    function refreshColors() {
      const styles = getComputedStyle(document.documentElement);
      const read = (name) => styles.getPropertyValue(name).trim();
      colors = {
        a: read('--viz-a') || read('--accent') || colors.a,
        b: read('--viz-b') || read('--accent-2') || colors.b,
        c: read('--viz-c'),
        glow: 0, // el resplandor (shadowBlur) era lo más costoso de dibujar
        reflect: read('--viz-reflect') === '1'
      };
      draw();
    }

    function levels(time) {
      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
        const usable = Math.floor(freqData.length * 0.75);
        return bars.map((_, i) => {
          const bin = Math.floor((i / bars.length) * usable);
          return clamp(freqData[bin] / 255, IDLE_LEVEL, 1);
        });
      }
      // Animación simulada: ondas superpuestas + un poco de ruido
      return bars.map((_, i) => {
        const x = i / bars.length;
        const wave =
          0.34 +
          0.22 * Math.sin(time * 0.0021 + i * 0.45) +
          0.17 * Math.sin(time * 0.0057 - i * 0.9) +
          0.12 * Math.sin(time * 0.013 + i * 1.7);
        const bass = (1 - x) * 0.22;
        return clamp(wave + bass + (Math.random() - 0.5) * 0.22, IDLE_LEVEL, 1);
      });
    }

    function frame(time) {
      if (!onScreen) {
        rafId = null;
        return;
      }
      if (time - lastFrame < FRAME_MS) {
        rafId = requestAnimationFrame(frame);
        return;
      }
      lastFrame = time;
      const playing = !els.audio.paused && !els.audio.ended;
      const targets = playing ? levels(time) : null;
      let moving = playing;

      bars = bars.map((value, i) => {
        const target = targets ? targets[i] : IDLE_LEVEL;
        const speed = target > value ? 0.6 : 0.2;
        const nextValue = value + (target - value) * speed;
        if (Math.abs(nextValue - target) > 0.004) moving = true;
        return nextValue;
      });

      draw();
      rafId = moving ? requestAnimationFrame(frame) : null;
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      if (!bars.length || !width || !height) return;
      const barWidth = (width - GAP * (bars.length - 1)) / bars.length;
      const radius = Math.min(3, barWidth / 2);
      // Con reflejo, las barras ocupan la parte de arriba y se reflejan como en un suelo de cromo
      const base = colors.reflect ? height * 0.72 : height;

      const gradient = ctx.createLinearGradient(0, base, 0, 0);
      gradient.addColorStop(0, colors.a);
      if (colors.c) gradient.addColorStop(0.55, colors.c);
      gradient.addColorStop(1, colors.b);
      ctx.fillStyle = gradient;
      ctx.shadowColor = colors.reflect ? colors.b : colors.a;
      ctx.shadowBlur = colors.glow;

      const rect = (x, y, w, h, radii) => {
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, radii);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, w, h);
        }
      };

      bars.forEach((value, i) => {
        const barHeight = Math.max(3, value * (base - colors.glow / 2));
        rect(i * (barWidth + GAP), base - barHeight, barWidth, barHeight, [radius, radius, 0, 0]);
      });

      if (!colors.reflect) return;
      const mirror = ctx.createLinearGradient(0, base, 0, height);
      mirror.addColorStop(0, colors.b);
      mirror.addColorStop(1, 'transparent');
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.shadowBlur = 0;
      ctx.fillStyle = mirror;
      bars.forEach((value, i) => {
        const barHeight = Math.min(height - base - 1, Math.max(2, value * (base - colors.glow / 2) * 0.45));
        rect(i * (barWidth + GAP), base + 1, barWidth, barHeight, [0, 0, radius, radius]);
      });
      ctx.restore();
    }

    function start() {
      if (!rafId && onScreen) rafId = requestAnimationFrame(frame);
    }

    // Si el visualizador sale de la pantalla (p. ej. al bajar por la lista en el móvil) deja de dibujarse
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) start();
      }).observe(canvas);
    }

    if ('ResizeObserver' in window) {
      new ResizeObserver(resize).observe(canvas);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();

    return { start, resize, refreshColors };
  })();

  /* ---------- Temas ---------- */
  function applyTheme(theme) {
    const safeTheme = Object.prototype.hasOwnProperty.call(THEMES, theme) ? theme : 'chrome';
    document.documentElement.dataset.theme = safeTheme;
    els.themeSelect.value = safeTheme;
    if (els.metaTheme) els.metaTheme.setAttribute('content', THEMES[safeTheme]);
    storage.set(KEYS.theme, safeTheme);
    requestAnimationFrame(() => visualizer.refreshColors());
  }

  /* ---------- Escena surrealista: los ojos siguen el cursor ---------- */
  function setupSurrealEyes() {
    const irises = [...document.querySelectorAll('.eye-iris')];
    if (!irises.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return; // en táctil no hay cursor que seguir
    let pointer = null;
    let frameId = null;

    const update = () => {
      frameId = null;
      irises.forEach((iris) => {
        const rect = iris.closest('.eye').getBoundingClientRect();
        if (!rect.width) return; // escena oculta en los demás temas
        const dx = pointer.x - (rect.left + rect.width / 2);
        const dy = pointer.y - (rect.top + rect.height / 2);
        const distance = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, distance / 260);
        iris.style.transform = `translate(${(dx / distance) * 16 * reach}px, ${(dy / distance) * 9 * reach}px)`;
      });
    };

    window.addEventListener('pointermove', (event) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (!frameId) frameId = requestAnimationFrame(update);
    }, { passive: true });
  }

  /* ---------- Media Session (controles en la pantalla de bloqueo) ---------- */
  function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        // Las portadas generadas son SVG en línea: la pantalla de bloqueo muestra el logo
        artwork: track.hue !== null
          ? [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }]
          : [{ src: track.cover, sizes: '300x300' }]
      });
    } catch {
      /* metadatos no soportados */
    }
  }

  function setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    const handlers = {
      play: () => play(),
      pause: () => els.audio.pause(),
      previoustrack: () => prev(),
      nexttrack: () => next(true),
      seekbackward: (details) => seekBy(-(details.seekOffset || 10)),
      seekforward: (details) => seekBy(details.seekOffset || 10),
      seekto: (details) => {
        if (Number.isFinite(details.seekTime)) seekTo(details.seekTime);
      }
    };
    Object.entries(handlers).forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* acción no soportada en este navegador */
      }
    });
  }

  /* ---------- Eventos ---------- */
  function bindEvents() {
    // Audio: los dos reproductores (DJ) comparten eventos, pero solo cuenta el activo
    const on = (type, handler) => decks.forEach((deck) => deck.addEventListener(type, (event) => {
      if (event.target === els.audio) handler(event);
    }));
    on('play', () => setPlayingUI(true));
    // Cuenta para "Escuchadas hace poco" y "Tus más escuchadas" (una vez por canción cargada)
    on('playing', () => {
      const id = state.currentTrack?.id;
      if (id && state.countedId !== id) {
        state.countedId = id;
        recordPlay(id);
      }
    });
    on('pause', () => {
      setPlayingUI(false);
      flushListening();
    });
    on('ended', handleEnded);
    on('waiting', () => els.playBtn.classList.add('is-loading'));
    ['playing', 'canplay', 'pause', 'error', 'emptied'].forEach((type) => {
      on(type, () => els.playBtn.classList.remove('is-loading'));
    });
    on('timeupdate', () => {
      const time = els.audio.currentTime;
      trackListening(time);
      checkDjTransition();
      checkCommentBubble(time);
      updateCommentButton(time);
      if (state.isSeeking) return;
      updateProgressUI(time, getDuration());
      syncLyrics(time);
    });
    on('loadedmetadata', () => {
      if (state.pendingSeek !== null) {
        els.audio.currentTime = clamp(state.pendingSeek, 0, els.audio.duration || 0);
        state.pendingSeek = null;
      }
      updateProgressUI(els.audio.currentTime, getDuration());
      renderCommentMarks();
    });
    on('durationchange', () => {
      if (!state.isSeeking) updateProgressUI(els.audio.currentTime, getDuration());
      renderCommentMarks();
    });
    on('volumechange', updateVolumeUI);
    on('error', () => {
      if (!els.audio.getAttribute('src')) return;
      setPlayingUI(false);
      showToast(navigator.onLine
        ? `No se pudo cargar el audio de «${state.currentTrack?.title ?? 'la canción'}».`
        : 'Sin conexión: esta canción no está descargada.');
    });
    // Guarda el tiempo escuchado antes de cerrar o esconder la app
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushListening();
      else if (state.currentTrack) loadComments(state.currentTrack, { quiet: true });
    });
    window.addEventListener('pagehide', flushListening);

    // Comentarios
    els.commentForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitComment();
    });
    els.commentsList.addEventListener('click', (event) => {
      const item = event.target.closest('.comment-item');
      if (!item || !state.currentTrack) return;
      seekTo(Number(item.dataset.at));
      if (els.audio.paused) play();
    });

    // Transiciones DJ
    els.djToggle.addEventListener('change', () => setDj(els.djToggle.checked));
    els.djBtn.addEventListener('click', () => setDj(!dj.enabled));
    els.djFade.addEventListener('change', () => {
      dj.fade = Number(els.djFade.value) || 6;
      storage.set(KEYS.djFade, dj.fade);
      showToast(`Mezcla de ${dj.fade} segundos`);
    });

    // Controles
    els.playBtn.addEventListener('click', togglePlay);
    els.prevBtn.addEventListener('click', prev);
    els.nextBtn.addEventListener('click', () => next(true));
    els.shuffleBtn.addEventListener('click', toggleShuffle);
    els.repeatBtn.addEventListener('click', cycleRepeat);
    els.muteBtn.addEventListener('click', toggleMute);
    els.npFavBtn.addEventListener('click', () => {
      if (state.currentTrack) toggleFavorite(state.currentTrack.id);
    });

    // Barra de progreso: clic o arrastre (ratón y táctil)
    els.progress.addEventListener('input', () => {
      state.isSeeking = true;
      const value = Number(els.progress.value);
      updateProgressUI(value, getDuration());
    });
    els.progress.addEventListener('change', () => {
      const value = Number(els.progress.value);
      state.isSeeking = false;
      if (state.currentTrack) seekTo(value);
    });

    // Conexión
    window.addEventListener('online', () => updateOnlineStatus(true));
    window.addEventListener('offline', () => updateOnlineStatus(true));

    // Volumen
    els.volume.addEventListener('input', () => setVolume(els.volume.value));

    // Biblioteca, playlists y filas de canciones (delegación de eventos)
    els.library.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target || !els.library.contains(target)) return;
      const action = target.dataset.action;
      const item = target.closest('.track');
      if (item) {
        const id = item.dataset.id;
        if (action === 'fav') toggleFavorite(id);
        else if (action === 'play') playFromList(id);
        else if (action === 'add') openAddDialog(id);
        else if (action === 'remove') removeFromLocal(getPlaylist(state.openPlaylist)?.id, id);
        return;
      }
      const pl = getPlaylist(state.openPlaylist);
      switch (action) {
        case 'open-playlist': openPlaylist(target.dataset.key); break;
        case 'back': setView('playlists'); break;
        case 'stats-prev': state.statsOffset -= 1; renderList(); break;
        case 'stats-next': state.statsOffset = Math.min(0, state.statsOffset + 1); renderList(); break;
        case 'stats-artist':
        case 'stats-genre':
          els.searchInput.value = target.dataset.value;
          state.query = target.dataset.value;
          setView('library');
          break;
        case 'stats-play': {
          const track = getTrack(target.dataset.value);
          if (track) {
            buildQueue(track.id);
            loadTrack(track, true, dj.enabled ? 1.5 : 0);
          }
          break;
        }
        case 'play-view': playTracks(getVisibleTracks()); break;
        case 'shuffle-view': playTracks(getVisibleTracks(), true); break;
        case 'download-playlist': toggleDownload(state.openPlaylist); break;
        case 'new-playlist':
          createPlaylist().then((created) => { if (created) openPlaylist(`local:${created.id}`); });
          break;
        case 'export': exportPlaylists(); break;
        case 'import': els.importInput.click(); break;
        case 'edit-playlist': if (pl) editLocalPlaylist(pl.id); break;
        case 'delete-playlist': if (pl) deleteLocalPlaylist(pl.id); break;
        case 'share-playlist': if (pl) sharePlaylist(pl); break;
        case 'copy-playlist': if (pl) copyToLocal(pl); break;
        case 'copy-shared': if (pl) copyToLocal(pl, true); break;
        case 'delete-shared': if (pl) deleteSharedPlaylist(pl); break;
        case 'clear-recent':
          if (confirm('¿Borrar el historial de canciones escuchadas en este dispositivo?')) {
            library.recent = [];
            storage.set(KEYS.recent, []);
            setView('playlists');
          }
          break;
        default: break;
      }
    });

    els.library.addEventListener('change', (event) => {
      if (event.target.id !== 'sortSelect') return;
      state.sort = event.target.value;
      storage.set(KEYS.sort, state.sort);
      renderList();
    });

    els.importInput.addEventListener('change', () => {
      const [file] = els.importInput.files;
      if (file) importPlaylists(file);
      els.importInput.value = '';
    });

    // Diálogo "Añadir a playlist"
    els.addList.addEventListener('click', (event) => {
      const button = event.target.closest('.add-item');
      if (!button) return;
      addToLocal(button.dataset.id, addTarget);
      els.addDialog.close();
    });
    els.addNew.addEventListener('click', async () => {
      els.addDialog.close();
      const created = await createPlaylist(addTarget ? [addTarget] : []);
      if (created) {
        showToast(`Playlist creada: «${created.name}».`);
        if (state.view === 'playlists') renderList();
      }
    });
    els.addDialog.addEventListener('click', (event) => {
      // Clic fuera del panel o en "Cerrar"
      if (event.target === els.addDialog || event.target.closest('[data-close]')) els.addDialog.close();
    });
    els.npAddBtn.addEventListener('click', () => {
      if (state.currentTrack) openAddDialog(state.currentTrack.id);
    });

    // Letras sincronizadas: clic en una línea para saltar a ese momento
    els.lyricsBody.addEventListener('click', (event) => {
      const line = event.target.closest('.lyric-line');
      if (!line || !state.lyrics?.synced) return;
      const entry = state.lyrics.lines[Number(line.dataset.index)];
      if (entry) {
        seekTo(entry.time);
        if (els.audio.paused) play();
      }
    });

    // Buscador en tiempo real
    let searchFrame = null;
    els.searchInput.addEventListener('input', () => {
      state.query = els.searchInput.value;
      if (searchFrame) cancelAnimationFrame(searchFrame);
      searchFrame = requestAnimationFrame(() => {
        searchFrame = null;
        renderList();
      });
    });

    // Pestañas Biblioteca / Playlists / Favoritas
    els.tabsBar.addEventListener('click', (event) => {
      const tab = event.target.closest('.tab');
      if (tab) setView(tab.dataset.view);
    });

    // Botón "Letra" del reproductor: abre el panel y lo lleva a la vista
    els.lyricsBtn.addEventListener('click', () => {
      els.lyricsPanel.open = true;
      els.lyricsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    els.lyricsPanel.addEventListener('toggle', () => {
      els.lyricsBtn.classList.toggle('is-active', els.lyricsPanel.open);
      if (els.lyricsPanel.open) syncLyrics(els.audio.currentTime, true);
    });

    // Tema
    els.themeSelect.addEventListener('change', () => applyTheme(els.themeSelect.value));

    // Carátula de respaldo si la imagen falla
    [els.cover, els.miniCover].forEach((img) => {
      img.addEventListener('error', () => {
        if (img.src !== PLACEHOLDER_COVER) img.src = PLACEHOLDER_COVER;
      });
    });

    // Atajos de teclado
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      const target = event.target;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) {
        if (event.key === 'Escape' && target === els.searchInput) els.searchInput.blur();
        return;
      }
      // Espacio sobre un botón ya lo activa el navegador
      if (event.code === 'Space' && target.closest('button, summary, a')) return;

      switch (event.code) {
        case 'Space': event.preventDefault(); togglePlay(); break;
        case 'ArrowRight': event.preventDefault(); seekBy(5); break;
        case 'ArrowLeft': event.preventDefault(); seekBy(-5); break;
        case 'KeyN': next(true); break;
        case 'KeyP': prev(); break;
        case 'KeyM': toggleMute(); break;
        case 'KeyD': setDj(!dj.enabled); break;
        case 'KeyS': toggleShuffle(); break;
        case 'KeyR': cycleRepeat(); break;
        case 'KeyL': els.lyricsPanel.open = !els.lyricsPanel.open; break;
        case 'Slash': event.preventDefault(); els.searchInput.focus(); break;
        default: break;
      }
    });
  }

  /* ---------- Inicio ---------- */
  function restorePreferences() {
    const savedFavorites = storage.get(KEYS.favorites, []);
    state.favorites = new Set(Array.isArray(savedFavorites) ? savedFavorites.map(String) : []);
    state.shuffle = storage.get(KEYS.shuffle, false) === true;
    const savedRepeat = storage.get(KEYS.repeat, 'off');
    state.repeat = REPEAT_MODES.includes(savedRepeat) ? savedRepeat : 'off';

    const savedPlaylists = storage.get(KEYS.playlists, []);
    library.local = Array.isArray(savedPlaylists)
      ? savedPlaylists.filter((p) => p && p.id && typeof p.name === 'string' && Array.isArray(p.trackIds))
      : [];
    const savedRecent = storage.get(KEYS.recent, []);
    library.recent = Array.isArray(savedRecent) ? savedRecent.map(String) : [];
    const savedPlays = storage.get(KEYS.plays, {});
    library.plays = savedPlays && typeof savedPlays === 'object' ? savedPlays : {};
    const savedSort = storage.get(KEYS.sort, 'original');
    state.sort = savedSort in SORTS ? savedSort : 'original';
    const savedView = storage.get(KEYS.view, 'library');
    state.view = VIEWS.includes(savedView) ? savedView : 'library';

    const savedVolume = Number(storage.get(KEYS.volume, 0.8));
    state.volume = Number.isFinite(savedVolume) ? clamp(savedVolume, 0, 1) : 0.8;
    state.lastVolume = state.volume || 0.8;
    const muted = storage.get(KEYS.muted, false) === true;
    decks.forEach((deck) => {
      deck.muted = muted;
      applyVolume(deck);
    });

    const savedFade = Number(storage.get(KEYS.djFade, 6));
    dj.fade = [3, 6, 9, 12].includes(savedFade) ? savedFade : 6;
    els.djFade.value = String(dj.fade);
    setDj(storage.get(KEYS.dj, false) === true, false);
    els.commentAuthor.value = storage.get(KEYS.author, '') || '';
    const savedListen = storage.get(KEYS.listen, {});
    listen.log = savedListen && typeof savedListen === 'object' ? savedListen : {};

    applyTheme(storage.get(KEYS.theme, 'chrome'));
  }

  // Equipos modestos o "ahorro de datos": escena surrealista estática
  function detectLiteMode() {
    const cores = navigator.hardwareConcurrency || 8;
    const memory = navigator.deviceMemory || 8;
    const saveData = navigator.connection?.saveData === true;
    if (cores <= 4 || memory <= 2 || saveData) document.documentElement.classList.add('lite');
  }

  function init() {
    detectLiteMode();
    document.documentElement.classList.toggle('is-ios', IS_IOS);
    if (IS_IOS) els.djFade.closest('.dj-fade').title = 'En iPhone/iPad la transición es un empalme corto: iOS no permite bajar el volumen desde la web.';
    if (CONFIG.useWebAudioAnalyser) els.audio.crossOrigin = 'anonymous';

    els.cover.src = PLACEHOLDER_COVER;
    els.miniCover.src = PLACEHOLDER_COVER;
    if (window.matchMedia('(max-width: 860px)').matches) els.lyricsPanel.open = false;

    restorePreferences();
    renderComments();
    scheduleCommentRefresh();
    updateModeButtons();
    updateVolumeUI();
    updateProgressUI(0, 0);
    bindEvents();
    setupMediaSessionHandlers();
    setupSurrealEyes();
    updateOnlineStatus();
    registerServiceWorker();
    loadTracks();
  }

  init();
})();
