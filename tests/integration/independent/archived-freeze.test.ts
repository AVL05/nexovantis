// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { seedTwoOrgs } from '../../support/fixtures';
import { createTestDb, type TestDb } from '../../support/pglite';

// Caso independiente de Testing (TASK-006 RETEST, POST-05): un registro archivado conserva su
// archived_at. Se ejecuta en PGlite (PostgreSQL real con shim de auth), no en Supabase.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

type Row = Record<string, unknown>;
type Table = 'customers' | 'technicians';

let db: TestDb;
let s: Awaited<ReturnType<typeof seedTwoOrgs>>;

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
});

afterAll(async () => {
  await db.close();
});

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
const asUser = (id: string, sql: string, params: unknown[] = []) =>
  db.asUser(id, (tx) => tx.query<Row>(sql, params));
const archivedAt = async (table: Table, id: string) =>
  (await su(`select archived_at from public.${table} where id = $1`, [id]))[0]
    ?.archived_at as Date | null;

const cases: { table: Table; id: () => string }[] = [
  { table: 'customers', id: () => s.customerA },
  { table: 'technicians', id: () => s.technicianA },
];

describe.each(cases)('POST-05 / DH-06: archived_at en $table', ({ table, id }) => {
  const FIXED = '2026-01-01T00:00:00Z';

  it('archivar (nulo a fecha) sigue permitido para member; la fecha la fija el servidor, no el cliente', async () => {
    // TASK-008B: antes se conservaba la fecha enviada (FIXED); ahora el servidor la sustituye por now().
    const res = await asUser(
      s.memberA,
      `update public.${table} set archived_at = $2 where id = $1
       returning archived_at = now() as forced`,
      [id(), FIXED],
    );
    expect(res.rows).toEqual([{ forced: true }]);
    const stored = await archivedAt(table, id());
    expect(stored?.toISOString()).not.toBe('2026-01-01T00:00:00.000Z');
    expect(Math.abs(Date.now() - (stored as Date).getTime())).toBeLessThan(5 * 60_000);
  });

  it('reescribir con otra fecha (pasada, actual, futura) falla con 23000 para member, owner y superusuario', async () => {
    // TASK-008B: se retira el valor "null" de esta lista: restaurar ya esta permitido (DH-06) y se
    // prueba en el siguiente caso. Las fechas distintas siguen rechazadas.
    const before = await archivedAt(table, id());
    const values = ['now()', `now() + interval '1 year'`, `'1999-01-01T00:00:00Z'`];
    for (const value of values) {
      for (const actor of [s.memberA, s.ownerA, 'su'] as const) {
        const sql = `update public.${table} set archived_at = ${value} where id = $1`;
        const run = actor === 'su' ? () => su(sql, [id()]) : () => asUser(actor, sql, [id()]);
        expect(await code(run), `${table} ${actor} -> ${value}`).toBe('23000');
      }
    }
    expect(await archivedAt(table, id())).toEqual(before);
  });

  it('actualizar con el mismo archived_at y editar otros campos sigue permitido', async () => {
    const same = await asUser(
      s.ownerA,
      `update public.${table} set archived_at = archived_at where id = $1 returning id`,
      [id()],
    );
    expect(same.rows).toHaveLength(1);
    const other = await su(
      `update public.${table} set notes = 'editada' where id = $1 returning notes`,
      [id()],
    );
    expect(other[0].notes).toBe('editada');
  });

  it('restaurar (fecha a nulo) esta permitido para owner y member y deja la fila activa (DH-06)', async () => {
    // TASK-008B: antes "null" se rechazaba con 23000 para todos, incluido el superusuario.
    expect(await archivedAt(table, id())).toBeInstanceOf(Date);
    const res = await asUser(
      s.ownerA,
      `update public.${table} set archived_at = null where id = $1 returning id`,
      [id()],
    );
    expect(res.rows).toHaveLength(1);
    expect(await archivedAt(table, id())).toBeNull();
    // Se puede volver a archivar y el miembro tambien puede restaurar.
    await asUser(s.ownerA, `update public.${table} set archived_at = now() where id = $1`, [id()]);
    const again = await asUser(
      s.memberA,
      `update public.${table} set archived_at = null where id = $1 returning id`,
      [id()],
    );
    expect(again.rows).toHaveLength(1);
    expect(await archivedAt(table, id())).toBeNull();
  });

  it('el superusuario sin actor (sin auth.uid()) no restaura ni archiva (23000)', async () => {
    await asUser(s.ownerA, `update public.${table} set archived_at = now() where id = $1`, [id()]);
    expect(
      await code(() => su(`update public.${table} set archived_at = null where id = $1`, [id()])),
    ).toBe('23000');
    expect(await archivedAt(table, id())).toBeInstanceOf(Date);
    await asUser(s.ownerA, `update public.${table} set archived_at = null where id = $1`, [id()]);
    expect(
      await code(() => su(`update public.${table} set archived_at = now() where id = $1`, [id()])),
    ).toBe('23000');
    expect(await archivedAt(table, id())).toBeNull();
  });

  it('una fila no archivada de la otra organizacion no se ve afectada por el trigger', async () => {
    const other = table === 'customers' ? s.customerB : s.technicianB;
    expect(await archivedAt(table, other)).toBeNull();
    const res = await asUser(
      s.ownerB,
      `update public.${table} set notes = 'ok' where id = $1 returning id`,
      [other],
    );
    expect(res.rows).toHaveLength(1);
    expect(await archivedAt(table, other)).toBeNull();
  });
});

describe('POST-05: las funciones de trigger de archived_at siguen sin ser ejecutables', () => {
  it('ninguna funcion de trigger de customers/technicians es ejecutable por authenticated ni anon (42501)', async () => {
    // TASK-008B: antes se nombraba private.prevent_unarchive(); se generaliza por si la
    // funcion cambia de nombre al implementar DH-06.
    const fns = await su(
      `select distinct t.tgfoid::regprocedure::text as sig from pg_trigger t
       where t.tgrelid in ('public.customers'::regclass, 'public.technicians'::regclass)
         and not t.tgisinternal`,
    );
    expect(fns.length).toBeGreaterThanOrEqual(3);
    for (const { sig } of fns) {
      expect(await code(() => asUser(s.ownerA, `select ${sig as string}`)), sig as string).toBe(
        '42501',
      );
    }
  });
});
