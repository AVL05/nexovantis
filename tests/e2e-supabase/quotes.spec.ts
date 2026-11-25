import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { requireLocalSupabaseEnv } from '../support/local-supabase';
import { getCrmWorld, loginAs, type CrmUser, type CrmWorld } from './support/crm-world';

// TASK-012 / F5: presupuestos con Auth real y base de datos real (job `supabase` de CI:
// `pnpm test:e2e:supabase`). Un worker, flujo en serie. Incluye la prueba de CONCURRENCIA REAL de la
// aceptacion (varias conexiones/JWT distintos contra PostgREST). NO se ha ejecutado en local
// (requiere Docker/Supabase CLI): ver el informe de TASK-012.

test.describe.configure({ mode: 'serial' });

let world: CrmWorld;
test.beforeAll(async () => {
  world = await getCrmWorld();
});

async function createCustomer(page: Page, name: string) {
  await page.goto('/customers/new');
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Crear cliente' }).click();
  await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}\?aviso=creado$/);
  return page.url().split('/').pop()!.split('?')[0];
}

async function createQuote(page: Page, args: { customer: string; title: string }) {
  await page.goto('/quotes/new');
  await page.getByLabel('Cliente', { exact: true }).selectOption({ label: args.customer });
  await page.getByLabel('Título').fill(args.title);
  await page.getByLabel('Descripción').fill('Presupuesto creado por la prueba E2E');
  await page.getByRole('button', { name: 'Crear presupuesto' }).click();
  await expect(page).toHaveURL(/\/quotes\/[0-9a-f-]{36}\?aviso=creado$/);
  await expect(page.getByRole('heading', { level: 1, name: args.title })).toBeVisible();
  return page.url().split('/').pop()!.split('?')[0];
}

async function addItem(
  page: Page,
  item: { description: string; quantity: string; price: string; tax?: string },
) {
  const form = page.getByRole('form', { name: 'Añadir concepto' });
  await form.getByLabel('Concepto', { exact: true }).fill(item.description);
  await form.getByLabel('Cantidad', { exact: true }).fill(item.quantity);
  await form.getByLabel('Precio unitario (€, sin IVA)').fill(item.price);
  if (item.tax) await form.getByLabel('IVA', { exact: true }).selectOption({ label: item.tax });
  await form.getByRole('button', { name: 'Añadir concepto' }).click();
  await expect(page.getByRole('cell', { name: item.description, exact: true })).toBeVisible();
}

const status = (page: Page, text: string) =>
  expect(page.locator('header').getByText(text, { exact: true })).toBeVisible();
const total = (page: Page, text: string) =>
  expect(page.getByTestId('quote-total')).toHaveText(text);

test('flujo: crear, conceptos con redondeo half-up, editar, quitar, aceptar y orden generada', async ({
  page,
}) => {
  const customer = `Cliente Presupuesto ${world.run}`;
  const title = `Reforma de baño ${world.run}`;
  await loginAs(page, world.ownerA);
  await createCustomer(page, customer);

  // Entrada de navegacion real (sin botones ficticios).
  await page.getByRole('navigation').getByRole('link', { name: 'Presupuestos' }).first().click();
  await expect(page).toHaveURL(/\/quotes$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Presupuestos' })).toBeVisible();

  const id = await createQuote(page, { customer, title });
  await expect(page.getByText(/Presupuesto creado correctamente/)).toBeVisible();
  await status(page, 'Borrador');
  await total(page, '0,00 €');

  // Previsualizacion en la interfaz (enteros) y alta de conceptos.
  const form = page.getByRole('form', { name: 'Añadir concepto' });
  await form.getByLabel('Cantidad', { exact: true }).fill('0,5');
  await form.getByLabel('Precio unitario (€, sin IVA)').fill('0,03');
  await expect(page.getByTestId('item-preview')).toContainText('0,02 €'); // 1,5 cent -> 2 (half-up)
  await form.getByLabel('Cantidad', { exact: true }).fill('1');
  await form.getByLabel('Precio unitario (€, sin IVA)').fill('');

  await addItem(page, { description: 'Mano de obra', quantity: '2', price: '12,50' });
  await total(page, '30,25 €'); // 25,00 + IVA 5,25
  await addItem(page, { description: 'Material', quantity: '0,5', price: '0,03' });
  await total(page, '30,27 €'); // base 25,02 (1,5 -> 2); IVA 5,25 (0,42 -> 0)
  await expect(page.getByTestId('quote-subtotal')).toHaveText('25,02 €');
  await expect(page.getByTestId('quote-tax')).toHaveText('5,25 €');

  // Persistencia tras recargar y validacion de servidor (cantidad invalida).
  await page.reload();
  await total(page, '30,27 €');
  await form.getByLabel('Concepto', { exact: true }).fill('Invalido');
  await form.getByLabel('Cantidad', { exact: true }).fill('1,2345');
  await form.getByLabel('Precio unitario (€, sin IVA)').fill('1');
  await form.getByRole('button', { name: 'Añadir concepto' }).click();
  await expect(form.getByText(/Indica una cantidad mayor que 0/)).toBeVisible();
  await total(page, '30,27 €');

  // Quitar un concepto y editar otro: la base recalcula los totales.
  await page.getByRole('button', { name: 'Quitar concepto Material' }).click();
  await expect(page.getByRole('cell', { name: 'Material', exact: true })).toHaveCount(0);
  await total(page, '30,25 €');
  await page.getByRole('button', { name: 'Editar concepto Mano de obra' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cantidad', { exact: true }).fill('3');
  await dialog.getByRole('button', { name: 'Guardar concepto' }).click();
  await total(page, '45,38 €'); // 37,50 + IVA 7,875 -> 7,88

  // Editar cabecera en borrador.
  await page.goto(`/quotes/${id}/edit`);
  await page.getByLabel('Título').fill(`${title} (ampliado)`);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page).toHaveURL(/aviso=actualizado$/);
  await status(page, 'Borrador');

  // Aceptar con confirmacion: genera la orden y deja el presupuesto de solo lectura.
  await page.getByRole('button', { name: 'Aceptar presupuesto' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Aceptar y crear orden' }).click();
  await status(page, 'Aceptado');
  await expect(page.getByRole('link', { name: 'Ver la orden de servicio' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aceptar presupuesto' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rechazar presupuesto' })).toHaveCount(0);
  await expect(page.getByRole('form', { name: 'Añadir concepto' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Quitar concepto/ })).toHaveCount(0);
  const history = page.locator('section[aria-labelledby="historial"]');
  await expect(history.getByText('Presupuesto creado')).toBeVisible();
  await expect(history.getByText(/Presupuesto aceptado/)).toBeVisible();
  await expect(history.getByText(/Tú/).first()).toBeVisible();

  await page.goto(`/quotes/${id}/edit`);
  await expect(page.getByText(/aceptado o rechazado es de solo lectura/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);

  // La orden generada: misma organizacion/cliente/titulo, pendiente y con el importe en la descripcion.
  await page.goto(`/quotes/${id}`);
  await page.getByRole('link', { name: 'Ver la orden de servicio' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: `${title} (ampliado)` })).toBeVisible();
  await status(page, 'Pendiente');
  await expect(page.getByText(customer)).toBeVisible();
  await expect(page.getByText(/45,38 EUR/)).toBeVisible();
  // Exactamente una orden con ese titulo.
  await page.goto(`/orders?q=${encodeURIComponent(`${title} (ampliado)`)}`);
  await expect(page.getByRole('table').getByRole('link')).toHaveCount(1);
});

test('rechazar es terminal: solo lectura, sin orden y sin decision contraria', async ({ page }) => {
  const customer = `Cliente Rechazo ${world.run}`;
  const title = `Presupuesto a rechazar ${world.run}`;
  await loginAs(page, world.memberA);
  await createCustomer(page, customer);
  const id = await createQuote(page, { customer, title });
  await addItem(page, { description: 'Servicio', quantity: '1', price: '100' });
  await total(page, '121,00 €');

  await page.getByRole('button', { name: 'Rechazar presupuesto' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Rechazar presupuesto' }).click();
  await status(page, 'Rechazado');
  await expect(page.getByText('Un presupuesto rechazado es de solo lectura')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aceptar presupuesto' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ver la orden de servicio' })).toHaveCount(0);
  await page.reload();
  await status(page, 'Rechazado');

  await page.goto(`/orders?q=${encodeURIComponent(title)}`);
  await expect(page.getByRole('heading', { name: 'No hay órdenes que coincidan' })).toBeVisible();
  await page.goto(`/quotes/${id}/edit`);
  await expect(page.getByText(/aceptado o rechazado es de solo lectura/)).toBeVisible();
});

test('listado: busqueda por texto y numero, filtros por estado, estado vacio y URL persistente', async ({
  page,
}) => {
  await loginAs(page, world.memberA);
  await page.goto(`/quotes?q=${encodeURIComponent(world.run)}`);
  await expect(
    page
      .getByRole('table')
      .getByRole('link', { name: new RegExp(world.run) })
      .first(),
  ).toBeVisible();

  await page.goto(`/quotes?q=${encodeURIComponent(world.run)}&estado=accepted`);
  await expect(page.getByRole('table').getByText('Aceptado').first()).toBeVisible();
  await page.goto(`/quotes?q=${encodeURIComponent(world.run)}&estado=draft`);
  await expect(
    page.getByRole('heading', { name: 'No hay presupuestos que coincidan' }),
  ).toBeVisible();

  // Busqueda por numero legible (PRE-0001 existe en cualquier organizacion con presupuestos).
  await page.goto('/quotes?q=PRE-0001');
  await expect(page.getByRole('table').getByText('PRE-0001')).toBeVisible();

  // Termino hostil: no rompe la consulta.
  await page.goto(`/quotes?q=${encodeURIComponent('x"),organization_id.neq.0,(a')}`);
  await expect(
    page.getByRole('heading', { name: 'No hay presupuestos que coincidan' }),
  ).toBeVisible();

  await page.goto('/quotes');
  await page.getByLabel('Estado').selectOption('rejected');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page).toHaveURL(/estado=rejected/);
  await page.reload();
  await expect(page.getByLabel('Estado')).toHaveValue('rejected');
});

test('otra organizacion no ve ni abre los presupuestos', async ({ page }) => {
  const title = `Reforma de baño ${world.run} (ampliado)`;
  await loginAs(page, world.ownerA);
  await page.goto(`/quotes?q=${encodeURIComponent(title)}`);
  const href = await page
    .getByRole('table')
    .getByRole('link', { name: title })
    .getAttribute('href');
  expect(href).toMatch(/^\/quotes\/[0-9a-f-]{36}$/);

  await page.context().clearCookies();
  await loginAs(page, world.ownerB);
  await page.goto(href!);
  await expect(page.getByRole('heading', { name: 'Presupuesto no encontrado' })).toBeVisible();
  await page.goto('/quotes');
  await expect(page.getByText(title)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Todavía no hay presupuestos' })).toBeVisible();
});

// ---------------------------------------------------------------------------------------------
// Concurrencia real: conexiones y JWT distintos contra PostgREST + PostgreSQL.
// ---------------------------------------------------------------------------------------------
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

async function signedIn(url: string, anonKey: string, user: CrmUser): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, authOptions);
  const result = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (result.error) throw new Error('Preparacion fallida (login de concurrencia)');
  return client;
}

test('aceptacion concurrente real: N llamadas en paralelo producen UNA orden', async () => {
  const { url, anonKey, serviceKey } = requireLocalSupabaseEnv();
  const admin = createClient(url, serviceKey, authOptions);
  const customer = await admin
    .from('customers')
    .insert({ organization_id: world.orgA.id, name: `Cliente Concurrencia ${world.run}` })
    .select('id')
    .single();
  if (customer.error || !customer.data) throw new Error('Preparacion fallida (cliente)');

  const N = 10;
  // Dos sesiones (limite de inicios de sesion del stack local); las N peticiones son simultaneas e
  // independientes: cada una usa su propia conexion de PostgREST a PostgreSQL.
  const sessions = await Promise.all([
    signedIn(url, anonKey, world.ownerA),
    signedIn(url, anonKey, world.memberA),
  ]);
  const actors = Array.from({ length: N }, (_, i) => sessions[i % 2]);

  const quoteId = randomUUID();
  const created = await actors[0].rpc('create_quote', {
    p_id: quoteId,
    p_customer_id: customer.data.id,
    p_title: `Concurrencia ${world.run}`,
    p_description: null,
  });
  expect(created.error).toBeNull();
  const item = await actors[0].rpc('add_quote_item', {
    p_quote_id: quoteId,
    p_item_id: randomUUID(),
    p_description: 'Servicio',
    p_quantity: '1.000',
    p_unit_price_cents: 10000,
    p_tax_rate_bp: 2100,
  });
  expect(item.error).toBeNull();

  const results = await Promise.all(actors.map((a) => a.rpc('accept_quote', { p_id: quoteId })));
  expect(results.map((r) => r.error)).toEqual(Array.from({ length: N }, () => null));
  const orderIds = new Set(results.map((r) => String(r.data)));
  expect(orderIds.size).toBe(1);

  const orders = await admin
    .from('work_orders')
    .select('id')
    .eq('organization_id', world.orgA.id)
    .eq('title', `Concurrencia ${world.run}`);
  expect(orders.data).toEqual([{ id: [...orderIds][0] }]);
  const linked = await admin
    .from('quotes')
    .select('id')
    .eq('order_id', [...orderIds][0]);
  expect(linked.data).toEqual([{ id: quoteId }]);
  const events = await admin
    .from('activity_events')
    .select('action')
    .eq('entity_type', 'quote')
    .eq('entity_id', quoteId)
    .order('seq');
  expect(events.data?.map((e) => e.action)).toEqual(['created', 'accepted']);
});

test('aceptar y rechazar en paralelo: gana una sola decision y la base queda coherente', async () => {
  const { url, anonKey, serviceKey } = requireLocalSupabaseEnv();
  const admin = createClient(url, serviceKey, authOptions);
  const customer = await admin
    .from('customers')
    .insert({ organization_id: world.orgA.id, name: `Cliente Carrera ${world.run}` })
    .select('id')
    .single();
  if (customer.error || !customer.data) throw new Error('Preparacion fallida (cliente)');
  const owner = await signedIn(url, anonKey, world.ownerA);
  const member = await signedIn(url, anonKey, world.memberA);
  const title = `Carrera ${world.run}`;
  const quoteId = randomUUID();
  expect(
    (
      await owner.rpc('create_quote', {
        p_id: quoteId,
        p_customer_id: customer.data.id,
        p_title: title,
        p_description: null,
      })
    ).error,
  ).toBeNull();
  // Un presupuesto sin conceptos no se acepta (NX016): se anade uno para que la carrera sea real.
  expect(
    (
      await owner.rpc('add_quote_item', {
        p_quote_id: quoteId,
        p_item_id: randomUUID(),
        p_description: 'Servicio',
        p_quantity: '1.000',
        p_unit_price_cents: 10000,
        p_tax_rate_bp: 2100,
      })
    ).error,
  ).toBeNull();

  const [accept, reject] = await Promise.all([
    owner.rpc('accept_quote', { p_id: quoteId }),
    member.rpc('reject_quote', { p_id: quoteId }),
  ]);
  const quote = await admin.from('quotes').select('status, order_id').eq('id', quoteId).single();
  const orders = await admin
    .from('work_orders')
    .select('id')
    .eq('organization_id', world.orgA.id)
    .eq('title', title);

  if (quote.data?.status === 'accepted') {
    expect(accept.error).toBeNull();
    expect(reject.error?.code).toBe('NX012');
    expect(orders.data).toEqual([{ id: quote.data.order_id }]);
  } else {
    expect(quote.data?.status).toBe('rejected');
    expect(reject.error).toBeNull();
    expect(accept.error?.code).toBe('NX012');
    expect(orders.data).toEqual([]);
  }
});
