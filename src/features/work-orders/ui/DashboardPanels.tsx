import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';
import { cn } from '@/components/ui/cn';
import { ENTITY_LABEL, ENTITY_PATH, actionLabel } from '@/features/activity/constants';
import type { RecentActivity } from '@/features/activity/service';
import { formatDate, formatDateTime } from '@/lib/records/format';

import type { OrderStatus } from '../constants';
import type { DashboardData } from '../service';

import { OrderPriorityBadge } from './OrderBadges';

const STATUS_ACCENT: Record<OrderStatus, string> = {
  pending: 'border-l-warning',
  assigned: 'border-l-info',
  in_progress: 'border-l-accent',
  completed: 'border-l-success',
  cancelled: 'border-l-line-strong',
};

const PLURAL_LABEL: Record<OrderStatus, string> = {
  pending: 'Pendientes',
  assigned: 'Asignadas',
  in_progress: 'En curso',
  completed: 'Completadas',
  cancelled: 'Canceladas',
};

const STATUS_ORDER: readonly OrderStatus[] = [
  'pending',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
];

const TILE = 'flex min-w-0 justify-between rounded-lg border border-line border-l-4';
const SUMMARY = cn(TILE, 'flex-col gap-1 p-4');

/** Indicadores de órdenes derivados de las filas persistidas (nunca cifras inventadas). */
export function OrderIndicators({ data }: Readonly<{ data: DashboardData | null }>) {
  if (!data) {
    return (
      <Alert tone="warning" title="Indicadores no disponibles">
        No se pudieron calcular los indicadores de órdenes. Recarga la página para reintentar.
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {/* Primero lo que pide atención (abiertas y vencidas); debajo, el desglose por estado. */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className={cn(SUMMARY, 'col-span-2 border-l-accent bg-surface sm:col-span-1')}>
          <dt className="text-sm font-medium text-ink">Órdenes abiertas</dt>
          <dd data-testid="orders-open" className="text-3xl font-semibold tabular-nums">
            {data.open}
          </dd>
        </div>
        <div
          className={cn(
            SUMMARY,
            data.overdue > 0 ? 'border-l-danger bg-danger-soft' : 'border-l-line-strong bg-surface',
          )}
        >
          <dt className="text-sm font-medium text-ink">Abiertas con fecha vencida</dt>
          <dd data-testid="orders-overdue" className="text-3xl font-semibold tabular-nums">
            {data.overdue}
          </dd>
        </div>
        <div className={cn(SUMMARY, 'border-l-line-strong bg-surface')}>
          <dt className="text-sm font-medium text-ink">Órdenes en total</dt>
          <dd data-testid="orders-total" className="text-3xl font-semibold tabular-nums">
            {data.total}
          </dd>
        </div>
      </dl>
      <ul
        aria-label="Órdenes por estado"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        {STATUS_ORDER.map((status) => (
          <li key={status} className="min-w-0">
            <Link
              href={`/orders?estado=${status}`}
              className={cn(
                TILE,
                STATUS_ACCENT[status],
                'h-full min-h-12 flex-wrap items-center gap-x-3 bg-surface px-3 py-2.5 hover:bg-sunken',
              )}
            >
              <span className="text-sm text-ink-muted">{PLURAL_LABEL[status]}</span>
              <span
                data-testid={`orders-${status}`}
                className="text-xl font-semibold tracking-tight text-ink tabular-nums"
              >
                {data.counts[status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PendingOrders({ data }: Readonly<{ data: DashboardData | null }>) {
  if (!data) return null;
  if (data.pending.length === 0) {
    return (
      <EmptyState
        title="No hay órdenes pendientes"
        action={<LinkButton href="/orders/new">Nueva orden</LinkButton>}
      >
        Las órdenes sin técnico asignado aparecerán aquí, de la más antigua a la más reciente.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        {data.pending.map((order) => (
          <li
            key={order.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
          >
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/orders/${order.id}`}
                className="inline-flex min-h-10 items-center font-medium [overflow-wrap:anywhere] text-accent hover:underline md:min-h-6"
              >
                {order.title}
              </Link>
              <span className="text-sm [overflow-wrap:anywhere] text-ink-muted">
                {order.customerName} · {formatDate(order.scheduledDate)}
              </span>
            </div>
            <OrderPriorityBadge priority={order.priority} />
          </li>
        ))}
      </ul>
      {data.counts.pending > data.pending.length ? (
        <Link
          href="/orders?estado=pending"
          className="inline-flex min-h-10 w-fit items-center text-sm font-medium text-accent hover:underline"
        >
          Ver las {data.counts.pending} órdenes pendientes
        </Link>
      ) : null}
    </div>
  );
}

// Textos breves del panel para órdenes, clientes y técnicos. El inventario usa las etiquetas por
// entidad de `actionLabel` ('created' de un artículo no es una orden creada).
const ACTION_LABEL: Partial<Record<RecentActivity['action'], string>> = {
  created: 'Orden creada',
  assigned: 'Técnico asignado',
  reassigned: 'Técnico reasignado',
  status_changed: 'Cambio de estado',
  cancelled: 'Orden cancelada',
  archived: 'Archivado',
  restored: 'Restaurado',
};
const ACTOR_LABEL = { self: 'Tú', member: 'Miembro', former: 'Antiguo miembro' } as const;

function recentLabel({ entityType, action }: RecentActivity): string {
  const short = entityType === 'inventory_item' ? undefined : ACTION_LABEL[action];
  return short ?? actionLabel(entityType, action);
}

export function RecentActivityList({
  items,
}: Readonly<{ items: readonly RecentActivity[] | null }>) {
  if (!items) return <Alert tone="warning">No se pudo cargar la actividad reciente.</Alert>;
  if (items.length === 0) {
    return (
      <EmptyState title="Sin actividad todavía">
        Aquí verás los últimos cambios de órdenes, clientes, técnicos e inventario.
      </EmptyState>
    );
  }
  return (
    <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-0.5 px-4 py-3">
          <span className="text-sm font-medium">
            {recentLabel(item)}
            {' · '}
            <Link
              href={`${ENTITY_PATH[item.entityType]}/${item.entityId}`}
              className="text-accent underline underline-offset-2 [overflow-wrap:anywhere]"
            >
              {item.entityLabel ?? ENTITY_LABEL[item.entityType]}
            </Link>
          </span>
          <span className="text-sm text-ink-muted">
            <time dateTime={item.occurredAt}>{formatDateTime(item.occurredAt)}</time> ·{' '}
            {ACTOR_LABEL[item.actor]}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function QuickActions() {
  return (
    <nav aria-label="Accesos rápidos" className="flex flex-wrap gap-3">
      <LinkButton href="/orders/new">Nueva orden</LinkButton>
      <LinkButton href="/orders" variant="secondary">
        Ver órdenes
      </LinkButton>
      <LinkButton href="/customers/new" variant="secondary">
        Nuevo cliente
      </LinkButton>
      <LinkButton href="/technicians/new" variant="secondary">
        Nuevo técnico
      </LinkButton>
    </nav>
  );
}
