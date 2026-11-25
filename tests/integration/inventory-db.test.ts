// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedTwoOrgs } from '../support/fixtures';
import { createTestDb, type TestDb } from '../support/pglite';
import { orderApi } from '../support/work-orders';

// TASK-013 / F6: inventario y movimientos de stock en PostgreSQL real (PGlite) con las migraciones
// reales, bajo RLS y con las RPC reales (public.*_inventory_item, public.record_stock_movement):
// saldo nunca negativo, movimientos positivos e idempotentes, consumo vinculado a ordenes abiertas de
// la misma organizacion, rollback total, archivado de solo lectura, eventos y aislamiento. PGlite tiene
// UNA sola conexion: las llamadas "paralelas" se serializan; la concurrencia real entre conexiones se
// prueba en tests/e2e-supabase/inventory.spec.ts (job `supabase` de CI).

type Row = Record<string, unknown>;

let db: TestDb;
let s: Awaited<ReturnType<typeof seedTwoOrgs>>;
let orders: ReturnType<typeof orderApi>;

const run = async (user: string, sql: string, params: unknown[] = []) =>
  (await db.asUser(user, (tx) => tx.query<Row>(sql, params))).rows;
const su = async (sql: string, params: unknown[] = []) =>
  (await db.asSuperuser((tx) => tx.query<Row>(sql, params))).rows;
const failsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code });

let counter = 0;
const create = async (
  user: string,
  args: {
    id?: string;
    reference?: string;
    name?: string;
    description?: string | null;
    unit?: string;
    threshold?: number;
  } = {},
) =>
  String(
    (
      await run(
        user,
        `select public.create_inventory_item($1::uuid, $2, $3, $4, $5, $6::int) as id`,
        [
          args.id ?? randomUUID(),
          args.reference ?? `REF-${(counter += 1)}-${randomUUID().slice(0, 6)}`,
          args.name ?? 'Tubo de cobre 15 mm',
          args.description === undefined ? 'Tubo rígido' : args.description,
          args.unit ?? 'm',
          args.threshold ?? 0,
        ],
      )
    )[0].id,
  );

type Movement = {
  request?: string;
  kind: 'in' | 'out' | 'consumption';
  quantity: number;
  order?: string | null;
  note?: string | null;
};
const move = async (user: string, item: string, m: Movement) =>
  (
    await run(
      user,
      `select public.record_stock_movement($1::uuid, $2::uuid, $3, $4::int, $5::uuid, $6) as r`,
      [m.request ?? randomUUID(), item, m.kind, m.quantity, m.order ?? null, m.note ?? null],
    )
  )[0].r as { id: string; balance: number; replayed: boolean };

const item = async (id: string) =>
  (await su(`select * from public.inventory_items where id = $1`, [id]))[0];
const movements = (id: string) =>
  su(`select * from public.stock_movements where item_id = $1 order by seq`, [id]);
const events = (id: string) =>
  su(
    `select e.action, e.actor_id, e.seq, d.quantity, d.balance_before, d.balance_after, d.order_id, d.movement_id
       from public.activity_events e
       left join public.inventory_event_details d on d.event_id = e.id
      where e.entity_type = 'inventory_item' and e.entity_id = $1 order by e.seq`,
    [id],
  );
const openOrder = (org: string, customer: string, user: string) =>
  orders.create(user, { customer, title: `Orden ${org.slice(0, 4)}` });

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
  orders = orderApi(db);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe('alta de articulos (INV-1, INV-2, INV-3, INV-9)', () => {
  it('nace activo con saldo 0, unidad cerrada, evento created con actor y seq', async () => {
    const id = await create(s.ownerA, { reference: 'TUB-15', threshold: 5 });
    expect(await item(id)).toMatchObject({
      organization_id: s.orgA,
      reference: 'TUB-15',
      unit: 'm',
      quantity: 0,
      low_stock_threshold: 5,
      archived_at: null,
      stock_status: 'out',
    });
    const ev = await events(id);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ action: 'created', actor_id: s.ownerA, quantity: null });
    expect(ev[0].seq).not.toBeNull();
  });

  it('owner y member crean (INV-9); un reintento con el mismo id no duplica ni repite eventos', async () => {
    const id = randomUUID();
    await create(s.memberA, { id, reference: 'M-1' });
    await create(s.ownerA, { id, reference: 'M-1' });
    await create(s.memberA, { id, reference: 'M-1' });
    expect(
      (await su(`select count(*)::int as n from public.inventory_items where id = $1`, [id]))[0].n,
    ).toBe(1);
    expect(await events(id)).toHaveLength(1);
  });

  it('la referencia es unica por organizacion sin distinguir mayusculas (NX025) y se recorta', async () => {
    await create(s.ownerA, { reference: 'Abc-1' });
    await failsWith(create(s.memberA, { reference: 'ABC-1' }), 'NX025');
    await failsWith(create(s.memberA, { reference: '  abc-1  ' }), 'NX025');
    // Otra organizacion puede usar la misma referencia.
    const other = await create(s.ownerB, { reference: 'ABC-1' });
    expect((await item(other)).organization_id).toBe(s.orgB);
  });

  it('un id ya usado por otra organizacion se rechaza sin revelar el articulo', async () => {
    const id = await create(s.ownerB);
    await failsWith(create(s.ownerA, { id }), '23505');
  });

  it('valida unidad, nombre, referencia, descripcion y umbral en la base', async () => {
    await failsWith(create(s.ownerA, { unit: 'pallet' }), '23514');
    await failsWith(create(s.ownerA, { name: '   ' }), '23514');
    await failsWith(create(s.ownerA, { name: 'x'.repeat(121) }), '23514');
    await failsWith(create(s.ownerA, { reference: '' }), '23514');
    await failsWith(create(s.ownerA, { reference: 'x'.repeat(41) }), '23514');
    await failsWith(create(s.ownerA, { reference: 'con\ncontrol' }), '23514');
    await failsWith(create(s.ownerA, { description: 'x'.repeat(501) }), '23514');
    await failsWith(create(s.ownerA, { threshold: -1 }), '23514');
    await failsWith(create(s.ownerA, { threshold: 1_000_001 }), '23514');
    for (const unit of ['ud', 'm', 'kg', 'l', 'caja']) {
      await create(s.ownerA, { unit });
    }
  });

  it('un alta fallida no deja articulo ni evento', async () => {
    const id = randomUUID();
    await failsWith(create(s.ownerA, { id, unit: 'pallet' }), '23514');
    expect(
      (await su(`select count(*)::int as n from public.inventory_items where id = $1`, [id]))[0].n,
    ).toBe(0);
    expect(await events(id)).toHaveLength(0);
  });
});

describe('edicion (INV-2) y saldo solo por movimientos (INV-3)', () => {
  it('edita nombre, descripcion, unidad y umbral; la referencia y el saldo no cambian', async () => {
    const id = await create(s.ownerA, { reference: 'EDIT-1' });
    await move(s.ownerA, id, { kind: 'in', quantity: 10 });
    await run(s.memberA, `select public.update_inventory_item($1::uuid, $2, $3, $4, $5::int)`, [
      id,
      'Tubo renombrado',
      null,
      'kg',
      3,
    ]);
    expect(await item(id)).toMatchObject({
      reference: 'EDIT-1',
      name: 'Tubo renombrado',
      description: null,
      unit: 'kg',
      low_stock_threshold: 3,
      quantity: 10,
    });
  });

  it('ni siquiera con SQL de administracion cambia la referencia ni el saldo ni nace con saldo', async () => {
    const id = await create(s.ownerA);
    await failsWith(
      su(`update public.inventory_items set reference = 'OTRA' where id = $1`, [id]),
      '23000',
    );
    await failsWith(
      su(`update public.inventory_items set quantity = 50 where id = $1`, [id]),
      '23000',
    );
    await failsWith(
      su(
        `insert into public.inventory_items (organization_id, reference, name, unit, quantity)
         values ($1, 'INI-1', 'Con saldo', 'ud', 5)`,
        [s.orgA],
      ),
      '23000',
    );
    await failsWith(
      su(
        `insert into public.inventory_items (organization_id, reference, name, unit, archived_at)
         values ($1, 'INI-2', 'Archivado', 'ud', now())`,
        [s.orgA],
      ),
      '23000',
    );
    expect((await item(id)).quantity).toBe(0);
  });

  it('el articulo no se borra ni se vacia la tabla', async () => {
    const id = await create(s.ownerA);
    await failsWith(su(`delete from public.inventory_items where id = $1`, [id]), '23000');
    // TRUNCATE lo rechaza PostgreSQL (0A000: referenciada por stock_movements) antes que el trigger.
    await expect(su(`truncate public.inventory_items`)).rejects.toThrow();
  });
});

describe('movimientos (INV-4): positivos, atomicos y con saldo coherente', () => {
  it('entrada, salida y consumo actualizan el saldo y guardan saldo anterior y nuevo', async () => {
    const id = await create(s.ownerA, { threshold: 2 });
    const order = await openOrder(s.orgA, s.customerA, s.ownerA);
    expect(
      (await move(s.ownerA, id, { kind: 'in', quantity: 10, note: 'Compra inicial' })).balance,
    ).toBe(10);
    expect((await move(s.memberA, id, { kind: 'out', quantity: 3 })).balance).toBe(7);
    expect((await move(s.memberA, id, { kind: 'consumption', quantity: 4, order })).balance).toBe(
      3,
    );
    const rows = await movements(id);
    expect(rows.map((r) => [r.kind, r.quantity, r.balance_before, r.balance_after])).toEqual([
      ['in', 10, 0, 10],
      ['out', 3, 10, 7],
      ['consumption', 4, 7, 3],
    ]);
    expect(rows[2]).toMatchObject({
      order_id: order,
      created_by: s.memberA,
      organization_id: s.orgA,
    });
    expect(rows[0].note).toBe('Compra inicial');
    expect(await item(id)).toMatchObject({ quantity: 3, stock_status: 'ok' });
  });

  it('cada movimiento genera su evento con actor, detalle estructurado y SIN la nota libre', async () => {
    const id = await create(s.ownerA);
    const order = await openOrder(s.orgA, s.customerA, s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 8, note: 'dato interno confidencial' });
    await move(s.memberA, id, { kind: 'out', quantity: 2 });
    await move(s.ownerA, id, { kind: 'consumption', quantity: 1, order });
    const ev = await events(id);
    expect(ev.map((e) => e.action)).toEqual(['created', 'stock_in', 'stock_out', 'stock_consumed']);
    expect(ev.map((e) => e.actor_id)).toEqual([s.ownerA, s.ownerA, s.memberA, s.ownerA]);
    expect(ev.slice(1).map((e) => [e.quantity, e.balance_before, e.balance_after])).toEqual([
      [8, 0, 8],
      [2, 8, 6],
      [1, 6, 5],
    ]);
    expect(ev[3].order_id).toBe(order);
    expect(ev.every((e) => e.seq !== null)).toBe(true);
    // El detalle no tiene columna de nota y ningun evento contiene el texto libre.
    const columns = await su(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'inventory_event_details'`,
    );
    expect(columns.map((c) => c.column_name)).not.toContain('note');
    const leaked = await su(
      `select count(*)::int as n from public.inventory_event_details d where d::text like '%confidencial%'`,
    );
    expect(leaked[0].n).toBe(0);
    const leakedEvents = await su(
      `select count(*)::int as n from public.activity_events e where e::text like '%confidencial%'`,
    );
    expect(leakedEvents[0].n).toBe(0);
  });

  it('cantidad cero, negativa, excesiva o no entera, tipo invalido y nota larga se rechazan sin efecto', async () => {
    const id = await create(s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 5 });
    for (const quantity of [0, -3, 1_000_001]) {
      await failsWith(move(s.ownerA, id, { kind: 'in', quantity }), '23514');
    }
    await failsWith(
      run(s.ownerA, `select public.record_stock_movement($1::uuid, $2::uuid, 'x', 1, null, null)`, [
        randomUUID(),
        id,
      ]),
      '23514',
    );
    await failsWith(
      move(s.ownerA, id, { kind: 'in', quantity: 1, note: 'n'.repeat(201) }),
      '23514',
    );
    expect((await item(id)).quantity).toBe(5);
    expect(await movements(id)).toHaveLength(1);
    expect(await events(id)).toHaveLength(2);
  });

  it('un tipo de movimiento invalido tambien se rechaza al insertar directamente (SQL de administracion)', async () => {
    const id = await create(s.ownerA);
    await failsWith(
      db.asSuperuser(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: s.ownerA, role: 'authenticated' }),
        ]);
        await tx.query(
          `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id)
           values ($1, $2, 'adjust', 1, gen_random_uuid())`,
          [s.orgA, id],
        );
      }),
      '23514',
    );
    expect((await item(id)).quantity).toBe(0);
  });

  it('el saldo no puede superar el maximo (NX026) y el rechazo no deja rastro', async () => {
    const id = await create(s.ownerA);
    await db.asSuperuser(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: s.ownerA, role: 'authenticated' }),
      ]);
      await tx.query(
        `select public.record_stock_movement(gen_random_uuid(), $1::uuid, 'in', 1000000, null, null)
           from generate_series(1, 1000)`,
        [id],
      );
    });
    expect((await item(id)).quantity).toBe(1_000_000_000);
    await failsWith(move(s.ownerA, id, { kind: 'in', quantity: 1 }), 'NX026');
    expect((await item(id)).quantity).toBe(1_000_000_000);
    expect(await movements(id)).toHaveLength(1000);
    await move(s.ownerA, id, { kind: 'out', quantity: 1 });
  });
});

describe('saldo nunca negativo (BR07)', () => {
  it('una salida o consumo por encima del saldo se rechaza (NX022) sin movimiento, saldo ni evento', async () => {
    const id = await create(s.ownerA);
    const order = await openOrder(s.orgA, s.customerA, s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 5 });
    await failsWith(move(s.ownerA, id, { kind: 'out', quantity: 6 }), 'NX022');
    await failsWith(move(s.ownerA, id, { kind: 'consumption', quantity: 6, order }), 'NX022');
    expect((await item(id)).quantity).toBe(5);
    expect(await movements(id)).toHaveLength(1);
    expect((await events(id)).map((e) => e.action)).toEqual(['created', 'stock_in']);
    // El saldo exacto si se puede vaciar y deja el articulo agotado.
    await move(s.ownerA, id, { kind: 'out', quantity: 5 });
    expect(await item(id)).toMatchObject({ quantity: 0, stock_status: 'out' });
    await failsWith(move(s.ownerA, id, { kind: 'out', quantity: 1 }), 'NX022');
  });

  it('una serie de salidas agota el saldo exacto y el resto se rechaza (sin sobregiro)', async () => {
    const id = await create(s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 20 });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => move(s.ownerA, id, { kind: 'out', quantity: 3 })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(6);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(4);
    expect((await item(id)).quantity).toBe(2);
    expect(
      Number(
        (
          await su(
            `select min(balance_after)::int as m from public.stock_movements where item_id = $1`,
            [id],
          )
        )[0].m,
      ),
    ).toBeGreaterThanOrEqual(0);
  });

  it('la base impide un saldo negativo o un movimiento sin actor aunque se use SQL de administracion', async () => {
    const id = await create(s.ownerA);
    await failsWith(
      su(`update public.inventory_items set quantity = -1 where id = $1`, [id]),
      '23000',
    );
    await failsWith(
      su(
        `insert into public.stock_movements
           (organization_id, item_id, kind, quantity, balance_before, balance_after, request_id, created_by)
         values ($1, $2, 'out', 1, 0, -1, gen_random_uuid(), $3)`,
        [s.orgA, id, s.ownerA],
      ),
      '23000', // sin actor autenticado
    );
  });
});

describe('idempotencia por clave de envio (INV-5)', () => {
  it('el reintento con el mismo contenido devuelve el movimiento original sin duplicar', async () => {
    const id = await create(s.ownerA);
    const request = randomUUID();
    const first = await move(s.ownerA, id, { request, kind: 'in', quantity: 7, note: '  alta  ' });
    const again = await move(s.memberA, id, { request, kind: 'in', quantity: 7, note: 'alta' });
    const third = await move(s.ownerA, id, { request, kind: 'in', quantity: 7, note: 'alta' });
    expect(first.replayed).toBe(false);
    expect(again).toEqual({ id: first.id, balance: 7, replayed: true });
    expect(third.id).toBe(first.id);
    expect(await movements(id)).toHaveLength(1);
    expect((await item(id)).quantity).toBe(7);
    expect((await events(id)).map((e) => e.action)).toEqual(['created', 'stock_in']);
  });

  it('la misma clave con otro contenido se rechaza (NX024) sin cambiar nada', async () => {
    const id = await create(s.ownerA);
    const other = await create(s.ownerA);
    const request = randomUUID();
    await move(s.ownerA, id, { request, kind: 'in', quantity: 5 });
    await failsWith(move(s.ownerA, id, { request, kind: 'in', quantity: 6 }), 'NX024');
    await failsWith(move(s.ownerA, id, { request, kind: 'out', quantity: 5 }), 'NX024');
    await failsWith(move(s.ownerA, other, { request, kind: 'in', quantity: 5 }), 'NX024');
    await failsWith(
      move(s.ownerA, id, { request, kind: 'in', quantity: 5, note: 'otra' }),
      'NX024',
    );
    expect((await item(id)).quantity).toBe(5);
    expect(await movements(other)).toHaveLength(0);
  });

  it('un movimiento rechazado no consume la clave: se puede reintentar tras corregir el saldo', async () => {
    const id = await create(s.ownerA);
    const request = randomUUID();
    await failsWith(move(s.ownerA, id, { request, kind: 'out', quantity: 4 }), 'NX022');
    await move(s.ownerA, id, { kind: 'in', quantity: 10 });
    const done = await move(s.ownerA, id, { request, kind: 'out', quantity: 4 });
    expect(done).toMatchObject({ balance: 6, replayed: false });
  });

  it('la clave es por organizacion: otra organizacion puede reutilizar el mismo UUID', async () => {
    const a = await create(s.ownerA);
    const b = await create(s.ownerB);
    const request = randomUUID();
    await move(s.ownerA, a, { request, kind: 'in', quantity: 1 });
    const other = await move(s.ownerB, b, { request, kind: 'in', quantity: 9 });
    expect(other).toMatchObject({ balance: 9, replayed: false });
  });

  it('el reintento tras archivar devuelve el original; un movimiento nuevo se rechaza', async () => {
    const id = await create(s.ownerA);
    const request = randomUUID();
    await move(s.ownerA, id, { request, kind: 'in', quantity: 2 });
    await run(s.ownerA, `select public.archive_inventory_item($1::uuid)`, [id]);
    expect((await move(s.ownerA, id, { request, kind: 'in', quantity: 2 })).replayed).toBe(true);
    await failsWith(move(s.ownerA, id, { kind: 'in', quantity: 2 }), 'NX021');
  });
});

describe('consumo vinculado a ordenes (INV-6)', () => {
  it('exige orden de la misma organizacion pendiente, asignada o en curso', async () => {
    const id = await create(s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 50 });

    const pending = await openOrder(s.orgA, s.customerA, s.ownerA);
    await move(s.ownerA, id, { kind: 'consumption', quantity: 1, order: pending });

    const assigned = await orders.create(s.ownerA, {
      customer: s.customerA,
      technician: s.technicianA,
    });
    await move(s.ownerA, id, { kind: 'consumption', quantity: 1, order: assigned });
    await orders.advance(s.ownerA, assigned, 'in_progress');
    await move(s.ownerA, id, { kind: 'consumption', quantity: 1, order: assigned });

    const completed = await orders.create(s.ownerA, {
      customer: s.customerA,
      technician: s.technicianA,
    });
    await orders.advance(s.ownerA, completed, 'in_progress');
    await orders.advance(s.ownerA, completed, 'completed');
    const cancelled = await openOrder(s.orgA, s.customerA, s.ownerA);
    await orders.cancel(s.ownerA, cancelled, 'ya no hace falta');

    const before = (await item(id)).quantity;
    for (const order of [completed, cancelled]) {
      await failsWith(move(s.ownerA, id, { kind: 'consumption', quantity: 1, order }), 'NX023');
    }
    await failsWith(
      move(s.ownerA, id, { kind: 'consumption', quantity: 1, order: randomUUID() }),
      'NX023',
    );
    expect((await item(id)).quantity).toBe(before);
    expect(before).toBe(47);
  });

  it('una orden de OTRA organizacion se rechaza como inexistente (NX023) sin efecto', async () => {
    const id = await create(s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 10 });
    const foreign = await openOrder(s.orgB, s.customerB, s.ownerB);
    await failsWith(
      move(s.ownerA, id, { kind: 'consumption', quantity: 1, order: foreign }),
      'NX023',
    );
    expect((await item(id)).quantity).toBe(10);
    expect(await movements(id)).toHaveLength(1);
  });

  it('consumo sin orden y entrada o salida con orden se rechazan', async () => {
    const id = await create(s.ownerA);
    const order = await openOrder(s.orgA, s.customerA, s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 10 });
    await failsWith(move(s.ownerA, id, { kind: 'consumption', quantity: 1 }), '23514');
    await failsWith(move(s.ownerA, id, { kind: 'in', quantity: 1, order }), '23514');
    await failsWith(move(s.ownerA, id, { kind: 'out', quantity: 1, order }), '23514');
    expect((await item(id)).quantity).toBe(10);
  });

  it('rollback total: si el consumo falla no queda movimiento, saldo, evento ni detalle', async () => {
    const id = await create(s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 4 });
    const done = await orders.create(s.ownerA, {
      customer: s.customerA,
      technician: s.technicianA,
    });
    await orders.advance(s.ownerA, done, 'in_progress');
    await orders.advance(s.ownerA, done, 'completed');
    const eventsBefore = (await su(`select count(*)::int as n from public.activity_events`))[0].n;
    const detailsBefore = (
      await su(`select count(*)::int as n from public.inventory_event_details`)
    )[0].n;
    await failsWith(move(s.ownerA, id, { kind: 'consumption', quantity: 2, order: done }), 'NX023');
    expect((await item(id)).quantity).toBe(4);
    expect(await movements(id)).toHaveLength(1);
    expect((await su(`select count(*)::int as n from public.activity_events`))[0].n).toBe(
      eventsBefore,
    );
    expect((await su(`select count(*)::int as n from public.inventory_event_details`))[0].n).toBe(
      detailsBefore,
    );
  });

  it('un fallo del evento revierte el movimiento (atomicidad): sin actor no hay movimiento', async () => {
    const id = await create(s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 4 });
    await failsWith(
      su(
        `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id)
         values ($1, $2, 'out', 1, gen_random_uuid())`,
        [s.orgA, id],
      ),
      '23000',
    );
    expect((await item(id)).quantity).toBe(4);
    expect(await movements(id)).toHaveLength(1);
  });

  it('la orden consumida sigue siendo valida: cancelarla despues no altera el historial', async () => {
    const id = await create(s.ownerA);
    const order = await openOrder(s.orgA, s.customerA, s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 4 });
    await move(s.ownerA, id, { kind: 'consumption', quantity: 1, order });
    await orders.cancel(s.ownerA, order, null);
    expect((await movements(id)).map((m) => m.order_id)).toEqual([null, order]);
    await failsWith(move(s.ownerA, id, { kind: 'consumption', quantity: 1, order }), 'NX023');
  });
});

describe('estado de stock (INV-7)', () => {
  it('agotado = 0; bajo = saldo > 0 y <= umbral; umbral 0 desactiva "bajo"', async () => {
    const low = await create(s.ownerA, { threshold: 5 });
    const off = await create(s.ownerA, { threshold: 0 });
    expect((await item(low)).stock_status).toBe('out');
    await move(s.ownerA, low, { kind: 'in', quantity: 5 });
    expect((await item(low)).stock_status).toBe('low');
    await move(s.ownerA, low, { kind: 'in', quantity: 1 });
    expect((await item(low)).stock_status).toBe('ok');
    await move(s.ownerA, off, { kind: 'in', quantity: 1 });
    expect((await item(off)).stock_status).toBe('ok');
    await run(s.ownerA, `select public.update_inventory_item($1::uuid, 'n', null, 'ud', 3)`, [off]);
    expect((await item(off)).stock_status).toBe('low');
    await run(s.ownerA, `select public.update_inventory_item($1::uuid, 'n', null, 'ud', 0)`, [off]);
    expect((await item(off)).stock_status).toBe('ok');
  });
});

describe('archivado y restauracion (INV-8)', () => {
  it('archivar con saldo: solo lectura, sin movimientos ni ediciones; restaurar los permite de nuevo', async () => {
    const id = await create(s.ownerA, { reference: 'ARCH-1' });
    await move(s.ownerA, id, { kind: 'in', quantity: 9 });
    expect(
      (await run(s.memberA, `select public.archive_inventory_item($1::uuid) as ok`, [id]))[0].ok,
    ).toBe(true);
    const archived = await item(id);
    expect(archived.archived_at).not.toBeNull();
    expect(archived.quantity).toBe(9);

    await failsWith(move(s.ownerA, id, { kind: 'in', quantity: 1 }), 'NX021');
    await failsWith(move(s.ownerA, id, { kind: 'out', quantity: 1 }), 'NX021');
    await failsWith(
      run(s.ownerA, `select public.update_inventory_item($1::uuid, 'x', null, 'ud', 0)`, [id]),
      'NX021',
    );
    // Tambien frente a SQL directo de administracion.
    await failsWith(
      su(`update public.inventory_items set name = 'Z' where id = $1`, [id]),
      'NX021',
    );
    await failsWith(
      su(`update public.inventory_items set low_stock_threshold = 1 where id = $1`, [id]),
      'NX021',
    );
    await failsWith(
      su(`update public.inventory_items set archived_at = now() + interval '1 day' where id = $1`, [
        id,
      ]),
      'NX021',
    );
    // Restaurar no se combina con una edicion.
    await failsWith(
      su(`update public.inventory_items set archived_at = null, name = 'Z' where id = $1`, [id]),
      'NX021',
    );
    expect(await item(id)).toMatchObject({ name: 'Tubo de cobre 15 mm', quantity: 9 });

    expect(
      (await run(s.ownerA, `select public.restore_inventory_item($1::uuid) as ok`, [id]))[0].ok,
    ).toBe(true);
    expect((await item(id)).archived_at).toBeNull();
    expect((await move(s.ownerA, id, { kind: 'out', quantity: 4 })).balance).toBe(5);
    expect((await events(id)).map((e) => e.action)).toEqual([
      'created',
      'stock_in',
      'archived',
      'restored',
      'stock_out',
    ]);
    expect(await movements(id)).toHaveLength(2); // historial conservado
  });

  it('repetir archivar o restaurar es un no-op sin evento; un articulo agotado tambien se archiva', async () => {
    const id = await create(s.ownerA);
    expect(
      (await run(s.ownerA, `select public.restore_inventory_item($1::uuid) as ok`, [id]))[0].ok,
    ).toBe(false);
    expect(
      (await run(s.ownerA, `select public.archive_inventory_item($1::uuid) as ok`, [id]))[0].ok,
    ).toBe(true);
    expect(
      (await run(s.ownerA, `select public.archive_inventory_item($1::uuid) as ok`, [id]))[0].ok,
    ).toBe(false);
    expect((await events(id)).map((e) => e.action)).toEqual(['created', 'archived']);
  });

  it('una insercion directa de movimiento sobre un archivado (SQL de administracion) se rechaza', async () => {
    const id = await create(s.ownerA);
    await run(s.ownerA, `select public.archive_inventory_item($1::uuid)`, [id]);
    await failsWith(
      db.asSuperuser(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: s.ownerA, role: 'authenticated' }),
        ]);
        await tx.query(
          `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id)
           values ($1, $2, 'in', 1, gen_random_uuid())`,
          [s.orgA, id],
        );
      }),
      'NX021',
    );
  });
});

describe('seq asignado tras el bloqueo del articulo (F-1)', () => {
  it('no tiene default (no se evalua antes del bloqueo) y es obligatorio', async () => {
    const col = await su(
      `select column_default, is_nullable, is_identity from information_schema.columns
        where table_schema = 'public' and table_name = 'stock_movements' and column_name = 'seq'`,
    );
    expect(col[0]).toMatchObject({ column_default: null, is_nullable: 'NO', is_identity: 'NO' });
  });

  it('el orden de seq coincide con el orden de aplicacion: la cadena de saldos es continua', async () => {
    const id = await create(s.ownerA);
    const other = await create(s.ownerA);
    const order = await openOrder(s.orgA, s.customerA, s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 30 });
    await move(s.ownerA, other, { kind: 'in', quantity: 5 });
    await move(s.memberA, id, { kind: 'out', quantity: 4 });
    await move(s.ownerA, id, { kind: 'consumption', quantity: 6, order });
    await Promise.allSettled(
      Array.from({ length: 12 }, () => move(s.memberA, id, { kind: 'out', quantity: 3 })),
    );
    const rows = await su(
      `select seq, balance_before, balance_after from public.stock_movements where item_id = $1 order by seq`,
      [id],
    );
    expect(rows.length).toBeGreaterThan(4);
    for (let i = 1; i < rows.length; i += 1) {
      expect(Number(rows[i].seq)).toBeGreaterThan(Number(rows[i - 1].seq));
      expect(rows[i].balance_before).toBe(rows[i - 1].balance_after);
    }
    expect(rows[0].balance_before).toBe(0);
    expect(rows.at(-1)?.balance_after).toBe((await item(id)).quantity);
  });

  it('el seq no se puede fijar desde la llamada: el trigger lo sobrescribe', async () => {
    const id = await create(s.ownerA);
    await db.asSuperuser(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: s.ownerA, role: 'authenticated' }),
      ]);
      await tx.query(
        `insert into public.stock_movements (seq, organization_id, item_id, kind, quantity, request_id)
         values (1, $1, $2, 'in', 5, gen_random_uuid())`,
        [s.orgA, id],
      );
    });
    const [row] = await movements(id);
    expect(Number(row.seq)).toBeGreaterThan(1);
    // Los usuarios no escriben la tabla ni usan la secuencia.
    await failsWith(
      run(
        s.ownerA,
        `insert into public.stock_movements (seq, organization_id, item_id, kind, quantity, request_id)
         values (1, '${s.orgA}', '${id}', 'in', 5, gen_random_uuid())`,
      ),
      '42501',
    );
    await failsWith(run(s.ownerA, `select nextval('public.stock_movements_seq_seq')`), '42501');
  });
});

describe('G4-01: solo un movimiento efectivamente insertado cambia el saldo y genera su evento', () => {
  // SQL de administracion con claims del owner (auth.uid() fijado) sin cambiar de rol.
  const suAs = (user: string, sql: string, params: unknown[] = []) =>
    db.asSuperuser(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: user, role: 'authenticated' }),
      ]);
      return tx.query<Row>(sql, params);
    });
  const state = async (id: string) => ({
    quantity: (await item(id)).quantity,
    movements: (await movements(id)).length,
    events: (await events(id)).length,
  });

  it('un conflicto de idempotencia (ON CONFLICT DO NOTHING) no cambia existencias ni crea evento', async () => {
    const id = await create(s.ownerA);
    const request = randomUUID();
    await move(s.ownerA, id, { kind: 'in', quantity: 10, request });
    const before = await state(id);
    const res = await suAs(
      s.ownerA,
      `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id)
       values ($1, $2, 'in', 7, $3) on conflict (organization_id, request_id) do nothing returning id`,
      [s.orgA, id, request],
    );
    expect(res.rows).toHaveLength(0);
    expect(await state(id)).toEqual(before);
    expect(before.quantity).toBe(10);
    // Un conflicto con una salida que dejaria saldo negativo tampoco toca nada.
    await suAs(
      s.ownerA,
      `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id)
       values ($1, $2, 'out', 3, $3) on conflict (organization_id, request_id) do nothing`,
      [s.orgA, id, request],
    );
    expect(await state(id)).toEqual(before);
  });

  it('varias filas del mismo articulo en una sentencia: cada una ve el saldo de la anterior y hay un evento por fila', async () => {
    const id = await create(s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 5 });
    const before = await state(id);
    await suAs(
      s.ownerA,
      `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id)
       values ($1, $2, 'in', 10, gen_random_uuid()), ($1, $2, 'out', 4, gen_random_uuid()),
              ($1, $2, 'out', 6, gen_random_uuid())`,
      [s.orgA, id],
    );
    const rows = await movements(id);
    expect(rows.slice(-3).map((r) => [r.balance_before, r.balance_after])).toEqual([
      [5, 15],
      [15, 11],
      [11, 5],
    ]);
    expect((await item(id)).quantity).toBe(5);
    expect(await state(id)).toEqual({
      quantity: 5,
      movements: before.movements + 3,
      events: before.events + 3,
    });
    // INSERT ... SELECT con la misma cadena.
    await suAs(
      s.ownerA,
      `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id)
       select $1, $2::uuid, 'in', 1, gen_random_uuid() from generate_series(1, 4)`,
      [s.orgA, id],
    );
    expect((await item(id)).quantity).toBe(9);
    const chain = await movements(id);
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i].balance_before).toBe(chain[i - 1].balance_after);
    }
  });

  it('varias filas no pueden sobregirar: si una falla la sentencia entera se revierte', async () => {
    const id = await create(s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 5 });
    const before = await state(id);
    await failsWith(
      suAs(
        s.ownerA,
        `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id)
         values ($1, $2, 'out', 3, gen_random_uuid()), ($1, $2, 'out', 3, gen_random_uuid())`,
        [s.orgA, id],
      ),
      'NX022',
    );
    expect(await state(id)).toEqual(before);
  });

  it('mezcla de filas en conflicto y nuevas: solo las insertadas cambian el saldo y generan evento', async () => {
    const id = await create(s.ownerA);
    const request = randomUUID();
    await move(s.ownerA, id, { kind: 'in', quantity: 10, request });
    const before = await state(id);
    const res = await suAs(
      s.ownerA,
      `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id)
       values ($1, $2, 'in', 100, $3), ($1, $2, 'out', 4, gen_random_uuid()),
              ($1, $2, 'in', 100, $3), ($1, $2, 'out', 2, gen_random_uuid())
       on conflict (organization_id, request_id) do nothing returning id`,
      [s.orgA, id, request],
    );
    expect(res.rows).toHaveLength(2);
    expect((await item(id)).quantity).toBe(4);
    expect(await state(id)).toEqual({
      quantity: 4,
      movements: before.movements + 2,
      events: before.events + 2,
    });
    const chain = await movements(id);
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i].balance_before).toBe(chain[i - 1].balance_after);
    }
  });

  it('el saldo lo aplica un trigger AFTER INSERT: el BEFORE no modifica el articulo', async () => {
    const rows = await su(
      `select t.tgname, (t.tgtype & 2) <> 0 as is_before
         from pg_trigger t where t.tgrelid = 'public.stock_movements'::regclass and not t.tgisinternal
          and t.tgname in ('stock_movements_apply', 'stock_movements_apply_balance', 'stock_movements_event_insert')
        order by t.tgname`,
    );
    expect(rows).toEqual([
      { tgname: 'stock_movements_apply', is_before: true },
      { tgname: 'stock_movements_apply_balance', is_before: false },
      { tgname: 'stock_movements_event_insert', is_before: false },
    ]);
  });

  it('ningun usuario fija saldo, seq ni saldos del movimiento (se recalculan)', async () => {
    const id = await create(s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 5 });
    await suAs(
      s.ownerA,
      `insert into public.stock_movements
         (organization_id, item_id, kind, quantity, balance_before, balance_after, request_id)
       values ($1, $2, 'out', 2, 999, 997, gen_random_uuid())`,
      [s.orgA, id],
    );
    const last = (await movements(id)).at(-1);
    expect(last).toMatchObject({ balance_before: 5, balance_after: 3 });
    expect((await item(id)).quantity).toBe(3);
  });
});

describe('inmutabilidad', () => {
  it('movimientos, detalles y eventos no se modifican, borran ni vacian (ni con administracion)', async () => {
    const id = await create(s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 3 });
    const m = (await movements(id))[0];
    await failsWith(
      su(`update public.stock_movements set quantity = 99 where id = $1`, [m.id]),
      '23000',
    );
    await failsWith(
      su(`update public.stock_movements set note = 'x' where id = $1`, [m.id]),
      '23000',
    );
    await failsWith(su(`delete from public.stock_movements where id = $1`, [m.id]), '23000');
    await failsWith(su(`truncate public.stock_movements`), '23000');
    await failsWith(su(`update public.inventory_event_details set quantity = 99`), '23000');
    await failsWith(su(`delete from public.inventory_event_details`), '23000');
    await failsWith(su(`truncate public.inventory_event_details`), '23000');
    await failsWith(
      su(`update public.activity_events set action = 'created' where entity_id = $1`, [id]),
      '23000',
    );
    expect((await item(id)).quantity).toBe(3);
  });

  it('los CHECK de activity_events admiten los eventos de inventario y rechazan combinaciones invalidas', async () => {
    const id = await create(s.ownerA);
    const insert = (type: string, action: string) =>
      su(
        `insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
         values ($1, $2, $3, $4, $5)`,
        [s.orgA, s.ownerA, type, id, action],
      );
    await insert('inventory_item', 'stock_in');
    await failsWith(insert('inventory_item', 'accepted'), '23514');
    await failsWith(insert('customer', 'stock_in'), '23514');
    await failsWith(insert('quote', 'stock_out'), '23514');
    await failsWith(insert('inventory_item', 'cancelled'), '23514');
  });
});

describe('RLS y aislamiento entre organizaciones', () => {
  it('otra organizacion no ve articulos, movimientos ni detalles; anon no ve nada', async () => {
    const id = await create(s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 2 });
    for (const table of ['inventory_items', 'stock_movements', 'inventory_event_details']) {
      expect(
        (await run(s.ownerB, `select * from public.${table}`)).filter(
          (r) => r.organization_id === s.orgA,
        ),
      ).toHaveLength(0);
      expect((await run(s.memberA, `select * from public.${table}`)).length).toBeGreaterThan(0);
      await failsWith(
        db.asAnon((tx) => tx.query(`select * from public.${table}`)),
        '42501',
      );
    }
    expect(
      (await run(s.memberB, `select * from public.inventory_items where id = $1`, [id])).length,
    ).toBe(0);
  });

  it('las RPC sobre un articulo ajeno responden como inexistentes (NX020) y sin efecto', async () => {
    const id = await create(s.ownerA);
    await move(s.ownerA, id, { kind: 'in', quantity: 2 });
    await failsWith(move(s.ownerB, id, { kind: 'in', quantity: 1 }), 'NX020');
    await failsWith(move(s.ownerB, id, { kind: 'out', quantity: 1 }), 'NX020');
    await failsWith(run(s.ownerB, `select public.archive_inventory_item($1::uuid)`, [id]), 'NX020');
    await failsWith(run(s.ownerB, `select public.restore_inventory_item($1::uuid)`, [id]), 'NX020');
    await failsWith(
      run(s.ownerB, `select public.update_inventory_item($1::uuid, 'x', null, 'ud', 0)`, [id]),
      'NX020',
    );
    expect(await item(id)).toMatchObject({
      quantity: 2,
      archived_at: null,
      name: 'Tubo de cobre 15 mm',
    });
    expect(await movements(id)).toHaveLength(1);
  });

  it('un usuario no puede escribir las tablas por SQL/PostgREST directo (solo SELECT)', async () => {
    const id = await create(s.ownerA);
    const writes = [
      [
        `insert into public.inventory_items (organization_id, reference, name, unit) values ('${s.orgA}', 'D-1', 'x', 'ud')`,
      ],
      [`update public.inventory_items set quantity = 100 where id = '${id}'`],
      [`delete from public.inventory_items where id = '${id}'`],
      [
        `insert into public.stock_movements (organization_id, item_id, kind, quantity, request_id) values ('${s.orgA}', '${id}', 'in', 5, gen_random_uuid())`,
      ],
      [`update public.stock_movements set quantity = 1`],
      [`delete from public.stock_movements`],
      [
        `insert into public.inventory_event_details (event_id, organization_id, movement_id, quantity, balance_before, balance_after) values (gen_random_uuid(), '${s.orgA}', gen_random_uuid(), 1, 0, 1)`,
      ],
      [
        `insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action) values ('${s.orgA}', '${s.ownerA}', 'inventory_item', '${id}', 'stock_in')`,
      ],
    ];
    for (const [sql] of writes) {
      await failsWith(run(s.ownerA, sql), '42501');
    }
    expect((await item(id)).quantity).toBe(0);
  });

  it('un usuario sin organizacion no puede usar las RPC (42501)', async () => {
    const stray = randomUUID();
    await su(`insert into auth.users (id, email) values ($1, 'sin.org@example.test')`, [stray]);
    await failsWith(create(stray), '42501');
    await failsWith(move(stray, randomUUID(), { kind: 'in', quantity: 1 }), '42501');
  });
});

describe('privilegios de las funciones', () => {
  const RPC = [
    `select public.create_inventory_item(gen_random_uuid(), 'x', 'x', null, 'ud', 0)`,
    `select public.update_inventory_item(gen_random_uuid(), 'x', null, 'ud', 0)`,
    `select public.archive_inventory_item(gen_random_uuid())`,
    `select public.restore_inventory_item(gen_random_uuid())`,
    `select public.record_stock_movement(gen_random_uuid(), gen_random_uuid(), 'in', 1, null, null)`,
    `select private.record_stock_movement(gen_random_uuid(), gen_random_uuid(), 'in', 1, null, null)`,
    `select private.create_inventory_item(gen_random_uuid(), 'x', 'x', null, 'ud', 0)`,
  ];

  it('anon no puede ejecutar ninguna RPC ni las funciones privadas', async () => {
    for (const call of RPC) {
      await failsWith(
        db.asAnon((tx) => tx.query(call)),
        '42501',
      );
    }
  });

  it('las RPC sin sesion (sin sub) se rechazan', async () => {
    await failsWith(
      db.asSuperuser(async (tx) => {
        await tx.exec('set local role authenticated');
        await tx.query(RPC[0]);
      }),
      '42501',
    );
  });

  it('los triggers y funciones internas no son ejecutables por usuarios', async () => {
    for (const fn of [
      'private.stock_movements_apply()',
      'private.stock_movements_record_event()',
      'private.inventory_items_guard()',
      'private.inventory_items_record_event()',
    ]) {
      const rows = await su(
        `select has_function_privilege('authenticated', $1::regprocedure, 'execute') as a,
                has_function_privilege('anon', $1::regprocedure, 'execute') as n,
                has_function_privilege('public', $1::regprocedure, 'execute') as p`,
        [fn],
      );
      expect(rows[0]).toEqual({ a: false, n: false, p: false });
    }
  });

  it('las funciones SECURITY DEFINER fijan search_path vacio y no son ejecutables por PUBLIC ni anon', async () => {
    const rows = await su(
      `select n.nspname, p.proname, p.prosecdef, p.proconfig,
              has_function_privilege('public', p.oid, 'execute') as pub,
              has_function_privilege('anon', p.oid, 'execute') as anon
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.proname in ('create_inventory_item','update_inventory_item','archive_inventory_item','restore_inventory_item','record_stock_movement')`,
    );
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      expect(String(row.proconfig)).toContain('search_path=""');
      expect(row.pub).toBe(false);
      expect(row.anon).toBe(false);
      expect(row.prosecdef).toBe(row.nspname === 'private');
    }
    const triggers = await su(
      `select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname like any (array['stock_movements_%','inventory_items_%','prevent_inventory_%'])`,
    );
    expect(triggers.length).toBeGreaterThanOrEqual(5);
    for (const row of triggers) expect(String(row.proconfig)).toContain('search_path=""');
  });
});
