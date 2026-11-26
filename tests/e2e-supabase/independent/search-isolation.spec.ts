import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { requireLocalSupabaseEnv } from '../../support/local-supabase';
import { getCrmWorld, loginAs, type CrmUser, type CrmWorld } from '../support/crm-world';

// TASK-014 / C7 (Testing): la busqueda por cliente (OR sobre un recurso embebido) con datos en LAS
// DOS organizaciones y el mismo nombre de cliente. Comprueba que cada una ve solo lo suyo y que un
// termino sin coincidencias no devuelve todo el listado. Solo stack local; los datos se crean con
// sesiones de usuario (RLS), sin clave de servicio fuera de la preparacion del mundo.

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

let world: CrmWorld;
let shared: string;

async function seed(user: CrmUser, organizationId: string, title: string) {
  const { url, anonKey } = requireLocalSupabaseEnv();
  const client = createClient(url, anonKey, authOptions);
  const signedIn = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signedIn.error) throw new Error('Preparacion fallida (login)');
  const customer = await client
    .from('customers')
    .insert({ organization_id: organizationId, name: shared })
    .select('id')
    .single();
  if (customer.error || !customer.data) throw new Error('Preparacion fallida (cliente)');
  const order = await client.rpc('create_work_order', {
    p_id: randomUUID(),
    p_customer_id: customer.data.id,
    p_title: title,
    p_description: null,
    p_priority: 'normal',
    p_scheduled_date: '2026-12-01',
    p_technician_id: null,
  });
  const quote = await client.rpc('create_quote', {
    p_id: randomUUID(),
    p_customer_id: customer.data.id,
    p_title: title,
    p_description: null,
  });
  if (order.error || quote.error) throw new Error('Preparacion fallida (orden o presupuesto)');
}

const alfa = () => `Trabajo alfa ${world.run}`;
const beta = () => `Trabajo beta ${world.run}`;

test.beforeAll(async () => {
  world = await getCrmWorld('search-iso');
  shared = `Compartido ${world.run}`;
  await seed(world.ownerA, world.orgA.id, alfa());
  await seed(world.ownerB, world.orgB.id, beta());
});

async function expectOnly(page: Page, path: string, own: string, foreign: string) {
  await page.goto(`${path}?q=${encodeURIComponent(shared)}`);
  await expect(page.getByRole('navigation', { name: 'Paginación' })).toContainText(/· 1 /);
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('table').getByText(own)).toBeVisible();
  await expect(page.getByText(foreign)).toHaveCount(0);
}

for (const list of [
  { path: '/orders', empty: 'No hay órdenes que coincidan' },
  { path: '/quotes', empty: 'No hay presupuestos que coincidan' },
]) {
  test(`${list.path}: mismo nombre de cliente en dos organizaciones y termino sin coincidencias`, async ({
    page,
  }) => {
    await loginAs(page, world.ownerA);
    await expectOnly(page, list.path, alfa(), beta());

    await page.goto(`${list.path}?q=${encodeURIComponent(`Inexistente ${world.run}`)}`);
    await expect(page.getByRole('heading', { name: list.empty })).toBeVisible();
    await expect(page.getByText(alfa())).toHaveCount(0);

    await page.context().clearCookies();
    await loginAs(page, world.ownerB);
    await expectOnly(page, list.path, beta(), alfa());
  });
}
