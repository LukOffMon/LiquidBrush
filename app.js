/* =========================================================
   LiquidBrush — lógica del reproductor
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Configuración ---------- */
  const CONFIG = {
    // Fuente principal: la tabla "tracks" de Supabase. Si falla, se usa tracks.json.
    // La clave publicable es segura en el navegador: la tabla solo permite leer (RLS).
    supabase: {
      url: 'https://kvylexeicpvjrvhpizsz.supabase.co',
      key: 'sb_publishable__E4pzkc1jZe8u9UtpWglHg_Z9KFYPso',
      table: 'tracks',
      // En "src" y "cover" basta con poner el nombre del archivo subido a este bucket
      bucket: 'loopmusik-audio'
    },
    tracksUrl: 'tracks.json',
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
    repeat: 'liquidbrush:repeat'
  };

  const THEMES = {
    chrome: '#100d1c',
    dark: '#121212',
    cyberpunk: '#0a0612',
    minimal: '#f4f3f0',
    synthwave: '#0b0d2a'
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

  /* ---------- Estado ---------- */
  const state = {
    tracks: [],
    trackMap: new Map(),
    baseQueue: [],
    queue: [],
    queueIndex: -1,
    queueContext: '',
    currentTrack: null,
    favorites: new Set(),
    view: 'all',
    query: '',
    shuffle: false,
    repeat: 'off',
    isSeeking: false,
    pendingSeek: null,
    lastVolume: 0.8,
    lyrics: null,
    activeLyric: -1
  };

  /* ---------- Referencias al DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const els = {
    audio: $('audio'),
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
    tabs: document.querySelectorAll('.tab'),
    favCount: $('favCount'),
    listInfo: $('listInfo'),
    trackList: $('trackList'),
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
      } catch {
        /* localStorage no disponible (modo privado, cuota llena…) */
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
  function resolveMediaUrl(path) {
    const value = typeof path === 'string' ? path.trim() : '';
    const { url, bucket } = CONFIG.supabase;
    if (!value || /^(https?:|data:|blob:)/i.test(value) || !url || !bucket) return value;
    const cleanPath = value.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
    return `${url}/storage/v1/object/public/${bucket}/${cleanPath}`;
  }

  async function fetchFromSupabase() {
    const { url, key, table } = CONFIG.supabase;
    const endpoint = `${url}/rest/v1/${table}?select=*&order=position.asc,id.asc`;
    const response = await fetch(endpoint, { headers: { apikey: key }, cache: 'no-cache' });
    if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
    return response.json();
  }

  async function fetchFromJson() {
    const response = await fetch(CONFIG.tracksUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function fetchTrackData() {
    if (CONFIG.supabase.url && CONFIG.supabase.key) {
      try {
        return await fetchFromSupabase();
      } catch (error) {
        console.warn('[LiquidBrush] Supabase no disponible, se usa tracks.json.', error);
      }
    }
    return fetchFromJson();
  }

  async function loadTracks() {
    els.listInfo.textContent = 'Cargando canciones…';
    try {
      const data = await fetchTrackData();
      if (!Array.isArray(data)) throw new Error('La lista de canciones debe ser un array');

      state.tracks = data
        .filter((t) => t && typeof t.src === 'string' && t.src.trim())
        .map((t, i) => ({
          id: String(t.id ?? i + 1),
          title: t.title || 'Sin título',
          artist: t.artist || 'Artista desconocido',
          album: t.album || '',
          duration: t.duration || '',
          src: resolveMediaUrl(t.src),
          cover: resolveMediaUrl(t.cover) || PLACEHOLDER_COVER,
          lyrics: typeof t.lyrics === 'string' ? t.lyrics : ''
        }));
      state.trackMap = new Map(state.tracks.map((t) => [t.id, t]));

      renderList();

      if (state.tracks.length) {
        buildQueue(state.tracks[0].id);
        loadTrack(getTrack(state.queue[state.queueIndex]), false);
      } else {
        els.npContext.textContent = 'Biblioteca vacía';
      }
    } catch (error) {
      console.error('[LiquidBrush] Error al cargar tracks.json:', error);
      els.listInfo.textContent = '';
      els.npContext.textContent = 'Error de carga';
      const li = document.createElement('li');
      li.className = 'list-empty';
      li.textContent = location.protocol === 'file:'
        ? 'No se pudo cargar tracks.json. Abre la app desde un servidor (GitHub Pages o, en local, "npx serve") en lugar de hacer doble clic en index.html.'
        : 'No se pudieron cargar las canciones (ni de Supabase ni de tracks.json).';
      els.trackList.replaceChildren(li);
    }
  }

  /* ---------- Lista de canciones ---------- */
  function getVisibleTracks() {
    const q = normalize(state.query);
    return state.tracks.filter((track) => {
      if (state.view === 'favorites' && !state.favorites.has(track.id)) return false;
      if (!q) return true;
      return [track.title, track.artist, track.album].some((field) => normalize(field).includes(q));
    });
  }

  function renderList() {
    const visible = getVisibleTracks();
    const fragment = document.createDocumentFragment();
    visible.forEach((track, i) => fragment.appendChild(createTrackItem(track, i)));

    if (!visible.length) {
      const li = document.createElement('li');
      li.className = 'list-empty';
      if (!state.tracks.length) {
        li.textContent = 'La biblioteca está vacía por ahora. Las canciones que añadas en Supabase aparecerán aquí.';
      } else if (state.view === 'favorites' && !state.query) {
        li.textContent = 'Aún no tienes favoritas. Pulsa el ♥ de una canción para guardarla aquí.';
      } else {
        li.textContent = 'No se encontraron canciones.';
      }
      fragment.appendChild(li);
    }

    els.trackList.replaceChildren(fragment);

    const total = visible.length;
    els.listInfo.textContent = state.query
      ? `${total} resultado${total === 1 ? '' : 's'} para «${state.query.trim()}»`
      : `${total} canci${total === 1 ? 'ón' : 'ones'}`;

    updateFavCount();
  }

  function createTrackItem(track, index) {
    const li = document.createElement('li');
    li.className = 'track';
    li.dataset.id = track.id;
    if (state.currentTrack?.id === track.id) li.classList.add('is-current');

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
    artist.textContent = track.artist;
    text.append(title, artist);

    const album = document.createElement('span');
    album.className = 'track-album';
    album.textContent = track.album;

    main.append(num, img, text, album);

    const fav = document.createElement('button');
    fav.type = 'button';
    fav.className = 'icon-btn fav-btn';
    fav.dataset.action = 'fav';
    fav.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-heart"></use></svg>';
    updateFavButton(fav, state.favorites.has(track.id));

    const duration = document.createElement('span');
    duration.className = 'track-duration';
    duration.textContent = track.duration || '--:--';

    li.append(main, fav, duration);
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
  function describeContext() {
    if (state.query.trim()) return `Búsqueda: «${state.query.trim()}»`;
    if (state.view === 'favorites') return 'Reproduciendo desde Favoritas';
    return 'Reproduciendo desde tu biblioteca';
  }

  function buildQueue(startId) {
    const visibleIds = getVisibleTracks().map((t) => t.id);
    state.baseQueue = visibleIds.includes(startId) ? visibleIds : state.tracks.map((t) => t.id);
    state.queueContext = visibleIds.includes(startId) ? describeContext() : 'Reproduciendo desde tu biblioteca';
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
    buildQueue(id);
    loadTrack(getTrack(id), true);
  }

  /* ---------- Reproducción ---------- */
  function loadTrack(track, autoplay = true) {
    if (!track) return;
    state.currentTrack = track;
    state.pendingSeek = null;

    els.audio.src = track.src;

    els.cover.src = track.cover;
    els.cover.alt = `Carátula de ${track.album || track.title}`;
    els.miniCover.src = track.cover;
    els.npContext.textContent = state.queueContext;
    els.npTitle.textContent = track.title;
    els.npArtist.textContent = track.artist;
    els.npAlbum.textContent = track.album;
    els.miniTitle.textContent = track.title;
    els.miniArtist.textContent = track.artist;
    els.npFavBtn.disabled = false;
    updateFavButton(els.npFavBtn, state.favorites.has(track.id));
    document.title = `${track.title} · ${track.artist} — LiquidBrush`;

    updateProgressUI(0, parseDuration(track.duration));
    renderLyrics(track.lyrics);
    highlightCurrent();
    updateDynamicColor(track);
    updateMediaSession(track);

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

  function next(manual = true) {
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

    state.queueIndex = index;
    loadTrack(getTrack(state.queue[index]), true);
  }

  function prev() {
    if (!state.queue.length) return;
    if (els.audio.currentTime > 3) {
      els.audio.currentTime = 0;
      return;
    }
    let index = state.queueIndex - 1;
    if (index < 0) index = state.repeat === 'all' ? state.queue.length - 1 : 0;
    if (index === state.queueIndex) {
      els.audio.currentTime = 0;
      play();
      return;
    }
    state.queueIndex = index;
    loadTrack(getTrack(state.queue[index]), true);
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
    els.audio.volume = volume;
    if (volume > 0) {
      state.lastVolume = volume;
      if (els.audio.muted) els.audio.muted = false;
    }
    storage.set(KEYS.volume, volume);
    storage.set(KEYS.muted, els.audio.muted);
  }

  function toggleMute() {
    if (els.audio.muted || els.audio.volume === 0) {
      els.audio.muted = false;
      if (els.audio.volume === 0) els.audio.volume = state.lastVolume || 0.6;
    } else {
      els.audio.muted = true;
    }
    storage.set(KEYS.muted, els.audio.muted);
    storage.set(KEYS.volume, els.audio.volume);
  }

  function updateVolumeUI() {
    const silent = els.audio.muted || els.audio.volume === 0;
    const shown = silent ? 0 : els.audio.volume;
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

  function renderLyrics(text) {
    state.lyrics = parseLyrics(text);
    state.activeLyric = -1;
    els.lyricsBody.replaceChildren();
    els.lyricsBody.scrollTop = 0;
    els.lyricsBadge.hidden = !state.lyrics?.synced;

    if (!state.lyrics) {
      const p = document.createElement('p');
      p.className = 'lyrics-empty';
      p.textContent = 'Letra no disponible para esta canción.';
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
    let colors = { a: '#1db954', b: '#1ed760', glow: 0 };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      const theme = document.documentElement.dataset.theme;
      const neon = theme === 'cyberpunk' || theme === 'synthwave';
      colors = {
        a: read('--viz-a') || read('--accent') || colors.a,
        b: read('--viz-b') || read('--accent-2') || colors.b,
        c: read('--viz-c'),
        glow: neon ? 10 : theme === 'chrome' ? 6 : 0,
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
      const playing = !els.audio.paused && !els.audio.ended;
      const targets = playing ? levels(time) : null;
      let moving = playing;

      bars = bars.map((value, i) => {
        const target = targets ? targets[i] : IDLE_LEVEL;
        const speed = target > value ? 0.45 : 0.12;
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
      if (!rafId) rafId = requestAnimationFrame(frame);
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
        artwork: track.cover === PLACEHOLDER_COVER ? [] : [{ src: track.cover, sizes: '300x300' }]
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
    const { audio } = els;

    // Audio
    audio.addEventListener('play', () => setPlayingUI(true));
    audio.addEventListener('pause', () => setPlayingUI(false));
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('waiting', () => els.playBtn.classList.add('is-loading'));
    ['playing', 'canplay', 'pause', 'error', 'emptied'].forEach((type) => {
      audio.addEventListener(type, () => els.playBtn.classList.remove('is-loading'));
    });
    audio.addEventListener('timeupdate', () => {
      if (state.isSeeking) return;
      updateProgressUI(audio.currentTime, getDuration());
      syncLyrics(audio.currentTime);
    });
    audio.addEventListener('loadedmetadata', () => {
      if (state.pendingSeek !== null) {
        audio.currentTime = clamp(state.pendingSeek, 0, audio.duration || 0);
        state.pendingSeek = null;
      }
      updateProgressUI(audio.currentTime, getDuration());
    });
    audio.addEventListener('durationchange', () => {
      if (!state.isSeeking) updateProgressUI(audio.currentTime, getDuration());
    });
    audio.addEventListener('volumechange', updateVolumeUI);
    audio.addEventListener('error', () => {
      if (!audio.getAttribute('src')) return;
      setPlayingUI(false);
      showToast(`No se pudo cargar el audio de «${state.currentTrack?.title ?? 'la canción'}».`);
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

    // Volumen
    els.volume.addEventListener('input', () => setVolume(els.volume.value));

    // Lista (delegación de eventos)
    els.trackList.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      const item = event.target.closest('.track');
      if (!target || !item) return;
      if (target.dataset.action === 'fav') toggleFavorite(item.dataset.id);
      else if (target.dataset.action === 'play') playFromList(item.dataset.id);
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
    els.searchInput.addEventListener('input', () => {
      state.query = els.searchInput.value;
      renderList();
    });

    // Pestañas Todas / Favoritas
    els.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        state.view = tab.dataset.view;
        els.tabs.forEach((t) => {
          const active = t === tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', String(active));
        });
        renderList();
      });
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

    const savedVolume = Number(storage.get(KEYS.volume, 0.8));
    els.audio.volume = Number.isFinite(savedVolume) ? clamp(savedVolume, 0, 1) : 0.8;
    state.lastVolume = els.audio.volume || 0.8;
    els.audio.muted = storage.get(KEYS.muted, false) === true;

    applyTheme(storage.get(KEYS.theme, 'chrome'));
  }

  function init() {
    if (CONFIG.useWebAudioAnalyser) els.audio.crossOrigin = 'anonymous';

    els.cover.src = PLACEHOLDER_COVER;
    els.miniCover.src = PLACEHOLDER_COVER;
    if (window.matchMedia('(max-width: 860px)').matches) els.lyricsPanel.open = false;

    restorePreferences();
    updateModeButtons();
    updateVolumeUI();
    updateProgressUI(0, 0);
    bindEvents();
    setupMediaSessionHandlers();
    setupSurrealEyes();
    loadTracks();
  }

  init();
})();
