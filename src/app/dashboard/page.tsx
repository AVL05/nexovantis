import type { Metadata } from 'next';
import Link from 'next/link';

import { AppShell } from '@/components/shell/AppShell';
import { Badge } from '@/components/ui/Badge';
import { listRecentActivity } from '@/features/activity/service';
import { LogoutButton } from '@/features/auth/LogoutButton';
import { requireMembership } from '@/features/auth/session';
import { customerService } from '@/features/customers/service';
import { inventoryService } from '@/features/inventory/service';
import { NAV_ITEMS } from '@/features/navigation/items';
import { technicianService } from '@/features/technicians/service';
import { workOrderService } from '@/features/work-orders/service';
import {
  OrderIndicators,
  PendingOrders,
  QuickActions,
  RecentActivityList,
} from '@/features/work-orders/ui/DashboardPanels';
import { todayInMadrid } from '@/lib/records/format';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Panel · Nexovantis' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL = { owner: 'Propietario', member: 'Miembro' } as const;

/**
 * Datos del panel, todos derivados de filas persistidas bajo RLS. Si una consulta falla, devuelve
 * null para esa parte (se muestra "No disponible"): nunca se inventa una cifra.
 */
async function loadDashboard(organizationId: string, userId: string) {
  try {
    const supabase = await createClient();
    const ctx = { supabase, organizationId, userId };
    const [customers, technicians, orders, activity, inventory] = await Promise.all([
      customerService.countActive(ctx),
      technicianService.countActive(ctx),
      workOrderService.dashboard(ctx, todayInMadrid()),
      listRecentActivity(ctx, 10),
      inventoryService.alertCounts(ctx),
    ]);
    return {
      customers: customers.ok ? customers.data : null,
      technicians: technicians.ok ? technicians.data : null,
      orders: orders.ok ? orders.data : null,
      activity: activity.ok ? activity.data : null,
      inventory: inventory.ok ? inventory.data : null,
    };
  } catch {
    return { customers: null, technicians: null, orders: null, activity: null, inventory: null };
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

  const data = await loadDashboard(membership.organizationId, user.id);

  const modules = [
    {
      title: 'Clientes',
      href: '/customers',
      description: 'Clientes activos',
      testId: 'count-customers',
      value: data.customers,
    },
    {
      title: 'Técnicos',
      href: '/technicians',
      description: 'Técnicos activos',
      testId: 'count-technicians',
      value: data.technicians,
    },
    {
      title: 'Órdenes',
      href: '/orders',
      description: 'Órdenes abiertas',
      testId: 'count-orders',
      value: data.orders ? data.orders.open : null,
    },
    {
      title: 'Inventario',
      href: '/inventory',
      description: 'Artículos con stock bajo o agotados',
      testId: 'count-inventory',
      value: data.inventory ? data.inventory.low + data.inventory.out : null,
    },
  ];

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

        <section aria-labelledby="accesos" className="flex flex-col gap-3">
          <h2 id="accesos" className="text-base font-semibold">
            Accesos rápidos
          </h2>
          <QuickActions />
        </section>

        <section aria-labelledby="indicadores" className="flex flex-col gap-3">
          <h2 id="indicadores" className="text-base font-semibold">
            Órdenes por estado
          </h2>
          <OrderIndicators data={data.orders} />
        </section>

        <div className="grid items-start gap-8 xl:grid-cols-2">
          <section aria-labelledby="pendientes" className="flex min-w-0 flex-col gap-3">
            <h2 id="pendientes" className="text-base font-semibold">
              Órdenes pendientes
            </h2>
            <PendingOrders data={data.orders} />
          </section>
          <section aria-labelledby="actividad" className="flex min-w-0 flex-col gap-3">
            <h2 id="actividad" className="text-base font-semibold">
              Actividad reciente
            </h2>
            <RecentActivityList items={data.activity} />
          </section>
        </div>

        <section aria-labelledby="modulos" className="flex flex-col gap-4">
          <h2 id="modulos" className="text-base font-semibold">
            Módulos
          </h2>
          <div className="grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-24 min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-5 hover:bg-sunken"
              >
                <div className="flex w-full min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <span className="text-base font-semibold text-ink">{item.title}</span>
                  <Badge tone="info">Abrir</Badge>
                </div>
                <span className="text-sm text-ink-muted">{item.description}</span>
                <span
                  data-testid={item.testId}
                  className="text-2xl font-semibold tracking-tight text-ink"
                >
                  {item.value ?? 'No disponible'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
