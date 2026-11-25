import 'server-only';

import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

import { LOGIN_PATH } from './routes';

export type Role = 'owner' | 'member';

export type Membership = {
  organizationId: string;
  organizationName: string;
  role: Role;
};

export type AuthContext = {
  user: Pick<User, 'id' | 'email'>;
  /** null si el usuario autenticado no pertenece a ninguna organizacion. */
  membership: Membership | null;
};

const membershipRowSchema = z.object({
  organization_id: z.string(),
  role: z.enum(['owner', 'member']),
  organizations: z.object({ name: z.string() }),
});

/**
 * Devuelve el usuario autenticado o redirige a /login. Verifica la sesion contra Auth con
 * `getUser()` (no solo la firma del JWT): una cookie copiada antes del logout deja de autorizar.
 */
export async function requireUser(): Promise<Pick<User, 'id' | 'email'>> {
  let user: User | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    user = error ? null : data.user;
  } catch {
    user = null; // Configuracion o red no disponibles: se falla cerrado.
  }
  if (!user) redirect(LOGIN_PATH);
  return { id: user.id, email: user.email };
}

/**
 * Usuario autenticado + su membresia. La organizacion y el rol salen siempre de `memberships`
 * (con el cliente del usuario, bajo RLS), nunca de datos enviados por el cliente.
 */
export async function requireMembership(): Promise<AuthContext> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('organization_id, role, organizations(name)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw new Error('No se pudo consultar la membresia.');
  const parsed = membershipRowSchema.safeParse(data);
  if (!parsed.success) return { user, membership: null };
  return {
    user,
    membership: {
      organizationId: parsed.data.organization_id,
      organizationName: parsed.data.organizations.name,
      role: parsed.data.role,
    },
  };
}

/** True si hay un usuario autenticado y valido (sin redirigir). Para /login. */
export async function hasValidSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    return !error && data.user !== null;
  } catch {
    return false;
  }
}
