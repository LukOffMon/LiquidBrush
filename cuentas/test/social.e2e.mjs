// Prueba de punta a punta de las playlists colaborativas y los Blends (v97) contra el Worker en local.
//   cd cuentas && npx wrangler d1 migrations apply liquid-cuentas-db --local && npx wrangler dev --local --port 8787
//   node test/social.e2e.mjs            (lee ADMIN de .dev.vars para el modo de prueba: sin correos ni Turnstile)
import { readFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import assert from 'node:assert/strict';

const BASE = process.env.CUENTAS_URL || 'http://127.0.0.1:8787';
const ADMIN = /^ADMIN=(.+)$/m.exec(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'))?.[1].trim();
assert.ok(ADMIN, 'Falta ADMIN en cuentas/.dev.vars');
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

async function api(ruta, { metodo = 'GET', cuerpo, pase, ip = '10.0.0.1' } = {}) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      'X-Admin': ADMIN, 'CF-Connecting-IP': ip,
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      ...(pase ? { Authorization: `Bearer ${pase}` } : {})
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  return { estado: r.status, datos: await r.json().catch(() => ({})) };
}

async function cuenta(nombre, ip) {
  const correo = `${nombre.toLowerCase()}-${Date.now()}@ejemplo.test`;
  const clave = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const alta = await api('/alta', { metodo: 'POST', cuerpo: { correo, clave, nombre }, ip });
  assert.equal(alta.estado, 200, JSON.stringify(alta.datos));
  const ok = await api('/alta/confirmar', { metodo: 'POST', cuerpo: { correo, codigo: alta.datos.codigoPrueba }, ip });
  assert.equal(ok.estado, 200, JSON.stringify(ok.datos));
  return ok.datos.sesion.pase;
}

const ana = await cuenta('Ana', '10.0.0.2');
const beto = await cuenta('Beto', '10.0.0.3');
const cris = await cuenta('Cris', '10.0.0.4');

// --- Playlists colaborativas ---
let r = await api('/compartidas', { metodo: 'POST', pase: ana, cuerpo: { nombre: 'Viaje', canciones: ['db6:a', 'salt:b', 'mal id con espacios'] } });
assert.equal(r.estado, 201);
const lista = r.datos.lista;
assert.equal(lista.id.length, 16);
assert.deepEqual(lista.canciones.map((c) => c.i), ['db6:a', 'salt:b'], 'los ids no válidos se descartan');
assert.equal(lista.canciones[0].p, 'Ana');
assert.equal(lista.soyDueno, true);

r = await api(`/compartidas/${lista.id}`, { pase: beto });
assert.equal(r.estado, 404, 'sin unirse, Beto no la ve');
r = await api(`/compartidas/${lista.id}/canciones`, { metodo: 'POST', pase: beto, cuerpo: { anadir: ['x:1'] } });
assert.equal(r.estado, 404, 'sin unirse, Beto no la cambia');

r = await api(`/compartidas/${lista.id}/unirse`, { metodo: 'POST', pase: beto });
assert.equal(r.estado, 200);
assert.deepEqual(r.datos.lista.miembros, ['Ana', 'Beto']);
assert.equal(r.datos.lista.soyDueno, false);

// Dos cambios a la vez: los dos quedan (control por rev con reintento)
const [r1, r2] = await Promise.all([
  api(`/compartidas/${lista.id}/canciones`, { metodo: 'POST', pase: ana, cuerpo: { anadir: ['pepper:c'] } }),
  api(`/compartidas/${lista.id}/canciones`, { metodo: 'POST', pase: beto, cuerpo: { anadir: ['db4:d'], quitar: ['salt:b'] } })
]);
assert.equal(r1.estado, 200); assert.equal(r2.estado, 200);
r = await api(`/compartidas/${lista.id}`, { pase: ana });
assert.deepEqual(new Set(r.datos.lista.canciones.map((c) => c.i)), new Set(['db6:a', 'pepper:c', 'db4:d']));
assert.equal(r.datos.lista.canciones.find((c) => c.i === 'db4:d').p, 'Beto');
assert.equal(r.datos.lista.rev, 3);

// Solo la dueña cambia el nombre
await api(`/compartidas/${lista.id}/canciones`, { metodo: 'POST', pase: beto, cuerpo: { nombre: 'De Beto' } });
r = await api(`/compartidas/${lista.id}`, { pase: ana });
assert.equal(r.datos.lista.nombre, 'Viaje');

r = await api('/compartidas', { pase: beto });
assert.deepEqual(r.datos.listas.map((l) => l.id), [lista.id]);

// Beto sale; Ana la borra para todos
r = await api(`/compartidas/${lista.id}`, { metodo: 'DELETE', pase: beto });
assert.equal(r.datos.borrada, false);
r = await api(`/compartidas/${lista.id}`, { pase: beto });
assert.equal(r.estado, 404);
r = await api(`/compartidas/${lista.id}`, { metodo: 'DELETE', pase: ana });
assert.equal(r.datos.borrada, true);
r = await api(`/compartidas/${lista.id}`, { pase: ana });
assert.equal(r.estado, 404);
r = await api('/compartidas/no-existe-de-16c', { pase: ana });
assert.equal(r.estado, 404);
r = await api('/compartidas/corto', { pase: ana });
assert.equal(r.estado, 404);

// --- Blends ---
r = await api('/blends', { metodo: 'POST', pase: ana, cuerpo: { gusto: { t: [] , a: [] } } });
assert.equal(r.estado, 400, 'sin gusto no hay Blend');
r = await api('/blends', { metodo: 'POST', pase: ana, cuerpo: { gusto: { t: ['db6:a', 'salt:b'], a: ['radiohead'] } } });
assert.equal(r.estado, 201);
const blend = r.datos.blend;
assert.equal(blend.miembros.length, 1);
assert.equal(blend.miembros[0].yo, true);

r = await api(`/blends/${blend.id}`, { pase: cris });
assert.equal(r.estado, 404, 'sin unirse, Cris no ve el gusto de Ana');
r = await api(`/blends/${blend.id}/unirse`, { metodo: 'POST', pase: beto, cuerpo: { gusto: { t: ['db4:d'], a: ['bjork', 'radiohead'] } } });
assert.equal(r.estado, 200);
assert.deepEqual(r.datos.blend.miembros.map((m) => [m.nombre, m.yo]).sort(), [['Ana', false], ['Beto', true]]);
assert.deepEqual(r.datos.blend.miembros.find((m) => m.nombre === 'Ana').gusto, { t: ['db6:a', 'salt:b'], a: ['radiohead'] });

r = await api(`/blends/${blend.id}/gusto`, { metodo: 'PUT', pase: ana, cuerpo: { gusto: { t: ['pepper:c'], a: [] } } });
assert.equal(r.estado, 200);
assert.deepEqual(r.datos.blend.miembros.find((m) => m.yo).gusto.t, ['pepper:c']);
r = await api(`/blends/${blend.id}/gusto`, { metodo: 'PUT', pase: cris, cuerpo: { gusto: { t: ['x:1'], a: [] } } });
assert.equal(r.estado, 404, 'PUT gusto no sirve para colarse');

r = await api('/blends', { pase: beto });
assert.deepEqual(r.datos.blends.map((b) => b.id), [blend.id]);
await api(`/blends/${blend.id}`, { metodo: 'DELETE', pase: ana });
await api(`/blends/${blend.id}`, { metodo: 'DELETE', pase: beto });
r = await api(`/blends/${blend.id}`, { pase: beto });
assert.equal(r.estado, 404, 'sin miembros, el Blend desaparece');

r = await api('/compartidas');
assert.equal(r.estado, 401, 'sin sesión, nada');

console.log('OK: playlists colaborativas y Blends');
