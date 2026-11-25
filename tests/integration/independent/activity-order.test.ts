// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { seedTwoOrgs } from '../../support/fixtures';
import { createTestDb, type TestDb } from '../../support/pglite';
import { applyNewMigrations, asUser as asUserRaw, baselineDb, code, q } from './support/db';

// Prueba independiente de Testing (TASK-010 PRE, A02-05). Develop no la modifica.
// PGlite (PostgreSQL real, shim de Auth). La lectura por PostgREST se comprueba en
// tests/integration/supabase/independent/archived-readonly.supabase.test.ts (CI).
//
// Defecto (AUDIT-002): activity_events solo tiene occurred_at = now() (hora de INICIO de la
// transaccion). Archivar y restaurar en una misma transaccion produce eventos con occurred_at
// identico y sin orden fiable.
//
// Contrato (migracion nueva de Develop):
//   - public.activity_events.seq: bigint, UNICO, asignado por el servidor con un valor por defecto
//     (secuencia/identity) en cada INSERT del trigger de archivado; creciente en el orden de insercion.
//   - Las filas EXISTENTES (anteriores a la migracion) conservan seq = NULL: su orden relativo no es
//     reconstruible cuando coincide occurred_at y NO se inventa. Orden de consulta: occurred_at,
//     despues seq. Las filas historicas se leen solo por occurred_at.
//   - Los usuarios no pueden insertar ni modificar seq (sin INSERT/UPDATE de columna). El historial
//     sigue siendo inmutable (UPDATE/DELETE/TRUNCATE rechazados con 23000, tambien seq).
//   - El orden de lectura de la aplicacion (listEntityHistory) es occurred_at DESC y luego seq DESC.

vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });

type Table = 'customers' | 'technicians';
const TABLES: { table: Table }[] = [{ table: 'customers' }, { table: 'technicians' }];

let db: TestDb;
let s: Awaited<ReturnType<typeof seedTwoOrgs>>;

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
});
afterAll(async () => {
  await db.close();
});

const idOf = (table: Table) => (table === 'customers' ? s.customerA : s.technicianA);
const su = async (sql: string, params: unknown[] = []) =>
  (await db.asSuperuser((tx) => tx.query<Record<string, unknown>>(sql, params))).rows;

const ARCHIVE = (t: Table) => `update public.${t} set archived_at = now() where id = $1`;
const RESTORE = (t: Table) => `update public.${t} set archived_at = null where id = $1`;

const seqOf = (rows: Record<string, unknown>[]) => rows.map((r) => BigInt(String(r.seq)));
const strictlyIncreasing = (values: bigint[]) =>
  values.every((v, i) => i === 0 || v > values[i - 1]);

// En `order by seq` un nombre sin calificar se resuelve primero contra las columnas de SALIDA, y
// `seq::text as seq` es texto ('10' < '8'). Se ordena por la columna bigint calificada
// (correccion de Testing POST: el defecto estaba en la prueba, no en la implementacion).
const eventsBySeq = (entityId: string) =>
  su(
    `select action, seq::text as seq, occurred_at from public.activity_events
     where entity_id = $1 order by public.activity_events.seq`,
    [entityId],
  );

describe.each(TABLES)('A02-05 orden fiable de eventos de $table', ({ table }) => {
  it('archivar, restaurar y archivar en UNA transaccion: occurred_at coincide y seq ordena', async () => {
    const id = idOf(table);
    await db.asUser(s.ownerA, async (tx) => {
      await tx.query(ARCHIVE(table), [id]);
      await tx.query(RESTORE(table), [id]);
      await tx.query(ARCHIVE(table), [id]);
    });
    const rows = await eventsBySeq(id);
    expect(rows.map((r) => r.action)).toEqual(['archived', 'restored', 'archived']);
    // Premisa del defecto: la marca de tiempo no distingue los eventos.
    expect(new Set(rows.map((r) => (r.occurred_at as Date).getTime())).size).toBe(1);
    expect(rows.every((r) => r.seq !== null)).toBe(true);
    expect(strictlyIncreasing(seqOf(rows))).toBe(true);
    // El mismo orden se obtiene con la ordenacion de la aplicacion.
    const app = await su(
      `select action from public.activity_events where entity_id = $1
       order by occurred_at desc, seq desc`,
      [id],
    );
    expect(app.map((r) => r.action)).toEqual(['archived', 'restored', 'archived']);
    // Deja la fila activa para las demas pruebas.
    await db.asUser(s.ownerA, (tx) => tx.query(RESTORE(table), [id]));
  });

  it('una sentencia que archiva varias filas asigna un seq distinto y no nulo a cada evento', async () => {
    const extra = await su(
      `insert into public.${table} (organization_id, ${table === 'customers' ? 'name' : 'full_name'})
       select $1, 'Extra ' || g from generate_series(1, 3) g returning id`,
      [s.orgA],
    );
    const ids = extra.map((r) => r.id as string);
    await db.asUser(s.ownerA, (tx) =>
      tx.query(`update public.${table} set archived_at = now() where id = any($1::uuid[])`, [ids]),
    );
    const rows = await su(
      `select seq::text as seq from public.activity_events where entity_id = any($1::uuid[])`,
      [ids],
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.seq !== null)).toBe(true);
    expect(new Set(rows.map((r) => r.seq)).size).toBe(3);
  });

  it('en transacciones distintas el seq crece con el orden de confirmacion', async () => {
    const id = idOf(table);
    await db.asUser(s.memberA, (tx) => tx.query(ARCHIVE(table), [id]));
    await db.asUser(s.ownerA, (tx) => tx.query(RESTORE(table), [id]));
    await db.asUser(s.memberA, (tx) => tx.query(ARCHIVE(table), [id]));
    const last3 = (await eventsBySeq(id)).slice(-3);
    expect(last3.map((r) => r.action)).toEqual(['archived', 'restored', 'archived']);
    expect(strictlyIncreasing(seqOf(last3))).toBe(true);
    await db.asUser(s.ownerA, (tx) => tx.query(RESTORE(table), [id]));
  });
});

describe('A02-05 forma, privilegios e inmutabilidad de seq', () => {
  it('seq es bigint, unico, y las filas nuevas nunca lo tienen nulo', async () => {
    const col = await su(
      `select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'activity_events' and column_name = 'seq'`,
    );
    expect(col).toEqual([{ data_type: 'bigint' }]);
    const unique = await su(
      `select i.indexrelid::regclass::text as idx
       from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
       where i.indrelid = 'public.activity_events'::regclass and i.indisunique
         and i.indnatts = 1 and a.attname = 'seq'`,
    );
    expect(unique.length).toBeGreaterThan(0);
    expect(
      (await su(`select count(*)::int as n from public.activity_events where seq is null`))[0].n,
    ).toBe(0);
    expect(
      (await su(`select count(*)::int as n from public.activity_events`))[0].n,
    ).toBeGreaterThan(0);
  });

  it('authenticated y anon no tienen INSERT ni UPDATE sobre seq; la insercion directa falla (42501)', async () => {
    for (const role of ['authenticated', 'anon']) {
      for (const priv of ['insert', 'update']) {
        const r = await su(
          `select has_column_privilege($1, 'public.activity_events', 'seq', $2) as v`,
          [role, priv],
        );
        expect(r[0].v, `${role} ${priv}`).toBe(false);
      }
    }
    const forged = () =>
      db.asUser(s.ownerA, (tx) =>
        tx.query(
          `insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action, seq)
           values ($1, $2, 'customer', $3, 'archived', 1)`,
          [s.orgA, s.ownerA, s.customerA],
        ),
      );
    expect(await code(forged)).toBe('42501');
  });

  it('seq (como el resto del evento) es inmutable: UPDATE y DELETE rechazados con 23000 incluso para el superusuario', async () => {
    expect(await code(() => su(`update public.activity_events set seq = seq + 1000`))).toBe(
      '23000',
    );
    expect(await code(() => su(`delete from public.activity_events`))).toBe('23000');
    expect(await code(() => su(`truncate public.activity_events`))).toBe('23000');
  });

  it('un archivado revertido no deja eventos ni rompe el orden posterior', async () => {
    const id = s.customerB;
    const failing = db.asUser(s.ownerB, async (tx) => {
      await tx.query(ARCHIVE('customers'), [id]);
      throw new Error('rollback solicitado');
    });
    await expect(failing).rejects.toThrow('rollback solicitado');
    expect(await eventsBySeq(id)).toEqual([]);
    await db.asUser(s.ownerB, (tx) => tx.query(ARCHIVE('customers'), [id]));
    await db.asUser(s.ownerB, (tx) => tx.query(RESTORE('customers'), [id]));
    expect(strictlyIncreasing(seqOf(await eventsBySeq(id)))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Filas existentes: no se inventa un orden que no se puede reconstruir.

describe('A02-05 eventos historicos (anteriores a la migracion)', () => {
  const ORG = '00000000-0000-4000-8000-0000000000a1';
  const USER = '00000000-0000-4000-8000-0000000000b1';
  const CUSTOMER = '00000000-0000-4000-8000-0000000000c1';
  let legacy: PGlite;

  beforeAll(async () => {
    legacy = await baselineDb();
    await legacy.exec(`
      insert into public.organizations (id, name) values ('${ORG}', 'Org heredada');
      insert into auth.users (id, email) values ('${USER}', 'heredado@example.test');
      insert into public.memberships (organization_id, user_id, role) values ('${ORG}', '${USER}', 'owner');
      insert into public.customers (id, organization_id, name) values ('${CUSTOMER}', '${ORG}', 'Cliente heredado');`);
    // Estado real previo: dos eventos con el mismo occurred_at (misma transaccion).
    await asUserRaw(legacy, USER, async (tx) => {
      await tx.query(`update public.customers set archived_at = now() where id = $1`, [CUSTOMER]);
      await tx.query(`update public.customers set archived_at = null where id = $1`, [CUSTOMER]);
    });
    // Y uno posterior en otra transaccion (orden reconstruible por occurred_at).
    await asUserRaw(legacy, USER, (tx) =>
      tx.query(`update public.customers set archived_at = now() where id = $1`, [CUSTOMER]),
    );
  });
  afterAll(async () => {
    await legacy.close();
  });

  it('tras migrar, los eventos existentes conservan seq nulo (sin orden inventado) y siguen leyendose', async () => {
    const before = await q(
      legacy,
      `select id::text, action, occurred_at::text from public.activity_events order by id`,
    );
    expect(before).toHaveLength(3);
    expect(await applyNewMigrations(legacy)).toBeNull();

    const after = await q(
      legacy,
      `select id::text, action, occurred_at::text, seq from public.activity_events order by id`,
    );
    // Mismas filas, mismas marcas de tiempo; ninguna recibe un seq que invente un orden entre empates.
    expect(after.map(({ id, action, occurred_at }) => ({ id, action, occurred_at }))).toEqual(
      before,
    );
    expect(after.every((r) => r.seq === null)).toBe(true);
    // El orden de lectura sigue siendo determinista por occurred_at (el posterior va despues).
    const ordered = await q(
      legacy,
      `select action from public.activity_events order by occurred_at desc, seq desc`,
    );
    expect(ordered[0].action).toBe('archived');
  });

  it('los eventos nuevos posteriores a la migracion si reciben seq y quedan despues de los historicos', async () => {
    await asUserRaw(legacy, USER, (tx) =>
      tx.query(`update public.customers set archived_at = null where id = $1`, [CUSTOMER]),
    );
    await asUserRaw(legacy, USER, (tx) =>
      tx.query(`update public.customers set archived_at = now() where id = $1`, [CUSTOMER]),
    );
    const rows = await q(
      legacy,
      `select action, seq::text as seq from public.activity_events
       where seq is not null order by public.activity_events.seq`,
    );
    expect(rows.map((r) => r.action)).toEqual(['restored', 'archived']);
    expect(strictlyIncreasing(rows.map((r) => BigInt(String(r.seq))))).toBe(true);
    expect(
      (
        await q(legacy, `select count(*)::int as n from public.activity_events where seq is null`)
      )[0].n,
    ).toBe(3);
  });
});
