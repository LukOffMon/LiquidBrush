// Liquid · v98: passkeys (WebAuthn): entrar con la huella, la cara o el PIN del dispositivo, sin contraseña.
// Sin bibliotecas: un lector CBOR mínimo y WebCrypto. Claves ES256 (P-256) y RS256. Sin atestación ("none"):
// nos basta con que la clave la cree el dispositivo y firme cada entrada con el reto que damos.
// Los retos no se guardan: van firmados (HMAC con una clave propia, distinta de la de los pases) y caducan en 5 min.
import { aB64url, deB64url, bytesAleatorios, sha256, iguales, firmarPase, leerPase } from './cripto.js';

const RETO_SEG = 300;

/* --- CBOR (solo lo que usan las passkeys: enteros, bytes, texto, listas, mapas, verdadero/falso/nulo) --- */
export function leerCbor(bytes) {
  const datos = new Uint8Array(bytes);
  const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  let p = 0;
  const largo = (info) => {
    if (info < 24) return info;
    if (info === 24) return datos[p++];
    if (info === 25) { const v = vista.getUint16(p); p += 2; return v; }
    if (info === 26) { const v = vista.getUint32(p); p += 4; return v; }
    if (info === 27) { const v = Number(vista.getBigUint64(p)); p += 8; return v; }
    throw new Error('cbor: largo');
  };
  const item = () => {
    if (p >= datos.length) throw new Error('cbor: corto');
    const b = datos[p++];
    const tipo = b >> 5;
    const info = b & 31;
    if (tipo === 0) return largo(info);
    if (tipo === 1) return -1 - largo(info);
    if (tipo === 2) { const n = largo(info); const v = datos.slice(p, p + n); p += n; return v; }
    if (tipo === 3) { const n = largo(info); const v = new TextDecoder().decode(datos.slice(p, p + n)); p += n; return v; }
    if (tipo === 4) { const n = largo(info); return Array.from({ length: n }, item); }
    if (tipo === 5) {
      const n = largo(info);
      const m = new Map();
      for (let i = 0; i < n; i++) { const k = item(); m.set(k, item()); }
      return m;
    }
    if (tipo === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22 || info === 23) return null;
    }
    throw new Error('cbor: tipo');
  };
  const valor = item();
  return { valor, fin: p };
}

/* --- Datos del autenticador: hash del RP, banderas, contador y (al crear) la clave pública --- */
function leerAuthData(bytes) {
  const d = new Uint8Array(bytes);
  if (d.length < 37) throw new Error('authData corto');
  const flags = d[32];
  const contador = new DataView(d.buffer, d.byteOffset + 33, 4).getUint32(0);
  const out = { rpIdHash: d.slice(0, 32), presente: Boolean(flags & 1), verificado: Boolean(flags & 4), contador };
  if (flags & 64) {
    const largoId = (d[53] << 8) | d[54];
    out.credId = d.slice(55, 55 + largoId);
    const cose = d.slice(55 + largoId);
    const { fin } = leerCbor(cose);
    out.cose = cose.slice(0, fin);
  }
  return out;
}

async function claveDesdeCose(cose) {
  const m = leerCbor(cose).valor;
  const kty = m.get(1);
  const alg = m.get(3);
  if (kty === 2 && alg === -7 && m.get(-1) === 1) {
    const jwk = { kty: 'EC', crv: 'P-256', x: aB64url(m.get(-2)), y: aB64url(m.get(-3)), ext: true };
    return { alg, clave: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']) };
  }
  if (kty === 3 && alg === -257) {
    const jwk = { kty: 'RSA', n: aB64url(m.get(-1)), e: aB64url(m.get(-2)), alg: 'RS256', ext: true };
    return { alg, clave: await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']) };
  }
  throw new Error('algoritmo no admitido');
}

// ECDSA de WebAuthn viene en DER; WebCrypto quiere r||s (32 + 32 bytes)
function derARaw(der) {
  const d = new Uint8Array(der);
  if (d[0] !== 0x30) throw new Error('firma');
  let p = 2;
  const parte = () => {
    if (d[p++] !== 0x02) throw new Error('firma');
    const n = d[p++];
    let v = d.slice(p, p + n);
    p += n;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = parte();
  const s = parte();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

async function verificarFirma(cose, firma, mensaje) {
  const { alg, clave } = await claveDesdeCose(cose);
  if (alg === -7) return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, clave, derARaw(firma), mensaje);
  return crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, clave, firma, mensaje);
}

/* --- Retos firmados --- */
const secretoRetos = (env) => `${env.FIRMA}|webauthn`;
export async function nuevoReto(env, tipo, extra = {}) {
  const reto = bytesAleatorios(32);
  const token = await firmarPase(secretoRetos(env), { k: tipo, c: aB64url(reto), e: Math.floor(Date.now() / 1000) + RETO_SEG, ...extra });
  return { reto: aB64url(reto), token };
}

/* --- Comprobaciones comunes de clientDataJSON --- */
async function comprobarCliente(env, clientDataB64, tipo, token, origenes) {
  const datosReto = await leerPase(secretoRetos(env), token);
  if (!datosReto || datosReto.k !== tipo) throw new Error('reto caducado');
  const json = JSON.parse(new TextDecoder().decode(deB64url(clientDataB64)));
  if (json.type !== (tipo === 'alta' ? 'webauthn.create' : 'webauthn.get')) throw new Error('tipo');
  if (json.challenge !== datosReto.c) throw new Error('reto');
  if (!origenes(json.origin)) throw new Error('origen');
  return { datosReto, origen: json.origin };
}

const rpIdDe = (origen) => new URL(origen).hostname;

// Alta: devuelve lo que hay que guardar (id de la credencial y su clave pública COSE)
export async function verificarAlta(env, { token, clientDataJSON, attestationObject }, origenes) {
  const { datosReto, origen } = await comprobarCliente(env, clientDataJSON, 'alta', token, origenes);
  const att = leerCbor(deB64url(attestationObject)).valor;
  const auth = leerAuthData(att.get('authData'));
  if (!iguales(auth.rpIdHash, await sha256(rpIdDe(origen)))) throw new Error('rp');
  if (!auth.presente || !auth.credId || !auth.cose) throw new Error('banderas');
  await claveDesdeCose(auth.cose); // que se pueda usar
  return { usuario: datosReto.u, credId: auth.credId, cose: auth.cose, contador: auth.contador };
}

// Entrada: comprueba la firma con la clave guardada; devuelve el contador nuevo
export async function verificarEntrada(env, { token, clientDataJSON, authenticatorData, signature }, guardada, origenes) {
  const { origen } = await comprobarCliente(env, clientDataJSON, 'entrar', token, origenes);
  const authBytes = deB64url(authenticatorData);
  const auth = leerAuthData(authBytes);
  if (!iguales(auth.rpIdHash, await sha256(rpIdDe(origen)))) throw new Error('rp');
  if (!auth.presente) throw new Error('banderas');
  // Un contador que no sube (si los dos son distintos de 0) es una clave copiada
  if (auth.contador !== 0 && guardada.contador !== 0 && auth.contador <= guardada.contador) throw new Error('contador');
  const hashCliente = await sha256(deB64url(clientDataJSON));
  const mensaje = new Uint8Array(authBytes.length + hashCliente.length);
  mensaje.set(authBytes, 0);
  mensaje.set(hashCliente, authBytes.length);
  const ok = await verificarFirma(new Uint8Array(guardada.clave_publica), deB64url(signature), mensaje);
  if (!ok) throw new Error('firma');
  return { contador: auth.contador };
}
