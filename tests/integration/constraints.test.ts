// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedTwoOrgs } from '../support/fixtures';
import { createTestDb, type TestDb } from '../support/pglite';

// Pruebas propias de Develop (TASK-006) sobre restricciones y triggers en PGlite.
// No sustituyen a tests/integration/independent/rls.test.ts (Testing).

let db: TestDb;
let s: Awaited<ReturnType<typeof seedTwoOrgs>>;

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
});

afterAll(async () => {
  await db.close();
});

async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

const su = (sql: string, params: unknown[] = []) =>
  db.asSuperuser((tx) => tx.query<Record<string, unknown>>(sql, params));

describe('restricciones de datos', () => {
  it.each([
    ['customers', 'name'],
    ['technicians', 'full_name'],
  ])('%s.%s rechaza nombres en blanco o de mas de 200 caracteres', async (table, column) => {
    for (const value of ['', '   ', 'x'.repeat(201)]) {
      const code = await sqlState(() =>
        su(`insert into public.${table} (organization_id, ${column}) values ($1, $2)`, [
          s.orgA,
          value,
        ]),
      );
      expect(code, JSON.stringify(value.slice(0, 5))).toBe('23514');
    }
  });

  it.each([
    ['email', 255],
    ['phone', 41],
    ['notes', 2001],
  ])('customers.%s rechaza longitudes excesivas', async (column, length) => {
    const code = await sqlState(() =>
      su(
        `insert into public.customers (organization_id, name, ${column}) values ($1, 'Largo', $2)`,
        [s.orgA, 'x'.repeat(length)],
      ),
    );
    expect(code).toBe('23514');
  });

  it('los campos de contacto son opcionales', async () => {
    const res = await su(
      `insert into public.technicians (organization_id, full_name) values ($1, 'Sin contacto')
       returning email, phone, notes, archived_at`,
      [s.orgA],
    );
    expect(res.rows[0]).toEqual({ email: null, phone: null, notes: null, archived_at: null });
  });

  it('borrar un usuario de auth elimina su membresia (cascade)', async () => {
    await su(`insert into auth.users (id, email) values ($1, 'temporal@example.test')`, [
      '00000000-0000-4000-8000-0000000000a9',
    ]);
    await su(
      `insert into public.memberships (organization_id, user_id, role) values ($1, $2, 'member')`,
      [s.orgA, '00000000-0000-4000-8000-0000000000a9'],
    );
    await su('delete from auth.users where id = $1', ['00000000-0000-4000-8000-0000000000a9']);
    const left = await su('select 1 from public.memberships where user_id = $1', [
      '00000000-0000-4000-8000-0000000000a9',
    ]);
    expect(left.rows).toHaveLength(0);
  });

  it('no se borra una organizacion con datos asociados (sin cascade)', async () => {
    const code = await sqlState(() =>
      su('delete from public.organizations where id = $1', [s.orgA]),
    );
    expect(code).toBe('23503');
  });
});

describe('triggers', () => {
  it('updated_at lo fija el servidor aunque el cliente intente enviarlo', async () => {
    const res = await db.asUser(s.ownerA, (tx) =>
      tx.query<{ updated_at: Date; created_at: Date }>(
        `update public.customers set notes = 'nota'
         where id = $1 returning created_at, updated_at`,
        [s.customerA],
      ),
    );
    expect(res.rows[0].updated_at.getTime()).toBeGreaterThanOrEqual(
      res.rows[0].created_at.getTime(),
    );
    // Un cliente no puede escribir updated_at (sin privilegio de columna).
    const code = await sqlState(() =>
      db.asUser(s.ownerA, (tx) =>
        tx.query(`update public.customers set updated_at = '2000-01-01' where id = $1`, [
          s.customerA,
        ]),
      ),
    );
    expect(code).toBe('42501');
  });

  it('restaurar sin actor (privilegios de administracion sin JWT) falla y conserva el archivado (DH-06)', async () => {
    await db.asUser(s.ownerB, (tx) =>
      tx.query('update public.customers set archived_at = now() where id = $1', [s.customerB]),
    );
    const code = await sqlState(() =>
      su('update public.customers set archived_at = null where id = $1', [s.customerB]),
    );
    expect(code).toBe('23000');
    const row = await su('select archived_at from public.customers where id = $1', [s.customerB]);
    expect(row.rows[0].archived_at).toBeInstanceOf(Date);
  });

  it('un registro archivado conserva su archived_at: no se reescribe (POST-05)', async () => {
    await db.asUser(s.ownerB, (tx) =>
      tx.query(`update public.technicians set archived_at = now() where id = $1`, [s.technicianB]),
    );
    const before = await su('select archived_at from public.technicians where id = $1', [
      s.technicianB,
    ]);
    const archivedAt = (before.rows[0].archived_at as Date).toISOString();
    const attempts = [
      () =>
        db.asUser(s.memberB, (tx) =>
          tx.query(`update public.technicians set archived_at = now() where id = $1`, [
            s.technicianB,
          ]),
        ),
      () =>
        db.asUser(s.ownerB, (tx) =>
          tx.query(
            `update public.technicians set archived_at = '2026-01-01T00:00:00Z' where id = $1`,
            [s.technicianB],
          ),
        ),
      () => su(`update public.technicians set archived_at = now() where id = $1`, [s.technicianB]),
      () => su(`update public.technicians set archived_at = null where id = $1`, [s.technicianB]),
    ];
    for (const attempt of attempts) {
      expect(await sqlState(attempt)).toBe('23000');
    }
    const row = await su('select archived_at from public.technicians where id = $1', [
      s.technicianB,
    ]);
    expect((row.rows[0].archived_at as Date).toISOString()).toBe(archivedAt);
    // Un archivado es de solo lectura (A02-06): ninguna edicion, ni siquiera con el mismo archived_at.
    const edit = await sqlState(() =>
      db.asUser(s.memberB, (tx) =>
        tx.query(`update public.technicians set notes = 'nota' where id = $1`, [s.technicianB]),
      ),
    );
    expect(edit).toBe('23000');
  });

  it('un usuario no escribe id, organization_id ni created_at por columna', async () => {
    for (const column of ['id', 'organization_id', 'created_at']) {
      const value = column === 'created_at' ? `'2000-01-01'` : `'${s.orgA}'`;
      const code = await sqlState(() =>
        db.asUser(s.ownerA, (tx) =>
          tx.query(`update public.technicians set ${column} = ${value} where id = $1`, [
            s.technicianA,
          ]),
        ),
      );
      expect(code, column).toBe('42501');
    }
  });

  it('un usuario no inserta archived_at ni id propios', async () => {
    const code = await sqlState(() =>
      db.asUser(s.ownerA, (tx) =>
        tx.query(
          `insert into public.customers (organization_id, name, archived_at) values ($1, 'X', now())`,
          [s.orgA],
        ),
      ),
    );
    expect(code).toBe('42501');
  });
});

describe('transacciones de la base de pruebas', () => {
  it('un error hace rollback y relanza el error original con su SQLSTATE', async () => {
    const code = await sqlState(() =>
      db.asSuperuser(async (tx) => {
        await tx.query(`insert into public.organizations (name) values ('Debe revertirse')`);
        await tx.query(`insert into public.organizations (name) values ('')`);
      }),
    );
    expect(code).toBe('23514');
    const res = await su(`select 1 from public.organizations where name = 'Debe revertirse'`);
    expect(res.rows).toHaveLength(0);
  });

  it('asUser devuelve el valor de fn y no deja el rol cambiado', async () => {
    const value = await db.asUser(s.ownerA, async (tx) => {
      const res = await tx.query<{ n: number }>('select count(*)::int as n from public.customers');
      return res.rows[0].n;
    });
    expect(value).toBe(1);
    const role = await su('select current_user as u');
    expect(role.rows[0].u).toBe('postgres');
  });
});
