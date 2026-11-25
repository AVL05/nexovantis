// Constantes y reglas de presentación de los presupuestos (funciones puras, sin servidor). Las reglas
// de verdad (solo borrador editable, decisión terminal, totales) viven en PostgreSQL
// (supabase/migrations/20261127090000_task012_quotes.sql); aquí solo se decide qué ofrece la
// interfaz, y la base lo vuelve a comprobar siempre.

export const QUOTE_STATUSES = ['draft', 'accepted', 'rejected'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
};

export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return typeof value === 'string' && (QUOTE_STATUSES as readonly string[]).includes(value);
}

export function isDraft(status: QuoteStatus): boolean {
  return status === 'draft';
}

/** Acciones que la interfaz ofrece según el estado (BR05). Aceptado y rechazado: solo lectura. */
export function availableActions(status: QuoteStatus): {
  edit: boolean;
  editItems: boolean;
  accept: boolean;
  reject: boolean;
} {
  const draft = isDraft(status);
  return { edit: draft, editItems: draft, accept: draft, reject: draft };
}

export type QuoteEventAction = 'created' | 'accepted' | 'rejected';

export function isQuoteEventAction(value: unknown): value is QuoteEventAction {
  return value === 'created' || value === 'accepted' || value === 'rejected';
}
