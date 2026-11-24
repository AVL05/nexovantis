import type { Metadata } from 'next';
import Link from 'next/link';

import { AppShell } from '@/components/shell/AppShell';
import { Badge } from '@/components/ui/Badge';
import { LogoutButton } from '@/features/auth/LogoutButton';
import { requireMembership } from '@/features/auth/session';
import { customerService } from '@/features/customers/service';
import { NAV_ITEMS } from '@/features/navigation/items';
import { technicianService } from '@/features/technicians/service';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Panel · Nexovantis' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL = { owner: 'Propietario', member: 'Miembro' } as const;

const UPCOMING_ORDERS = {
  title: 'Órdenes de servicio',
  text: 'Aquí seguirás el estado de cada orden, de la solicitud al cierre, cuando el módulo esté disponible.',
} as const;

const MODULES = [
  { title: 'Clientes', href: '/customers', description: 'Clientes activos' },
  { title: 'Técnicos', href: '/technicians', description: 'Técnicos activos' },
] as const;

/** Recuento exacto de activos (bajo RLS). Si falla, null: nunca se inventa una cifra. */
async function activeCounts(organizationId: string, userId: string) {
  try {
    const supabase = await createClient();
    const ctx = { supabase, organizationId, userId };
    const [customers, technicians] = await Promise.all([
      customerService.countActive(ctx),
      technicianService.countActive(ctx),
    ]);
    return [customers.ok ? customers.data : null, technicians.ok ? technicians.data : null];
  } catch {
    return [null, null];
  }
}

export default async function DashboardPage() {
  // Identidad, organizacion y rol salen del servidor (Auth + memberships bajo RLS).
  const { user, membership } = await requireMembership();

  if (!membership) {
    return (
      <AppShell
        items={NAV_ITEMS}
        current="dashboard"
        userEmail={user.email}
        actions={<LogoutButton />}
      >
        <div className="flex flex-col gap-6">
          <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
          <section
            data-testid="access-denied"
            className="flex max-w-xl flex-col gap-2 rounded-lg border-l-4 border-danger bg-surface p-5 shadow-card"
          >
            <h2 className="text-lg font-semibold">Acceso denegado</h2>
            <p className="text-sm text-ink-muted">
              Tu cuenta no pertenece a ninguna organización. Solicita acceso a un administrador de
              tu organización.
            </p>
          </section>
        </div>
      </AppShell>
    );
  }

  const counts = await activeCounts(membership.organizationId, user.id);

  return (
    <AppShell
      items={NAV_ITEMS}
      current="dashboard"
      organizationName={membership.organizationName}
      roleLabel={ROLE_LABEL[membership.role]}
      actions={<LogoutButton />}
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
          <p className="text-sm text-ink-muted">Sesión iniciada como {user.email}</p>
        </div>

        <section aria-labelledby="modulos" className="flex flex-col gap-4">
          <h2 id="modulos" className="text-base font-semibold">
            Módulos
          </h2>
          <div className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-24 flex-col gap-1 rounded-lg border border-line bg-surface p-5 hover:bg-sunken"
              >
                <span className="text-base font-semibold text-ink">{item.title}</span>
                <span className="text-sm text-ink-muted">{item.description}</span>
                <span
                  data-testid={`count-${item.href.slice(1)}`}
                  className="text-2xl font-semibold tracking-tight text-ink"
                >
                  {counts[index] ?? 'No disponible'}
                </span>
              </Link>
            ))}
            <div className="flex min-h-24 min-w-0 flex-col items-start gap-2 rounded-lg border border-dashed md:col-span-2 lg:col-span-1 border-line-strong bg-surface p-5">
              <div className="flex w-full min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <h3 className="text-base font-semibold text-ink">{UPCOMING_ORDERS.title}</h3>
                <Badge tone="info">Próximamente</Badge>
              </div>
              <p className="text-sm text-ink-muted">{UPCOMING_ORDERS.text}</p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
