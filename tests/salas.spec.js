// v98: Liquid Connect y Jam de punta a punta: dos dispositivos de Ana y Beto, con el Worker de cuentas de verdad
// corriendo en local (cd cuentas && npx wrangler dev --local --port 8787). Sin ese Worker, se omiten.
import { test, expect, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const LOCAL = process.env.CUENTAS_URL || 'http://127.0.0.1:8787';
const PROD = 'https://liquid-cuentas.liquidbulletofficial.workers.dev';
let ADMIN = '';
try { ADMIN = /^ADMIN=(.+)$/m.exec(readFileSync('cuentas/.dev.vars', 'utf8'))?.[1].trim() || ''; } catch { /* sin Worker local */ }

async function workerLocal() {
  if (!ADMIN) return false;
  try { return (await (await fetch(`${LOCAL}/`)).json()).version >= '1.3.0'; } catch { return false; }
}

async function crearCuenta(nombre) {
  const correo = `${nombre.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@ejemplo.test`;
  const clave = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const h = { 'Content-Type': 'application/json', 'X-Admin': ADMIN, 'CF-Connecting-IP': `10.3.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  const alta = await (await fetch(`${LOCAL}/alta`, { method: 'POST', headers: h, body: JSON.stringify({ correo, clave, nombre }) })).json();
  const ok = await (await fetch(`${LOCAL}/alta/confirmar`, { method: 'POST', headers: h, body: JSON.stringify({ correo, codigo: alta.codigoPrueba }) })).json();
  return { ...ok.sesion, perfil: ok.perfil, ultimaSync: 0 };
}

function silentWav(seconds = 60, rate = 8000) {
  const data = Buffer.alloc(seconds * rate);
  data.fill(128);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate, 28); header.writeUInt16LE(1, 32); header.writeUInt16LE(8, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function dispositivo(browser, sesion, perfil = {}) {
  // bypassCSP: en producción las salas van por wss:// (permitido); aquí, por el ws:// del Worker local
  const context = await browser.newContext({ ...perfil, baseURL: 'http://127.0.0.1:4173/', serviceWorkers: 'block', bypassCSP: true });
  await context.addInitScript(({ sesion, ws }) => {
    if (sessionStorage.getItem('prueba-lista')) return;
    sessionStorage.setItem('prueba-lista', '1');
    localStorage.setItem('liquidbrush:tour', 'true');
    localStorage.setItem('liquidbrush:cuenta-ofrecida', 'true');
    localStorage.setItem('liquidbrush:cuenta', JSON.stringify(sesion));
    localStorage.setItem('liquidbrush:cuentas-version', JSON.stringify({ v: '1.3.0', t: Date.now() }));
    localStorage.setItem('liquidbrush:prueba-salas', JSON.stringify(ws));
  }, { sesion, ws: LOCAL.replace(/^http/, 'ws') });
  const wav = silentWav();
  await context.route(/r2\.dev/, (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }));
  await context.route(/lrclib\.net|api\.audius\.co|archive\.org|api\.jamendo\.com|hearthis\.at|api\.openverse\.org/, (route) => route.abort());
  await context.route(`${PROD}/**`, async (route) => {
    const req = route.request();
    const headers = { ...req.headers() };
    delete headers.origin;
    try {
      const res = await fetch(req.url().replace(PROD, LOCAL), { method: req.method(), headers, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() });
      await route.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: { 'content-type': res.headers.get('content-type') || 'application/json', 'access-control-allow-origin': '*' } });
    } catch { await route.abort(); }
  });
  const page = await context.newPage();
  await page.goto('./?view=library');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  return { context, page };
}

const sonando = (page) => page.evaluate(() => [...document.querySelectorAll('audio')].some((a) => a.getAttribute('src') && !a.paused));
const tituloActual = (page) => page.locator('#npTitle').textContent();

test.describe('v98: Liquid Connect y Jam (Worker local)', () => {
  test('Connect: el móvil ve el PC, lo pausa y se trae su canción; Jam: Beto escucha lo de Ana y le manda canciones', async ({ browser }, info) => {
    test.skip(info.project.name !== 'escritorio', 'Una sola vez (escritorio)');
    test.skip(!(await workerLocal()), 'Sin Worker de cuentas 1.3.0 en local');
    test.setTimeout(120000);
    const ana = await crearCuenta('Ana');
    const beto = await crearCuenta('Beto');

    const pc = await dispositivo(browser, ana, { viewport: { width: 1280, height: 800 } });
    const movil = await dispositivo(browser, ana, { ...devices['Pixel 7'] });

    // El PC pone una canción
    await pc.page.locator('#trackList .track').nth(3).locator('.track-main').click();
    await expect.poll(() => sonando(pc.page)).toBe(true);
    const enPc = await tituloActual(pc.page);

    // El móvil abre «Dispositivos y Jam» y ve el PC con lo que suena
    // En el móvil el botón va dentro de Sonando: basta con que no esté oculto
    await expect.poll(() => movil.page.evaluate(() => !document.getElementById('connectBtn').hidden), { timeout: 15000 }).toBe(true);
    await movil.page.evaluate(() => document.getElementById('connectBtn').click());
    const fila = movil.page.locator('.connect-item:not(.is-me)');
    await expect(fila).toHaveCount(1, { timeout: 15000 });
    await expect(fila.locator('.connect-now')).toContainText(enPc.trim(), { timeout: 15000 });

    // Pausar el PC desde el móvil
    await fila.locator('[data-accion="pause"]').click();
    await expect.poll(() => sonando(pc.page), { timeout: 10000 }).toBe(false);

    // «Escuchar aquí»: la canción del PC pasa al móvil
    await fila.locator('[data-accion="traer"]').click();
    await expect.poll(() => tituloActual(movil.page), { timeout: 10000 }).toBe(enPc);

    // --- Jam: Ana (en el PC) lo empieza; Beto entra con el enlace y escucha lo mismo ---
    await pc.page.evaluate(() => { navigator.share = undefined; navigator.clipboard.writeText = async () => {}; document.getElementById('connectBtn').click(); });
    await pc.page.locator('[data-action="jam-crear"]').click();
    const codigo = (await pc.page.locator('.jam-code').textContent({ timeout: 10000 })).replace('Código ', '').trim();
    expect(codigo).toMatch(/^[A-Z2-9]{6}$/);
    await pc.page.evaluate(() => document.getElementById('connectDialog').close());
    await pc.page.locator('#trackList .track').nth(6).locator('.track-main').click();
    await expect.poll(() => sonando(pc.page)).toBe(true);
    const enJam = await tituloActual(pc.page);

    const b = await dispositivo(browser, beto, { viewport: { width: 1280, height: 800 } });
    await b.page.goto(`./?jam=${codigo}`);
    await expect.poll(() => tituloActual(b.page), { timeout: 20000 }).toBe(enJam);
    await b.page.evaluate(() => document.getElementById('connectBtn').click());
    await expect(b.page.locator('#jamBox')).toContainText('Ana (anfitrión)', { timeout: 10000 });
    await b.page.evaluate(() => document.getElementById('connectDialog').close());

    // Beto manda una canción a la cola del Jam con «Reproducir a continuación»
    await b.page.evaluate(() => document.querySelector('.tab[data-view="library"]').click());
    const filaB = b.page.locator('#trackList .track').nth(9);
    const pedida = (await filaB.locator('.track-title, .title').first().textContent()).trim();
    await filaB.locator('.track-add').click();
    await b.page.locator('#addPlayNext').click();
    await expect(pc.page.locator('.toast')).toContainText('Beto añadió', { timeout: 10000 });
    // Y está en la cola de Ana, justo después de lo que suena
    await pc.page.evaluate(() => document.getElementById('queueBtn').click());
    await expect(pc.page.locator('#queueList .queue-title').nth(1)).toContainText(pedida.split(' (')[0]);

    await Promise.all([pc.context.close(), movil.context.close(), b.context.close()]);
  });
});
