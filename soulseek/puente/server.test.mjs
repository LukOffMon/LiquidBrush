// Tests del puente con un slskd de mentira (no hace falta Soulseek ni Docker)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { crearPuente } from './server.mjs';

const CLAVE = 'clave-de-prueba-1234567890';
const frame = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)]);
const mp3 = (n) => Buffer.concat(Array.from({ length: n }, () => frame));
// Etiqueta ID3v2.3 con título y artista
function id3(titulo, artista) {
  const fr = (id, t) => { const body = Buffer.concat([Buffer.from([3]), Buffer.from(t, 'utf8')]); const h = Buffer.alloc(10); h.write(id, 0, 'latin1'); h.writeUInt32BE(body.length, 4); return Buffer.concat([h, body]); };
  const frames = Buffer.concat([fr('TIT2', titulo), fr('TPE1', artista)]);
  const h = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
  const n = frames.length;
  h[6] = (n >> 21) & 127; h[7] = (n >> 14) & 127; h[8] = (n >> 7) & 127; h[9] = n & 127;
  return Buffer.concat([h, frames]);
}

async function montar(extra = {}, previo = {}) {
  const musica = fs.mkdtempSync(path.join(os.tmpdir(), 'skd-musica-'));
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'skd-datos-'));
  for (const [nombre, contenido] of Object.entries(previo)) fs.writeFileSync(path.join(datos, nombre), JSON.stringify(contenido));
  fs.mkdirSync(path.join(musica, 'Discos'));
  fs.writeFileSync(path.join(musica, 'Discos', '01 - Banda - Ya Estaba.mp3'), Buffer.concat([id3('Ya Estaba', 'Banda Local'), mp3(200)]));
  const estado = { descargas: [], pedidas: [], borradas: [], porUsuario: {}, enLinea: ['ana', 'beto'] };
  const fake = http.createServer((req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
    if (req.headers['x-api-key'] !== 'api-key-falsa') return send(401);
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url === '/api/v0/searches' && req.method === 'POST') {
        // slskd cuenta searchTimeout en milisegundos: un número pequeño cierra la búsqueda sin resultados
        if (!(JSON.parse(body).searchTimeout >= 1000)) return send(400, { error: 'searchTimeout en ms' });
        return send(200, { id: JSON.parse(body).id, state: 'InProgress' });
      }
      if (/^\/api\/v0\/searches\/[^/]+$/.test(req.url) && req.method === 'GET') return send(200, { isComplete: true, state: 'Completed, TimedOut' });
      if (/\/responses$/.test(req.url)) return send(200, [
        { username: 'ana', hasFreeUploadSlot: true, queueLength: 0, uploadSpeed: 900000, files: [
          { filename: '@@ana\\Musica\\Neón Sur - Noche\\01 - Neón Sur - Medianoche.mp3', size: 8000000, bitRate: 320, length: 210 },
          { filename: '@@ana\\Musica\\Neón Sur - Noche\\cover.jpg', size: 900000 },
          { filename: '@@ana\\Musica\\Otra\\Nada que ver.mp3', size: 7000000, bitRate: 320, length: 200 }] },
        { username: 'beto', hasFreeUploadSlot: false, queueLength: 40, uploadSpeed: 10000, files: [
          { filename: 'C:\\mp3\\Neón Sur - Medianoche.mp3', size: 4000000, bitRate: 128, length: 211 }] }
      ]);
      if (req.method === 'DELETE') { estado.borradas.push(req.url); return send(204); }
      const dl = /^\/api\/v0\/transfers\/downloads\/([^/?]+)$/.exec(req.url);
      if (dl && req.method === 'POST') {
        const u = decodeURIComponent(dl[1]);
        if (!estado.enLinea.includes(u)) return send(404, {});
        estado.pedidas.push(JSON.parse(body));
        estado.porUsuario[u] = estado.porUsuario[u] || [];
        return send(201, {});
      }
      if (dl && req.method === 'GET') {
        const u = decodeURIComponent(dl[1]);
        const files = u === 'ana' ? estado.descargas : (estado.porUsuario[u] || []);
        return send(200, { username: u, directories: [{ directory: 'x', files }] });
      }
      if (req.url === '/api/v0/application') return send(200, { server: { state: 'Connected, LoggedIn' } });
      return send(404, {});
    });
  });
  await new Promise((ok) => fake.listen(0, ok));
  const { servidor, limpiar } = crearPuente({ SLSKD_URL: `http://127.0.0.1:${fake.address().port}`, SLSKD_API_KEY: 'api-key-falsa', LIQUID_CLAVE: CLAVE,
    MUSICA_DIR: musica, DATOS_DIR: datos, PUBLICO: 'https://skd.example', PAUSA_MS: 10, ESPERA_BUSQUEDA_MS: 500, PORTADAS_ITUNES: '0', ...extra });
  await new Promise((ok) => servidor.listen(0, ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const api = (ruta, init = {}) => fetch(`${base}${ruta}`, { ...init, headers: { Authorization: `Bearer ${CLAVE}`, Origin: 'https://lukoffmon.github.io', ...(init.headers || {}) } });
  return { base, api, musica, datos, estado, limpiar, cerrar: () => { servidor.close(); fake.close(); } };
}

test('sin clave no se entra; /salud sí', async () => {
  const m = await montar();
  try {
    assert.equal((await fetch(`${m.base}/salud`)).status, 200);
    assert.equal((await fetch(`${m.base}/api/lista.json`)).status, 401);
    assert.equal((await fetch(`${m.base}/api/lista.json?k=mala`)).status, 401);
    const ok = await m.api('/api/estado');
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://lukoffmon.github.io');
    assert.deepEqual(await ok.json(), { ok: true, soulseek: true, canciones: 1, dueno: true, publico: false, cache: { horas: 24, enDisco: 0 } });
  } finally { m.cerrar(); }
});

test('la biblioteca lee etiquetas y duración, y el audio se sirve por rangos', async () => {
  const m = await montar();
  try {
    const lista = await (await m.api('/api/lista.json')).json();
    assert.equal(lista.length, 1);
    assert.equal(lista[0].title, 'Ya Estaba');
    assert.equal(lista[0].artist, 'Banda Local');
    assert.equal(lista[0].duration, '0:05');
    assert.match(lista[0].src, /^https:\/\/skd\.example\/musica\/Discos\/01%20-%20Banda%20-%20Ya%20Estaba\.mp3\?k=/);
    const ruta = new URL(lista[0].src).pathname + new URL(lista[0].src).search;
    const parte = await fetch(`${m.base}${ruta}`, { headers: { Range: 'bytes=0-99' } });
    assert.equal(parte.status, 206);
    assert.equal(parte.headers.get('content-type'), 'audio/mpeg');
    assert.equal((await parte.arrayBuffer()).byteLength, 100);
    assert.equal((await fetch(`${m.base}/musica/..%2F..%2Fetc%2Fpasswd?k=${CLAVE}`)).status, 403);
  } finally { m.cerrar(); }
});

test('buscar elige la mejor copia y descarta lo que no es audio o no encaja', async () => {
  const m = await montar();
  try {
    const { resultados } = await (await m.api('/api/buscar?q=neon%20sur%20medianoche')).json();
    assert.equal(resultados.length, 1);
    assert.equal(resultados[0].titulo, 'Medianoche');
    assert.equal(resultados[0].artista, 'Neón Sur');
    assert.equal(resultados[0].usuario, 'ana');
    assert.equal(resultados[0].kbps, 320);
  } finally { m.cerrar(); }
});

test('pedir, seguir el progreso y recibir la canción ya en la biblioteca', async () => {
  const m = await montar();
  try {
    const { resultados } = await (await m.api('/api/buscar?q=neon%20sur%20medianoche')).json();
    const id = resultados[0].id;
    const pedido = await (await m.api('/api/pedir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })).json();
    assert.equal(pedido.estado, 'en-cola');
    assert.equal(m.estado.pedidas[0][0].size, 8000000);
    const remoto = '@@ana\\Musica\\Neón Sur - Noche\\01 - Neón Sur - Medianoche.mp3';
    m.estado.descargas = [{ filename: remoto, state: 'InProgress', percentComplete: 42.4 }];
    let { pedidos } = await (await m.api(`/api/pedidos?ids=${id}`)).json();
    assert.deepEqual(pedidos[0], { id, estado: 'bajando', porcentaje: 42 });
    // Termina: slskd deja el archivo en la carpeta de descargas
    fs.mkdirSync(path.join(m.musica, 'Neón Sur - Noche'));
    fs.writeFileSync(path.join(m.musica, 'Neón Sur - Noche', '01 - Neón Sur - Medianoche.mp3'), mp3(300));
    m.estado.descargas = [{ filename: remoto, state: 'Completed, Succeeded', percentComplete: 100 }];
    ({ pedidos } = await (await m.api(`/api/pedidos?ids=${id}`)).json());
    assert.equal(pedidos[0].estado, 'lista');
    assert.equal(pedidos[0].cancion.title, 'Medianoche');
    assert.equal(pedidos[0].cancion.artist, 'Neón Sur');
    const lista = await (await m.api('/api/lista.json')).json();
    assert.equal(lista.length, 2);
    // Ya en disco: sigue lista aunque slskd la olvide
    m.estado.descargas = [];
    ({ pedidos } = await (await m.api(`/api/pedidos?ids=${id}`)).json());
    assert.equal(pedidos[0].estado, 'lista');
  } finally { m.cerrar(); }
});

/* ---------- v2: carrera entre copias, caché de 24 h y volver a bajar al tocar ---------- */
const REMOTO_ANA = '@@ana\\Musica\\Neón Sur - Noche\\01 - Neón Sur - Medianoche.mp3';
const REMOTO_BETO = 'C:\\mp3\\Neón Sur - Medianoche.mp3';
const json = { 'Content-Type': 'application/json' };

async function pedirMedianoche(m) {
  const { resultados } = await (await m.api('/api/buscar?q=neon%20sur%20medianoche')).json();
  const id = resultados[0].id;
  assert.equal(resultados[0].copias, 2);
  await m.api('/api/pedir', { method: 'POST', headers: json, body: JSON.stringify({ id }) });
  return id;
}
// slskd termina: deja el archivo en musica/ y marca la copia de ana como hecha
function terminarAna(m, bytes = mp3(300)) {
  fs.mkdirSync(path.join(m.musica, 'Neón Sur - Noche'), { recursive: true });
  fs.writeFileSync(path.join(m.musica, 'Neón Sur - Noche', '01 - Neón Sur - Medianoche.mp3'), bytes);
  m.estado.descargas = [{ id: 't-ana', filename: REMOTO_ANA, state: 'Completed, Succeeded', percentComplete: 100 }];
}

test('pide las dos mejores copias a la vez y cancela la que pierde la carrera', async () => {
  const m = await montar();
  try {
    const id = await pedirMedianoche(m);
    assert.deepEqual(m.estado.pedidas.map((p) => p[0].filename), [REMOTO_ANA, REMOTO_BETO]);
    m.estado.porUsuario.beto = [{ id: 't-beto', filename: REMOTO_BETO, state: 'Queued, Remotely' }];
    m.estado.descargas = [{ id: 't-ana', filename: REMOTO_ANA, state: 'InProgress', percentComplete: 10 }];
    const { pedidos } = await (await m.api(`/api/pedidos?ids=${id}`)).json();
    assert.equal(pedidos[0].estado, 'bajando');
    await new Promise((ok) => setTimeout(ok, 100));
    assert.ok(m.estado.borradas.some((u) => u.includes('/downloads/beto/t-beto')), 'cancela la copia de beto');
  } finally { m.cerrar(); }
});

test('si una copia falla se sigue con la otra; si fallan todas, es un fallo', async () => {
  const m = await montar();
  try {
    const id = await pedirMedianoche(m);
    m.estado.descargas = [{ id: 't-ana', filename: REMOTO_ANA, state: 'Completed, Errored' }];
    m.estado.porUsuario.beto = [{ id: 't-beto', filename: REMOTO_BETO, state: 'InProgress', percentComplete: 30 }];
    let { pedidos } = await (await m.api(`/api/pedidos?ids=${id}`)).json();
    assert.deepEqual(pedidos[0], { id, estado: 'bajando', porcentaje: 30 });
    m.estado.porUsuario.beto = [{ id: 't-beto', filename: REMOTO_BETO, state: 'Completed, TimedOut', exception: 'Se cortó' }];
    ({ pedidos } = await (await m.api(`/api/pedidos?ids=${id}`)).json());
    assert.equal(pedidos[0].estado, 'fallo');
  } finally { m.cerrar(); }
});

test('la caché borra lo que lleva 24 h sin sonar, la canción sigue en la biblioteca y vuelve al tocarla', async () => {
  const m = await montar();
  try {
    const id = await pedirMedianoche(m);
    terminarAna(m);
    const { pedidos } = await (await m.api(`/api/pedidos?ids=${id}`)).json();
    const cancion = pedidos[0].cancion;
    assert.match(cancion.src, /^https:\/\/skd\.example\/cancion\/[0-9a-f]{16}\?k=/);
    const ruta = new URL(cancion.src).pathname + new URL(cancion.src).search;
    assert.equal((await fetch(`${m.base}${ruta}`)).status, 200);

    // A las 23 h no se toca; a las 25 h sí. Lo que pusiste a mano nunca.
    assert.equal((await m.limpiar(Date.now() + 23 * 3600000)).borradas, 0);
    assert.equal((await m.limpiar(Date.now() + 25 * 3600000)).borradas, 1);
    assert.ok(!fs.existsSync(path.join(m.musica, 'Neón Sur - Noche')), 'borra el archivo y su carpeta vacía');
    assert.ok(fs.existsSync(path.join(m.musica, 'Discos', '01 - Banda - Ya Estaba.mp3')), 'lo propio no se borra');
    const lista = await (await m.api('/api/lista.json')).json();
    assert.deepEqual(lista.map((c) => c.title).sort(), ['Medianoche', 'Ya Estaba']);

    // Tocarla otra vez: se vuelve a pedir a Soulseek y suena en cuanto llega
    m.estado.pedidas = [];
    m.estado.descargas = [];
    const vuelta = fetch(`${m.base}${ruta}`);
    await new Promise((ok) => setTimeout(ok, 150));
    assert.equal(m.estado.pedidas.length, 2, 'la vuelve a pedir a las dos copias');
    terminarAna(m);
    const res = await vuelta;
    assert.equal(res.status, 200);
    assert.equal((await res.arrayBuffer()).byteLength, mp3(300).length);
  } finally { m.cerrar(); }
});

test('con la carpeta de descargas a medias, suena mientras baja', async () => {
  const incompleto = fs.mkdtempSync(path.join(os.tmpdir(), 'skd-incompleto-'));
  const m = await montar({ INCOMPLETO_DIR: incompleto });
  try {
    const completo = mp3(300);
    // El tamaño que anuncia Soulseek es el del archivo real
    const { resultados } = await (await m.api('/api/buscar?q=neon%20sur%20medianoche')).json();
    const d = JSON.parse(Buffer.from(resultados[0].id, 'base64url').toString());
    d.c = [{ ...d.c[0], s: completo.length }];
    const id = Buffer.from(JSON.stringify(d)).toString('base64url');
    await m.api('/api/pedir', { method: 'POST', headers: json, body: JSON.stringify({ id }) });
    const { pedidos } = await (await m.api(`/api/pedidos?ids=${id}`)).json();
    assert.equal(pedidos[0].estado, 'en-cola');
    // Nunca llegó: no está en la biblioteca todavía, pero la memoria la tiene → se pide su /cancion
    const memoria = JSON.parse(fs.readFileSync(path.join(m.datos, 'memoria.json'), 'utf8'));
    const recId = Object.keys(memoria)[0];

    // Va por la mitad, en la carpeta de slskd
    fs.mkdirSync(path.join(incompleto, 'Neón Sur - Noche'));
    const medio = path.join(incompleto, 'Neón Sur - Noche', '01 - Neón Sur - Medianoche.mp3');
    fs.writeFileSync(medio, completo.subarray(0, 70000));
    m.estado.descargas = [{ id: 't-ana', filename: REMOTO_ANA, state: 'InProgress', percentComplete: 56 }];
    const res = await fetch(`${m.base}/cancion/${recId}?k=${CLAVE}`, { headers: { Range: 'bytes=0-' } });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get('content-length'), String(completo.length));
    // Termina mientras suena: slskd lo mueve a musica/
    setTimeout(() => {
      fs.rmSync(medio);
      terminarAna(m, completo);
    }, 300);
    const recibido = Buffer.from(await res.arrayBuffer());
    assert.ok(recibido.equals(completo), 'llega la canción entera y sin cortes');
  } finally { m.cerrar(); }
});

test('los pedidos de la versión anterior pasan a la memoria sin perderse', async () => {
  const viejo = Buffer.from(JSON.stringify({ u: 'ana', f: REMOTO_ANA, s: 8000000 })).toString('base64url');
  const m = await montar({}, { 'pedidos.json': { [viejo]: { u: 'ana', f: REMOTO_ANA, s: 8000000, at: 1 } } });
  try {
    let { pedidos } = await (await m.api(`/api/pedidos?ids=${viejo}`)).json();
    assert.notEqual(pedidos[0].estado, 'desconocido');
    // Ya estaba en disco de antes: se reconoce en cuanto slskd la da por hecha
    await m.api('/api/pedir', { method: 'POST', headers: json, body: JSON.stringify({ id: viejo }) });
    terminarAna(m);
    ({ pedidos } = await (await m.api(`/api/pedidos?ids=${viejo}`)).json());
    assert.equal(pedidos[0].estado, 'lista');
    assert.equal(pedidos[0].cancion.title, 'Medianoche');
  } finally { m.cerrar(); }
});

test('si Soulseek tarda, /cancion avisa que sigue bajando y la descarga no se corta', async () => {
  const m = await montar({ ESPERA_REPRODUCIR_MS: 300 });
  try {
    const id = await pedirMedianoche(m);
    terminarAna(m);
    const { pedidos } = await (await m.api(`/api/pedidos?ids=${id}`)).json();
    const ruta = new URL(pedidos[0].cancion.src).pathname + new URL(pedidos[0].cancion.src).search;
    await m.limpiar(Date.now() + 25 * 3600000);
    m.estado.descargas = [];
    const res = await fetch(`${m.base}${ruta}`);
    assert.equal(res.status, 504);
    // Llega después: la siguiente vez suena al momento
    terminarAna(m);
    await new Promise((ok) => setTimeout(ok, 50));
    const otra = await fetch(`${m.base}${ruta}`);
    assert.equal(otra.status, 200);
  } finally { m.cerrar(); }
});

/* ---------- v3: SKd para quien tenga cuenta, cupos, gestión, orden en disco y portadas ---------- */
const CUENTAS = { 'pase-ana': 'ana@ejemplo.org', 'pase-beto': 'Beto@Ejemplo.org' };
const abierto = (extra = {}) => montar({ PUBLICO_ABIERTO: '1', verificarPase: async (p) => CUENTAS[p] || null, ...extra });
const conPase = (m, pase) => (ruta, init = {}) => fetch(`${m.base}${ruta}`, { ...init, headers: { 'X-Liquid-Pase': pase, ...(init.headers || {}) } });
// Un pedido inventado (otra canción de ana) en el formato de los resultados de búsqueda
const pedidoFalso = (n) => Buffer.from(JSON.stringify({ c: [{ u: 'ana', f: `@@ana\\Otras\\Tema ${n}.mp3`, s: 5000000 }], t: `Tema ${n}`, a: 'Grupo' })).toString('base64url');

test('sin cuenta no se usa SKd; con cuenta sí, y nunca se ve tu música propia', async () => {
  const m = await abierto();
  try {
    assert.equal((await fetch(`${m.base}/salud`)).status, 200);
    for (const ruta of ['/api/lista.json', '/api/buscar?q=neon', '/api/estado']) assert.equal((await fetch(`${m.base}${ruta}`)).status, 401, ruta);
    assert.equal((await conPase(m, 'pase-falso')('/api/lista.json')).status, 401);
    const ana = conPase(m, 'pase-ana');
    assert.deepEqual(await (await ana('/api/lista.json')).json(), [], 'lo que pusiste a mano no sale');
    const estado = await (await ana('/api/estado')).json();
    assert.deepEqual(estado.cupo, { dia: 5, restantes: 5 });
    assert.equal(estado.dueno, false);
    // La gestión es solo con tu clave
    assert.equal((await ana('/api/admin/disco')).status, 401);
    assert.equal((await fetch(`${m.base}/musica/Discos/01%20-%20Banda%20-%20Ya%20Estaba.mp3`)).status, 401);
  } finally { m.cerrar(); }
});

test('5 canciones nuevas al día por cuenta (la misma cuenta en otro dispositivo cuenta igual)', async () => {
  const m = await abierto();
  try {
    const ana = conPase(m, 'pase-ana');
    for (let n = 1; n <= 5; n++) {
      const r = await ana('/api/pedir', { method: 'POST', headers: json, body: JSON.stringify({ id: pedidoFalso(n) }) });
      assert.equal(r.status, 200, `pedido ${n}`);
      assert.equal((await r.json()).cupo.restantes, 5 - n);
    }
    const sexta = await ana('/api/pedir', { method: 'POST', headers: json, body: JSON.stringify({ id: pedidoFalso(6) }) });
    assert.equal(sexta.status, 429);
    assert.match((await sexta.json()).error, /mañana/);
    // Pedir otra vez una que ya se está bajando no gasta cupo
    assert.equal((await ana('/api/pedir', { method: 'POST', headers: json, body: JSON.stringify({ id: pedidoFalso(1) }) })).status, 200);
    // Otra cuenta tiene su propio cupo
    const beto = conPase(m, 'pase-beto');
    assert.equal((await beto('/api/pedir', { method: 'POST', headers: json, body: JSON.stringify({ id: pedidoFalso(7) }) })).status, 200);
  } finally { m.cerrar(); }
});

test('al llegar se ordena en Artista/Álbum/Título y se le pone la portada que trae el archivo', async () => {
  const m = await montar({ PORTADAS_ITUNES: '0' });
  try {
    const id = await pedirMedianoche(m);
    // Una imagen JPEG falsa dentro de la etiqueta ID3 (APIC, portada delantera)
    const img = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(2000)]);
    const apic = Buffer.concat([Buffer.from([0]), Buffer.from('image/jpeg\0', 'latin1'), Buffer.from([3]), Buffer.from('\0', 'latin1'), img]);
    const h = Buffer.alloc(10); h.write('APIC', 0, 'latin1'); h.writeUInt32BE(apic.length, 4);
    const frames = Buffer.concat([h, apic]);
    const cab = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
    const n = frames.length; cab[6] = (n >> 21) & 127; cab[7] = (n >> 14) & 127; cab[8] = (n >> 7) & 127; cab[9] = n & 127;
    terminarAna(m, Buffer.concat([cab, frames, mp3(300)]));
    const { pedidos } = await (await m.api(`/api/pedidos?ids=${id}`)).json();
    assert.equal(pedidos[0].estado, 'lista');
    assert.ok(fs.existsSync(path.join(m.musica, 'Neón Sur', 'Neón Sur - Noche', 'Medianoche.mp3')), 'ordenada');
    assert.ok(!fs.existsSync(path.join(m.musica, 'Neón Sur - Noche')), 'sin la carpeta vieja');
    await new Promise((ok) => setTimeout(ok, 100));
    const lista = await (await m.api('/api/lista.json')).json();
    const cancion = lista.find((c) => c.title === 'Medianoche');
    assert.match(cancion.cover, /\/portada\/[0-9a-f]{16}\?v=/);
    const p = await fetch(`${m.base}${new URL(cancion.cover).pathname}`, { headers: { Authorization: `Bearer ${CLAVE}` } });
    assert.equal(p.status, 200);
    assert.equal(p.headers.get('content-type'), 'image/jpeg');
    assert.ok(Buffer.from(await p.arrayBuffer()).equals(img));
    // Y sigue sonando desde su sitio nuevo
    assert.equal((await fetch(`${m.base}${new URL(cancion.src).pathname}${new URL(cancion.src).search}`)).status, 200);
  } finally { m.cerrar(); }
});

test('sin portada en el archivo, se busca en iTunes', async () => {
  const img = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), crypto.randomBytes(3000)]);
  const itunes = http.createServer((req, res) => {
    if (req.url.startsWith('/search')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ results: [{ artistName: 'Neón Sur', artworkUrl100: `http://127.0.0.1:${itunes.address().port}/img/100x100bb.jpg` }] }));
    }
    if (req.url === '/img/600x600bb.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(img); }
    res.writeHead(404); res.end();
  });
  await new Promise((ok) => itunes.listen(0, ok));
  const m = await montar({ PORTADAS_ITUNES: '1', ITUNES_URL: `http://127.0.0.1:${itunes.address().port}` });
  try {
    const id = await pedirMedianoche(m);
    terminarAna(m);
    await m.api(`/api/pedidos?ids=${id}`);
    await new Promise((ok) => setTimeout(ok, 300));
    const cancion = (await (await m.api('/api/lista.json')).json()).find((c) => c.title === 'Medianoche');
    assert.ok(cancion.cover, 'tiene portada');
    const p = await fetch(`${m.base}${new URL(cancion.cover).pathname}`, { headers: { Authorization: `Bearer ${CLAVE}` } });
    assert.ok(Buffer.from(await p.arrayBuffer()).equals(img));
  } finally { m.cerrar(); itunes.close(); }
});

test('tú decides: lo fijado se queda; quitar la borra para todos; y el tope de disco respeta lo fijado', async () => {
  const m = await montar({ DISCO_MAX_GB: String(1 / 1024 / 1024 / 1024), PORTADAS_ITUNES: '0' }); // tope de 1 byte
  try {
    const id = await pedirMedianoche(m);
    terminarAna(m);
    await m.api(`/api/pedidos?ids=${id}`);
    const recId = Object.keys(JSON.parse(fs.readFileSync(path.join(m.datos, 'memoria.json'), 'utf8')))[0];
    const admin = (ruta, cuerpo) => m.api(`/api/admin/${ruta}`, { method: 'POST', headers: json, body: JSON.stringify(cuerpo) });
    assert.equal((await admin('fijar', { id: recId, fijar: true })).status, 200);
    let r = await m.limpiar(Date.now() + 48 * 3600000);
    assert.equal(r.borradas, 0, 'fijada: ni las 24 h ni el tope la borran');
    assert.ok((await (await m.api('/api/lista.json')).json()).find((c) => c.id === recId).skd.fijada);
    await admin('fijar', { id: recId, fijar: false });
    r = await m.limpiar(Date.now());
    assert.equal(r.borradas, 1, 'sin fijar y sobre el tope: se borra aunque no hayan pasado 24 h');
    assert.ok(fs.existsSync(path.join(m.musica, 'Discos', '01 - Banda - Ya Estaba.mp3')), 'lo propio nunca');
    assert.equal((await admin('quitar', { id: recId })).status, 200);
    const lista = await (await m.api('/api/lista.json')).json();
    assert.ok(!lista.some((c) => c.id === recId), 'quitada: ya no está para nadie');
    assert.equal((await (await m.api('/api/admin/disco')).json()).enDisco, 0);
  } finally { m.cerrar(); }
});
