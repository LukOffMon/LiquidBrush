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
    esperaCopia: Number(env.ESPERA_COPIA_MS || 15000),
    // Tope de disco para lo bajado de Soulseek (0 = sin tope): se borra lo menos escuchado (nunca lo fijado)
    discoMaxBytes: Number(env.DISCO_MAX_GB || 0) * 1073741824,
    // Portadas que no trae el archivo: se buscan en iTunes por artista y título (PORTADAS_ITUNES=0 lo apaga)
    portadasItunes: env.PORTADAS_ITUNES !== '0',
    itunes: String(env.ITUNES_URL || 'https://itunes.apple.com').replace(/\/+$/, ''),
    // Modo abierto (PUBLICO_ABIERTO=1): quien tenga CUENTA de Liquid busca, pide y escucha sin tu clave.
    // Sin cuenta, nada. Descargas nuevas por cuenta y día, y un tope total al día para proteger tu PC.
    abierto: env.PUBLICO_ABIERTO === '1',
    cuentas: String(env.CUENTAS_URL || 'https://liquid-cuentas.liquidbulletofficial.workers.dev').replace(/\/+$/, ''),
    cupoDia: Number(env.CUPO_DIA || 5),
    cupoTotalDia: Number(env.CUPO_TOTAL_DIA || 100),
    busquedasDia: Number(env.BUSQUEDAS_DIA || 80)
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
        // A su sitio (Artista/Álbum/Título) y con portada
        await ordenar(rec);
        ponerPortada(recId).catch(() => {});
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

  async function estadoPedidos(ids, conClave = false) {
    const cache = new Map();
    const salida = [];
    for (const id of ids) {
      const recId = pedidos[id];
      const rec = memoria[recId];
      if (!rec) { salida.push({ id, estado: 'desconocido' }); continue; }
      if (!activas.has(recId) && await enDisco(rec)) { salida.push({ id, estado: 'lista', porcentaje: 100, cancion: filaRec(recId, conClave) }); continue; }
      const r = await revisar(recId, cache);
      const fila = { id, estado: r.estado, porcentaje: r.porcentaje ?? 0 };
      if (r.estado === 'lista') fila.cancion = filaRec(recId, conClave);
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
  // Las canciones de Soulseek van por /cancion/<recId>: si su archivo se borró, esa dirección la vuelve a bajar.
  // Sin clave en la URL: así la lista se puede dar a todos (la clave es solo para gestionar y tu música propia).
  // conClave: solo en modo privado (sin modo público, el reproductor no puede mandar la clave en una cabecera)
  function filaRec(recId, conClave = false) {
    // Título, artista y duración salen de la memoria: no cambian aunque el archivo se borre y vuelva
    const r = memoria[recId];
    const f = {
      id: recId, title: r.t || 'Sin título', artist: r.a || '', album: r.al && !/^[@\\/]|\\/.test(r.al) && !GENERICAS.test(normal(r.al).trim()) ? r.al : '', duration: duracion(r.seg),
      src: `${CFG.publico}/cancion/${recId}${conClave ? `?k=${encodeURIComponent(CFG.clave)}` : ''}`, size: r.ganadora?.s || r.c[0].s,
      skd: { fijada: Boolean(r.fijada), enDisco: Boolean(r.rel), alta: r.alta, uso: r.uso }
    };
    if (r.portada) f.cover = `${CFG.publico}/portada/${recId}?v=${r.portada}`;
    return f;
  }
  // dueno = con tu clave: también lo que pusiste tú a mano en musica/ (eso nunca se da a otros ni se borra)
  async function lista(dueno = true) {
    const idx = await escanear();
    const deMemoria = new Set(Object.values(memoria).map((r) => r.rel).filter(Boolean));
    const propias = dueno ? Object.entries(idx).filter(([rel]) => !deMemoria.has(rel)).map(([rel, d]) => ({ at: d.m, fila: fila(rel, d) })) : [];
    const recordadas = Object.entries(memoria).filter(([, r]) => r.ok).map(([recId, r]) => ({ at: r.alta, fila: filaRec(recId, dueno && !CFG.abierto) }));
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
  // Borra el archivo de una canción de Soulseek (la canción sigue en la memoria: vuelve a bajar si se toca)
  async function borrarArchivo(r) {
    if (!r.rel) return 0;
    const ruta = path.resolve(CFG.musica, r.rel);
    let libres = 0;
    if (ruta.startsWith(CFG.musica + path.sep)) {
      try { libres = (await fsp.stat(ruta)).size; await fsp.unlink(ruta); } catch { /* ya no estaba */ }
      await quitarVacias(path.dirname(ruta));
    }
    delete indice[r.rel];
    r.rel = null;
    return libres;
  }

  // Limpieza: (1) lo que lleva CACHE_HORAS sin sonar; (2) si aun así se pasa de DISCO_MAX_GB, lo menos
  // escuchado primero. Nunca toca lo fijado ni lo que pusiste tú a mano. De paso, ordena las carpetas.
  async function limpiar(ahora = Date.now()) {
    let borradas = 0;
    let libres = 0;
    const candidatas = () => Object.entries(memoria).filter(([recId, r]) => r.rel && !r.fijada && !activas.has(recId));
    if (CFG.cacheHoras > 0) {
      for (const [, r] of candidatas()) {
        if (ahora - (r.uso || r.alta) < CFG.cacheHoras * 3600000) continue;
        libres += await borrarArchivo(r);
        borradas++;
      }
    }
    if (CFG.discoMaxBytes > 0) {
      let usado = 0;
      for (const r of Object.values(memoria)) if (r.rel) usado += indice[r.rel]?.b || r.ganadora?.s || 0;
      const porUso = candidatas().sort((a, b) => (a[1].uso || a[1].alta) - (b[1].uso || b[1].alta));
      for (const [, r] of porUso) {
        if (usado <= CFG.discoMaxBytes) break;
        const l = await borrarArchivo(r);
        usado -= l;
        libres += l;
        borradas++;
      }
    }
    const movidas = await ordenarTodo();
    if (borradas || movidas) {
      await guardar();
      await fsp.writeFile(INDICE, JSON.stringify(indice)).catch(() => {});
    }
    // slskd también recuerda las descargas terminadas: se limpia su lista
    if (borradas) slskd('/transfers/downloads/all/completed', { method: 'DELETE' }).catch(() => {});
    buscarPortadasQueFaltan().catch(() => {});
    return { borradas, libres, movidas };
  }

  /* ---------- Portadas: datos/portadas/<recId>.jpg ---------- */
  const PORTADAS = path.join(CFG.datos, 'portadas');
  const rutaPortada = (recId) => path.join(PORTADAS, `${recId}.img`);
  const intentosPortada = new Map();
  async function guardarPortada(recId, datos) {
    if (!datos || datos.length < 512 || datos.length > 8 * 1048576) return false;
    await fsp.mkdir(PORTADAS, { recursive: true });
    await fsp.writeFile(rutaPortada(recId), datos);
    memoria[recId].portada = crypto.createHash('sha1').update(datos).digest('hex').slice(0, 8);
    guardar();
    return true;
  }
  // 1) la que trae el archivo (ID3 APIC o FLAC PICTURE); 2) iTunes por artista + título
  async function ponerPortada(recId) {
    const r = memoria[recId];
    if (!r || r.portada) return;
    if (r.rel) {
      const ruta = path.resolve(CFG.musica, r.rel);
      const st = await fsp.stat(ruta).catch(() => null);
      if (st && await guardarPortada(recId, await leerPortada(ruta, st.size).catch(() => null))) return;
    }
    if (!CFG.portadasItunes) return;
    // No se insiste: como mucho un intento al día por canción
    if (Date.now() - (intentosPortada.get(recId) || 0) < 86400000) return;
    intentosPortada.set(recId, Date.now());
    const term = `${r.a || ''} ${r.t || ''}`.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').trim();
    if (term.length < 3) return;
    try {
      const res = await fetch(`${CFG.itunes}/search?entity=song&limit=5&term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(10000) });
      const { results = [] } = await res.json();
      // Mejor la que coincide con el artista
      const hit = results.find((x) => normal(x.artistName).includes(normal(r.a).slice(0, 12)) && x.artworkUrl100) || (r.a ? null : results[0]);
      if (!hit?.artworkUrl100) return;
      const img = await fetch(hit.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.'), { signal: AbortSignal.timeout(15000) });
      if (img.ok) await guardarPortada(recId, Buffer.from(await img.arrayBuffer()));
    } catch { /* sin red o sin resultado: otro día */ }
  }
  let buscandoPortadas = false;
  async function buscarPortadasQueFaltan() {
    if (buscandoPortadas) return;
    buscandoPortadas = true;
    try { for (const recId of Object.keys(memoria)) if (memoria[recId].ok && !memoria[recId].portada) await ponerPortada(recId); } finally { buscandoPortadas = false; }
  }

  /* ---------- Orden en disco: musica/Artista/Álbum/NN Título.ext ---------- */
  // Nombres válidos en Windows, macOS y Linux
  // eslint-disable-next-line no-control-regex -- los caracteres de control no valen en nombres de archivo
  const limpioNombre = (t, max = 80) => String(t || '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, max).trim();
  const RESERVADOS = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
  // Carpetas de quien comparte que no son un álbum («musica», «mp3», «Downloads»…)
  const GENERICAS = /^(m[uú]sica|music|musik|mp3s?|flacs?|audio|songs?|canciones|temas|descargas?|downloads?|complete|shared?|compartid[oa]s?|varios|various|misc|new folder|nueva carpeta|\d+)$/i;
  function relOrdenado(r, relActual) {
    const ext = path.extname(relActual).toLowerCase();
    const artista = limpioNombre(r.a) || 'Varios';
    const album = r.al && !/^[@\\/]/.test(r.al) && !GENERICAS.test(normal(r.al).trim()) ? limpioNombre(r.al) : '';
    const titulo = limpioNombre(r.t, 120) || 'Sin título';
    const partes = [RESERVADOS.test(artista) ? `_${artista}` : artista];
    if (album && normal(album) !== normal(artista)) partes.push(RESERVADOS.test(album) ? `_${album}` : album);
    partes.push(`${titulo}${ext}`);
    return partes.join('/');
  }
  // Mueve un archivo de Soulseek a su sitio ordenado (si no lo está ya)
  async function ordenar(r) {
    if (!r.rel) return false;
    const destino = relOrdenado(r, r.rel);
    if (destino === r.rel) return false;
    const desde = path.resolve(CFG.musica, r.rel);
    let hasta = path.resolve(CFG.musica, destino);
    if (!hasta.startsWith(CFG.musica + path.sep)) return false;
    // Dos canciones distintas con el mismo nombre: la segunda lleva « (2)»
    for (let n = 2; fs.existsSync(hasta) && n < 50; n++) hasta = hasta.replace(/( \(\d+\))?(\.[^.]+)$/, ` (${n})$2`);
    try {
      await fsp.mkdir(path.dirname(hasta), { recursive: true });
      await fsp.rename(desde, hasta);
    } catch { return false; }
    const nuevoRel = path.relative(CFG.musica, hasta).split(path.sep).join('/');
    if (indice[r.rel]) { indice[nuevoRel] = indice[r.rel]; delete indice[r.rel]; }
    r.rel = nuevoRel;
    await quitarVacias(path.dirname(desde));
    return true;
  }
  async function ordenarTodo() {
    let n = 0;
    for (const [recId, r] of Object.entries(memoria)) if (r.rel && !activas.has(recId) && await ordenar(r)) n++;
    return n;
  }

  /* ---------- HTTP ---------- */
  function cabecerasCors(req) {
    const origen = req.headers.origin;
    const permitido = origen && (CFG.origenes.includes('*') || CFG.origenes.includes(origen)) ? origen : CFG.origenes[0];
    return {
      'Access-Control-Allow-Origin': CFG.origenes.includes('*') ? '*' : permitido,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Range, X-Liquid-Pase',
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

  /* ---------- Modo público: cupos por persona (dispositivo + IP) y por día ---------- */
  const CUPOS = path.join(CFG.datos, 'cupos.json');
  const hoy = () => new Date().toISOString().slice(0, 10);
  let cupos = leerJson(CUPOS);
  function cuposDeHoy() {
    if (cupos.dia !== hoy()) cupos = { dia: hoy(), descargas: {}, busquedas: {}, total: 0 };
    return cupos;
  }
  const guardarCupos = () => fsp.mkdir(CFG.datos, { recursive: true }).then(() => fsp.writeFile(CUPOS, JSON.stringify(cupos))).catch(() => {});
  // Quién pide: su cuenta de Liquid. Liquid manda el pase de la cuenta (dura 15 min) y aquí se comprueba con
  // el servicio de cuentas (/yo). El puente nunca ve contraseñas ni guarda correos: solo una huella del correo.
  const pasesVistos = new Map();
  const verificarPase = opciones.verificarPase || (async (pase) => {
    const res = await fetch(`${CFG.cuentas}/yo`, { headers: { Authorization: `Bearer ${pase}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const d = await res.json().catch(() => ({}));
    return d?.perfil?.correo || null;
  });
  async function cuentaDe(req) {
    const pase = String(req.headers['x-liquid-pase'] || '');
    if (!pase || pase.length > 2048) return null;
    const visto = pasesVistos.get(pase);
    if (visto && visto.hasta > Date.now()) return visto.u;
    const correo = await verificarPase(pase).catch(() => null);
    if (!correo) return null;
    const u = `c:${crypto.createHash('sha256').update(String(correo).trim().toLowerCase()).digest('hex').slice(0, 24)}`;
    pasesVistos.set(pase, { u, hasta: Date.now() + 5 * 60000 });
    if (pasesVistos.size > 1000) pasesVistos.delete(pasesVistos.keys().next().value);
    return u;
  }
  const quien = (req) => (req.cuenta ? [req.cuenta] : []);
  function restantes(claves) {
    const c = cuposDeHoy();
    const usadas = Math.max(0, ...claves.map((k) => c.descargas[k] || 0));
    return Math.max(0, Math.min(CFG.cupoDia - usadas, CFG.cupoTotalDia - c.total));
  }
  function contar(tipo, claves) {
    const c = cuposDeHoy();
    claves.forEach((k) => { c[tipo][k] = (c[tipo][k] || 0) + 1; });
    if (tipo === 'descargas') c.total++;
    guardarCupos();
  }

  /* ---------- Gestión (solo con tu clave): fijar, quitar, disco ---------- */
  async function quitar(recId) {
    const r = memoria[recId];
    if (!r) return false;
    if (activas.has(recId)) activas.delete(recId);
    await borrarArchivo(r);
    await fsp.rm(rutaPortada(recId), { force: true }).catch(() => {});
    delete memoria[recId];
    for (const [id, v] of Object.entries(pedidos)) if (v === recId) delete pedidos[id];
    await guardar();
    await fsp.writeFile(INDICE, JSON.stringify(indice)).catch(() => {});
    return true;
  }
  function disco() {
    let usado = 0;
    let enDiscoN = 0;
    for (const r of Object.values(memoria)) if (r.rel) { usado += indice[r.rel]?.b || r.ganadora?.s || 0; enDiscoN++; }
    return { usado, max: CFG.discoMaxBytes, enDisco: enDiscoN, fijadas: Object.values(memoria).filter((r) => r.fijada).length, horas: CFG.cacheHoras };
  }

  async function servirPortada(req, res, cors, recId) {
    let datos;
    try { datos = await fsp.readFile(rutaPortada(recId)); } catch { return json(res, cors, 404, { error: 'Sin portada' }); }
    const tipo = datos[0] === 0x89 ? 'image/png' : datos[0] === 0x47 ? 'image/gif' : datos.toString('latin1', 8, 12) === 'WEBP' ? 'image/webp' : 'image/jpeg';
    res.writeHead(200, { ...cors, 'Content-Type': tipo, 'Content-Length': String(datos.length), 'Cache-Control': 'public, max-age=2592000, immutable' });
    res.end(req.method === 'HEAD' ? undefined : datos);
  }

  const servidor = http.createServer(async (req, res) => {
    const cors = cabecerasCors(req);
    try {
      const url = new URL(req.url, 'http://puente');
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      if (url.pathname === '/salud') return json(res, cors, 200, { ok: true, nombre: 'Liquid SKd', publico: CFG.abierto });
      const dueno = autorizado(req, url);
      // Sin la clave solo se entra si el modo público está abierto, y nunca a tu música propia ni a la gestión
      if (!dueno && !CFG.abierto) return json(res, cors, 401, { error: 'Clave incorrecta' });
      const lectura = ['GET', 'HEAD'].includes(req.method);
      // Sin tu clave: hace falta una cuenta de Liquid para todo menos el audio y las portadas, que van por
      // direcciones que solo se conocen desde la lista (y el reproductor no puede mandar cabeceras)
      if (!dueno && !/^\/(cancion|portada)\/[0-9a-f]{16}$/.test(url.pathname)) {
        req.cuenta = await cuentaDe(req);
        if (!req.cuenta) return json(res, cors, 401, { error: 'Inicia sesión en tu cuenta de Liquid para usar SKd' });
      }
      if (url.pathname.startsWith('/musica/') && lectura) {
        if (!dueno) return json(res, cors, 401, { error: 'Clave incorrecta' });
        const rel = decodeURIComponent(url.pathname.slice('/musica/'.length));
        marcarUso(rel);
        return servirAudio(req, res, cors, rel);
      }
      const cancion = /^\/cancion\/([0-9a-f]{16})$/.exec(url.pathname);
      if (cancion && lectura) return servirCancion(req, res, cors, cancion[1]);
      const portada = /^\/portada\/([0-9a-f]{16})$/.exec(url.pathname);
      if (portada && lectura) return servirPortada(req, res, cors, portada[1]);
      if (url.pathname === '/api/estado') {
        const conectado = await slskdJson('/application').then((d) => {
          const server = campo(d, 'server');
          const st = String(campo(server, 'state') ?? '');
          return campo(server, 'isConnected') ?? (st ? /Connected/.test(st) && !/Disconnected/.test(st) : true);
        }).catch(() => false);
        await escanear();
        const lst = await lista(dueno);
        const enCache = Object.values(memoria).filter((r) => r.rel).length;
        const base = { ok: true, soulseek: Boolean(conectado), canciones: lst.length, dueno, publico: CFG.abierto };
        if (dueno) return json(res, cors, 200, { ...base, cache: { horas: CFG.cacheHoras, enDisco: enCache } });
        return json(res, cors, 200, { ...base, cupo: { dia: CFG.cupoDia, restantes: restantes(quien(req)) } });
      }
      if (url.pathname === '/api/buscar') {
        const q = String(url.searchParams.get('q') || '').trim().slice(0, 120);
        if (q.length < 2) return json(res, cors, 400, { error: 'Escribe al menos 2 letras' });
        if (!dueno) {
          const claves = quien(req);
          const c = cuposDeHoy();
          if (claves.some((k) => (c.busquedas[k] || 0) >= CFG.busquedasDia)) return json(res, cors, 429, { error: 'Muchas búsquedas en Soulseek por hoy: mañana más' });
          contar('busquedas', claves);
        }
        return json(res, cors, 200, { resultados: await buscar(q) });
      }
      if (url.pathname === '/api/pedir' && req.method === 'POST') {
        const { id } = await leerCuerpo(req);
        if (dueno) return json(res, cors, 200, await pedir(id));
        const claves = quien(req);
        const quedan = restantes(claves);
        // Si ya está en el servidor (otra persona la pidió) no gasta cupo: se avisa igual por si hay que bajarla
        const d = leerPedido(id);
        const yaEsta = d && (memoria[recIdDe(d.t, d.a)]?.rel || activas.has(recIdDe(d.t, d.a)));
        if (!yaEsta && quedan <= 0) {
          return json(res, cors, 429, { error: `Ya pediste ${CFG.cupoDia} canciones de Soulseek hoy: mañana tienes ${CFG.cupoDia} más`, cupo: { dia: CFG.cupoDia, restantes: 0 } });
        }
        const r = await pedir(id);
        if (!yaEsta) contar('descargas', claves);
        return json(res, cors, 200, { ...r, cupo: { dia: CFG.cupoDia, restantes: restantes(claves) } });
      }
      if (url.pathname === '/api/pedidos') {
        const ids = String(url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 50);
        return json(res, cors, 200, { pedidos: await estadoPedidos(ids, dueno && !CFG.abierto) });
      }
      if (url.pathname === '/api/lista.json') return json(res, cors, 200, await lista(dueno));
      // Gestión: solo tú
      if (url.pathname.startsWith('/api/admin/')) {
        if (!dueno) return json(res, cors, 401, { error: 'Solo con la clave de tu servidor' });
        if (url.pathname === '/api/admin/disco') return json(res, cors, 200, disco());
        if (req.method !== 'POST') return json(res, cors, 405, { error: 'Usa POST' });
        const { id, fijar } = await leerCuerpo(req);
        const r = memoria[id];
        if (!r) return json(res, cors, 404, { error: 'No existe' });
        if (url.pathname === '/api/admin/fijar') {
          r.fijada = Boolean(fijar);
          // Si se fija una que la caché ya borró, vuelve a bajar para quedarse
          if (r.fijada && !(await enDisco(r))) lanzar(id).catch(() => {});
          await guardar();
          return json(res, cors, 200, { ok: true, fijada: r.fijada });
        }
        if (url.pathname === '/api/admin/quitar') return json(res, cors, 200, { ok: await quitar(id) });
      }
      return json(res, cors, 404, { error: 'No existe' });
    } catch (error) {
      if (!res.headersSent) json(res, cors, error.status || 500, { error: error.message || 'Error' });
      else res.destroy();
    }
  });
  return { servidor, escanear, buscar, limpiar, ponerPortada, CFG };
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

/* ---------- Portada incrustada: ID3v2 (APIC) o FLAC (bloque PICTURE). Devuelve los bytes de la imagen o null ---------- */
async function leerPortada(ruta, tamano) {
  const fh = await fsp.open(ruta, 'r');
  try {
    const cabeza = Buffer.alloc(10);
    await fh.read(cabeza, 0, 10, 0);
    if (cabeza.toString('latin1', 0, 4) === 'fLaC') {
      const buf = Buffer.alloc(Math.min(tamano, 16 << 20));
      await fh.read(buf, 0, buf.length, 0);
      return portadaFlac(buf);
    }
    if (cabeza.toString('latin1', 0, 3) !== 'ID3') return null;
    const tagLen = 10 + ((cabeza[6] & 127) << 21 | (cabeza[7] & 127) << 14 | (cabeza[8] & 127) << 7 | (cabeza[9] & 127));
    const buf = Buffer.alloc(Math.min(tamano, tagLen, 16 << 20));
    await fh.read(buf, 0, buf.length, 0);
    return portadaId3(buf, cabeza[3]);
  } finally {
    await fh.close();
  }
}

function portadaId3(buf, version) {
  let pos = 10;
  if (buf[5] & 0x40) pos += version === 4 ? ((buf[10] & 127) << 21 | (buf[11] & 127) << 14 | (buf[12] & 127) << 7 | (buf[13] & 127)) : 4 + buf.readUInt32BE(10);
  let mejor = null;
  while (pos + 10 <= buf.length) {
    const id = buf.toString('latin1', pos, pos + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const tam = version === 4 ? ((buf[pos + 4] & 127) << 21 | (buf[pos + 5] & 127) << 14 | (buf[pos + 6] & 127) << 7 | (buf[pos + 7] & 127)) : buf.readUInt32BE(pos + 4);
    if (id === 'APIC' && tam > 4) {
      const c = buf.subarray(pos + 10, pos + 10 + tam);
      const enc = c[0];
      let p = c.indexOf(0, 1) + 1; // mime\0
      const tipo = c[p++];
      // descripción terminada en \0 (o \0\0 en UTF-16)
      if (enc === 1 || enc === 2) { while (p + 1 < c.length && !(c[p] === 0 && c[p + 1] === 0)) p += 2; p += 2; } else { p = c.indexOf(0, p) + 1; }
      const img = c.subarray(p);
      // La portada delantera (tipo 3) gana; si no hay, la primera imagen
      if (img.length && (tipo === 3 || !mejor)) mejor = Buffer.from(img);
      if (tipo === 3) break;
    }
    pos += 10 + tam;
  }
  return mejor;
}

function portadaFlac(buf) {
  let pos = 4;
  let mejor = null;
  while (pos + 4 <= buf.length) {
    const ultimo = buf[pos] & 0x80;
    const tipo = buf[pos] & 0x7f;
    const tam = buf.readUIntBE(pos + 1, 3);
    if (tipo === 6 && pos + 4 + tam <= buf.length) {
      const b = buf.subarray(pos + 4, pos + 4 + tam);
      const clase = b.readUInt32BE(0);
      let p = 4;
      p += 4 + b.readUInt32BE(p); // mime
      p += 4 + b.readUInt32BE(p); // descripción
      p += 16; // ancho, alto, profundidad, colores
      const largo = b.readUInt32BE(p);
      const img = b.subarray(p + 4, p + 4 + largo);
      if (img.length && (clase === 3 || !mejor)) mejor = Buffer.from(img);
      if (clase === 3) break;
    }
    pos += 4 + tam;
    if (ultimo) break;
  }
  return mejor;
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
