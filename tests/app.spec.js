// Recorridos principales de Liquid Bullet en móvil y escritorio.
// No dependen del audio (los MP3 viven en Cloudflare R2): prueban la interfaz y la lógica.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const isPhone = (page) => page.viewportSize().width <= 860;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('liquidbrush:tour', 'true');
      // La hoja de cuenta sale la primera vez: en los demás tests ya se vio
      if (!sessionStorage.getItem('prueba-cuenta-nueva')) localStorage.setItem('liquidbrush:cuenta-ofrecida', 'true');
    } catch { /* sin almacenamiento */ }
  });
  // Sin red hacia los buckets ni LRCLIB: el audio no es parte de estas pruebas
  await page.route(/r2\.dev|lrclib\.net/, (route) => route.abort());
  // Liquid ATK viene encendido (v76): sin red hacia sus fuentes salvo en los tests que las simulan
  await page.route(/api\.audius\.co|archive\.org|api\.jamendo\.com|hearthis\.at|api\.openverse\.org/, (route) => route.abort());
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
  const card = page.locator('#playlistGrid .pl-card[data-key="sys:swing-de-salon"]');
  await expect(card).toHaveCount(1);
  await card.click();
  await page.locator('[data-action="hide-playlist"]').click();
  await expect(page.locator('.toast')).toContainText('oculta');
  await expect(card).toHaveCount(0);
  await expect(page.locator('.pl-hidden-note')).toContainText('1 playlist oculta');
  // No sale en la búsqueda de playlists
  await page.fill('#searchInput', 'swing de salon');
  await expect(page.locator('#searchPlaylists .pl-card[data-key="sys:swing-de-salon"]')).toHaveCount(0);
  await page.fill('#searchInput', '');
  // Se recupera desde Ajustes → Contenido oculto (y sigue así al recargar)
  await page.reload();
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#hiddenList')).toContainText('Swing de Salón');
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

test.describe('reproducción con audio simulado', () => {
  // El service worker pide el audio por su cuenta y page.route no ve esas peticiones:
  // sin bloquearlo, el test dependía de la red real a R2 (fallaba a veces sin conexión)
  test.use({ serviceWorkers: 'block' });

test('Lab «Un artista por canción» llega a 60 aunque solo hayas escuchado un estilo', async ({ page }) => {
  // Con historial, la receta parte de tus estilos; con uno solo no hay 60 artistas distintos
  const wav = silentWav();
  await page.route(/r2\.dev/, (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }));
  await page.goto('./?view=library');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.locator('.track').nth(5).locator('.track-main').click();
  await expect(page.locator('body')).toHaveClass(/is-playing/);
  await page.waitForTimeout(4000);
  await page.goto('./lab.html');
  await page.locator('[data-lab-action="recipe"][data-value="variety"]').click();
  await expect(page.locator('.lab-result:not(.lab-seeds) .lab-track')).toHaveCount(60);
});

test('los botones de reproducir de la playlist y del reproductor cambian a la vez', async ({ page }) => {
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

test('la cuenta sale primero, se puede rechazar y Ajustes ofrece iniciar sesión', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('prueba-cuenta-nueva', '1');
    if (!sessionStorage.getItem('ya-cargo')) { localStorage.removeItem('liquidbrush:cuenta-ofrecida'); sessionStorage.setItem('ya-cargo', '1'); }
  });
  await page.goto('./');
  await expect(page.locator('#cuentaDialog')).toBeVisible();
  await expect(page.locator('#cuentaBody')).toContainText('Tu música, en todos tus dispositivos');
  await expect(page.locator('.cuenta-conoce-card')).toHaveCount(7);
  await page.locator('[data-cuenta="sin-cuenta"]').click();
  await expect(page.locator('#cuentaDialog')).toBeHidden();
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.reload();
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await expect(page.locator('#cuentaDialog')).toBeHidden();
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#cuentaAjuste')).toContainText('Iniciar sesión');
  await expect(page.locator('#cuentaAjuste')).toContainText('Crear cuenta');
});

test('crear cuenta: valida el correo y mide la contraseña', async ({ page }) => {
  await page.goto('./?cuenta=alta');
  await expect(page.locator('[data-form="alta-correo"]')).toBeVisible();
  await page.fill('input[name="correo"]', 'sin-arroba');
  await page.locator('.cuenta-cta').click();
  await expect(page.locator('.cuenta-error')).toContainText('Revisa el correo');
  await page.fill('input[name="correo"]', 'hola@gmial.com');
  await expect(page.locator('.cuenta-sugerencia')).toContainText('gmail.com');
  await page.locator('[data-cuenta="sugerencia"]').click();
  await expect(page.locator('input[name="correo"]')).toHaveValue('hola@gmail.com');
  await page.locator('.cuenta-cta').click();
  await page.fill('input[name="clave"]', 'corta1');
  await expect(page.locator('.cuenta-medidor-texto')).toContainText('Débil');
  await page.locator('.cuenta-cta').click();
  await expect(page.locator('.cuenta-error')).toContainText('10 caracteres');
});

test('crear cuenta: el avatar ofrece las 8 fotos de perfil y la inicial', async ({ page }) => {
  await page.goto('./?cuenta=alta');
  await page.fill('input[name="correo"]', 'hola@gmail.com');
  await page.locator('.cuenta-cta').click();
  await page.fill('input[name="clave"]', 'Ola-Turquesa-Lenta-2026');
  await page.locator('.cuenta-cta').click();
  const opciones = page.locator('.cuenta-avatares .cuenta-avatar-op');
  await expect(opciones).toHaveCount(9);
  const fotos = page.locator('.cuenta-avatares img');
  await expect(fotos).toHaveCount(8);
  await expect(fotos.first()).toHaveAttribute('src', /avatars\/avatar-01-sm\.jpg$/);
  // Todas cargan de verdad
  await expect.poll(() => fotos.evaluateAll((els) => els.every((el) => el.complete && el.naturalWidth > 0))).toBe(true);
  await opciones.nth(3).click();
  await expect(opciones.nth(3)).toHaveAttribute('aria-checked', 'true');
  await expect(opciones.nth(0)).toHaveAttribute('aria-checked', 'false');
});

test('cuenta: avisa de Spam antes de enviar el código (alta, entrar y recuperar)', async ({ page }) => {
  await page.goto('./?cuenta=alta');
  await expect(page.locator('[data-form="alta-correo"] .cuenta-aviso')).toContainText('Spam');
  await page.locator('[data-cuenta="ir"][data-ir="bienvenida"]').click();
  await page.locator('[data-cuenta="ir"][data-ir="entrar"]').click();
  await expect(page.locator('[data-form="entrar"] .cuenta-aviso')).toContainText('Spam');
  await page.locator('[data-cuenta="ir"][data-ir="recuperar"]').click();
  await expect(page.locator('[data-form="recuperar"] .cuenta-aviso')).toContainText('Spam');
});

test('primera visita: al cerrar la cuenta no se encadena el tutorial', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('prueba-cuenta-nueva', '1');
    if (!sessionStorage.getItem('ya-cargo')) {
      localStorage.removeItem('liquidbrush:cuenta-ofrecida');
      localStorage.removeItem('liquidbrush:tour');
      sessionStorage.setItem('ya-cargo', '1');
    }
  });
  await page.goto('./');
  await expect(page.locator('#cuentaDialog')).toBeVisible();
  await page.locator('[data-cuenta="sin-cuenta"]').click();
  await expect(page.locator('#cuentaDialog')).toBeHidden();
  await page.waitForTimeout(1200);
  await expect(page.locator('#tourDialog')).toBeHidden();
});

test('sin reproducir no se pide la letra a LRCLIB', async ({ page }) => {
  const lyricRequests = [];
  page.on('request', (request) => { if (/lrclib\.net/.test(request.url())) lyricRequests.push(request.url()); });
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.waitForTimeout(4000);
  expect(lyricRequests).toEqual([]);
});

test('la biblioteca va a IndexedDB y la cola de reanudación ocupa poco', async ({ page }) => {
  await page.goto('./?view=library');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.locator('.track').nth(10).locator('.track-main').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('liquidbrush:library-idb'))).toBe('1');
  await expect.poll(() => page.evaluate(() => (localStorage.getItem('liquidbrush:resume-queue') || '').length)).toBeGreaterThan(0);
  const sizes = await page.evaluate(() => ({
    legacy: localStorage.getItem('liquidbrush:library-cache'),
    queue: (localStorage.getItem('liquidbrush:resume-queue') || '').length
  }));
  expect(sizes.legacy).toBeNull();
  expect(sizes.queue).toBeLessThan(120000);
  // Al volver a abrir, la canción y su cola siguen ahí
  const current = await page.locator('#miniTitle').textContent();
  await page.reload();
  await expect(page.locator('#miniTitle')).toHaveText(current || '');
  await page.locator('body').press('q');
  await expect(page.locator('#queueDialog [data-id]').first()).toBeVisible();
});

test('playlists propias: se elige una portada de covers/propias y las de base nunca la usan', async ({ page }) => {
  await page.goto('./?view=playlists');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  // Ninguna playlist de base lleva una portada propia
  const system = await page.evaluate(async () => (await (await fetch('catalog.json')).json()).playlists.map((p) => p.cover?.src || ''));
  expect(system.some((src) => src.includes('covers/propias/'))).toBe(false);
  await expect(page.locator('img.pl-cover[src*="covers/propias/"]')).toHaveCount(0);
  await page.locator('.pl-card-new').click();
  await expect(page.locator('#plPortadas .choice')).toHaveCount(12);
  await page.fill('#plName', 'Mi portada');
  await page.locator('#plPortadas .choice').nth(3).click();
  await page.locator('#plDialog button[type="submit"]').click();
  await expect(page.locator('#plDialog')).toBeHidden();
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('liquidbrush:playlists') || '[]')).map((p) => p.portada))).toContain('03');
  await page.goto('./?view=playlists');
  await expect(page.locator('img.pl-cover[src*="covers/propias/propia-03"]').first()).toBeVisible();
});

test('colaboraciones: la canción es de todos sus artistas y Sonando muestra una ficha por artista', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.fill('#searchInput', 'LADYHOY');
  await page.locator('.track', { hasText: 'LADYHOY' }).first().locator('.track-main').click();
  const cards = page.locator('#npAbout .about-card');
  await expect(cards).toHaveCount(4);
  await expect(page.locator('#npAbout')).toContainText('Acerca de los artistas');
  for (const name of ['La Vendicion', 'La Obsesion', 'Yeyo', 'Doony Graff']) {
    await expect(page.locator('#npAbout .about-name', { hasText: name })).toHaveCount(1);
  }
  // Cada nombre de arriba es su propio enlace
  await expect(page.locator('#npArtist .np-artist-link')).toHaveCount(4);
  // Seguir a uno no sigue a los demás
  await cards.nth(1).locator('.follow-btn').dispatchEvent('click');
  await expect(cards.nth(1).locator('.follow-btn')).toHaveText('Siguiendo');
  await expect(cards.nth(2).locator('.follow-btn')).toHaveText('Seguir');
  // La canción aparece en la página de cada artista (no solo del primero)
  await page.locator('#npAbout .about-open').nth(2).dispatchEvent('click');
  await expect(page.locator('.track', { hasText: 'LADYHOY' }).first()).toBeAttached();
});

test('artistas con «&», «y» o «x» en el nombre no se cortan', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.fill('#searchInput', 'Polo Pan');
  await page.locator('.track', { hasText: 'Polo & Pan' }).first().locator('.track-main').click();
  await expect(page.locator('#npAbout .about-name')).toHaveText('Polo & Pan');
});

test.describe('detección de dispositivo, sistema y navegador', () => {
  test('iPhone con Safari: iOS, WebKit y pasos de instalar para Safari', async ({ browser }) => {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem('liquidbrush:tour', 'true'); localStorage.setItem('liquidbrush:cuenta-ofrecida', 'true'); });
    await page.route(/r2\.dev|lrclib\.net/, (route) => route.abort());
    await page.goto('./');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-os', 'ios');
    await expect(html).toHaveAttribute('data-browser', 'safari');
    await expect(html).toHaveAttribute('data-device', 'phone');
    await expect(html).toHaveClass(/is-ios/);
    expect(await page.evaluate(() => window.lbDevice.osVersion)).toBeCloseTo(18.01);
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#deviceInfo')).toContainText('iPhone (iOS 18) · Safari');
    await expect(page.locator('#installSteps')).toContainText('abajo en el centro');
    await ctx.close();
  });

  test('Android dentro de Instagram: avisa y ofrece abrir en el navegador', async ({ browser }) => {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Instagram 350.0.0.0.0 Android',
      viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem('liquidbrush:tour', 'true'); localStorage.setItem('liquidbrush:cuenta-ofrecida', 'true'); });
    await page.route(/r2\.dev|lrclib\.net/, (route) => route.abort());
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-os', 'android');
    await expect(page.locator('html')).toHaveClass(/is-inapp/);
    const bar = page.locator('.inapp-bar');
    await expect(bar).toContainText('Instagram');
    await expect(bar.locator('a')).toHaveAttribute('href', /^intent:\/\//);
    await bar.locator('.inapp-close').click();
    await expect(bar).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.inapp-bar')).toHaveCount(0);
    await ctx.close();
  });

  test('sin desplazamiento lateral a 320 y 360 px (Inicio, Lab y Stats)', async ({ browser }) => {
    for (const width of [320, 360]) {
      const ctx = await browser.newContext({ viewport: { width, height: 700 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await page.addInitScript(() => { localStorage.setItem('liquidbrush:tour', 'true'); localStorage.setItem('liquidbrush:cuenta-ofrecida', 'true'); });
      await page.route(/r2\.dev|lrclib\.net/, (route) => route.abort());
      await page.goto('./');
      await expect(page.locator('#libCount')).not.toHaveText('0');
      for (const view of ['home', 'lab', 'stats']) {
        const enLab = page.url().includes('lab.html');
        await page.evaluate((v) => document.querySelector(`.nav-btn[data-nav="${v}"], .tab[data-view="${v}"]`)?.click(), view);
        // Lab es otra página (lab.html): al entrar y al salir se espera a que termine de cargar antes de medir
        if (view === 'lab') await page.waitForURL(/lab\.html/);
        else if (enLab) await page.waitForURL((url) => !url.pathname.endsWith('lab.html'));
        await page.waitForLoadState('load');
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${view} a ${width} px`).toBeLessThanOrEqual(0);
      }
      await ctx.close();
    }
  });
});

test.describe('Liquid Lab: sitio aparte', () => {
  test('tocar Lab en Liquid lleva a lab.html, sin reproductor', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.evaluate(() => document.querySelector('.nav-btn[data-nav="lab"], .tab[data-view="lab"]').click());
    await expect(page).toHaveURL(/lab\.html$/);
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'lab');
    await expect(page.locator('.lab-hero')).toBeVisible();
    await expect(page.locator('[data-lab-action="recipe"]').first()).toBeVisible();
    await expect(page.locator('.player')).toBeHidden();
    await expect(page.locator('.bottom-nav')).toBeHidden();
    await expect(page.locator('#cuentaDialog')).toBeHidden();
    // El acceso directo de la app instalada también
    await page.goto('./?view=lab');
    await expect(page).toHaveURL(/lab\.html$/);
  });

  test('«Guardar en Liquid» crea la playlist y vuelve a Liquid con ella abierta', async ({ page }) => {
    await page.goto('./lab.html');
    await page.locator('[data-lab-action="recipe"][data-value="variety"]').click();
    await expect(page.locator('.lab-result:not(.lab-seeds) .lab-track')).toHaveCount(60);
    await page.locator('[data-lab-action="save"]').click();
    await expect(page).not.toHaveURL(/lab\.html/);
    await expect(page.locator('html')).not.toHaveAttribute('data-mode', 'lab');
    await expect(page.locator('#viewHead')).toContainText('Lab');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:playlists') || '[]'));
    expect(saved).toHaveLength(1);
    expect(saved[0].trackIds).toHaveLength(60);
    expect(await page.evaluate(() => localStorage.getItem('liquidbrush:lab-handoff'))).toBeNull();
  });

  test('«Escuchar en Liquid» vuelve a Liquid con la mezcla en la cola, y Lab no pisa «Continúa donde lo dejaste»', async ({ page }) => {
    await page.goto('./?view=library');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.locator('.track').nth(5).locator('.track-main').click();
    // La cola se escribe cuando el navegador está libre (hasta ~2 s después): se espera a la de la Biblioteca,
    // no a la que se guardó al abrir desde Inicio
    const readQueue = () => page.evaluate(() => localStorage.getItem('liquidbrush:resume-queue') || '');
    await expect.poll(async () => JSON.parse((await readQueue()) || '{}').source, { timeout: 15000 }).toBe('view:library');
    const before = await readQueue();
    await page.goto('./lab.html');
    await page.locator('[data-lab-action="recipe"][data-value="variety"]').click();
    await expect(page.locator('.lab-result:not(.lab-seeds) .lab-track')).toHaveCount(60);
    // Lab abierto y cerrado sin tocar nada de la cola de Liquid
    expect(await page.evaluate(() => localStorage.getItem('liquidbrush:resume-queue'))).toBe(before);
    await page.locator('[data-lab-action="play"]').click();
    await expect(page).not.toHaveURL(/lab\.html/);
    await expect(page.locator('#npContext')).toContainText('Lab');
    // La cola entera es la mezcla de Lab (60). Sin audio en los tests, las que no cargan se saltan
    // solas, así que en el diálogo se ven las que quedan por delante y no siempre las 60.
    await expect.poll(() => page.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('liquidbrush:resume-queue') || '{}');
      return stored.context?.startsWith('Lab') ? (stored.q || '').split(',').length : 0;
    }), { timeout: 10000 }).toBe(60);
    await page.locator('body').press('q');
    await expect(page.locator('#queueInfo')).toContainText('Lab');
    await expect(page.locator('#queueDialog [data-id]').first()).toBeVisible();
  });
});

test.describe('reproducción en segundo plano y audio atascado', () => {
  test.use({ serviceWorkers: 'block' });

  test('iPhone: al pasar de canción solo (con DJ) sigue en el mismo reproductor', async ({ browser }) => {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block'
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('liquidbrush:tour', 'true');
      localStorage.setItem('liquidbrush:cuenta-ofrecida', 'true');
      localStorage.setItem('liquidbrush:dj', 'true');
      // Como en el iPhone al pasar de canción solo: sin un toque reciente (page.evaluate de Playwright cuenta como toque)
      Object.defineProperty(navigator, 'userActivation', { get: () => ({ isActive: false, hasBeenActive: true }) });
    });
    const wav = silentWav(50);
    // Como R2: responde por rangos (si no, el navegador no puede adelantar)
    await page.route(/r2\.dev/, (route) => {
      const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
      if (!range) return route.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes' }, body: wav });
      const start = Number(range[1]);
      const end = range[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
      return route.fulfill({ status: 206, contentType: 'audio/wav', body: wav.subarray(start, end + 1),
        headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${wav.length}` } });
    });
    await page.route(/lrclib\.net/, (route) => route.abort());
    await page.goto('./?view=library');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.locator('.track').nth(2).locator('.track-main').click();
    await expect(page.locator('body')).toHaveClass(/is-playing/);
    const firstTitle = await page.locator('#miniTitle').textContent();
    const deckBefore = await page.evaluate(() => [...document.querySelectorAll('audio[id^="audio"]')].find((a) => !a.paused)?.id);
    // Casi al final: la transición DJ pasa a la siguiente sin ningún toque
    await page.waitForTimeout(5500);
    await page.evaluate((id) => { const a = document.getElementById(id); a.currentTime = a.duration - 2; }, deckBefore);
    await expect(page.locator('#miniTitle')).not.toHaveText(firstTitle || '', { timeout: 8000 });
    const playing = await page.evaluate(() => [...document.querySelectorAll('audio[id^="audio"]')].filter((a) => a.getAttribute('src')).map((a) => a.id));
    expect(playing).toEqual([deckBefore]);
    await ctx.close();
  });

  test('si el audio no avanza, se recupera solo y al final pasa a la siguiente', async ({ page }) => {
    test.setTimeout(60000);
    // El servidor del audio nunca responde: la canción «suena» pero se queda en 0:00
    await page.route(/r2\.dev/, () => { /* sin respuesta */ });
    await page.goto('./?view=library');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.locator('.track').nth(4).locator('.track-main').click();
    const firstTitle = await page.locator('#miniTitle').textContent();
    await expect(page.locator('#miniTitle')).not.toHaveText(firstTitle || '', { timeout: 30000 });
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:errors') || '[]').map((e) => e.m));
    expect(log.some((m) => m.includes('Audio atascado'))).toBe(true);
  });
});

test.describe('pantalla de bloqueo', () => {
  test.use({ serviceWorkers: 'block' });

  test('anterior/siguiente (no ±10 s) y se vuelven a registrar al sonar cada canción', async ({ page }) => {
    await page.addInitScript(() => {
      window.__handlers = [];
      const original = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      navigator.mediaSession.setActionHandler = (action, handler) => {
        window.__handlers.push([action, typeof handler]);
        return original(action, handler);
      };
    });
    const wav = silentWav();
    await page.route(/r2\.dev/, (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }));
    await page.goto('./?view=library');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    const atStart = await page.evaluate(() => window.__handlers.length);
    await page.locator('.track').nth(3).locator('.track-main').click();
    await expect(page.locator('body')).toHaveClass(/is-playing/);
    await expect.poll(() => page.evaluate(() => window.__handlers.length)).toBeGreaterThan(atStart);
    const last = await page.evaluate(() => Object.fromEntries(window.__handlers));
    expect(last.nexttrack).toBe('function');
    expect(last.previoustrack).toBe('function');
    expect(last.seekforward).toBe('object');
    expect(last.seekbackward).toBe('object');
  });

  test('v81: al cambiar de canción, la portada es la suya, sigue «sonando» y un doble toque no salta dos', async ({ page }) => {
    await page.addInitScript(() => {
      window.__handlers = {};
      const original = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
      navigator.mediaSession.setActionHandler = (action, handler) => {
        window.__handlers[action] = handler;
        return original(action, handler);
      };
    });
    const wav = silentWav();
    await page.route(/r2\.dev/, (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }));
    await page.goto('./?view=library');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.locator('.track').nth(3).locator('.track-main').click();
    await expect(page.locator('body')).toHaveClass(/is-playing/);
    const first = await page.locator('#miniTitle').textContent();
    // Dos toques seguidos en «siguiente» de la pantalla de bloqueo: solo avanza una canción
    await page.evaluate(() => { window.__handlers.nexttrack(); window.__handlers.nexttrack(); });
    await expect(page.locator('#miniTitle')).not.toHaveText(first || '');
    await expect(page.locator('body')).toHaveClass(/is-playing/);
    const info = await page.evaluate(() => ({
      title: navigator.mediaSession.metadata?.title,
      art: navigator.mediaSession.metadata?.artwork?.map((a) => a.src) || [],
      state: navigator.mediaSession.playbackState,
      mini: document.querySelector('#miniTitle').textContent,
      fourth: document.querySelectorAll('.track')[4]?.dataset.id,
      current: document.querySelector('.track.is-current')?.dataset.id
    }));
    // Una sola canción adelante (la 5.ª de la lista), con sus datos y su propia portada
    expect(info.current).toBe(info.fourth);
    expect(info.mini).toContain(info.title.split(' (')[0].slice(0, 8));
    expect(info.art.length).toBe(1);
    const cover = await page.evaluate((id) => document.querySelector(`.track[data-id="${CSS.escape(id)}"] .track-cover`)?.getAttribute('src') || '', info.current);
    const base = (src) => src.split('/').pop().replace(/-sm(?=\.)/, '');
    expect(base(info.art[0])).toBe(base(cover));
    expect(info.state).toBe('playing');
  });
});

test('cuenta: el tema elegido en este dispositivo no lo pisa el que estaba guardado en la cuenta', async ({ page }) => {
  const { gzipSync, gunzipSync } = await import('node:zlib');
  const hace = Math.floor(Date.now() / 60000) - 26297280 - 60;
  const remoto = { v: 1, t: hace, aj: { tema: [hace, 'claro'] } };
  const subidas = [];
  await page.addInitScript(() => {
    if (sessionStorage.getItem('ya-cargo')) return;
    sessionStorage.setItem('ya-cargo', '1');
    localStorage.setItem('liquidbrush:cuenta', JSON.stringify({ pase: 'x', renovacion: 'y', caducaPase: Date.now() / 1000 + 3600, correo: 'a@b.c', nombre: 'A' }));
    // La última sincronización dejó el tema «Claro»; luego, sin conexión, se eligió «Oscuro»
    localStorage.setItem('liquidbrush:sync-meta', JSON.stringify({ tema: 'claro', etag: { datos: '"1"' } }));
    localStorage.setItem('liquidbrush:theme', JSON.stringify('oscuro'));
  });
  await page.route(/liquid-cuentas/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/datos' && req.method() === 'GET') {
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/gzip', ETag: '"1"' }, body: gzipSync(JSON.stringify(remoto)) });
    }
    if (req.method() === 'PUT') {
      if (url.pathname === '/datos') subidas.push(JSON.parse(gunzipSync(req.postDataBuffer()).toString()));
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json', ETag: '"2"' }, body: '{"ok":true}' });
    }
    return route.fulfill({ status: 404, headers: { 'Content-Type': 'application/json' }, body: '{"ok":false,"error":"no_existe"}' });
  });
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await expect.poll(() => subidas.length, { timeout: 10000 }).toBeGreaterThan(0);
  expect(subidas.at(-1).aj.tema[1]).toBe('oscuro');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:theme')))).toBe('oscuro');
  await page.reload();
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.waitForTimeout(3500);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:theme')))).toBe('oscuro');
});

test('Género: se elige cuál (Rock, Indie…) y cada canción dice sus géneros', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  await page.evaluate(() => document.querySelector('[data-view="library"]')?.click());
  await page.selectOption('#sortSelect', 'genre');
  await expect(page.locator('#genreChips')).toBeVisible();
  await expect(page.locator('#genreChips .chip', { hasText: 'Indie' }).first()).toBeVisible();
  await page.locator('#genreChips .chip', { hasText: /^Rock/ }).click();
  await expect(page.locator('.chip-genre')).toContainText('Género: Rock');
  await expect(page.locator('#listInfo')).toContainText('canciones');
  // Todas las canciones que quedan son de Rock (aunque sean también de otro género)
  const artistas = await page.locator('.track-artist').evaluateAll((els) => els.slice(0, 20).map((el) => el.textContent));
  expect(artistas.length).toBeGreaterThan(0);
  for (const texto of artistas) expect(texto).toMatch(/Rock/);
  expect(artistas.some((texto) => texto.includes(' / '))).toBe(true);
  // Volver a tocarlo quita el filtro
  await page.locator('#genreChips .chip', { hasText: /^Rock/ }).click();
  await expect(page.locator('.chip-genre')).toHaveText('Género');
});

test('Biblioteca de imágenes: toda la música en un TXT, con resumen y buscador', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./imagenes.html');
  await expect(page.locator('#musicStats div')).toHaveCount(6);
  await expect(page.locator('#music a[download]')).toHaveAttribute('href', 'musica-liquid.txt');
  await page.fill('#musicSearch', 'linkin park faint');
  await expect(page.locator('#musicResults')).toBeVisible();
  await expect(page.locator('#musicResults')).toContainText('Géneros (3): Alternativo (principal), Metal, Rock');
  await expect(page.locator('#musicResults')).toContainText('Playlist: Metal Pesado');
  const txt = await (await page.request.get('./musica-liquid.txt')).text();
  expect(txt).toContain('LIQUID BULLET · TODA LA MÚSICA');
  expect(txt).toContain('RESUMEN POR GÉNERO');
  expect(errors).toEqual([]);
});

test('detalles: atajos (?), tiempo restante, F/C, resaltado al buscar, cola y canción del día', async ({ page }) => {
  test.skip(isPhone(page), 'con teclado y ratón');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  // Canción del día en Inicio
  await expect(page.locator('.sotd')).toHaveCount(1);
  // ? abre la ayuda de atajos
  await page.keyboard.press('Shift+Slash');
  await expect(page.locator('#shortcutsDialog')).toBeVisible();
  await page.keyboard.press('Escape');
  // Poner una canción, Me gusta con F y el tiempo restante al tocar el total
  await page.evaluate(() => document.querySelector('.tab[data-view="library"]').click());
  await page.locator('.track-main').nth(2).click();
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:favorites') || '[]').length)).toBe(1);
  await page.locator('#totalTime').click();
  await expect(page.locator('#totalTime')).toHaveText(/^−\d/);
  // C: la lista va a la que suena
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press('c');
  await expect(page.locator('.track.is-current')).toBeInViewport();
  // Buscar resalta las palabras
  await page.fill('#searchInput', 'radiohead creep');
  await expect(page.locator('#trackList mark.hl').first()).toBeVisible();
  await page.locator('#searchInput').press('ArrowDown');
  await expect(page.locator('#trackList .track-main').first()).toBeFocused();
  await page.fill('#searchInput', '');
  // Cola: mezclar y vaciar (con deshacer)
  await page.locator('#queueBtn').click();
  await page.locator('[data-action="queue-clear"]').click();
  await expect(page.locator('#queueInfo')).toContainText('No hay nada más');
  await page.locator('.toast-action').click();
  await expect(page.locator('#queueInfo')).toContainText('por delante');
  expect(errors).toEqual([]);
});

// Un año de escucha inventado (2026) para Tu Año Líquido
async function anoDeEscucha(page) {
  const cat = await (await page.request.get('./catalog.json')).json();
  const ids = cat.playlists.flatMap((p) => p.trackIds).filter((_, i) => i % 37 === 0).slice(0, 120);
  const log = {};
  let n = 0;
  for (let d = new Date(2026, 0, 3); d <= new Date(2026, 10, 9); d.setDate(d.getDate() + 1)) {
    n++;
    if (n % 4 === 0) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const s = {}; const p = {}; const h = new Array(24).fill(0);
    for (let k = 0; k < 6; k++) {
      const id = ids[(n * 7 + k * k) % (k === 0 ? 3 : ids.length)];
      s[id] = (s[id] || 0) + 180; p[id] = (p[id] || 0) + 1; h[(n + k) % 24] += 180;
    }
    log[key] = { s, p, h };
  }
  await page.addInitScript((data) => { if (!sessionStorage.getItem('log-puesto')) { localStorage.setItem('liquidbrush:listen', JSON.stringify(data)); sessionStorage.setItem('log-puesto', '1'); } }, log);
}

test.describe('Tu Año Líquido', () => {
  test('el 25 de diciembre: aviso, tarjeta en Inicio y las 16 escenas', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-12-25T11:00:00'));
    await anoDeEscucha(page);
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await expect(page.locator('.rz-invite.is-live')).toContainText('Tu Año Líquido 2026');
    await expect(page.locator('.toast')).toContainText('Tu Año Líquido 2026 ya está aquí', { timeout: 6000 });
    await page.locator('.rz-invite-btn').click();
    await expect(page.locator('.resumen[open]')).toBeVisible();
    await expect(page.locator('.rz-seg')).toHaveCount(16);
    await expect(page.locator('.rz-mega')).toContainText('Tu Año Líquido');
    await page.locator('[data-rz="start"]').click({ force: true });
    await expect(page.locator('.rz-kicker').first()).toContainText('Este año escuchaste');
    // Mantener pulsado pausa; soltar sigue
    const next = page.locator('.rz-next');
    await next.hover();
    await page.mouse.down();
    await expect(page.locator('.resumen')).toHaveClass(/is-paused/);
    await page.mouse.up();
    await expect(page.locator('.resumen')).not.toHaveClass(/is-paused/);
    // Avanzar hasta el final tocando a la derecha (las flechas también valen)
    for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowRight');
    await expect(page.locator('.rz-title')).toContainText('Llévatelo contigo');
    // canvas.toBlob codifica el PNG en ratos libres: con la escena animada de escritorio puede tardar más de 5 s
    await expect(page.locator('.rz-card')).toHaveAttribute('src', /^blob:/, { timeout: 15000 });
    await page.locator('[data-rz="playlist"]').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:playlists') || '[]').some((p) => p.name === 'Tu 2026 en Liquid'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.resumen')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('en diciembre, Stats cuenta los días; después se puede volver a ver', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-12-10T11:00:00'));
    await anoDeEscucha(page);
    await page.goto('./?view=stats');
    await expect(page.locator('.rz-invite')).toContainText('faltan 15 días');
    await expect(page.locator('.rz-invite-btn')).toHaveCount(0);
    await page.clock.setFixedTime(new Date('2027-02-03T11:00:00'));
    // Liquid quita ?view= de la dirección al abrir: se vuelve a pedir Stats
    await page.goto('./?view=stats');
    await expect(page.locator('.rz-invite')).toContainText('Tu Año Líquido 2026');
    await page.locator('.rz-invite-btn').click();
    await expect(page.locator('.resumen[open]')).toBeVisible();
  });
});

test('pulido: lo oculto no ocupa sitio, los botones del reproductor son redondos y los vacíos llevan icono', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#libCount')).not.toHaveText('0');
  // Los filtros ocultos de Inicio no dejan hueco entre el saludo y las tarjetas
  await expect(page.locator('#filterChips')).toBeHidden();
  const hueco = await page.evaluate(() => {
    const head = document.querySelector('#viewHead').getBoundingClientRect();
    const panel = document.querySelector('#homePanel').getBoundingClientRect();
    return panel.top - head.bottom;
  });
  expect(hueco).toBeLessThan(32);
  // Ningún elemento con hidden se queda con tamaño
  const visibles = await page.evaluate(() => [...document.querySelectorAll('[hidden]')]
    .filter((el) => el.getBoundingClientRect().height > 0).map((el) => el.id || el.className));
  expect(visibles).toEqual([]);
  if (!isPhone(page)) {
    const anchos = await page.evaluate(() => [...document.querySelectorAll('.player-volume .icon-btn')]
      .filter((el) => el.offsetParent).map((el) => Math.round(el.getBoundingClientRect().width)));
    expect(anchos.length).toBeGreaterThan(2);
    expect(Math.min(...anchos)).toBeGreaterThanOrEqual(40);
  }
  await page.evaluate(() => document.querySelector('.tab[data-view="favorites"]').click());
  await expect(page.locator('.list-empty .list-empty-icon')).toBeVisible();
  await expect(page.locator('.list-empty')).toContainText('Aún no tienes favoritas');
});

test.describe('v66: 15 ideas', () => {
  // Una semana de escucha y 40 canciones ya oídas de la primera playlist
  async function conHistorial(page) {
    const cat = await (await page.request.get('./catalog.json')).json();
    const pl = cat.playlists[0];
    const ids = pl.trackIds.slice(0, 40);
    await page.addInitScript((list) => {
      if (sessionStorage.getItem('historial-puesto')) return;
      sessionStorage.setItem('historial-puesto', '1');
      const log = {}; const plays = {};
      for (let d = 1; d <= 6; d++) {
        const dt = new Date(); dt.setDate(dt.getDate() - d);
        const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const s = {}; const p = {};
        list.slice(0, 12).forEach((id) => { s[id] = 200; p[id] = 1; plays[id] = (plays[id] || 0) + 3; });
        log[key] = { s, p, h: new Array(24).fill(100) };
      }
      list.forEach((id) => { plays[id] = plays[id] || 1; });
      localStorage.setItem('liquidbrush:listen', JSON.stringify(log));
      localStorage.setItem('liquidbrush:plays', JSON.stringify(plays));
    }, ids);
    return pl;
  }

  test('Inicio: racha con historial; sin historial se eligen gustos', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    // Persona nueva: tarjeta para elegir 3 artistas, que desaparece al terminar
    await expect(page.locator('.home-taste')).toBeVisible();
    await expect(page.locator('.home-streak')).toHaveCount(0);
    for (let i = 0; i < 3; i++) await page.locator('.taste-chip:not(.is-active)').first().click();
    await expect(page.locator('.home-taste')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:follows')).length)).toBe(3);
  });

  test('racha en Inicio, progreso de la playlist, «Lo que te falta» e hitos', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const pl = await conHistorial(page);
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await expect(page.locator('.home-streak')).toContainText('6 días seguidos');
    await expect(page.locator('.home-taste')).toHaveCount(0);
    await page.evaluate(() => document.querySelector('.tab[data-view="playlists"]').click());
    await page.locator('.pl-card, .playlist-card').first().click();
    await expect(page.locator('.pl-progress-text')).toContainText(`Has escuchado 40 de ${pl.trackIds.length}`);
    await expect(page.locator('.pl-unheard')).toContainText(`Lo que te falta · ${pl.trackIds.length - 40}`);
    await page.locator('.pl-unheard').click();
    await expect(page.locator('#npContext')).toContainText('lo que te falta');
    // La canción que empieza es una de las que faltaban
    const current = await page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:resume')).id);
    expect(pl.trackIds.slice(40)).toContain(current);
    await page.evaluate(() => document.querySelector('.tab[data-view="stats"]').click());
    // v78: 108 hitos (los de siempre conservan su nombre); todos están en «Ver los 108 hitos»
    await expect(page.locator('.hitos-card .stat-sub').first()).toContainText('de 108 conseguidos');
    await expect(page.locator('.hitos-groups .hito')).toHaveCount(108);
    await page.locator('.hitos-all-summary').click();
    await expect(page.locator('.hitos-groups .hito', { hasText: 'Primera gota' })).toHaveClass(/is-done/);
    expect(errors).toEqual([]);
  });

  test('Sonando: Luego, historia y nota, bucle, sesión privada, letra grande y modo coche', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await conHistorial(page);
    await page.goto('./?view=library');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.locator('.track .track-main').nth(1).click();
    if (isPhone(page)) {
      await page.locator('.player-track').click();
      await expect(page.locator('body')).toHaveClass(/np-open/);
    }
    // «Luego» enseña la siguiente de la cola y la pestaña lleva la carátula
    await expect(page.locator('.np-next')).toBeVisible();
    await expect(page.locator('.np-next-name')).not.toBeEmpty();
    expect(await page.evaluate(() => document.querySelector('link[rel="icon"]').getAttribute('href'))).toMatch(/covers\//);
    // Historia y nota
    await expect(page.locator('.np-story')).toContainText('Tu historia con esta canción');
    await page.locator('.story-note').click();
    await page.locator('.note-area').fill('La del viaje a la playa');
    await page.locator('.note-sheet .btn-primary').click();
    await expect(page.locator('.story-note.has-note')).toContainText('La del viaje a la playa');
    expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('liquidbrush:notes'))))).toEqual(['La del viaje a la playa']);
    // Bucle: el primer toque marca el principio
    await page.locator('.plus-loop').click();
    await expect(page.locator('.plus-loop')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.plus-loop')).toContainText('Desde');
    // Sesión privada: lo que suena no se apunta
    await page.locator('.plus-private').click();
    await expect(page.locator('body')).toHaveClass(/is-private/);
    const antes = await page.evaluate(() => localStorage.getItem('liquidbrush:plays'));
    await page.evaluate(() => document.querySelector('#nextBtn').click());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => localStorage.getItem('liquidbrush:plays'))).toBe(antes);
    // Cambiar de canción quita el bucle
    await expect(page.locator('.plus-loop')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('.plus-private').click();
    await expect(page.locator('body')).not.toHaveClass(/is-private/);
    // Letra grande y modo coche se abren y se cierran
    await page.locator('.plus-karaoke').click();
    await expect(page.locator('dialog.karaoke[open]')).toBeVisible();
    await expect(page.locator('.karaoke-line').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.karaoke')).toBeHidden();
    await page.locator('.plus-car').click();
    await expect(page.locator('dialog.car[open] .car-play')).toBeVisible();
    await expect(page.locator('.car-title')).not.toHaveText('Nada sonando');
    const titulo = await page.locator('.car-title').textContent();
    await page.locator('.car-next').click();
    await expect(page.locator('.car-title')).not.toHaveText(titulo || '');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.car')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('deslizar una canción a la derecha la manda a la cola', async ({ page }) => {
    test.skip(!isPhone(page), 'gesto táctil');
    await page.goto('./?view=library');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await expect(page.locator('#miniTitle')).not.toHaveText('Sin reproducción');
    const row = page.locator('.track').nth(4);
    const box = await row.boundingBox();
    const y = box.y + box.height / 2;
    const fire = (type, x) => row.evaluate((el, o) => el.dispatchEvent(new PointerEvent(o.type, { bubbles: true, pointerType: 'touch', clientX: o.x, clientY: o.y, pointerId: 5 })), { type, x, y });
    await fire('pointerdown', box.x + 40);
    for (const dx of [12, 40, 80, 120]) await fire('pointermove', box.x + 40 + dx);
    await expect(row).toHaveClass(/will-queue/);
    await fire('pointerup', box.x + 160);
    await expect(page.locator('.toast')).toContainText('Sonará a continuación');
    await expect(row).not.toHaveClass(/is-swiping/);
  });

  test('escritorio: el buscador y las pestañas se quedan arriba al bajar', async ({ page }) => {
    test.skip(isPhone(page), 'solo escritorio');
    await page.goto('./?view=library');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect(page.locator('.library-head')).toHaveClass(/is-stuck/);
    await expect(page.locator('.tab[data-view="playlists"]')).toBeInViewport();
    await page.locator('.tab[data-view="playlists"]').click();
    await expect(page.locator('.tab[data-view="playlists"]')).toHaveClass(/is-active/);
  });
});

test.describe('v67: Buscar', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('busquedas-puestas')) {
        localStorage.setItem('liquidbrush:searches', JSON.stringify(['tame impala', 'gorillaz']));
        sessionStorage.setItem('busquedas-puestas', '1');
      }
    });
  });

  test('teléfono: Buscar a pantalla completa, mejor resultado, filtros por tipo y Cancelar', async ({ page }) => {
    test.skip(!isPhone(page), 'solo en el teléfono');
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.locator('.nav-btn[data-nav="search"]').click();
    // Pantalla de inicio de Buscar: sin barra de arriba ni pestañas, con recientes y artistas
    await expect(page.locator('body')).toHaveClass(/search-landing/);
    await expect(page.locator('.topbar')).toBeHidden();
    await expect(page.locator('.tabs')).toBeHidden();
    await expect(page.locator('#searchCancel')).toBeVisible();
    await expect(page.locator('.search-recent-q')).toHaveCount(2);
    await expect(page.locator('.search-mini-artist').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Quitar una búsqueda reciente
    await page.locator('[data-remove-search="gorillaz"]').click();
    await expect(page.locator('.search-recent-q')).toHaveCount(1);
    // Resultados: el artista que empieza así es el mejor resultado, y hay filtros por tipo
    await page.fill('#searchInput', 'radio');
    await expect(page.locator('.search-top')).toContainText('Radiohead');
    await expect(page.locator('.search-top')).toContainText('Artista');
    await expect(page.locator('#viewHead')).toBeHidden();
    await page.locator('.search-scopes [data-value="artists"]').click();
    await expect(page.locator('.search-artist-row').first()).toBeVisible();
    await expect(page.locator('#trackList .track')).toHaveCount(0);
    await expect(page.locator('#listInfo')).toContainText('artistas para «radio»');
    await page.locator('.search-scopes [data-value="songs"]').click();
    await expect(page.locator('#trackList .track').first()).toBeVisible();
    await expect(page.locator('.search-top')).toHaveCount(0);
    // El filtro elegido se mantiene al cambiar lo escrito; «Todo» vuelve a enseñarlo todo
    await page.fill('#searchInput', 'creep');
    // Solo hay canciones: sin filtros a la vista, se ve todo (con su mejor resultado)
    await expect(page.locator('.search-scopes')).toBeHidden();
    await expect(page.locator('.search-top')).toBeVisible();
    await page.fill('#searchInput', 'radio');
    await expect(page.locator('.search-scopes [data-value="songs"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.search-scopes [data-value="all"]').click();
    // Una canción con ese nombre exacto gana al artista
    await page.fill('#searchInput', 'creep');
    await expect(page.locator('.search-top')).toContainText('Canción');
    await expect(page.locator('.search-top-title')).toHaveText('Creep');
    await page.locator('.search-top-play').click();
    await expect(page.locator('#miniTitle')).toHaveText('Creep');
    // Lo que tocaste va a las recientes
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:searches'))[0])).toBe('creep');
    // Cancelar vuelve a donde estabas
    await page.locator('#searchCancel').click();
    await expect(page.locator('body')).not.toHaveClass(/search-mode/);
    await expect(page.locator('#searchInput')).toHaveValue('');
    await expect(page.locator('.nav-btn[data-nav="home"]')).toHaveClass(/is-active/);
    await expect(page.locator('.home-tile').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('erratas: avisa de que son resultados parecidos', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'gorilaz feel');
    await expect(page.locator('#listInfo')).toContainText('parecido');
    await expect(page.locator('.track').first()).toContainText('Feel Good');
  });

  test('escritorio: mejor resultado y filtros también, y el panel deja quitar recientes', async ({ page }) => {
    test.skip(isPhone(page), 'solo escritorio');
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.locator('#searchInput').click();
    await expect(page.locator('#searchPanel')).toBeVisible();
    await page.locator('[data-remove-search="tame impala"]').click();
    await expect(page.locator('.search-recent-q')).toHaveCount(1);
    await page.fill('#searchInput', 'radio');
    await expect(page.locator('.search-top')).toContainText('Radiohead');
    await expect(page.locator('#searchScopes')).toBeVisible();
    await page.locator('.search-top-open').click();
    await expect(page.locator('.artist-hero, .pl-hero').first()).toContainText('Radiohead');
  });
});

test.describe('v68: Liquid ATK', () => {
  const audiusTrack = (id, title, user, extra = {}) => ({
    id, title, duration: 200, genre: 'Electronic', is_streamable: true, access: { stream: true },
    play_count: 1000, favorite_count: 50, permalink: `/u/${id}`, license: 'All rights reserved',
    user: { name: user, is_verified: false }, ...extra
  });
  // Respuestas falsas de Audius y del Internet Archive (sin red en las pruebas)
  async function fuentesFalsas(page, seen = []) {
    await page.route(/api\.audius\.co\/v1\/tracks\/search/, (route) => {
      seen.push(route.request().url());
      route.fulfill({ json: { data: [
        audiusTrack('au1', 'Nébula Prueba', 'Banda Prueba'),
        audiusTrack('au2', 'Banda Prueba Podcast Ep. 12', 'Banda Prueba', { genre: 'Podcasts' }),
        audiusTrack('au3', 'Radiohead - Creep', 'Un Fan')
      ] } });
    });
    await page.route(/api\.audius\.co\/v1\/users\/search/, (route) => {
      seen.push(route.request().url());
      route.fulfill({ json: { data: [{ id: 'u1', name: 'Banda Prueba', handle: 'bandaprueba', is_verified: false, track_count: 2, follower_count: 10 }] } });
    });
    await page.route(/api\.audius\.co\/v1\/users\/u1\/tracks/, (route) => route.fulfill({ json: { data: [
      audiusTrack('au1', 'Nébula Prueba', 'Banda Prueba'),
      audiusTrack('au4', 'Otra del Perfil', 'Banda Prueba')
    ] } }));
    await page.route(/api\.audius\.co\/v1\/tracks\/trending/, (route) => {
      seen.push(route.request().url());
      route.fulfill({ json: { data: Array.from({ length: 10 }, (_, i) => audiusTrack(`tr${i}`, `Tendencia ${i}`, `Artista ${i}`)) } });
    });
    await page.route(/archive\.org\/advancedsearch/, (route) => {
      seen.push(route.request().url());
      route.fulfill({ json: { response: { numFound: 1, docs: [{ identifier: 'bandaprueba2020', downloads: 500 }] } } });
    });
    await page.route(/archive\.org\/metadata\//, (route) => route.fulfill({ json: {
      metadata: { title: 'Banda Prueba en directo', creator: 'Banda Prueba', mediatype: 'etree', collection: ['BandaPrueba', 'etree'] },
      files: [
        { name: 'bp01.mp3', format: 'VBR MP3', title: 'Canción del Directo', length: '245.3' },
        { name: 'bp02.mp3', format: 'VBR MP3', title: 'Afinando', length: '20.0' }
      ]
    } }));
    await page.route(/audius\.co\/v1\/tracks\/[^/]+\/stream|archive\.org\/download/, (route) => route.abort());
    await page.route(/api-v2\.hearthis\.at|api\.openverse\.org/, (route) => {
      seen.push(route.request().url());
      route.fulfill({ json: /openverse/.test(route.request().url()) ? { results: [] } : [] });
    });
    await page.route(/api\.jamendo\.com/, (route) => {
      seen.push(route.request().url());
      route.fulfill({ json: { headers: { status: 'success' }, results: [] } });
    });
  }
  const conAtk = (page) => page.addInitScript(() => {
    if (!sessionStorage.getItem('atk-puesto')) {
      localStorage.setItem('liquidbrush:settings', JSON.stringify({ atk: true }));
      sessionStorage.setItem('atk-puesto', '1');
    }
  });

  test('viene encendido de serie; se apaga desde Ajustes, deja de llamar a nadie y se recuerda', async ({ page }) => {
    const seen = [];
    await fuentesFalsas(page, seen);
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    // Sin haber tocado nada: ATK encendido
    await expect(page.locator('html')).toHaveClass(/\batk\b/);
    await expect(page.locator('.brand-name')).toHaveText('LiquidATK');
    await page.locator('#settingsBtn, [aria-label*="Ajustes"]').first().click();
    await expect(page.locator('#atkToggle')).toBeChecked();
    await page.locator('label:has(#atkToggle)').click();
    await expect(page.locator('#atkToggle')).not.toBeChecked();
    await expect(page.locator('html')).not.toHaveClass(/\batk\b/);
    await expect(page.locator('.brand-name')).toHaveText('LiquidBullet');
    await expect(page.locator('.toast')).toContainText('Liquid ATK desactivado');
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('liquidbrush:settings'))).atk).toBe(false);
    await page.keyboard.press('Escape');
    // (cerrar Ajustes vuelve atrás en el historial: se espera a que termine antes de recargar)
    await expect(page.locator('#settingsDialog')).not.toBeVisible();
    await page.waitForTimeout(400);
    // Apagado: buscar no llama a ninguna fuente de fuera, y sigue apagado al volver a abrir
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await expect(page.locator('.brand-name')).toHaveText('LiquidBullet');
    seen.length = 0;
    await page.fill('#searchInput', 'banda prueba');
    await expect(page.locator('#listInfo')).toContainText('resultado');
    await page.waitForTimeout(700);
    await expect(page.locator('#atkResults')).toBeHidden();
    expect(seen).toEqual([]);
    // Y se vuelve a encender igual
    if (await page.locator('#searchCancel').isVisible()) await page.locator('#searchCancel').click();
    else await page.fill('#searchInput', '');
    await page.locator('#settingsBtn, [aria-label*="Ajustes"]').first().click();
    await page.locator('label:has(#atkToggle)').click();
    await expect(page.locator('.brand-name')).toHaveText('LiquidATK');
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('liquidbrush:settings'))).atk).toBe(true);
  });

  test('buscador: elige la mejor opción, sin pódcasts ni impostores, suena y guarda sus créditos', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await fuentesFalsas(page);
    await conAtk(page);
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'banda prueba');
    await expect(page.locator('.atk-status')).toHaveText('3 canciones');
    // Perfil completo: «Banda Prueba» es un artista de Audius y trae toda su música
    await expect(page.locator('.atk-artist-name')).toHaveText('Banda Prueba');
    await expect(page.locator('.atk-artist-meta')).toContainText('Perfil completo');
    const titles = await page.locator('.atk-list .track-title').allTextContents();
    expect(titles.join('|')).toContain('Otra del Perfil');
    expect(titles.join('|')).toContain('Nébula Prueba');
    expect(titles.join('|')).toContain('Canción del Directo');
    // Fuera: el pódcast y la pista de 20 s
    expect(titles.join('|')).not.toContain('Podcast');
    expect(titles.join('|')).not.toContain('Afinando');
    // Liquid no la tiene: el mejor resultado es de ATK, con portada de Liquid
    await expect(page.locator('.search-top .atk-mark')).toBeVisible();
    expect(await page.locator('.search-top-img').getAttribute('src')).toMatch(/covers\/songs\/song-\d\d/);
    const top = (await page.locator('.search-top-title').textContent()).trim();
    await page.locator('.search-top-play').click();
    await expect(page.locator('#miniTitle')).toHaveText(top);
    await expect(page.locator('#npContext')).toHaveText('Liquid ATK');
    // Créditos en su menú + (y sin compartir, artista ni radio)
    await page.locator('.atk-list .track [data-action="add"]').first().click();
    await expect(page.locator('.add-credit')).toContainText('vía');
    await expect(page.locator('#addShare')).toBeHidden();
    await page.keyboard.press('Escape');
    // Favorita: se guarda con sus datos y sigue ahí al recargar
    await page.locator('.atk-list .track [data-action="fav"]').first().dispatchEvent('click');
    await expect.poll(() => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('liquidbrush:atk-tracks') || '{}')).length)).toBeGreaterThan(0);
    await page.goto('./?view=favorites');
    await expect(page.locator('#trackList .track .atk-mark').first()).toBeVisible();
    // Un artista de Liquid: las subidas sin verificar con su nombre salen, pero «No verificado»
    // (desde la Biblioteca: en escritorio, buscar dentro de Favoritas solo filtra las favoritas)
    await page.goto('./?view=library');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'radiohead creep');
    // «Creep» ya está en Liquid: la resubida se aparta (v75); se puede ver con «Mostrarlas»
    await expect(page.locator('.atk-owned-note')).toContainText('que ya tienes');
    await page.locator('.atk-owned-flip').click();
    const impostor = page.locator('.atk-list .track', { hasText: 'Radiohead - Creep' });
    await expect(impostor.locator('.atk-unverified')).toHaveText('No verificado');
    await impostor.locator('[data-action="add"]').click();
    await expect(page.locator('.add-credit')).toContainText('No verificado');
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });

  test('con ATK apagado sus canciones se ven atenuadas y no suenan', async ({ page }) => {
    await fuentesFalsas(page);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('atk-guardada')) return;
      sessionStorage.setItem('atk-guardada', '1');
      localStorage.setItem('liquidbrush:atk-tracks', JSON.stringify({ 'atk:au:au1': { t: 'Nébula Prueba', a: 'Banda Prueba', s: 200, u: 'https://api.audius.co/v1/tracks/au1/stream?app_name=liquidbullet' } }));
      localStorage.setItem('liquidbrush:favorites', JSON.stringify(['atk:au:au1']));
      localStorage.setItem('liquidbrush:settings', JSON.stringify({ atk: false }));
    });
    await page.goto('./?view=favorites');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    const row = page.locator('#trackList .track.is-atk-off');
    await expect(row).toContainText('Solo en Liquid ATK');
    await row.locator('.track-main').click();
    await expect(page.locator('.toast')).toContainText('actívalo en Ajustes');
    await expect(page.locator('#miniTitle')).not.toHaveText('Nébula Prueba');
  });

  test('ATK en Inicio, Lab y Stats', async ({ page }) => {
    await fuentesFalsas(page);
    await conAtk(page);
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await expect(page.locator('.atk-home .home-card').first()).toBeVisible();
    await expect(page.locator('.atk-home .home-card-label').first()).toContainText('ATK');
    await page.locator('.atk-home .home-card').first().click();
    await expect(page.locator('#miniTitle')).toContainText('Tendencia');
    await page.goto('./lab.html');
    await expect(page.locator('.atk-lab-note')).toBeVisible();
  });
});

test.describe('v70: Liquid ATK sin límites', () => {
  const pista = (n) => ({ id: `p${n}`, title: `Pista ${n}`, duration: 180, genre: 'Electronic', is_streamable: true, access: { stream: true },
    play_count: 1000 - n, favorite_count: 1, permalink: `/p/${n}`, user: { name: `Productor ${n}`, is_verified: true } });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('atk-puesto')) {
        localStorage.setItem('liquidbrush:settings', JSON.stringify({ atk: true }));
        sessionStorage.setItem('atk-puesto', '1');
      }
    });
    // Audius da 25 por página; el Archive y Jamendo no tienen nada
    await page.route(/api\.audius\.co\/v1\/tracks\/search/, (route) => {
      const url = new URL(route.request().url());
      const off = Number(url.searchParams.get('offset') || 0);
      const q = url.searchParams.get('query');
      const list = q.startsWith('pista') ? (off < 50 ? Array.from({ length: 25 }, (_, i) => pista(off + i + 1)) : [])
        : [{ ...pista(99), title: 'Medianoche Eléctrica', user: { name: 'Neón Sur', is_verified: true } }];
      route.fulfill({ json: { data: list } });
    });
    await page.route(/api\.audius\.co\/v1\/(users|tracks\/trending)/, (route) => route.fulfill({ json: { data: [] } }));
    await page.route(/archive\.org\/advancedsearch/, (route) => route.fulfill({ json: { response: { numFound: 0, docs: [] } } }));
    await page.route(/api\.jamendo\.com/, (route) => route.fulfill({ json: { headers: { status: 'success' }, results: [] } }));
    await page.route(/api-v2\.hearthis\.at|api\.openverse\.org/, (route) => route.fulfill({ json: /openverse/.test(route.request().url()) ? { results: [] } : [] }));
  });

  test('«Ver más» enseña lo encontrado y luego pide la página siguiente', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'pista');
    await expect(page.locator('.atk-list .track')).toHaveCount(24);
    await page.locator('.atk-more').click();
    // Las 25 primeras ya estaban; con la siguiente página llegan 25 más
    await expect(page.locator('.atk-list .track')).toHaveCount(48);
    await page.locator('.atk-more').click();
    await expect(page.locator('.atk-list .track')).toHaveCount(50);
    await expect(page.locator('.atk-more')).toHaveCount(0);
  });

  test('Archive: las subidas de la comunidad entran, pero «No verificado»', async ({ page }) => {
    await page.route(/archive\.org\/advancedsearch/, (route) => route.fulfill({ json: { response: { numFound: 1, docs: [{ identifier: 'comunidad1', downloads: 50 }] } } }));
    await page.route(/archive\.org\/metadata\//, (route) => route.fulfill({ json: {
      metadata: { title: 'Disco Subido', creator: 'Grupo Comunitario', mediatype: 'audio', collection: ['opensource_audio', 'community'] },
      files: [{ name: 'c01.mp3', format: 'VBR MP3', title: 'Canción Comunitaria', length: '200.0' }]
    } }));
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'cancion comunitaria');
    const row = page.locator('.atk-list .track', { hasText: 'Canción Comunitaria' });
    await expect(row.locator('.atk-unverified')).toHaveText('No verificado');
    await row.locator('[data-action="add"]').click();
    await expect(page.locator('.add-credit')).toContainText('comunidad del Internet Archive');
  });

  test('erratas: «medianoxe electrica» encuentra «Medianoche Eléctrica»', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'medianoxe electrica');
    await expect(page.locator('.atk-list .track').first()).toContainText('Medianoche Eléctrica');
  });
});

test.describe('v72: Hearthis, Openverse y Radio', () => {
  const emisora = (n, extra = {}) => ({
    stationuuid: `st-${n}`, name: `Emisora ${n}`, url: `https://radio.example/${n}`, url_resolved: `https://radio.example/${n}`,
    favicon: '', tags: 'jazz,smooth', country: 'Spain', countrycode: 'ES', codec: 'MP3', bitrate: 128, hls: 0, ...extra
  });
  test.beforeEach(async ({ page }) => {
    await page.route(/radio-browser\.info\/json\/stats/, (route) => route.fulfill({ json: { stations: 50000, stations_broken: 1000 } }));
    await page.route(/radio-browser\.info\/json\/url\//, (route) => route.fulfill({ json: { ok: true } }));
    await page.route(/radio-browser\.info\/json\/stations\/search/, (route) => {
      const url = new URL(route.request().url());
      const tag = url.searchParams.get('tag');
      const list = tag === 'jazz' ? [emisora('jazz-1', { name: 'Jazz de Madrugada' })]
        : [emisora(1), emisora(2), emisora(3), emisora(4, { url_resolved: 'https://radio.example/hls.m3u8', hls: 1 })];
      route.fulfill({ json: list });
    });
    await page.route(/radio\.example/, (route) => route.abort());
  });

  test('Radio: sección propia, suena en directo, cambia de emisora y guarda tus emisoras', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    if (isPhone(page)) await page.locator('.nav-btn[data-nav="radio"]').click();
    else await page.locator('.tab[data-view="radio"]').click();
    await expect(page.locator('.view-title')).toHaveText('Radio');
    // Las emisoras HLS se quedan fuera (no suenan en todos los navegadores)
    await expect(page.locator('.radio-grid .radio-card')).toHaveCount(3);
    await expect(page.locator('.view-eyebrow')).toContainText('emisoras en directo');
    await page.locator('.radio-grid .radio-card-play').first().click();
    await expect(page.locator('#miniTitle')).toHaveText('Emisora 1');
    await expect(page.locator('#totalTime')).toHaveText('EN VIVO');
    await expect(page.locator('#npContext')).toContainText('Radio');
    await expect(page.locator('.radio-now-title')).toHaveText('Emisora 1');
    // «Siguiente» cambia de emisora
    await page.locator('.radio-next').click();
    await expect(page.locator('#miniTitle')).toHaveText('Emisora 2');
    // El corazón la guarda en «Tus emisoras», no en Favoritas
    await page.locator('.radio-fav').click();
    await expect(page.locator('.radio-row-title', { hasText: 'Tus emisoras' })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:radio')).favs.length)).toBe(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:favorites') || '[]').length)).toBe(0);
    // La radio no cuenta para Stats ni recomendaciones
    expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('liquidbrush:plays') || '{}')).some((k) => k.startsWith('radio:')))).toBe(false);
    // Filtro por género
    await page.locator('.radio-chips .chip', { hasText: 'Jazz' }).click();
    await expect(page.locator('.radio-grid .radio-card')).toHaveCount(1);
    await expect(page.locator('.radio-grid')).toContainText('Jazz de Madrugada');
    expect(errors).toEqual([]);
  });

  test('Lab no lleva Radio', async ({ page }) => {
    await page.goto('./lab.html');
    await expect(page.locator('.lab-hero')).toBeVisible();
    await expect(page.locator('.tab-radio')).toHaveCount(0);
    await expect(page.locator('.nav-btn[data-nav="radio"]')).toHaveCount(0);
    await expect(page.locator('#radioPanel')).toHaveCount(0);
  });

  test('ATK suma Hearthis.at y Wikimedia Commons (vía Openverse)', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('atk-puesto')) {
        localStorage.setItem('liquidbrush:settings', JSON.stringify({ atk: true }));
        sessionStorage.setItem('atk-puesto', '1');
      }
    });
    await page.route(/api\.audius\.co/, (route) => route.fulfill({ json: { data: [] } }));
    await page.route(/archive\.org/, (route) => route.fulfill({ json: { response: { numFound: 0, docs: [] } } }));
    await page.route(/api\.jamendo\.com/, (route) => route.fulfill({ json: { headers: { status: 'success' }, results: [] } }));
    await page.route(/api-v2\.hearthis\.at/, (route) => route.fulfill({ json: [{
      id: '77', title: 'Sesión Nocturna Prueba', duration: '1800', stream_url: 'https://hearthis.app/x/listen/', permalink_url: 'https://hearthis.at/x/',
      genre: 'House', playback_count: '500', license: 'all', private: '0', user: { username: 'DJ Prueba' }
    }] }));
    await page.route(/api\.openverse\.org/, (route) => route.fulfill({ json: { results: [
      { id: 'ov1', title: 'File:Sonata Prueba.ogg', creator: 'Orquesta Libre', duration: 240000, url: 'https://upload.example/sonata.ogg',
        license: 'by-sa', license_url: 'https://creativecommons.org/licenses/by-sa/4.0/', foreign_landing_url: 'https://commons.example/sonata' },
      { id: 'ov2', title: 'File:Palabra.ogg', creator: 'Alguien', duration: 1200, url: 'https://upload.example/palabra.ogg', license: 'by' }
    ] } }));
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'prueba');
    await expect(page.locator('.atk-list .track', { hasText: 'Sesión Nocturna Prueba' })).toBeVisible();
    await expect(page.locator('.atk-list .track', { hasText: 'Sonata Prueba' })).toBeVisible();
    // Lo de 1 s (una pronunciación de Commons) no es música
    await expect(page.locator('.atk-list .track', { hasText: 'Palabra' })).toHaveCount(0);
    await page.locator('.atk-list .track', { hasText: 'Sonata Prueba' }).locator('[data-action="add"]').click();
    await expect(page.locator('.add-credit')).toContainText('Wikimedia Commons');
  });
});

test.describe('v73: Liquid ATK afinado y pulido general', () => {
  const tema = (n, extra = {}) => ({ id: `t${n}`, title: `Tema ${n}`, duration: 200, genre: 'Electronic', is_streamable: true, access: { stream: true },
    play_count: 500 - n, favorite_count: 1, permalink: `/t/${n}`, user: { name: `Autora ${n}`, is_verified: true }, ...extra });
  const vacias = async (page) => {
    await page.route(/api\.audius\.co\/v1\/(users|tracks\/trending)/, (route) => route.fulfill({ json: { data: [] } }));
    await page.route(/archive\.org\/advancedsearch/, (route) => route.fulfill({ json: { response: { numFound: 0, docs: [] } } }));
    await page.route(/api\.jamendo\.com/, (route) => route.fulfill({ json: { headers: { status: 'success' }, results: [] } }));
    await page.route(/api-v2\.hearthis\.at|api\.openverse\.org/, (route) => route.fulfill({ json: /openverse/.test(route.request().url()) ? { results: [] } : [] }));
  };
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('atk-puesto')) {
        localStorage.setItem('liquidbrush:settings', JSON.stringify({ atk: true }));
        sessionStorage.setItem('atk-puesto', '1');
      }
    });
  });

  test('una búsqueda cortada a medias no se queda en «Buscando…» al volver a ella', async ({ page }) => {
    await vacias(page);
    // «tema lento» tarda en responder: se corta al seguir escribiendo
    await page.route(/api\.audius\.co\/v1\/tracks\/search/, async (route) => {
      const q = new URL(route.request().url()).searchParams.get('query');
      if (q === 'tema lento') await new Promise((done) => setTimeout(done, 1500));
      route.fulfill({ json: { data: [tema(1, { title: 'Tema Lento' })] } }).catch(() => {});
    });
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'tema lento');
    await expect(page.locator('.atk-status')).toHaveText('Buscando…');
    await page.waitForTimeout(500);
    await page.fill('#searchInput', 'tema lento x');
    await page.waitForTimeout(500);
    await page.fill('#searchInput', 'tema lento');
    await expect(page.locator('.atk-status')).toHaveText('1 canción');
    await expect(page.locator('.atk-list .track')).toHaveCount(1);
  });

  test('el filtro «Liquid ATK» se mantiene al seguir escribiendo y los textos llegan limpios', async ({ page }) => {
    await vacias(page);
    await page.route(/api\.audius\.co\/v1\/tracks\/search/, (route) => route.fulfill({ json: { data: [
      tema(1, { title: 'Radiohead Tribute &amp; Friends', genre: 'Cl&#xE1;sico' }), tema(2, { title: 'Radiohead en chiptune' })
    ] } }));
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'radiohead');
    const chip = page.locator('#searchScopes .chip[data-value="atk"]');
    await expect(chip).toContainText('2');
    await chip.click();
    await expect(chip).toHaveClass(/is-active/);
    await expect(page.locator('#trackList .track')).toHaveCount(0);
    // Entidades HTML fuera del título y del género
    await expect(page.locator('.atk-list')).toContainText('Radiohead Tribute & Friends');
    await expect(page.locator('.atk-list')).not.toContainText('&amp;');
    await expect(page.locator('.atk-list')).not.toContainText('&#x');
    // Una palabra más: el filtro sigue puesto mientras ATK busca y cuando termina
    await page.locator('#searchInput').pressSequentially(' t', { delay: 60 });
    await expect(chip).toHaveClass(/is-active/);
    await expect(page.locator('#listInfo')).toContainText('Liquid ATK');
    await expect(page.locator('.atk-status')).toHaveText('2 canciones');
    await expect(chip).toHaveClass(/is-active/);
    // La etiqueta ATK va en la línea del artista (en el título se cortaba)
    await expect(page.locator('.atk-list .track-artist .atk-mark').first()).toBeVisible();
  });

  test('con las fuentes caídas avisa y deja reintentar', async ({ page }) => {
    let caidas = true;
    await page.route(/api\.audius\.co|archive\.org|api\.jamendo\.com|api-v2\.hearthis\.at|api\.openverse\.org/, (route) => {
      const url = route.request().url();
      if (caidas) return route.abort();
      if (/tracks\/search/.test(url)) return route.fulfill({ json: { data: [tema(7, { title: 'Zzqx Vuelve' })] } });
      if (/advancedsearch/.test(url)) return route.fulfill({ json: { response: { docs: [] } } });
      if (/openverse|jamendo/.test(url)) return route.fulfill({ json: { results: [] } });
      return route.fulfill({ json: /hearthis/.test(url) ? [] : { data: [] } });
    });
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'zzqx vuelve');
    await expect(page.locator('.atk-status')).toHaveText('No se pudo buscar');
    await expect(page.locator('.atk-fail')).toContainText('no respondieron');
    caidas = false;
    await page.locator('.atk-retry').click();
    await expect(page.locator('.atk-list .track')).toHaveCount(1);
  });

  test('filtros de los resultados: canciones o sesiones largas', async ({ page }) => {
    await vacias(page);
    await page.route(/api\.audius\.co\/v1\/tracks\/search/, (route) => route.fulfill({ json: { data: [
      ...Array.from({ length: 5 }, (_, i) => tema(i + 1, { title: `Mezcla Corta ${i + 1}` })),
      ...Array.from({ length: 3 }, (_, i) => tema(i + 10, { title: `Mezcla Larga ${i + 1}`, duration: 3600 }))
    ] } }));
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'mezcla');
    await expect(page.locator('.atk-status')).toHaveText('8 canciones');
    await page.locator('.atk-filters .chip[data-value="songs"]').click();
    await expect(page.locator('.atk-list .track')).toHaveCount(5);
    await expect(page.locator('.atk-list')).not.toContainText('Mezcla Larga');
    await page.locator('.atk-filters .chip[data-value="long"]').click();
    await expect(page.locator('.atk-list .track')).toHaveCount(3);
    // Las duraciones de más de una hora se ven enteras
    await expect(page.locator('.atk-list .track-duration').first()).toHaveText('1:00:00');
  });

  test('lo que cambias en otra pestaña se ve en esta; Ajustes tiene índice y Stats el mapa de la semana', async ({ page, context }) => {
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await expect(page.locator('#favCount')).toHaveText('0');
    const id = await page.evaluate(() => {
      document.querySelector('.tab[data-view="library"]').click();
      return document.querySelector('#trackList .track').dataset.id;
    });
    // Otra pestaña marca una favorita y apunta escucha de estas semanas
    const otra = await context.newPage();
    await otra.goto('./404.html');
    await otra.evaluate((trackId) => {
      localStorage.setItem('liquidbrush:favorites', JSON.stringify([trackId]));
      const log = {};
      for (let d = 1; d < 15; d++) {
        const date = new Date(Date.now() - d * 86400000);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const h = new Array(24).fill(0);
        h[21] = 1800;
        log[key] = { s: { [trackId]: 1800 }, p: { [trackId]: 6 }, h };
      }
      localStorage.setItem('liquidbrush:listen', JSON.stringify(log));
    }, id);
    await expect(page.locator('#favCount')).toHaveText('1');
    await otra.close();

    await page.reload();
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.evaluate(() => document.querySelector('.tab[data-view="stats"]').click());
    await expect(page.locator('.stat-heat .heat-cell')).toHaveCount(7 * 24);
    await expect(page.locator('.heat-peak')).toContainText('a las 21:00');

    await page.locator('#settingsBtn').click();
    const ayuda = page.locator('.settings-index .chip', { hasText: 'Ayuda' });
    await ayuda.click();
    await expect(page.locator('#shortcutsBtn')).toBeInViewport();
  });
});

test.describe('v74: descargas (también en iPhone/iPad)', () => {
  // Sin service worker: Playwright no intercepta lo que pide el service worker (el MP3 iría a la red de verdad)
  test.use({ serviceWorkers: 'block' });
  // Un MP3 de verdad (silencio): tramas MPEG-1 capa III de 128 kbps
  const frame = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)]);
  const mp3 = Buffer.concat(Array.from({ length: 120 }, () => frame));
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  // Los MP3 de R2: con o sin CORS; «caido» los corta (como sin conexión)
  async function servidor(page, opts = {}) {
    const state = { cors: opts.cors !== false, caido: false, peticiones: 0, fallarPrimera: Boolean(opts.fallarPrimera), lento: opts.lento || 0 };
    await page.route(/r2\.dev/, async (route) => {
      if (state.caido) return route.abort();
      const req = route.request();
      state.peticiones++;
      if (state.fallarPrimera && req.method() === 'GET') { state.fallarPrimera = false; return route.abort(); }
      // Sin CORS, el navegador corta las peticiones que quieren leer el audio (fetch normal); las «a ciegas» pasan
      if (!state.cors && (await req.allHeaders()).origin) return route.abort();
      if (state.lento) await new Promise((done) => setTimeout(done, state.lento));
      const headers = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Content-Length': String(mp3.length) };
      if (state.cors) headers['Access-Control-Allow-Origin'] = '*';
      return route.fulfill({ status: 200, headers, body: req.method() === 'HEAD' ? '' : mp3 }).catch(() => {});
    });
    return state;
  }
  // Una playlist propia con 3 canciones de la Biblioteca
  const IDS = JSON.parse(readFileSync(new URL('../musica/pepper.json', import.meta.url), 'utf8')).slice(0, 3).map((t) => `pepper:${t.id}`);
  async function conPlaylist(page) {
    await page.addInitScript((trackIds) => {
      if (!localStorage.getItem('liquidbrush:playlists')) {
        localStorage.setItem('liquidbrush:playlists', JSON.stringify([{ id: 'dl1', name: 'Para el avión', trackIds, emoji: 'note', color: '#8a93a6', createdAt: Date.now() }]));
      }
    }, IDS);
  }
  async function abrirPlaylist(page) {
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.evaluate(() => document.querySelector('.tab[data-view="playlists"]').click());
    await page.locator('#playlistGrid .pl-card', { hasText: 'Para el avión' }).first().click();
    await expect(page.locator('.playlist-download')).toBeVisible();
  }
  const guardadas = (page) => page.evaluate(async () => (await (await caches.open('liquidbrush-audio')).keys()).length);

  test('una playlist se descarga entera, se comprueba y queda «Disponible sin conexión»', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await servidor(page);
    await conPlaylist(page);
    await abrirPlaylist(page);
    await page.locator('.playlist-download').click();
    await expect(page.locator('.toast')).toContainText('lista para escuchar sin conexión');
    await expect(page.locator('.playlist-meta')).toContainText('Disponible sin conexión');
    expect(await guardadas(page)).toBe(3);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:dl-pending') || '[]'))).toEqual([]);
  });

  test('si la red falla a mitad, reintenta solo', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await servidor(page, { fallarPrimera: true });
    await conPlaylist(page);
    await abrirPlaylist(page);
    await page.locator('.playlist-download').click();
    await expect(page.locator('.toast')).toContainText('lista para escuchar sin conexión', { timeout: 15000 });
    expect(await guardadas(page)).toBe(3);
  });

  test('una canción sola desde su menú +, y se puede quitar', async ({ page }) => {
    await servidor(page);
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.evaluate(() => document.querySelector('.tab[data-view="library"]').click());
    await page.locator('#trackList .track [data-action="add"]').first().click();
    await expect(page.locator('#addDownload')).toContainText('Descargar');
    await page.locator('#addDownload').click();
    await expect(page.locator('.toast')).toContainText('lista para escuchar sin conexión');
    await expect(page.locator('#trackList .track').first()).toHaveClass(/is-downloaded/);
    await page.locator('#trackList .track [data-action="add"]').first().click();
    await expect(page.locator('#addDownload')).toContainText('Quitar la descarga');
    await page.locator('#addDownload').click();
    await expect(page.locator('.toast')).toContainText('Quitada la descarga');
    expect(await guardadas(page)).toBe(0);
  });

  test('sin conexión, lo descargado suena desde el propio teléfono', async ({ browser }) => {
    // Sin service worker (como en la primera visita o si el navegador no le pasa el audio)
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.addInitScript(() => { localStorage.setItem('liquidbrush:tour', 'true'); localStorage.setItem('liquidbrush:cuenta-ofrecida', 'true'); });
    await page.route(/lrclib\.net/, (route) => route.abort());
    const server = await servidor(page);
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.evaluate(() => document.querySelector('.tab[data-view="library"]').click());
    await page.locator('#trackList .track [data-action="add"]').first().click();
    await page.locator('#addDownload').click();
    await expect(page.locator('.toast')).toContainText('lista para escuchar sin conexión');
    // Se corta la red: la canción descargada se lee de la caché y suena (dirección blob:)
    server.caido = true;
    await page.locator('#trackList .track .track-main').first().click();
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('audio')].some((a) => /^blob:/.test(a.getAttribute('src') || ''))), { timeout: 10000 }).toBe(true);
    await context.close();
  });

  test('iPhone sin CORS en el servidor: lo explica y no intenta en vano', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    await page.addInitScript(() => { localStorage.setItem('liquidbrush:tour', 'true'); localStorage.setItem('liquidbrush:cuenta-ofrecida', 'true'); });
    await page.route(/lrclib\.net/, (route) => route.abort());
    await servidor(page, { cors: false });
    await conPlaylist(page);
    await abrirPlaylist(page);
    await page.locator('.playlist-download').click();
    await expect(page.locator('.toast')).toContainText('falta activar CORS');
    expect(await guardadas(page)).toBe(0);
    await context.close();
  });

  test('iPhone con CORS: descarga y, si se cierra la app a medias, sigue sola al volver', async ({ browser }) => {
    const context = await browser.newContext({ userAgent: IPHONE, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    await page.addInitScript(() => { localStorage.setItem('liquidbrush:tour', 'true'); localStorage.setItem('liquidbrush:cuenta-ofrecida', 'true'); });
    await page.route(/lrclib\.net/, (route) => route.abort());
    await servidor(page, { lento: 1500 });
    await conPlaylist(page);
    await abrirPlaylist(page);
    await page.locator('.playlist-download').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:dl-pending') || '[]').length)).toBe(1);
    // Se cierra a medias: al volver a abrirla, la descarga continúa sin preguntar
    await page.reload();
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await expect.poll(() => guardadas(page), { timeout: 20000 }).toBe(3);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('liquidbrush:dl-pending') || '[]').length)).toBe(0);
    await context.close();
  });

  test('Android sin CORS: se guarda igual (copia opaca)', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await servidor(page, { cors: false });
    await conPlaylist(page);
    await abrirPlaylist(page);
    await page.locator('.playlist-download').click();
    await expect(page.locator('.toast')).toContainText('lista para escuchar sin conexión', { timeout: 15000 });
    expect(await guardadas(page)).toBe(3);
  });
});

test.describe('v75: Liquid ATK filtra lo que ya está en Liquid', () => {
  const sube = (n, title, user, extra = {}) => ({ id: `own${n}`, title, duration: 240, genre: 'Electronic', is_streamable: true, access: { stream: true },
    play_count: 900 - n, favorite_count: 1, permalink: `/o/${n}`, user: { name: user, is_verified: true }, ...extra });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('atk-puesto')) {
        localStorage.setItem('liquidbrush:settings', JSON.stringify({ atk: true }));
        sessionStorage.setItem('atk-puesto', '1');
      }
    });
    // Liquid ya tiene «Mr. Vain - Original Radio Edit» de Culture Beat y «Enjoy the Silence» de Depeche Mode
    await page.route(/api\.audius\.co\/v1\/tracks\/search/, (route) => route.fulfill({ json: { data: [
      sube(1, 'Mr. Vain (Official Video)', 'CultureBeatVEVO'),
      sube(2, 'Culture Beat - Mr. Vain [Remastered 2013]', 'Eurodance Archivo'),
      sube(3, 'mr vain', 'Culture Beat - Topic'),
      sube(4, 'Mr. Vain (Remix 2024)', 'DJ Nuevo'),
      sube(5, 'Mr. Vain cover acústico', 'Una Banda'),
      sube(6, 'Mr. Vain', 'Otro Artista Distinto')
    ] } }));
    await page.route(/api\.audius\.co\/v1\/(users|tracks\/trending)/, (route) => route.fulfill({ json: { data: [] } }));
    await page.route(/archive\.org\/advancedsearch/, (route) => route.fulfill({ json: { response: { numFound: 0, docs: [] } } }));
    await page.route(/api\.jamendo\.com/, (route) => route.fulfill({ json: { headers: { status: 'success' }, results: [] } }));
    await page.route(/api-v2\.hearthis\.at|api\.openverse\.org/, (route) => route.fulfill({ json: /openverse/.test(route.request().url()) ? { results: [] } : [] }));
  });

  test('aparta las resubidas y deja los remixes, covers y homónimos; se pueden mostrar con un toque', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'mr vain');
    await expect(page.locator('.atk-status')).toHaveText('3 canciones');
    const lista = page.locator('.atk-list');
    await expect(lista).toContainText('Remix 2024');
    await expect(lista).toContainText('cover acústico');
    await expect(lista).toContainText('Otro Artista Distinto');
    await expect(lista).not.toContainText('Official Video');
    await expect(lista).not.toContainText('Remastered');
    await expect(page.locator('.atk-owned-note')).toContainText('Ocultamos 3 que ya tienes');
    // Mostrarlas: salen marcadas «En Liquid» y la preferencia se guarda
    await page.locator('.atk-owned-flip').click();
    await expect(page.locator('.atk-status')).toHaveText('6 canciones');
    await expect(page.locator('.atk-list .atk-owned')).toHaveCount(3);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('liquidbrush:settings'))).atkHideOwned).toBe(false);
    await page.locator('.atk-owned-flip').click();
    await expect(page.locator('.atk-status')).toHaveText('3 canciones');
  });

  test('el interruptor de Ajustes hace lo mismo', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.locator('#settingsBtn').click();
    const toggle = page.locator('#atkOwnedToggle');
    await expect(toggle).toBeChecked();
    await page.locator('label:has(#atkOwnedToggle)').click();
    await expect(toggle).not.toBeChecked();
    await page.keyboard.press('Escape');
    await page.fill('#searchInput', 'mr vain');
    await expect(page.locator('.atk-status')).toHaveText('6 canciones');
  });
});

test.describe('v77: descargas con CORS activo', () => {
  test.use({ serviceWorkers: 'block' });
  const frame = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)]);
  const mp3 = Buffer.concat(Array.from({ length: 120 }, () => frame));
  const ARTIST_IDS = JSON.parse(readFileSync(new URL('../musica/pepper.json', import.meta.url), 'utf8')).slice(0, 2).map((t) => `pepper:${t.id}`);
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.route(/r2\.dev/, (route) => route.fulfill({ status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Access-Control-Allow-Origin': '*', 'Content-Length': String(mp3.length) }, body: route.request().method() === 'HEAD' ? '' : mp3 }));
  });
  const guardadas = (page) => page.evaluate(async () => (await (await caches.open('liquidbrush-audio')).keys()).length);

  test('Favoritas se descargan todas de una vez', async ({ page }) => {
    await page.addInitScript((ids) => { if (!localStorage.getItem('liquidbrush:favorites')) localStorage.setItem('liquidbrush:favorites', JSON.stringify(ids)); }, ARTIST_IDS);
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.evaluate(() => document.querySelector('.tab[data-view="favorites"]').click());
    await page.locator('.playlist-download[data-value="fav"]').click();
    await expect(page.locator('.toast')).toContainText('«Favoritas» lista para escuchar sin conexión');
    expect(await guardadas(page)).toBe(2);
    await expect(page.locator('.view-dl-meta')).toContainText('Disponible sin conexión');
  });

  test('un artista se descarga entero desde su página', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.evaluate(() => document.querySelector('.tab[data-view="artists"]').click());
    await page.locator('#homePanel [data-action="open-artist"]').first().click();
    const button = page.locator('.artist-hero ~ .pl-actions .playlist-download, .pl-actions .playlist-download').first();
    await expect(button).toHaveAttribute('data-value', /^artist:/);
    const total = await page.evaluate(() => document.querySelectorAll('#trackList .track').length);
    await button.click();
    await expect(page.locator('.toast')).toContainText('lista para escuchar sin conexión', { timeout: 25000 });
    expect(await guardadas(page)).toBeGreaterThanOrEqual(Math.min(total, 1));
    await expect(page.locator('.artist-hero .playlist-meta')).toContainText('Disponible sin conexión');
  });

  test('las copias opacas de antes pasan solas a copia completa', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    // Una descarga hecha cuando el bucket no tenía CORS: copia opaca
    const url = 'https://pub-cb798ce2901a49a6a6363d57fbd5ee19.r2.dev/' + encodeURI(JSON.parse(readFileSync(new URL('../musica/pepper.json', import.meta.url), 'utf8'))[0].src);
    await page.evaluate(async (u) => {
      const opaque = await fetch(u, { mode: 'no-cors' });
      await (await caches.open('liquidbrush-audio')).put(u, opaque);
    }, url);
    const tipo = () => page.evaluate(async (u) => (await (await caches.open('liquidbrush-audio')).match(u))?.type, url);
    expect(await tipo()).toBe('opaque');
    await page.reload();
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await expect.poll(tipo, { timeout: 30000 }).not.toBe('opaque');
    expect(await guardadas(page)).toBe(1);
  });
});

test.describe('v78: Stats a fondo y 108 hitos', () => {
  const IDS = JSON.parse(readFileSync(new URL('../musica/pepper.json', import.meta.url), 'utf8')).slice(0, 40).map((t) => `pepper:${t.id}`);
  test.beforeEach(async ({ page }) => {
    // 70 días de escucha: 30 minutos cada día, a las 22:00
    await page.addInitScript((ids) => {
      if (sessionStorage.getItem('historial-v78')) return;
      sessionStorage.setItem('historial-v78', '1');
      const log = {};
      const plays = {};
      for (let d = 0; d < 70; d++) {
        const date = new Date(Date.now() - d * 86400000);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const id = ids[d % ids.length];
        const h = new Array(24).fill(0);
        h[22] = 1800;
        log[key] = { s: { [id]: 1800 }, p: { [id]: 4 }, h };
        plays[id] = (plays[id] || 0) + 4;
      }
      localStorage.setItem('liquidbrush:listen', JSON.stringify(log));
      localStorage.setItem('liquidbrush:plays', JSON.stringify(plays));
    }, IDS);
  });

  test('periodos, frase resumen, comparación, perfil, récords y 108 hitos por categorías', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.evaluate(() => document.querySelector('.tab[data-view="stats"]').click());
    // Mes: frase, comparación con los mismos días del mes anterior y tarjetas nuevas
    await expect(page.locator('.stats-ranges .chip[data-value="month"]')).toHaveClass(/is-active/);
    await expect(page.locator('.stats-story')).toContainText('de música');
    await expect(page.locator('.stats-story')).toContainText('Tu artista');
    await expect(page.locator('.stat-title', { hasText: 'Días de la semana' })).toBeVisible();
    await expect(page.locator('.profile-name')).toContainText('Nocturno');
    await expect(page.locator('.records')).toContainText('Tu día más musical');
    await expect(page.locator('.records')).toContainText('Racha más larga');
    // Año y desde siempre: horas por mes y sin flechas de mes en «Desde siempre»
    await page.locator('.stats-ranges .chip[data-value="year"]').click();
    await expect(page.locator('.view-eyebrow')).toHaveText(String(new Date().getFullYear()));
    await expect(page.locator('.stat-title', { hasText: 'Horas por mes' })).toBeVisible();
    await page.locator('.stats-ranges .chip[data-value="all"]').click();
    await expect(page.locator('.stats-story')).toContainText('Desde que usas Liquid: 35 h');
    await expect(page.locator('[data-action="stats-prev"]')).toHaveCount(0);
    // Hitos: 108, con 70 días seguidos ya caen «Semana completa» y «Mes sin fallar»
    await expect(page.locator('.hitos-card .stat-sub').first()).toContainText('de 108 conseguidos');
    await page.locator('.hitos-all-summary').click();
    await expect(page.locator('.hitos-groups .hito')).toHaveCount(108);
    await expect(page.locator('.hitos-groups .hito', { hasText: 'Semana completa' })).toHaveClass(/is-done/);
    await expect(page.locator('.hitos-groups .hito', { hasText: 'Mes sin fallar' })).toHaveClass(/is-done/);
    await expect(page.locator('.hitos-groups .hito', { hasText: 'Año sin pausa' })).not.toHaveClass(/is-done/);
    await page.locator('.hitos-filters .chip[data-value="done"]').click();
    const done = await page.locator('.hitos-groups .hito').count();
    expect(done).toBeGreaterThan(5);
    await expect(page.locator('.hitos-groups .hito:not(.is-done)')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe('v79: Liquid ATK + SKd (Soulseek por tu servidor)', () => {
  test.use({ serviceWorkers: 'block' });
  const CLAVE = 'clave-de-prueba-1234567890';
  const frame = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(413)]);
  const mp3 = Buffer.concat(Array.from({ length: 300 }, () => frame));
  const fila = (id, title, artist) => ({ id, title, artist, album: '', duration: '3:30', src: `https://skd.example/musica/${id}.mp3?k=${CLAVE}`, size: mp3.length });
  // Un servidor SKd de mentira: lista, buscar, pedir y seguir el pedido
  async function servidorSkd(page) {
    const s = { lista: [fila('h0', 'Ya Estaba', 'Banda Local')], llamadas: 0, pedido: null };
    await page.route(/skd\.example/, async (route) => {
      const url = new URL(route.request().url());
      const auth = route.request().headers().authorization || '';
      const ok = auth === `Bearer ${CLAVE}` || url.searchParams.get('k') === CLAVE;
      const cors = { 'Access-Control-Allow-Origin': '*' };
      if (!ok) return route.fulfill({ status: 401, headers: cors, json: { error: 'Clave incorrecta' } });
      if (url.pathname === '/api/estado') return route.fulfill({ headers: cors, json: { ok: true, soulseek: true, canciones: s.lista.length } });
      if (url.pathname === '/api/lista.json') return route.fulfill({ headers: cors, json: s.lista });
      if (url.pathname === '/api/buscar') return route.fulfill({ headers: cors, json: { resultados: [
        { id: 'r1', titulo: 'Medianoche', artista: 'Neón Sur', album: 'Noche', ext: 'mp3', kbps: 320, segundos: 210, tamano: 8000000, usuario: 'ana', libre: true, cola: 0, velocidad: 900000 }
      ] } });
      if (url.pathname === '/api/pedir') { s.pedido = 'r1'; return route.fulfill({ headers: cors, json: { id: 'r1', estado: 'en-cola', porcentaje: 0 } }); }
      if (url.pathname === '/api/pedidos') {
        s.llamadas++;
        const lista = s.llamadas < 2
          ? { id: 'r1', estado: 'bajando', porcentaje: 40 }
          : { id: 'r1', estado: 'lista', porcentaje: 100, cancion: fila('h1', 'Medianoche', 'Neón Sur') };
        if (lista.cancion && !s.lista.some((x) => x.id === 'h1')) s.lista.push(lista.cancion);
        return route.fulfill({ headers: cors, json: { pedidos: [lista] } });
      }
      if (url.pathname.startsWith('/musica/')) return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'audio/mpeg' }, body: mp3 });
      return route.fulfill({ status: 404, headers: cors, json: {} });
    });
    return s;
  }

  test('se conecta desde Ajustes y su biblioteca entra en Liquid', async ({ page }) => {
    await servidorSkd(page);
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    const antes = Number(await page.locator('#libCount').textContent());
    await page.locator('#settingsBtn').click();
    await page.locator('#skdUrl').fill('skd.example');
    await page.locator('#skdClave').fill('mala-clave-123456789');
    await page.locator('#skdConectar').click();
    await expect(page.locator('#skdEstado')).toHaveText('La clave no es correcta.');
    await page.locator('#skdClave').fill(CLAVE);
    await page.locator('#skdConectar').click();
    await expect(page.locator('#skdEstado')).toContainText('Conectado · Soulseek en línea');
    await expect(page.locator('html')).toHaveClass(/\bskd\b/);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('liquidbrush:skd')))).toEqual({ url: 'https://skd.example', clave: CLAVE });
    await expect(page.locator('#skdQuitar')).toBeVisible();
    // La canción de tu servidor ya está en la Biblioteca
    await expect(page.locator('#libCount')).toHaveText(String(antes + 1));
  });

  test('ATK + SKd: busca en Soulseek, se pide, se sigue el progreso y suena desde tu biblioteca', async ({ page }) => {
    const s = await servidorSkd(page);
    await page.addInitScript((clave) => {
      if (sessionStorage.getItem('skd-puesto')) return;
      sessionStorage.setItem('skd-puesto', '1');
      localStorage.setItem('liquidbrush:skd', JSON.stringify({ url: 'https://skd.example', clave }));
    }, CLAVE);
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'neon sur medianoche');
    const resultado = page.locator('.atk-list .track', { hasText: 'Medianoche' });
    await expect(resultado.locator('.skd-mark')).toHaveText('SKd');
    await expect(resultado.locator('.skd-progress')).toContainText('toca para pedirla');
    await resultado.locator('.track-main').click();
    await expect(page.locator('.toast')).toContainText('Pidiendo «Medianoche» a Soulseek');
    await expect.poll(() => s.pedido).toBe('r1');
    await expect(resultado.locator('.skd-progress')).toHaveText('Bajando 40 %');
    // Llega: entra en la biblioteca y suena
    await expect(page.locator('#miniTitle')).toHaveText('Medianoche', { timeout: 10000 });
    await expect(page.locator('#npContext')).toHaveText('SKd · Soulseek');
    expect(await page.evaluate(() => [...document.querySelectorAll('audio')].some((a) => /skd\.example\/musica\/h1\.mp3/.test(a.getAttribute('src') || '')))).toBe(true);
    await expect(resultado.locator('.skd-progress')).toHaveText('En tu biblioteca');
  });

  test('sin servidor conectado, ATK no pregunta a ningún SKd', async ({ page }) => {
    let llamadas = 0;
    await page.route(/skd\.example/, (route) => { llamadas++; return route.abort(); });
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.fill('#searchInput', 'neon sur medianoche');
    await page.waitForTimeout(1500);
    expect(llamadas).toBe(0);
    await expect(page.locator('.skd-mark:visible')).toHaveCount(0);
  });
});

test.describe('v80: parche de estabilidad', () => {
  test('saltar a la Z con el índice no crea miles de filas de golpe y las de en medio aparecen al subir', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('liquidbrush:sort', JSON.stringify('title')); } catch { /* sin almacenamiento */ } });
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.evaluate(() => document.querySelector('.tab[data-view="library"]').click());
    await expect(page.locator('#alphaRail')).toBeVisible();
    const last = await page.locator('.alpha-letter').last().getAttribute('data-letter');
    await page.locator(`.alpha-letter[data-letter="${last}"]`).click();
    // Solo las filas cerca de la Z son filas completas; el resto, huecos ligeros
    expect(await page.locator('#trackList .track').count()).toBeLessThan(400);
    expect(await page.locator('#trackList .track-stub').count()).toBeGreaterThan(100);
    const first = await page.evaluate(() => document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest('.track')?.dataset.id);
    expect(first).toBeTruthy();
    // Al subir, los huecos se convierten en canciones
    await page.mouse.wheel(0, -3000);
    await expect.poll(() => page.evaluate(() => document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest('.track, .track-stub')?.className || '')).toContain('track');
    await expect.poll(() => page.evaluate(() => document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest('.track-stub') === null)).toBe(true);
  });
});

test.describe('v82: playlists sin tirones al bajar', () => {
  test('repintar una playlist larga no la recorta ni mueve el scroll', async ({ page }) => {
    await page.goto('./?view=playlists');
    await expect(page.locator('.pl-card').first()).toBeVisible();
    await page.evaluate(() => document.querySelector('.pl-card').click());
    await expect(page.locator('#trackList .track').first()).toBeVisible();
    // Bajar hasta que haya muchas filas pintadas
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(250);
    }
    const before = await page.evaluate(() => ({ y: Math.round(window.scrollY), rows: document.querySelectorAll('#trackList > li').length }));
    test.skip(before.rows <= 60, 'La playlist de prueba es corta');
    // Repinta la misma lista (como al llegar datos nuevos o marcar una favorita)
    await page.evaluate(() => document.querySelector('#filterChips .chip.is-active, #filterChips .chip').click());
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ y: Math.round(window.scrollY), rows: document.querySelectorAll('#trackList > li').length }));
    expect(Math.abs(after.y - before.y)).toBeLessThan(4);
    expect(after.rows).toBeGreaterThanOrEqual(before.rows - 1);
    // Lo que se ve en el centro es una canción de verdad, no un hueco
    expect(await page.evaluate(() => Boolean(document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest('.track')))).toBe(true);
  });
});

test.describe('v82: ecualizador con CORS en R2', () => {
  test.use({ serviceWorkers: 'block' });
  test('al abrir la app con un perfil, ▶ suena por el ecualizador; con «Plano» vuelve al reproductor normal', async ({ page }) => {
    test.setTimeout(45000);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('eq-ok')) return;
      sessionStorage.setItem('eq-ok', '1');
      const saved = JSON.parse(localStorage.getItem('liquidbrush:settings') || '{}');
      saved.eq = { preset: 'deep', gains: [9, 5, -1, 0, 1] };
      localStorage.setItem('liquidbrush:settings', JSON.stringify(saved));
    });
    // R2 con CORS activado (como ya está en los 6 buckets)
    const wav = silentWav(20);
    await page.route(/r2\.dev/, (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'Access-Control-Allow-Origin': '*' } }));
    await page.goto('./');
    await expect(page.locator('#libCount')).not.toHaveText('0');
    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    await page.locator('#playBtn').click();
    const deckSonando = () => page.evaluate(() => [...document.querySelectorAll('audio')].find((a) => a.getAttribute('src') && !a.paused)?.id || '');
    await expect.poll(deckSonando, { timeout: 20000 }).toMatch(/^audio[34]$/);
    await expect(page.locator('#eqNote .eq-status')).toHaveClass(/is-on/);
    await page.evaluate(() => document.getElementById('settingsBtn').click());
    await expect(page.locator('#eqCurve')).toHaveAttribute('aria-label', /Bajos \+9 dB/);
    await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    // Plano con la música en pausa: al reanudar pasa al reproductor normal (en iPhone sigue con la pantalla bloqueada)
    await page.locator('#playBtn').click();
    await expect(page.locator('#playBtn')).toHaveAttribute('aria-label', 'Reproducir');
    await page.evaluate(() => {
      const select = document.getElementById('eqPreset');
      select.value = 'flat';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#playBtn').click();
    await expect.poll(deckSonando, { timeout: 20000 }).toMatch(/^audio2?$/);
    await expect(page.locator('#eqNote .eq-status')).toHaveClass(/is-off/);
  });
});
