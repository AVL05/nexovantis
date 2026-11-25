// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { seedTwoOrgs } from '../../support/fixtures';
import { createTestDb, type TestDb, type TestTx } from '../../support/pglite';

// Pruebas independientes de Testing (TASK-012 POST, F5 presupuestos). Develop no las modifica ni las salta.
// PGlite = PostgreSQL real in-process con las migraciones reales y un shim de auth. NO es PostgREST ni
// Supabase Auth y NO hay concurrencia real (una sola conexion): la concurrencia se prueba solo como
// secuencias; la concurrencia real (>=10 aceptaciones paralelas, carrera aceptar/rechazar) requiere
// PostgreSQL con varias conexiones (job `supabase` de CI) y queda BLOCKED en este entorno.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

type Row = Record<string, unknown>;
type Seed = Awaited<ReturnType<typeof seedTwoOrgs>>;

let db: TestDb;
let s: Seed;

const q = async (user: string, sql: string, params: unknown[] = []) =>
  (await db.asUser(user, (tx) => tx.query<Row>(sql, params))).rows;
const su = async (sql: string, params: unknown[] = []) =>
  (await db.asSuperuser((tx) => tx.query<Row>(sql, params))).rows;

/** Superusuario (sin RLS ni GRANT) con claims de un usuario: simula SQL de administracion con actor. */
async function adminAs<T>(user: string, fn: (tx: TestTx) => Promise<T>): Promise<T> {
  return db.asSuperuser(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: user, role: 'authenticated' }),
    ]);
    return fn(tx);
  });
}

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    return String((e as { code?: string }).code ?? 'sin-codigo');
  }
  return 'OK';
};

const newCustomer = async (org: string) =>
  String(
    (
      await su(
        `insert into public.customers (organization_id, name) values ($1, 'Cliente ' || gen_random_uuid()::text) returning id`,
        [org],
      )
    )[0].id,
  );

const createQuote = async (user: string, customer: string, id: string = randomUUID()) =>
  String(
    (
      await q(
        user,
        `select public.create_quote($1::uuid,$2::uuid,'Presupuesto indep.','desc') as id`,
        [id, customer],
      )
    )[0].id,
  );
const addItem = async (
  user: string,
  quote: string,
  qty: string | number,
  price: number,
  bp: number | null = 2100,
  id: string = randomUUID(),
) =>
  String(
    (
      await q(
        user,
        `select public.add_quote_item($1::uuid,$2::uuid,'Concepto',$3::numeric,$4::bigint,$5::int) as id`,
        [quote, id, qty, price, bp],
      )
    )[0].id,
  );
const accept = (user: string, id: string) =>
  q(user, `select public.accept_quote($1::uuid) as r`, [id]);
const reject = (user: string, id: string) =>
  q(user, `select public.reject_quote($1::uuid) as r`, [id]);

const quoteRow = async (id: string) =>
  (await su(`select * from public.quotes where id = $1`, [id]))[0];
const orderCount = async () =>
  Number((await su(`select count(*)::int as n from public.work_orders`))[0].n);
const events = async (id: string, type = 'quote') =>
  su(
    `select action, actor_id, seq from public.activity_events where entity_id = $1 and entity_type = $2 order by seq`,
    [id, type],
  );

async function quoteWith(
  user: string,
  org: string,
  lines: Array<[string | number, number, number]>,
) {
  const customer = await newCustomer(org);
  const id = await createQuote(user, customer);
  for (const [qty, price, bp] of lines) await addItem(user, id, qty, price, bp);
  return { id, customer };
}

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
});
afterAll(async () => {
  await db.close();
});

describe('calculo exacto (entero, half-up por linea)', () => {
  // [cantidad, precio en centimos, IVA bp, subtotal esperado, IVA esperado]
  const CASES: Array<[string, number, number, number, number]> = [
    ['1', 1000, 2100, 1000, 210],
    ['1', 1000, 1000, 1000, 100],
    ['1', 1000, 0, 1000, 0],
    ['0.001', 1, 2100, 0, 0], // 0,001 cent -> 0
    ['0.5', 1, 2100, 1, 0], // 0,5 -> half-up 1; IVA 0,21 -> 0
    ['0.001', 500, 2100, 1, 0], // 0,5 exacto -> 1
    ['0.001', 499, 2100, 0, 0], // 0,499 -> 0
    ['1.005', 100, 2100, 101, 21], // 100,5 -> 101; IVA 21,21 -> 21
    ['0.333', 100, 2100, 33, 7], // 33,3 -> 33; IVA 6,93 -> 7
    ['2.5', 3, 1000, 8, 1], // 7,5 -> 8; IVA 0,8 -> 1
    ['3', 5, 1000, 15, 2], // 15; IVA 1,5 -> 2 (half-up)
    ['1', 5, 1000, 5, 1], // IVA 0,5 -> 1 (half-up exacto)
    ['1', 4, 1000, 4, 0], // IVA 0,4 -> 0
    ['1', 3, 2100, 3, 1], // IVA 0,63 -> 1
    ['1', 1, 2100, 1, 0], // IVA 0,21 -> 0
    ['1', 100, 1050, 100, 11], // 10,5 -> 11 (tipo no estandar)
    ['1', 100, 1, 100, 0], // 0,01 % -> 0
    ['100000', 100000000, 10000, 10000000000000, 10000000000000], // maximos: 10^13 + 10^13
    ['99999.999', 100000000, 2100, 9999999900000, 2099999979000], // casi maximo
  ];
  it.each(CASES)('cant %s x %i c, IVA %i bp', async (qty, price, bp, sub, tax) => {
    const { id } = await quoteWith(s.ownerA, s.orgA, [[qty, price, bp]]);
    const items = await su(
      `select subtotal_cents, tax_cents from public.quote_items where quote_id=$1`,
      [id],
    );
    expect([Number(items[0].subtotal_cents), Number(items[0].tax_cents)]).toEqual([sub, tax]);
    const quote = await quoteRow(id);
    expect([
      Number(quote.subtotal_cents),
      Number(quote.tax_cents),
      Number(quote.total_cents),
    ]).toEqual([sub, tax, sub + tax]);
  });

  it('redondeo por linea (no sobre el total) y total = suma de subtotales + suma de IVA de linea', async () => {
    // 3 lineas de 3 c al 21 %: IVA de linea 0,63 -> 1 cada una = 3 (redondear el total daria 2).
    const { id } = await quoteWith(s.ownerA, s.orgA, [
      ['1', 3, 2100],
      ['1', 3, 2100],
      ['1', 3, 2100],
    ]);
    const quote = await quoteRow(id);
    expect([
      Number(quote.subtotal_cents),
      Number(quote.tax_cents),
      Number(quote.total_cents),
    ]).toEqual([9, 3, 12]);
  });

  it('mezcla de 0 / 10 / 21 % y totales tras editar y borrar conceptos', async () => {
    const customer = await newCustomer(s.orgA);
    const id = await createQuote(s.ownerA, customer);
    const a = await addItem(s.ownerA, id, '2', 1050, 2100); // 2100 + 441
    await addItem(s.ownerA, id, '1.5', 999, 1000); // 1498.5->1499 ; 150
    const c = await addItem(s.ownerA, id, '4', 250, 0); // 1000 + 0
    let qt = await quoteRow(id);
    expect(Number(qt.subtotal_cents)).toBe(2100 + 1499 + 1000);
    expect(Number(qt.tax_cents)).toBe(441 + 150 + 0);
    await q(s.ownerA, `select public.update_quote_item($1::uuid,'x',1::numeric,100::bigint,2100)`, [
      a,
    ]);
    expect(await q(s.ownerA, `select public.remove_quote_item($1::uuid) as r`, [c])).toEqual([
      { r: true },
    ]);
    qt = await quoteRow(id);
    expect(Number(qt.subtotal_cents)).toBe(100 + 1499);
    expect(Number(qt.tax_cents)).toBe(21 + 150);
    expect(Number(qt.total_cents)).toBe(100 + 1499 + 21 + 150);
  });

  it('100 conceptos al maximo suman exacto sin desbordar y el 101 se rechaza (NX015)', async () => {
    const customer = await newCustomer(s.orgA);
    const id = await createQuote(s.ownerA, customer);
    for (let i = 0; i < 100; i += 1) await addItem(s.ownerA, id, '100000', 100000000, 10000);
    const qt = await quoteRow(id);
    expect(BigInt(String(qt.total_cents))).toBe(2_000_000_000_000_000n);
    expect(2_000_000_000_000_000 < Number.MAX_SAFE_INTEGER).toBe(true);
    expect(await code(addItem(s.ownerA, id, 1, 1, 0))).toBe('NX015');
  });

  it.each([
    ['cantidad 0', 0, 100, 2100],
    ['cantidad negativa', -1, 100, 2100],
    ['cantidad > 100000', '100000.001', 100, 2100],
    ['cantidad 4 decimales', '1.0005', 100, 2100],
    ['precio negativo', 1, -1, 2100],
    ['precio > maximo', 1, 100000001, 2100],
    ['IVA > 10000', 1, 100, 10001],
    ['IVA negativo', 1, 100, -1],
  ])('rechaza %s', async (_n, qty, price, bp) => {
    const customer = await newCustomer(s.orgA);
    const id = await createQuote(s.ownerA, customer);
    expect(await code(addItem(s.ownerA, id, qty, price, bp))).toBe('23514');
  });

  it('IVA por defecto 2100 cuando se omite (null)', async () => {
    const { id } = await quoteWith(s.ownerA, s.orgA, [['1', 1000, null as unknown as number]]);
    const row = (
      await su(`select tax_rate_bp, tax_cents from public.quote_items where quote_id=$1`, [id])
    )[0];
    expect([Number(row.tax_rate_bp), Number(row.tax_cents)]).toEqual([2100, 210]);
  });

  it('ningun tipo float/real/double en las tablas de presupuestos y los totales son bigint', async () => {
    const cols = await su(
      `select table_name, column_name, data_type from information_schema.columns
       where table_schema='public' and table_name in ('quotes','quote_items')
         and data_type in ('real','double precision')`,
    );
    expect(cols).toEqual([]);
    const money = await su(
      `select data_type from information_schema.columns where table_schema='public'
         and table_name in ('quotes','quote_items') and column_name like '%cents'`,
    );
    expect(new Set(money.map((r) => r.data_type))).toEqual(new Set(['bigint']));
  });

  it('un cliente con SQL de administracion no puede fijar totales (el trigger los sobrescribe)', async () => {
    const { id } = await quoteWith(s.ownerA, s.orgA, [['1', 1000, 2100]]);
    await adminAs(s.ownerA, (tx) =>
      tx.query(
        `update public.quotes set subtotal_cents=1, tax_cents=1, total_cents=2 where id=$1`,
        [id],
      ),
    );
    expect(Number((await quoteRow(id)).total_cents)).toBe(1210);
    await adminAs(s.ownerA, (tx) =>
      tx.query(`update public.quote_items set subtotal_cents=7, tax_cents=7 where quote_id=$1`, [
        id,
      ]),
    );
    expect(Number((await quoteRow(id)).total_cents)).toBe(1210);
  });
});

describe('RLS y aislamiento entre organizaciones', () => {
  it('B no ve presupuestos ni conceptos de A; A los ve', async () => {
    const { id } = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    expect(await q(s.ownerB, `select id from public.quotes where id=$1`, [id])).toEqual([]);
    expect(await q(s.ownerB, `select id from public.quote_items where quote_id=$1`, [id])).toEqual(
      [],
    );
    expect(await q(s.memberA, `select id from public.quotes where id=$1`, [id])).toHaveLength(1);
    expect(
      await q(s.memberA, `select id from public.quote_items where quote_id=$1`, [id]),
    ).toHaveLength(1);
  });

  it('escrituras de B sobre un presupuesto/concepto de A: NX010/NX014 y sin efectos', async () => {
    const { id, customer } = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    const item = String(
      (await su(`select id from public.quote_items where quote_id=$1`, [id]))[0].id,
    );
    const before = await quoteRow(id);
    expect(await code(accept(s.ownerB, id))).toBe('NX010');
    expect(await code(reject(s.ownerB, id))).toBe('NX010');
    expect(await code(addItem(s.ownerB, id, 1, 1, 0))).toBe('NX010');
    expect(
      await code(
        q(s.ownerB, `select public.update_quote($1::uuid,$2::uuid,'x',null)`, [id, s.customerB]),
      ),
    ).toBe('NX010');
    expect(
      await code(
        q(s.ownerB, `select public.update_quote_item($1::uuid,'x',1::numeric,1::bigint,0)`, [item]),
      ),
    ).toBe('NX014');
    expect(await q(s.ownerB, `select public.remove_quote_item($1::uuid) as r`, [item])).toEqual([
      { r: false },
    ]);
    expect(await quoteRow(id)).toEqual(before);
    expect(await su(`select 1 from public.quote_items where id=$1`, [item])).toHaveLength(1);
    expect(customer).toBeTruthy();
  });

  it('referencias cruzadas: cliente de otra organizacion en alta y edicion, y reuso de id ajeno', async () => {
    expect(await code(createQuote(s.ownerA, s.customerB))).toBe('NX013');
    const { id } = await quoteWith(s.ownerA, s.orgA, []);
    expect(
      await code(
        q(s.ownerA, `select public.update_quote($1::uuid,$2::uuid,'x',null)`, [id, s.customerB]),
      ),
    ).toBe('NX013');
    expect((await quoteRow(id)).customer_id).not.toBe(s.customerB);
    // mismo id de quote/concepto desde otra organizacion: no se filtra ni se pisa.
    expect(await code(createQuote(s.ownerB, s.customerB, id))).toBe('23505');
    const itemId = await addItem(s.ownerA, id, 1, 1, 0);
    const quoteB = await createQuote(s.ownerB, s.customerB);
    expect(await code(addItem(s.ownerB, quoteB, 1, 1, 0, itemId))).toBe('23505');
  });

  it('referencias cruzadas por SQL de administracion: cliente ajeno (FK) y orden ajena/de otro cliente', async () => {
    const { id } = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(`update public.quotes set customer_id=$2 where id=$1`, [id, s.customerB]),
        ),
      ),
    ).not.toBe('OK');
    // aceptar "a mano" con una orden de otra organizacion o de otro cliente: rechazado
    const orderB = String(
      (
        await q(
          s.ownerB,
          `select public.create_work_order($1::uuid,$2::uuid,'o',null,'normal','2026-12-01'::date,null) as id`,
          [randomUUID(), s.customerB],
        )
      )[0].id,
    );
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(
            `update public.quotes set status='accepted', order_id=$2, decided_by=$3, decided_at=now() where id=$1`,
            [id, orderB, s.ownerA],
          ),
        ),
      ),
    ).toBe('23503');
    const otherCust = await newCustomer(s.orgA);
    const orderOther = String(
      (
        await q(
          s.ownerA,
          `select public.create_work_order($1::uuid,$2::uuid,'o',null,'normal','2026-12-01'::date,null) as id`,
          [randomUUID(), otherCust],
        )
      )[0].id,
    );
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(
            `update public.quotes set status='accepted', order_id=$2, decided_by=$3, decided_at=now() where id=$1`,
            [id, orderOther, s.ownerA],
          ),
        ),
      ),
    ).toBe('23503');
    expect((await quoteRow(id)).status).toBe('draft');
  });

  it('usuarios no pueden escribir tablas directamente; anon no ve ni ejecuta; sin sesion no hay RPC', async () => {
    const { id } = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    const direct = [
      `insert into public.quotes (organization_id, number, customer_id, title) values ('${s.orgA}', 999, '${s.customerA}', 't')`,
      `update public.quotes set title='hack' where id='${id}'`,
      `delete from public.quotes where id='${id}'`,
      `insert into public.quote_items (organization_id, quote_id, position, description, quantity, unit_price_cents) values ('${s.orgA}','${id}',50,'x',1,1)`,
      `update public.quote_items set quantity=9 where quote_id='${id}'`,
      `delete from public.quote_items where quote_id='${id}'`,
      `select * from private.quote_counters`,
    ];
    for (const sql of direct) expect(await code(q(s.ownerA, sql)), sql).toBe('42501');
    expect(await code(db.asAnon((tx) => tx.query(`select * from public.quotes`)))).toBe('42501');
    expect(
      await code(db.asAnon((tx) => tx.query(`select public.accept_quote($1::uuid)`, [id]))),
    ).toBe('42501');
    expect(
      await code(
        db.asAnon((tx) =>
          tx.query(`select public.create_quote(null,$1::uuid,'t',null)`, [s.customerA]),
        ),
      ),
    ).toBe('42501');
    expect(
      await code(db.asSuperuser((tx) => tx.query(`select public.accept_quote($1::uuid)`, [id]))),
    ).not.toBe('OK');
  });

  it('hardening: SECURITY DEFINER con search_path vacio; EXECUTE solo authenticated (sin PUBLIC ni anon)', async () => {
    const fns = await su(
      `select n.nspname || '.' || p.proname as name, p.prosecdef, p.proconfig, p.proacl,
              coalesce((select array_agg(distinct g.grantee::regrole::text) from aclexplode(p.proacl) g
                        where g.privilege_type='EXECUTE'), '{}') as grantees,
              exists (select 1 from aclexplode(p.proacl) g where g.privilege_type='EXECUTE' and g.grantee = 0) as to_public
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where (n.nspname in ('public','private'))
          and (p.proname ~ 'quote' or p.proname in ('format_cents','check_quote_item_values'))`,
    );
    expect(fns.length).toBeGreaterThanOrEqual(17);
    for (const f of fns) {
      expect(String(f.proacl), `${f.name} sin ACL explicito`).not.toBe('null');
      expect(f.to_public, `${f.name} EXECUTE a PUBLIC`).toBe(false);
      const grantees = String(f.grantees);
      expect(grantees, `${f.name} anon`).not.toMatch(/anon/);
      if (f.prosecdef) {
        expect(String(f.proconfig), `${f.name} search_path`).toMatch(/search_path=""/);
      }
    }
    // Las 7 RPC publicas y las privadas de escritura: ejecutables por authenticated.
    for (const n of [
      'create_quote',
      'update_quote',
      'add_quote_item',
      'update_quote_item',
      'remove_quote_item',
      'accept_quote',
      'reject_quote',
    ]) {
      for (const schema of ['public', 'private']) {
        const f = fns.find((x) => x.name === `${schema}.${n}`);
        expect(f, `${schema}.${n}`).toBeDefined();
        expect(String(f!.grantees)).toMatch(/authenticated/);
      }
    }
    // Funciones de trigger (SECURITY DEFINER): ni authenticated pueden invocarlas.
    for (const n of [
      'quotes_guard',
      'quotes_record_event',
      'quote_items_guard',
      'quote_items_touch_quote',
      'prevent_quote_delete',
    ]) {
      const f = fns.find((x) => x.name === `private.${n}`);
      expect(f, n).toBeDefined();
      expect(String(f!.grantees), n).not.toMatch(/authenticated/);
    }
  });
});

describe('solo borrador editable (tambien en la base)', () => {
  it('aceptado: RPC y SQL de administracion no pueden tocar presupuesto ni conceptos', async () => {
    const { id, customer } = await quoteWith(s.ownerA, s.orgA, [['2', 500, 2100]]);
    await accept(s.ownerA, id);
    const item = String(
      (await su(`select id from public.quote_items where quote_id=$1`, [id]))[0].id,
    );
    const before = await quoteRow(id);
    const beforeItem = (await su(`select * from public.quote_items where id=$1`, [item]))[0];
    expect(await code(addItem(s.ownerA, id, 1, 1, 0))).toBe('NX011');
    expect(
      await code(
        q(s.ownerA, `select public.update_quote_item($1::uuid,'x',1::numeric,1::bigint,0)`, [item]),
      ),
    ).toBe('NX011');
    expect(await code(q(s.ownerA, `select public.remove_quote_item($1::uuid)`, [item]))).toBe(
      'NX011',
    );
    expect(
      await code(
        q(s.ownerA, `select public.update_quote($1::uuid,$2::uuid,'otro',null)`, [id, customer]),
      ),
    ).toBe('NX011');
    const admin = [
      `update public.quotes set title='hack' where id='${id}'`,
      `update public.quotes set total_cents=1 where id='${id}'`,
      `update public.quotes set description='hack' where id='${id}'`,
      `update public.quote_items set quantity=9 where id='${item}'`,
      `update public.quote_items set unit_price_cents=1 where id='${item}'`,
      `delete from public.quote_items where id='${item}'`,
      `insert into public.quote_items (organization_id, quote_id, position, description, quantity, unit_price_cents) values ('${s.orgA}','${id}',77,'x',1,1)`,
    ];
    for (const sql of admin) {
      expect(await code(adminAs(s.ownerA, (tx) => tx.query(sql))), sql).toBe('NX011');
    }
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(
            `update public.quotes set status='draft', order_id=null, decided_at=null, decided_by=null where id='${id}'`,
          ),
        ),
      ),
    ).not.toBe('OK');
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(`update public.quotes set status='rejected' where id='${id}'`),
        ),
      ),
    ).not.toBe('OK');
    expect(await quoteRow(id)).toEqual(before);
    expect((await su(`select * from public.quote_items where id=$1`, [item]))[0]).toEqual(
      beforeItem,
    );
  });

  it('rechazado: igual de solo lectura', async () => {
    const { id, customer } = await quoteWith(s.ownerA, s.orgA, [['2', 500, 2100]]);
    await reject(s.ownerA, id);
    expect(await code(addItem(s.ownerA, id, 1, 1, 0))).toBe('NX011');
    expect(
      await code(
        q(s.ownerA, `select public.update_quote($1::uuid,$2::uuid,'otro',null)`, [id, customer]),
      ),
    ).toBe('NX011');
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(`update public.quotes set title='hack' where id=$1`, [id]),
        ),
      ),
    ).toBe('NX011');
  });

  it('presupuestos no se borran ni se vacian; el numero no cambia; el alta solo nace en borrador', async () => {
    const { id } = await quoteWith(s.ownerA, s.orgA, []);
    expect(
      await code(
        adminAs(s.ownerA, (tx) => tx.query(`delete from public.quotes where id=$1`, [id])),
      ),
    ).toBe('23000');
    expect(await code(adminAs(s.ownerA, (tx) => tx.query(`truncate public.quotes`)))).not.toBe(
      'OK',
    );
    expect(await code(adminAs(s.ownerA, (tx) => tx.query(`truncate public.quote_items`)))).not.toBe(
      'OK',
    );
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(`update public.quotes set number=9999 where id=$1`, [id]),
        ),
      ),
    ).toBe('23000');
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(
            `insert into public.quotes (organization_id, number, customer_id, title, status, decided_at, decided_by) values ($1, 5000, $2, 't', 'rejected', now(), $3)`,
            [s.orgA, s.customerA, s.ownerA],
          ),
        ),
      ),
    ).toBe('NX012');
  });
});

describe('aceptacion y rechazo', () => {
  it('aceptar crea exactamente una orden coherente, evento y es idempotente', async () => {
    const { id, customer } = await quoteWith(s.ownerA, s.orgA, [['2', 1050, 2100]]);
    const ordersBefore = await orderCount();
    const first = String((await accept(s.ownerA, id))[0].r);
    const second = String((await accept(s.ownerA, id))[0].r);
    const third = String((await accept(s.memberA, id))[0].r); // otro miembro reintenta
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(await orderCount()).toBe(ordersBefore + 1);
    const qt = await quoteRow(id);
    expect([qt.status, qt.order_id, qt.decided_by]).toEqual(['accepted', first, s.ownerA]);
    const order = (await su(`select * from public.work_orders where id=$1`, [first]))[0];
    expect(order.customer_id).toBe(customer);
    expect(order.organization_id).toBe(s.orgA);
    expect(order.status).toBe('pending');
    expect(order.technician_id ?? null).toBeNull();
    expect(order.title).toBe('Presupuesto indep.');
    expect(String(order.description)).toContain('25,41 EUR'); // 2100 + 441 = 2541
    expect(String(order.description).length).toBeLessThanOrEqual(2000);
    const ev = await events(id);
    expect(ev.map((e) => e.action)).toEqual(['created', 'accepted']);
    expect(new Set(ev.map((e) => e.actor_id))).toEqual(new Set([s.ownerA]));
    for (const e of ev) expect(e.seq).not.toBeNull();
    expect(Number(ev[1].seq)).toBeGreaterThan(Number(ev[0].seq));
    expect((await events(first, 'work_order')).map((e) => e.action)).toEqual(['created']);
    // UNIQUE quote <-> order: una segunda presupuesto no puede enlazar la misma orden
    const other = await quoteWith(s.ownerA, s.orgA, []);
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(
            `update public.quotes set status='accepted', order_id=$2, decided_by=$3, decided_at=now() where id=$1`,
            [other.id, first, s.ownerA],
          ),
        ),
      ),
    ).not.toBe('OK');
  });

  it('un reintento tras aceptar no crea ordenes ni eventos adicionales', async () => {
    const { id } = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    await accept(s.ownerA, id);
    const orders = await orderCount();
    const evs = (await events(id)).length;
    for (let i = 0; i < 12; i += 1) await accept(s.ownerA, id);
    expect(await orderCount()).toBe(orders);
    expect((await events(id)).length).toBe(evs);
  });

  it('rollback total si la creacion de la orden falla (cliente archivado)', async () => {
    const { id, customer } = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    await q(s.ownerA, `update public.customers set archived_at = now() where id=$1`, [customer]);
    const orders = await orderCount();
    const evs = (await events(id)).length;
    const counters = await su(`select count(*)::int n from public.work_orders`);
    expect(await code(accept(s.ownerA, id))).toBe('NX002');
    const qt = await quoteRow(id);
    expect([qt.status, qt.order_id, qt.decided_at, qt.decided_by]).toEqual([
      'draft',
      null,
      null,
      null,
    ]);
    expect(await orderCount()).toBe(orders);
    expect(Number(counters[0].n)).toBe(orders);
    expect((await events(id)).length).toBe(evs);
    // tras restaurar el cliente se puede aceptar y se crea una sola orden
    await q(s.ownerA, `update public.customers set archived_at = null where id=$1`, [customer]);
    await accept(s.ownerA, id);
    expect(await orderCount()).toBe(orders + 1);
  });

  it('rechazar: terminal, idempotente (sin evento extra) y sin orden', async () => {
    const { id } = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    const orders = await orderCount();
    expect(await reject(s.ownerA, id)).toEqual([{ r: true }]);
    expect(await reject(s.ownerA, id)).toEqual([{ r: false }]);
    expect((await events(id)).map((e) => e.action)).toEqual(['created', 'rejected']);
    expect(await orderCount()).toBe(orders);
    const qt = await quoteRow(id);
    expect([qt.status, qt.order_id, qt.decided_by]).toEqual(['rejected', null, s.ownerA]);
  });

  it('decision contraria: aceptar un rechazado y rechazar un aceptado dan error controlado NX012 sin efectos', async () => {
    const r = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    await reject(s.ownerA, r.id);
    const orders = await orderCount();
    expect(await code(accept(s.ownerA, r.id))).toBe('NX012');
    expect((await quoteRow(r.id)).status).toBe('rejected');
    expect(await orderCount()).toBe(orders);
    const a = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    const order = String((await accept(s.ownerA, a.id))[0].r);
    expect(await code(reject(s.ownerA, a.id))).toBe('NX012');
    const qt = await quoteRow(a.id);
    expect([qt.status, qt.order_id]).toEqual(['accepted', order]);
    expect((await events(a.id)).map((e) => e.action)).toEqual(['created', 'accepted']);
  });

  it('un presupuesto de otra organizacion no se acepta ni genera orden', async () => {
    const { id } = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    const orders = await orderCount();
    expect(await code(accept(s.memberB, id))).toBe('NX010');
    expect(await orderCount()).toBe(orders);
  });

  it('decision de aceptacion sin actor autenticado no deja evento anonimo', async () => {
    const { id } = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    const evs = (await events(id)).length;
    expect(
      await code(
        db.asSuperuser((tx) => tx.query(`update public.quotes set title='x' where id=$1`, [id])),
      ),
    ).toBe('OK'); // borrador sin cambio de estado: sin evento
    expect(
      await code(
        db.asSuperuser((tx) =>
          tx.query(
            `update public.quotes set status='rejected', decided_by=$2, decided_at=now() where id=$1`,
            [id, s.ownerA],
          ),
        ),
      ),
    ).not.toBe('OK');
    expect((await events(id)).length).toBe(evs);
    expect((await quoteRow(id)).status).toBe('draft');
  });

  // Decision (c): presupuesto sin conceptos.
  it('un presupuesto vacio no se acepta (NX016): sin orden, sigue en borrador y se acepta tras anadir un concepto', async () => {
    const { id } = await quoteWith(s.ownerA, s.orgA, []);
    const orders = await orderCount();
    const evs = (await events(id)).map((e) => e.action);
    expect(await code(accept(s.ownerA, id))).toBe('NX016');
    expect(await orderCount()).toBe(orders);
    const before = await quoteRow(id);
    expect([before.status, before.order_id, before.decided_by]).toEqual(['draft', null, null]);
    expect((await events(id)).map((e) => e.action)).toEqual(evs);
    // sigue editable y, con un concepto, se acepta con una unica orden
    await addItem(s.ownerA, id, 1, 1000, 2100);
    const orderId = String((await accept(s.ownerA, id))[0].r);
    expect(await orderCount()).toBe(orders + 1);
    const order = (
      await su(`select description from public.work_orders where id=$1`, [orderId])
    )[0];
    expect(String(order.description)).toContain('12,10 EUR');
    expect((await quoteRow(id)).status).toBe('accepted');
  });

  it('NX016 no altera la idempotencia de aceptados ni el NX012 de rechazados', async () => {
    const acc = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    const order = String((await accept(s.ownerA, acc.id))[0].r);
    const orders = await orderCount();
    // un aceptado queda inmutable (no se puede vaciar), pero reaceptar devuelve la misma orden
    expect(
      await code(
        q(
          s.ownerA,
          `select public.remove_quote_item(id) from public.quote_items where quote_id=$1`,
          [acc.id],
        ),
      ),
    ).toBe('NX011');
    expect(String((await accept(s.ownerA, acc.id))[0].r)).toBe(order);
    expect(await orderCount()).toBe(orders);
    // rechazado y vacio: NX012 (no NX016)
    const rej = await quoteWith(s.ownerA, s.orgA, []);
    await reject(s.ownerA, rej.id);
    expect(await code(accept(s.ownerA, rej.id))).toBe('NX012');
    expect(await orderCount()).toBe(orders);
  });

  it('con concepto y cliente archivado el rollback sigue intacto (NX002, sin NX016)', async () => {
    const { id, customer } = await quoteWith(s.ownerA, s.orgA, [['1', 100, 2100]]);
    await q(s.ownerA, `update public.customers set archived_at = now() where id=$1`, [customer]);
    const orders = await orderCount();
    const evs = (await events(id)).length;
    expect(await code(accept(s.ownerA, id))).toBe('NX002');
    expect(await orderCount()).toBe(orders);
    expect((await quoteRow(id)).status).toBe('draft');
    expect((await events(id)).length).toBe(evs);
  });
});

describe('numeracion e idempotencia de alta', () => {
  it('mismo id = mismo presupuesto, sin consumir otro numero; numeracion por organizacion sin huecos', async () => {
    const customer = await newCustomer(s.orgA);
    const id = randomUUID();
    await createQuote(s.ownerA, customer, id);
    const n = Number((await quoteRow(id)).number);
    await createQuote(s.ownerA, customer, id);
    expect(Number((await quoteRow(id)).number)).toBe(n);
    expect(await su(`select 1 from public.quotes where id=$1`, [id])).toHaveLength(1);
    // un alta fallida (cliente ajeno) no consume numero
    expect(await code(createQuote(s.ownerA, s.customerB))).toBe('NX013');
    const next = await createQuote(s.ownerA, customer);
    expect(Number((await quoteRow(next)).number)).toBe(n + 1);
    const bNumbers = await su(
      `select number from public.quotes where organization_id=$1 order by number`,
      [s.orgB],
    );
    const nums = bNumbers.map((r) => Number(r.number));
    nums.forEach((v, i) => expect(v).toBe(i + 1));
  });

  it('el alta con cliente archivado se rechaza (NX013) y el evento created lleva actor y seq', async () => {
    const customer = await newCustomer(s.orgA);
    await q(s.ownerA, `update public.customers set archived_at = now() where id=$1`, [customer]);
    expect(await code(createQuote(s.ownerA, customer))).toBe('NX013');
    const ok = await newCustomer(s.orgA);
    const id = await createQuote(s.memberA, ok);
    const ev = await events(id);
    expect(ev).toHaveLength(1);
    expect([ev[0].action, ev[0].actor_id]).toEqual(['created', s.memberA]);
    expect(ev[0].seq).not.toBeNull();
  });
});
