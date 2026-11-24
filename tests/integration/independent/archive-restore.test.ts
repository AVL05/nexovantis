// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedTwoOrgs } from '../../support/fixtures';
import { createTestDb, type TestDb } from '../../support/pglite';

// Caso independiente de Testing (TASK-008B PRE, DH-06): archivar y restaurar cliente/tecnico con
// evento de actividad. Criterios C-01..C-30 en docs/reviews/claude/TASK-008B-PRE.md.
// Se ejecuta en PGlite (PostgreSQL real con shim de auth). NO prueba PostgREST: ver
// tests/integration/supabase/independent/archive-restore.supabase.test.ts (job supabase de CI).
//
// Contrato asumido (diseno del Orchestrator): public.activity_events(id, organization_id,
// actor_id, entity_type, entity_id, action, occurred_at); trigger en customers/technicians sobre
// archived_at; funcion SECURITY DEFINER en esquema private que inserta el evento.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

type Row = Record<string, unknown>;
type Table = 'customers' | 'technicians';
type Seed = Awaited<ReturnType<typeof seedTwoOrgs>>;

let db: TestDb;
let s: Seed;

async function boot() {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
}
function useSharedDb() {
  beforeAll(boot);
  afterAll(async () => {
    await db.close();
  });
}
function useFreshDb() {
  beforeEach(boot);
  afterEach(async () => {
    await db.close();
  });
}

async function code(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code ?? `sin-codigo:${String(error)}`;
  }
}

const su = async (sql: string, params: unknown[] = []) =>
  (await db.asSuperuser((tx) => tx.query<Row>(sql, params))).rows;
// Varias sentencias (DDL de preparacion) como superusuario: tx.exec admite multiples comandos.
const suExec = async (sql: string) => {
  await db.asSuperuser((tx) => tx.exec(sql));
};
const asUser = (id: string, sql: string, params: unknown[] = []) =>
  db.asUser(id, (tx) => tx.query<Row>(sql, params));
const asAnon = (sql: string, params: unknown[] = []) =>
  db.asAnon((tx) => tx.query<Row>(sql, params));
// Superusuario con claims JWT (simula una conexion de servicio con sub informado).
const suWithSub = (sub: string, sql: string, params: unknown[] = []) =>
  db.asSuperuser(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: 'service_role' }),
    ]);
    return tx.query<Row>(sql, params);
  });

const ids = (table: Table, org: 'A' | 'B') =>
  table === 'customers'
    ? org === 'A'
      ? s.customerA
      : s.customerB
    : org === 'A'
      ? s.technicianA
      : s.technicianB;
const entityType = (table: Table) => (table === 'customers' ? 'customer' : 'technician');
const archivedAt = async (table: Table, id: string) =>
  (await su(`select archived_at from public.${table} where id = $1`, [id]))[0]
    ?.archived_at as Date | null;
const events = (entityId?: string) =>
  su(
    `select * from public.activity_events ${entityId ? 'where entity_id = $1' : ''} order by occurred_at, action`,
    entityId ? [entityId] : [],
  );
const eventCount = async () =>
  Number((await su('select count(*)::int as n from public.activity_events'))[0].n);

const TABLES: { table: Table }[] = [{ table: 'customers' }, { table: 'technicians' }];
const ACTORS: ('ownerA' | 'memberA')[] = ['ownerA', 'memberA'];
const MATRIX = TABLES.flatMap((t) => ACTORS.map((actor) => ({ ...t, actor })));

const ARCHIVE = (table: Table) =>
  `update public.${table} set archived_at = now() where id = $1 returning id`;
const RESTORE = (table: Table) =>
  `update public.${table} set archived_at = null where id = $1 returning id`;

// ---------------------------------------------------------------------------------------------
describe('C-01..C-08 archivar y restaurar con evento (TC-ARCH-05 / TC-TEAM-11)', () => {
  useFreshDb();

  it.each(MATRIX)(
    'C-01 $actor archiva en $table: archived_at fijado y un evento "archived" con actor y organizacion correctos',
    async ({ table, actor }) => {
      const id = ids(table, 'A');
      const res = await asUser(s[actor], ARCHIVE(table), [id]);
      expect(res.rows).toHaveLength(1);
      expect(await archivedAt(table, id)).toBeInstanceOf(Date);
      const ev = await events(id);
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({
        organization_id: s.orgA,
        actor_id: s[actor],
        entity_type: entityType(table),
        entity_id: id,
        action: 'archived',
      });
      expect(ev[0].occurred_at).toBeInstanceOf(Date);
    },
  );

  it.each(MATRIX)(
    'C-02 TC-ARCH-05 / TC-TEAM-11: $actor restaura en $table: archived_at nulo, registro editable y evento "restored"',
    async ({ table, actor }) => {
      const id = ids(table, 'A');
      await asUser(s.ownerA, ARCHIVE(table), [id]);
      const res = await asUser(s[actor], RESTORE(table), [id]);
      expect(res.rows).toHaveLength(1);
      expect(await archivedAt(table, id)).toBeNull();
      const ev = await events(id);
      expect(ev.map((e) => e.action)).toEqual(['archived', 'restored']);
      expect(ev[1]).toMatchObject({
        organization_id: s.orgA,
        actor_id: s[actor],
        entity_type: entityType(table),
        entity_id: id,
      });
      // El registro restaurado vuelve a ser editable y no genera mas eventos.
      const edit = await asUser(
        s[actor],
        `update public.${table} set notes = 'tras restaurar' where id = $1 returning notes`,
        [id],
      );
      expect(edit.rows[0].notes).toBe('tras restaurar');
      expect(await events(id)).toHaveLength(2);
    },
  );

  it.each(TABLES)(
    'C-03 ciclo archivar-restaurar-archivar en $table: 3 eventos y el actor es quien ejecuta cada paso',
    async ({ table }) => {
      const id = ids(table, 'A');
      await asUser(s.memberA, ARCHIVE(table), [id]);
      await asUser(s.ownerA, RESTORE(table), [id]);
      await asUser(s.memberA, ARCHIVE(table), [id]);
      const ev = await events(id);
      expect(ev.map((e) => [e.action, e.actor_id])).toEqual([
        ['archived', s.memberA],
        ['restored', s.ownerA],
        ['archived', s.memberA],
      ]);
      expect(await archivedAt(table, id)).toBeInstanceOf(Date);
    },
  );

  it.each(TABLES)(
    'C-04 la hora de archivado la fija el servidor en $table: se ignora la fecha enviada',
    async ({ table }) => {
      const id = ids(table, 'A');
      for (const value of [`'1999-01-01T00:00:00Z'`, `now() + interval '1 year'`]) {
        const res = await asUser(
          s.memberA,
          `update public.${table} set archived_at = ${value} where id = $1
           returning archived_at = now() as forced`,
          [id],
        );
        expect(res.rows, value).toEqual([{ forced: true }]);
        // Restaurar para repetir con el siguiente valor.
        await asUser(s.memberA, RESTORE(table), [id]);
      }
      const ev = await events(id);
      expect(ev).toHaveLength(4);
      const drift = await su(
        `select count(*)::int as n from public.activity_events
         where abs(extract(epoch from (now() - occurred_at))) > 300`,
      );
      expect(drift[0].n).toBe(0);
    },
  );

  it.each(TABLES)(
    'C-05 archivar junto con otros campos en $table genera un unico evento',
    async ({ table }) => {
      const id = ids(table, 'A');
      await asUser(
        s.ownerA,
        `update public.${table} set archived_at = now(), notes = 'archivado con nota' where id = $1`,
        [id],
      );
      expect(await events(id)).toHaveLength(1);
    },
  );

  it('C-06 una sentencia que archiva varias filas genera un evento por fila', async () => {
    await su(
      `insert into public.customers (organization_id, name) values ($1, 'Segundo cliente')`,
      [s.orgA],
    );
    const res = await asUser(
      s.ownerA,
      `update public.customers set archived_at = now() where organization_id = $1 returning id`,
      [s.orgA],
    );
    expect(res.rows).toHaveLength(2);
    const ev = await events();
    expect(ev).toHaveLength(2);
    expect(new Set(ev.map((e) => e.entity_id)).size).toBe(2);
  });

  it.each(TABLES)(
    'C-07 sin cambio de archived_at no se emite evento en $table (no archivado, mismo valor archivado, otros campos)',
    async ({ table }) => {
      const id = ids(table, 'A');
      await asUser(s.memberA, `update public.${table} set notes = 'a' where id = $1`, [id]);
      await asUser(s.memberA, `update public.${table} set archived_at = null where id = $1`, [id]);
      expect(await eventCount()).toBe(0);
      await asUser(s.memberA, ARCHIVE(table), [id]);
      expect(await eventCount()).toBe(1);
      await asUser(s.ownerA, `update public.${table} set notes = 'b' where id = $1`, [id]);
      await asUser(s.ownerA, `update public.${table} set archived_at = archived_at where id = $1`, [
        id,
      ]);
      await su(`update public.${table} set notes = 'c' where id = $1`, [id]);
      expect(await eventCount()).toBe(1);
    },
  );

  it.each(TABLES)(
    'C-08 archivado a otra fecha ya archivado sigue rechazado (23000), sin evento ni cambio en $table',
    async ({ table }) => {
      const id = ids(table, 'A');
      await asUser(s.memberA, ARCHIVE(table), [id]);
      const before = await archivedAt(table, id);
      const values = ['now()', `now() + interval '1 year'`, `'1999-01-01T00:00:00Z'`];
      for (const value of values) {
        for (const actor of ['memberA', 'ownerA'] as const) {
          const sql = `update public.${table} set archived_at = ${value} where id = $1`;
          expect(await code(() => asUser(s[actor], sql, [id])), `${actor} ${value}`).toBe('23000');
        }
        const sql = `update public.${table} set archived_at = ${value} where id = $1`;
        expect(await code(() => suWithSub(s.ownerA, sql, [id])), `su ${value}`).toBe('23000');
      }
      expect(await archivedAt(table, id)).toEqual(before);
      expect(await events(id)).toHaveLength(1);
    },
  );
});

// ---------------------------------------------------------------------------------------------
describe('C-09..C-10 actor nunca nulo', () => {
  useFreshDb();

  it.each(TABLES)(
    'C-09 sin auth.uid() (superusuario sin JWT) archivar se rechaza (23000) en $table; no cambia nada ni emite evento',
    async ({ table }) => {
      const id = ids(table, 'A');
      expect(await code(() => su(ARCHIVE(table), [id]))).toBe('23000');
      expect(await archivedAt(table, id)).toBeNull();
      expect(await eventCount()).toBe(0);
    },
  );

  it.each(TABLES)(
    'C-10 sin auth.uid() restaurar se rechaza (23000) en $table; el archivado y su unico evento se conservan',
    async ({ table }) => {
      const id = ids(table, 'A');
      await asUser(s.ownerA, ARCHIVE(table), [id]);
      expect(await code(() => su(RESTORE(table), [id]))).toBe('23000');
      expect(await archivedAt(table, id)).toBeInstanceOf(Date);
      expect(await events(id)).toHaveLength(1);
      // Con claims sin sub tampoco.
      const noSub = () =>
        db.asSuperuser(async (tx) => {
          await tx.query(
            `select set_config('request.jwt.claims', '{"role":"service_role"}', true)`,
          );
          return tx.query(RESTORE(table), [id]);
        });
      expect(await code(noSub)).toBe('23000');
    },
  );

  it.each(TABLES)(
    'C-10b ediciones sin cambio de archived_at siguen permitidas sin actor en $table',
    async ({ table }) => {
      const id = ids(table, 'A');
      const res = await su(
        `update public.${table} set notes = 'mantenimiento' where id = $1 returning id`,
        [id],
      );
      expect(res).toHaveLength(1);
      expect(await eventCount()).toBe(0);
    },
  );
});

// ---------------------------------------------------------------------------------------------
describe('C-11..C-14 aislamiento entre organizaciones', () => {
  useFreshDb();

  it.each(TABLES)(
    'C-11 un usuario de otra organizacion no archiva ni restaura filas ajenas en $table (0 filas, sin evento)',
    async ({ table }) => {
      const idA = ids(table, 'A');
      const idB = ids(table, 'B');
      // A intenta archivar B, y B intenta archivar A.
      expect((await asUser(s.ownerA, ARCHIVE(table), [idB])).rows).toHaveLength(0);
      expect((await asUser(s.memberB, ARCHIVE(table), [idA])).rows).toHaveLength(0);
      expect(await archivedAt(table, idA)).toBeNull();
      expect(await archivedAt(table, idB)).toBeNull();
      expect(await eventCount()).toBe(0);
      // Restaurar una fila ajena archivada legitimamente.
      await asUser(s.ownerB, ARCHIVE(table), [idB]);
      expect((await asUser(s.ownerA, RESTORE(table), [idB])).rows).toHaveLength(0);
      expect((await asUser(s.memberA, RESTORE(table), [idB])).rows).toHaveLength(0);
      expect(await archivedAt(table, idB)).toBeInstanceOf(Date);
      expect((await events()).map((e) => [e.organization_id, e.action])).toEqual([
        [s.orgB, 'archived'],
      ]);
    },
  );

  it.each(TABLES)('C-12 anon no archiva ni restaura en $table (42501)', async ({ table }) => {
    const id = ids(table, 'A');
    expect(await code(() => asAnon(ARCHIVE(table), [id]))).toBe('42501');
    await asUser(s.ownerA, ARCHIVE(table), [id]);
    expect(await code(() => asAnon(RESTORE(table), [id]))).toBe('42501');
    expect(await events(id)).toHaveLength(1);
  });

  it('C-13 cada usuario lee solo los eventos de su organizacion; anon y usuarios sin membresia no leen', async () => {
    await asUser(s.ownerA, ARCHIVE('customers'), [s.customerA]);
    await asUser(s.memberA, ARCHIVE('technicians'), [s.technicianA]);
    await asUser(s.ownerB, ARCHIVE('customers'), [s.customerB]);
    for (const actor of [s.ownerA, s.memberA]) {
      const rows = (await asUser(actor, 'select organization_id from public.activity_events')).rows;
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.organization_id === s.orgA)).toBe(true);
    }
    for (const actor of [s.ownerB, s.memberB]) {
      const rows = (await asUser(actor, 'select organization_id from public.activity_events')).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].organization_id).toBe(s.orgB);
    }
    // Acceso por id a un evento ajeno: 0 filas.
    const foreignId = (await events(s.customerB))[0].id as string;
    expect(
      (await asUser(s.ownerA, 'select 1 from public.activity_events where id = $1', [foreignId]))
        .rows,
    ).toHaveLength(0);
    expect(await code(() => asAnon('select * from public.activity_events'))).toBe('42501');
    const orphan = '00000000-0000-4000-8000-0000000000f1';
    expect((await asUser(orphan, 'select * from public.activity_events')).rows).toHaveLength(0);
  });

  it('C-14 al perder la membresia se deja de ver el historial de la organizacion', async () => {
    await asUser(s.ownerA, ARCHIVE('customers'), [s.customerA]);
    expect((await asUser(s.memberA, 'select 1 from public.activity_events')).rows).toHaveLength(1);
    await su(`delete from public.memberships where user_id = $1`, [s.memberA]);
    expect((await asUser(s.memberA, 'select 1 from public.activity_events')).rows).toHaveLength(0);
    // Y deja de poder restaurar.
    expect((await asUser(s.memberA, RESTORE('customers'), [s.customerA])).rows).toHaveLength(0);
    expect(await archivedAt('customers', s.customerA)).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------------------------
describe('C-15..C-19 los eventos no se insertan, falsifican ni alteran', () => {
  useFreshDb();

  const insertEvent = (actor: string, org: string, entity: string, action = 'archived') =>
    asUser(
      actor,
      `insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
       values ($1, $2, 'customer', $3, $4)`,
      [org, actor, entity, action],
    );

  it('C-15 authenticated no inserta eventos (ni propios ni en otra organizacion ni con actor ajeno): 42501', async () => {
    expect(await code(() => insertEvent(s.ownerA, s.orgA, s.customerA))).toBe('42501');
    expect(await code(() => insertEvent(s.ownerA, s.orgB, s.customerB))).toBe('42501');
    expect(
      await code(() =>
        asUser(
          s.ownerA,
          `insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
           values ($1, $2, 'customer', $3, 'restored')`,
          [s.orgA, s.ownerB, s.customerA],
        ),
      ),
    ).toBe('42501');
    expect(
      await code(() => asUser(s.ownerA, `insert into public.activity_events default values`)),
    ).toBe('42501');
    expect(await eventCount()).toBe(0);
  });

  it('C-16 anon no inserta, lee, actualiza ni borra eventos (42501)', async () => {
    for (const sql of [
      `insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
       values ('${s.orgA}', '${s.ownerA}', 'customer', '${s.customerA}', 'archived')`,
      'select * from public.activity_events',
      `update public.activity_events set action = 'restored'`,
      'delete from public.activity_events',
    ]) {
      expect(await code(() => asAnon(sql)), sql).toBe('42501');
    }
  });

  it('C-17 authenticated no actualiza, borra ni trunca eventos propios (42501)', async () => {
    await asUser(s.ownerA, ARCHIVE('customers'), [s.customerA]);
    const [ev] = await events(s.customerA);
    for (const sql of [
      `update public.activity_events set action = 'restored' where id = $1`,
      `update public.activity_events set actor_id = '${s.ownerB}' where id = $1`,
      `update public.activity_events set organization_id = '${s.orgB}' where id = $1`,
      `update public.activity_events set occurred_at = now() - interval '1 day' where id = $1`,
      'delete from public.activity_events where id = $1',
    ]) {
      expect(await code(() => asUser(s.ownerA, sql, [ev.id])), sql).toBe('42501');
    }
    expect(await code(() => asUser(s.ownerA, 'truncate public.activity_events'))).toBe('42501');
    expect(await events(s.customerA)).toEqual([ev]);
  });

  it('C-18 ni con privilegios de administracion se actualizan o borran eventos (23000); el evento queda intacto', async () => {
    await asUser(s.ownerA, ARCHIVE('customers'), [s.customerA]);
    const [ev] = await events(s.customerA);
    for (const sql of [
      `update public.activity_events set action = 'restored' where id = $1`,
      `update public.activity_events set occurred_at = now() - interval '1 day' where id = $1`,
      'delete from public.activity_events where id = $1',
      'delete from public.activity_events',
    ]) {
      expect(await code(() => su(sql, sql.includes('$1') ? [ev.id] : [])), sql).toBe('23000');
    }
    expect(await events(s.customerA)).toEqual([ev]);
  });

  it('C-19 el borrado de la fila de origen sigue vedado a authenticated (BR02) y los eventos persisten', async () => {
    await asUser(s.ownerA, ARCHIVE('customers'), [s.customerA]);
    // Borrado de la fila de origen: no esta permitido a authenticated (BR02) y los eventos persisten.
    expect(
      await code(() =>
        asUser(s.ownerA, 'delete from public.customers where id = $1', [s.customerA]),
      ),
    ).toBe('42501');
    expect(await events(s.customerA)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe('C-20..C-23 forma de la tabla de eventos, RLS, GRANT y datos personales', () => {
  useSharedDb();

  it('C-20 columnas exactas, tipos y obligatoriedad; sin columnas de datos personales', async () => {
    const cols = await su(
      `select column_name, data_type, is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'activity_events' order by column_name`,
    );
    expect(cols.map((c) => c.column_name)).toEqual([
      'action',
      'actor_id',
      'entity_id',
      'entity_type',
      'id',
      'occurred_at',
      'organization_id',
    ]);
    const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]));
    for (const name of Object.keys(byName)) {
      expect(byName[name].is_nullable, name).toBe('NO');
    }
    expect(byName.id.data_type).toBe('uuid');
    expect(byName.occurred_at.data_type).toBe('timestamp with time zone');
    // Solo dos columnas de texto, ambas enumeradas por CHECK (sin texto libre).
    expect(cols.filter((c) => c.data_type === 'text').map((c) => c.column_name)).toEqual([
      'action',
      'entity_type',
    ]);
  });

  it('C-21 CHECK de entity_type y action, NOT NULL y FK a organizations', async () => {
    const base = [s.orgA, s.ownerA, s.customerA];
    const ins = (orgId: unknown, actor: unknown, type: string, action: string) =>
      su(
        `insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
         values ($1, $2, $3, $4, $5)`,
        [orgId, actor, type, base[2], action],
      );
    expect(await code(() => ins(base[0], base[1], 'order', 'archived'))).toBe('23514');
    expect(await code(() => ins(base[0], base[1], 'customer', 'deleted'))).toBe('23514');
    expect(await code(() => ins(base[0], null, 'customer', 'archived'))).toBe('23502');
    expect(await code(() => ins(null, base[1], 'customer', 'archived'))).toBe('23502');
    expect(
      await code(() =>
        ins('00000000-0000-4000-8000-0000000000e1', base[1], 'customer', 'archived'),
      ),
    ).toBe('23503');
    expect(await eventCount()).toBe(0);
  });

  it('C-22 RLS activada, solo una politica SELECT y privilegios minimos', async () => {
    const rls = await su(
      `select relrowsecurity from pg_class where oid = 'public.activity_events'::regclass`,
    );
    expect(rls[0].relrowsecurity).toBe(true);
    const policies = await su(
      `select cmd from pg_policies where schemaname = 'public' and tablename = 'activity_events'`,
    );
    expect(policies.length).toBeGreaterThan(0);
    expect(policies.every((p) => p.cmd === 'SELECT')).toBe(true);
    const priv = async (role: string, p: string) =>
      (await su(`select has_table_privilege($1, 'public.activity_events', $2) as v`, [role, p]))[0]
        .v;
    expect(await priv('authenticated', 'select')).toBe(true);
    for (const p of ['insert', 'update', 'delete', 'truncate', 'references', 'trigger']) {
      expect(await priv('authenticated', p), `authenticated ${p}`).toBe(false);
    }
    for (const p of ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) {
      expect(await priv('anon', p), `anon ${p}`).toBe(false);
    }
    const colUpdate = await su(
      `select a.attname from pg_attribute a
       where a.attrelid = 'public.activity_events'::regclass and a.attnum > 0 and not a.attisdropped
         and (has_column_privilege('authenticated', a.attrelid, a.attnum, 'insert')
           or has_column_privilege('authenticated', a.attrelid, a.attnum, 'update'))`,
    );
    expect(colUpdate).toEqual([]);
  });

  it('C-23 el evento no contiene datos personales: ni nombre, email, telefono ni notas del registro', async () => {
    await db.asUser(s.ownerA, (tx) =>
      tx.query(
        `update public.customers set phone = '+34 600 111 222', notes = 'nota-sensible-xyz'
         where id = $1`,
        [s.customerA],
      ),
    );
    await asUser(s.ownerA, ARCHIVE('customers'), [s.customerA]);
    await asUser(s.ownerA, ARCHIVE('technicians'), [s.technicianA]);
    const dump = JSON.stringify(await events()).toLowerCase();
    for (const pii of [
      'cliente ficticio',
      'tecnico ficticio',
      'example.test',
      '600 111 222',
      'nota-sensible-xyz',
    ]) {
      expect(dump, pii).not.toContain(pii);
    }
    for (const row of await events()) {
      expect(Object.keys(row).sort()).toEqual([
        'action',
        'actor_id',
        'entity_id',
        'entity_type',
        'id',
        'occurred_at',
        'organization_id',
      ]);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('C-24..C-26 funciones SECURITY DEFINER endurecidas y triggers', () => {
  useSharedDb();

  it('C-24 toda funcion que escribe en activity_events es SECURITY DEFINER con search_path vacio', async () => {
    const fns = await su(
      `select p.proname, p.prosecdef, p.proconfig, n.nspname
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private')
         and p.prosrc ~* 'insert\\s+into\\s+(public\\.)?activity_events'`,
    );
    expect(fns.length).toBeGreaterThanOrEqual(1);
    for (const fn of fns) {
      expect(fn.prosecdef, `${fn.nspname}.${fn.proname} SECURITY DEFINER`).toBe(true);
      const config = (fn.proconfig as string[] | null) ?? [];
      expect(
        config.some((c) => /^search_path=("")?$/.test(c) || c === 'search_path=""'),
        `${fn.nspname}.${fn.proname} search_path vacio (${config.join(',')})`,
      ).toBe(true);
      expect(fn.nspname, `${fn.proname} no debe estar en public (expuesta por la API)`).toBe(
        'private',
      );
    }
  });

  it('C-25 ninguna funcion que referencie activity_events es ejecutable por public, anon ni authenticated', async () => {
    const fns = await su(
      `select p.oid::regprocedure::text as sig,
              has_function_privilege('anon', p.oid, 'execute') as anon_x,
              has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_x
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosrc ~* 'activity_events'`,
    );
    expect(fns.length).toBeGreaterThanOrEqual(1);
    for (const fn of fns) {
      expect(fn, `${fn.sig} ejecutable por anon`).toMatchObject({ anon_x: false });
      expect(fn, `${fn.sig} ejecutable por public`).toMatchObject({ public_x: false });
      // Si authenticated pudiera ejecutar la funcion de insercion con parametros podria
      // falsificar eventos por RPC: ver hallazgo F-01 del informe.
      expect(fn, `${fn.sig} ejecutable por authenticated`).toMatchObject({ auth_x: false });
    }
  });

  it('C-26 authenticated no puede invocar el trigger ni la insercion de eventos (42501 o inexistente)', async () => {
    const names = await su(
      `select p.oid::regprocedure::text as sig from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' and p.prosrc ~* 'activity_events'`,
    );
    expect(names.length).toBeGreaterThanOrEqual(1);
    for (const { sig } of names) {
      const callable = sig as string;
      const call = /\(\)$/.test(callable)
        ? `select ${callable}`
        : `select ${callable.replace(/\(.*\)$/, '')}(${callable
            .replace(/^.*\(|\)$/g, '')
            .split(',')
            .filter(Boolean)
            .map(() => 'null')
            .join(',')})`;
      expect(await code(() => asUser(s.ownerA, call)), call).toBe('42501');
    }
  });

  it.each(TABLES)(
    'C-27 $table tiene trigger BEFORE UPDATE sobre archived_at y conserva los de organizacion y updated_at',
    async ({ table }) => {
      const rows = await su(
        `select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as def
         from pg_trigger t where t.tgrelid = $1::regclass and not t.tgisinternal`,
        [`public.${table}`],
      );
      const names = rows.map((r) => r.tgname as string);
      expect(names.some((n) => /prevent_organization_change/.test(n))).toBe(true);
      expect(names.some((n) => /set_updated_at/.test(n))).toBe(true);
      expect(rows.every((r) => r.tgenabled === 'O')).toBe(true);
      const archiveTriggers = rows.filter((r) => /archived_at/.test(r.def as string));
      expect(archiveTriggers.length).toBeGreaterThanOrEqual(1);
      for (const t of archiveTriggers) {
        expect(t.def).toMatch(/BEFORE UPDATE/);
        expect(t.def).toMatch(/FOR EACH ROW/);
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------
describe('C-28 atomicidad: cambio y evento van juntos', () => {
  useFreshDb();

  it('C-28a si falla la insercion del evento, el archivado se revierte', async () => {
    // Se instala un trigger de prueba que hace fallar la insercion del evento.
    await suExec(`
      create schema atomicity_test;
      create function atomicity_test.fail_event() returns trigger language plpgsql as
      $$ begin raise exception 'fallo simulado del evento' using errcode = 'P0001'; end; $$;
      create trigger fail_event before insert on public.activity_events
        for each row execute function atomicity_test.fail_event();`);
    for (const table of ['customers', 'technicians'] as Table[]) {
      const id = ids(table, 'A');
      expect(await code(() => asUser(s.ownerA, ARCHIVE(table), [id]))).toBe('P0001');
      expect(await archivedAt(table, id)).toBeNull();
    }
    expect(await eventCount()).toBe(0);
  });

  it('C-28b si falla la insercion del evento al restaurar, el registro sigue archivado', async () => {
    await asUser(s.ownerA, ARCHIVE('customers'), [s.customerA]);
    await suExec(`
      create schema atomicity_test;
      create function atomicity_test.fail_event() returns trigger language plpgsql as
      $$ begin raise exception 'fallo simulado del evento' using errcode = 'P0001'; end; $$;
      create trigger fail_event before insert on public.activity_events
        for each row execute function atomicity_test.fail_event();`);
    expect(await code(() => asUser(s.ownerA, RESTORE('customers'), [s.customerA]))).toBe('P0001');
    expect(await archivedAt('customers', s.customerA)).toBeInstanceOf(Date);
    expect(await events(s.customerA)).toHaveLength(1);
  });

  it('C-28c si la transaccion que archiva se revierte, tampoco queda evento', async () => {
    const failing = db.asUser(s.ownerA, async (tx) => {
      await tx.query(ARCHIVE('customers'), [s.customerA]);
      throw new Error('rollback solicitado');
    });
    await expect(failing).rejects.toThrow('rollback solicitado');
    expect(await archivedAt('customers', s.customerA)).toBeNull();
    expect(await eventCount()).toBe(0);
  });

  it('C-28d una sentencia multifila que falla a mitad no deja eventos parciales', async () => {
    await su(
      `insert into public.customers (organization_id, name, archived_at)
              values ($1, 'Ya archivado', '2026-01-01T00:00:00Z')`,
      [s.orgA],
    );
    // La segunda fila ya esta archivada: fijar una fecha distinta (si la fila anterior
    // se archiva, la sentencia entera debe revertirse en cuanto una fila falle).
    const sql = `update public.customers set archived_at = now() where organization_id = $1`;
    // Fila ya archivada con now() distinto de su archived_at: la fila se rechaza (23000).
    expect(await code(() => asUser(s.ownerA, sql, [s.orgA]))).toBe('23000');
    expect(await archivedAt('customers', s.customerA)).toBeNull();
    expect(await eventCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('C-29..C-30 no regresion de RLS, GRANT y restricciones', () => {
  useFreshDb();

  it.each(TABLES)(
    'C-29 los GRANT de columna en $table no permiten escribir organization_id, id ni marcas de tiempo',
    async ({ table }) => {
      const can = async (col: string, p: string) =>
        (
          await su(`select has_column_privilege('authenticated', $1, $2, $3) as v`, [
            `public.${table}`,
            col,
            p,
          ])
        )[0].v;
      for (const col of ['id', 'organization_id', 'created_at', 'updated_at']) {
        expect(await can(col, 'update'), `update ${col}`).toBe(false);
      }
      expect(await can('archived_at', 'update')).toBe(true);
      const attempts = [
        `update public.${table} set organization_id = '${s.orgB}' where id = $1`,
        `update public.${table} set id = gen_random_uuid() where id = $1`,
        `update public.${table} set created_at = now() where id = $1`,
        `update public.${table} set updated_at = now() where id = $1`,
      ];
      for (const sql of attempts) {
        expect(await code(() => asUser(s.ownerA, sql, [ids(table, 'A')])), sql).toBe('42501');
      }
      expect(
        await code(() =>
          su(`update public.${table} set organization_id = $2 where id = $1`, [
            ids(table, 'A'),
            s.orgB,
          ]),
        ),
      ).toBe('23000');
    },
  );

  it.each(TABLES)(
    'C-30 member y owner no insertan en $table ya archivados ni con archived_at propio; el borrado sigue vedado',
    async ({ table }) => {
      const insertSql =
        table === 'customers'
          ? `insert into public.customers (organization_id, name, archived_at) values ($1, 'X', now())`
          : `insert into public.technicians (organization_id, full_name, archived_at) values ($1, 'X', now())`;
      for (const actor of ACTORS) {
        expect(await code(() => asUser(s[actor], insertSql, [s.orgA])), actor).toBe('42501');
        expect(
          await code(() =>
            asUser(s[actor], `delete from public.${table} where id = $1`, [ids(table, 'A')]),
          ),
        ).toBe('42501');
      }
      // Los eventos tampoco aparecen por insertar filas normales.
      await asUser(
        s.ownerA,
        table === 'customers'
          ? `insert into public.customers (organization_id, name) values ($1, 'Nuevo')`
          : `insert into public.technicians (organization_id, full_name) values ($1, 'Nuevo')`,
        [s.orgA],
      );
      expect(await eventCount()).toBe(0);
    },
  );
});
