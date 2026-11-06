// Liquid Bullet · Worker de cuentas (liquid-cuentas)
// Solo Cloudflare: D1 (cuentas, sesiones, códigos), R2 privado (datos de música), Turnstile, Rate Limiting y Cron.
// Plan completo: docs/Liquid-Bullet-Cuentas-Plan.pdf
import {
  aB64url, deB64url, bytesAleatorios, sha256, iguales, hashClave, codigoSeisDigitos, hashCodigo,
  firmarPase, leerPase, VERSION_CLAVE
} from './cripto.js';
import { enviarCorreo, correoCodigo, correoYaRegistrado, correoBienvenida, correoClaveCambiada } from './correo.js';

const VERSION = '1.0.0';
const MIN = 60;
const HORA = 3600;
const DIA = 86400;
const PASE_SEG = 15 * MIN;          // pase de acceso
const SESION_SEG = 60 * DIA;        // token de renovación
const CODIGO_SEG = 10 * MIN;        // validez de un código
const INTENTOS_CODIGO = 5;
const ENVIOS_HORA = 5;              // códigos por correo y hora
const CORREOS_DIA = 400;            // tope propio (Gmail permite ~500)
const FALLOS_ENTRAR = 5;            // fallos antes de esperar
const DATOS_MAX = 2 * 1024 * 1024;  // 2 MB por archivo en R2

const ahora = () => Math.floor(Date.now() / 1000);
const hoy = () => new Date().toISOString().slice(0, 10);

/* ---------- Respuestas ---------- */
function origenPermitido(env, origen) {
  if (!origen) return null;
  const lista = String(env.ORIGENES || '').split(',').map((o) => o.trim()).filter(Boolean);
  if (lista.includes(origen)) return origen;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen)) return origen;
  return null;
}

function cabeceras(env, request, extra = {}) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extra
  };
  const origen = origenPermitido(env, request.headers.get('Origin'));
  if (origen) {
    h['Access-Control-Allow-Origin'] = origen;
    h['Access-Control-Allow-Credentials'] = 'false';
    h.Vary = 'Origin';
    h['Access-Control-Expose-Headers'] = 'ETag';
  }
  return h;
}

const json = (env, request, datos, estado = 200, extra = {}) =>
  new Response(JSON.stringify(datos), { status: estado, headers: cabeceras(env, request, extra) });
const fallo = (env, request, error, estado = 400, extra = {}) => json(env, request, { ok: false, error, ...extra }, estado);

class ErrorApi extends Error {
  constructor(error, estado = 400, extra = {}) {
    super(error);
    this.error = error;
    this.estado = estado;
    this.extra = extra;
  }
}

/* ---------- Entradas ---------- */
async function cuerpo(request) {
  try {
    const datos = await request.json();
    return datos && typeof datos === 'object' ? datos : {};
  } catch {
    throw new ErrorApi('formato', 400);
  }
}

function correoValido(texto) {
  const correo = String(texto || '').trim().toLowerCase();
  if (correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) throw new ErrorApi('correo_invalido');
  return correo;
}

function claveValida(texto) {
  let bytes;
  try { bytes = deB64url(texto); } catch { bytes = null; }
  if (!bytes || bytes.length !== 32) throw new ErrorApi('clave_invalida');
  return bytes;
}

const nombreLimpio = (texto) => String(texto || '').replace(/\p{Cc}/gu, '').trim().slice(0, 40) || null;
const avatarLimpio = (texto) => {
  const a = String(texto || '').trim();
  // Avatares: una de las 8 fotos de perfil (avatars/) o la inicial con color. Nada más.
  return /^(inicial:#[0-9a-f]{6}|foto:0[1-8])$/i.test(a) ? a : null;
};

function nombreDispositivo(request, propio) {
  if (propio) return String(propio).replace(/\p{Cc}/gu, '').slice(0, 60);
  const ua = request.headers.get('User-Agent') || '';
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  const nav = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${so} · ${nav}`;
}

/* ---------- Frenos ---------- */
async function frenoIp(env, request, ruta) {
  if (!env.LIMITE) return;
  const ip = request.headers.get('CF-Connecting-IP') || 'sin-ip';
  const { success } = await env.LIMITE.limit({ key: `${ruta}:${ip}` });
  if (!success) throw new ErrorApi('demasiados_intentos', 429, { esperar: 60 });
}

// Modo de prueba: solo con la clave de administrador (secreto ADMIN). Salta Turnstile y devuelve el
// código en la respuesta en vez de enviarlo (para probar todo el recorrido sin llenar ningún buzón).
async function esPrueba(env, request) {
  const clave = request.headers.get('X-Admin');
  return Boolean(clave && env.ADMIN && iguales(await sha256(clave), await sha256(env.ADMIN)));
}

async function turnstile(env, request, token) {
  if (await esPrueba(env, request)) return;
  if (!env.TURNSTILE_SECRETO) throw new ErrorApi('robot', 503);
  if (!token) throw new ErrorApi('robot');
  const datos = new FormData();
  datos.append('secret', env.TURNSTILE_SECRETO);
  datos.append('response', String(token));
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) datos.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: datos });
  const resultado = await r.json().catch(() => ({}));
  if (!resultado.success) throw new ErrorApi('robot');
}

async function sumarContador(env, clave, duracion) {
  const fila = await env.DB.prepare(
    'INSERT INTO contadores (clave, valor, caduca) VALUES (?1, 1, ?2) ' +
    'ON CONFLICT(clave) DO UPDATE SET valor = CASE WHEN caduca < ?3 THEN 1 ELSE valor + 1 END, ' +
    'caduca = CASE WHEN caduca < ?3 THEN ?2 ELSE caduca END RETURNING valor'
  ).bind(clave, ahora() + duracion, ahora()).first();
  return fila?.valor ?? 1;
}

async function leerContador(env, clave) {
  const fila = await env.DB.prepare('SELECT valor, caduca FROM contadores WHERE clave = ?1').bind(clave).first();
  return fila && fila.caduca >= ahora() ? fila : null;
}

/* ---------- Códigos por correo ---------- */
// Crea o renueva el código de (correo, motivo) respetando los topes. Devuelve el código en claro (solo para enviarlo).
async function prepararCodigo(env, correo, motivo, datos = null) {
  const t = ahora();
  const fila = await env.DB.prepare('SELECT enviado, envios, ventana, datos FROM codigos WHERE correo = ?1 AND motivo = ?2')
    .bind(correo, motivo).first();
  if (fila && t - fila.enviado < MIN) throw new ErrorApi('espera_reenvio', 429, { esperar: MIN - (t - fila.enviado) });
  const nuevaVentana = !fila || t - fila.ventana >= HORA;
  const envios = nuevaVentana ? 1 : fila.envios + 1;
  if (envios > ENVIOS_HORA) throw new ErrorApi('demasiados_envios', 429, { esperar: HORA - (t - fila.ventana) });
  const enviadosHoy = await leerContador(env, `correos:${hoy()}`);
  if (enviadosHoy && enviadosHoy.valor >= CORREOS_DIA) throw new ErrorApi('envio_no_disponible', 503);

  const codigo = codigoSeisDigitos();
  const hash = await hashCodigo(env.PIMIENTA, codigo, correo, motivo);
  await env.DB.prepare(
    'INSERT INTO codigos (correo, motivo, codigo_hash, datos, intentos, enviado, envios, ventana, caduca) ' +
    'VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8) ON CONFLICT(correo, motivo) DO UPDATE SET ' +
    'codigo_hash = excluded.codigo_hash, datos = COALESCE(excluded.datos, codigos.datos), intentos = 0, ' +
    'enviado = excluded.enviado, envios = excluded.envios, ventana = excluded.ventana, caduca = excluded.caduca'
  ).bind(correo, motivo, hash, datos ?? fila?.datos ?? null, t, envios, nuevaVentana ? t : fila.ventana, t + CODIGO_SEG).run();
  return codigo;
}

// Comprueba un código; si es correcto lo consume y devuelve la fila
async function comprobarCodigo(env, correo, motivo, codigo) {
  if (!/^\d{6}$/.test(String(codigo || ''))) throw new ErrorApi('codigo_incorrecto', 400, { quedan: null });
  const fila = await env.DB.prepare('SELECT codigo_hash, datos, intentos, caduca FROM codigos WHERE correo = ?1 AND motivo = ?2')
    .bind(correo, motivo).first();
  if (!fila || fila.caduca < ahora()) throw new ErrorApi('codigo_caducado');
  if (fila.intentos >= INTENTOS_CODIGO) throw new ErrorApi('demasiados_intentos', 429, { esperar: fila.caduca - ahora() });
  const esperado = new Uint8Array(fila.codigo_hash);
  if (!iguales(esperado, await hashCodigo(env.PIMIENTA, codigo, correo, motivo))) {
    await env.DB.prepare('UPDATE codigos SET intentos = intentos + 1 WHERE correo = ?1 AND motivo = ?2').bind(correo, motivo).run();
    throw new ErrorApi('codigo_incorrecto', 400, { quedan: INTENTOS_CODIGO - fila.intentos - 1 });
  }
  return fila;
}

function enviarEnSegundoPlano(env, ctx, para, contenido) {
  if (ctx.prueba) return;
  ctx.waitUntil((async () => {
    try {
      await enviarCorreo(env, para, contenido);
      await sumarContador(env, `correos:${hoy()}`, 2 * DIA);
    } catch (error) {
      console.error('[correo]', para.replace(/^(.).*@/, '$1•••@'), error.message);
    }
  })());
}

/* ---------- Sesiones ---------- */
async function crearSesion(env, request, usuarioId, dispositivo, familia = null) {
  const t = ahora();
  const sesionId = bytesAleatorios(16);
  const renovacion = aB64url(bytesAleatorios(32));
  const sentencia = env.DB.prepare(
    'INSERT INTO sesiones (id, usuario, familia, token_hash, dispositivo, creada, vista, caduca) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, ?7)'
  ).bind(sesionId, usuarioId, familia || sesionId, await sha256(renovacion), nombreDispositivo(request, dispositivo), t, t + SESION_SEG);
  const pase = await firmarPase(env.FIRMA, { u: aB64url(usuarioId), s: aB64url(sesionId), e: t + PASE_SEG });
  return { sentencia, sesion: { pase, renovacion, caducaPase: t + PASE_SEG, caducaSesion: t + SESION_SEG } };
}

async function autenticar(env, request) {
  const pase = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const datos = await leerPase(env.FIRMA, pase);
  if (!datos) throw new ErrorApi('sesion_caducada', 401);
  return { usuario: deB64url(datos.u), sesion: deB64url(datos.s) };
}

const actividad = (env, usuario, tipo, dispositivo = null) =>
  env.DB.prepare('INSERT INTO actividad (usuario, fecha, tipo, dispositivo) VALUES (?1, ?2, ?3, ?4)').bind(usuario, ahora(), tipo, dispositivo);

function perfil(fila) {
  return { correo: fila.correo, nombre: fila.nombre, avatar: fila.avatar, creado: fila.creado, borrarEl: fila.borrar_el || null };
}

/* ---------- Rutas ---------- */
async function alta(env, request, ctx) {
  await frenoIp(env, request, 'alta');
  const b = await cuerpo(request);
  const correo = correoValido(b.correo);
  const clave = claveValida(b.clave);
  await turnstile(env, request, b.turnstile);
  // El hash se calcula siempre (exista o no la cuenta): misma respuesta y mismo tiempo
  const sal = bytesAleatorios(16);
  const hash = await hashClave(env.PIMIENTA, clave, sal);
  const existe = await env.DB.prepare('SELECT 1 FROM usuarios WHERE correo = ?1').bind(correo).first();
  if (existe) {
    const avisos = await sumarContador(env, `aviso:${correo}`, HORA);
    if (avisos === 1) enviarEnSegundoPlano(env, ctx, correo, correoYaRegistrado());
    return json(env, request, { ok: true, enviado: true, caduca: CODIGO_SEG });
  }
  const datos = JSON.stringify({ h: aB64url(hash), s: aB64url(sal), n: nombreLimpio(b.nombre), a: avatarLimpio(b.avatar) });
  const codigo = await prepararCodigo(env, correo, 'alta', datos);
  enviarEnSegundoPlano(env, ctx, correo, correoCodigo('alta', codigo));
  return json(env, request, { ok: true, enviado: true, caduca: CODIGO_SEG, ...(ctx.prueba ? { codigoPrueba: codigo } : {}) });
}

async function altaConfirmar(env, request, ctx) {
  await frenoIp(env, request, 'confirmar');
  const b = await cuerpo(request);
  const correo = correoValido(b.correo);
  const fila = await comprobarCodigo(env, correo, 'alta', b.codigo);
  const pendiente = JSON.parse(fila.datos || '{}');
  if (!pendiente.h || !pendiente.s) throw new ErrorApi('codigo_caducado');
  if (await env.DB.prepare('SELECT 1 FROM usuarios WHERE correo = ?1').bind(correo).first()) throw new ErrorApi('ya_registrado', 409);
  const t = ahora();
  const id = bytesAleatorios(16);
  const dispositivo = nombreDispositivo(request, b.dispositivo);
  const { sentencia, sesion } = await crearSesion(env, request, id, b.dispositivo);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO usuarios (id, correo, confirmado, clave_hash, clave_sal, clave_ver, nombre, avatar, creado, actualizado) ' +
      'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?3, ?3)')
      .bind(id, correo, t, deB64url(pendiente.h), deB64url(pendiente.s), VERSION_CLAVE, pendiente.n || null, pendiente.a || null),
    sentencia,
    actividad(env, id, 'alta', dispositivo),
    env.DB.prepare('DELETE FROM codigos WHERE correo = ?1 AND motivo = ?2').bind(correo, 'alta')
  ]);
  enviarEnSegundoPlano(env, ctx, correo, correoBienvenida(pendiente.n));
  return json(env, request, { ok: true, sesion, perfil: { correo, nombre: pendiente.n || null, avatar: pendiente.a || null, creado: t } });
}

const MOTIVOS_REENVIO = ['alta', 'recuperar'];

async function reenviar(env, request, ctx) {
  await frenoIp(env, request, 'reenviar');
  const b = await cuerpo(request);
  const correo = correoValido(b.correo);
  const motivo = MOTIVOS_REENVIO.includes(b.motivo) ? b.motivo : 'alta';
  const fila = await env.DB.prepare('SELECT datos FROM codigos WHERE correo = ?1 AND motivo = ?2').bind(correo, motivo).first();
  // Sin código previo no se envía nada, pero la respuesta es la misma
  if (!fila) return json(env, request, { ok: true, enviado: true, caduca: CODIGO_SEG });
  const codigo = await prepararCodigo(env, correo, motivo);
  enviarEnSegundoPlano(env, ctx, correo, correoCodigo(motivo, codigo));
  return json(env, request, { ok: true, enviado: true, caduca: CODIGO_SEG, ...(ctx.prueba ? { codigoPrueba: codigo } : {}) });
}

const SAL_FALSA = new Uint8Array(16);

async function entrar(env, request) {
  await frenoIp(env, request, 'entrar');
  const b = await cuerpo(request);
  const correo = correoValido(b.correo);
  const clave = claveValida(b.clave);
  await turnstile(env, request, b.turnstile);
  const fallos = await leerContador(env, `fallos:${correo}`);
  if (fallos && fallos.valor >= FALLOS_ENTRAR) throw new ErrorApi('demasiados_intentos', 429, { esperar: fallos.caduca - ahora() });
  const u = await env.DB.prepare('SELECT id, correo, clave_hash, clave_sal, nombre, avatar, creado, borrar_el FROM usuarios WHERE correo = ?1')
    .bind(correo).first();
  const hash = await hashClave(env.PIMIENTA, clave, u ? new Uint8Array(u.clave_sal) : SAL_FALSA);
  if (!u || !iguales(hash, new Uint8Array(u.clave_hash))) {
    await sumarContador(env, `fallos:${correo}`, 15 * MIN);
    throw new ErrorApi('credenciales', 401);
  }
  const id = new Uint8Array(u.id);
  const dispositivo = nombreDispositivo(request, b.dispositivo);
  const { sentencia, sesion } = await crearSesion(env, request, id, b.dispositivo);
  const lote = [sentencia, actividad(env, id, 'entrada', dispositivo)];
  if (fallos) lote.push(env.DB.prepare('DELETE FROM contadores WHERE clave = ?1').bind(`fallos:${correo}`));
  // Entrar cancela un borrado programado
  if (u.borrar_el) lote.push(env.DB.prepare('UPDATE usuarios SET borrar_el = NULL WHERE id = ?1').bind(id));
  await env.DB.batch(lote);
  return json(env, request, { ok: true, sesion, perfil: perfil({ ...u, borrar_el: null }), borradoCancelado: Boolean(u.borrar_el) });
}

async function renovar(env, request) {
  await frenoIp(env, request, 'renovar');
  const b = await cuerpo(request);
  if (!b.renovacion) throw new ErrorApi('sesion_caducada', 401);
  const hashViejo = await sha256(String(b.renovacion));
  const t = ahora();
  const s = await env.DB.prepare('SELECT id, usuario, caduca, revocada FROM sesiones WHERE token_hash = ?1').bind(hashViejo).first();
  if (!s) {
    // ¿Un token ya rotado? Si fue hace segundos es otra pestaña; si no, posible robo → se cierra la familia
    const previa = await env.DB.prepare('SELECT familia, vista FROM sesiones WHERE token_previo = ?1').bind(hashViejo).first();
    if (previa && t - previa.vista < 30) throw new ErrorApi('renovado_en_otra_pestana', 409);
    if (previa) await env.DB.prepare('UPDATE sesiones SET revocada = ?1 WHERE familia = ?2 AND revocada IS NULL').bind(t, previa.familia).run();
    throw new ErrorApi('sesion_caducada', 401);
  }
  if (s.revocada || s.caduca < t) throw new ErrorApi('sesion_caducada', 401);
  const renovacion = aB64url(bytesAleatorios(32));
  await env.DB.prepare('UPDATE sesiones SET token_previo = token_hash, token_hash = ?1, vista = ?2, caduca = ?3 WHERE id = ?4')
    .bind(await sha256(renovacion), t, t + SESION_SEG, s.id).run();
  const pase = await firmarPase(env.FIRMA, { u: aB64url(new Uint8Array(s.usuario)), s: aB64url(new Uint8Array(s.id)), e: t + PASE_SEG });
  return json(env, request, { ok: true, sesion: { pase, renovacion, caducaPase: t + PASE_SEG, caducaSesion: t + SESION_SEG } });
}

async function salir(env, request, todo = false) {
  const { usuario, sesion } = await autenticar(env, request);
  const t = ahora();
  if (todo) {
    await env.DB.prepare('UPDATE sesiones SET revocada = ?1 WHERE usuario = ?2 AND id <> ?3 AND revocada IS NULL').bind(t, usuario, sesion).run();
  } else {
    await env.DB.prepare('UPDATE sesiones SET revocada = ?1 WHERE id = ?2 AND usuario = ?3').bind(t, sesion, usuario).run();
  }
  return json(env, request, { ok: true });
}

async function recuperar(env, request, ctx) {
  await frenoIp(env, request, 'recuperar');
  const b = await cuerpo(request);
  const correo = correoValido(b.correo);
  await turnstile(env, request, b.turnstile);
  const existe = await env.DB.prepare('SELECT 1 FROM usuarios WHERE correo = ?1').bind(correo).first();
  let codigo = null;
  if (existe) {
    codigo = await prepararCodigo(env, correo, 'recuperar');
    enviarEnSegundoPlano(env, ctx, correo, correoCodigo('recuperar', codigo));
  }
  return json(env, request, { ok: true, enviado: true, caduca: CODIGO_SEG, ...(ctx.prueba && codigo ? { codigoPrueba: codigo } : {}) });
}

async function recuperarNueva(env, request, ctx) {
  await frenoIp(env, request, 'recuperar-nueva');
  const b = await cuerpo(request);
  const correo = correoValido(b.correo);
  const clave = claveValida(b.clave);
  await comprobarCodigo(env, correo, 'recuperar', b.codigo);
  const u = await env.DB.prepare('SELECT id, correo, clave_hash, clave_sal, nombre, avatar, creado FROM usuarios WHERE correo = ?1').bind(correo).first();
  if (!u) throw new ErrorApi('codigo_caducado');
  const id = new Uint8Array(u.id);
  if (iguales(await hashClave(env.PIMIENTA, clave, new Uint8Array(u.clave_sal)), new Uint8Array(u.clave_hash))) throw new ErrorApi('clave_repetida');
  const sal = bytesAleatorios(16);
  const hash = await hashClave(env.PIMIENTA, clave, sal);
  const t = ahora();
  const dispositivo = nombreDispositivo(request, b.dispositivo);
  const { sentencia, sesion } = await crearSesion(env, request, id, b.dispositivo);
  await env.DB.batch([
    env.DB.prepare('UPDATE usuarios SET clave_hash = ?1, clave_sal = ?2, clave_ver = ?3, actualizado = ?4 WHERE id = ?5').bind(hash, sal, VERSION_CLAVE, t, id),
    env.DB.prepare('UPDATE sesiones SET revocada = ?1 WHERE usuario = ?2 AND revocada IS NULL').bind(t, id),
    sentencia,
    actividad(env, id, 'clave', dispositivo),
    env.DB.prepare('DELETE FROM codigos WHERE correo = ?1 AND motivo = ?2').bind(correo, 'recuperar'),
    env.DB.prepare('DELETE FROM contadores WHERE clave = ?1').bind(`fallos:${correo}`)
  ]);
  enviarEnSegundoPlano(env, ctx, correo, correoClaveCambiada());
  return json(env, request, { ok: true, sesion, perfil: perfil(u) });
}

async function yo(env, request) {
  const { usuario } = await autenticar(env, request);
  if (request.method === 'PATCH') {
    const b = await cuerpo(request);
    const cambios = {};
    if ('nombre' in b) cambios.nombre = nombreLimpio(b.nombre);
    if ('avatar' in b) cambios.avatar = avatarLimpio(b.avatar);
    if (Object.keys(cambios).length) {
      await env.DB.prepare('UPDATE usuarios SET nombre = COALESCE(?1, nombre), avatar = COALESCE(?2, avatar), actualizado = ?3 WHERE id = ?4')
        .bind(cambios.nombre ?? null, cambios.avatar ?? null, ahora(), usuario).run();
    }
  }
  const u = await env.DB.prepare('SELECT correo, nombre, avatar, creado, borrar_el FROM usuarios WHERE id = ?1').bind(usuario).first();
  if (!u) throw new ErrorApi('sesion_caducada', 401);
  return json(env, request, { ok: true, perfil: perfil(u) });
}

async function dispositivos(env, request) {
  const { usuario, sesion } = await autenticar(env, request);
  const { results } = await env.DB.prepare(
    'SELECT id, dispositivo, creada, vista FROM sesiones WHERE usuario = ?1 AND revocada IS NULL AND caduca > ?2 ORDER BY vista DESC LIMIT 20'
  ).bind(usuario, ahora()).all();
  const actual = aB64url(sesion);
  return json(env, request, {
    ok: true,
    dispositivos: results.map((s) => ({ id: aB64url(new Uint8Array(s.id)), nombre: s.dispositivo, creada: s.creada, vista: s.vista, actual: aB64url(new Uint8Array(s.id)) === actual }))
  });
}

async function cerrarDispositivo(env, request, idTexto) {
  const { usuario } = await autenticar(env, request);
  let id;
  try { id = deB64url(idTexto); } catch { throw new ErrorApi('no_encontrado', 404); }
  await env.DB.prepare('UPDATE sesiones SET revocada = ?1 WHERE id = ?2 AND usuario = ?3').bind(ahora(), id, usuario).run();
  return json(env, request, { ok: true });
}

// Datos de música en R2: cuentas/<usuario>/<archivo>, siempre derivado del pase (nunca de la petición)
async function datos(env, request, archivo) {
  const { usuario } = await autenticar(env, request);
  if (!/^(datos|escucha-\d{4})$/.test(archivo)) throw new ErrorApi('no_encontrado', 404);
  const clave = `cuentas/${aB64url(usuario)}/${archivo}.json.gz`;
  if (request.method === 'GET') {
    const obj = await env.DATOS.get(clave);
    if (!obj) return json(env, request, { ok: true, vacio: true }, 200);
    return new Response(obj.body, { headers: cabeceras(env, request, { 'Content-Type': 'application/gzip', ETag: obj.httpEtag }) });
  }
  if (request.method !== 'PUT') throw new ErrorApi('metodo', 405);
  const tam = Number(request.headers.get('Content-Length') || 0);
  if (tam > DATOS_MAX) throw new ErrorApi('demasiado_grande', 413);
  const cuerpoBytes = await request.arrayBuffer();
  if (cuerpoBytes.byteLength > DATOS_MAX) throw new ErrorApi('demasiado_grande', 413);
  const b = new Uint8Array(cuerpoBytes);
  if (b[0] !== 0x1f || b[1] !== 0x8b) throw new ErrorApi('formato', 415);
  const siCoincide = request.headers.get('If-Match');
  // R2 compara el ETag sin comillas ni prefijo débil
  const limpiarEtag = (e) => e.replace(/^W\//, '').replace(/"/g, '').trim();
  const condicion = siCoincide ? { etagMatches: limpiarEtag(siCoincide) }
    : (request.headers.get('If-None-Match') === '*' ? { etagDoesNotMatch: '*' } : undefined);
  const obj = await env.DATOS.put(clave, cuerpoBytes, { onlyIf: condicion, httpMetadata: { contentType: 'application/gzip' } });
  if (!obj) throw new ErrorApi('cambio_en_otro_dispositivo', 412);
  return json(env, request, { ok: true }, 200, { ETag: obj.httpEtag });
}

// Prueba de envío (solo el administrador, con la cabecera X-Admin)
async function pruebaCorreo(env, request) {
  const clave = request.headers.get('X-Admin') || '';
  if (!env.ADMIN || !iguales(await sha256(clave), await sha256(env.ADMIN))) throw new ErrorApi('no_encontrado', 404);
  const b = await cuerpo(request);
  const para = correoValido(b.para || env.SMTP_USER);
  const inicio = Date.now();
  try {
    await enviarCorreo(env, para, correoCodigo('prueba', codigoSeisDigitos()));
    await sumarContador(env, `correos:${hoy()}`, 2 * DIA);
    return json(env, request, { ok: true, para, ms: Date.now() - inicio });
  } catch (error) {
    return fallo(env, request, 'envio_fallido', 502, { detalle: String(error.message).slice(0, 200) });
  }
}

/* ---------- Limpieza diaria (Cron) ---------- */
async function limpieza(env) {
  const t = ahora();
  const borrar = await env.DB.prepare('SELECT id FROM usuarios WHERE borrar_el IS NOT NULL AND borrar_el < ?1 LIMIT 50').bind(t).all();
  for (const { id } of borrar.results) {
    const prefijo = `cuentas/${aB64url(new Uint8Array(id))}/`;
    const lista = await env.DATOS.list({ prefix: prefijo });
    if (lista.objects.length) await env.DATOS.delete(lista.objects.map((o) => o.key));
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM codigos WHERE caduca < ?1').bind(t - DIA),
    env.DB.prepare('DELETE FROM sesiones WHERE caduca < ?1 OR revocada < ?2').bind(t, t - 30 * DIA),
    env.DB.prepare('DELETE FROM actividad WHERE fecha < ?1').bind(t - 90 * DIA),
    env.DB.prepare('DELETE FROM contadores WHERE caduca < ?1').bind(t),
    env.DB.prepare('DELETE FROM usuarios WHERE borrar_el IS NOT NULL AND borrar_el < ?1').bind(t),
    env.DB.prepare('PRAGMA optimize')
  ]);
}

/* ---------- Router ---------- */
export default {
  async fetch(request, env, ctx0) {
    let ctx;
    const url = new URL(request.url);
    const ruta = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cabeceras(env, request), 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, If-None-Match', 'Access-Control-Max-Age': '86400' }
      });
    }
    try {
      const m = request.method;
      // ctx es de solo lectura en Workers: se envuelve para marcar el modo de prueba
      ctx = { waitUntil: (p) => ctx0.waitUntil(p), prueba: await esPrueba(env, request) };
      if (ruta === '/' && m === 'GET') return json(env, request, { ok: true, servicio: 'liquid-cuentas', version: VERSION });
      if (ruta === '/alta' && m === 'POST') return await alta(env, request, ctx);
      if (ruta === '/alta/confirmar' && m === 'POST') return await altaConfirmar(env, request, ctx);
      if (ruta === '/codigo/reenviar' && m === 'POST') return await reenviar(env, request, ctx);
      if (ruta === '/entrar' && m === 'POST') return await entrar(env, request);
      if (ruta === '/renovar' && m === 'POST') return await renovar(env, request);
      if (ruta === '/salir' && m === 'POST') return await salir(env, request);
      if (ruta === '/salir/todo' && m === 'POST') return await salir(env, request, true);
      if (ruta === '/recuperar' && m === 'POST') return await recuperar(env, request, ctx);
      if (ruta === '/recuperar/nueva' && m === 'POST') return await recuperarNueva(env, request, ctx);
      if (ruta === '/yo' && (m === 'GET' || m === 'PATCH')) return await yo(env, request);
      if (ruta === '/yo/dispositivos' && m === 'GET') return await dispositivos(env, request);
      const disp = ruta.match(/^\/yo\/dispositivos\/([\w-]+)$/);
      if (disp && m === 'DELETE') return await cerrarDispositivo(env, request, disp[1]);
      const arch = ruta.match(/^\/datos(?:\/escucha\/(\d{4}))?$/);
      if (arch) return await datos(env, request, arch[1] ? `escucha-${arch[1]}` : 'datos');
      if (ruta === '/admin/prueba-correo' && m === 'POST') return await pruebaCorreo(env, request);
      return fallo(env, request, 'no_encontrado', 404);
    } catch (error) {
      if (error instanceof ErrorApi) return fallo(env, request, error.error, error.estado, error.extra);
      console.error('[error]', error && error.stack ? error.stack : error);
      return fallo(env, request, 'interno', 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(limpieza(env));
  }
};
