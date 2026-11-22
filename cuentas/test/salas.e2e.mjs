// Prueba de punta a punta de Liquid Connect y Jam (v98) contra el Worker en local:
//   cd cuentas && npx wrangler dev --local --port 8787
//   node test/salas.e2e.mjs
import { readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import assert from 'node:assert/strict';

const BASE = process.env.CUENTAS_URL || 'http://127.0.0.1:8787';
const WS = BASE.replace(/^http/, 'ws');
const ADMIN = /^ADMIN=(.+)$/m.exec(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'))?.[1].trim();

async function cuenta(nombre, ip) {
  const correo = `${nombre.toLowerCase()}-${Date.now()}@ejemplo.test`;
  const clave = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const h = { 'Content-Type': 'application/json', 'X-Admin': ADMIN, 'CF-Connecting-IP': ip };
  const alta = await (await fetch(`${BASE}/alta`, { method: 'POST', headers: h, body: JSON.stringify({ correo, clave, nombre }) })).json();
  const ok = await (await fetch(`${BASE}/alta/confirmar`, { method: 'POST', headers: h, body: JSON.stringify({ correo, codigo: alta.codigoPrueba }) })).json();
  return ok.sesion.pase;
}

// Un cliente: abre el WebSocket y guarda los mensajes; espera(t) devuelve el próximo de ese tipo
function cliente(ruta, pase, disp) {
  const ws = new WebSocket(`${WS}${ruta}?disp=${encodeURIComponent(disp)}`, ['liquid', pase]);
  const cola = [];
  const esperas = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const i = esperas.findIndex((x) => x.t === m.t);
    if (i >= 0) esperas.splice(i, 1)[0].resolver(m); else cola.push(m);
  };
  const abierto = new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = () => mal(new Error(`no abrió ${ruta}`)); });
  return {
    ws, abierto,
    enviar: (m) => ws.send(JSON.stringify(m)),
    espera: (t, ms = 3000) => new Promise((resolver, rechazar) => {
      const i = cola.findIndex((m) => m.t === t);
      if (i >= 0) { resolver(cola.splice(i, 1)[0]); return; }
      esperas.push({ t, resolver });
      setTimeout(() => rechazar(new Error(`sin «${t}» en ${ms} ms`)), ms);
    }),
    nada: async (t, ms = 600) => { await new Promise((r) => setTimeout(r, ms)); return !cola.some((m) => m.t === t); }
  };
}

const ana = await cuenta('Ana', '10.2.0.1');
const beto = await cuenta('Beto', '10.2.0.2');

// --- Liquid Connect: dos dispositivos de Ana ---
const movil = cliente('/salas/cuenta', ana, 'Android · Chrome');
await movil.abierto;
assert.equal((await movil.espera('bienvenida')).miembros.length, 1);
const pc = cliente('/salas/cuenta', ana, 'Windows · Edge');
await pc.abierto;
const b2 = await pc.espera('bienvenida');
assert.equal(b2.miembros.length, 2, 'el PC ve los dos dispositivos');
const m1 = await movil.espera('miembros');
assert.deepEqual(m1.miembros.map((m) => m.disp).sort(), ['Android · Chrome', 'Windows · Edge']);

pc.enviar({ t: 'estado', track: 'db6:abc', pos: 42.5, sonando: true, cola: ['salt:x', 'mal id'] });
const e = await movil.espera('estado');
assert.equal(e.track, 'db6:abc'); assert.equal(e.disp, 'Windows · Edge'); assert.deepEqual(e.cola, ['salt:x']);

movil.enviar({ t: 'orden', a: b2.yo, accion: 'pause' });
const o = await pc.espera('orden');
assert.equal(o.accion, 'pause'); assert.equal(o.disp, 'Android · Chrome');
movil.enviar({ t: 'orden', a: b2.yo, accion: 'borrar-todo' });
assert.ok(await pc.nada('orden'), 'una acción desconocida no llega');

// Beto no entra en la sala de Ana: tiene la suya
const otro = cliente('/salas/cuenta', beto, 'iPhone · Safari');
await otro.abierto;
const bo = await otro.espera('bienvenida');
assert.equal(bo.miembros.length, 1);
assert.equal(bo.estado, null);
otro.enviar({ t: 'orden', a: b2.yo, accion: 'pause' });
assert.ok(await pc.nada('orden'), 'Beto no puede mandar en el PC de Ana');

// Sin pase, no se entra
const sinPase = new WebSocket(`${WS}/salas/cuenta`, ['liquid', 'falso.falso']);
const cerrado = await new Promise((r) => { sinPase.onerror = () => r(true); sinPase.onopen = () => r(false); });
assert.ok(cerrado, 'con un pase falso no abre');

// --- Jam: Ana lo crea, Beto se une con el código ---
let r = await fetch(`${BASE}/jam`, { method: 'POST', headers: { Authorization: `Bearer ${ana}`, 'CF-Connecting-IP': '10.2.0.1' } });
assert.equal(r.status, 201);
const { codigo } = await r.json();
assert.match(codigo, /^[A-Z2-9]{6}$/);
const anfitriona = cliente(`/salas/jam/${codigo}`, ana, 'Windows · Edge');
await anfitriona.abierto;
assert.equal((await anfitriona.espera('bienvenida')).anfitrion, true);
const invitado = cliente(`/salas/jam/${codigo.toLowerCase()}`, beto, 'iPhone · Safari');
await invitado.abierto;
const bi = await invitado.espera('bienvenida');
assert.equal(bi.anfitrion, false);
assert.equal(bi.miembros.length, 2);

anfitriona.enviar({ t: 'estado', track: 'pepper:c', pos: 10, sonando: true });
assert.equal((await invitado.espera('estado')).track, 'pepper:c');
invitado.enviar({ t: 'estado', track: 'x:intruso', pos: 0, sonando: true });
assert.ok(await anfitriona.nada('estado'), 'un invitado no cambia lo que suena');
invitado.enviar({ t: 'anadir', id: 'db4:d' });
const a = await anfitriona.espera('anadir');
assert.equal(a.id, 'db4:d'); assert.equal(a.de, 'Beto');

const malo = new WebSocket(`${WS}/salas/jam/ZZZZZZ`, ['liquid', beto]);
const noEntra = await new Promise((res) => { malo.onerror = () => res(true); malo.onopen = () => res(false); });
assert.ok(noEntra, 'un Jam que no existe no abre');

[movil, pc, otro, anfitriona, invitado].forEach((c) => c.ws.close());
console.log('OK: Liquid Connect y Jam');
