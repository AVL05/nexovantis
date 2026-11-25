import type { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

import { PATHS, fullDb, q, type Row } from './db';

// Soporte de las pruebas independientes del seed demo y su reconciliacion (TASK-010, A02-03).
// Propietario: Testing. Ejecuta los archivos REALES supabase/seeds/*.sql sobre las migraciones reales.

export const ID = {
  norte: '11111111-0000-4000-8000-000000000001',
  sur: '22222222-0000-4000-8000-000000000001',
  ownerNorte: '11111111-0000-4000-8000-0000000000a1',
  memberNorte: '11111111-0000-4000-8000-0000000000a2',
  ownerSur: '22222222-0000-4000-8000-0000000000b1',
};

/** Dos organizaciones demo, cada una con un owner (norte tambien con un member). */
export async function seededOrgsDb(): Promise<PGlite> {
  const db = await fullDb();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ID.ownerNorte}', 'owner.norte@example.com'), ('${ID.memberNorte}', 'member.norte@example.com'),
      ('${ID.ownerSur}', 'owner.sur@example.com');
    insert into public.organizations (id, name) values ('${ID.norte}', 'Demo Norte'), ('${ID.sur}', 'Demo Sur');
    insert into public.memberships (organization_id, user_id, role) values
      ('${ID.norte}', '${ID.ownerNorte}', 'owner'), ('${ID.norte}', '${ID.memberNorte}', 'member'),
      ('${ID.sur}', '${ID.ownerSur}', 'owner');`);
  return db;
}

let seedSql: Promise<string> | undefined;
let reconcileSql: Promise<string> | undefined;
export const readSeed = () => (seedSql ??= readFile(PATHS.seed, 'utf8'));
export const readReconcile = () => (reconcileSql ??= readFile(PATHS.reconcile, 'utf8'));

export async function runSeed(db: PGlite): Promise<void> {
  await db.exec(await readSeed());
}

/** Ejecuta la sentencia como el usuario (authenticated + claims) en una transaccion. */
export async function execAs(db: PGlite, user: string, sql: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: user, role: 'authenticated' }),
    ]);
    await tx.exec('set local role authenticated');
    await tx.exec(sql);
  });
}

/** Contenido completo y ordenado de clientes, tecnicos y eventos (sin ids de eventos no estables). */
export const snapshot = (db: PGlite): Promise<Row[]> =>
  q(
    db,
    `select 'c' as k, id::text, organization_id::text as org, name, email, phone, notes,
            archived_at::text, updated_at::text from public.customers
     union all
     select 't', id::text, organization_id::text, full_name, email, phone, notes,
            archived_at::text, updated_at::text from public.technicians
     union all
     select 'e', id::text, organization_id::text, entity_id::text, actor_id::text, action, null,
            occurred_at::text, null from public.activity_events
     order by 1, 2`,
  );

export const rowCount = async (db: PGlite) =>
  (
    await q(
      db,
      `select (select count(*)::int from public.customers) as c,
              (select count(*)::int from public.technicians) as t,
              (select count(*)::int from public.activity_events) as e`,
    )
  )[0];

/** Intenta ejecutar el seed; devuelve el error (y deja la base sin transaccion abierta) o null. */
export async function tryRunSeed(db: PGlite): Promise<unknown | null> {
  try {
    await runSeed(db);
    return null;
  } catch (error) {
    await db.exec('rollback').catch(() => undefined);
    return error;
  }
}
