// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { q } from './support/db';
import {
  ID,
  execAs,
  readSeed,
  rowCount,
  runSeed,
  seededOrgsDb,
  snapshot,
  tryRunSeed,
} from './support/seed-db';

// Prueba independiente de Testing (TASK-010 PRE, A02-03). Develop no la modifica.
// Ejecuta el archivo REAL supabase/seeds/demo-crm.sql en PGlite sobre las migraciones reales.
// Complementa (sin repetir) a tests/integration/seed-demo.test.ts (propiedad de Develop).
//
// Defecto (AUDIT-002): el seed identifica cada fixture por organizacion + nombre exacto; un usuario
// que renombra un registro demo provoca un duplicado en la siguiente ejecucion.
//
// Criterio: la identidad de un fixture NO depende de ningun campo editable (nombre, email,
// telefono, notas) ni del estado de archivado. Tras renombrar, restaurar, modificar o re-archivar,
// ejecutar de nuevo el seed no inserta, no actualiza, no archiva, no restaura ni genera eventos.
// La implementacion (tabla de correspondencia en el esquema private, columna sin privilegios, ...) es
// libre; estas pruebas solo observan el comportamiento y, de forma generica, que la identidad no
// quede expuesta a escritura por usuarios.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

let db: PGlite;

beforeEach(async () => {
  db = await seededOrgsDb();
});
afterEach(async () => {
  await db.close();
});

const byName = async (table: 'customers' | 'technicians', name: string) =>
  q(
    db,
    `select id::text from public.${table} where ${table === 'customers' ? 'name' : 'full_name'} = $1`,
    [name],
  );

describe('A02-03 identidad estable de los fixtures (comportamiento)', () => {
  it('renombrar un cliente y un tecnico demo y re-ejecutar no crea duplicados ni cambia nada', async () => {
    await runSeed(db);
    await execAs(
      db,
      ID.ownerNorte,
      `update public.customers set name = 'Hotel Brisamar (renombrado)' where name = 'Hotel Brisamar';
       update public.technicians set full_name = 'Marta Soler (renombrada)' where full_name = 'Marta Soler Vidal'`,
    );
    const before = await snapshot(db);
    await runSeed(db);
    expect(await snapshot(db)).toEqual(before);
    expect(await byName('customers', 'Hotel Brisamar')).toEqual([]);
    expect(await byName('technicians', 'Marta Soler Vidal')).toEqual([]);
  });

  it('restaurar y renombrar un designado archivado: no se vuelve a archivar ni a insertar', async () => {
    await runSeed(db);
    await execAs(
      db,
      ID.memberNorte,
      `update public.customers set archived_at = null where name = 'Hotel Rincón del Valle';
       update public.technicians set archived_at = null where full_name = 'Ignacio Paredes Gil'`,
    );
    await execAs(
      db,
      ID.ownerNorte,
      `update public.customers set name = 'Hotel del Valle' where name = 'Hotel Rincón del Valle';
       update public.technicians set full_name = 'Ignacio P. Gil' where full_name = 'Ignacio Paredes Gil'`,
    );
    const before = await snapshot(db);
    await runSeed(db);
    expect(await snapshot(db)).toEqual(before);
    const stillActive = await q(
      db,
      `select (select count(*)::int from public.customers where name = 'Hotel del Valle' and archived_at is null) as c,
              (select count(*)::int from public.technicians where full_name = 'Ignacio P. Gil' and archived_at is null) as t`,
    );
    expect(stillActive[0]).toEqual({ c: 1, t: 1 });
  });

  it('restaurar, renombrar y volver a archivar: sigue archivado con el nombre nuevo y sin duplicado', async () => {
    await runSeed(db);
    await execAs(
      db,
      ID.memberNorte,
      `update public.customers set archived_at = null where name = 'Metálicas Granito'`,
    );
    await execAs(
      db,
      ID.ownerNorte,
      `update public.customers set name = 'Metálicas Granito 2' where name = 'Metálicas Granito'`,
    );
    await execAs(
      db,
      ID.ownerNorte,
      `update public.customers set archived_at = now() where name = 'Metálicas Granito 2'`,
    );
    const before = await snapshot(db);
    await runSeed(db);
    expect(await snapshot(db)).toEqual(before);
    expect(await byName('customers', 'Metálicas Granito')).toEqual([]);
  });

  it('modificar TODOS los campos editables de TODOS los fixtures (nombre, email, telefono, notas) no provoca altas ni cambios', async () => {
    await runSeed(db);
    for (const [owner, org] of [
      [ID.ownerNorte, ID.norte],
      [ID.ownerSur, ID.sur],
    ] as const) {
      await execAs(
        db,
        owner,
        `update public.customers set archived_at = null where organization_id = '${org}' and archived_at is not null;
         update public.technicians set archived_at = null where organization_id = '${org}' and archived_at is not null`,
      );
      await execAs(
        db,
        owner,
        `update public.customers set name = 'Cliente editado ' || id, email = 'ed-' || id || '@example.test',
           phone = '+34 000 999 999', notes = 'editado' where organization_id = '${org}';
         update public.technicians set full_name = 'Tecnico editado ' || id, email = 'ed-' || id || '@example.test',
           phone = '+34 000 999 998', notes = 'editado' where organization_id = '${org}'`,
      );
    }
    const counts = await rowCount(db);
    const before = await snapshot(db);
    await runSeed(db);
    expect(await rowCount(db)).toEqual(counts);
    expect(await snapshot(db)).toEqual(before);
  });

  it('un registro del usuario con el nombre de un fixture, anterior al primer seed, no se toca ni se archiva', async () => {
    await execAs(
      db,
      ID.ownerNorte,
      `insert into public.customers (organization_id, name, notes) values
         ('${ID.norte}', 'Hotel Brisamar', 'del usuario'),
         ('${ID.norte}', 'Metálicas Granito', 'del usuario');
       insert into public.technicians (organization_id, full_name, notes) values
         ('${ID.norte}', 'Carmen Bosch Vera', 'del usuario')`,
    );
    const mine = await q(
      db,
      `select 'c' as k, id::text, name, email, phone, notes, archived_at::text, updated_at::text
         from public.customers where notes = 'del usuario'
       union all
       select 't', id::text, full_name, email, phone, notes, archived_at::text, updated_at::text
         from public.technicians where notes = 'del usuario' order by 1, 2`,
    );
    expect(mine).toHaveLength(3);
    const ids = mine.map((r) => r.id as string);

    // El seed puede insertar el fixture como fila nueva o negarse a ejecutarse (identidad ambigua):
    // ambas opciones respetan el registro del usuario. Lo que no puede es modificarlo.
    const error = await tryRunSeed(db);
    const after = await q(
      db,
      `select 'c' as k, id::text, name, email, phone, notes, archived_at::text, updated_at::text
         from public.customers where notes = 'del usuario'
       union all
       select 't', id::text, full_name, email, phone, notes, archived_at::text, updated_at::text
         from public.technicians where notes = 'del usuario' order by 1, 2`,
    );
    expect(after).toEqual(mine);
    const events = await q(
      db,
      `select count(*)::int as n from public.activity_events where entity_id = any($1::uuid[])`,
      [ids],
    );
    expect(events[0].n).toBe(0);
    if (error === null) {
      // Si se ejecuto, una segunda ejecucion sigue siendo idempotente.
      const first = await snapshot(db);
      await runSeed(db);
      expect(await snapshot(db)).toEqual(first);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('A02-03 la identidad de los fixtures no queda expuesta a escritura por usuarios', () => {
  it('ninguna tabla de identidad/fixtures es accesible para anon ni authenticated', async () => {
    const rels = await q(
      db,
      `select n.nspname || '.' || c.relname as rel, c.oid::int as oid
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm', 'f')
          and c.relname ~* '(fixture|seed|demo)'`,
    );
    for (const { rel, oid } of rels) {
      for (const role of ['anon', 'authenticated']) {
        for (const priv of ['select', 'insert', 'update', 'delete', 'truncate', 'references']) {
          const r = await q(db, `select has_table_privilege($1, $2::oid, $3) as v`, [
            role,
            oid,
            priv,
          ]);
          expect(r[0].v, `${role} ${priv} sobre ${rel as string}`).toBe(false);
        }
      }
    }
  });

  it('ninguna columna de identidad en customers/technicians es escribible por anon ni authenticated', async () => {
    const cols = await q(
      db,
      `select a.attrelid::regclass::text as rel, a.attname
         from pg_attribute a
        where a.attrelid in ('public.customers'::regclass, 'public.technicians'::regclass)
          and a.attnum > 0 and not a.attisdropped and a.attname ~* '(fixture|seed|demo)'`,
    );
    for (const { rel, attname } of cols) {
      for (const role of ['anon', 'authenticated']) {
        for (const priv of ['insert', 'update']) {
          const r = await q(db, `select has_column_privilege($1, $2, $3, $4) as v`, [
            role,
            rel,
            attname,
            priv,
          ]);
          expect(r[0].v, `${role} ${priv} ${rel as string}.${attname as string}`).toBe(false);
        }
      }
    }
  });

  it('un usuario no puede crear ni usar funciones o tablas de identidad en public (sin RPC de fixtures)', async () => {
    const fns = await q(
      db,
      `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname ~* '(fixture|seed|demo)'`,
    );
    expect(fns).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('A02-03 estatico: transaccion unica y proteccion frente a ejecuciones concurrentes', () => {
  const strip = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

  it('el seed es una unica transaccion explicita', async () => {
    const code = strip(await readSeed());
    expect(code).toMatch(/^\s*begin\s*;/im);
    expect(code).toMatch(/\bcommit\s*;\s*$/im);
    expect((code.match(/\bcommit\s*;/gi) ?? []).length).toBe(1);
  });

  it('serializa las ejecuciones concurrentes con un bloqueo de TRANSACCION (advisory xact lock o LOCK TABLE)', async () => {
    // Validacion estatica: PGlite es monousuario, no permite probar la concurrencia real. Se
    // exige un bloqueo que se libere con la transaccion; uno de sesion (pg_advisory_lock) puede
    // quedar retenido tras un fallo.
    const code = strip(await readSeed());
    expect(code).toMatch(/pg_(try_)?advisory_xact_lock\s*\(|\block\s+table\b/i);
    expect(code).not.toMatch(/pg_(try_)?advisory_lock\s*\(/i);
    // El bloqueo se toma antes de resolver organizaciones o insertar.
    const lock = code.search(/pg_(try_)?advisory_xact_lock\s*\(|\block\s+table\b/i);
    const firstWrite = code.search(/\binsert\s+into\b/i);
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(firstWrite);
  });

  it('no usa DELETE, TRUNCATE, DROP ni desactiva triggers (no destructivo)', async () => {
    const code = strip(await readSeed());
    expect(code).not.toMatch(
      /\b(delete\s+from|truncate|drop\s+(table|trigger|schema|function)|disable\s+trigger|session_replication_role)\b/i,
    );
    expect(code).not.toMatch(/service_role/i);
  });
});
