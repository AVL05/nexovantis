import { expect, test, type Page } from '@playwright/test';

import { getCrmWorld, loginAs, type CrmWorld } from './support/crm-world';

// TASK-008B: Clientes y Tecnicos con Auth real y base de datos real (job `supabase` de CI).
// Un worker, estado compartido por el mundo del worker (ver playwright.supabase.config.ts).

test.describe.configure({ mode: 'serial' });

let world: CrmWorld;
test.beforeAll(async () => {
  world = await getCrmWorld();
});

const MODULES = [
  {
    path: '/customers',
    plural: 'Clientes',
    singular: 'cliente',
    nameLabel: 'Nombre',
    prefix: 'Cliente',
  },
  {
    path: '/technicians',
    plural: 'Técnicos',
    singular: 'técnico',
    nameLabel: 'Nombre completo',
    prefix: 'Técnico',
  },
] as const;

async function createRecord(page: Page, mod: (typeof MODULES)[number], name: string) {
  await page.goto(`${mod.path}/new`);
  await page.getByLabel(mod.nameLabel, { exact: true }).fill(name);
  await page.getByLabel('Correo electrónico').fill(`e2e-${Date.now()}@example.test`);
  await page.getByLabel('Teléfono').fill('600123123');
  await page.getByLabel('Notas').fill('Nota creada por la prueba E2E');
  await page.getByRole('button', { name: `Crear ${mod.singular}` }).click();
  await expect(page).toHaveURL(new RegExp(`${mod.path}/[0-9a-f-]{36}\\?aviso=creado$`));
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return page.url().split('/').pop()!.split('?')[0];
}

test('shell autenticado: organizacion, rol y navegacion a Clientes y Tecnicos', async ({
  page,
}) => {
  await loginAs(page, world.ownerA);
  await expect(page.getByTestId('org-name')).toHaveText(world.orgA.name);
  await expect(page.getByTestId('user-role')).toHaveText(/propietari/i);
  // El panel ofrece accesos reales con recuentos persistidos (sin cifras inventadas).
  await expect(page.getByTestId('count-customers')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('count-technicians')).toHaveText(/^\d+$/);

  const nav = page.getByRole('navigation', { name: 'Principal' });
  await nav.getByRole('link', { name: 'Clientes' }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Clientes' })).toBeVisible();
  await expect(page.getByTestId('org-name')).toHaveText(world.orgA.name);

  await nav.getByRole('link', { name: 'Técnicos' }).click();
  await expect(page).toHaveURL(/\/technicians$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Técnicos' })).toBeVisible();
});

for (const mod of MODULES) {
  test(`${mod.plural}: alta, listado, busqueda, edicion, archivar, filtro y restaurar`, async ({
    page,
  }) => {
    const name = `${mod.prefix} E2E ${world.run}`;
    await loginAs(page, world.memberA); // un miembro tambien puede operar (ADR-001)

    const id = await createRecord(page, mod, name);
    await expect(page.getByText('Registro creado correctamente.')).toBeVisible();
    await expect(page.getByText('Activo', { exact: true })).toBeVisible();

    // Listado y busqueda por nombre.
    await page.goto(mod.path);
    await page
      .getByLabel(`Buscar ${mod.plural.toLowerCase()} por nombre, correo o teléfono`)
      .fill(world.run);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page).toHaveURL(new RegExp(`q=${world.run}`));
    await expect(page.getByRole('table').getByRole('link', { name })).toBeVisible();

    // Busqueda sin coincidencias: estado vacio distinto del de "sin registros".
    await page.goto(`${mod.path}?q=${encodeURIComponent('zzz-no-existe-' + world.run)}`);
    await expect(
      page.getByRole('heading', { name: `No hay ${mod.plural.toLowerCase()} que coincidan` }),
    ).toBeVisible();

    // Termino hostil: no rompe la consulta ni devuelve otras filas.
    await page.goto(`${mod.path}?q=${encodeURIComponent('x"),organization_id.neq.0,(a')}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /coincidan/ })).toBeVisible();

    // Edicion.
    await page.goto(`${mod.path}/${id}/edit`);
    await page.getByLabel('Teléfono').fill('699888777');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page).toHaveURL(new RegExp(`${mod.path}/${id}\\?aviso=actualizado$`));
    await expect(page.getByText('Cambios guardados correctamente.')).toBeVisible();
    await expect(page.getByText('699888777')).toBeVisible();

    // Archivar con confirmacion.
    await page.getByRole('button', { name: `Archivar ${mod.singular}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Archivar', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: `${mod.prefix} archivado.` }),
    ).toBeVisible();
    await expect(page.getByText('Registro archivado', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);

    // Un archivado no se edita: la pagina de edicion lo explica y no ofrece formulario.
    await page.goto(`${mod.path}/${id}/edit`);
    await expect(page.getByText('Un registro archivado no se puede editar.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);

    // Filtros de estado.
    await page.goto(`${mod.path}?q=${world.run}`);
    await expect(page.getByRole('table').getByRole('link', { name })).toHaveCount(0);
    await page
      .getByRole('navigation', { name: 'Filtrar por estado' })
      .getByRole('link', { name: 'Archivados' })
      .click();
    await expect(page).toHaveURL(/estado=archivados/);
    await expect(page.getByRole('table').getByRole('link', { name })).toBeVisible();

    // Restaurar con confirmacion y vuelta al listado de activos.
    await page.goto(`${mod.path}/${id}`);
    await page.getByRole('button', { name: `Restaurar ${mod.singular}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restaurar', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: `${mod.prefix} restaurado.` }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar' })).toBeVisible();

    // Historial real: archivado y restaurado, con el actor actual como "Tu".
    const history = page.locator('section[aria-labelledby="historial"]');
    await expect(history.getByRole('listitem')).toHaveCount(2);
    await expect(history.getByRole('listitem').first()).toContainText('Restaurado');
    await expect(history.getByRole('listitem').first()).toContainText('Tú');
    await expect(history.getByRole('listitem').last()).toContainText('Archivado');

    await page.goto(`${mod.path}?q=${world.run}`);
    await expect(page.getByRole('table').getByRole('link', { name })).toBeVisible();
  });

  test(`${mod.plural}: la validacion de servidor devuelve errores por campo y conserva valores`, async ({
    page,
  }) => {
    await loginAs(page, world.ownerA);
    await page.goto(`${mod.path}/new`);
    // Solo espacios: pasa la validacion HTML (required) y falla en el servidor (Zod).
    await page.getByLabel(mod.nameLabel, { exact: true }).fill('   ');
    await page.getByLabel('Notas').fill('Nota que debe conservarse');
    await page.getByRole('button', { name: `Crear ${mod.singular}` }).click();
    await expect(page.getByTestId('form-error')).toBeVisible();
    await expect(page.getByText('Este campo es obligatorio.')).toBeVisible();
    await expect(page.getByLabel(mod.nameLabel, { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByLabel('Notas')).toHaveValue('Nota que debe conservarse');
    await expect(page).toHaveURL(new RegExp(`${mod.path}/new$`));
  });

  test(`${mod.plural}: otra organizacion no ve ni modifica registros por URL directa`, async ({
    page,
    browser,
  }) => {
    await loginAs(page, world.ownerA);
    const name = `${mod.prefix} Aislado ${world.run}`;
    const id = await createRecord(page, mod, name);

    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    try {
      const other = await context.newPage();
      await loginAs(other, world.ownerB);
      for (const path of [`${mod.path}/${id}`, `${mod.path}/${id}/edit`]) {
        await other.goto(path);
        await expect(
          other.getByRole('heading', { name: new RegExp(`${mod.singular} no encontrado`, 'i') }),
        ).toBeVisible();
        await expect(other.getByText(name)).toHaveCount(0);
      }
      await other.goto(`${mod.path}?q=${world.run}&estado=todos`);
      await expect(other.getByRole('table').getByRole('link', { name })).toHaveCount(0);
      // Identificador con formato invalido: mismo "no encontrado".
      await other.goto(`${mod.path}/no-es-un-uuid`);
      await expect(other.getByRole('heading', { name: /no encontrado/i })).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test('sin sesion, las rutas de modulos redirigen a /login', async ({ page }) => {
  for (const path of ['/customers', '/customers/new', '/technicians', '/technicians/x/edit']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(\?|$)/);
  }
});

test('movil 375 px: sin scroll horizontal y lista de tarjetas', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await loginAs(page, world.ownerA);
  for (const mod of MODULES) {
    await page.goto(mod.path);
    await expect(page.getByRole('heading', { level: 1, name: mod.plural })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(
      page.getByRole('list', { name: `Listado de ${mod.plural.toLowerCase()}` }),
    ).toBeVisible();
  }
});
