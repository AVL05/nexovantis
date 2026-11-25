import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cancel = vi.hoisted(() => vi.fn());
const revalidate = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath: revalidate }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/records/tenant', () => ({ requireTenant: vi.fn(async () => ({})) }));
vi.mock('@/features/work-orders/service', () => ({ workOrderService: { cancel } }));

import { cancelOrderAction } from '@/features/work-orders/actions';
import { buildPsqlEnv, prepareLocalPsql } from '../../support/local-psql-guard';

const form = () => {
  const d = new FormData();
  d.set('id', '8f14e45f-ceea-467a-9575-0d9d3b8a1c11');
  d.set('reason', '');
  return d;
};
const idle = { status: 'idle' } as const;

describe('RETEST-3 H1: segunda cancelacion (TC-CANC-02)', () => {
  beforeEach(() => {
    cancel.mockReset();
    revalidate.mockReset();
  });

  it('segunda cancelacion: error y SIN revalidatePath', async () => {
    cancel.mockResolvedValue({ ok: true, data: { changed: false, alreadyCancelled: true } });
    expect(await cancelOrderAction(idle, form())).toEqual({
      status: 'error',
      message: 'La orden ya estaba cancelada.',
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('primera cancelacion revalida; completada (error del servicio) se rechaza sin revalidar', async () => {
    cancel.mockResolvedValueOnce({ ok: true, data: { changed: true, alreadyCancelled: false } });
    expect((await cancelOrderAction(idle, form())).status).toBe('success');
    expect(revalidate).toHaveBeenCalled();
    revalidate.mockReset();
    cancel.mockResolvedValueOnce({
      ok: false,
      message: 'No se puede cancelar una orden completada.',
    });
    expect(await cancelOrderAction(idle, form())).toEqual({
      status: 'error',
      message: 'No se puede cancelar una orden completada.',
    });
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe('RETEST-3 H2: guarda de psql (adversarial, sin conexiones)', () => {
  it('rechaza variables libpq que redirigen destino o credenciales, incluso vacias o en minusculas', () => {
    const names = [
      'PGHOSTADDR',
      'PGSERVICE',
      'PGSERVICEFILE',
      'PGSYSCONFDIR',
      'PGPASSFILE',
      'PGOPTIONS',
      'PGSSLMODE',
      'PGSSLROOTCERT',
      'PGCHANNELBINDING',
      'PGKRBSRVNAME',
      'PGGSSLIB',
      'PGREQUIRESSL',
      'PGTARGETSESSIONATTRS',
      'PGLOADBALANCEHOSTS',
      'PGAPPNAME',
      'PGCLIENTENCODING',
      'PGLOCALEDIR',
      'PGDATESTYLE',
      'PSQLRC',
      'pgservice',
      'PgHost',
    ];
    for (const n of names) {
      expect(() => buildPsqlEnv({ [n]: '' }), n).toThrow(/no autorizada/);
      expect(() => buildPsqlEnv({ [n]: 'x' }), n).toThrow(/no autorizada/);
    }
  });

  it('PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD solo con valor exacto; "localhost" no vale', () => {
    expect(() => buildPsqlEnv({ PGHOST: 'localhost' })).toThrow();
    expect(() => buildPsqlEnv({ PGHOST: '127.0.0.1 ' })).toThrow();
    expect(() => buildPsqlEnv({ PGPORT: '5432' })).toThrow();
    expect(() => buildPsqlEnv({ PGPASSWORD: 'otra' })).toThrow();
  });

  it('el entorno resultante no contiene HOME/APPDATA/USERPROFILE/PGSYSCONFDIR ni nada fuera de PATH+SystemRoot+PG fijas', () => {
    const env = buildPsqlEnv({
      PATH: '/bin',
      SystemRoot: 'C:\\Windows',
      HOME: '/h',
      APPDATA: 'C:\\a',
      USERPROFILE: 'C:\\u',
      LD_PRELOAD: '/x.so',
      SUPABASE_DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres ',
    });
    expect(Object.keys(env).sort()).toEqual(
      ['PATH', 'PGDATABASE', 'PGHOST', 'PGPASSWORD', 'PGPORT', 'PGUSER', 'SystemRoot'].sort(),
    );
    expect(Object.values(env).join(' ')).not.toMatch(/postgres(ql)?:\/\//);
  });

  it('los argumentos fijan -h 127.0.0.1 (no localhost) y no admiten sobreescritura previa', () => {
    const args = prepareLocalPsql({}).args(['-f', 'x.sql']);
    expect(args.indexOf('-h')).toBeGreaterThan(-1);
    expect(args[args.indexOf('-h') + 1]).toBe('127.0.0.1');
    expect(args.join(' ')).not.toMatch(/localhost/);
    expect(args.indexOf('-f')).toBeGreaterThan(args.indexOf('-d'));
  });

  it('el test del seed solo invoca psql con el entorno guardado y la API local se restringe', () => {
    const src = readFileSync('tests/integration/supabase/seed-orders.supabase.test.ts', 'utf8');
    const calls = src.match(/execFileSync\(/g) ?? [];
    const withEnv = src.match(/env:\s*psql\.env/g) ?? [];
    expect(calls.length).toBe(withEnv.length);
    expect(src).toMatch(/requireLocalSupabaseEnv\(\)/);
    expect(src).not.toMatch(
      /process.env.(SUPABASE_)?DB_URL|process.env.DATABASE_URL|process.env.SUPABASE_DB_URL/,
    );
  });

  it('los seeds cargados por psql no cambian de destino (sin meta-comandos \\ ni dblink/fdw/PROGRAM)', () => {
    for (const f of readdirSync('supabase/seeds').filter((x) => x.endsWith('.sql'))) {
      const sql = readFileSync(`supabase/seeds/${f}`, 'utf8');
      expect(sql, f).not.toMatch(/^[ \t]*\\/m);
      expect(sql, f).not.toMatch(
        /\bdblink\b|postgres_fdw|create\s+server|\bcopy\b[^;]*\bprogram\b/i,
      );
    }
  });
});
