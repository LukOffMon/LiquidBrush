// Modo sin conexión y descargas (v89): la app abre sin red, y una canción descargada suena desde el
// propio teléfono (copia local blob:) aunque la red esté caída o colgada.
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('liquidbrush:tour', 'true');
      localStorage.setItem('liquidbrush:cuenta-ofrecida', 'true');
    } catch { /* sin almacenamiento */ }
  });
  await page.route(/lrclib\.net|api\.audius\.co|archive\.org|api\.jamendo\.com|hearthis\.at|api\.openverse\.org|fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
});

// 1 s de silencio en WAV: Chromium lo reproduce y sirve como «canción descargada»
function silentWav(seconds = 1, rate = 8000) {
  const samples = seconds * rate;
  const buffer = Buffer.alloc(44 + samples);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples, 40);
  buffer.fill(128, 44);
  return buffer.toString('base64');
}

async function waitForServiceWorker(page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 15000 });
}

test('sin conexión la app abre con la biblioteca guardada', async ({ page, context }) => {
  await page.route(/r2\.dev/, (route) => route.abort());
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await waitForServiceWorker(page);
  await context.setOffline(true);
  const started = Date.now();
  await page.reload();
  await expect(page.locator('#libCount')).not.toHaveText('0', { timeout: 10000 });
  await expect(page.locator('#offlinePill')).toBeVisible();
  expect(Date.now() - started).toBeLessThan(10000);
  await context.setOffline(false);
});

test('una canción descargada suena desde el teléfono aunque el servidor no responda', async ({ page }) => {
  // El servidor del audio se queda colgado (poca cobertura): sin la copia local, no sonaría nunca
  await page.route(/r2\.dev/, () => { /* sin respuesta */ });
  await page.goto('./?view=library');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  const deckSrc = () => page.evaluate(() => [...document.querySelectorAll('audio[id^="audio"]')].map((a) => a.getAttribute('src')).find(Boolean) || '');
  // Su dirección: la que pide el reproductor al tocarla
  await page.locator('.track').nth(3).locator('.track-main').click();
  await expect.poll(deckSrc).toMatch(/r2\.dev/);
  const src = await deckSrc();
  await page.evaluate(() => document.querySelectorAll('audio').forEach((a) => a.pause()));
  // Se guarda la «descarga» en la caché de audio, como haría el botón Descargar
  await page.evaluate(async ({ src, wav }) => {
    const bytes = Uint8Array.from(atob(wav), (c) => c.charCodeAt(0));
    const cache = await caches.open('liquidbrush-audio');
    await cache.put(src, new Response(new Blob([bytes], { type: 'audio/wav' }), { headers: { 'Content-Type': 'audio/wav' } }));
  }, { src, wav: silentWav(20) });
  await page.goto('./?view=library');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await expect(page.locator('.track.is-downloaded').first()).toBeVisible();
  await page.locator('.track.is-downloaded').first().locator('.track-main').click();
  // Suena desde la copia del teléfono y el tiempo avanza
  await expect.poll(deckSrc, { timeout: 8000 }).toMatch(/^blob:/);
  await expect.poll(() => page.evaluate(() => Math.max(...[...document.querySelectorAll('audio[id^="audio"]')].map((a) => a.currentTime))), { timeout: 8000 }).toBeGreaterThan(0.3);
});

test('v90: con conexión, una canción descargada no pide nada a la red', async ({ page }) => {
  let r2Requests = 0;
  await page.route(/r2\.dev/, () => { r2Requests++; /* sin respuesta */ });
  await page.goto('./?view=library');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  const deckSrc = () => page.evaluate(() => [...document.querySelectorAll('audio[id^="audio"]')].map((a) => a.getAttribute('src')).find(Boolean) || '');
  await page.locator('.track').nth(5).locator('.track-main').click();
  await expect.poll(deckSrc).toMatch(/r2\.dev/);
  const src = await deckSrc();
  await page.evaluate(() => document.querySelectorAll('audio').forEach((a) => a.pause()));
  await page.evaluate(async ({ src, wav }) => {
    const bytes = Uint8Array.from(atob(wav), (c) => c.charCodeAt(0));
    const cache = await caches.open('liquidbrush-audio');
    await cache.put(src, new Response(new Blob([bytes], { type: 'audio/wav' }), { headers: { 'Content-Type': 'audio/wav' } }));
  }, { src, wav: silentWav(90) });
  await page.goto('./?view=library');
  await expect(page.locator('.track.is-downloaded').first()).toBeVisible();
  r2Requests = 0;
  await page.locator('.track.is-downloaded').first().locator('.track-main').click();
  await expect.poll(() => page.evaluate(() => Math.max(...[...document.querySelectorAll('audio[id^="audio"]')].map((a) => a.currentTime))), { timeout: 8000 }).toBeGreaterThan(0.3);
  expect(await deckSrc()).toMatch(/^blob:/);
  expect(r2Requests).toBe(0);
});
