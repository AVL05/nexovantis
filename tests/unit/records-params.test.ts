import { describe, expect, it } from 'vitest';

import {
  MAX_QUERY_LENGTH,
  PAGE_SIZE,
  buildListHref,
  normalizeQuery,
  pageCountFor,
  parseListParams,
} from '@/lib/records/params';

describe('parseListParams', () => {
  it('usa valores por defecto sin parametros', () => {
    expect(parseListParams({})).toEqual({ page: 1, q: '', status: 'activos' });
  });

  it('acepta valores validos', () => {
    expect(parseListParams({ pagina: '3', q: ' ana  lopez ', estado: 'archivados' })).toEqual({
      page: 3,
      q: 'ana lopez',
      status: 'archivados',
    });
    expect(parseListParams({ estado: 'todos' }).status).toBe('todos');
  });

  it.each(['0', '-1', 'abc', '1.5', '', '1e3', '99999999999', ' 2'])(
    'pagina no valida %j cae en 1',
    (value) => {
      expect(parseListParams({ pagina: value }).page).toBe(1);
    },
  );

  it('acota una pagina enorme pero valida', () => {
    expect(parseListParams({ pagina: '999999' }).page).toBe(100_000);
  });

  it('estado desconocido vuelve a activos', () => {
    expect(parseListParams({ estado: 'borrados' }).status).toBe('activos');
    expect(parseListParams({ estado: ['archivados', 'todos'] }).status).toBe('archivados');
  });

  it('usa el primer valor si el parametro se repite', () => {
    expect(parseListParams({ q: ['uno', 'dos'] }).q).toBe('uno');
  });

  it('acota q y elimina caracteres de control', () => {
    expect(parseListParams({ q: 'a\u0000b\nc' }).q).toBe('a b c');
    expect(parseListParams({ q: 'x'.repeat(500) }).q).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe('normalizeQuery / pageCountFor', () => {
  it('normaliza vacios', () => {
    expect(normalizeQuery(undefined)).toBe('');
    expect(normalizeQuery('   ')).toBe('');
  });

  it('calcula paginas (minimo 1)', () => {
    expect(pageCountFor(0)).toBe(1);
    expect(pageCountFor(PAGE_SIZE)).toBe(1);
    expect(pageCountFor(PAGE_SIZE + 1)).toBe(2);
    expect(PAGE_SIZE).toBe(20);
  });
});

describe('buildListHref', () => {
  it('omite los valores por defecto', () => {
    expect(buildListHref('/customers', {})).toBe('/customers');
    expect(buildListHref('/customers', { page: 1, q: '', status: 'activos' })).toBe('/customers');
  });

  it('incluye q, estado y pagina codificados', () => {
    expect(buildListHref('/customers', { q: 'a b&c', status: 'todos', page: 2 })).toBe(
      '/customers?q=a+b%26c&estado=todos&pagina=2',
    );
  });
});
