import { PGlite, type Transaction } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Base de datos de pruebas: PostgreSQL real in-process (PGlite) con un shim minimo de auth y
// las migraciones de supabase/migrations/. No es Supabase (ni PostgREST ni GoTrue).

const SHIM_PATH = fileURLToPath(new URL('./supabase-shim.sql', import.meta.url));
const MIGRATIONS_DIR = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));

export type TestTx = Transaction;

export interface TestDb {
  /** Ejecuta `fn` como superusuario (sin RLS). Solo para preparar y verificar datos. */
  asSuperuser<T>(fn: (tx: TestTx) => Promise<T>): Promise<T>;
  /** Ejecuta `fn` como el rol `authenticated` con `sub` = userId en los claims. */
  asUser<T>(userId: string, fn: (tx: TestTx) => Promise<T>): Promise<T>;
  /** Ejecuta `fn` como el rol `anon` (sin claims). */
  asAnon<T>(fn: (tx: TestTx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

let sqlCache: Promise<string[]> | undefined;

// Shim primero y despues las migraciones por orden lexicografico (= orden de aplicacion).
function loadSqlFiles(): Promise<string[]> {
  sqlCache ??= (async () => {
    const names = (await readdir(MIGRATIONS_DIR))
      .filter((name) => /^\d{14}_.+\.sql$/.test(name))
      .sort();
    const paths = [SHIM_PATH, ...names.map((name) => MIGRATIONS_DIR + name)];
    return Promise.all(paths.map((path) => readFile(path, 'utf8')));
  })();
  return sqlCache;
}

// La transaccion hace COMMIT si `fn` termina bien. Ante un error SQL hace ROLLBACK y relanza el
// error original (con su SQLSTATE en `.code`).
function inTransaction<T>(
  db: PGlite,
  setup: (tx: Transaction) => Promise<void>,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await setup(tx);
    return fn(tx);
  });
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.waitReady;
  for (const sql of await loadSqlFiles()) {
    await db.exec(sql);
  }

  return {
    asSuperuser: (fn) => inTransaction(db, async () => {}, fn),
    asUser: (userId, fn) =>
      inTransaction(
        db,
        async (tx) => {
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: userId, role: 'authenticated' }),
          ]);
          await tx.exec('set local role authenticated');
        },
        fn,
      ),
    asAnon: (fn) =>
      inTransaction(
        db,
        async (tx) => {
          await tx.exec('set local role anon');
        },
        fn,
      ),
    close: () => db.close(),
  };
}
