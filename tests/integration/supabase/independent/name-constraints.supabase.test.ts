// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';

import { NAME_CASES } from '../../../unit/independent/support/name-cases';
import { buildStack, must, type Stack } from './support/stack';

// Caso independiente de Testing (TASK-010 PRE, A02-04) contra el stack LOCAL de Supabase en CI
// (`pnpm test:supabase`): PostgREST y JWT reales. Complementa a
// tests/integration/independent/name-constraints.test.ts (PGlite). Si faltan SUPABASE_*, FALLA.
// NO se ha podido ejecutar en local (sin Docker): validacion efectiva pendiente de CI.
//
// Criterio: por la API de datos (sin pasar por Zod) los nombres solo en blanco (tabulaciones y
// saltos de linea incluidos) y de mas de 200 caracteres almacenados se rechazan con 23514 en
// customers.name, technicians.full_name y organizations.name; los validos se aceptan.

let stack: Stack;
beforeAll(async () => {
  stack = await buildStack('nc');
}, 120_000);

const countOf = async (table: 'customers' | 'technicians', org: string) =>
  (
    await stack.admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org)
  ).count ?? 0;

const TABLES = [
  { table: 'customers', col: 'name' },
  { table: 'technicians', col: 'full_name' },
] as const;

describe.each(TABLES)('A02-04 alta por PostgREST en $table', ({ table, col }) => {
  it.each(NAME_CASES)('$id -> $db', async ({ value, db }) => {
    const before = await countOf(table, stack.orgA.id);
    const res = await stack.memberA.client
      .from(table)
      .insert({ organization_id: stack.orgA.id, [col]: value })
      .select('id');
    if (db === 'accept') {
      expect(res.error).toBeNull();
      expect(res.data).toHaveLength(1);
      expect(await countOf(table, stack.orgA.id)).toBe(before + 1);
    } else {
      expect(res.error?.code).toBe('23514');
      expect(await countOf(table, stack.orgA.id)).toBe(before);
    }
  });
});

describe.each(TABLES)('A02-04 edicion por PostgREST en $table', ({ table, col }) => {
  it.each(NAME_CASES.filter((c) => c.db === 'reject'))(
    '$id: el nombre valido anterior se conserva',
    async ({ value }) => {
      const row = must(
        await stack.admin
          .from(table)
          .insert({ organization_id: stack.orgA.id, [col]: 'Nombre valido' })
          .select('id')
          .single(),
        'fila base',
      ) as { id: string };
      const res = await stack.ownerA.client
        .from(table)
        .update({ [col]: value })
        .eq('id', row.id)
        .select('id');
      expect(res.error?.code).toBe('23514');
      const stored = must(
        await stack.admin.from(table).select(col).eq('id', row.id).single(),
        'releer',
      ) as unknown as Record<string, string>;
      expect(stored[col]).toBe('Nombre valido');
    },
  );
});

describe('A02-04 renombrar la organizacion por PostgREST (solo owner)', () => {
  it.each(NAME_CASES.filter((c) => c.db === 'reject'))(
    '$id se rechaza con 23514',
    async ({ value }) => {
      const res = await stack.ownerA.client
        .from('organizations')
        .update({ name: value })
        .eq('id', stack.orgA.id)
        .select('id');
      expect(res.error?.code).toBe('23514');
      const stored = must(
        await stack.admin.from('organizations').select('name').eq('id', stack.orgA.id).single(),
        'releer organizacion',
      ) as { name: string };
      expect(stored.name).toBe(`nc Alfa ${stack.run}`);
    },
  );

  it('un nombre valido de 200 caracteres se acepta y se restaura el original', async () => {
    const long = 'N'.repeat(200);
    const ok = await stack.ownerA.client
      .from('organizations')
      .update({ name: long })
      .eq('id', stack.orgA.id)
      .select('name');
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual([{ name: long }]);
    must(
      await stack.ownerA.client
        .from('organizations')
        .update({ name: `nc Alfa ${stack.run}` })
        .eq('id', stack.orgA.id)
        .select('id'),
      'restaurar nombre',
    );
  });

  it('un miembro (no owner) sigue sin poder renombrar: 0 filas, sin error', async () => {
    const res = await stack.memberA.client
      .from('organizations')
      .update({ name: 'Intento de miembro' })
      .eq('id', stack.orgA.id)
      .select('id');
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });
});
