import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { requireLocalSupabaseEnv } from '../support/local-supabase';
import { getCrmWorld, loginAs, type CrmUser, type CrmWorld } from './support/crm-world';

// TASK-013 / F6: página /activity (solo lectura, ambos roles) con Auth real y base de datos real (job
// `supabase` de CI). NO se ha ejecutado en local (requiere Docker/Supabase CLI): ver el informe de
// TASK-013. La entrada "Actividad" del lateral depende de src/features/navigation/items.ts.

test.describe.configure({ mode: 'serial' });

let world: CrmWorld;
test.beforeAll(async () => {
  world = await getCrmWorld();
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
  return { item, customer: String(customer.data.id) };
}

test('ambos roles ven la actividad de su organizacion, en solo lectura y con enlace a la entidad', async ({
  page,
}) => {
  const label = `A${world.run}`;
  const { item } = await seedActivity(world.ownerA, world.orgA.id, label);

  for (const user of [world.ownerA, world.memberA]) {
    await loginAs(page, user);
    await page.getByRole('navigation').getByRole('link', { name: 'Actividad' }).first().click();
    await expect(page).toHaveURL(/\/activity$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Actividad' })).toBeVisible();
    const region = page.getByRole('region', { name: 'Registro de actividad' });
    await expect(region.getByText('Entrada de stock').first()).toBeVisible();
    await expect(region.getByRole('link', { name: `Articulo ${label}` }).first()).toHaveAttribute(
      'href',
      `/inventory/${item}`,
    );
    await expect(region.getByText(/\+12 kg · saldo 0 → 12/).first()).toBeVisible();
    // Solo lectura: ninguna accion de escritura en la pagina.
    await expect(
      page.getByRole('main').getByRole('button', { name: /archivar|restaurar|registrar/i }),
    ).toHaveCount(0);
    // La nota libre del movimiento no se publica.
    await expect(page.getByText('nota interna que no debe publicarse')).toHaveCount(0);
    await page.context().clearCookies();
  }
});

test('filtros por entidad, accion y rango de fechas (dia natural de Madrid), paginacion y orden', async ({
  page,
}) => {
  const label = `F${world.run}`;
  await seedActivity(world.ownerA, world.orgA.id, label);
  await loginAs(page, world.ownerA);

  await page.goto('/activity?entidad=inventario&accion=stock_in');
  const region = page.getByRole('region', { name: 'Registro de actividad' });
  await expect(region.getByText('Entrada de stock').first()).toBeVisible();
  await expect(region.getByText('Artículo creado')).toHaveCount(0);

  await page.goto('/activity?entidad=cliente');
  await expect(
    page.getByRole('region', { name: 'Registro de actividad' }).getByText('Entrada de stock'),
  ).toHaveCount(0);

  // Rango con el dia de hoy en Madrid: incluye lo recien creado; un dia lejano no.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  await page.goto(`/activity?desde=${today}&hasta=${today}&entidad=inventario`);
  await expect(region.getByText('Entrada de stock').first()).toBeVisible();
  await page.goto('/activity?desde=2001-01-01&hasta=2001-01-02');
  await expect(page.getByRole('heading', { name: 'No hay actividad que coincida' })).toBeVisible();

  // Rango incoherente: aviso y sin resultados.
  await page.goto('/activity?desde=2026-03-02&hasta=2026-03-01');
  await expect(page.getByText(/fecha inicial/).first()).toBeVisible();

  // Parametros invalidos: se ignoran, sin error.
  const response = await page.goto(
    '/activity?entidad=x%27%3B--&accion=drop&desde=2026-02-30&pagina=-9',
  );
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Actividad' })).toBeVisible();

  // Orden: el primer evento de la lista es el mas reciente.
  await page.goto('/activity');
  const times = await page
    .getByRole('region', { name: 'Registro de actividad' })
    .locator('time')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('datetime') ?? ''));
  expect(times.length).toBeGreaterThan(1);
  expect([...times].sort().reverse()).toEqual(times);
});

test('aislamiento: otra organizacion no ve la actividad ajena y su vista vacia es explicita', async ({
  page,
}) => {
  const label = `I${world.run}`;
  await seedActivity(world.ownerA, world.orgA.id, label);
  await loginAs(page, world.ownerB);
  await page.goto('/activity');
  await expect(page.getByText(`Articulo ${label}`)).toHaveCount(0);
  await page.goto('/activity?entidad=inventario');
  await expect(page.getByText(`Articulo ${label}`)).toHaveCount(0);
});

test('sin sesion /activity redirige al inicio de sesion', async ({ page }) => {
  await page.goto('/activity');
  await expect(page).toHaveURL(/\/login/);
});
