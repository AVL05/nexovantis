// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Seed demo (TASK-008C): ejecuta el archivo REAL supabase/seeds/demo-crm.sql en PGlite sobre las
// migraciones reales. Se usa una instancia propia (no createTestDb) porque el seed lleva su
// propio begin/commit y no puede anidarse en la transaccion de los helpers compartidos.

const ROOT = new URL('../../', import.meta.url);
const SEED_PATH = fileURLToPath(new URL('supabase/seeds/demo-crm.sql', ROOT));
const SHIM_PATH = fileURLToPath(new URL('tests/support/supabase-shim.sql', ROOT));
const MIGRATIONS_DIR = fileURLToPath(new URL('supabase/migrations/', ROOT));

const ID = {
  norte: '11111111-0000-4000-8000-000000000001',
  sur: '22222222-0000-4000-8000-000000000001',
  ownerNorte: '11111111-0000-4000-8000-0000000000a1',
  memberNorte: '11111111-0000-4000-8000-0000000000a2',
  ownerSur: '22222222-0000-4000-8000-0000000000b1',
  ownerSur2: '22222222-0000-4000-8000-0000000000b2',
  memberSur: '22222222-0000-4000-8000-0000000000b3',
  previo: '11111111-0000-4000-8000-0000000000c1',
};

type Row = Record<string, unknown>;

async function newDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  const names = (await readdir(MIGRATIONS_DIR)).filter((n) => /^\d{14}_.+\.sql$/.test(n)).sort();
  await db.exec(await readFile(SHIM_PATH, 'utf8'));
  for (const n of names) await db.exec(await readFile(MIGRATIONS_DIR + n, 'utf8'));
  await db.exec(
    `insert into auth.users (id, email) values
       ('${ID.ownerNorte}', 'owner.norte@example.com'), ('${ID.memberNorte}', 'member.norte@example.com'),
       ('${ID.ownerSur}', 'owner.sur@example.com'), ('${ID.ownerSur2}', 'owner2.sur@example.com'),
       ('${ID.memberSur}', 'member.sur@example.com')`,
  );
  return db;
}

type Setup = { norte?: boolean; sur?: boolean; surOwners?: 0 | 1 | 2; previo?: boolean };

async function seededDb(o: Setup = {}): Promise<PGlite> {
  const { norte = true, sur = true, surOwners = 1, previo = false } = o;
  const db = await newDb();
  if (norte) {
    await db.exec(`insert into public.organizations (id, name) values ('${ID.norte}', 'Demo Norte');
      insert into public.memberships (organization_id, user_id, role) values
        ('${ID.norte}', '${ID.ownerNorte}', 'owner'), ('${ID.norte}', '${ID.memberNorte}', 'member')`);
  }
  if (sur) {
    await db.exec(`insert into public.organizations (id, name) values ('${ID.sur}', 'Demo Sur')`);
    if (surOwners >= 1) {
      await db.exec(
        `insert into public.memberships values ('${ID.sur}', '${ID.ownerSur}', 'owner', now())`,
      );
    } else {
      await db.exec(
        `insert into public.memberships values ('${ID.sur}', '${ID.memberSur}', 'member', now())`,
      );
    }
    if (surOwners === 2) {
      await db.exec(
        `insert into public.memberships values ('${ID.sur}', '${ID.ownerSur2}', 'owner', now())`,
      );
    }
  }
  if (previo && norte) {
    await db.exec(
      `insert into public.customers (id, organization_id, name, email, notes)
       values ('${ID.previo}', '${ID.norte}', 'Cliente previo ajeno al seed', 'previo@example.com', 'nota previa')`,
    );
  }
  return db;
}

let seedSql: string;
beforeAll(async () => {
  seedSql = await readFile(SEED_PATH, 'utf8');
});

const runSeed = (db: PGlite) => db.exec(seedSql);
const su = async (db: PGlite, sql: string, params: unknown[] = []) =>
  (await db.query<Row>(sql, params)).rows;

// Consulta como un usuario concreto (authenticated + claims), bajo RLS.
async function asUser<T>(db: PGlite, user: string, sql: string): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: user, role: 'authenticated' }),
    ]);
    await tx.exec('set local role authenticated');
    return (await tx.query<T>(sql)).rows;
  });
}

const counts = (db: PGlite, org: string) =>
  su(
    db,
    `select
       (select count(*)::int from public.customers where organization_id = $1 and archived_at is null) as c_act,
       (select count(*)::int from public.customers where organization_id = $1 and archived_at is not null) as c_arc,
       (select count(*)::int from public.technicians where organization_id = $1 and archived_at is null) as t_act,
       (select count(*)::int from public.technicians where organization_id = $1 and archived_at is not null) as t_arc,
       (select count(*)::int from public.activity_events where organization_id = $1 and action = 'archived') as ev`,
    [org],
  ).then((r) => r[0]);

const snapshot = (db: PGlite) =>
  su(
    db,
    `select 'c' as k, id::text, name, email, phone, notes, archived_at::text, updated_at::text from public.customers
     union all
     select 't', id::text, full_name, email, phone, notes, archived_at::text, updated_at::text from public.technicians
     union all
     select 'e', id::text, entity_id::text, actor_id::text, action, null, occurred_at::text, null from public.activity_events
     order by 1, 2`,
  );

describe('seed demo: ejecucion normal', () => {
  let db: PGlite;
  let roleBefore: string;
  let firstSnapshot: Row[];
  let ownerEventsBefore: Row[];

  beforeAll(async () => {
    db = await seededDb({ previo: true });
    roleBefore = (await su(db, 'select current_user as u'))[0].u as string;
    await runSeed(db);
    firstSnapshot = await snapshot(db);
    ownerEventsBefore = await su(db, 'select id::text from public.activity_events order by id');
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  it('crea los recuentos exactos por organizacion y estado', async () => {
    // Norte incluye el cliente previo ajeno al seed (activo).
    expect(await counts(db, ID.norte)).toEqual({
      c_act: 24 + 1,
      c_arc: 3,
      t_act: 6,
      t_arc: 2,
      ev: 5,
    });
    expect(await counts(db, ID.sur)).toEqual({ c_act: 8, c_arc: 2, t_act: 3, t_arc: 1, ev: 3 });
  });

  it('los eventos archived tienen como actor al owner y como entidad los archivados', async () => {
    for (const [org, owner, nEvents] of [
      [ID.norte, ID.ownerNorte, 5],
      [ID.sur, ID.ownerSur, 3],
    ] as const) {
      const events = await su(
        db,
        `select entity_type, entity_id::text, actor_id::text, action from public.activity_events
         where organization_id = $1 order by entity_type, entity_id`,
        [org],
      );
      expect(events).toHaveLength(nEvents);
      expect(events.every((e) => e.actor_id === owner && e.action === 'archived')).toBe(true);

      const archivedC = await su(
        db,
        `select id::text from public.customers where organization_id = $1 and archived_at is not null order by id`,
        [org],
      );
      const archivedT = await su(
        db,
        `select id::text from public.technicians where organization_id = $1 and archived_at is not null order by id`,
        [org],
      );
      expect(events.filter((e) => e.entity_type === 'customer').map((e) => e.entity_id)).toEqual(
        archivedC.map((r) => r.id),
      );
      expect(events.filter((e) => e.entity_type === 'technician').map((e) => e.entity_id)).toEqual(
        archivedT.map((r) => r.id),
      );
    }
  });

  it('el trigger fija archived_at (fecha de transaccion) y no hay eventos restored', async () => {
    const r = await su(
      db,
      `select count(*)::int as n from public.customers c
       join public.activity_events e on e.entity_id = c.id and e.action = 'archived'
       where c.archived_at = e.occurred_at`,
    );
    expect(r[0].n).toBe(3 + 2);
    const restored = await su(
      db,
      `select count(*)::int as n from public.activity_events where action = 'restored'`,
    );
    expect(restored[0].n).toBe(0);
  });

  it('datos ficticios: emails example.com, telefonos +34 000, notas [DEMO], nombres unicos', async () => {
    const rows = await su(
      db,
      `select name, email, phone, notes from public.customers where id <> '${ID.previo}'
       union all select full_name, email, phone, notes from public.technicians`,
    );
    expect(rows).toHaveLength(27 + 10 + 8 + 4);
    for (const r of rows) {
      expect(r.email).toMatch(/^[a-z0-9.-]+@[a-z0-9-]+\.example\.com$/);
      expect(r.phone).toMatch(/^\+34 000 \d{3} \d{3}$/);
      expect(r.notes).toMatch(/^\[DEMO\] /);
    }
    const names = await su(
      db,
      `select name from public.customers union all select full_name from public.technicians`,
    );
    const set = new Set(names.map((n) => n.name));
    expect(set.size).toBe(names.length);
  });

  it('segunda ejecucion: sin cambios (mismos ids, mismos eventos, mismas filas)', async () => {
    await runSeed(db);
    expect(await snapshot(db)).toEqual(firstSnapshot);
    expect(await su(db, 'select id::text from public.activity_events order by id')).toEqual(
      ownerEventsBefore,
    );
    expect(await counts(db, ID.norte)).toEqual({ c_act: 25, c_arc: 3, t_act: 6, t_arc: 2, ev: 5 });
    expect(await counts(db, ID.sur)).toEqual({ c_act: 8, c_arc: 2, t_act: 3, t_arc: 1, ev: 3 });
  });

  it('el registro previo ajeno al seed queda intacto', async () => {
    const r = await su(
      db,
      `select name, email, notes, archived_at from public.customers where id = '${ID.previo}'`,
    );
    expect(r).toEqual([
      {
        name: 'Cliente previo ajeno al seed',
        email: 'previo@example.com',
        notes: 'nota previa',
        archived_at: null,
      },
    ]);
  });

  it('aislamiento: cada owner solo ve su organizacion por RLS', async () => {
    const norteView = await asUser<{ org: string; n: number }>(
      db,
      ID.ownerNorte,
      `select organization_id::text as org, count(*)::int as n from public.customers group by 1`,
    );
    expect(norteView).toEqual([{ org: ID.norte, n: 28 }]);
    const surView = await asUser<{ org: string; n: number }>(
      db,
      ID.ownerSur,
      `select organization_id::text as org, count(*)::int as n from public.customers group by 1`,
    );
    expect(surView).toEqual([{ org: ID.sur, n: 10 }]);
    const surEvents = await asUser<{ org: string }>(
      db,
      ID.ownerSur,
      `select distinct organization_id::text as org from public.activity_events`,
    );
    expect(surEvents).toEqual([{ org: ID.sur }]);
    const memberTech = await asUser<{ n: number }>(
      db,
      ID.memberNorte,
      `select count(*)::int as n from public.technicians`,
    );
    expect(memberTech[0].n).toBe(8);
  });

  it('el rol de la sesion vuelve al de partida y los claims no quedan activos', async () => {
    expect((await su(db, 'select current_user as u'))[0].u).toBe(roleBefore);
    const claims = await su(db, `select current_setting('request.jwt.claims', true) as c`);
    expect([null, '']).toContain(claims[0].c);
  });
});

describe('seed demo: respeta registros existentes (H-1)', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await seededDb();
    await runSeed(db);
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  const eventCount = async (org: string) =>
    (
      await su(
        db,
        `select count(*)::int as n from public.activity_events where organization_id = $1`,
        [org],
      )
    )[0].n;

  // Ejecuta sentencias como un usuario autenticado (el trigger de archivado genera el evento).
  async function execAs(user: string, sql: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: user, role: 'authenticated' }),
      ]);
      await tx.exec('set local role authenticated');
      await tx.exec(sql);
    });
  }

  const rowOf = async (table: 'customers' | 'technicians', name: string) =>
    (
      await su(
        db,
        `select * from public.${table} where organization_id = $1 and ${
          table === 'customers' ? 'name' : 'full_name'
        } = $2`,
        [ID.norte, name],
      )
    )[0];

  it('un designado restaurado por un miembro no se vuelve a archivar ni genera eventos', async () => {
    const cName = 'Hotel Rincón del Valle';
    const tName = 'Ignacio Paredes Gil';
    await execAs(
      ID.memberNorte,
      `update public.customers set archived_at = null where name = '${cName}';
       update public.technicians set archived_at = null where full_name = '${tName}'`,
    );
    expect((await rowOf('customers', cName)).archived_at).toBeNull();
    expect((await rowOf('technicians', tName)).archived_at).toBeNull();
    const eventsBefore = await eventCount(ID.norte);
    const countsBefore = await counts(db, ID.norte);
    const eventIdsBefore = await su(db, 'select id::text from public.activity_events order by id');
    expect(
      (
        await su(
          db,
          `select count(*)::int as n from public.activity_events where action = 'restored' and organization_id = $1`,
          [ID.norte],
        )
      )[0].n,
    ).toBe(2);

    await runSeed(db);

    expect((await rowOf('customers', cName)).archived_at).toBeNull();
    expect((await rowOf('technicians', tName)).archived_at).toBeNull();
    expect(await eventCount(ID.norte)).toBe(eventsBefore);
    expect(await su(db, 'select id::text from public.activity_events order by id')).toEqual(
      eventIdsBefore,
    );
    expect(await counts(db, ID.norte)).toEqual(countsBefore);
  });

  it('un designado modificado por un usuario no es alterado por la re-ejecucion', async () => {
    await execAs(
      ID.memberNorte,
      `update public.customers set notes = 'nota editada', phone = '+34 000 999 999' where name = 'Metálicas Granito';
       update public.technicians set notes = 'nota tecnico editada' where full_name = 'Carmen Bosch Vera'`,
    );
    const c = await rowOf('customers', 'Metálicas Granito');
    const t = await rowOf('technicians', 'Carmen Bosch Vera');
    expect(c.archived_at).not.toBeNull();
    const before = await snapshot(db);

    await runSeed(db);

    expect(await rowOf('customers', 'Metálicas Granito')).toEqual(c);
    expect(await rowOf('technicians', 'Carmen Bosch Vera')).toEqual(t);
    expect(await snapshot(db)).toEqual(before);
  });

  it('sin restauraciones, otra ejecucion deja el snapshot identico', async () => {
    const before = await snapshot(db);
    await runSeed(db);
    expect(await snapshot(db)).toEqual(before);
  });
});

describe('seed demo: precondiciones y atomicidad', () => {
  const expectAbort = async (o: Setup, message: RegExp) => {
    const db = await seededDb(o);
    try {
      await expect(runSeed(db)).rejects.toThrow(message);
      await db.exec('rollback');
      // Nada aplicado, tampoco en la organizacion que si era valida (atomicidad).
      const n = await su(
        db,
        `select (select count(*) from public.customers)::int as c,
                (select count(*) from public.technicians)::int as t,
                (select count(*) from public.activity_events)::int as e,
                current_user as u`,
      );
      expect(n[0]).toEqual({
        c: 0,
        t: 0,
        e: 0,
        u: (await su(db, 'select session_user as u'))[0].u,
      });
    } finally {
      await db.close();
    }
  };

  it('aborta si falta la organizacion Demo Sur', async () => {
    await expectAbort({ sur: false }, /"Demo Sur" debe existir exactamente una vez \(hay 0\)/);
  }, 120_000);

  it('aborta si falta la organizacion Demo Norte', async () => {
    await expectAbort({ norte: false }, /"Demo Norte" debe existir exactamente una vez \(hay 0\)/);
  }, 120_000);

  it('aborta si la organizacion esta duplicada', async () => {
    const db = await seededDb();
    try {
      await db.exec(`insert into public.organizations (name) values ('Demo Sur')`);
      await expect(runSeed(db)).rejects.toThrow(
        /"Demo Sur" debe existir exactamente una vez \(hay 2\)/,
      );
      await db.exec('rollback');
      expect((await su(db, 'select count(*)::int as n from public.customers'))[0].n).toBe(0);
    } finally {
      await db.close();
    }
  }, 120_000);

  it('aborta si una organizacion tiene 0 owners', async () => {
    await expectAbort({ surOwners: 0 }, /"Demo Sur" debe tener exactamente 1 owner \(hay 0\)/);
  }, 120_000);

  it('aborta si una organizacion tiene 2 owners', async () => {
    await expectAbort({ surOwners: 2 }, /"Demo Sur" debe tener exactamente 1 owner \(hay 2\)/);
  }, 120_000);
});
