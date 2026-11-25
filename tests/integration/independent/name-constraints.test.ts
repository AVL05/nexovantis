// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { customerCreateSchema } from '../../../src/features/customers/schema';
import { technicianCreateSchema } from '../../../src/features/technicians/schema';
import { NAME_CASES, zodStored, type NameCase } from '../../unit/independent/support/name-cases';
import {
  PATHS,
  applyNewMigrations,
  asUser,
  baselineDb,
  code,
  fingerprint,
  fullDb,
  lastRows,
  q,
} from './support/db';
import { readFile } from 'node:fs/promises';

// Prueba independiente de Testing (TASK-010 PRE, A02-04). Develop no la modifica.
// PGlite (PostgreSQL real, shim de Auth): NO es PostgREST; ver name-constraints.supabase.test.ts.
//
// Criterio unificado (detalle en tests/unit/independent/support/name-cases.ts):
//   maximo 200 caracteres ALMACENADOS (puntos de codigo) y rechazo de nombres solo en blanco
//   (mismo conjunto que String.trim() de JavaScript, incluidas tabulaciones y saltos de linea) en
//   organizations.name, customers.name y technicians.full_name. Error esperado: 23514.
//
// Contrato para la verificacion previa a la migracion: archivo SQL de SOLO LECTURA
//   supabase/checks/name-constraints-precheck.sql
// cuya ULTIMA sentencia devuelve una fila por registro existente que violaria la nueva restriccion:
//   (table_name text: 'organizations'|'customers'|'technicians', id uuid, reason text no vacio).
// Sin filas = se puede migrar. No modifica nada.

vi.setConfig({ testTimeout: 90_000, hookTimeout: 120_000 });

const ORG = '00000000-0000-4000-8000-0000000000a1';
const OWNER = '00000000-0000-4000-8000-0000000000b1';

const TABLES = [
  {
    label: 'customers',
    insert: `insert into public.customers (organization_id, name) values ('${ORG}', $1)`,
    updateSql: (id: string) => `update public.customers set name = $1 where id = '${id}'`,
    row: `insert into public.customers (organization_id, name) values ('${ORG}', 'Base') returning id`,
  },
  {
    label: 'technicians',
    insert: `insert into public.technicians (organization_id, full_name) values ('${ORG}', $1)`,
    updateSql: (id: string) => `update public.technicians set full_name = $1 where id = '${id}'`,
    row: `insert into public.technicians (organization_id, full_name) values ('${ORG}', 'Base') returning id`,
  },
  {
    label: 'organizations',
    insert: `insert into public.organizations (name) values ($1)`,
    updateSql: (id: string) => `update public.organizations set name = $1 where id = '${id}'`,
    row: `insert into public.organizations (name) values ('Base') returning id`,
  },
] as const;

let db: PGlite;

beforeAll(async () => {
  db = await fullDb();
  await db.exec(`
    insert into public.organizations (id, name) values ('${ORG}', 'Organizacion de prueba');
    insert into auth.users (id, email) values ('${OWNER}', 'owner@example.test');
    insert into public.memberships (organization_id, user_id, role) values ('${ORG}', '${OWNER}', 'owner');`);
});

afterAll(async () => {
  await db.close();
});

const verdict = (c: string | undefined) => (c === undefined ? 'accept' : (c as string));

describe.each(TABLES)('A02-04 INSERT directo en $label (superusuario)', ({ insert }) => {
  it.each(NAME_CASES)('$id -> $db', async ({ value, db: expected }: NameCase) => {
    const result = await code(() => db.query(insert, [value]));
    if (expected === 'accept') expect(result).toBeUndefined();
    else expect(verdict(result)).toBe('23514');
  });
});

describe.each(TABLES)('A02-04 UPDATE como propietario sobre $label (via RLS y GRANT)', (table) => {
  it.each(NAME_CASES)('$id -> $db', async ({ value, db: expected }: NameCase) => {
    const id = (await q(db, table.row))[0].id as string;
    const result = await code(() =>
      table.label === 'organizations'
        ? asUser(db, OWNER, (tx) =>
            tx.query(`update public.organizations set name = $1 where id = '${ORG}'`, [value]),
          )
        : asUser(db, OWNER, (tx) => tx.query(table.updateSql(id), [value])),
    );
    if (expected === 'accept') expect(result).toBeUndefined();
    else expect(verdict(result)).toBe('23514');
  });
});

describe('A02-04 paridad Zod y PostgreSQL', () => {
  it.each(NAME_CASES.filter((c) => c.zod === 'accept'))(
    'lo que Zod acepta ($id) se almacena sin error en customers y technicians',
    async ({ value }) => {
      const customer = customerCreateSchema.safeParse({ name: value });
      const technician = technicianCreateSchema.safeParse({ full_name: value });
      expect(customer.success && technician.success).toBe(true);
      if (!customer.success || !technician.success) return;
      expect(customer.data.name).toBe(zodStored(value));
      expect(
        await code(() =>
          db.query(`insert into public.customers (organization_id, name) values ('${ORG}', $1)`, [
            customer.data.name,
          ]),
        ),
      ).toBeUndefined();
      expect(
        await code(() =>
          db.query(
            `insert into public.technicians (organization_id, full_name) values ('${ORG}', $1)`,
            [technician.data.full_name],
          ),
        ),
      ).toBeUndefined();
    },
  );

  it.each(NAME_CASES.filter((c) => c.zod === 'reject'))(
    'lo que Zod rechaza ($id) tambien lo rechaza PostgreSQL por SQL directo (sin eludir por PostgREST)',
    async ({ value }) => {
      expect(customerCreateSchema.safeParse({ name: value }).success).toBe(false);
      for (const t of TABLES) {
        expect(verdict(await code(() => db.query(t.insert, [value]))), t.label).toBe('23514');
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Verificacion previa y migracion sobre datos existentes (estado de Cloud antes de TASK-010).

const LEGACY = {
  orgBlank: '00000000-0000-4000-8000-0000000000c1',
  orgOk: '00000000-0000-4000-8000-0000000000c2',
  cBlank: '00000000-0000-4000-8000-0000000000d1',
  cLong: '00000000-0000-4000-8000-0000000000d2',
  cOk: '00000000-0000-4000-8000-0000000000d3',
  tBlank: '00000000-0000-4000-8000-0000000000e1',
  tLong: '00000000-0000-4000-8000-0000000000e2',
  tOk: '00000000-0000-4000-8000-0000000000e3',
};
const PADDED = `${'a'.repeat(200)}${' '.repeat(20)}`;

/** Estado heredado: cumple las restricciones ANTIGUAS (btrim solo recorta espacios) pero no las nuevas. */
async function legacyDb(withViolations: boolean): Promise<PGlite> {
  const d = await baselineDb();
  const bad = (value: string, ok: string) => (withViolations ? value : ok);
  await d.exec(`
    insert into public.organizations (id, name) values
      ('${LEGACY.orgBlank}', '${bad('\n', 'Organizacion corregida')}'),
      ('${LEGACY.orgOk}', 'Organizacion valida');
    insert into public.customers (id, organization_id, name) values
      ('${LEGACY.cBlank}', '${LEGACY.orgOk}', '${bad('\t', 'Cliente corregido')}'),
      ('${LEGACY.cLong}', '${LEGACY.orgOk}', '${bad(PADDED, 'Cliente largo corregido')}'),
      ('${LEGACY.cOk}', '${LEGACY.orgOk}', 'Cliente valido');
    insert into public.technicians (id, organization_id, full_name) values
      ('${LEGACY.tBlank}', '${LEGACY.orgOk}', '${bad('\r\n', 'Tecnico corregido')}'),
      ('${LEGACY.tLong}', '${LEGACY.orgOk}', '${bad(PADDED, 'Tecnico largo corregido')}'),
      ('${LEGACY.tOk}', '${LEGACY.orgOk}', 'Tecnico valido');`);
  return d;
}

const VIOLATORS = [
  `organizations:${LEGACY.orgBlank}`,
  `customers:${LEGACY.cBlank}`,
  `customers:${LEGACY.cLong}`,
  `technicians:${LEGACY.tBlank}`,
  `technicians:${LEGACY.tLong}`,
].sort();

async function runPrecheck(d: PGlite) {
  const sql = await readFile(PATHS.namePrecheck, 'utf8');
  return lastRows((await d.exec(sql)) as unknown as { rows: Record<string, unknown>[] }[]);
}

describe('A02-04 verificacion previa de nombres existentes (solo lectura)', () => {
  it('identifica exactamente las filas que violarian la restriccion y no modifica nada', async () => {
    const d = await legacyDb(true);
    try {
      const before = await fingerprint(d);
      const rows = await runPrecheck(d);
      const found = rows.map((r) => `${r.table_name as string}:${r.id as string}`).sort();
      expect(found).toEqual(VIOLATORS);
      for (const r of rows) {
        expect(typeof r.reason).toBe('string');
        expect((r.reason as string).length).toBeGreaterThan(0);
      }
      expect(await fingerprint(d)).toEqual(before);
    } finally {
      await d.close();
    }
  });

  it('sin filas conflictivas devuelve cero filas', async () => {
    const d = await legacyDb(false);
    try {
      expect(await runPrecheck(d)).toEqual([]);
    } finally {
      await d.close();
    }
  });
});

describe('A02-04 migracion sobre datos existentes', () => {
  it('con filas conflictivas: nunca reescribe datos en silencio (falla limpia o conserva las filas)', async () => {
    const d = await legacyDb(true);
    try {
      const dataBefore = await fingerprint(d, ['public']);
      const error = await applyNewMigrations(d);
      const after = await fingerprint(d, ['public']).then((rows) =>
        rows.filter((r) =>
          ['public.organizations', 'public.customers', 'public.technicians'].includes(
            r.table as string,
          ),
        ),
      );
      const expected = dataBefore.filter((r) =>
        ['public.organizations', 'public.customers', 'public.technicians'].includes(
          r.table as string,
        ),
      );
      // Sea cual sea la estrategia (abortar con error claro, o restriccion NOT VALID), los datos de
      // organizaciones, clientes y tecnicos quedan identicos: no se recorta ni se "arregla" nada.
      expect(after).toEqual(expected);
      if (error === null) {
        // La restriccion se aplica a las filas NUEVAS aunque las heredadas se conserven.
        expect(
          verdict(
            await code(() =>
              d.query(
                `insert into public.customers (organization_id, name) values ('${LEGACY.orgOk}', E'\\t')`,
              ),
            ),
          ),
        ).toBe('23514');
      } else {
        // Fallo: el mensaje identifica el motivo y no es un error generico de sintaxis.
        expect(String((error as Error).message).length).toBeGreaterThan(0);
        expect((error as { code?: string }).code).not.toBe('42601');
      }
    } finally {
      await d.close();
    }
  });

  it('tras corregir los datos, las migraciones nuevas se aplican y la restriccion nueva queda activa', async () => {
    const d = await legacyDb(false);
    try {
      expect(await applyNewMigrations(d)).toBeNull();
      expect(await runPrecheck(d)).toEqual([]);
      expect(
        verdict(
          await code(() =>
            d.query(
              `insert into public.customers (organization_id, name) values ('${LEGACY.orgOk}', E'\\t')`,
            ),
          ),
        ),
      ).toBe('23514');
      expect(
        verdict(
          await code(() =>
            d.query(`insert into public.organizations (name) values ($1)`, ['a'.repeat(201)]),
          ),
        ),
      ).toBe('23514');
      expect(
        await code(() =>
          d.query(
            `insert into public.customers (organization_id, name) values ('${LEGACY.orgOk}', $1)`,
            ['a'.repeat(200)],
          ),
        ),
      ).toBeUndefined();
      // Las filas validas heredadas siguen intactas.
      const ok = await q(d, `select name from public.customers where id = '${LEGACY.cOk}'`);
      expect(ok).toEqual([{ name: 'Cliente valido' }]);
    } finally {
      await d.close();
    }
  });
});
