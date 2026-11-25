import { describe, expect, it } from 'vitest';

import { customerCreateSchema } from '@/features/customers/schema';
import { NOT_FOUND_MESSAGE, mapDbError, zodFieldErrors } from '@/lib/records/errors';
import { formatDateTime } from '@/lib/records/format';
import { pickFields } from '@/lib/records/form';

describe('mapDbError', () => {
  it.each([
    ['PGRST116', 'not_found'],
    ['42501', 'forbidden'],
    ['23000', 'conflict'],
    ['23505', 'conflict'],
    ['23514', 'invalid'],
    ['23502', 'invalid'],
    ['22001', 'invalid'],
    ['XX000', 'unavailable'],
    ['', 'unavailable'],
  ])('codigo %j -> %s', (code, kind) => {
    expect(mapDbError({ code }).kind).toBe(kind);
  });

  it('trata null/undefined como no disponible', () => {
    expect(mapDbError(null).kind).toBe('unavailable');
    expect(mapDbError(undefined).kind).toBe('unavailable');
  });

  it('nunca devuelve SQL, nombres de restricciones ni el mensaje original', () => {
    const error = {
      code: '23514',
      message: 'new row for relation "customers" violates check constraint "customers_name_length"',
    };
    const mapped = mapDbError(error);
    expect(JSON.stringify(mapped)).not.toMatch(/customers|constraint|relation|SELECT|INSERT/i);
    expect(mapDbError({ code: 'PGRST116' }).message).toBe(NOT_FOUND_MESSAGE);
  });
});

describe('zodFieldErrors', () => {
  it('traduce por campo con mensajes en espanol', () => {
    const parsed = customerCreateSchema.safeParse({
      name: '',
      email: 'no-es-correo',
      phone: 'x'.repeat(41),
      notes: '',
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const errors = zodFieldErrors(parsed.error);
    expect(errors.name).toBe('Este campo es obligatorio.');
    expect(errors.email).toBe('Introduce un correo electrónico válido.');
    expect(errors.phone).toBe('Máximo 40 caracteres.');
    expect(errors.notes).toBeUndefined();
  });

  it('campos desconocidos (p. ej. organization_id) se rechazan sin filtrar detalles', () => {
    const parsed = customerCreateSchema.safeParse({
      name: 'Ana',
      organization_id: '00000000-0000-4000-8000-000000000000',
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(zodFieldErrors(parsed.error)).toEqual({ _form: 'El valor no es válido.' });
  });
});

describe('pickFields', () => {
  it('solo toma las claves esperadas e ignora las internas y las inyectadas', () => {
    const formData = new FormData();
    formData.set('name', 'Ana');
    formData.set('$ACTION_ID_abc', '1');
    formData.set('organization_id', '00000000-0000-4000-8000-000000000000');
    formData.set('email', 'ana@example.test');
    expect(pickFields(formData, ['name', 'email', 'phone'])).toEqual({
      name: 'Ana',
      email: 'ana@example.test',
      phone: '',
    });
  });

  it('un archivo se trata como vacio', () => {
    const formData = new FormData();
    formData.set('name', new File(['x'], 'x.txt'));
    expect(pickFields(formData, ['name'])).toEqual({ name: '' });
  });
});

describe('formatDateTime', () => {
  it('formatea en es-ES con zona Europe/Madrid', () => {
    expect(formatDateTime('2026-11-24T12:30:00Z')).toMatch(/24 nov 2026/);
    expect(formatDateTime('2026-11-24T12:30:00Z')).toMatch(/13:30/);
  });

  it('una fecha invalida no rompe la interfaz', () => {
    expect(formatDateTime('no-es-fecha')).toBe('—');
  });
});
