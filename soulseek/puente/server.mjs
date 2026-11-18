// Puente de Liquid SKd: une Liquid (la web) con slskd (Soulseek) en tu servidor.
// - Liquid nunca habla con slskd: solo con este puente, que pide una clave (LIQUID_CLAVE).
// - Buscar en Soulseek, pedir una descarga, ver cómo va y escuchar lo descargado.
// - Sin dependencias: solo Node 20+ (http, fs, crypto, fetch).
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function crearPuente(opciones = {}) {
  const env = { ...process.env, ...opciones };
  const CFG = {
    slskd: String(env.SLSKD_URL || 'http://slskd:5030').replace(/\/+$/, ''),
    apiKey: env.SLSKD_API_KEY || '',
    usuario: env.SLSKD_USERNAME || '',
    contrasena: env.SLSKD_PASSWORD || '',
    clave: env.LIQUID_CLAVE || '',
    musica: path.resolve(env.MUSICA_DIR || '/musica'),
    datos: path.resolve(env.DATOS_DIR || '/datos'),
    publico: String(env.PUBLICO || '').replace(/\/+$/, ''),
    origenes: String(env.ORIGENES || 'https://lukoffmon.github.io').split(',').map((o) => o.trim()).filter(Boolean),
    // Cuánto escucha slskd respuestas de otras personas, y cuánto espera el puente como máximo
    tiempoBusqueda: Number(env.TIEMPO_BUSQUEDA_MS || 8000),
    esperaBusqueda: Number(env.ESPERA_BUSQUEDA_MS || 12000),
    pausa: Number(env.PAUSA_MS || 700),
    // Caché: lo bajado de Soulseek se borra tras estas horas sin sonar (0 = nunca). La canción no se
    // olvida: sigue en tu biblioteca y, al tocarla otra vez, se vuelve a pedir a Soulseek.
    cacheHoras: Number(env.CACHE_HORAS ?? 24),
    // Carpeta de descargas a medias de slskd: si se conoce, la canción empieza a sonar mientras baja
    incompleto: env.INCOMPLETO_DIR ? path.resolve(env.INCOMPLETO_DIR) : '',
    // Cuánto espera /cancion a que una canción borrada vuelva antes de responder «sigue bajando»
    esperaReproducir: Number(env.ESPERA_REPRODUCIR_MS || 25000),
    // Si ninguna copia empieza en este tiempo, se prueba también la siguiente
    esperaCopia: Number(env.ESPERA_COPIA_MS || 15000)
  };
  if (!CFG.clave || CFG.clave.length < 16) throw new Error('Falta LIQUID_CLAVE (16 caracteres o más).');

  const AUDIO = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav' };
  // Lo que suena en todos los navegadores (iPhone incluido) primero
  const PREFERENCIA = { '.mp3': 6, '.m4a': 5, '.aac': 4, '.flac': 3, '.ogg': 1, '.opus': 1, '.wav': 0 };

  /* ---------- slskd ---------- */
  let sesion = null;
  // Algunos campos pueden venir en camelCase o en PascalCase según la versión: se aceptan los dos
  const campo = (obj, nombre) => (obj == null ? undefined : obj[nombre] ?? obj[nombre.charAt(0).toUpperCase() + nombre.slice(1)]);

  async function entrar() {
    if (!CFG.usuario || !CFG.contrasena) return null;
    const res = await fetch(`${CFG.slskd}/api/v0/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: CFG.usuario, password: CFG.contrasena })
    });
    if (!res.ok) throw new Error(`slskd no dejó entrar (HTTP ${res.status})`);
    const data = await res.json();
    sesion = campo(data, 'token') || null;
    return sesion;
  }

  // Con clave de API (X-API-Key) si la hay; si slskd la rechaza, con usuario y contraseña (sesión)
  async function slskd(ruta, { method = 'GET', body } = {}, reintento = true) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (sesion) headers.Authorization = `Bearer ${sesion}`;
    else if (CFG.apiKey) headers['X-API-Key'] = CFG.apiKey;
    const res = await fetch(`${CFG.slskd}/api/v0${ruta}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if ((res.status === 401 || res.status === 403) && reintento && CFG.usuario) {
      await entrar();
      return slskd(ruta, { method, body }, false);
    }
    return res;
  }
  async function slskdJson(ruta, opciones) {
    const res = await slskd(ruta, opciones);
    if (!res.ok) throw Object.assign(new Error(`slskd respondió ${res.status} en ${ruta}`), { status: res.status });
    const texto = await res.text();
    return texto ? JSON.parse(texto) : null;
  }

  /* ---------- Buscar ---------- */
  const busquedas = new Map();
  let turno = Promise.resolve();
  const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const baseName = (ruta) => String(ruta).split(/[\\/]/).pop();
  const carpeta = (ruta) => { const p = String(ruta).split(/[\\/]/); return p.length > 1 ? p[p.length - 2] : ''; };

  // «01 - Artista - Título.mp3» → { artista, titulo }
  function adivinar(ruta) {
    const nombre = baseName(ruta).replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ')
      .replace(/^\s*(?:\d{1,3}|[a-d]\d{1,2})\s*[-.)]\s*/i, '').replace(/^\d{2}\s+/, '').trim();
    const partes = nombre.split(/\s+[-–—]\s+/);
    if (partes.length >= 2) return { artista: partes[0].trim(), titulo: partes.slice(1).join(' - ').trim() };
    const dir = carpeta(ruta).replace(/_/g, ' ');
    const deDir = dir.split(/\s+[-–—]\s+/);
    return { artista: deDir.length >= 2 ? deDir[0].replace(/^\d{4}\s*/, '').trim() : '', titulo: nombre };
  }

  const codificar = (datos) => Buffer.from(JSON.stringify(datos)).toString('base64url');
  const decodificar = (id) => { try { return JSON.parse(Buffer.from(String(id), 'base64url').toString()); } catch { return null; } };

  function puntuar(r, palabras) {
    const texto = normal(`${carpeta(r.archivo)} ${baseName(r.archivo)}`);
    const aciertos = palabras.filter((p) => texto.includes(p)).length;
    if (aciertos < palabras.length) return 0;
    let p = 50 + PREFERENCIA[r.ext] * 3;
    if (r.kbps >= 256 || r.ext === '.flac') p += 6;
    else if (r.kbps && r.kbps < 160) p -= 8;
    if (r.libre) p += 10;
    p -= Math.min(15, (r.cola || 0) / 2);
    p += Math.min(8, Math.log10(1 + (r.velocidad || 0) / 1000) * 3);
    if (/\b(remix|live|karaoke|instrumental|sped ?up|slowed|nightcore)\b/.test(texto) && !palabras.some((w) => /remix|live|karaoke|instrumental/.test(w))) p -= 10;
    return p;
  }

  async function buscar(q) {
    const clave = normal(q).trim();
    const guardada = busquedas.get(clave);
    if (guardada && Date.now() - guardada.at < 10 * 60000) return guardada.resultados;
    // slskd solo deja empezar una búsqueda a la vez: se ponen en fila
    const hecho = turno.then(async () => {
      const id = crypto.randomUUID();
      // searchTimeout va en MILISEGUNDOS (con 8 la búsqueda se cerraba al instante y nunca había resultados)
      await slskdJson('/searches', { method: 'POST', body: { id, searchText: q, searchTimeout: CFG.tiempoBusqueda, responseLimit: 120, fileLimit: 5000, filterResponses: true } });
      const hasta = Date.now() + CFG.esperaBusqueda;
      while (Date.now() < hasta) {
        await dormir(CFG.pausa);
        const estado = await slskdJson(`/searches/${id}`).catch(() => null);
        if (campo(estado, 'isComplete') || /Completed/.test(String(campo(estado, 'state') || ''))) break;
      }
      const respuestas = (await slskdJson(`/searches/${id}/responses`).catch(() => [])) || [];
      slskd(`/searches/${id}`, { method: 'DELETE' }).catch(() => {});
      return respuestas;
    });
    turno = hecho.catch(() => {});
    const respuestas = await hecho;
    const palabras = normal(q).split(/\s+/).filter((w) => w.length > 1);
    const vistos = new Map();
    respuestas.forEach((resp) => {
      const usuario = campo(resp, 'username');
      (campo(resp, 'files') || []).forEach((f) => {
        const archivo = campo(f, 'filename');
        const ext = path.extname(baseName(archivo)).toLowerCase();
        const tamano = Number(campo(f, 'size')) || 0;
        const segundos = Number(campo(f, 'length')) || 0;
        if (!(ext in PREFERENCIA) || tamano < 500000 || (segundos && (segundos < 45 || segundos > 1800))) return;
        const r = {
          archivo, usuario, ext, tamano, segundos,
          kbps: Number(campo(f, 'bitRate')) || 0,
          libre: Boolean(campo(resp, 'hasFreeUploadSlot')),
          cola: Number(campo(resp, 'queueLength')) || 0,
          velocidad: Number(campo(resp, 'uploadSpeed')) || 0
        };
        r.puntos = puntuar(r, palabras);
        if (!r.puntos) return;
        const { artista, titulo } = adivinar(archivo);
        // La misma canción de varias personas: se muestra la mejor copia y se guardan las siguientes
        // para pedirlas a la vez (gana la que empiece antes) o si la primera falla
        const huella = `${normal(artista)}|${normal(titulo)}`;
        if (!vistos.has(huella)) vistos.set(huella, []);
        vistos.get(huella).push({ ...r, artista, titulo });
      });
    });
    const resultados = [...vistos.values()].map((copias) => copias.sort((a, b) => b.puntos - a.puntos))
      .sort((a, b) => b[0].puntos - a[0].puntos).slice(0, 40).map((copias) => {
        const r = copias[0];
        // Las copias de otras personas (la misma persona no cuenta dos veces)
        const usuarios = new Set();
        const c = copias.filter((x) => !usuarios.has(x.usuario) && usuarios.add(x.usuario)).slice(0, 3)
          .map((x) => ({ u: x.usuario, f: x.archivo, s: x.tamano }));
        return {
          id: codificar({ c, t: r.titulo, a: r.artista, al: carpeta(r.archivo), seg: r.segundos }),
          titulo: r.titulo, artista: r.artista, album: carpeta(r.archivo), ext: r.ext.slice(1), kbps: r.kbps,
          segundos: r.segundos, tamano: r.tamano, usuario: r.usuario, libre: r.libre, cola: r.cola, velocidad: r.velocidad,
          copias: c.length
        };
      });
    // Una búsqueda vacía no se recuerda: repetirla puede dar resultados (gente que se conecta, red lenta)
    if (resultados.length) busquedas.set(clave, { at: Date.now(), resultados });
    if (busquedas.size > 200) busquedas.delete(busquedas.keys().next().value);
    return resultados;
  }

  /* ---------- Memoria: cada canción pedida se recuerda siempre; su archivo es solo caché ----------
     memoria[recId] = { t, a, al, seg, c: [copias {u,f,s}], rel (ruta en musica/ o null), ok (llegó alguna
     vez), alta, uso (última vez que sonó) }. Si el archivo se borra por no sonar, la canción sigue en la
     biblioteca de Liquid y, al tocarla, /cancion/<recId> la vuelve a pedir a Soulseek. */
  const MEMORIA = path.join(CFG.datos, 'memoria.json');
  const PEDIDOS = path.join(CFG.datos, 'pedidos.json');
  const leerJson = (ruta) => { try { return JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch { return {}; } };
  const memoria = leerJson(MEMORIA);
  // id de búsqueda (lo que guarda Liquid) → recId
  const pedidos = leerJson(PEDIDOS);
  let guardando = null;
  function guardar() {
    // Varias escrituras seguidas se juntan en una
    if (guardando) return guardando;
    guardando = new Promise((ok) => setTimeout(ok, 50)).then(async () => {
      guardando = null;
      await fsp.mkdir(CFG.datos, { recursive: true });
      await fsp.writeFile(MEMORIA, JSON.stringify(memoria));
      await fsp.writeFile(PEDIDOS, JSON.stringify(pedidos));
    }).catch(() => {});
    return guardando;
  }

  const recIdDe = (t, a) => crypto.createHash('sha1').update(`skd:${normal(a)}|${normal(t)}`).digest('hex').slice(0, 16);
  // Ids de antes (una sola copia: {u,f,s}) y de ahora ({c:[…], t, a, al, seg})
  function leerPedido(id) {
    const d = decodificar(id);
    const c = (Array.isArray(d?.c) ? d.c : [d]).filter((x) => x?.u && x?.f && x.s > 0).slice(0, 5);
    if (!c.length) return null;
    const adiv = adivinar(c[0].f);
    return { c, t: d.t || adiv.titulo, a: d.a ?? adiv.artista, al: d.al || carpeta(c[0].f), seg: Number(d.seg) || 0 };
  }
  // pedidos.json de la versión anterior guardaba {u,f,s,at}: se pasa a la memoria
  for (const [id, v] of Object.entries(pedidos)) {
    if (typeof v === 'string') continue;
    const d = v && leerPedido(codificar({ c: [{ u: v.u, f: v.f, s: v.s }] }));
    if (!d) { delete pedidos[id]; continue; }
    const recId = recIdDe(d.t, d.a);
    memoria[recId] ||= { ...d, rel: null, ok: false, alta: v.at || Date.now(), uso: v.at || Date.now() };
    pedidos[id] = recId;
  }

  /* ---------- Descargas: varias copias a la vez, gana la primera que empieza ---------- */
  // recId → { copias: [{u,f,s,desde}], siguiente: índice de la próxima copia sin probar, cancelado: bool }
  const activas = new Map();

  async function pedirCopia(c) {
    let res = await slskd(`/transfers/downloads/${encodeURIComponent(c.u)}`, { method: 'POST', body: [{ filename: c.f, size: c.s }] });
    // Versiones nuevas: por lotes
    if (res.status === 404 || res.status === 405) res = await slskd('/transfers/downloads/batches', { method: 'POST', body: { username: c.u, files: [{ filename: c.f, size: c.s }] } });
    if (!res.ok && res.status !== 207) throw Object.assign(new Error(res.status === 404 ? 'Esa persona ya no está conectada a Soulseek' : `slskd no aceptó la descarga (HTTP ${res.status})`), { status: 502 });
  }

  // Pide las siguientes `cuantas` copias sin probar. Devuelve cuántas aceptó slskd.
  async function sumarCopias(recId, cuantas) {
    const rec = memoria[recId];
    const a = activas.get(recId);
    let aceptadas = 0;
    let ultimoError = null;
    while (aceptadas < cuantas && a.siguiente < rec.c.length) {
      const c = rec.c[a.siguiente++];
      try { await pedirCopia(c); a.copias.push({ ...c, desde: Date.now() }); aceptadas++; } catch (e) { ultimoError = e; }
    }
    if (!a.copias.length && ultimoError) throw ultimoError;
    return aceptadas;
  }

  // Empieza a bajar una canción (si no está bajando ya): las dos mejores copias a la vez
  async function lanzar(recId) {
    if (activas.has(recId)) return;
    activas.set(recId, { copias: [], siguiente: 0, cancelado: false });
    try { await sumarCopias(recId, 2); } catch (e) { activas.delete(recId); throw e; }
  }

  // Estados de slskd (banderas): «Queued», «InProgress», «Completed, Succeeded», «Completed, Errored»…
  function estadoDe(t) {
    const s = String(campo(t, 'state') ?? '');
    const n = Number(s);
    const tiene = (nombre, bit) => (Number.isFinite(n) && s !== '' ? Boolean(n & bit) : s.includes(nombre));
    if (tiene('Succeeded', 32)) return 'lista';
    if (tiene('Completed', 16)) return 'fallo';
    if (tiene('InProgress', 8) || tiene('Initializing', 4)) return 'bajando';
    return 'en-cola';
  }

  async function transferencia(c, cache) {
    if (!cache.has(c.u)) cache.set(c.u, await slskdJson(`/transfers/downloads/${encodeURIComponent(c.u)}`).catch(() => null));
    const archivos = (campo(cache.get(c.u), 'directories') || []).flatMap((d) => campo(d, 'files') || []);
    return archivos.filter((x) => campo(x, 'filename') === c.f).pop() || null;
  }

  function cancelarCopia(c, t) {
    const tid = campo(t, 'id');
    if (tid) slskd(`/transfers/downloads/${encodeURIComponent(c.u)}/${encodeURIComponent(tid)}?remove=true`, { method: 'DELETE' }).catch(() => {});
  }

  // Mira cómo va la descarga de una canción y decide: cancelar las copias que perdieron la carrera,
  // probar la siguiente copia si todas fallan o ninguna arranca, o dar la canción por lista.
  async function revisar(recId, cache = new Map()) {
    const rec = memoria[recId];
    const a = activas.get(recId);
    if (!a) return rec.rel ? { estado: 'lista', porcentaje: 100 } : { estado: 'fallo', motivo: 'No se está bajando' };
    const filas = [];
    for (const c of a.copias) filas.push({ c, t: await transferencia(c, cache) });
    filas.forEach((x) => { x.estado = x.t ? estadoDe(x.t) : 'en-cola'; x.pct = Number(campo(x.t, 'percentComplete')) || 0; });

    const lista = filas.find((x) => x.estado === 'lista');
    if (lista) {
      const hit = await archivoDe(lista.c);
      if (hit) {
        filas.filter((x) => x !== lista && x.t).forEach((x) => cancelarCopia(x.c, x.t));
        activas.delete(recId);
        // La primera vez que llega, sus etiquetas (si las tiene) mandan sobre lo adivinado por el nombre
        if (!rec.ok) {
          const meta = await leerEtiquetas(path.resolve(CFG.musica, hit), lista.c.s).catch(() => ({}));
          if (meta.titulo) rec.t = meta.titulo;
          if (meta.artista) rec.a = meta.artista;
          if (meta.segundos) rec.seg = Math.round(meta.segundos);
        }
        Object.assign(rec, { rel: hit, ok: true, uso: Date.now(), ganadora: lista.c });
        guardar();
        return { estado: 'lista', porcentaje: 100 };
      }
      // slskd ya terminó pero aún lo está moviendo a la carpeta de descargas
      return { estado: 'bajando', porcentaje: 99, copia: lista.c };
    }
    const bajando = filas.filter((x) => x.estado === 'bajando').sort((x, y) => y.pct - x.pct)[0];
    if (bajando) {
      // Ganó la carrera: las demás copias sobran
      if (!a.cancelado) {
        a.cancelado = true;
        filas.filter((x) => x !== bajando && x.t).forEach((x) => cancelarCopia(x.c, x.t));
        a.copias = [bajando.c];
      }
      return { estado: 'bajando', porcentaje: Math.round(bajando.pct), copia: bajando.c };
    }
    const vivas = filas.filter((x) => x.estado !== 'fallo');
    const quedan = a.siguiente < rec.c.length;
    // Todas fallaron, o ninguna arrancó a tiempo: se suma la siguiente copia
    const lentas = vivas.length && vivas.every((x) => Date.now() - x.c.desde > CFG.esperaCopia);
    if (quedan && (!vivas.length || (lentas && a.copias.length < 3))) {
      a.copias = vivas.map((x) => x.c);
      await sumarCopias(recId, 1).catch(() => {});
      return { estado: 'en-cola', porcentaje: 0 };
    }
    if (!vivas.length) {
      activas.delete(recId);
      const motivo = filas.map((x) => String(campo(x.t, 'exception') || '')).find(Boolean) || 'Ninguna copia se pudo bajar';
      return { estado: 'fallo', motivo };
    }
    return { estado: 'en-cola', porcentaje: 0 };
  }

  async function pedir(id) {
    const d = leerPedido(id);
    if (!d) throw Object.assign(new Error('Pedido no válido'), { status: 400 });
    const recId = recIdDe(d.t, d.a);
    const rec = memoria[recId];
    if (rec) {
      // Ya la conocemos: se suman las copias nuevas y se reutiliza su archivo si sigue en disco
      for (const c of d.c) if (!rec.c.some((x) => x.u === c.u && x.f === c.f)) rec.c.push(c);
    } else memoria[recId] = { ...d, rel: null, ok: false, alta: Date.now(), uso: Date.now() };
    pedidos[id] = recId;
    if (!(await enDisco(memoria[recId]))) await lanzar(recId);
    await guardar();
    return { id, estado: 'en-cola', porcentaje: 0 };
  }

  async function estadoPedidos(ids) {
    const cache = new Map();
    const salida = [];
    for (const id of ids) {
      const recId = pedidos[id];
      const rec = memoria[recId];
      if (!rec) { salida.push({ id, estado: 'desconocido' }); continue; }
      if (!activas.has(recId) && await enDisco(rec)) { salida.push({ id, estado: 'lista', porcentaje: 100, cancion: filaRec(recId) }); continue; }
      const r = await revisar(recId, cache);
      const fila = { id, estado: r.estado, porcentaje: r.porcentaje ?? 0 };
      if (r.estado === 'lista') fila.cancion = filaRec(recId);
      if (r.motivo) fila.motivo = r.motivo;
      salida.push(fila);
    }
    return salida;
  }

  /* ---------- Biblioteca: lo descargado, con sus etiquetas y duración ---------- */
  const INDICE = path.join(CFG.datos, 'indice.json');
  let indice = {};
  try { indice = JSON.parse(fs.readFileSync(INDICE, 'utf8')); } catch { indice = {}; }
  let escaneo = null;
  let ultimoEscaneo = 0;

  async function recorrer(dir, salida = []) {
    let entradas;
    try { entradas = await fsp.readdir(dir, { withFileTypes: true }); } catch { return salida; }
    for (const e of entradas) {
      if (e.name.startsWith('.')) continue;
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) await recorrer(ruta, salida);
      else if (AUDIO[path.extname(e.name).toLowerCase()]) salida.push(ruta);
    }
    return salida;
  }

  async function escanear(forzar = false) {
    if (escaneo) return escaneo;
    if (!forzar && Date.now() - ultimoEscaneo < 5000) return indice;
    escaneo = (async () => {
      const archivos = await recorrer(CFG.musica);
      const nuevo = {};
      for (const ruta of archivos) {
        const rel = path.relative(CFG.musica, ruta).split(path.sep).join('/');
        let st;
        try { st = await fsp.stat(ruta); } catch { continue; }
        const antes = indice[rel];
        if (antes && antes.m === st.mtimeMs && antes.b === st.size) { nuevo[rel] = antes; continue; }
        const meta = await leerEtiquetas(ruta, st.size).catch(() => ({}));
        const adiv = adivinar(rel);
        nuevo[rel] = { m: st.mtimeMs, b: st.size, t: meta.titulo || adiv.titulo, a: meta.artista || adiv.artista, al: meta.album || '', s: Math.round(meta.segundos || 0) };
      }
      indice = nuevo;
      ultimoEscaneo = Date.now();
      await fsp.mkdir(CFG.datos, { recursive: true }).catch(() => {});
      await fsp.writeFile(INDICE, JSON.stringify(indice)).catch(() => {});
      return indice;
    })().finally(() => { escaneo = null; });
    return escaneo;
  }

  const idDe = (rel) => crypto.createHash('sha1').update(rel).digest('hex').slice(0, 16);
  const duracion = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
  const urlDe = (rel) => `${CFG.publico}/musica/${rel.split('/').map(encodeURIComponent).join('/')}?k=${encodeURIComponent(CFG.clave)}`;
  function fila(rel, d) {
    return { id: idDe(rel), title: d.t || 'Sin título', artist: d.a || '', album: '', duration: duracion(d.s), src: urlDe(rel), size: d.b };
  }
  // Las canciones de Soulseek van por /cancion/<recId>: si su archivo se borró, esa dirección la vuelve a bajar
  function filaRec(recId) {
    // Título, artista y duración salen de la memoria: no cambian aunque el archivo se borre y vuelva
    const r = memoria[recId];
    return {
      id: recId, title: r.t || 'Sin título', artist: r.a || '', album: '', duration: duracion(r.seg),
      src: `${CFG.publico}/cancion/${recId}?k=${encodeURIComponent(CFG.clave)}`, size: r.ganadora?.s || r.c[0].s
    };
  }
  async function lista() {
    const idx = await escanear();
    const deMemoria = new Set(Object.values(memoria).map((r) => r.rel).filter(Boolean));
    // Lo que pusiste tú a mano en musica/ (no vino de un pedido): se sirve tal cual y nunca se borra
    const propias = Object.entries(idx).filter(([rel]) => !deMemoria.has(rel)).map(([rel, d]) => ({ at: d.m, fila: fila(rel, d) }));
    const recordadas = Object.entries(memoria).filter(([, r]) => r.ok).map(([recId, r]) => ({ at: r.alta, fila: filaRec(recId) }));
    return [...propias, ...recordadas].sort((a, b) => b.at - a.at).map((x) => x.fila);
  }
  // ¿Sigue su archivo en disco?
  async function enDisco(rec) {
    if (!rec.rel) return false;
    try { await fsp.access(path.resolve(CFG.musica, rec.rel)); return true; } catch { rec.rel = null; return false; }
  }
  // Dónde dejó slskd una copia ya terminada (ruta relativa a musica/)
  async function archivoDe(c) {
    const nombre = baseName(c.f);
    const encontrar = (idx) => (Object.entries(idx).find(([rel, d]) => baseName(rel) === nombre && d.b === c.s)
      || Object.entries(idx).find(([rel]) => baseName(rel) === nombre))?.[0];
    return encontrar(indice) || encontrar(await escanear(true)) || null;
  }
  // La copia a medias en la carpeta de slskd (para sonar mientras baja)
  async function aMedias(c) {
    if (!CFG.incompleto) return null;
    const nombre = baseName(c.f);
    const hallados = (await recorrer(CFG.incompleto)).filter((r) => path.basename(r) === nombre);
    for (const ruta of hallados) {
      try { const st = await fsp.stat(ruta); if (st.size <= c.s) return ruta; } catch { /* se movió */ }
    }
    return null;
  }

  /* ---------- Limpieza de la caché ---------- */
  async function quitarVacias(dir) {
    while (dir.startsWith(CFG.musica + path.sep)) {
      try { if ((await fsp.readdir(dir)).length) return; await fsp.rmdir(dir); } catch { return; }
      dir = path.dirname(dir);
    }
  }
  // Borra los archivos de Soulseek que llevan más de CACHE_HORAS sin sonar. Nunca toca lo que pusiste a mano.
  async function limpiar(ahora = Date.now()) {
    if (!(CFG.cacheHoras > 0)) return { borradas: 0, libres: 0 };
    let borradas = 0;
    let libres = 0;
    for (const [recId, r] of Object.entries(memoria)) {
      if (!r.rel || activas.has(recId) || ahora - (r.uso || r.alta) < CFG.cacheHoras * 3600000) continue;
      const ruta = path.resolve(CFG.musica, r.rel);
      if (!ruta.startsWith(CFG.musica + path.sep)) continue;
      try {
        const st = await fsp.stat(ruta);
        await fsp.unlink(ruta);
        borradas++;
        libres += st.size;
      } catch { /* ya no estaba */ }
      delete indice[r.rel];
      r.rel = null;
      await quitarVacias(path.dirname(ruta));
    }
    if (borradas) {
      await guardar();
      await fsp.writeFile(INDICE, JSON.stringify(indice)).catch(() => {});
      // slskd también recuerda las descargas terminadas: se limpia su lista
      slskd('/transfers/downloads/all/completed', { method: 'DELETE' }).catch(() => {});
    }
    return { borradas, libres };
  }

  /* ---------- HTTP ---------- */
  function cabecerasCors(req) {
    const origen = req.headers.origin;
    const permitido = origen && (CFG.origenes.includes('*') || CFG.origenes.includes(origen)) ? origen : CFG.origenes[0];
    return {
      'Access-Control-Allow-Origin': CFG.origenes.includes('*') ? '*' : permitido,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
      'Access-Control-Max-Age': '86400',
      // Chrome pide permiso explícito cuando una web pública (GitHub Pages) llama a esta PC por localhost
      ...(req.headers['access-control-request-private-network'] ? { 'Access-Control-Allow-Private-Network': 'true' } : {}),
      Vary: 'Origin'
    };
  }
  function autorizado(req, url) {
    const dada = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('k') || '';
    const a = Buffer.from(dada);
    const b = Buffer.from(CFG.clave);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  function json(res, cors, codigo, datos) {
    res.writeHead(codigo, { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(datos));
  }
  async function leerCuerpo(req) {
    let datos = '';
    for await (const trozo of req) { datos += trozo; if (datos.length > 100000) throw Object.assign(new Error('Demasiado grande'), { status: 413 }); }
    return datos ? JSON.parse(datos) : {};
  }

  async function servirAudio(req, res, cors, rel) {
    const ruta = path.resolve(CFG.musica, rel);
    if (!ruta.startsWith(CFG.musica + path.sep)) return json(res, cors, 403, { error: 'Ruta no permitida' });
    let st;
    try { st = await fsp.stat(ruta); } catch { return json(res, cors, 404, { error: 'No existe' }); }
    const tipo = AUDIO[path.extname(ruta).toLowerCase()] || 'application/octet-stream';
    const rango = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    let inicio = 0;
    let fin = st.size - 1;
    if (rango) {
      if (rango[1]) { inicio = Number(rango[1]); if (rango[2]) fin = Math.min(Number(rango[2]), st.size - 1); }
      else if (rango[2]) inicio = Math.max(0, st.size - Number(rango[2]));
      if (inicio >= st.size || inicio > fin) {
        res.writeHead(416, { ...cors, 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
    }
    res.writeHead(rango ? 206 : 200, {
      ...cors, 'Content-Type': tipo, 'Accept-Ranges': 'bytes', 'Content-Length': String(fin - inicio + 1),
      'Cache-Control': 'private, max-age=86400', ...(rango ? { 'Content-Range': `bytes ${inicio}-${fin}/${st.size}` } : {})
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(ruta, { start: inicio, end: fin }).pipe(res);
  }

  // Suena mientras baja: se envía lo que ya hay de la copia a medias y se espera a que crezca.
  // Como se sabe el tamaño final, el navegador recibe la duración y la barra de progreso desde el principio.
  async function servirCreciendo(req, res, cors, recId, c) {
    const total = c.s;
    const rango = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    const inicio = rango && rango[1] ? Number(rango[1]) : 0;
    if (inicio >= total) { res.writeHead(416, { ...cors, 'Content-Range': `bytes */${total}` }); return res.end(); }
    const tipo = AUDIO[path.extname(baseName(c.f)).toLowerCase()] || 'application/octet-stream';
    res.writeHead(206, { ...cors, 'Content-Type': tipo, 'Accept-Ranges': 'bytes', 'Content-Length': String(total - inicio),
      'Content-Range': `bytes ${inicio}-${total - 1}/${total}`, 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    let cerrado = false;
    res.on('close', () => { cerrado = true; });
    let pos = inicio;
    let quieto = Date.now();
    const trozo = Buffer.alloc(256 * 1024);
    while (!cerrado && pos < total) {
      // A medias en la carpeta de slskd o, al terminar, ya movida a musica/ (revisar() apunta su ruta)
      const rel = memoria[recId].rel;
      const ruta = (await aMedias(c)) || (rel ? path.resolve(CFG.musica, rel) : null);
      let leidos = 0;
      if (ruta) {
        try {
          const fh = await fsp.open(ruta, 'r');
          try { ({ bytesRead: leidos } = await fh.read(trozo, 0, Math.min(trozo.length, total - pos), pos)); } finally { await fh.close(); }
        } catch { leidos = 0; }
      }
      if (leidos > 0) {
        pos += leidos;
        quieto = Date.now();
        if (!res.write(Buffer.from(trozo.subarray(0, leidos)))) await new Promise((ok) => res.once('drain', ok));
        continue;
      }
      if (Date.now() - quieto > 60000) break;
      if (activas.has(recId)) await revisar(recId).catch(() => {});
      await dormir(400);
    }
    if (pos >= total) res.end(); else res.destroy();
  }

  // /cancion/<recId>: la canción desde disco o, si la caché la borró, de vuelta desde Soulseek
  async function servirCancion(req, res, cors, recId) {
    const rec = memoria[recId];
    if (!rec) return json(res, cors, 404, { error: 'No existe' });
    rec.uso = Date.now();
    guardar();
    if (!activas.has(recId) && await enDisco(rec)) return servirAudio(req, res, cors, rec.rel);
    try { await lanzar(recId); } catch (e) { return json(res, cors, 502, { error: e.message }); }
    const hasta = Date.now() + CFG.esperaReproducir;
    while (Date.now() < hasta) {
      const r = await revisar(recId).catch(() => ({ estado: 'en-cola' }));
      if (r.estado === 'lista' && rec.rel) return servirAudio(req, res, cors, rec.rel);
      if (r.estado === 'fallo') return json(res, cors, 502, { error: r.motivo || 'No se pudo bajar' });
      // Con 256 KB (o el 10 % si es más pequeña) ya hay para empezar a sonar
      if (r.estado === 'bajando' && r.copia) {
        const medio = await aMedias(r.copia);
        const st = medio && await fsp.stat(medio).catch(() => null);
        if (st && st.size >= Math.min(262144, Math.ceil(r.copia.s * 0.1))) return servirCreciendo(req, res, cors, recId, r.copia);
      }
      await dormir(CFG.pausa);
    }
    // Sigue bajando por detrás: la próxima vez que la toques ya estará
    return json(res, cors, 504, { error: 'Soulseek está tardando: sigue bajando y estará lista en un momento' });
  }
  // Lo que suena por /musica/ también cuenta como uso (canciones bajadas antes de esta versión)
  function marcarUso(rel) {
    for (const r of Object.values(memoria)) if (r.rel === rel) { r.uso = Date.now(); guardar(); return; }
  }

  const servidor = http.createServer(async (req, res) => {
    const cors = cabecerasCors(req);
    try {
      const url = new URL(req.url, 'http://puente');
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      if (url.pathname === '/salud') return json(res, cors, 200, { ok: true, nombre: 'Liquid SKd' });
      if (!autorizado(req, url)) return json(res, cors, 401, { error: 'Clave incorrecta' });
      if (url.pathname.startsWith('/musica/') && ['GET', 'HEAD'].includes(req.method)) {
        const rel = decodeURIComponent(url.pathname.slice('/musica/'.length));
        marcarUso(rel);
        return servirAudio(req, res, cors, rel);
      }
      const cancion = /^\/cancion\/([0-9a-f]{16})$/.exec(url.pathname);
      if (cancion && ['GET', 'HEAD'].includes(req.method)) return servirCancion(req, res, cors, cancion[1]);
      if (url.pathname === '/api/estado') {
        const conectado = await slskdJson('/application').then((d) => {
          const server = campo(d, 'server');
          const st = String(campo(server, 'state') ?? '');
          return campo(server, 'isConnected') ?? (st ? /Connected/.test(st) && !/Disconnected/.test(st) : true);
        }).catch(() => false);
        await escanear();
        const lst = await lista();
        const enCache = Object.values(memoria).filter((r) => r.rel).length;
        return json(res, cors, 200, { ok: true, soulseek: Boolean(conectado), canciones: lst.length, cache: { horas: CFG.cacheHoras, enDisco: enCache } });
      }
      if (url.pathname === '/api/buscar') {
        const q = String(url.searchParams.get('q') || '').trim().slice(0, 120);
        if (q.length < 2) return json(res, cors, 400, { error: 'Escribe al menos 2 letras' });
        return json(res, cors, 200, { resultados: await buscar(q) });
      }
      if (url.pathname === '/api/pedir' && req.method === 'POST') {
        const { id } = await leerCuerpo(req);
        return json(res, cors, 200, await pedir(id));
      }
      if (url.pathname === '/api/pedidos') {
        const ids = String(url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 50);
        return json(res, cors, 200, { pedidos: await estadoPedidos(ids) });
      }
      if (url.pathname === '/api/lista.json') return json(res, cors, 200, await lista());
      return json(res, cors, 404, { error: 'No existe' });
    } catch (error) {
      if (!res.headersSent) json(res, cors, error.status || 500, { error: error.message || 'Error' });
      else res.destroy();
    }
  });
  return { servidor, escanear, buscar, limpiar, CFG };
}

/* ---------- Etiquetas y duración (MP3 con ID3 y FLAC), leyendo solo el principio ---------- */
async function leerEtiquetas(ruta, tamano) {
  const fh = await fsp.open(ruta, 'r');
  try {
    const cabeza = Buffer.alloc(10);
    await fh.read(cabeza, 0, 10, 0);
    if (cabeza.toString('latin1', 0, 4) === 'fLaC') {
      const buf = Buffer.alloc(Math.min(tamano, 1 << 20));
      await fh.read(buf, 0, buf.length, 0);
      return leerFlac(buf);
    }
    let tagLen = 0;
    if (cabeza.toString('latin1', 0, 3) === 'ID3') tagLen = 10 + ((cabeza[6] & 127) << 21 | (cabeza[7] & 127) << 14 | (cabeza[8] & 127) << 7 | (cabeza[9] & 127));
    const buf = Buffer.alloc(Math.min(tamano, Math.min(tagLen, 4 << 20) + 65536));
    await fh.read(buf, 0, buf.length, 0);
    const meta = tagLen ? leerId3(buf, cabeza[3]) : {};
    meta.segundos = duracionMp3(buf, tagLen, tamano);
    return meta;
  } finally {
    await fh.close();
  }
}

function texto(buf) {
  const enc = buf[0];
  const datos = buf.subarray(1);
  let t;
  if (enc === 1 || enc === 2) {
    let d = datos;
    let be = enc === 2;
    if (d[0] === 0xfe && d[1] === 0xff) { be = true; d = d.subarray(2); } else if (d[0] === 0xff && d[1] === 0xfe) { be = false; d = d.subarray(2); }
    if (be) { const sw = Buffer.from(d); for (let i = 0; i + 1 < sw.length; i += 2) { const x = sw[i]; sw[i] = sw[i + 1]; sw[i + 1] = x; } d = sw; }
    t = d.toString('utf16le');
  } else t = enc === 3 ? datos.toString('utf8') : datos.toString('latin1');
  return t.replace(/\0[\s\S]*$/, '').trim();
}

function leerId3(buf, version) {
  const meta = {};
  const fin = 10 + ((buf[6] & 127) << 21 | (buf[7] & 127) << 14 | (buf[8] & 127) << 7 | (buf[9] & 127));
  let pos = 10;
  if (buf[5] & 0x40) pos += version === 4 ? ((buf[10] & 127) << 21 | (buf[11] & 127) << 14 | (buf[12] & 127) << 7 | (buf[13] & 127)) : 4 + buf.readUInt32BE(10);
  while (pos + 10 <= Math.min(fin, buf.length)) {
    const id = buf.toString('latin1', pos, pos + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const tam = version === 4 ? ((buf[pos + 4] & 127) << 21 | (buf[pos + 5] & 127) << 14 | (buf[pos + 6] & 127) << 7 | (buf[pos + 7] & 127)) : buf.readUInt32BE(pos + 4);
    const cuerpo = buf.subarray(pos + 10, pos + 10 + tam);
    if (id === 'TIT2') meta.titulo = texto(cuerpo);
    if (id === 'TPE1') meta.artista = texto(cuerpo);
    if (id === 'TALB') meta.album = texto(cuerpo);
    pos += 10 + tam;
  }
  return meta;
}

const KBPS = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
const HZ = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };
function duracionMp3(buf, inicio, tamano) {
  for (let pos = inicio; pos + 4 <= buf.length; pos++) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) continue;
    const b1 = buf[pos + 1];
    const b2 = buf[pos + 2];
    const ver = { 3: 1, 2: 2, 0: 25 }[(b1 >> 3) & 3];
    const capa = (b1 >> 1) & 3;
    const bi = b2 >> 4;
    const ri = (b2 >> 2) & 3;
    if (!ver || capa !== 1 || !(bi > 0 && bi < 15) || ri > 2) continue;
    const kbps = KBPS[ver === 1 ? 1 : 2][bi];
    const hz = HZ[ver][ri];
    const muestras = ver === 1 ? 1152 : 576;
    const mono = (buf[pos + 3] >> 6) === 3;
    const x = pos + 4 + (ver === 1 ? (mono ? 17 : 32) : (mono ? 9 : 17));
    const tag = buf.toString('latin1', x, x + 4);
    if ((tag === 'Xing' || tag === 'Info') && buf[x + 7] & 1) return (buf.readUInt32BE(x + 8) * muestras) / hz;
    if (buf.toString('latin1', pos + 36, pos + 40) === 'VBRI') return (buf.readUInt32BE(pos + 50) * muestras) / hz;
    return ((tamano - pos) * 8) / (kbps * 1000);
  }
  return 0;
}

function leerFlac(buf) {
  const meta = {};
  let pos = 4;
  for (;;) {
    if (pos + 4 > buf.length) break;
    const ultimo = buf[pos] & 0x80;
    const tipo = buf[pos] & 0x7f;
    const tam = buf.readUIntBE(pos + 1, 3);
    const b = buf.subarray(pos + 4, pos + 4 + tam);
    if (tipo === 0 && b.length >= 18) {
      const hz = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4);
      const total = (b[13] & 0x0f) * 2 ** 32 + b.readUInt32BE(14);
      if (hz) meta.segundos = total / hz;
    } else if (tipo === 4 && b.length > 8) {
      let p = 4 + b.readUInt32LE(0);
      const n = b.readUInt32LE(p);
      p += 4;
      for (let i = 0; i < n && p + 4 <= b.length; i++) {
        const l = b.readUInt32LE(p);
        const [k, ...v] = b.toString('utf8', p + 4, p + 4 + l).split('=');
        const valor = v.join('=');
        if (/^title$/i.test(k)) meta.titulo = valor;
        if (/^artist$/i.test(k)) meta.artista ||= valor;
        if (/^album$/i.test(k)) meta.album = valor;
        p += 4 + l;
      }
    }
    pos += 4 + tam;
    if (ultimo) break;
  }
  return meta;
}

// Arranque normal (node server.mjs). pathToFileURL: en Windows la ruta es file:///C:/… y no file://C:\…
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { servidor, escanear, limpiar, CFG } = crearPuente();
  const puerto = Number(process.env.PUERTO || 8787);
  // HOST=127.0.0.1 en tu PC: solo entra el túnel (Tailscale Funnel), no la red de casa
  servidor.listen(puerto, process.env.HOST || undefined, () => {
    console.log(`[Liquid SKd] Puente en el puerto ${puerto}. Música en ${CFG.musica}. Público: ${CFG.publico || '(sin PUBLICO)'}`);
    escanear(true).then((idx) => console.log(`[Liquid SKd] ${Object.keys(idx).length} archivos en musica/.`));
    if (CFG.cacheHoras > 0) {
      console.log(`[Liquid SKd] Caché: lo que lleve ${CFG.cacheHoras} h sin sonar se borra (y vuelve a bajar si lo tocas).`);
      const ronda = () => limpiar().then(({ borradas, libres }) => {
        if (borradas) console.log(`[Liquid SKd] Limpieza: ${borradas} canciones borradas, ${(libres / 1048576).toFixed(1)} MB libres.`);
      }).catch((e) => console.error('[Liquid SKd] Limpieza:', e.message));
      setTimeout(ronda, 60000);
      setInterval(ronda, 30 * 60000);
    }
  });
}
