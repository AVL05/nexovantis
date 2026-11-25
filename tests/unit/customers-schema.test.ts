import { describe, expect, it } from 'vitest';

import {
  CUSTOMER_LIMITS,
  customerCreateSchema,
  customerUpdateSchema,
} from '@/features/customers/schema';

const ID = 'aaaaaaaa-0000-4000-8000-0000000000c1';

describe('customerCreateSchema', () => {
  it('acepta solo el nombre y completa los opcionales con null', () => {
    expect(customerCreateSchema.parse({ name: 'Cliente Ficticio' })).toEqual({
      name: 'Cliente Ficticio',
      email: null,
      phone: null,
      notes: null,
    });
  });

  it('recorta espacios y convierte vacios en null', () => {
    expect(
      customerCreateSchema.parse({
        name: '  Cliente Ficticio  ',
        email: '  cliente@example.test ',
        phone: '   ',
        notes: '',
      }),
    ).toEqual({
      name: 'Cliente Ficticio',
      email: 'cliente@example.test',
      phone: null,
      notes: null,
    });
  });

  it('acepta los limites exactos de longitud', () => {
    const result = customerCreateSchema.safeParse({
      name: 'n'.repeat(CUSTOMER_LIMITS.name),
      phone: '1'.repeat(CUSTOMER_LIMITS.phone),
      notes: 'x'.repeat(CUSTOMER_LIMITS.notes),
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['nombre vacio', { name: '' }],
    ['nombre solo con espacios', { name: '   ' }],
    ['nombre sobrelargo', { name: 'n'.repeat(CUSTOMER_LIMITS.name + 1) }],
    ['nombre ausente', {}],
    ['nombre de tipo erroneo', { name: 42 }],
    ['email malformado', { name: 'A', email: 'no-es-email' }],
    ['email sobrelargo', { name: 'A', email: `${'a'.repeat(250)}@example.test` }],
    ['telefono sobrelargo', { name: 'A', phone: '1'.repeat(CUSTOMER_LIMITS.phone + 1) }],
    ['notas sobrelargas', { name: 'A', notes: 'x'.repeat(CUSTOMER_LIMITS.notes + 1) }],
    ['telefono de tipo erroneo', { name: 'A', phone: 123 }],
  ])('rechaza: %s', (_caso, input) => {
    expect(customerCreateSchema.safeParse(input).success).toBe(false);
  });

  it('rechaza organization_id y cualquier campo desconocido', () => {
    expect(
      customerCreateSchema.safeParse({
        name: 'A',
        organization_id: 'bbbbbbbb-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false);
    expect(customerCreateSchema.safeParse({ name: 'A', archived_at: null }).success).toBe(false);
  });
});

describe('customerUpdateSchema', () => {
  it('exige un id uuid valido', () => {
    expect(customerUpdateSchema.safeParse({ id: ID, name: 'Editado' }).success).toBe(true);
    expect(customerUpdateSchema.safeParse({ name: 'Editado' }).success).toBe(false);
    expect(customerUpdateSchema.safeParse({ id: 'no-uuid', name: 'Editado' }).success).toBe(false);
  });

  it('rechaza organization_id', () => {
    expect(
      customerUpdateSchema.safeParse({
        id: ID,
        name: 'Editado',
        organization_id: 'bbbbbbbb-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false);
  });
});
