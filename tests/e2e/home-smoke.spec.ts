import { expect, test } from '@playwright/test';

test.describe('Página inicial (humo)', () => {
  test('muestra la descripción y las funcionalidades, sin textos provisionales', async ({
    page,
  }) => {
    await page.goto('/');

    const main = page.getByRole('main');
    await expect(main).toContainText('servicios técnicos');

    const features = main.getByRole('list', { name: 'Funcionalidades' }).getByRole('listitem');
    await expect(features).toHaveText([
      /^Clientes y técnicos:/,
      /^Órdenes de servicio:/,
      /^Presupuestos /,
      /^Inventario:/,
      /^Panel .*registro de actividad/,
    ]);
    for (const feature of await features.all()) {
      await expect(feature).toBeVisible();
    }

    await expect(main).not.toContainText(
      /fundación|estado:|provisional|próximamente|en construcción/i,
    );
    await expect(page.getByRole('button')).toHaveCount(0);
    const login = main.getByRole('link', { name: 'Iniciar sesión' });
    await expect(login).toHaveAttribute('href', '/login');
    await login.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('carga la marca de portada y sirve el icono declarado', async ({ page, request }) => {
    await page.goto('/');

    const brand = page.getByRole('banner').locator('img');
    await expect(brand).toBeVisible();
    await expect(brand).toHaveJSProperty('naturalWidth', 256);

    const href = await page.locator('link[rel="icon"]').first().getAttribute('href');
    expect(href).not.toBeNull();

    const response = await request.get(href!);
    expect(response.status()).toBe(200);
  });
});
