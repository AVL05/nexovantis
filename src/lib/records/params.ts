// Parseo y construcción de parámetros de listado (searchParams). Funciones puras.

export const PAGE_SIZE = 20;
export const MAX_QUERY_LENGTH = 100;
const MAX_PAGE = 100_000;

export const STATUS_FILTERS = ['activos', 'archivados', 'todos'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const DEFAULT_STATUS: StatusFilter = 'activos';

export type ListParams = { page: number; q: string; status: StatusFilter };

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Normaliza el texto de búsqueda: sin caracteres de control, espacios colapsados y acotado. */
export function normalizeQuery(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
}

/** Valida y acota `q`, `estado` y `pagina`; los valores no válidos caen en los valores por defecto. */
export function parseListParams(raw: RawParams): ListParams {
  const rawPage = first(raw.pagina);
  const page = rawPage && /^\d{1,6}$/.test(rawPage) ? Number.parseInt(rawPage, 10) : 1;
  const rawStatus = first(raw.estado);
  const status = (STATUS_FILTERS as readonly string[]).includes(rawStatus ?? '')
    ? (rawStatus as StatusFilter)
    : DEFAULT_STATUS;
  return {
    page: Math.min(Math.max(page, 1), MAX_PAGE),
    q: normalizeQuery(first(raw.q)),
    status,
  };
}

export function pageCountFor(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** Enlace de listado: omite los valores por defecto para mantener URLs cortas y compartibles. */
export function buildListHref(basePath: string, params: Partial<ListParams>): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.status && params.status !== DEFAULT_STATUS) search.set('estado', params.status);
  if (params.page && params.page > 1) search.set('pagina', String(params.page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}
