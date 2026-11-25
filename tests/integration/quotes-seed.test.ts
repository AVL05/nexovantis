// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Seed demo de presupuestos (TASK-012): ejecuta los archivos REALES supabase/seeds/demo-crm.sql,
// demo-quotes.sql y demo-orders.sql en PGlite sobre las migraciones reales. Instancia propia: los
// seeds llevan su propio begin/commit y no pueden anidarse en las transacciones de los helpers.

const ROOT = new URL('../../', import.meta.url);
const path = (rel: string) => fileURLToPath(new URL(rel, ROOT));
const SHIM_PATH = path('tests/support/supabase-shim.sql');
const MIGRATIONS_DIR = path('supabase/migrations/');

const ID = {
  norte: '11111111-0000-4000-8000-000000000001',
  sur: '22222222-0000-4000-8000-000000000001',
  ownerNorte: '11111111-0000-4000-8000-0000000000a1',
  memberNorte: '11111111-0000-4000-8000-0000000000a2',
  ownerSur: '22222222-0000-4000-8000-0000000000b1',
};

type Row = Record<string, unknown>;

let crmSql: string;
let quotesSql: string;
let ordersSql: string;
let db: PGlite;

const su = async (sql: string, params: unknown[] = []) => (await db.query<Row>(sql, params)).rows;

async function newDb(): Promise<PGlite> {
  const instance = new PGlite();
  await instance.waitReady;
  const names = (await readdir(MIGRATIONS_DIR)).filter((n) => /^\d{14}_.+\.sql$/.test(n)).sort();
  await instance.exec(await readFile(SHIM_PATH, 'utf8'));
  for (const n of names) await instance.exec(await readFile(MIGRATIONS_DIR + n, 'utf8'));
  await instance.exec(
    `insert into auth.users (id, email) values
       ('${ID.ownerNorte}', 'owner.norte@example.com'), ('${ID.memberNorte}', 'member.norte@example.com'),
       ('${ID.ownerSur}', 'owner.sur@example.com');
     insert into public.organizations (id, name) values ('${ID.norte}', 'Demo Norte'), ('${ID.sur}', 'Demo Sur');
     insert into public.memberships (organization_id, user_id, role) values
       ('${ID.norte}', '${ID.ownerNorte}', 'owner'), ('${ID.norte}', '${ID.memberNorte}', 'member'),
       ('${ID.sur}', '${ID.ownerSur}', 'owner')`,
  );
  return instance;
}

const quoteStats = (org: string) =>
  su(
    `select count(*)::int as total,
            count(*) filter (where status = 'draft')::int as draft,
            count(*) filter (where status = 'accepted')::int as accepted,
            count(*) filter (where status = 'rejected')::int as rejected
     from public.quotes where organization_id = $1`,
    [org],
  ).then((r) => r[0]);

const snapshot = () =>
  su(
    `select 'q' as k, id::text, title, status, order_id::text, total_cents::text, updated_at::text from public.quotes
     union all
     select 'i', id::text, quote_id::text, description, quantity::text, subtotal_cents::text, tax_cents::text from public.quote_items
     union all
     select 'o', id::text, title, status, customer_id::text, null, updated_at::text from public.work_orders
     union all
     select 'e', id::text, entity_id::text, entity_type, action, actor_id::text, occurred_at::text from public.activity_events
     order by 1, 2`,
  );

beforeAll(async () => {
  crmSql = await readFile(path('supabase/seeds/demo-crm.sql'), 'utf8');
  quotesSql = await readFile(path('supabase/seeds/demo-quotes.sql'), 'utf8');
  ordersSql = await readFile(path('supabase/seeds/demo-orders.sql'), 'utf8');
  db = await newDb();
  await db.exec(crmSql);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe('seed demo de presupuestos', () => {
  let first: Row[];

  it('crea presupuestos en borrador, aceptados y rechazados para cada organizacion', async () => {
    await db.exec(quotesSql);
    first = await snapshot();
    expect(await quoteStats(ID.norte)).toEqual({ total: 8, draft: 3, accepted: 3, rejected: 2 });
    expect(await quoteStats(ID.sur)).toEqual({ total: 3, draft: 1, accepted: 1, rejected: 1 });
  });

  it('cada aceptado tiene EXACTAMENTE su orden (misma organizacion y cliente, pendiente); el resto, ninguna', async () => {
    const accepted = await su(
      `select q.id::text, q.order_id::text, q.customer_id::text as qc, q.organization_id::text as qo,
              w.customer_id::text as wc, w.organization_id::text as wo, w.status, w.title = q.title as same_title
         from public.quotes q left join public.work_orders w on w.id = q.order_id
        where q.status = 'accepted'`,
    );
    expect(accepted).toHaveLength(4);
    for (const row of accepted) {
      expect(row.order_id).not.toBeNull();
      expect(row.wc).toBe(row.qc);
      expect(row.wo).toBe(row.qo);
      expect(row.status).toBe('pending');
      expect(row.same_title).toBe(true);
    }
    const orders = await su(`select count(*)::int as n from public.work_orders`);
    expect(orders[0].n).toBe(4); // solo las generadas por aceptacion: ni mas ni menos
    const notAccepted = await su(
      `select count(*)::int as n from public.quotes where status <> 'accepted' and order_id is not null`,
    );
    expect(notAccepted[0].n).toBe(0);
    const duplicated = await su(
      `select order_id from public.quotes where order_id is not null group by order_id having count(*) > 1`,
    );
    expect(duplicated).toEqual([]);
  });

  it('los totales de la base coinciden con un recalculo independiente en enteros por linea', async () => {
    const mismatches = await su(
      `with line as (
         select i.quote_id,
                ((i.quantity * 1000)::bigint * i.unit_price_cents + 500) / 1000 as sub,
                ((((i.quantity * 1000)::bigint * i.unit_price_cents + 500) / 1000) * i.tax_rate_bp + 5000) / 10000 as tax
           from public.quote_items i
       ), sums as (
         select quote_id, sum(sub) as sub, sum(tax) as tax from line group by quote_id
       )
       select q.id::text from public.quotes q left join sums s on s.quote_id = q.id
        where q.subtotal_cents <> coalesce(s.sub, 0) or q.tax_cents <> coalesce(s.tax, 0)
           or q.total_cents <> coalesce(s.sub, 0) + coalesce(s.tax, 0)`,
    );
    expect(mismatches).toEqual([]);
    const total = await su(
      `select total_cents::int as t from public.quotes where title = 'Contrato de mantenimiento de autoclaves'`,
    );
    // 2 x 245,00 + 2 x 73,90 al 21 %: bases 49000 + 14780; IVA por linea 10290 + 3104 (3103,8 -> 3104)
    expect(total[0].t).toBe(2 * 24500 + 2 * 7390 + 10290 + 3104);
  });

  it('numeracion correlativa por organizacion y datos solo ficticios', async () => {
    const numbers = await su(
      `select organization_id::text as o, array_agg(number order by number) as n
         from public.quotes group by 1 order by 1`,
    );
    expect(numbers).toEqual([
      { o: ID.norte, n: [1, 2, 3, 4, 5, 6, 7, 8] },
      { o: ID.sur, n: [1, 2, 3] },
    ]);
    const quotes = await su(`select description from public.quotes`);
    expect(quotes.every((q) => String(q.description).startsWith('[DEMO]'))).toBe(true);
  });

  it('registra identidad estable (quote) y eventos con el owner como actor (nunca nulo)', async () => {
    const identity = await su(
      `select organization_id::text, count(*)::int as n from private.demo_fixture_identity
        where entity_type = 'quote' group by 1 order by 1`,
    );
    expect(identity).toEqual([
      { organization_id: ID.norte, n: 8 },
      { organization_id: ID.sur, n: 3 },
    ]);
    const nulls = await su(
      `select count(*)::int as n from public.activity_events where actor_id is null`,
    );
    expect(nulls[0].n).toBe(0);
    const actors = await su(
      `select distinct actor_id::text as a from public.activity_events where entity_type = 'quote' order by 1`,
    );
    expect(actors.map((r) => r.a)).toEqual([ID.ownerNorte, ID.ownerSur]);
    const seq = await su(`select count(*)::int as n from public.activity_events where seq is null`);
    expect(seq[0].n).toBe(0);
    const decided = await su(
      `select e.action from public.activity_events e join public.quotes q on q.id = e.entity_id
        where e.entity_type = 'quote' and q.status = 'accepted' and q.organization_id = $1 and q.number = 4
        order by e.seq`,
      [ID.norte],
    );
    expect(decided.map((r) => r.action)).toEqual(['created', 'accepted']);
  });

  it('es idempotente: una segunda ejecucion no cambia nada ni genera ordenes ni eventos', async () => {
    await db.exec(quotesSql);
    await db.exec(quotesSql);
    expect(await snapshot()).toEqual(first);
  });

  it('un usuario decide un borrador demo y el seed no lo recrea ni lo revierte', async () => {
    const [target] = await su(
      `select id::text from public.quotes where organization_id = $1 and status = 'draft' order by number limit 1`,
      [ID.norte],
    );
    await db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: ID.memberNorte, role: 'authenticated' }),
      ]);
      await tx.exec('set local role authenticated');
      await tx.query(`select public.reject_quote($1::uuid)`, [target.id]);
    });
    const before = await quoteStats(ID.norte);
    await db.exec(quotesSql);
    expect(await quoteStats(ID.norte)).toEqual(before);
    expect(before).toEqual({ total: 8, draft: 2, accepted: 3, rejected: 3 });
  });

  it('aislamiento: cada owner solo ve los presupuestos de su organizacion', async () => {
    const seen = async (user: string) =>
      db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: user, role: 'authenticated' }),
        ]);
        await tx.exec('set local role authenticated');
        return (
          await tx.query<Row>(`select distinct organization_id::text as o from public.quotes`)
        ).rows;
      });
    expect(await seen(ID.ownerNorte)).toEqual([{ o: ID.norte }]);
    expect(await seen(ID.ownerSur)).toEqual([{ o: ID.sur }]);
  });

  it('convive con el seed de ordenes: ambos son idempotentes y no se pisan', async () => {
    await db.exec(ordersSql);
    const afterOrders = await snapshot();
    const orderIdentity = await su(
      `select count(*)::int as n from private.demo_fixture_identity where entity_type = 'work_order'`,
    );
    expect(orderIdentity[0].n).toBe(22); // 15 + 7, sin contar las ordenes de aceptacion
    await db.exec(ordersSql);
    await db.exec(quotesSql);
    expect(await snapshot()).toEqual(afterOrders);
    const linked = await su(
      `select count(*)::int as n from public.quotes q join public.work_orders w on w.id = q.order_id`,
    );
    expect(linked[0].n).toBe(4);
  });
});

describe('seed demo de presupuestos: precondiciones', () => {
  it('sin los clientes demo omite los presupuestos, avisa y no falla ni cambia nada', async () => {
    const empty = await newDb();
    try {
      await empty.exec(quotesSql);
      const n = await empty.query<Row>(`select count(*)::int as n from public.quotes`);
      expect(n.rows[0].n).toBe(0);
      const o = await empty.query<Row>(`select count(*)::int as n from public.work_orders`);
      expect(o.rows[0].n).toBe(0);
      const e = await empty.query<Row>(`select count(*)::int as n from public.activity_events`);
      expect(e.rows[0].n).toBe(0);
    } finally {
      await empty.close();
    }
  });

  it('una organizacion con 0 owners aborta toda la transaccion', async () => {
    const broken = await newDb();
    try {
      await broken.exec(crmSql);
      await broken.exec(`delete from public.memberships where organization_id = '${ID.sur}'`);
      await expect(broken.exec(quotesSql)).rejects.toThrow(/exactamente 1 owner/);
      await broken.exec('rollback'); // el seed abre su propia transaccion y el error la deja abortada
      const n = await broken.query<Row>(`select count(*)::int as n from public.quotes`);
      expect(n.rows[0].n).toBe(0);
      const o = await broken.query<Row>(`select count(*)::int as n from public.work_orders`);
      expect(o.rows[0].n).toBe(0);
    } finally {
      await broken.close();
    }
  });
});
