import { expect, test } from '@playwright/test';

import {
  LOGOUT_NAME,
  ROLE_PATTERN,
  authCookies,
  baseOf,
  contextWithCookies,
  expectRedirectToLogin,
  getWorld,
  isDashboard,
  uiLogin,
  type World,
} from './support/world';

// Pruebas independientes de Testing (TASK-007) con Auth real. Develop no las modifica.
// Criterios: T7-07 (redireccion post-login), T7-08 (logout), T7-09 (cookie previa al logout),
// T7-10 (errores genericos y entrada invalida). Job `supabase` de CI.
//
// Contrato de UI: inputs `name="email"` y `name="password"`; boton de envio y boton de cerrar
// sesion con nombre accesible reconocible; error de login en [data-testid="form-error"] con
// role="alert".

let world: World;
test.beforeAll(async () => {
  world = await getWorld();
});

const RUN_SUFFIX = () => world.run;

test.describe('T7-10 errores de login genericos y entrada invalida', () => {
  test('mismo mensaje para contrasena erronea y correo inexistente; sin eco ni cookies', async ({
    page,
    context,
  }) => {
    const wrongPassword = `x${Date.now()}-incorrecta`;
    const messages: string[] = [];

    const attempts = [
      { email: world.ownerA.email, password: wrongPassword },
      { email: `nadie-${RUN_SUFFIX()}@example.test`, password: wrongPassword },
    ];
    for (const [index, attempt] of attempts.entries()) {
      await page.goto('/login');
      await page.locator('input[name="email"]').fill(attempt.email);
      await page.locator('input[name="password"]').fill(attempt.password);
      // Una de las dos por teclado (Enter), otra con el boton.
      if (index === 0) await page.locator('input[name="password"]').press('Enter');
      else
        await page
          .getByRole('button', { name: /iniciar sesi|entrar|acceder|sign in|log ?in/i })
          .click();

      const error = page.getByTestId('form-error');
      await expect(error).toBeVisible({ timeout: 15_000 });
      await expect(error).toHaveAttribute('role', 'alert');
      messages.push((await error.innerText()).trim());

      expect(new URL(page.url()).pathname).toBe('/login');
      expect(page.url()).not.toMatch(/password|email=/i);
      expect(await page.content(), 'la contrasena se refleja en el HTML').not.toContain(
        attempt.password,
      );
    }

    expect(messages[0].length).toBeGreaterThan(0);
    expect(messages[1], 'el mensaje no debe distinguir si el correo existe').toBe(messages[0]);
    for (const message of messages) {
      expect(message).not.toMatch(
        /no existe|no registrad|no encontrad|not found|not confirmed|no confirmad|does not exist|banned|bloquead/i,
      );
    }
    expect(authCookies(await context.cookies())).toHaveLength(0);
  });

  test('entrada invalida o extrema se gestiona con un error controlado (sin 5xx ni trazas)', async ({
    page,
  }) => {
    const serverErrors: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
    });

    const inputs = [
      { email: 'no-es-un-correo', password: 'x' },
      { email: '', password: '' },
      { email: `${'a'.repeat(400)}@example.test`, password: 'x' },
      { email: world.ownerA.email, password: 'p'.repeat(20_000) },
      { email: "' OR 1=1 --@example.test", password: "' OR '1'='1" },
    ];
    for (const input of inputs) {
      await page.goto('/login');
      // Desactiva la validacion del navegador para ejercitar la validacion de servidor.
      await page
        .locator('form')
        .first()
        .evaluate((form) => {
          (form as HTMLFormElement).noValidate = true;
        });
      await page.locator('input[name="email"]').fill(input.email);
      await page.locator('input[name="password"]').fill(input.password);
      await page.locator('input[name="password"]').press('Enter');

      await expect(page.getByTestId('form-error')).toBeVisible({ timeout: 15_000 });
      expect(new URL(page.url()).pathname).toBe('/login');
      const body = await page.content();
      expect(body).not.toMatch(/ZodError|Application error|stack trace|\bat .*\.(ts|js):\d+/i);
      expect(body).not.toMatch(/PGRST|GoTrue|AuthApiError|postgres|supabase\.co/i);
    }
    expect(serverErrors).toEqual([]);
  });
});

test.describe('T7-07 redireccion post-login (open redirect)', () => {
  const hostile = ['//evil.example/phish', 'https://evil.example/phish', '/\\evil.example'];

  for (const next of hostile) {
    test(`next hostil ${JSON.stringify(next)} acaba en /dashboard del mismo origen`, async ({
      browser,
      baseURL,
    }) => {
      const base = baseOf(baseURL);
      const origin = new URL(base).origin;
      const context = await browser.newContext({ baseURL: base });
      const external: string[] = [];
      await context.route(
        (url) =>
          url.origin !== origin &&
          /^https?:$/.test(url.protocol) &&
          /evil\.example/.test(url.hostname),
        (route) => {
          external.push(route.request().url());
          return route.abort();
        },
      );
      try {
        const page = await context.newPage();
        await uiLogin(page, world.memberA, next);
        await page.waitForURL(isDashboard(origin), { timeout: 20_000 });
        expect(external, 'se intento navegar a un origen externo').toEqual([]);
        await expect(page.getByTestId('org-name')).toHaveText(world.orgA.name);
      } finally {
        await context.close();
      }
    });
  }

  test('desde /dashboard sin sesion: login y vuelta a /dashboard; con sesion /login?next hostil va a /dashboard', async ({
    browser,
    baseURL,
  }) => {
    const base = baseOf(baseURL);
    const origin = new URL(base).origin;
    const context = await browser.newContext({ baseURL: base });
    try {
      const page = await context.newPage();
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login(\?|$)/);
      await page.locator('input[name="email"]').fill(world.ownerA.email);
      await page.locator('input[name="password"]').fill(world.ownerA.password);
      await page
        .getByRole('button', { name: /iniciar sesi|entrar|acceder|sign in|log ?in/i })
        .click();
      await page.waitForURL(isDashboard(origin), { timeout: 20_000 });
      await expect(page.getByTestId('user-role')).toHaveText(ROLE_PATTERN.owner);

      // Con sesion activa, /login (incluso con next hostil) lleva a /dashboard del mismo origen.
      for (const next of ['/dashboard', '//evil.example', 'https://evil.example']) {
        await page.goto(`/login?next=${encodeURIComponent(next)}`);
        await page.waitForURL(isDashboard(origin), { timeout: 20_000 });
      }
    } finally {
      await context.close();
    }
  });
});

test.describe('T7-08 y T7-09 logout efectivo', () => {
  test('el logout elimina la sesion y la cookie previa ya no autoriza', async ({
    browser,
    baseURL,
  }) => {
    const base = baseOf(baseURL);
    const origin = new URL(base).origin;
    // Usuario y sesion dedicados: un logout global no debe afectar a otras pruebas.
    const user = await world.createUser('logout', { org: world.orgA, role: 'member' });
    const context = await browser.newContext({ baseURL: base });
    try {
      const page = await context.newPage();
      await uiLogin(page, user);
      await page.waitForURL(isDashboard(origin), { timeout: 20_000 });
      await expect(page.getByTestId('org-name')).toHaveText(world.orgA.name);

      // Ninguna ruta GET cierra la sesion (el logout es una accion POST).
      for (const path of [
        '/logout',
        '/auth/logout',
        '/signout',
        '/auth/signout',
        '/api/auth/logout',
      ]) {
        const response = await context.request.get(path, { maxRedirects: 0 });
        expect(response.status(), path).toBeLessThan(500);
      }
      const still = await context.request.get('/dashboard', { maxRedirects: 0 });
      expect(still.status(), 'un GET cerro la sesion').toBe(200);

      const before = await context.cookies();
      expect(authCookies(before).length).toBeGreaterThan(0);

      await page.getByRole('button', { name: LOGOUT_NAME }).click();
      await page.waitForURL(/\/login(\?|$)/, { timeout: 20_000 });

      // La cookie de sesion se elimina del navegador.
      const after = authCookies(await context.cookies()).filter((cookie) => cookie.value !== '');
      expect(after, 'quedan cookies de sesion tras el logout').toHaveLength(0);

      // Sin sesion, /dashboard vuelve al login; y "atras" no muestra datos.
      const response = await context.request.get('/dashboard', { maxRedirects: 0 });
      expectRedirectToLogin(response, base, 'tras logout');
      await page.goBack();
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('org-name')).toHaveCount(0);

      // T7-09: copiar la cookie anterior al logout a otro navegador no autoriza (la sesion se
      // invalida en el servidor de Auth). Requiere verificar la sesion con Auth (p. ej. getUser()).
      const replay = await contextWithCookies(browser, base, before);
      try {
        const replayed = await replay.request.get('/dashboard', { maxRedirects: 0 });
        expectRedirectToLogin(replayed, base, 'replay de cookie previa al logout');
        expect(await replayed.text()).not.toContain(world.orgA.name);
        const replayPage = await replay.newPage();
        await replayPage.goto('/dashboard');
        await expect(replayPage).toHaveURL(/\/login(\?|$)/);
        await expect(replayPage.getByTestId('org-name')).toHaveCount(0);
      } finally {
        await replay.close();
      }
    } finally {
      await context.close();
    }
  });

  test('el boton de logout tambien esta disponible y funciona en el estado de acceso denegado', async ({
    browser,
    baseURL,
  }) => {
    const base = baseOf(baseURL);
    const user = await world.createUser('outsider-logout', null);
    const context = await browser.newContext({ baseURL: base });
    try {
      const page = await context.newPage();
      await uiLogin(page, user);
      await page.waitForURL(isDashboard(new URL(base).origin), { timeout: 20_000 });
      await expect(page.getByTestId('access-denied')).toBeVisible();
      await page.getByRole('button', { name: LOGOUT_NAME }).click();
      await page.waitForURL(/\/login(\?|$)/, { timeout: 20_000 });
      expect(authCookies(await context.cookies()).filter((c) => c.value !== '')).toHaveLength(0);
    } finally {
      await context.close();
    }
  });
});
