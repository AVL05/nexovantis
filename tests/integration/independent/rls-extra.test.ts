// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { seedTwoOrgs } from '../../support/fixtures';
import { createTestDb, type TestDb } from '../../support/pglite';

// Casos adicionales de Testing (TASK-006 POST). Cubren huecos no incluidos en rls.test.ts:
// funciones de trigger no ejecutables, revocacion de acceso al borrar la membresia, oraculos de
// las funciones auxiliares, DDL denegado a roles de la app y privilegios por columna.
// Se ejecutan en PGlite (PostgreSQL real con shim de auth), no en Supabase.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

type Row = Record<string, unknown>;

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

const user = (id: string, sql: string, params: unknown[] = []) =>
  db.asUser(id, (tx) => tx.query<Row>(sql, params));
const anon = (sql: string, params: unknown[] = []) => db.asAnon((tx) => tx.query<Row>(sql, params));
const su = async (sql: string, params: unknown[] = []) =>
  (await db.asSuperuser((tx) => tx.query<Row>(sql, params))).rows;

describe('funciones de trigger y auxiliares', () => {
  it.each(['set_updated_at', 'prevent_organization_change', 'prevent_unarchive'])(
    'private.%s() no es ejecutable por authenticated ni anon (42501)',
    async (fn) => {
      expect(await code(() => user(s.ownerA, `select private.${fn}()`))).toBe('42501');
      expect(await code(() => anon(`select private.${fn}()`))).toBe('42501');
    },
  );

  it('is_org_member/has_org_role usan siempre auth.uid(): no sirven de oraculo sobre otros', async () => {
    const own = await user(s.memberA, 'select private.is_org_member($1) as v', [s.orgA]);
    const foreign = await user(s.memberA, 'select private.is_org_member($1) as v', [s.orgB]);
    const asOwner = await user(s.memberA, `select private.has_org_role($1, 'owner') as v`, [
      s.orgA,
    ]);
    const unknown = await user(
      s.memberA,
      `select private.is_org_member('00000000-0000-4000-8000-0000000000e1') as v`,
    );
    expect(own.rows[0].v).toBe(true);
    expect(foreign.rows[0].v).toBe(false);
    expect(asOwner.rows[0].v).toBe(false);
    expect(unknown.rows[0].v).toBe(false);
  });

  it('las funciones auxiliares sin sesion (auth.uid() nulo) devuelven false, no error', async () => {
    const res = await db.asUser('00000000-0000-4000-8000-0000000000f9', (tx) =>
      tx.query<Row>('select private.is_org_member($1) as v', [s.orgA]),
    );
    expect(res.rows[0].v).toBe(false);
  });
});

describe('DDL y esquema privado denegados a roles de la aplicacion', () => {
  it.each([
    'create table public.intruso (id int)',
    'create function public.intruso() returns int language sql as $$ select 1 $$',
    'create function private.intruso() returns int language sql as $$ select 1 $$',
    'create table private.intruso (id int)',
  ])('authenticated no puede ejecutar: %s', async (sql) => {
    expect(await code(() => user(s.ownerA, sql))).toBe('42501');
  });

  it('anon no crea objetos en public ni accede al esquema private', async () => {
    expect(await code(() => anon('create table public.intruso (id int)'))).toBe('42501');
    expect(await code(() => anon('select private.is_org_member(null)'))).toBe('42501');
  });
});

describe('privilegios por columna (columnas de sistema no escribibles)', () => {
  it('un usuario no actualiza updated_at ni created_at de organizations, customers ni technicians', async () => {
    for (const [table, id] of [
      ['organizations', s.orgA],
      ['customers', s.customerA],
      ['technicians', s.technicianA],
    ] as const) {
      for (const column of ['updated_at', 'created_at', 'id']) {
        const value = column === 'id' ? s.orgB : `now() - interval '1 year'`;
        const sql =
          column === 'id'
            ? `update public.${table} set id = $2 where id = $1`
            : `update public.${table} set ${column} = ${value} where id = $1`;
        const params = column === 'id' ? [id, s.orgB] : [id];
        expect(await code(() => user(s.ownerA, sql, params)), `${table}.${column}`).toBe('42501');
      }
    }
  });

  it('un usuario no inserta con id, created_at ni updated_at propios', async () => {
    for (const [table, nameColumn] of [
      ['customers', 'name'],
      ['technicians', 'full_name'],
    ] as const) {
      for (const column of ['id', 'created_at', 'updated_at']) {
        const value = column === 'id' ? `gen_random_uuid()` : 'now()';
        const sql = `insert into public.${table} (organization_id, ${nameColumn}, ${column}) values ($1, 'Intento', ${value})`;
        expect(await code(() => user(s.ownerA, sql, [s.orgA])), `${table}.${column}`).toBe('42501');
      }
    }
    const rows = await su(`select count(*)::int as n from public.customers where name = 'Intento'`);
    expect(rows[0].n).toBe(0);
  });

  it('INSERT ... ON CONFLICT DO UPDATE no sirve para tomar una fila ajena', async () => {
    const outcome = await code(() =>
      user(
        s.ownerA,
        `insert into public.customers (organization_id, name) values ($1, 'Pisado')
         on conflict (organization_id, id) do update set name = 'Pisado'`,
        [s.orgA],
      ),
    );
    // Sin conflicto posible (el id lo genera el servidor): inserta una fila propia o falla;
    // en ningun caso toca las filas de B.
    expect([undefined, '42501']).toContain(outcome);
    const rows = await su(`select name from public.customers where id = $1`, [s.customerB]);
    expect(rows[0].name).toBe('Cliente Ficticio Beta');
  });
});

describe('revocacion de acceso', () => {
  it('al borrar la membresia el usuario pierde lectura y escritura de inmediato', async () => {
    const before = await user(s.memberB, 'select id from public.customers');
    expect(before.rows).toHaveLength(1);

    await su('delete from public.memberships where user_id = $1', [s.memberB]);

    const customers = await user(s.memberB, 'select id from public.customers');
    const orgs = await user(s.memberB, 'select id from public.organizations');
    const memberships = await user(s.memberB, 'select user_id from public.memberships');
    expect(customers.rows).toEqual([]);
    expect(orgs.rows).toEqual([]);
    expect(memberships.rows).toEqual([]);
    expect(
      await code(() =>
        user(s.memberB, `insert into public.customers (organization_id, name) values ($1, 'X')`, [
          s.orgB,
        ]),
      ),
    ).toBe('42501');
    const upd = await user(
      s.memberB,
      `update public.customers set name = 'X' where id = $1 returning id`,
      [s.customerB],
    );
    expect(upd.rows).toEqual([]);
    const intact = await su('select name from public.customers where id = $1', [s.customerB]);
    expect(intact[0].name).toBe('Cliente Ficticio Beta');
  });
});
