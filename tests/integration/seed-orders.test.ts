// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Seed demo de ordenes (TASK-011): ejecuta los archivos REALES supabase/seeds/demo-crm.sql y
// demo-orders.sql en PGlite sobre las migraciones reales. Instancia propia: los seeds llevan su
// propio begin/commit y no pueden anidarse en las transacciones de los helpers compartidos.

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

const orderStats = (org: string) =>
  su(
    `select count(*)::int as total,
            count(*) filter (where status = 'pending')::int as pending,
            count(*) filter (where status = 'assigned')::int as assigned,
            count(*) filter (where status = 'in_progress')::int as in_progress,
            count(*) filter (where status = 'completed')::int as completed,
            count(*) filter (where status = 'cancelled')::int as cancelled
     from public.work_orders where organization_id = $1`,
    [org],
  ).then((r) => r[0]);

const snapshot = () =>
  su(
    `select 'o' as k, id::text, title, status, technician_id::text, scheduled_date::text, updated_at::text from public.work_orders
     union all
     select 'e', id::text, entity_id::text, action, actor_id::text, null, occurred_at::text from public.activity_events
     union all
     select 'd', event_id::text, from_status, to_status, technician_id::text, detail, null from public.work_order_event_details
     order by 1, 2`,
  );

beforeAll(async () => {
  crmSql = await readFile(path('supabase/seeds/demo-crm.sql'), 'utf8');
  ordersSql = await readFile(path('supabase/seeds/demo-orders.sql'), 'utf8');
  db = await newDb();
  await db.exec(crmSql);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe('seed demo de ordenes', () => {
  let first: Row[];

  it('crea ordenes en todos los estados para cada organizacion, solo con clientes y tecnicos demo activos', async () => {
    await db.exec(ordersSql);
    first = await snapshot();
    expect(await orderStats(ID.norte)).toEqual({
      total: 15,
      pending: 5,
      assigned: 3,
      in_progress: 2,
      completed: 4,
      cancelled: 1,
    });
    expect(await orderStats(ID.sur)).toEqual({
      total: 7,
      pending: 2,
      assigned: 1,
      in_progress: 1,
      completed: 2,
      cancelled: 1,
    });
    // Ninguna orden referencia un cliente o tecnico archivado ni de otra organizacion (FK compuesta).
    const bad = await su(
      `select count(*)::int as n from public.work_orders w
       left join public.customers c on c.id = w.customer_id and c.organization_id = w.organization_id
       left join public.technicians t on t.id = w.technician_id and t.organization_id = w.organization_id
       where c.id is null or c.archived_at is not null or (w.technician_id is not null and (t.id is null or t.archived_at is not null))`,
    );
    expect(bad[0].n).toBe(0);
  });

  it('registra identidad estable (work_order) por orden y datos solo ficticios', async () => {
    const identity = await su(
      `select organization_id::text, count(*)::int as n from private.demo_fixture_identity
       where entity_type = 'work_order' group by 1 order by 1`,
    );
    expect(identity).toEqual([
      { organization_id: ID.norte, n: 15 },
      { organization_id: ID.sur, n: 7 },
    ]);
    const orders = await su(`select description from public.work_orders`);
    expect(orders.every((o) => String(o.description).startsWith('[DEMO]'))).toBe(true);
  });

  it('cada orden tiene eventos con el owner como actor (nunca nulo) y el flujo completo en las completadas', async () => {
    const nulls = await su(
      `select count(*)::int as n from public.activity_events where actor_id is null`,
    );
    expect(nulls[0].n).toBe(0);
    const actors = await su(
      `select distinct actor_id::text as a from public.activity_events where entity_type = 'work_order' order by 1`,
    );
    expect(actors.map((r) => r.a)).toEqual([ID.ownerNorte, ID.ownerSur]);
    const sequence = await su(
      `select e.action || ':' || coalesce(d.to_status, '') as step
       from public.activity_events e join public.work_order_event_details d on d.event_id = e.id
       join public.work_orders w on w.id = e.entity_id
       where w.status = 'completed' and w.organization_id = $1
       order by w.id, e.seq limit 4`,
      [ID.norte],
    );
    expect(sequence.map((r) => r.step)).toEqual([
      'created:assigned',
      'assigned:assigned',
      'status_changed:in_progress',
      'status_changed:completed',
    ]);
    const cancelled = await su(
      `select d.detail from public.work_order_event_details d where d.to_status = 'cancelled' and d.organization_id = $1`,
      [ID.norte],
    );
    expect(cancelled).toEqual([{ detail: 'El cliente pospone el trabajo' }]);
  });

  it('es idempotente: una segunda ejecucion no cambia nada ni genera eventos', async () => {
    await db.exec(ordersSql);
    await db.exec(ordersSql);
    expect(await snapshot()).toEqual(first);
  });

  it('un usuario edita o avanza una orden demo y el seed no la recrea ni la revierte', async () => {
    const [target] = await su(
      `select id::text from public.work_orders where organization_id = $1 and status = 'pending' order by id limit 1`,
      [ID.norte],
    );
    await db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: ID.memberNorte, role: 'authenticated' }),
      ]);
      await tx.exec('set local role authenticated');
      await tx.query(`select public.cancel_work_order($1::uuid, 'Prueba')`, [target.id]);
    });
    const before = await orderStats(ID.norte);
    await db.exec(ordersSql);
    expect(await orderStats(ID.norte)).toEqual(before);
    expect(before.cancelled).toBe(2);
  });

  it('aislamiento: cada owner solo ve las ordenes de su organizacion', async () => {
    const seen = async (user: string) =>
      db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: user, role: 'authenticated' }),
        ]);
        await tx.exec('set local role authenticated');
        return (
          await tx.query<Row>(`select distinct organization_id::text as o from public.work_orders`)
        ).rows;
      });
    expect(await seen(ID.ownerNorte)).toEqual([{ o: ID.norte }]);
    expect(await seen(ID.ownerSur)).toEqual([{ o: ID.sur }]);
  });
});

describe('seed demo de ordenes: precondiciones', () => {
  it('sin los clientes y tecnicos demo omite las ordenes, avisa y no falla ni cambia nada', async () => {
    const empty = await newDb();
    try {
      await empty.exec(ordersSql);
      const n = await empty.query<Row>(`select count(*)::int as n from public.work_orders`);
      expect(n.rows[0].n).toBe(0);
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
      await expect(broken.exec(ordersSql)).rejects.toThrow(/exactamente 1 owner/);
      await broken.exec('rollback'); // el seed abre su propia transaccion y el error la deja abortada
      const n = await broken.query<Row>(`select count(*)::int as n from public.work_orders`);
      expect(n.rows[0].n).toBe(0);
    } finally {
      await broken.close();
    }
  });
});
