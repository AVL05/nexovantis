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
    await expect(page.getByRole('link')).toHaveCount(0);
  });

  test('sirve el icono declarado sin error', async ({ page, request }) => {
    await page.goto('/');

    const href = await page.locator('link[rel="icon"]').first().getAttribute('href');
    expect(href).not.toBeNull();

    const response = await request.get(href!);
    expect(response.status()).toBe(200);
  });
});
