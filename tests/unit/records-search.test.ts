import { describe, expect, it } from 'vitest';

import { buildSearchFilter, escapeLikePattern, quotePostgrestValue } from '@/lib/records/search';

const COLUMNS = ['name', 'email', 'phone'];

/**
 * Descompone un filtro `.or()` respetando las comillas dobles (con \ como escape). Si hay un
 * valor sin comillas, sin cerrar o texto inesperado fuera de comillas, lanza un error.
 */
function parseConditions(filter: string): { column: string; op: string; value: string }[] {
  const out: { column: string; op: string; value: string }[] = [];
  let i = 0;
  while (i < filter.length) {
    const head = /^([a-z_]+)\.(ilike)\./.exec(filter.slice(i));
    if (!head) throw new Error(`condicion inesperada en ${i}`);
    i += head[0].length;
    if (filter[i] !== '"') throw new Error('valor sin comillas');
    i += 1;
    let value = '';
    for (;;) {
      if (i >= filter.length) throw new Error('valor sin cerrar');
      const ch = filter[i];
      if (ch === '\\') {
        value += filter[i + 1];
        i += 2;
      } else if (ch === '"') {
        i += 1;
        break;
      } else {
        value += ch;
        i += 1;
      }
    }
    out.push({ column: head[1], op: head[2], value });
    if (i < filter.length) {
      if (filter[i] !== ',') throw new Error('separador inesperado');
      i += 1;
    }
  }
  return out;
}

describe('escapeLikePattern', () => {
  it('escapa los comodines de LIKE y la barra invertida', () => {
    expect(escapeLikePattern('100%_\\x')).toBe('100\\%\\_\\\\x');
    expect(escapeLikePattern('texto normal')).toBe('texto normal');
  });
});

describe('quotePostgrestValue', () => {
  it('entrecomilla y escapa comillas y barras', () => {
    expect(quotePostgrestValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe('buildSearchFilter', () => {
  it('devuelve null con termino vacio o solo espacios/control', () => {
    expect(buildSearchFilter('', COLUMNS)).toBeNull();
    expect(buildSearchFilter('   ', COLUMNS)).toBeNull();
    expect(buildSearchFilter('\n\t', COLUMNS)).toBeNull();
  });

  it('genera una condicion ilike por columna con el valor entre comillas', () => {
    expect(buildSearchFilter('ana', COLUMNS)).toBe(
      'name.ilike."%ana%",email.ilike."%ana%",phone.ilike."%ana%"',
    );
  });

  it.each([
    'a,organization_id.eq.00000000-0000-4000-8000-000000000000',
    'x),(archived_at.is.null',
    'a.b@example.test',
    'comilla"suelta',
    'barra\\final\\',
    '100%_ _%',
    'x"),or(name.ilike."%',
    '*wild*',
    'línea\nnueva\u0000nula',
    "o'brien; drop table customers; --",
  ])('el termino hostil %j no altera la estructura del filtro', (term) => {
    const filter = buildSearchFilter(term, COLUMNS) as string;
    const conditions = parseConditions(filter);
    expect(conditions.map((c) => c.column)).toEqual(COLUMNS);
    const values = new Set(conditions.map((c) => c.value));
    expect(values.size).toBe(1);
    const [value] = [...values];
    expect(value.startsWith('%')).toBe(true);
    expect(value.endsWith('%')).toBe(true);
    const inner = value.slice(1, -1);
    // Quitando los escapes de LIKE se recupera el termino (sin caracteres de control).
    const clean = term.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    expect(inner.replace(/\\([\\%_])/g, '$1')).toBe(clean);
    // Ningun % ni _ queda sin escapar dentro del termino.
    expect(/(^|[^\\])(\\\\)*[%_]/.test(inner)).toBe(false);
  });

  it('rechaza nombres de columna que no son constantes simples', () => {
    expect(() => buildSearchFilter('a', ['name.eq.1'])).toThrow();
    expect(() => buildSearchFilter('a', ['name,email'])).toThrow();
  });
});
