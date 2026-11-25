import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { requireLocalSupabaseEnv } from '../support/local-supabase';
import { getCrmWorld, loginAs, type CrmUser, type CrmWorld } from './support/crm-world';

// TASK-013 / F6: inventario con Auth real y base de datos real (job `supabase` de CI:
// `pnpm test:e2e:supabase`). Un worker, flujo en serie. Incluye las pruebas de CONCURRENCIA REAL del
// saldo y de la idempotencia (varias conexiones/JWT distintos contra PostgREST). NO se ha ejecutado en
// local (requiere Docker/Supabase CLI): ver el informe de TASK-013. La entrada "Inventario" del lateral
// depende de la entrada correspondiente en src/features/navigation/items.ts.

test.describe.configure({ mode: 'serial' });

let world: CrmWorld;
test.beforeAll(async () => {
  world = await getCrmWorld('inventory');
});

// Tabla (escritorio) y lista (movil) conviven en el DOM y se alternan por CSS (`lg`): se afirma
// siempre sobre la representacion visible del viewport.
const visible = (locator: Locator): Locator => locator.filter({ visible: true });

// La consulta del listado ya se pinto (tabla/lista o estado vacio): condicion previa de toda
// comprobacion de ausencia en /inventory (evita un falso positivo anterior al render).
const listSettled = (page: Page) =>
  expect(
    page
      .getByRole('region', { name: 'Listado de inventario' })
      .or(page.getByRole('list', { name: 'Listado de inventario' }))
      .or(
        page.getByRole('heading', {
          name: /^(No hay artículos que coincidan|Todavía no hay artículos)$/,
        }),
      ),
  ).toBeVisible();

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

async function signedIn(user: CrmUser): Promise<SupabaseClient> {
  const { url, anonKey } = requireLocalSupabaseEnv();
  const client = createClient(url, anonKey, authOptions);
  const result = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (result.error) throw new Error('Preparacion fallida (login)');
  return client;
}

function adminClient(): SupabaseClient {
  const { url, serviceKey } = requireLocalSupabaseEnv();
  return createClient(url, serviceKey, authOptions);
}

async function newCustomer(org: string, name: string): Promise<string> {
  const customer = await adminClient()
    .from('customers')
    .insert({ organization_id: org, name })
    .select('id')
    .single();
  if (customer.error || !customer.data) throw new Error('Preparacion fallida (cliente)');
  return String(customer.data.id);
}

async function newOrder(client: SupabaseClient, customer: string, title: string): Promise<string> {
  const id = randomUUID();
  const created = await client.rpc('create_work_order', {
    p_id: id,
    p_customer_id: customer,
    p_title: title,
    p_description: null,
    p_priority: 'normal',
    p_scheduled_date: '2026-12-01',
    p_technician_id: null,
  });
  if (created.error) throw new Error(`Preparacion fallida (orden): ${created.error.message}`);
  return id;
}

async function newItem(client: SupabaseClient, reference: string): Promise<string> {
  const id = randomUUID();
  const created = await client.rpc('create_inventory_item', {
    p_id: id,
    p_reference: reference,
    p_name: `Articulo ${reference}`,
    p_description: null,
    p_unit: 'ud',
    p_low_stock_threshold: 0,
  });
  if (created.error) throw new Error(`Preparacion fallida (articulo): ${created.error.message}`);
  return id;
}

const move = (
  client: SupabaseClient,
  item: string,
  kind: 'in' | 'out' | 'consumption',
  quantity: number,
  extra: { request?: string; order?: string; note?: string } = {},
) =>
  client.rpc('record_stock_movement', {
    p_request_id: extra.request ?? randomUUID(),
    p_item_id: item,
    p_kind: kind,
    p_quantity: quantity,
    p_order_id: extra.order ?? null,
    p_note: extra.note ?? null,
  });

const balanceOf = async (item: string) =>
  Number(
    (await adminClient().from('inventory_items').select('quantity').eq('id', item).single()).data
      ?.quantity,
  );

// ---------------------------------------------------------------------------------------------
// Flujo por la interfaz
// ---------------------------------------------------------------------------------------------
async function registerMovement(
  page: Page,
  args: { kind: string; quantity: string; orderId?: string; note?: string },
) {
  const form = page.getByRole('form', { name: 'Registrar movimiento' });
  await form.getByLabel('Tipo de movimiento').selectOption({ label: args.kind });
  await form.getByLabel(/^Cantidad/).fill(args.quantity);
  if (args.orderId)
    await form.getByLabel('Orden de servicio').selectOption({ value: args.orderId });
  if (args.note) await form.getByLabel('Nota (opcional)').fill(args.note);
  await form.getByRole('button', { name: 'Registrar movimiento' }).click();
}

test('flujo: alta, entradas, salidas, consumo en orden, archivado y actividad', async ({
  page,
}) => {
  const reference = `TUB-${world.run}`;
  const name = `Tubo de cobre ${world.run}`;
  const customer = await newCustomer(world.orgA.id, `Cliente Inventario ${world.run}`);
  const owner = await signedIn(world.ownerA);
  const orderTitle = `Obra inventario ${world.run}`;
  const orderId = await newOrder(owner, customer, orderTitle);

  await loginAs(page, world.ownerA);
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Inventario' })
    .click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Inventario' })).toBeVisible();

  // Alta: nace con saldo 0.
  await page.getByRole('link', { name: 'Nuevo artículo' }).first().click();
  await page.getByLabel('Referencia', { exact: true }).fill(reference);
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Unidad').selectOption({ label: 'Metros (m)' });
  await page.getByLabel('Umbral de stock bajo').fill('20');
  await page.getByRole('button', { name: 'Crear artículo' }).click();
  await expect(page).toHaveURL(/\/inventory\/[0-9a-f-]{36}\?aviso=creado$/);
  const id = page.url().split('/').pop()!.split('?')[0];
  await expect(page.getByTestId('item-balance')).toHaveText('0 m');
  await expect(page.locator('header').getByText('Agotado', { exact: true })).toBeVisible();

  // Referencia duplicada (sin distinguir mayusculas).
  await page.goto('/inventory/new');
  await page.getByLabel('Referencia', { exact: true }).fill(reference.toLowerCase());
  await page.getByLabel('Nombre', { exact: true }).fill('Duplicado');
  await page.getByRole('button', { name: 'Crear artículo' }).click();
  await expect(page.getByText('Ya existe un artículo con esa referencia.').first()).toBeVisible();

  // Entrada, salida y salida imposible.
  await page.goto(`/inventory/${id}`);
  await registerMovement(page, { kind: 'Entrada', quantity: '50', note: 'Existencia inicial' });
  await expect(page.getByTestId('item-balance')).toHaveText('50 m');
  await registerMovement(page, { kind: 'Salida', quantity: '20' });
  await expect(page.getByTestId('item-balance')).toHaveText('30 m');
  await registerMovement(page, { kind: 'Salida', quantity: '31' });
  await expect(page.getByTestId('movement-error')).toContainText('No hay existencias suficientes');
  await expect(page.getByTestId('item-balance')).toHaveText('30 m');

  // Cantidad no entera: el servidor la rechaza.
  const form = page.getByRole('form', { name: 'Registrar movimiento' });
  // Sin validacion del navegador: lo comprueba el servidor (Zod).
  await form.evaluate((el: HTMLFormElement) => {
    el.noValidate = true;
  });
  await registerMovement(page, { kind: 'Entrada', quantity: '2.5' });
  // Primero el error de validacion de esta peticion (reemplaza al de stock insuficiente anterior);
  // solo despues se comprueba que el saldo no cambio.
  await expect(page.getByTestId('movement-error')).toContainText('Revisa los campos marcados');
  await expect(form.getByText('Introduce una cantidad entera mayor que 0.')).toBeVisible();
  await expect(page.getByTestId('item-balance')).toHaveText('30 m');

  // Consumo vinculado a una orden abierta (la recarga confirma que el saldo persistido es 30).
  await page.reload();
  await expect(page.getByTestId('item-balance')).toHaveText('30 m');
  await registerMovement(page, {
    kind: 'Consumo en orden',
    quantity: '25',
    orderId,
  });
  await expect(page.getByTestId('item-balance')).toHaveText('5 m');
  await expect(page.locator('header').getByText('Stock bajo', { exact: true })).toBeVisible();
  const history = page.getByRole('region', { name: 'Historial de movimientos' });
  await expect(visible(history.getByRole('link', { name: orderTitle }))).toBeVisible();
  await expect(visible(history.getByText('Existencia inicial'))).toBeVisible();

  // Filtros de estado del listado e indicadores.
  await page.goto('/inventory?estado=bajo');
  await expect(visible(page.getByRole('link', { name }))).toBeVisible();
  await page.goto('/inventory?estado=agotado');
  await listSettled(page);
  await expect(visible(page.getByRole('link', { name }))).toHaveCount(0);
  await expect(page.getByTestId('inventory-low')).toBeVisible();
  await page.goto(`/inventory?q=${encodeURIComponent(reference.toLowerCase())}`);
  await expect(visible(page.getByRole('link', { name }))).toBeVisible();

  // Archivar con saldo: solo lectura.
  await page.goto(`/inventory/${id}`);
  await page.getByRole('button', { name: 'Archivar artículo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archivar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Artículo archivado.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Registrar movimiento' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);
  await page.goto(`/inventory/${id}/edit`);
  await expect(page.getByText('Un artículo archivado es de solo lectura')).toBeVisible();
  await page.goto('/inventory');
  await listSettled(page);
  await expect(visible(page.getByRole('link', { name }))).toHaveCount(0);
  await page.goto('/inventory?estado=archivados');
  await expect(visible(page.getByRole('link', { name }))).toBeVisible();

  // Restaurar y volver a mover.
  await page.goto(`/inventory/${id}`);
  await page.getByRole('button', { name: 'Restaurar artículo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restaurar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Artículo restaurado.' })).toBeVisible();
  await page.reload();
  await registerMovement(page, { kind: 'Entrada', quantity: '10' });
  await expect(page.getByTestId('item-balance')).toHaveText('15 m');

  // Edicion: nombre y umbral; la referencia es de solo lectura.
  await page.getByRole('link', { name: 'Editar' }).click();
  await expect(page.getByTestId('item-reference')).toHaveText(reference);
  await page.getByLabel('Nombre', { exact: true }).fill(`${name} (rev.)`);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page).toHaveURL(/\?aviso=actualizado$/);
  await expect(page.getByRole('heading', { level: 1, name: `${name} (rev.)` })).toBeVisible();

  // Actividad: eventos del articulo con actor identificado y enlace a la entidad.
  await page.goto('/activity?entidad=inventario');
  const activity = page
    .getByRole('region', { name: 'Registro de actividad' })
    .or(page.getByRole('list', { name: 'Registro de actividad' }));
  const rows = activity
    .locator('tr, li')
    .filter({ has: page.getByRole('link', { name: `${name} (rev.)`, exact: true }) });
  const kinds = [
    ['Artículo creado', 1],
    ['Entrada de stock', 2],
    ['Salida de stock', 1],
    ['Consumo en orden', 1],
    ['Artículo archivado', 1],
    ['Artículo restaurado', 1],
  ] as const;
  for (const [text, count] of kinds) {
    await expect(rows.filter({ hasText: text })).toHaveCount(count);
  }
  await expect(rows.filter({ hasText: 'Tú' })).toHaveCount(7); // todos con actor identificado
  await expect(rows.filter({ hasText: 'Consumo en orden' })).toContainText(orderTitle);
  await expect(rows.locator(`a[href="/inventory/${id}"]`)).toHaveCount(7); // enlace a la entidad
  // La nota libre no se publica en la actividad (el registro ya esta pintado).
  await expect(activity.getByText('Existencia inicial')).toHaveCount(0);
});

test('un miembro puede crear y mover (INV-9) y otra organizacion no ve el articulo (RLS)', async ({
  page,
  browser,
}) => {
  const reference = `MIE-${world.run}`;
  await loginAs(page, world.memberA);
  await page.goto('/inventory/new');
  await page.getByLabel('Referencia', { exact: true }).fill(reference);
  await page.getByLabel('Nombre', { exact: true }).fill(`Articulo miembro ${world.run}`);
  await page.getByRole('button', { name: 'Crear artículo' }).click();
  await expect(page).toHaveURL(/\/inventory\/[0-9a-f-]{36}\?aviso=creado$/);
  const id = page.url().split('/').pop()!.split('?')[0];
  await registerMovement(page, { kind: 'Entrada', quantity: '7' });
  await expect(page.getByTestId('item-balance')).toHaveText('7 ud');

  const other = await browser.newPage();
  await loginAs(other, world.ownerB);
  await other.goto(`/inventory/${id}`);
  await expect(other.getByRole('heading', { name: 'Artículo no encontrado' })).toBeVisible();
  await other.goto('/inventory');
  await listSettled(other);
  await expect(other.getByText(`Articulo miembro ${world.run}`)).toHaveCount(0);
  await other.goto('/activity');
  await expect(
    other
      .getByRole('region', { name: 'Registro de actividad' })
      .or(other.getByRole('list', { name: 'Registro de actividad' }))
      .or(
        other.getByRole('heading', {
          name: /^(No hay actividad que coincida|Todavía no hay actividad)$/,
        }),
      ),
  ).toBeVisible();
  await expect(other.getByText(`Articulo miembro ${world.run}`)).toHaveCount(0);
  await other.close();
});

test('escrituras directas por PostgREST denegadas; anon sin acceso', async () => {
  const { url, anonKey } = requireLocalSupabaseEnv();
  const owner = await signedIn(world.ownerA);
  const item = await newItem(owner, `DIR-${world.run}`);
  await move(owner, item, 'in', 5);

  const inserted = await owner.from('inventory_items').insert({
    organization_id: world.orgA.id,
    reference: `X-${world.run}`,
    name: 'x',
    unit: 'ud',
  });
  expect(inserted.error?.code).toBe('42501');
  const updated = await owner.from('inventory_items').update({ quantity: 999 }).eq('id', item);
  expect(updated.error?.code).toBe('42501');
  const movement = await owner.from('stock_movements').insert({
    organization_id: world.orgA.id,
    item_id: item,
    kind: 'in',
    quantity: 100,
    request_id: randomUUID(),
  });
  expect(movement.error?.code).toBe('42501');
  const events = await owner.from('activity_events').insert({
    organization_id: world.orgA.id,
    actor_id: world.ownerA.id,
    entity_type: 'inventory_item',
    entity_id: item,
    action: 'stock_in',
  });
  expect(events.error?.code).toBe('42501');
  expect(await balanceOf(item)).toBe(5);

  const anon = createClient(url, anonKey, authOptions);
  expect((await anon.from('inventory_items').select('id')).error?.code).toBe('42501');
  expect((await move(anon, item, 'in', 1)).error).not.toBeNull();
  expect(await balanceOf(item)).toBe(5);

  // Otra organizacion: el articulo no existe para ella.
  const ownerB = await signedIn(world.ownerB);
  expect((await move(ownerB, item, 'in', 1)).error?.code).toBe('NX020');
  expect((await ownerB.from('inventory_items').select('id').eq('id', item)).data).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// Concurrencia real: conexiones y JWT distintos contra PostgREST + PostgreSQL.
// ---------------------------------------------------------------------------------------------
test('salidas concurrentes: el saldo nunca es negativo y solo caben las que hay existencias', async () => {
  const sessions = await Promise.all([signedIn(world.ownerA), signedIn(world.memberA)]);
  const item = await newItem(sessions[0], `CON-${world.run}`);
  expect((await move(sessions[0], item, 'in', 20)).error).toBeNull();

  const N = 14; // 14 salidas de 3 sobre un saldo de 20: caben exactamente 6
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) => move(sessions[i % 2], item, 'out', 3)),
  );
  const accepted = results.filter((r) => r.error === null);
  const rejected = results.filter((r) => r.error !== null);
  expect(accepted).toHaveLength(6);
  expect(rejected).toHaveLength(N - 6);
  expect(rejected.every((r) => r.error?.code === 'NX022')).toBe(true);
  expect(await balanceOf(item)).toBe(2);

  const admin = adminClient();
  const rows = await admin
    .from('stock_movements')
    .select('kind, quantity, balance_before, balance_after, seq')
    .eq('item_id', item)
    .order('seq');
  expect(rows.data).toHaveLength(7);
  expect(rows.data?.every((r) => r.balance_after >= 0)).toBe(true);
  // Cadena de saldos coherente: cada movimiento parte del saldo en que dejo el anterior.
  const data = rows.data ?? [];
  for (let i = 1; i < data.length; i += 1) {
    expect(data[i].balance_before).toBe(data[i - 1].balance_after);
  }
  const events = await admin
    .from('activity_events')
    .select('action')
    .eq('entity_type', 'inventory_item')
    .eq('entity_id', item);
  expect(events.data?.filter((e) => e.action === 'stock_out')).toHaveLength(6);
  expect(events.data?.filter((e) => e.action === 'stock_in')).toHaveLength(1);
});

test('la misma clave de envio en paralelo produce UN movimiento (idempotencia)', async () => {
  const sessions = await Promise.all([signedIn(world.ownerA), signedIn(world.memberA)]);
  const item = await newItem(sessions[0], `IDE-${world.run}`);
  const request = randomUUID();
  const N = 10;
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) => move(sessions[i % 2], item, 'in', 7, { request })),
  );
  expect(results.map((r) => r.error)).toEqual(Array.from({ length: N }, () => null));
  const payloads = results.map((r) => r.data as { id: string; balance: number; replayed: boolean });
  expect(new Set(payloads.map((p) => p.id)).size).toBe(1);
  expect(payloads.filter((p) => !p.replayed)).toHaveLength(1);
  expect(await balanceOf(item)).toBe(7);

  const admin = adminClient();
  const movements = await admin.from('stock_movements').select('id').eq('item_id', item);
  expect(movements.data).toHaveLength(1);
  const events = await admin
    .from('activity_events')
    .select('action')
    .eq('entity_id', item)
    .eq('action', 'stock_in');
  expect(events.data).toHaveLength(1);

  // La misma clave con otro contenido se rechaza.
  expect((await move(sessions[0], item, 'in', 8, { request })).error?.code).toBe('NX024');
  expect(await balanceOf(item)).toBe(7);
});

test('archivar y mover en paralelo: o se mueve antes de archivar o se rechaza (NX021), nunca ambos', async () => {
  const owner = await signedIn(world.ownerA);
  const member = await signedIn(world.memberA);
  for (let round = 0; round < 4; round += 1) {
    const item = await newItem(owner, `ARC${round}-${world.run}`);
    expect((await move(owner, item, 'in', 10)).error).toBeNull();
    const [archived, moved] = await Promise.all([
      owner.rpc('archive_inventory_item', { p_id: item }),
      move(member, item, 'out', 4),
    ]);
    expect(archived.error).toBeNull();
    const row = (
      await adminClient()
        .from('inventory_items')
        .select('quantity, archived_at')
        .eq('id', item)
        .single()
    ).data;
    expect(row?.archived_at).not.toBeNull();
    if (moved.error) {
      expect(moved.error.code).toBe('NX021');
      expect(row?.quantity).toBe(10);
    } else {
      expect(row?.quantity).toBe(6); // la salida entro antes de archivar
    }
    // Ya archivado: ningun movimiento posterior entra.
    expect((await move(member, item, 'in', 1)).error?.code).toBe('NX021');
  }
});

test('consumir y cancelar la orden en paralelo: el consumo entra antes o se rechaza (NX023)', async () => {
  const owner = await signedIn(world.ownerA);
  const customer = await newCustomer(world.orgA.id, `Cliente Carrera Inv ${world.run}`);
  for (let round = 0; round < 4; round += 1) {
    const item = await newItem(owner, `ORD${round}-${world.run}`);
    expect((await move(owner, item, 'in', 10)).error).toBeNull();
    const order = await newOrder(owner, customer, `Carrera ${round} ${world.run}`);
    const [consumed, cancelled] = await Promise.all([
      move(owner, item, 'consumption', 4, { order }),
      owner.rpc('cancel_work_order', { p_id: order, p_reason: null }),
    ]);
    expect(cancelled.error).toBeNull();
    const balance = await balanceOf(item);
    if (consumed.error) {
      expect(consumed.error.code).toBe('NX023');
      expect(balance).toBe(10);
    } else {
      expect(balance).toBe(6);
    }
    // Con la orden ya cancelada, ningun consumo posterior entra.
    expect((await move(owner, item, 'consumption', 1, { order })).error?.code).toBe('NX023');
    expect(await balanceOf(item)).toBe(balance);
  }
});

test('altas concurrentes con la misma referencia (sin distinguir mayusculas): solo una prospera', async () => {
  const sessions = await Promise.all([signedIn(world.ownerA), signedIn(world.memberA)]);
  const base = `DUP-${world.run}`;
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      sessions[i % 2].rpc('create_inventory_item', {
        p_id: randomUUID(),
        p_reference: i % 2 === 0 ? base : base.toLowerCase(),
        p_name: `Duplicado ${i}`,
        p_description: null,
        p_unit: 'ud',
        p_low_stock_threshold: 0,
      }),
    ),
  );
  expect(results.filter((r) => r.error === null)).toHaveLength(1);
  expect(results.filter((r) => r.error !== null).every((r) => r.error?.code === 'NX025')).toBe(
    true,
  );
  const rows = await adminClient()
    .from('inventory_items')
    .select('id')
    .eq('organization_id', world.orgA.id)
    .ilike('reference', base);
  expect(rows.data).toHaveLength(1);
});
