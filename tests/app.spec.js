// Recorridos principales de Liquid Bullet en móvil y escritorio.
// No dependen del audio (los MP3 viven en Cloudflare R2): prueban la interfaz y la lógica.
import { test, expect } from '@playwright/test';

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
