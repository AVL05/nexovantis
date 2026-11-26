import Link from 'next/link';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';
import { Table, Td, Th } from '@/components/ui/Table';
import { formatDateTime } from '@/lib/records/format';

import {
  ACTOR_LABEL,
  ENTITY_LABEL,
  ENTITY_PATH,
  actionLabel,
  type ActivityAction,
  type ActivityEntity,
} from '../constants';
import { hasActiveFilters, type ActivityListParams } from '../params';
import type { ActivityDetail, ActivityEntry } from '../service';

const ENTITY_TONE: Record<ActivityEntity, BadgeTone> = {
  customer: 'info',
  technician: 'info',
  work_order: 'neutral',
  quote: 'warning',
  inventory_item: 'success',
};

const LINK = 'font-medium text-accent [overflow-wrap:anywhere] hover:underline';
// Enlace dentro de una frase: subrayado siempre, para no distinguirse solo por el color.
const INLINE_LINK = 'font-medium text-accent underline underline-offset-2 [overflow-wrap:anywhere]';

const SIGN: Partial<Record<ActivityAction, string>> = {
  stock_in: '+',
  stock_out: '−',
  stock_consumed: '−',
};
const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

function Detail({
  entry,
  detail,
}: Readonly<{ entry: ActivityEntry; detail: ActivityDetail | null }>) {
  if (!detail) return null;
  const unit = detail.unit ? ` ${detail.unit}` : '';
  return (
    <span className="block text-sm text-ink-muted tabular-nums">
      {SIGN[entry.action] ?? ''}
      {nf.format(detail.quantity)}
      {unit} · saldo {nf.format(detail.balanceBefore)} → {nf.format(detail.balanceAfter)}
      {detail.orderId ? (
        <>
          {' · '}
          <Link href={`/orders/${detail.orderId}`} className={INLINE_LINK}>
            {detail.orderTitle ?? 'Orden de servicio'}
          </Link>
        </>
      ) : null}
    </span>
  );
}

function EntityLink({ entry }: Readonly<{ entry: ActivityEntry }>) {
  return (
    <Link href={`${ENTITY_PATH[entry.entityType]}/${entry.entityId}`} className={LINK}>
      {entry.entityLabel ?? ENTITY_LABEL[entry.entityType]}
    </Link>
  );
}

/**
 * Actividad en solo lectura: tabla desde 1024 px y lista de tarjetas en móvil (sin scroll horizontal
 * de página). Cada evento muestra qué ocurrió, sobre qué entidad (con enlace), cuándo y quién lo hizo.
 */
export function ActivityList({
  items,
  params,
  skipped = false,
}: Readonly<{
  items: readonly ActivityEntry[];
  params: ActivityListParams;
  /** Rango incoherente: no se consulta y se explica en los filtros. */
  skipped?: boolean;
}>) {
  if (items.length === 0) {
    if (skipped) return null;
    if (hasActiveFilters(params)) {
      return (
        <EmptyState
          headingLevel="h2"
          title="No hay actividad que coincida"
          action={
            <LinkButton href="/activity" variant="secondary">
              Limpiar filtros
            </LinkButton>
          }
        >
          Prueba con otra entidad, otra acción o un rango de fechas distinto.
        </EmptyState>
      );
    }
    return (
      <EmptyState headingLevel="h2" title="Todavía no hay actividad">
        Aquí aparecerán los cambios de clientes, técnicos, órdenes, presupuestos e inventario, con
        quién los hizo y cuándo.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <Table caption="Registro de actividad">
          <thead>
            <tr>
              <Th className="w-px whitespace-nowrap">Fecha</Th>
              <Th className="w-px whitespace-nowrap">Entidad</Th>
              <Th>Evento</Th>
              <Th className="w-px whitespace-nowrap">Quién</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr key={entry.id}>
                <Td className="whitespace-nowrap">
                  <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time>
                </Td>
                <Td className="whitespace-nowrap">
                  <Badge tone={ENTITY_TONE[entry.entityType]}>
                    {ENTITY_LABEL[entry.entityType]}
                  </Badge>
                </Td>
                <Td className="max-w-0 min-w-64">
                  <span className="block font-medium">
                    {actionLabel(entry.entityType, entry.action)}
                  </span>
                  <EntityLink entry={entry} />
                  <Detail entry={entry} detail={entry.detail} />
                </Td>
                <Td className="whitespace-nowrap">{ACTOR_LABEL[entry.actor]}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <ol aria-label="Registro de actividad" className="flex flex-col gap-3 lg:hidden">
        {items.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">{actionLabel(entry.entityType, entry.action)}</span>
              <Badge tone={ENTITY_TONE[entry.entityType]}>{ENTITY_LABEL[entry.entityType]}</Badge>
            </div>
            <div>
              <EntityLink entry={entry} />
              <Detail entry={entry} detail={entry.detail} />
            </div>
            <span className="text-ink-muted">
              <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time> ·{' '}
              {ACTOR_LABEL[entry.actor]}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
