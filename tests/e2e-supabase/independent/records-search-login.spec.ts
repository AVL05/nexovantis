import { expect, test } from '@playwright/test';

import { authedContext, baseOf, getWorld, uiLogin, type World } from './support/world';

// Pruebas independientes de Testing (TASK-008B, S-02 y S-08) con Auth real. Job `supabase` de CI.
// No se han podido ejecutar en local (sin Docker): validacion efectiva pendiente de CI.

let world: World;
test.beforeAll(async () => {
  world = await getWorld();
});

test('S-02 busqueda: %, _ y \ son literales y los terminos hostiles no amplian el filtro', async ({
  browser,
}, testInfo) => {
  const context = await authedContext(browser, baseOf(testInfo.project.use.baseURL), world.ownerA);
  try {
    const page = await context.newPage();
    const tag = world.run.replace(/[^a-z0-9]/gi, '');
    const names = [`Lit%eral ${tag}`, `Under_score ${tag}`, `Normal ${tag}`];
    for (const name of names) {
      await page.goto('/customers/new');
      await page.getByLabel('Nombre', { exact: true }).fill(name);
      await page.getByRole('button', { name: 'Crear cliente' }).click();
      await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}\?aviso=creado$/);
    }
    const rows = (term: string) =>
      page.goto(`/customers?q=${encodeURIComponent(term)}&estado=todos`).then(async (res) => {
        expect(res?.status(), term).toBeLessThan(500);
        await expect(page.getByRole('heading', { level: 1, name: 'Clientes' })).toBeVisible();
        return page.getByRole('table').getByRole('link');
      });

    // Un comodin literal solo coincide con el nombre que lo contiene.
    await expect(await rows('%')).toHaveText([names[0]]);
    await expect(await rows('_')).toHaveText([names[1]]);
    await expect(await rows(`Lit%eral ${tag}`)).toHaveText([names[0]]);
    // Terminos hostiles: sin coincidencias y sin error de servidor.
    for (const term of [
      String.fromCharCode(92),
      '"',
      '(',
      ')',
      ',',
      'x"),organization_id.neq.0,(a',
      'a,email.ilike.%',
      '.or=(id.not.is.null)',
      "'; drop table customers; --",
    ]) {
      const links = await rows(term);
      const count = await links.count();
      expect(count, `termino hostil ${JSON.stringify(term)}`).toBeLessThanOrEqual(0);
    }
  } finally {
    await context.close();
  }
});

test('S-08 login: el boton mostrar/ocultar no envia el formulario y no pierde el valor', async ({
  page,
}) => {
  await page.goto('/login');
  const input = page.locator('input[name="password"]');
  await input.fill('valor-de-prueba');
  const toggle = page.getByRole('button', { name: /mostrar/i });
  await expect(toggle).toHaveAttribute('type', 'button');
  await expect(input).toHaveAttribute('type', 'password');
  await toggle.click();
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(input).toHaveAttribute('type', 'text');
  await expect(input).toHaveValue('valor-de-prueba');
  await expect(input).toHaveAttribute('autocomplete', 'current-password');
  await expect(page.getByRole('button', { name: /ocultar/i })).toBeVisible();
  await page.getByRole('button', { name: /ocultar/i }).click();
  await expect(input).toHaveAttribute('type', 'password');
});

test('S-08 login real tras mostrar la contrasena sigue llegando al panel', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /mostrar/i }).click();
  await uiLogin(page, world.memberA);
  await expect(page).toHaveURL(/\/dashboard$/);
});
