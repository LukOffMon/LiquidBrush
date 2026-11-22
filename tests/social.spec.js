// v97: playlists colaborativas y Blends, de punta a punta con dos personas y el Worker de cuentas de verdad
// corriendo en local (cd cuentas && npx wrangler dev --local --port 8787). Sin ese Worker, se omiten.
// Las llamadas de la app al Worker de producción se desvían al local; las cuentas se crean en modo de prueba.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const LOCAL = process.env.CUENTAS_URL || 'http://127.0.0.1:8787';
const PROD = 'https://liquid-cuentas.liquidbulletofficial.workers.dev';
let ADMIN = '';
try { ADMIN = /^ADMIN=(.+)$/m.exec(readFileSync('cuentas/.dev.vars', 'utf8'))?.[1].trim() || ''; } catch { /* sin Worker local */ }

async function workerLocal() {
  if (!ADMIN) return false;
  try { return (await fetch(`${LOCAL}/`)).ok; } catch { return false; }
}

async function crearCuenta(nombre) {
  const correo = `${nombre.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@ejemplo.test`;
  const clave = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const h = { 'Content-Type': 'application/json', 'X-Admin': ADMIN, 'CF-Connecting-IP': `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
  const alta = await (await fetch(`${LOCAL}/alta`, { method: 'POST', headers: h, body: JSON.stringify({ correo, clave, nombre }) })).json();
  const ok = await (await fetch(`${LOCAL}/alta/confirmar`, { method: 'POST', headers: h, body: JSON.stringify({ correo, codigo: alta.codigoPrueba }) })).json();
  return { ...ok.sesion, perfil: ok.perfil, ultimaSync: 0 };
}

// Una persona: su propio navegador, con sesión, y el Worker desviado al local
async function persona(browser, sesion, extra = {}) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:4173/', serviceWorkers: 'block' });
  await context.addInitScript(({ sesion, extra }) => {
    if (sessionStorage.getItem('prueba-lista')) return;
    sessionStorage.setItem('prueba-lista', '1');
    localStorage.setItem('liquidbrush:tour', 'true');
    localStorage.setItem('liquidbrush:cuenta-ofrecida', 'true');
    localStorage.setItem('liquidbrush:cuenta', JSON.stringify(sesion));
    Object.entries(extra).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
  }, { sesion, extra });
  await context.route(/r2\.dev|lrclib\.net|api\.audius\.co|archive\.org|api\.jamendo\.com|hearthis\.at|api\.openverse\.org/, (route) => route.abort());
  await context.route(`${PROD}/**`, async (route) => {
    const req = route.request();
    const url = req.url().replace(PROD, LOCAL);
    const headers = { ...req.headers() };
    delete headers.origin;
    try {
      const res = await fetch(url, { method: req.method(), headers, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() });
      const body = Buffer.from(await res.arrayBuffer());
      await route.fulfill({
        status: res.status, body,
        headers: { 'content-type': res.headers.get('content-type') || 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'ETag', ...(res.headers.get('etag') ? { etag: res.headers.get('etag') } : {}) }
      });
    } catch { await route.abort(); }
  });
  const page = await context.newPage();
  return { context, page };
}

const idsDeCatalogo = () => {
  const catalog = JSON.parse(readFileSync('catalog.json', 'utf8'));
  const pl = catalog.playlists.find((p) => (p.trackIds || []).length > 30);
  return pl.trackIds;
};

test.describe('v97: playlists colaborativas y Blends (Worker local)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Solo en Chromium');

  test('Ana hace colaborativa una playlist, Beto se une con el enlace y lo que añade cada uno le llega al otro; luego un Blend', async ({ browser }, info) => {
    test.skip(info.project.name !== 'escritorio', 'Una sola vez (escritorio)');
    test.skip(!(await workerLocal()), 'Sin Worker de cuentas en local');
    test.setTimeout(90000);
    const ids = idsDeCatalogo();
    const anaSesion = await crearCuenta('Ana');
    const betoSesion = await crearCuenta('Beto');
    const playsDe = (lista) => Object.fromEntries(lista.map((id, i) => [id, 20 - (i % 10)]));

    const ana = await persona(browser, anaSesion, {
      'liquidbrush:playlists': [{ id: 'pl-ana', name: 'Viaje', emoji: 'ic:disc', color: '#ff7ad9', trackIds: ids.slice(0, 2), createdAt: Date.now() }],
      'liquidbrush:plays': playsDe(ids.slice(0, 12))
    });
    await ana.page.goto('./?view=playlists');
    await expect(ana.page.locator('#libCount')).not.toHaveText('0');
    await ana.page.evaluate(() => { navigator.share = undefined; navigator.clipboard.writeText = async () => {}; });
    await ana.page.locator('.pl-card', { hasText: 'Viaje' }).click();
    await ana.page.locator('[data-action="colab-invite"]').click();
    await expect.poll(() => ana.page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:playlists'))[0].colab?.id || '')).toMatch(/^[\w-]{16}$/);
    const colabId = await ana.page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:playlists'))[0].colab.id);
    await expect(ana.page.locator('.pl-kind')).toHaveText('Colaborativa');

    // Beto abre el enlace: la playlist aparece con las 2 canciones de Ana
    const beto = await persona(browser, betoSesion, { 'liquidbrush:plays': playsDe(ids.slice(6, 20)) });
    await beto.page.goto(`./?unirse=${colabId}`);
    await expect(beto.page.locator('.pl-hero-name')).toHaveText('Viaje', { timeout: 15000 });
    await expect(beto.page.locator('#trackList .track')).toHaveCount(2);
    await expect(beto.page.locator('.pl-hero-desc')).toContainText('Ana');

    // Beto añade una canción desde el menú ＋ de la Biblioteca
    await beto.page.evaluate(() => document.querySelector('.tab[data-view="library"]').click());
    const fila = beto.page.locator('#trackList .track').nth(8);
    await fila.locator('.track-add').click();
    await beto.page.locator('.add-item', { hasText: 'Viaje' }).click();
    const anadida = await fila.getAttribute('data-id');
    await expect.poll(async () => {
      const r = await fetch(`${LOCAL}/compartidas/${colabId}`, { headers: { Authorization: `Bearer ${anaSesion.pase}` } });
      return (await r.json()).lista?.canciones.map((c) => c.i) || [];
    }, { timeout: 10000 }).toContain(anadida);

    // Ana la recibe al volver a la app
    await ana.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await ana.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => ana.page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:playlists')).find((p) => p.colab)?.trackIds.length), { timeout: 10000 }).toBe(3);

    // Blend: Ana lo crea, Beto se une; los dos tienen la mezcla
    await ana.page.evaluate(() => document.querySelector('.tab[data-view="playlists"]').click());
    await ana.page.locator('[data-action="blend-new"]').click();
    await expect.poll(() => ana.page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:playlists')).find((p) => p.blend)?.blend.id || '')).toMatch(/^[\w-]{16}$/);
    const blendId = await ana.page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:playlists')).find((p) => p.blend).blend.id);
    await beto.page.goto(`./?blend=${blendId}`);
    await expect(beto.page.locator('.pl-hero-name')).toHaveText('Blend · Tú + Ana', { timeout: 15000 });
    const enBlend = await beto.page.locator('#trackList .track').count();
    expect(enBlend).toBeGreaterThan(10);
    // Lo que os gusta a los dos (ids 6–11) va primero
    const primeras = await beto.page.locator('#trackList .track').evaluateAll((els) => els.slice(0, 4).map((e) => e.dataset.id));
    expect(primeras.some((id) => ids.slice(6, 12).includes(id))).toBe(true);

    // Salir y borrar se prueban contra el Worker en cuentas/test/social.e2e.mjs
    await ana.context.close();
    await beto.context.close();
  });
});
