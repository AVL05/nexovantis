import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

import {
  ROLE_PATTERN,
  authCookies,
  authedContext,
  baseOf,
  cachedLoginCookies,
  contextWithCookies,
  encodeSessionCookies,
  expectNotSharedCacheable,
  expectRedirectToLogin,
  getWorld,
  loginCookies,
  readSession,
  sessionToValue,
  setCookieLines,
  withBadSignature,
  withForeignSub,
  type PwCookie,
  type World,
} from './support/world';

// Pruebas independientes de Testing (TASK-007) con Auth real. Develop no las modifica.
// Criterios: T7-03, T7-04, T7-05, T7-11, T7-12, T7-13 (bundle). Job `supabase` de CI.
//
// Contrato de UI (ver docs/reviews/claude/TASK-007-PRE.md): /dashboard muestra
// [data-testid="org-name"] y [data-testid="user-role"]; sin membresia muestra
// [data-testid="access-denied"] y un boton de cerrar sesion.

let world: World;
test.beforeAll(async () => {
  world = await getWorld();
});

function expectNone(body: string, needles: string[], what: string) {
  for (const needle of needles) {
    expect(body.includes(needle), `${what}: aparece un dato que no corresponde`).toBe(false);
  }
}

test.describe('T7-03 cookies manipuladas no autorizan', () => {
  async function forged(
    browser: Browser,
    base: string,
    mutate: (session: ReturnType<typeof readSession>) => PwCookie[],
  ) {
    const cookies = await cachedLoginCookies(browser, base, world.ownerA);
    const original = readSession(cookies);
    return contextWithCookies(browser, base, mutate(original));
  }

  const variants: Record<string, (world: World, s: ReturnType<typeof readSession>) => PwCookie[]> =
    {
      'firma del JWT alterada': (_w, s) =>
        encodeSessionCookies(
          s.baseName,
          sessionToValue({
            ...s.session,
            access_token: withBadSignature(s.session.access_token as string),
            refresh_token: 'invalid-refresh-token',
          }),
          s.template,
        ),
      'payload con sub de otro usuario sin re-firmar': (w, s) =>
        encodeSessionCookies(
          s.baseName,
          sessionToValue({
            ...s.session,
            access_token: withForeignSub(s.session.access_token as string, w.ownerB.id),
            refresh_token: 'invalid-refresh-token',
          }),
          s.template,
        ),
      'tokens vacios': (_w, s) =>
        encodeSessionCookies(
          s.baseName,
          sessionToValue({ ...s.session, access_token: '', refresh_token: '' }),
          s.template,
        ),
      'valor basura (no es JSON)': (_w, s) =>
        encodeSessionCookies(s.baseName, 'base64-%%%no-es-json%%%', s.template),
      'valor truncado a la mitad': (_w, s) => {
        const value = sessionToValue(s.session);
        return encodeSessionCookies(
          s.baseName,
          value.slice(0, Math.floor(value.length / 2)),
          s.template,
        );
      },
    };

  for (const [name, mutate] of Object.entries(variants)) {
    test(`${name}: redirige a /login sin 5xx ni datos`, async ({ browser, baseURL }) => {
      const base = baseOf(baseURL);
      const context = await forged(browser, base, (s) => mutate(world, s));
      try {
        const response = await context.request.get('/dashboard', { maxRedirects: 0 });
        expect(response.status(), 'no debe fallar con 5xx').toBeLessThan(500);
        expectRedirectToLogin(response, base, name);
        expectNone(
          await response.text(),
          [world.orgA.name, world.orgB.name, 'data-testid="org-name"'],
          name,
        );
        // La pagina de login es utilizable (no queda un bucle de redirecciones).
        const page = await context.newPage();
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/login(\?|$)/);
        await expect(page.locator('input[name="email"]')).toBeVisible();
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('T7-04 aislamiento entre organizaciones en el area protegida', () => {
  test('cada usuario ve solo su organizacion y su rol', async ({ browser, baseURL }) => {
    const base = baseOf(baseURL);
    const cases = [
      { user: world.ownerA, own: world.orgA, other: world.orgB, role: 'owner' as const },
      { user: world.memberA, own: world.orgA, other: world.orgB, role: 'member' as const },
      { user: world.ownerB, own: world.orgB, other: world.orgA, role: 'owner' as const },
    ];
    for (const { user, own, other, role } of cases) {
      const context = await authedContext(browser, base, user);
      try {
        const page = await context.newPage();
        const response = await page.goto('/dashboard');
        expect(response!.status()).toBe(200);
        await expect(page.getByTestId('org-name')).toHaveText(own.name);
        await expect(page.getByTestId('user-role')).toHaveText(ROLE_PATTERN[role]);
        const otherRole = role === 'owner' ? 'member' : 'owner';
        await expect(page.getByTestId('user-role')).not.toHaveText(ROLE_PATTERN[otherRole]);
        await expect(page.getByTestId('access-denied')).toHaveCount(0);

        const html = await page.content();
        expectNone(html, [other.name, other.id], `${role} de ${own.name}: HTML`);

        const rsc = await context.request.get('/dashboard', {
          headers: { RSC: '1', 'Next-Url': '/dashboard' },
        });
        expect(rsc.status()).toBeLessThan(500);
        expectNone(await rsc.text(), [other.name, other.id], `${role} de ${own.name}: RSC`);
      } finally {
        await context.close();
      }
    }
  });

  test('parametros, cabeceras y cookies de organizacion/rol inyectados se ignoran', async ({
    browser,
    baseURL,
  }) => {
    const base = baseOf(baseURL);
    const context = await authedContext(browser, base, world.memberA);
    try {
      await context.addCookies([
        { name: 'organization_id', value: world.orgB.id, url: base },
        { name: 'role', value: 'owner', url: base },
      ]);
      const query = `organization_id=${world.orgB.id}&org=${world.orgB.id}&orgId=${world.orgB.id}&role=owner`;
      const response = await context.request.get(`/dashboard?${query}`, {
        headers: { 'x-organization-id': world.orgB.id, 'x-user-role': 'owner' },
      });
      expect(response.status()).toBe(200);
      const body = await response.text();
      expectNone(body, [world.orgB.name], 'inyeccion de organizacion');
      expect(body).toContain(world.orgA.name);

      const page = await context.newPage();
      await page.goto(`/dashboard?${query}`);
      await expect(page.getByTestId('org-name')).toHaveText(world.orgA.name);
      await expect(page.getByTestId('user-role')).toHaveText(ROLE_PATTERN.member);
    } finally {
      await context.close();
    }
  });
});

test.describe('T7-05 usuario autenticado sin membresia', () => {
  test('ve acceso denegado sin datos y puede cerrar sesion', async ({ browser, baseURL }) => {
    const base = baseOf(baseURL);
    const context = await authedContext(browser, base, world.outsider);
    try {
      const page = await context.newPage();
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push(error.message));
      const response = await page.goto('/dashboard');
      expect(response!.status(), 'sin 5xx').toBeLessThan(500);
      await expect(page.getByTestId('access-denied')).toBeVisible();
      await expect(page.getByTestId('org-name')).toHaveCount(0);
      await expect(page.getByTestId('user-role')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /cerrar sesi|salir|sign out|log ?out/i }),
      ).toBeVisible();
      expectNone(
        await page.content(),
        [world.orgA.name, world.orgB.name, world.orgA.id, world.orgB.id],
        'sin membresia',
      );
      expect(problems).toEqual([]);

      const rsc = await context.request.get('/dashboard', { headers: { RSC: '1' } });
      expectNone(
        await rsc.text(),
        [world.orgA.name, world.orgB.name, world.orgA.id, world.orgB.id],
        'sin membresia: RSC',
      );
    } finally {
      await context.close();
    }
  });
});

test.describe('T7-11 cabeceras de cache y cookies de sesion', () => {
  test('/dashboard autenticado no es cacheable de forma compartida', async ({
    browser,
    baseURL,
  }) => {
    const base = baseOf(baseURL);
    for (const user of [world.ownerA, world.outsider]) {
      const context = await authedContext(browser, base, user);
      try {
        const response = await context.request.get('/dashboard', { maxRedirects: 0 });
        expect(response.status()).toBe(200);
        expectNotSharedCacheable(response, '/dashboard autenticado', { required: true });
        const rsc = await context.request.get('/dashboard', { headers: { RSC: '1' } });
        expectNotSharedCacheable(rsc, '/dashboard RSC autenticado', { required: true });
      } finally {
        await context.close();
      }
    }
  });

  test('un usuario con sesion en /login recibe una redireccion no cacheable a /dashboard', async ({
    browser,
    baseURL,
  }) => {
    const base = baseOf(baseURL);
    const context = await authedContext(browser, base, world.ownerA);
    try {
      const response = await context.request.get('/login', { maxRedirects: 0 });
      expect([301, 302, 303, 307, 308]).toContain(response.status());
      expect(new URL(response.headers()['location'], base).pathname).toBe('/dashboard');
      expectNotSharedCacheable(response, '/login con sesion', { required: false });
      expect(response.status(), 'redireccion permanente cacheable').not.toBe(301);
      expect(response.status(), 'redireccion permanente cacheable').not.toBe(308);
    } finally {
      await context.close();
    }
  });

  test('las cookies de sesion son de ruta / y no SameSite=None', async ({ browser, baseURL }) => {
    const cookies = authCookies(await cachedLoginCookies(browser, baseOf(baseURL), world.ownerA));
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie.path).toBe('/');
      expect(cookie.sameSite).not.toBe('None');
      expect(cookie.value).not.toBe('');
    }
  });
});

test.describe('T7-12 refresco de sesion en el proxy (POST-07)', () => {
  test('una sesion caducada se refresca con Set-Cookie y Cache-Control no compartido', async ({
    browser,
    baseURL,
  }) => {
    const base = baseOf(baseURL);
    // Sesion dedicada: el refresco rota el refresh token y no debe afectar a otras pruebas.
    const user = await world.createUser('refresh', { org: world.orgA, role: 'member' });
    const fresh = await loginCookies(browser, base, user);
    const { baseName, session, template } = readSession(fresh);
    const stale = encodeSessionCookies(
      baseName,
      sessionToValue({ ...session, expires_at: Math.floor(Date.now() / 1000) - 120 }),
      template,
    );

    const dashboardContext = await contextWithCookies(browser, base, stale);
    const loginContext = await contextWithCookies(browser, base, stale);
    try {
      const dashboard = await dashboardContext.request.get('/dashboard', { maxRedirects: 0 });
      expect(dashboard.status(), 'la sesion refrescada sigue autorizada').toBe(200);
      expect(await dashboard.text()).toContain(world.orgA.name);
      const refreshed = setCookieLines(dashboard).filter((line) =>
        /^sb-[^=]+-auth-token/.test(line),
      );
      expect(
        refreshed.length,
        'el proxy debe reenviar la cookie de sesion refrescada',
      ).toBeGreaterThan(0);
      expectNotSharedCacheable(dashboard, 'refresco en /dashboard', { required: true });

      const login = await loginContext.request.get('/login', { maxRedirects: 0 });
      expect([302, 303, 307]).toContain(login.status());
      expectNotSharedCacheable(login, 'refresco en /login', { required: false });
      if (setCookieLines(login).some((line) => /^sb-[^=]+-auth-token/.test(line))) {
        expectNotSharedCacheable(login, 'refresco en /login con Set-Cookie', { required: true });
      }
    } finally {
      await dashboardContext.close();
      await loginContext.close();
    }
  });
});

test.describe('T7-13 sin secretos en el codigo de cliente', () => {
  async function collectClientCode(request: APIRequestContext, html: string): Promise<string> {
    const urls = new Set<string>();
    for (const match of html.matchAll(/(?:src|href)="([^"]+\.js[^"?]*)(?:\?[^"]*)?"/g)) {
      urls.add(match[1]);
    }
    for (const match of html.matchAll(/static\/chunks\/[\w\-./~%[\]()]+?\.js/g)) {
      urls.add(`/_next/${match[0]}`);
    }
    let code = html;
    for (const url of [...urls].slice(0, 120)) {
      const response = await request.get(url);
      if (response.ok()) code += `\n${await response.text()}`;
    }
    return code;
  }

  test('ni el HTML ni los chunks JS contienen la clave de servicio ni JWT con rol service_role', async ({
    browser,
    request,
    baseURL,
  }) => {
    const base = baseOf(baseURL);
    const context = await authedContext(browser, base, world.ownerA);
    try {
      const anonymousPages = await Promise.all(
        ['/login', '/'].map(async (path) => (await request.get(path)).text()),
      );
      const authedPage = await (await context.request.get('/dashboard')).text();
      let code = '';
      for (const html of [...anonymousPages, authedPage]) {
        code += `\n${await collectClientCode(request, html)}`;
      }
      expect(code.length, 'no se descargo codigo de cliente').toBeGreaterThan(1000);
      expect(code.includes(world.serviceKey), 'la clave de servicio esta en el cliente').toBe(
        false,
      );
      expect(code.includes('sb_secret_'), 'clave secreta de Supabase en el cliente').toBe(false);
      expect(code.includes('SUPABASE_SERVICE_ROLE_KEY'), 'nombre de la variable de servicio').toBe(
        false,
      );
      for (const token of code.matchAll(/eyJ[\w-]{10,}\.([\w-]{10,})\.[\w-]{10,}/g)) {
        let role: unknown;
        try {
          role = (
            JSON.parse(Buffer.from(token[1], 'base64url').toString('utf8')) as { role?: unknown }
          ).role;
        } catch {
          continue;
        }
        expect(role, 'JWT con rol service_role en el cliente').not.toBe('service_role');
      }
    } finally {
      await context.close();
    }
  });
});
