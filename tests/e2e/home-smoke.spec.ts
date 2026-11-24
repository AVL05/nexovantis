import { expect, test } from '@playwright/test';

test.describe('Página inicial (humo)', () => {
  test('muestra la descripción del producto y el estado de fundación técnica', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('main')).toContainText('servicios técnicos');
    await expect(page.getByText('fundación técnica')).toBeVisible();
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
