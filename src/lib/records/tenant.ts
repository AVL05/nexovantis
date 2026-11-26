import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { DASHBOARD_PATH } from '@/features/auth/routes';
import { requireMembership } from '@/features/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

/** Contexto de una operación: cliente del usuario (RLS) y organización verificada en servidor. */
export type TenantContext = {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  userId: string;
};

/**
 * Identidad + membresía verificadas en servidor. La organización sale de `memberships`, nunca de
 * datos del cliente. Sin sesión redirige a /login; sin membresía, al panel (que muestra el
 * estado de acceso denegado). Se memoiza por solicitud.
 */
export const requireTenant = cache(
  async (): Promise<TenantContext & { organizationName: string }> => {
    const { user, membership } = await requireMembership();
    if (!membership) redirect(DASHBOARD_PATH);
    const supabase = await createClient();
    return {
      supabase,
      organizationId: membership.organizationId,
      organizationName: membership.organizationName,
      userId: user.id,
    };
  },
);
