import { describe, expect, it } from 'vitest';

import {
  TECHNICIAN_LIMITS,
  technicianCreateSchema,
  technicianUpdateSchema,
} from '@/features/technicians/schema';

const ID = 'aaaaaaaa-0000-4000-8000-0000000000d1';

describe('technicianCreateSchema', () => {
  it('acepta solo el nombre completo y completa los opcionales con null', () => {
    expect(technicianCreateSchema.parse({ full_name: 'Tecnico Ficticio' })).toEqual({
      full_name: 'Tecnico Ficticio',
      email: null,
      phone: null,
      notes: null,
    });
  });

  it('recorta espacios y convierte vacios en null', () => {
    expect(
      technicianCreateSchema.parse({
        full_name: '  Tecnico Ficticio ',
        email: ' tecnico@example.test ',
        phone: ' 600000000 ',
        notes: '  ',
      }),
    ).toEqual({
      full_name: 'Tecnico Ficticio',
      email: 'tecnico@example.test',
      phone: '600000000',
      notes: null,
    });
  });

  it('acepta los limites exactos de longitud', () => {
    expect(
      technicianCreateSchema.safeParse({
        full_name: 'n'.repeat(TECHNICIAN_LIMITS.full_name),
        phone: '1'.repeat(TECHNICIAN_LIMITS.phone),
        notes: 'x'.repeat(TECHNICIAN_LIMITS.notes),
      }).success,
    ).toBe(true);
  });

  it.each([
    ['nombre vacio', { full_name: '' }],
    ['nombre solo con espacios', { full_name: '   ' }],
    ['nombre sobrelargo', { full_name: 'n'.repeat(TECHNICIAN_LIMITS.full_name + 1) }],
    ['nombre ausente', {}],
    ['nombre de tipo erroneo', { full_name: null }],
    ['email malformado', { full_name: 'A', email: 'a@' }],
    ['telefono sobrelargo', { full_name: 'A', phone: '1'.repeat(TECHNICIAN_LIMITS.phone + 1) }],
    ['notas sobrelargas', { full_name: 'A', notes: 'x'.repeat(TECHNICIAN_LIMITS.notes + 1) }],
  ])('rechaza: %s', (_caso, input) => {
    expect(technicianCreateSchema.safeParse(input).success).toBe(false);
  });

  it('rechaza organization_id y cualquier campo desconocido', () => {
    expect(
      technicianCreateSchema.safeParse({
        full_name: 'A',
        organization_id: 'bbbbbbbb-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false);
    expect(technicianCreateSchema.safeParse({ full_name: 'A', name: 'B' }).success).toBe(false);
  });
});

describe('technicianUpdateSchema', () => {
  it('exige un id uuid valido', () => {
    expect(technicianUpdateSchema.safeParse({ id: ID, full_name: 'Editado' }).success).toBe(true);
    expect(technicianUpdateSchema.safeParse({ full_name: 'Editado' }).success).toBe(false);
    expect(technicianUpdateSchema.safeParse({ id: '123', full_name: 'Editado' }).success).toBe(
      false,
    );
  });
});
