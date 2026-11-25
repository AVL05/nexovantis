// Tipos, etiquetas y rutas de la página de actividad (funciones puras, sin servidor). Los valores
// admitidos los fija la base (CHECK de activity_events); aquí solo se decide cómo se muestran.

export const ACTIVITY_ENTITIES = [
  'customer',
  'technician',
  'work_order',
  'quote',
  'inventory_item',
] as const;
export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

export const ACTIVITY_ACTIONS = [
  'created',
  'status_changed',
  'assigned',
  'reassigned',
  'cancelled',
  'archived',
  'restored',
  'accepted',
  'rejected',
  'stock_in',
  'stock_out',
  'stock_consumed',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export function isActivityEntity(value: unknown): value is ActivityEntity {
  return typeof value === 'string' && (ACTIVITY_ENTITIES as readonly string[]).includes(value);
}

export function isActivityAction(value: unknown): value is ActivityAction {
  return typeof value === 'string' && (ACTIVITY_ACTIONS as readonly string[]).includes(value);
}

/** Valor de la URL (`entidad`) de cada entidad. */
export const ENTITY_PARAM: Record<ActivityEntity, string> = {
  customer: 'cliente',
  technician: 'tecnico',
  work_order: 'orden',
  quote: 'presupuesto',
  inventory_item: 'inventario',
};

export const ENTITY_LABEL: Record<ActivityEntity, string> = {
  customer: 'Cliente',
  technician: 'Técnico',
  work_order: 'Orden',
  quote: 'Presupuesto',
  inventory_item: 'Inventario',
};

/** Ruta del detalle de cada entidad. */
export const ENTITY_PATH: Record<ActivityEntity, string> = {
  customer: '/customers',
  technician: '/technicians',
  work_order: '/orders',
  quote: '/quotes',
  inventory_item: '/inventory',
};

export const ACTION_FILTER_LABEL: Record<ActivityAction, string> = {
  created: 'Creación',
  status_changed: 'Cambio de estado',
  assigned: 'Asignación',
  reassigned: 'Reasignación',
  cancelled: 'Cancelación',
  archived: 'Archivado',
  restored: 'Restauración',
  accepted: 'Aceptación',
  rejected: 'Rechazo',
  stock_in: 'Entrada de stock',
  stock_out: 'Salida de stock',
  stock_consumed: 'Consumo de stock',
};

const SPECIFIC: Partial<Record<ActivityEntity, Partial<Record<ActivityAction, string>>>> = {
  customer: { archived: 'Cliente archivado', restored: 'Cliente restaurado' },
  technician: { archived: 'Técnico archivado', restored: 'Técnico restaurado' },
  work_order: {
    created: 'Orden creada',
    status_changed: 'Cambio de estado de la orden',
    assigned: 'Técnico asignado',
    reassigned: 'Técnico reasignado',
    cancelled: 'Orden cancelada',
  },
  quote: {
    created: 'Presupuesto creado',
    accepted: 'Presupuesto aceptado',
    rejected: 'Presupuesto rechazado',
  },
  inventory_item: {
    created: 'Artículo creado',
    archived: 'Artículo archivado',
    restored: 'Artículo restaurado',
    stock_in: 'Entrada de stock',
    stock_out: 'Salida de stock',
    stock_consumed: 'Consumo en orden',
  },
};

/** Texto de un evento ("Orden creada", "Entrada de stock"…). */
export function actionLabel(entity: ActivityEntity, action: ActivityAction): string {
  return SPECIFIC[entity]?.[action] ?? ACTION_FILTER_LABEL[action];
}

export const ACTOR_LABEL = {
  self: 'Tú',
  member: 'Miembro de la organización',
  former: 'Antiguo miembro de la organización',
} as const;
export type ActivityActor = keyof typeof ACTOR_LABEL;
