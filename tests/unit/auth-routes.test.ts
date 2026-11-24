import { describe, expect, it } from 'vitest';

import { isProtectedPath } from '@/features/auth/routes';
import { loginSchema } from '@/features/auth/schema';

describe('isProtectedPath', () => {
  it.each([
    '/dashboard',
    '/dashboard/',
    '/dashboard/x',
    '/Dashboard',
    '/%64ashboard',
    '//dashboard',
    '/dashboard//',
  ])('protege %s', (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each(['/', '/login', '/dashboards', '/ruta-que-no-existe', '/api/dashboard'])(
    'no protege %s',
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    },
  );
});

describe('loginSchema', () => {
  it('acepta correo y contrasena validos', () => {
    expect(loginSchema.safeParse({ email: ' ana@example.test ', password: 'x' }).data).toEqual({
      email: 'ana@example.test',
      password: 'x',
    });
  });

  it.each([
    { email: '', password: 'x' },
    { email: 'no-es-correo', password: 'x' },
    { email: 'ana@example.test', password: '' },
    { email: `${'a'.repeat(300)}@example.test`, password: 'x' },
    { email: 'ana@example.test', password: 'p'.repeat(2000) },
    { email: null, password: 'x' },
    { email: 'ana@example.test' },
  ])('rechaza %j', (input) => {
    expect(loginSchema.safeParse(input).success).toBe(false);
  });
});
