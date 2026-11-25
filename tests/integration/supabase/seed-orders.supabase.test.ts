// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  assertServerPort,
  assertSameStack,
  LOCAL_PSQL,
  prepareLocalPsql,
  type PsqlInvocation,
} from '../../support/local-psql-guard';
import { requireLocalSupabaseEnv } from '../../support/local-supabase';

// TASK-011-FIX: el seed demo de ordenes (supabase/seeds/demo-orders.sql) sobre un Supabase LOCAL
// AISLADO (job `supabase` de CI sobre una base recien creada): se ejecuta dos veces y debe ser
// idempotente, con los recuentos esperados. Necesita `psql` en el PATH. La conexion es FIJA al stack
// local de Supabase CLI (127.0.0.1:54322, postgres/postgres); SUPABASE_DB_URL solo se admite si es
// exactamente esa conexion y cualquier variable PG*/PSQLRC no autorizada se rechaza antes de escribir
// (tests/support/local-psql-guard.ts). psql corre con entorno construido desde cero y sin psqlrc.
// Si falta `psql` o el destino no es local, FALLA con un error claro (nunca se salta). Crea las
// organizaciones "Demo Norte" y "Demo Sur" con un owner cada una, asi que exige que NO existan ya.
// NO se ha ejecutado en local (sin Docker): lo valida CI.

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

let psql: PsqlInvocation;
let admin: SupabaseClient;
let norte: string;
let sur: string;

function requirePsql(): void {
  try {
    execFileSync('psql', ['--version'], { stdio: 'ignore', env: psql.env });
  } catch {
    throw new Error(
      'No se encontro `psql` en el PATH: instala el cliente de PostgreSQL para esta suite',
    );
  }
}

const psqlFile = (file: string) =>
  execFileSync('psql', psql.args(['-q', '-f', file]), {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: psql.env,
  });

const psqlQuery = (sql: string) =>
  execFileSync('psql', psql.args(['-At', '-F', '|', '-c', sql]), {
    encoding: 'utf8',
    env: psql.env,
  }).trim();

const psqlIds = (sql: string) => psqlQuery(sql).split('\n').filter(Boolean);

// Comprobacion cruzada de SOLO LECTURA: la API y PostgreSQL deben ser el mismo stack aislado.
async function assertSameLocalStack(): Promise<void> {
  // Cliente -> puerto publicado (54322); servidor -> puerto interno del contenedor (5432).
  const [showPort, inetPort] = psqlQuery(
    "select current_setting('port') || '|' || coalesce(inet_server_port()::text, '')",
  ).split('|');
  assertServerPort(showPort ?? '', inetPort ?? '', LOCAL_PSQL.port);
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error('No se pudo leer auth.users por la API');
  assertSameStack(
    'auth.users',
    users.data.users.map((u) => u.id),
    psqlIds('select id from auth.users'),
  );
  const orgs = await admin.from('organizations').select('id');
  if (orgs.error) throw new Error('No se pudo leer organizations por la API');
  assertSameStack(
    'organizations',
    (orgs.data ?? []).map((o) => String(o.id)),
    psqlIds('select id from public.organizations'),
  );
}

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
  // Orden obligatorio: guardas (sin efectos) -> psql -> cliente con service role -> lecturas de
  // verificacion cruzada -> escrituras.
  psql = prepareLocalPsql(process.env);
  const env = requireLocalSupabaseEnv();
  requirePsql();
  admin = createClient(env.url, env.serviceKey, authOptions);
  await assertSameLocalStack();
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
  // Lo creado por la API debe verse en PostgreSQL antes de sembrar nada.
  assertSameStack(
    'organizaciones creadas',
    [norte, sur],
    psqlIds(`select id from public.organizations where id in ('${norte}','${sur}')`),
  );
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
