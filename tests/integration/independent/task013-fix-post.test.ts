// @vitest-environment node
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedTwoOrgs } from '../../support/fixtures';
import { createTestDb, type TestDb } from '../../support/pglite';
import { orderApi } from '../../support/work-orders';
import { fingerprint, PATHS, readMigrations } from './support/db';

// TASK-013-FIX POST independiente (AUDIT-004 / G4). Propietario: Testing. Complementa (sin duplicar)
// tests/integration/task013-fix-hardening.test.ts e inventory-db.test.ts con PGlite (PostgreSQL real,
// UNA conexion): replay idempotente, multifila con varios articulos, vinculos de ordenes, bordes de la
// guarda de aceptacion (subtransaccion, otra organizacion, otro cliente, otro actor, UNIQUE, estado
// terminal), invariantes globales del libro y aplicacion de la migracion aditiva sobre datos
// existentes. La concurrencia entre conexiones queda en tests/integration/supabase/independent/
// task013-fix.supabase.test.ts (job `supabase` de CI).

type Row = Record<string, unknown>;

let db: TestDb;
let s: Awaited<ReturnType<typeof seedTwoOrgs>>;
let orders: ReturnType<typeof orderApi>;

const run = async (user: string, sql: string, params: unknown[] = []) =>
  (await db.asUser(user, (tx) => tx.query<Row>(sql, params))).rows;
const su = async (sql: string, params: unknown[] = []) =>
  (await db.asSuperuser((tx) => tx.query<Row>(sql, params))).rows;
/** Transaccion de administracion (sin cambiar de rol) con los claims de `user`. */
const asAdmin = <T>(user: string, fn: (tx: Transaction) => Promise<T>) =>
  db.asSuperuser(async (tx) => {
    await claims(tx, user);
    return fn(tx);
  });
const claims = (tx: Transaction, user: string) =>
  tx.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: user, role: 'authenticated' }),
  ]);
const failsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code });

const newItem = async (user: string, reference?: string) =>
  String(
    (
      await run(
        user,
        `select public.create_inventory_item($1::uuid, $2, 'Articulo', null, 'ud', 0) as id`,
        [randomUUID(), reference ?? `T13-${randomUUID().slice(0, 8)}`],
      )
    )[0].id,
  );
const move = async (
  user: string,
  item: string,
  m: { kind: 'in' | 'out' | 'consumption'; quantity: number; request?: string; order?: string },
) =>
  (
    await run(
      user,
      `select public.record_stock_movement($1::uuid, $2::uuid, $3, $4::int, $5::uuid, null) as r`,
      [m.request ?? randomUUID(), item, m.kind, m.quantity, m.order ?? null],
    )
  )[0].r as { id: string; balance: number; replayed: boolean };
const state = async (
  item: string,
): Promise<{ quantity: number; movements: number; events: number }> => ({
  quantity: (await su(`select quantity from public.inventory_items where id = $1`, [item]))[0]
    .quantity as number,
  movements: (
    await su(`select count(*)::int as n from public.stock_movements where item_id = $1`, [item])
  )[0].n as number,
  events: (
    await su(
      `select count(*)::int as n from public.activity_events
        where entity_type = 'inventory_item' and entity_id = $1`,
      [item],
    )
  )[0].n as number,
});
const chain = (item: string) =>
  su(
    `select seq, kind, quantity, balance_before, balance_after from public.stock_movements
      where item_id = $1 order by seq`,
    [item],
  );

const createQuote = async (user: string, customer: string, withItem = true) => {
  const id = String(
    (
      await run(
        user,
        `select public.create_quote($1::uuid, $2::uuid, 'Presupuesto T13', null) as id`,
        [randomUUID(), customer],
      )
    )[0].id,
  );
  if (withItem) {
    await run(
      user,
      `select public.add_quote_item($1::uuid, $2::uuid, 'Concepto', 1, 10000, 2100) as id`,
      [id, randomUUID()],
    );
  }
  return id;
};
const quote = async (id: string) =>
  (await su(`select status, order_id from public.quotes where id = $1`, [id]))[0];
const acceptSql = `update public.quotes set status = 'accepted', order_id = $1::uuid, decided_by = $2::uuid where id = $3::uuid`;

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
  orders = orderApi(db);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe('G4-01 independiente: saldo solo por filas realmente insertadas', () => {
  it('replay con la misma clave y payload devuelve el original; payload distinto NX024; ninguno toca saldo ni eventos', async () => {
    const item = await newItem(s.ownerA);
    const request = randomUUID();
    const first = await move(s.ownerA, item, { kind: 'in', quantity: 10, request });
    expect(first).toMatchObject({ balance: 10, replayed: false });
    const before = await state(item);

    const again = await move(s.memberA, item, { kind: 'in', quantity: 10, request });
    expect(again).toEqual({ id: first.id, balance: 10, replayed: true });
    expect(await state(item)).toEqual(before);

    for (const other of [
      { kind: 'in' as const, quantity: 11 },
      { kind: 'out' as const, quantity: 10 },
    ]) {
      await failsWith(move(s.ownerA, item, { ...other, request }), 'NX024');
    }
    expect(await state(item)).toEqual(before);
    expect(before).toMatchObject({ quantity: 10 });
  });

  it('INSERT multifila con dos articulos intercalados: cada cadena es coherente y el saldo coincide con la ultima fila', async () => {
    const a = await newItem(s.ownerA);
    const b = await newItem(s.ownerA);
    await move(s.ownerA, a, { kind: 'in', quantity: 8 });
    await move(s.ownerA, b, { kind: 'in', quantity: 3 });
    const n0 = { a: await state(a), b: await state(b) };
    await asAdmin(s.ownerA, (tx) =>
      tx.query(
        `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id)
         values ($1, $2, 'out', 5, gen_random_uuid()), ($1, $3, 'in', 4, gen_random_uuid()),
                ($1, $2, 'in', 2, gen_random_uuid()), ($1, $3, 'out', 7, gen_random_uuid()),
                ($1, $2, 'out', 5, gen_random_uuid())`,
        [s.orgA, a, b],
      ),
    );
    expect((await chain(a)).map((r) => [r.balance_before, r.balance_after])).toEqual([
      [0, 8],
      [8, 3],
      [3, 5],
      [5, 0],
    ]);
    expect((await chain(b)).map((r) => [r.balance_before, r.balance_after])).toEqual([
      [0, 3],
      [3, 7],
      [7, 0],
    ]);
    expect(await state(a)).toEqual({
      quantity: 0,
      movements: n0.a.movements + 3,
      events: n0.a.events + 3,
    });
    expect(await state(b)).toEqual({
      quantity: 0,
      movements: n0.b.movements + 2,
      events: n0.b.events + 2,
    });
  });

  it('multifila que sobregira el segundo articulo revierte la sentencia completa en ambos', async () => {
    const a = await newItem(s.ownerA);
    const b = await newItem(s.ownerA);
    await move(s.ownerA, a, { kind: 'in', quantity: 5 });
    await move(s.ownerA, b, { kind: 'in', quantity: 1 });
    const before = { a: await state(a), b: await state(b) };
    await failsWith(
      asAdmin(s.ownerA, (tx) =>
        tx.query(
          `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id)
           values ($1, $2, 'out', 5, gen_random_uuid()), ($1, $3, 'out', 2, gen_random_uuid())`,
          [s.orgA, a, b],
        ),
      ),
      'NX022',
    );
    expect({ a: await state(a), b: await state(b) }).toEqual(before);
  });

  it('ON CONFLICT DO NOTHING con la clave de un movimiento de OTRO articulo: ninguno de los dos cambia', async () => {
    const a = await newItem(s.ownerA);
    const b = await newItem(s.ownerA);
    const request = randomUUID();
    await move(s.ownerA, a, { kind: 'in', quantity: 6, request });
    await move(s.ownerA, b, { kind: 'in', quantity: 2 });
    const before = { a: await state(a), b: await state(b) };
    const res = await asAdmin(s.ownerA, (tx) =>
      tx.query(
        `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id)
         values ($1, $2, 'in', 50, $3) on conflict (organization_id, request_id) do nothing returning id`,
        [s.orgA, b, request],
      ),
    );
    expect(res.rows).toHaveLength(0);
    expect({ a: await state(a), b: await state(b) }).toEqual(before);
  });

  it('consumos multifila sobre una orden abierta encadenan saldos; con la orden cancelada NX023 sin cambios', async () => {
    const item = await newItem(s.ownerA);
    await move(s.ownerA, item, { kind: 'in', quantity: 10 });
    const open = await orders.create(s.ownerA, { customer: s.customerA });
    await asAdmin(s.ownerA, (tx) =>
      tx.query(
        `insert into public.stock_movements (organization_id, item_id, kind, quantity, order_id, request_id)
         values ($1, $2, 'consumption', 4, $3, gen_random_uuid()), ($1, $2, 'consumption', 3, $3, gen_random_uuid())`,
        [s.orgA, item, open],
      ),
    );
    expect((await chain(item)).map((r) => r.balance_after)).toEqual([10, 6, 3]);
    expect((await state(item)).quantity).toBe(3);

    await orders.cancel(s.ownerA, open, null);
    const before = await state(item);
    await failsWith(
      move(s.ownerA, item, { kind: 'consumption', quantity: 1, order: open }),
      'NX023',
    );
    expect(await state(item)).toEqual(before);
  });

  it('el saldo no se edita ni queda negativo por UPDATE directo (administracion incluida)', async () => {
    const item = await newItem(s.ownerA);
    await move(s.ownerA, item, { kind: 'in', quantity: 4 });
    const before = await state(item);
    for (const set of ['quantity = -1', 'quantity = quantity + 1', 'quantity = 0']) {
      await expect(
        asAdmin(s.ownerA, (tx) =>
          tx.query(`update public.inventory_items set ${set} where id = $1`, [item]),
        ),
      ).rejects.toMatchObject({ code: expect.stringMatching(/^(23000|23514)$/) });
    }
    await expect(
      db.asUser(s.ownerA, (tx) =>
        tx.query(`update public.inventory_items set quantity = 99 where id = $1`, [item]),
      ),
    ).rejects.toThrow();
    expect(await state(item)).toEqual(before);
  });

  it('el libro es inmutable: UPDATE de balance_after de un movimiento y borrado se rechazan', async () => {
    const item = await newItem(s.ownerA);
    await move(s.ownerA, item, { kind: 'in', quantity: 4 });
    await failsWith(
      su(`update public.stock_movements set balance_after = 999 where item_id = $1`, [item]),
      '23000',
    );
    await failsWith(su(`delete from public.stock_movements where item_id = $1`, [item]), '23000');
    expect((await state(item)).quantity).toBe(4);
  });
});

describe('G4-02 independiente: id de orden inmutable con vinculos reales', () => {
  it('una orden con consumo y presupuesto aceptado: el id no se reescribe y ambos vinculos siguen resolviendo', async () => {
    const q = await createQuote(s.ownerA, s.customerA);
    const order = String(
      (await run(s.ownerA, `select public.accept_quote($1::uuid) as id`, [q]))[0].id,
    );
    const item = await newItem(s.ownerA);
    await move(s.ownerA, item, { kind: 'in', quantity: 5 });
    await move(s.ownerA, item, { kind: 'consumption', quantity: 2, order });

    await failsWith(
      su(`update public.work_orders set id = $1 where id = $2`, [randomUUID(), order]),
      '23000',
    );
    // Tambien dentro de un UPDATE multifila que no cambia el id de las demas.
    await failsWith(
      su(
        `update public.work_orders set id = case when id = $1 then gen_random_uuid() else id end
          where organization_id = $2`,
        [order, s.orgA],
      ),
      '23000',
    );
    const linked = await su(
      `select (select count(*)::int from public.work_orders w where w.id = q.order_id) as orders,
              (select count(*)::int from public.stock_movements m where m.order_id = q.order_id) as moves
         from public.quotes q where q.id = $1`,
      [q],
    );
    expect(linked[0]).toEqual({ orders: 1, moves: 1 });
    expect((await quote(q)).order_id).toBe(order);
  });
});

describe('G4-03 independiente: bordes de la guarda de aceptacion', () => {
  it('presupuesto ya aceptado: cambiar su order_id por SQL se rechaza (solo lectura, NX011)', async () => {
    const q = await createQuote(s.ownerA, s.customerA);
    const order = String(
      (await run(s.ownerA, `select public.accept_quote($1::uuid) as id`, [q]))[0].id,
    );
    const other = await orders.create(s.ownerA, { customer: s.customerA });
    await failsWith(
      asAdmin(s.ownerA, (tx) =>
        tx.query(`update public.quotes set order_id = $1 where id = $2`, [other, q]),
      ),
      'NX011',
    );
    expect((await quote(q)).order_id).toBe(order);
  });

  it('INSERT directo con status accepted o con order_id se rechaza (NX012)', async () => {
    await failsWith(
      asAdmin(s.ownerA, async (tx) => {
        const order = await tx.query<Row>(
          `select public.create_work_order(gen_random_uuid(), $1::uuid, 'O', null, 'normal', '2026-12-01'::date, null) as id`,
          [s.customerA],
        );
        await tx.query(
          `insert into public.quotes (organization_id, number, customer_id, title, status, order_id, decided_at, decided_by)
           values ($1, 900001, $2, 'Directo', 'accepted', $3::uuid, now(), $4::uuid)`,
          [s.orgA, s.customerA, String(order.rows[0].id), s.ownerA],
        );
      }),
      'NX012',
    );
  });

  it('orden creada en la misma transaccion pero de OTRO cliente se rechaza (23503)', async () => {
    const q = await createQuote(s.ownerA, s.customerA);
    const customer2 = randomUUID();
    await su(
      `insert into public.customers (id, organization_id, name) values ($1, $2, 'Cliente dos')`,
      [customer2, s.orgA],
    );
    await failsWith(
      asAdmin(s.ownerA, async (tx) => {
        const o = await tx.query<Row>(
          `select public.create_work_order(gen_random_uuid(), $1::uuid, 'O2', null, 'normal', '2026-12-01'::date, null) as id`,
          [customer2],
        );
        await tx.query(acceptSql, [String(o.rows[0].id), s.ownerA, q]);
      }),
      '23503',
    );
    expect((await quote(q)).status).toBe('draft');
  });

  it('orden de OTRA organizacion creada en la misma transaccion se rechaza (23503)', async () => {
    const q = await createQuote(s.ownerA, s.customerA);
    await failsWith(
      asAdmin(s.ownerB, async (tx) => {
        const o = await tx.query<Row>(
          `select public.create_work_order(gen_random_uuid(), $1::uuid, 'OB', null, 'normal', '2026-12-01'::date, null) as id`,
          [s.customerB],
        );
        await claims(tx, s.ownerA);
        await tx.query(acceptSql, [String(o.rows[0].id), s.ownerA, q]);
      }),
      '23503',
    );
    expect((await quote(q)).status).toBe('draft');
  });

  it('orden creada por OTRO actor en la misma transaccion se rechaza (23503): el evento created debe ser del actor actual', async () => {
    const q = await createQuote(s.ownerA, s.customerA);
    await failsWith(
      asAdmin(s.memberA, async (tx) => {
        const o = await tx.query<Row>(
          `select public.create_work_order(gen_random_uuid(), $1::uuid, 'OM', null, 'normal', '2026-12-01'::date, null) as id`,
          [s.customerA],
        );
        await claims(tx, s.ownerA);
        await tx.query(acceptSql, [String(o.rows[0].id), s.ownerA, q]);
      }),
      '23503',
    );
    expect((await quote(q)).status).toBe('draft');
  });

  it('una orden creada dentro de un SAVEPOINT no cumple la condicion: falla cerrado (23503), documentado', async () => {
    const q = await createQuote(s.ownerA, s.customerA);
    await failsWith(
      asAdmin(s.ownerA, async (tx) => {
        await tx.exec('savepoint sp');
        const o = await tx.query<Row>(
          `select public.create_work_order(gen_random_uuid(), $1::uuid, 'OS', null, 'normal', '2026-12-01'::date, null) as id`,
          [s.customerA],
        );
        await tx.exec('release savepoint sp');
        await tx.query(acceptSql, [String(o.rows[0].id), s.ownerA, q]);
      }),
      '23503',
    );
    expect((await quote(q)).status).toBe('draft');
  });

  it('dos presupuestos no pueden compartir una orden creada en la misma transaccion (23503: el trigger rechaza antes que UNIQUE)', async () => {
    // Antes de G4-03 (xmin) esto llegaba al indice UNIQUE (23505). Ahora cualquier order_id suministrado
    // se rechaza en el trigger de aceptacion (23503), que se ejecuta antes de la comprobacion del indice.
    // El indice sigue existiendo como defensa en profundidad (se comprueba abajo).
    const q1 = await createQuote(s.ownerA, s.customerA);
    const q2 = await createQuote(s.ownerA, s.customerA);
    await failsWith(
      asAdmin(s.ownerA, async (tx) => {
        const o = await tx.query<Row>(`select public.accept_quote($1::uuid) as id`, [q1]);
        await tx.query(acceptSql, [String(o.rows[0].id), s.ownerA, q2]);
      }),
      '23503',
    );
    expect((await quote(q1)).status).toBe('draft'); // la transaccion entera se revirtio
    expect((await quote(q2)).status).toBe('draft');
    const idx = await su(
      `select 1 from pg_constraint where conrelid = 'public.quotes'::regclass
        and conname = 'quotes_order_id_key' and contype = 'u'`,
    );
    expect(idx).toHaveLength(1);
  });

  it('sin actor (claims vacios) no se acepta por SQL: 23000', async () => {
    const q = await createQuote(s.ownerA, s.customerA);
    await failsWith(
      su(
        `update public.quotes set status = 'accepted', order_id = gen_random_uuid(), decided_by = $1 where id = $2`,
        [s.ownerA, q],
      ),
      '23000',
    );
    expect((await quote(q)).status).toBe('draft');
  });

  it('rechazar un presupuesto vacio sigue permitido y aceptar por la via normal sigue creando UNA orden', async () => {
    const empty = await createQuote(s.ownerA, s.customerA, false);
    expect((await run(s.ownerA, `select public.reject_quote($1::uuid) as r`, [empty]))[0].r).toBe(
      true,
    );
    expect((await quote(empty)).status).toBe('rejected');
    await failsWith(run(s.ownerA, `select public.accept_quote($1::uuid) as id`, [empty]), 'NX012');

    const full = await createQuote(s.memberA, s.customerA);
    const n0 = (await su(`select count(*)::int as n from public.work_orders`))[0].n as number;
    const a = (await run(s.memberA, `select public.accept_quote($1::uuid) as id`, [full]))[0].id;
    const b = (await run(s.ownerA, `select public.accept_quote($1::uuid) as id`, [full]))[0].id;
    expect(b).toBe(a);
    expect((await su(`select count(*)::int as n from public.work_orders`))[0].n).toBe(n0 + 1);
  });

  it('accept_quote de un presupuesto vacio: NX016 y sin orden huerfana', async () => {
    const empty = await createQuote(s.ownerA, s.customerA, false);
    const n0 = (await su(`select count(*)::int as n from public.work_orders`))[0].n as number;
    await failsWith(run(s.ownerA, `select public.accept_quote($1::uuid) as id`, [empty]), 'NX016');
    expect((await su(`select count(*)::int as n from public.work_orders`))[0].n).toBe(n0);
  });
});

describe('G4-03 / FIX-2 independiente: la aceptacion crea EXACTAMENTE la orden (trigger quotes_accept_create_order)', () => {
  const orderCount = async () =>
    (await su(`select count(*)::int as n from public.work_orders`))[0].n as number;
  const orderEvents = async () =>
    (
      await su(
        `select count(*)::int as n from public.activity_events where entity_type = 'work_order'`,
      )
    )[0].n as number;
  const snapshot = async () => ({ orders: await orderCount(), events: await orderEvents() });
  const quoteFull = async (id: string) =>
    (await su(`select * from public.quotes where id = $1`, [id]))[0];
  const orderShape = async (id: string) =>
    (
      await su(
        `select organization_id, customer_id, title, priority, status, technician_id, scheduled_date::text as scheduled_date
           from public.work_orders where id = $1`,
        [id],
      )
    )[0];
  const adminAccept = (user: string, id: string, extra = '') =>
    asAdmin(user, (tx) =>
      tx.query(
        `update public.quotes set status = 'accepted', decided_by = $1::uuid ${extra} where id = $2::uuid`,
        [user, id],
      ),
    );

  it('accept_quote: una orden con cliente, organizacion, actor, titulo, descripcion PRE-n e importe; un unico evento por entidad; idempotente', async () => {
    const q = await createQuote(s.memberA, s.customerA);
    const before = await snapshot();
    const order = String(
      (await run(s.memberA, `select public.accept_quote($1::uuid) as id`, [q]))[0].id,
    );
    const qr = await quoteFull(q);
    expect(qr).toMatchObject({
      status: 'accepted',
      order_id: order,
      decided_by: s.memberA,
      total_cents: 12100,
    });
    expect(await snapshot()).toEqual({ orders: before.orders + 1, events: before.events + 1 });
    const [o] = await su(`select * from public.work_orders where id = $1`, [order]);
    expect(o).toMatchObject({
      organization_id: s.orgA,
      customer_id: s.customerA,
      title: 'Presupuesto T13',
      priority: 'normal',
      status: 'pending',
      technician_id: null,
      description: `Origen: presupuesto PRE-${String(qr.number).padStart(4, '0')}. Importe total (IVA incluido): 121,00 EUR.`,
    });
    const ev = await su(
      `select actor_id, action from public.activity_events where entity_type = 'work_order' and entity_id = $1`,
      [order],
    );
    expect(ev).toEqual([{ actor_id: s.memberA, action: 'created' }]);
    // Segunda aceptacion (otro actor): misma orden, sin orden ni eventos nuevos.
    const after = await snapshot();
    const again = String(
      (await run(s.ownerA, `select public.accept_quote($1::uuid) as id`, [q]))[0].id,
    );
    expect(again).toBe(order);
    expect(await snapshot()).toEqual(after);
    expect(
      (
        await su(
          `select count(*)::int as n from public.activity_events where entity_type = 'quote' and entity_id = $1 and action = 'accepted'`,
          [q],
        )
      )[0].n,
    ).toBe(1);
  });

  it('UPDATE administrativo a accepted SIN order_id: orden NUEVA equivalente a la de accept_quote; no reutiliza una orden independiente de la misma transaccion', async () => {
    const viaApi = await createQuote(s.ownerA, s.customerA);
    const viaSql = await createQuote(s.ownerA, s.customerA);
    const apiOrder = String(
      (await run(s.ownerA, `select public.accept_quote($1::uuid) as id`, [viaApi]))[0].id,
    );
    const before = await orderCount();
    let independent = '';
    await asAdmin(s.ownerA, async (tx) => {
      const o = await tx.query<Row>(
        `select public.create_work_order(gen_random_uuid(), $1::uuid, 'Independiente', null, 'normal', '2026-12-01'::date, null) as id`,
        [s.customerA],
      );
      independent = String(o.rows[0].id);
      await tx.query(
        `update public.quotes set status = 'accepted', decided_by = $1::uuid where id = $2::uuid`,
        [s.ownerA, viaSql],
      );
    });
    const linked = String((await quote(viaSql)).order_id);
    expect(linked).not.toBe(independent);
    expect(linked).not.toBe(apiOrder);
    expect(await orderCount()).toBe(before + 2); // la independiente + la generada por la aceptacion
    expect(await orderShape(linked)).toEqual(await orderShape(apiOrder));
    const desc = async (id: string) =>
      String(
        (await su(`select description from public.work_orders where id = $1`, [id]))[0].description,
      );
    const label = async (id: string) =>
      `PRE-${String((await quoteFull(id)).number).padStart(4, '0')}`;
    expect((await desc(linked)).replace(await label(viaSql), 'PRE-X')).toBe(
      (await desc(apiOrder)).replace(await label(viaApi), 'PRE-X'),
    );
    // La orden independiente sigue sin vinculo con ningun presupuesto.
    expect(
      (
        await su(`select count(*)::int as n from public.quotes where order_id = $1`, [independent])
      )[0].n,
    ).toBe(0);
  });

  it('order_id suministrado en cualquier transicion de un borrador (accepted, rejected, draft): rechazo sin orden huerfana; en un aceptado NX011', async () => {
    const q = await createQuote(s.ownerA, s.customerA);
    const other = await orders.create(s.ownerA, { customer: s.customerA });
    const before = await snapshot();
    await failsWith(adminAccept(s.ownerA, q, `, order_id = '${other}'::uuid`), '23503');
    await failsWith(
      asAdmin(s.ownerA, (tx) =>
        tx.query(
          `update public.quotes set status = 'rejected', decided_by = $1::uuid, order_id = $2::uuid where id = $3::uuid`,
          [s.ownerA, other, q],
        ),
      ),
      '23503',
    );
    await failsWith(
      asAdmin(s.ownerA, (tx) =>
        tx.query(`update public.quotes set order_id = $1::uuid where id = $2::uuid`, [other, q]),
      ),
      '23503',
    );
    expect(await quote(q)).toMatchObject({ status: 'draft', order_id: null });
    expect(await snapshot()).toEqual(before);
    await run(s.ownerA, `select public.accept_quote($1::uuid)`, [q]);
    await failsWith(
      asAdmin(s.ownerA, (tx) =>
        tx.query(`update public.quotes set order_id = null where id = $1::uuid`, [q]),
      ),
      'NX011',
    );
  });

  it('rollback total: si falla una guarda posterior a la creacion de la orden no queda orden, evento ni cambio de estado', async () => {
    const q = await createQuote(s.ownerA, s.customerA);
    const before = await snapshot();
    const quoteEvents = async () =>
      (
        await su(`select count(*)::int as n from public.activity_events where entity_id = $1`, [q])
      )[0].n as number;
    const qe = await quoteEvents();
    // quotes_guard (posterior al trigger de aceptacion) rechaza el cambio de titulo: NX011.
    await failsWith(adminAccept(s.ownerA, q, `, title = 'Otro titulo'`), 'NX011');
    // decided_by distinto del actor: 23000.
    await failsWith(
      asAdmin(s.ownerA, (tx) =>
        tx.query(
          `update public.quotes set status = 'accepted', decided_by = $1::uuid where id = $2::uuid`,
          [s.memberA, q],
        ),
      ),
      '23000',
    );
    // Un fallo posterior en la misma transaccion revierte la aceptacion ya hecha.
    await failsWith(
      asAdmin(s.ownerA, async (tx) => {
        await tx.query(`select public.accept_quote($1::uuid)`, [q]);
        await tx.query(`select 1/0`);
      }),
      '22012',
    );
    expect(await quote(q)).toMatchObject({ status: 'draft', order_id: null });
    expect(await snapshot()).toEqual(before);
    expect(await quoteEvents()).toBe(qe);
  });

  it('presupuesto vacio: NX016 por accept_quote y por UPDATE administrativo, sin orden ni cambios', async () => {
    const empty = await createQuote(s.ownerA, s.customerA, false);
    const before = await snapshot();
    await failsWith(run(s.ownerA, `select public.accept_quote($1::uuid)`, [empty]), 'NX016');
    await failsWith(adminAccept(s.ownerA, empty), 'NX016');
    expect(await quote(empty)).toMatchObject({ status: 'draft', order_id: null });
    expect(await snapshot()).toEqual(before);
  });

  it('sin actor o con un actor de otra organizacion el UPDATE administrativo no genera orden', async () => {
    const q = await createQuote(s.ownerA, s.customerA);
    const before = await snapshot();
    await failsWith(
      su(`update public.quotes set status = 'accepted', decided_by = $1 where id = $2`, [
        s.ownerA,
        q,
      ]),
      '23000',
    );
    await failsWith(adminAccept(s.ownerB, q), '23503');
    await failsWith(run(s.ownerB, `select public.accept_quote($1::uuid)`, [q]), 'NX010');
    expect(await quote(q)).toMatchObject({ status: 'draft', order_id: null });
    expect(await snapshot()).toEqual(before);
  });

  it('permisos: trigger sin EXECUTE para public/anon/authenticated, SECURITY DEFINER, search_path vacio; accept_quote conserva privilegios; sin xmin ni GUC; sin UPDATE directo', async () => {
    const [f] = await su(
      `select has_function_privilege('public', p.oid, 'execute') as pub,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as def
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = 'quotes_accept_create_order'`,
    );
    expect(f).toMatchObject({ pub: false, anon: false, auth: false, prosecdef: true });
    expect(String(f.proconfig)).toContain('search_path=""');
    expect(String(f.def)).not.toMatch(/xmin|set_config|current_setting/i);
    expect(await su(`select 1 from pg_proc where proname = 'quotes_guard_accept'`)).toHaveLength(0);
    const [a] = await su(
      `select has_function_privilege('anon', 'private.accept_quote(uuid)'::regprocedure, 'execute') as anon,
              has_function_privilege('authenticated', 'private.accept_quote(uuid)'::regprocedure, 'execute') as auth,
              has_function_privilege('anon', 'public.accept_quote(uuid)'::regprocedure, 'execute') as panon,
              has_function_privilege('authenticated', 'public.accept_quote(uuid)'::regprocedure, 'execute') as pauth`,
    );
    expect(a).toEqual({ anon: false, auth: true, panon: false, pauth: true });
    const q = await createQuote(s.ownerA, s.customerA);
    await expect(
      db.asUser(s.ownerA, (tx) =>
        tx.query(`update public.quotes set status = 'accepted' where id = $1`, [q]),
      ),
    ).rejects.toThrow();
    expect(await quote(q)).toMatchObject({ status: 'draft', order_id: null });
  });
});

describe('invariantes globales del libro de inventario (tras todo lo anterior)', () => {
  it('saldo = ultimo balance_after = entradas - salidas, nunca negativo; 1 detalle y 1 evento por movimiento', async () => {
    const bad = await su(
      `select i.id,
              i.quantity,
              coalesce((select m.balance_after from public.stock_movements m
                         where m.item_id = i.id order by m.seq desc limit 1), 0) as last_balance,
              coalesce((select sum(case when m.kind = 'in' then m.quantity else -m.quantity end)
                          from public.stock_movements m where m.item_id = i.id), 0)::int as net
         from public.inventory_items i
        where i.quantity < 0
           or i.quantity <> coalesce((select m.balance_after from public.stock_movements m
                         where m.item_id = i.id order by m.seq desc limit 1), 0)
           or i.quantity <> coalesce((select sum(case when m.kind = 'in' then m.quantity else -m.quantity end)
                          from public.stock_movements m where m.item_id = i.id), 0)`,
    );
    expect(bad).toEqual([]);
    const gaps = await su(
      `select m.id from public.stock_movements m
        where m.balance_after < 0
           or m.balance_after <> m.balance_before + case when m.kind = 'in' then m.quantity else -m.quantity end
           or (select count(*) from public.inventory_event_details d where d.movement_id = m.id) <> 1`,
    );
    expect(gaps).toEqual([]);
    const totals = await su(
      `select (select count(*)::int from public.stock_movements) as movements,
              (select count(*)::int from public.activity_events e
                where e.entity_type = 'inventory_item' and e.action in ('stock_in', 'stock_out', 'stock_consumed')) as events`,
    );
    expect(totals[0].movements).toBe(totals[0].events);
  });
});

describe('migracion aditiva 20261128100000 sobre datos existentes', () => {
  const LAST = '20261128100000';
  let pg: PGlite;
  let wrapped: TestDb;
  let ids: Awaited<ReturnType<typeof seedTwoOrgs>>;
  let acceptedQuote: string;
  let draftQuote: string;

  beforeAll(async () => {
    pg = new PGlite();
    await pg.waitReady;
    await pg.exec(await readFile(PATHS.shim, 'utf8'));
    const all = await readMigrations();
    for (const m of all.filter((x) => x.version < LAST)) await pg.exec(m.sql);
    const base = (tx: Transaction) => tx;
    wrapped = {
      asSuperuser: (fn) => pg.transaction((tx) => fn(base(tx))),
      asUser: (user, fn) =>
        pg.transaction(async (tx) => {
          await claims(tx, user);
          await tx.exec('set local role authenticated');
          return fn(tx);
        }),
      asAnon: (fn) =>
        pg.transaction(async (tx) => {
          await tx.exec('set local role anon');
          return fn(tx);
        }),
      close: () => pg.close(),
    };
    ids = await seedTwoOrgs(wrapped);
    const api = orderApi(wrapped);
    const as = (user: string, sql: string, params: unknown[]) =>
      wrapped.asUser(user, (tx) => tx.query<Row>(sql, params)).then((r) => r.rows);
    const mk = async (withItem: boolean) => {
      const id = String(
        (
          await as(
            ids.ownerA,
            `select public.create_quote($1::uuid, $2::uuid, 'Pre', null) as id`,
            [randomUUID(), ids.customerA],
          )
        )[0].id,
      );
      if (withItem) {
        await as(
          ids.ownerA,
          `select public.add_quote_item($1::uuid, $2::uuid, 'C', 2, 5000, 2100)`,
          [id, randomUUID()],
        );
      }
      return id;
    };
    acceptedQuote = await mk(true);
    const order = String(
      (await as(ids.ownerA, `select public.accept_quote($1::uuid) as id`, [acceptedQuote]))[0].id,
    );
    draftQuote = await mk(true);
    await api.create(ids.memberA, { customer: ids.customerA });
    const item = String(
      (
        await as(
          ids.ownerA,
          `select public.create_inventory_item($1::uuid, 'MIG-1', 'Tubo', null, 'm', 0) as id`,
          [randomUUID()],
        )
      )[0].id,
    );
    await as(
      ids.ownerA,
      `select public.record_stock_movement($1::uuid, $2::uuid, 'in', 9, null, null)`,
      [randomUUID(), item],
    );
    await as(
      ids.ownerA,
      `select public.record_stock_movement($1::uuid, $2::uuid, 'consumption', 4, $3::uuid, null)`,
      [randomUUID(), item, order],
    );
  }, 120_000);

  afterAll(async () => {
    await pg.close();
  });

  it('aplicarla no modifica ni una fila existente y las funciones nuevas quedan activas', async () => {
    const before = await fingerprint(pg);
    const last = (await readMigrations()).find((m) => m.version === LAST)!;
    await pg.exec(last.sql);
    expect(await fingerprint(pg)).toEqual(before);

    const asOwner = (sql: string, params: unknown[] = []) =>
      wrapped.asUser(ids.ownerA, (tx) => tx.query<Row>(sql, params)).then((r) => r.rows);
    // Los datos previos siguen consistentes y la via normal sigue funcionando sobre ellos.
    const order = String(
      (await asOwner(`select public.accept_quote($1::uuid) as id`, [acceptedQuote]))[0].id,
    );
    expect(order).toBeTruthy();
    const accepted = String(
      (await asOwner(`select public.accept_quote($1::uuid) as id`, [draftQuote]))[0].id,
    );
    expect(accepted).not.toBe(order);
    await expect(
      pg.query(`update public.work_orders set id = gen_random_uuid() where id = $1`, [order]),
    ).rejects.toMatchObject({ code: '23000' });
    // Numeracion existente intacta.
    const label = (
      await pg.query<Row>(`select private.quote_label(7) as l, private.quote_label(10000) as m`)
    ).rows[0];
    expect(label).toEqual({ l: 'PRE-0007', m: 'PRE-10000' });
  });
});
