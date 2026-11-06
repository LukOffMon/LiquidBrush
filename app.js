/* =========================================================
   Liquid Bullet — lógica del reproductor
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Configuración ---------- */
  const CONFIG = {
    // Buckets de Cloudflare R2. Cada uno tiene su lista de canciones en musica/<name>.json
    // (el nombre del archivo debe coincidir con "name": tools/build_catalog.py lo usa igual).
    // En "src" basta con la ruta del MP3 dentro del bucket: se le pone delante "base".
    // El "name" forma parte del id de cada canción: no cambiarlo una vez haya música.
    // Si fallan todas las listas, se usa tracks.json.
    sources: [
      {
        // Bucket liquidpepper4db
        name: 'pepper',
        list: 'musica/pepper.json',
        base: 'https://pub-cb798ce2901a49a6a6363d57fbd5ee19.r2.dev'
      },
      {
        // Bucket liquidsaltdb5
        name: 'salt',
        list: 'musica/salt.json',
        base: 'https://pub-b05e243e7441423f9c4a25dfe8411da3.r2.dev'
      },
      {
        // Bucket liquidbrush3db3
        name: 'brush3',
        list: 'musica/brush3.json',
        base: 'https://pub-342aee3eb054410cb02224940f684884.r2.dev'
      },
      {
        // 4.º bucket (cuarta cuenta de Cloudflare)
        name: 'db4',
        list: 'musica/db4.json',
        base: 'https://pub-0854e4225565462db16fa787cf2ab81c.r2.dev'
      },
      {
        // 5.º bucket (quinta cuenta de Cloudflare)
        name: 'db5',
        list: 'musica/db5.json',
        base: 'https://pub-864cd199a5e04cb0b5faf77320b1e47b.r2.dev'
      }
    ],
    tracksUrl: 'tracks.json',
    // Playlists de base (por género y mezclas), su portada y el género de cada canción.
    // Lo genera tools/build_catalog.py.
    catalogUrl: 'catalog.json'
    // El ecualizador (y el visualizador con frecuencias reales) usa la Web Audio API, que solo
    // puede leer el audio si su servidor envía la cabecera "Access-Control-Allow-Origin".
    // Las canciones de servidores sin CORS suenan igual, pero sin ecualizar.
  };

  const KEYS = {
    favorites: 'liquidbrush:favorites',
    theme: 'liquidbrush:theme',
    volume: 'liquidbrush:volume',
    muted: 'liquidbrush:muted',
    shuffle: 'liquidbrush:shuffle',
    repeat: 'liquidbrush:repeat',
    lyricsPrefix: 'liquidbrush:lyrics:',
    lyricsIndex: 'liquidbrush:lyrics-index',
    playlists: 'liquidbrush:playlists',
    recent: 'liquidbrush:recent',
    plays: 'liquidbrush:plays',
    sort: 'liquidbrush:sort',
    view: 'liquidbrush:view',
    dj: 'liquidbrush:dj',
    djFade: 'liquidbrush:djfade',
    listen: 'liquidbrush:listen',
    libraryCache: 'liquidbrush:library-cache',
    settings: 'liquidbrush:settings',
    wallLast: 'liquidbrush:wall-last',
    pins: 'liquidbrush:pins',
    lab: 'liquidbrush:lab',
    tour: 'liquidbrush:tour',
    follows: 'liquidbrush:follows',
    searches: 'liquidbrush:searches',
    // Las claves conservan el prefijo "liquidbrush:" del nombre anterior para no perder lo guardado
    resume: 'liquidbrush:resume',
    resumeQueue: 'liquidbrush:resume-queue',
    // Huellas de las canciones ya vistas y fecha en que llegaron las nuevas (Novedades)
    known: 'liquidbrush:known',
    added: 'liquidbrush:added',
    disliked: 'liquidbrush:disliked',
    trash: 'liquidbrush:trash',
    lyricsOffsets: 'liquidbrush:lyrics-offsets',
    errors: 'liquidbrush:errors',
    install: 'liquidbrush:install',
    hidden: 'liquidbrush:hidden-playlists',
    // Motor de gustos: cuándo sonó cada canción por última vez, saltos y lo último que pusiste
    heard: 'liquidbrush:heard',
    skips: 'liquidbrush:skips',
    contexts: 'liquidbrush:contexts',
    // Tras «Actualizar» con música sonando: vuelve a sonar sola después de recargar
    resumeAutoplay: 'liquidbrush:resume-autoplay'
  };

  const LYRICS_API = 'https://lrclib.net/api';

  /* ---------- Dispositivo, sistema y navegador ---------- */
  // Lo detecta index.html antes de pintar (window.lbDevice). Respaldo mínimo por si faltara.
  const DEVICE = window.lbDevice || (() => {
    const ua = navigator.userAgent || '';
    const apple = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    return { os: apple ? 'ios' : /Android/.test(ua) ? 'android' : 'otro', osVersion: 0, apple, browser: 'otro', inapp: '', engine: 'otro',
      device: /Mobi|iPhone|Android/.test(ua) ? 'phone' : 'desktop', touch: navigator.maxTouchPoints > 0, standalone: false,
      memory: 0, cores: 0, lowEnd: false, saveData: false, slowNet: false };
  })();
  const OS_NAMES = { ios: 'iPhone (iOS)', ipados: 'iPad (iPadOS)', android: 'Android', windows: 'Windows', macos: 'Mac', chromeos: 'ChromeOS', linux: 'Linux', otro: 'otro sistema' };
  const BROWSER_NAMES = { safari: 'Safari', chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge', samsung: 'Samsung Internet', opera: 'Opera', inapp: 'navegador interno', otro: 'otro navegador' };
  const INAPP_NAMES = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', snapchat: 'Snapchat', x: 'X', line: 'LINE', google: 'la app de Google', webview: 'otra app' };
  // «iPhone (iOS 18) · Safari · app instalada»
  function deviceSummary() {
    const version = DEVICE.osVersion ? ` ${Math.floor(DEVICE.osVersion)}` : '';
    const os = DEVICE.apple ? `${OS_NAMES[DEVICE.os].replace(/\)$/, `${version})`)}` : `${OS_NAMES[DEVICE.os] || DEVICE.os}${version}`;
    const browser = DEVICE.inapp ? `dentro de ${INAPP_NAMES[DEVICE.inapp] || 'otra app'}` : BROWSER_NAMES[DEVICE.browser] || DEVICE.browser;
    const extras = [DEVICE.standalone ? 'app instalada' : '', DEVICE.lowEnd ? 'equipo modesto: modo ligero' : '', DEVICE.saveData ? 'ahorro de datos' : ''].filter(Boolean);
    return [os, browser, ...extras].join(' · ');
  }

  const THEMES = {
    chrome: '#100d1c',
    minimal: '#f4f3f0',
    yem: '#0b0907',
    ebano: '#050506'
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
    // home | library | playlists | artists | favorites | stats | lab, o playlist / artist (uno abierto)
    view: 'home',
    openPlaylist: null,
    // Artista abierto (vista "artist") y radio en curso
    openArtist: null,
    radio: null,
    sort: 'original',
    countedId: null,
    statsOffset: 0,
    query: '',
    // Filtros rápidos de la lista: all | downloaded | favorites | unplayed, y un género
    filter: 'all',
    genre: '',
    shuffle: false,
    repeat: 'off',
    isSeeking: false,
    pendingSeek: null,
    lastVolume: 0.8,
    // Volumen elegido; cada reproductor lo multiplica por su ganancia de mezcla (DJ)
    volume: 0.8,
    lyrics: null,
    activeLyric: -1,
    // Qué colección suena (para que todos sus botones de reproducir/pausa cambien a la vez)
    playSource: ''
  };

  /* ---------- Referencias al DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    audio: $('audio'),
    audio2: $('audio2'),
    audio3: $('audio3'),
    audio4: $('audio4'),
    settingsBtn: $('settingsBtn'),
    settingsDialog: $('settingsDialog'),
    fontSelect: $('fontSelect'),
    textSizeSelect: $('textSizeSelect'),
    plViewSelect: $('plViewSelect'),
    motionToggle: $('motionToggle'),
    hapticsToggle: $('hapticsToggle'),
    hapticsHint: $('hapticsHint'),
    eqPreset: $('eqPreset'),
    eqBands: $('eqBands'),
    eqNote: $('eqNote'),
    recentRow: $('recentRow'),
    libraryView: $('libraryView'),
    filterChips: $('filterChips'),
    searchPlaylists: $('searchPlaylists'),
    bottomNav: $('bottomNav'),
    nowPlaying: document.querySelector('.now-playing'),
    wallpaper: $('wallpaper'),
    wallStage: $('wallStage'),
    wallLife: $('wallLife'),
    wallBtn: $('wallBtn'),
    wallBtnImg: $('wallBtnImg'),
    wallMode: $('wallMode'),
    wallGrid: $('wallGrid'),
    wallAlive: $('wallAlive'),
    djToggle: $('djToggle'),
    djFade: $('djFade'),
    djBtn: $('djBtn'),
    statsPanel: $('statsPanel'),
    tourDialog: $('tourDialog'),
    tourIcon: $('tourIcon'),
    tourTitle: $('tourTitle'),
    tourText: $('tourText'),
    tourCount: $('tourCount'),
    tourDots: $('tourDots'),
    tourPrev: $('tourPrev'),
    tourNext: $('tourNext'),
    tourSkip: $('tourSkip'),
    tourAgain: $('tourAgain'),
    labPanel: $('labPanel'),
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
    npShareBtn: $('npShareBtn'),
    npAbout: $('npAbout'),
    homePanel: $('homePanel'),
    searchPanel: $('searchPanel'),
    playerTrack: document.querySelector('.player-track'),
    player: document.querySelector('.player'),
    speedSelect: $('speedSelect'),
    announcer: $('announcer'),
    castBtn: $('castBtn'),
    errorReport: $('errorReport'),
    addDislike: $('addDislike'),
    addTitle: $('addTitle'),
    alphaRail: $('alphaRail'),
    trashDialog: $('trashDialog'),
    trashList: $('trashList'),
    offlinePill: $('offlinePill'),
    storageInfo: $('storageInfo'),
    installNote: $('installNote'),
    installBtn: $('installBtn'),
    installSteps: $('installSteps'),
    hiddenList: $('hiddenList'),
    hiddenEmpty: $('hiddenEmpty'),
    hiddenShowAll: $('hiddenShowAll'),
    ultraToggle: $('ultraToggle'),
    clearDownloads: $('clearDownloads'),
    autoFavToggle: $('autoFavToggle'),
    softPauseToggle: $('softPauseToggle'),
    addArtist: $('addArtist'),
    addRadio: $('addRadio'),
    shareDialog: $('shareDialog'),
    shareCanvas: $('shareCanvas'),
    shareColors: $('shareColors'),
    shareImage: $('shareImage'),
    shareLinkBtn: $('shareLinkBtn'),
    shareCopy: $('shareCopy'),
    shareTitleText: $('shareTitle'),
    queueEdit: $('queueEdit'),
    queueFoot: $('queueFoot'),
    addShare: $('addShare'),
    plDialog: $('plDialog'),
    plDialogTitle: $('plDialogTitle'),
    plName: $('plName'),
    plEmojis: $('plEmojis'),
    plColors: $('plColors'),
    plPortadas: $('plPortadas'),
    deviceInfo: $('deviceInfo'),
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
    updateBanner: $('updateBanner'),
    updateNow: $('updateNow'),
    updateLater: $('updateLater'),
    updateDetails: $('updateDetails'),
    updateNotes: $('updateNotes'),
    nextBtn: $('nextBtn'),
    repeatBtn: $('repeatBtn'),
    currentTime: $('currentTime'),
    progress: $('progress'),
    totalTime: $('totalTime'),
    muteBtn: $('muteBtn'),
    volume: $('volume'),
    toast: $('toast'),
    queueBtn: $('queueBtn'),
    queueDialog: $('queueDialog'),
    queueInfo: $('queueInfo'),
    queueList: $('queueList'),
    addPlayNext: $('addPlayNext'),
    addQueueEnd: $('addQueueEnd'),
    sleepBtn: $('sleepBtn'),
    sleepBadge: $('sleepBadge'),
    sleepDialog: $('sleepDialog'),
    sleepStatus: $('sleepStatus'),
    sleepOptions: $('sleepOptions')
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
      let raw;
      try { raw = JSON.stringify(value); } catch { return false; }
      let quotaFull = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          localStorage.setItem(key, raw);
          return true;
        } catch (error) {
          // Cuota llena: se libera lo que se puede volver a descargar (letras y copia de la
          // biblioteca) y se reintenta, para que favoritas y playlists nunca se pierdan en silencio
          quotaFull = isQuotaError(error);
          if (!quotaFull || !freeStorage(key, attempt)) break;
        }
      }
      /* localStorage no disponible (modo privado) o sin espacio ni nada que liberar */
      if (quotaFull && !storageWarned && key !== KEYS.libraryCache && !key.startsWith(KEYS.lyricsPrefix)) {
        storageWarned = true;
        setTimeout(() => showToast('No queda espacio para guardar en este navegador. Libera espacio o exporta tus playlists.'), 0);
      }
      return false;
    }
  };
  let storageWarned = false;

  function isQuotaError(error) {
    return error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22);
  }

  // Intento 0: borra la mitad más antigua de las letras. Intento 1: todas las letras y la copia de la biblioteca.
  function freeStorage(protectedKey, attempt) {
    const index = lyricsIndex.read();
    const all = attempt === 0 ? index.slice(0, Math.ceil(index.length / 2)) : index;
    let freed = false;
    all.forEach((id) => {
      try { localStorage.removeItem(KEYS.lyricsPrefix + id); freed = true; } catch { /* nada */ }
    });
    lyricsIndex.write(index.filter((id) => !all.includes(id)));
    if (attempt > 0 && protectedKey !== KEYS.libraryCache) {
      try {
        if (localStorage.getItem(KEYS.libraryCache) !== null) { localStorage.removeItem(KEYS.libraryCache); freed = true; }
      } catch { /* nada */ }
    }
    return freed;
  }

  // Letras guardadas: como mucho LYRICS_KEEP, se borran primero las que más tiempo llevan sin usarse
  const LYRICS_KEEP = 300;
  const lyricsIndex = {
    read() {
      try {
        const list = JSON.parse(localStorage.getItem(KEYS.lyricsIndex));
        if (Array.isArray(list)) return list;
      } catch { /* dañado: se reconstruye */ }
      // Primera vez (o índice dañado): se reconstruye con las letras que ya hay guardadas
      const list = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(KEYS.lyricsPrefix)) list.push(key.slice(KEYS.lyricsPrefix.length));
        }
      } catch { /* sin localStorage */ }
      return list;
    },
    write(list) {
      try { localStorage.setItem(KEYS.lyricsIndex, JSON.stringify(list)); } catch { /* sin espacio */ }
    },
    touch(id) {
      const list = this.read().filter((x) => x !== id);
      list.push(id);
      const drop = list.length > LYRICS_KEEP ? list.splice(0, list.length - LYRICS_KEEP) : [];
      drop.forEach((old) => { try { localStorage.removeItem(KEYS.lyricsPrefix + old); } catch { /* nada */ } });
      this.write(list);
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

  // "Kashmir - Remaster" → { main: 'Kashmir', version: 'Remaster' }: la versión se muestra aparte
  // y más discreta, y no se usa al buscar la letra
  const VERSION_WORDS = /\b(remaster(ed)?|bonus|live|edit|remix|mix|version|mono|stereo|demo|acoustic|instrumental|single|deluxe|session|take|reprise|extended|original)\b/i;
  function splitTitle(title) {
    const text = String(title || '');
    const cut = text.lastIndexOf(' - ');
    if (cut > 0 && VERSION_WORDS.test(text.slice(cut + 3))) {
      return { main: text.slice(0, cut).trim(), version: text.slice(cut + 3).trim() };
    }
    return { main: text, version: '' };
  }

  function setTitle(el, title) {
    const { main, version } = splitTitle(title);
    el.textContent = main;
    if (version) {
      const tag = document.createElement('span');
      tag.className = 'title-version';
      tag.textContent = version;
      el.append(' ', tag);
    }
  }

  /* ---------- Fondos de pantalla (carpeta wallpapers/) ---------- */
  // pos: zona que se mantiene a la vista cuando la imagen se recorta (pantallas anchas)
  const WALLPAPERS = [
    { id: '01', name: 'Girasoles que miran', pos: '50% 30%' },
    { id: '02', name: 'El reloj que sueña', pos: '50% 35%' },
    { id: '03', name: 'Atrapamoscas', pos: '60% 30%' },
    { id: '04', name: 'Sol de un ojo', pos: '55% 45%' },
    { id: '05', name: 'Rostro derretido', pos: '50% 60%' },
    { id: '06', name: 'Lluvia de ojos', pos: '50% 40%' },
    { id: '07', name: 'La corte lunar', pos: '50% 35%' },
    { id: '08', name: 'El caballero azul', pos: '50% 35%' },
    { id: '09', name: 'Desierto de manos', pos: '50% 60%' },
    { id: '10', name: 'Cuerpo rojo', pos: '50% 30%' },
    { id: '11', name: 'Sala de cirugía', pos: '45% 40%' },
    { id: '12', name: 'Hombre luna', pos: '50% 35%' },
    { id: '13', name: 'Cubos que observan', pos: '55% 35%' },
    { id: '14', name: 'Lluvia de señores', pos: '50% 40%' },
    { id: '15', name: 'El ojo entre manos', pos: '50% 50%' },
    { id: '16', name: 'Ajedrez de gotas', pos: '50% 60%' }
  ];
  const WALL_MODES = ['song', 'open', 'fixed', 'off'];
  const wallSrc = (id) => `wallpapers/${id}.jpg`;
  const wallIcon = (id) => `wallpapers/icons/${id}.jpg`;
  const wallThumb = (id) => `wallpapers/icons/${id}-thumb.jpg`;
  const isWallId = (id) => WALLPAPERS.some((w) => w.id === id);

  // Mini icono (recorte de un fondo) para títulos y adornos; el mismo texto da siempre el mismo
  function sticker(seedText) {
    const img = document.createElement('img');
    img.className = 'sticker';
    img.src = wallIcon(WALLPAPERS[hashString(seedText) % WALLPAPERS.length].id);
    img.alt = '';
    img.width = 22;
    img.height = 22;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.setAttribute('aria-hidden', 'true');
    return img;
  }

  // Icono de una playlist: un emoji o un mini icono de los fondos ("art:07")
  function setPlaylistIcon(el, icon) {
    const art = /^art:(\d{2})$/.exec(icon || '');
    if (art && isWallId(art[1])) {
      const img = document.createElement('img');
      img.src = wallIcon(art[1]);
      img.alt = '';
      el.classList.add('has-art');
      el.replaceChildren(img);
    } else {
      // Iconos SVG del sistema (antes emojis: los viejos se traducen al icono equivalente)
      el.classList.remove('has-art');
      const nombre = iconoDePlaylist(icon);
      el.replaceChildren(svgIcon(nombre, 'icon pl-glyph'));
    }
  }

  // Emojis que se usaban antes como icono de playlist → icono del sistema (escritos como código: el archivo no lleva emojis)
  const EMOJI_A_ICONO = {
    '\u{1F4BF}': 'disc', '\u{1F3A7}': 'headphones', '\u{1F525}': 'flame', '\u{1F319}': 'moon', '\u{1FAE7}': 'bubbles', '\u{1FAA9}': 'disc', '\u{1F49C}': 'heart', '\u{1F5A4}': 'heart',
    '\u{1F308}': 'spark', '\u{26A1}': 'bolt', '\u{1F352}': 'cherry', '\u{1F441}\u{FE0F}': 'eye', '\u{1F441}': 'eye', '\u{1F98B}': 'spark', '\u{1F30A}': 'wave', '\u{1F9E0}': 'flask', '\u{2728}': 'spark',
    '\u{1F558}': 'clock', '\u{1F3C6}': 'trophy', '\u{1F4E5}': 'inbox', '\u{1F381}': 'gift'
  };
  const ICONOS_PLAYLIST = ['disc', 'headphones', 'flame', 'moon', 'bubbles', 'heart', 'spark', 'star', 'bolt', 'cherry', 'eye', 'wave',
    'flask', 'note', 'radio', 'palette', 'mic', 'gem'];
  function iconoDePlaylist(icon) {
    const v = String(icon || '');
    if (v.startsWith('ic:') && ICONOS_PLAYLIST.concat(['clock', 'trophy', 'inbox', 'gift']).includes(v.slice(3))) return v.slice(3);
    return EMOJI_A_ICONO[v] || EMOJI_A_ICONO[v.replace(/\uFE0F/g, '')] || 'disc';
  }
  // Valor para guardar: icono del sistema o fondo (los emojis viejos se convierten)
  const iconoGuardable = (icon) => (/^art:/.test(String(icon || '')) ? icon : `ic:${iconoDePlaylist(icon)}`);

  /* ---------- Configuración (botón Ajustes) ---------- */
  const FONTS = ['street', 'graffiti', 'classic'];
  const TEXT_SIZES = ['system', 'small', 'normal', 'large', 'xl'];
  const settings = (() => {
    const saved = storage.get(KEYS.settings, {}) || {};
    const gains = Array.isArray(saved.eq?.gains) && saved.eq.gains.length === 5
      ? saved.eq.gains.map((g) => clamp(Number(g) || 0, -12, 12))
      : [0, 0, 0, 0, 0];
    return {
      font: FONTS.includes(saved.font) ? saved.font : 'street',
      textSize: TEXT_SIZES.includes(saved.textSize) ? saved.textSize : 'system',
      plView: saved.plView === 'list' ? 'list' : 'grid',
      motion: saved.motion !== false,
      haptics: saved.haptics !== false,
      wall: {
        mode: WALL_MODES.includes(saved.wall?.mode) ? saved.wall.mode : 'song',
        fixed: isWallId(saved.wall?.fixed) ? saved.wall.fixed : WALLPAPERS[0].id,
        alive: saved.wall?.alive !== false
      },
      eq: { preset: typeof saved.eq?.preset === 'string' ? saved.eq.preset : 'flat', gains },
      // Velocidad de reproducción (0.75×–1.5×) y fundido corto al pausar/reanudar
      speed: [0.75, 1, 1.1, 1.25, 1.5].includes(saved.speed) ? saved.speed : 1,
      softPause: saved.softPause !== false,
      // Descargar sola cada canción que marques con el corazón (solo con Wi-Fi o sin ahorro de datos)
      autoFav: saved.autoFav === true,
      // Modo ultraligero: sin vidrio, sombras, animaciones, fondo, visualizador ni letras descargadas
      ultra: saved.ultra === true,
      lastBackup: Number(saved.lastBackup) || 0,
      backupNagAt: Number(saved.backupNagAt) || 0
    };
  })();
  const saveSettings = () => storage.set(KEYS.settings, settings);

  // «lite» lo pone detectLiteMode en equipos modestos; el modo ultraligero lo fuerza
  let autoLite = false;
  function applyLook() {
    const root = document.documentElement;
    root.classList.toggle('ultra', settings.ultra);
    root.classList.toggle('lite', autoLite || settings.ultra);
    root.dataset.font = settings.font;
    window.lbLoadFonts?.(root.dataset.theme, settings.font);
    root.dataset.text = settings.textSize;
    root.classList.toggle('no-motion', !settings.motion || settings.ultra);
  }

  // Vibración corta (Android); iOS no deja vibrar desde la web
  function haptic(pattern = 10) {
    if (settings.ultra) return;
    if (settings.haptics && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(pattern); } catch { /* sin permiso */ }
    }
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
  // Aviso flotante; con «action» lleva un botón (p. ej. Deshacer) y dura un poco más
  function showToast(message, action = null) {
    els.toast.replaceChildren(document.createTextNode(message));
    els.toast.classList.toggle('has-action', Boolean(action));
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast-action';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        els.toast.classList.remove('is-visible');
        action.run();
      }, { once: true });
      els.toast.append(button);
    }
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), action ? 5500 : 3200);
  }

  /* ---------- Carga de datos ---------- */
  // Convierte "carpeta/cancion.mp3" en la URL pública del bucket; las URLs completas se dejan igual
  function resolveMediaUrl(path, source = CONFIG.sources[0]) {
    const value = typeof path === 'string' ? path.trim() : '';
    const base = (source?.base || '').replace(/\/+$/, '');
    if (!value || /^(https?:|data:|blob:)/i.test(value) || !base) return value;
    const cleanPath = value.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
    return `${base}/${cleanPath}`;
  }

  async function fetchFromList(source) {
    const response = await fetch(source.list, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    return rows.map((row) => ({ ...row, source }));
  }

  async function fetchFromJson() {
    const response = await fetch(CONFIG.tracksUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  // Lee todas las listas en paralelo; una caída no impide mostrar las demás
  async function fetchTrackData() {
    const results = await Promise.allSettled(CONFIG.sources.map(fetchFromList));
    const rows = [];
    let anyOk = false;
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        anyOk = true;
        rows.push(...result.value);
      } else {
        console.warn(`[LiquidBullet] Lista "${CONFIG.sources[i].name}" no disponible.`, result.reason);
      }
    });
    if (anyOk) return rows;
    console.warn('[LiquidBullet] Ninguna lista respondió, se usa tracks.json.');
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
      id: `${source.name}:${rawId}`,
      title,
      // Sin artista se muestra el nombre de la playlist
      artist: t.artist || album || 'Artista desconocido',
      knownArtist: t.artist || '',
      album,
      duration: t.duration || '',
      src: resolveMediaUrl(t.src, source),
      // Sin carátula propia: la foto de su playlist (la pone applyTrackData); el dibujo generado es el último recurso
      photo: '',
      get cover() { return coverUrl || this.photo || getArt().url; },
      get thumb() { return coverUrl || (this.photo ? this.photo.replace(/\.jpg$/, '-sm.jpg') : getArt().url); },
      get hue() { return coverUrl || this.photo ? null : getArt().hue; },
      lyrics: typeof t.lyrics === 'string' ? t.lyrics : '',
      genre: ''
    };
  }

  // Canciones duplicadas que se quitaron: favoritas, playlists propias e historial pasan a la copia que queda
  function applyAliases(aliases) {
    if (!aliases || !Object.keys(aliases).length) return;
    const map = (id) => aliases[id] || id;
    const favorites = new Set([...state.favorites].map(map));
    if (favorites.size !== state.favorites.size || [...state.favorites].some((id) => aliases[id])) {
      state.favorites = favorites;
      storage.set(KEYS.favorites, [...favorites]);
    }
    let changed = false;
    library.local.forEach((p) => {
      const ids = [...new Set(p.trackIds.map(map))];
      if (ids.join() !== p.trackIds.join()) { p.trackIds = ids; changed = true; }
    });
    if (changed) saveLocalPlaylists();
    if (library.recent.some((id) => aliases[id])) {
      library.recent = [...new Set(library.recent.map(map))];
      storage.set(KEYS.recent, library.recent);
    }
    Object.entries(aliases).forEach(([from, to]) => {
      [taste.heard, taste.skips].forEach((map) => {
        if (map[from] === undefined) return;
        map[to] = Math.max(Number(map[to]) || 0, Number(map[from]) || 0);
        delete map[from];
        taste.dirty = true;
      });
      if (library.plays[from]) {
        library.plays[to] = (library.plays[to] || 0) + library.plays[from];
        delete library.plays[from];
        storage.set(KEYS.plays, library.plays);
      }
    });
  }

  // Identifica la canción (no la copia): la misma canción puede estar repetida con ids distintos
  function songKey(track) {
    const slug = (text) => normalize(String(text || '').replace(/\(.*?\)|\[.*?\]/g, ''))
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
    const title = slug(track.title) || track.id;
    return `song:${title}~${slug(dedupeArtist(track))}`.slice(0, 120);
  }

  async function applyTrackData(data, final = false) {
    const previousId = state.currentTrack?.id;
    state.tracks = data.filter((t) => t && typeof t.src === 'string' && t.src.trim()).map(buildTrack);
    state.trackMap = new Map(state.tracks.map((t) => [t.id, t]));
    applyAliases(library.catalog?.aliases);
    state.tracks.forEach((t) => {
      t.genre = library.catalog?.genres?.[t.id] || '';
      t.songKey = songKey(t);
    });
    // Respaldo: la foto de su playlist (las copias repetidas, la de la copia que quedó)
    const photoOf = new Map();
    systemPlaylists().forEach((pl) => {
      if (pl.cover?.type === 'image') pl.trackIds.forEach((id) => photoOf.set(id, pl.cover.src));
    });
    const photoBySong = new Map();
    state.tracks.forEach((t) => { if (photoOf.has(t.id)) photoBySong.set(t.songKey, photoOf.get(t.id)); });
    // Portada propia de cada canción: uno de los iconos de covers/songs/ (lo reparte build_catalog.py)
    const songFiles = library.catalog?.songCoverFiles || [];
    const songCovers = library.catalog?.songCovers || {};
    state.tracks.forEach((t) => {
      t.photo = songFiles[songCovers[t.id]] || photoOf.get(t.id) || photoBySong.get(t.songKey) || '';
    });
    labIndex = null;
    // La Biblioteca muestra una sola copia de cada canción (algunas están en varias fuentes)
    const seenSongs = new Set();
    state.libraryTracks = state.tracks.filter((t) => !seenSongs.has(t.songKey) && seenSongs.add(t.songKey));
    await refreshDownloads();
    if (final) {
      trackArrivals();
      maybeRemindBackup();
    }
    if (eqActive()) probeCors().then(updateEqNote);

    // Si la playlist que estaba abierta ya no existe, se vuelve a Playlists
    if (state.view === 'playlist' && !getPlaylist(state.openPlaylist)) state.view = 'playlists';
    const scroll = window.scrollY;
    setView(state.view, { keepScroll: true });
    window.scrollTo(0, scroll);

    if (previousId && getTrack(previousId)) {
      // Llegaron datos nuevos con algo sonando: se conserva la canción y la cola
      state.currentTrack = getTrack(previousId);
    } else if (state.tracks.length) {
      if (!resume.restore()) {
        buildQueue((state.tracks.find(isPlayable) || state.tracks[0]).id);
        loadTrack(getTrack(state.queue[state.queueIndex]), false);
      }
    } else {
      els.npContext.textContent = 'Biblioteca vacía';
    }
    openIncomingLink(Boolean(final));
  }

  // Recordatorio suave: con playlists propias y sin copia en 30 días (como mucho una vez por semana)
  function maybeRemindBackup() {
    const day = 86400000;
    const now = Date.now();
    if (!library.local.length) return;
    if (now - settings.lastBackup < 30 * day || now - settings.backupNagAt < 7 * day) return;
    settings.backupNagAt = now;
    saveSettings();
    setTimeout(() => showToast('Tus playlists viven solo en este navegador. ¿Guardas una copia?', { label: 'Descargar', run: exportPlaylists }), 6000);
  }

  /* ---------- Novedades: canciones que llegaron desde tu última visita ---------- */
  // Se guarda una huella corta de cada canción conocida (~7 caracteres) y, de las nuevas, el día en que llegaron.
  const NEW_DAYS = 30;
  const arrivals = { added: {}, freshCount: 0 };
  const fingerprint = (id) => hashString(id).toString(36).slice(0, 6);

  function trackArrivals() {
    if (!state.tracks.length) return;
    const stored = storage.get(KEYS.known, null);
    arrivals.added = storage.get(KEYS.added, {}) || {};
    const ids = state.libraryTracks.map((t) => t.id);
    const prints = ids.map(fingerprint);
    if (typeof stored !== 'string') {
      // Primera visita: todo es «conocido», nada sale como nuevo
      storage.set(KEYS.known, prints.join(','));
      return;
    }
    const known = new Set(stored.split(','));
    const now = Date.now();
    let fresh = 0;
    ids.forEach((id, i) => {
      if (!known.has(prints[i]) && !arrivals.added[id]) {
        arrivals.added[id] = now;
        fresh++;
      }
    });
    // Solo se guardan las llegadas del último mes y las que siguen existiendo
    const limit = now - NEW_DAYS * 86400000;
    Object.keys(arrivals.added).forEach((id) => {
      if (arrivals.added[id] < limit || !getTrack(id)) delete arrivals.added[id];
    });
    arrivals.freshCount = fresh;
    storage.set(KEYS.added, arrivals.added);
    storage.set(KEYS.known, prints.join(','));
    updateAppBadge();
  }

  function newArrivals() {
    return Object.entries(arrivals.added)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => getTrack(id))
      .filter(Boolean);
  }

  // Número en el icono de la app instalada: canciones nuevas aún sin escuchar
  function updateAppBadge() {
    if (typeof navigator.setAppBadge !== 'function') return;
    const unheard = newArrivals().filter((t) => !library.plays[t.id]).length;
    (unheard ? navigator.setAppBadge(unheard) : navigator.clearAppBadge()).catch(() => {});
  }

  /* Almacén grande en IndexedDB para la copia de la biblioteca (~2 MB). En localStorage ocupaba
     casi la mitad de los ~5 MB de Safari y su JSON.parse frenaba el arranque. */
  const bigStore = (() => {
    let opening = null;
    function open() {
      if (!opening) {
        opening = new Promise((resolve, reject) => {
          if (!window.indexedDB) { reject(new Error('sin IndexedDB')); return; }
          const request = indexedDB.open('liquidbrush', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('kv');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('IndexedDB bloqueada'));
        });
        opening.catch(() => { opening = null; });
      }
      return opening;
    }
    async function run(mode, action) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', mode);
        const request = action(tx.objectStore('kv'));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('IndexedDB: transacción cancelada'));
      });
    }
    return {
      get: (key) => run('readonly', (store) => store.get(key)),
      set: (key, value) => run('readwrite', (store) => store.put(value, key))
    };
  })();
  const LIBRARY_IDB_KEY = 'library-cache';
  const LIBRARY_IDB_FLAG = 'liquidbrush:library-idb';
  // Huella de la biblioteca para saber si cambió: SHA-1 nativo (unos ms) en vez de recorrer ~2 MB en JS (~85 ms en un móvil medio)
  async function librarySignature(raw) {
    try {
      const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(raw));
      return `${raw.length}:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    } catch {
      return `${raw.length}:${hashString(raw)}`;
    }
  }

  // Abre al instante con la biblioteca de la última visita y la actualiza en segundo plano
  async function loadTracks() {
    let cached = null;
    let cachedSig = '';
    try {
      cached = await bigStore.get(LIBRARY_IDB_KEY);
      cachedSig = cached?.sig || '';
    } catch { /* sin IndexedDB: se usa localStorage como antes */ }
    // Copia antigua en localStorage (versiones anteriores o navegador sin IndexedDB)
    let legacyRaw = null;
    try { legacyRaw = localStorage.getItem(KEYS.libraryCache); } catch { /* sin localStorage */ }
    if (!cached && legacyRaw) {
      try {
        cached = JSON.parse(legacyRaw);
        cachedSig = await librarySignature(legacyRaw);
      } catch (error) {
        console.warn('[LiquidBullet] Copia local de la biblioteca dañada; se descarga de nuevo.', error);
      }
    }
    let shown = false;
    if (cached && Array.isArray(cached.rows) && cached.rows.length) {
      library.catalog = cached.catalog || null;
      await applyTrackData(cached.rows);
      shown = true;
    }
    if (!shown) els.listInfo.textContent = 'Cargando canciones…';

    try {
      const [data] = await Promise.all([fetchTrackData(), loadCatalog()]);
      if (!Array.isArray(data)) throw new Error('La lista de canciones debe ser un array');
      const rows = data.map(({ source, ...rest }) => (source ? { ...rest, sourceName: source.name } : rest));
      const fresh = JSON.stringify({ rows, catalog: library.catalog });
      const freshSig = await librarySignature(fresh);
      const unchanged = freshSig === cachedSig;
      if (!unchanged) await applyTrackData(rows, true);
      else openIncomingLink(true);
      // Se guarda en IndexedDB; al lograrlo se borra la copia de localStorage (libera ~2 MB)
      let savedInIdb = unchanged && Boolean(cached?.sig);
      if (!savedInIdb) {
        try {
          await bigStore.set(LIBRARY_IDB_KEY, { sig: freshSig, rows, catalog: library.catalog });
          savedInIdb = true;
        } catch { /* sin IndexedDB o sin espacio */ }
      }
      if (savedInIdb) {
        try {
          localStorage.setItem(LIBRARY_IDB_FLAG, '1');
          if (legacyRaw !== null) localStorage.removeItem(KEYS.libraryCache);
        } catch { /* sin localStorage */ }
      } else if (!unchanged) {
        // Sin IndexedDB: como antes. Sin espacio se liberan letras antiguas; si no cabe, se descargará la próxima vez
        for (let attempt = 0; attempt < 2; attempt++) {
          try { localStorage.setItem(KEYS.libraryCache, fresh); break; } catch (error) {
            if (!isQuotaError(error) || !freeStorage(KEYS.libraryCache, 0)) break;
          }
        }
      }
    } catch (error) {
      console.error('[LiquidBullet] Error al cargar las canciones:', error);
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
      console.warn('[LiquidBullet] No se pudieron leer las descargas.', error);
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
    if (!meta) return;
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
    // Solo las cabeceras de playlist (la de un artista también es .pl-hero, pero sin descargas)
    els.viewHead.querySelectorAll('.pl-hero[data-key]').forEach(updatePlaylistHeader);
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
  // Todos los navegadores de iPhone/iPad usan WebKit: mismas limitaciones de audio que Safari
  const IS_IOS = DEVICE.apple;

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

  // Descarga una sola canción (corazón con «Descargar favoritas» activado)
  async function downloadTrack(track) {
    if (!offline.supported || !track || isDownloaded(track) || !navigator.onLine) return false;
    const connection = navigator.connection;
    if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType)) return false;
    try {
      navigator.storage?.persist?.().catch(() => {});
      const response = await fetchForOffline(track);
      await (await caches.open(AUDIO_CACHE)).put(cacheKey(track.src), response);
      offline.downloaded.add(cacheKey(track.src));
      updateDownloadUI();
      return true;
    } catch (error) {
      console.warn(`[LiquidBullet] No se pudo descargar «${track.title}».`, error);
      return false;
    }
  }

  // Ajustes → Descargas: espacio usado y borrar todo
  async function renderStorageInfo() {
    if (!els.storageInfo) return;
    if (!offline.supported) {
      els.storageInfo.textContent = 'Este navegador no permite descargar canciones.';
      els.clearDownloads.hidden = true;
      return;
    }
    await refreshDownloads();
    const count = offline.downloaded.size;
    let text = count ? `${songsLabel(count)} descargada${count === 1 ? '' : 's'}` : 'No tienes canciones descargadas';
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.usage) {
        text += ` · la app ocupa ${formatBytes(estimate.usage)}`;
        if (estimate.quota) text += ` de ${formatBytes(estimate.quota)} disponibles`;
      }
      const persisted = await navigator.storage?.persisted?.();
      if (persisted) text += ' · protegidas contra el borrado automático';
    } catch { /* sin estimación */ }
    els.storageInfo.textContent = `${text}.`;
    els.clearDownloads.hidden = !count;
  }

  async function clearAllDownloads() {
    if (!confirm('¿Borrar todas las canciones descargadas? Tendrás que volver a descargarlas para escucharlas sin conexión.')) return;
    await caches.delete(AUDIO_CACHE);
    await refreshDownloads();
    updateDownloadUI();
    renderStorageInfo();
    showToast('Descargas borradas.');
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
          console.warn(`[LiquidBullet] No se pudo descargar «${track.title}».`, error);
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
    else if (failed) showToast(`«${name}»: ${failed} canci${failed === 1 ? 'ón' : 'ones'} no se pudieron descargar. Toca Descargar para reintentar.`);
    else showToast(`«${name}» lista para escuchar sin conexión.`);
  }

  function updateOnlineStatus(notify = false) {
    const isOffline = !navigator.onLine;
    document.body.classList.toggle('is-offline', isOffline);
    els.offlinePill.hidden = !isOffline;
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

  // Actualizaciones: cuando se publica una versión nueva, sale un aviso con «Actualizar».
  // El service worker nuevo espera (no se activa solo) hasta que lo pides; entonces se guarda
  // la canción y el segundo exacto, se recarga y sigue donde ibas.
  const updater = { registration: null, waiting: null, reloading: false };

  function showUpdateBanner(worker) {
    updater.waiting = worker;
    if (!els.updateBanner) return;
    els.updateBanner.hidden = false;
    requestAnimationFrame(() => els.updateBanner.classList.add('is-visible'));
  }

  function hideUpdateBanner() {
    if (!els.updateBanner) return;
    els.updateBanner.classList.remove('is-visible');
    els.updateBanner.hidden = true;
  }

  function applyUpdate() {
    const worker = updater.waiting || updater.registration?.waiting;
    state.resumeAfterReload = !els.audio.paused;
    resume.save(true);
    resume.flushQueue();
    flushListening();
    if (state.resumeAfterReload) storage.set(KEYS.resumeAutoplay, Date.now());
    if (els.updateNow) {
      els.updateNow.disabled = true;
      els.updateNow.textContent = 'Actualizando…';
    }
    if (!worker) {
      // Sin worker en espera (p. ej. ya se activó en otra pestaña): basta con recargar
      location.reload();
      return;
    }
    worker.postMessage({ type: 'SKIP_WAITING' });
    // Por si el navegador no avisa del cambio, se recarga igual a los 3 s
    setTimeout(() => { if (!updater.reloading) location.reload(); }, 3000);
  }

  async function renderPatchNotes(target = els.updateNotes) {
    target.textContent = 'Cargando novedades…';
    try {
      const response = await fetch(`novedades.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const releases = (Array.isArray(data.releases) ? data.releases : []).slice(0, 3);
      if (!releases.length) throw new Error('vacío');
      const parts = releases.map((release) => {
        const block = document.createElement('section');
        const title = makeEl('h4', '', release.title || 'Novedades');
        if (release.date) title.append(' ', makeEl('span', 'update-date', release.date));
        const listEl = document.createElement('ul');
        (release.items || []).forEach((item) => listEl.append(makeEl('li', '', item)));
        block.append(title, listEl);
        return block;
      });
      target.replaceChildren(...parts);
    } catch {
      target.textContent = navigator.onLine
        ? 'No se pudo cargar el detalle ahora. Actualiza y míralo en Ajustes → Ayuda → Novedades.'
        : 'Sin conexión: las novedades se ven al volver a tener internet.';
    }
  }

  function watchRegistration(registration) {
    updater.registration = registration;
    if (registration.waiting && navigator.serviceWorker.controller) showUpdateBanner(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        // «installed» con una versión ya activa = hay una nueva esperando
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(worker);
      });
    });
    // Busca versiones nuevas al volver a la app y cada 30 minutos
    const check = () => { registration.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 30 * 60000);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(watchRegistration)
      .catch((error) => {
        console.warn('[LiquidBullet] No se pudo activar el modo offline.', error);
      });

    els.updateNow?.addEventListener('click', applyUpdate);
    // Ajustes → Ayuda → Novedades de esta versión
    const whatsNew = document.getElementById('whatsNew');
    whatsNew?.addEventListener('toggle', () => {
      const body = document.getElementById('whatsNewBody');
      if (whatsNew.open && body && !body.childElementCount) renderPatchNotes(body);
    });
    // «¿Qué trae?»: el detalle del parche (novedades.json), oculto hasta que lo pides
    els.updateDetails?.addEventListener('click', async () => {
      const open = els.updateNotes.hidden;
      els.updateNotes.hidden = !open;
      els.updateDetails.setAttribute('aria-expanded', String(open));
      els.updateDetails.textContent = open ? 'Ocultar' : '¿Qué trae?';
      if (open && !els.updateNotes.childElementCount) await renderPatchNotes();
    });
    els.updateLater?.addEventListener('click', () => {
      hideUpdateBanner();
      showToast('Se actualizará la próxima vez que abras Liquid Bullet.');
    });

    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || updater.reloading) return;
      updater.reloading = true;
      location.reload();
    });
  }

  /* ---------- Playlists ---------- */
  // Oficiales: las del catálogo (o una por "album").
  // Mías: solo en este navegador (localStorage). Automáticas: recientes y más escuchadas.
  const PLAYLIST_EMOJIS = ['ic:disc', 'ic:headphones', 'ic:flame', 'ic:moon', 'ic:bubbles', 'ic:heart', 'ic:spark', 'ic:star', 'ic:bolt',
    'ic:cherry', 'ic:eye', 'ic:wave', 'ic:flask', 'ic:note', 'ic:radio', 'ic:palette', 'ic:mic', 'ic:gem',
    ...WALLPAPERS.map((w) => `art:${w.id}`)];
  // Portadas para las playlists que crea cada persona (covers/propias/). Solo se eligen en
  // Nueva playlist / Editar playlist: nunca se asignan a las playlists de base ni a las automáticas.
  const PORTADAS_PROPIAS = [
    { id: '01', name: 'Cromo encapuchado' },
    { id: '02', name: 'Ola que mira' },
    { id: '03', name: 'Tigres de luz' },
    { id: '04', name: 'Dragón del desierto' },
    { id: '05', name: 'Leopardo y destellos' },
    { id: '06', name: 'Collage dorado' },
    { id: '07', name: 'Cabeza de madera' },
    { id: '08', name: 'Silueta de tigre' },
    { id: '09', name: 'Caballeros de taberna' },
    { id: '10', name: 'Lluvia verde' },
    { id: '11', name: 'Cuerno ácido' }
  ];
  const portadaValida = (id) => (PORTADAS_PROPIAS.some((p) => p.id === id) ? id : '');
  const portadaSrc = (id, small = false) => `covers/propias/propia-${id}${small ? '-sm' : ''}.jpg`;
  // Icono pequeño de una playlist propia: su portada si la tiene; si no, su icono
  function setLocalGlyph(el, p) {
    const portada = portadaValida(p.portada);
    if (!portada) { setPlaylistIcon(el, p.emoji); return; }
    const img = document.createElement('img');
    img.src = portadaSrc(portada, true);
    img.alt = '';
    img.loading = 'lazy';
    el.classList.add('has-art');
    el.replaceChildren(img);
  }
  const PLAYLIST_COLORS = ['#8a93a6', '#ff7ad9', '#7ef9ff', '#ffe27a', '#7a5cff', '#ff5f6d', '#3ddc97', '#ff9f43'];
  const RECENT_LIMIT = 50;
  const TOP_LIMIT = 30;
  const SORTS = {
    original: 'Orden original',
    genre: 'Género',
    title: 'Título (A-Z)',
    artist: 'Artista (A-Z)',
    recent: 'Escuchadas hace poco',
    plays: 'Más escuchadas',
    long: 'Más largas primero',
    short: 'Más cortas primero',
    added: 'Añadidas recientemente'
  };
  const VIEWS = ['home', 'library', 'playlists', 'artists', 'favorites', 'stats', 'lab'];

  const library = {
    catalog: null,
    local: [],
    recent: [],
    plays: {},
    // Playlists fijadas arriba (claves "sys:…", "local:…"), solo en este dispositivo
    pins: [],
    // Playlists ocultas (claves "sys:…", "local:…"): no salen en Playlists, Inicio, Buscar ni Lab
    hidden: [],
    // Artistas que sigues y lo último que buscaste (solo en este navegador)
    follows: [],
    searches: []
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
    // Sin catálogo: una playlist por cada "album" de la lista de canciones
    const groups = new Map();
    state.tracks.forEach((t) => {
      if (!t.album) return;
      if (!groups.has(t.album)) groups.set(t.album, []);
      groups.get(t.album).push(t.id);
    });
    return [...groups].map(([name, trackIds]) => ({ key: `sys:${name}`, kind: 'system', name, trackIds }));
  }

  function localPlaylists() {
    return library.local.map((p) => ({
      key: `local:${p.id}`, kind: 'local', id: p.id, name: p.name,
      emoji: p.emoji, color: p.color, trackIds: p.trackIds,
      portada: portadaValida(p.portada),
      ...(portadaValida(p.portada) ? { cover: { type: 'image', src: portadaSrc(p.portada) } } : {})
    }));
  }

  function autoPlaylists() {
    const top = Object.entries(library.plays)
      .filter(([id]) => state.trackMap.has(id))
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_LIMIT)
      .map(([id]) => id);
    return [
      { key: 'auto:recent', kind: 'auto', name: 'Escuchadas hace poco', emoji: 'ic:clock', color: '#7ef9ff', cover: { type: 'image', src: 'covers/cover-27.jpg' }, trackIds: library.recent },
      { key: 'auto:top', kind: 'auto', name: 'Tus más escuchadas', emoji: 'ic:trophy', color: '#ffe27a', cover: { type: 'image', src: 'covers/cover-28.jpg' }, trackIds: top }
    ];
  }

  function getPlaylist(key) {
    if (!key) return null;
    const [kind] = key.split(':');
    const list = { sys: systemPlaylists, local: localPlaylists, auto: autoPlaylists }[kind];
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
    taste.markHeard(id);
    if (state.view === 'library') renderRecentRow();
  }

  async function loadCatalog() {
    try {
      const response = await fetch(CONFIG.catalogUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      library.catalog = await response.json();
    } catch (error) {
      console.warn('[LiquidBullet] No se pudo cargar el catálogo de playlists.', error);
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

  function openDialog(dialog) {
    return new Promise((resolve) => {
      dialog.returnValue = '';
      dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
      dialog.showModal();
    });
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
    const portada = portadaValida(existing?.portada);
    fillChoices(els.plPortadas, 'plPortada', ['', ...PORTADAS_PROPIAS.map((p) => p.id)], portada, (face, value) => {
      face.classList.add('portada-face');
      if (!value) {
        face.classList.add('is-none');
        face.textContent = 'Sin portada';
        face.title = 'Sin portada: mosaico con las portadas de sus canciones';
        return;
      }
      const name = PORTADAS_PROPIAS.find((p) => p.id === value)?.name || '';
      const img = document.createElement('img');
      img.src = portadaSrc(value, true);
      img.alt = name;
      img.loading = 'lazy';
      img.width = 64;
      img.height = 64;
      face.title = name;
      face.append(img);
    });
    fillChoices(els.plEmojis, 'plEmoji', PLAYLIST_EMOJIS, emoji, (face, value) => setPlaylistIcon(face, value));
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
      color: els.plDialog.querySelector('input[name="plColor"]:checked')?.value || color,
      portada: portadaValida(els.plDialog.querySelector('input[name="plPortada"]:checked')?.value || '')
    };
  }

  async function createPlaylist(initialTrackIds = []) {
    const data = await editPlaylistDialog(null);
    if (!data) return null;
    const playlist = { id: newId(), ...data, trackIds: [...new Set(initialTrackIds)], createdAt: Date.now() };
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

  // Las playlists borradas pasan 30 días en la papelera (Playlists → Papelera)
  const TRASH_DAYS = 30;
  function trashList() {
    const limit = Date.now() - TRASH_DAYS * 86400000;
    const list = (storage.get(KEYS.trash, []) || []).filter((p) => p && p.deletedAt > limit);
    return list;
  }

  function deleteLocalPlaylist(id) {
    const playlist = findLocal(id);
    if (!playlist || !confirm(`¿Eliminar «${playlist.name}»? Podrás recuperarla durante ${TRASH_DAYS} días desde la Papelera.`)) return;
    library.local = library.local.filter((p) => p.id !== id);
    saveLocalPlaylists();
    storage.set(KEYS.trash, [{ ...playlist, deletedAt: Date.now() }, ...trashList()].slice(0, 30));
    setView('playlists');
    showToast(`«${playlist.name}» eliminada.`, { label: 'Deshacer', run: () => restoreFromTrash(playlist.id) });
  }

  function openTrash() {
    const list = trashList();
    const rows = list.map((p) => {
      const li = document.createElement('li');
      const days = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - p.deletedAt) / 86400000));
      const button = makeButton('btn trash-restore', 'restore', `Recuperar ${p.name}`, '', p.name);
      const glifo = makeEl('span', 'trash-icon');
      setLocalGlyph(glifo, p);
      button.prepend(glifo);
      button.dataset.id = p.id;
      li.append(button, makeEl('span', 'sheet-note', `${songsLabel(p.trackIds.length)} · se borra del todo en ${days} día${days === 1 ? '' : 's'}`));
      return li;
    });
    if (!rows.length) rows.push(makeEl('li', 'sheet-note', 'La papelera está vacía.'));
    els.trashList.replaceChildren(...rows);
    els.trashDialog.showModal();
  }

  function restoreFromTrash(id) {
    const list = trashList();
    const entry = list.find((p) => p.id === id);
    if (!entry) return;
    const playlist = { ...entry };
    delete playlist.deletedAt;
    if (findLocal(playlist.id)) playlist.id = newId();
    library.local.push(playlist);
    saveLocalPlaylists();
    storage.set(KEYS.trash, list.filter((p) => p.id !== id));
    renderList();
    showToast(`«${playlist.name}» recuperada.`);
  }

  function copyToLocal(pl) {
    const playlist = {
      id: newId(),
      name: `${pl.name} (${pl.kind === 'local' ? 'copia' : 'mía'})`.slice(0, 60),
      emoji: iconoGuardable(pl.emoji),
      color: pl.color || PLAYLIST_COLORS[Math.floor(Math.random() * PLAYLIST_COLORS.length)],
      portada: pl.kind === 'local' ? portadaValida(pl.portada) : '',
      trackIds: playlistTracksOf(pl).map((t) => t.id),
      createdAt: Date.now()
    };
    library.local.push(playlist);
    saveLocalPlaylists();
    openPlaylist(`local:${playlist.id}`);
    showToast(`Copiada a tus playlists: «${playlist.name}».`);
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
    const before = playlist.trackIds.slice();
    playlist.trackIds = playlist.trackIds.filter((t) => t !== trackId);
    saveLocalPlaylists();
    renderList();
    const title = getTrack(trackId)?.title || 'la canción';
    showToast(`Quitaste «${title}» de ${playlist.name}.`, {
      label: 'Deshacer',
      run: () => {
        playlist.trackIds = before;
        saveLocalPlaylists();
        renderList();
      }
    });
  }

  let addTarget = null;
  let addBulk = null;

  // «Añadir todas»: lo que estás viendo (búsqueda, filtro, artista…) a una playlist propia
  function openBulkAddDialog(ids) {
    const unique = [...new Set(ids)].filter((id) => getTrack(id));
    if (!unique.length) return;
    openAddDialog(unique[0]);
    addTarget = null;
    addBulk = unique;
    els.addTitle.textContent = 'Añadir todas a una playlist';
    els.addTrackName.textContent = `${songsLabel(unique.length)} de la lista que estás viendo`;
    els.addPlayNext.parentElement.hidden = true;
    els.addList.querySelectorAll('.add-item').forEach((button) => {
      const pl = findLocal(button.dataset.id);
      const missing = unique.filter((id) => !pl.trackIds.includes(id)).length;
      button.disabled = !missing;
      button.querySelector('.add-meta').textContent = missing ? `+${missing}` : 'Ya están todas';
    });
  }

  function openAddDialog(trackId) {
    addBulk = null;
    if (els.addTitle) els.addTitle.textContent = 'Añadir a playlist';
    els.addPlayNext.parentElement.hidden = false;
    if (els.addDislike) {
      const label = els.addDislike.querySelector('span');
      if (label) label.textContent = isDisliked(trackId) ? 'Volver a recomendarla' : 'No me gusta (no recomendar)';
    }
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
        setLocalGlyph(emoji, p);
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
      app: 'Liquid Bullet',
      version: 1,
      exportedAt: new Date().toISOString(),
      playlists: library.local,
      favorites: [...state.favorites]
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `liquid-bullet-mis-playlists-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    settings.lastBackup = Date.now();
    saveSettings();
    showToast('Copia de seguridad descargada.');
  }

  // Una playlist como .m3u (con las URLs de los MP3): se abre en VLC y otros reproductores
  function exportM3U(pl) {
    const tracks = playlistTracksOf(pl);
    if (!tracks.length) return;
    const lines = ['#EXTM3U', `#PLAYLIST:${pl.name}`];
    tracks.forEach((t) => {
      lines.push(`#EXTINF:${Math.round(parseDuration(t.duration)) || -1},${t.artist} - ${t.title}`);
      lines.push(new URL(t.src, location.href).href);
    });
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'audio/x-mpegurl' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${pl.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'playlist'}.m3u`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast(`«${pl.name}» descargada como .m3u.`);
  }

  // Importar una lista de texto o .m3u: cada línea «Artista - Título» se busca en tu biblioteca
  function importTextPlaylist(name, text) {
    const lines = text.split(/\r?\n/)
      .map((line) => line.replace(/^#EXTINF:[^,]*,/, '').trim())
      .filter((line) => line && !line.startsWith('#') && !/^https?:\/\//.test(line));
    const ids = [];
    let missing = 0;
    lines.forEach((line) => {
      const found = searchTracks(state.libraryTracks, line.replace(/\s+[-–—]\s+/g, ' ').replace(/\.(mp3|m4a|flac)$/i, ''))[0];
      if (found && !ids.includes(found.id)) ids.push(found.id);
      else if (!found) missing++;
    });
    if (!ids.length) {
      showToast('No encontré ninguna de esas canciones en tu biblioteca.');
      return;
    }
    const playlist = {
      id: newId(), name: name.slice(0, 60) || 'Importada', emoji: 'ic:inbox',
      color: PLAYLIST_COLORS[Math.floor(Math.random() * PLAYLIST_COLORS.length)],
      trackIds: ids, createdAt: Date.now()
    };
    library.local.push(playlist);
    saveLocalPlaylists();
    openPlaylist(`local:${playlist.id}`);
    showToast(`«${playlist.name}»: ${songsLabel(ids.length)} encontradas${missing ? `, ${missing} no están en Liquid` : ''}.`);
  }

  async function importPlaylists(file) {
    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
      importTextPlaylist(file.name.replace(/\.[^.]+$/, ''), await file.text());
      return;
    }
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
          emoji: iconoGuardable(typeof p.emoji === 'string' ? p.emoji.slice(0, 16) : ''),
          color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : PLAYLIST_COLORS[0],
          portada: portadaValida(String(p.portada || '')),
          trackIds: p.trackIds.map(String),
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
      console.warn('[LiquidBullet] No se pudo importar:', error);
      showToast('Ese archivo no es una copia de seguridad de Liquid Bullet.');
    }
  }

  /* ---------- Transiciones DJ ---------- */
  // Dos reproductores: al final de cada canción la siguiente entra por el otro y se mezclan
  // con una curva de potencia constante. "Inteligente": la mezcla se acorta en canciones
  // cortas, no se usa con «repetir una» y al saltar a mano es un fundido rápido.
  // Dos reproductores normales y dos que pasan por el ecualizador (Web Audio: necesitan CORS)
  const plainDecks = [els.audio, els.audio2];
  const eqDecks = [els.audio3, els.audio4];
  const decks = [...plainDecks, ...eqDecks];
  const dj = { enabled: false, fade: 6, transitioning: false, timer: null, outgoing: null };
  const deckGain = new Map(decks.map((deck) => [deck, 1]));

  // Velocidad: se aplica a los cuatro reproductores (sin cambiar el tono)
  function applySpeed() {
    decks.forEach((deck) => {
      deck.defaultPlaybackRate = settings.speed;
      deck.playbackRate = settings.speed;
      if ('preservesPitch' in deck) deck.preservesPitch = true;
    });
  }

  const SPEEDS = [0.75, 1, 1.1, 1.25, 1.5];
  function setSpeed(value) {
    settings.speed = SPEEDS.includes(value) ? value : 1;
    saveSettings();
    applySpeed();
    if (els.speedSelect) els.speedSelect.value = String(settings.speed);
    updatePositionStateNow();
  }
  function stepSpeed(direction) {
    const index = clamp(SPEEDS.indexOf(settings.speed) + direction, 0, SPEEDS.length - 1);
    setSpeed(SPEEDS[index]);
    showToast(`Velocidad: ${String(SPEEDS[index]).replace('.', ',')}×`);
  }

  // Fundido corto al pausar y al reanudar (no en iOS: ahí la web no puede cambiar el volumen)
  const softFade = { timer: null };
  function rampGain(deck, from, to, ms, done) {
    clearInterval(softFade.timer);
    const start = performance.now();
    deckGain.set(deck, from);
    applyVolume(deck);
    softFade.timer = setInterval(() => {
      const p = clamp((performance.now() - start) / ms, 0, 1);
      deckGain.set(deck, from + (to - from) * p);
      applyVolume(deck);
      if (p >= 1) {
        clearInterval(softFade.timer);
        softFade.timer = null;
        done?.();
      }
    }, 16);
  }
  const canSoftFade = () => settings.softPause && !IS_IOS && !dj.timer;

  // Precarga la siguiente canción ~25 s antes para que empiece sin espera
  const preloader = { audio: null, id: null };
  function preloadNext() {
    const nextId = state.queue[state.queueIndex + 1];
    if (!nextId || nextId === preloader.id || !navigator.onLine) return;
    const track = getTrack(nextId);
    if (!track?.src || isDownloaded(track)) return;
    if (navigator.connection?.saveData) return;
    preloader.id = nextId;
    if (!preloader.audio) {
      preloader.audio = new Audio();
      preloader.audio.muted = true;
      preloader.audio.preload = 'auto';
    }
    preloader.audio.src = track.src;
    preloader.audio.load();
  }

  function applyVolume(deck) {
    // sleep.gain baja el volumen en el fundido final del temporizador
    deck.volume = clamp(state.volume * (deckGain.get(deck) ?? 1) * sleep.gain, 0, 1);
  }

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

  // Elige el reproductor para la siguiente canción (con o sin ecualizador) y, si toca, empieza la mezcla
  function prepareDeck(track, autoplay, fade) {
    const outgoing = els.audio;
    const pool = wantsEq(track) && ensureEqGraph() ? eqDecks : plainDecks;
    const mixing = dj.enabled && fade > 0 && autoplay && !outgoing.paused && Boolean(outgoing.getAttribute('src'));
    dj.transitioning = false;
    eq.swapFrom = null;
    if (mixing) {
      els.audio = pool[0] === outgoing ? pool[1] : pool[0];
      els.audio.muted = outgoing.muted;
      startCrossfade(outgoing, els.audio, fade);
    } else {
      if (dj.timer) finishCrossfade();
      if (!pool.includes(els.audio)) {
        els.audio = pool[0];
        els.audio.muted = outgoing.muted;
        deckGain.set(els.audio, 1);
        applyVolume(els.audio);
      }
    }
    decks.forEach((deck) => {
      if (deck !== els.audio && deck !== dj.outgoing && deck.getAttribute('src')) releaseDeck(deck);
    });
  }

  function checkDjTransition() {
    const audio = els.audio;
    if (!dj.enabled || dj.transitioning || audio.paused || state.repeat === 'one' || sleep.endOfTrack) return;
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
      // Qué estilos suenan en cada momento del día (para «Tu daylist» y lo que te va ahora)
      const track = getTrack(listen.pendingId);
      if (track?.genre) {
        const seg = String(daySegment());
        entry.g = entry.g || {};
        entry.g[seg] = entry.g[seg] || {};
        entry.g[seg][track.genre] = Math.round((entry.g[seg][track.genre] || 0) + listen.pending);
      }
      listen.pending = 0;
      listen.dirty = true;
      taste.profile = null;
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

  /* ---------- Motor de gustos: lo que de verdad escuchas ----------
     El «algoritmo» de Liquid. Todo se calcula aquí, con lo que guarda este navegador:
     - segundos escuchados por canción y día (lo reciente pesa más: vida media de 14 días)
     - cuándo sonó cada canción por última vez (para no repetirla en aleatorio, mixes ni radios)
     - las que saltas al poco de empezar (cuentan en contra), favoritas y artistas que sigues
     - qué estilos pones en cada momento del día y qué artistas escuchas los mismos días */
  const DAY_MS = 86400000;
  const SEGMENTS = [
    { name: 'madrugada', label: 'de madrugada' },
    { name: 'mañana', label: 'por la mañana' },
    { name: 'tarde', label: 'por la tarde' },
    { name: 'noche', label: 'por la noche' }
  ];
  function daySegment(hour = new Date().getHours()) {
    if (hour < 6) return 0;
    if (hour < 12) return 1;
    if (hour < 19) return 2;
    return 3;
  }

  const taste = {
    heard: {},
    skips: {},
    contexts: [],
    dirty: false,
    profile: null,
    load() {
      const heard = storage.get(KEYS.heard, {});
      const skips = storage.get(KEYS.skips, {});
      const contexts = storage.get(KEYS.contexts, []);
      this.heard = heard && typeof heard === 'object' ? heard : {};
      this.skips = skips && typeof skips === 'object' ? skips : {};
      this.contexts = Array.isArray(contexts) ? contexts.filter((c) => c && c.key && c.title).slice(0, 12) : [];
    },
    save() {
      if (!this.dirty) return;
      // Solo lo de los últimos 90 días (y como mucho 2500 canciones)
      const limit = Date.now() - 90 * DAY_MS;
      this.heard = Object.fromEntries(Object.entries(this.heard)
        .filter(([, t]) => t > limit).sort((a, b) => b[1] - a[1]).slice(0, 2500));
      storage.set(KEYS.heard, this.heard);
      storage.set(KEYS.skips, this.skips);
      this.dirty = false;
    },
    touch() {
      this.dirty = true;
      this.profile = null;
      this.save();
    },
    markHeard(id) {
      this.heard[id] = Date.now();
      this.touch();
    },
    // Saltar una canción al poco de empezar cuenta en contra (y cuenta como oída: no vuelve enseguida)
    markSkip(id) {
      this.skips[id] = Math.min(9, (Number(this.skips[id]) || 0) + 1);
      this.heard[id] = Date.now();
      this.touch();
    },
    // Escucharla entera le quita un salto
    markFinished(id) {
      if (!this.skips[id]) return;
      this.skips[id] -= 1;
      if (this.skips[id] <= 0) delete this.skips[id];
      this.touch();
    },
    hoursSince(id) {
      const time = Number(this.heard[id]);
      return time ? (Date.now() - time) / 3600000 : Infinity;
    },
    // Lo último que pusiste (playlists, artistas, radios): accesos rápidos de Inicio
    rememberContext(entry) {
      if (!entry?.key) return;
      this.contexts = [{ ...entry, at: Date.now() }, ...this.contexts.filter((c) => c.key !== entry.key)].slice(0, 12);
      storage.set(KEYS.contexts, this.contexts);
    }
  };

  // Cuánto «castigar» una canción que sonó hace poco (1 = nada)
  function recencyFactor(id) {
    const hours = taste.hoursSince(id);
    if (hours < 3) return 0.03;
    if (hours < 24) return 0.15;
    if (hours < 72) return 0.45;
    if (hours < 168) return 0.75;
    return 1;
  }

  // Orden aleatorio ponderado (Efraimidis–Spirakis): más peso, más probable que salga antes
  function weightedOrder(items, weightOf, rand = Math.random) {
    return items
      .map((item) => [item, Math.pow(rand() || 1e-9, 1 / Math.max(weightOf(item), 1e-4))])
      .sort((a, b) => b[1] - a[1])
      .map(([item]) => item);
  }

  const dayAge = (key, now = Date.now()) => {
    const [y, m, d] = key.split('-').map(Number);
    return (now - new Date(y, m - 1, d).getTime()) / DAY_MS;
  };

  function normalizedMap(map) {
    let max = 0;
    map.forEach((value) => { if (value > max) max = value; });
    return (key) => (max > 0 ? Math.max(-1, (map.get(key) || 0) / max) : 0);
  }

  function tasteProfile() {
    const stamp = `${state.libraryTracks.length}|${state.favorites.size}|${library.follows.length}|${disliked.size}`;
    if (taste.profile && taste.profile.stamp === stamp && Date.now() - taste.profile.at < 10 * 60000) return taste.profile;
    const now = Date.now();
    const tracks = new Map();
    const recentTracks = new Map();
    const lastAge = new Map();
    const segGenres = [new Map(), new Map(), new Map(), new Map()];
    const dayArtists = [];
    const momentum = new Map();
    let weekSeconds = 0;

    Object.entries(listen.log).forEach(([key, entry]) => {
      const age = dayAge(key, now);
      if (!(age >= -1 && age <= 120)) return;
      const decay = Math.pow(0.5, age / 14);
      const artistsToday = new Map();
      Object.entries(entry.s || {}).forEach(([id, sec]) => {
        const track = getTrack(id);
        if (!track) return;
        const full = Math.min(sec / (parseDuration(track.duration) || 200), 4);
        tracks.set(id, (tracks.get(id) || 0) + full * decay);
        if (age <= 30) recentTracks.set(id, (recentTracks.get(id) || 0) + full);
        if (!lastAge.has(id) || lastAge.get(id) > age) lastAge.set(id, age);
        artistKeysOf(track).forEach((artist) => {
          artistsToday.set(artist, (artistsToday.get(artist) || 0) + sec);
          if (age <= 3) momentum.set(artist, (momentum.get(artist) || 0) + sec * (1 - age / 4));
        });
        if (age < 7) weekSeconds += sec;
      });
      Object.entries(entry.g || {}).forEach(([seg, map]) => {
        Object.entries(map || {}).forEach(([genre, sec]) => {
          segGenres[seg]?.set(genre, (segGenres[seg].get(genre) || 0) + sec * decay);
        });
      });
      if (artistsToday.size > 1) {
        dayArtists.push([...artistsToday.entries()].filter(([, sec]) => sec >= 60).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k]) => k));
      }
    });
    // Lo de siempre (contador de reproducciones), favoritas y saltos
    Object.entries(library.plays).forEach(([id, n]) => {
      if (state.trackMap.has(id)) tracks.set(id, (tracks.get(id) || 0) + Math.log1p(Number(n) || 0) * 0.35);
    });
    state.favorites.forEach((id) => { if (state.trackMap.has(id)) tracks.set(id, (tracks.get(id) || 0) + 1.5); });
    Object.entries(taste.skips).forEach(([id, n]) => {
      if (state.trackMap.has(id)) tracks.set(id, (tracks.get(id) || 0) - Number(n) * 0.6);
    });
    disliked.forEach((id) => tracks.delete(id));

    const genres = new Map();
    const artists = new Map();
    tracks.forEach((score, id) => {
      const track = getTrack(id);
      if (track.genre) genres.set(track.genre, (genres.get(track.genre) || 0) + score);
      // Una colaboración es de todos: cada artista acreditado suma lo mismo
      artistKeysOf(track).forEach((key) => artists.set(key, (artists.get(key) || 0) + score));
    });
    library.follows.forEach((key) => artists.set(key, (artists.get(key) || 0) + 4));

    // Artistas que escuchas los mismos días: tu propio «a quien le gusta X también escucha Y»
    const coListen = new Map();
    dayArtists.forEach((keys) => keys.forEach((a) => keys.forEach((b) => {
      if (a === b) return;
      if (!coListen.has(a)) coListen.set(a, new Map());
      coListen.get(a).set(b, (coListen.get(a).get(b) || 0) + 1);
    })));

    const topArtists = [...artists.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const profile = {
      stamp, at: now, tracks, recentTracks, lastAge, genres, artists, segGenres, coListen, topArtists,
      momentum: [...momentum.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k),
      topGenres: [...genres.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([g]) => g),
      weekSeconds,
      hasHistory: [...tracks.values()].filter((v) => v > 0).length >= 5,
      trackN: normalizedMap(tracks),
      artistN: normalizedMap(artists),
      genreN: normalizedMap(genres),
      related: new Map(),
      relatedN: () => 0
    };
    taste.profile = profile;
    // Afinidad «heredada»: artistas parecidos a los que más escuchas
    topArtists.slice(0, 15).forEach((key, rank) => {
      const weight = profile.artistN(key) * (1 - rank * 0.05);
      similarArtists(key, 10).forEach((entry, i) => {
        profile.related.set(entry.key, (profile.related.get(entry.key) || 0) + weight * (1 - i * 0.07));
      });
    });
    profile.relatedN = normalizedMap(profile.related);
    return profile;
  }

  // Cuánto te va a gustar una canción (aprox. de -1 a 3)
  function trackAffinity(track, p = tasteProfile()) {
    if (!track || isDisliked(track.id)) return -9;
    const keys = artistKeysOf(track);
    const best = (fn) => (keys.length ? Math.max(...keys.map(fn)) : 0);
    return p.trackN(track.id) * 0.9 + best(p.artistN) * 0.8 + best(p.relatedN) * 0.45 +
      p.genreN(track.genre) * 0.5 - (Number(taste.skips[track.id]) || 0) * 0.25;
  }

  // Reparte una lista: sin el mismo artista en las últimas canciones (según cuántos haya)
  // y sin encadenar más de dos del mismo estilo cuando se puede
  function spaceOut(tracks, lookahead = 40) {
    const distinct = new Set(tracks.map(artistKeyOf)).size;
    const gap = Math.min(5, Math.max(0, distinct - 1));
    const pending = tracks.slice();
    const out = [];
    const lastArtists = [];
    while (pending.length) {
      const tail = out.slice(-2);
      const genreRun = tail.length === 2 && tail[0].genre && tail[0].genre === tail[1].genre ? tail[0].genre : '';
      let pick = -1;
      let fallback = -1;
      const limit = Math.min(pending.length, lookahead);
      for (let i = 0; i < limit; i++) {
        if (lastArtists.includes(artistKeyOf(pending[i]))) continue;
        if (fallback < 0) fallback = i;
        if (genreRun && pending[i].genre === genreRun) continue;
        pick = i;
        break;
      }
      if (pick < 0) pick = fallback < 0 ? 0 : fallback;
      const [track] = pending.splice(pick, 1);
      out.push(track);
      lastArtists.push(artistKeyOf(track));
      if (lastArtists.length > gap) lastArtists.shift();
    }
    return out;
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
  // Primer artista acreditado, con el mismo criterio que el índice de artistas. Antes se cortaba
  // también en « y », « & » y « x »: «Polo & Pan» quedaba en «Polo» y su canción sin ficha ni radio.
  const mainArtist = (track) => creditedArtists(track)[0] || '';
  // Todas las claves de artista de una canción: una colaboración es de todos sus artistas
  const artistKeysCache = new Map();
  const artistKeysOf = (track) => {
    const raw = track?.knownArtist || '';
    let keys = artistKeysCache.get(raw);
    if (!keys) { keys = Object.freeze([...new Set(creditedArtists(track).map(normalize).filter(Boolean))]); artistKeysCache.set(raw, keys); }
    return keys;
  };
  // Solo para reconocer copias repetidas de una misma canción (corte amplio, como siempre)
  const dedupeArtist = (track) => {
    const text = track?.knownArtist || '';
    const named = COMMA_NAMES.find((name) => text.toLowerCase().startsWith(name.toLowerCase()));
    if (named) return named;
    return text.replace(/\s*\b(ft|feat|featuring)\b\.?.*$/i, '').split(/,| x | & | y /i)[0].trim();
  };

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
          // Una colaboración suma para todos sus artistas
          creditedArtists(track).forEach((artist) => result.artists.set(artist, (result.artists.get(artist) || 0) + secs));
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
    const heading = makeEl('h3', 'stat-title');
    heading.append(sticker(title), title);
    card.append(heading);
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
          makeEl('span', a.before ? 'trend-up' : 'trend-new', a.before ? `+${Math.round(a.delta * 100)} pts` : 'Nuevo'),
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
      img.src = track.thumb;
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

  /* ---------- Lab: mezclas a medida, recetas y tu ADN musical ----------
     - Recetas: mezclas listas de un toque, hechas con lo que escuchas.
     - A medida: estilos + artistas + canciones semilla, cuánto conocido y cuánto nuevo,
       cuántas canciones (o minutos), máximo por artista y orden (mezclada o viaje de estilos).
     - El resultado se edita (quitar canciones), se reproduce, va a la cola o se guarda.
     - «Si te gusta…» y «Tu ADN musical». Las elecciones se recuerdan en este navegador. */
  const LAB_SIZES = [20, 40, 60, 100];
  const LAB_MINUTES = [30, 60, 120];
  const LAB_CAPS = [1, 2, 3, 0];
  const LAB_MIX_LABELS = ['Solo conocidas', 'Sobre todo conocidas', 'Mitad y mitad', 'Sobre todo nuevas', 'Solo nuevas'];
  const lab = {
    genres: [],
    artists: [],
    seeds: [],
    size: 40,
    minutes: 0,
    mix: 2,
    cap: 3,
    order: 'mix',
    result: [],
    resultName: '',
    artistQuery: '',
    songQuery: '',
    likeArtist: '',
    ...(() => {
      const saved = storage.get(KEYS.lab, {}) || {};
      return {
        genres: Array.isArray(saved.genres) ? saved.genres : [],
        artists: Array.isArray(saved.artists) ? saved.artists : [],
        seeds: Array.isArray(saved.seeds) ? saved.seeds.slice(0, 5) : [],
        size: LAB_SIZES.includes(saved.size) ? saved.size : 40,
        minutes: LAB_MINUTES.includes(saved.minutes) ? saved.minutes : 0,
        // Antes era un interruptor «solo lo que no he escuchado»
        mix: Number.isInteger(saved.mix) && saved.mix >= 0 && saved.mix <= 4 ? saved.mix : saved.fresh === true ? 4 : 2,
        cap: LAB_CAPS.includes(saved.cap) ? saved.cap : 3,
        order: saved.order === 'journey' ? 'journey' : 'mix'
      };
    })()
  };

  function saveLab() {
    storage.set(KEYS.lab, { genres: lab.genres, artists: lab.artists, seeds: lab.seeds, size: lab.size, minutes: lab.minutes,
      mix: lab.mix, cap: lab.cap, order: lab.order });
  }

  // Todos los artistas acreditados de una canción («A, B feat. C» → A, B, C). «&» no separa:
  // es parte del nombre de dúos como «Polo & Pan» o «DOMi & JD BECK»
  // Nombres que llevan coma y no son dos artistas
  const COMMA_NAMES = ['Tyler, The Creator', 'Earth, Wind & Fire', 'Crosby, Stills, Nash & Young', 'Crosby, Stills & Nash', 'Black Country, New Road'];
  const COMMA_NAME_RES = COMMA_NAMES.map((name) => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'));
  // Se calcula una vez por texto de artista: Inicio y el algoritmo lo piden miles de veces
  // (antes creaba 5 expresiones regulares en cada llamada: ~250 ms por pintada de Inicio en un móvil medio)
  const creditsCache = new Map();
  function creditedArtists(track) {
    const raw = String(track?.knownArtist || '');
    const hit = creditsCache.get(raw);
    if (hit) return hit;
    let text = raw;
    COMMA_NAME_RES.forEach((re, i) => { text = text.replace(re, `⟦${i}⟧`); });
    const names = Object.freeze(text
      .split(/\s*(?:,|\bfeat\.?|\bft\.?|\bfeaturing\b)\s*/i)
      .map((name) => name.replace(/⟦(\d+)⟧/g, (m, i) => COMMA_NAMES[i]).trim())
      .filter((name) => name.length > 1));
    creditsCache.set(raw, names);
    return names;
  }

  // Índice de artistas: canciones, estilos y con quién colaboran
  let labIndex = null;
  function labArtists() {
    if (labIndex && labIndex.size === state.libraryTracks.length) return labIndex.map;
    const map = new Map();
    state.libraryTracks.forEach((track) => {
      const credits = creditedArtists(track);
      credits.forEach((name) => {
        const key = normalize(name);
        if (!key) return;
        if (!map.has(key)) map.set(key, { key, name, tracks: [], genres: new Map(), partners: new Map() });
        const entry = map.get(key);
        entry.tracks.push(track);
        if (track.genre) entry.genres.set(track.genre, (entry.genres.get(track.genre) || 0) + 1);
        credits.forEach((other) => {
          const otherKey = normalize(other);
          if (otherKey && otherKey !== key) entry.partners.set(otherKey, (entry.partners.get(otherKey) || 0) + 1);
        });
      });
    });
    labIndex = { size: state.libraryTracks.length, map };
    return map;
  }

  function labGenres() {
    return shownPls(systemPlaylists()).map((pl) => ({ name: pl.name, description: pl.description || '', count: playlistTracksOf(pl).length }))
      .filter((g) => g.count > 0);
  }

  // Canción semilla: su artista, sus parecidos y su estilo
  function seedPool(track) {
    const artists = labArtists();
    const key = artistKeyOf(track);
    const family = [artists.get(key), ...similarArtists(key, 8)].filter(Boolean).flatMap((entry) => entry.tracks);
    const sameStyle = family.filter((t) => t.genre === track.genre);
    return sameStyle.length >= 15 ? sameStyle : [...family, ...state.libraryTracks.filter((t) => t.genre === track.genre)];
  }

  // Reparte por turnos entre los grupos elegidos, con la proporción conocidas/nuevas pedida
  function buildLabMix(groups = null) {
    const p = tasteProfile();
    const artists = labArtists();
    const pools = groups || [
      ...lab.genres.map((genre) => state.libraryTracks.filter((t) => t.genre === genre)),
      ...lab.artists.map((key) => artists.get(key)?.tracks || []),
      ...lab.seeds.map(getTrack).filter(Boolean).map(seedPool)
    ];
    if (!pools.length) return [];
    const freshShare = lab.mix / 4;
    const ready = pools.map((pool, i) => {
      const list = pool.filter((t) => isPlayable(t) && !isDisliked(t.id));
      const rand = seededRandom(`${Date.now()}-${i}`);
      return {
        known: weightedOrder(list.filter((t) => isFamiliar(t, p)), likeWeight(p, 1.2), rand),
        fresh: weightedOrder(list.filter((t) => !isFamiliar(t, p)),
          (t) => Math.max(0.05, 0.4 + p.relatedN(artistKeyOf(t)) + Math.max(0, p.genreN(t.genre)) * 0.5), rand)
      };
    });
    const picked = [];
    const groupOf = new Map();
    const seen = new Set();
    const perArtist = new Map();
    let seconds = 0;
    const full = () => (lab.minutes ? seconds >= lab.minutes * 60 : picked.length >= lab.size);
    const take = (track, group) => {
      if (seen.has(track.songKey)) return false;
      const artist = artistKeyOf(track);
      if (lab.cap && (perArtist.get(artist) || 0) >= lab.cap) return false;
      seen.add(track.songKey);
      perArtist.set(artist, (perArtist.get(artist) || 0) + 1);
      picked.push(track);
      groupOf.set(track.id, group);
      seconds += parseDuration(track.duration) || 200;
      return true;
    };
    // Las canciones semilla van primero
    lab.seeds.map(getTrack).filter((t) => t && isPlayable(t)).forEach((t) => take(t, pools.length - lab.seeds.length));
    let round = 0;
    let stalled = 0;
    // Reparto exacto: cada canción suma su parte de «nueva»; al llegar a 1, toca una nueva
    let freshDebt = Math.random() * freshShare;
    while (!full() && stalled < ready.length) {
      const group = round % ready.length;
      const pool = ready[group];
      round++;
      freshDebt += freshShare;
      const wantFresh = freshDebt >= 1;
      if (wantFresh) freshDebt -= 1;
      const order = wantFresh ? [pool.fresh, pool.known] : [pool.known, pool.fresh];
      // «Solo conocidas» / «Solo nuevas» no rellenan con la otra mitad
      if (lab.mix === 0) order.pop();
      if (lab.mix === 4) order.pop();
      let added = false;
      for (const list of order) {
        while (list.length && !added) added = take(list.shift(), group);
        if (added) break;
      }
      stalled = added ? 0 : stalled + 1;
    }
    if (lab.order === 'journey') {
      // Viaje de estilos: un bloque por grupo, cada uno bien repartido por dentro
      return [...new Set(picked.map((t) => groupOf.get(t.id)))]
        .flatMap((group) => spaceOut(picked.filter((t) => groupOf.get(t.id) === group)));
    }
    const seeds = picked.slice(0, lab.seeds.length);
    return [...seeds, ...spaceOut(seededShuffle(picked.slice(seeds.length), String(Date.now())))];
  }

  // Recetas de un toque
  const LAB_RECIPES = [
    { id: 'best', icon: 'trophy', name: 'Lo mejor de ti', hint: 'Tus favoritas y lo que más suena, sin lo de hoy' },
    { id: 'deep', icon: 'compass', name: 'Descubrimiento profundo', hint: 'Solo canciones nuevas de artistas cercanos a los tuyos' },
    { id: 'gems', icon: 'gem', name: 'Joyas olvidadas', hint: 'Te encantaban y llevan semanas sin sonar' },
    { id: 'daylist', icon: 'moon', name: 'Para este momento', hint: 'Lo que sueles poner a esta hora del día' },
    { id: 'variety', icon: 'palette', name: 'Un artista por canción', hint: '60 canciones, ningún artista se repite' },
    { id: 'surprise', icon: 'dice', name: 'Sal de tu burbuja', hint: 'Los estilos que menos escuchas' }
  ];

  function runRecipe(id) {
    const p = tasteProfile();
    const visible = labGenres().map((g) => g.name);
    const top = p.topGenres.filter((g) => visible.includes(g));
    const fallback = seededShuffle(visible, todayKey());
    const keep = { genres: lab.genres, artists: lab.artists, seeds: lab.seeds, mix: lab.mix, cap: lab.cap, size: lab.size, minutes: lab.minutes, order: lab.order };
    let result = [];
    const recipe = LAB_RECIPES.find((r) => r.id === id);
    const withSettings = (changes, groups = null) => {
      Object.assign(lab, { artists: [], seeds: [], minutes: 0, order: 'mix' }, changes);
      let out = buildLabMix(groups);
      // Sin historial aún no hay «conocidas»: se completa con canciones nuevas
      if (out.length < 10 && lab.mix === 0) {
        lab.mix = 2;
        out = buildLabMix(groups);
      }
      Object.assign(lab, keep);
      return out;
    };
    switch (id) {
      case 'best': result = withSettings({ genres: (top.length ? top : fallback).slice(0, 4), mix: 0, cap: 2, size: 40 }); break;
      case 'deep': result = withSettings({ genres: (top.length ? top : fallback).slice(0, 5), mix: 4, cap: 1, size: 40 }); break;
      case 'gems': result = forgottenGems(p); break;
      case 'daylist': result = daylist(p)?.tracks || []; break;
      case 'variety': result = withSettings({ genres: (top.length ? top : fallback).slice(0, 6), mix: 2, cap: 1, size: 60 }); break;
      case 'surprise': {
        const least = visible.filter((g) => !top.slice(0, 6).includes(g));
        result = withSettings({ genres: seededShuffle(least.length ? least : visible, String(Date.now())).slice(0, 3), mix: 4, cap: 2, size: 40 });
        break;
      }
      default: break;
    }
    lab.result = result;
    lab.resultName = recipe ? recipe.name : '';
    if (!result.length) {
      showToast(id === 'gems' ? 'Aún no hay joyas olvidadas: escucha más y vuelve en unas semanas.' : 'No hay canciones para esta receta todavía.');
    }
    renderLab();
    scrollToLabResult();
  }

  // «Si te gusta X»: colaboradores pesan más; luego artistas del mismo estilo con más canciones
  function similarArtists(key, limit = 8) {
    const artists = labArtists();
    const base = artists.get(key);
    if (!base) return [];
    const scores = new Map();
    base.partners.forEach((count, other) => scores.set(other, (scores.get(other) || 0) + 6 + count * 2));
    // Lo que tú escuchas los mismos días que a este artista también cuenta
    const together = taste.profile?.coListen?.get(key);
    together?.forEach((days, other) => scores.set(other, (scores.get(other) || 0) + Math.min(days, 6) * 0.9));
    const baseTotal = base.tracks.length;
    artists.forEach((entry, other) => {
      if (other === key) return;
      let shared = 0;
      base.genres.forEach((count, genre) => {
        if (entry.genres.has(genre)) shared += (count / baseTotal) * (entry.genres.get(genre) / entry.tracks.length);
      });
      if (shared > 0) scores.set(other, (scores.get(other) || 0) + shared * 4 + Math.min(entry.tracks.length, 12) * 0.15);
    });
    return [...scores.entries()]
      .filter(([other]) => artists.has(other))
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([other]) => artists.get(other));
  }

  // Sugerencia de partida: el artista que más escuchas
  function topListenedArtist() {
    return tasteProfile().topArtists.find((key) => labArtists().has(key)) || '';
  }

  function labChip(label, action, value, active, extra = '') {
    const chip = makeEl('button', `chip lab-chip${active ? ' is-active' : ''}`, label);
    chip.type = 'button';
    chip.dataset.labAction = action;
    chip.dataset.value = value;
    chip.setAttribute('aria-pressed', String(active));
    if (extra) chip.append(makeEl('span', 'lab-chip-count', extra));
    return chip;
  }

  function labSection(title, hint) {
    const section = makeEl('section', 'lab-section');
    const head = makeEl('div', 'lab-section-head');
    head.append(makeEl('h3', 'lab-section-title', title));
    if (hint) head.append(makeEl('p', 'lab-hint', hint));
    section.append(head);
    return section;
  }

  function labButton(className, action, label, icon, text) {
    const button = makeButton(className, `lab-${action}`, label, icon, text);
    button.dataset.labAction = action;
    button.removeAttribute('data-action');
    return button;
  }

  function labSearchInput(kind, value, placeholder, label) {
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'lab-search';
    input.placeholder = placeholder;
    input.value = value;
    input.dataset.labInput = kind;
    input.setAttribute('aria-label', label);
    input.autocomplete = 'off';
    return input;
  }

  function labTrackRow(track, action, extraButton = null) {
    const li = makeEl('li', 'lab-track');
    const btn = makeEl('button', 'lab-track-btn');
    btn.type = 'button';
    btn.dataset.labAction = action;
    btn.dataset.value = track.id;
    const text = makeEl('span', 'lab-track-text');
    text.append(makeEl('span', 'lab-track-title', track.title), makeEl('span', 'lab-track-artist', `${track.artist}${track.genre ? ` · ${track.genre}` : ''}`));
    btn.append(photoImg(track.thumb, 40), text, makeEl('span', 'lab-track-time', track.duration || ''));
    li.append(btn);
    if (extraButton) li.append(extraButton);
    return li;
  }

  // Tu ADN musical: tus estilos, cuánto exploras y cuándo escuchas
  function renderDna(p) {
    const section = labSection('Tu ADN musical', 'Así escuchas según este navegador. Cambia con lo que pongas.');
    if (!p.hasHistory) {
      section.append(makeEl('p', 'lab-hint', 'Escucha unas cuantas canciones y aquí verás tus estilos, cuánto exploras y a qué hora escuchas.'));
      return section;
    }
    const genres = [...p.genres.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const total = genres.reduce((sum, [, v]) => sum + v, 0) || 1;
    const bars = makeEl('div', 'dna-bars');
    genres.forEach(([genre, value]) => {
      const row = makeEl('div', 'dna-row');
      const bar = makeEl('span', 'dna-bar');
      bar.style.setProperty('--w', `${Math.max(4, Math.round((value / total) * 100))}%`);
      row.append(makeEl('span', 'dna-name', genre), bar, makeEl('span', 'dna-pct', `${Math.round((value / total) * 100)}%`));
      bars.append(row);
    });
    const recentArtists = new Set([...p.recentTracks.keys()].map((id) => artistKeyOf(getTrack(id))).filter(Boolean));
    const ids = [...p.recentTracks.keys()];
    const fresh = ids.filter((id) => (playsOf(id) || 0) <= 2).length;
    const segTotals = p.segGenres.map((map) => [...map.values()].reduce((a, b) => a + b, 0));
    const bestSeg = segTotals.indexOf(Math.max(...segTotals));
    const facts = makeEl('div', 'dna-facts');
    const fact = (value, label) => {
      const el = makeEl('div', 'dna-fact');
      el.append(makeEl('strong', '', value), makeEl('span', '', label));
      return el;
    };
    facts.append(
      fact(String(recentArtists.size), 'artistas en 30 días'),
      fact(`${ids.length ? Math.round((fresh / ids.length) * 100) : 0}%`, 'de lo que oyes es nuevo para ti'),
      fact(segTotals[bestSeg] > 0 ? SEGMENTS[bestSeg].name : '—', 'tu momento del día')
    );
    section.append(facts, bars);
    return section;
  }

  function renderLab() {
    const panel = els.labPanel;
    if (!state.libraryTracks.length) {
      panel.replaceChildren(makeEl('p', 'list-empty', 'Lab necesita la biblioteca: espera a que carguen las canciones.'));
      return;
    }
    const p = tasteProfile();
    const artists = labArtists();
    const genres = labGenres();
    lab.genres = lab.genres.filter((g) => genres.some((x) => x.name === g));
    lab.artists = lab.artists.filter((a) => artists.has(a));
    lab.seeds = lab.seeds.filter((id) => state.trackMap.has(id));

    // Recetas
    const recipes = labSection('Recetas', 'Un toque y listo: hechas con lo que escuchas.');
    const recipeGrid = makeEl('div', 'lab-recipes');
    LAB_RECIPES.forEach((recipe) => {
      const card = makeEl('button', 'lab-recipe');
      card.type = 'button';
      card.dataset.labAction = 'recipe';
      card.dataset.value = recipe.id;
      const ico = makeEl('span', 'lab-recipe-icon');
      ico.replaceChildren(svgIcon(recipe.icon));
      card.append(ico, makeEl('span', 'lab-recipe-name', recipe.name), makeEl('span', 'lab-recipe-hint', recipe.hint));
      recipeGrid.append(card);
    });
    recipes.append(recipeGrid);

    // 1. Estilos (primero los tuyos)
    const styles = labSection('1 · Mezcla estilos', 'Elige uno o varios: Lab los combina por turnos.');
    const styleChips = makeEl('div', 'lab-chips');
    genres.slice().sort((a, b) => p.genreN(b.name) - p.genreN(a.name)).forEach((g) => {
      const chip = labChip(g.name, 'genre', g.name, lab.genres.includes(g.name), String(g.count));
      chip.title = g.description;
      styleChips.append(chip);
    });
    styles.append(styleChips);

    // 2. Artistas y canciones semilla
    const people = labSection('2 · Suma artistas y canciones', 'Opcional. Una canción semilla trae su artista, sus parecidos y su estilo.');
    const q = normalize(lab.artistQuery);
    const ranked = [...artists.values()]
      .filter((a) => !q || a.key.includes(q))
      .sort((a, b) => (q ? 0 : (p.artistN(b.key) - p.artistN(a.key)) * 50) + (b.tracks.length - a.tracks.length))
      .slice(0, q ? 30 : 20);
    const chosen = lab.artists.map((key) => artists.get(key)).filter(Boolean);
    const artistChips = makeEl('div', 'lab-chips');
    chosen.forEach((a) => artistChips.append(labChip(a.name, 'artist', a.key, true)));
    ranked.filter((a) => !lab.artists.includes(a.key)).forEach((a) => artistChips.append(labChip(a.name, 'artist', a.key, false, String(a.tracks.length))));
    if (!ranked.length && q) artistChips.append(makeEl('p', 'lab-hint', 'Ningún artista coincide.'));
    const songSearch = labSearchInput('song', lab.songQuery, 'Buscar canción semilla…', 'Buscar canción semilla');
    const seedList = makeEl('ul', 'lab-result lab-seeds');
    lab.seeds.map(getTrack).filter(Boolean).forEach((t) => {
      seedList.append(labTrackRow(t, 'seed', labButton('icon-btn lab-track-remove', 'seed', `Quitar ${t.title}`, 'close')));
      seedList.lastChild.lastChild.dataset.value = t.id;
    });
    if (lab.songQuery.trim().length >= 2) {
      searchTracks(state.libraryTracks, lab.songQuery).filter((t) => !lab.seeds.includes(t.id)).slice(0, 6)
        .forEach((t) => seedList.append(labTrackRow(t, 'seed')));
    }
    people.append(labSearchInput('artist', lab.artistQuery, 'Buscar artista…', 'Buscar artista para la mezcla'), artistChips, songSearch, seedList);

    // 3. Ajustes y botón
    const options = labSection('3 · Ajusta y crea');
    const group = (label, chips) => {
      const wrap = makeEl('div', 'lab-option');
      const chipsEl = makeEl('div', 'lab-sizes');
      chipsEl.setAttribute('role', 'group');
      chipsEl.setAttribute('aria-label', label);
      chipsEl.append(...chips);
      wrap.append(makeEl('span', 'lab-option-label', label), chipsEl);
      return wrap;
    };
    const lengthChips = [
      ...LAB_SIZES.map((n) => labChip(`${n}`, 'size', String(n), !lab.minutes && lab.size === n)),
      ...LAB_MINUTES.map((m) => labChip(m < 60 ? `${m} min` : `${m / 60} h`, 'minutes', String(m), lab.minutes === m))
    ];
    const mixWrap = makeEl('div', 'lab-option');
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '4';
    range.step = '1';
    range.value = String(lab.mix);
    range.className = 'range lab-range';
    range.dataset.labInput = 'mix';
    range.setAttribute('aria-label', 'Conocidas o nuevas');
    range.setAttribute('aria-valuetext', LAB_MIX_LABELS[lab.mix]);
    const rangeRow = makeEl('div', 'lab-range-row');
    rangeRow.append(makeEl('span', 'lab-range-end', 'Conocidas'), range, makeEl('span', 'lab-range-end', 'Nuevas'));
    mixWrap.append(makeEl('span', 'lab-option-label', `Descubrimiento · ${LAB_MIX_LABELS[lab.mix]}`), rangeRow);
    options.append(
      group('Duración', lengthChips),
      mixWrap,
      group('Máximo por artista', LAB_CAPS.map((n) => labChip(n ? String(n) : 'Sin límite', 'cap', String(n), lab.cap === n))),
      group('Orden', [labChip('Mezclada', 'order', 'mix', lab.order === 'mix'), labChip('Viaje de estilos', 'order', 'journey', lab.order === 'journey')])
    );
    const selected = lab.genres.length + lab.artists.length + lab.seeds.length;
    const create = labButton('btn btn-primary lab-create', 'create', 'Crear la mezcla', 'shuffle', lab.result.length && !lab.resultName ? 'Otra mezcla' : 'Crear mezcla');
    create.disabled = !selected;
    const names = [...lab.genres, ...chosen.map((a) => a.name), ...lab.seeds.map(getTrack).filter(Boolean).map((t) => `«${splitTitle(t.title).main}»`)];
    const summary = makeEl('p', 'lab-hint', selected ? `Mezclando: ${names.join(' + ')}` : 'Elige al menos un estilo, un artista o una canción.');
    const clear = makeEl('button', 'btn btn-ghost lab-clear', 'Limpiar');
    clear.type = 'button';
    clear.dataset.labAction = 'clear';
    clear.hidden = !selected;
    const actions = makeEl('div', 'lab-create-row');
    actions.append(create, clear);
    options.append(actions, summary);

    const blocks = [recipes, styles, people, options];

    // Resultado
    if (lab.result.length) {
      const total = lab.result.reduce((s, t) => s + parseDuration(t.duration), 0);
      const known = lab.result.filter((t) => isFamiliar(t, p)).length;
      const result = labSection(lab.resultName ? `Receta · ${lab.resultName}` : 'Tu mezcla',
        `${songsLabel(lab.result.length)} · ${formatTotal(total)} · ${known} conocidas, ${lab.result.length - known} nuevas`);
      const bar = makeEl('div', 'lab-result-actions');
      const play = markPlayable(labButton('btn btn-primary', 'play', 'Reproducir la mezcla', 'play', 'Reproducir'), 'lab:result', 'la mezcla');
      bar.append(
        play,
        labButton('btn', 'queue', 'Añadir la mezcla a la cola', 'queue', 'A la cola'),
        labButton('btn', 'save', 'Guardar como playlist', 'playlist-add', 'Guardar')
      );
      const listEl = makeEl('ol', 'lab-result');
      lab.result.forEach((track) => {
        const remove = labButton('icon-btn lab-track-remove', 'remove', `Quitar ${track.title} de la mezcla`, 'close');
        remove.dataset.value = track.id;
        listEl.append(labTrackRow(track, 'play-from', remove));
      });
      result.append(bar, listEl);
      blocks.push(result);
    }

    // Si te gusta…
    const like = labSection('Si te gusta…', 'Elige un artista y te decimos a quién escuchar después.');
    if (!lab.likeArtist || !artists.has(lab.likeArtist)) lab.likeArtist = topListenedArtist() || ranked[0]?.key || '';
    const select = document.createElement('select');
    select.className = 'lab-select';
    select.dataset.labInput = 'like';
    select.setAttribute('aria-label', 'Artista que te gusta');
    [...artists.values()].sort((a, b) => collator.compare(a.name, b.name)).forEach((a) => {
      select.append(new Option(`${a.name} (${a.tracks.length})`, a.key, false, a.key === lab.likeArtist));
    });
    const recs = makeEl('div', 'lab-recs');
    similarArtists(lab.likeArtist).forEach((a) => {
      const card = makeEl('button', 'lab-rec');
      card.type = 'button';
      card.dataset.labAction = 'rec-play';
      card.dataset.value = a.key;
      card.title = `Escuchar ${a.name}`;
      const top = [...a.genres.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || '';
      const text = makeEl('span', 'lab-rec-text');
      const heard = p.artistN(a.key) > 0;
      text.append(makeEl('span', 'lab-rec-name', a.name), makeEl('span', 'lab-rec-meta', `${songsLabel(a.tracks.length)}${top ? ` · ${top}` : ''}${heard ? '' : ' · nuevo para ti'}`));
      card.append(photoImg(a.tracks[0].thumb, 56), text);
      recs.append(card);
    });
    if (!recs.childElementCount) recs.append(makeEl('p', 'lab-hint', 'No encontramos artistas parecidos todavía.'));
    const radio = makeButton('btn lab-like-radio', 'radio-artist', 'Radio de este artista', 'shuffle', 'Radio');
    radio.dataset.value = lab.likeArtist;
    const likeRow = makeEl('div', 'lab-like-row');
    likeRow.append(select, radio);
    like.append(likeRow, recs);
    blocks.push(like, renderDna(p));

    panel.replaceChildren(...blocks);
    syncPlayButtons(panel);
  }

  function scrollToLabResult() {
    els.labPanel.querySelector('.lab-result:not(.lab-seeds)')?.closest('.lab-section')?.scrollIntoView({ behavior: settings.motion ? 'smooth' : 'auto', block: 'start' });
  }

  function labCreate() {
    lab.result = buildLabMix();
    lab.resultName = '';
    if (!lab.result.length) showToast('No hay canciones para esa combinación (¿sin conexión o todo escuchado?).');
    renderLab();
    scrollToLabResult();
  }

  function labName() {
    if (lab.resultName) return `Lab · ${lab.resultName}`;
    const artists = labArtists();
    const parts = [...lab.genres, ...lab.artists.map((key) => artists.get(key)?.name).filter(Boolean),
      ...lab.seeds.map(getTrack).filter(Boolean).map((t) => splitTitle(t.title).main)];
    const name = parts.length > 2 ? `${parts.slice(0, 2).join(' + ')} y más` : parts.join(' + ');
    return `Lab · ${name || 'Mezcla'}`.slice(0, 60);
  }

  function handleLabAction(target) {
    const action = target.dataset.labAction;
    const value = target.dataset.value;
    const toggle = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
    switch (action) {
      case 'recipe': runRecipe(value); haptic(12); return;
      case 'genre': lab.genres = toggle(lab.genres, value); break;
      case 'artist': lab.artists = toggle(lab.artists, value); break;
      case 'seed':
        lab.seeds = toggle(lab.seeds, value).slice(-5);
        if (lab.seeds.includes(value)) lab.songQuery = '';
        break;
      case 'size': lab.size = Number(value); lab.minutes = 0; break;
      case 'minutes': lab.minutes = Number(value); break;
      case 'cap': lab.cap = Number(value); break;
      case 'order': lab.order = value === 'journey' ? 'journey' : 'mix'; break;
      case 'clear': lab.genres = []; lab.artists = []; lab.seeds = []; lab.result = []; lab.resultName = ''; break;
      case 'create': saveLab(); labCreate(); haptic(12); return;
      case 'play':
        if (state.currentTrack && state.playSource === 'lab:result') togglePlay();
        else if (lab.result.length) playCollection(lab.result, lab.result.find(isPlayable)?.id, labName(), 'lab:result');
        return;
      case 'play-from': playCollection(lab.result, value, labName(), 'lab:result'); return;
      case 'remove': lab.result = lab.result.filter((t) => t.id !== value); renderLab(); return;
      case 'queue':
        if (!state.currentTrack) {
          playCollection(lab.result, lab.result.find(isPlayable)?.id, labName(), 'lab:result');
          return;
        }
        lab.result.forEach((t) => queueTrack(t.id, true, true));
        showToast(`${songsLabel(lab.result.length)} al final de la cola.`);
        return;
      case 'save': {
        if (!lab.result.length) return;
        const playlist = { id: newId(), name: labName(), emoji: 'ic:flask', color: PLAYLIST_COLORS[lab.result.length % PLAYLIST_COLORS.length],
          trackIds: lab.result.map((t) => t.id), createdAt: Date.now() };
        library.local.push(playlist);
        saveLocalPlaylists();
        showToast(`Guardada en tus playlists: «${playlist.name}».`);
        openPlaylist(`local:${playlist.id}`);
        return;
      }
      case 'rec-play': {
        const entry = labArtists().get(value);
        if (!entry) return;
        const tracks = spaceOut(weightedOrder(entry.tracks.filter(isPlayable), (t) => recencyFactor(t.id)));
        if (tracks.length) playCollection(tracks, tracks[0].id, `Lab · Si te gusta ${artistName(lab.likeArtist)}: ${entry.name}`);
        return;
      }
      default: return;
    }
    saveLab();
    renderLab();
  }

  const artistName = (key) => labArtists().get(key)?.name || '';

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
      case 'recent': {
        const order = new Map(library.recent.map((id, i) => [id, i]));
        return sorted.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
      }
      case 'plays': return sorted.sort((a, b) => playsOf(b.id) - playsOf(a.id) || byTitle(a, b));
      case 'long': return sorted.sort((a, b) => parseDuration(b.duration) - parseDuration(a.duration));
      case 'short': return sorted.sort((a, b) => parseDuration(a.duration) - parseDuration(b.duration));
      // Las que llegaron este mes primero (las más nuevas arriba); el resto en su orden
      case 'added': return sorted.sort((a, b) => (arrivals.added[b.id] || 0) - (arrivals.added[a.id] || 0));
      default: return sorted;
    }
  }

  function baseTracks() {
    if (state.view === 'favorites') return state.tracks.filter((t) => state.favorites.has(t.id));
    if (state.view === 'playlist') return playlistTracksOf(getPlaylist(state.openPlaylist));
    if (state.view === 'artist') return artistTracks(state.openArtist);
    return sortTracks(state.libraryTracks);
  }

  /* ---------- Búsqueda: varias palabras, sin acentos, tolerante a erratas y en las letras ---------- */
  const haystackOf = (track) => {
    if (track.hay === undefined) track.hay = normalize([track.title, track.artist, track.album, track.genre].join(' '));
    return track.hay;
  };

  // Distancia de edición con un tope (corta en cuanto lo supera)
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        best = Math.min(best, row[j]);
      }
      if (best > max) return max + 1;
      prev = row;
    }
    return prev[b.length];
  }

  const wordsOf = (track) => {
    if (!track.words) track.words = [...new Set(haystackOf(track).split(/[^\p{L}\p{N}]+/u).filter(Boolean))];
    return track.words;
  };

  function fuzzyToken(token, track) {
    const max = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;
    if (!max) return false;
    return wordsOf(track).some((word) => editDistance(token, word.slice(0, token.length + max), max) <= max);
  }

  // Letras ya guardadas en este navegador (no se piden letras nuevas para buscar)
  function lyricsMatch(track, q) {
    const text = lyricsCache.get(track.id);
    if (typeof text !== 'string' || !text) return false;
    if (track.lyricsHay === undefined) track.lyricsHay = normalize(text.replace(/\[\d{1,2}:\d{2}(?:\.\d+)?\]/g, ' '));
    return track.lyricsHay.includes(q);
  }

  // Al seguir escribiendo («gor» → «gori» → «goril…») se busca dentro de lo que ya coincidía,
  // no en las miles de canciones otra vez
  let lastExact = { key: '', q: '', result: null };
  // La lista de partida se rehace en cada tecla: se reconoce por vista, filtros, tamaño y extremos
  const listKeyOf = (list) => `${state.view}|${state.openPlaylist?.key || state.openPlaylist || ''}|${state.openArtist || ''}|${state.sort}|${state.filter || ''}|${state.genre || ''}|${list.length}|${list[0]?.id}|${list[list.length - 1]?.id}`;
  function searchTracks(list, query) {
    const q = normalize(query);
    if (!q) return list;
    const tokens = q.split(/\s+/).filter(Boolean);
    const key = listKeyOf(list);
    const narrow = lastExact.key === key && lastExact.result?.length && lastExact.q && q.startsWith(lastExact.q) && !/\s$/.test(lastExact.q);
    const exact = (narrow ? lastExact.result : list).filter((track) => tokens.every((token) => haystackOf(track).includes(token)));
    lastExact = { key, q, result: exact };
    const exactIds = new Set(exact.map((t) => t.id));
    // Frases de la letra (4+ letras): se suman al final
    const byLyrics = q.length >= 4 ? list.filter((t) => !exactIds.has(t.id) && lyricsMatch(t, q)) : [];
    if (exact.length || byLyrics.length) {
      byLyrics.forEach((t) => { t.matchedLyrics = true; });
      return [...exact, ...byLyrics];
    }
    // Sin resultados: se prueba con erratas («beyonse» → Beyoncé)
    return list.filter((track) => tokens.every((token) => haystackOf(track).includes(token) || fuzzyToken(token, track)));
  }

  function getVisibleTracks() {
    const list = applyFilters(baseTracks());
    if (!normalize(state.query)) return list;
    return searchTracks(list, state.query);
  }

  // Icono SVG del sprite: se clona de un modelo en vez de usar innerHTML (cada fila de la Biblioteca
  // lleva varios: al desplazar se analizaban cientos de trozos de HTML)
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const iconModels = new Map();
  function svgIcon(name, className = 'icon') {
    const key = `${className}|${name}`;
    let model = iconModels.get(key);
    if (!model) {
      model = document.createElementNS(SVG_NS, 'svg');
      model.setAttribute('class', className);
      model.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS(SVG_NS, 'use');
      use.setAttribute('href', `#i-${name}`);
      model.append(use);
      iconModels.set(key, model);
    }
    return model.cloneNode(true);
  }

  function makeButton(className, action, label, icon, text = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.action = action;
    button.setAttribute('aria-label', label);
    button.title = label;
    if (icon) button.append(svgIcon(icon));
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

  // Hasta 4 portadas distintas de las canciones (las de un mismo álbum cuentan una vez)
  function mosaicCovers(tracks) {
    const covers = [];
    for (const track of tracks.slice(0, 60)) {
      if (!covers.includes(track.thumb)) covers.push(track.thumb);
      if (covers.length === 4) break;
    }
    return covers.length === 4 ? covers : covers.slice(0, 1);
  }

  function playlistCover(pl, size) {
    const tracks = playlistTracksOf(pl);
    // Tarjetas: miniatura de 320 px; la cabecera de la playlist usa la imagen grande
    const src = pl.cover?.type === 'image' ? (size <= 160 ? pl.cover.src.replace(/\.jpg$/, '-sm.jpg') : pl.cover.src)
      : pl.cover?.type === 'art' ? coverArt(pl) : '';
    if (src) {
      const img = document.createElement('img');
      img.className = 'pl-cover';
      img.src = src;
      img.alt = '';
      img.width = size;
      img.height = size;
      img.loading = 'lazy';
      img.decoding = 'async';
      return img;
    }
    // Sin portada propia: mosaico con las portadas de sus canciones (y su icono en una esquina)
    const covers = mosaicCovers(tracks);
    if (covers.length) {
      const mosaic = makeEl('span', `pl-cover pl-mosaic${covers.length === 4 ? '' : ' is-single'}`);
      mosaic.setAttribute('aria-hidden', 'true');
      const cell = covers.length === 4 ? Math.ceil(size / 2) : size;
      covers.forEach((cover) => {
        const img = document.createElement('img');
        img.src = cover;
        img.alt = '';
        img.width = cell;
        img.height = cell;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('error', () => { img.src = PLACEHOLDER_COVER; }, { once: true });
        mosaic.append(img);
      });
      if (pl.emoji && pl.kind !== 'system') {
        const badge = makeEl('span', 'pl-cover-badge');
        setPlaylistIcon(badge, pl.emoji);
        badge.style.setProperty('--pl-color', pl.color || PLAYLIST_COLORS[0]);
        mosaic.append(badge);
      }
      return mosaic;
    }
    const cover = makeEl('span', 'pl-cover pl-cover-emoji');
    setPlaylistIcon(cover, pl.emoji);
    cover.style.setProperty('--pl-color', pl.color || PLAYLIST_COLORS[0]);
    cover.setAttribute('aria-hidden', 'true');
    return cover;
  }

  const KIND_LABELS = {
    system: 'Playlist de Liquid Bullet',
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
    if (state.view === 'artist') {
      head.replaceChildren(renderArtistHead(getArtist(state.openArtist)));
      return;
    }

    const today = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    const titles = {
      home: [today, greeting()],
      artists: [searching ? 'Buscando artistas' : `${labArtists().size} en tu colección`, 'Artistas'],
      library: ['Toda tu música', 'Biblioteca'],
      playlists: searching ? ['Buscando en la biblioteca', 'Resultados'] : ['Oficiales, compartidas y tuyas', 'Playlists'],
      favorites: ['Tus corazones', 'Favoritas'],
      stats: [monthInfo(state.statsOffset).label, 'Tus estadísticas'],
      lab: ['Mezclas a tu medida', 'Lab']
    };
    const [eyebrow, title] = titles[state.view];
    const text = makeEl('div', 'view-text');
    text.append(makeEl('p', 'view-eyebrow', eyebrow), makeEl('h2', 'view-title', title));

    const actions = makeEl('div', 'view-actions');
    if (state.view === 'lab' || state.view === 'home' || state.view === 'artists') {
      // Sin acciones en la cabecera: todo está en su panel
    } else if (state.view === 'stats') {
      const prevMonth = makeButton('icon-btn', 'stats-prev', 'Mes anterior', 'back');
      const nextMonth = makeButton('icon-btn stats-next', 'stats-next', 'Mes siguiente', 'back');
      nextMonth.disabled = state.statsOffset >= 0;
      actions.append(prevMonth, nextMonth);
    } else if (state.view === 'playlists' && !searching) {
      const asList = settings.plView === 'list';
      actions.append(
        makeButton('btn btn-primary', 'new-playlist', 'Crear una playlist nueva', 'playlist-add', 'Nueva'),
        makeButton('icon-btn', 'toggle-plview', asList ? 'Ver en cuadrícula' : 'Ver en lista', asList ? 'grid' : 'list'),
        makeButton('icon-btn', 'import', 'Importar una copia de seguridad', 'upload'),
        makeButton('icon-btn', 'export', 'Descargar una copia de seguridad de tus playlists', 'download')
      );
      const trashed = trashList().length;
      if (trashed) actions.append(makeButton('btn btn-ghost btn-small', 'open-trash', 'Recuperar playlists borradas', 'delete', `Papelera (${trashed})`));
    } else {
      actions.append(
        markPlayable(makeButton('icon-btn play-btn view-play', 'play-view', 'Reproducir todo', 'play'), viewSource(), 'todo'),
        makeButton('icon-btn', 'shuffle-view', 'Reproducir en aleatorio', 'shuffle'),
        makeButton('icon-btn', 'add-all', 'Añadir todas estas canciones a una playlist', 'playlist-add')
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
    tintFromCover(pl, header);
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
      markPlayable(makeButton('icon-btn play-btn view-play', 'play-view', `Reproducir ${pl.name}`, 'play'), `pl:${pl.key}`, pl.name),
      makeButton('icon-btn', 'shuffle-view', 'Reproducir en aleatorio', 'shuffle')
    );
    if (offline.supported && tracks.length) actions.append(makeButton('icon-btn playlist-download', 'download-playlist', 'Descargar', 'download'));
    const pinned = isPinned(pl.key);
    const pin = makeButton(`icon-btn pin-btn${pinned ? ' is-active' : ''}`, 'pin-playlist', pinned ? 'Dejar de fijar' : 'Fijar arriba en Playlists', 'pin');
    pin.setAttribute('aria-pressed', String(pinned));
    actions.append(pin);
    if (pl.kind !== 'auto') {
      const hidden = isHiddenPl(pl.key);
      actions.append(makeButton('icon-btn', 'hide-playlist', hidden ? 'Volver a mostrar en las listas' : 'Ocultar de las listas', hidden ? 'eye' : 'eye-off'));
    }
    if (tracks.length) actions.append(makeButton('icon-btn', 'share-playlist', 'Compartir playlist', 'share'));
    if (tracks.length) actions.append(makeButton('btn btn-ghost btn-small', 'export-m3u', 'Descargar como .m3u (VLC y otros reproductores)', '', '.m3u'));
    if (pl.kind === 'local') {
      actions.append(
        makeButton('icon-btn', 'edit-playlist', 'Cambiar nombre, icono o color', 'edit'),
        makeButton('icon-btn', 'copy-playlist', 'Duplicar esta playlist', 'playlist-add'),
        makeButton('icon-btn', 'delete-playlist', 'Eliminar de este dispositivo', 'delete')
      );
    } else {
      actions.append(makeButton('btn', 'copy-playlist', 'Copiar a mis playlists', 'playlist-add', 'Copiar a mis playlists'));
      if (pl.key === 'auto:recent' && tracks.length) actions.append(makeButton('icon-btn', 'clear-recent', 'Borrar el historial', 'delete'));
    }
    wrap.append(back, header, actions);

    if (pl.kind === 'local') {
      wrap.append(makeEl('p', 'pl-note', 'Esta playlist vive solo en este navegador: si borras la caché o los datos del sitio, se pierde. Descarga una copia de seguridad desde Playlists para no perderla.'));
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
    if (isPinned(pl.key)) {
      const pin = makeEl('span', 'pl-pin');
      pin.replaceChildren(svgIcon('pin'));
      pin.title = 'Fijada';
      card.append(pin);
    }
    return card;
  }

  /* ---------- Playlists fijadas ---------- */
  const isPinned = (key) => library.pins.includes(key);

  function togglePin(key) {
    const pl = getPlaylist(key);
    if (!pl) return;
    const pinned = !isPinned(key);
    library.pins = pinned ? [key, ...library.pins] : library.pins.filter((k) => k !== key);
    storage.set(KEYS.pins, library.pins);
    haptic(pinned ? [12, 40, 12] : 10);
    showToast(pinned ? `Fijada arriba: «${pl.name}»` : `«${pl.name}» ya no está fijada.`);
    renderList();
  }

  /* ---------- Playlists ocultas ---------- */
  // Ocultar no borra nada: la playlist y sus canciones siguen en la Biblioteca y en los enlaces
  // compartidos; solo deja de aparecer en las listas. Se vuelven a mostrar desde Ajustes.
  const isHiddenPl = (key) => library.hidden.includes(key);
  const shownPls = (playlists) => playlists.filter((pl) => !isHiddenPl(pl.key));

  function setPlaylistHidden(key, hide, { quiet = false } = {}) {
    const pl = getPlaylist(key);
    if (hide === isHiddenPl(key)) return;
    library.hidden = hide ? [...library.hidden, key] : library.hidden.filter((k) => k !== key);
    storage.set(KEYS.hidden, library.hidden);
    haptic(10);
    updateCounts();
    renderHiddenSettings();
    if (hide && state.openPlaylist === key) setView('playlists');
    else renderList();
    if (quiet) return;
    const name = pl?.name || 'La playlist';
    if (hide) {
      showToast(`«${name}» está oculta. Vuelve a verla en Ajustes → Contenido oculto.`, {
        label: 'Deshacer',
        run: () => setPlaylistHidden(key, false, { quiet: true })
      });
    } else showToast(`«${name}» vuelve a verse.`);
  }

  // Ajustes → Contenido oculto
  function renderHiddenSettings() {
    if (!els.hiddenList) return;
    const items = library.hidden.map((key) => [key, getPlaylist(key)]).filter(([, pl]) => pl);
    els.hiddenEmpty.hidden = items.length > 0;
    els.hiddenShowAll.hidden = items.length < 2;
    els.hiddenList.replaceChildren(...items.map(([key, pl]) => {
      const li = makeEl('li', 'hidden-item');
      const show = makeButton('btn btn-small', 'unhide-playlist', `Mostrar ${pl.name}`, 'eye', 'Mostrar');
      show.dataset.key = key;
      li.append(playlistCover(pl, 40), makeEl('span', 'hidden-name', pl.name), show);
      return li;
    }));
  }

  /* ---------- Color de la cabecera según la portada de la playlist ---------- */
  function coverSample(pl) {
    if (pl.cover?.type === 'image') return { src: pl.cover.src.replace(/\.jpg$/, '-sm.jpg') };
    if (pl.cover?.type === 'art') return pl.cover.color ? { hex: pl.cover.color } : null;
    const first = playlistTracksOf(pl)[0];
    if (!first) return null;
    if (first.hue !== null && first.hue !== undefined) return { rgb: hslToRgb(first.hue / 360, 0.65, 0.5) };
    return { src: first.cover };
  }

  function setViewTint(color) {
    if (color) {
      els.library.style.setProperty('--view-tint', color);
      els.library.classList.add('is-tinted');
    } else {
      els.library.classList.remove('is-tinted');
    }
  }

  function tintFromCover(pl, hero) {
    const sample = coverSample(pl);
    const key = pl.key;
    const apply = (color) => {
      if (state.openPlaylist !== key) return;
      if (color) hero.style.setProperty('--pl-color', color);
      setViewTint(color || pl.color || '');
    };
    if (!sample) return apply(pl.color || '');
    if (sample.hex) return apply(sample.hex);
    if (sample.rgb) return apply(`rgb(${sample.rgb.map(Math.round).join(', ')})`);
    const cacheId = `cover:${sample.src}`;
    if (settings.ultra) return apply(pl.color || '');
    if (colorCache.has(cacheId)) {
      const rgb = colorCache.get(cacheId);
      return apply(rgb ? `rgb(${rgb.map(Math.round).join(', ')})` : pl.color || '');
    }
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.decoding = 'async';
    probe.onload = () => {
      const rgb = extractColor(probe);
      colorCache.set(cacheId, rgb);
      apply(rgb ? `rgb(${rgb.map(Math.round).join(', ')})` : pl.color || '');
    };
    probe.onerror = () => {
      colorCache.set(cacheId, null);
      apply(pl.color || '');
    };
    probe.src = sample.src;
    // Mientras carga, el color propio de la playlist
    setViewTint(pl.color || '');
  }

  /* ---------- Escuchadas hace poco (fila de portadas) ---------- */
  function renderRecentRow() {
    const show = state.view === 'library' && !normalize(state.query) && !settings.ultra;
    const tracks = show ? library.recent.map(getTrack).filter(Boolean).slice(0, 12) : [];
    els.recentRow.hidden = !tracks.length;
    if (!tracks.length) {
      els.recentRow.replaceChildren();
      return;
    }
    const scroller = makeEl('div', 'recent-scroller');
    tracks.forEach((track) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'recent-card';
      card.dataset.action = 'recent-play';
      card.dataset.value = track.id;
      card.setAttribute('aria-label', `Reproducir ${track.title} de ${track.artist}`);
      if (state.currentTrack?.id === track.id) card.classList.add('is-current');
      const img = document.createElement('img');
      img.src = track.thumb;
      img.alt = '';
      img.width = 112;
      img.height = 112;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => { img.src = PLACEHOLDER_COVER; }, { once: true });
      card.append(img, makeEl('span', 'recent-title', track.title), makeEl('span', 'recent-artist', track.knownArtist || track.genre || track.artist));
      scroller.append(card);
    });
    const head = makeEl('div', 'recent-head');
    const heading = makeEl('h3', 'pl-section-title');
    heading.append(sticker('recientes'), 'Escuchadas hace poco');
    head.append(heading);
    els.recentRow.replaceChildren(head, scroller);
  }

  // Reproduce una colección concreta (p. ej. el historial) como cola, sin cambiar de vista
  function playCollection(tracks, startId, context, source = `col:${context}`) {
    const start = getTrack(startId);
    if (!start) return;
    if (!isPlayable(start)) {
      showToast('Sin conexión: esta canción no está descargada.');
      return;
    }
    state.radio = null;
    state.playSource = source;
    state.baseQueue = tracks.map((t) => t.id);
    state.queueContext = context;
    state.queue = state.baseQueue.slice();
    state.queueIndex = Math.max(0, state.queue.indexOf(startId));
    if (state.shuffle) applyShuffle();
    loadTrack(start, true, dj.enabled ? 1.5 : 0);
  }

  /* ---------- Compartir canciones y playlists ----------
     Cada canción y cada playlist de base tiene una página en s/ (la genera tools/build_catalog.py)
     con su portada en las etiquetas Open Graph: así WhatsApp, Instagram o iMessage muestran la
     miniatura. Esa página manda a la app con ?t=… o ?p=…. Las playlists propias viajan dentro del
     enlace (s/mix.html#n=…&t=…) porque solo existen en tu navegador. */
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SHARE_MIX_LIMIT = 150;
  const shareSlug = (id) => String(id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const appBase = () => new URL('./', location.href.split(/[?#]/)[0]).href;

  async function shareLink({ title, text, url }) {
    haptic(10);
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Enlace copiado: pégalo donde quieras.');
    } catch {
      window.prompt('Copia este enlace para compartir:', url);
    }
  }

  function shareTrack(id) {
    const track = getTrack(id);
    if (!track) return;
    const who = track.knownArtist ? ` de ${track.knownArtist}` : '';
    // Si es la que suena y vas por la mitad, el enlace empieza en ese segundo (#at=)
    const now = state.currentTrack?.id === id ? Math.floor(els.audio.currentTime || 0) : 0;
    const at = now >= 15 && now < getDuration() - 15 ? now : 0;
    openShareSheet({
      kind: 'Canción',
      title: track.title,
      subtitle: track.knownArtist || track.genre || 'Liquid Bullet',
      image: track.cover,
      linkTitle: `${track.title}${track.knownArtist ? ` · ${track.knownArtist}` : ''}`,
      text: `Escucha «${track.title}»${who} en Liquid Bullet${at ? ` (desde el ${formatTime(at)})` : ''}`,
      url: `${appBase()}s/t-${shareSlug(track.id)}.html${at ? `#at=${at}` : ''}`
    });
  }

  function sharePlaylist(pl) {
    if (!pl) return;
    if (pl.kind === 'system' && pl.id) {
      openShareSheet({
        kind: 'Playlist', title: pl.name, subtitle: songsLabel(pl.trackIds.length), image: coverSrcOf(pl.cover, false),
        linkTitle: pl.name, text: `Escucha la playlist «${pl.name}» en Liquid Bullet`, url: `${appBase()}s/p-${encodeURIComponent(pl.id)}.html`
      });
      return;
    }
    const ids = playlistTracksOf(pl).map((t) => t.id);
    if (!ids.length) {
      showToast('Esta playlist está vacía: añade canciones antes de compartirla.');
      return;
    }
    if (ids.length > SHARE_MIX_LIMIT) showToast(`Se comparten las primeras ${SHARE_MIX_LIMIT} canciones.`);
    const hash = new URLSearchParams({ n: pl.name, t: ids.slice(0, SHARE_MIX_LIMIT).join(',') });
    const first = playlistTracksOf(pl)[0];
    openShareSheet({
      kind: 'Playlist', title: pl.name, subtitle: songsLabel(ids.length), image: coverSrcOf(pl.cover, false) || first?.cover,
      linkTitle: pl.name, text: `Te paso mi playlist «${pl.name}» de Liquid Bullet`, url: `${appBase()}s/mix.html#${hash}`
    });
  }

  // Enlace con el que se abrió la app (?t=canción, ?p=playlist o ?mix=1#n=…&t=…)
  let incomingLink = (() => {
    try {
      const query = new URLSearchParams(location.search);
      const hash = new URLSearchParams(location.hash.slice(1));
      if (query.get('t')) return { track: query.get('t'), at: Math.max(0, Number(hash.get('at')) || 0) };
      if (query.get('p')) return { playlist: query.get('p') };
      // Accesos directos de la app instalada (manifest): ?view=search, favorites, library, lab…
      if (query.get('view')) return { view: query.get('view') };
      // Compartir hacia la app instalada (share_target del manifest): un enlace de Liquid o texto para buscar
      const shared = [query.get('url'), query.get('text'), query.get('title')].filter(Boolean).join(' ').trim();
      if (shared) {
        const inner = shared.match(/[?&]([tp])=([^&\s#]+)/);
        if (inner) return inner[1] === 't' ? { track: decodeURIComponent(inner[2]) } : { playlist: decodeURIComponent(inner[2]) };
        return { search: shared.replace(/https?:\/\/\S+/g, '').trim().slice(0, 120) };
      }
      if (query.has('mix') && hash.get('t')) {
        return { mix: (hash.get('n') || 'Playlist compartida').slice(0, 60), ids: hash.get('t').split(',').filter(Boolean) };
      }
    } catch { /* enlace mal formado */ }
    return null;
  })();

  function clearIncomingLink() {
    incomingLink = null;
    try { history.replaceState(history.state, '', location.pathname); } catch { /* sin history */ }
  }

  // Se llama cada vez que llegan canciones; si aún no existe lo enlazado, espera a la lista fresca
  function openIncomingLink(final) {
    const link = incomingLink;
    if (!link || !state.tracks.length) return;
    if (link.search !== undefined) {
      clearIncomingLink();
      if (!link.search) return;
      setView('library');
      els.searchInput.value = link.search;
      els.searchInput.dispatchEvent(new Event('input'));
      return;
    }
    if (link.view) {
      clearIncomingLink();
      if (link.view === 'search') {
        setView('library');
        els.searchInput.focus({ preventScroll: true });
      } else if (VIEWS.includes(link.view)) {
        setView(link.view);
      }
      return;
    }
    if (link.track) {
      const track = getTrack(link.track);
      if (!track) {
        if (final) { clearIncomingLink(); showToast('Esa canción ya no está en Liquid Bullet.'); }
        return;
      }
      const home = systemPlaylists().find((p) => p.trackIds.includes(track.id));
      const list = home ? playlistTracksOf(home) : [track];
      state.baseQueue = list.map((t) => t.id);
      state.queueContext = home ? home.name : 'Canción compartida';
      state.queue = state.baseQueue.slice();
      state.queueIndex = Math.max(0, state.queue.indexOf(track.id));
      loadTrack(track, false);
      if (link.at) state.pendingSeek = link.at;
      clearIncomingLink();
      showToast(`Te compartieron «${track.title}»${link.at ? ` desde el ${formatTime(link.at)}` : ''}. Toca reproducir para escucharla.`);
      return;
    }
    if (link.playlist) {
      const pl = getPlaylist(`sys:${link.playlist}`);
      if (!pl) {
        if (final) { clearIncomingLink(); showToast('Esa playlist ya no está en Liquid Bullet.'); }
        return;
      }
      clearIncomingLink();
      openPlaylist(pl.key);
      showToast(`Te compartieron «${pl.name}».`);
      return;
    }
    const ids = link.ids.filter((id) => getTrack(id));
    if (!ids.length && !final) return;
    clearIncomingLink();
    if (!ids.length) {
      showToast('Las canciones de esa playlist ya no están en Liquid Bullet.');
      return;
    }
    const same = library.local.find((p) => p.name === link.mix && p.trackIds.join(',') === ids.join(','));
    const playlist = same || {
      id: newId(), name: link.mix, emoji: 'ic:gift',
      color: PLAYLIST_COLORS[Math.floor(Math.random() * PLAYLIST_COLORS.length)],
      trackIds: ids, createdAt: Date.now()
    };
    if (!same) {
      library.local.push(playlist);
      saveLocalPlaylists();
    }
    openPlaylist(`local:${playlist.id}`);
    showToast(same ? `Ya tenías «${playlist.name}».` : `«${playlist.name}» se guardó en tus playlists.`);
  }

  /* =========================================================
     Inicio, artistas, radio y búsquedas recientes
     Liquid es tu colección de MP3, no un catálogo infinito: todo sale de tus canciones,
     de lo que escuchas (Escuchadas hace poco, más escuchadas, favoritas) y de las playlists.
     Nada sale del navegador.
     ========================================================= */
  const HOME_MIX_SIZE = 30;
  const RADIO_BATCH = 40;
  const SEARCH_HISTORY = 8;
  const ARTISTS_PAGE = 120;
  const home = { collections: new Map(), artistsShown: ARTISTS_PAGE };

  // Aleatorio repetible: el mismo día da los mismos mixes; la misma semana, el mismo Descubre
  function seededRandom(seedText) {
    let seed = hashString(seedText) || 1;
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(items, seedText) {
    const rand = seededRandom(seedText);
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const weekKey = () => {
    const d = new Date();
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return `${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
  };
  const playsOf = (id) => Number(library.plays[id]) || 0;
  const artistKeyCache = new Map();
  const artistKeyOf = (track) => {
    const raw = track?.knownArtist || '';
    let key = artistKeyCache.get(raw);
    if (key === undefined) { key = normalize(mainArtist(track)); artistKeyCache.set(raw, key); }
    return key;
  };
  const getArtist = (key) => labArtists().get(key) || null;
  const isFollowing = (key) => library.follows.includes(key);

  // Evita el mismo artista muy seguido (y rachas largas de un estilo) cuando se puede
  const spreadArtists = (tracks) => spaceOut(tracks);

  // Cuánto te gusta cada estilo: escuchas y favoritas
  function genreScores() {
    const scores = new Map();
    Object.entries(library.plays).forEach(([id, plays]) => {
      const track = getTrack(id);
      if (track?.genre) scores.set(track.genre, (scores.get(track.genre) || 0) + Number(plays || 0));
    });
    state.favorites.forEach((id) => {
      const track = getTrack(id);
      if (track?.genre) scores.set(track.genre, (scores.get(track.genre) || 0) + 3);
    });
    return scores;
  }

  // Artistas que más escuchas (o, sin historial, una selección del día)
  function topArtists(limit) {
    const artists = labArtists();
    let keys = tasteProfile().topArtists.filter((key) => artists.has(key));
    if (keys.length < limit) {
      const extra = seededShuffle([...artists.values()].filter((a) => a.tracks.length >= 4).map((a) => a.key), `artistas-${todayKey()}`);
      keys = [...new Set([...keys, ...extra])];
    }
    return keys.slice(0, limit).map((key) => artists.get(key));
  }

  function artistPlays(entry) {
    return entry.tracks.reduce((sum, t) => sum + playsOf(t.id), 0);
  }

  function artistTracks(key) {
    const entry = getArtist(key);
    if (!entry) return [];
    return entry.tracks.slice().sort((a, b) => playsOf(b.id) - playsOf(a.id));
  }

  /* ---------- Radio: no se acaba, se renueva con artistas parecidos ---------- */
  function radioBatch(seedKey, exclude = []) {
    const base = getArtist(seedKey);
    if (!base) return [];
    const similar = similarArtists(seedKey, 10);
    const pool = [
      ...base.tracks.map((t) => [t, 3]),
      ...similar.flatMap((artist, i) => artist.tracks.map((t) => [t, 2 - i * 0.12]))
    ];
    const skip = new Set(exclude);
    const profile = tasteProfile();
    // Peso = cercanía al artista semilla × lo que te gusta × lo poco que ha sonado últimamente
    const pick = (allowRepeats) => {
      const used = new Set();
      const candidates = pool.filter(([t]) => (allowRepeats || !skip.has(t.id)) && isPlayable(t) && !isDisliked(t.id)
        && !used.has(t.songKey) && used.add(t.songKey));
      return weightedOrder(candidates, ([t, weight]) => weight * (1 + Math.max(-0.6, trackAffinity(t, profile)) * 0.5)
        * (allowRepeats ? 1 : recencyFactor(t.id)))
        .map(([t]) => t)
        .slice(0, RADIO_BATCH);
    };
    let tracks = pick(false);
    if (tracks.length < 8) tracks = pick(true);
    return spreadArtists(tracks);
  }

  function startRadio(seedKey, startTrack = null) {
    const entry = getArtist(seedKey);
    if (!entry) {
      showToast('No hay suficientes canciones de este artista para una radio.');
      return;
    }
    let tracks = radioBatch(seedKey, startTrack ? [startTrack.id] : []);
    if (startTrack) tracks = [startTrack, ...tracks];
    else {
      // Empieza con una canción del propio artista
      const own = tracks.findIndex((t) => creditedArtists(t).some((name) => normalize(name) === seedKey));
      if (own > 0) tracks.unshift(...tracks.splice(own, 1));
    }
    if (!tracks.length) {
      showToast(navigator.onLine ? 'No hay canciones para esta radio.' : 'Sin conexión: descarga canciones para escuchar la radio.');
      return;
    }
    if (state.shuffle) toggleShuffle();
    playCollection(tracks, tracks[0].id, `Radio · ${entry.name}`, `radio:${seedKey}`);
    taste.rememberContext({ key: `radio:${seedKey}`, kind: 'radio', value: seedKey, title: `Radio de ${entry.name}`, image: entry.tracks[0]?.thumb || '' });
    state.radio = { seed: seedKey };
    showToast(`Radio de ${entry.name}: se va renovando sola con artistas parecidos.`);
  }

  // Al llegar al final de una radio se suman más canciones
  function extendRadio() {
    if (!state.radio) return false;
    const more = radioBatch(state.radio.seed, state.queue.slice(-150)).map((t) => t.id);
    if (!more.length) return false;
    state.baseQueue.push(...more);
    state.queue.push(...more);
    resume.saveQueue();
    return true;
  }

  /* ---------- Seguir artistas (en este navegador) ---------- */
  function toggleFollow(key) {
    const entry = getArtist(key);
    if (!entry) return;
    const following = isFollowing(key);
    library.follows = following ? library.follows.filter((k) => k !== key) : [key, ...library.follows];
    storage.set(KEYS.follows, library.follows);
    haptic(12);
    showToast(following ? `Dejaste de seguir a ${entry.name}.` : `Sigues a ${entry.name}: sale primero en Artistas y en Inicio.`);
    if (['home', 'artists', 'artist'].includes(state.view)) renderList();
    updateAbout(state.currentTrack);
  }

  function openArtist(key) {
    if (!getArtist(key)) return;
    state.query = '';
    els.searchInput.value = '';
    state.openArtist = key;
    setView('artist');
    els.library.scrollIntoView({ block: 'start', behavior: settings.motion ? 'smooth' : 'auto' });
  }

  /* ---------- Piezas de Inicio y Artistas ---------- */
  function homeSection(title, hint) {
    const section = makeEl('section', 'home-section');
    const head = makeEl('div', 'home-section-head');
    head.append(makeEl('h3', 'home-section-title', title));
    if (hint) head.append(makeEl('p', 'home-section-hint', hint));
    section.append(head);
    return section;
  }

  function photoImg(src, size, className = '') {
    const img = document.createElement('img');
    img.className = className;
    img.src = src || PLACEHOLDER_COVER;
    img.alt = '';
    img.width = size;
    img.height = size;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => { img.src = PLACEHOLDER_COVER; }, { once: true });
    return img;
  }

  const coverSrcOf = (cover, small = true) => (cover?.type === 'image' ? (small ? cover.src.replace(/\.jpg$/, '-sm.jpg') : cover.src) : '');

  function collectionCard(key, title, sub, image, tracks) {
    home.collections.set(key, { title, tracks });
    const card = makeEl('button', 'home-card');
    card.type = 'button';
    card.dataset.action = 'home-play';
    card.dataset.value = key;
    markPlayable(card, `home:${key}`, title);
    card.setAttribute('aria-label', `Reproducir ${title}`);
    const art = makeEl('span', 'home-card-art');
    art.append(photoImg(image, 160), makeEl('span', 'home-card-label', title));
    const play = makeEl('span', 'home-card-play');
    play.replaceChildren(svgIcon('play'));
    art.append(play);
    const names = [...new Set(tracks.map((t) => mainArtist(t)).filter(Boolean))].slice(0, 3).join(', ');
    card.append(art, makeEl('span', 'home-card-title', sub), makeEl('span', 'home-card-sub', names || songsLabel(tracks.length)));
    return card;
  }

  function artistCard(entry, extraClass = '') {
    const card = makeEl('button', `artist-card ${extraClass}`.trim());
    card.type = 'button';
    card.dataset.action = 'open-artist';
    card.dataset.value = entry.key;
    const plays = artistPlays(entry);
    card.append(
      photoImg(entry.tracks[0]?.thumb, 96, 'artist-photo'),
      makeEl('span', 'artist-name', entry.name),
      makeEl('span', 'artist-meta', isFollowing(entry.key) ? 'Siguiendo' : plays ? `${plays} escucha${plays === 1 ? '' : 's'}` : songsLabel(entry.tracks.length))
    );
    return card;
  }

  // Elige n canciones de una lista con un aleatorio repetible (mismo día = misma elección),
  // favoreciendo lo que más te gusta y lo que no ha sonado hace poco; máximo `perArtist` por artista
  function pickTracks(list, n, seed, weightOf, perArtist = 3) {
    const rand = seededRandom(seed);
    const used = new Set();
    const count = new Map();
    const out = [];
    for (const track of weightedOrder(list, weightOf, rand)) {
      if (out.length >= n) break;
      if (used.has(track.songKey)) continue;
      const artist = artistKeyOf(track);
      if ((count.get(artist) || 0) >= perArtist) continue;
      used.add(track.songKey);
      count.set(artist, (count.get(artist) || 0) + 1);
      out.push(track);
    }
    return out;
  }

  const likeWeight = (p, boost = 1) => (t) => Math.max(0.05, 1 + trackAffinity(t, p) * boost) * recencyFactor(t.id);
  const isFamiliar = (t, p) => p.trackN(t.id) > 0.02 || state.favorites.has(t.id);
  const usable = (t) => !isDisliked(t.id);

  // Mix diario: como los de Spotify, cada uno nace de un artista que escuchas mucho
  // (sin repetir «familia» de artistas): mitad lo que ya te gusta, mitad parecidos por descubrir
  function dailyMixes(p = tasteProfile()) {
    const day = todayKey();
    if (!p.hasHistory) {
      const playlists = seededShuffle(shownPls(systemPlaylists()).filter((pl) => pl.trackIds.length), `mixes-${day}`);
      return playlists.slice(0, 4).map((pl, i) => ({
        key: `mix-${i + 1}`, name: `Mix diario ${i + 1}`, sub: pl.name, cover: coverSrcOf(pl.cover, false),
        tracks: spaceOut(pickTracks(playlistTracksOf(pl).filter(usable), HOME_MIX_SIZE, `m${i}${day}`, () => 1))
      }));
    }
    const artists = labArtists();
    const covered = new Set();
    const mixes = [];
    for (const seed of p.topArtists) {
      if (mixes.length >= 6) break;
      if (covered.has(seed) || !artists.has(seed)) continue;
      const family = [artists.get(seed), ...similarArtists(seed, 8)];
      family.forEach((entry) => covered.add(entry.key));
      const pool = family.flatMap((entry) => entry.tracks).filter(usable);
      if (pool.length < 12) continue;
      const known = pickTracks(pool.filter((t) => isFamiliar(t, p)), HOME_MIX_SIZE / 2, `k${seed}${day}`, likeWeight(p));
      const fresh = pickTracks(pool.filter((t) => !isFamiliar(t, p)), HOME_MIX_SIZE - known.length, `f${seed}${day}`, likeWeight(p, 0.6));
      const tracks = spaceOut(seededShuffle([...known, ...fresh], `m${seed}${day}`));
      const names = [...new Set(tracks.map((t) => mainArtist(t)))].slice(0, 3);
      const genre = [...artists.get(seed).genres.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const pl = shownPls(systemPlaylists()).find((x) => x.name === genre);
      mixes.push({ key: `mix-${mixes.length + 1}`, name: `Mix diario ${mixes.length + 1}`, sub: `${names.join(', ')} y más`,
        cover: coverSrcOf(pl?.cover, false) || tracks[0]?.cover, tracks });
    }
    return mixes;
  }

  // Tu daylist: lo que sueles poner a esta hora (estilos del momento del día), cambia 4 veces al día
  function daylist(p = tasteProfile()) {
    const seg = daySegment();
    const segMap = p.segGenres[seg];
    const ranked = segMap.size
      ? [...segMap.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)
      : p.topGenres;
    const visible = new Set(shownPls(systemPlaylists()).map((pl) => pl.name));
    const genres = (ranked.length ? ranked : seededShuffle([...visible], `daylist-${todayKey()}-${seg}`))
      .filter((g) => visible.has(g)).slice(0, 3);
    if (!genres.length) return null;
    const pool = state.libraryTracks.filter((t) => genres.includes(t.genre) && usable(t));
    const seed = `daylist-${todayKey()}-${seg}`;
    const known = pickTracks(pool.filter((t) => isFamiliar(t, p)), 20, `${seed}k`, likeWeight(p), 2);
    const fresh = pickTracks(pool.filter((t) => !isFamiliar(t, p)), 40 - known.length, `${seed}f`, likeWeight(p, 0.7), 2);
    const tracks = spaceOut(seededShuffle([...known, ...fresh], seed));
    const weekday = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][new Date().getDay()];
    const pl = shownPls(systemPlaylists()).find((x) => x.name === genres[0]);
    return { key: 'daylist', name: `Tu ${weekday} ${SEGMENTS[seg].label}`, genres, cover: coverSrcOf(pl?.cover, false), tracks };
  }

  // Selección rápida (como en YouTube Music): 16 canciones para empezar ya; cada una arranca su radio
  function quickPicks(p = tasteProfile()) {
    const seed = `picks-${todayKey()}-${Math.floor(new Date().getHours() / 3)}`;
    const pool = state.libraryTracks.filter((t) => usable(t) && t.id !== state.currentTrack?.id);
    const liked = pickTracks(pool.filter((t) => isFamiliar(t, p)), 10, `${seed}a`, likeWeight(p, 1.4), 1);
    const taken = new Set(liked.map((t) => t.id));
    const discover = pickTracks(pool.filter((t) => !taken.has(t.id) && !isFamiliar(t, p)), 16 - liked.length, `${seed}b`,
      (t) => Math.max(0.05, 0.4 + p.relatedN(artistKeyOf(t)) + p.genreN(t.genre) * 0.6), 1);
    return seededShuffle([...liked, ...discover], seed);
  }

  // Descubre semanal: canciones que nunca has oído de artistas cercanos a los tuyos
  function weeklyDiscover(p = tasteProfile()) {
    const pool = state.libraryTracks.filter((t) => !playsOf(t.id) && !p.tracks.has(t.id) && usable(t));
    return spaceOut(pickTracks(pool, HOME_MIX_SIZE, `descubre-${weekKey()}`,
      (t) => 0.15 + p.relatedN(artistKeyOf(t)) * 1.5 + Math.max(0, p.genreN(t.genre)) + Math.max(0, p.artistN(artistKeyOf(t))) * 0.6, 2));
  }

  // En repetición: lo que más has escuchado en los últimos 30 días
  function onRepeat(p = tasteProfile()) {
    return [...p.recentTracks.entries()].sort((a, b) => b[1] - a[1])
      .map(([id]) => getTrack(id)).filter((t) => t && usable(t)).slice(0, HOME_MIX_SIZE);
  }

  // Joyas olvidadas: te gustaban mucho y llevan semanas sin sonar
  function forgottenGems(p = tasteProfile()) {
    return state.libraryTracks
      .filter((t) => usable(t) && (playsOf(t.id) >= 3 || state.favorites.has(t.id)) && taste.hoursSince(t.id) > 21 * 24
        && !((p.lastAge.get(t.id) ?? Infinity) < 21))
      .sort((a, b) => (playsOf(b.id) + (state.favorites.has(b.id) ? 3 : 0)) - (playsOf(a.id) + (state.favorites.has(a.id) ? 3 : 0)))
      .slice(0, HOME_MIX_SIZE);
  }

  // Radar: lo recién añadido, ordenado por lo que te va a gustar
  function newRadar(p = tasteProfile()) {
    return newArrivals().filter(usable).sort((a, b) => trackAffinity(b, p) - trackAffinity(a, p)).slice(0, 50);
  }

  // Artistas parecidos a los tuyos que aún no has escuchado
  function artistsToDiscover(p = tasteProfile()) {
    const artists = labArtists();
    return [...p.related.entries()].sort((a, b) => b[1] - a[1])
      .map(([key]) => artists.get(key))
      .filter((entry) => entry && !(p.artistN(entry.key) > 0) && !isFollowing(entry.key))
      .slice(0, 12);
  }

  // «Porque escuchaste X»: lo que más suena estos días, con sus parecidos
  function becauseYouListened(p = tasteProfile()) {
    const artists = labArtists();
    const seeds = (p.momentum.length ? p.momentum : p.topArtists).filter((key) => artists.has(key)).slice(0, 2);
    return seeds.map((key) => ({ seed: artists.get(key), similar: similarArtists(key, 8).filter((e) => e.tracks.length >= 2) }))
      .filter((row) => row.similar.length >= 3);
  }

  // Mismos tramos que la daylist (daySegment): el saludo y «Tu … de madrugada» nunca se contradicen
  function greeting() {
    return ['Feliz madrugada', 'Buenos días', 'Buenas tardes', 'Buenas noches'][daySegment()];
  }

  function homeHeader(p) {
    // El saludo ya está en la cabecera: aquí, un resumen de tu semana (lleva a Stats)
    const head = makeEl('div', 'home-hello');
    if (p.weekSeconds < 60) return null;
    {
      const top = p.momentum[0] && getArtist(p.momentum[0]);
      const go = makeEl('button', 'home-week');
      go.type = 'button';
      go.dataset.action = 'go-view';
      go.dataset.value = 'stats';
      go.textContent = `Esta semana: ${formatTotal(p.weekSeconds)}${top ? ` · sobre todo ${top.name}` : ''}`;
      head.append(go);
    }
    return head;
  }

  // Accesos rápidos: lo último que pusiste (como Spotify), fijadas, tus playlists y tus estilos
  function quickTiles() {
    const tiles = [];
    const seen = new Set();
    const add = (pl) => {
      if (!pl || seen.has(pl.key) || !pl.trackIds.length || isHiddenPl(pl.key)) return;
      seen.add(pl.key);
      tiles.push({ kind: 'playlist', pl });
    };
    library.pins.forEach((key) => add(getPlaylist(key)));
    taste.contexts.forEach((ctx) => {
      if (tiles.length >= 8) return;
      if (ctx.kind === 'playlist') add(getPlaylist(ctx.value));
      else if ((ctx.kind === 'artist' || ctx.kind === 'radio') && getArtist(ctx.value) && !seen.has(ctx.key)) {
        seen.add(ctx.key);
        tiles.push({ kind: ctx.kind, ctx });
      }
    });
    localPlaylists().forEach(add);
    const scores = genreScores();
    systemPlaylists().filter((pl) => scores.get(pl.name)).sort((a, b) => scores.get(b.name) - scores.get(a.name)).forEach(add);
    add(autoPlaylists()[0]);
    seededShuffle(systemPlaylists(), `rapido-${todayKey()}`).forEach(add);
    return tiles.slice(0, state.favorites.size ? 7 : 8);
  }

  function quickTile(tile) {
    const button = makeEl('button', 'home-tile');
    button.type = 'button';
    if (tile.kind === 'playlist') {
      button.dataset.action = 'open-playlist';
      button.dataset.key = tile.pl.key;
      button.append(playlistCover(tile.pl, 56), makeEl('span', 'home-tile-name', tile.pl.name));
      return button;
    }
    const entry = getArtist(tile.ctx.value);
    button.dataset.action = tile.kind === 'radio' ? 'radio-artist' : 'open-artist';
    button.dataset.value = entry.key;
    button.classList.add(tile.kind === 'radio' ? 'is-radio' : 'is-artist');
    button.append(photoImg(entry.tracks[0]?.thumb, 56, 'home-tile-photo'), makeEl('span', 'home-tile-name', tile.ctx.title));
    return button;
  }

  function quickPicksSection(picks) {
    const section = homeSection('Selección rápida', 'Toca una y sigue con una radio a partir de ella.');
    const grid = makeEl('div', 'qp-grid');
    picks.forEach((track) => {
      const item = makeEl('button', 'qp-item');
      item.type = 'button';
      item.dataset.action = 'home-pick';
      item.dataset.value = track.id;
      item.setAttribute('aria-label', `${track.title}, de ${track.artist}: empezar radio`);
      const text = makeEl('span', 'qp-text');
      text.append(makeEl('span', 'qp-title', splitTitle(track.title).main), makeEl('span', 'qp-artist', track.knownArtist || track.artist));
      item.append(photoImg(track.thumb, 48, 'qp-cover'), text);
      grid.append(item);
    });
    section.append(grid);
    return section;
  }

  function heroCard(mix) {
    const hero = makeEl('button', 'home-hero');
    hero.type = 'button';
    hero.dataset.action = 'home-play';
    hero.dataset.value = mix.key;
    home.collections.set(mix.key, { title: mix.name, tracks: mix.tracks });
    markPlayable(hero, `home:${mix.key}`, mix.name);
    const art = photoImg(mix.cover || mix.tracks[0]?.cover, 140, 'home-hero-art');
    const text = makeEl('span', 'home-hero-text');
    text.append(
      makeEl('span', 'home-hero-eyebrow', 'Tu daylist · cambia con el día'),
      makeEl('span', 'home-hero-title', mix.name),
      makeEl('span', 'home-hero-sub', `${mix.genres.join(' · ')} · ${songsLabel(mix.tracks.length)}`)
    );
    const play = makeEl('span', 'home-hero-play');
    play.replaceChildren(svgIcon('play'));
    hero.append(art, text, play);
    return hero;
  }

  function cardRow(title, hint, cards, extraClass = '') {
    const list = cards.filter(Boolean);
    if (!list.length) return null;
    const section = homeSection(title, hint);
    const row = makeEl('div', `home-row ${extraClass}`.trim());
    row.append(...list);
    section.append(row);
    return section;
  }

  function renderHome() {
    home.collections.clear();
    const p = tasteProfile();
    const lite = settings.ultra;
    const parts = [homeHeader(p)];

    // Accesos rápidos
    const quick = makeEl('div', 'home-quick');
    if (state.favorites.size) {
      const fav = makeEl('button', 'home-tile');
      fav.type = 'button';
      fav.dataset.action = 'go-view';
      fav.dataset.value = 'favorites';
      fav.append(playlistCover({ kind: 'auto', trackIds: [...state.favorites], cover: null }, 56), makeEl('span', 'home-tile-name', 'Tus favoritas'));
      quick.append(fav);
    }
    quickTiles().forEach((tile) => quick.append(quickTile(tile)));
    parts.push(quick);

    // Tu daylist (lo que te va a esta hora)
    const day = daylist(p);
    if (day && day.tracks.length >= 8) parts.push(heroCard(day));

    // Selección rápida
    const picks = quickPicks(p);
    if (picks.length >= 4) parts.push(quickPicksSection(picks));

    // Mixes del día
    const mixes = dailyMixes(p);
    parts.push(cardRow('Tus mixes del día', p.hasHistory
      ? 'Uno por cada «familia» de artistas que escuchas: mitad conocidas, mitad parecidas por descubrir.'
      : 'Escucha un poco y se adaptarán a ti. Cambian cada día.',
    mixes.map((mix) => collectionCard(mix.key, mix.name, mix.sub, mix.cover, mix.tracks))));

    // Porque escuchaste…
    if (!lite) {
      becauseYouListened(p).forEach((row) => {
        parts.push(cardRow(`Porque escuchaste ${row.seed.name}`, '', row.similar.map((entry) => {
          const tracks = spaceOut(pickTracks(entry.tracks.filter(usable), 25, `like-${entry.key}-${todayKey()}`, likeWeight(p), 25));
          return tracks.length ? collectionCard(`like-${entry.key}`, entry.name, entry.name, tracks[0].cover, tracks) : null;
        })));
      });
    }

    // Hecho para ti
    const made = [];
    const add = (key, title, sub, list, image) => {
      if (list.length >= 3) made.push(collectionCard(key, title, sub, image || list[0].cover, list));
    };
    const fresh = newRadar(p);
    add('fresh', 'Radar de novedades', 'Lo nuevo, primero lo más tuyo', fresh);
    add('discover', 'Descubre', 'Descubre semanal', weeklyDiscover(p));
    add('top', 'En repetición', 'Tu último mes', onRepeat(p), coverSrcOf(autoPlaylists()[1].cover, false));
    add('gems', 'Joyas olvidadas', 'Te encantaban y llevan semanas sin sonar', forgottenGems(p));
    const recent = library.recent.map(getTrack).filter(Boolean).slice(0, HOME_MIX_SIZE);
    add('recent', 'De nuevo', 'Escuchadas hace poco', recent, coverSrcOf(autoPlaylists()[0].cover, false));
    if (!lite) {
      const weekday = weekdayMix();
      if (weekday.tracks.length >= 5) add('weekday', weekday.label, `Lo que sueles oír los ${weekday.plural}`, weekday.tracks);
      add('year-ago', 'Hace un año', 'Lo que sonaba por estas fechas', yearAgoTracks());
    }
    add('unheard', 'Sin estrenar', 'Nunca las has escuchado', neverHeard());
    parts.push(cardRow('Hecho para ti', 'Con lo que de verdad escuchas: se actualiza solo.', made));

    if (!lite) {
      // Artistas por descubrir
      parts.push(cardRow('Artistas por descubrir', 'Parecidos a los que más escuchas y que aún no has puesto.',
        artistsToDiscover(p).map((entry) => artistCard(entry)), 'is-artists'));

      // Artistas que sigues
      parts.push(cardRow('Artistas que sigues', '', library.follows.map(getArtist).filter(Boolean).slice(0, 12).map((entry) => artistCard(entry)), 'is-artists'));

      // Radios
      parts.push(cardRow('Radios', 'Empiezan por un artista y siguen con otros parecidos, sin fin.', topArtists(8).map((entry) => {
        const card = makeEl('button', 'artist-card is-radio');
        card.type = 'button';
        card.dataset.action = 'radio-artist';
        card.dataset.value = entry.key;
        card.setAttribute('aria-label', `Radio de ${entry.name}`);
        const photo = makeEl('span', 'artist-photo-wrap');
        photo.append(photoImg(entry.tracks[0]?.thumb, 96, 'artist-photo'), makeEl('span', 'radio-badge', 'RADIO'));
        const next = similarArtists(entry.key, 2).map((other) => other.name).filter(Boolean);
        card.append(photo, makeEl('span', 'artist-name', entry.name),
          makeEl('span', 'artist-meta', next.length ? `Con ${next.join(' y ')}` : 'Y artistas parecidos'));
        return card;
      }), 'is-artists'));
    }

    // Explorar estilos (primero los tuyos)
    const styles = homeSection('Explora tus estilos');
    styles.append(exploreGrid(p));
    parts.push(styles);

    els.homePanel.replaceChildren(...parts.filter(Boolean));
  }

  // Lo que más escuchas el mismo día de la semana (últimas 8 semanas)
  function weekdayMix() {
    const today = new Date();
    const names = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const plurals = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
    const seconds = new Map();
    for (let week = 1; week <= 8; week++) {
      const date = new Date(today);
      date.setDate(today.getDate() - week * 7);
      const entry = listen.log[dayKey(date)];
      if (!entry) continue;
      Object.entries(entry.s).forEach(([id, sec]) => seconds.set(id, (seconds.get(id) || 0) + sec));
    }
    const tracks = [...seconds.entries()].sort((a, b) => b[1] - a[1])
      .map(([id]) => getTrack(id)).filter((t) => t && !isDisliked(t.id)).slice(0, HOME_MIX_SIZE);
    const name = names[today.getDay()];
    return { label: `Tu ${name}`, plural: plurals[today.getDay()], tracks };
  }

  // Lo que escuchabas hace un año (± 4 días)
  function yearAgoTracks() {
    const seconds = new Map();
    for (let offset = -4; offset <= 4; offset++) {
      const date = new Date();
      date.setFullYear(date.getFullYear() - 1);
      date.setDate(date.getDate() + offset);
      const entry = listen.log[dayKey(date)];
      if (!entry) continue;
      Object.entries(entry.s).forEach(([id, sec]) => seconds.set(id, (seconds.get(id) || 0) + sec));
    }
    return [...seconds.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => getTrack(id)).filter(Boolean).slice(0, HOME_MIX_SIZE);
  }

  // Canciones que nunca has escuchado, distintas cada día
  function neverHeard() {
    const pool = state.libraryTracks.filter((t) => !library.plays[t.id] && !isDisliked(t.id));
    return spreadArtists(seededShuffle(pool, `unheard-${dayKey()}`)).slice(0, HOME_MIX_SIZE);
  }

  function exploreGrid(p = null) {
    const grid = makeEl('div', 'explore-grid');
    const list = shownPls(systemPlaylists()).filter((pl) => pl.trackIds.length);
    if (p) list.sort((a, b) => p.genreN(b.name) - p.genreN(a.name));
    list.forEach((pl) => {
      const tile = makeEl('button', 'explore-tile');
      tile.type = 'button';
      tile.dataset.action = 'open-playlist';
      tile.dataset.key = pl.key;
      tile.append(photoImg(coverSrcOf(pl.cover), 80), makeEl('span', 'explore-name', pl.name));
      grid.append(tile);
    });
    return grid;
  }

  function renderArtists() {
    const q = normalize(state.query);
    const all = [...labArtists().values()]
      .filter((entry) => !q || normalize(entry.name).includes(q))
      .sort((a, b) => (isFollowing(b.key) - isFollowing(a.key)) || (artistPlays(b) - artistPlays(a)) || (b.tracks.length - a.tracks.length) || collator.compare(a.name, b.name));
    const grid = makeEl('div', 'artist-grid');
    all.slice(0, home.artistsShown).forEach((entry) => grid.append(artistCard(entry)));
    const parts = [grid];
    if (!all.length) parts.unshift(makeEl('p', 'list-empty', 'Ningún artista coincide con la búsqueda.'));
    if (all.length > home.artistsShown) {
      parts.push(makeButton('btn artist-more', 'more-artists', 'Ver más artistas', 'grid', `Ver más (${all.length - home.artistsShown})`));
    }
    els.homePanel.replaceChildren(...parts);
  }

  function renderArtistHead(entry) {
    const wrap = makeEl('div', 'pl-detail');
    const back = makeButton('btn btn-ghost pl-back', 'go-view', 'Volver a Artistas', 'back', 'Artistas');
    back.dataset.value = 'artists';
    if (!entry) {
      wrap.append(back, makeEl('p', 'list-empty', 'Este artista ya no está en Liquid.'));
      return wrap;
    }
    const plays = artistPlays(entry);
    const header = makeEl('div', 'pl-hero artist-hero');
    const text = makeEl('div', 'pl-hero-text');
    text.append(
      makeEl('span', 'pl-kind pl-kind-system', isFollowing(entry.key) ? 'Artista · Siguiendo' : 'Artista'),
      makeEl('h2', 'pl-hero-name', entry.name),
      makeEl('span', 'artist-hero-meta', `${songsLabel(entry.tracks.length)} en Liquid${plays ? ` · lo escuchaste ${plays} ${plays === 1 ? 'vez' : 'veces'}` : ''}`)
    );
    header.append(photoImg(entry.tracks[0]?.cover, 112, 'artist-photo artist-photo-lg'), text);

    const actions = makeEl('div', 'pl-actions');
    const follow = makeButton(`btn follow-btn${isFollowing(entry.key) ? ' is-active' : ''}`, 'follow-artist', isFollowing(entry.key) ? 'Dejar de seguir' : 'Seguir', 'heart', isFollowing(entry.key) ? 'Siguiendo' : 'Seguir');
    follow.dataset.value = entry.key;
    follow.setAttribute('aria-pressed', String(isFollowing(entry.key)));
    const radio = makeButton('btn', 'radio-artist', `Radio de ${entry.name}`, 'radio', 'Radio');
    radio.dataset.value = entry.key;
    actions.append(
      markPlayable(makeButton('icon-btn play-btn view-play', 'play-view', `Reproducir ${entry.name}`, 'play'), `artist:${entry.key}`, entry.name),
      makeButton('icon-btn', 'shuffle-view', 'Reproducir en aleatorio', 'shuffle'),
      follow,
      radio
    );
    wrap.append(back, header, actions);

    // Dónde aparece y a quién escuchar después
    const homes = systemPlaylists().filter((pl) => entry.tracks.some((t) => pl.trackIds.includes(t.id)));
    const similar = similarArtists(entry.key, 8);
    if (homes.length || similar.length) {
      const more = makeEl('div', 'artist-links');
      if (homes.length) {
        const row = makeEl('div', 'chips');
        homes.forEach((pl) => {
          const chip = makeEl('button', 'chip', pl.name);
          chip.type = 'button';
          chip.dataset.action = 'open-playlist';
          chip.dataset.key = pl.key;
          row.append(chip);
        });
        more.append(makeEl('p', 'artist-links-title', 'Aparece en'), row);
      }
      if (similar.length) {
        const row = makeEl('div', 'chips');
        similar.forEach((other) => {
          const chip = makeEl('button', 'chip', other.name);
          chip.type = 'button';
          chip.dataset.action = 'open-artist';
          chip.dataset.value = other.key;
          row.append(chip);
        });
        more.append(makeEl('p', 'artist-links-title', 'Si te gusta, prueba'), row);
      }
      wrap.append(more);
    }
    return wrap;
  }

  /* ---------- Acerca del artista (debajo de la letra) ---------- */
  // Sonando: cada artista de la canción tiene su enlace y su ficha (una colaboración es de todos)
  function updateAbout(track) {
    const entries = track ? artistKeysOf(track).map(getArtist).filter(Boolean) : [];
    const main = entries[0] || null;
    els.npArtist.classList.toggle('is-link', entries.length === 1);
    els.npArtist.dataset.artist = main ? main.key : '';
    if (entries.length === 1) {
      els.npArtist.setAttribute('role', 'link');
      els.npArtist.tabIndex = 0;
    } else {
      els.npArtist.removeAttribute('role');
      els.npArtist.removeAttribute('tabindex');
    }
    // Varios artistas: cada nombre es su propio enlace («La Vendicion, La Obsesion, Yeyo…»)
    if (entries.length > 1) {
      const parts = [];
      entries.forEach((entry, i) => {
        if (i) parts.push(document.createTextNode(', '));
        const link = makeEl('span', 'np-artist-link', entry.name);
        link.dataset.artist = entry.key;
        link.setAttribute('role', 'link');
        link.tabIndex = 0;
        link.setAttribute('aria-label', `Ver ${entry.name}`);
        parts.push(link);
      });
      els.npArtist.replaceChildren(...parts);
    }
    els.npAbout.hidden = !entries.length;
    if (!entries.length) return;
    const multi = entries.length > 1;
    const cards = entries.map((entry) => {
      const plays = artistPlays(entry);
      const card = makeEl('div', 'about-card');
      const open = makeEl('button', 'about-open');
      open.type = 'button';
      open.dataset.artist = entry.key;
      const text = makeEl('span', 'about-text');
      // Un artista: como siempre («Acerca del artista» dentro de la ficha). Varios: un título arriba
      if (!multi) text.append(makeEl('span', 'about-eyebrow', 'Acerca del artista'));
      text.append(
        makeEl('span', 'about-name', entry.name),
        makeEl('span', 'about-meta', `${songsLabel(entry.tracks.length)} en Liquid${plays ? ` · ${plays} escucha${plays === 1 ? '' : 's'}` : ''}`)
      );
      // Foto: una canción propia del artista si la tiene (no la colaboración que suena)
      const own = entry.tracks.find((t) => t.id !== track.id) || entry.tracks[0];
      open.append(photoImg(own?.thumb, 56, 'artist-photo'), text);
      const follow = makeEl('button', `btn follow-btn${isFollowing(entry.key) ? ' is-active' : ''}`, isFollowing(entry.key) ? 'Siguiendo' : 'Seguir');
      follow.type = 'button';
      follow.dataset.follow = entry.key;
      follow.setAttribute('aria-pressed', String(isFollowing(entry.key)));
      follow.setAttribute('aria-label', `${isFollowing(entry.key) ? 'Dejar de seguir' : 'Seguir'} a ${entry.name}`);
      card.append(open, follow);
      return card;
    });
    els.npAbout.classList.toggle('is-multi', multi);
    if (multi) els.npAbout.replaceChildren(makeEl('p', 'about-eyebrow about-head', `Acerca de los artistas · ${entries.length}`), ...cards);
    else els.npAbout.replaceChildren(...cards);
  }

  /* ---------- Búsquedas recientes y explorar (al tocar el buscador) ---------- */
  function rememberSearch(text) {
    const q = String(text || '').trim();
    if (q.length < 2) return;
    library.searches = [q, ...library.searches.filter((s) => normalize(s) !== normalize(q))].slice(0, SEARCH_HISTORY);
    storage.set(KEYS.searches, library.searches);
  }

  function renderSearchPanel() {
    const show = document.activeElement === els.searchInput && !els.searchInput.value.trim();
    els.searchPanel.hidden = !show;
    if (!show) return;
    const parts = [];
    if (library.searches.length) {
      const head = makeEl('div', 'search-panel-head');
      head.append(makeEl('h3', 'search-panel-title', 'Búsquedas recientes'));
      const clear = makeEl('button', 'btn btn-ghost search-clear', 'Borrar');
      clear.type = 'button';
      clear.dataset.clearSearches = '1';
      head.append(clear);
      const list = makeEl('div', 'chips');
      library.searches.forEach((q) => {
        const chip = makeEl('button', 'chip', q);
        chip.type = 'button';
        chip.dataset.q = q;
        list.append(chip);
      });
      parts.push(head, list);
    }
    parts.push(makeEl('h3', 'search-panel-title', 'Explora tus estilos'), exploreGrid());
    els.searchPanel.replaceChildren(...parts);
  }

  /* ---------- Tarjeta para compartir (Historias, Estados, chats) ---------- */
  const shareCard = { data: null, color: 0, image: null, palette: [] };

  function averageColor(image) {
    try {
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext('2d');
      ctx.drawImage(image, 0, 0, 16, 16);
      const px = ctx.getImageData(0, 0, 16, 16).data;
      let r = 0; let g = 0; let b = 0;
      for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
      const n = px.length / 4;
      return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
    } catch {
      return '#3a2a6e';
    }
  }

  function wrapLines(ctx, text, maxWidth, maxLines) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`;
    }
    return lines;
  }

  function drawShareCard() {
    const canvas = els.shareCanvas;
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    const base = shareCard.palette[shareCard.color] || '#100d1c';
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, base);
    bg.addColorStop(1, '#07060c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // brillo de vidrio
    const glow = ctx.createRadialGradient(w * 0.3, h * 0.15, 10, w * 0.3, h * 0.15, w);
    glow.addColorStop(0, 'rgba(255,255,255,0.22)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const size = 500;
    const x = (w - size) / 2;
    const y = 250;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 24;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 36);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 36);
    ctx.clip();
    if (shareCard.image) ctx.drawImage(shareCard.image, x, y, size, size);
    ctx.restore();

    const data = shareCard.data;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = '800 56px Syne, Inter, system-ui, sans-serif';
    const lines = wrapLines(ctx, data.title, w - 120, 2);
    lines.forEach((line, i) => ctx.fillText(line, w / 2, y + size + 110 + i * 66));
    ctx.font = '600 36px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.fillText(wrapLines(ctx, data.subtitle, w - 120, 1)[0] || '', w / 2, y + size + 110 + lines.length * 66 + 20);
    ctx.font = '700 26px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(data.kind.toUpperCase(), w / 2, y - 60);
    ctx.font = '800 34px Syne, Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText('Liquid Bullet', w / 2, h - 90);
  }

  function openShareSheet(data) {
    shareCard.data = data;
    shareCard.color = 0;
    shareCard.image = null;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7a5cff';
    shareCard.palette = ['#3a2a6e', '#100d1c', accent];
    renderShareColors();
    drawShareCard();
    const image = new Image();
    image.onload = () => {
      shareCard.image = image;
      shareCard.palette[0] = averageColor(image);
      renderShareColors();
      drawShareCard();
    };
    image.src = data.image || 'icon-512.png';
    const fileShare = Boolean(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.png', { type: 'image/png' })] }));
    els.shareImage.textContent = fileShare ? 'Compartir imagen' : 'Guardar imagen';
    els.shareLinkBtn.hidden = !navigator.share;
    els.shareTitleText.textContent = data.kind === 'Playlist' ? 'Compartir playlist' : 'Compartir canción';
    if (!els.shareDialog.open) els.shareDialog.showModal();
  }

  function renderShareColors() {
    els.shareColors.replaceChildren(...shareCard.palette.map((color, i) => {
      const swatch = makeEl('button', `share-swatch${i === shareCard.color ? ' is-active' : ''}`);
      swatch.type = 'button';
      swatch.style.background = color;
      swatch.dataset.color = String(i);
      swatch.setAttribute('aria-label', `Fondo ${i + 1}`);
      swatch.setAttribute('aria-pressed', String(i === shareCard.color));
      return swatch;
    }));
  }

  function shareCardImage() {
    const data = shareCard.data;
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const name = `${normalize(data.title).replace(/\s+/g, '-') || 'liquid'}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: data.title, text: `${data.text} ${data.url}` });
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
      showToast('Imagen guardada: súbela a tus Historias o Estados.');
    }, 'image/png');
  }


  /* ---------- Filtros rápidos (píldoras) ---------- */
  const FILTERS = {
    all: 'Todo',
    downloaded: 'Descargadas',
    favorites: 'Favoritas',
    unplayed: 'Sin escuchar'
  };

  function applyFilters(list) {
    let result = list;
    if (state.filter === 'downloaded') result = result.filter(isDownloaded);
    else if (state.filter === 'favorites') result = result.filter((t) => state.favorites.has(t.id));
    else if (state.filter === 'unplayed') result = result.filter((t) => !library.plays[t.id]);
    if (state.genre) result = result.filter((t) => t.genre === state.genre);
    return result;
  }

  function makeChip(action, value, label, active) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `chip${active ? ' is-active' : ''}`;
    chip.dataset.action = action;
    chip.dataset.value = value;
    chip.setAttribute('aria-pressed', String(active));
    chip.textContent = label;
    return chip;
  }

  function renderChips(show) {
    els.filterChips.hidden = !show;
    if (!show) {
      els.filterChips.replaceChildren();
      return;
    }
    const chips = Object.entries(FILTERS)
      .filter(([key]) => !(key === 'favorites' && state.view === 'favorites') && !(key === 'downloaded' && !offline.supported))
      .map(([key, label]) => makeChip('filter', key, label, state.filter === key && !(key === 'all' && state.genre)));
    // Géneros de la lista que se ve, de más a menos canciones
    const counts = new Map();
    baseTracks().forEach((t) => { if (t.genre) counts.set(t.genre, (counts.get(t.genre) || 0) + 1); });
    const genres = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([genre]) => genre);
    if (state.genre && !genres.includes(state.genre)) state.genre = '';
    if (genres.length > 1) {
      chips.push(makeEl('span', 'chip-sep'));
      genres.forEach((genre) => chips.push(makeChip('genre', genre, genre, state.genre === genre)));
    }
    els.filterChips.replaceChildren(...chips);
  }

  /* ---------- Playlists que coinciden con la búsqueda ---------- */
  function renderSearchPlaylists(q) {
    const matches = q
      ? [...pinnedFirst(shownPls([...systemPlaylists(), ...localPlaylists()]))]
        .filter((pl) => normalize(`${pl.name} ${pl.description || ''}`).includes(q))
        .slice(0, 12)
      : [];
    const artists = q && state.view !== 'artists'
      // La clave del artista ya es su nombre normalizado: no se normalizan ~1.800 nombres en cada tecla
      ? [...labArtists().values()].filter((a) => a.key.includes(q))
        .sort((a, b) => (b.key.startsWith(q) - a.key.startsWith(q)) || artistPlays(b) - artistPlays(a) || b.tracks.length - a.tracks.length)
        .slice(0, 10)
      : [];
    els.searchPlaylists.hidden = !matches.length && !artists.length;
    if (!matches.length && !artists.length) {
      els.searchPlaylists.replaceChildren();
      return;
    }
    const parts = [];
    if (artists.length) {
      const heading = makeEl('h3', 'pl-section-title');
      heading.append(sticker(`${q}a`), 'Artistas');
      const row = makeEl('div', 'home-row is-artists');
      artists.forEach((entry) => row.append(artistCard(entry)));
      parts.push(heading, row);
    }
    if (matches.length) {
      const row = makeEl('div', 'search-pl-row');
      matches.forEach((pl) => row.append(createPlaylistCard(pl)));
      const heading = makeEl('h3', 'pl-section-title');
      heading.append(sticker(q), 'Playlists');
      parts.push(heading, row);
    }
    els.searchPlaylists.replaceChildren(...parts);
  }

  const pinnedFirst = (playlists) => [
    ...playlists.filter((pl) => isPinned(pl.key)),
    ...playlists.filter((pl) => !isPinned(pl.key))
  ];

  function renderPlaylistGrid() {
    const section = (title, note, playlists, extra) => {
      const wrap = makeEl('section', 'pl-section');
      const heading = makeEl('h3', 'pl-section-title');
      heading.append(sticker(title), title);
      wrap.append(heading);
      if (note) wrap.append(makeEl('p', 'pl-note', note));
      const grid = makeEl('div', 'pl-grid');
      playlists.forEach((pl) => grid.append(createPlaylistCard(pl)));
      if (extra) grid.append(extra);
      wrap.append(grid);
      return wrap;
    };
    const newCard = makeButton('pl-card pl-card-new', 'new-playlist', 'Crear una playlist nueva', 'playlist-add', 'Nueva playlist');
    const autos = autoPlaylists().filter((pl) => pl.trackIds.some((id) => state.trackMap.has(id)));

    const unpinned = (playlists) => shownPls(playlists).filter((pl) => !isPinned(pl.key));
    const pinned = shownPls(library.pins.map(getPlaylist).filter(Boolean));
    const parts = [];
    if (pinned.length) parts.push(section('Fijadas', '', pinned));
    parts.push(
      section('Playlists de Liquid Bullet', pinned.length ? '' : 'Mantén pulsada una playlist (o clic derecho) para fijarla arriba.', unpinned(systemPlaylists())),
      section('Mis playlists', 'Se guardan solo en este navegador. Si borras la caché o los datos del sitio, se perderán: descarga una copia de seguridad (botón Descargar de arriba).', unpinned(localPlaylists()), newCard)
    );
    const autoLeft = unpinned(autos);
    if (autoLeft.length) parts.push(section('Para ti', '', autoLeft));
    if (library.hidden.length) {
      const note = makeEl('p', 'pl-note pl-hidden-note', `${library.hidden.length === 1 ? 'Hay 1 playlist oculta' : `Hay ${library.hidden.length} playlists ocultas`}: vuelve a verlas en Ajustes → Contenido oculto.`);
      parts.push(note);
    }
    els.playlistGrid.classList.toggle('is-list', settings.plView === 'list');
    els.playlistGrid.replaceChildren(...parts);
  }

  function updateCounts() {
    els.libCount.textContent = String(state.libraryTracks.length);
    els.plCount.textContent = String(shownPls([...systemPlaylists(), ...localPlaylists()]).length);
    updateFavCount();
  }

  function renderList() {
    renderListInner();
    syncPlayButtons(els.library);
  }

  function renderListInner() {
    const q = normalize(state.query);
    const searching = Boolean(q);
    renderViewHead();
    els.alphaRail.hidden = true;
    const showHome = state.view === 'home' || state.view === 'artists';
    const showLab = state.view === 'lab';
    const showStats = state.view === 'stats' || showLab || showHome;
    const showGrid = state.view === 'playlists' && !searching;
    els.homePanel.hidden = !showHome;
    els.playlistGrid.hidden = !showGrid;
    els.statsPanel.hidden = state.view !== 'stats';
    els.labPanel.hidden = !showLab;
    els.trackList.hidden = showGrid || showStats;
    if (state.view !== 'playlist') setViewTint('');
    renderRecentRow();
    renderChips(!showGrid && !showStats && state.tracks.length > 0);
    renderSearchPlaylists(showStats || state.view === 'playlist' ? '' : q);
    els.searchPlaylists.classList.toggle('is-list', settings.plView === 'list');
    updateCounts();

    if (showHome) {
      if (state.view === 'home') renderHome();
      else renderArtists();
      els.trackList.replaceChildren();
      els.listInfo.textContent = '';
      return;
    }

    if (showLab) {
      renderLab();
      els.trackList.replaceChildren();
      els.listInfo.textContent = '';
      return;
    }

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
      else if (state.filter !== 'all' || state.genre) li.textContent = 'Ninguna canción coincide con este filtro.';
      else if (state.view === 'favorites') {
        li.textContent = 'Aún no tienes favoritas. Toca el corazón de una canción para guardarla aquí.';
        const go = makeButton('btn btn-primary list-empty-cta', 'go-view', 'Ir a la Biblioteca', 'library', 'Explorar la Biblioteca');
        go.dataset.value = 'library';
        li.append(go);
      }
      else if (pl?.kind === 'local') {
        li.textContent = 'Playlist vacía. Pulsa el ＋ de cualquier canción en la Biblioteca (o mantenla pulsada) para añadirla aquí.';
        const go = makeButton('btn btn-primary list-empty-cta', 'go-view', 'Ir a la Biblioteca', 'library', 'Buscar canciones');
        go.dataset.value = 'library';
        li.append(go);
      }
      else li.textContent = 'Todavía no hay canciones aquí.';
      fragment.appendChild(li);
    }
    els.trackList.replaceChildren(fragment);
    if (visible.length) appendListChunk(LIST_FIRST_CHUNK);
    renderAlphaRail(visible);

    const total = visible.length;
    const seconds = visible.reduce((sum, t) => sum + parseDuration(t.duration), 0);
    els.listInfo.textContent = searching
      ? `${total} resultado${total === 1 ? '' : 's'} para «${state.query.trim()}»`
      : state.view === 'playlist' || state.view === 'artist' ? '' : `${songsLabel(total)} · ${formatTotal(seconds)}`;
    updateDownloadUI();
  }

  /* ---------- Índice A–Z de la Biblioteca (orden por título o artista) ---------- */
  const firstLetter = (text) => {
    const char = normalize(String(text || '').replace(/^[^\p{L}\p{N}]+/u, '')).charAt(0).toUpperCase();
    return /[A-Z]/.test(char) ? char : char === 'Ñ' ? 'N' : '#';
  };
  const letterOfTrack = (track) => firstLetter(state.sort === 'artist' ? track.knownArtist || track.artist : track.title);

  function renderAlphaRail(visible) {
    const show = state.view === 'library' && ['title', 'artist'].includes(state.sort) && !normalize(state.query) && visible.length > 60;
    els.alphaRail.hidden = !show;
    if (!show) return;
    const letters = [];
    visible.forEach((track) => {
      const letter = letterOfTrack(track);
      if (!letters.includes(letter)) letters.push(letter);
    });
    els.alphaRail.style.setProperty('--letters', letters.length);
    els.alphaRail.replaceChildren(...letters.map((letter) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'alpha-letter';
      button.dataset.letter = letter;
      button.textContent = letter;
      button.setAttribute('aria-label', `Ir a la ${letter}`);
      return button;
    }));
  }

  function jumpToLetter(letter) {
    const index = list.items.findIndex((track) => letterOfTrack(track) === letter);
    if (index < 0) return;
    if (index >= list.rendered) appendListChunk(index - list.rendered + LIST_CHUNK);
    const item = els.trackList.children[index];
    if (!item) return;
    // Las filas fuera de pantalla tienen un alto estimado (content-visibility): se corrige
    // el salto un par de veces mientras se pintan las de alrededor
    const align = (tries) => {
      const offset = (document.querySelector('.topbar')?.offsetHeight || 0) + 12;
      const delta = item.getBoundingClientRect().top - offset;
      if (Math.abs(delta) > 2) window.scrollTo({ top: window.scrollY + delta, behavior: 'instant' });
      if (tries > 0) requestAnimationFrame(() => align(tries - 1));
    };
    align(4);
    if (els.alphaRail.dataset.last !== letter) haptic(5);
    els.alphaRail.dataset.last = letter;
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

  function setView(view, { playlist = null, fromHistory = false } = {}) {
    const previous = state.view;
    const previousPlaylist = state.openPlaylist;
    const previousArtist = state.lastArtist;
    state.view = view;
    state.openPlaylist = view === 'playlist' ? playlist || state.openPlaylist : null;
    state.lastArtist = view === 'artist' ? state.openArtist : null;
    const changed = previous !== view || previousPlaylist !== state.openPlaylist || previousArtist !== state.lastArtist;
    if (changed) {
      state.filter = 'all';
      state.genre = '';
      home.artistsShown = ARTISTS_PAGE;
      const detail = view === 'playlist' || view === 'artist';
      const backToList = (previous === 'playlist' && view === 'playlists') || (previous === 'artist' && view === 'artists');
      animateView(detail ? 'forward' : backToList ? 'back' : 'fade');
      if (!fromHistory) navHistory.push();
    }
    if (VIEWS.includes(view)) storage.set(KEYS.view, view);
    const tabView = view === 'playlist' ? 'playlists' : view === 'artist' ? 'artists' : view;
    els.tabsBar.querySelectorAll('.tab').forEach((tab) => {
      const active = tab.dataset.view === tabView;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      // Pestañas accesibles: solo la activa entra con Tab; las demás con las flechas
      tab.tabIndex = active ? 0 : -1;
      if (active) {
        // En el móvil las pestañas se desplazan: la activa siempre a la vista
        const bar = els.tabsBar;
        const left = tab.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2;
        if (bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: Math.max(0, left), behavior: settings.motion ? 'smooth' : 'auto' });
      }
    });
    renderList();
    updateNav();
  }

  /* ---------- Historial: Atrás/Adelante del navegador (y del móvil) recorren las vistas ---------- */
  // La URL no cambia (los enlaces ?t= / ?p= siguen funcionando); cada vista es una entrada del
  // historial y cada ventana abierta otra más, así «Atrás» cierra la ventana en vez de salir de la app.
  const navHistory = (() => {
    let ready = false;
    let skipPops = 0;
    let dialogEntry = false;
    let sheetEntry = false;
    const snapshot = () => ({ lb: 1, view: state.view, playlist: state.openPlaylist, artist: state.openArtist || null });
    const openDialogs = () => [...document.querySelectorAll('dialog[open]')];

    const same = (a, b) => a && b && a.view === b.view && a.playlist === b.playlist && (a.view !== 'artist' || a.artist === b.artist);

    function push() {
      if (!ready) return;
      try {
        const next = snapshot();
        if (dialogEntry || sheetEntry) { history.replaceState({ ...next, dialog: dialogEntry || undefined, sheet: sheetEntry || undefined }, ''); return; }
        if (same(history.state, next)) return;
        history.pushState(next, '');
      } catch { /* sin history */ }
    }

    function replace() {
      if (!ready) return;
      try { history.replaceState({ ...snapshot(), dialog: dialogEntry || undefined }, ''); } catch { /* sin history */ }
    }

    function onPop(event) {
      if (skipPops > 0) { skipPops--; return; }
      if (dialogEntry || openDialogs().length) {
        // «Atrás» con una ventana abierta: solo se cierra la ventana
        dialogEntry = false;
        openDialogs().forEach((dialog) => dialog.close());
        return;
      }
      if (sheetEntry) {
        // «Atrás» con Sonando abierto (móvil): se cierra la hoja
        sheetEntry = false;
        npSheet.close({ fromHistory: true });
        return;
      }
      const target = event.state;
      if (!target || !target.lb || !VIEWS.concat(['playlist', 'artist']).includes(target.view)) return;
      if (target.view === 'playlist' && !getPlaylist(target.playlist)) return;
      if (target.view === 'artist') {
        if (!getArtist(target.artist)) return;
        state.openArtist = target.artist;
      }
      if (state.query) { state.query = ''; els.searchInput.value = ''; }
      setView(target.view, { playlist: target.playlist, fromHistory: true });
    }

    function watchDialogs() {
      const observer = new MutationObserver((records) => {
        records.forEach(({ target }) => {
          if (target.open) {
            if (!dialogEntry) {
              dialogEntry = true;
              try { history.pushState({ ...snapshot(), dialog: true }, ''); } catch { dialogEntry = false; }
            }
            return;
          }
          // Cerrada con su botón o con Esc: se quita su entrada (salvo que se abra otra ventana enseguida)
          setTimeout(() => {
            if (!dialogEntry || openDialogs().length) return;
            dialogEntry = false;
            if (history.state?.dialog) { skipPops++; history.back(); }
          }, 0);
        });
      });
      document.querySelectorAll('dialog').forEach((dialog) => observer.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
    }

    function init() {
      ready = true;
      replace();
      window.addEventListener('popstate', onPop);
      watchDialogs();
    }

    // Sonando a pantalla completa (móvil) también es una entrada: «Atrás» la cierra
    function sheetOpened() {
      if (!ready || sheetEntry) return;
      sheetEntry = true;
      try { history.pushState({ ...snapshot(), sheet: true }, ''); } catch { sheetEntry = false; }
    }

    function sheetClosed() {
      if (!sheetEntry) return;
      sheetEntry = false;
      if (history.state?.sheet) { skipPops++; history.back(); }
    }

    return { push, replace, init, sheetOpened, sheetClosed };
  })();

  function showNowPlaying() {
    if (window.matchMedia('(max-width: 860px)').matches) npSheet.open();
    else els.nowPlaying.scrollIntoView({ block: 'start', behavior: settings.motion ? 'smooth' : 'auto' });
  }

  /* ---------- Sonando a pantalla completa (móvil) ---------- */
  const npSheet = (() => {
    const phone = window.matchMedia('(max-width: 860px)');
    const isOpen = () => document.body.classList.contains('np-open');

    function open() {
      if (!phone.matches || isOpen()) return;
      els.nowPlaying.scrollTop = 0;
      document.body.classList.add('np-open');
      els.nowPlaying.removeAttribute('aria-hidden');
      els.nowPlaying.removeAttribute('inert');
      navHistory.sheetOpened();
      haptic(8);
    }

    function close({ fromHistory = false } = {}) {
      if (!isOpen()) return;
      document.body.classList.remove('np-open');
      document.body.style.removeProperty('--np-drag');
      syncHidden();
      if (!fromHistory) navHistory.sheetClosed();
    }

    // En el teléfono, con la hoja cerrada, su contenido no se lee ni recibe foco
    function syncHidden() {
      const hidden = phone.matches && !isOpen();
      els.nowPlaying.toggleAttribute('inert', hidden);
      if (hidden) els.nowPlaying.setAttribute('aria-hidden', 'true');
      else els.nowPlaying.removeAttribute('aria-hidden');
    }

    // Deslizar hacia abajo desde arriba de la hoja la cierra
    function bindDrag() {
      let startY = null;
      let dy = 0;
      els.nowPlaying.addEventListener('touchstart', (event) => {
        if (!isOpen() || els.nowPlaying.scrollTop > 0 || event.touches.length !== 1) { startY = null; return; }
        if (event.target.closest('input, select, .lyrics-body')) { startY = null; return; }
        startY = event.touches[0].clientY;
        dy = 0;
      }, { passive: true });
      els.nowPlaying.addEventListener('touchmove', (event) => {
        if (startY === null) return;
        dy = event.touches[0].clientY - startY;
        if (dy <= 0 || els.nowPlaying.scrollTop > 0) {
          dy = 0;
          document.body.classList.remove('np-dragging');
          document.body.style.removeProperty('--np-drag');
          return;
        }
        document.body.classList.add('np-dragging');
        document.body.style.setProperty('--np-drag', `${Math.round(dy * 0.85)}px`);
      }, { passive: true });
      const end = () => {
        if (startY === null) return;
        startY = null;
        document.body.classList.remove('np-dragging');
        if (dy > 110) close();
        else document.body.style.removeProperty('--np-drag');
        dy = 0;
      };
      els.nowPlaying.addEventListener('touchend', end);
      els.nowPlaying.addEventListener('touchcancel', end);

      // Deslizar hacia arriba sobre el mini-reproductor la abre
      let miniY = null;
      els.player.addEventListener('touchstart', (event) => {
        miniY = isOpen() || event.target.closest('input') ? null : event.touches[0].clientY;
      }, { passive: true });
      els.player.addEventListener('touchend', (event) => {
        if (miniY === null) return;
        const moved = event.changedTouches[0].clientY - miniY;
        miniY = null;
        if (moved < -40) open();
      });
    }

    function init() {
      $('npClose').addEventListener('click', () => close());
      bindDrag();
      syncHidden();
      phone.addEventListener('change', () => {
        if (!phone.matches) close();
        syncHidden();
      });
      // El alto real del reproductor deja sitio justo a la lista y a la hoja
      if ('ResizeObserver' in window) {
        new ResizeObserver(([entry]) => {
          const height = Math.round(entry.borderBoxSize?.[0]?.blockSize || entry.target.offsetHeight);
          document.documentElement.style.setProperty('--player-h', `${height}px`);
        }).observe(els.player);
      }
    }

    return { open, close, isOpen, init };
  })();

  function clearSearch() {
    if (!state.query && !els.searchInput.value) return;
    state.query = '';
    els.searchInput.value = '';
    renderSearchPanel();
    renderList();
  }

  function openPlaylist(key) {
    // Al abrir una playlist desde la búsqueda se limpia el texto
    state.query = '';
    els.searchInput.value = '';
    setView('playlist', { playlist: key });
    els.trackList.closest('.library').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // Transición suave al cambiar de vista (entra deslizándose)
  function animateView(direction) {
    if (!settings.motion) return;
    const view = els.libraryView;
    view.classList.remove('anim-forward', 'anim-back', 'anim-fade');
    void view.offsetWidth; // reinicia la animación
    view.classList.add(`anim-${direction}`);
    // Las primeras filas entran en cascada; luego se quita para que repintar no las anime otra vez
    view.classList.add('rows-in');
    clearTimeout(rowsInTimer);
    rowsInTimer = setTimeout(() => view.classList.remove('rows-in'), 900);
  }
  let rowsInTimer = 0;

  function playTracks(list, shuffle = false) {
    const playable = list.filter(isPlayable);
    if (!playable.length) {
      showToast(navigator.onLine ? 'No hay canciones para reproducir.' : 'Sin conexión: descarga la playlist para escucharla offline.');
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
    if (index < 14) li.style.setProperty('--i', index);
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
    img.src = track.thumb;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 46;
    img.height = 46;
    img.addEventListener('error', () => { img.src = PLACEHOLDER_COVER; }, { once: true });

    const text = document.createElement('span');
    text.className = 'track-text';
    const title = document.createElement('span');
    title.className = 'track-title';
    title.style.display = 'block';
    setTitle(title, track.title);
    const artist = document.createElement('span');
    artist.className = 'track-artist';
    artist.style.display = 'block';
    // En la Biblioteca se indica el género (o la playlist de origen) de cada canción
    const tag = track.genre || track.album;
    artist.textContent = track.knownArtist && tag && state.view !== 'playlist'
      ? `${track.knownArtist} · ${tag}`
      : track.knownArtist || tag || track.artist;
    artist.prepend(svgIcon('download-done', 'icon track-offline'));
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
    fav.replaceChildren(svgIcon('heart'));
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

  /* ---------- «No me gusta»: fuera de mixes, radios y Descubre ---------- */
  const disliked = new Set(storage.get(KEYS.disliked, []) || []);
  const isDisliked = (id) => disliked.has(id);

  function toggleDislike(id) {
    const track = getTrack(id);
    if (!track) return;
    const adding = !disliked.has(id);
    if (adding) disliked.add(id);
    else disliked.delete(id);
    storage.set(KEYS.disliked, [...disliked]);
    haptic(10);
    if (adding && state.favorites.has(id)) toggleFavorite(id);
    showToast(adding
      ? `No volverá a salir en tus mixes ni radios: «${track.title}».`
      : `«${track.title}» vuelve a tus mixes.`, adding ? { label: 'Deshacer', run: () => toggleDislike(id) } : null);
    if (state.view === 'home') renderList();
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
    haptic(added ? [10, 30, 10] : 10);
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

    showToast(added ? `Añadida a favoritas: ${track.title}` : `Quitada de favoritas: ${track.title}`);
    if (added && settings.autoFav) downloadTrack(track);
  }

  /* ---------- Cola de reproducción ---------- */
  function describeContext(start) {
    if (state.query.trim()) return `Búsqueda: «${state.query.trim()}»`;
    if (state.view === 'favorites') return 'Reproduciendo desde Favoritas';
    if (state.view === 'artist') {
      const entry = getArtist(state.openArtist);
      if (entry) return `Artista · ${entry.name}`;
    }
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
    state.radio = null;
    state.baseQueue = candidates.map((t) => t.id);
    state.queueContext = describeContext(start);
    state.queueSource = { view: state.view, playlist: state.openPlaylist, artist: state.openArtist || null };
    state.playSource = viewSource();
    rememberViewContext();
    state.queue = state.baseQueue.slice();
    state.queueIndex = Math.max(0, state.queue.indexOf(startId));
    if (state.shuffle) applyShuffle();
  }

  function applyShuffle() {
    const current = state.queue[state.queueIndex];
    const rest = state.baseQueue.filter((id) => id !== current);
    state.queue = current ? [current, ...smartShuffle(rest)] : smartShuffle(state.baseQueue);
    state.queueIndex = 0;
  }

  // Aleatorio de verdad variado (no un barajado plano):
  // - lo que sonó hace poco (horas o días) tiende a ir al final, así no se repite lo mismo
  // - las canciones que sueles saltar salen menos; las «No me gusta», casi nunca
  // - la misma canción repetida (copias con otro id) suena una sola vez
  // - nunca el mismo artista en las últimas canciones ni más de dos seguidas del mismo estilo
  function smartShuffle(ids) {
    const seenIds = new Set();
    const seenSongs = new Set();
    const tracks = ids.map(getTrack).filter((t) => {
      if (!t || seenIds.has(t.id)) return false;
      seenIds.add(t.id);
      if (t.songKey && seenSongs.has(t.songKey)) return false;
      if (t.songKey) seenSongs.add(t.songKey);
      return true;
    });
    const ordered = weightedOrder(tracks, (t) => {
      let weight = recencyFactor(t.id) / (1 + (Number(taste.skips[t.id]) || 0) * 0.5);
      if (isDisliked(t.id)) weight *= 0.02;
      return weight;
    });
    return spaceOut(ordered).map((t) => t.id);
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
      showToast('Sin conexión: descarga la playlist para escucharla offline.');
      return;
    }
    buildQueue(id);
    loadTrack(getTrack(id), true, dj.enabled ? 1.5 : 0);
  }

  /* ---------- Cola: "A continuación" ---------- */
  // Pone una canción justo después de la actual (o al final de la cola) sin cortar lo que suena
  function queueTrack(id, atEnd = false, quiet = false) {
    const track = getTrack(id);
    if (!track) return;
    if (!state.currentTrack) {
      buildQueue(id);
      loadTrack(track, true);
      return;
    }
    const current = state.queueIndex;
    if (state.queue[current] === id) {
      showToast('Esa canción ya está sonando.');
      return;
    }
    // Una sola copia por delante de la actual
    state.queue = state.queue.filter((qid, i) => i <= current || qid !== id);
    state.queue.splice(atEnd ? state.queue.length : current + 1, 0, id);
    if (!state.baseQueue.includes(id)) state.baseQueue.push(id);
    resume.saveQueue();
    if (els.queueDialog.open) renderQueue();
    if (quiet) return;
    const name = splitTitle(track.title).main;
    showToast(atEnd ? `Al final de la cola: ${name}` : `Sonará a continuación: ${name}`);
  }

  function queueRow(track, index, label) {
    const li = document.createElement('li');
    li.className = 'queue-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'queue-play';
    button.dataset.index = String(index);
    const img = document.createElement('img');
    img.src = track.thumb;
    img.alt = '';
    img.width = 40;
    img.height = 40;
    img.loading = 'lazy';
    img.decoding = 'async';
    const text = document.createElement('span');
    text.className = 'queue-text';
    const title = document.createElement('span');
    title.className = 'queue-title';
    title.textContent = splitTitle(track.title).main;
    const meta = document.createElement('span');
    meta.className = 'queue-meta';
    meta.textContent = label || [track.knownArtist || track.artist, track.duration].filter(Boolean).join(' · ');
    text.append(title, meta);
    button.append(img, text);
    li.append(button);
    li.dataset.id = track.id;
    if (index > state.queueIndex) li.classList.add('is-upcoming');
    if (index > state.queueIndex && queueEditing) {
      const handle = document.createElement('span');
      handle.className = 'queue-handle';
      handle.setAttribute('aria-hidden', 'true');
      handle.replaceChildren(svgIcon('drag'));
      li.prepend(handle);
    }
    if (index > state.queueIndex) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn queue-remove';
      remove.dataset.remove = String(index);
      remove.setAttribute('aria-label', `Quitar ${track.title} de la cola`);
      remove.replaceChildren(svgIcon('close'));
      li.append(remove);
    } else {
      li.classList.add('is-current');
    }
    return li;
  }

  const QUEUE_LIMIT = 60;
  let queueEditing = false;

  // Arrastrar por el asa: la fila sigue al dedo y al soltar se guarda el nuevo orden
  function startQueueDrag(event) {
    const handle = event.target.closest('.queue-handle');
    if (!handle) return;
    event.preventDefault();
    const row = handle.closest('.queue-item');
    row.classList.add('is-dragging');
    // Se escucha en el documento: mover la fila en el DOM suelta la captura del puntero
    const move = (ev) => {
      const rows = [...els.queueList.querySelectorAll('.queue-item.is-upcoming')].filter((r) => r !== row);
      const over = rows.find((r) => ev.clientY < r.getBoundingClientRect().top + r.offsetHeight / 2);
      if (over) els.queueList.insertBefore(row, over);
      else if (rows.length) rows[rows.length - 1].after(row);
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      row.classList.remove('is-dragging');
      const ordered = [...els.queueList.querySelectorAll('.queue-item.is-upcoming')].map((r) => r.dataset.id);
      const start = state.queueIndex + 1;
      state.queue = [...state.queue.slice(0, start), ...ordered, ...state.queue.slice(start + ordered.length)];
      resume.saveQueue();
      haptic(8);
      renderQueue();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  }

  function updateQueueFoot() {
    els.queueFoot.querySelector('[data-q="shuffle"]').classList.toggle('is-active', state.shuffle);
    els.queueFoot.querySelector('[data-q="repeat"]').classList.toggle('is-active', state.repeat !== 'off');
    els.queueFoot.querySelector('[data-q="sleep"]').classList.toggle('is-active', Boolean(sleep.end || sleep.endOfTrack));
  }

  function renderQueue() {
    els.queueList.classList.toggle('is-editing', queueEditing);
    els.queueEdit.textContent = queueEditing ? 'Listo' : 'Editar';
    els.queueEdit.setAttribute('aria-pressed', String(queueEditing));
    updateQueueFoot();
    const upcoming = state.queue.slice(state.queueIndex + 1);
    const seconds = upcoming.reduce((sum, id) => sum + parseDuration(getTrack(id)?.duration), 0);
    els.queueInfo.textContent = upcoming.length
      ? `${state.queueContext} · ${songsLabel(upcoming.length)} · ${formatTotal(seconds)} por delante`
      : 'No hay nada más en la cola. Añade canciones con ＋ › «Reproducir a continuación».';
    const rows = [];
    const current = state.currentTrack;
    if (current) rows.push(queueRow(current, state.queueIndex, 'Sonando ahora'));
    upcoming.slice(0, QUEUE_LIMIT).forEach((id, i) => {
      const track = getTrack(id);
      if (track) rows.push(queueRow(track, state.queueIndex + 1 + i));
    });
    if (upcoming.length > QUEUE_LIMIT) {
      const more = document.createElement('li');
      more.className = 'queue-more';
      more.textContent = `…y ${upcoming.length - QUEUE_LIMIT} más`;
      rows.push(more);
    }
    els.queueList.replaceChildren(...rows);
  }

  // «Guardar cola»: lo que suena y lo que viene, como playlist propia
  function saveQueueAsPlaylist() {
    const ids = [...new Set(state.queue.slice(state.queueIndex))].filter((id) => getTrack(id));
    if (!ids.length) {
      showToast('La cola está vacía.');
      return;
    }
    const date = new Date().toLocaleDateString('es', { day: 'numeric', month: 'short' });
    const playlist = {
      id: newId(), name: `Cola del ${date}`, emoji: 'ic:headphones',
      color: PLAYLIST_COLORS[Math.floor(Math.random() * PLAYLIST_COLORS.length)],
      trackIds: ids, createdAt: Date.now()
    };
    library.local.push(playlist);
    saveLocalPlaylists();
    els.queueDialog.close();
    showToast(`Guardada como «${playlist.name}» (${songsLabel(ids.length)}).`, {
      label: 'Abrir',
      run: () => { npSheet.close(); openPlaylist(`local:${playlist.id}`); }
    });
  }

  function openQueue() {
    renderQueue();
    els.queueDialog.showModal();
  }

  /* ---------- Temporizador de apagado ---------- */
  // Baja el volumen poco a poco en los últimos segundos y pausa. Solo vive en esta pestaña.
  const SLEEP_FADE = 20000;
  const sleep = { end: 0, endOfTrack: false, tick: null, gain: 1 };

  function setSleep(minutes) {
    clearInterval(sleep.tick);
    sleep.end = minutes > 0 ? Date.now() + minutes * 60000 : 0;
    sleep.endOfTrack = minutes === -1;
    sleep.gain = 1;
    decks.forEach(applyVolume);
    if (sleep.end) sleep.tick = setInterval(sleepTick, 1000);
    updateSleepUI();
    if (minutes > 0) showToast(`La música se pausará en ${minutes} min.`);
    else if (sleep.endOfTrack) showToast('La música se pausará al terminar esta canción.');
    else showToast('Temporizador desactivado.');
  }

  function sleepTick() {
    const left = sleep.end - Date.now();
    if (left <= 0) {
      finishSleep();
      return;
    }
    if (left < SLEEP_FADE) {
      sleep.gain = left / SLEEP_FADE;
      decks.forEach(applyVolume);
    }
    updateSleepUI();
  }

  function finishSleep() {
    clearInterval(sleep.tick);
    sleep.end = 0;
    sleep.endOfTrack = false;
    pauseByUser();
    sleep.gain = 1;
    decks.forEach(applyVolume);
    updateSleepUI();
    showToast('Temporizador: música en pausa. Que descanses.');
  }

  function updateSleepUI() {
    const active = Boolean(sleep.end || sleep.endOfTrack);
    const minutesLeft = sleep.end ? Math.max(1, Math.ceil((sleep.end - Date.now()) / 60000)) : 0;
    els.sleepBtn.classList.toggle('is-active', active);
    els.sleepBtn.setAttribute('aria-pressed', String(active));
    els.sleepBadge.hidden = !active;
    els.sleepBadge.textContent = sleep.endOfTrack ? 'fin' : `${minutesLeft}`;
    const label = sleep.endOfTrack
      ? 'Temporizador: al terminar esta canción'
      : sleep.end ? `Temporizador: ${minutesLeft} min` : 'Temporizador de apagado';
    els.sleepBtn.setAttribute('aria-label', label);
    els.sleepBtn.title = `${label} (T)`;
    els.sleepStatus.textContent = active ? `${label}.` : 'Elige cuándo pausar la música.';
    els.sleepOptions.querySelectorAll('[data-sleep]').forEach((b) => {
      const value = Number(b.dataset.sleep);
      b.classList.toggle('is-active', value === -1 ? sleep.endOfTrack : value === 0 ? !active : false);
    });
  }

  /* ---------- Reanudar: última canción y segundo exacto (solo en este navegador) ---------- */
  // Ids cortos para guardar la cola: «brush3:101-200-…-c0bf5f» → «brush3:c0bf5f». Si dos canciones
  // compartieran huella (casi imposible) o el id no tiene esa forma, se guarda el id completo con «~».
  const queueCodec = (() => {
    let maps = null;
    const shortOf = (id) => {
      const m = /^([^:]+):.*-([0-9a-f]{6})$/.exec(String(id));
      return m ? `${m[1]}:${m[2]}` : null;
    };
    function build() {
      if (maps && maps.n === state.tracks.length) return maps;
      const toShort = new Map();
      const toLong = new Map();
      const clash = new Set();
      state.tracks.forEach((t) => {
        const c = shortOf(t.id);
        if (!c) return;
        if (toLong.has(c) && toLong.get(c) !== t.id) clash.add(c);
        else toLong.set(c, t.id);
      });
      toLong.forEach((long, c) => { if (!clash.has(c)) toShort.set(long, c); });
      maps = { n: state.tracks.length, toShort, toLong };
      return maps;
    }
    return {
      encode: (id) => build().toShort.get(id) || `~${id}`,
      decode: (c) => (String(c).startsWith('~') ? String(c).slice(1) : build().toLong.get(c) || null)
    };
  })();

  const resume = {
    lastSaved: 0,
    // Se guarda a menudo pero sin escribir en cada timeupdate (cada 4 s, o al instante si force)
    save(force = false) {
      const track = state.currentTrack;
      if (!track) return;
      const now = Date.now();
      if (!force && now - this.lastSaved < 4000) return;
      this.lastSaved = now;
      // Mientras el audio no ha cargado, el segundo real es el salto pendiente
      const time = state.pendingSeek ?? els.audio.currentTime ?? 0;
      storage.set(KEYS.resume, { id: track.id, time: Math.round(time * 10) / 10, at: now });
    },
    // La cola puede tener miles de canciones (cientos de KB): se escribe una sola vez cuando
    // el navegador está libre, no en cada cambio de canción
    queueTimer: 0,
    saveQueue() {
      if (this.queueTimer) return;
      const write = () => { this.queueTimer = 0; this.flushQueue(); };
      this.queueTimer = window.requestIdleCallback ? requestIdleCallback(write, { timeout: 2000 }) : setTimeout(write, 500);
      this.queueIdle = Boolean(window.requestIdleCallback);
    },
    flushQueue() {
      if (this.queueTimer) {
        if (this.queueIdle) cancelIdleCallback(this.queueTimer); else clearTimeout(this.queueTimer);
        this.queueTimer = 0;
      }
      // Compacta (v2): ids cortos y el orden original como posiciones dentro de la cola.
      // Antes se guardaban las dos listas con ids largos: ~480 KB con la biblioteca entera en cola.
      const queue = state.queue;
      const position = new Map(queue.map((id, i) => [id, i]));
      const sameOrder = state.baseQueue.length === queue.length && state.baseQueue.every((id, i) => id === queue[i]);
      const base = sameOrder ? null : state.baseQueue.map((id) => (position.has(id) ? position.get(id) : queueCodec.encode(id)));
      storage.set(KEYS.resumeQueue, { v: 2, q: queue.map(queueCodec.encode).join(','), b: base, context: state.queueContext, source: state.playSource || '' });
    },
    // Al abrir la app vuelve a poner la última canción en su segundo y con su cola; false si no hay nada
    restore() {
      const saved = storage.get(KEYS.resume, null);
      const track = saved && getTrack(saved.id);
      if (!track) return false;
      const valid = (ids) => (Array.isArray(ids) ? ids.filter((id) => state.trackMap.has(id)) : []);
      const stored = storage.get(KEYS.resumeQueue, null);
      let rawQueue = stored?.queue;
      let rawBase = stored?.base;
      if (stored?.v === 2 && typeof stored.q === 'string') {
        rawQueue = stored.q ? stored.q.split(',').map(queueCodec.decode) : [];
        rawBase = Array.isArray(stored.b) ? stored.b.map((x) => (typeof x === 'number' ? rawQueue[x] : queueCodec.decode(x))) : rawQueue;
      }
      const queue = valid(rawQueue);
      if (queue.includes(track.id)) {
        const base = valid(rawBase);
        state.baseQueue = base.length ? base : queue.slice();
        state.queue = queue;
        state.queueIndex = queue.indexOf(track.id);
        state.queueContext = stored.context || describeContext(track);
        state.playSource = typeof stored.source === 'string' ? stored.source : '';
      } else {
        buildQueue(track.id);
      }
      loadTrack(track, false);
      const duration = parseDuration(track.duration);
      let time = Math.max(0, Number(saved.time) || 0);
      // A punto de terminar: mejor desde el principio
      if (duration && time > duration - 5) time = 0;
      if (time >= 1) {
        state.pendingSeek = time;
        updateProgressUI(time, duration);
        this.save(true);
        els.npContext.textContent = 'Continúa donde lo dejaste';
      }
      // Recién actualizada la app y sonaba algo: se intenta seguir sin tocar nada
      const autoplayAt = Number(storage.get(KEYS.resumeAutoplay, 0));
      if (autoplayAt && Date.now() - autoplayAt < 30000) {
        storage.set(KEYS.resumeAutoplay, 0);
        showToast('Liquid Bullet se actualizó.');
        play({ quiet: true });
      } else if (time >= 1) {
        showToast(`Continúa «${splitTitle(track.title).main}» en ${formatTime(time)}. Toca reproducir.`);
      }
      return true;
    }
  };

  /* ---------- Reproducción ---------- */
  let lyricsDelay = null;
  function loadTrack(track, autoplay = true, fade = 0) {
    if (!track) return;
    state.currentTrack = track;
    state.pendingSeek = null;
    state.countedId = null;

    prepareDeck(track, autoplay, fade);
    state.retried = false;
    els.audio.src = track.src;
    applySpeed();

    if (settings.motion && els.cover.src !== track.cover) {
      els.cover.classList.remove('is-swapping');
      void els.cover.offsetWidth; // reinicia la animación
      els.cover.classList.add('is-swapping');
    }
    // Ultraligero: la portada pequeña (320 px) también en Sonando
    els.cover.src = settings.ultra ? track.thumb || track.cover : track.cover;
    els.cover.alt = `Carátula de ${track.album || track.title}`;
    els.miniCover.src = track.thumb;
    els.npContext.textContent = state.queueContext;
    setTitle(els.npTitle, track.title);
    els.npArtist.textContent = track.knownArtist || track.genre || track.artist;
    els.npAlbum.textContent = track.knownArtist ? track.genre || track.album : '';
    els.miniTitle.textContent = splitTitle(track.title).main;
    els.miniArtist.textContent = track.knownArtist || track.genre || track.artist;
    els.npFavBtn.disabled = false;
    els.npAddBtn.disabled = false;
    els.npShareBtn.disabled = false;
    updateFavButton(els.npFavBtn, state.favorites.has(track.id));
    updateAbout(track);
    document.title = `${track.title} · ${track.artist} — Liquid Bullet`;
    // Lectores de pantalla: se anuncia la canción nueva (solo si empieza a sonar)
    if (autoplay && els.announcer) els.announcer.textContent = `Sonando: ${track.title}, de ${track.knownArtist || track.artist}`;

    updateProgressUI(0, parseDuration(track.duration));
    // Al abrir la app (sin reproducir) la letra se busca un poco después para no frenar el arranque
    // Al saltar canciones seguidas solo se pide la letra de la que se queda (evita el 429 de LRCLIB)
    clearTimeout(lyricsDelay);
    lyricsPendingFor = null;
    if (autoplay) {
      if (track.lyrics || lyricsCache.has(track.id)) showLyricsFor(track);
      else {
        renderLyrics('', 'Buscando la letra…');
        lyricsDelay = setTimeout(() => { if (state.currentTrack === track) showLyricsFor(track); }, 700);
      }
    } else if (track.lyrics || lyricsCache.has(track.id)) {
      showLyricsFor(track);
    } else {
      // Sin reproducir no se pide nada a LRCLIB (ni datos ni la canción a un tercero):
      // la letra se busca al darle a reproducir o al abrir el panel de la letra
      renderLyrics('', 'Toca reproducir y la letra aparecerá aquí.');
      lyricsPendingFor = track;
    }
    highlightCurrent();
    syncPlayButtons();
    updateDynamicColor(track);
    if (autoplay) wall.onTrack();
    updateMediaSession(track);
    resume.save(true);
    resume.saveQueue();
    if (els.queueDialog.open) renderQueue();

    if (autoplay) play();
  }

  async function play({ quiet = false } = {}) {
    flushPendingLyrics();
    state.userPaused = false;
    state.wantsPlay = true;
    if (!state.currentTrack) {
      if (!state.tracks.length) return;
      buildQueue(state.tracks[0].id);
      loadTrack(getTrack(state.queue[state.queueIndex]), false);
    }
    if (eq.ctx && eq.ctx.state !== 'running') eq.ctx.resume().catch(() => {});
    const deck = els.audio;
    const fadeIn = canSoftFade() && deck.paused && deck.currentTime > 0.5;
    if (fadeIn) { deckGain.set(deck, 0); applyVolume(deck); }
    try {
      await deck.play();
      if (fadeIn) rampGain(deck, 0, 1, 260);
    } catch (error) {
      // AbortError: se cambió de canción antes de empezar a sonar; no es un fallo real.
      if (error.name === 'AbortError') return;
      // Con el ecualizador, un servidor sin CORS se resuelve solo (vuelve a sonar sin ecualizar)
      if (eqDecks.includes(deck) && error.name !== 'NotAllowedError') return;
      // Reanudación automática fallida (iOS no deja quitarle el audio a otra app): se reintenta al volver
      if (quiet) return;
      console.error('[LiquidBullet] No se pudo reproducir:', error);
      if (error.name === 'NotAllowedError') {
        showToast('El navegador bloqueó la reproducción automática. Toca reproducir para escuchar.');
      } else {
        showToast('No se pudo reproducir la canción. Revisa la URL del audio.');
      }
    }
  }

  function togglePlay() {
    haptic(8);
    if (!state.currentTrack || els.audio.paused) play();
    else pauseByUser();
  }

  // Pausa pedida desde la app; cualquier otra pausa (otra app con sonido, una llamada) se reanuda sola
  function pauseByUser() {
    state.userPaused = true;
    state.wantsPlay = false;
    interruption.clear();
    const deck = els.audio;
    if (canSoftFade() && !deck.paused) {
      // El botón cambia al instante; el audio se apaga en 180 ms
      setPlayingUI(false);
      rampGain(deck, deckGain.get(deck) ?? 1, 0, 180, () => {
        deck.pause();
        deckGain.set(deck, 1);
        applyVolume(deck);
      });
      return;
    }
    deck.pause();
  }

  function next(manual = true, fade = manual && dj.enabled ? 1.5 : 0) {
    if (!state.queue.length) return;
    // Saltar al poco de empezar enseña al algoritmo que esa canción no te va (ahora)
    const current = state.currentTrack;
    if (manual && current) {
      const at = els.audio.currentTime || 0;
      const length = getDuration() || parseDuration(current.duration);
      if (at >= 1 && length > 60 && at < Math.min(30, length * 0.4)) taste.markSkip(current.id);
    }
    let index = state.queueIndex + 1;

    // La radio nunca se acaba: se suman canciones parecidas antes de llegar al final
    if (index >= state.queue.length - 1) extendRadio();

    if (index >= state.queue.length) {
      if (state.repeat === 'all' || manual) {
        index = 0;
        if (state.shuffle && state.queue.length > 1) {
          // Nueva vuelta aleatoria evitando repetir la última canción al empezar
          const last = state.queue[state.queue.length - 1];
          let shuffled = smartShuffle(state.baseQueue);
          if (shuffled[0] === last) shuffled = [...shuffled.slice(1), last];
          state.queue = shuffled;
        }
      } else {
        // Fin de la lista sin bucle: se detiene al principio de la última canción
        pauseByUser();
        els.audio.currentTime = 0;
        return;
      }
    }

    if (!navigator.onLine) {
      index = findPlayable(index, 1);
      if (index < 0) {
        pauseByUser();
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
    if (sleep.endOfTrack) {
      finishSleep();
      // La siguiente queda preparada (sin sonar): al pulsar reproducir o al volver a abrir sigue por ahí
      const nextId = state.queue[state.queueIndex + 1];
      if (nextId && getTrack(nextId)) {
        state.queueIndex += 1;
        loadTrack(getTrack(nextId), false);
      }
      return;
    }
    if (state.currentTrack) taste.markFinished(state.currentTrack.id);
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
    syncPlayButtons();
  }

  /* ---------- Todos los botones de reproducir cambian a la vez ----------
     Cada botón «Reproducir» de una colección (playlist, artista, mix, Lab…) lleva
     data-play-source; si es lo que suena, muestra pausa mientras suena y reproducir en pausa. */
  function viewSource() {
    if (state.query.trim()) return `search:${normalize(state.query)}`;
    if (state.view === 'playlist') return `pl:${state.openPlaylist}`;
    if (state.view === 'artist') return `artist:${state.openArtist}`;
    return `view:${state.view}`;
  }

  // Accesos rápidos de Inicio: lo último que pusiste (playlist o artista)
  function rememberViewContext() {
    if (state.query.trim()) return;
    if (state.view === 'playlist') {
      const pl = getPlaylist(state.openPlaylist);
      if (pl) taste.rememberContext({ key: pl.key, kind: 'playlist', value: pl.key, title: pl.name });
    } else if (state.view === 'artist') {
      const entry = getArtist(state.openArtist);
      if (entry) taste.rememberContext({ key: `artist:${entry.key}`, kind: 'artist', value: entry.key, title: entry.name, image: entry.tracks[0]?.thumb || '' });
    }
  }

  function syncPlayButtons(root = document) {
    const playing = document.body.classList.contains('is-playing');
    root.querySelectorAll('[data-play-source]').forEach((button) => {
      const current = button.dataset.playSource === state.playSource;
      const on = current && playing;
      button.classList.toggle('is-current', current);
      button.classList.toggle('is-on', on);
      setIcon(button, on ? 'pause' : 'play');
      if (button.dataset.playLabel) button.setAttribute('aria-label', `${on ? 'Pausar' : 'Reproducir'} ${button.dataset.playLabel}`);
      const text = button.querySelector('.btn-text');
      if (text) text.textContent = on ? 'Pausar' : current ? 'Seguir' : 'Reproducir';
    });
    const currentId = state.currentTrack?.id;
    root.querySelectorAll('.qp-item').forEach((item) => {
      item.classList.toggle('is-current', item.dataset.value === currentId);
    });
  }

  function markPlayable(button, source, label) {
    button.dataset.playSource = source;
    if (label) button.dataset.playLabel = label;
    return button;
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

  // Desfase por canción para las letras sincronizadas que van adelantadas o atrasadas
  const lyricsOffsets = storage.get(KEYS.lyricsOffsets, {}) || {};
  const lyricsOffset = () => lyricsOffsets[state.currentTrack?.id] || 0;
  function shiftLyrics(delta) {
    const id = state.currentTrack?.id;
    if (!id) return;
    const value = Math.round((lyricsOffset() + delta) * 10) / 10;
    if (value) lyricsOffsets[id] = value;
    else delete lyricsOffsets[id];
    const keys = Object.keys(lyricsOffsets);
    if (keys.length > 400) delete lyricsOffsets[keys[0]];
    storage.set(KEYS.lyricsOffsets, lyricsOffsets);
    updateLyricsTools();
    syncLyrics(els.audio.currentTime, true);
  }

  // Barra bajo la letra: desfase (sincronizadas), traducir y buscar en la web
  function updateLyricsTools() {
    const track = state.currentTrack;
    let bar = els.lyricsPanel.querySelector('.lyrics-tools');
    if (!bar) {
      bar = makeEl('div', 'lyrics-tools');
      els.lyricsPanel.append(bar);
    }
    if (!track) { bar.replaceChildren(); return; }
    const parts = [];
    const query = encodeURIComponent(`${splitTitle(track.title).main} ${track.knownArtist || track.artist} letra`);
    if (state.lyrics?.synced) {
      const offset = lyricsOffset();
      const label = offset ? `${offset > 0 ? '+' : ''}${String(offset).replace('.', ',')} s` : 'A tiempo';
      const minus = makeButton('btn btn-ghost lyrics-shift', 'lyrics-shift', 'Letra antes (−0,5 s)', '', '−0,5 s');
      minus.dataset.delta = '-0.5';
      const plus = makeButton('btn btn-ghost lyrics-shift', 'lyrics-shift', 'Letra después (+0,5 s)', '', '+0,5 s');
      plus.dataset.delta = '0.5';
      parts.push(minus, makeEl('span', 'lyrics-offset', label), plus);
    }
    if (state.lyrics?.text && !/Instrumental/.test(state.lyrics.text)) {
      const text = state.lyrics.synced ? state.lyrics.lines.map((l) => l.text).join('\n') : state.lyrics.text;
      const link = document.createElement('a');
      link.className = 'btn btn-ghost';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.href = `https://translate.google.com/?sl=auto&tl=es&op=translate&text=${encodeURIComponent(text.slice(0, 4500))}`;
      link.textContent = 'Traducir';
      parts.push(link);
    } else if (!state.lyrics) {
      const link = document.createElement('a');
      link.className = 'btn btn-ghost';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.href = `https://www.google.com/search?q=${query}`;
      link.textContent = 'Buscar la letra en la web';
      parts.push(link);
    }
    bar.replaceChildren(...parts);
  }

  async function lyricsRequest(path, retries = 1) {
    // Sin respuesta en 10 s se da por fallida (la conexión móvil a veces se queda colgada)
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined;
    const response = await fetch(`${LYRICS_API}${path}`, { signal });
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
    if (entry.instrumental) return '[00:00.00] Instrumental';
    return entry.syncedLyrics || entry.plainLyrics || '';
  }

  async function fetchLyrics(track) {
    if (lyricsCache.has(track.id)) return lyricsCache.get(track.id);
    const stored = storage.get(KEYS.lyricsPrefix + track.id, null);
    if (typeof stored === 'string') {
      lyricsCache.set(track.id, stored);
      lyricsIndex.touch(track.id);
      return stored;
    }

    const duration = Math.round(parseDuration(track.duration));
    // Artista principal, sin "ft." ni colaboradores
    const artist = track.knownArtist.replace(/\s*\b(ft|feat)\b\.?.*$/i, '').split(',')[0].trim();
    // Título sin "- Remaster", "(feat. …)" ni "[Live]": LRCLIB los guarda sin esos añadidos
    const title = splitTitle(track.title).main.replace(/\s*[([](feat|ft|with|prod)\b.*?[)\]]/gi, '').trim() || track.title;
    let text = '';
    try {
      if (artist) {
        const params = new URLSearchParams({ artist_name: artist, track_name: title });
        if (duration) params.set('duration', String(duration));
        // Si la búsqueda exacta falla (LRCLIB a veces responde sin CORS), se prueba la búsqueda libre
        text = pickLyrics(await lyricsRequest(`/get?${params}`).catch(() => null));
      }
      if (!text) {
        const results = await lyricsRequest(`/search?${new URLSearchParams({ q: `${title} ${artist}`.trim() })}`);
        if (Array.isArray(results)) {
          // Sin artista conocido solo se acepta si la duración coincide (evita letras equivocadas)
          const matches = results.filter((r) => (duration ? Math.abs(r.duration - duration) <= 4 : Boolean(artist)));
          matches.sort((a, b) => Number(Boolean(b.syncedLyrics)) - Number(Boolean(a.syncedLyrics)));
          text = pickLyrics(matches[0]);
        }
      }
    } catch (error) {
      console.warn('[LiquidBullet] No se pudo obtener la letra:', error);
      return null;
    }
    lyricsCache.set(track.id, text);
    if (storage.set(KEYS.lyricsPrefix + track.id, text)) lyricsIndex.touch(track.id);
    return text;
  }

  // Letra que quedó por buscar al abrir la app sin reproducir
  let lyricsPendingFor = null;
  function flushPendingLyrics() {
    const track = lyricsPendingFor;
    lyricsPendingFor = null;
    if (track && state.currentTrack === track) showLyricsFor(track);
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
    if (typeof text === 'string' && text && state.currentTrack) delete state.currentTrack.lyricsHay;
    queueMicrotask(updateLyricsTools);
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
      p.textContent = line.text || '· · ·';
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
      if (lines[i].time <= time + 0.2 + lyricsOffset()) index = i;
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
    if (settings.ultra) {
      resetDynamicColor();
      return;
    }
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

  /* ---------- Ecualizador (Web Audio, requiere CORS en el audio) ---------- */
  const EQ_BANDS = [
    { freq: 60, type: 'lowshelf', label: 'Bajos', hz: '60 Hz' },
    { freq: 230, type: 'peaking', label: 'Graves', hz: '230 Hz' },
    { freq: 910, type: 'peaking', label: 'Medios', hz: '910 Hz' },
    { freq: 3600, type: 'peaking', label: 'Voces', hz: '3,6 kHz' },
    { freq: 14000, type: 'highshelf', label: 'Agudos', hz: '14 kHz' }
  ];
  const EQ_PRESETS = {
    flat: { name: 'Plano', gains: [0, 0, 0, 0, 0] },
    bass: { name: 'Más bajos', gains: [6, 3, 0, 0, 0] },
    deep: { name: 'Bajos profundos', gains: [9, 5, -1, 0, 1] },
    perreo: { name: 'Perreo / Trap', gains: [7, 3, -1, 1, 3] },
    hiphop: { name: 'Hip-hop', gains: [5, 3, -1, 2, 1] },
    electronic: { name: 'Electrónica', gains: [5, 2, 0, 2, 5] },
    rock: { name: 'Rock', gains: [4, 1, -2, 2, 4] },
    vocal: { name: 'Voces claras', gains: [-2, -1, 3, 4, 1] },
    treble: { name: 'Agudos brillantes', gains: [0, 0, 0, 3, 6] },
    acoustic: { name: 'Acústico', gains: [2, 1, 1, 2, 2] },
    night: { name: 'Noche (suave)', gains: [-2, 0, 1, 0, -3] },
    custom: { name: 'Personalizado', gains: null }
  };
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  // cors: origen → true/false según si su servidor permite leer el audio (se comprueba una vez por sesión)
  const eq = { ctx: null, input: null, filters: [], analyser: null, freqData: null, cors: new Map(), probing: null, swapFrom: null, warned: new Set() };

  const eqActive = () => Boolean(AudioContextClass) && settings.eq.gains.some((g) => Math.abs(g) >= 0.5);
  const originOf = (src) => {
    try { return new URL(src, location.href).origin; } catch { return ''; }
  };
  function eqCanPlay(track) {
    if (/^(data|blob):/i.test(track.src)) return true;
    const origin = originOf(track.src);
    return origin === location.origin || eq.cors.get(origin) === true;
  }
  const wantsEq = (track) => Boolean(track) && eqActive() && eqCanPlay(track);

  function ensureEqGraph() {
    if (eq.ctx) return true;
    if (!AudioContextClass) return false;
    try {
      const ctx = new AudioContextClass();
      const input = ctx.createGain();
      const filters = EQ_BANDS.map((band) => {
        const filter = ctx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.freq;
        filter.Q.value = 1.1;
        return filter;
      });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      [input, ...filters].reduce((from, to) => { from.connect(to); return to; }).connect(analyser);
      analyser.connect(ctx.destination);
      eqDecks.forEach((deck) => ctx.createMediaElementSource(deck).connect(input));
      Object.assign(eq, { ctx, input, filters, analyser, freqData: new Uint8Array(analyser.frequencyBinCount) });
      applyEqGains();
      return true;
    } catch (error) {
      console.warn('[LiquidBullet] El ecualizador no está disponible en este navegador.', error);
      eq.ctx = null;
      return false;
    }
  }

  function applyEqGains() {
    if (!eq.ctx) return;
    const now = eq.ctx.currentTime;
    settings.eq.gains.forEach((gain, i) => eq.filters[i].gain.setTargetAtTime(gain, now, 0.05));
    // Baja un poco el volumen de entrada al realzar bandas para que no sature
    const boost = Math.max(0, ...settings.eq.gains);
    eq.input.gain.setTargetAtTime(10 ** ((-boost * 0.6) / 20), now, 0.05);
  }

  // Comprueba qué servidores de audio permiten CORS (una petición HEAD por servidor)
  function probeCors() {
    if (eq.probing) return eq.probing;
    const samples = new Map();
    state.tracks.forEach((t) => {
      const origin = originOf(t.src);
      if (origin && origin !== location.origin && !eq.cors.has(origin) && !samples.has(origin)) samples.set(origin, t.src);
    });
    eq.probing = Promise.all([...samples].map(async ([origin, src]) => {
      try {
        const response = await fetch(src, { method: 'HEAD', mode: 'cors', cache: 'no-store' });
        eq.cors.set(origin, response.ok);
      } catch {
        eq.cors.set(origin, false);
      }
    })).finally(() => { eq.probing = null; });
    return eq.probing;
  }

  // Al activar el ecualizador con una canción sonando, pasa al reproductor ecualizado sin cortar:
  // el de antes sigue sonando hasta que el nuevo empieza
  function syncEqRouting() {
    const track = state.currentTrack;
    if (!track || !els.audio.getAttribute('src') || eqDecks.includes(els.audio)) return;
    if (!wantsEq(track) || !ensureEqGraph()) return;
    if (dj.timer) finishCrossfade();
    const from = els.audio;
    const target = eqDecks[0];
    const playing = !from.paused;
    els.audio = target;
    target.muted = from.muted;
    deckGain.set(target, 1);
    applyVolume(target);
    state.pendingSeek = from.currentTime;
    target.src = track.src;
    if (!playing) {
      releaseDeck(from);
      return;
    }
    eq.swapFrom = from;
    target.addEventListener('playing', () => {
      if (eq.swapFrom === from) {
        eq.swapFrom = null;
        releaseDeck(from);
      }
    }, { once: true });
    play({ quiet: true });
  }

  // Un servidor sin CORS no deja ecualizar: la canción vuelve a sonar sin ecualizador
  function recoverFromEqError() {
    const track = state.currentTrack;
    if (!track || !eqDecks.includes(els.audio)) return false;
    const origin = originOf(track.src);
    eq.cors.set(origin, false);
    const failed = els.audio;
    if (eq.swapFrom?.getAttribute('src')) {
      els.audio = eq.swapFrom;
      eq.swapFrom = null;
      releaseDeck(failed);
    } else {
      const time = failed.currentTime || 0;
      const autoplay = state.wantsPlay === true;
      loadTrack(track, autoplay);
      state.pendingSeek = time || null;
    }
    if (!eq.warned.has(origin)) {
      eq.warned.add(origin);
      showToast('Esta canción no se puede ecualizar (su servidor no lo permite): suena sin ecualizador.');
    }
    updateEqNote();
    return true;
  }

  function updateEqNote() {
    if (!AudioContextClass) {
      els.eqNote.textContent = 'Este navegador no permite ecualizar el audio.';
      return;
    }
    const notes = ['Se aplica al momento. Solo funciona con canciones cuyo servidor lo permite (CORS); las demás suenan igual, sin ecualizar.'];
    if ([...eq.cors.values()].some((ok) => !ok)) notes.push('Ahora mismo las canciones de Cloudflare R2 no se pueden ecualizar: hace falta activar CORS en el bucket.');
    if (IS_IOS) notes.push('En iPhone/iPad, con el ecualizador activado la música podría pararse al salir de la app. Con «Plano» suena como siempre.');
    els.eqNote.textContent = notes.join(' ');
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
      // Con el ecualizador se leen las frecuencias reales
      if (eq.analyser && eqDecks.includes(els.audio)) {
        eq.analyser.getByteFrequencyData(eq.freqData);
        const usable = Math.floor(eq.freqData.length * 0.75);
        return bars.map((_, i) => {
          const bin = Math.floor((i / bars.length) * usable);
          return clamp(eq.freqData[bin] / 255, IDLE_LEVEL, 1);
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
      if (!onScreen || settings.ultra) {
        rafId = null;
        if (settings.ultra) ctx.clearRect(0, 0, width, height);
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
      if (settings.ultra) {
        ctx.clearRect(0, 0, width, height);
        return;
      }
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
    window.lbLoadFonts?.(safeTheme, settings.font);
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

  /* ---------- Interrupciones de audio (otra app con sonido, llamadas) ---------- */
  // Si otra app con sonido (TikTok, Instagram, una llamada) le quita el audio a Liquid Bullet, el sistema
  // pausa la música sin pasar por la app. Esa pausa se recuerda y la música vuelve sola en cuanto hay una
  // señal de que se puede: iOS avisa del fin de la interrupción (audioSession), Android devuelve el audio
  // tras sonidos cortos (notificaciones) y, en cualquier caso, al volver a Liquid Bullet (aunque sea un
  // instante) o con reproducir en la pantalla de bloqueo / notificación, sin abrir la app.
  // Lo que no se hace: reintentar en bucle desde segundo plano. En Android eso le quita el audio a la otra
  // app (TikTok se pausaría cada pocos segundos) y desactiva la reanudación propia del navegador.
  const interruption = {
    active: false,
    hiddenAt: 0,
    since: 0,
    outputChangedAt: 0,
    timers: [],
    // Una pausa del sistema cuenta como interrupción si la app está en segundo plano (da igual cuánto
    // tiempo lleve fuera), si acaba de salir o si iOS marca la sesión de audio como interrumpida.
    // No cuenta si justo cambió la salida de audio (auriculares desconectados): ahí la pausa es a propósito.
    start() {
      const session = navigator.audioSession;
      const away = document.hidden || Date.now() - this.hiddenAt < 8000;
      if (session?.state !== 'interrupted' && !away) return;
      if (Date.now() - this.outputChangedAt < 2000) return;
      this.clear();
      this.active = true;
      this.since = Date.now();
      // Dos intentos tempranos para cortes muy breves (un aviso del sistema); después se espera una señal
      if (document.hidden) this.timers = [1200, 4000].map((ms) => setTimeout(() => this.resume(), ms));
    },
    resume() {
      if (!this.active || !els.audio.paused || !state.currentTrack) return;
      if (navigator.audioSession?.state === 'interrupted') return;
      // Tras horas en pausa, volver a la app no debería hacer sonar nada por sorpresa
      if (Date.now() - this.since > 3 * 60 * 60 * 1000) {
        this.clear();
        return;
      }
      play({ quiet: true });
    },
    clear() {
      this.active = false;
      this.timers.forEach(clearTimeout);
      this.timers = [];
    }
  };

  function setupAudioSession() {
    // Auriculares o Bluetooth desconectados: el sistema pausa y no hay que reanudar por el altavoz
    navigator.mediaDevices?.addEventListener?.('devicechange', () => {
      interruption.outputChangedAt = Date.now();
      if (Date.now() - interruption.since < 2000) interruption.clear();
    });
    // Más señales de «el usuario volvió»: la página sale de la caché (pageshow) o recupera el foco
    window.addEventListener('pageshow', () => interruption.resume());
    window.addEventListener('focus', () => interruption.resume());
    const session = navigator.audioSession;
    // Solo se escucha el estado: fijar session.type en iOS corta la música al salir de la app
    if (!session) return;
    session.addEventListener?.('statechange', () => {
      if (session.state === 'interrupted') {
        if (!els.audio.paused) return;
        interruption.start();
      } else interruption.resume();
    });
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
          : [
            track.thumb && track.thumb !== track.cover ? { src: new URL(track.thumb, location.href).href, sizes: '320x320', type: 'image/jpeg' } : null,
            { src: new URL(track.cover, location.href).href, sizes: '600x600', type: 'image/jpeg' }
          ].filter(Boolean)
      });
    } catch {
      /* metadatos no soportados */
    }
  }

  // Barra de progreso en la pantalla de bloqueo / centro de control
  let positionStamp = 0;
  function updatePositionStateNow() {
    positionStamp = 0;
    updatePositionState();
  }
  function updatePositionState() {
    if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
    const now = performance.now();
    if (now - positionStamp < 4000) return;
    positionStamp = now;
    const duration = getDuration();
    if (!Number.isFinite(duration) || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: els.audio.playbackRate || 1,
        position: clamp(els.audio.currentTime, 0, duration)
      });
    } catch { /* valores fuera de rango */ }
  }

  function setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    const handlers = {
      play: () => play(),
      pause: () => pauseByUser(),
      previoustrack: () => prev(),
      nexttrack: () => next(true),
      // Sin «±10 s»: con esos dos, iPhone (y algunos Android) muestran adelantar/retrasar
      // en la pantalla de bloqueo en lugar de anterior y siguiente. Para moverse dentro de la canción queda la barra.
      seekbackward: null,
      seekforward: null,
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
    on('play', () => {
      setPlayingUI(true);
      interruption.clear();
    });
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
      resume.save(true);
      if (state.userPaused) {
        state.userPaused = false;
        state.reloadOnPause?.();
      } else if (!els.audio.ended && els.audio.getAttribute('src')) {
        interruption.start();
      }
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
      const left = getDuration() - time;
      if (left > 0 && left < 25) preloadNext();
      updatePositionState();
      resume.save();
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
    });
    on('durationchange', () => {
      if (!state.isSeeking) updateProgressUI(els.audio.currentTime, getDuration());
    });
    on('volumechange', updateVolumeUI);
    // Si una canción no carga mientras suena la lista, se salta sola (hasta 3 seguidas)
    let errorSkips = 0;
    on('playing', () => { errorSkips = 0; });
    on('error', () => {
      if (!els.audio.getAttribute('src')) return;
      if (recoverFromEqError()) return;
      // Corte de red a mitad de canción: un reintento desde el mismo segundo
      const code = els.audio.error?.code;
      if (navigator.onLine && !state.retried && (code === 2 || code === 4) && state.currentTrack) {
        state.retried = true;
        const at = els.audio.currentTime || 0;
        const wantsPlay = state.wantsPlay;
        setTimeout(() => {
          state.pendingSeek = at;
          els.audio.src = state.currentTrack.src;
          els.audio.load();
          if (wantsPlay) play({ quiet: true });
        }, 900);
        return;
      }
      const wasPlaying = document.body.classList.contains('is-playing');
      setPlayingUI(false);
      const title = state.currentTrack?.title ?? 'la canción';
      if (navigator.onLine && wasPlaying && errorSkips < 3 && state.queue.length > 1) {
        errorSkips++;
        showToast(`No se pudo cargar «${title}»: pasamos a la siguiente.`);
        setTimeout(() => next(false, 0), 1200);
        return;
      }
      showToast(navigator.onLine
        ? `No se pudo cargar el audio de «${title}».`
        : 'Sin conexión: esta canción no está descargada.');
    });
    // Guarda el tiempo escuchado antes de cerrar o esconder la app
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        interruption.hiddenAt = Date.now();
        flushListening();
        resume.save(true);
        if (resume.queueTimer) resume.flushQueue();
        return;
      }
      interruption.resume();
    });
    window.addEventListener('pagehide', () => {
      flushListening();
      resume.save(true);
      resume.flushQueue();
    });

    // «Cancelar» no es de tipo submit: así Enter en un campo guarda (el primer submit era Cancelar
    // y la playlist recién escrita se descartaba)
    document.addEventListener('click', (event) => {
      const cancel = event.target.closest('[data-dialog-cancel]');
      if (cancel) cancel.closest('dialog')?.close('cancel');
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
      if (!state.isSeeking) haptic(6);
      state.isSeeking = true;
      const value = Number(els.progress.value);
      updateProgressUI(value, getDuration());
    });
    els.progress.addEventListener('change', () => {
      const value = Number(els.progress.value);
      state.isSeeking = false;
      if (state.currentTrack) seekTo(value);
      haptic(12);
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
        case 'pin-playlist': if (pl) togglePin(pl.key); break;
        case 'hide-playlist': if (pl) setPlaylistHidden(pl.key, !isHiddenPl(pl.key)); break;
        case 'share-playlist': sharePlaylist(pl); break;
        case 'go-view': setView(target.dataset.value); break;
        case 'open-artist': openArtist(target.dataset.value); break;
        case 'radio-artist': startRadio(target.dataset.value); break;
        case 'follow-artist': toggleFollow(target.dataset.value); break;
        case 'more-artists': home.artistsShown += ARTISTS_PAGE; renderList(); break;
        case 'home-play': {
          if (state.currentTrack && state.playSource === `home:${target.dataset.value}`) {
            togglePlay();
            break;
          }
          const collection = home.collections.get(target.dataset.value);
          const start = collection?.tracks.find(isPlayable);
          if (start) {
            if (state.shuffle) toggleShuffle();
            playCollection(collection.tracks, start.id, collection.title, `home:${target.dataset.value}`);
          } else showToast('Sin conexión: descarga canciones para escuchar este mix.');
          break;
        }
        case 'home-pick': {
          const track = getTrack(target.dataset.value);
          if (!track) break;
          if (state.currentTrack?.id === track.id) togglePlay();
          else startRadio(artistKeyOf(track), track);
          break;
        }
                case 'toggle-plview': setPlaylistView(settings.plView === 'list' ? 'grid' : 'list'); break;
        case 'filter':
          state.filter = target.dataset.value;
          if (state.filter === 'all') state.genre = '';
          renderList();
          break;
        case 'genre':
          state.genre = state.genre === target.dataset.value ? '' : target.dataset.value;
          renderList();
          break;
        case 'recent-play': {
          const recent = library.recent.map(getTrack).filter(Boolean);
          if (state.currentTrack?.id === target.dataset.value) togglePlay();
          else playCollection(recent, target.dataset.value, 'Escuchadas hace poco');
          break;
        }
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
        case 'play-view':
          if (state.currentTrack && state.playSource === viewSource()) togglePlay();
          else playTracks(getVisibleTracks());
          break;
        case 'shuffle-view': playTracks(getVisibleTracks(), true); break;
        case 'download-playlist': toggleDownload(state.openPlaylist); break;
        case 'new-playlist':
          createPlaylist().then((created) => { if (created) openPlaylist(`local:${created.id}`); });
          break;
        case 'export': exportPlaylists(); break;
        case 'export-m3u': if (pl) exportM3U(pl); break;
        case 'add-all': openBulkAddDialog(getVisibleTracks().map((t) => t.id)); break;
        case 'open-trash': openTrash(); break;
        case 'import': els.importInput.click(); break;
        case 'edit-playlist': if (pl) editLocalPlaylist(pl.id); break;
        case 'delete-playlist': if (pl) deleteLocalPlaylist(pl.id); break;
        case 'copy-playlist': if (pl) copyToLocal(pl); break;
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
      if (addBulk) {
        const pl = findLocal(button.dataset.id);
        const missing = addBulk.filter((id) => !pl.trackIds.includes(id));
        pl.trackIds.push(...missing);
        saveLocalPlaylists();
        showToast(`${songsLabel(missing.length)} añadidas a «${pl.name}».`);
        if (state.openPlaylist === `local:${pl.id}`) renderList();
      } else {
        addToLocal(button.dataset.id, addTarget);
      }
      els.addDialog.close();
    });
    els.addNew.addEventListener('click', async () => {
      els.addDialog.close();
      const created = await createPlaylist(addBulk || (addTarget ? [addTarget] : []));
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
    // Con varios artistas cada nombre abre el suyo; con uno, todo el texto
    const openNowArtist = (event) => {
      const key = event.target.closest('[data-artist]')?.dataset.artist || '';
      if (key && (event.target.closest('.np-artist-link') || els.npArtist.classList.contains('is-link'))) openArtist(key);
    };
    els.npArtist.addEventListener('click', openNowArtist);
    els.npArtist.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openNowArtist(event); }
    });
    els.npAbout.addEventListener('click', (event) => {
      const follow = event.target.closest('[data-follow]');
      if (follow) { toggleFollow(follow.dataset.follow); return; }
      const open = event.target.closest('[data-artist]');
      if (open) openArtist(open.dataset.artist);
    });
    els.addArtist.addEventListener('click', () => {
      els.addDialog.close();
      openArtist(artistKeyOf(getTrack(addTarget)));
    });
    els.trashDialog.addEventListener('click', (event) => {
      const restore = event.target.closest('[data-action="restore"]');
      if (restore) {
        els.trashDialog.close();
        restoreFromTrash(restore.dataset.id);
        return;
      }
      if (event.target === els.trashDialog || event.target.closest('[data-close]')) els.trashDialog.close();
    });
    els.addDislike.addEventListener('click', () => {
      els.addDialog.close();
      toggleDislike(addTarget);
    });
    els.addRadio.addEventListener('click', () => {
      els.addDialog.close();
      const track = getTrack(addTarget);
      if (track) startRadio(artistKeyOf(track), track);
    });
    els.shareColors.addEventListener('click', (event) => {
      const swatch = event.target.closest('[data-color]');
      if (!swatch) return;
      shareCard.color = Number(swatch.dataset.color);
      renderShareColors();
      drawShareCard();
    });
    els.shareImage.addEventListener('click', shareCardImage);
    els.shareLinkBtn.addEventListener('click', () => {
      const data = shareCard.data;
      if (data) shareLink({ title: data.linkTitle, text: data.text, url: data.url });
    });
    els.shareCopy.addEventListener('click', async () => {
      const data = shareCard.data;
      if (!data) return;
      try {
        await navigator.clipboard.writeText(data.url);
        showToast('Enlace copiado: pégalo donde quieras.');
      } catch {
        window.prompt('Copia este enlace para compartir:', data.url);
      }
    });
    els.shareDialog.addEventListener('click', (event) => {
      if (event.target === els.shareDialog || event.target.closest('[data-close]')) els.shareDialog.close();
    });
    // Tocar la canción del reproductor lleva a Sonando (en el móvil, la abre a pantalla completa)
    els.playerTrack.addEventListener('click', (event) => {
      if (event.target.closest('button, a, input')) return;
      showNowPlaying();
    });
    els.npShareBtn.addEventListener('click', () => {
      if (state.currentTrack) shareTrack(state.currentTrack.id);
    });
    els.addShare.addEventListener('click', () => {
      els.addDialog.close();
      shareTrack(addTarget);
    });
    els.addPlayNext.addEventListener('click', () => {
      els.addDialog.close();
      queueTrack(addTarget);
    });
    els.addQueueEnd.addEventListener('click', () => {
      els.addDialog.close();
      queueTrack(addTarget, true);
    });

    // Cola "A continuación": tocar una canción salta a ella; la X la quita
    els.queueBtn.addEventListener('click', () => { queueEditing = false; openQueue(); });
    els.queueEdit.addEventListener('click', () => {
      queueEditing = !queueEditing;
      renderQueue();
    });
    els.queueList.addEventListener('pointerdown', startQueueDrag);
    els.queueFoot.addEventListener('click', (event) => {
      const button = event.target.closest('[data-q]');
      if (!button) return;
      if (button.dataset.q === 'shuffle') toggleShuffle();
      if (button.dataset.q === 'repeat') cycleRepeat();
      if (button.dataset.q === 'sleep') {
        els.queueDialog.close();
        els.sleepBtn.click();
        return;
      }
      if (button.dataset.q === 'save') {
        saveQueueAsPlaylist();
        return;
      }
      renderQueue();
    });
    els.queueList.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove]');
      if (remove) {
        const index = Number(remove.dataset.remove);
        const [removedId] = state.queue.splice(index, 1);
        resume.saveQueue();
        renderQueue();
        showToast(`Quitada de la cola: «${getTrack(removedId)?.title || 'canción'}».`, {
          label: 'Deshacer',
          run: () => {
            state.queue.splice(Math.min(index, state.queue.length), 0, removedId);
            if (index <= state.queueIndex) state.queueIndex++;
            resume.saveQueue();
            if (els.queueDialog.open) renderQueue();
          }
        });
        return;
      }
      const row = event.target.closest('.queue-play');
      if (!row) return;
      const index = Number(row.dataset.index);
      if (index === state.queueIndex) {
        togglePlay();
      } else {
        state.queueIndex = index;
        loadTrack(getTrack(state.queue[index]), true, dj.enabled ? 1.5 : 0);
      }
      renderQueue();
    });

    // Temporizador de apagado
    els.sleepBtn.addEventListener('click', () => {
      updateSleepUI();
      els.sleepDialog.showModal();
    });
    els.sleepOptions.addEventListener('click', (event) => {
      const option = event.target.closest('[data-sleep]');
      if (!option) return;
      setSleep(Number(option.dataset.sleep));
      els.sleepDialog.close();
    });

    // Clic fuera del panel o en "Cerrar"
    [els.queueDialog, els.sleepDialog].forEach((dialog) => dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
    }));

    // Desfase de la letra
    els.lyricsPanel.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action="lyrics-shift"]');
      if (button) shiftLyrics(Number(button.dataset.delta));
    });

    // Letras sincronizadas: clic en una línea para saltar a ese momento
    els.lyricsBody.addEventListener('click', (event) => {
      const line = event.target.closest('.lyric-line');
      if (!line || !state.lyrics?.synced) return;
      const entry = state.lyrics.lines[Number(line.dataset.index)];
      if (entry) {
        seekTo(Math.max(0, entry.time - lyricsOffset()));
        if (els.audio.paused) play();
      }
    });

    // Buscador en tiempo real
    let searchFrame = null;
    let searchMemory = 0;
    els.searchInput.addEventListener('input', () => {
      state.query = els.searchInput.value;
      // En Stats y Lab no hay lista que filtrar: la búsqueda se hace en la Biblioteca
      renderSearchPanel();
      clearTimeout(searchMemory);
      if (state.query.trim()) searchMemory = setTimeout(() => rememberSearch(els.searchInput.value), 1800);
      if (state.query.trim() && ['stats', 'lab', 'home'].includes(state.view)) {
        setView('library');
        return;
      }
      // Con miles de canciones se espera a que pares de escribir: más en equipos modestos y teléfonos,
      // para no pintar la lista entera con cada letra
      clearTimeout(searchFrame);
      const pause = state.tracks.length <= 800 ? 0 : DEVICE.lowEnd ? 220 : DEVICE.device === 'desktop' ? 90 : 140;
      searchFrame = setTimeout(() => {
        searchFrame = null;
        requestAnimationFrame(renderList);
      }, pause);
    });

    // Lab
    els.labPanel.addEventListener('click', (event) => {
      const target = event.target.closest('[data-lab-action]');
      if (target && !target.disabled) handleLabAction(target);
    });
    els.labPanel.addEventListener('input', (event) => {
      const kind = event.target.dataset.labInput;
      if (kind === 'mix') {
        lab.mix = clamp(Number(event.target.value) || 0, 0, 4);
        event.target.setAttribute('aria-valuetext', LAB_MIX_LABELS[lab.mix]);
        const label = event.target.closest('.lab-option')?.querySelector('.lab-option-label');
        if (label) label.textContent = `Descubrimiento · ${LAB_MIX_LABELS[lab.mix]}`;
        saveLab();
        return;
      }
      if (kind !== 'artist' && kind !== 'song') return;
      if (kind === 'artist') lab.artistQuery = event.target.value;
      else lab.songQuery = event.target.value;
      const caret = event.target.selectionStart;
      renderLab();
      const input = els.labPanel.querySelector(`[data-lab-input="${kind}"]`);
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(caret, caret);
    });
    els.labPanel.addEventListener('change', (event) => {
      if (event.target.dataset.labInput !== 'like') return;
      lab.likeArtist = event.target.value;
      renderLab();
    });

    // Pestañas Biblioteca / Playlists / Favoritas
    els.tabsBar.addEventListener('click', (event) => {
      const tab = event.target.closest('.tab');
      if (!tab) return;
      clearSearch();
      setView(tab.dataset.view);
    });
    // Quita el degradado del borde cuando ya se ve la última pestaña
    const tabsEnd = () => els.tabsBar.classList.toggle('is-end', els.tabsBar.scrollLeft + els.tabsBar.clientWidth >= els.tabsBar.scrollWidth - 4);
    els.tabsBar.addEventListener('scroll', tabsEnd, { passive: true });
    window.addEventListener('resize', tabsEnd);
    requestAnimationFrame(tabsEnd);
    els.tabsBar.addEventListener('keydown', (event) => {
      const tabs = [...els.tabsBar.querySelectorAll('.tab')].filter((t) => t.offsetParent !== null);
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      let target = null;
      if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === 'Home') target = tabs[0];
      if (event.key === 'End') target = tabs[tabs.length - 1];
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      clearSearch();
      setView(target.dataset.view);
      target.focus();
    });

    // Botón "Letra" del reproductor: abre el panel y lo lleva a la vista
    els.lyricsBtn.addEventListener('click', () => {
      npSheet.open();
      els.lyricsPanel.open = true;
      els.lyricsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    els.lyricsPanel.addEventListener('toggle', () => {
      els.lyricsBtn.classList.toggle('is-active', els.lyricsPanel.open);
      if (els.lyricsPanel.open) {
        flushPendingLyrics();
        syncLyrics(els.audio.currentTime, true);
      }
    });

    // Tema
    els.themeSelect.addEventListener('change', () => {
      const change = () => applyTheme(els.themeSelect.value);
      if (settings.motion && document.startViewTransition && !reducedMotion()) document.startViewTransition(change);
      else change();
    });

    // Carátula de respaldo si la imagen falla
    [els.cover, els.miniCover].forEach((img) => {
      img.addEventListener('error', () => {
        if (img.src !== PLACEHOLDER_COVER) img.src = PLACEHOLDER_COVER;
      });
    });

    // Configuración
    els.settingsBtn.addEventListener('click', openSettings);
    els.settingsDialog.addEventListener('click', (event) => {
      if (event.target === els.settingsDialog) els.settingsDialog.close();
    });
    els.fontSelect.addEventListener('change', () => {
      settings.font = els.fontSelect.value;
      saveSettings();
      applyLook();
    });
    els.textSizeSelect.addEventListener('change', () => {
      settings.textSize = els.textSizeSelect.value;
      saveSettings();
      applyLook();
    });
    els.plViewSelect.addEventListener('change', () => setPlaylistView(els.plViewSelect.value));
    els.ultraToggle.addEventListener('change', () => {
      settings.ultra = els.ultraToggle.checked;
      saveSettings();
      applyLook();
      wall.applyMode();
      visualizer.start();
      if (state.currentTrack) {
        updateDynamicColor(state.currentTrack);
        els.cover.src = settings.ultra ? state.currentTrack.thumb || state.currentTrack.cover : state.currentTrack.cover;
      }
      renderList();
      showToast(settings.ultra
        ? 'Modo ultraligero activado: sin efectos, fondo, animaciones ni miniaturas en las listas.'
        : 'Modo ultraligero desactivado: vuelven los efectos.');
    });
    els.hiddenList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action="unhide-playlist"]');
      if (button) setPlaylistHidden(button.dataset.key, false);
    });
    els.hiddenShowAll.addEventListener('click', () => {
      const count = library.hidden.length;
      library.hidden = [];
      storage.set(KEYS.hidden, library.hidden);
      updateCounts();
      renderHiddenSettings();
      renderList();
      showToast(count === 1 ? 'La playlist oculta vuelve a verse.' : `Las ${count} playlists ocultas vuelven a verse.`);
    });
    els.motionToggle.addEventListener('change', () => {
      settings.motion = els.motionToggle.checked;
      saveSettings();
      applyLook();
      wall.updateLoop();
    });
    els.wallMode.addEventListener('change', () => {
      settings.wall.mode = els.wallMode.value;
      saveSettings();
      wall.applyMode();
    });
    els.wallAlive.addEventListener('change', () => {
      settings.wall.alive = els.wallAlive.checked;
      saveSettings();
      wall.updateLoop();
    });
    els.hapticsToggle.addEventListener('change', () => {
      settings.haptics = els.hapticsToggle.checked;
      saveSettings();
      haptic(15);
    });
    els.eqPreset.addEventListener('change', () => {
      const preset = EQ_PRESETS[els.eqPreset.value];
      settings.eq.preset = els.eqPreset.value;
      if (preset?.gains) settings.eq.gains = preset.gains.slice();
      renderEqBands();
      onEqChange();
    });
    els.eqBands.addEventListener('input', (event) => {
      const input = event.target.closest('input[data-band]');
      if (!input) return;
      settings.eq.gains[Number(input.dataset.band)] = Number(input.value);
      const match = Object.entries(EQ_PRESETS).find(([, p]) => p.gains && p.gains.every((g, i) => g === settings.eq.gains[i]));
      settings.eq.preset = match ? match[0] : 'custom';
      els.eqPreset.value = settings.eq.preset;
      updateBandLabel(input);
      onEqChange();
    });

    // Navegación inferior (móvil)
    els.bottomNav.addEventListener('click', (event) => {
      const button = event.target.closest('.nav-btn');
      if (!button) return;
      const target = button.dataset.nav;
      npSheet.close();
      // Cambiar de sección deja atrás la búsqueda (antes el texto seguía escrito en Inicio y Lab sin filtrar nada)
      if (target !== 'search') clearSearch();
      if (target === 'home' && state.view !== 'home') setView('home');
      if (target === 'library' && state.view !== 'library') setView('library');
      if (target === 'playlists' && state.view !== 'playlists') setView('playlists');
      if (target === 'lab' && state.view !== 'lab') setView('lab');
      // El foco va primero (iOS solo abre el teclado dentro del toque)
      if (target === 'search') els.searchInput.focus({ preventScroll: true });
      els.library.scrollIntoView({ block: 'start', behavior: settings.motion ? 'smooth' : 'auto' });
      updateNav();
    });
    els.searchInput.addEventListener('focus', () => { updateNav(); renderSearchPanel(); });
    els.searchInput.addEventListener('blur', () => {
      rememberSearch(els.searchInput.value);
      updateNav();
      setTimeout(renderSearchPanel, 120);
    });
    els.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') rememberSearch(els.searchInput.value);
    });
    // El panel no quita el foco del buscador al tocarlo
    els.searchPanel.addEventListener('pointerdown', (event) => event.preventDefault());
    els.searchPanel.addEventListener('click', (event) => {
      const q = event.target.closest('[data-q]');
      if (q) {
        els.searchInput.value = q.dataset.q;
        els.searchInput.dispatchEvent(new Event('input'));
        rememberSearch(q.dataset.q);
        return;
      }
      if (event.target.closest('[data-clear-searches]')) {
        library.searches = [];
        storage.set(KEYS.searches, []);
        renderSearchPanel();
        return;
      }
      const tile = event.target.closest('[data-key]');
      if (tile) {
        els.searchInput.blur();
        openPlaylist(tile.dataset.key);
      }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        nav.nowVisible = entry.isIntersecting;
        updateNav();
      }, { threshold: 0.3 }).observe(els.nowPlaying);
    }

    // Mantener pulsada una playlist (o clic derecho) la fija arriba
    let press = null;
    const cancelPress = () => { if (press) clearTimeout(press.timer); };
    els.library.addEventListener('pointerdown', (event) => {
      const card = event.target.closest('.pl-card[data-key]');
      press = null;
      if (!card || event.pointerType === 'mouse') return;
      press = { card, fired: false, x: event.clientX, y: event.clientY };
      press.timer = setTimeout(() => {
        if (press && !press.fired) {
          press.fired = true;
          togglePin(card.dataset.key);
        }
      }, 550);
    });
    els.library.addEventListener('pointermove', (event) => {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) cancelPress();
    });
    els.library.addEventListener('pointerup', cancelPress);
    els.library.addEventListener('pointercancel', cancelPress);
    els.library.addEventListener('contextmenu', (event) => {
      const card = event.target.closest('.pl-card[data-key]');
      if (!card) return;
      event.preventDefault();
      if (press && press.card === card) {
        cancelPress();
        if (press.fired) return;
        press.fired = true;
      }
      togglePin(card.dataset.key);
    });
    // Tras fijar con una pulsación larga, el toque no abre la playlist
    els.library.addEventListener('click', (event) => {
      if (press?.fired && event.target.closest('.pl-card') === press.card) {
        event.preventDefault();
        event.stopPropagation();
      }
      press = null;
    }, true);

    // Rebote al tocar botones
    document.addEventListener('click', (event) => {
      if (!settings.motion) return;
      const button = event.target.closest('.icon-btn, .btn, .tab, .chip, .nav-btn, .recent-card');
      if (!button || button.disabled) return;
      button.classList.remove('is-pop');
      void button.offsetWidth;
      button.classList.add('is-pop');
    });
    document.addEventListener('animationend', (event) => {
      if (event.animationName === 'tap-pop') event.target.classList.remove('is-pop');
    });

    // Sonido: velocidad y fundido al pausar
    els.speedSelect.addEventListener('change', () => setSpeed(Number(els.speedSelect.value)));
    els.softPauseToggle.addEventListener('change', () => {
      settings.softPause = els.softPauseToggle.checked;
      saveSettings();
    });

    // Índice A–Z: tocar o arrastrar el dedo por las letras
    const railPick = (event) => {
      const el = document.elementFromPoint(event.clientX, event.clientY)?.closest('.alpha-letter');
      if (el) jumpToLetter(el.dataset.letter);
    };
    els.alphaRail.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      els.alphaRail.setPointerCapture?.(event.pointerId);
      els.alphaRail.classList.add('is-active');
      railPick(event);
    });
    els.alphaRail.addEventListener('pointermove', (event) => { if (els.alphaRail.classList.contains('is-active')) railPick(event); });
    ['pointerup', 'pointercancel'].forEach((type) => els.alphaRail.addEventListener(type, () => els.alphaRail.classList.remove('is-active')));
    els.alphaRail.addEventListener('click', (event) => {
      const el = event.target.closest('.alpha-letter');
      if (el && event.detail === 0) jumpToLetter(el.dataset.letter);
    });

    // Descargas
    els.clearDownloads.addEventListener('click', clearAllDownloads);
    els.autoFavToggle.addEventListener('change', () => {
      settings.autoFav = els.autoFavToggle.checked;
      saveSettings();
      if (settings.autoFav) {
        const missing = [...state.favorites].map(getTrack).filter((t) => t && !isDownloaded(t));
        if (missing.length && navigator.onLine) {
          showToast(`Descargando ${songsLabel(missing.length)} de tus favoritas…`);
          (async () => {
            for (const track of missing) {
              if (!settings.autoFav) break;
              await downloadTrack(track);
            }
            renderStorageInfo();
          })();
        }
      }
    });

    // Rueda del ratón sobre el volumen o el altavoz
    [els.volume, els.muteBtn].forEach((el) => el.addEventListener('wheel', (event) => {
      event.preventDefault();
      setVolume(clamp(state.volume + (event.deltaY < 0 ? 0.05 : -0.05), 0, 1));
    }, { passive: false }));

    // Deslizar la portada de Sonando a los lados: siguiente / anterior
    (() => {
      const wrap = els.cover.closest('.cover-wrap');
      let sx = null;
      let sy = 0;
      wrap.addEventListener('touchstart', (event) => {
        if (event.touches.length !== 1) { sx = null; return; }
        sx = event.touches[0].clientX;
        sy = event.touches[0].clientY;
      }, { passive: true });
      wrap.addEventListener('touchmove', (event) => {
        if (sx === null) return;
        const dx = event.touches[0].clientX - sx;
        if (Math.abs(dx) > Math.abs(event.touches[0].clientY - sy)) wrap.style.setProperty('--swipe', `${clamp(dx * 0.35, -60, 60)}px`);
      }, { passive: true });
      wrap.addEventListener('touchend', (event) => {
        if (sx === null) return;
        const dx = event.changedTouches[0].clientX - sx;
        const dy = event.changedTouches[0].clientY - sy;
        sx = null;
        wrap.style.removeProperty('--swipe');
        if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7 || !state.currentTrack) return;
        haptic(10);
        if (dx < 0) next(true);
        else prev();
      });
    })();

    // Mantener pulsada una canción (o clic derecho) abre su menú ＋
    (() => {
      let timer = null;
      let start = null;
      let fired = false;
      const cancel = () => { clearTimeout(timer); timer = null; };
      els.trackList.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') return;
        const item = event.target.closest('.track');
        if (!item || event.target.closest('[data-action]:not([data-action="play"])')) return;
        fired = false;
        start = { x: event.clientX, y: event.clientY };
        timer = setTimeout(() => {
          timer = null;
          fired = true;
          haptic(18);
          openAddDialog(item.dataset.id);
        }, 520);
      });
      els.trackList.addEventListener('pointermove', (event) => {
        if (timer && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancel();
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => els.trackList.addEventListener(type, cancel));
      // Tras abrir el menú, el toque no reproduce la canción
      els.trackList.addEventListener('click', (event) => {
        if (!fired) return;
        fired = false;
        event.preventDefault();
        event.stopPropagation();
      }, true);
      els.trackList.addEventListener('contextmenu', (event) => {
        const item = event.target.closest('.track');
        if (!item) return;
        event.preventDefault();
        cancel();
        openAddDialog(item.dataset.id);
      });
    })();

    // Enviar el audio a otro dispositivo: Chromecast (Remote Playback) o AirPlay (Safari)
    (() => {
      const button = els.castBtn;
      const audio = () => els.audio;
      const canCast = 'remote' in HTMLMediaElement.prototype;
      const canAirPlay = typeof window.WebKitPlaybackTargetAvailabilityEvent !== 'undefined';
      if (!canCast && !canAirPlay) return;
      button.hidden = false;
      button.addEventListener('click', async () => {
        const deck = audio();
        if (canAirPlay && typeof deck.webkitShowPlaybackTargetPicker === 'function') {
          deck.webkitShowPlaybackTargetPicker();
          return;
        }
        try {
          await deck.remote.prompt();
        } catch (error) {
          if (error?.name === 'NotFoundError') showToast('No hay dispositivos para enviar el audio en esta red.');
          else if (error?.name !== 'NotAllowedError' && error?.name !== 'AbortError') showToast('Este navegador no puede enviar el audio a otro dispositivo.');
        }
      });
    })();

    // «Reproduciendo desde…» lleva a esa playlist, artista o vista
    els.npContext.addEventListener('click', () => {
      const source = state.queueSource;
      if (!source) return;
      npSheet.close();
      if (source.view === 'playlist' && getPlaylist(source.playlist)) openPlaylist(source.playlist);
      else if (source.view === 'artist' && source.artist && getArtist(source.artist)) openArtist(source.artist);
      else if (VIEWS.includes(source.view)) setView(source.view);
      els.library.scrollIntoView({ block: 'start', behavior: settings.motion ? 'smooth' : 'auto' });
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
      if (target.closest('[role="tablist"], .alpha-rail')) return;

      switch (event.code) {
        case 'Space': event.preventDefault(); togglePlay(); break;
        case 'ArrowRight': event.preventDefault(); if (event.shiftKey) next(true); else seekBy(5); break;
        case 'ArrowLeft': event.preventDefault(); if (event.shiftKey) prev(); else seekBy(-5); break;
        // Mayús + ↑/↓: volumen (las flechas solas siguen desplazando la página)
        case 'ArrowUp': if (event.shiftKey) { event.preventDefault(); setVolume(clamp(state.volume + 0.05, 0, 1)); } break;
        case 'ArrowDown': if (event.shiftKey) { event.preventDefault(); setVolume(clamp(state.volume - 0.05, 0, 1)); } break;
        case 'KeyN': next(true); break;
        case 'KeyP': prev(); break;
        case 'KeyM': toggleMute(); break;
        case 'KeyD': setDj(!dj.enabled); break;
        case 'KeyS': toggleShuffle(); break;
        case 'KeyR': cycleRepeat(); break;
        case 'KeyL': els.lyricsPanel.open = !els.lyricsPanel.open; break;
        case 'KeyQ': openQueue(); break;
        case 'KeyT': els.sleepBtn.click(); break;
        case 'Slash': event.preventDefault(); els.searchInput.focus(); break;
        case 'Escape': npSheet.close(); break;
        case 'Comma': if (event.shiftKey) stepSpeed(-1); break;
        case 'Period': if (event.shiftKey) stepSpeed(1); break;
        default:
          // 0–9 saltan al 0 %, 10 %… 90 % de la canción (como en YouTube)
          if (/^Digit\d$/.test(event.code) && state.currentTrack) {
            const duration = getDuration();
            if (duration) seekTo((Number(event.code.slice(5)) / 10) * duration);
          }
          break;
      }
    });
  }

  /* ---------- Fondo de pantalla con vida ---------- */
  // Dos capas que se funden al cambiar; encima, motas de luz y mini iconos que flotan y laten
  // con la música. La animación se detiene con la app oculta o sin animaciones.
  const wall = (() => {
    const layers = [...els.wallStage.querySelectorAll('.wall-layer')];
    const canvas = els.wallLife;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const FRAME_MS = 1000 / 30;
    let current = null;
    let front = 0;
    let lastChange = 0;
    let rafId = null;
    let lastFrame = 0;
    let width = 0;
    let height = 0;
    let motes = [];
    let floaters = [];
    let tilt = { x: 0, y: 0 };
    let pulse = 0;
    let dyn = '#ffffff';
    let dynFrames = 0;
    let stageVars = '';
    // Mientras se desplaza una lista el fondo se queda quieto: redibujarlo bajo los paneles de cristal
    // (backdrop-filter) obliga a repintarlos en cada fotograma y el scroll iba a tirones
    let scrollingUntil = 0;
    const icons = new Map();

    const enabled = () => settings.wall.mode !== 'off' && !settings.ultra;
    const alive = () => enabled() && settings.wall.alive && settings.motion && !reduced.matches
      && !document.documentElement.classList.contains('lite');

    function iconImage(id) {
      if (!icons.has(id)) {
        const img = new Image();
        img.src = wallIcon(id);
        icons.set(id, img);
      }
      return icons.get(id);
    }

    function randomId(except) {
      const pool = WALLPAPERS.filter((w) => w.id !== except);
      return pool[Math.floor(Math.random() * pool.length)].id;
    }

    function show(id, instant = false) {
      if (!isWallId(id)) return;
      current = id;
      lastChange = Date.now();
      storage.set(KEYS.wallLast, id);
      els.wallBtnImg.src = wallIcon(id);
      const info = WALLPAPERS.find((w) => w.id === id);
      els.wallBtn.title = `Fondo: ${info.name} (toca para otro)`;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (current !== id) return;
        const next = layers[instant ? front : 1 - front];
        next.style.backgroundImage = `url("${wallSrc(id)}")`;
        next.style.setProperty('--pos', info.pos);
        if (!instant) {
          layers[front].classList.remove('is-on');
          front = 1 - front;
        }
        next.classList.add('is-on');
        // Los mini iconos que flotan pasan a ser del fondo nuevo (y algunos al azar)
        floaters.forEach((f, i) => { if (i % 2 === 0) f.id = id; });
        syncGrid();
      };
      img.src = wallSrc(id);
    }

    function applyMode() {
      const on = enabled();
      document.documentElement.classList.toggle('has-wall', on);
      els.wallBtn.hidden = !on;
      if (on) {
        if (settings.wall.mode === 'fixed') show(settings.wall.fixed, !current);
        else if (!current) show(randomId(storage.get(KEYS.wallLast, null)), true);
      }
      updateLoop();
    }

    // Al cambiar de canción (como mucho cada 20 s, para no parpadear al saltar rápido)
    function onTrack() {
      if (settings.wall.mode !== 'song' || Date.now() - lastChange < 20000) return;
      show(randomId(current));
    }

    function shuffle() {
      const id = randomId(current);
      if (settings.wall.mode === 'fixed') {
        settings.wall.fixed = id;
        saveSettings();
      }
      show(id);
      haptic(10);
    }

    function pick(id) {
      settings.wall.mode = 'fixed';
      settings.wall.fixed = id;
      saveSettings();
      els.wallMode.value = 'fixed';
      applyMode();
      show(id);
    }

    function syncGrid() {
      els.wallGrid.querySelectorAll('.wall-option').forEach((button) => {
        const on = button.dataset.id === current;
        button.classList.toggle('is-active', on);
        button.setAttribute('aria-checked', String(on));
      });
    }

    function renderGrid() {
      els.wallGrid.replaceChildren(...WALLPAPERS.map((w) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'wall-option';
        button.dataset.id = w.id;
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-label', w.name);
        button.title = w.name;
        const img = document.createElement('img');
        img.src = wallThumb(w.id);
        img.alt = '';
        img.width = 90;
        img.height = 120;
        img.loading = 'lazy';
        img.decoding = 'async';
        button.append(img);
        return button;
      }));
      syncGrid();
    }

    /* ---- Vida: motas, mini iconos y latido ---- */
    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      const count = Math.round(clamp((width * height) / 26000, 14, 40));
      motes = Array.from({ length: count }, () => newMote(true));
      const stickers = width < 640 ? 4 : 7;
      floaters = Array.from({ length: stickers }, (_, i) => newFloater(true, i));
    }

    function newMote(anywhere) {
      return {
        x: Math.random() * width,
        y: anywhere ? Math.random() * height : height + 10,
        r: 0.8 + Math.random() * 2.2,
        speed: 6 + Math.random() * 16,
        sway: Math.random() * Math.PI * 2,
        twinkle: Math.random() * Math.PI * 2
      };
    }

    function newFloater(anywhere, i = 0) {
      return {
        id: i % 2 === 0 && current ? current : WALLPAPERS[Math.floor(Math.random() * WALLPAPERS.length)].id,
        x: 20 + Math.random() * (width - 40),
        y: anywhere ? Math.random() * height : height + 40,
        size: 18 + Math.random() * 18,
        speed: 5 + Math.random() * 9,
        sway: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.4,
        angle: (Math.random() - 0.5) * 0.6
      };
    }

    // Nivel de la música: real con el ecualizador; si no, un latido a ~112 bpm mientras suena
    function musicLevel(time) {
      if (!document.body.classList.contains('is-playing')) return 0;
      if (eq.analyser && eqDecks.includes(els.audio)) {
        eq.analyser.getByteFrequencyData(eq.freqData);
        let sum = 0;
        for (let i = 0; i < 6; i++) sum += eq.freqData[i];
        return clamp(sum / (6 * 255), 0, 1);
      }
      const beat = (time / (60000 / 112)) % 1;
      return 0.25 + 0.6 * (1 - beat) ** 3;
    }

    function frame(time) {
      rafId = requestAnimationFrame(frame);
      if (time - lastFrame < FRAME_MS) return;
      if (performance.now() < scrollingUntil) {
        lastFrame = time;
        return;
      }
      const dt = Math.min(0.1, (time - (lastFrame || time)) / 1000);
      lastFrame = time;
      const level = musicLevel(time);
      pulse += (level - pulse) * 0.25;
      if (pulse < 0.002) pulse = 0;
      // Solo se tocan las variables CSS si cambian (cada cambio recalcula estilos)
      const beat = pulse.toFixed(2);
      const px = (tilt.x * 14).toFixed(0);
      const py = (tilt.y * 14).toFixed(0);
      const vars = `${beat}|${px}|${py}`;
      if (vars !== stageVars) {
        stageVars = vars;
        els.wallStage.style.setProperty('--beat', beat);
        els.wallStage.style.setProperty('--px', `${px}px`);
        els.wallStage.style.setProperty('--py', `${py}px`);
      }

      ctx.clearRect(0, 0, width, height);
      // El color de la carátula se lee de vez en cuando (leerlo en cada fotograma cuesta)
      if (!dynFrames--) {
        dyn = getComputedStyle(document.body).getPropertyValue('--dyn').trim() || '#ffffff';
        dynFrames = 30;
      }
      const playing = level > 0;
      ctx.fillStyle = dyn;
      motes.forEach((m, i) => {
        m.y -= m.speed * dt * (playing ? 1.6 : 1);
        m.sway += dt * 0.8;
        m.twinkle += dt * 2.4;
        if (m.y < -10) motes[i] = newMote(false);
        const alpha = clamp(0.18 + 0.32 * Math.sin(m.twinkle) ** 2 + pulse * 0.35, 0, 0.9);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(m.x + Math.sin(m.sway) * 12, m.y, m.r * (1 + pulse * 0.6), 0, Math.PI * 2);
        ctx.fill();
      });
      floaters.forEach((f, i) => {
        f.y -= f.speed * dt * (playing ? 1.4 : 1);
        f.sway += dt * 0.6;
        f.angle += f.spin * dt;
        if (f.y < -60) floaters[i] = newFloater(false, i);
        const img = iconImage(f.id);
        if (!img.complete || !img.naturalWidth) return;
        const size = f.size * (1 + pulse * 0.12);
        const x = f.x + Math.sin(f.sway) * 18;
        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.translate(x, f.y);
        ctx.rotate(f.angle);
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, f.y, size / 2, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    function updateLoop() {
      const run = alive() && !document.hidden;
      if (run && !rafId) {
        if (!width) resize();
        lastFrame = 0;
        rafId = requestAnimationFrame(frame);
      } else if (!run && rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
        ctx.clearRect(0, 0, width, height);
        els.wallStage.style.setProperty('--beat', '0');
        stageVars = '';
      }
      els.wallpaper.classList.toggle('is-alive', alive());
    }

    function init() {
      els.wallBtn.addEventListener('click', shuffle);
      els.wallGrid.addEventListener('click', (event) => {
        const option = event.target.closest('.wall-option');
        if (option) pick(option.dataset.id);
      });
      let resizeTimer = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if (rafId) resize(); }, 200);
      });
      document.addEventListener('visibilitychange', updateLoop);
      reduced.addEventListener?.('change', updateLoop);
      // capture: también el scroll de listas y paneles internos (no burbujea)
      let scrollTimer = null;
      document.addEventListener('scroll', () => {
        scrollingUntil = performance.now() + 300;
        if (!scrollTimer) els.wallpaper.classList.add('is-scrolling');
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          scrollTimer = null;
          els.wallpaper.classList.remove('is-scrolling');
        }, 300);
      }, { capture: true, passive: true });
      // Paralaje: el cursor en el ordenador, la inclinación del móvil en Android
      window.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'mouse') return;
        tilt = { x: event.clientX / window.innerWidth - 0.5, y: event.clientY / window.innerHeight - 0.5 };
      }, { passive: true });
      if ('DeviceOrientationEvent' in window && typeof DeviceOrientationEvent.requestPermission !== 'function') {
        window.addEventListener('deviceorientation', (event) => {
          if (event.gamma === null) return;
          tilt = { x: clamp(event.gamma / 45, -1, 1) * 0.5, y: clamp((event.beta - 45) / 45, -1, 1) * 0.5 };
        }, { passive: true });
      }
      applyMode();
    }

    return { init, applyMode, onTrack, renderGrid, updateLoop };
  })();

  /* ---------- Instalar la app (PWA) ---------- */
  // Android/escritorio (Chrome, Edge, Samsung Internet): el navegador ofrece instalarla con su propio
  // diálogo (beforeinstallprompt). iPhone/iPad no tienen ese diálogo: se explica cómo añadirla desde
  // Compartir. Instalada abre a pantalla completa, sin barra del navegador y con su icono.
  const install = (() => {
    let deferred = null;
    const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;
    const isAndroid = DEVICE.os === 'android';
    const info = storage.get(KEYS.install, null) || { visits: 0, hinted: false };

    function steps() {
      if (DEVICE.inapp) {
        return [
          `Estás dentro de ${INAPP_NAMES[DEVICE.inapp] || 'otra app'}: desde aquí no se puede instalar.`,
          IS_IOS ? 'Toca ⋯ o el icono de brújula y elige «Abrir en Safari».' : 'Toca ⋮ y elige «Abrir en Chrome» (o en tu navegador).',
          'Ahí sigue los pasos de instalar.'
        ];
      }
      if (IS_IOS) {
        const share = DEVICE.browser === 'safari'
          ? (DEVICE.device === 'tablet' ? 'Toca Compartir (el cuadrado con la flecha ↑), arriba a la derecha.' : 'Toca Compartir (el cuadrado con la flecha ↑), abajo en el centro.')
          : DEVICE.browser === 'chrome' ? 'Toca Compartir (el cuadrado con la flecha ↑), arriba a la derecha junto a la dirección.'
            : DEVICE.browser === 'firefox' ? 'Toca el menú ≡ (abajo a la derecha) y luego Compartir.'
              : 'Toca Compartir (el cuadrado con la flecha ↑) en el menú del navegador.';
        return [
          share,
          'Desliza y elige «Añadir a pantalla de inicio».',
          'Pulsa «Añadir» y abre Liquid Bullet desde su icono nuevo.'
        ];
      }
      if (DEVICE.browser === 'samsung') {
        return [
          'Toca el menú ≡ (abajo a la derecha).',
          'Elige «Añadir página a» → «Pantalla de inicio».',
          'Confirma y abre Liquid Bullet desde su icono nuevo.'
        ];
      }
      if (DEVICE.browser === 'firefox' && isAndroid) {
        return [
          'Toca el menú ⋮ (arriba o abajo a la derecha).',
          'Elige «Instalar» o «Añadir a pantalla de inicio».',
          'Confirma y abre Liquid Bullet desde su icono nuevo.'
        ];
      }
      return [
        `Abre el menú del navegador (${isAndroid ? '⋮ arriba a la derecha' : '⋮ o ≡'}).`,
        'Elige «Instalar app» o «Añadir a pantalla de inicio».',
        'Confirma y abre Liquid Bullet desde su icono nuevo.'
      ];
    }

    function render() {
      if (!els.installNote) return;
      if (isStandalone()) {
        els.installNote.textContent = 'Ya la estás usando como app instalada.';
        els.installBtn.hidden = true;
        els.installSteps.hidden = true;
        return;
      }
      els.installBtn.hidden = !deferred;
      els.installSteps.hidden = Boolean(deferred);
      if (!deferred) els.installSteps.replaceChildren(...steps().map((text) => makeEl('li', '', text)));
    }

    async function prompt() {
      if (!deferred) {
        if (!els.settingsDialog.open) openSettings();
        els.installNote.scrollIntoView({ block: 'center' });
        return;
      }
      const event = deferred;
      deferred = null;
      event.prompt();
      const choice = await event.userChoice.catch(() => null);
      if (choice?.outcome === 'accepted') showToast('¡Listo! Liquid Bullet ya está en tu pantalla de inicio.');
      render();
    }

    // Una sola sugerencia, a partir de la segunda visita y cuando ya suena algo
    function hintOnce() {
      if (info.hinted || info.visits < 2 || isStandalone()) return;
      if (!deferred && !IS_IOS) return;
      info.hinted = true;
      storage.set(KEYS.install, info);
      showToast(IS_IOS ? 'Instala Liquid Bullet en tu iPhone para que suene mejor.' : 'Instala Liquid Bullet como app.', {
        label: IS_IOS ? 'Cómo' : 'Instalar',
        run: prompt
      });
    }

    function init() {
      if (!isStandalone()) {
        info.visits++;
        storage.set(KEYS.install, info);
      }
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferred = event;
        render();
      });
      window.addEventListener('appinstalled', () => {
        deferred = null;
        info.hinted = true;
        storage.set(KEYS.install, info);
        render();
      });
      els.installBtn?.addEventListener('click', prompt);
      els.audio.addEventListener('playing', () => setTimeout(hintOnce, 20000), { once: true });
      render();
    }

    return { init, render };
  })();

  /* =========================================================
     Cuenta de Liquid Bullet (opcional)
     - Sin cuenta, todo sigue igual: se guarda solo en este navegador.
     - Con cuenta, favoritas, playlists, escucha y ajustes viajan a cualquier dispositivo.
     - La contraseña se estira aquí (PBKDF2, 600.000 vueltas) y nunca sale en claro del teléfono.
     - El archivo de cada persona va mínimo: ids de 7 caracteres, fechas en minutos, gzip y la
       escucha separada por año (ver docs/Liquid-Bullet-Cuentas-Plan.pdf).
     ========================================================= */
  const CUENTA_API = 'https://liquid-cuentas.liquidbulletofficial.workers.dev';
  const TURNSTILE_SITIO = '0x4AAAAAAF1SaKaBNeMZR5B-';
  const REVIEW_URL = 'https://lukoffmon.github.io/LiquidBrush/review.html';
  const CORREO_REMITENTE = 'liquidbulletofficial@gmail.com';

  const cuenta = (() => {
    const K = {
      sesion: 'liquidbrush:cuenta',
      ofrecida: 'liquidbrush:cuenta-ofrecida',
      meta: 'liquidbrush:sync-meta',
      dispositivo: 'liquidbrush:dispositivo',
      ultimoCorreo: 'liquidbrush:cuenta-correo'
    };
    let sesion = storage.get(K.sesion, null);
    if (!sesion || !sesion.renovacion) sesion = null;
    const ui = { dialog: null, body: null, pantalla: 'bienvenida', datos: {}, temporizadores: [] };
    const sync = { estado: sesion ? 'pendiente' : 'apagado', ultima: sesion?.ultimaSync || 0, enCurso: null, error: '' };

    /* ---------- API ---------- */
    class ErrorCuenta extends Error {
      constructor(codigo, extra = {}) { super(codigo); this.codigo = codigo; this.extra = extra; }
    }

    function guardarSesion() {
      if (sesion) storage.set(K.sesion, sesion);
      else { try { localStorage.removeItem(K.sesion); } catch { /* sin acceso */ } }
      actualizarBotones();
    }

    let renovando = null;
    async function renovar() {
      if (renovando) return renovando;
      renovando = (async () => {
        const r = await fetch(`${CUENTA_API}/renovar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ renovacion: sesion.renovacion })
        });
        const d = await r.json().catch(() => ({}));
        if (r.status === 409) {
          // Otra pestaña ya renovó: se toma su sesión
          const otra = storage.get(K.sesion, null);
          if (otra?.renovacion && otra.renovacion !== sesion.renovacion) { sesion = otra; return; }
        }
        if (!d.ok) {
          if (r.status === 401) cerrarLocal('caducada');
          throw new ErrorCuenta(d.error || 'sesion_caducada');
        }
        sesion = { ...sesion, ...d.sesion };
        guardarSesion();
      })();
      try { await renovando; } finally { renovando = null; }
    }

    async function api(ruta, { metodo = 'POST', cuerpo, auth = false, crudo, cabeceras = {}, binario = false } = {}) {
      if (!navigator.onLine) throw new ErrorCuenta('sin_conexion');
      for (let intento = 0; intento < 2; intento++) {
        if (auth) {
          if (!sesion) throw new ErrorCuenta('sesion_caducada');
          if ((sesion.caducaPase || 0) - 60 < Date.now() / 1000) await renovar();
        }
        const h = { ...cabeceras };
        if (cuerpo) h['Content-Type'] = 'application/json';
        if (auth) h.Authorization = `Bearer ${sesion.pase}`;
        let r;
        try {
          r = await fetch(CUENTA_API + ruta, { method: metodo, headers: h, body: crudo ?? (cuerpo ? JSON.stringify(cuerpo) : undefined) });
        } catch {
          throw new ErrorCuenta('sin_conexion');
        }
        if (auth && r.status === 401 && intento === 0) { await renovar(); continue; }
        const tipo = r.headers.get('content-type') || '';
        if (binario && r.ok && !tipo.includes('json')) return { estado: r.status, etag: r.headers.get('ETag'), cuerpo: await r.arrayBuffer() };
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.ok === false) throw new ErrorCuenta(d.error || 'interno', { ...d, estado: r.status });
        return { ...d, estado: r.status, etag: r.headers.get('ETag') };
      }
      throw new ErrorCuenta('sesion_caducada');
    }

    /* ---------- Contraseña: se estira en el dispositivo ---------- */
    const te = new TextEncoder();
    const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    async function claveCliente(correo, contrasena) {
      const sal = await crypto.subtle.digest('SHA-256', te.encode(`liquidbullet:v1:${correo.trim().toLowerCase()}`));
      const material = await crypto.subtle.importKey('raw', te.encode(contrasena), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: 600000 }, material, 256);
      return b64url(bits);
    }

    function fuerza(contrasena) {
      const c = String(contrasena || '');
      const reglas = {
        largo: c.length >= 10,
        letras: /\p{L}/u.test(c),
        numeros: /\d/.test(c),
        extra: /[^\p{L}\d]/u.test(c) || (/\p{Lu}/u.test(c) && /\p{Ll}/u.test(c))
      };
      let puntos = Object.values(reglas).filter(Boolean).length;
      if (c.length >= 14 && puntos >= 3) puntos = 4;
      if (!reglas.largo) puntos = Math.min(puntos, 1);
      const textos = ['Muy débil', 'Débil: añade más caracteres', 'Aceptable: suma números o símbolos', 'Buena', 'Excelente'];
      return { reglas, puntos, texto: c ? textos[puntos] : 'Mínimo 10 caracteres, con letras y números', valida: reglas.largo && reglas.letras && reglas.numeros };
    }

    // ¿Apareció en filtraciones? (Have I Been Pwned por rango: solo salen 5 caracteres del hash)
    async function filtrada(contrasena) {
      try {
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-1', te.encode(contrasena)))]
          .map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        const r = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } });
        if (!r.ok) return false;
        const resto = hash.slice(5);
        return (await r.text()).split('\n').some((linea) => linea.startsWith(resto) && Number(linea.split(':')[1]) > 0);
      } catch {
        return false;
      }
    }

    /* ---------- Turnstile (anti-bots, casi siempre invisible) ---------- */
    const robot = { cargando: null, widget: null, token: null, esperas: [] };
    function cargarTurnstile() {
      if (window.turnstile) return Promise.resolve();
      if (robot.cargando) return robot.cargando;
      robot.cargando = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { robot.cargando = null; reject(new ErrorCuenta('robot')); };
        document.head.append(s);
      });
      return robot.cargando;
    }

    async function montarRobot() {
      const caja = ui.body?.querySelector('.cuenta-robot');
      if (!caja) return;
      try { await cargarTurnstile(); } catch { return; }
      if (robot.widget !== null) { try { window.turnstile.remove(robot.widget); } catch { /* ya no existe */ } }
      robot.token = null;
      const tema = document.documentElement.dataset.theme === 'minimal' ? 'light' : 'dark';
      robot.widget = window.turnstile.render(caja, {
        sitekey: TURNSTILE_SITIO, appearance: 'interaction-only', theme: tema, language: 'es',
        callback: (t) => { robot.token = t; robot.esperas.splice(0).forEach((r) => r(t)); },
        'expired-callback': () => { robot.token = null; },
        'error-callback': () => { robot.token = null; }
      });
    }

    function tokenRobot() {
      if (robot.token) return Promise.resolve(robot.token);
      return new Promise((resolve, reject) => {
        robot.esperas.push(resolve);
        setTimeout(() => reject(new ErrorCuenta('robot')), 20000);
      });
    }

    function gastarRobot() {
      robot.token = null;
      try { if (robot.widget !== null) window.turnstile.reset(robot.widget); } catch { /* sin widget */ }
    }

    /* ---------- Textos ---------- */
    const ERRORES = {
      credenciales: 'Correo o contraseña incorrectos.',
      demasiados_intentos: 'Demasiados intentos. Prueba en unos minutos o recupera tu contraseña.',
      demasiados_envios: 'Ya pediste varios códigos. Espera un rato y vuelve a intentarlo.',
      codigo_incorrecto: 'Código incorrecto.',
      codigo_caducado: 'Ese código caducó. Pide uno nuevo.',
      espera_reenvio: 'Espera un momento para pedir otro código.',
      contrasena_debil: 'Usa al menos 10 caracteres, con letras y números.',
      contrasena_filtrada: 'Esta contraseña apareció en una filtración conocida. Elige otra.',
      clave_repetida: 'Elige una contraseña distinta de la anterior.',
      correo_invalido: 'Revisa el correo: parece que falta algo.',
      sin_conexion: 'No hay conexión. Puedes seguir sin cuenta y entrar luego.',
      envio_no_disponible: 'Estamos teniendo problemas para enviar correos. Prueba en unas horas.',
      sesion_caducada: 'Vuelve a entrar para seguir sincronizando. Tus datos de este dispositivo siguen aquí.',
      robot: 'No pudimos comprobar que eres tú. Inténtalo de nuevo.',
      ya_registrado: 'Ese correo ya tiene cuenta. Entra con tu contraseña.',
      interno: 'Algo falló de nuestro lado. Inténtalo de nuevo en un momento.'
    };
    const mensaje = (e) => {
      const codigo = e?.codigo || 'interno';
      let texto = ERRORES[codigo] || ERRORES.interno;
      if (codigo === 'codigo_incorrecto' && Number.isInteger(e.extra?.quedan)) texto += ` Te quedan ${e.extra.quedan} intento${e.extra.quedan === 1 ? '' : 's'}.`;
      if ((codigo === 'espera_reenvio' || codigo === 'demasiados_intentos') && e.extra?.esperar) texto += ` (${formatTime(e.extra.esperar)})`;
      return texto;
    };
    const ico = (n, clase = '') => `<svg class="icon ${clase}" aria-hidden="true"><use href="#i-${n}"></use></svg>`;
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ocultarCorreo = (c) => String(c).replace(/^(.)[^@]*(@.*)$/, '$1•••$2');

    function abrirCorreoUrl(correo) {
      const dominio = String(correo).split('@')[1] || '';
      if (/gmail|googlemail/.test(dominio)) return 'https://mail.google.com/mail/u/0/#search/from%3Aliquidbulletofficial%40gmail.com';
      if (/outlook|hotmail|live|msn/.test(dominio)) return 'https://outlook.live.com/mail/0/';
      if (/icloud|me\.com|mac\.com/.test(dominio)) return 'https://www.icloud.com/mail';
      if (/yahoo/.test(dominio)) return 'https://mail.yahoo.com/';
      return `mailto:`;
    }

    /* ---------- Avatar ---------- */
    const COLORES = ['#ff7ad9', '#7ef9ff', '#ffe27a', '#7a5cff', '#3ddc97', '#ff9f43'];
    // Fotos de perfil: las de avatars/ son solo para esto y solo existen en este selector.
    // Sin foto elegida, la inicial con color. (Los «fondo:NN» antiguos se muestran como inicial.)
    const FOTOS = ['01', '02', '03', '04', '05', '06', '07', '08'];
    const OPCIONES_AVATAR = FOTOS.map((f) => `foto:${f}`);
    // Collage de bienvenida: iconos de fondo (se pueden reutilizar; las fotos de perfil no)
    const FONDOS = ['01', '03', '05', '07', '09', '11', '12', '14'];
    function avatarHtml(avatar, nombre, clase = '') {
      const inicial = esc((nombre || sesion?.perfil?.correo || '?').trim().charAt(0).toUpperCase() || '?');
      const a = String(avatar || '');
      const foto = /^foto:(0[1-8])$/.exec(a);
      if (foto) {
        const grande = clase.includes('is-grande');
        return `<span class="cuenta-avatar ${clase}"><img src="avatars/avatar-${foto[1]}${grande ? '' : '-sm'}.jpg" alt="" decoding="async"></span>`;
      }
      const color = a.startsWith('inicial:') ? a.slice(8) : COLORES[0];
      return `<span class="cuenta-avatar is-inicial ${clase}" style="--av:${esc(color)}">${inicial}</span>`;
    }

    /* ---------- Hoja y pantallas ---------- */
    function limpiarTemporizadores() {
      ui.temporizadores.splice(0).forEach((t) => clearInterval(t));
    }

    function abrir(pantalla = sesion ? 'cuenta' : 'bienvenida', datos = {}) {
      if (!ui.dialog) return;
      ir(pantalla, datos);
      if (!ui.dialog.open) ui.dialog.showModal();
    }

    function cerrar() {
      limpiarTemporizadores();
      if (ui.dialog?.open) ui.dialog.close();
    }

    function ir(pantalla, datos = {}) {
      limpiarTemporizadores();
      ui.pantalla = pantalla;
      ui.datos = { ...ui.datos, ...datos };
      const render = PANTALLAS[pantalla] || PANTALLAS.bienvenida;
      ui.body.innerHTML = render(ui.datos);
      ui.body.dataset.pantalla = pantalla;
      ui.dialog.classList.toggle('is-cuenta', pantalla === 'cuenta');
      PREPARAR[pantalla]?.(ui.datos);
      if (ui.body.querySelector('.cuenta-robot')) montarRobot();
      const foco = ui.body.querySelector('[autofocus]') || ui.body.querySelector('h2');
      foco?.focus({ preventScroll: true });
    }

    const cabecera = (titulo, volver = 'bienvenida', paso = '') => `
      <div class="cuenta-head">
        ${volver ? `<button type="button" class="icon-btn" data-cuenta="ir" data-ir="${volver}" aria-label="Volver"><svg class="icon" aria-hidden="true"><use href="#i-back"></use></svg></button>` : '<span></span>'}
        <h2 class="sheet-title" tabindex="-1">${titulo}</h2>
        <button type="button" class="icon-btn" data-cuenta="cerrar" aria-label="Cerrar"><svg class="icon" aria-hidden="true"><use href="#i-close"></use></svg></button>
      </div>${paso ? `<div class="cuenta-pasos" aria-label="${esc(paso)}">${paso}</div>` : ''}`;
    const pasos = (actual, total) => Array.from({ length: total }, (_, i) => `<span class="${i < actual ? 'is-on' : ''}"></span>`).join('');
    const errorBox = '<p class="cuenta-error" role="alert" aria-live="assertive" hidden></p>';
    // Los códigos salen de una cuenta de Gmail: muchas veces llegan a Spam o Promociones. Se avisa antes de enviarlos.
    const avisoSpam = (texto = 'Te enviaremos un código de 6 dígitos') =>
      `<p class="cuenta-aviso">${ico('mail')} ${texto} desde <b>${CORREO_REMITENTE}</b>. <b>Si no aparece en un minuto, revisa Spam o Promociones</b> y márcalo como <i>No es spam</i>.</p>`;
    const botonPrincipal = (texto, accion) => `<button type="submit" class="btn btn-primary cuenta-cta" data-cuenta="${accion}"><span class="cuenta-cta-text">${texto}</span><span class="cuenta-cta-barra" aria-hidden="true"></span></button>`;

    // Collage de la bienvenida con los fondos de la app (las portadas de playlist son solo para playlists)
    function collage() {
      const ids = seededShuffle(FONDOS, `collage-${todayKey()}`).slice(0, 3);
      return ids.map((id, i) => `<img class="cuenta-collage-${i}" src="wallpapers/icons/${id}.jpg" alt="" width="120" height="120" loading="lazy">`).join('');
    }

    const CONOCE = [
      ['star', 'Nuestra nota', 'nota'], ['toolbox', 'Todo lo que trae', 'que-trae'], ['flask', 'Cómo aprende de ti', 'algoritmo'],
      ['palette', 'Sus cuatro temas', 'temas'], ['disc', 'Playlists de autor', 'playlists'], ['scale', 'Frente a otras apps', 'comparativa'], ['question', 'Preguntas', 'preguntas']
    ];

    const PANTALLAS = {
      bienvenida: () => `
        ${cabecera('Tu cuenta', '')}
        <div class="cuenta-collage" aria-hidden="true">${collage()}</div>
        <h3 class="cuenta-titulo">Tu música, en todos tus dispositivos</h3>
        <ul class="cuenta-ventajas">
          <li>${ico('cloud')} Nunca pierdes favoritas ni playlists.</li>
          <li>${ico('phone')} Lo mismo en tu teléfono y en tu compu.</li>
          <li>${ico('spark')} Tus mixes siguen aprendiendo de ti.</li>
        </ul>
        <div class="cuenta-acciones">
          <button type="button" class="btn btn-primary cuenta-cta" data-cuenta="ir" data-ir="alta">Crear cuenta</button>
          <button type="button" class="btn" data-cuenta="ir" data-ir="entrar">Ya tengo cuenta</button>
          <button type="button" class="btn btn-ghost" data-cuenta="sin-cuenta">Seguir sin cuenta</button>
        </div>
        <p class="cuenta-conoce-titulo">¿Primera vez? Conoce Liquid</p>
        <div class="cuenta-conoce">${CONOCE.map(([i, t, ancla]) => `<a class="cuenta-conoce-card" href="${REVIEW_URL}#${ancla}" target="_blank" rel="noopener">${ico(i)}${t}</a>`).join('')}</div>
        <p class="cuenta-pie">${ico('lock')} Opcional y sin anuncios. Sin cuenta, todo se guarda solo en este navegador. Tus datos no se venden ni se comparten.</p>`,

      alta: (d) => {
        const paso = d.pasoAlta || 1;
        if (paso === 1) return `
          ${cabecera('Crear cuenta', 'bienvenida', pasos(1, 3))}
          <form class="cuenta-form" data-form="alta-correo" novalidate>
            <label class="cuenta-campo"><span>Tu correo</span>
              <input name="correo" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" required value="${esc(d.correo || '')}" autofocus>
            </label>
            <p class="cuenta-sugerencia" hidden></p>
            ${avisoSpam('Al final te enviaremos un código de 6 dígitos para confirmar tu correo')}
            ${errorBox}
            ${botonPrincipal('Siguiente', 'enviar')}
          </form>`;
        if (paso === 2) return `
          ${cabecera('Crea tu contraseña', 'alta-1', pasos(2, 3))}
          <form class="cuenta-form" data-form="alta-clave" novalidate>
            <input type="email" name="usuario" autocomplete="username" value="${esc(d.correo || '')}" hidden>
            <label class="cuenta-campo"><span>Contraseña</span>
              <span class="cuenta-clave"><input name="clave" type="password" autocomplete="new-password" required minlength="10" autofocus>
              <button type="button" class="icon-btn" data-cuenta="ver-clave" aria-label="Mostrar contraseña">${ico('eye')}</button></span>
            </label>
            <div class="cuenta-medidor" aria-hidden="true"><span></span></div>
            <p class="cuenta-medidor-texto" aria-live="polite">Mínimo 10 caracteres, con letras y números</p>
            <ul class="cuenta-reglas">
              <li data-regla="largo">10 caracteres o más</li><li data-regla="letras">Letras</li><li data-regla="numeros">Números</li><li data-regla="extra">Mayúsculas o símbolos (extra)</li>
            </ul>
            ${errorBox}
            ${botonPrincipal('Siguiente', 'enviar')}
          </form>`;
        return `
          ${cabecera('¿Cómo te llamamos?', 'alta-2', pasos(3, 3))}
          <form class="cuenta-form" data-form="alta-final" novalidate>
            <label class="cuenta-campo"><span>Nombre (opcional)</span>
              <input name="nombre" type="text" autocomplete="given-name" maxlength="40" value="${esc(d.nombre || '')}" placeholder="Para saludarte en Inicio">
            </label>
            <p class="cuenta-label">Elige tu avatar</p>
            <div class="cuenta-avatares" role="radiogroup" aria-label="Avatar">
              ${['inicial:#ff7ad9', ...OPCIONES_AVATAR]
                .map((a, i) => `<button type="button" role="radio" aria-checked="${a === (d.avatar || 'inicial:#ff7ad9')}" class="cuenta-avatar-op" data-cuenta="avatar" data-avatar="${esc(a)}" aria-label="${i ? `Foto ${i}` : 'Tu inicial'}">${avatarHtml(a, d.nombre || d.correo)}</button>`).join('')}
            </div>
            <label class="cuenta-check"><input type="checkbox" name="privacidad" required> <span>Acepto que mis favoritas, playlists, escucha y ajustes se guarden en el almacenamiento privado de Liquid Bullet. Puedo descargarlos o borrarlos cuando quiera.</span></label>
            <div class="cuenta-robot" aria-live="polite"></div>
            ${avisoSpam()}
            ${errorBox}
            ${botonPrincipal('Crear y enviar código', 'enviar')}
          </form>`;
      },
      'alta-1': () => '',
      'alta-2': () => '',
      'alta-3': () => '',

      codigo: (d) => `
        ${cabecera('Revisa tu correo', d.motivo === 'recuperar' ? 'recuperar' : 'alta-3')}
        <p class="cuenta-texto">Te enviamos un código de 6 dígitos a <b>${esc(ocultarCorreo(d.correo))}</b>.</p>
        <p class="cuenta-aviso">${ico('mail')} <b>Puede tardar un minuto y llegar a Spam o Promociones</b>: búscalo como <i>Liquid Bullet</i> (${CORREO_REMITENTE}).</p>
        <form class="cuenta-form" data-form="codigo" novalidate>
          <div class="cuenta-gotas" role="group" aria-label="Código de 6 dígitos">
            ${Array.from({ length: 6 }, (_, i) => `<input class="cuenta-gota" inputmode="numeric" pattern="[0-9]*" maxlength="1" aria-label="Dígito ${i + 1}" ${i === 0 ? 'autocomplete="one-time-code" autofocus' : 'autocomplete="off"'}>`).join('')}
          </div>
          <div class="cuenta-reloj" aria-hidden="true"><span></span></div>
          <p class="cuenta-caduca">El código caduca en <b class="cuenta-caduca-t">10:00</b></p>
          <p class="cuenta-aviso is-fuerte" hidden>¿No lo ves? Revisa <b>Spam</b> y márcalo como <i>No es spam</i>: los próximos llegarán bien.</p>
          ${errorBox}
          <div class="cuenta-fila">
            <a class="btn" href="${esc(abrirCorreoUrl(d.correo))}" target="_blank" rel="noopener">Abrir correo</a>
            <button type="button" class="btn btn-ghost" data-cuenta="reenviar" disabled>Reenviar (<span class="cuenta-reenviar-t">60</span> s)</button>
          </div>
          <button type="button" class="btn btn-ghost cuenta-link" data-cuenta="ir" data-ir="${d.motivo === 'recuperar' ? 'recuperar' : 'alta-1'}">Cambiar correo</button>
        </form>`,

      entrar: (d) => `
        ${cabecera('Entrar', 'bienvenida')}
        <div class="cuenta-ojos" aria-hidden="true"><span class="ojo"><i></i></span><span class="ojo"><i></i></span></div>
        <form class="cuenta-form" data-form="entrar" novalidate>
          <label class="cuenta-campo"><span>Correo</span>
            <input name="correo" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required value="${esc(d.correo || storage.get(K.ultimoCorreo, '') || '')}" autofocus>
          </label>
          <label class="cuenta-campo"><span>Contraseña</span>
            <span class="cuenta-clave"><input name="clave" type="password" autocomplete="current-password" required>
            <button type="button" class="icon-btn" data-cuenta="ver-clave" aria-label="Mostrar contraseña">${ico('eye')}</button></span>
          </label>
          <div class="cuenta-robot"></div>
          ${errorBox}
          ${botonPrincipal('Entrar', 'enviar')}
          <p class="cuenta-aviso">${ico('mail')} ¿Creaste la cuenta y nunca te llegó el código, o vas a recuperar la contraseña? Los correos salen de <b>${CORREO_REMITENTE}</b> y <b>pueden llegar a Spam o Promociones</b>: revisa ahí antes de pedir otro.</p>
          <div class="cuenta-fila">
            <button type="button" class="btn btn-ghost cuenta-link" data-cuenta="ir" data-ir="recuperar">¿Olvidaste tu contraseña?</button>
            <button type="button" class="btn btn-ghost cuenta-link" data-cuenta="ir" data-ir="alta-1">Crear cuenta</button>
          </div>
        </form>`,

      recuperar: (d) => `
        ${cabecera('Recuperar contraseña', 'entrar', pasos(1, 3))}
        <p class="cuenta-texto">Escribe tu correo y te enviamos un código para elegir una contraseña nueva.</p>
        <form class="cuenta-form" data-form="recuperar" novalidate>
          <label class="cuenta-campo"><span>Tu correo</span>
            <input name="correo" type="email" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required value="${esc(d.correo || storage.get(K.ultimoCorreo, '') || '')}" autofocus>
          </label>
          <div class="cuenta-robot"></div>
          ${avisoSpam()}
          ${errorBox}
          ${botonPrincipal('Enviar código', 'enviar')}
        </form>`,

      nueva: () => `
        ${cabecera('Nueva contraseña', 'recuperar', pasos(3, 3))}
        <form class="cuenta-form" data-form="nueva" novalidate>
          <input type="email" name="usuario" autocomplete="username" value="${esc(ui.datos.correo || '')}" hidden>
          <label class="cuenta-campo"><span>Contraseña nueva</span>
            <span class="cuenta-clave"><input name="clave" type="password" autocomplete="new-password" required minlength="10" autofocus>
            <button type="button" class="icon-btn" data-cuenta="ver-clave" aria-label="Mostrar contraseña">${ico('eye')}</button></span>
          </label>
          <div class="cuenta-medidor" aria-hidden="true"><span></span></div>
          <p class="cuenta-medidor-texto" aria-live="polite">Mínimo 10 caracteres, con letras y números</p>
          ${errorBox}
          ${botonPrincipal('Guardar y entrar', 'enviar')}
        </form>`,

      unir: (d) => `
        ${cabecera('Une tus datos', '')}
        <p class="cuenta-texto">En este dispositivo tienes:</p>
        <ul class="cuenta-resumen">
          <li>${ico('heart')} <b>${d.resumen?.favoritas || 0}</b> favoritas</li>
          <li>${ico('note')} <b>${d.resumen?.playlists || 0}</b> playlists propias</li>
          <li>${ico('chart')} <b>${d.resumen?.dias || 0}</b> días de escucha</li>
        </ul>
        <div class="cuenta-acciones">
          <button type="button" class="btn btn-primary cuenta-cta" data-cuenta="unir">Unir con mi cuenta (recomendado)</button>
          <button type="button" class="btn btn-ghost" data-cuenta="reemplazar">Usar solo lo de mi cuenta</button>
        </div>
        <div class="cuenta-progreso" hidden><span></span></div>
        <p class="cuenta-progreso-texto" aria-live="polite"></p>`,

      miembro: (d) => {
        const pick = d.cancion ? getTrack(d.cancion) : null;
        return `
        ${cabecera('¡Listo!', '')}
        <div class="cuenta-miembro">
          ${avatarHtml(sesion?.perfil?.avatar, sesion?.perfil?.nombre, 'is-grande')}
          <h3 class="cuenta-titulo">Hola${sesion?.perfil?.nombre ? `, ${esc(sesion.perfil.nombre)}` : ''}</h3>
          <p class="cuenta-texto">Tu música ya está a salvo y te sigue a cualquier dispositivo.</p>
        </div>
        ${dnaHtml()}
        ${pick ? `<button type="button" class="cuenta-celebra" data-cuenta="celebrar" data-id="${esc(pick.id)}">
          <img src="${esc(pick.thumb)}" alt="" width="56" height="56"><span><small>Celébralo con esta</small><b>${esc(splitTitle(pick.title).main)}</b><small>${esc(pick.knownArtist || pick.artist)} · y su radio</small></span><svg class="icon" aria-hidden="true"><use href="#i-play"></use></svg></button>` : ''}
        <div class="cuenta-acciones"><button type="button" class="btn btn-primary cuenta-cta" data-cuenta="cerrar">Ir a Inicio</button></div>`;
      },

      cuenta: () => {
        const p = sesion?.perfil || {};
        const desde = p.creado ? new Date(p.creado * 1000).toLocaleDateString('es', { month: 'long', year: 'numeric' }) : '';
        let minutos = 0;
        Object.values(listen.log).forEach((dia) => Object.values(dia.s || {}).forEach((s) => { minutos += s / 60; }));
        return `
        ${cabecera('Tu cuenta', '')}
        <div class="cuenta-perfil">
          ${avatarHtml(p.avatar, p.nombre, 'is-grande')}
          <div><h3 class="cuenta-titulo">${esc(p.nombre || 'Sin nombre')}</h3><p class="cuenta-correo">${esc(p.correo || '')} <span class="cuenta-ok">${ico('check')}</span></p></div>
        </div>
        <div class="cuenta-tarjeta">
          <div><b>${esc(desde)}</b><span>miembro desde</span></div>
          <div><b>${Math.round(minutos).toLocaleString('es')}</b><span>minutos</span></div>
          <div><b>${state.favorites.size}</b><span>favoritas</span></div>
        </div>
        <section class="cuenta-bloque">
          <h4>Sincronización</h4>
          <p class="cuenta-sync" data-estado="${sync.estado}">${textoSync()}</p>
          <button type="button" class="btn" data-cuenta="sincronizar">Sincronizar ahora</button>
        </section>
        <section class="cuenta-bloque">
          <h4>Perfil</h4>
          <form class="cuenta-form" data-form="perfil" novalidate>
            <label class="cuenta-campo"><span>Nombre</span><input name="nombre" type="text" maxlength="40" value="${esc(p.nombre || '')}"></label>
            <div class="cuenta-avatares is-mini" role="radiogroup" aria-label="Avatar">
              ${['inicial:#ff7ad9', ...OPCIONES_AVATAR]
                .map((a, i) => `<button type="button" role="radio" aria-checked="${a === (OPCIONES_AVATAR.includes(p.avatar) ? p.avatar : 'inicial:#ff7ad9')}" class="cuenta-avatar-op" data-cuenta="avatar" data-avatar="${esc(a)}" aria-label="${i ? `Foto ${i}` : 'Tu inicial'}">${avatarHtml(a, p.nombre)}</button>`).join('')}
            </div>
            ${errorBox}
            <button type="submit" class="btn" data-cuenta="enviar">Guardar perfil</button>
          </form>
        </section>
        <section class="cuenta-bloque">
          <h4>Dispositivos conectados</h4>
          <ul class="cuenta-dispositivos"><li class="cuenta-texto">Cargando…</li></ul>
          <button type="button" class="btn btn-ghost" data-cuenta="salir-todo">Cerrar sesión en los demás</button>
        </section>
        <section class="cuenta-bloque">
          <label class="cuenta-check"><input type="checkbox" class="cuenta-borrar-local"> <span>Borrar también lo guardado en este dispositivo (útil en un teléfono prestado)</span></label>
          <button type="button" class="btn cuenta-salir" data-cuenta="salir">Cerrar sesión</button>
        </section>
        <p class="cuenta-pie">Cambiar correo, huella / Face ID y borrar la cuenta llegan en las próximas versiones.</p>`;
      }
    };

    function dnaHtml() {
      try {
        const p = tasteProfile();
        const genres = [...p.genres.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
        if (!genres.length) return '';
        const total = genres.reduce((s, [, v]) => s + v, 0) || 1;
        return `<div class="cuenta-dna"><p class="cuenta-label">Tu ADN musical · viaja contigo</p>${genres.map(([g, v]) =>
          `<div class="dna-row"><span class="dna-name">${esc(g)}</span><span class="dna-bar" style="--w:${Math.max(6, Math.round((v / total) * 100))}%"></span><span class="dna-pct">${Math.round((v / total) * 100)}%</span></div>`).join('')}</div>`;
      } catch {
        return '';
      }
    }

    function textoSync() {
      if (!navigator.onLine) return 'Sin conexión: se guarda al volver.';
      if (sync.estado === 'sincronizando') return 'Sincronizando…';
      if (sync.estado === 'error') return `No se pudo sincronizar${sync.error ? `: ${sync.error}` : ''}. Se reintentará solo.`;
      if (!sync.ultima) return 'Aún sin sincronizar.';
      const seg = Math.max(0, Math.round(Date.now() / 1000 - sync.ultima));
      return `Al día · hace ${seg < 60 ? 'unos segundos' : seg < 3600 ? `${Math.round(seg / 60)} min` : `${Math.round(seg / 3600)} h`}`;
    }

    /* ---------- Comportamiento de cada pantalla ---------- */
    function errorEn(form, e) {
      const box = form?.querySelector('.cuenta-error') || ui.body.querySelector('.cuenta-error');
      if (!box) { showToast(mensaje(e)); return; }
      box.textContent = typeof e === 'string' ? e : mensaje(e);
      box.hidden = false;
    }

    function ocupado(form, on, texto) {
      const btn = form?.querySelector('.cuenta-cta, [type="submit"]');
      if (!btn) return;
      btn.disabled = on;
      btn.classList.toggle('is-ocupado', on);
      const t = btn.querySelector('.cuenta-cta-text');
      if (t) {
        if (on) { btn.dataset.texto = t.textContent; t.textContent = texto || 'Comprobando…'; }
        else if (btn.dataset.texto) t.textContent = btn.dataset.texto;
      }
    }

    function medidor(input) {
      const f = fuerza(input.value);
      const barra = ui.body.querySelector('.cuenta-medidor span');
      if (barra) {
        barra.style.width = `${Math.max(input.value ? 8 : 0, f.puntos * 25)}%`;
        barra.dataset.puntos = String(f.puntos);
      }
      const texto = ui.body.querySelector('.cuenta-medidor-texto');
      if (texto) texto.textContent = f.texto;
      ui.body.querySelectorAll('[data-regla]').forEach((li) => li.classList.toggle('is-ok', f.reglas[li.dataset.regla]));
      return f;
    }

    const PREPARAR = {
      'alta-1': () => ir('alta', { pasoAlta: 1 }),
      'alta-2': () => ir('alta', { pasoAlta: 2 }),
      'alta-3': () => ir('alta', { pasoAlta: 3 }),
      alta: (d) => {
        const correo = ui.body.querySelector('input[name="correo"]');
        if (correo) {
          const sug = ui.body.querySelector('.cuenta-sugerencia');
          const TIPOS = { 'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gamil.com': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'yaho.com': 'yahoo.com', 'icloud.co': 'icloud.com' };
          correo.addEventListener('input', () => {
            const dom = correo.value.split('@')[1]?.toLowerCase();
            const ok = dom && TIPOS[dom];
            sug.hidden = !ok;
            if (ok) sug.innerHTML = `¿Quisiste decir <button type="button" class="cuenta-link-mini" data-cuenta="sugerencia" data-valor="${esc(correo.value.split('@')[0])}@${ok}">${esc(ok)}</button>?`;
          });
        }
        const clave = ui.body.querySelector('input[name="clave"]');
        if (clave) clave.addEventListener('input', () => medidor(clave));
        if (d.pasoAlta === 3 && !d.avatar) ui.datos.avatar = 'inicial:#ff7ad9';
      },
      nueva: () => {
        const clave = ui.body.querySelector('input[name="clave"]');
        clave?.addEventListener('input', () => medidor(clave));
      },
      entrar: () => {
        // Los ojos de la escena se cierran mientras escribes la contraseña
        const ojos = ui.body.querySelector('.cuenta-ojos');
        const clave = ui.body.querySelector('input[name="clave"]');
        clave?.addEventListener('focus', () => ojos?.classList.toggle('is-cerrados', clave.type === 'password'));
        clave?.addEventListener('blur', () => ojos?.classList.remove('is-cerrados'));
        ui.body.addEventListener('pointermove', (e) => {
          const r = ojos?.getBoundingClientRect();
          if (!r || !settings.motion) return;
          const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 160));
          const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 160));
          ojos.style.setProperty('--ox', `${dx * 4}px`);
          ojos.style.setProperty('--oy', `${dy * 3}px`);
        });
      },
      codigo: (d) => {
        const gotas = [...ui.body.querySelectorAll('.cuenta-gota')];
        const form = ui.body.querySelector('form');
        const completo = () => gotas.map((g) => g.value).join('');
        const comprobar = () => { if (/^\d{6}$/.test(completo())) enviarCodigo(form, completo()); };
        gotas.forEach((g, i) => {
          g.addEventListener('input', () => {
            const v = g.value.replace(/\D/g, '');
            if (v.length > 1) {
              // Pegado o autocompletado del código entero
              v.slice(0, 6).split('').forEach((c, j) => { if (gotas[i + j]) gotas[i + j].value = c; });
              gotas[Math.min(5, i + v.length - 1)].focus();
            } else {
              g.value = v;
              if (v && gotas[i + 1]) gotas[i + 1].focus();
            }
            g.classList.toggle('is-llena', Boolean(g.value));
            comprobar();
          });
          g.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !g.value && gotas[i - 1]) { gotas[i - 1].focus(); gotas[i - 1].value = ''; gotas[i - 1].classList.remove('is-llena'); }
          });
        });
        // Cuenta atrás de validez (el «reloj derretido») y del reenvío
        const fin = d.caducaEn || Date.now() + 600000;
        const reenvioDesde = d.enviadoEn || Date.now();
        const t = ui.body.querySelector('.cuenta-caduca-t');
        const reloj = ui.body.querySelector('.cuenta-reloj span');
        const reBtn = ui.body.querySelector('[data-cuenta="reenviar"]');
        const reT = ui.body.querySelector('.cuenta-reenviar-t');
        const fuerte = ui.body.querySelector('.cuenta-aviso.is-fuerte');
        const tick = () => {
          const quedan = Math.max(0, Math.round((fin - Date.now()) / 1000));
          if (t) t.textContent = formatTime(quedan);
          if (reloj) reloj.style.setProperty('--p', String(quedan / 600));
          const espera = Math.max(0, 60 - Math.round((Date.now() - reenvioDesde) / 1000));
          if (reBtn) { reBtn.disabled = espera > 0; reBtn.firstChild.textContent = espera > 0 ? 'Reenviar (' : 'Reenviar código'; }
          if (reT) { reT.textContent = String(espera); reT.parentElement.lastChild.textContent = espera > 0 ? ' s)' : ''; reT.hidden = espera <= 0; }
          if (fuerte && Date.now() - reenvioDesde > 30000 && !completo()) fuerte.hidden = false;
        };
        tick();
        ui.temporizadores.push(setInterval(tick, 1000));
      },
      unir: () => {},
      cuenta: () => {
        cargarDispositivos();
        ui.datos.avatarNuevo = null;
      }
    };

    async function cargarDispositivos() {
      const lista = ui.body.querySelector('.cuenta-dispositivos');
      if (!lista) return;
      try {
        const d = await api('/yo/dispositivos', { metodo: 'GET', auth: true });
        lista.innerHTML = d.dispositivos.map((x) => `<li class="cuenta-disp"><span>${ico(/iPhone|Android|iPad/.test(x.nombre) ? 'phone' : 'laptop')} <b>${esc(x.nombre)}</b> · ${x.actual ? 'este dispositivo' : `hace ${tiempoDesde(x.vista)}`}</span>${x.actual ? '' : `<button type="button" class="btn btn-ghost" data-cuenta="cerrar-disp" data-id="${esc(x.id)}">Cerrar</button>`}</li>`).join('');
      } catch (e) {
        lista.innerHTML = `<li class="cuenta-texto">${esc(mensaje(e))}</li>`;
      }
    }

    function tiempoDesde(seg) {
      const s = Math.max(0, Date.now() / 1000 - seg);
      if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
      if (s < 86400) return `${Math.round(s / 3600)} h`;
      return `${Math.round(s / 86400)} días`;
    }

    async function enviarCodigo(form, codigo) {
      if (form.dataset.enviando) return;
      form.dataset.enviando = '1';
      const caja = ui.body.querySelector('.cuenta-gotas');
      try {
        if (ui.datos.motivo === 'recuperar') {
          ui.datos.codigo = codigo;
          caja?.classList.add('is-ok');
          setTimeout(() => ir('nueva'), settings.motion ? 450 : 0);
          return;
        }
        const d = await api('/alta/confirmar', { cuerpo: { correo: ui.datos.correo, codigo } });
        caja?.classList.add('is-ok');
        haptic(15);
        await iniciado(d);
      } catch (e) {
        caja?.classList.remove('is-ok');
        caja?.classList.add('is-error');
        setTimeout(() => caja?.classList.remove('is-error'), 500);
        errorEn(form, e);
        if (e.codigo !== 'codigo_caducado') ui.body.querySelectorAll('.cuenta-gota').forEach((g) => { g.value = ''; g.classList.remove('is-llena'); });
        ui.body.querySelector('.cuenta-gota')?.focus();
      } finally {
        delete form.dataset.enviando;
      }
    }

    // Sesión nueva: se guarda, se decide si unir datos y se sincroniza
    async function iniciado(d) {
      sesion = { ...d.sesion, perfil: d.perfil, ultimaSync: 0 };
      storage.set(K.ultimoCorreo, d.perfil?.correo || ui.datos.correo || '');
      guardarSesion();
      storage.set(K.ofrecida, true);
      const resumen = resumenLocal();
      if (resumen.favoritas || resumen.playlists || resumen.dias) ir('unir', { resumen });
      else {
        await sincronizar({ silencioso: true });
        bienvenidaMiembro();
      }
    }

    function bienvenidaMiembro() {
      let cancion = null;
      try { cancion = quickPicks()[0]?.id || null; } catch { /* sin biblioteca */ }
      ir('miembro', { cancion });
      renderList();
    }

    function resumenLocal() {
      return { favoritas: state.favorites.size, playlists: library.local.length, dias: Object.keys(listen.log).length };
    }

    async function alEnviar(form) {
      const tipo = form.dataset.form;
      const v = (n) => form.querySelector(`[name="${n}"]`)?.value ?? '';
      const caja = form.querySelector('.cuenta-error');
      if (caja) caja.hidden = true;
      try {
        if (tipo === 'alta-correo') {
          const correo = v('correo').trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) throw new ErrorCuenta('correo_invalido');
          ir('alta', { correo, pasoAlta: 2 });
          return;
        }
        if (tipo === 'alta-clave' || tipo === 'nueva') {
          const f = fuerza(v('clave'));
          if (!f.valida) throw new ErrorCuenta('contrasena_debil');
          ocupado(form, true, 'Comprobando…');
          if (await filtrada(v('clave'))) throw new ErrorCuenta('contrasena_filtrada');
          const clave = await claveCliente(ui.datos.correo, v('clave'));
          if (tipo === 'alta-clave') { ui.datos.clave = clave; ir('alta', { pasoAlta: 3 }); return; }
          const d = await api('/recuperar/nueva', { cuerpo: { correo: ui.datos.correo, codigo: ui.datos.codigo, clave } });
          showToast('Contraseña cambiada. Cerramos tus otras sesiones.');
          await iniciado(d);
          return;
        }
        if (tipo === 'alta-final') {
          if (!form.querySelector('[name="privacidad"]').checked) throw 'Acepta la privacidad para crear la cuenta.';
          ocupado(form, true, 'Enviando código…');
          ui.datos.nombre = v('nombre').trim();
          const turnstile = await tokenRobot();
          const d = await api('/alta', { cuerpo: { correo: ui.datos.correo, clave: ui.datos.clave, nombre: ui.datos.nombre, avatar: ui.datos.avatar, turnstile } });
          gastarRobot();
          ir('codigo', { motivo: 'alta', caducaEn: Date.now() + (d.caduca || 600) * 1000, enviadoEn: Date.now() });
          return;
        }
        if (tipo === 'entrar') {
          const correo = v('correo').trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) throw new ErrorCuenta('correo_invalido');
          if (!v('clave')) throw new ErrorCuenta('credenciales');
          ocupado(form, true, 'Entrando…');
          const clave = await claveCliente(correo, v('clave'));
          const turnstile = await tokenRobot();
          ui.datos.correo = correo;
          const d = await api('/entrar', { cuerpo: { correo, clave, turnstile } });
          gastarRobot();
          if (d.borradoCancelado) showToast('Cancelamos el borrado programado de tu cuenta.');
          await iniciado(d);
          return;
        }
        if (tipo === 'recuperar') {
          const correo = v('correo').trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) throw new ErrorCuenta('correo_invalido');
          ocupado(form, true, 'Enviando código…');
          const turnstile = await tokenRobot();
          const d = await api('/recuperar', { cuerpo: { correo, turnstile } });
          gastarRobot();
          ir('codigo', { correo, motivo: 'recuperar', caducaEn: Date.now() + (d.caduca || 600) * 1000, enviadoEn: Date.now() });
          return;
        }
        if (tipo === 'perfil') {
          ocupado(form, true);
          const cuerpo = { nombre: v('nombre').trim() };
          if (ui.datos.avatarNuevo) cuerpo.avatar = ui.datos.avatarNuevo;
          const d = await api('/yo', { metodo: 'PATCH', cuerpo, auth: true });
          sesion.perfil = d.perfil;
          guardarSesion();
          showToast('Perfil guardado.');
          ir('cuenta');
          renderList();
        }
      } catch (e) {
        if (['alta-final', 'entrar', 'recuperar'].includes(tipo)) gastarRobot();
        errorEn(form, e);
      } finally {
        ocupado(form, false);
      }
    }

    async function alClic(target) {
      const accion = target.dataset.cuenta;
      switch (accion) {
        case 'ir': ir(target.dataset.ir); break;
        case 'cerrar': cerrar(); break;
        case 'sin-cuenta':
          storage.set(K.ofrecida, true);
          cerrar();
          showToast('Sin cuenta. Puedes entrar cuando quieras desde Ajustes.');
          break;
        case 'ver-clave': {
          const input = target.parentElement.querySelector('input');
          input.type = input.type === 'password' ? 'text' : 'password';
          target.innerHTML = ico(input.type === 'password' ? 'eye' : 'eye-off');
          target.setAttribute('aria-label', input.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
          ui.body.querySelector('.cuenta-ojos')?.classList.toggle('is-cerrados', input.type === 'password' && document.activeElement === input);
          break;
        }
        case 'sugerencia': {
          const input = ui.body.querySelector('input[name="correo"]');
          input.value = target.dataset.valor;
          ui.body.querySelector('.cuenta-sugerencia').hidden = true;
          break;
        }
        case 'avatar':
          target.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]').forEach((b) => b.setAttribute('aria-checked', String(b === target)));
          if (ui.pantalla === 'cuenta') ui.datos.avatarNuevo = target.dataset.avatar;
          else ui.datos.avatar = target.dataset.avatar;
          break;
        case 'reenviar': {
          try {
            target.disabled = true;
            const d = await api('/codigo/reenviar', { cuerpo: { correo: ui.datos.correo, motivo: ui.datos.motivo || 'alta' } });
            showToast('Te enviamos otro código (revisa también Spam).');
            ir('codigo', { caducaEn: Date.now() + (d.caduca || 600) * 1000, enviadoEn: Date.now() });
          } catch (e) {
            errorEn(ui.body.querySelector('form'), e);
          }
          break;
        }
        case 'unir':
        case 'reemplazar': {
          ui.body.querySelectorAll('.cuenta-acciones button').forEach((b) => { b.disabled = true; });
          const barra = ui.body.querySelector('.cuenta-progreso');
          const texto = ui.body.querySelector('.cuenta-progreso-texto');
          barra.hidden = false;
          texto.textContent = accion === 'unir' ? 'Subiendo tus playlists y favoritas…' : 'Trayendo lo de tu cuenta…';
          const ok = await sincronizar({ reemplazar: accion === 'reemplazar', silencioso: true });
          texto.textContent = ok ? 'Todo guardado' : 'No se pudo sincronizar ahora; se reintentará solo.';
          setTimeout(bienvenidaMiembro, 600);
          break;
        }
        case 'celebrar': {
          const track = getTrack(target.dataset.id);
          cerrar();
          if (track) startRadio(artistKeyOf(track), track);
          break;
        }
        case 'sincronizar':
          await sincronizar();
          if (ui.pantalla === 'cuenta') ir('cuenta');
          break;
        case 'cerrar-disp':
          try {
            await api(`/yo/dispositivos/${target.dataset.id}`, { metodo: 'DELETE', auth: true });
            target.closest('li')?.remove();
            showToast('Sesión cerrada en ese dispositivo.');
          } catch (e) { showToast(mensaje(e)); }
          break;
        case 'salir-todo':
          try {
            await api('/salir/todo', { auth: true });
            showToast('Cerramos tu sesión en los demás dispositivos.');
            cargarDispositivos();
          } catch (e) { showToast(mensaje(e)); }
          break;
        case 'salir': {
          const borrar = ui.body.querySelector('.cuenta-borrar-local')?.checked;
          await sincronizar({ silencioso: true }).catch(() => {});
          try { await api('/salir', { auth: true }); } catch { /* aunque falle, se cierra aquí */ }
          cerrarLocal('salir');
          cerrar();
          if (borrar) borrarLocal();
          else showToast('Cerraste sesión. Tus datos siguen en este dispositivo.');
          break;
        }
        default: break;
      }
    }

    function cerrarLocal(motivo) {
      sesion = null;
      sync.estado = 'apagado';
      guardarSesion();
      if (motivo === 'caducada') showToast(ERRORES.sesion_caducada);
    }

    function borrarLocal() {
      [KEYS.favorites, KEYS.playlists, KEYS.recent, KEYS.plays, KEYS.listen, KEYS.follows, KEYS.pins, KEYS.hidden,
        KEYS.disliked, KEYS.heard, KEYS.skips, KEYS.contexts, KEYS.searches, KEYS.trash, KEYS.resume, KEYS.resumeQueue, K.meta, K.ultimoCorreo]
        .forEach((k) => { try { localStorage.removeItem(k); } catch { /* sin acceso */ } });
      location.reload();
    }

    /* =========================================================
       Sincronización: archivo mínimo por persona en R2
       ========================================================= */
    const BASE_MIN = 26297280; // minutos desde 1970 hasta 2020-01-01: las fechas caben en 7 cifras
    const minAhora = () => Math.floor(Date.now() / 60000) - BASE_MIN;
    const LAPIDA_MIN = 90 * 24 * 60; // las marcas de borrado se guardan 90 días
    const FUENTES = { pepper: 'p', salt: 's', brush3: 'b', db4: '4', db5: '5' };
    let cortosPorId = null;

    function mapasCortos() {
      if (cortosPorId && cortosPorId.n === state.tracks.length) return cortosPorId;
      const corto = new Map();
      const largo = new Map();
      state.tracks.forEach((t) => {
        const c = idCorto(t.id);
        corto.set(t.id, c);
        largo.set(c, t.id);
      });
      cortosPorId = { n: state.tracks.length, corto, largo };
      return cortosPorId;
    }
    // «brush3:101-200-148-clairo-4ever-mp3-c0bf5f» (59 caracteres de media) → «bc0bf5f» (7)
    function idCorto(id) {
      const m = /^(pepper|salt|brush3|db4|db5):.*-([0-9a-f]{6})$/.exec(String(id));
      return m ? FUENTES[m[1]] + m[2] : `~${id}`;
    }
    const aCorto = (id) => mapasCortos().corto.get(id) || idCorto(id);
    const aLargo = (c) => mapasCortos().largo.get(c) || (String(c).startsWith('~') ? String(c).slice(1) : null);

    function metaLocal() {
      const m = storage.get(K.meta, null) || {};
      return { sets: m.sets || {}, pl: m.pl || {}, otrosPlays: m.otrosPlays || {}, otrosLog: m.otrosLog || {}, etag: m.etag || {}, escucha: m.escucha !== false };
    }
    const guardarMeta = (m) => storage.set(K.meta, m);

    function idDispositivo() {
      let d = storage.get(K.dispositivo, '');
      if (!d) { d = Math.random().toString(36).slice(2, 8); storage.set(K.dispositivo, d); }
      return d;
    }

    // Conjuntos (favoritas, seguidos…): {clave: fechaMin} presente / {clave: -fechaMin} quitado
    function difConjunto(meta, actuales, conocida) {
      const t = minAhora();
      const presentes = new Set(actuales);
      presentes.forEach((k) => { if (meta[k] === undefined || meta[k] < 0) meta[k] = t; });
      Object.keys(meta).forEach((k) => {
        if (meta[k] >= 0 && !presentes.has(k) && conocida(k)) meta[k] = -t;
      });
      return meta;
    }

    function mezclarConjunto(local, remoto) {
      const out = {};
      const t = minAhora();
      new Set([...Object.keys(local), ...Object.keys(remoto || {})]).forEach((k) => {
        const a = local[k];
        const b = remoto?.[k];
        let v;
        if (a === undefined) v = b;
        else if (b === undefined) v = a;
        else if (Math.abs(a) !== Math.abs(b)) v = Math.abs(a) > Math.abs(b) ? a : b;
        else v = a >= 0 || b >= 0 ? Math.abs(a) : a; // empate: gana «está»
        if (v < 0 && t + v > LAPIDA_MIN) return; // marca de borrado vieja: fuera
        out[k] = v;
      });
      return out;
    }
    const presentesDe = (m) => Object.keys(m).filter((k) => m[k] >= 0);

    const CONJUNTOS = {
      f: { leer: () => [...state.favorites].map(aCorto), conocida: (k) => Boolean(aLargo(k)), aplicar: (claves) => {
        state.favorites = new Set(claves.map(aLargo).filter(Boolean));
        storage.set(KEYS.favorites, [...state.favorites]);
      } },
      dl: { leer: () => [...disliked].map(aCorto), conocida: (k) => Boolean(aLargo(k)), aplicar: (claves) => {
        disliked.clear();
        claves.map(aLargo).filter(Boolean).forEach((id) => disliked.add(id));
        storage.set(KEYS.disliked, [...disliked]);
      } },
      fo: { leer: () => library.follows.slice(), conocida: () => true, aplicar: (c) => { library.follows = c; storage.set(KEYS.follows, c); } },
      pi: { leer: () => library.pins.slice(), conocida: () => true, aplicar: (c) => { library.pins = c; storage.set(KEYS.pins, c); } },
      hi: { leer: () => library.hidden.slice(), conocida: () => true, aplicar: (c) => { library.hidden = c; storage.set(KEYS.hidden, c); } }
    };

    // La portada propia se suma solo si hay: las huellas de las playlists sin portada no cambian
    const huellaPl = (p) => `${p.name}|${p.emoji || ''}|${p.color || ''}|${p.trackIds.join(',')}${p.portada ? `|f:${p.portada}` : ''}`;

    function difPlaylists(meta) {
      const t = minAhora();
      const vivas = new Set();
      library.local.forEach((p) => {
        vivas.add(p.id);
        const h = String(hashString(huellaPl(p)));
        if (!meta[p.id] || meta[p.id].h !== h || meta[p.id].x) meta[p.id] = { h, t };
      });
      Object.keys(meta).forEach((id) => { if (!vivas.has(id) && !meta[id].x) meta[id] = { x: t }; });
      return meta;
    }

    function plACompacta(p, meta) {
      return { i: p.id, n: p.name, e: p.emoji || '', c: p.color || '', f: portadaValida(p.portada), k: p.trackIds.map(aCorto), t: meta[p.id]?.t || 0, cr: p.createdAt || 0 };
    }

    function mezclarPlaylists(metaPl, remotas) {
      const t = minAhora();
      const porId = new Map();
      library.local.forEach((p) => porId.set(p.id, { ...plACompacta(p, metaPl), fuente: 'local' }));
      Object.entries(metaPl).forEach(([id, m]) => { if (m.x) porId.set(id, { i: id, x: m.x, fuente: 'local' }); });
      (remotas || []).forEach((r) => {
        const actual = porId.get(r.i);
        const tR = r.x || r.t || 0;
        const tL = actual ? (actual.x || actual.t || 0) : -1;
        if (!actual || tR > tL) porId.set(r.i, { ...r, fuente: 'remota' });
      });
      return [...porId.values()].filter((p) => !(p.x && t - p.x > LAPIDA_MIN)).map(({ fuente, ...p }) => p);
    }

    function aplicarPlaylists(lista, metaPl) {
      const locales = new Map(library.local.map((p) => [p.id, p]));
      library.local = lista.filter((p) => !p.x).map((p) => {
        const previa = locales.get(p.i) || {};
        const pl = { ...previa, id: p.i, name: p.n, emoji: iconoGuardable(p.e || previa.emoji), color: p.c || previa.color || '#8a93a6',
          portada: typeof p.f === 'string' ? portadaValida(p.f) : portadaValida(previa.portada),
          trackIds: (p.k || []).map(aLargo).filter(Boolean), createdAt: p.cr || previa.createdAt || Date.now() };
        metaPl[p.i] = { h: String(hashString(huellaPl(pl))), t: p.t || 0 };
        return pl;
      });
      lista.filter((p) => p.x).forEach((p) => { metaPl[p.i] = { x: p.x }; });
      saveLocalPlaylists();
    }

    // Suma / resta de estructuras numéricas (para separar lo de este dispositivo de lo de los demás)
    function sumar(a, b, signo = 1) {
      const out = { ...a };
      Object.entries(b || {}).forEach(([k, v]) => {
        if (typeof v === 'number') {
          const r = (out[k] || 0) + signo * v;
          if (r > 0) out[k] = r; else delete out[k];
        } else if (v && typeof v === 'object') {
          const r = sumar(out[k] && typeof out[k] === 'object' ? out[k] : {}, v, signo);
          if (Object.keys(r).length) out[k] = r; else delete out[k];
        }
      });
      return out;
    }

    // Registro de un día → forma compacta (ids cortos, horas solo con algo, estilos por momento)
    function diaACompacto(e) {
      const o = {};
      const s = {};
      Object.entries(e.s || {}).forEach(([id, sec]) => { if (sec > 0) s[aCorto(id)] = Math.round(sec); });
      if (Object.keys(s).length) o.s = s;
      const p = {};
      Object.entries(e.p || {}).forEach(([id, n]) => { if (n > 0) p[aCorto(id)] = n; });
      if (Object.keys(p).length) o.p = p;
      const h = {};
      (e.h || []).forEach((sec, i) => { if (sec > 0) h[i] = Math.round(sec); });
      if (Object.keys(h).length) o.h = h;
      if (e.g && Object.keys(e.g).length) o.g = e.g;
      return o;
    }
    function diaDeCompacto(o) {
      const e = { s: {}, p: {}, h: new Array(24).fill(0), g: o.g ? JSON.parse(JSON.stringify(o.g)) : {} };
      Object.entries(o.s || {}).forEach(([c, sec]) => { const id = aLargo(c); if (id) e.s[id] = sec; });
      Object.entries(o.p || {}).forEach(([c, n]) => { const id = aLargo(c); if (id) e.p[id] = n; });
      Object.entries(o.h || {}).forEach(([i, sec]) => { e.h[Number(i)] = sec; });
      return e;
    }
    const sumarDia = (a, b, signo = 1) => {
      const r = sumar({ s: a.s, p: a.p, g: a.g, h: Object.fromEntries((a.h || []).map((v, i) => [i, v])) },
        { s: b.s, p: b.p, g: b.g, h: Object.fromEntries((b.h || []).map((v, i) => [i, v])) }, signo);
      const h = new Array(24).fill(0);
      Object.entries(r.h || {}).forEach(([i, v]) => { h[Number(i)] = v; });
      return { s: r.s || {}, p: r.p || {}, g: r.g || {}, h };
    };

    async function comprimir(obj) {
      const stream = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'));
      return new Response(stream).arrayBuffer();
    }
    async function descomprimir(buffer) {
      const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
      return JSON.parse(await new Response(stream).text());
    }

    // JSON con claves ordenadas: compara contenido sin importar el orden (evita escrituras de más en R2)
    const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]`
      : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));

    // Lee, mezcla y sube un archivo con su ETag (si otro dispositivo escribió antes, vuelve a mezclar)
    async function sincronizarArchivo(ruta, nombre, meta, mezclar) {
      for (let intento = 0; intento < 3; intento++) {
        const r = await api(ruta, { metodo: 'GET', auth: true, binario: true });
        const remoto = r.cuerpo ? await descomprimir(r.cuerpo) : null;
        const etag = r.cuerpo ? r.etag : null;
        const { doc, aplicar } = mezclar(remoto);
        // Sin cambios respecto a lo que ya hay: no se escribe (ahorra operaciones de R2)
        if (remoto && canon(remoto) === canon(doc)) {
          aplicar();
          meta.etag[nombre] = etag;
          return true;
        }
        try {
          const subida = await api(ruta, { metodo: 'PUT', auth: true, crudo: await comprimir(doc),
            cabeceras: { 'Content-Type': 'application/gzip', ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }) } });
          aplicar();
          meta.etag[nombre] = subida.etag;
          return true;
        } catch (e) {
          if (e.codigo === 'cambio_en_otro_dispositivo' && intento < 2) continue;
          throw e;
        }
      }
      return false;
    }

    async function sincronizar({ reemplazar = false, silencioso = false } = {}) {
      if (!sesion) return false;
      if (sync.enCurso) return sync.enCurso;
      if (typeof CompressionStream === 'undefined') {
        if (!silencioso) showToast('Este navegador es antiguo para sincronizar. Actualízalo para usar tu cuenta.');
        return false;
      }
      sync.estado = 'sincronizando';
      actualizarBotones();
      sync.enCurso = (async () => {
        try {
          const meta = metaLocal();
          const yo = idDispositivo();
          if (reemplazar) {
            meta.sets = {};
            meta.pl = {};
            Object.values(CONJUNTOS).forEach((c) => c.aplicar([]));
            library.local = [];
            meta.otrosPlays = {};
            meta.otrosLog = {};
            library.plays = {};
            listen.log = {};
          }
          // Lo propio de este dispositivo = lo que hay menos lo que se sumó de los demás
          const propiosPlays = sumar(library.plays, meta.otrosPlays, -1);

          await sincronizarArchivo('/datos', 'datos', meta, (remoto) => {
            const r = remoto || {};
            const sets = {};
            Object.entries(CONJUNTOS).forEach(([k, c]) => {
              const local = difConjunto({ ...(meta.sets[k] || {}) }, c.leer(), c.conocida);
              sets[k] = mezclarConjunto(local, r[k]);
            });
            const metaPl = difPlaylists({ ...meta.pl });
            const pl = mezclarPlaylists(metaPl, r.pl);
            // Reproducciones: cada dispositivo sube las suyas; el total es la suma
            const pc = { ...(r.pc || {}) };
            const mias = {};
            Object.entries(propiosPlays).forEach(([id, n]) => { if (n > 0) mias[aCorto(id)] = n; });
            if (Object.keys(mias).length) pc[yo] = mias; else delete pc[yo];
            // Última escucha (minutos) y saltos: el máximo de cada dispositivo
            const hd = { ...(r.hd || {}) };
            Object.entries(taste.heard).forEach(([id, ms]) => {
              const c = aCorto(id);
              const m = Math.floor(ms / 60000) - BASE_MIN;
              if (!hd[c] || hd[c] < m) hd[c] = m;
            });
            Object.keys(hd).forEach((c) => { if (minAhora() - hd[c] > 90 * 24 * 60) delete hd[c]; });
            const sk = { ...(r.sk || {}) };
            Object.entries(taste.skips).forEach(([id, n]) => { const c = aCorto(id); sk[c] = Math.max(sk[c] || 0, n); });
            const aj = { ...(r.aj || {}) };
            const tema = storage.get(KEYS.theme, 'chrome');
            // El tema viaja: gana el último cambio (un dispositivo nuevo adopta el de la cuenta)
            const temaCambiado = meta.tema !== undefined && meta.tema !== tema;
            if (!aj.tema || temaCambiado) aj.tema = [minAhora(), tema];
            const doc = { v: 1, t: minAhora(), ...Object.fromEntries(Object.entries(sets).filter(([, v]) => Object.keys(v).length)), pl, pc, hd, sk, aj };
            Object.keys(doc).forEach((k) => { if (doc[k] && typeof doc[k] === 'object' && !Array.isArray(doc[k]) && !Object.keys(doc[k]).length) delete doc[k]; });
            if (!doc.pl.length) delete doc.pl;
            if (remoto && canon({ ...doc, t: remoto.t }) === canon(remoto)) doc.t = remoto.t;
            return {
              doc,
              aplicar: () => {
                Object.entries(CONJUNTOS).forEach(([k, c]) => c.aplicar(presentesDe(sets[k])));
                meta.sets = sets;
                aplicarPlaylists(pl, metaPl);
                meta.pl = metaPl;
                const otros = {};
                Object.entries(pc).forEach(([d, mapa]) => {
                  if (d === yo) return;
                  Object.entries(mapa).forEach(([c, n]) => { const id = aLargo(c); if (id) otros[id] = (otros[id] || 0) + n; });
                });
                library.plays = sumar(propiosPlays, otros);
                meta.otrosPlays = otros;
                storage.set(KEYS.plays, library.plays);
                Object.entries(hd).forEach(([c, m]) => { const id = aLargo(c); if (id) taste.heard[id] = Math.max(taste.heard[id] || 0, (m + BASE_MIN) * 60000); });
                Object.entries(sk).forEach(([c, n]) => { const id = aLargo(c); if (id) taste.skips[id] = Math.max(taste.skips[id] || 0, n); });
                taste.dirty = true;
                taste.profile = null;
                taste.save();
                if (aj.tema && aj.tema[1] !== tema) applyTheme(aj.tema[1]);
                meta.tema = aj.tema?.[1];
              }
            };
          });

          if (meta.escucha) {
            flushListening();
            const anios = new Set([new Date().getFullYear(), new Date().getFullYear() - 1, ...Object.keys(listen.log).map((d) => Number(d.slice(0, 4)))]);
            const propioLog = {};
            Object.entries(listen.log).forEach(([dia, e]) => {
              const otro = meta.otrosLog[dia];
              const mio = otro ? sumarDia(e, otro, -1) : e;
              if (Object.keys(mio.s || {}).length || Object.keys(mio.p || {}).length) propioLog[dia] = mio;
            });
            const nuevosOtros = {};
            for (const anio of [...anios].sort()) {
              const prefijo = `${anio}-`;
              const misDias = Object.entries(propioLog).filter(([d]) => d.startsWith(prefijo));
              await sincronizarArchivo(`/datos/escucha/${anio}`, `escucha-${anio}`, meta, (remoto) => {
                const d = JSON.parse(JSON.stringify(remoto?.d || {}));
                Object.keys(d).forEach((md) => { if (d[md][yo] && !propioLog[`${anio}-${md.slice(0, 2)}-${md.slice(2)}`]) delete d[md][yo]; });
                misDias.forEach(([dia, e]) => {
                  const md = dia.slice(5).replace('-', '');
                  d[md] = d[md] || {};
                  d[md][yo] = diaACompacto(e);
                });
                Object.keys(d).forEach((md) => { if (!Object.keys(d[md]).length) delete d[md]; });
                const doc = { v: 1, d };
                return {
                  doc,
                  aplicar: () => {
                    Object.entries(d).forEach(([md, porDisp]) => {
                      const dia = `${anio}-${md.slice(0, 2)}-${md.slice(2)}`;
                      Object.entries(porDisp).forEach(([disp, o]) => {
                        if (disp === yo) return;
                        nuevosOtros[dia] = sumarDia(nuevosOtros[dia] || { s: {}, p: {}, g: {}, h: [] }, diaDeCompacto(o));
                      });
                    });
                  }
                };
              });
              if (!misDias.length && anio < new Date().getFullYear() - 1) break;
            }
            const combinado = {};
            new Set([...Object.keys(propioLog), ...Object.keys(nuevosOtros)]).forEach((dia) => {
              combinado[dia] = sumarDia(propioLog[dia] || { s: {}, p: {}, g: {}, h: [] }, nuevosOtros[dia] || { s: {}, p: {}, g: {}, h: [] });
            });
            listen.log = combinado;
            meta.otrosLog = nuevosOtros;
            saveListening();
          }

          guardarMeta(meta);
          sync.ultima = Math.floor(Date.now() / 1000);
          sync.estado = 'al-dia';
          sync.error = '';
          if (sesion) { sesion.ultimaSync = sync.ultima; guardarSesion(); }
          taste.profile = null;
          updateCounts();
          renderList();
          if (!silencioso) showToast('Sincronizado');
          return true;
        } catch (e) {
          sync.estado = 'error';
          sync.error = e?.codigo === 'sin_conexion' ? 'sin conexión' : '';
          if (!silencioso) showToast(mensaje(e));
          return false;
        } finally {
          sync.enCurso = null;
          actualizarBotones();
        }
      })();
      return sync.enCurso;
    }

    /* ---------- Botones de la barra y de Ajustes ---------- */
    function actualizarBotones() {
      const btn = document.getElementById('cuentaBtn');
      if (btn) {
        const p = sesion?.perfil;
        btn.classList.toggle('is-sesion', Boolean(sesion));
        btn.dataset.estado = sesion ? (navigator.onLine ? sync.estado : 'sin-conexion') : 'apagado';
        btn.innerHTML = sesion ? avatarHtml(p?.avatar, p?.nombre, 'is-barra') : '<svg class="icon" aria-hidden="true"><use href="#i-person"></use></svg>';
        btn.setAttribute('aria-label', sesion ? `Tu cuenta (${p?.correo || ''})` : 'Iniciar sesión o crear cuenta');
        btn.title = sesion ? 'Tu cuenta' : 'Iniciar sesión';
      }
      const ajuste = document.getElementById('cuentaAjuste');
      if (ajuste) {
        ajuste.innerHTML = sesion
          ? `<div class="cuenta-ajuste-fila">${avatarHtml(sesion.perfil?.avatar, sesion.perfil?.nombre)}<span><b>${esc(sesion.perfil?.nombre || sesion.perfil?.correo || 'Tu cuenta')}</b><small>${esc(textoSync())}</small></span></div>
             <div class="cuenta-ajuste-botones"><button type="button" class="btn" data-cuenta-ajuste="cuenta">Tu cuenta</button><button type="button" class="btn btn-ghost" data-cuenta-ajuste="salir">Cerrar sesión</button></div>`
          : `<p class="sheet-note">Opcional: guarda favoritas, playlists y escucha para tenerlas en todos tus dispositivos. Sin cuenta, todo sigue funcionando y se guarda solo en este navegador.</p>
             <div class="cuenta-ajuste-botones"><button type="button" class="btn btn-primary" data-cuenta-ajuste="entrar">Iniciar sesión</button><button type="button" class="btn" data-cuenta-ajuste="alta">Crear cuenta</button></div>`;
      }
    }

    function init() {
      ui.dialog = document.getElementById('cuentaDialog');
      ui.body = document.getElementById('cuentaBody');
      if (!ui.dialog || !ui.body) return;
      ui.body.addEventListener('click', (e) => {
        const t = e.target.closest('[data-cuenta]');
        if (t && t.dataset.cuenta !== 'enviar') alClic(t);
      });
      ui.body.addEventListener('submit', (e) => { e.preventDefault(); alEnviar(e.target); });
      ui.dialog.addEventListener('close', () => {
        limpiarTemporizadores();
        storage.set(K.ofrecida, true);
        // El tutorial ya no sale encadenado justo después de la cuenta (eran dos ventanas seguidas
        // antes de oír nada): aparece en la próxima visita y siempre está en Ajustes → Ayuda
      });
      ui.dialog.addEventListener('click', (e) => { if (e.target === ui.dialog) cerrar(); });
      document.getElementById('cuentaBtn')?.addEventListener('click', () => abrir());
      document.getElementById('cuentaAjuste')?.addEventListener('click', (e) => {
        const t = e.target.closest('[data-cuenta-ajuste]');
        if (!t) return;
        const a = t.dataset.cuentaAjuste;
        els.settingsDialog.close();
        if (a === 'salir') abrir('cuenta');
        else abrir(a === 'cuenta' ? 'cuenta' : a === 'alta' ? 'alta-1' : 'entrar');
      });
      actualizarBotones();

      // ?cuenta=alta|entrar (desde la review o un correo)
      const pedido = new URLSearchParams(location.search).get('cuenta');
      if (pedido) {
        setTimeout(() => abrir(sesion ? 'cuenta' : pedido === 'alta' ? 'alta-1' : 'entrar'), 600);
        try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* sin historial */ }
      } else if (!sesion && !storage.get(K.ofrecida, false)) {
        // Lo primero al abrir tras la actualización: la cuenta (se puede rechazar y todo sigue igual)
        setTimeout(() => abrir('bienvenida'), 700);
      }

      if (sesion) {
        // Al abrir, al volver a la app (más de 2 min) y cada 5 min con la app abierta
        setTimeout(() => sincronizar({ silencioso: true }), 2500);
        document.addEventListener('visibilitychange', () => {
          if (!sesion) return;
          if (document.visibilityState === 'hidden') sincronizar({ silencioso: true });
          else if (Date.now() / 1000 - sync.ultima > 120) sincronizar({ silencioso: true });
        });
        setInterval(() => { if (sesion && document.visibilityState === 'visible') sincronizar({ silencioso: true }); }, 5 * 60000);
      }
      window.addEventListener('online', actualizarBotones);
      window.addEventListener('offline', actualizarBotones);
    }

    const vaPrimero = () => !sesion && !storage.get(K.ofrecida, false);

    return { init, abrir, sincronizar, vaPrimero, haySesion: () => Boolean(sesion), nombre: () => sesion?.perfil?.nombre || '' };
  })();


  /* ---------- Tutorial de bienvenida (solo la primera vez) ---------- */
  const tour = (() => {
    const isPhone = () => window.matchMedia('(max-width: 860px)').matches;
    // Cada paso puede señalar una parte de la app (distinta en móvil y en ordenador)
    const STEPS = [
      { icon: 'note', title: 'Bienvenido a Liquid Bullet',
        text: () => `Tu música en un solo lugar: ${state.libraryTracks.length ? `${state.libraryTracks.length.toLocaleString('es')} canciones` : 'miles de canciones'} listas para sonar. Te enseñamos lo principal en 30 segundos.` },
      { icon: 'search', title: 'Biblioteca y búsqueda',
        text: () => 'Busca por canción, artista o estilo. Las píldoras de arriba filtran (descargadas, favoritas, sin escuchar, por estilo) y puedes ordenar la lista como quieras.',
        target: () => (isPhone() ? '.nav-btn[data-nav="search"]' : '.search') },
      { icon: 'grid', title: 'Playlists',
        text: () => 'Playlists por estilo hechas con toda la biblioteca, las tuyas (botón ＋ de cada canción) y las automáticas: «Escuchadas hace poco» y «Tus más escuchadas». Mantén pulsada una para fijarla arriba.',
        target: () => (isPhone() ? '.nav-btn[data-nav="playlists"]' : '.tab[data-view="playlists"]') },
      { icon: 'flask', title: 'Lab',
        text: () => 'Combina estilos y artistas y Lab te arma una mezcla a medida. En «Si te gusta…» eliges un artista y te recomienda a quién escuchar después.',
        target: () => (isPhone() ? '.nav-btn[data-nav="lab"]' : '.tab[data-view="lab"]') },
      { icon: 'queue', title: 'El reproductor',
        text: () => 'Transiciones DJ entre canciones, «A continuación» para ver y ordenar la cola, temporizador de apagado y letras sincronizadas. Cada playlist se puede descargar para escucharla sin conexión.',
        target: () => (isPhone() ? '.player .controls' : '.player-volume') },
      { icon: 'heart', title: 'Favoritas y Stats',
        text: () => (isPhone()
          ? 'Toca la canción de abajo (o desliza hacia arriba) para abrir Sonando: ahí el corazón la guarda en Favoritas y ves la letra. En Stats ves tus minutos, estilos y artistas del mes.'
          : 'Toca el corazón para guardar una canción en Favoritas. En Stats ves tus minutos, horas, estilos y artistas del mes.'),
        target: () => (isPhone() ? '.player-track' : '.tab[data-view="favorites"]') },
      { icon: 'settings', title: 'Hazla tuya',
        text: () => 'En Ajustes eliges tema, letra, fondo de pantalla y ecualizador, y puedes volver a ver este tutorial. ¿Ideas o algún error? Escribe a officiallukamon@gmail.com (está abajo, en el panel Sonando).',
        target: () => '#settingsBtn' }
    ];
    let step = 0;
    let focused = null;

    function seen() {
      return storage.get(KEYS.tour, false) === true;
    }

    function clearFocus() {
      focused?.classList.remove('tour-focus');
      focused = null;
    }

    function render() {
      const data = STEPS[step];
      els.tourIcon.replaceChildren(svgIcon(data.icon));
      els.tourTitle.textContent = data.title;
      els.tourText.textContent = data.text();
      els.tourCount.textContent = `${step + 1} de ${STEPS.length}`;
      els.tourDots.replaceChildren(...STEPS.map((_, i) => makeEl('span', `tour-dot${i === step ? ' is-active' : ''}`)));
      els.tourPrev.hidden = step === 0;
      els.tourNext.textContent = step === STEPS.length - 1 ? 'Empezar' : 'Siguiente';
      clearFocus();
      const selector = data.target?.();
      const target = selector ? document.querySelector(selector) : null;
      if (target && target.getClientRects().length) {
        focused = target;
        target.classList.add('tour-focus');
        target.scrollIntoView({ block: 'nearest', behavior: settings.motion ? 'smooth' : 'auto' });
      }
      // La tarjeta se aparta al lado contrario de lo que señala
      const rect = target?.getBoundingClientRect();
      els.tourDialog.classList.toggle('is-top', Boolean(rect && rect.top > window.innerHeight * 0.55));
    }

    function finish() {
      storage.set(KEYS.tour, true);
      clearFocus();
      if (els.tourDialog.open) els.tourDialog.close();
    }

    function open() {
      step = 0;
      render();
      if (!els.tourDialog.open) els.tourDialog.show();
      els.tourNext.focus({ preventScroll: true });
    }

    function init() {
      els.tourNext.addEventListener('click', () => {
        if (step >= STEPS.length - 1) finish();
        else { step++; render(); }
      });
      els.tourPrev.addEventListener('click', () => { step = Math.max(0, step - 1); render(); });
      els.tourSkip.addEventListener('click', finish);
      els.tourDialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.preventDefault(); finish(); }
        if (event.key === 'ArrowRight') els.tourNext.click();
        if (event.key === 'ArrowLeft' && step > 0) els.tourPrev.click();
      });
      els.tourAgain.addEventListener('click', () => {
        els.settingsDialog.close();
        open();
      });
      // Primera visita: se muestra cuando ya cargó la app (y nunca más)
      // Si va primero la cuenta (primera vez tras la actualización), el tutorial sale al cerrarla
      if (!seen() && !cuenta.vaPrimero()) setTimeout(open, 900);
    }

    return { init, open };
  })();

  /* ---------- Ventana de configuración ---------- */
  const nav = { nowVisible: true };

  function updateNav() {
    const searching = document.activeElement === els.searchInput;
    const active = searching ? 'search'
      : state.view === 'home' ? 'home'
      : state.view === 'playlists' || state.view === 'playlist' ? 'playlists'
      : state.view === 'lab' || state.view === 'stats' ? 'lab' : 'library';
    els.bottomNav.querySelectorAll('.nav-btn').forEach((button) => {
      const on = button.dataset.nav === active;
      button.classList.toggle('is-active', on);
      if (on) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function setPlaylistView(view) {
    settings.plView = view === 'list' ? 'list' : 'grid';
    saveSettings();
    els.plViewSelect.value = settings.plView;
    renderList();
  }

  function updateBandLabel(input) {
    const value = Number(input.value);
    const label = `${value > 0 ? '+' : ''}${value} dB`;
    input.closest('.eq-band').querySelector('.eq-value').textContent = label;
    input.setAttribute('aria-valuetext', label);
    input.style.setProperty('--fill', `${((value + 12) / 24) * 100}%`);
  }

  function renderEqBands() {
    els.eqPreset.value = settings.eq.preset in EQ_PRESETS ? settings.eq.preset : 'custom';
    els.eqBands.replaceChildren(...EQ_BANDS.map((band, i) => {
      const row = makeEl('label', 'eq-band');
      const name = makeEl('span', 'eq-name');
      name.append(makeEl('span', 'eq-label', band.label), makeEl('span', 'eq-hz', band.hz));
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'range eq-range';
      input.min = '-12';
      input.max = '12';
      input.step = '1';
      input.value = String(settings.eq.gains[i]);
      input.dataset.band = String(i);
      input.setAttribute('aria-label', `${band.label} (${band.hz})`);
      input.disabled = !AudioContextClass;
      row.append(name, input, makeEl('span', 'eq-value'));
      updateBandLabel(input);
      return row;
    }));
  }

  function onEqChange() {
    saveSettings();
    if (!eqActive()) {
      applyEqGains();
      return;
    }
    // Se crea dentro del toque: los navegadores solo dejan arrancar el audio así
    if (!ensureEqGraph()) return;
    eq.ctx.resume().catch(() => {});
    applyEqGains();
    probeCors().then(() => {
      updateEqNote();
      syncEqRouting();
    });
  }

  // Registro de errores: los últimos 15 se guardan aquí (nada se envía solo)
  const errorLog = {
    list() { return storage.get(KEYS.errors, []) || []; },
    add(message, source = '') {
      const list = this.list();
      const text = String(message || 'Error').slice(0, 300);
      if (list[0]?.m === text) return;
      list.unshift({ t: new Date().toISOString(), m: text, s: String(source).slice(0, 160), v: document.querySelector('script[src^="app.js"]')?.getAttribute('src') || '' });
      storage.set(KEYS.errors, list.slice(0, 15));
    },
    init() {
      window.addEventListener('error', (event) => {
        if (event.target && event.target !== window) return; // imágenes o audios que no cargan: no son fallos de la app
        this.add(event.message, `${event.filename || ''}:${event.lineno || ''}`);
      });
      window.addEventListener('unhandledrejection', (event) => this.add(event.reason?.message || event.reason, 'promesa'));
    },
    renderButton() {
      const list = this.list();
      els.errorReport.hidden = !list.length;
      if (!list.length) return;
      const body = [
        'Hola, la app me dio estos errores:',
        '',
        ...list.map((e) => `${e.t} · ${e.m} (${e.s}) ${e.v}`),
        '',
        `Dispositivo: ${deviceSummary()}`,
        `Navegador: ${navigator.userAgent}`,
        `Pantalla: ${window.innerWidth}×${window.innerHeight} · tema ${document.documentElement.dataset.theme}`
      ].join('\n');
      els.errorReport.href = `mailto:officiallukamon@gmail.com?subject=${encodeURIComponent('Liquid Bullet: informe de errores')}&body=${encodeURIComponent(body.slice(0, 1800))}`;
      els.errorReport.querySelector('span').textContent = `Enviar informe de errores (${list.length})`;
    }
  };

  function openSettings() {
    renderStorageInfo();
    renderHiddenSettings();
    els.ultraToggle.checked = settings.ultra;
    errorLog.renderButton();
    els.fontSelect.value = settings.font;
    els.textSizeSelect.value = settings.textSize;
    els.plViewSelect.value = settings.plView;
    els.motionToggle.checked = settings.motion;
    const canVibrate = typeof navigator.vibrate === 'function';
    els.hapticsToggle.checked = settings.haptics && canVibrate;
    els.hapticsToggle.disabled = !canVibrate;
    els.hapticsHint.textContent = canVibrate
      ? 'Al dar «Me gusta», reproducir, fijar o mover la barra.'
      : 'Este dispositivo no deja vibrar desde la web (iPhone/iPad, ordenador).';
    els.wallMode.value = settings.wall.mode;
    els.wallAlive.checked = settings.wall.alive;
    if (document.documentElement.classList.contains('lite')) {
      els.wallAlive.closest('.setting').querySelector('.setting-hint').textContent =
        'Este dispositivo usa el modo ligero (ahorro de batería y datos): el fondo se queda quieto.';
    }
    wall.renderGrid();
    renderEqBands();
    updateEqNote();
    els.settingsDialog.showModal();
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
    // Antes los iconos eran emojis: se pasan una vez a los iconos del sistema
    let migradas = false;
    library.local.forEach((p) => {
      const nuevo = iconoGuardable(p.emoji);
      if (nuevo !== p.emoji) { p.emoji = nuevo; migradas = true; }
    });
    if (migradas) storage.set(KEYS.playlists, library.local);
    const savedRecent = storage.get(KEYS.recent, []);
    library.recent = Array.isArray(savedRecent) ? savedRecent.map(String) : [];
    const savedPlays = storage.get(KEYS.plays, {});
    library.plays = savedPlays && typeof savedPlays === 'object' ? savedPlays : {};
    const savedSort = storage.get(KEYS.sort, 'original');
    state.sort = savedSort in SORTS ? savedSort : 'original';
    const savedPins = storage.get(KEYS.pins, []);
    library.pins = Array.isArray(savedPins) ? savedPins.filter((k) => typeof k === 'string') : [];
    const savedHidden = storage.get(KEYS.hidden, []);
    library.hidden = Array.isArray(savedHidden) ? savedHidden.filter((k) => typeof k === 'string') : [];
    // Como en Spotify, la app abre siempre en Inicio
    state.view = 'home';
    const savedFollows = storage.get(KEYS.follows, []);
    library.follows = Array.isArray(savedFollows) ? savedFollows.filter((k) => typeof k === 'string') : [];
    const savedSearches = storage.get(KEYS.searches, []);
    library.searches = Array.isArray(savedSearches) ? savedSearches.filter((q) => typeof q === 'string').slice(0, SEARCH_HISTORY) : [];

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
    const savedListen = storage.get(KEYS.listen, {});
    listen.log = savedListen && typeof savedListen === 'object' ? savedListen : {};
    taste.load();

    applyTheme(storage.get(KEYS.theme, 'chrome'));
  }

  // Equipos modestos o "ahorro de datos": escena surrealista estática
  function detectLiteMode() {
    // Lo decide la detección del dispositivo (index.html): iPhone y iPad nunca entran aquí por sus núcleos
    autoLite = DEVICE.lowEnd || DEVICE.saveData || DEVICE.slowNet;
    if (autoLite) document.documentElement.classList.add('lite');
  }

  // Abierta dentro de Instagram, TikTok, Facebook…: la música se corta al salir de esa app, no se puede
  // instalar y lo guardado puede borrarse. Se ofrece abrirla en el navegador (una vez por sesión).
  function inappNotice() {
    if (!DEVICE.inapp) return;
    try { if (sessionStorage.getItem('liquidbrush:inapp-visto')) return; } catch { /* sin acceso */ }
    const app = INAPP_NAMES[DEVICE.inapp] || 'otra app';
    const url = location.href;
    const bar = makeEl('div', 'inapp-bar');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Abrir en el navegador');
    const text = makeEl('p', 'inapp-text');
    text.append(makeEl('b', '', `Estás dentro de ${app}.`), document.createTextNode(` La música se corta al salir y no se puede instalar. Ábrela en ${IS_IOS ? 'Safari' : 'tu navegador'} para que suene bien.`));
    const actions = makeEl('div', 'inapp-actions');
    const open = makeEl('a', 'btn btn-primary', IS_IOS ? 'Abrir en Safari' : 'Abrir en el navegador');
    // iOS 17+: x-safari-https abre Safari desde los navegadores internos. Android: un intent abre el navegador
    open.href = IS_IOS ? `x-safari-${url}` : `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    const copy = makeEl('button', 'btn', 'Copiar enlace');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); showToast(`Enlace copiado: pégalo en ${IS_IOS ? 'Safari' : 'tu navegador'}.`); } catch { showToast(url); }
    });
    const close = makeEl('button', 'icon-btn inapp-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar el aviso');
    close.append(svgIcon('close'));
    close.addEventListener('click', () => {
      bar.remove();
      try { sessionStorage.setItem('liquidbrush:inapp-visto', '1'); } catch { /* sin acceso */ }
    });
    actions.append(open, copy);
    bar.append(text, actions, close);
    document.body.append(bar);
  }

  function init() {
    errorLog.init();
    detectLiteMode();
    applyLook();
    els.eqPreset.replaceChildren(...Object.entries(EQ_PRESETS).map(([value, preset]) => new Option(preset.name, value)));
    document.documentElement.classList.toggle('is-ios', IS_IOS);
    if (IS_IOS) els.djFade.closest('.dj-fade').title = 'En iPhone/iPad la transición es un empalme corto: iOS no permite bajar el volumen desde la web.';

    els.cover.src = PLACEHOLDER_COVER;
    els.miniCover.src = PLACEHOLDER_COVER;
    if (window.matchMedia('(max-width: 860px)').matches) els.lyricsPanel.open = false;

    restorePreferences();
    updateModeButtons();
    updateVolumeUI();
    updateProgressUI(0, 0);
    bindEvents();
    navHistory.init();
    npSheet.init();
    // Mientras llega la biblioteca (primera visita), filas de esqueleto en vez de un hueco
    let hasLibraryCopy = false;
    try { hasLibraryCopy = localStorage.getItem(LIBRARY_IDB_FLAG) === '1' || localStorage.getItem(KEYS.libraryCache) !== null; } catch { /* sin acceso */ }
    if (!hasLibraryCopy) {
      els.trackList.replaceChildren(...Array.from({ length: 8 }, () => {
        const li = makeEl('li', 'track-skeleton');
        li.setAttribute('aria-hidden', 'true');
        li.append(makeEl('span', 'sk-cover'), makeEl('span', 'sk-lines'));
        return li;
      }));
    }
    // El índice A–Z va fijo a la pantalla: fuera de .library (su backdrop-filter lo encerraría)
    document.body.append(els.alphaRail);
    applySpeed();
    els.speedSelect.value = String(settings.speed);
    els.softPauseToggle.checked = settings.softPause;
    els.autoFavToggle.checked = settings.autoFav;
    setupMediaSessionHandlers();
    setupAudioSession();
    setupSurrealEyes();
    wall.init();
    cuenta.init();
    tour.init();
    install.init();
    inappNotice();
    if (els.deviceInfo) els.deviceInfo.textContent = `Tu dispositivo: ${deviceSummary()}. La app se adapta sola a él.`;
    document.querySelectorAll('.settings-group-title').forEach((title) => title.prepend(sticker(title.textContent)));
    updateNav();
    updateOnlineStatus();
    registerServiceWorker();
    loadTracks();
  }

  init();
})();
