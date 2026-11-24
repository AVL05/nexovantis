// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PAGE_SIZE } from '../../src/lib/records/params';
import { escapeLikePattern } from '../../src/lib/records/search';
import { seedTwoOrgs } from '../support/fixtures';
import { createTestDb, type TestDb } from '../support/pglite';

// Flujos de Clientes y Tecnicos (TASK-008B) como consultas SQL equivalentes a las del servicio
// src/lib/records/service.ts, bajo RLS con el rol authenticated en PGlite. No prueba PostgREST.

type Row = Record<string, unknown>;
let db: TestDb;
let s: Awaited<ReturnType<typeof seedTwoOrgs>>;

const as = (user: string, sql: string, params: unknown[] = []) =>
  db.asUser(user, (tx) => tx.query<Row>(sql, params));
const su = async (sql: string, params: unknown[] = []) =>
  (await db.asSuperuser((tx) => tx.query<Row>(sql, params))).rows;

// Equivalente de applyFilters(...) del servicio: organizacion + estado + busqueda.
const searchWhere = (column: string) =>
  `organization_id = $1 and (${column} ilike $2 escape '\\' or email ilike $2 escape '\\' or phone ilike $2 escape '\\')`;

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
  // 45 clientes en la organizacion A (mas el de la semilla) y un par con comodines.
  await su(
    `insert into public.customers (organization_id, name, email, phone)
     select $1, 'Masivo ' || lpad(i::text, 3, '0'), 'masivo' || i || '@example.test', '600' || lpad(i::text, 6, '0')
     from generate_series(1, 45) as i`,
    [s.orgA],
  );
  await su(
    `insert into public.customers (organization_id, name) values
       ($1, '100% real'), ($1, 'Cien_x'), ($1, 'Cienax'), ($1, 'back\\slash')`,
    [s.orgA],
  );
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe('listado: orden, paginacion y recuento exacto', () => {
  it('cuenta solo la organizacion del usuario y pagina de 20 en 20 por nombre', async () => {
    const count = await as(
      s.memberA,
      `select count(*)::int as n from public.customers where organization_id = $1 and archived_at is null`,
      [s.orgA],
    );
    expect(count.rows[0].n).toBe(1 + 45 + 4);

    const page = (n: number) =>
      as(
        s.memberA,
        `select name from public.customers where organization_id = $1 and archived_at is null
         order by name asc, id asc limit ${PAGE_SIZE} offset ${(n - 1) * PAGE_SIZE}`,
        [s.orgA],
      );
    const [p1, p2, p3] = [await page(1), await page(2), await page(3)];
    expect(p1.rows).toHaveLength(20);
    expect(p2.rows).toHaveLength(20);
    expect(p3.rows).toHaveLength(10);
    const names = [...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.name as string);
    expect(new Set(names).size).toBe(50);
    const all = await as(
      s.memberA,
      'select name from public.customers where organization_id = $1 and archived_at is null order by name asc, id asc',
      [s.orgA],
    );
    expect(names).toEqual(all.rows.map((r) => r.name));
  });

  it('con filtro por organizacion RLS impide ver otra organizacion aunque se pida', async () => {
    const rows = await as(s.memberA, `select id from public.customers where organization_id = $1`, [
      s.orgB,
    ]);
    expect(rows.rows).toHaveLength(0);
  });
});

describe('busqueda por nombre, correo y telefono con comodines escapados', () => {
  const find = async (term: string) =>
    (
      await as(
        s.ownerA,
        `select name from public.customers where ${searchWhere('name')} order by name`,
        [s.orgA, `%${escapeLikePattern(term)}%`],
      )
    ).rows.map((r) => r.name);

  it('coincide por nombre, correo y telefono sin distinguir mayusculas', async () => {
    expect(await find('MASIVO 007')).toEqual(['Masivo 007']);
    expect(await find('masivo12@')).toEqual(['Masivo 012']);
    expect(await find('600000033')).toEqual(['Masivo 033']);
  });

  it('% y _ son literales: no actuan como comodines', async () => {
    expect(await find('%')).toEqual(['100% real']);
    expect(await find('_')).toEqual(['Cien_x']);
    expect(await find('Cien_')).toEqual(['Cien_x']);
    expect(await find('\\')).toEqual(['back\\slash']);
  });
});

describe('editar, archivar y restaurar con las condiciones del servicio', () => {
  it('update con archived_at is null no toca un archivado (0 filas) y el registro sigue igual', async () => {
    await as(s.memberA, `update public.customers set archived_at = now() where id = $1`, [
      s.customerA,
    ]);
    const edit = await as(
      s.memberA,
      `update public.customers set notes = 'x' where id = $1 and organization_id = $2 and archived_at is null returning id`,
      [s.customerA, s.orgA],
    );
    expect(edit.rows).toHaveLength(0);
    const again = await as(
      s.memberA,
      `update public.customers set archived_at = now() where id = $1 and organization_id = $2 and archived_at is null returning id`,
      [s.customerA, s.orgA],
    );
    expect(again.rows).toHaveLength(0); // ya archivado: el servicio lo traduce a conflicto
  });

  it('restaurar solo afecta a archivados; restaurar un activo da 0 filas', async () => {
    const restore = `update public.customers set archived_at = null where id = $1 and organization_id = $2 and archived_at is not null returning id`;
    const first = await as(s.ownerA, restore, [s.customerA, s.orgA]);
    expect(first.rows).toHaveLength(1);
    const second = await as(s.ownerA, restore, [s.customerA, s.orgA]);
    expect(second.rows).toHaveLength(0); // ya activo
  });

  it('otra organizacion obtiene 0 filas al archivar o restaurar (mismo "no encontrado")', async () => {
    const archive = await as(
      s.ownerB,
      `update public.customers set archived_at = now() where id = $1 and organization_id = $2 and archived_at is null returning id`,
      [s.customerA, s.orgB],
    );
    expect(archive.rows).toHaveLength(0);
    const read = await as(s.ownerB, `select id from public.customers where id = $1`, [s.customerA]);
    expect(read.rows).toHaveLength(0);
  });

  it('el historial se lee ordenado, sin datos personales, solo para la organizacion', async () => {
    const history = await as(
      s.memberA,
      `select action, actor_id, occurred_at from public.activity_events
       where organization_id = $1 and entity_type = 'customer' and entity_id = $2
       order by occurred_at desc`,
      [s.orgA, s.customerA],
    );
    expect(history.rows.map((r) => r.action)).toEqual(['restored', 'archived']);
    expect(history.rows.every((r) => r.actor_id === s.memberA || r.actor_id === s.ownerA)).toBe(
      true,
    );
    const foreign = await as(
      s.ownerB,
      `select 1 from public.activity_events where entity_id = $1`,
      [s.customerA],
    );
    expect(foreign.rows).toHaveLength(0);
  });
});

describe('tecnicos comparten el mismo comportamiento', () => {
  it('archivar y restaurar un tecnico deja eventos de tipo technician', async () => {
    await as(s.memberA, `update public.technicians set archived_at = now() where id = $1`, [
      s.technicianA,
    ]);
    await as(s.ownerA, `update public.technicians set archived_at = null where id = $1`, [
      s.technicianA,
    ]);
    const rows = await su(
      `select action from public.activity_events where entity_type = 'technician' and entity_id = $1 order by occurred_at`,
      [s.technicianA],
    );
    expect(rows.map((r) => r.action)).toEqual(['archived', 'restored']);
  });
});
