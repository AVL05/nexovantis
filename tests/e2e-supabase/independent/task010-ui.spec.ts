import { expect, test } from '@playwright/test';

import {
  LOGOUT_NAME,
  SUBMIT_NAME,
  authedContext,
  baseOf,
  getWorld,
  isDashboard,
  uiLogin,
  type World,
} from './support/world';

// Pruebas independientes de Testing (TASK-010 PRE) con Auth real. Job `supabase` de CI.
// NO se han podido ejecutar en local (sin Docker/Supabase): validacion efectiva pendiente de CI.
//   A02-01  aviso de cierre de sesion no confirmado en /login (contrato de UI) y logout correcto sin aviso.
//   A02-06  formulario de edicion abierto antes del archivado: el envio posterior se rechaza.
//   A02-07  destino codificado (%20, %25) conservado a traves de proxy -> login -> destino.
//
// Contrato de UI de /login: aviso con data-testid="logout-notice", role status|alert y texto que
// indica que NO se pudo confirmar el cierre en el servidor y que la sesion se cerro en este
// navegador (ver tests/unit/independent/login-logout-notice.test.tsx).

let world: World;
test.beforeAll(async () => {
  world = await getWorld();
});

test.describe('A02-01 aviso de cierre de sesion', () => {
  test('un logout confirmado aterriza en /login sin aviso y sin cookies de sesion', async ({
    browser,
    baseURL,
  }) => {
    const base = baseOf(baseURL);
    const user = await world.createUser('t10-logout', { org: world.orgA, role: 'member' });
    const context = await browser.newContext({ baseURL: base });
    try {
      const page = await context.newPage();
      await uiLogin(page, user);
      await page.waitForURL(isDashboard(new URL(base).origin), { timeout: 20_000 });
      await page.getByRole('button', { name: LOGOUT_NAME }).click();
      await page.waitForURL(/\/login(\?|$)/, { timeout: 20_000 });
      const url = new URL(page.url());
      expect(url.pathname).toBe('/login');
      expect(url.searchParams.has('aviso'), 'un cierre confirmado no debe llevar aviso').toBe(
        false,
      );
      await expect(page.getByTestId('logout-notice')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('/login?aviso=cierre-no-confirmado muestra un aviso que no afirma un cierre remoto', async ({
    page,
  }) => {
    await page.goto('/login?aviso=cierre-no-confirmado');
    const notice = page.getByTestId('logout-notice');
    await expect(notice).toBeVisible();
    const role = await notice.getAttribute('role');
    expect(['status', 'alert']).toContain(role);
    const text = ((await notice.textContent()) ?? '').replace(/\s+/g, ' ');
    expect(text).toMatch(/no se pudo confirmar/i);
    expect(text).toMatch(/(este|en este) (navegador|dispositivo|equipo)/i);
    expect(text).not.toMatch(/cerrada? correctamente|(en|de) todos los dispositivos/i);
    await expect(page.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible();
  });

  test('un valor de aviso desconocido no muestra nada ni se refleja en la pagina', async ({
    page,
  }) => {
    await page.goto('/login?aviso=%3Cb%3Eotra-cosa%3C%2Fb%3E');
    await expect(page.getByTestId('logout-notice')).toHaveCount(0);
    expect(await page.content()).not.toContain('otra-cosa');
  });
});

test.describe('A02-06 formulario de edicion obsoleto tras archivar', () => {
  test('guardar en un formulario abierto antes del archivado se rechaza y el registro no cambia', async ({
    browser,
    baseURL,
  }) => {
    const base = baseOf(baseURL);
    const context = await authedContext(browser, base, world.ownerA);
    try {
      const creator = await context.newPage();
      const name = `Obsoleto ${world.run}`;
      await creator.goto('/customers/new');
      await creator.getByLabel('Nombre', { exact: true }).fill(name);
      await creator.getByRole('button', { name: 'Crear cliente' }).click();
      await expect(creator).toHaveURL(/\/customers\/[0-9a-f-]{36}\?aviso=creado$/);
      const id = creator.url().split('/').pop()!.split('?')[0];

      // Pestana 1: abre el formulario de edicion (aun activo) y lo deja sin enviar.
      const stale = await context.newPage();
      await stale.goto(`/customers/${id}/edit`);
      await stale.getByLabel('Nombre', { exact: true }).fill(`${name} EDITADO`);

      // Pestana 2: archiva el cliente.
      await creator.goto(`/customers/${id}`);
      await creator.getByRole('button', { name: 'Archivar cliente' }).click();
      await creator
        .getByRole('dialog')
        .getByRole('button', { name: 'Archivar', exact: true })
        .click();
      await expect(
        creator.getByRole('status').filter({ hasText: 'Cliente archivado.' }),
      ).toBeVisible();

      // Pestana 1: el envio se rechaza con un mensaje y sin guardar nada.
      await stale.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(stale.getByTestId('form-error')).toBeVisible();
      await expect(stale.getByTestId('form-error')).toContainText(
        /archivado|no es posible|no se pudo/i,
      );
      await creator.goto(`/customers/${id}`);
      await expect(creator.getByRole('heading', { level: 1, name })).toBeVisible();
      await expect(creator.getByText(`${name} EDITADO`)).toHaveCount(0);
      await expect(creator.getByText('Registro archivado', { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe('A02-07 el destino con parametros codificados sobrevive al login', () => {
  for (const [label, path, expectedQ] of [
    ['espacios y acentos', '/customers?q=Mar%C3%ADa%20L%C3%B3pez', 'María López'],
    ['porcentaje', '/customers?q=100%25', '100%'],
  ] as const) {
    test(`${label}: proxy -> /login?next -> destino conservado`, async ({ browser, baseURL }) => {
      const base = baseOf(baseURL);
      const user = await world.createUser('t10-next', { org: world.orgA, role: 'member' });
      const context = await browser.newContext({ baseURL: base });
      try {
        const page = await context.newPage();
        // Sin sesion: el proxy redirige a /login conservando el destino completo.
        await page.goto(path);
        await expect(page).toHaveURL(/\/login\?/);
        expect(
          new URL(page.url()).searchParams.get('next'),
          'el proxy debe conservar el destino',
        ).toBe(path);

        await page.locator('input[name="email"]').fill(user.email);
        await page.locator('input[name="password"]').fill(user.password);
        await page.getByRole('button', { name: SUBMIT_NAME }).click();
        await page.waitForURL((url) => url.pathname === '/customers', { timeout: 20_000 });
        expect(new URL(page.url()).searchParams.get('q')).toBe(expectedQ);
        await expect(page.getByLabel('Buscar clientes por nombre, correo o teléfono')).toHaveValue(
          expectedQ,
        );
      } finally {
        await context.close();
      }
    });
  }

  test('un destino hostil codificado sigue acabando en /dashboard', async ({
    browser,
    baseURL,
  }) => {
    const base = baseOf(baseURL);
    const user = await world.createUser('t10-next-evil', { org: world.orgA, role: 'member' });
    const context = await browser.newContext({ baseURL: base });
    try {
      const page = await context.newPage();
      await uiLogin(page, user, '/%2F%2Fevil.example/customers?q=a%20b');
      await page.waitForURL(isDashboard(new URL(base).origin), { timeout: 20_000 });
    } finally {
      await context.close();
    }
  });
});
