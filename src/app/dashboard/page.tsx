import type { Metadata } from 'next';

import { AppShell } from '@/components/shell/AppShell';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LogoutButton } from '@/features/auth/LogoutButton';
import { requireMembership } from '@/features/auth/session';
import { NAV_ITEMS } from '@/features/navigation/items';

export const metadata: Metadata = { title: 'Panel · Nexovantis' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL = { owner: 'Propietario', member: 'Miembro' } as const;

const UPCOMING = [
  {
    title: 'Clientes',
    text: 'Aquí verás tu cartera de clientes y sus datos de contacto cuando el módulo esté disponible.',
  },
  {
    title: 'Técnicos',
    text: 'Aquí gestionarás a tu equipo técnico y su disponibilidad cuando el módulo esté disponible.',
  },
  {
    title: 'Órdenes de servicio',
    text: 'Aquí seguirás el estado de cada orden, de la solicitud al cierre, cuando el módulo esté disponible.',
  },
] as const;

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

        <section aria-labelledby="proximos-modulos" className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <h2 id="proximos-modulos" className="text-base font-semibold">
              Módulos en preparación
            </h2>
            <Badge tone="info">Próximamente</Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {UPCOMING.map((item) => (
              <EmptyState key={item.title} title={item.title}>
                {item.text}
              </EmptyState>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
