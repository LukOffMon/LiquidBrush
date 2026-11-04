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
