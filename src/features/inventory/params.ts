import { normalizeQuery, PAGE_SIZE } from '@/lib/records/params';

// Parseo y construcción de los parámetros de listado del inventario (searchParams). Funciones puras:
// todo valor no válido cae en el valor por defecto (nunca llega a una consulta sin validar).

export { PAGE_SIZE };

const MAX_PAGE = 100_000;

export const INVENTORY_FILTERS = ['activos', 'bajo', 'agotado', 'archivados', 'todos'] as const;
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number];
export const DEFAULT_FILTER: InventoryFilter = 'activos';

export const FILTER_LABEL: Record<InventoryFilter, string> = {
  activos: 'Activos',
  bajo: 'Stock bajo',
  agotado: 'Agotados',
  archivados: 'Archivados',
  todos: 'Todos',
};

// Alias en singular aceptados por compatibilidad con enlaces escritos a mano.
const ALIASES: Record<string, InventoryFilter> = {
  activo: 'activos',
  archivado: 'archivados',
  bajos: 'bajo',
  agotados: 'agotado',
};

export type InventoryListParams = { page: number; q: string; status: InventoryFilter };

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function parseInventoryFilter(value: string | undefined): InventoryFilter {
  if (value && (INVENTORY_FILTERS as readonly string[]).includes(value)) {
    return value as InventoryFilter;
  }
  const alias = value ? Object.hasOwn(ALIASES, value) : false;
  return alias && value ? ALIASES[value] : DEFAULT_FILTER;
}

export function parseInventoryListParams(raw: RawParams): InventoryListParams {
  const rawPage = first(raw.pagina);
  const page = rawPage && /^\d{1,6}$/.test(rawPage) ? Number.parseInt(rawPage, 10) : 1;
  return {
    page: Math.min(Math.max(page, 1), MAX_PAGE),
    q: normalizeQuery(first(raw.q)),
    status: parseInventoryFilter(first(raw.estado)),
  };
}

export function hasActiveFilters(params: InventoryListParams): boolean {
  return Boolean(params.q || params.status !== DEFAULT_FILTER);
}

/** Enlace de listado: omite valores por defecto para mantener URLs cortas y compartibles. */
export function buildInventoryHref(basePath: string, params: Partial<InventoryListParams>): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.status && params.status !== DEFAULT_FILTER) search.set('estado', params.status);
  if (params.page && params.page > 1) search.set('pagina', String(params.page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}
