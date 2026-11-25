import { PAGE_SIZE } from '@/lib/records/params';

import {
  ACTIVITY_ENTITIES,
  ENTITY_PARAM,
  isActivityAction,
  type ActivityAction,
  type ActivityEntity,
} from './constants';

// Parseo y construcción de los parámetros de la página de actividad (searchParams). Funciones puras:
// todo valor no válido cae en el valor por defecto (nunca llega a una consulta sin validar). El rango
// de fechas se interpreta en día natural de Europe/Madrid (desde 00:00 del día inicial hasta las 24:00
// del día final, ambos incluidos), con independencia de la zona del servidor.

export { PAGE_SIZE };

const MAX_PAGE = 100_000;
const MADRID = 'Europe/Madrid';

export type ActivityListParams = {
  page: number;
  entity: ActivityEntity | null;
  action: ActivityAction | null;
  /** AAAA-MM-DD (día natural de Madrid) o null. */
  from: string | null;
  to: string | null;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const ENTITY_BY_PARAM = new Map<string, ActivityEntity>([
  ...ACTIVITY_ENTITIES.map((entity): [string, ActivityEntity] => [ENTITY_PARAM[entity], entity]),
  ...ACTIVITY_ENTITIES.map((entity): [string, ActivityEntity] => [entity, entity]),
  ['técnico', 'technician'],
]);

/** Fecha AAAA-MM-DD existente en el calendario (rechaza 2026-02-30) o null. */
export function parseDay(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid && year >= 2000 && year <= 2100 ? value : null;
}

export function parseActivityParams(raw: RawParams): ActivityListParams {
  const rawPage = first(raw.pagina);
  const page = rawPage && /^\d{1,6}$/.test(rawPage) ? Number.parseInt(rawPage, 10) : 1;
  const entity = first(raw.entidad);
  const action = first(raw.accion);
  return {
    page: Math.min(Math.max(page, 1), MAX_PAGE),
    entity: entity ? (ENTITY_BY_PARAM.get(entity) ?? null) : null,
    action: isActivityAction(action) ? action : null,
    from: parseDay(first(raw.desde)),
    to: parseDay(first(raw.hasta)),
  };
}

export function hasActiveFilters(params: ActivityListParams): boolean {
  return Boolean(params.entity || params.action || params.from || params.to);
}

/** El rango es incoherente cuando la fecha inicial es posterior a la final. */
export function isInvertedRange(params: Pick<ActivityListParams, 'from' | 'to'>): boolean {
  return Boolean(params.from && params.to && params.from > params.to);
}

/** Enlace de la página: omite los valores por defecto para mantener URLs cortas y compartibles. */
export function buildActivityHref(basePath: string, params: Partial<ActivityListParams>): string {
  const search = new URLSearchParams();
  if (params.entity) search.set('entidad', ENTITY_PARAM[params.entity]);
  if (params.action) search.set('accion', params.action);
  if (params.from) search.set('desde', params.from);
  if (params.to) search.set('hasta', params.to);
  if (params.page && params.page > 1) search.set('pagina', String(params.page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: MADRID,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Desfase de Madrid respecto a UTC (ms) en el instante dado. */
function madridOffsetMs(utcMs: number): number {
  const parts = Object.fromEntries(
    PARTS.formatToParts(new Date(utcMs)).map((part) => [part.type, Number(part.value)]),
  );
  const local = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return local - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Instante (UTC, ISO) en el que empieza el día natural AAAA-MM-DD en Europe/Madrid. Dos pasadas
 * cubren los días con cambio de hora (23 y 25 horas): el desfase se evalúa en el propio resultado.
 */
export function madridDayStartIso(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, date);
  const pass1 = guess - madridOffsetMs(guess);
  const pass2 = guess - madridOffsetMs(pass1);
  return new Date(pass2).toISOString();
}

/** Día natural siguiente (AAAA-MM-DD), por aritmética de calendario. */
export function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

/** Rango [desde, hasta) en UTC del filtro de fechas (el día final se incluye entero). */
export function activityRange(params: Pick<ActivityListParams, 'from' | 'to'>): {
  fromIso: string | null;
  toIso: string | null;
} {
  return {
    fromIso: params.from ? madridDayStartIso(params.from) : null,
    toIso: params.to ? madridDayStartIso(nextDay(params.to)) : null,
  };
}
