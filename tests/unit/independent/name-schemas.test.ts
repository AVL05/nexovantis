import { describe, expect, it } from 'vitest';

import { customerCreateSchema, customerUpdateSchema } from '@/features/customers/schema';
import { technicianCreateSchema, technicianUpdateSchema } from '@/features/technicians/schema';

import { NAME_CASES, zodStored } from './support/name-cases';

// Prueba independiente de Testing (TASK-010 PRE, A02-04). Develop no la modifica.
// Lado Zod del criterio unificado (ver support/name-cases.ts). El lado PostgreSQL se verifica en
// tests/integration/independent/name-constraints.test.ts (PGlite) y, por PostgREST, en
// tests/integration/supabase/independent/name-constraints.supabase.test.ts (CI).

const ID = '00000000-0000-4000-8000-000000000001';

const SCHEMAS = [
  { label: 'cliente (alta)', schema: customerCreateSchema, field: 'name', extra: {} },
  { label: 'cliente (edicion)', schema: customerUpdateSchema, field: 'name', extra: { id: ID } },
  { label: 'tecnico (alta)', schema: technicianCreateSchema, field: 'full_name', extra: {} },
  {
    label: 'tecnico (edicion)',
    schema: technicianUpdateSchema,
    field: 'full_name',
    extra: { id: ID },
  },
] as const;

describe.each(SCHEMAS)('A02-04 Zod: nombre de $label', ({ schema, field, extra }) => {
  it.each(NAME_CASES)('$id -> $zod', ({ value, zod }) => {
    const result = schema.safeParse({ ...extra, [field]: value });
    expect(result.success).toBe(zod === 'accept');
    if (zod === 'accept' && result.success) {
      const stored = (result.data as Record<string, unknown>)[field] as string;
      // Lo almacenado es el valor recortado y cabe en la restriccion de PostgreSQL.
      expect(stored).toBe(zodStored(value));
      expect([...stored].length).toBeLessThanOrEqual(200);
      expect([...stored].length).toBeGreaterThanOrEqual(1);
      expect(stored).not.toMatch(/^\s|\s$/);
    }
  });

  it('un valor que no es texto (numero, null, ausente, lista) se rechaza', () => {
    for (const value of [undefined, null, 42, ['Ana'], { toString: () => 'Ana' }]) {
      expect(schema.safeParse({ ...extra, [field]: value }).success, String(value)).toBe(false);
    }
  });
});
