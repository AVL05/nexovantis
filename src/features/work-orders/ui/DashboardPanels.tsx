import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';
import { cn } from '@/components/ui/cn';
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

const TILE =
  'flex min-h-24 min-w-0 flex-col justify-between gap-1 rounded-lg border border-line border-l-4 bg-surface p-4';

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
    <div className="flex flex-col gap-4">
      <ul
        aria-label="Órdenes por estado"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        {STATUS_ORDER.map((status) => (
          <li key={status} className="min-w-0">
            <Link
              href={`/orders?estado=${status}`}
              className={cn(TILE, STATUS_ACCENT[status], 'h-full hover:bg-sunken')}
            >
              <span className="text-sm text-ink-muted">{PLURAL_LABEL[status]}</span>
              <span
                data-testid={`orders-${status}`}
                className="text-2xl font-semibold tracking-tight text-ink tabular-nums"
              >
                {data.counts[status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className={cn(TILE, 'border-l-ink')}>
          <dt className="text-sm text-ink-muted">Órdenes abiertas</dt>
          <dd data-testid="orders-open" className="text-2xl font-semibold tabular-nums">
            {data.open}
          </dd>
        </div>
        <div className={cn(TILE, data.overdue > 0 ? 'border-l-danger' : 'border-l-line-strong')}>
          <dt className="text-sm text-ink-muted">Abiertas con fecha vencida</dt>
          <dd data-testid="orders-overdue" className="text-2xl font-semibold tabular-nums">
            {data.overdue}
          </dd>
        </div>
        <div className={cn(TILE, 'border-l-line-strong')}>
          <dt className="text-sm text-ink-muted">Órdenes en total</dt>
          <dd data-testid="orders-total" className="text-2xl font-semibold tabular-nums">
            {data.total}
          </dd>
        </div>
      </dl>
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
                className="min-h-6 font-medium break-words text-accent hover:underline"
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

const ACTION_LABEL: Record<RecentActivity['action'], string> = {
  created: 'Orden creada',
  assigned: 'Técnico asignado',
  reassigned: 'Técnico reasignado',
  status_changed: 'Cambio de estado',
  cancelled: 'Orden cancelada',
  archived: 'Archivado',
  restored: 'Restaurado',
};
const ENTITY_PATH = { work_order: '/orders', customer: '/customers', technician: '/technicians' };
const ENTITY_LABEL = { work_order: 'Orden', customer: 'Cliente', technician: 'Técnico' };
const ACTOR_LABEL = { self: 'Tú', member: 'Miembro', former: 'Antiguo miembro' } as const;

export function RecentActivityList({
  items,
}: Readonly<{ items: readonly RecentActivity[] | null }>) {
  if (!items) return <Alert tone="warning">No se pudo cargar la actividad reciente.</Alert>;
  if (items.length === 0) {
    return (
      <EmptyState title="Sin actividad todavía">
        Aquí verás los últimos cambios de órdenes, clientes y técnicos.
      </EmptyState>
    );
  }
  return (
    <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-0.5 px-4 py-3">
          <span className="text-sm font-medium">
            {ACTION_LABEL[item.action]}
            {' · '}
            <Link
              href={`${ENTITY_PATH[item.entityType]}/${item.entityId}`}
              className="text-accent [overflow-wrap:anywhere] hover:underline"
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
