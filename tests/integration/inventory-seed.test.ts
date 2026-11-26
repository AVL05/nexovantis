// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Seed demo de inventario (TASK-013): ejecuta los archivos REALES supabase/seeds/demo-crm.sql,
// demo-orders.sql y demo-inventory.sql en PGlite sobre las migraciones reales. Instancia propia: los
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
let ordersSql: string;
let inventorySql: string;
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

const states = async (org: string) =>
  Object.fromEntries(
    (
      await su(
        `select reference, quantity, stock_status, archived_at is not null as archived
           from public.inventory_items where organization_id = $1 order by reference`,
        [org],
      )
    ).map((r) => [String(r.reference), `${r.quantity}:${r.stock_status}:${r.archived}`]),
  );

const snapshot = () =>
  su(
    `select 'i' as k, id::text, reference, quantity::text, archived_at::text, updated_at::text, null from public.inventory_items
     union all
     select 'm', id::text, item_id::text, kind, quantity::text, order_id::text, request_id::text from public.stock_movements
     union all
     select 'e', id::text, entity_id::text, entity_type, action, actor_id::text, occurred_at::text from public.activity_events
     union all
     select 'd', event_id::text, movement_id::text, quantity::text, balance_before::text, balance_after::text, order_id::text
       from public.inventory_event_details
     order by 1, 2`,
  );

beforeAll(async () => {
  crmSql = await readFile(path('supabase/seeds/demo-crm.sql'), 'utf8');
  ordersSql = await readFile(path('supabase/seeds/demo-orders.sql'), 'utf8');
  inventorySql = await readFile(path('supabase/seeds/demo-inventory.sql'), 'utf8');
  db = await newDb();
  await db.exec(crmSql);
  await db.exec(ordersSql);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe('seed demo de inventario', () => {
  let first: Row[];

  it('crea articulos agotados, bajos, normales y archivados con saldos coherentes', async () => {
    await db.exec(inventorySql);
    first = await snapshot();
    const norte = await states(ID.norte);
    expect(Object.keys(norte)).toHaveLength(13);
    expect(norte).toMatchObject({
      'N-TUB-015': '50:ok:false',
      'N-TUB-022': '15:low:false',
      'N-VAL-BOL': '0:out:false',
      'N-CAB-215': '90:low:false',
      'N-ACE-SIL': '4:low:false',
      'N-TOR-M6': '1000:ok:false',
      'N-ABR-INX': '0:out:false',
      'N-BOM-OLD': '3:ok:true',
      'N-BOM-300': '2:ok:false',
      'N-KIT-PRE': '5:ok:false',
    });
    const sur = await states(ID.sur);
    expect(Object.keys(sur)).toHaveLength(5);
    expect(sur).toMatchObject({
      'S-FAN-FC1': '18:ok:false',
      'S-GAS-R32': '4:low:false',
      'S-EXT-POL': '0:out:false',
      'S-CAN-PVC': '90:ok:false',
    });
  });

  it('el saldo de cada articulo coincide con la suma de sus movimientos y nunca es negativo', async () => {
    const mismatches = await su(
      `select i.reference from public.inventory_items i
        where i.quantity <> coalesce((select sum(case when m.kind = 'in' then m.quantity else -m.quantity end)
                                        from public.stock_movements m where m.item_id = i.id), 0)
           or i.quantity < 0`,
    );
    expect(mismatches).toEqual([]);
    const broken = await su(
      `select id::text from public.stock_movements
        where balance_after < 0 or (kind = 'in' and balance_after <> balance_before + quantity)
           or (kind <> 'in' and balance_after <> balance_before - quantity)`,
    );
    expect(broken).toEqual([]);
  });

  it('los consumos van vinculados a ordenes de la MISMA organizacion', async () => {
    const consumptions = await su(
      `select m.organization_id::text as mo, w.organization_id::text as wo, w.status
         from public.stock_movements m left join public.work_orders w on w.id = m.order_id
        where m.kind = 'consumption'`,
    );
    expect(consumptions.length).toBeGreaterThanOrEqual(4);
    for (const row of consumptions) {
      expect(row.wo).toBe(row.mo);
    }
    const loose = await su(
      `select count(*)::int as n from public.stock_movements where (kind = 'consumption') <> (order_id is not null)`,
    );
    expect(loose[0].n).toBe(0);
  });

  it('registra identidad estable y eventos con el owner como actor (nunca nulo, con seq)', async () => {
    const identity = await su(
      `select organization_id::text, count(*)::int as n from private.demo_fixture_identity
        where entity_type = 'inventory_item' group by 1 order by 1`,
    );
    expect(identity).toEqual([
      { organization_id: ID.norte, n: 13 },
      { organization_id: ID.sur, n: 5 },
    ]);
    const nulls = await su(
      `select count(*)::int as n from public.activity_events where actor_id is null or seq is null`,
    );
    expect(nulls[0].n).toBe(0);
    const actors = await su(
      `select distinct actor_id::text as a from public.activity_events where entity_type = 'inventory_item' order by 1`,
    );
    expect(actors.map((r) => r.a)).toEqual([ID.ownerNorte, ID.ownerSur]);
    const counts = await su(
      `select action, count(*)::int as n from public.activity_events
        where entity_type = 'inventory_item' group by 1 order by 1`,
    );
    const kinds = await su(
      `select kind, count(*)::int as n from public.stock_movements group by 1 order by 1`,
    );
    const count = (rows: Row[], key: string, value: string) =>
      rows.find((r) => r[key] === value)?.n;
    expect(count(counts, 'action', 'created')).toBe(18);
    expect(count(counts, 'action', 'archived')).toBe(2);
    expect(count(counts, 'action', 'stock_in')).toBe(count(kinds, 'kind', 'in'));
    expect(count(counts, 'action', 'stock_out')).toBe(count(kinds, 'kind', 'out'));
    expect(count(counts, 'action', 'stock_consumed')).toBe(count(kinds, 'kind', 'consumption'));
  });

  it('las notas libres no aparecen en eventos ni detalles', async () => {
    const leaked = await su(
      `select count(*)::int as n from (
         select e::text as t from public.activity_events e
         union all select d::text from public.inventory_event_details d) x
        where t like '%albar%' or t like '%Existencia inicial%' or t like '%Merma%'`,
    );
    expect(leaked[0].n).toBe(0);
  });

  it('es idempotente: ejecuciones posteriores no cambian nada', async () => {
    await db.exec(inventorySql);
    await db.exec(inventorySql);
    expect(await snapshot()).toEqual(first);
  });

  it('un usuario mueve y archiva stock demo y el seed no lo recrea ni lo revierte', async () => {
    const [target] = await su(
      `select id::text from public.inventory_items where organization_id = $1 and reference = 'N-TOR-M6'`,
      [ID.norte],
    );
    await db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: ID.memberNorte, role: 'authenticated' }),
      ]);
      await tx.exec('set local role authenticated');
      await tx.query(
        `select public.record_stock_movement(gen_random_uuid(), $1::uuid, 'out', 400, null, null)`,
        [target.id],
      );
      await tx.query(`select public.archive_inventory_item($1::uuid)`, [target.id]);
    });
    const before = await snapshot();
    await db.exec(inventorySql);
    expect(await snapshot()).toEqual(before);
    const [row] = await su(
      `select quantity, archived_at is not null as archived from public.inventory_items where id = $1`,
      [target.id],
    );
    expect(row).toEqual({ quantity: 600, archived: true });
  });

  it('aislamiento: cada owner solo ve el inventario de su organizacion', async () => {
    const seen = async (user: string) =>
      db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: user, role: 'authenticated' }),
        ]);
        await tx.exec('set local role authenticated');
        return (
          await tx.query<Row>(
            `select distinct organization_id::text as o from public.inventory_items
             union select distinct organization_id::text from public.stock_movements`,
          )
        ).rows;
      });
    expect(await seen(ID.ownerNorte)).toEqual([{ o: ID.norte }]);
    expect(await seen(ID.ownerSur)).toEqual([{ o: ID.sur }]);
  });
});

describe('seed demo de inventario: precondiciones', () => {
  it('sin ordenes abiertas omite los consumos, avisa y no falla; el saldo sigue siendo coherente', async () => {
    const bare = await newDb();
    try {
      await bare.exec(inventorySql);
      const n = await bare.query<Row>(`select count(*)::int as n from public.inventory_items`);
      expect(n.rows[0].n).toBe(18);
      const c = await bare.query<Row>(
        `select count(*)::int as n from public.stock_movements where kind = 'consumption'`,
      );
      expect(c.rows[0].n).toBe(0);
      const bad = await bare.query<Row>(
        `select count(*)::int as n from public.inventory_items where quantity < 0`,
      );
      expect(bad.rows[0].n).toBe(0);
    } finally {
      await bare.close();
    }
  });

  it('una organizacion con 0 owners aborta toda la transaccion', async () => {
    const broken = await newDb();
    try {
      await broken.exec(`delete from public.memberships where organization_id = '${ID.sur}'`);
      await expect(broken.exec(inventorySql)).rejects.toThrow(/exactamente 1 owner/);
      await broken.exec('rollback'); // el seed abre su propia transaccion y el error la deja abortada
      const n = await broken.query<Row>(`select count(*)::int as n from public.inventory_items`);
      expect(n.rows[0].n).toBe(0);
      const e = await broken.query<Row>(`select count(*)::int as n from public.activity_events`);
      expect(e.rows[0].n).toBe(0);
    } finally {
      await broken.close();
    }
  });
});

describe('seed demo de inventario: ordenes NO demo coexistentes', () => {
  it('nunca consume sobre ordenes creadas por usuarios (aunque sean las primeras abiertas) y sigue siendo idempotente', async () => {
    const mixed = await newDb();
    try {
      await mixed.exec(crmSql);
      await mixed.exec(ordersSql);
      const [customer] = (
        await mixed.query<Row>(
          `select record_id::text as id from private.demo_fixture_identity
            where organization_id = $1 and entity_type = 'customer' order by fixture_key limit 1`,
          [ID.norte],
        )
      ).rows;
      // Ordenes de un usuario normal: fecha muy anterior, para que un criterio por "primeras abiertas" las elija.
      const userOrders: string[] = [];
      await mixed.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: ID.memberNorte, role: 'authenticated' }),
        ]);
        await tx.exec('set local role authenticated');
        for (let i = 0; i < 3; i += 1) {
          const r = await tx.query<Row>(
            `select public.create_work_order(gen_random_uuid(), $1::uuid, $2, null, 'normal', '2000-01-0${i + 1}'::date, null) as id`,
            [customer.id, `Orden de usuario ${i + 1}`],
          );
          userOrders.push(String(r.rows[0].id));
        }
      });
      await mixed.exec(inventorySql);

      const consumed = await mixed.query<Row>(
        `select distinct order_id::text as id from public.stock_movements where kind = 'consumption'`,
      );
      expect(consumed.rows.length).toBeGreaterThanOrEqual(1);
      for (const row of consumed.rows) {
        expect(userOrders).not.toContain(row.id);
        const demo = await mixed.query<Row>(
          `select 1 from private.demo_fixture_identity where entity_type = 'work_order' and record_id = $1`,
          [row.id],
        );
        expect(demo.rows).toHaveLength(1);
      }
      const touched = await mixed.query<Row>(
        `select count(*)::int as n from public.stock_movements where order_id = any($1::uuid[])`,
        [userOrders],
      );
      expect(touched.rows[0].n).toBe(0);

      const snap = async () =>
        (
          await mixed.query<Row>(
            `select 'm' as k, id::text, order_id::text, balance_after::text from public.stock_movements
             union all select 'i', id::text, quantity::text, null from public.inventory_items
             union all select 'e', id::text, action, entity_id::text from public.activity_events
             order by 1, 2`,
          )
        ).rows;
      const first = await snap();
      await mixed.exec(inventorySql);
      expect(await snap()).toEqual(first);
    } finally {
      await mixed.close();
    }
  }, 120_000);

  it('con solo ordenes de usuario (sin ordenes demo) omite los consumos', async () => {
    const only = await newDb();
    try {
      await only.exec(crmSql);
      const [customer] = (
        await only.query<Row>(
          `select record_id::text as id from private.demo_fixture_identity
            where organization_id = $1 and entity_type = 'customer' limit 1`,
          [ID.norte],
        )
      ).rows;
      await only.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: ID.ownerNorte, role: 'authenticated' }),
        ]);
        await tx.exec('set local role authenticated');
        await tx.query(
          `select public.create_work_order(gen_random_uuid(), $1::uuid, 'Orden de usuario', null, 'normal', '2000-01-01'::date, null)`,
          [customer.id],
        );
      });
      await only.exec(inventorySql);
      const c = await only.query<Row>(
        `select count(*)::int as n from public.stock_movements where kind = 'consumption'`,
      );
      expect(c.rows[0].n).toBe(0);
    } finally {
      await only.close();
    }
  }, 120_000);
});
