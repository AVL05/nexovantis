import { Badge, type BadgeTone } from '@/components/ui/Badge';

import { STATUS_LABEL, type QuoteStatus } from '../constants';

const STATUS_TONE: Record<QuoteStatus, BadgeTone> = {
  draft: 'warning',
  accepted: 'success',
  rejected: 'neutral',
};

/** El significado va siempre en el texto; el color solo lo refuerza. */
export function QuoteStatusBadge({ status }: Readonly<{ status: QuoteStatus }>) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
