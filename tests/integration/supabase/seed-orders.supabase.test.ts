// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { requireLocalSupabaseEnv } from '../../support/local-supabase';

// TASK-011-FIX: el seed demo de ordenes (supabase/seeds/demo-orders.sql) sobre un Supabase LOCAL
// AISLADO (job `supabase` de CI sobre una base recien creada): se ejecuta dos veces y debe ser
// idempotente, con los recuentos esperados. Necesita `psql` en el PATH. La base es SUPABASE_DB_URL o,
// si no esta definida, la URL estandar del stack local de Supabase CLI
// (postgresql://postgres:postgres@127.0.0.1:54322/postgres); cualquier destino no local se rechaza.
// Si falta `psql` o el destino no es local, FALLA con un error claro (nunca se salta). Crea las
// organizaciones "Demo Norte" y "Demo Sur" con un owner cada una, asi que exige que NO existan ya.
// NO se ha ejecutado en local (sin Docker): lo valida CI.

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const DEFAULT_LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const LOCAL_DB_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function requireLocalDbUrl(): string {
  const value = process.env.SUPABASE_DB_URL?.trim() || DEFAULT_LOCAL_DB_URL;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('SUPABASE_DB_URL no es una URL valida');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !LOCAL_DB_HOSTS.has(parsed.hostname)
  ) {
    throw new Error('SUPABASE_DB_URL no es un destino local autorizado');
  }
  return value;
}

function requirePsql(): void {
  try {
    execFileSync('psql', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      'No se encontro `psql` en el PATH: instala el cliente de PostgreSQL para esta suite',
    );
  }
}

let admin: SupabaseClient;
let dbUrl: string;
let norte: string;
let sur: string;

const psqlFile = (file: string) =>
  execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const psqlQuery = (sql: string) =>
  execFileSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-At', '-F', '|', '-c', sql], {
    encoding: 'utf8',
  }).trim();

const stats = (org: string) =>
  psqlQuery(
    `select count(*), count(*) filter (where status='pending'), count(*) filter (where status='assigned'),
            count(*) filter (where status='in_progress'), count(*) filter (where status='completed'),
            count(*) filter (where status='cancelled')
     from public.work_orders where organization_id = '${org}'`,
  );

const eventCount = () =>
  psqlQuery(`select count(*) from public.activity_events where entity_type = 'work_order'`);

const identityCount = () =>
  psqlQuery(`select count(*) from private.demo_fixture_identity where entity_type = 'work_order'`);

async function createOrg(name: string, run: string): Promise<string> {
  const org = await admin.from('organizations').insert({ name }).select('id').single();
  if (org.error || !org.data) throw new Error(`Preparacion fallida (organizacion ${name})`);
  const user = await admin.auth.admin.createUser({
    email: `seed-owner-${name.split(' ')[1].toLowerCase()}-${run}@example.test`,
    password: randomBytes(24).toString('base64url'),
    email_confirm: true,
  });
  if (user.error || !user.data.user) throw new Error(`Preparacion fallida (owner ${name})`);
  const member = await admin
    .from('memberships')
    .insert({ organization_id: org.data.id, user_id: user.data.user.id, role: 'owner' });
  if (member.error) throw new Error(`Preparacion fallida (membresia ${name})`);
  return String(org.data.id);
}

beforeAll(async () => {
  const env = requireLocalSupabaseEnv();
  dbUrl = requireLocalDbUrl();
  requirePsql();
  admin = createClient(env.url, env.serviceKey, authOptions);
  const existing = await admin
    .from('organizations')
    .select('id')
    .in('name', ['Demo Norte', 'Demo Sur']);
  if (existing.error || (existing.data ?? []).length > 0) {
    throw new Error(
      'Este test exige un Supabase aislado sin las organizaciones Demo Norte/Demo Sur',
    );
  }
  const run = randomUUID().slice(0, 8);
  norte = await createOrg('Demo Norte', run);
  sur = await createOrg('Demo Sur', run);
  psqlFile('supabase/seeds/demo-crm.sql');
}, 120_000);

describe('seed demo de ordenes en Supabase aislado', () => {
  it('dos ejecuciones: recuentos esperados, idempotente y sin eventos duplicados', () => {
    psqlFile('supabase/seeds/demo-orders.sql');
    expect(stats(norte)).toBe('15|5|3|2|4|1');
    expect(stats(sur)).toBe('7|2|1|1|2|1');
    const events = eventCount();
    expect(identityCount()).toBe('22');

    psqlFile('supabase/seeds/demo-orders.sql');
    expect(stats(norte)).toBe('15|5|3|2|4|1');
    expect(stats(sur)).toBe('7|2|1|1|2|1');
    expect(eventCount()).toBe(events);
    expect(identityCount()).toBe('22');
  });
});
