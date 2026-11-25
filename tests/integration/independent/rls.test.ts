// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedTwoOrgs } from '../../support/fixtures';
import { createTestDb, type TestDb } from '../../support/pglite';

// Pruebas independientes de Testing (TASK-006, F3). Develop no las modifica ni las salta.
// Se ejecutan en PGlite (PostgreSQL real in-process con shim de auth). NO prueban Supabase ni
// PostgREST: eso queda pendiente del job de CI con `supabase start` (test:supabase).
//
// Contrato asumido (ver docs/reviews/claude/TASK-006-PRE.md):
// - createTestDb()/seedTwoOrgs() segun docs/reviews/claude/TASK-006.md; los valores devueltos por
//   seedTwoOrgs son UUID (string).
// - Columnas: organizations(id, name), memberships(organization_id, user_id, role),
//   customers(id, organization_id, name, archived_at), technicians(id, organization_id,
//   full_name, archived_at). Cualquier otra columna debe ser opcional o tener valor por defecto.
// - Funciones auxiliares SECURITY DEFINER: is_org_member(uuid), has_org_role(uuid, text).

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

type Seed = Awaited<ReturnType<typeof seedTwoOrgs>>;
type Row = Record<string, unknown>;
type Outcome = { code?: string; rows: Row[] };
type TenantTable = 'customers' | 'technicians';
type Actor = 'ownerA' | 'memberA';

const TENANT_TABLES: { table: TenantTable; nameColumn: string }[] = [
  { table: 'customers', nameColumn: 'name' },
  { table: 'technicians', nameColumn: 'full_name' },
];
const ALL_TABLES = ['customers', 'memberships', 'organizations', 'technicians'] as const;
const ACTORS_A: Actor[] = ['ownerA', 'memberA'];
const ORPHAN_USER = '00000000-0000-4000-8000-0000000000f1';
const UNKNOWN_ORG = '00000000-0000-4000-8000-0000000000e1';

let db: TestDb;
let s: Seed;

async function boot() {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
}

// Base compartida: solo para pruebas que no deben cambiar datos (cada una verifica el estado).
function useSharedDb() {
  beforeAll(boot);
  afterAll(async () => {
    await db.close();
  });
}

// Base nueva por prueba: para mutaciones permitidas y escalada de privilegios.
function useFreshDb() {
  beforeEach(boot);
  afterEach(async () => {
    await db.close();
  });
}

async function attempt(run: () => Promise<{ rows: unknown[] }>): Promise<Outcome> {
  try {
    const res = await run();
    return { rows: res.rows as Row[] };
  } catch (error) {
    const code = (error as { code?: string }).code;
    return { code: code ?? `sin-codigo:${String(error)}`, rows: [] };
  }
}

const suTry = (sql: string, params: unknown[] = []) =>
  attempt(() => db.asSuperuser((tx) => tx.query<Row>(sql, params)));
const userTry = (userId: string, sql: string, params: unknown[] = []) =>
  attempt(() => db.asUser(userId, (tx) => tx.query<Row>(sql, params)));
const anonTry = (sql: string, params: unknown[] = []) =>
  attempt(() => db.asAnon((tx) => tx.query<Row>(sql, params)));

async function su(sql: string, params: unknown[] = []): Promise<Row[]> {
  const res = await db.asSuperuser((tx) => tx.query<Row>(sql, params));
  return res.rows;
}

// Un error de clase 42 distinto de 42501 (columna/tabla/funcion inexistente, SQL invalido,
// recursion de politicas 42P17) no demuestra seguridad: la prueba falla.
function expectNotBroken(o: Outcome) {
  expect(o.code ?? '', 'el rechazo debe ser de seguridad, no un SQL invalido').not.toMatch(
    /^42(?!501)/,
  );
}

// Rechazo de permisos o RLS (GRANT/REVOKE o WITH CHECK).
function expectDenied(o: Outcome) {
  expect(o.code, 'se esperaba SQLSTATE 42501').toBe('42501');
}

// Cualquier error SQL de seguridad/integridad (trigger, check, RLS).
function expectRejected(o: Outcome) {
  expect(o.code, 'se esperaba un rechazo (error SQL)').toBeDefined();
  expectNotBroken(o);
}

// Sin efecto: 42501 (privilegio revocado) o 0 filas afectadas (USING oculta la fila).
function expectBlocked(o: Outcome) {
  expectNotBroken(o);
  const verdict = o.code ?? (o.rows.length === 0 ? 'sin-efecto' : `EFECTO(${o.rows.length} filas)`);
  expect(['42501', 'sin-efecto']).toContain(verdict);
}

function expectNoRows(o: Outcome) {
  expect(o.code, 'no debe fallar: debe devolver 0 filas').toBeUndefined();
  expect(o.rows).toHaveLength(0);
}

const tableKey = (table: TenantTable, side: 'A' | 'B'): string =>
  table === 'customers'
    ? side === 'A'
      ? s.customerA
      : s.customerB
    : side === 'A'
      ? s.technicianA
      : s.technicianB;

const insertSql = (table: TenantTable, nameColumn: string) =>
  `insert into public.${table} (organization_id, ${nameColumn}) values ($1, $2) returning id`;

async function nameOf(table: TenantTable, nameColumn: string, id: string) {
  const rows = await su(`select ${nameColumn} as n from public.${table} where id = $1`, [id]);
  return rows.map((r) => r.n);
}

async function createOrphan(): Promise<string> {
  await su('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [
    ORPHAN_USER,
    'huerfano@example.test',
  ]);
  return ORPHAN_USER;
}

// ---------------------------------------------------------------------------------------------
describe('F3 esquema, restricciones y privilegios (catalogo)', () => {
  useSharedDb();

  it('F3-04: RLS activada en las cuatro tablas', async () => {
    const rows = await su(
      `select c.relname, c.relrowsecurity from pg_class c
       where c.relnamespace = 'public'::regnamespace
         and c.relname in ('organizations', 'memberships', 'customers', 'technicians')
       order by c.relname`,
    );
    expect(rows.map((r) => r.relname)).toEqual([...ALL_TABLES]);
    expect(rows.filter((r) => r.relrowsecurity !== true)).toEqual([]);
  });

  it.each(ALL_TABLES)('F3-05: anon y PUBLIC sin ningun privilegio sobre %s', async (table) => {
    const tablePrivs = await su(
      `select p as privilege from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE',
         'REFERENCES','TRIGGER']) as p
       where has_table_privilege('anon', 'public.${table}', p)`,
    );
    const columnPrivs = await su(
      `select p as privilege from unnest(array['SELECT','INSERT','UPDATE','REFERENCES']) as p
       where has_any_column_privilege('anon', 'public.${table}', p)`,
    );
    const publicGrants = await su(
      `select a.privilege_type from pg_class c, aclexplode(c.relacl) a
       where c.oid = 'public.${table}'::regclass and a.grantee = 0`,
    );
    expect(tablePrivs).toEqual([]);
    expect(columnPrivs).toEqual([]);
    expect(publicGrants).toEqual([]);
  });

  it.each(ALL_TABLES)(
    'F3-06: authenticated lee %s pero no tiene DELETE ni TRUNCATE',
    async (table) => {
      const rows = await su(
        `select has_table_privilege('authenticated', 'public.${table}', 'SELECT') as sel,
              has_table_privilege('authenticated', 'public.${table}', 'DELETE') as del,
              has_table_privilege('authenticated', 'public.${table}', 'TRUNCATE') as trunc`,
      );
      expect(rows[0]).toEqual({ sel: true, del: false, trunc: false });
    },
  );

  it('F3-07: no existen politicas DELETE ni ALL en public', async () => {
    const rows = await su(
      `select tablename, policyname, cmd from pg_policies
       where schemaname = 'public' and cmd in ('DELETE', 'ALL')`,
    );
    expect(rows).toEqual([]);
  });

  it('F3-07: memberships sin politicas INSERT/UPDATE y organizations sin INSERT', async () => {
    const memberships = await su(
      `select policyname, cmd from pg_policies
       where schemaname = 'public' and tablename = 'memberships' and cmd <> 'SELECT'`,
    );
    const organizations = await su(
      `select policyname, cmd from pg_policies
       where schemaname = 'public' and tablename = 'organizations' and cmd = 'INSERT'`,
    );
    expect(memberships).toEqual([]);
    expect(organizations).toEqual([]);
  });

  it('F3-08: toda politica INSERT/UPDATE declara WITH CHECK explicito', async () => {
    const rows = await su(
      `select tablename, policyname, cmd from pg_policies
       where schemaname = 'public' and cmd in ('INSERT', 'UPDATE') and with_check is null`,
    );
    expect(rows).toEqual([]);
    const updates = await su(
      `select distinct tablename from pg_policies
       where schemaname = 'public' and cmd = 'UPDATE' order by tablename`,
    );
    expect(updates.map((r) => r.tablename)).toEqual(['customers', 'organizations', 'technicians']);
  });

  it('F3-09: las politicas de memberships no se autoconsultan (sin recursion)', async () => {
    const rows = await su(
      `select policyname, qual, with_check from pg_policies
       where schemaname = 'public' and tablename = 'memberships'
         and (coalesce(qual, '') ~* 'memberships' or coalesce(with_check, '') ~* 'memberships')`,
    );
    expect(rows).toEqual([]);
  });

  it('F3-10: ids, organization_id y user_id son uuid; claves y nombres not null', async () => {
    const rows = await su(
      `select table_name, column_name, data_type, is_nullable
       from information_schema.columns
       where table_schema = 'public'
         and table_name in ('organizations', 'memberships', 'customers', 'technicians')`,
    );
    const col = (t: string, c: string) =>
      rows.find((r) => r.table_name === t && r.column_name === c);
    for (const [t, c] of [
      ['organizations', 'id'],
      ['customers', 'id'],
      ['technicians', 'id'],
      ['memberships', 'organization_id'],
      ['memberships', 'user_id'],
      ['customers', 'organization_id'],
      ['technicians', 'organization_id'],
    ]) {
      expect(col(t, c), `${t}.${c}`).toMatchObject({ data_type: 'uuid', is_nullable: 'NO' });
    }
    for (const [t, c] of [
      ['organizations', 'name'],
      ['memberships', 'role'],
      ['customers', 'name'],
      ['technicians', 'full_name'],
    ]) {
      expect(col(t, c), `${t}.${c}`).toMatchObject({ is_nullable: 'NO' });
    }
    for (const t of ['customers', 'technicians']) {
      expect(col(t, 'archived_at'), `${t}.archived_at`).toMatchObject({
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
      });
    }
  });

  it('F3-11: created_at/updated_at timestamptz not null con default', async () => {
    const rows = await su(
      `select table_name, column_name, data_type, is_nullable, column_default
       from information_schema.columns
       where table_schema = 'public' and column_name in ('created_at', 'updated_at')
         and table_name in ('organizations', 'memberships', 'customers', 'technicians')`,
    );
    const expected = [
      ['organizations', 'created_at'],
      ['organizations', 'updated_at'],
      ['memberships', 'created_at'],
      ['customers', 'created_at'],
      ['customers', 'updated_at'],
      ['technicians', 'created_at'],
      ['technicians', 'updated_at'],
    ];
    for (const [t, c] of expected) {
      const r = rows.find((x) => x.table_name === t && x.column_name === c);
      expect(r, `${t}.${c}`).toMatchObject({
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
      });
      expect(r?.column_default, `${t}.${c} default`).toBeTruthy();
    }
  });

  it('F3-12: claves foraneas hacia organizations y auth.users (cascade)', async () => {
    const rows = await su(
      `select conrelid::regclass::text as tbl, confrelid::regclass::text as ref,
              confdeltype as del
       from pg_constraint
       where contype = 'f'
         and conrelid in ('public.memberships'::regclass, 'public.customers'::regclass,
                          'public.technicians'::regclass)`,
    );
    const refs = (t: string) => rows.filter((r) => String(r.tbl).endsWith(t)).map((r) => r.ref);
    for (const t of ['memberships', 'customers', 'technicians']) {
      expect(
        refs(t).some((r) => String(r).endsWith('organizations')),
        t,
      ).toBe(true);
    }
    const toUsers = rows.find(
      (r) => String(r.tbl).endsWith('memberships') && String(r.ref).endsWith('users'),
    );
    expect(toUsers, 'memberships.user_id -> auth.users').toBeDefined();
    expect(toUsers?.del, 'on delete cascade').toBe('c');
  });

  it.each(TENANT_TABLES)(
    'F3-13: $table tiene unique (organization_id, id) e indice por organization_id',
    async ({ table }) => {
      const rows = await su(
        `select (select array_agg(a.attname::text order by k.ord)
                 from unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
                 join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) as cols,
                i.indisunique as uniq
         from pg_index i
         where i.indrelid = 'public.${table}'::regclass and i.indpred is null`,
      );
      const cols = rows.map((r) => ({ cols: (r.cols as string[]).join(','), uniq: r.uniq }));
      expect(cols.some((c) => c.uniq && c.cols === 'organization_id,id')).toBe(true);
      expect(cols.some((c) => c.cols.split(',')[0] === 'organization_id')).toBe(true);
    },
  );

  it('F3-13: memberships tiene indice por organization_id y unique (user_id)', async () => {
    const rows = await su(
      `select (select array_agg(a.attname::text order by k.ord)
               from unnest(i.indkey::int2[]) with ordinality as k(attnum, ord)
               join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) as cols,
              i.indisunique as uniq
       from pg_index i
       where i.indrelid = 'public.memberships'::regclass and i.indpred is null`,
    );
    const cols = rows.map((r) => ({ cols: (r.cols as string[]).join(','), uniq: r.uniq }));
    expect(cols.some((c) => c.cols.split(',')[0] === 'organization_id')).toBe(true);
    expect(cols.some((c) => c.uniq && c.cols === 'user_id')).toBe(true);
  });

  it('F3-14: unique(user_id): un usuario no pertenece a dos organizaciones', async () => {
    const o = await suTry(
      `insert into public.memberships (organization_id, user_id, role) values ($1, $2, 'member')`,
      [s.orgB, s.ownerA],
    );
    expect(o.code).toBe('23505');
  });

  it('F3-14: role solo admite owner y member', async () => {
    const orphan = await createOrphan();
    const o = await suTry(
      `insert into public.memberships (organization_id, user_id, role) values ($1, $2, 'admin')`,
      [s.orgA, orphan],
    );
    expect(o.code).toBe('23514');
    const ok = await suTry(
      `insert into public.memberships (organization_id, user_id, role) values ($1, $2, 'member')
       returning user_id`,
      [s.orgA, orphan],
    );
    // El alta valida es posible con privilegios de administracion (fuera de la app).
    expect(ok.code).toBeUndefined();
    expect(ok.rows).toHaveLength(1);
  });

  it('F3-14: name de organizations no vacio ni desmesurado', async () => {
    const empty = await suTry(`insert into public.organizations (name) values ('')`);
    const long = await suTry(`insert into public.organizations (name) values ($1)`, [
      'x'.repeat(10_000),
    ]);
    expect(empty.code).toBe('23514');
    expect(long.code).toBe('23514');
  });

  it.each(TENANT_TABLES)(
    'F3-14: $table exige organization_id existente, no nulo, y nombre no nulo',
    async ({ table, nameColumn }) => {
      const noOrg = await suTry(
        `insert into public.${table} (organization_id, ${nameColumn}) values (null, 'Sin org')`,
      );
      const unknownOrg = await suTry(insertSql(table, nameColumn), [
        UNKNOWN_ORG,
        'Org inexistente',
      ]);
      const noName = await suTry(
        `insert into public.${table} (organization_id, ${nameColumn}) values ($1, null)`,
        [s.orgA],
      );
      expect(noOrg.code).toBe('23502');
      expect(unknownOrg.code).toBe('23503');
      expect(noName.code).toBe('23502');
    },
  );

  it.each(TENANT_TABLES)(
    'F3-15: organization_id de $table es inmutable (tambien con privilegios totales)',
    async ({ table, nameColumn }) => {
      const id = tableKey(table, 'A');
      const o = await suTry(`update public.${table} set organization_id = $1 where id = $2`, [
        s.orgB,
        id,
      ]);
      expectRejected(o);
      const rows = await su(`select organization_id from public.${table} where id = $1`, [id]);
      expect(rows).toEqual([{ organization_id: s.orgA }]);
      expect(await nameOf(table, nameColumn, id)).toHaveLength(1);
    },
  );

  it.each([
    { table: 'organizations', nameColumn: 'name', key: () => s.orgA },
    { table: 'customers', nameColumn: 'name', key: () => s.customerA },
    { table: 'technicians', nameColumn: 'full_name', key: () => s.technicianA },
  ])('F3-16: trigger updated_at avanza en $table y created_at no cambia', async (t) => {
    const id = t.key();
    const before = (
      await su(`select created_at, updated_at from public.${t.table} where id = $1`, [id])
    )[0];
    await su('select pg_sleep(0.05)');
    await su(`update public.${t.table} set ${t.nameColumn} = $1 where id = $2`, [
      'Nombre actualizado F3',
      id,
    ]);
    const after = (
      await su(`select created_at, updated_at from public.${t.table} where id = $1`, [id])
    )[0];
    expect((after.updated_at as Date).getTime()).toBeGreaterThan(
      (before.updated_at as Date).getTime(),
    );
    expect((after.created_at as Date).getTime()).toBe((before.created_at as Date).getTime());
  });
});

// ---------------------------------------------------------------------------------------------
describe('F3 funciones SECURITY DEFINER', () => {
  useSharedDb();

  async function definerFunctions() {
    return su(
      `select p.oid::regprocedure::text as signature, p.proname as name, n.nspname as schema,
              p.proconfig as config,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema', 'auth')`,
    );
  }

  it('F3-17: existen is_org_member y has_org_role como SECURITY DEFINER', async () => {
    const names = (await definerFunctions()).map((f) => f.name);
    expect(names).toContain('is_org_member');
    expect(names).toContain('has_org_role');
  });

  it('F3-17: search_path fijado, esquema no expuesto, sin EXECUTE para PUBLIC ni anon', async () => {
    const fns = await definerFunctions();
    expect(fns.length).toBeGreaterThanOrEqual(2);
    for (const f of fns) {
      const label = String(f.signature);
      expect(f.schema, `${label} no debe estar en un esquema expuesto`).not.toBe('public');
      const cfg = ((f.config as string[] | null) ?? []).find((c) => c.startsWith('search_path='));
      expect(cfg, `${label} sin search_path`).toBeDefined();
      expect(cfg, `${label} search_path debe ser vacio o fijado`).toMatch(
        /^search_path=("")?$|^search_path=pg_catalog/,
      );
      expect(f.public_exec, `${label} EXECUTE a PUBLIC`).toBe(false);
      expect(f.anon_exec, `${label} EXECUTE a anon`).toBe(false);
    }
  });

  it('F3-17: anon no puede ejecutar las funciones auxiliares (42501)', async () => {
    const fns = await definerFunctions();
    const schema = String(fns.find((f) => f.name === 'is_org_member')?.schema);
    const member = await anonTry(`select ${schema}.is_org_member($1::uuid)`, [s.orgA]);
    const role = await anonTry(`select ${schema}.has_org_role($1::uuid, $2::text)`, [
      s.orgA,
      'owner',
    ]);
    expectDenied(member);
    expectDenied(role);
  });

  it('F3-17: authenticated las ejecuta y devuelve el rol correcto', async () => {
    const fns = await definerFunctions();
    const schema = String(fns.find((f) => f.name === 'is_org_member')?.schema);
    const q = async (user: string, sql: string, params: unknown[]) => {
      const o = await userTry(user, sql, params);
      expect(o.code, sql).toBeUndefined();
      return Object.values(o.rows[0])[0];
    };
    const isMember = `select ${schema}.is_org_member($1::uuid)`;
    const hasRole = `select ${schema}.has_org_role($1::uuid, $2::text)`;
    expect(await q(s.ownerA, isMember, [s.orgA])).toBe(true);
    expect(await q(s.ownerA, isMember, [s.orgB])).toBe(false);
    expect(await q(s.ownerA, hasRole, [s.orgA, 'owner'])).toBe(true);
    expect(await q(s.memberA, hasRole, [s.orgA, 'owner'])).toBe(false);
    expect(await q(s.memberA, hasRole, [s.orgA, 'member'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
describe('F3 anon sin acceso (REVOKE efectivo)', () => {
  useSharedDb();

  it.each(ALL_TABLES)('F3-18: anon SELECT sobre %s -> 42501', async (table) => {
    expectDenied(await anonTry(`select * from public.${table}`));
  });

  it('F3-18: anon INSERT -> 42501 en las cuatro tablas', async () => {
    expectDenied(await anonTry(`insert into public.organizations (name) values ('Anon SA')`));
    expectDenied(
      await anonTry(
        `insert into public.memberships (organization_id, user_id, role) values ($1, $2, 'owner')`,
        [s.orgA, s.memberB],
      ),
    );
    expectDenied(
      await anonTry(`insert into public.customers (organization_id, name) values ($1, 'Anon')`, [
        s.orgA,
      ]),
    );
    expectDenied(
      await anonTry(
        `insert into public.technicians (organization_id, full_name) values ($1, 'Anon')`,
        [s.orgA],
      ),
    );
  });

  it.each(ALL_TABLES)('F3-18: anon UPDATE, DELETE y TRUNCATE sobre %s -> 42501', async (table) => {
    const set =
      table === 'memberships'
        ? `role = 'owner'`
        : table === 'technicians'
          ? `full_name = 'Anon'`
          : `name = 'Anon'`;
    expectDenied(await anonTry(`update public.${table} set ${set}`));
    expectDenied(await anonTry(`delete from public.${table}`));
    expectDenied(await anonTry(`truncate public.${table}`));
  });

  it('F3-18: tras los intentos de anon no hay cambios', async () => {
    const rows = await su(`select count(*)::int as n from public.organizations`);
    expect(rows[0].n).toBe(2);
    expect(await nameOf('customers', 'name', s.customerA)).not.toContain('Anon');
  });
});

// ---------------------------------------------------------------------------------------------
describe('F3 aislamiento por organizacion en SELECT (BR01, T06)', () => {
  useSharedDb();

  it.each(ACTORS_A)('F3-19: %s solo ve su organizacion', async (actor) => {
    const orgs = await userTry(s[actor], 'select id from public.organizations');
    expect(orgs.code).toBeUndefined();
    expect(orgs.rows).toEqual([{ id: s.orgA }]);
  });

  it.each(ACTORS_A)('F3-19: %s solo ve las membresias de su organizacion', async (actor) => {
    const res = await userTry(s[actor], 'select organization_id, user_id from public.memberships');
    expect(res.code, 'sin recursion de politicas ni errores').toBeUndefined();
    expect(res.rows.length).toBeGreaterThanOrEqual(2);
    expect(res.rows.every((r) => r.organization_id === s.orgA)).toBe(true);
    const users = res.rows.map((r) => r.user_id);
    expect(users).toContain(s.ownerA);
    expect(users).toContain(s.memberA);
    expect(users).not.toContain(s.ownerB);
    expect(users).not.toContain(s.memberB);
  });

  it.each(TENANT_TABLES.flatMap((t) => ACTORS_A.map((actor) => ({ ...t, actor }))))(
    'F3-19: $actor ve su fila de $table y no la de la otra organizacion',
    async ({ table, actor }) => {
      const res = await userTry(s[actor], `select id, organization_id from public.${table}`);
      expect(res.code).toBeUndefined();
      const ids = res.rows.map((r) => r.id);
      expect(ids).toContain(tableKey(table, 'A'));
      expect(ids).not.toContain(tableKey(table, 'B'));
      expect(res.rows.every((r) => r.organization_id === s.orgA)).toBe(true);
      // Acceso directo por id a la fila ajena: 0 filas, sin error.
      expectNoRows(
        await userTry(s[actor], `select id from public.${table} where id = $1`, [
          tableKey(table, 'B'),
        ]),
      );
    },
  );

  it.each(['ownerB', 'memberB'] as const)('F3-19: %s ve solo la organizacion B', async (actor) => {
    const orgs = await userTry(s[actor], 'select id from public.organizations');
    expect(orgs.rows).toEqual([{ id: s.orgB }]);
    for (const { table } of TENANT_TABLES) {
      const res = await userTry(s[actor], `select id, organization_id from public.${table}`);
      expect(res.rows.map((r) => r.id)).toContain(tableKey(table, 'B'));
      expect(res.rows.map((r) => r.id)).not.toContain(tableKey(table, 'A'));
      expect(res.rows.every((r) => r.organization_id === s.orgB)).toBe(true);
    }
  });

  it('F3-19: un usuario sin membresia no ve ninguna fila', async () => {
    const orphan = await createOrphan();
    for (const table of ALL_TABLES) {
      expectNoRows(await userTry(orphan, `select * from public.${table}`));
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('F3 INSERT (WITH CHECK)', () => {
  describe('permitido en la propia organizacion', () => {
    useFreshDb();

    it.each(TENANT_TABLES.flatMap((t) => ACTORS_A.map((actor) => ({ ...t, actor }))))(
      'F3-20: $actor inserta en $table de su organizacion y es visible solo para A',
      async ({ table, nameColumn, actor }) => {
        const o = await userTry(s[actor], insertSql(table, nameColumn), [s.orgA, 'Alta F3 propia']);
        expect(o.code).toBeUndefined();
        expect(o.rows).toHaveLength(1);
        const id = o.rows[0].id as string;
        const own = await userTry(s.ownerA, `select id from public.${table} where id = $1`, [id]);
        expect(own.rows).toHaveLength(1);
        expectNoRows(await userTry(s.ownerB, `select id from public.${table} where id = $1`, [id]));
      },
    );
  });

  describe('rechazado en otra organizacion', () => {
    useSharedDb();

    it.each(TENANT_TABLES.flatMap((t) => ACTORS_A.map((actor) => ({ ...t, actor }))))(
      'F3-21: $actor no puede insertar en $table con organization_id ajeno (42501)',
      async ({ table, nameColumn, actor }) => {
        const marker = `Intruso ${actor} ${table}`;
        expectDenied(await userTry(s[actor], insertSql(table, nameColumn), [s.orgB, marker]));
        const rows = await su(`select id from public.${table} where ${nameColumn} = $1`, [marker]);
        expect(rows).toEqual([]);
      },
    );

    it('F3-21: un usuario sin membresia no puede insertar en ninguna organizacion (42501)', async () => {
      const orphan = await createOrphan();
      for (const { table, nameColumn } of TENANT_TABLES) {
        for (const org of [s.orgA, s.orgB]) {
          expectDenied(await userTry(orphan, insertSql(table, nameColumn), [org, 'Huerfano']));
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('F3 UPDATE (USING y WITH CHECK)', () => {
  describe('permitido en la propia organizacion', () => {
    useFreshDb();

    it.each(TENANT_TABLES.flatMap((t) => ACTORS_A.map((actor) => ({ ...t, actor }))))(
      'F3-22: $actor actualiza su fila de $table',
      async ({ table, nameColumn, actor }) => {
        const id = tableKey(table, 'A');
        const o = await userTry(
          s[actor],
          `update public.${table} set ${nameColumn} = $1 where id = $2 returning id`,
          [`Editado por ${actor}`, id],
        );
        expect(o.code).toBeUndefined();
        expect(o.rows).toHaveLength(1);
        expect(await nameOf(table, nameColumn, id)).toEqual([`Editado por ${actor}`]);
      },
    );

    it('F3-22: owner renombra su organizacion', async () => {
      const o = await userTry(
        s.ownerA,
        'update public.organizations set name = $1 where id = $2 returning id',
        ['Organizacion A renombrada', s.orgA],
      );
      expect(o.code).toBeUndefined();
      expect(o.rows).toHaveLength(1);
      const rows = await su('select name from public.organizations where id = $1', [s.orgA]);
      expect(rows).toEqual([{ name: 'Organizacion A renombrada' }]);
    });

    it('F3-22: owner no puede dejar el nombre de su organizacion vacio', async () => {
      const o = await userTry(s.ownerA, 'update public.organizations set name = $1 where id = $2', [
        '',
        s.orgA,
      ]);
      expect(o.code).toBe('23514');
    });
  });

  describe('rechazado o sin efecto', () => {
    useSharedDb();

    it.each(TENANT_TABLES.flatMap((t) => ACTORS_A.map((actor) => ({ ...t, actor }))))(
      'F3-23: $actor no actualiza filas ajenas de $table (0 filas)',
      async ({ table, nameColumn, actor }) => {
        const id = tableKey(table, 'B');
        const before = await nameOf(table, nameColumn, id);
        const o = await userTry(
          s[actor],
          `update public.${table} set ${nameColumn} = 'Secuestrado' where id = $1 returning id`,
          [id],
        );
        expectNoRows(o);
        expect(await nameOf(table, nameColumn, id)).toEqual(before);
      },
    );

    it.each(TENANT_TABLES.flatMap((t) => ACTORS_A.map((actor) => ({ ...t, actor }))))(
      'F3-24: $actor no mueve su fila de $table a otra organizacion',
      async ({ table, actor }) => {
        const id = tableKey(table, 'A');
        const o = await userTry(
          s[actor],
          `update public.${table} set organization_id = $1 where id = $2 returning id`,
          [s.orgB, id],
        );
        expectRejected(o);
        const rows = await su(`select organization_id from public.${table} where id = $1`, [id]);
        expect(rows).toEqual([{ organization_id: s.orgA }]);
      },
    );

    it.each(TENANT_TABLES.flatMap((t) => ACTORS_A.map((actor) => ({ ...t, actor }))))(
      'F3-24: $actor no roba la fila ajena de $table cambiandole organization_id',
      async ({ table, actor }) => {
        const id = tableKey(table, 'B');
        const o = await userTry(
          s[actor],
          `update public.${table} set organization_id = $1 where id = $2 returning id`,
          [s.orgA, id],
        );
        expectBlocked(o);
        const rows = await su(`select organization_id from public.${table} where id = $1`, [id]);
        expect(rows).toEqual([{ organization_id: s.orgB }]);
      },
    );

    it('F3-25: un member no actualiza el nombre de su organizacion', async () => {
      const o = await userTry(
        s.memberA,
        'update public.organizations set name = $1 where id = $2 returning id',
        ['Renombrada por member', s.orgA],
      );
      expectBlocked(o);
      const rows = await su('select name from public.organizations where id = $1', [s.orgA]);
      expect(rows[0].name).not.toBe('Renombrada por member');
    });

    it.each(ACTORS_A)('F3-25: %s no actualiza el nombre de otra organizacion', async (actor) => {
      const o = await userTry(
        s[actor],
        'update public.organizations set name = $1 where id = $2 returning id',
        ['Renombrada por ajeno', s.orgB],
      );
      expectBlocked(o);
      const rows = await su('select name from public.organizations where id = $1', [s.orgB]);
      expect(rows[0].name).not.toBe('Renombrada por ajeno');
    });

    it('F3-25: owner no cambia el id de su organizacion', async () => {
      const o = await userTry(s.ownerA, 'update public.organizations set id = $1 where id = $2', [
        UNKNOWN_ORG,
        s.orgA,
      ]);
      expectBlocked(o);
      const rows = await su('select id from public.organizations where id = $1', [s.orgA]);
      expect(rows).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('F3 DELETE y TRUNCATE inexistentes (BR02, TC-ARCH-03)', () => {
  useSharedDb();

  const targets = () => [
    { table: 'customers', own: s.customerA, foreign: s.customerB, column: 'id' },
    { table: 'technicians', own: s.technicianA, foreign: s.technicianB, column: 'id' },
    { table: 'organizations', own: s.orgA, foreign: s.orgB, column: 'id' },
  ];

  it.each(ACTORS_A)('F3-26: %s no borra filas propias ni ajenas', async (actor) => {
    for (const t of targets()) {
      for (const id of [t.own, t.foreign]) {
        const o = await userTry(
          s[actor],
          `delete from public.${t.table} where ${t.column} = $1 returning 1 as hit`,
          [id],
        );
        expectBlocked(o);
        const rows = await su(`select 1 from public.${t.table} where ${t.column} = $1`, [id]);
        expect(rows, `${t.table} ${id} sigue existiendo`).toHaveLength(1);
      }
    }
  });

  it.each(ACTORS_A)('F3-26: %s no borra membresias (ni la propia)', async (actor) => {
    for (const user of [s.ownerA, s.memberA, s.ownerB, s.memberB]) {
      const o = await userTry(
        s[actor],
        'delete from public.memberships where user_id = $1 returning 1 as hit',
        [user],
      );
      expectBlocked(o);
      const rows = await su('select 1 from public.memberships where user_id = $1', [user]);
      expect(rows, `membresia de ${user}`).toHaveLength(1);
    }
  });

  it.each(ACTORS_A)('F3-26: %s no puede borrar masivamente ni TRUNCATE (42501)', async (actor) => {
    for (const table of ALL_TABLES) {
      expectBlocked(await userTry(s[actor], `delete from public.${table} returning 1 as hit`));
      expectDenied(await userTry(s[actor], `truncate public.${table}`));
    }
    for (const { table } of TENANT_TABLES) {
      const rows = await su(`select count(*)::int as n from public.${table}`);
      expect(rows[0].n).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('F3 escalada de privilegios y membresias', () => {
  useFreshDb();

  const roleOf = async (userId: string) =>
    (
      await su('select role, organization_id from public.memberships where user_id = $1', [userId])
    )[0];

  it('F3-27: un member no puede cambiar su propio role a owner', async () => {
    const o = await userTry(
      s.memberA,
      `update public.memberships set role = 'owner' where user_id = $1 returning 1 as hit`,
      [s.memberA],
    );
    expectBlocked(o);
    expect(await roleOf(s.memberA)).toMatchObject({ role: 'member', organization_id: s.orgA });
    // Y sigue sin poder renombrar la organizacion.
    const rename = await userTry(
      s.memberA,
      'update public.organizations set name = $1 where id = $2 returning id',
      ['Escalada', s.orgA],
    );
    expectBlocked(rename);
  });

  it('F3-27: un owner no cambia roles de membresias (ni el propio ni el de otros)', async () => {
    for (const user of [s.ownerA, s.memberA]) {
      const o = await userTry(
        s.ownerA,
        `update public.memberships set role = 'member' where user_id = $1 returning 1 as hit`,
        [user],
      );
      expectBlocked(o);
    }
    expect(await roleOf(s.ownerA)).toMatchObject({ role: 'owner' });
    expect(await roleOf(s.memberA)).toMatchObject({ role: 'member' });
  });

  it.each(ACTORS_A)('F3-27: %s no cambia membresias de la otra organizacion', async (actor) => {
    const o = await userTry(
      s[actor],
      `update public.memberships set role = 'owner' where user_id = $1 returning 1 as hit`,
      [s.memberB],
    );
    expectBlocked(o);
    expect(await roleOf(s.memberB)).toMatchObject({ role: 'member', organization_id: s.orgB });
  });

  it.each(ACTORS_A)(
    'F3-27: %s no se mueve a otra organizacion (UPDATE de membresia)',
    async (actor) => {
      const o = await userTry(
        s[actor],
        'update public.memberships set organization_id = $1 where user_id = $2 returning 1 as hit',
        [s.orgB, s[actor]],
      );
      expectBlocked(o);
      expect((await roleOf(s[actor])).organization_id).toBe(s.orgA);
    },
  );

  it.each(ACTORS_A)('F3-28: %s no inserta membresias (42501)', async (actor) => {
    const orphan = await createOrphan();
    const sql = `insert into public.memberships (organization_id, user_id, role) values ($1, $2, $3)`;
    // Dar de alta a otro usuario, en su organizacion o en otra, con cualquier rol.
    expectDenied(await userTry(s[actor], sql, [s.orgA, orphan, 'member']));
    expectDenied(await userTry(s[actor], sql, [s.orgA, orphan, 'owner']));
    expectDenied(await userTry(s[actor], sql, [s.orgB, orphan, 'member']));
    // Unirse a si mismo a la otra organizacion.
    expectDenied(await userTry(s[actor], sql, [s.orgB, s[actor], 'owner']));
    const rows = await su('select 1 from public.memberships where user_id = $1', [orphan]);
    expect(rows).toEqual([]);
  });

  it('F3-28: un usuario sin membresia no puede autoasignarse a ninguna organizacion (42501)', async () => {
    const orphan = await createOrphan();
    const sql = `insert into public.memberships (organization_id, user_id, role) values ($1, $2, 'owner')`;
    expectDenied(await userTry(orphan, sql, [s.orgA, orphan]));
    expectDenied(await userTry(orphan, sql, [s.orgB, orphan]));
    expect(await su('select 1 from public.memberships where user_id = $1', [orphan])).toEqual([]);
  });

  it.each(['ownerA', 'memberA', 'orphan'] as const)(
    'F3-29: %s no puede crear organizaciones (42501)',
    async (actor) => {
      const userId = actor === 'orphan' ? await createOrphan() : s[actor];
      expectDenied(
        await userTry(userId, `insert into public.organizations (name) values ('Org pirata')`),
      );
      const rows = await su(`select 1 from public.organizations where name = 'Org pirata'`);
      expect(rows).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------------------------
describe('F3 archivado y restauracion permitidos (DH-06 aprobada, TASK-008B)', () => {
  useFreshDb();

  const archivedAt = async (table: TenantTable, id: string) =>
    (await su(`select archived_at from public.${table} where id = $1`, [id]))[0]?.archived_at;

  it.each(TENANT_TABLES.flatMap((t) => ACTORS_A.map((actor) => ({ ...t, actor }))))(
    'F3-30: $actor archiva en $table; la fila sigue existiendo y visible (historial)',
    async ({ table, actor }) => {
      const id = tableKey(table, 'A');
      expect(await archivedAt(table, id)).toBeNull();
      const o = await userTry(
        s[actor],
        `update public.${table} set archived_at = now() where id = $1 returning id`,
        [id],
      );
      expect(o.code).toBeUndefined();
      expect(o.rows).toHaveLength(1);
      expect(await archivedAt(table, id)).toBeInstanceOf(Date);
      const visible = await userTry(s[actor], `select id from public.${table} where id = $1`, [id]);
      expect(visible.rows).toHaveLength(1);
    },
  );

  it.each(TENANT_TABLES)(
    'F3-30: no se archiva una fila de otra organizacion en $table',
    async ({ table }) => {
      const id = tableKey(table, 'B');
      const o = await userTry(
        s.ownerA,
        `update public.${table} set archived_at = now() where id = $1 returning id`,
        [id],
      );
      expectNoRows(o);
      expect(await archivedAt(table, id)).toBeNull();
    },
  );

  // TASK-008B: antes F3-31 comprobaba que restaurar se rechazaba (DH-06 pendiente). DH-06 esta
  // aprobada: la restauracion es valida y deja un evento (ver archive-restore.test.ts). La
  // preparacion archiva como usuario porque un archivado sin auth.uid() ya no se admite.
  it.each(TENANT_TABLES.flatMap((t) => ACTORS_A.map((actor) => ({ ...t, actor }))))(
    'F3-31: $actor restaura (archived_at a null) en $table de su organizacion',
    async ({ table, actor }) => {
      const id = tableKey(table, 'A');
      await userTry(s.ownerA, `update public.${table} set archived_at = now() where id = $1`, [id]);
      expect(await archivedAt(table, id)).toBeInstanceOf(Date);
      const o = await userTry(
        s[actor],
        `update public.${table} set archived_at = null where id = $1 returning id`,
        [id],
      );
      expect(o.code).toBeUndefined();
      expect(o.rows).toHaveLength(1);
      expect(await archivedAt(table, id)).toBeNull();
    },
  );

  it.each(TENANT_TABLES)(
    'F3-31: no se restaura una fila archivada de otra organizacion en $table',
    async ({ table }) => {
      const id = tableKey(table, 'B');
      await userTry(s.ownerB, `update public.${table} set archived_at = now() where id = $1`, [id]);
      const before = await archivedAt(table, id);
      expect(before).toBeInstanceOf(Date);
      const o = await userTry(
        s.ownerA,
        `update public.${table} set archived_at = null where id = $1 returning id`,
        [id],
      );
      expectNoRows(o);
      expect(await archivedAt(table, id)).toEqual(before);
    },
  );
});
