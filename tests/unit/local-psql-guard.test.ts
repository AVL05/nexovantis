import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  assertServerPort,
  assertSameStack,
  AUTHORIZED_DB_URL,
  buildPsqlArgs,
  buildPsqlEnv,
  prepareLocalPsql,
} from '../support/local-psql-guard';

// Sin conexiones ni psql reales: solo la logica pura de la guarda.
describe('guarda de psql local (TASK-011-FIX2)', () => {
  it('rechaza URLs externas o distintas de la autorizada', () => {
    for (const url of [
      'postgresql://u:p@db.example.com:5432/postgres',
      'postgresql://postgres:postgres@localhost:54322/postgres',
      'postgresql://postgres:otra@127.0.0.1:54322/postgres',
      'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
    ]) {
      expect(() => buildPsqlEnv({ SUPABASE_DB_URL: url })).toThrow(/no es la conexion local/);
    }
  });

  it('admite sin URL o con la URL exactamente autorizada', () => {
    expect(() => buildPsqlEnv({})).not.toThrow();
    expect(() => buildPsqlEnv({ SUPABASE_DB_URL: AUTHORIZED_DB_URL })).not.toThrow();
  });

  it('no propaga la URL ni variables heredadas al entorno resultante', () => {
    const env = buildPsqlEnv({
      PATH: '/bin',
      HOME: '/home/x',
      SUPABASE_DB_URL: AUTHORIZED_DB_URL,
      PGHOST: '127.0.0.1',
      PGPASSWORD: 'postgres',
      SECRET_TOKEN: 'abc',
    });
    expect(env).toEqual({
      PATH: '/bin',
      PGHOST: '127.0.0.1',
      PGPORT: '54322',
      PGUSER: 'postgres',
      PGDATABASE: 'postgres',
      PGPASSWORD: 'postgres',
    });
  });

  it('rechaza PG* con valores no autorizados y PSQLRC/PGSERVICE/PGPASSFILE', () => {
    for (const name of [
      'PGHOST',
      'PGPORT',
      'PGSERVICE',
      'PGSERVICEFILE',
      'PGSYSCONFDIR',
      'PGPASSFILE',
      'PGOPTIONS',
      'PGSSLMODE',
      'PGCONNECT_TIMEOUT',
      'PSQLRC',
    ]) {
      expect(() => buildPsqlEnv({ [name]: 'remoto.example.com' }), name).toThrow(/no autorizada/);
    }
  });

  it('los argumentos incluyen -X, --no-psqlrc, conexion fija y ninguna URL', () => {
    const args = buildPsqlArgs(['-c', 'select 1']);
    expect(args.slice(0, 2)).toEqual(['-X', '--no-psqlrc']);
    expect(args).toEqual(expect.arrayContaining(['-h', '127.0.0.1', '-p', '54322']));
    expect(args.join(' ')).not.toMatch(/postgres(ql)?:\/\//);
    expect(args.slice(-2)).toEqual(['-c', 'select 1']);
  });

  it('prepareLocalPsql lanza antes de devolver nada si el entorno no es seguro', () => {
    expect(() => prepareLocalPsql({ PGSERVICE: 'x' })).toThrow();
    expect(prepareLocalPsql({}).env.PGHOST).toBe('127.0.0.1');
  });

  it('assertSameStack detecta stacks distintos', () => {
    expect(() => assertSameStack('t', ['a', 'b'], ['b', 'a'])).not.toThrow();
    expect(() => assertSameStack('t', ['a'], ['b'])).toThrow(/mismo stack/);
    expect(() => assertSameStack('t', ['a'], [])).toThrow(/mismo stack/);
  });

  it('puerto de servidor: solo 5432 interno con conexion al puerto publicado 54322', () => {
    expect(() => assertServerPort('5432', '5432')).not.toThrow();
    expect(() => assertServerPort('5432', '5432', '54322')).not.toThrow();
    expect(() => assertServerPort('54322', '54322')).toThrow(/puerto interno/);
    expect(() => assertServerPort('5433', '5433')).toThrow(/puerto interno/);
    expect(() => assertServerPort('5432', '5432', '5433')).toThrow(/puerto interno/);
    expect(() => assertServerPort('5432', '5432', '5432')).toThrow(/puerto interno/);
    expect(() => assertServerPort('5432', '54322')).toThrow(/puerto interno/);
    expect(() => assertServerPort('5432', '')).toThrow(/puerto interno/);
    for (const other of ['', '0', '15432', '5432x', '5432-5440', '6543']) {
      expect(() => assertServerPort(other, other)).toThrow(/puerto interno/);
    }
  });

  it('el test de integracion aplica la guarda antes de cualquier cliente o escritura', () => {
    const src = readFileSync('tests/integration/supabase/seed-orders.supabase.test.ts', 'utf8');
    const at = (needle: string) => src.indexOf(needle);
    const guard = at('prepareLocalPsql(process.env)');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(at('createClient(env.url'));
    expect(at('createClient(env.url')).toBeLessThan(at('await assertSameLocalStack()'));
    expect(at('await assertSameLocalStack()')).toBeLessThan(at("createOrg('Demo Norte'"));
    expect(src).not.toMatch(/process\.env\.SUPABASE_DB_URL/);
    expect(src).not.toMatch(/psql',\s*\[dbUrl/);
  });
});
