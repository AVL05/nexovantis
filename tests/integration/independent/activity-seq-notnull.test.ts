// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  asUser as asUserRaw,
  baselineDb,
  code,
  newMigrations,
  q,
  readMigrations,
  type Row,
} from './support/db';

// Prueba independiente de Testing (TASK-010B, B-03 / AUDIT-002-RETEST hallazgo 3). Develop no la
// modifica. PGlite (PostgreSQL real, shim de Auth).
//
// Defecto reproducido por Codex sobre 33e6b1c: una insercion administrativa ordinaria puede
// escribir `seq = NULL` explicito en activity_events (la columna admite NULL y el DEFAULT solo
// actua cuando se omite), creando un evento NUEVO indistinguible de los historicos por `seq`.
//
// CONTRATO (E-03 + E-04 de TASK-010-PRE, B-03 de TASK-010B):
//   1. Una MIGRACION NUEVA con version posterior a 20261125090300 (las nueve migraciones existentes
//      no se modifican) impide que cualquier INSERT futuro deje seq NULL, incluida la insercion
//      administrativa (superusuario) con `seq = NULL` explicito, tambien en sentencias multifila.
//      Forma sugerida: CHECK (seq IS NOT NULL) NOT VALID. Otra forma es valida si cumple el contrato.
//   2. La migracion NO reescribe, rellena ni borra los eventos historicos: tras aplicarla conservan
//      todas sus columnas (contenido) y `seq` NULL, sin orden inventado, y la migracion no falla
//      aunque existan filas con seq NULL (no puede validar retroactivamente).
//   3. Sin cambios en lo demas: seq omitido recibe un valor del DEFAULT (creciente), seq explicito
//      valido y no duplicado se acepta, el unico de seq se mantiene, el historial sigue inmutable
//      (UPDATE/DELETE/TRUNCATE -> 23000, tambien para ocultar o "arreglar" filas historicas) y el
//      trigger de archivado sigue asignando seq.

vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });

const LAST_EXISTING = '20261125090300';
const ORG = '00000000-0000-4000-8000-0000000000a1';
const USER = '00000000-0000-4000-8000-0000000000b1';
const CUSTOMER = '00000000-0000-4000-8000-0000000000c1';
const NULL_VIOLATION = /^235(02|14)$/; // not_null_violation | check_violation

const INSERT_EVENT = (seqSql: string) => `
  insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action, seq)
  values ('${ORG}', '${USER}', 'customer', '${CUSTOMER}', 'archived', ${seqSql})`;
const INSERT_EVENT_NO_SEQ = `
  insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
  values ('${ORG}', '${USER}', 'customer', '${CUSTOMER}', 'restored')`;

class Rollback extends Error {}

/**
 * Ejecuta `sql` en una transaccion que SIEMPRE se revierte. Devuelve el SQLSTATE si PostgreSQL lo
 * rechaza o 'accepted' si lo habria aceptado (asi un defecto no contamina las pruebas siguientes).
 */
async function attempt(db: PGlite, sql: string): Promise<string> {
  try {
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      throw new Rollback('revertir');
    });
  } catch (error) {
    if (error instanceof Rollback) return 'accepted';
    return (error as { code?: string }).code ?? `sin-codigo:${String(error)}`;
  }
  return 'accepted';
}

const countAll = async (db: PGlite) =>
  Number((await q(db, `select count(*)::int as n from public.activity_events`))[0].n);

/** Contenido completo de los eventos (todas las columnas, orden estable por id). */
const dump = (db: PGlite) =>
  q(
    db,
    `select id::text, organization_id::text, actor_id::text, entity_type, entity_id::text, action,
            occurred_at::text, seq::text
     from public.activity_events order by id`,
  );

/** Baseline (version 5) con tres eventos historicos de mismo/distinto occurred_at (sin seq). */
async function legacyWithHistory(): Promise<PGlite> {
  const db = await baselineDb();
  await db.exec(`
    insert into public.organizations (id, name) values ('${ORG}', 'Org heredada');
    insert into auth.users (id, email) values ('${USER}', 'heredado@example.test');
    insert into public.memberships (organization_id, user_id, role) values ('${ORG}', '${USER}', 'owner');
    insert into public.customers (id, organization_id, name) values ('${CUSTOMER}', '${ORG}', 'Cliente heredado');`);
  await asUserRaw(db, USER, async (tx) => {
    await tx.query(`update public.customers set archived_at = now() where id = $1`, [CUSTOMER]);
    await tx.query(`update public.customers set archived_at = null where id = $1`, [CUSTOMER]);
  });
  await asUserRaw(db, USER, (tx) =>
    tx.query(`update public.customers set archived_at = now() where id = $1`, [CUSTOMER]),
  );
  return db;
}

/** Aplica las migraciones hasta `LAST_EXISTING` incluida (las de TASK-010 ya existentes). */
async function applyUpTo(db: PGlite, lastVersion: string) {
  for (const m of (await newMigrations()).filter((x) => x.version <= lastVersion)) {
    await db.exec(m.sql);
  }
}
/** Aplica solo las migraciones posteriores a `afterVersion`. Devuelve el primer error o null. */
async function applyAfter(db: PGlite, afterVersion: string): Promise<unknown | null> {
  for (const m of (await newMigrations()).filter((x) => x.version > afterVersion)) {
    try {
      await db.exec(m.sql);
    } catch (error) {
      await db.exec('rollback').catch(() => undefined);
      return error;
    }
  }
  return null;
}

describe('B-03 la migracion nueva existe y es posterior a la ultima de TASK-010', () => {
  it('hay al menos una migracion con version > 20261125090300 y las nueve existentes siguen presentes', async () => {
    const versions = (await readMigrations()).map((m) => m.version);
    expect(versions).toEqual(expect.arrayContaining([LAST_EXISTING, '20261125090000']));
    expect(
      versions.filter((v) => v > LAST_EXISTING).length,
      'falta la migracion nueva que impide seq NULL en inserciones futuras (no se editan las existentes)',
    ).toBeGreaterThan(0);
  });
});

describe('B-03 migrando una base con eventos historicos (seq NULL)', () => {
  let db: PGlite;
  let before: Row[];
  let migrateError: unknown;

  beforeAll(async () => {
    db = await legacyWithHistory();
    await applyUpTo(db, LAST_EXISTING);
    // Tras las migraciones existentes los 3 eventos historicos tienen seq NULL (E-04).
    before = await dump(db);
    migrateError = await applyAfter(db, LAST_EXISTING);
  });
  afterAll(async () => {
    await db.close();
  });

  it('premisa: antes de la migracion nueva hay 3 eventos historicos con seq NULL', () => {
    expect(before).toHaveLength(3);
    expect(before.every((r) => r.seq === null)).toBe(true);
  });

  it('la migracion nueva se aplica sin error aunque existan filas con seq NULL (no valida retroactivamente)', () => {
    expect(migrateError).toBeNull();
  });

  it('los eventos historicos se conservan intactos: mismo contenido y seq NULL (sin orden inventado)', async () => {
    const after = await dump(db);
    expect(after).toEqual(before);
    expect(after.every((r) => r.seq === null)).toBe(true);
  });

  it('insercion administrativa ordinaria con seq = NULL explicito: rechazada y sin efecto', async () => {
    const n = await countAll(db);
    const failure = await attempt(db, INSERT_EVENT('null'));
    expect(failure, 'el INSERT con seq NULL debe rechazarse (23502/23514)').toMatch(NULL_VIOLATION);
    expect(await countAll(db)).toBe(n);
  });

  it('insercion multifila con un NULL explicito: se rechaza entera (ninguna fila se inserta)', async () => {
    const n = await countAll(db);
    const failure = await attempt(
      db,
      `insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action, seq)
       values ('${ORG}', '${USER}', 'customer', '${CUSTOMER}', 'archived', 7000000000001),
              ('${ORG}', '${USER}', 'customer', '${CUSTOMER}', 'restored', null)`,
    );
    expect(failure).toMatch(NULL_VIOLATION);
    expect(await countAll(db)).toBe(n);
    expect(
      (
        await q(
          db,
          `select count(*)::int as n from public.activity_events where seq = 7000000000001`,
        )
      )[0].n,
    ).toBe(0);
  });

  it('INSERT ... SELECT que produce seq NULL tambien se rechaza', async () => {
    const n = await countAll(db);
    const failure = await attempt(
      db,
      `insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action, seq)
       select organization_id, actor_id, entity_type, entity_id, action, null::bigint
       from public.activity_events limit 1`,
    );
    expect(failure).toMatch(NULL_VIOLATION);
    expect(await countAll(db)).toBe(n);
  });

  it('seq omitido recibe un valor no nulo del DEFAULT, creciente en cada insercion', async () => {
    await db.exec(INSERT_EVENT_NO_SEQ);
    await db.exec(INSERT_EVENT_NO_SEQ);
    const rows = await q(
      db,
      `select seq::text as seq from public.activity_events
       where seq is not null order by public.activity_events.seq`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const values = rows.map((r) => BigInt(String(r.seq)));
    expect(values.every((v, i) => i === 0 || v > values[i - 1])).toBe(true);
  });

  it('insercion valida con seq explicito y no duplicado: aceptada; el duplicado sigue rechazado (unico)', async () => {
    const n = await countAll(db);
    await db.exec(INSERT_EVENT('8000000000001'));
    expect(await countAll(db)).toBe(n + 1);
    expect(await code(() => db.exec(INSERT_EVENT('8000000000001')))).toBe('23505');
    expect(await countAll(db)).toBe(n + 1);
  });

  it('el trigger de archivado sigue asignando seq no nulo a los eventos nuevos', async () => {
    await asUserRaw(db, USER, (tx) =>
      tx.query(`update public.customers set archived_at = null where id = $1`, [CUSTOMER]),
    );
    await asUserRaw(db, USER, (tx) =>
      tx.query(`update public.customers set archived_at = now() where id = $1`, [CUSTOMER]),
    );
    const rows = await q(
      db,
      `select action, seq from public.activity_events order by occurred_at desc, id desc limit 2`,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.seq !== null)).toBe(true);
  });

  it('coherencia con la inmutabilidad: no se puede "arreglar" ni borrar un historico (23000) y siguen siendo 3', async () => {
    expect(
      await code(() =>
        db.exec(`update public.activity_events set seq = 9999999 where seq is null`),
      ),
    ).toBe('23000');
    expect(await code(() => db.exec(`delete from public.activity_events where seq is null`))).toBe(
      '23000',
    );
    expect(await code(() => db.exec(`truncate public.activity_events`))).toBe('23000');
    const historic = await q(
      db,
      `select count(*)::int as n from public.activity_events where seq is null`,
    );
    expect(historic[0].n).toBe(3);
    // Y el contenido historico sigue siendo el original.
    const nulls = (await dump(db)).filter((r) => r.seq === null);
    expect(nulls).toEqual(before);
  });

  it('forma conservada: seq sigue siendo bigint, con DEFAULT de secuencia y unico', async () => {
    const col = await q(
      db,
      `select data_type, column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'activity_events' and column_name = 'seq'`,
    );
    expect(col[0].data_type).toBe('bigint');
    expect(String(col[0].column_default)).toMatch(/nextval\(/);
    const unique = await q(
      db,
      `select 1 as x from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
       where i.indrelid = 'public.activity_events'::regclass and i.indisunique
         and i.indnatts = 1 and a.attname = 'seq'`,
    );
    expect(unique.length).toBeGreaterThan(0);
  });

  it('la regla se aplica a cualquier rol de escritura: authenticated sigue sin INSERT (42501)', async () => {
    const failure = await code(() =>
      asUserRaw(db, USER, (tx) =>
        tx.query(
          `insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action, seq)
           values ($1, $2, 'customer', $3, 'archived', null)`,
          [ORG, USER, CUSTOMER],
        ),
      ),
    );
    expect(failure).toBe('42501');
  });
});
