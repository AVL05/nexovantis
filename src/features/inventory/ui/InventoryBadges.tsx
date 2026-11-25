import { Badge, type BadgeTone } from '@/components/ui/Badge';

import { STOCK_LABEL, type StockStatus } from '../constants';

const STOCK_TONE: Record<StockStatus, BadgeTone> = {
  ok: 'success',
  low: 'warning',
  out: 'danger',
};

/** El significado va siempre en el texto; el color solo lo refuerza. */
export function StockBadge({ status }: Readonly<{ status: StockStatus }>) {
  return <Badge tone={STOCK_TONE[status]}>{STOCK_LABEL[status]}</Badge>;
}

export function ArchivedBadge() {
  return <Badge tone="neutral">Archivado</Badge>;
}

/** Estado de un artículo: un archivado muestra solo "Archivado" (sin indicador de stock). */
export function ItemStatusBadge({
  status,
  archived,
}: Readonly<{ status: StockStatus; archived: boolean }>) {
  return archived ? <ArchivedBadge /> : <StockBadge status={status} />;
}
