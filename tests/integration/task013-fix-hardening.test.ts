// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedTwoOrgs } from '../support/fixtures';
import { createTestDb, type TestDb } from '../support/pglite';
import { orderApi } from '../support/work-orders';

// TASK-013-FIX (AUDIT-004 / G4-02, G4-03 y trazabilidad): migracion aditiva
// 20261128100000_task013_fix_orders_quotes_hardening.sql sobre PGlite con las migraciones reales.

type Row = Record<string, unknown>;

let db: TestDb;
let s: Awaited<ReturnType<typeof seedTwoOrgs>>;
let orders: ReturnType<typeof orderApi>;

const run = async (user: string, sql: string, params: unknown[] = []) =>
  (await db.asUser(user, (tx) => tx.query<Row>(sql, params))).rows;
const su = async (sql: string, params: unknown[] = []) =>
  (await db.asSuperuser((tx) => tx.query<Row>(sql, params))).rows;
/** SQL de administracion con claims de un usuario (auth.uid() fijado) pero sin cambiar de rol. */
const suAs = (user: string, sql: string, params: unknown[] = []) =>
  db.asSuperuser(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: user, role: 'authenticated' }),
    ]);
    return tx.query<Row>(sql, params);
  });
const failsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code });

const createQuote = async (user: string, customer: string) =>
  String(
    (
      await run(user, `select public.create_quote($1::uuid, $2::uuid, 'Presupuesto', null) as id`, [
        randomUUID(),
        customer,
      ])
    )[0].id,
  );
const addItem = (user: string, quote: string) =>
  run(
    user,
    `select public.add_quote_item($1::uuid, $2::uuid, 'Mano de obra', 1, 10000, 2100) as id`,
    [quote, randomUUID()],
  );
const quoteRow = async (id: string) =>
  (await su(`select * from public.quotes where id = $1`, [id]))[0];

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
  orders = orderApi(db);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe('G4-02: work_orders.id es inmutable', () => {
  it('reescribir el id se rechaza (23000), tambien con SQL de administracion, y no deja rastro', async () => {
    const order = await orders.create(s.ownerA, { customer: s.customerA });
    const other = randomUUID();
    await failsWith(
      su(`update public.work_orders set id = $1 where id = $2`, [other, order]),
      '23000',
    );
    expect(await su(`select id from public.work_orders where id = $1`, [order])).toHaveLength(1);
    expect(await su(`select id from public.work_orders where id = $1`, [other])).toHaveLength(0);
  });

  it('actualizar otros campos con el mismo id sigue funcionando', async () => {
    const order = await orders.create(s.ownerA, { customer: s.customerA });
    await su(`update public.work_orders set id = id, title = 'Nuevo titulo' where id = $1`, [
      order,
    ]);
    expect((await su(`select title from public.work_orders where id = $1`, [order]))[0].title).toBe(
      'Nuevo titulo',
    );
  });

  it('conserva el contrato de errores: TRUNCATE sigue siendo 23000 y una orden terminal NX003', async () => {
    await failsWith(su(`truncate public.work_orders`), '23000');
    const order = await orders.create(s.ownerA, { customer: s.customerA });
    await orders.cancel(s.ownerA, order, null);
    // El guard (NX003) se ejecuta antes que el trigger de id.
    await failsWith(
      su(`update public.work_orders set title = 'x' where id = $1`, [order]),
      'NX003',
    );
    await failsWith(
      su(`update public.work_orders set id = $1 where id = $2`, [randomUUID(), order]),
      'NX003',
    );
  });

  it('la funcion del trigger no es ejecutable por usuarios', async () => {
    const rows = await su(
      `select has_function_privilege('authenticated', 'private.prevent_work_order_id_change()'::regprocedure, 'execute') as a,
              has_function_privilege('anon', 'private.prevent_work_order_id_change()'::regprocedure, 'execute') as n,
              has_function_privilege('public', 'private.prevent_work_order_id_change()'::regprocedure, 'execute') as p,
              has_function_privilege('authenticated', 'private.quotes_accept_create_order()'::regprocedure, 'execute') as qa,
              has_function_privilege('public', 'private.quotes_accept_create_order()'::regprocedure, 'execute') as qp`,
    );
    expect(rows[0]).toEqual({ a: false, n: false, p: false, qa: false, qp: false });
  });
});

describe('G4-03: aceptar solo por accept_quote (SQL de administracion no lo salta)', () => {
  it('UPDATE directo a accepted de un presupuesto SIN conceptos se rechaza (NX016)', async () => {
    const quote = await createQuote(s.ownerA, s.customerA);
    const order = await orders.create(s.ownerA, { customer: s.customerA });
    await failsWith(
      suAs(
        s.ownerA,
        `update public.quotes set status = 'accepted', order_id = $1, decided_by = $2 where id = $3`,
        [order, s.ownerA, quote],
      ),
      'NX016',
    );
    expect(await quoteRow(quote)).toMatchObject({ status: 'draft', order_id: null });
  });

  it('UPDATE directo con una orden PREEXISTENTE (no creada por la aceptacion) se rechaza (23503)', async () => {
    const quote = await createQuote(s.ownerA, s.customerA);
    await addItem(s.ownerA, quote);
    const order = await orders.create(s.ownerA, { customer: s.customerA });
    await failsWith(
      suAs(
        s.ownerA,
        `update public.quotes set status = 'accepted', order_id = $1, decided_by = $2 where id = $3`,
        [order, s.ownerA, quote],
      ),
      '23503',
    );
    expect(await quoteRow(quote)).toMatchObject({ status: 'draft', order_id: null });
  });

  it('una orden ya vinculada a otro presupuesto no se reutiliza (ni por SQL de administracion)', async () => {
    const first = await createQuote(s.ownerA, s.customerA);
    await addItem(s.ownerA, first);
    const order = String(
      (await run(s.ownerA, `select public.accept_quote($1::uuid) as id`, [first]))[0].id,
    );
    const second = await createQuote(s.ownerA, s.customerA);
    await addItem(s.ownerA, second);
    await failsWith(
      suAs(
        s.ownerA,
        `update public.quotes set status = 'accepted', order_id = $1, decided_by = $2 where id = $3`,
        [order, s.ownerA, second],
      ),
      '23503',
    );
    expect(await quoteRow(second)).toMatchObject({ status: 'draft', order_id: null });
  });

  it('orden creada en la MISMA transaccion por otra via: el enlace por SQL se rechaza y no hay vinculo', async () => {
    const quote = await createQuote(s.ownerA, s.customerA);
    await addItem(s.ownerA, quote);
    await failsWith(
      db.asSuperuser(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: s.ownerA, role: 'authenticated' }),
        ]);
        const r = await tx.query<Row>(
          `select public.create_work_order(gen_random_uuid(), $1::uuid, 'Orden', null, 'normal', '2026-12-01'::date, null) as id`,
          [s.customerA],
        );
        await tx.query(
          `update public.quotes set status = 'accepted', order_id = $1::uuid, decided_by = $2::uuid where id = $3::uuid`,
          [String(r.rows[0].id), s.ownerA, quote],
        );
      }),
      '23503',
    );
    expect(await quoteRow(quote)).toMatchObject({ status: 'draft', order_id: null });
  });

  it('UPDATE directo a accepted SIN order_id genera una orden nueva con el contenido de accept_quote', async () => {
    const quote = await createQuote(s.ownerA, s.customerA);
    await addItem(s.ownerA, quote);
    await suAs(
      s.ownerA,
      `update public.quotes set status = 'accepted', decided_by = $1 where id = $2`,
      [s.ownerA, quote],
    );
    const q = await quoteRow(quote);
    expect(q.status).toBe('accepted');
    const [o] = await su(`select customer_id, description from public.work_orders where id = $1`, [
      q.order_id,
    ]);
    expect(o.customer_id).toBe(s.customerA);
    expect(String(o.description)).toContain('Origen: presupuesto PRE-');
  });

  it('un presupuesto aceptado no cambia su order_id', async () => {
    const quote = await createQuote(s.ownerA, s.customerA);
    await addItem(s.ownerA, quote);
    await run(s.ownerA, `select public.accept_quote($1::uuid) as id`, [quote]);
    const other = await orders.create(s.ownerA, { customer: s.customerA });
    await failsWith(
      suAs(s.ownerA, `update public.quotes set order_id = $1 where id = $2`, [other, quote]),
      'NX011',
    );
  });

  it('accept_quote sigue funcionando: orden nueva, enlazada, idempotente y con un unico evento accepted', async () => {
    const quote = await createQuote(s.ownerA, s.customerA);
    await addItem(s.ownerA, quote);
    const before = (await su(`select count(*)::int as n from public.work_orders`))[0].n as number;
    const order = String(
      (await run(s.memberA, `select public.accept_quote($1::uuid) as id`, [quote]))[0].id,
    );
    const again = String(
      (await run(s.ownerA, `select public.accept_quote($1::uuid) as id`, [quote]))[0].id,
    );
    expect(again).toBe(order);
    expect(await quoteRow(quote)).toMatchObject({ status: 'accepted', order_id: order });
    expect((await su(`select count(*)::int as n from public.work_orders`))[0].n).toBe(
      (before as number) + 1,
    );
    const events = await su(
      `select count(*)::int as n from public.activity_events where entity_type = 'quote' and entity_id = $1 and action = 'accepted'`,
      [quote],
    );
    expect(events[0].n).toBe(1);
  });
});

describe('trazabilidad: private.quote_label no trunca a 4 digitos', () => {
  it('conserva PRE-0001..PRE-9999 y no recorta 10000 ni mayores', async () => {
    const rows = await su(
      `select private.quote_label(n::bigint) as l from unnest(array[1, 12, 999, 9999, 10000, 10001, 123456, 99999999]) as n`,
    );
    expect(rows.map((r) => r.l)).toEqual([
      'PRE-0001',
      'PRE-0012',
      'PRE-0999',
      'PRE-9999',
      'PRE-10000',
      'PRE-10001',
      'PRE-123456',
      'PRE-99999999',
    ]);
  });

  it('la funcion conserva firma, privilegios (sin PUBLIC ni anon) y search_path vacio', async () => {
    const rows = await su(
      `select has_function_privilege('public', p.oid, 'execute') as pub,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              p.provolatile, p.proconfig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = 'quote_label'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ pub: false, anon: false, auth: true, provolatile: 'i' });
    expect(String(rows[0].proconfig)).toContain('search_path=""');
  });

  it('la descripcion de la orden aceptada usa la referencia completa con un numero > 9999 (9999 y 10000)', async () => {
    // El contador por organizacion se adelanta por SQL de administracion para no crear 10000 filas.
    await su(
      `insert into private.quote_counters (organization_id, last_number) values ($1, 9998)
       on conflict (organization_id) do update set last_number = 9998`,
      [s.orgA],
    );
    for (const expected of ['PRE-9999', 'PRE-10000', 'PRE-10001']) {
      const quote = await createQuote(s.ownerA, s.customerA);
      await addItem(s.ownerA, quote);
      const order = String(
        (await run(s.ownerA, `select public.accept_quote($1::uuid) as id`, [quote]))[0].id,
      );
      const [row] = await su(`select description from public.work_orders where id = $1`, [order]);
      expect(String(row.description)).toContain(`presupuesto ${expected}.`);
    }
  });
});
