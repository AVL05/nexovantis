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

  // TASK-010B / B-04 (cambio justificado): la version anterior comprobaba `page.content()`, el HTML
  // SERIALIZADO. Next.js incluye la consulta codificada en sus datos de navegacion (scripts
  // `self.__next_f`), de modo que la cadena aparece ahi sin que el usuario la vea ni se renderice
  // como elemento (falso positivo reproducido por Codex en CI 45579875538; el log no acredita
  // contenido inyectado). El objetivo de seguridad NO se relaja: sigue exigiendose que ningun aviso
  // ni texto del parametro se muestre ni se refleje, pero ahora sobre lo RENDERIZADO: texto visible
  // (innerText), elementos del DOM (nodos de texto y atributos, sin scripts ni estilos) y avisos.
  test('un valor de aviso desconocido no muestra nada ni se refleja en la pagina', async ({
    page,
  }) => {
    const needle = 'otra-cosa';
    await page.goto(`/login?aviso=${encodeURIComponent(`<b>${needle}</b>`)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible();

    // Ningun aviso previsto ni imprevisto: ni por testid ni por role alert|status con texto.
    await expect(page.getByTestId('logout-notice')).toHaveCount(0);
    await expect(page.getByTestId('logout-failed-notice')).toHaveCount(0);
    await expect(page.getByTestId('logout-retry')).toHaveCount(0);
    await expect(
      page.locator('[role="alert"], [role="status"]').filter({ hasText: /\S/ }),
      'no debe renderizarse ningun aviso con texto',
    ).toHaveCount(0);

    // Texto visible: ni el valor del parametro ni el texto de los avisos conocidos.
    const visible = await page.evaluate(() => document.body.innerText);
    expect(visible).not.toContain(needle);
    expect(visible).not.toContain('<b>');
    expect(visible).not.toMatch(/no se pudo confirmar|se cerr[oó] en este navegador/i);
    // Elemento inyectado: la etiqueta <b> del valor no existe como elemento renderizado.
    await expect(page.locator('b', { hasText: needle })).toHaveCount(0);

    // DOM renderizado: ningun nodo de texto ni atributo contiene el valor (se excluyen script/style,
    // donde Next serializa datos de navegacion que no son contenido de la pagina).
    const reflected = await page.evaluate((text) => {
      const hits: string[] = [];
      const walker = document.createTreeWalker(
        document.documentElement,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
          const parent = (node as Text).parentElement?.tagName;
          if (parent === 'SCRIPT' || parent === 'STYLE') continue;
          if ((node.nodeValue ?? '').includes(text))
            hits.push(`texto en <${parent?.toLowerCase()}>`);
        } else {
          const element = node as Element;
          if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') continue;
          for (const attribute of Array.from(element.attributes)) {
            if (attribute.value.includes(text)) {
              hits.push(`atributo ${attribute.name} de <${element.tagName.toLowerCase()}>`);
            }
          }
        }
      }
      if (document.title.includes(text)) hits.push('title');
      return hits;
    }, needle);
    expect(reflected, 'el valor del parametro no debe reflejarse en el DOM renderizado').toEqual(
      [],
    );
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
        const origin = new URL(base).origin;
        // Sin sesion: el proxy redirige a /login conservando el destino completo.
        await page.goto(path);
        await expect(page).toHaveURL(/\/login\?/);

        // TASK-010B / B-04 (cambio justificado): antes se exigia la igualdad LITERAL de `next` con
        // `path`, pero el proxy serializa los espacios como `+` (application/x-www-form-urlencoded)
        // en vez de `%20`; ambas formas decodifican al mismo valor y es lo que recibe el usuario.
        // Ahora se verifica el destino por componentes (origen, ruta, `q` decodificado) y se completa
        // el login: antes la asercion literal detenia la prueba y el destino final no se comprobaba.
        // Sin relajar la seguridad: `next` debe ser una ruta interna (sin origen ni `//`) y no se
        // admiten parametros adicionales.
        const loginUrl = new URL(page.url());
        expect(loginUrl.origin).toBe(origin);
        expect(loginUrl.pathname).toBe('/login');
        const next = loginUrl.searchParams.get('next');
        expect(next, 'el proxy debe conservar el destino en `next`').not.toBeNull();
        expect(
          next!.startsWith('/') && !next!.startsWith('//'),
          'next debe ser una ruta interna',
        ).toBe(true);
        const proxied = new URL(next!, origin);
        expect(proxied.origin).toBe(origin);
        expect(proxied.pathname).toBe('/customers');
        expect(proxied.searchParams.get('q')).toBe(expectedQ);
        expect([...proxied.searchParams.keys()]).toEqual(['q']);

        // El formulario lleva el mismo destino (decodificado) en su campo oculto.
        const hidden = new URL(await page.locator('input[name="next"]').inputValue(), origin);
        expect(hidden.origin).toBe(origin);
        expect(hidden.pathname).toBe('/customers');
        expect(hidden.searchParams.get('q')).toBe(expectedQ);

        await page.locator('input[name="email"]').fill(user.email);
        await page.locator('input[name="password"]').fill(user.password);
        await page.getByRole('button', { name: SUBMIT_NAME }).click();
        await page.waitForURL((url) => url.pathname === '/customers', { timeout: 20_000 });

        // Destino final: origen, ruta, `q` decodificado y contenido del buscador.
        const finalUrl = new URL(page.url());
        expect(finalUrl.origin).toBe(origin);
        expect(finalUrl.pathname).toBe('/customers');
        expect(finalUrl.searchParams.get('q')).toBe(expectedQ);
        expect([...finalUrl.searchParams.keys()]).toEqual(['q']);
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
