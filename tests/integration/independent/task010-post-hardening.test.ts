// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { seedTwoOrgs } from '../../support/fixtures';
import { createTestDb, type TestDb } from '../../support/pglite';
import { code } from './support/db';

// Pruebas independientes de Testing (TASK-010 POST). Casos de alto valor que PRE no cubria:
//  1. Paridad EXHAUSTIVA entre el conjunto de espacio en blanco de String.prototype.trim() y la
//     restriccion REAL de la base (todos los puntos de codigo del plano BMP, una insercion por
//     punto con subtransaccion): ni un caracter en blanco aceptado ni uno visible rechazado.
//  2. Privilegios de la secuencia de seq y de private.demo_fixture_identity para anon y
//     authenticated (A02-03/A02-05): sin USAGE/SELECT/UPDATE, sin lectura ni escritura de tabla,
//     sin forma de avanzar o fijar la secuencia (nextval/setval) ni de insertar eventos con seq.
// PGlite (PostgreSQL real, shim de Auth). No es PostgREST.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let db: TestDb;
let s: Awaited<ReturnType<typeof seedTwoOrgs>>;

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
});
afterAll(async () => {
  await db.close();
});

const su = async (sql: string, params: unknown[] = []) =>
  (await db.asSuperuser((tx) => tx.query<Record<string, unknown>>(sql, params))).rows;

describe('A02-04 paridad exhaustiva trim() de JavaScript frente a la restriccion real', () => {
  it.each([
    ['customers', 'customers_name_length', 'name'],
    ['technicians', 'technicians_full_name_length', 'full_name'],
    ['organizations', 'organizations_name_length', 'name'],
  ])(
    '%s: ningun punto de codigo BMP se trata distinto que String.trim()',
    async (_table, name, column) => {
      // Tabla temporal con la DEFINICION REAL de la restriccion (no una copia escrita a mano).
      const [{ def }] = await su(
        `select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1`,
        [name],
      );
      const accepted = await db.asSuperuser(async (tx) => {
        await tx.query(`drop table if exists nm_probe`);
        await tx.query(`create temp table nm_probe (cp int, ${column} text)`);
        await tx.query(`alter table nm_probe add constraint nm_probe_c ${String(def)}`);
        await tx.query(`
        do $probe$
        declare cp int;
        begin
          for cp in select g from generate_series(1, 65535) g where g not between 55296 and 57343 loop
            begin
              insert into nm_probe values (cp, chr(cp));
            exception when check_violation then
              null;
            end;
          end loop;
        end
        $probe$`);
        const rows = (await tx.query<{ cp: number }>(`select cp from nm_probe order by cp`)).rows;
        await tx.query(`drop table nm_probe`);
        return rows.map((r) => r.cp);
      });
      const acceptedSet = new Set(accepted);
      const wrong: string[] = [];
      for (let cp = 1; cp <= 0xffff; cp += 1) {
        if (cp >= 0xd800 && cp <= 0xdfff) continue;
        const blankInJs = String.fromCodePoint(cp).trim() === '';
        const acceptedByDb = acceptedSet.has(cp);
        // En blanco en JS -> la BD debe rechazar; visible en JS -> la BD debe aceptar.
        if (blankInJs === acceptedByDb) wrong.push(`U+${cp.toString(16).padStart(4, '0')}`);
      }
      expect(wrong, 'puntos de codigo con tratamiento distinto').toEqual([]);
      expect(accepted.length).toBeGreaterThan(60000);
    },
  );
});

describe('A02-05 / A02-03 privilegios de la secuencia y de la identidad de fixtures', () => {
  const ROLES = ['anon', 'authenticated'] as const;

  it('la secuencia de seq no concede USAGE, SELECT ni UPDATE a anon ni authenticated', async () => {
    for (const role of ROLES) {
      for (const priv of ['USAGE', 'SELECT', 'UPDATE']) {
        const r = await su(
          `select has_sequence_privilege($1, 'public.activity_events_seq_seq', $2) as v`,
          [role, priv],
        );
        expect(r[0].v, `${role} ${priv}`).toBe(false);
      }
    }
    const publicGrants = await su(
      `select count(*)::int as n
       from pg_class c, aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) a
       where c.oid = 'public.activity_events_seq_seq'::regclass and a.grantee = 0`,
    );
    expect(publicGrants[0].n).toBe(0);
  });

  it('un usuario no puede avanzar ni fijar la secuencia (nextval/setval -> 42501)', async () => {
    const attempts = [
      `select nextval('public.activity_events_seq_seq')`,
      `select setval('public.activity_events_seq_seq', 1)`,
      `select currval('public.activity_events_seq_seq')`,
      `select * from public.activity_events_seq_seq`,
    ];
    for (const sql of attempts) {
      expect(await code(() => db.asUser(s.ownerA, (tx) => tx.query(sql))), sql).toBe('42501');
    }
  });

  it('private.demo_fixture_identity: sin ningun privilegio de tabla ni de columna para usuarios', async () => {
    for (const role of ROLES) {
      for (const priv of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES']) {
        const r = await su(
          `select has_table_privilege($1, 'private.demo_fixture_identity', $2) as v`,
          [role, priv],
        );
        expect(r[0].v, `${role} ${priv}`).toBe(false);
      }
    }
    const rls = await su(
      `select relrowsecurity as on from pg_class where oid = 'private.demo_fixture_identity'::regclass`,
    );
    expect(rls[0].on).toBe(true);
    const policies = await su(
      `select count(*)::int as n from pg_policies where schemaname = 'private' and tablename = 'demo_fixture_identity'`,
    );
    expect(policies[0].n).toBe(0);
  });

  it('un owner autenticado no lee ni escribe la identidad por SQL directo (42501)', async () => {
    for (const sql of [
      `select * from private.demo_fixture_identity`,
      `insert into private.demo_fixture_identity (organization_id, entity_type, fixture_key, record_id)
       values ('${s.orgA}', 'customer', 'c99', '${s.customerA}')`,
    ]) {
      expect(await code(() => db.asUser(s.ownerA, (tx) => tx.query(sql))), sql).toBe('42501');
    }
  });

  it('la tabla de identidad no esta en el esquema expuesto por la API (solo public)', async () => {
    const r = await su(
      `select table_schema from information_schema.tables where table_name = 'demo_fixture_identity'`,
    );
    expect(r).toEqual([{ table_schema: 'private' }]);
  });
});
