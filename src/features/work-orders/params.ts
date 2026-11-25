import { normalizeQuery, PAGE_SIZE } from '@/lib/records/params';

import { dateString } from './schema';
import { isOrderPriority, isOrderStatus, type OrderPriority, type OrderStatus } from './constants';

// Parseo y construcción de los parámetros de listado de órdenes (searchParams). Funciones puras:
// todo valor no válido cae en el valor por defecto (nunca llega a una consulta sin validar).

export { PAGE_SIZE };

export const UNASSIGNED = 'sin' as const;
const MAX_PAGE = 100_000;

export type OrderListParams = {
  page: number;
  q: string;
  status: OrderStatus | null;
  priority: OrderPriority | null;
  /** UUID de técnico, o "sin" para órdenes sin técnico. */
  technician: string | typeof UNASSIGNED | null;
  customer: string | null;
  /** Fecha programada, ambos extremos incluidos (AAAA-MM-DD). */
  from: string | null;
  to: string | null;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validDate(value: string | undefined): string | null {
  return value && dateString.safeParse(value).success ? value : null;
}

export function parseOrderListParams(raw: RawParams): OrderListParams {
  const rawPage = first(raw.pagina);
  const page = rawPage && /^\d{1,6}$/.test(rawPage) ? Number.parseInt(rawPage, 10) : 1;
  const status = first(raw.estado);
  const priority = first(raw.prioridad);
  const technician = first(raw.tecnico);
  const customer = first(raw.cliente);
  let from = validDate(first(raw.desde));
  let to = validDate(first(raw.hasta));
  if (from && to && from > to) [from, to] = [to, from];
  return {
    page: Math.min(Math.max(page, 1), MAX_PAGE),
    q: normalizeQuery(first(raw.q)),
    status: isOrderStatus(status) ? status : null,
    priority: isOrderPriority(priority) ? priority : null,
    technician:
      technician === UNASSIGNED
        ? UNASSIGNED
        : technician && UUID.test(technician)
          ? technician
          : null,
    customer: customer && UUID.test(customer) ? customer : null,
    from,
    to,
  };
}

export function hasActiveFilters(params: OrderListParams): boolean {
  return Boolean(
    params.q ||
    params.status ||
    params.priority ||
    params.technician ||
    params.customer ||
    params.from ||
    params.to,
  );
}

/** Enlace de listado: omite valores por defecto para mantener URLs cortas y compartibles. */
export function buildOrdersHref(basePath: string, params: Partial<OrderListParams>): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.status) search.set('estado', params.status);
  if (params.priority) search.set('prioridad', params.priority);
  if (params.technician) search.set('tecnico', params.technician);
  if (params.customer) search.set('cliente', params.customer);
  if (params.from) search.set('desde', params.from);
  if (params.to) search.set('hasta', params.to);
  if (params.page && params.page > 1) search.set('pagina', String(params.page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}
