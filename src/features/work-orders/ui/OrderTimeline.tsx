import { formatDateTime } from '@/lib/records/format';

import { STATUS_LABEL } from '../constants';
import type { OrderHistoryEntry } from '../service';

const ACTOR_LABEL = {
  self: 'Tú',
  member: 'Miembro de la organización',
  former: 'Antiguo miembro de la organización',
} as const;

function describe(entry: OrderHistoryEntry): string {
  const tech = entry.technicianName ? ` a ${entry.technicianName}` : '';
  switch (entry.action) {
    case 'created':
      return 'Orden creada';
    case 'assigned':
      return `Técnico asignado${tech}`;
    case 'reassigned':
      return `Técnico reasignado${tech}`;
    case 'cancelled':
      return 'Orden cancelada';
    case 'status_changed':
      return entry.toStatus ? `Estado: ${STATUS_LABEL[entry.toStatus]}` : 'Cambio de estado';
  }
}

/** Historial de la orden (más reciente primero). El actor es siempre un usuario identificado. */
export function OrderTimeline({ items }: Readonly<{ items: readonly OrderHistoryEntry[] }>) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-muted">Sin movimientos registrados.</p>;
  }
  return (
    <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-0.5 px-4 py-3">
          <span className="text-sm font-medium">{describe(entry)}</span>
          {entry.fromStatus && entry.toStatus ? (
            <span className="text-sm text-ink-muted">
              {STATUS_LABEL[entry.fromStatus]} → {STATUS_LABEL[entry.toStatus]}
            </span>
          ) : null}
          {entry.reason ? (
            <span className="text-sm [overflow-wrap:anywhere] text-ink-muted">
              Motivo: {entry.reason}
            </span>
          ) : null}
          <span className="text-sm text-ink-muted">
            <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time> ·{' '}
            {ACTOR_LABEL[entry.actor]}
          </span>
        </li>
      ))}
    </ol>
  );
}
