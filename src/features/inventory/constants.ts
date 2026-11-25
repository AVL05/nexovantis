// Constantes y reglas de presentación del inventario (funciones puras, sin servidor). Las reglas de
// verdad (saldo nunca negativo, movimientos positivos e idempotentes, archivado de solo lectura,
// consumo sobre órdenes abiertas) viven en PostgreSQL
// (supabase/migrations/20261128090000_task013_inventory.sql); aquí solo se decide qué ofrece la
// interfaz, y la base lo vuelve a comprobar siempre.

/** INV-1: cantidades enteras; la unidad es una etiqueta de lista cerrada. */
export const UNITS = ['ud', 'm', 'kg', 'l', 'caja'] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABEL: Record<Unit, string> = {
  ud: 'Unidades (ud)',
  m: 'Metros (m)',
  kg: 'Kilogramos (kg)',
  l: 'Litros (l)',
  caja: 'Cajas (caja)',
};

export function isUnit(value: unknown): value is Unit {
  return typeof value === 'string' && (UNITS as readonly string[]).includes(value);
}

/** INV-4: tipos de movimiento. Sin anulaciones ni borrados: la corrección es un movimiento contrario. */
export const MOVEMENT_KINDS = ['in', 'out', 'consumption'] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const KIND_LABEL: Record<MovementKind, string> = {
  in: 'Entrada',
  out: 'Salida',
  consumption: 'Consumo en orden',
};

export function isMovementKind(value: unknown): value is MovementKind {
  return typeof value === 'string' && (MOVEMENT_KINDS as readonly string[]).includes(value);
}

/** INV-7: agotado = saldo 0; bajo = saldo > 0 y <= umbral; umbral 0 desactiva "bajo". */
export type StockStatus = 'ok' | 'low' | 'out';

export function stockStatus(quantity: number, threshold: number): StockStatus {
  if (quantity <= 0) return 'out';
  return quantity <= threshold ? 'low' : 'ok';
}

export function isStockStatus(value: unknown): value is StockStatus {
  return value === 'ok' || value === 'low' || value === 'out';
}

export const STOCK_LABEL: Record<StockStatus, string> = {
  ok: 'Disponible',
  low: 'Stock bajo',
  out: 'Agotado',
};

/** INV-6: el consumo solo se vincula a órdenes no terminales. */
export const OPEN_ORDER_STATUSES = ['pending', 'assigned', 'in_progress'] as const;

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  assigned: 'Asignada',
  in_progress: 'En curso',
};

export const INVENTORY_LIMITS = {
  reference: 40,
  name: 120,
  description: 500,
  note: 200,
  maxThreshold: 1_000_000,
  maxMovement: 1_000_000,
} as const;

/** INV-8: un archivado es de solo lectura y no admite movimientos; la base lo vuelve a comprobar. */
export function availableActions(archived: boolean): { edit: boolean; move: boolean } {
  return { edit: !archived, move: !archived };
}

const NUMBER = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: true });

/** Cantidad entera con separador de miles es-ES. */
export function formatQuantity(value: number): string {
  return NUMBER.format(value);
}

/** Cantidad con su unidad ("1.200 m"). */
export function formatWithUnit(value: number, unit: string): string {
  return `${formatQuantity(value)} ${unit}`;
}
