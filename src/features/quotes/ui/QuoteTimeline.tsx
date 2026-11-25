import { formatDateTime } from '@/lib/records/format';

import type { QuoteHistoryEntry } from '../service';

const ACTOR_LABEL = {
  self: 'Tú',
  member: 'Miembro de la organización',
  former: 'Antiguo miembro de la organización',
} as const;

const ACTION_LABEL = {
  created: 'Presupuesto creado',
  accepted: 'Presupuesto aceptado · orden de servicio generada',
  rejected: 'Presupuesto rechazado',
} as const;

/** Historial del presupuesto (más reciente primero). El actor es siempre un usuario identificado. */
export function QuoteTimeline({ items }: Readonly<{ items: readonly QuoteHistoryEntry[] }>) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-muted">Sin movimientos registrados.</p>;
  }
  return (
    <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-0.5 px-4 py-3">
          <span className="text-sm font-medium">{ACTION_LABEL[entry.action]}</span>
          <span className="text-sm text-ink-muted">
            <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time> ·{' '}
            {ACTOR_LABEL[entry.actor]}
          </span>
        </li>
      ))}
    </ol>
  );
}
