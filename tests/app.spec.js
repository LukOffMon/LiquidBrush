// Recorridos principales de Liquid Bullet en móvil y escritorio.
// No dependen del audio (los MP3 viven en Cloudflare R2): prueban la interfaz y la lógica.
import { test, expect } from '@playwright/test';

const isPhone = (page) => page.viewportSize().width <= 860;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('liquidbrush:tour', 'true'); } catch { /* sin almacenamiento */ }
  });
  // Sin red hacia los buckets ni LRCLIB: el audio no es parte de estas pruebas
  await page.route(/r2\.dev|lrclib\.net/, (route) => route.abort());
});

test('abre sin errores y carga la biblioteca', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await expect(page.locator('.home-tile').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('la búsqueda acepta erratas y varias palabras', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.fill('#searchInput', 'gorilaz feel');
  await expect(page.locator('#listInfo')).toContainText('resultado');
  await expect(page.locator('.track').first()).toContainText('Feel Good');
});

test('Sonando se abre a pantalla completa en el móvil y Atrás la cierra', async ({ page }) => {
  test.skip(!isPhone(page), 'solo en el teléfono');
  await page.goto('./');
  await expect(page.locator('#miniTitle')).not.toHaveText('Sin reproducción');
  await page.locator('.player-track').click();
  await expect(page.locator('body')).toHaveClass(/np-open/);
  await expect(page.locator('.now-playing')).toBeInViewport();
  await page.goBack();
  await expect(page.locator('body')).not.toHaveClass(/np-open/);
});

test('crear una playlist, borrarla y recuperarla de la papelera', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.evaluate(() => document.querySelector('.tab[data-view="library"]').click());
  await page.locator('.track [data-action="add"]').first().click();
  await page.locator('#addNew').click();
  await page.locator('#plDialog input[type="text"], #plDialog input:not([type])').first().fill('Prueba E2E');
  await page.locator('#plDialog [type="submit"], #plDialog .btn-primary').first().click();
  await expect(page.locator('.toast')).toContainText('Prueba E2E');

  await page.evaluate(() => document.querySelector('.tab[data-view="playlists"]').click());
  await page.getByText('Prueba E2E').first().click();
  await page.locator('[data-action="delete-playlist"]').click();
  await expect(page.locator('[data-action="open-trash"]')).toContainText('Papelera (1)');
  await page.locator('[data-action="open-trash"]').click();
  await page.locator('#trashList [data-action="restore"]').click();
  await expect(page.locator('.toast')).toContainText('recuperada');
});

test('el índice A–Z salta a la letra en la Biblioteca', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('liquidbrush:sort', JSON.stringify('title')));
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.evaluate(() => document.querySelector('.tab[data-view="library"]').click());
  await expect(page.locator('#alphaRail')).toBeVisible();
  await page.locator('.alpha-letter[data-letter="M"]').click();
  const first = await page.evaluate(() => {
    const top = (document.querySelector('.topbar')?.offsetHeight || 0) + 4;
    const row = [...document.querySelectorAll('.track')].find((el) => el.getBoundingClientRect().top >= top);
    return row?.querySelector('.track-main')?.textContent.replace(/^\d+/, '').trim() || '';
  });
  expect(first.charAt(0).toUpperCase()).toBe('M');
});

test('los accesos directos ?view= abren la sección', async ({ page }) => {
  await page.goto('./?view=favorites');
  await expect(page.locator('.tab[data-view="favorites"]')).toHaveAttribute('aria-selected', 'true');
});

test('las pestañas se recorren con las flechas', async ({ page }) => {
  test.skip(isPhone(page), 'teclado: solo escritorio');
  await page.goto('./');
  await page.locator('.tab[data-view="home"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tab[data-view="library"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.tab[data-view="library"]')).toBeFocused();
});

test('ocultar una playlist y volver a mostrarla desde Ajustes', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.evaluate(() => document.querySelector('.tab[data-view="playlists"]').click());
  const card = page.locator('#playlistGrid .pl-card[data-key="sys:luna-swing"]');
  await expect(card).toHaveCount(1);
  await card.click();
  await page.locator('[data-action="hide-playlist"]').click();
  await expect(page.locator('.toast')).toContainText('oculta');
  await expect(card).toHaveCount(0);
  await expect(page.locator('.pl-hidden-note')).toContainText('1 playlist oculta');
  // No sale en la búsqueda de playlists
  await page.fill('#searchInput', 'luna swing');
  await expect(page.locator('#searchPlaylists .pl-card[data-key="sys:luna-swing"]')).toHaveCount(0);
  await page.fill('#searchInput', '');
  // Se recupera desde Ajustes → Contenido oculto (y sigue así al recargar)
  await page.reload();
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#hiddenList')).toContainText('Luna Swing');
  await page.locator('#hiddenList [data-action="unhide-playlist"]').click();
  await expect(page.locator('#hiddenEmpty')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('.tab[data-view="playlists"]').click());
  await expect(card).toHaveCount(1);
});

test('el modo ultraligero quita efectos y se recuerda', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.locator('#settingsBtn').click();
  await page.locator('#ultraToggle').check({ force: true });
  const root = page.locator('html');
  await expect(root).toHaveClass(/\bultra\b/);
  await expect(root).not.toHaveClass(/has-wall/);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.player')).backdropFilter)).toBe('none');
  await page.reload();
  await expect(root).toHaveClass(/\bultra\b/);
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#ultraToggle')).toBeChecked();
  await page.locator('#ultraToggle').uncheck({ force: true });
  await expect(root).not.toHaveClass(/\bultra\b/);
});

// WAV silencioso de 30 s para que el reproductor suene de verdad
function silentWav(seconds = 30, rate = 8000) {
  const data = Buffer.alloc(seconds * rate * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('los botones ▶ de la playlist y del reproductor cambian a la vez', async ({ page }) => {
  const wav = silentWav();
  await page.route(/r2\.dev/, (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }));
  await page.goto('./?view=playlists');
  await page.locator('.pl-card').first().click();
  const viewPlay = page.locator('.view-play').first();
  await viewPlay.click();
  await expect(page.locator('body')).toHaveClass(/is-playing/);
  await expect(viewPlay.locator('use')).toHaveAttribute('href', '#i-pause');
  await expect(page.locator('#playBtn use')).toHaveAttribute('href', '#i-pause');
  // Pausar desde el reproductor cambia también el de la playlist
  await page.locator('#playBtn').click();
  await expect(viewPlay.locator('use')).toHaveAttribute('href', '#i-play');
  // Y el de la playlist reanuda (no vuelve a empezar)
  await viewPlay.click();
  await expect(page.locator('#playBtn use')).toHaveAttribute('href', '#i-pause');
  await expect(viewPlay.locator('use')).toHaveAttribute('href', '#i-pause');
});

test('Inicio trae daylist, selección rápida y mixes', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await expect(page.locator('.qp-item')).toHaveCount(16);
  await expect(page.locator('.home-section-title', { hasText: 'Tus mixes del día' })).toBeVisible();
  await expect(page.locator('.home-section-title', { hasText: 'Hecho para ti' })).toBeVisible();
});

test('Lab: una receta crea una mezcla y se pueden quitar canciones', async ({ page }) => {
  await page.goto('./?view=lab');
  await page.locator('[data-lab-action="recipe"][data-value="variety"]').click();
  const rows = page.locator('.lab-result:not(.lab-seeds) .lab-track');
  await expect(rows).toHaveCount(60);
  // «Un artista por canción»: ningún artista repetido
  const artists = await rows.locator('.lab-track-artist').allTextContents();
  const main = artists.map((a) => a.split(' · ')[0].split(',')[0].trim().toLowerCase());
  expect(new Set(main).size).toBe(main.length);
  await rows.first().locator('[data-lab-action="remove"]').click();
  await expect(rows).toHaveCount(59);
});

test('el aleatorio deja al final lo recién escuchado', async ({ page }) => {
  await page.goto('./?view=library');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  // Marca como recién escuchadas las 20 primeras canciones de la Biblioteca
  const recent = await page.locator('.track').evaluateAll((els) => els.slice(0, 20).map((el) => el.dataset.id));
  await page.evaluate((ids) => {
    const now = Date.now();
    localStorage.setItem('liquidbrush:heard', JSON.stringify(Object.fromEntries(ids.map((id) => [id, now]))));
  }, recent);
  await page.goto('./?view=library');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  // Teclas S (aleatorio) y Q (A continuación): en el móvil esos botones viven en Sonando
  await page.locator('body').press('s');
  await expect(page.locator('#shuffleBtn')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.track').nth(25).locator('.track-main').click();
  await page.locator('body').press('q');
  const queued = await page.locator('#queueDialog [data-id]').evaluateAll((els) => els.slice(0, 40).map((el) => el.dataset.id));
  // Lo recién escuchado casi nunca sale entre las próximas 40 de ~3900
  expect(queued.filter((id) => recent.includes(id)).length).toBeLessThanOrEqual(1);
});
