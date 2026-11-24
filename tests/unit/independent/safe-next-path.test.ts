import { describe, expect, it } from 'vitest';

import { safeNextPath } from '@/features/auth/redirect';

// Prueba independiente de Testing (TASK-007, T7-06). Develop no la modifica.
// Contrato: `src/features/auth/redirect.ts` exporta
//   safeNextPath(value: unknown, fallback = '/dashboard'): string
// Funcion pura (sin importar modulos de servidor ni next/headers). Devuelve SIEMPRE una ruta
// relativa interna (empieza por una sola "/"), nunca un origen externo, tampoco tras decodificar.

const ORIGIN = 'http://localhost:3100';
const FALLBACK = '/dashboard';

function sameOrigin(path: string) {
  return new URL(path, ORIGIN).origin === ORIGIN;
}

function expectSafe(result: unknown, input: unknown) {
  const label = JSON.stringify(input);
  expect(typeof result, `entrada ${label}`).toBe('string');
  const path = result as string;
  expect(path.startsWith('/'), `entrada ${label}: debe empezar por /`).toBe(true);
  expect(path.startsWith('//'), `entrada ${label}: no puede ser protocol-relative`).toBe(false);
  expect(/[\\\t\r\n\0]/.test(path), `entrada ${label}: caracteres de control o \\`).toBe(false);
  expect(sameOrigin(path), `entrada ${label}: sale del origen`).toBe(true);
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Una codificacion invalida no es decodificable: se trata como ruta literal.
  }
  const decodedEscapes = decoded.startsWith('//') || /^\/[\\\t\r\n]/.test(decoded);
  expect(decodedEscapes, `entrada ${label}: la version decodificada sale del origen`).toBe(false);
  // Idempotente: aplicar de nuevo no cambia el resultado.
  expect(safeNextPath(path)).toBe(path);
}

const clearlyExternal = [
  '//evil.example',
  '//evil.example/dashboard',
  '///evil.example',
  '////evil.example',
  '/\\evil.example',
  '/\\/evil.example',
  '\\\\evil.example',
  '\\evil.example',
  'https://evil.example',
  'http://evil.example/dashboard',
  'HTTPS://EVIL.EXAMPLE',
  'ftp://evil.example',
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'evil.example',
  'evil.example/dashboard',
  'dashboard',
  '',
  '   ',
  '%2F%2Fevil.example',
  '//%2Fevil.example',
];

const ambiguous = [
  '/%2F%2Fevil.example',
  '/%2f%2fevil.example',
  '/%5Cevil.example',
  '/%5cevil.example',
  '/\t/evil.example',
  '/\n/evil.example',
  '/\r/evil.example',
  '/\r\n/evil.example',
  '/\0/evil.example',
  ' //evil.example',
  '\t//evil.example',
  '\n//evil.example',
  '/ /evil.example',
  '/dashboard\r\nSet-Cookie: a=b',
  '/dashboard\\..\\..\\evil.example',
  '/dashboard/..//evil.example',
  '/dashboard/../../evil.example',
  '/@evil.example',
  '/.evil.example',
  '/dashboard@evil.example',
  '/%09/evil.example',
  '/%0a/evil.example',
  '/%0d/evil.example',
  '/%E0%A4%A',
  `/${'a'.repeat(5000)}`,
  `//${'a'.repeat(5000)}`,
];

describe('safeNextPath: valores validos', () => {
  it('conserva /dashboard', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
  });

  it('conserva una subruta interna con query', () => {
    const result = safeNextPath('/dashboard/ajustes?pestana=1');
    expectSafe(result, '/dashboard/ajustes?pestana=1');
  });
});

describe('safeNextPath: destinos externos o ambiguos', () => {
  it.each(clearlyExternal)('rechaza %j y devuelve el valor por defecto', (input) => {
    expect(safeNextPath(input)).toBe(FALLBACK);
  });

  it.each([...clearlyExternal, ...ambiguous])(
    'el resultado para %j es siempre interno',
    (input) => {
      expectSafe(safeNextPath(input), input);
    },
  );

  it('usa el valor por defecto indicado cuando se rechaza', () => {
    expect(safeNextPath('//evil.example', '/inicio')).toBe('/inicio');
    expect(safeNextPath('https://evil.example', '/inicio')).toBe('/inicio');
  });
});

describe('safeNextPath: tipos no cadena', () => {
  it.each([undefined, null, 0, 42, true, false, {}, { toString: () => '//evil.example' }])(
    'devuelve el valor por defecto para %j',
    (input) => {
      expect(safeNextPath(input)).toBe(FALLBACK);
    },
  );

  it.each([
    [['//evil.example']],
    [['/dashboard', '//evil.example']],
    [['https://evil.example']],
    [[]],
  ])('una lista (parametro repetido) %j nunca sale del origen', (input) => {
    expectSafe(safeNextPath(input), input);
  });
});
