import { expect, test, type Page } from '@playwright/test';

import { getCrmWorld, loginAs, type CrmWorld } from './support/crm-world';

// TASK-011 / F4: ordenes de servicio y panel con Auth real y base de datos real (job `supabase` de
// CI: `pnpm test:e2e:supabase`). Un worker, flujo en serie. No se ha ejecutado en local (requiere
// el stack Supabase).

test.describe.configure({ mode: 'serial' });

let world: CrmWorld;
// Clave propia de este escenario: world.run lo comparten inventory/activity/quotes (misma
// organizacion), asi que las busquedas del listado usan este prefijo, presente solo en los
// titulos de las ordenes que crea este spec.
let scenario: string;
test.beforeAll(async () => {
  world = await getCrmWorld('orders');
  scenario = `OS${world.run}`;
});

async function createPerson(page: Page, path: '/customers' | '/technicians', name: string) {
  const technician = path === '/technicians';
  await page.goto(`${path}/new`);
  await page.getByLabel(technician ? 'Nombre completo' : 'Nombre', { exact: true }).fill(name);
  await page.getByRole('button', { name: technician ? 'Crear técnico' : 'Crear cliente' }).click();
  await expect(page).toHaveURL(new RegExp(`${path}/[0-9a-f-]{36}\\?aviso=creado$`));
  return page.url().split('/').pop()!.split('?')[0];
}

async function createOrder(
  page: Page,
  args: { customer: string; title: string; technician?: string },
) {
  await page.goto('/orders/new');
  await page.getByLabel('Cliente', { exact: true }).selectOption({ label: args.customer });
  await page.getByLabel('Título').fill(args.title);
  await page.getByLabel('Descripción').fill('Orden creada por la prueba E2E');
  await page.getByLabel('Prioridad').selectOption('high');
  if (args.technician) {
    await page.getByLabel('Técnico (opcional)').selectOption({ label: args.technician });
  }
  await page.getByRole('button', { name: 'Crear orden' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}\?aviso=creada$/);
  await expect(page.getByRole('heading', { level: 1, name: args.title })).toBeVisible();
  return page.url().split('/').pop()!.split('?')[0];
}

// La consulta del listado ya se pinto (tabla/lista o estado vacio): condicion previa de toda
// comprobacion de ausencia en /orders (evita un falso positivo anterior al render).
const listSettled = (page: Page) =>
  expect(
    page
      .getByRole('region', { name: 'Listado de órdenes de servicio' })
      .or(page.getByRole('list', { name: 'Listado de órdenes de servicio' }))
      .or(
        page.getByRole('heading', {
          name: /^(No hay órdenes que coincidan|Todavía no hay órdenes de servicio)$/,
        }),
      ),
  ).toBeVisible();

const statusOf = (page: Page, text: string) =>
  expect(page.locator('header').getByText(text, { exact: true })).toBeVisible();

test('flujo demo: cliente, orden, asignar, iniciar, completar, historial y panel', async ({
  page,
}) => {
  const customer = `Cliente Orden ${world.run}`;
  const technician = `Técnico Orden ${world.run}`;
  const title = `Revisión caldera ${scenario}`;
  await loginAs(page, world.ownerA);
  await createPerson(page, '/customers', customer);
  await createPerson(page, '/technicians', technician);

  const id = await createOrder(page, { customer, title });
  await expect(page.getByText('Orden creada correctamente.')).toBeVisible();
  await statusOf(page, 'Pendiente');
  // Pendiente: sin saltos (no se ofrece iniciar ni completar).
  await expect(page.getByRole('button', { name: 'Iniciar orden' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Completar orden' })).toHaveCount(0);

  await page.getByLabel('Asignar técnico').selectOption({ label: technician });
  await page.getByRole('button', { name: 'Asignar', exact: true }).click();
  await statusOf(page, 'Asignada');
  await page.reload(); // persistencia
  await statusOf(page, 'Asignada');

  await page.getByRole('button', { name: 'Iniciar orden' }).click();
  await statusOf(page, 'En curso');
  await expect(page.getByLabel('Reasignar a')).toHaveCount(0); // DH-01
  await page.getByRole('button', { name: 'Completar orden' }).click();
  await statusOf(page, 'Completada');

  // Terminal: solo lectura (DH-07).
  await expect(page.getByText('Orden cerrada')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);
  await page.goto(`/orders/${id}/edit`);
  await expect(page.getByText('Una orden completada o cancelada es de solo lectura')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);

  // Historial con actor identificado y una entrada por cambio.
  await page.goto(`/orders/${id}`);
  const history = page.locator('section[aria-labelledby="historial"]');
  await expect(history.getByText('Orden creada')).toBeVisible();
  await expect(history.getByText(/Técnico asignado a/)).toBeVisible();
  await expect(history.getByText('Estado: En curso')).toBeVisible();
  await expect(history.getByText('Estado: Completada')).toBeVisible();
  // Actor identificado ("Tú" visible) en CADA una de las entradas comprobadas.
  for (const text of [
    'Orden creada',
    /Técnico asignado a/,
    'Estado: En curso',
    'Estado: Completada',
  ]) {
    const entry = history.getByRole('listitem').filter({ hasText: text });
    await expect(entry).toHaveCount(1);
    await expect(entry.getByText(/(^|\s)Tú$/)).toBeVisible();
  }

  // Panel: indicadores derivados de datos reales y actividad reciente.
  await page.goto('/dashboard');
  await expect(page.getByTestId('orders-completed')).toHaveText(/^[1-9]\d*$/);
  await expect(page.getByTestId('orders-open')).toHaveText(/^\d+$/);
  // La orden (completada: ya no esta entre las pendientes) aparece en "Actividad reciente" con un
  // enlace VISIBLE a su ficha en cada uno de sus eventos recientes y con el actor identificado.
  const recent = page.locator('section[aria-labelledby="actividad"]');
  const ownEvents = recent
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: title, exact: true }) });
  const created = ownEvents.filter({ hasText: 'Orden creada' });
  await expect(created).toHaveCount(1);
  await expect(created.getByRole('link', { name: title, exact: true })).toBeVisible();
  await expect(created.getByRole('link', { name: title, exact: true })).toHaveAttribute(
    'href',
    `/orders/${id}`,
  );
  const changes = ownEvents.filter({ hasText: 'Cambio de estado' });
  await expect(changes).not.toHaveCount(0); // iniciar y completar
  for (const entry of await changes.all()) {
    await expect(entry).toBeVisible();
    await expect(entry.getByText(/(^|\s)Tú$/)).toBeVisible();
  }
  await page.getByRole('link', { name: 'Nueva orden' }).first().click();
  await expect(page).toHaveURL(/\/orders\/new$/);
});

test('listado: busqueda, filtros por estado y tecnico, estado vacio y persistencia en la URL', async ({
  page,
}) => {
  await loginAs(page, world.memberA);
  await page.goto(`/orders?q=${encodeURIComponent(scenario)}`);
  const flowTitle = `Revisión caldera ${scenario}`;
  await expect(page.getByRole('table').getByRole('link', { name: flowTitle })).toBeVisible();

  await page.goto(`/orders?q=${encodeURIComponent(scenario)}&estado=completed`);
  await expect(page.getByRole('table').getByText('Completada')).toBeVisible();
  await page.goto(`/orders?q=${encodeURIComponent(scenario)}&estado=cancelled`);
  await expect(page.getByRole('heading', { name: 'No hay órdenes que coincidan' })).toBeVisible();

  // Termino hostil: no rompe la consulta.
  await page.goto(`/orders?q=${encodeURIComponent('x"),organization_id.neq.0,(a')}`);
  await expect(page.getByRole('heading', { name: 'No hay órdenes que coincidan' })).toBeVisible();

  // Filtros del formulario (GET) conservados tras recargar.
  await page.goto('/orders');
  await page.getByLabel('Estado').selectOption('completed');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/estado=completed/);
  await page.reload();
  await expect(page.getByLabel('Estado')).toHaveValue('completed');
});

test('cancelar con motivo, DH-04 al archivar y aislamiento entre organizaciones', async ({
  page,
}) => {
  const customer = `Cliente Cancel ${world.run}`;
  const technician = `Técnico Cancel ${world.run}`;
  const title = `Orden a cancelar ${scenario}`;
  await loginAs(page, world.ownerA);
  const customerId = await createPerson(page, '/customers', customer);
  const technicianId = await createPerson(page, '/technicians', technician);
  const id = await createOrder(page, { customer, title, technician }); // DH-13: nace asignada
  await statusOf(page, 'Asignada');

  // DH-04 / DH-05: no se archiva con ordenes abiertas.
  for (const [path, singular, personId] of [
    ['/technicians', 'técnico', technicianId],
    ['/customers', 'cliente', customerId],
  ] as const) {
    await page.goto(`${path}/${personId}`);
    await page.getByRole('button', { name: `Archivar ${singular}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archivar', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'tiene órdenes abiertas' }),
    ).toBeVisible();
  }

  await page.goto(`/orders/${id}`);
  await page.getByRole('button', { name: 'Cancelar orden' }).first().click();
  await page.getByLabel('Motivo (opcional)').fill('El cliente pospone el trabajo');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar orden' }).click();
  await statusOf(page, 'Cancelada');
  await expect(page.getByText('Motivo: El cliente pospone el trabajo')).toBeVisible();

  // Con la orden cancelada ya se puede archivar al tecnico.
  await page.goto(`/technicians/${technicianId}`);
  await page.getByRole('button', { name: 'Archivar técnico' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archivar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Técnico archivado.' })).toBeVisible();

  // Otra organizacion no ve ni abre la orden.
  await page.context().clearCookies();
  await loginAs(page, world.ownerB);
  await page.goto(`/orders/${id}`);
  await expect(page.getByRole('heading', { name: 'Orden no encontrada' })).toBeVisible();
  await page.goto('/orders');
  await listSettled(page);
  await expect(page.getByText(title)).toHaveCount(0);
});
