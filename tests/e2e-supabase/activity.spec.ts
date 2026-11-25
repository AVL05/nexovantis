import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { requireLocalSupabaseEnv } from '../support/local-supabase';
import { getCrmWorld, loginAs, type CrmUser, type CrmWorld } from './support/crm-world';

// TASK-013 / F6: página /activity (solo lectura, ambos roles) con Auth real y base de datos real (job
// `supabase` de CI). NO se ha ejecutado en local (requiere Docker/Supabase CLI): ver el informe de
// TASK-013. La entrada "Actividad" del lateral depende de src/features/navigation/items.ts.
//
// Mundo propio ('activity', ver support/crm-world.ts) y casos AUTOSUFICIENTES (cada uno crea sus
// datos con una etiqueta propia): sin modo serial. Los eventos de un caso son siempre los más
// recientes de su organización mientras el caso los consulta (un worker, casos en orden de
// fichero). La paginación usa la organización B (solo recibe eventos de este spec) para no
// depender de lo que haya en A.

let world: CrmWorld;
test.beforeAll(async () => {
  world = await getCrmWorld('activity');
});

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

// Tabla (escritorio, region) y lista (móvil, ol) conviven en el DOM y se alternan por CSS (`lg`).
// Las consultas por rol solo encuentran la representación visible, así que `log` es siempre esa.
const log = (page: Page): Locator =>
  page
    .getByRole('region', { name: 'Registro de actividad' })
    .or(page.getByRole('list', { name: 'Registro de actividad' }));

// Eventos (filas de la tabla o tarjetas de la lista) que enlazan al artículo de una etiqueta.
const eventsOf = (page: Page, label: string): Locator =>
  log(page)
    .locator('tr, li')
    .filter({ has: page.getByRole('link', { name: `Articulo ${label}`, exact: true }) });

const emptyState = (page: Page): Locator =>
  page.getByRole('heading', { name: /^(No hay actividad que coincida|Todavía no hay actividad)$/ });

// La consulta ya se pintó: hay registro o estado vacío. Condición previa de toda comprobación de
// ausencia (evita un falso positivo anterior al render).
const settled = (page: Page) => expect(log(page).or(emptyState(page))).toBeVisible();

const datetimes = (page: Page): Promise<number[]> =>
  log(page)
    .locator('time')
    .evaluateAll((nodes) => nodes.map((n) => Date.parse(n.getAttribute('datetime') ?? '')));

// Día natural de Madrid de un instante (AAAA-MM-DD) y desplazamiento en días.
const madridDay = (instant: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(instant));
const shiftDay = (day: string, days: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

async function seedActivity(user: CrmUser, org: string, label: string) {
  const { url, serviceKey } = requireLocalSupabaseEnv();
  const admin = createClient(url, serviceKey, authOptions);
  const customer = await admin
    .from('customers')
    .insert({ organization_id: org, name: `Cliente ${label}` })
    .select('id')
    .single();
  if (customer.error || !customer.data) throw new Error('Preparacion fallida (cliente)');
  const client = await signedIn(user);
  const item = randomUUID();
  const created = await client.rpc('create_inventory_item', {
    p_id: item,
    p_reference: `ACT-${label}`,
    p_name: `Articulo ${label}`,
    p_description: null,
    p_unit: 'kg',
    p_low_stock_threshold: 0,
  });
  if (created.error) throw new Error('Preparacion fallida (articulo)');
  const moved = await client.rpc('record_stock_movement', {
    p_request_id: randomUUID(),
    p_item_id: item,
    p_kind: 'in',
    p_quantity: 12,
    p_order_id: null,
    p_note: 'nota interna que no debe publicarse',
  });
  if (moved.error) throw new Error('Preparacion fallida (movimiento)');
  // Instante real del evento (occurred_at), no el reloj del test.
  const stored = await admin
    .from('activity_events')
    .select('occurred_at')
    .eq('entity_id', item)
    .eq('action', 'stock_in')
    .single();
  if (stored.error || !stored.data) throw new Error('Preparacion fallida (evento)');
  return {
    item,
    customer: String(customer.data.id),
    occurredAt: String(stored.data.occurred_at),
  };
}

test('ambos roles ven la actividad de su organizacion, en solo lectura y con enlace a la entidad', async ({
  page,
}) => {
  const label = `A${world.run}`;
  const { item } = await seedActivity(world.ownerA, world.orgA.id, label);

  for (const user of [world.ownerA, world.memberA]) {
    await loginAs(page, user);
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Actividad' })
      .click();
    await expect(page).toHaveURL(/\/activity$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Actividad' })).toBeVisible();
    // Fila de control: los dos eventos del artículo de este caso (alta y entrada).
    const events = eventsOf(page, label);
    await expect(events).toHaveCount(2);
    const entry = events.filter({ hasText: 'Entrada de stock' });
    await expect(entry).toHaveCount(1);
    await expect(entry.getByRole('link', { name: `Articulo ${label}` })).toHaveAttribute(
      'href',
      `/inventory/${item}`,
    );
    await expect(entry).toContainText(/\+12 kg · saldo 0 → 12/);
    // Solo lectura: ninguna acción de escritura en la página (tras renderizar el registro).
    await expect(
      page.getByRole('main').getByRole('button', { name: /archivar|restaurar|registrar/i }),
    ).toHaveCount(0);
    // La nota libre del movimiento no se publica.
    await expect(page.getByText('nota interna que no debe publicarse')).toHaveCount(0);
    await page.context().clearCookies();
  }
});

test('filtros por entidad y accion', async ({ page }) => {
  const label = `F${world.run}`;
  await seedActivity(world.ownerA, world.orgA.id, label);
  await loginAs(page, world.ownerA);

  // Control sin filtros: el artículo tiene alta y entrada.
  await page.goto('/activity');
  await expect(eventsOf(page, label)).toHaveCount(2);

  // Entidad inventario + acción stock_in: solo la entrada, nunca el alta.
  await page.goto('/activity?entidad=inventario&accion=stock_in');
  await expect(eventsOf(page, label)).toHaveCount(1);
  await expect(eventsOf(page, label)).toContainText('Entrada de stock');
  await expect(log(page).getByText('Artículo creado')).toHaveCount(0);

  // Otra entidad: la consulta se pinta (registro o estado vacío) y no incluye el artículo.
  await page.goto('/activity?entidad=cliente');
  await expect(page.getByLabel('Entidad')).toHaveValue('cliente');
  await settled(page);
  await expect(eventsOf(page, label)).toHaveCount(0);
  await expect(log(page).getByText('Entrada de stock')).toHaveCount(0);
});

test('rango de fechas por dia natural de Madrid calculado desde occurred_at del evento', async ({
  page,
}) => {
  const label = `D${world.run}`;
  const { occurredAt } = await seedActivity(world.ownerA, world.orgA.id, label);
  const day = madridDay(occurredAt);
  await loginAs(page, world.ownerA);

  // El día del evento (ambos extremos incluidos) lo contiene.
  await page.goto(`/activity?desde=${day}&hasta=${day}&entidad=inventario&accion=stock_in`);
  await expect(eventsOf(page, label)).toHaveCount(1);

  // Los días contiguos, no (antes se espera a que la consulta se pinte).
  for (const other of [shiftDay(day, -1), shiftDay(day, 1)]) {
    await page.goto(`/activity?desde=${other}&hasta=${other}&entidad=inventario&accion=stock_in`);
    await settled(page);
    await expect(eventsOf(page, label)).toHaveCount(0);
  }

  // Un rango que abarca el día anterior y el posterior lo contiene.
  await page.goto(
    `/activity?desde=${shiftDay(day, -1)}&hasta=${shiftDay(day, 1)}&entidad=inventario&accion=stock_in`,
  );
  await expect(eventsOf(page, label)).toHaveCount(1);

  // Día lejano: estado vacío explícito.
  await page.goto('/activity?desde=2001-01-01&hasta=2001-01-02');
  await expect(page.getByRole('heading', { name: 'No hay actividad que coincida' })).toBeVisible();

  // Rango incoherente: aviso y sin resultados.
  await page.goto(`/activity?desde=${shiftDay(day, 1)}&hasta=${day}`);
  await expect(page.getByText(/fecha inicial es posterior/)).toBeVisible();
  await expect(log(page)).toHaveCount(0);

  // Parámetros inválidos: se ignoran, sin error.
  const response = await page.goto(
    '/activity?entidad=x%27%3B--&accion=drop&desde=2026-02-30&pagina=-9',
  );
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Actividad' })).toBeVisible();
});

test('orden: los eventos van del mas reciente al mas antiguo', async ({ page }) => {
  const label = `O${world.run}`;
  await seedActivity(world.ownerA, world.orgA.id, label);
  await loginAs(page, world.ownerA);
  await page.goto('/activity');

  // Se espera a los dos eventos del caso (alta y entrada) antes de leer fechas y posiciones.
  await expect(eventsOf(page, label)).toHaveCount(2);
  const times = await datetimes(page);
  expect(times.length).toBeGreaterThanOrEqual(2);
  expect(times.every(Number.isFinite)).toBe(true);
  expect([...times].sort((a, b) => b - a)).toEqual(times);
  // La entrada se registró después del alta: aparece antes en el listado.
  const text = await log(page).innerText();
  expect(text.indexOf('Entrada de stock')).toBeGreaterThanOrEqual(0);
  expect(text.indexOf('Entrada de stock')).toBeLessThan(text.indexOf('Artículo creado'));
});

test('paginacion real: 20 eventos por pagina y segunda pagina con el mas antiguo', async ({
  page,
}) => {
  // Organización B: 21 entradas (+101 ... +121) de un mismo artículo de este caso.
  const label = `P${world.run}`;
  const owner = await signedIn(world.ownerB);
  const item = randomUUID();
  const created = await owner.rpc('create_inventory_item', {
    p_id: item,
    p_reference: `ACT-${label}`,
    p_name: `Articulo ${label}`,
    p_description: null,
    p_unit: 'ud',
    p_low_stock_threshold: 0,
  });
  if (created.error) throw new Error('Preparacion fallida (articulo de paginacion)');
  for (let quantity = 101; quantity <= 121; quantity += 1) {
    const moved = await owner.rpc('record_stock_movement', {
      p_request_id: randomUUID(),
      p_item_id: item,
      p_kind: 'in',
      p_quantity: quantity,
      p_order_id: null,
      p_note: null,
    });
    if (moved.error) throw new Error('Preparacion fallida (movimiento de paginacion)');
  }
  await loginAs(page, world.ownerB);
  const pager = page.getByRole('navigation', { name: 'Paginación' });

  // Página 1: PAGE_SIZE = 20 eventos, del más reciente (+121) al +102.
  await page.goto('/activity?entidad=inventario&accion=stock_in');
  await expect(pager.getByText(/^Página 1 de \d+/)).toBeVisible();
  const first = eventsOf(page, label);
  await expect(first).toHaveCount(20);
  await expect(first.first()).toContainText('+121 ud');
  await expect(first.last()).toContainText('+102 ud');
  await expect(pager.getByRole('link', { name: 'Siguiente' })).toBeVisible();
  const firstTimes = await datetimes(page);
  expect([...firstTimes].sort((a, b) => b - a)).toEqual(firstTimes);

  // Página 2 (por el enlace Siguiente): empieza por la entrada más antigua (+101).
  await pager.getByRole('link', { name: 'Siguiente' }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(pager.getByText(/^Página 2 de \d+/)).toBeVisible();
  const second = eventsOf(page, label);
  await expect(second).toHaveCount(1);
  await expect(second).toContainText('+101 ud');
  await expect(pager.getByRole('link', { name: 'Anterior' })).toBeVisible();
});

test('aislamiento: otra organizacion no ve la actividad ajena y su vista vacia es explicita', async ({
  page,
}) => {
  const label = `I${world.run}`;
  const own = `J${world.run}`;
  await seedActivity(world.ownerA, world.orgA.id, label);
  await seedActivity(world.ownerB, world.orgB.id, own);
  await loginAs(page, world.ownerB);

  for (const path of ['/activity', '/activity?entidad=inventario']) {
    await page.goto(path);
    // Control: la organización B ve su propia actividad antes de comprobar la ausencia ajena.
    await expect(eventsOf(page, own)).toHaveCount(2);
    await expect(page.getByText(`Articulo ${label}`)).toHaveCount(0);
  }
});

test('sin sesion /activity redirige al inicio de sesion', async ({ page }) => {
  await page.goto('/activity');
  await expect(page).toHaveURL(/\/login/);
});
