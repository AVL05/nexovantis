import { describe, expect, it } from 'vitest';

import { safeNextPath } from '@/features/auth/redirect';

// Prueba independiente de Testing (TASK-010 PRE, A02-07). Develop no la modifica.
// Complementa a safe-next-path.test.ts (TASK-007), que sigue vigente sin cambios.
//
// Defecto (AUDIT-002): safeNextPath rechazaba parametros legitimos codificados porque tras
// decodificar volvia a exigir "ruta interna" y el espacio decodificado (%20) o un "%" literal
// (%25) hacian fallar la comprobacion. Resultado: el usuario perdia su destino tras el login.
// Contrato: las rutas internas con parametros codificados se devuelven SIN cambios (idempotente);
// siguen rechazadas las formas que, al decodificarse, dejan de ser una ruta interna
// (protocol-relative, barra invertida, segmentos de punto, caracteres de control en el inicio).

const FALLBACK = '/dashboard';
const ORIGIN = 'http://localhost:3100';

const LEGIT = [
  '/customers?q=Mar%C3%ADa%20L%C3%B3pez',
  '/customers?q=100%25',
  '/customers?q=100%25&estado=archivados',
  '/technicians?q=Jos%C3%A9%20Mart%C3%ADnez&estado=todos&page=2',
  '/customers?q=a%26b%3Dc',
  '/customers?q=a%2Fb',
  '/customers?q=%C3%91o%C3%B1o%20S.L.',
  '/customers?q=a+b',
  '/customers?q=%25',
  '/customers?q=%2520',
  '/customers?q=',
  '/customers?q=%E2%80%99',
  '/customers/00000000-0000-4000-8000-000000000001?aviso=creado',
  '/dashboard',
  '/dashboard?x=1#seccion',
];

// Siguen siendo destinos peligrosos aunque lleven codificacion: deben dar el valor por defecto.
const STILL_REJECTED = [
  '/%2F%2Fevil.example',
  '/%2f%2fevil.example',
  '/%5Cevil.example',
  '/%5cevil.example',
  '/%252F%252Fevil.example',
  '/%255Cevil.example',
  '/%2e%2e/evil.example',
  '/%2E%2E/%2E%2E/evil.example',
  '/dashboard/%2e%2e/%2e%2e/evil.example',
  '//evil.example/customers?q=a%20b',
  '/\\evil.example?q=a%20b',
  'https://evil.example/customers?q=a%20b',
  'javascript:alert(1)//?q=%20',
  '%2F%2Fevil.example',
  '/customers?q=a b', // espacio sin codificar: no es una URL valida
];

describe('A02-07 safeNextPath: parametros legitimos codificados se conservan', () => {
  it.each(LEGIT)('conserva %s sin cambios', (input) => {
    expect(safeNextPath(input)).toBe(input);
  });

  it.each(LEGIT)('es idempotente y sigue en el mismo origen para %s', (input) => {
    const once = safeNextPath(input);
    expect(safeNextPath(once)).toBe(once);
    expect(new URL(once, ORIGIN).origin).toBe(ORIGIN);
    expect(once.startsWith('//')).toBe(false);
  });

  it('el valor por defecto indicado solo se usa cuando se rechaza', () => {
    expect(safeNextPath('/customers?q=100%25', '/inicio')).toBe('/customers?q=100%25');
    expect(safeNextPath('//evil.example', '/inicio')).toBe('/inicio');
  });

  it('un parametro repetido o con la ruta codificada completa se trata como dato, no como ruta', () => {
    // Si la ruta llega totalmente codificada (p. ej. sin decodificar por el framework), no es una
    // ruta interna que empiece por "/": se rechaza.
    expect(safeNextPath(encodeURIComponent('/customers?q=100%25'))).toBe(FALLBACK);
  });
});

describe('A02-07 safeNextPath: la codificacion no reabre redirecciones abiertas', () => {
  it.each(STILL_REJECTED)('rechaza %s y devuelve el valor por defecto', (input) => {
    expect(safeNextPath(input)).toBe(FALLBACK);
  });

  it.each([
    '/%09/evil.example',
    '/%0a/evil.example',
    '/%0d%0a//evil.example',
    '/%00/evil.example',
    '/customers?q=%0d%0aSet-Cookie:%20a=b',
    '/customers?q=%00',
  ])('para %s el resultado nunca sale del origen ni decodifica a una ruta externa', (input) => {
    const result = safeNextPath(input);
    expect(new URL(result, ORIGIN).origin).toBe(ORIGIN);
    expect(result.startsWith('//')).toBe(false);
    let decoded = result;
    try {
      decoded = decodeURIComponent(result);
    } catch {
      // Codificacion invalida: se evalua tal cual.
    }
    expect(decoded.startsWith('//')).toBe(false);
    expect(/^\/[\\\t\r\n]/.test(decoded)).toBe(false);
    expect(safeNextPath(result)).toBe(result);
  });
});
