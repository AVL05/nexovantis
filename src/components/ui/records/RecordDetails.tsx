import type { ReactNode } from 'react';

import { formatDateTime } from '@/lib/records/format';
import type { RecordModule, RecordView } from '@/lib/records/types';

function Item({ term, children }: Readonly<{ term: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{term}</dt>
      <dd className="text-sm break-words text-ink">{children}</dd>
    </div>
  );
}

/** Datos de un registro en lista de definiciones. Fechas en es-ES. */
export function RecordDetails({
  module,
  record,
}: Readonly<{ module: RecordModule; record: RecordView }>) {
  return (
    <dl className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2 xl:grid-cols-3">
      <Item term={module.nameLabel}>{record.name}</Item>
      <Item term="Correo electrónico">
        <span className="[overflow-wrap:anywhere]">{record.email ?? 'No indicado'}</span>
      </Item>
      <Item term="Teléfono">
        <span className="whitespace-nowrap">{record.phone ?? 'No indicado'}</span>
      </Item>
      <Item term="Alta">{formatDateTime(record.createdAt)}</Item>
      <Item term="Última modificación">{formatDateTime(record.updatedAt)}</Item>
      {record.archivedAt ? (
        <Item term="Archivado el">{formatDateTime(record.archivedAt)}</Item>
      ) : null}
      <div className="flex flex-col gap-0.5 sm:col-span-2 xl:col-span-3">
        <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Notas</dt>
        <dd className="text-sm break-words whitespace-pre-wrap text-ink">
          {record.notes ?? 'Sin notas'}
        </dd>
      </div>
    </dl>
  );
}
