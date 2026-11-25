import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSupabaseEnv, parseSupabaseEnv } from '@/lib/env';

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'clave-publicable-de-prueba',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parseSupabaseEnv', () => {
  it('acepta una URL valida y una clave no vacia', () => {
    expect(parseSupabaseEnv(VALID)).toEqual(VALID);
  });

  it('recorta espacios alrededor de los valores', () => {
    const parsed = parseSupabaseEnv({
      NEXT_PUBLIC_SUPABASE_URL: ' https://ejemplo.invalid ',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '  clave  ',
    });
    expect(parsed.NEXT_PUBLIC_SUPABASE_URL).toBe('https://ejemplo.invalid');
    expect(parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe('clave');
  });

  it.each([
    ['falta la URL', { ...VALID, NEXT_PUBLIC_SUPABASE_URL: undefined }, 'NEXT_PUBLIC_SUPABASE_URL'],
    ['URL vacia', { ...VALID, NEXT_PUBLIC_SUPABASE_URL: '' }, 'NEXT_PUBLIC_SUPABASE_URL'],
    [
      'URL malformada',
      { ...VALID, NEXT_PUBLIC_SUPABASE_URL: 'no-es-una-url' },
      'NEXT_PUBLIC_SUPABASE_URL',
    ],
    [
      'protocolo no http(s)',
      { ...VALID, NEXT_PUBLIC_SUPABASE_URL: 'ftp://ejemplo.invalid' },
      'NEXT_PUBLIC_SUPABASE_URL',
    ],
    [
      'falta la clave',
      { ...VALID, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined },
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ],
    [
      'clave vacia',
      { ...VALID, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' },
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ],
    [
      'clave solo con espacios',
      { ...VALID, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '   ' },
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ],
  ])('rechaza: %s, nombrando la variable', (_caso, source, name) => {
    expect(() => parseSupabaseEnv(source)).toThrow(name);
  });

  it('no incluye los valores en el mensaje de error', () => {
    const secretLike = 'valor-que-no-debe-aparecer';
    try {
      parseSupabaseEnv({
        NEXT_PUBLIC_SUPABASE_URL: secretLike,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      });
      expect.unreachable('debia lanzar');
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(secretLike);
    }
  });
});

describe('getSupabaseEnv (evaluacion perezosa)', () => {
  it('lee process.env al llamarse, no al importar el modulo', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    expect(() => getSupabaseEnv()).toThrow('NEXT_PUBLIC_SUPABASE_URL');

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', VALID.NEXT_PUBLIC_SUPABASE_URL);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', VALID.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    expect(getSupabaseEnv()).toEqual(VALID);
  });
});
