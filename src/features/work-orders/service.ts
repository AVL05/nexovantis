import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  NOT_FOUND_MESSAGE,
  fail,
  mapDbError,
  ok,
  type ServiceFailure,
  type ServiceResult,
} from '@/lib/records/errors';
import { pageCountFor } from '@/lib/records/params';
import { buildSearchFilter } from '@/lib/records/search';
import type { TenantContext } from '@/lib/records/tenant';

import {
  ORDER_STATUSES,
  isOrderPriority,
  isOrderStatus,
  type OrderEventAction,
  type OrderPriority,
  type OrderStatus,
} from './constants';
import { PAGE_SIZE, UNASSIGNED, type OrderListParams } from './params';
import type { OrderCreateInput, OrderUpdateInput } from './schema';

// Servicio de órdenes de servicio (solo servidor). Usa el cliente de la sesión del usuario: RLS es
// la frontera y toda escritura pasa por las RPC de PostgreSQL (rpc/*_work_order), que derivan la
// organización de la membresía, aplican la matriz de transiciones y escriben el evento en la misma
// transacción. La organización de `ctx` solo sirve para filtrar lecturas.

type Row = Record<string, unknown>;
type QueryResult = {
  data: unknown;
  error: { code?: string | null } | null;
  count: number | null;
};

/** Vista mínima del constructor de consultas de PostgREST (evita tipos recursivos profundos). */
interface Chain extends PromiseLike<QueryResult> {
  eq(column: string, value: string): Chain;
  in(column: string, values: readonly string[]): Chain;
  is(column: string, value: null): Chain;
  gte(column: string, value: string): Chain;
  lte(column: string, value: string): Chain;
  lt(column: string, value: string): Chain;
  or(filters: string): Chain;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): Chain;
  range(from: number, to: number): Chain;
  limit(count: number): Chain;
  select(columns: string): Chain;
}

const uuid = z.uuid();
const MAX_SEARCH_CUSTOMERS = 100;
const OPTIONS_LIMIT = 500;

function db(ctx: TenantContext): SupabaseClient {
  return ctx.supabase as unknown as SupabaseClient;
}

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const notFound = () => fail({ kind: 'not_found', message: NOT_FOUND_MESSAGE });

export type OrderView = {
  id: string;
  title: string;
  description: string | null;
  priority: OrderPriority;
  /** AAAA-MM-DD */
  scheduledDate: string;
  status: OrderStatus;
  cancellationReason: string | null;
  customerId: string;
  customerName: string;
  customerArchived: boolean;
  technicianId: string | null;
  technicianName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderListResult = {
  items: OrderView[];
  total: number;
  page: number;
  pageCount: number;
};

export type PersonOption = { id: string; name: string };

type Names = Map<string, { name: string; archived: boolean }>;

async function namesFor(
  ctx: TenantContext,
  table: 'customers' | 'technicians',
  ids: readonly string[],
): Promise<ServiceResult<Names>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return ok(new Map());
  const column = table === 'customers' ? 'name' : 'full_name';
  const { data, error } = await (
    db(ctx).from(table).select(`id, ${column}, archived_at`) as unknown as Chain
  )
    .eq('organization_id', ctx.organizationId)
    .in('id', unique);
  if (error) return fail(mapDbError(error));
  const map: Names = new Map();
  for (const row of (data ?? []) as Row[]) {
    map.set(String(row.id), { name: str(row[column]) ?? '', archived: row.archived_at !== null });
  }
  return ok(map);
}

function toView(row: Row, customers: Names, technicians: Names): OrderView {
  const customerId = String(row.customer_id);
  const technicianId = str(row.technician_id);
  const status = isOrderStatus(row.status) ? row.status : 'pending';
  const priority = isOrderPriority(row.priority) ? row.priority : 'normal';
  return {
    id: String(row.id),
    title: str(row.title) ?? '',
    description: str(row.description),
    priority,
    scheduledDate: String(row.scheduled_date).slice(0, 10),
    status,
    cancellationReason: str(row.cancellation_reason),
    customerId,
    customerName: customers.get(customerId)?.name ?? 'Cliente no disponible',
    customerArchived: customers.get(customerId)?.archived ?? false,
    technicianId,
    technicianName: technicianId ? (technicians.get(technicianId)?.name ?? null) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function hydrate(ctx: TenantContext, rows: Row[]): Promise<ServiceResult<OrderView[]>> {
  const customers = await namesFor(
    ctx,
    'customers',
    rows.map((row) => String(row.customer_id)),
  );
  if (!customers.ok) return customers;
  const technicians = await namesFor(
    ctx,
    'technicians',
    rows.flatMap((row) => (typeof row.technician_id === 'string' ? [row.technician_id] : [])),
  );
  if (!technicians.ok) return technicians;
  return ok(rows.map((row) => toView(row, customers.data, technicians.data)));
}

/** Filtros de listado; el texto va siempre por buildSearchFilter (sin inyección en `.or()`). */
function applyFilters(
  query: unknown,
  ctx: TenantContext,
  params: OrderListParams,
  customerIds: string[],
) {
  let result = (query as Chain).eq('organization_id', ctx.organizationId);
  if (params.status) result = result.eq('status', params.status);
  if (params.priority) result = result.eq('priority', params.priority);
  if (params.technician === UNASSIGNED) result = result.is('technician_id', null);
  else if (params.technician) result = result.eq('technician_id', params.technician);
  if (params.customer) result = result.eq('customer_id', params.customer);
  if (params.from) result = result.gte('scheduled_date', params.from);
  if (params.to) result = result.lte('scheduled_date', params.to);
  const text = buildSearchFilter(params.q, ['title', 'description']);
  if (text) {
    const byCustomer = customerIds.length > 0 ? `,customer_id.in.(${customerIds.join(',')})` : '';
    result = result.or(`${text}${byCustomer}`);
  }
  return result;
}

async function matchingCustomerIds(
  ctx: TenantContext,
  q: string,
): Promise<ServiceResult<string[]>> {
  const filter = buildSearchFilter(q, ['name']);
  if (!filter) return ok([]);
  const { data, error } = await (db(ctx).from('customers').select('id') as unknown as Chain)
    .eq('organization_id', ctx.organizationId)
    .or(filter)
    .limit(MAX_SEARCH_CUSTOMERS);
  if (error) return fail(mapDbError(error));
  return ok(
    ((data ?? []) as Row[]).map((row) => String(row.id)).filter((id) => uuid.safeParse(id).success),
  );
}

/** Tras un fallo de la base: normaliza el error a un resultado seguro. */
function failure(error: { code?: string | null }): ServiceFailure {
  return fail(mapDbError(error));
}

export const workOrderService = {
  /** Listado paginado (20 por página) con búsqueda y filtros. La página se acota al rango válido. */
  async list(ctx: TenantContext, params: OrderListParams): Promise<ServiceResult<OrderListResult>> {
    const customerIds = await matchingCustomerIds(ctx, params.q);
    if (!customerIds.ok) return customerIds;

    const counted = await applyFilters(
      db(ctx).from('work_orders').select('id', { count: 'exact', head: true }),
      ctx,
      params,
      customerIds.data,
    );
    if (counted.error) return failure(counted.error);
    const total = counted.count ?? 0;
    const pageCount = pageCountFor(total);
    const page = Math.min(params.page, pageCount);
    if (total === 0) return ok({ items: [], total, page, pageCount });

    const from = (page - 1) * PAGE_SIZE;
    const { data, error } = await applyFilters(
      db(ctx).from('work_orders').select('*'),
      ctx,
      params,
      customerIds.data,
    )
      .order('scheduled_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return failure(error);
    const items = await hydrate(ctx, (data ?? []) as Row[]);
    if (!items.ok) return items;
    return ok({ items: items.data, total, page, pageCount });
  },

  async get(ctx: TenantContext, id: string): Promise<ServiceResult<OrderView>> {
    if (!uuid.safeParse(id).success) return notFound();
    const { data, error } = await db(ctx)
      .from('work_orders')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) return failure(error);
    if (!data) return notFound();
    const items = await hydrate(ctx, [data as Row]);
    if (!items.ok) return items;
    return ok(items.data[0]);
  },

  /** Clientes y técnicos activos para formularios, y todos para el filtro del listado. */
  async options(
    ctx: TenantContext,
    mode: 'active' | 'all',
  ): Promise<ServiceResult<{ customers: PersonOption[]; technicians: PersonOption[] }>> {
    const read = async (table: 'customers' | 'technicians', column: string) => {
      let query = (db(ctx).from(table).select(`id, ${column}`) as unknown as Chain).eq(
        'organization_id',
        ctx.organizationId,
      );
      if (mode === 'active') query = query.is('archived_at', null);
      return query.order(column, { ascending: true }).limit(OPTIONS_LIMIT);
    };
    const [customers, technicians] = await Promise.all([
      read('customers', 'name'),
      read('technicians', 'full_name'),
    ]);
    if (customers.error) return failure(customers.error);
    if (technicians.error) return failure(technicians.error);
    const map = (rows: unknown, column: string): PersonOption[] =>
      ((rows ?? []) as Row[]).map((row) => ({ id: String(row.id), name: str(row[column]) ?? '' }));
    return ok({
      customers: map(customers.data, 'name'),
      technicians: map(technicians.data, 'full_name'),
    });
  },

  async create(
    ctx: TenantContext,
    input: OrderCreateInput,
  ): Promise<ServiceResult<{ id: string }>> {
    const { data, error } = await db(ctx).rpc('create_work_order', {
      p_id: input.request_id,
      p_customer_id: input.customer_id,
      p_title: input.title,
      p_description: input.description,
      p_priority: input.priority,
      p_scheduled_date: input.scheduled_date,
      p_technician_id: input.technician_id,
    });
    if (error) return failure(error);
    return ok({ id: String(data) });
  },

  async update(
    ctx: TenantContext,
    input: OrderUpdateInput,
  ): Promise<ServiceResult<{ id: string }>> {
    const { error } = await db(ctx).rpc('update_work_order', {
      p_id: input.id,
      p_title: input.title,
      p_description: input.description,
      p_priority: input.priority,
      p_scheduled_date: input.scheduled_date,
    });
    if (error) return failure(error);
    return ok({ id: input.id });
  },

  async assign(
    ctx: TenantContext,
    id: string,
    technicianId: string,
  ): Promise<ServiceResult<{ changed: boolean }>> {
    const { data, error } = await db(ctx).rpc('assign_work_order', {
      p_id: id,
      p_technician_id: technicianId,
    });
    if (error) return failure(error);
    return ok({ changed: data === true });
  },

  async advance(
    ctx: TenantContext,
    id: string,
    to: 'in_progress' | 'completed',
  ): Promise<ServiceResult<{ changed: boolean }>> {
    const { data, error } = await db(ctx).rpc('advance_work_order', { p_id: id, p_to: to });
    if (error) return failure(error);
    return ok({ changed: data === true });
  },

  async cancel(
    ctx: TenantContext,
    id: string,
    reason: string | null,
  ): Promise<ServiceResult<{ changed: boolean; alreadyCancelled: boolean }>> {
    const { data, error } = await db(ctx).rpc('cancel_work_order', { p_id: id, p_reason: reason });
    if (error) return failure(error);
    return ok({ changed: data === 'cancelled', alreadyCancelled: data === 'already_cancelled' });
  },

  /** Historial de eventos de una orden (más reciente primero), con el detalle de cada cambio. */
  async history(ctx: TenantContext, orderId: string): Promise<ServiceResult<OrderHistoryEntry[]>> {
    const events = await (
      db(ctx)
        .from('activity_events')
        .select('id, action, actor_id, occurred_at') as unknown as Chain
    )
      .eq('organization_id', ctx.organizationId)
      .eq('entity_type', 'work_order')
      .eq('entity_id', orderId)
      .order('occurred_at', { ascending: false })
      .order('seq', { ascending: false, nullsFirst: false })
      .limit(100);
    if (events.error) return failure(events.error);
    const rows = (events.data ?? []) as Row[];
    if (rows.length === 0) return ok([]);

    const details = await (
      db(ctx)
        .from('work_order_event_details')
        .select('event_id, from_status, to_status, technician_id, detail') as unknown as Chain
    )
      .eq('organization_id', ctx.organizationId)
      .in(
        'event_id',
        rows.map((row) => String(row.id)),
      );
    if (details.error) return failure(details.error);
    const byEvent = new Map<string, Row>();
    for (const row of (details.data ?? []) as Row[]) byEvent.set(String(row.event_id), row);

    const technicians = await namesFor(
      ctx,
      'technicians',
      [...byEvent.values()].flatMap((d) =>
        typeof d.technician_id === 'string' ? [d.technician_id] : [],
      ),
    );
    if (!technicians.ok) return technicians;

    const members = await (db(ctx).from('memberships').select('user_id') as unknown as Chain).eq(
      'organization_id',
      ctx.organizationId,
    );
    const memberIds = new Set(
      members.error ? [] : ((members.data ?? []) as Row[]).map((row) => String(row.user_id)),
    );

    return ok(
      rows.flatMap((row): OrderHistoryEntry[] => {
        const action = row.action;
        if (!isOrderEventAction(action)) return [];
        const detail = byEvent.get(String(row.id));
        const actorId = String(row.actor_id);
        const technicianId = detail ? str(detail.technician_id) : null;
        return [
          {
            id: String(row.id),
            action,
            occurredAt: String(row.occurred_at),
            actor: actorId === ctx.userId ? 'self' : memberIds.has(actorId) ? 'member' : 'former',
            fromStatus: detail && isOrderStatus(detail.from_status) ? detail.from_status : null,
            toStatus: detail && isOrderStatus(detail.to_status) ? detail.to_status : null,
            technicianName: technicianId
              ? (technicians.data.get(technicianId)?.name ?? null)
              : null,
            reason: detail ? str(detail.detail) : null,
          },
        ];
      }),
    );
  },

  /**
   * Indicadores y pendientes del panel (BR04) en UNA sentencia SQL (RPC SECURITY INVOKER, bajo RLS
   * con el JWT del usuario): recuentos y lista salen del mismo snapshot. Los nombres se hidratan
   * aparte y no afectan a los indicadores.
   */
  async dashboard(ctx: TenantContext, today: string): Promise<ServiceResult<DashboardData>> {
    const { data, error } = await db(ctx).rpc('work_orders_dashboard', {
      p_organization_id: ctx.organizationId,
      p_today: today,
      p_limit: DASHBOARD_PENDING_LIMIT,
    });
    if (error) return failure(error);
    const payload = (data ?? {}) as Row;
    const rawCounts = (payload.counts ?? {}) as Row;
    const counts = Object.fromEntries(
      ORDER_STATUSES.map((status) => [status, Number(rawCounts[status] ?? 0)]),
    ) as Record<OrderStatus, number>;
    const rows = Array.isArray(payload.pending) ? (payload.pending as Row[]) : [];
    const pending = await hydrate(ctx, rows);
    if (!pending.ok) return pending;
    return ok({
      counts,
      open: counts.pending + counts.assigned + counts.in_progress,
      total: Number(payload.total ?? 0),
      overdue: Number(payload.overdue ?? 0),
      pending: pending.data,
    });
  },
};

export const DASHBOARD_PENDING_LIMIT = 8;

export type DashboardData = {
  counts: Record<OrderStatus, number>;
  open: number;
  total: number;
  /** Órdenes abiertas con fecha programada anterior a hoy. */
  overdue: number;
  /** Órdenes pendientes (más antiguas primero), acotadas. */
  pending: OrderView[];
};

export type OrderHistoryEntry = {
  id: string;
  action: OrderEventAction;
  occurredAt: string;
  actor: 'self' | 'member' | 'former';
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  technicianName: string | null;
  reason: string | null;
};

const EVENT_ACTIONS: readonly string[] = [
  'created',
  'status_changed',
  'assigned',
  'reassigned',
  'cancelled',
];
function isOrderEventAction(value: unknown): value is OrderEventAction {
  return typeof value === 'string' && EVENT_ACTIONS.includes(value);
}
