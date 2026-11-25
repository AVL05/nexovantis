// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { seedTwoOrgs } from '../../support/fixtures';
import { createTestDb, type TestDb } from '../../support/pglite';

// Prueba independiente de Testing (TASK-010 PRE, A02-06). Develop no la modifica.
// PGlite (PostgreSQL real, shim de Auth). La elusion por PostgREST se comprueba en
// tests/integration/supabase/independent/archived-readonly.supabase.test.ts (CI).
//
// Decision humana ratificada (2026-11-24, BUSINESS_RULES.md): los clientes y tecnicos ARCHIVADOS son
// de SOLO LECTURA hasta su restauracion. Se restaura primero y despues se edita; no se puede
// combinar restauracion y edicion en una misma operacion. Esta regla SUSTITUYE a los criterios
// anteriores que permitian editar registros archivados (cambios registrados en TASK-010-PRE.md).
//
// Contrato (trigger de PostgreSQL, sin excepcion por rol: tambien el superusuario):
//   - UPDATE de cualquier columna editable (name/full_name, email, phone, notes) sobre una fila que
//     YA esta archivada (OLD.archived_at no nulo) -> SQLSTATE 23000. Sin cambios ni eventos.
//   - UPDATE que restaura (archived_at -> NULL) y ademas CAMBIA otra columna editable -> 23000;
//     la fila sigue archivada y no se crea evento 'restored' (atomico).
//   - Restaurar sin cambiar otras columnas sigue permitido (con o sin reasignar los mismos valores).
//   - Archivar una fila ACTIVA junto con otros cambios sigue permitido (C-05, la fila era editable).
//   - Las filas activas se editan igual que antes.
// El resto de reglas (archived_at no se reescribe, actor obligatorio, eventos inmutables) no cambia.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

type Row = Record<string, unknown>;
type Table = 'customers' | 'technicians';

const KINDS: { table: Table; nameCol: string }[] = [
  { table: 'customers', nameCol: 'name' },
  { table: 'technicians', nameCol: 'full_name' },
];

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
const suWithSub = (sub: string, sql: string, params: unknown[] = []) =>
  db.asSuperuser(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: 'service_role' }),
    ]);
    return tx.query<Row>(sql, params);
  });

const COLUMNS = (nameCol: string) =>
  [
    [nameCol, 'Nombre editado'],
    ['email', 'editado@example.test'],
    ['phone', '+34 000 000 000'],
    ['notes', 'nota editada'],
  ] as const;

/** Crea una fila nueva en la organizacion A y la deja archivada (por el propietario). */
async function archivedRow(table: Table, nameCol: string): Promise<string> {
  const row = await su(
    `insert into public.${table} (organization_id, ${nameCol}, email, phone, notes)
     values ($1, 'Original', 'original@example.test', '+34 000 111 111', 'nota original') returning id`,
    [s.orgA],
  );
  const id = row[0].id as string;
  await asUser(s.ownerA, `update public.${table} set archived_at = now() where id = $1`, [id]);
  return id;
}

const stateOf = (table: Table, id: string) =>
  su(`select * from public.${table} where id = $1`, [id]).then((r) => r[0]);
const eventsOf = (id: string) =>
  su(
    `select action from public.activity_events where entity_id = $1 order by occurred_at, action`,
    [id],
  ).then((r) => r.map((e) => e.action));

describe.each(KINDS)('A02-06 un archivado es de solo lectura en $table', ({ table, nameCol }) => {
  it.each(['ownerA', 'memberA'] as const)(
    'N: %s no puede editar ningun campo de un registro archivado (23000, sin cambios ni eventos)',
    async (actor) => {
      const id = await archivedRow(table, nameCol);
      const before = await stateOf(table, id);
      const eventsBefore = await eventsOf(id);
      for (const [col, value] of COLUMNS(nameCol)) {
        expect(
          await code(() =>
            asUser(s[actor], `update public.${table} set ${col} = $2 where id = $1`, [id, value]),
          ),
          `${actor} ${col}`,
        ).toBe('23000');
      }
      // Varias columnas a la vez y con el mismo archived_at reasignado.
      expect(
        await code(() =>
          asUser(
            s[actor],
            `update public.${table} set ${nameCol} = 'X', notes = 'Y', archived_at = archived_at where id = $1`,
            [id],
          ),
        ),
      ).toBe('23000');
      expect(await stateOf(table, id)).toEqual(before);
      expect(await eventsOf(id)).toEqual(eventsBefore);
    },
  );

  it('N: restaurar y editar en la MISMA operacion se rechaza (23000), sigue archivado y sin evento restored', async () => {
    for (const [col, value] of COLUMNS(nameCol)) {
      const id = await archivedRow(table, nameCol);
      const before = await stateOf(table, id);
      const eventsBefore = await eventsOf(id);
      for (const actor of ['ownerA', 'memberA'] as const) {
        expect(
          await code(() =>
            asUser(
              s[actor],
              `update public.${table} set archived_at = null, ${col} = $2 where id = $1`,
              [id, value],
            ),
          ),
          `${actor} restaurar+${col}`,
        ).toBe('23000');
      }
      const after = await stateOf(table, id);
      expect(after.archived_at).not.toBeNull();
      expect(after).toEqual(before);
      expect(await eventsOf(id)).toEqual(eventsBefore);
      expect(eventsBefore).not.toContain('restored');
    }
  });

  it('N: restaurar + editar varias columnas y en una sentencia multifila no restaura a ninguna fila (atomico)', async () => {
    const a = await archivedRow(table, nameCol);
    const b = await archivedRow(table, nameCol);
    expect(
      await code(() =>
        asUser(
          s.ownerA,
          `update public.${table} set archived_at = null, notes = 'x' where id = any($1::uuid[])`,
          [[a, b]],
        ),
      ),
    ).toBe('23000');
    for (const id of [a, b]) {
      expect((await stateOf(table, id)).archived_at).not.toBeNull();
      expect(await eventsOf(id)).toEqual(['archived']);
    }
  });

  it('N: una sentencia que mezcla filas activas y archivadas falla entera: ninguna fila cambia', async () => {
    const archived = await archivedRow(table, nameCol);
    const active = (
      await su(
        `insert into public.${table} (organization_id, ${nameCol}, notes) values ($1, 'Activo mixto', 'n0') returning id`,
        [s.orgA],
      )
    )[0].id as string;
    expect(
      await code(() =>
        asUser(s.ownerA, `update public.${table} set notes = 'masivo' where id = any($1::uuid[])`, [
          [archived, active],
        ]),
      ),
    ).toBe('23000');
    expect((await stateOf(table, active)).notes).toBe('n0');
    expect((await stateOf(table, archived)).notes).toBe('nota original');
  });

  it('N: la regla no depende del rol: el superusuario (con o sin sub) tampoco edita un archivado', async () => {
    const id = await archivedRow(table, nameCol);
    const before = await stateOf(table, id);
    expect(
      await code(() => su(`update public.${table} set notes = 'admin' where id = $1`, [id])),
    ).toBe('23000');
    expect(
      await code(() =>
        suWithSub(s.ownerA, `update public.${table} set notes = 'svc' where id = $1`, [id]),
      ),
    ).toBe('23000');
    expect(await stateOf(table, id)).toEqual(before);
  });

  it('N: un usuario de otra organizacion no ve ni edita el archivado (0 filas) y nada cambia', async () => {
    const id = await archivedRow(table, nameCol);
    const before = await stateOf(table, id);
    const res = await asUser(
      s.ownerB,
      `update public.${table} set notes = 'ajeno' where id = $1 returning id`,
      [id],
    );
    expect(res.rows).toEqual([]);
    expect(await stateOf(table, id)).toEqual(before);
  });

  it.each(['ownerA', 'memberA'] as const)(
    'P: %s restaura (solo archived_at) y despues puede editar; los eventos son archived y restored',
    async (actor) => {
      const id = await archivedRow(table, nameCol);
      const restore = await asUser(
        s[actor],
        `update public.${table} set archived_at = null where id = $1 returning id`,
        [id],
      );
      expect(restore.rows).toHaveLength(1);
      expect((await stateOf(table, id)).archived_at).toBeNull();
      for (const [col, value] of COLUMNS(nameCol)) {
        const edit = await asUser(
          s[actor],
          `update public.${table} set ${col} = $2 where id = $1 returning ${col} as v`,
          [id, value],
        );
        expect(edit.rows[0].v).toBe(value);
      }
      expect(await eventsOf(id)).toEqual(['archived', 'restored']);
    },
  );

  it('P: restaurar reasignando los MISMOS valores a otras columnas no cuenta como edicion', async () => {
    const id = await archivedRow(table, nameCol);
    const res = await asUser(
      s.memberA,
      `update public.${table} set archived_at = null, ${nameCol} = ${nameCol}, notes = notes, email = email
       where id = $1 returning id`,
      [id],
    );
    expect(res.rows).toHaveLength(1);
    expect((await stateOf(table, id)).archived_at).toBeNull();
    expect(await eventsOf(id)).toEqual(['archived', 'restored']);
  });

  it('P: las filas activas se editan como antes y archivar junto con otros campos sigue permitido', async () => {
    const id = (
      await su(
        `insert into public.${table} (organization_id, ${nameCol}) values ($1, 'Activo') returning id`,
        [s.orgA],
      )
    )[0].id as string;
    for (const actor of ['ownerA', 'memberA'] as const) {
      for (const [col, value] of COLUMNS(nameCol)) {
        const r = await asUser(
          s[actor],
          `update public.${table} set ${col} = $2 where id = $1 returning id`,
          [id, value],
        );
        expect(r.rows, `${actor} ${col}`).toHaveLength(1);
      }
    }
    const both = await asUser(
      s.ownerA,
      `update public.${table} set archived_at = now(), notes = 'archivado con nota' where id = $1 returning notes`,
      [id],
    );
    expect(both.rows[0].notes).toBe('archivado con nota');
    expect((await stateOf(table, id)).archived_at).not.toBeNull();
    expect(await eventsOf(id)).toEqual(['archived']);
  });
});

describe('A02-06 no regresion de la proteccion de archived_at', () => {
  it('reescribir la fecha de un archivado sigue dando 23000 y el actor sigue siendo obligatorio', async () => {
    const id = await archivedRow('customers', 'name');
    expect(
      await code(() =>
        asUser(
          s.ownerA,
          `update public.customers set archived_at = archived_at + interval '1 day' where id = $1`,
          [id],
        ),
      ),
    ).toBe('23000');
    expect(
      await code(() => su(`update public.customers set archived_at = null where id = $1`, [id])),
    ).toBe('23000');
    expect((await stateOf('customers', id)).archived_at).not.toBeNull();
  });
});
