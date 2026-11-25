import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';

import { requireLocalSupabaseEnv } from '../../support/local-supabase';

// Soporte propio de crm.spec.ts (TASK-008B). Independiente del soporte de Testing. Crea dos
// organizaciones con propietario y miembro usando la clave de servicio del stack LOCAL SOLO en
// la preparacion; las comprobaciones se hacen siempre por la interfaz con sesiones de usuario.
// Entorno (job `supabase` de CI): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Si faltan, las pruebas fallan (no se saltan). Las URLs no locales se rechazan
// (tests/support/local-supabase.ts, antes de construir ningun cliente).

export type Org = { id: string; name: string };
export type CrmUser = { id: string; email: string; password: string };
export type CrmWorld = {
  run: string;
  orgA: Org;
  orgB: Org;
  ownerA: CrmUser;
  memberA: CrmUser;
  ownerB: CrmUser;
};

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error || result.data === null) {
    throw new Error(`Preparacion fallida (${what}): ${result.error?.message ?? 'sin datos'}`);
  }
  return result.data;
}

async function buildWorld(): Promise<CrmWorld> {
  const { url, serviceKey } = requireLocalSupabaseEnv();
  const admin: SupabaseClient = createClient(url, serviceKey, authOptions);
  const run = randomUUID().slice(0, 8);

  const orgs = must(
    await admin
      .from('organizations')
      .insert([{ name: `CRM Alfa ${run}` }, { name: `CRM Beta ${run}` }])
      .select('id, name')
      .order('name'),
    'crear organizaciones',
  ) as Org[];
  const [orgA, orgB] = orgs;

  const createUser = async (
    label: string,
    org: Org,
    role: 'owner' | 'member',
  ): Promise<CrmUser> => {
    const email = `crm-${label}-${run}-${randomBytes(3).toString('hex')}@example.test`;
    const password = randomBytes(24).toString('base64url');
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const user = created.data.user;
    if (created.error || !user) {
      throw new Error(`Preparacion fallida (usuario ${label}): ${created.error?.message}`);
    }
    must(
      await admin
        .from('memberships')
        .insert({ organization_id: org.id, user_id: user.id, role })
        .select('user_id'),
      `membresia ${label}`,
    );
    return { id: user.id, email, password };
  };

  return {
    run,
    orgA,
    orgB,
    ownerA: await createUser('owner-a', orgA, 'owner'),
    memberA: await createUser('member-a', orgA, 'member'),
    ownerB: await createUser('owner-b', orgB, 'owner'),
  };
}

let worldPromise: Promise<CrmWorld> | undefined;
/** Un mundo por proceso worker (memoizado). */
export function getCrmWorld(): Promise<CrmWorld> {
  worldPromise ??= buildWorld();
  return worldPromise;
}

/** Inicio de sesion por la interfaz (Server Action real contra Auth local). */
export async function loginAs(page: Page, user: CrmUser): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña').fill(user.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
