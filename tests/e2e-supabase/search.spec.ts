import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { requireLocalSupabaseEnv } from '../support/local-supabase';
import { getCrmWorld, loginAs, type CrmWorld } from './support/crm-world';

// TASK-014 / C7: búsqueda por nombre de cliente en órdenes y presupuestos contra PostgREST real
// (embed vacío + OR sobre el embed). Con más de 100 clientes coincidentes comprueba que no hay tope,
// que el recuento y la paginación cuadran, que el OR conserva la búsqueda por título, los comodines
// literales, el cruce con otros filtros y el aislamiento entre organizaciones.

const MATCHING = 105;
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

let world: CrmWorld;
let term: string;

async function inBatches<T>(items: readonly T[], run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += 15) await Promise.all(items.slice(i, i + 15).map(run));
}

async function insertCustomers(admin: SupabaseClient, names: readonly string[]) {
  const created = await admin
    .from('customers')
    .insert(names.map((name) => ({ organization_id: world.orgA.id, name })))
    .select('id, name');
  if (created.error || !created.data) throw new Error('Preparacion fallida (clientes)');
  return new Map(created.data.map((row) => [String(row.name), String(row.id)]));
}

test.beforeAll(async () => {
  test.setTimeout(240_000);
  world = await getCrmWorld('search');
  term = `Zq${world.run}`;
  const { url, anonKey, serviceKey } = requireLocalSupabaseEnv();
  const admin = createClient(url, serviceKey, authOptions);
  const owner = createClient(url, anonKey, authOptions);
  const signedIn = await owner.auth.signInWithPassword({
    email: world.ownerA.email,
    password: world.ownerA.password,
  });
  if (signedIn.error) throw new Error('Preparacion fallida (login)');

  const matching = Array.from({ length: MATCHING }, (_, i) => `Cliente ${term} ${i + 1}`);
  const other = `Ajeno ${world.run}`;
  const literal = `Literal ${world.run} 50%_x`;
  const decoy = `Literal ${world.run} 50abx`;
  const ids = await insertCustomers(admin, [...matching, other, literal, decoy]);

  const rows = [
    ...matching.map((name, i) => ({ customer: name, title: `Trabajo ${i + 1}` })),
    { customer: other, title: `Titulo con ${term}` }, // coincide solo por titulo
    { customer: other, title: 'Sin coincidencia' },
    { customer: literal, title: 'Trabajo literal' },
    { customer: decoy, title: 'Trabajo senuelo' },
  ];
  await inBatches(rows, async ({ customer, title }) => {
    const order = await owner.rpc('create_work_order', {
      p_id: randomUUID(),
      p_customer_id: ids.get(customer),
      p_title: title,
      p_description: null,
      p_priority: 'normal',
      p_scheduled_date: '2026-12-01',
      p_technician_id: null,
    });
    const quote = await owner.rpc('create_quote', {
      p_id: randomUUID(),
      p_customer_id: ids.get(customer),
      p_title: title,
      p_description: null,
    });
    if (order.error || quote.error) throw new Error('Preparacion fallida (orden o presupuesto)');
  });
});

const pager = (page: Page) => page.getByRole('navigation', { name: 'Paginación' });
const dataRows = (page: Page) => page.getByRole('table').locator('tbody tr');

for (const list of [
  { path: '/orders', status: 'estado=pending', empty: 'No hay órdenes que coincidan' },
  { path: '/quotes', status: 'estado=draft', empty: 'No hay presupuestos que coincidan' },
]) {
  test(`${list.path}: busqueda por cliente sin tope, con recuento y paginacion`, async ({
    page,
  }) => {
    await loginAs(page, world.ownerA);
    // 105 por nombre de cliente (sin distinguir mayusculas) + 1 por titulo.
    const query = `q=${encodeURIComponent(term.toUpperCase())}`;
    await page.goto(`${list.path}?${query}`);
    await expect(pager(page)).toContainText('Página 1 de 6');
    await expect(pager(page)).toContainText(/· 106 /);
    await expect(dataRows(page)).toHaveCount(20);

    await page.goto(`${list.path}?${query}&${list.status}&pagina=6`);
    await expect(pager(page)).toContainText('Página 6 de 6');
    await expect(dataRows(page)).toHaveCount(6);
    await expect(page.getByRole('table').getByText('Sin coincidencia')).toHaveCount(0);

    // Comodines literales: solo el cliente que contiene "50%_x".
    await page.goto(`${list.path}?q=${encodeURIComponent(`${world.run} 50%_x`)}`);
    await expect(pager(page)).toContainText(/· 1 /);
    await expect(dataRows(page)).toHaveCount(1);
    await expect(page.getByRole('table').getByText('Trabajo literal')).toBeVisible();

    // Otra organizacion no encuentra nada.
    await page.context().clearCookies();
    await loginAs(page, world.ownerB);
    await page.goto(`${list.path}?${query}`);
    await expect(page.getByRole('heading', { name: list.empty })).toBeVisible();
  });
}
