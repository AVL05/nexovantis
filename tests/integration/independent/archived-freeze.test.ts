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

describe.each(cases)('POST-05: archived_at congelado en $table', ({ table, id }) => {
  const FIXED = '2026-01-01T00:00:00Z';

  it('archivar (nulo a fecha) sigue permitido para member', async () => {
    const res = await asUser(
      s.memberA,
      `update public.${table} set archived_at = $2 where id = $1 returning id`,
      [id(), FIXED],
    );
    expect(res.rows).toHaveLength(1);
    expect((await archivedAt(table, id()))?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('reescribir con otra fecha (pasada, actual, futura) o con nulo falla con 23000 para member, owner y superusuario', async () => {
    const values = ['now()', `now() + interval '1 year'`, `'1999-01-01T00:00:00Z'`, 'null'];
    for (const value of values) {
      for (const actor of [s.memberA, s.ownerA, 'su'] as const) {
        const sql = `update public.${table} set archived_at = ${value} where id = $1`;
        const run = actor === 'su' ? () => su(sql, [id()]) : () => asUser(actor, sql, [id()]);
        expect(await code(run), `${table} ${actor} -> ${value}`).toBe('23000');
      }
    }
    expect((await archivedAt(table, id()))?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('actualizar con el mismo archived_at y editar otros campos sigue permitido', async () => {
    const same = await asUser(
      s.ownerA,
      `update public.${table} set archived_at = $2 where id = $1 returning id`,
      [id(), FIXED],
    );
    expect(same.rows).toHaveLength(1);
    const other = await su(
      `update public.${table} set notes = 'editada' where id = $1 returning notes`,
      [id()],
    );
    expect(other[0].notes).toBe('editada');
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

describe('POST-05: la funcion sigue sin ser ejecutable', () => {
  it('private.prevent_unarchive() no es ejecutable por authenticated (42501)', async () => {
    expect(await code(() => asUser(s.ownerA, 'select private.prevent_unarchive()'))).toBe('42501');
  });
});
