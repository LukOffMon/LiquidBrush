// v98: passkeys de punta a punta con el autenticador virtual de Chromium (WebAuthn por CDP) y el Worker de
// cuentas de verdad en local (cd cuentas && npx wrangler dev --local --port 8787). Sin ese Worker, se omite.
// Las passkeys necesitan un nombre de dominio (no una IP): la app se abre en http://localhost:4173.
import { test, expect } from '@playwright/test';
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
  const correo = `${nombre.toLowerCase()}-${Date.now()}@ejemplo.test`;
  const clave = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const h = { 'Content-Type': 'application/json', 'X-Admin': ADMIN, 'CF-Connecting-IP': '10.5.0.1' };
  const alta = await (await fetch(`${LOCAL}/alta`, { method: 'POST', headers: h, body: JSON.stringify({ correo, clave, nombre }) })).json();
  const ok = await (await fetch(`${LOCAL}/alta/confirmar`, { method: 'POST', headers: h, body: JSON.stringify({ correo, codigo: alta.codigoPrueba }) })).json();
  return { ...ok.sesion, perfil: ok.perfil, ultimaSync: 0 };
}

test('v98: crear una passkey en «Tu cuenta», cerrar sesión y volver a entrar solo con ella', async ({ browser }, info) => {
  test.skip(info.project.name !== 'escritorio', 'Una sola vez (escritorio)');
  test.skip(!(await workerLocal()), 'Sin Worker de cuentas 1.3.0 en local');
  test.setTimeout(90000);
  const sesion = await crearCuenta('Ana');
  const context = await browser.newContext({ baseURL: 'http://localhost:4173/', serviceWorkers: 'block' });
  await context.addInitScript((s) => {
    if (sessionStorage.getItem('prueba-lista')) return;
    sessionStorage.setItem('prueba-lista', '1');
    localStorage.setItem('liquidbrush:tour', 'true');
    localStorage.setItem('liquidbrush:cuenta-ofrecida', 'true');
    localStorage.setItem('liquidbrush:cuenta', JSON.stringify(s));
    localStorage.setItem('liquidbrush:cuentas-version', JSON.stringify({ v: '1.3.0', t: Date.now() }));
  }, sesion);
  await context.route(/r2\.dev|lrclib\.net|api\.audius\.co|archive\.org|api\.jamendo\.com|hearthis\.at|api\.openverse\.org/, (route) => route.abort());
  // Las llamadas al Worker de producción van al local, con el Origin de la página (las passkeys lo comprueban)
  await context.route(`${PROD}/**`, async (route) => {
    const req = route.request();
    const headers = { ...req.headers(), origin: 'http://localhost:4173' };
    try {
      const res = await fetch(req.url().replace(PROD, LOCAL), { method: req.method(), headers, body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postDataBuffer() });
      await route.fulfill({ status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: { 'content-type': res.headers.get('content-type') || 'application/json', 'access-control-allow-origin': '*' } });
    } catch { await route.abort(); }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }
  });

  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.locator('#cuentaBtn').click();
  await page.locator('[data-cuenta="passkey-crear"]').click();
  await expect(page.locator('.toast')).toContainText('Passkey creada', { timeout: 15000 });
  await expect(page.locator('.cuenta-passkeys li')).toHaveCount(1);
  // La llave quedó en el dispositivo (y es «residente»: sirve para entrar sin escribir el correo)
  const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
  expect(credentials).toHaveLength(1);
  expect(credentials[0].isResidentCredential).toBe(true);

  // Sin sesión: entra solo con la passkey
  await page.evaluate(() => { localStorage.removeItem('liquidbrush:cuenta'); });
  await page.reload();
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.locator('#cuentaBtn').click();
  const irEntrar = page.locator('[data-cuenta="ir"][data-ir="entrar"]').first();
  if (await irEntrar.count()) await irEntrar.click();
  await page.locator('[data-cuenta="passkey-entrar"]').click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:cuenta') || 'null')?.perfil?.correo || ''), { timeout: 15000 }).toBe(sesion.perfil.correo);
  await context.close();
});
