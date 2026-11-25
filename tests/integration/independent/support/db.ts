import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Soporte de las pruebas independientes de PGlite de TASK-010. Propietario: Testing.
// Instancia propia de PGlite (no createTestDb) para poder: (a) parar en la ultima migracion
// anterior a TASK-010 y aplicar despues solo las nuevas, y (b) ejecutar scripts con su propio
// begin/commit (seed, reconciliacion, comprobaciones previas).

export const BASELINE = '20261124100000'; // ultima migracion anterior a TASK-010 (version 5)

const ROOT = new URL('../../../../', import.meta.url);
export const PATHS = {
  shim: fileURLToPath(new URL('tests/support/supabase-shim.sql', ROOT)),
  migrations: fileURLToPath(new URL('supabase/migrations/', ROOT)),
  seed: fileURLToPath(new URL('supabase/seeds/demo-crm.sql', ROOT)),
  reconcile: fileURLToPath(new URL('supabase/seeds/reconcile-demo-crm.sql', ROOT)),
  namePrecheck: fileURLToPath(new URL('supabase/checks/name-constraints-precheck.sql', ROOT)),
};

export type Row = Record<string, unknown>;

export type Migration = { name: string; version: string; sql: string };

export async function readMigrations(): Promise<Migration[]> {
  const names = (await readdir(PATHS.migrations)).filter((n) => /^\d{14}_.+\.sql$/.test(n)).sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      version: name.slice(0, 14),
      sql: await readFile(PATHS.migrations + name, 'utf8'),
    })),
  );
}

/** Base de datos con el shim y las migraciones hasta BASELINE (estado de Cloud antes de TASK-010). */
export async function baselineDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(await readFile(PATHS.shim, 'utf8'));
  for (const m of (await readMigrations()).filter((x) => x.version <= BASELINE)) {
    await db.exec(m.sql);
  }
  return db;
}

/** Migraciones posteriores a BASELINE (las de TASK-010), por orden de aplicacion. */
export async function newMigrations(): Promise<Migration[]> {
  return (await readMigrations()).filter((m) => m.version > BASELINE);
}

/** Aplica las migraciones nuevas una a una. Devuelve el primer error (o null) sin lanzar. */
export async function applyNewMigrations(db: PGlite): Promise<unknown | null> {
  for (const m of await newMigrations()) {
    try {
      await db.exec(m.sql);
    } catch (error) {
      await db.exec('rollback').catch(() => undefined);
      return error;
    }
  }
  return null;
}

/** Base de datos completa (shim + todas las migraciones). */
export async function fullDb(): Promise<PGlite> {
  const db = await baselineDb();
  const error = await applyNewMigrations(db);
  if (error) throw error;
  return db;
}

export const q = async (db: PGlite, sql: string, params: unknown[] = []) =>
  (await db.query<Row>(sql, params)).rows;

/** Ejecuta `fn` como el usuario (rol authenticated + claims) en una transaccion. */
export async function asUser<T>(
  db: PGlite,
  userId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    await tx.exec('set local role authenticated');
    return fn(tx);
  });
}

export async function code(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code ?? `sin-codigo:${String(error)}`;
  }
}

/** Huella de TODAS las tablas de los esquemas public y private (contenido completo, ordenado). */
export async function fingerprint(db: PGlite, schemas = ['public', 'private']): Promise<Row[]> {
  const tables = await q(
    db,
    `select schemaname, tablename from pg_tables where schemaname = any($1::text[]) order by 1, 2`,
    [schemas],
  );
  const out: Row[] = [];
  for (const t of tables) {
    const rows = await q(
      db,
      `select coalesce(md5(string_agg(x::text, '|' order by x::text)), '') as h, count(*)::int as n
         from ${t.schemaname as string}.${t.tablename as string} x`,
    );
    out.push({ table: `${t.schemaname as string}.${t.tablename as string}`, ...rows[0] });
  }
  return out;
}

export function lastRows(results: { rows: Row[] }[]): Row[] {
  return results.length > 0 ? results[results.length - 1].rows : [];
}
