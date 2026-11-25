// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Pruebas independientes de Testing (TASK-011 POST): seed demo de ordenes sobre PGlite (PostgreSQL
// real in-process, migraciones reales). NO se ejecuta contra Cloud ni Supabase. Develop no las
// modifica ni las salta.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ROOT = new URL('../../../', import.meta.url);
const path = (rel: string) => fileURLToPath(new URL(rel, ROOT));
const ID = {
  norte: '11111111-0000-4000-8000-000000000001',
  sur: '22222222-0000-4000-8000-000000000001',
  otra: '33333333-0000-4000-8000-000000000001',
  ownerNorte: '11111111-0000-4000-8000-0000000000a1',
  ownerSur: '22222222-0000-4000-8000-0000000000b1',
  ownerOtra: '33333333-0000-4000-8000-0000000000c1',
  ownerSur2: '22222222-0000-4000-8000-0000000000b2',
};

type Row = Record<string, unknown>;

async function newDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  const dir = path('supabase/migrations/');
  const names = (await readdir(dir)).filter((n) => /^\d{14}_.+\.sql$/.test(n)).sort();
  await db.exec(await readFile(path('tests/support/supabase-shim.sql'), 'utf8'));
  for (const n of names) await db.exec(await readFile(dir + n, 'utf8'));
  await db.exec(
    `insert into auth.users (id, email) values
       ('${ID.ownerNorte}','n@example.test'), ('${ID.ownerSur}','s@example.test'), ('${ID.ownerOtra}','o@example.test');
     insert into public.organizations (id, name) values
       ('${ID.norte}','Demo Norte'), ('${ID.sur}','Demo Sur'), ('${ID.otra}','Organizacion Real');
     insert into public.memberships (organization_id, user_id, role) values
       ('${ID.norte}','${ID.ownerNorte}','owner'), ('${ID.sur}','${ID.ownerSur}','owner'), ('${ID.otra}','${ID.ownerOtra}','owner');`,
  );
  return db;
}

let crm: string;
let orders: string;
const sql = async (db: PGlite, text: string, params: unknown[] = []) =>
  (await db.query<Row>(text, params)).rows;

const fingerprint = (db: PGlite) =>
  sql(
    db,
    `select 'o' k, id::text a, status b, coalesce(technician_id::text,'') c, title d, updated_at::text e from public.work_orders
     union all select 'e', id::text, entity_id::text, action, actor_id::text, occurred_at::text from public.activity_events
     union all select 'd', event_id::text, coalesce(from_status,''), coalesce(to_status,''), coalesce(detail,''), '' from public.work_order_event_details
     union all select 'i', record_id::text, entity_type, fixture_key, organization_id::text, '' from private.demo_fixture_identity
     order by 1, 2`,
  );

beforeAll(async () => {
  crm = await readFile(path('supabase/seeds/demo-crm.sql'), 'utf8');
  orders = await readFile(path('supabase/seeds/demo-orders.sql'), 'utf8');
});

describe('seed demo de ordenes: idempotencia y no destructividad', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await newDb();
    await db.exec(crm);
  });
  afterAll(async () => db.close());

  it('el script no contiene operaciones destructivas ni escrituras directas en las tablas protegidas', () => {
    const code = orders
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .toLowerCase();
    for (const bad of [
      /\bdelete\s+from\b/,
      /\btruncate\b/,
      /\bdrop\s+(table|function|trigger|schema|policy)\b/,
      /\balter\s+table\b/,
      /disable\s+trigger/,
      /session_replication_role/,
      /service_role/,
      /insert\s+into\s+public\.(work_orders|activity_events|work_order_event_details)/,
      /update\s+public\.work_orders/,
    ]) {
      expect(code, String(bad)).not.toMatch(bad);
    }
  });

  it('tres ejecuciones seguidas con cambios de usuario entre medias: 22 ordenes y sin cambios al repetir', async () => {
    await db.exec(`
      insert into public.customers (organization_id, name) values ('${ID.otra}', 'Cliente real');
      insert into public.technicians (organization_id, full_name) values ('${ID.otra}', 'Tecnico real');`);
    const realCustomer = String(
      (await sql(db, `select id from public.customers where organization_id = $1`, [ID.otra]))[0]
        .id,
    );
    await db.exec(`
      select set_config('request.jwt.claims','{"sub":"${ID.ownerOtra}","role":"authenticated"}', false);
      set role authenticated;
      select public.create_work_order(gen_random_uuid(), '${realCustomer}', 'Orden real', null, 'normal', '2026-12-01', null);
      reset role;
      select set_config('request.jwt.claims','', false);`);
    const realBefore = await sql(
      db,
      `select * from public.work_orders where organization_id = $1`,
      [ID.otra],
    );
    expect(realBefore).toHaveLength(1);

    await db.exec(orders);
    const total = await sql(
      db,
      `select organization_id::text o, count(*)::int n from public.work_orders where organization_id in ($1,$2) group by 1`,
      [ID.norte, ID.sur],
    );
    expect(Object.fromEntries(total.map((r) => [r.o, r.n]))).toEqual({
      [ID.norte]: 15,
      [ID.sur]: 7,
    });
    const afterFirst = await fingerprint(db);

    // el usuario avanza una orden demo pendiente, cancela otra y edita una tercera
    await db.exec(`
      select set_config('request.jwt.claims','{"sub":"${ID.ownerNorte}","role":"authenticated"}', false);
      set role authenticated;`);
    const pend = await sql(
      db,
      `select id, title from public.work_orders where organization_id = $1 and status = 'pending' order by id limit 2`,
      [ID.norte],
    );
    const tech = String(
      (
        await sql(db, `select id from public.technicians where organization_id = $1 limit 1`, [
          ID.norte,
        ])
      )[0].id,
    );
    await db.query(`select public.assign_work_order($1::uuid, $2::uuid)`, [pend[0].id, tech]);
    await db.query(`select public.cancel_work_order($1::uuid, 'prueba')`, [pend[1].id]);
    await db.query(
      `select public.update_work_order($1::uuid, 'Titulo cambiado', null, 'low', '2027-01-01'::date)`,
      [pend[0].id],
    );
    await db.exec(`reset role; select set_config('request.jwt.claims','', false);`);
    const changed = await fingerprint(db);
    expect(changed).not.toEqual(afterFirst);

    await db.exec(orders);
    await db.exec(orders);
    expect(
      await fingerprint(db),
      'las repeticiones no recrean, revierten ni emiten eventos',
    ).toEqual(changed);
    // la orden editada y la cancelada siguen como las dejo el usuario
    const kept = await sql(
      db,
      `select status, title from public.work_orders where id in ($1,$2) order by title`,
      [pend[0].id, pend[1].id],
    );
    expect(kept.map((r) => r.status).sort()).toEqual(['assigned', 'cancelled']);
    expect(kept.some((r) => r.title === 'Titulo cambiado')).toBe(true);
    // organizacion no demo intacta
    expect(
      await sql(db, `select * from public.work_orders where organization_id = $1`, [ID.otra]),
    ).toEqual(realBefore);
    // identidad estable: una clave por orden demo
    const ids = await sql(
      db,
      `select count(*)::int n, count(distinct (organization_id, fixture_key))::int d from private.demo_fixture_identity where entity_type = 'work_order'`,
    );
    expect(ids[0]).toEqual({ n: 22, d: 22 });
  });

  it('deja la sesion como estaba: rol original y sin claims residuales', async () => {
    const r = await sql(
      db,
      `select current_user::text u, session_user::text s, coalesce(current_setting('request.jwt.claims', true), '') c`,
    );
    expect(r[0].u).toBe(r[0].s);
    expect(r[0].c).toBe('');
  });

  it('cada evento demo tiene como actor al owner de su organizacion (nunca nulo) y datos solo ficticios', async () => {
    const bad = await sql(
      db,
      `select e.id from public.activity_events e
         where e.entity_type = 'work_order'
           and (e.actor_id is null or e.actor_id <> (select user_id from public.memberships m where m.organization_id = e.organization_id and m.role = 'owner'))
           and e.organization_id in ($1, $2)`,
      [ID.norte, ID.sur],
    );
    expect(bad).toHaveLength(0);
    const nonDemo = await sql(
      db,
      `select count(*)::int n from public.work_orders where organization_id in ($1,$2) and description not like '[DEMO]%'`,
      [ID.norte, ID.sur],
    );
    expect(nonDemo[0].n).toBe(0);
    const pii = await sql(
      db,
      `select count(*)::int n from public.work_orders where description ~* '[a-z0-9._-]+@[a-z0-9.-]+|\\+?\\d{9,}'`,
    );
    expect(pii[0].n).toBe(0);
  });
});

describe('seed demo de ordenes: precondiciones y atomicidad', () => {
  it('dos owners en Demo Sur abortan toda la transaccion: tampoco se crean las de Demo Norte', async () => {
    const db = await newDb();
    try {
      await db.exec(crm);
      await db.exec(`insert into auth.users (id, email) values ('${ID.ownerSur2}','s2@example.test');
        insert into public.memberships (organization_id, user_id, role) values ('${ID.sur}','${ID.ownerSur2}','owner');`);
      const before = await fingerprint(db);
      await expect(db.exec(orders)).rejects.toThrow(/exactamente 1 owner/);
      await db.exec('rollback'); // psql con ON_ERROR_STOP termina y la sesion revierte
      expect(await fingerprint(db)).toEqual(before);
      expect((await sql(db, `select count(*)::int n from public.work_orders`))[0].n).toBe(0);
    } finally {
      await db.close();
    }
  });

  it('sin la migracion/seed CRM previo: omite sin crear nada ni fallar y no deja el rol cambiado', async () => {
    const db = await newDb(); // sin demo-crm.sql
    try {
      await db.exec(orders);
      expect((await sql(db, `select count(*)::int n from public.work_orders`))[0].n).toBe(0);
      expect((await sql(db, `select current_user::text u, session_user::text s`))[0]).toMatchObject(
        {},
      );
      const r = await sql(db, `select current_user::text u, session_user::text s`);
      expect(r[0].u).toBe(r[0].s);
    } finally {
      await db.close();
    }
  });

  it('un cliente demo archivado se omite y se crea al restaurarlo en la siguiente ejecucion', async () => {
    const db = await newDb();
    try {
      await db.exec(crm);
      const c1 = String(
        (
          await sql(
            db,
            `select record_id from private.demo_fixture_identity where organization_id = $1 and entity_type = 'customer' and fixture_key = 'c01'`,
            [ID.norte],
          )
        )[0].record_id,
      );
      await db.exec(`select set_config('request.jwt.claims','{"sub":"${ID.ownerNorte}","role":"authenticated"}', false);
        set role authenticated; update public.customers set archived_at = now() where id = '${c1}'; reset role;
        select set_config('request.jwt.claims','', false);`);
      await db.exec(orders);
      const first = (
        await sql(db, `select count(*)::int n from public.work_orders where organization_id = $1`, [
          ID.norte,
        ])
      )[0].n as number;
      expect(first).toBeLessThan(15);
      expect(
        await sql(db, `select 1 from public.work_orders where customer_id = $1`, [c1]),
      ).toHaveLength(0);
      await db.exec(`select set_config('request.jwt.claims','{"sub":"${ID.ownerNorte}","role":"authenticated"}', false);
        set role authenticated; update public.customers set archived_at = null where id = '${c1}'; reset role;
        select set_config('request.jwt.claims','', false);`);
      await db.exec(orders);
      expect(
        (
          await sql(
            db,
            `select count(*)::int n from public.work_orders where organization_id = $1`,
            [ID.norte],
          )
        )[0].n,
      ).toBe(15);
    } finally {
      await db.close();
    }
  });
});
