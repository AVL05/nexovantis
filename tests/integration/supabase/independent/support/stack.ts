import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

import { requireLocalSupabaseEnv } from '../../../../support/local-supabase';

// Soporte de las suites independientes de Testing contra el stack LOCAL de Supabase (TASK-010).
// Propietario: Testing. El destino se valida con tests/support/local-supabase.ts ANTES de crear
// cualquier cliente. La clave de servicio solo prepara datos y lee estado para verificar; las
// comprobaciones de acceso usan clientes de usuario. Contrasenas generadas al ejecutar.

export const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export type Actor = { id: string; email: string; password: string; client: SupabaseClient };
export type Org = { id: string; name: string };
export type Stack = {
  url: string;
  anonKey: string;
  run: string;
  admin: SupabaseClient;
  anon: SupabaseClient;
  orgA: Org;
  orgB: Org;
  ownerA: Actor;
  memberA: Actor;
  ownerB: Actor;
};

export function must<T>(
  result: { data: T | null; error: { message: string } | null },
  what: string,
): T {
  if (result.error || result.data === null) {
    throw new Error(`Preparacion fallida (${what}): ${result.error?.message ?? 'sin datos'}`);
  }
  return result.data;
}

export async function createActor(
  admin: SupabaseClient,
  url: string,
  anonKey: string,
  label: string,
  run: string,
): Promise<Actor> {
  const email = `${label}-${run}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const user = created.data.user;
  if (created.error || !user) {
    throw new Error(`Preparacion fallida (usuario ${label}): ${created.error?.message}`);
  }
  const client = createClient(url, anonKey, authOptions);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) {
    throw new Error(`Preparacion fallida (login ${label}): ${signedIn.error.message}`);
  }
  return { id: user.id, email, password, client };
}

/** Entorno validado (solo stack local) y clientes admin/anon, sin crear usuarios ni datos. */
export function localBase() {
  const { url, anonKey, serviceKey } = requireLocalSupabaseEnv();
  const admin = createClient(url, serviceKey, authOptions);
  const anon = createClient(url, anonKey, authOptions);
  return { url, anonKey, admin, anon, run: randomUUID().slice(0, 8) };
}

/** Dos organizaciones, propietario y miembro de A, propietario de B. `prefix` etiqueta los datos. */
export async function buildStack(prefix: string): Promise<Stack> {
  const { url, anonKey, admin, anon, run } = localBase();

  const orgs = must(
    await admin
      .from('organizations')
      .insert([{ name: `${prefix} Alfa ${run}` }, { name: `${prefix} Beta ${run}` }])
      .select('id, name')
      .order('name'),
    'organizaciones',
  ) as Org[];
  const [orgA, orgB] = orgs;

  const ownerA = await createActor(admin, url, anonKey, `${prefix}-owner-a`, run);
  const memberA = await createActor(admin, url, anonKey, `${prefix}-member-a`, run);
  const ownerB = await createActor(admin, url, anonKey, `${prefix}-owner-b`, run);
  must(
    await admin
      .from('memberships')
      .insert([
        { organization_id: orgA.id, user_id: ownerA.id, role: 'owner' },
        { organization_id: orgA.id, user_id: memberA.id, role: 'member' },
        { organization_id: orgB.id, user_id: ownerB.id, role: 'owner' },
      ])
      .select('user_id'),
    'membresias',
  );
  return { url, anonKey, run, admin, anon, orgA, orgB, ownerA, memberA, ownerB };
}
