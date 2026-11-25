import { expect, test } from '@playwright/test';

import {
  baseOf,
  expectNotSharedCacheable,
  expectRedirectToLogin,
  getWorld,
  setCookieLines,
  type World,
} from './support/world';

// Pruebas independientes de Testing (TASK-007), sin sesion. Develop no las modifica.
// Criterios: T7-01, T7-02, T7-15, T7-16, T7-17 (parte publica). Requieren Auth real (job `supabase`).

let world: World;
test.beforeAll(async () => {
  world = await getWorld();
});

const ORG_MARKERS = ['data-testid="org-name"', 'data-testid="user-role"'];

function expectNoPrivateData(body: string, what: string) {
  for (const marker of [
    world.orgA.name,
    world.orgB.name,
    world.orgA.id,
    world.orgB.id,
    ...ORG_MARKERS,
  ]) {
    expect(body.includes(marker), `${what}: la respuesta contiene datos de organizacion`).toBe(
      false,
    );
  }
}

test.describe('T7-01 acceso sin sesion a rutas protegidas', () => {
  test('/dashboard redirige a /login sin entregar datos (y variantes de ruta)', async ({
    request,
    baseURL,
  }) => {
    const base = baseOf(baseURL);
    for (const path of ['/dashboard', '/dashboard?x=1']) {
      const response = await request.get(path, { maxRedirects: 0 });
      expectRedirectToLogin(response, base, path);
      expectNoPrivateData(await response.text(), path);
      expectNotSharedCacheable(response, path, { required: false });
    }
    // Variantes de ruta: el proxy o la propia pagina deben negar el acceso (3xx a /login, o 200 con
    // redireccion de servidor), nunca entregar datos ni fallar con 5xx.
    for (const path of ['/dashboard/', '/%64ashboard', '/dashboard//']) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBeLessThan(500);
      expectNoPrivateData(await response.text(), path);
    }
  });

  test('peticion RSC sin sesion tampoco entrega datos', async ({ request }) => {
    const response = await request.get('/dashboard', {
      maxRedirects: 0,
      headers: { RSC: '1', 'Next-Url': '/dashboard' },
    });
    expect(response.status()).toBeLessThan(500);
    expectNoPrivateData(await response.text(), 'RSC /dashboard');
  });

  test('en el navegador acaba en /login y el login es visible', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    const next = new URL(page.url()).searchParams.get('next');
    expect(next === null || next === '/dashboard', 'next debe ser interno').toBe(true);
  });
});

test.describe('T7-02 la autorizacion no depende solo del proxy', () => {
  // Si el proxy se omite (p. ej. CVE-2025-29927, `x-middleware-subrequest`), la propia pagina debe
  // negar el acceso: ni datos de organizacion ni un 5xx.
  const bypassHeaders = [
    'middleware',
    'src/middleware',
    'proxy',
    'src/proxy',
    'middleware:middleware:middleware:middleware:middleware',
    'src/proxy:src/proxy:src/proxy:src/proxy:src/proxy',
  ];
  for (const value of bypassHeaders) {
    test(`x-middleware-subrequest: ${value}`, async ({ request }) => {
      const response = await request.get('/dashboard', {
        maxRedirects: 0,
        headers: { 'x-middleware-subrequest': value },
      });
      expect(response.status(), 'no debe fallar con 5xx').toBeLessThan(500);
      expect(response.status(), 'sin sesion no puede haber 200 con datos').not.toBe(204);
      expectNoPrivateData(await response.text(), `bypass ${value}`);
    });
  }

  test('cabeceras de identidad inyectadas por el cliente se ignoran', async ({ request }) => {
    const response = await request.get('/dashboard', {
      maxRedirects: 0,
      headers: {
        'x-user-id': world.ownerA.id,
        'x-organization-id': world.orgA.id,
        'x-supabase-user': world.ownerA.id,
        Authorization: `Bearer ${'x'.repeat(40)}`,
      },
    });
    expect(response.status()).toBeLessThan(500);
    expectNoPrivateData(await response.text(), 'cabeceras inyectadas');
  });
});

test.describe('T7-15 sin registro publico', () => {
  for (const path of [
    '/signup',
    '/sign-up',
    '/register',
    '/registro',
    '/registrarse',
    '/auth/signup',
  ]) {
    test(`${path} no ofrece registro`, async ({ request, baseURL }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      if (response.status() >= 300 && response.status() < 400) {
        expectRedirectToLogin(response, baseOf(baseURL), path);
      } else {
        expect(response.status()).toBe(404);
      }
    });
  }

  test('/login no enlaza a un registro', async ({ page }) => {
    await page.goto('/login');
    await expect(
      page.getByRole('link', { name: /registr|crear cuenta|sign ?up|create account/i }),
    ).toHaveCount(0);
  });
});

test.describe('T7-16 accesibilidad de /login', () => {
  test('etiquetas, un unico h1, tipos y autocompletado', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response!.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    const email = page.locator('input[name="email"]');
    const password = page.locator('input[name="password"]');
    await expect(email).toHaveAttribute('type', /^(email|text)$/);
    await expect(email).toHaveAttribute('autocomplete', /^(username|email)/);
    await expect(password).toHaveAttribute('type', 'password');
    await expect(password).toHaveAttribute('autocomplete', 'current-password');
    // Cada campo tiene un nombre accesible (label asociado), no solo placeholder.
    await expect(page.getByLabel(/correo|email/i).and(page.locator('input'))).toHaveCount(1);
    await expect(page.getByLabel(/contrase/i).and(page.locator('input'))).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: /iniciar sesi|entrar|acceder|sign in|log ?in/i }),
    ).toHaveCount(1);
  });

  test('el orden de tabulacion lleva del correo a la contrasena', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[name="email"]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('input[name="password"]')).toBeFocused();
  });
});

test.describe('T7-17 regresion de paginas publicas con el proxy activo', () => {
  test('/ responde 200 sin redireccion y una ruta inexistente 404', async ({ request }) => {
    const home = await request.get('/', { maxRedirects: 0 });
    expect(home.status()).toBe(200);
    const missing = await request.get('/ruta-que-no-existe-t7', { maxRedirects: 0 });
    expect(missing.status()).toBe(404);
  });

  test('/login sin sesion responde 200; si emite cookies, no es cacheable de forma compartida', async ({
    request,
  }) => {
    const response = await request.get('/login', { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    if (setCookieLines(response).length > 0) {
      expectNotSharedCacheable(response, '/login', { required: true });
    }
  });
});
