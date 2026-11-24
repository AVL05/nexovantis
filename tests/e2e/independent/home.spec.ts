import { expect, test } from '@playwright/test';

// Prueba independiente de Testing (TASK-004). Develop no la modifica.
// Requiere baseURL y webServer definidos en playwright.config.ts.

test.describe('Página inicial', () => {
  test('responde 200 con idioma, título y un único h1', async ({ page }) => {
    const response = await page.goto('/');
    expect(response, 'sin respuesta de /').not.toBeNull();
    expect(response!.status()).toBe(200);

    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page).toHaveTitle(/Nexovantis/i);

    const headings = page.getByRole('heading', { level: 1 });
    await expect(headings).toHaveCount(1);
    await expect(headings).toContainText('Nexovantis');
  });

  test('no emite errores de consola ni excepciones de página', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(problems).toEqual([]);
  });

  for (const width of [320, 390, 768, 1280]) {
    test(`sin desbordamiento horizontal a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }

  test('una ruta inexistente devuelve 404', async ({ page }) => {
    const response = await page.goto('/ruta-que-no-existe-f2');
    expect(response, 'sin respuesta de la ruta inexistente').not.toBeNull();
    expect(response!.status()).toBe(404);
  });
});
