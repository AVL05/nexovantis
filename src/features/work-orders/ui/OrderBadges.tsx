import { Badge, type BadgeTone } from '@/components/ui/Badge';

import { PRIORITY_LABEL, STATUS_LABEL, type OrderPriority, type OrderStatus } from '../constants';

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending: 'warning',
  assigned: 'info',
  in_progress: 'info',
  completed: 'success',
  cancelled: 'neutral',
};

const PRIORITY_TONE: Record<OrderPriority, BadgeTone> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  urgent: 'danger',
};

/** El significado va siempre en el texto; el color solo lo refuerza. */
export function OrderStatusBadge({ status }: Readonly<{ status: OrderStatus }>) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function OrderPriorityBadge({ priority }: Readonly<{ priority: OrderPriority }>) {
  return <Badge tone={PRIORITY_TONE[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
}
