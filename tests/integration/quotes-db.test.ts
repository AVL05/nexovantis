// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedTwoOrgs } from '../support/fixtures';
import { createTestDb, type TestDb } from '../support/pglite';

// TASK-012 / F5: presupuestos en PostgreSQL real (PGlite) con las migraciones reales, bajo RLS y con
// las RPC reales (public.*_quote*): numeracion, aislamiento entre organizaciones y referencias
// cruzadas, aceptacion atomica e idempotente, rechazo terminal, solo lectura de terminales, rollback y
// eventos. PGlite tiene UNA sola conexion: las llamadas "paralelas" se serializan; la concurrencia
// real entre conexiones se prueba en tests/e2e-supabase/quotes.spec.ts (job `supabase` de CI).

type Row = Record<string, unknown>;

let db: TestDb;
let s: Awaited<ReturnType<typeof seedTwoOrgs>>;

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

const create = async (
  user: string,
  customer: string,
  args: { id?: string; title?: string; description?: string | null } = {},
) =>
  String(
    (
      await run(user, `select public.create_quote($1::uuid, $2::uuid, $3, $4) as id`, [
        args.id ?? randomUUID(),
        customer,
        args.title ?? 'Reforma de cocina',
        args.description === undefined ? 'Cambio de encimera' : args.description,
      ])
    )[0].id,
  );
const addItem = async (user: string, quote: string, qty = '2', price = 10000, bp = 2100) =>
  String(
    (
      await run(
        user,
        `select public.add_quote_item($1::uuid, $2::uuid, 'Mano de obra', $3::numeric, $4::bigint, $5::int) as id`,
        [quote, randomUUID(), qty, price, bp],
      )
    )[0].id,
  );
const accept = async (user: string, quote: string) =>
  String((await run(user, `select public.accept_quote($1::uuid) as id`, [quote]))[0].id);
const reject = async (user: string, quote: string) =>
  (await run(user, `select public.reject_quote($1::uuid) as ok`, [quote]))[0].ok as boolean;

const quoteRow = async (id: string) =>
  (await su(`select * from public.quotes where id = $1`, [id]))[0];
const orders = (org: string) =>
  su(`select * from public.work_orders where organization_id = $1 order by created_at, id`, [org]);
const quoteEvents = (id: string) =>
  su(
    `select action, actor_id, seq from public.activity_events
      where entity_type = 'quote' and entity_id = $1 order by seq`,
    [id],
  );
const newCustomer = async (org: string, name: string) =>
  String(
    (
      await su(
        `insert into public.customers (organization_id, name) values ($1, $2) returning id`,
        [org, name],
      )
    )[0].id,
  );

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe('alta y numeracion legible por organizacion', () => {
  it('nace en borrador, con numero correlativo propio de cada organizacion y evento created', async () => {
    const a1 = await create(s.ownerA, s.customerA);
    const a2 = await create(s.memberA, s.customerA);
    const b1 = await create(s.ownerB, s.customerB);
    const rows = await su(
      `select id, number, status, organization_id, subtotal_cents, tax_cents, total_cents, order_id
         from public.quotes where id = any($1::uuid[])`,
      [[a1, a2, b1]],
    );
    const by = Object.fromEntries(rows.map((r) => [String(r.id), r]));
    expect(by[a2].number as number).toBe(Number(by[a1].number) + 1);
    expect(Number(by[b1].number)).toBe(1); // cada organizacion cuenta desde 1
    expect(by[a1]).toMatchObject({
      status: 'draft',
      organization_id: s.orgA,
      order_id: null,
    });
    expect([by[a1].subtotal_cents, by[a1].tax_cents, by[a1].total_cents].map(Number)).toEqual([
      0, 0, 0,
    ]);
    const events = await quoteEvents(a1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'created', actor_id: s.ownerA });
    expect(events[0].seq).not.toBeNull();
  });

  it('un reintento con el mismo id devuelve el mismo presupuesto sin consumir otro numero ni evento', async () => {
    const id = randomUUID();
    await create(s.ownerA, s.customerA, { id });
    const before = Number(
      (
        await su(`select last_number from private.quote_counters where organization_id = $1`, [
          s.orgA,
        ])
      )[0].last_number,
    );
    await create(s.ownerA, s.customerA, { id });
    await create(s.memberA, s.customerA, { id });
    const after = Number(
      (
        await su(`select last_number from private.quote_counters where organization_id = $1`, [
          s.orgA,
        ])
      )[0].last_number,
    );
    expect(after).toBe(before);
    expect(
      (await su(`select count(*)::int as n from public.quotes where id = $1`, [id]))[0].n,
    ).toBe(1);
    expect(await quoteEvents(id)).toHaveLength(1);
  });

  it('un alta fallida no consume numero (sin huecos)', async () => {
    const counter = async () =>
      Number(
        (
          await su(`select last_number from private.quote_counters where organization_id = $1`, [
            s.orgA,
          ])
        )[0].last_number,
      );
    const before = await counter();
    await failsWith(create(s.ownerA, s.customerB), 'NX013'); // cliente de otra organizacion
    expect(await counter()).toBe(before);
    const ok = await create(s.ownerA, s.customerA);
    expect(Number((await quoteRow(ok)).number)).toBe(before + 1);
  });

  it('un id ya usado por otra organizacion se rechaza sin revelar el presupuesto', async () => {
    const id = await create(s.ownerB, s.customerB);
    await failsWith(create(s.ownerA, s.customerA, { id }), '23505');
  });

  it('exige un cliente activo de la propia organizacion (NX013)', async () => {
    const archived = await newCustomer(s.orgA, 'Cliente archivado');
    await suAs(s.ownerA, `update public.customers set archived_at = now() where id = $1`, [
      archived,
    ]);
    await failsWith(create(s.ownerA, archived), 'NX013');
    await failsWith(create(s.ownerA, randomUUID()), 'NX013');
    await failsWith(create(s.ownerA, s.customerB), 'NX013');
  });
});

describe('edicion: solo en borrador', () => {
  it('actualiza cliente, titulo y descripcion en borrador; el cliente nuevo debe ser valido', async () => {
    const quote = await create(s.ownerA, s.customerA);
    const other = await newCustomer(s.orgA, 'Otro cliente');
    await run(s.memberA, `select public.update_quote($1::uuid, $2::uuid, 'Nuevo titulo', null)`, [
      quote,
      other,
    ]);
    expect(await quoteRow(quote)).toMatchObject({
      title: 'Nuevo titulo',
      customer_id: other,
      description: null,
    });
    await failsWith(
      run(s.memberA, `select public.update_quote($1::uuid, $2::uuid, 'x', null)`, [
        quote,
        s.customerB,
      ]),
      'NX013',
    );
  });

  it('el numero y la organizacion no cambian', async () => {
    const quote = await create(s.ownerA, s.customerA);
    await failsWith(su(`update public.quotes set number = 999 where id = $1`, [quote]), '23000');
    await failsWith(
      su(`update public.quotes set organization_id = $1 where id = $2`, [s.orgB, quote]),
      '23000',
    );
  });
});

describe('aislamiento entre organizaciones (RLS) y referencias cruzadas', () => {
  it('otra organizacion no ve presupuestos ni conceptos; anon no ve nada', async () => {
    const quote = await create(s.ownerA, s.customerA);
    await addItem(s.ownerA, quote);
    expect((await run(s.ownerB, `select * from public.quotes where id = $1`, [quote])).length).toBe(
      0,
    );
    expect(
      (await run(s.memberB, `select * from public.quote_items where quote_id = $1`, [quote]))
        .length,
    ).toBe(0);
    expect(
      (await run(s.memberA, `select * from public.quote_items where quote_id = $1`, [quote]))
        .length,
    ).toBe(1);
    await failsWith(
      db.asAnon((tx) => tx.query(`select * from public.quotes`)),
      '42501',
    );
  });

  it('las RPC sobre un presupuesto o concepto ajeno responden como inexistentes (sin efecto)', async () => {
    const quote = await create(s.ownerA, s.customerA);
    const item = await addItem(s.ownerA, quote);
    await failsWith(accept(s.ownerB, quote), 'NX010');
    await failsWith(reject(s.ownerB, quote), 'NX010');
    await failsWith(
      run(s.ownerB, `select public.update_quote($1::uuid, $2::uuid, 'x', null)`, [
        quote,
        s.customerB,
      ]),
      'NX010',
    );
    await failsWith(addItem(s.ownerB, quote), 'NX010');
    await failsWith(
      run(
        s.ownerB,
        `select public.update_quote_item($1::uuid, 'x', 1::numeric, 1::bigint, 2100::int)`,
        [item],
      ),
      'NX014',
    );
    const removed = await run(s.ownerB, `select public.remove_quote_item($1::uuid) as ok`, [item]);
    expect(removed[0].ok).toBe(false);
    expect(await quoteRow(quote)).toMatchObject({ status: 'draft' });
    expect(
      (await su(`select count(*)::int as n from public.quote_items where id = $1`, [item]))[0].n,
    ).toBe(1);
  });

  it('un usuario no puede escribir las tablas por PostgREST/SQL directo (solo SELECT)', async () => {
    const quote = await create(s.ownerA, s.customerA);
    await failsWith(
      run(s.ownerA, `update public.quotes set title = 'x' where id = $1`, [quote]),
      '42501',
    );
    await failsWith(
      run(
        s.ownerA,
        `insert into public.quotes (organization_id, number, customer_id, title) values ($1, 99, $2, 'x')`,
        [s.orgA, s.customerA],
      ),
      '42501',
    );
    await failsWith(run(s.ownerA, `delete from public.quotes where id = $1`, [quote]), '42501');
    await failsWith(
      run(
        s.ownerA,
        `insert into public.quote_items (organization_id, quote_id, position, description, quantity, unit_price_cents)
         values ($1, $2, 1, 'x', 1, 1)`,
        [s.orgA, quote],
      ),
      '42501',
    );
    await failsWith(run(s.ownerA, `update public.quote_items set quantity = 9`), '42501');
  });

  it('claves foraneas compuestas: cliente, orden y concepto de la MISMA organizacion (NX013/NX010/23503)', async () => {
    const quote = await create(s.ownerA, s.customerA);
    // Cliente de otra organizacion (SQL de administracion: el trigger rechaza con NX013)
    await failsWith(
      su(`update public.quotes set customer_id = $1 where id = $2`, [s.customerB, quote]),
      'NX013',
    );
    // Concepto con organizacion distinta de la del presupuesto
    await failsWith(
      su(
        `insert into public.quote_items (organization_id, quote_id, position, description, quantity, unit_price_cents)
         values ($1, $2, 50, 'x', 1, 1)`,
        [s.orgB, quote],
      ),
      'NX010', // el trigger del concepto no encuentra el presupuesto en esa organizacion
    );
    await addItem(s.ownerA, quote); // con concepto: el rechazo viene de la orden, no de NX016
    // Orden de otra organizacion enlazada a un presupuesto de A
    const orderB = String(
      (
        await run(
          s.ownerB,
          `select public.create_work_order($1::uuid, $2::uuid, 'Orden B', null, 'normal', '2026-12-01'::date, null) as id`,
          [randomUUID(), s.customerB],
        )
      )[0].id,
    );
    await failsWith(
      suAs(
        s.ownerA,
        `update public.quotes set status = 'accepted', order_id = $1, decided_by = $2 where id = $3`,
        [orderB, s.ownerA, quote],
      ),
      '23503',
    );
    // Orden de la misma organizacion pero de OTRO cliente: tampoco corresponde.
    const other = await newCustomer(s.orgA, 'Cliente distinto');
    const orderOther = String(
      (
        await run(
          s.ownerA,
          `select public.create_work_order($1::uuid, $2::uuid, 'Orden otro', null, 'normal', '2026-12-01'::date, null) as id`,
          [randomUUID(), other],
        )
      )[0].id,
    );
    await failsWith(
      suAs(
        s.ownerA,
        `update public.quotes set status = 'accepted', order_id = $1, decided_by = $2 where id = $3`,
        [orderOther, s.ownerA, quote],
      ),
      '23503',
    );
    expect(await quoteRow(quote)).toMatchObject({ status: 'draft', order_id: null });
  });

  it('el enlace presupuesto-orden es UNIQUE y un presupuesto no puede nacer aceptado', async () => {
    const unique = await su(
      `select 1 from pg_constraint where conrelid = 'public.quotes'::regclass
         and conname = 'quotes_order_id_key' and contype = 'u'`,
    );
    expect(unique).toHaveLength(1);
    await failsWith(
      su(
        `insert into public.quotes (organization_id, number, customer_id, title, status)
         values ($1, 9001, $2, 'x', 'accepted')`,
        [s.orgA, s.customerA],
      ),
      'NX012',
    );
  });
});

describe('aceptar (BR05): una transaccion, exactamente una orden', () => {
  it('crea una unica orden pendiente de la misma organizacion y cliente, enlazada y con eventos', async () => {
    const quote = await create(s.ownerA, s.customerA, {
      title: 'Instalacion de caldera',
      description: 'Modelo X',
    });
    await addItem(s.ownerA, quote, '2', 12345, 2100); // 24690 + 5185 (5184,9 -> 5185)
    const before = (await orders(s.orgA)).length;

    const orderId = await accept(s.memberA, quote);

    const all = await orders(s.orgA);
    expect(all).toHaveLength(before + 1);
    const order = all.find((o) => o.id === orderId)!;
    expect(order).toMatchObject({
      organization_id: s.orgA,
      customer_id: s.customerA,
      title: 'Instalacion de caldera',
      status: 'pending',
      technician_id: null,
      priority: 'normal',
    });
    expect(String(order.description)).toContain('Modelo X');
    expect(String(order.description)).toContain('PRE-');
    expect(String(order.description)).toContain('298,75 EUR'); // 24690 + 5185 = 29875 centimos
    const q = await quoteRow(quote);
    expect(q).toMatchObject({ status: 'accepted', order_id: orderId, decided_by: s.memberA });
    expect(q.decided_at).not.toBeNull();
    expect(Number(q.total_cents)).toBe(29875);

    // Eventos: la orden (created) y el presupuesto (created, accepted), con actor y seq coherentes.
    const qEvents = await quoteEvents(quote);
    expect(qEvents.map((e) => e.action)).toEqual(['created', 'accepted']);
    expect(qEvents.every((e) => e.actor_id !== null && e.seq !== null)).toBe(true);
    expect(qEvents[1].actor_id).toBe(s.memberA);
    const oEvents = await su(
      `select action, actor_id, seq from public.activity_events
        where entity_type = 'work_order' and entity_id = $1 order by seq`,
      [orderId],
    );
    expect(oEvents.map((e) => e.action)).toEqual(['created']);
    expect(oEvents[0].actor_id).toBe(s.memberA);
    // La orden se crea antes de dejar el presupuesto aceptado.
    expect(Number(oEvents[0].seq)).toBeLessThan(Number(qEvents[1].seq));
  });

  it('repetir la aceptacion es idempotente: misma orden, sin duplicados ni eventos nuevos', async () => {
    const quote = await create(s.ownerA, s.customerA);
    await addItem(s.ownerA, quote);
    const before = (await orders(s.orgA)).length;
    const first = await accept(s.ownerA, quote);
    const second = await accept(s.ownerA, quote);
    const third = await accept(s.memberA, quote);
    expect([second, third]).toEqual([first, first]);
    expect(await orders(s.orgA)).toHaveLength(before + 1);
    expect((await quoteEvents(quote)).map((e) => e.action)).toEqual(['created', 'accepted']);
  });

  it('N aceptaciones en paralelo producen exactamente una orden (serializadas en PGlite)', async () => {
    const quote = await create(s.ownerA, s.customerA);
    await addItem(s.ownerA, quote);
    const before = (await orders(s.orgA)).length;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => accept(i % 2 === 0 ? s.ownerA : s.memberA, quote)),
    );
    expect(new Set(results).size).toBe(1);
    expect(await orders(s.orgA)).toHaveLength(before + 1);
    const linked = await su(`select count(*)::int as n from public.quotes where order_id = $1`, [
      results[0],
    ]);
    expect(linked[0].n).toBe(1);
    expect((await quoteEvents(quote)).filter((e) => e.action === 'accepted')).toHaveLength(1);
  });

  it('si falla la creacion de la orden se revierte TODO (cliente archivado: NX002)', async () => {
    const customer = await newCustomer(s.orgA, 'Cliente que se archiva');
    const quote = await create(s.ownerA, customer);
    await addItem(s.ownerA, quote);
    await suAs(s.ownerA, `update public.customers set archived_at = now() where id = $1`, [
      customer,
    ]);
    const before = (await orders(s.orgA)).length;
    const ordersEvents = Number(
      (
        await su(
          `select count(*)::int as n from public.activity_events where entity_type = 'work_order'`,
        )
      )[0].n,
    );

    await failsWith(accept(s.ownerA, quote), 'NX002');

    expect(await quoteRow(quote)).toMatchObject({
      status: 'draft',
      order_id: null,
      decided_at: null,
    });
    expect(await orders(s.orgA)).toHaveLength(before);
    expect(
      Number(
        (
          await su(
            `select count(*)::int as n from public.activity_events where entity_type = 'work_order'`,
          )
        )[0].n,
      ),
    ).toBe(ordersEvents);
    expect((await quoteEvents(quote)).map((e) => e.action)).toEqual(['created']);

    // Tras restaurar el cliente, la aceptacion funciona (el rollback no dejo estado a medias).
    await suAs(s.ownerA, `update public.customers set archived_at = null where id = $1`, [
      customer,
    ]);
    await accept(s.ownerA, quote);
    expect((await quoteRow(quote)).status).toBe('accepted');
  });

  it('un fallo al enlazar tambien revierte la orden (restriccion en la propia transaccion)', async () => {
    const quote = await create(s.ownerA, s.customerA);
    await addItem(s.ownerA, quote, '1', 1000, 2100);
    const before = (await orders(s.orgA)).length;
    // Se fuerza un fallo DESPUES de crear la orden: una transaccion que acepta y luego aborta.
    await failsWith(
      db.asUser(s.ownerA, async (tx) => {
        await tx.query(`select public.accept_quote($1::uuid)`, [quote]);
        await tx.query(`select 1/0`);
      }),
      '22012',
    );
    expect(await orders(s.orgA)).toHaveLength(before);
    expect((await quoteRow(quote)).status).toBe('draft');
  });

  it('un presupuesto sin conceptos no se acepta (NX016): sin orden, sigue en borrador y se acepta al anadir uno', async () => {
    const quote = await create(s.ownerA, s.customerA, { description: null });
    const before = (await orders(s.orgA)).length;
    await failsWith(accept(s.ownerA, quote), 'NX016');
    expect(await orders(s.orgA)).toHaveLength(before);
    const row = await quoteRow(quote);
    expect(row.status).toBe('draft');
    expect(row.order_id).toBeNull();

    await addItem(s.ownerA, quote, '1', 1000, 2100);
    const orderId = await accept(s.ownerA, quote);
    expect(await orders(s.orgA)).toHaveLength(before + 1);
    expect(await accept(s.ownerA, quote)).toBe(orderId);
  });
});

describe('rechazar y decisiones contrarias', () => {
  it('rechazar es terminal, no crea orden y repetirlo no duplica eventos', async () => {
    const quote = await create(s.ownerA, s.customerA);
    const before = (await orders(s.orgA)).length;
    expect(await reject(s.memberA, quote)).toBe(true);
    expect(await reject(s.ownerA, quote)).toBe(false);
    expect(await quoteRow(quote)).toMatchObject({
      status: 'rejected',
      order_id: null,
      decided_by: s.memberA,
    });
    expect(await orders(s.orgA)).toHaveLength(before);
    expect((await quoteEvents(quote)).map((e) => e.action)).toEqual(['created', 'rejected']);
  });

  it('aceptar un rechazado y rechazar un aceptado son errores controlados (NX012) sin efecto', async () => {
    const rejected = await create(s.ownerA, s.customerA);
    await reject(s.ownerA, rejected);
    const before = (await orders(s.orgA)).length;
    await failsWith(accept(s.ownerA, rejected), 'NX012');
    expect(await orders(s.orgA)).toHaveLength(before);
    expect((await quoteRow(rejected)).status).toBe('rejected');

    const accepted = await create(s.ownerA, s.customerA);
    await addItem(s.ownerA, accepted, '1', 1000, 2100);
    const orderId = await accept(s.ownerA, accepted);
    await failsWith(reject(s.ownerA, accepted), 'NX012');
    expect(await quoteRow(accepted)).toMatchObject({ status: 'accepted', order_id: orderId });
  });
});

describe('aceptado y rechazado son de solo lectura (RPC y SQL de administracion)', () => {
  async function terminal(kind: 'accepted' | 'rejected') {
    const quote = await create(s.ownerA, s.customerA);
    const item = await addItem(s.ownerA, quote);
    if (kind === 'accepted') await accept(s.ownerA, quote);
    else await reject(s.ownerA, quote);
    return { quote, item };
  }

  it.each(['accepted', 'rejected'] as const)(
    '%s: ninguna RPC de edicion funciona (NX011)',
    async (kind) => {
      const { quote, item } = await terminal(kind);
      await failsWith(
        run(s.ownerA, `select public.update_quote($1::uuid, $2::uuid, 'x', null)`, [
          quote,
          s.customerA,
        ]),
        'NX011',
      );
      await failsWith(addItem(s.ownerA, quote), 'NX011');
      await failsWith(
        run(
          s.ownerA,
          `select public.update_quote_item($1::uuid, 'x', 1::numeric, 1::bigint, 2100::int)`,
          [item],
        ),
        'NX011',
      );
      await failsWith(run(s.ownerA, `select public.remove_quote_item($1::uuid)`, [item]), 'NX011');
    },
  );

  it.each(['accepted', 'rejected'] as const)(
    '%s: triggers de base rechazan cualquier escritura',
    async (kind) => {
      const { quote, item } = await terminal(kind);
      const before = await quoteRow(quote);
      await failsWith(su(`update public.quotes set title = 'x' where id = $1`, [quote]), 'NX011');
      await failsWith(
        su(
          `update public.quotes set total_cents = 1, subtotal_cents = 1, tax_cents = 0 where id = $1`,
          [quote],
        ),
        'NX011',
      );
      await failsWith(
        su(`update public.quotes set status = 'draft' where id = $1`, [quote]),
        'NX012',
      );
      await failsWith(
        su(
          `update public.quotes set status = '${kind === 'accepted' ? 'rejected' : 'accepted'}' where id = $1`,
          [quote],
        ),
        'NX012',
      );
      await failsWith(
        su(`update public.quote_items set quantity = 9 where id = $1`, [item]),
        'NX011',
      );
      await failsWith(su(`delete from public.quote_items where id = $1`, [item]), 'NX011');
      await failsWith(
        su(
          `insert into public.quote_items (organization_id, quote_id, position, description, quantity, unit_price_cents)
         values ($1, $2, 77, 'x', 1, 1)`,
          [s.orgA, quote],
        ),
        'NX011',
      );
      await failsWith(su(`delete from public.quotes where id = $1`, [quote]), '23000');
      expect(await quoteRow(quote)).toEqual(before);
      expect(
        (await su(`select count(*)::int as n from public.quote_items where id = $1`, [item]))[0].n,
      ).toBe(1);
    },
  );

  it('los presupuestos no se borran ni se vacian (TRUNCATE) y los eventos son inmutables', async () => {
    const quote = await create(s.ownerA, s.customerA);
    await failsWith(su(`delete from public.quotes where id = $1`, [quote]), '23000');
    await failsWith(su(`truncate public.quotes cascade`), '23000');
    await failsWith(su(`truncate public.quote_items`), '23000');
    await failsWith(
      su(`update public.activity_events set action = 'created' where entity_id = $1`, [quote]),
      '23000',
    );
  });

  it('sin usuario autenticado no hay decision ni evento (el actor nunca es nulo)', async () => {
    await failsWith(
      su(
        `insert into public.quotes (organization_id, number, customer_id, title) values ($1, 8001, $2, 'x')`,
        [s.orgA, s.customerA],
      ),
      '23000',
    );
  });
});

describe('privilegios de las funciones', () => {
  it('anon no puede ejecutar ninguna RPC ni las funciones privadas', async () => {
    for (const call of [
      `select public.create_quote(gen_random_uuid(), gen_random_uuid(), 'x', null)`,
      `select public.accept_quote(gen_random_uuid())`,
      `select public.reject_quote(gen_random_uuid())`,
      `select public.remove_quote_item(gen_random_uuid())`,
      `select private.accept_quote(gen_random_uuid())`,
    ]) {
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
        await tx.query(`select public.accept_quote(gen_random_uuid())`);
      }),
      '42501',
    );
  });

  it('las funciones SECURITY DEFINER fijan search_path vacio y no son ejecutables por PUBLIC', async () => {
    const rows = await su(
      `select p.proname, p.prosecdef, p.proconfig, has_function_privilege('public', p.oid, 'execute') as pub
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.proname in ('create_quote','update_quote','add_quote_item','update_quote_item','remove_quote_item','accept_quote','reject_quote')`,
    );
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(row.prosecdef).toBe(true);
      expect(String(row.proconfig)).toContain('search_path=""');
      expect(row.pub).toBe(false);
    }
  });
});
