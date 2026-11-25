import { expect, test } from '@playwright/test';

// Prueba independiente de Testing (TASK-008A). Develop no la modifica.
// /login sin sesion no requiere Supabase para renderizar el formulario.
for (const width of [375, 768, 1280]) {
  test(`/login a ${width}px: sin desbordamiento, un h1, labels y foco visible`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/login');
    const { sw, cw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(sw).toBeLessThanOrEqual(cw);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByLabel(/correo|email/i)).toHaveCount(1);
    await expect(page.getByLabel(/contrase/i)).toHaveCount(1);
    await expect(page.getByRole('button', { name: /iniciar sesi/i })).toHaveCount(1);
    await expect(page.getByTestId('form-error')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /registr|crear cuenta|sign ?up/i })).toHaveCount(0);

    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/correo|email/i)).toBeFocused();
    await page.waitForTimeout(400);
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });
}
