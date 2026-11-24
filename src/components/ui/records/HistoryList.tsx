import { formatDateTime } from '@/lib/records/format';

export type HistoryItem = {
  id: string;
  action: 'archived' | 'restored';
  occurredAt: string;
  actor: 'self' | 'member' | null;
};

const ACTION_LABEL = { archived: 'Archivado', restored: 'Restaurado' } as const;
const ACTOR_LABEL = { self: 'Tú', member: 'Miembro de la organización' } as const;

/** Historial de archivado/restauración. Solo muestra el actor si se conoce con datos reales. */
export function HistoryList({ items }: Readonly<{ items: readonly HistoryItem[] }>) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-muted">Sin movimientos de archivado ni restauración.</p>;
  }
  return (
    <ol className="flex max-w-3xl flex-col divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
          <span className="text-sm font-medium">{ACTION_LABEL[item.action]}</span>
          <time dateTime={item.occurredAt} className="text-sm text-ink-muted">
            {formatDateTime(item.occurredAt)}
          </time>
          {item.actor ? (
            <span className="text-sm text-ink-muted">· {ACTOR_LABEL[item.actor]}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
