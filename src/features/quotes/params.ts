import { normalizeQuery, PAGE_SIZE } from '@/lib/records/params';

import { isQuoteStatus, type QuoteStatus } from './constants';

// Parseo y construcción de los parámetros de listado de presupuestos (searchParams). Funciones
// puras: todo valor no válido cae en el valor por defecto (nunca llega a una consulta sin validar).

export { PAGE_SIZE };

const MAX_PAGE = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type QuoteListParams = {
  page: number;
  q: string;
  status: QuoteStatus | null;
  customer: string | null;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseQuoteListParams(raw: RawParams): QuoteListParams {
  const rawPage = first(raw.pagina);
  const page = rawPage && /^\d{1,6}$/.test(rawPage) ? Number.parseInt(rawPage, 10) : 1;
  const status = first(raw.estado);
  const customer = first(raw.cliente);
  return {
    page: Math.min(Math.max(page, 1), MAX_PAGE),
    q: normalizeQuery(first(raw.q)),
    status: isQuoteStatus(status) ? status : null,
    customer: customer && UUID.test(customer) ? customer : null,
  };
}

export function hasActiveFilters(params: QuoteListParams): boolean {
  return Boolean(params.q || params.status || params.customer);
}

/** Enlace de listado: omite valores por defecto para mantener URLs cortas y compartibles. */
export function buildQuotesHref(basePath: string, params: Partial<QuoteListParams>): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.status) search.set('estado', params.status);
  if (params.customer) search.set('cliente', params.customer);
  if (params.page && params.page > 1) search.set('pagina', String(params.page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Número buscado: "PRE-0012", "pre12" o "12" -> 12. null si el texto no es un número de presupuesto. */
export function quoteNumberFromQuery(q: string): number | null {
  const match = /^(?:pre-?)?0*(\d{1,9})$/i.exec(q.trim());
  return match ? Number.parseInt(match[1], 10) : null;
}
