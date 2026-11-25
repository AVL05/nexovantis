// Constantes y reglas de presentación de las órdenes de servicio (funciones puras, sin servidor).
// Las reglas de verdad (matriz de transiciones, técnico válido, terminales) viven en PostgreSQL
// (supabase/migrations/20261126090000_task011_work_orders.sql); aquí solo se decide qué acciones
// ofrece la interfaz, y la base las vuelve a comprobar siempre.

export const ORDER_STATUSES = [
  'pending',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  assigned: 'Asignada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const PRIORITY_LABEL: Record<OrderPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

export const OPEN_STATUSES: readonly OrderStatus[] = ['pending', 'assigned', 'in_progress'];

export const ORDER_LIMITS = { title: 120, description: 2000, reason: 200 } as const;

export function isTerminal(status: OrderStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

/** Acciones que la interfaz ofrece según el estado (DH-01, DH-02, DH-03, DH-07). */
export function availableActions(status: OrderStatus): {
  edit: boolean;
  assign: boolean;
  reassign: boolean;
  start: boolean;
  complete: boolean;
  cancel: boolean;
} {
  return {
    edit: !isTerminal(status),
    assign: status === 'pending',
    reassign: status === 'assigned',
    start: status === 'assigned',
    complete: status === 'in_progress',
    cancel: !isTerminal(status),
  };
}

export type OrderEventAction =
  'created' | 'status_changed' | 'assigned' | 'reassigned' | 'cancelled';

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}
export function isOrderPriority(value: unknown): value is OrderPriority {
  return typeof value === 'string' && (ORDER_PRIORITIES as readonly string[]).includes(value);
}
