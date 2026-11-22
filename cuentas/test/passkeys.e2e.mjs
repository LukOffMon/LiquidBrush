// Prueba de punta a punta de las passkeys (v98) contra el Worker en local, con un autenticador simulado:
// una clave ES256 de verdad (WebCrypto), attestationObject en CBOR y firmas en DER, como las de un móvil.
//   cd cuentas && npx wrangler dev --local --port 8787
//   node test/passkeys.e2e.mjs
import { readFileSync } from 'node:fs';
import { webcrypto as crypto, createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const BASE = process.env.CUENTAS_URL || 'http://127.0.0.1:8787';
const ORIGEN = 'http://localhost:4173';
const ADMIN = /^ADMIN=(.+)$/m.exec(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'))?.[1].trim();
const b64 = (b) => Buffer.from(b).toString('base64url');
const sha = (b) => createHash('sha256').update(b).digest();

// CBOR mínimo para escribir (mapas con claves enteras o de texto, bytes, texto, enteros)
function cbor(v) {
  const cab = (tipo, n) => (n < 24 ? Buffer.from([(tipo << 5) | n]) : n < 256 ? Buffer.from([(tipo << 5) | 24, n]) : Buffer.from([(tipo << 5) | 25, n >> 8, n & 255]));
  if (typeof v === 'number') return v >= 0 ? cab(0, v) : cab(1, -1 - v);
  if (typeof v === 'string') { const b = Buffer.from(v); return Buffer.concat([cab(3, b.length), b]); }
  if (v instanceof Uint8Array) return Buffer.concat([cab(2, v.length), Buffer.from(v)]);
  if (v instanceof Map) return Buffer.concat([cab(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  throw new Error('cbor');
}
const rawADer = (raw) => {
  const ent = (b) => { let x = Buffer.from(b); while (x.length > 1 && x[0] === 0 && !(x[1] & 0x80)) x = x.subarray(1); if (x[0] & 0x80) x = Buffer.concat([Buffer.from([0]), x]); return Buffer.concat([Buffer.from([2, x.length]), x]); };
  const cuerpo = Buffer.concat([ent(raw.slice(0, 32)), ent(raw.slice(32))]);
  return Buffer.concat([Buffer.from([0x30, cuerpo.length]), cuerpo]);
};

async function api(ruta, { cuerpo, pase, origen = ORIGEN, metodo = 'POST' } = {}) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { Origin: origen, 'CF-Connecting-IP': `10.4.0.${Math.floor(Math.random() * 250)}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(pase ? { Authorization: `Bearer ${pase}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  return { estado: r.status, datos: await r.json().catch(() => ({})) };
}

async function cuenta(nombre) {
  const correo = `${nombre.toLowerCase()}-${Date.now()}@ejemplo.test`;
  const clave = b64(crypto.getRandomValues(new Uint8Array(32)));
  const h = { 'Content-Type': 'application/json', 'X-Admin': ADMIN, 'CF-Connecting-IP': '10.4.1.1' };
  const alta = await (await fetch(`${BASE}/alta`, { method: 'POST', headers: h, body: JSON.stringify({ correo, clave, nombre }) })).json();
  const ok = await (await fetch(`${BASE}/alta/confirmar`, { method: 'POST', headers: h, body: JSON.stringify({ correo, codigo: alta.codigoPrueba }) })).json();
  return { pase: ok.sesion.pase, correo };
}

// El «dispositivo»: su par de claves y su contador
const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', par.publicKey);
const credId = crypto.getRandomValues(new Uint8Array(16));
let contador = 0;
const cose = new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]);
const authData = (conClave) => {
  const flags = 1 | 4 | (conClave ? 64 : 0);
  const cont = Buffer.alloc(4); cont.writeUInt32BE(++contador);
  const partes = [sha('localhost'), Buffer.from([flags]), cont];
  if (conClave) partes.push(Buffer.alloc(16), Buffer.from([0, credId.length]), Buffer.from(credId), cbor(cose));
  return Buffer.concat(partes);
};

const ana = await cuenta('Ana');

// --- Alta ---
let r = await api('/passkeys/alta/opciones', { pase: ana.pase });
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.equal(r.datos.opciones.rp.id, 'localhost');
assert.equal(r.datos.opciones.user.name, ana.correo);
const alta = r.datos;
const clienteAlta = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: alta.opciones.challenge, origin: ORIGEN }));
const attestation = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(authData(true))]]));

r = await api('/passkeys/alta', { pase: ana.pase, cuerpo: { token: alta.token, clientDataJSON: b64(Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: alta.opciones.challenge, origin: 'https://malo.example' }))), attestationObject: b64(attestation) } });
assert.equal(r.estado, 400, 'otro origen no vale');
r = await api('/passkeys/alta', { pase: ana.pase, cuerpo: { token: alta.token, clientDataJSON: b64(clienteAlta), attestationObject: b64(attestation), nombre: 'Pixel de prueba' } });
assert.equal(r.estado, 201, JSON.stringify(r.datos));
assert.equal(r.datos.passkey.id, b64(credId));

r = await api('/passkeys', { pase: ana.pase, metodo: 'GET' });
assert.equal(r.datos.passkeys.length, 1);
assert.equal(r.datos.passkeys[0].nombre, 'Pixel de prueba');

// --- Entrar sin contraseña ---
let ultimoAceptado = 1;
async function intentoEntrar({ firmaMala = false, retoOtro = null, mismoContador = false } = {}) {
  const o = (await api('/passkeys/entrar/opciones')).datos;
  // Una clave copiada repite un contador ya visto por el servidor
  if (mismoContador) contador = ultimoAceptado - 1;
  const ad = authData(false);
  const usado = contador;
  const cliente = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: retoOtro || o.opciones.challenge, origin: ORIGEN }));
  const firmaRaw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, par.privateKey, Buffer.concat([ad, sha(cliente)])));
  if (firmaMala) firmaRaw[5] ^= 1;
  const r = await api('/passkeys/entrar', { cuerpo: { token: o.token, id: b64(credId), clientDataJSON: b64(cliente), authenticatorData: b64(ad), signature: b64(rawADer(firmaRaw)), userHandle: alta.opciones.user.id } });
  if (r.estado === 200) ultimoAceptado = usado;
  return r;
}
r = await intentoEntrar();
assert.equal(r.estado, 200, JSON.stringify(r.datos));
assert.equal(r.datos.perfil.correo, ana.correo);
assert.ok(r.datos.sesion.pase, 'da una sesión');
assert.equal((await api('/yo', { pase: r.datos.sesion.pase, metodo: 'GET' })).datos.perfil.correo, ana.correo, 'la sesión vale');

assert.equal((await intentoEntrar({ firmaMala: true })).estado, 401, 'firma falsa');
assert.equal((await intentoEntrar({ retoOtro: b64(crypto.getRandomValues(new Uint8Array(32))) })).estado, 401, 'reto ajeno');
assert.equal((await intentoEntrar({ mismoContador: true })).estado, 401, 'contador repetido (clave copiada)');
assert.equal((await intentoEntrar()).estado, 200, 'y luego sigue funcionando');

// Borrarla: ya no entra
r = await api(`/passkeys/${b64(credId)}`, { pase: ana.pase, metodo: 'DELETE' });
assert.equal(r.estado, 200);
assert.equal((await intentoEntrar()).estado, 401, 'borrada, no entra');

// Sin origen permitido no hay opciones
assert.equal((await api('/passkeys/entrar/opciones', { origen: 'https://malo.example' })).estado, 403);

console.log('OK: passkeys');
