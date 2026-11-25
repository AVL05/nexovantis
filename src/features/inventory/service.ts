import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  NOT_FOUND_MESSAGE,
  fail,
  ok,
  type ServiceFailure,
  type ServiceResult,
} from '@/lib/records/errors';
import { pageCountFor } from '@/lib/records/params';
import { buildSearchFilter } from '@/lib/records/search';
import type { TenantContext } from '@/lib/records/tenant';

import {
  OPEN_ORDER_STATUSES,
  isMovementKind,
  isStockStatus,
  isUnit,
  stockStatus,
  type MovementKind,
  type StockStatus,
  type Unit,
} from './constants';
import { mapInventoryError } from './errors';
import { PAGE_SIZE, type InventoryListParams } from './params';
import type { ItemCreateInput, ItemUpdateInput, MovementInput } from './schema';

// Servicio de inventario (solo servidor). Usa el cliente de la sesión del usuario: RLS es la frontera
// y toda escritura pasa por las RPC de PostgreSQL (rpc/*_inventory_item, rpc/record_stock_movement),
// que derivan la organización de la membresía, aplican las reglas (saldo nunca negativo, archivado de
// solo lectura, consumo sobre órdenes abiertas, idempotencia) y escriben los eventos en la misma
// transacción. La organización de `ctx` solo sirve para filtrar lecturas. Nunca se envían saldos.

type Row = Record<string, unknown>;
type QueryResult = {
  data: unknown;
  error: { code?: string | null } | null;
  count: number | null;
};

/** Vista mínima del constructor de consultas de PostgREST (evita tipos recursivos profundos). */
interface Chain extends PromiseLike<QueryResult> {
  eq(column: string, value: string | number): Chain;
  in(column: string, values: readonly string[]): Chain;
  is(column: string, value: null): Chain;
  not(column: string, operator: string, value: null): Chain;
  or(filters: string): Chain;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): Chain;
  range(from: number, to: number): Chain;
  limit(count: number): Chain;
}

const uuid = z.uuid();
const HISTORY_LIMIT = 50;
const ORDER_OPTIONS_LIMIT = 200;

function db(ctx: TenantContext): SupabaseClient {
  return ctx.supabase as unknown as SupabaseClient;
}

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const int = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
};
const notFound = () => fail({ kind: 'not_found', message: NOT_FOUND_MESSAGE });

const failure = (error: { code?: string | null }): ServiceFailure => fail(mapInventoryError(error));

export type InventoryItemView = {
  id: string;
  reference: string;
  name: string;
  description: string | null;
  unit: Unit;
  threshold: number;
  quantity: number;
  status: StockStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MovementView = {
  id: string;
  kind: MovementKind;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  orderId: string | null;
  orderTitle: string | null;
  note: string | null;
  actor: 'self' | 'member' | 'former';
  createdAt: string;
};

export type InventoryListResult = {
  items: InventoryItemView[];
  total: number;
  page: number;
  pageCount: number;
};

export type OpenOrderOption = {
  id: string;
  title: string;
  status: string;
  scheduledDate: string;
};

export type MovementResult = { id: string; balance: number; replayed: boolean };

function toView(row: Row): InventoryItemView {
  const quantity = int(row.quantity);
  const threshold = int(row.low_stock_threshold);
  return {
    id: String(row.id),
    reference: str(row.reference) ?? '',
    name: str(row.name) ?? '',
    description: str(row.description),
    unit: isUnit(row.unit) ? row.unit : 'ud',
    threshold,
    quantity,
    status: isStockStatus(row.stock_status) ? row.stock_status : stockStatus(quantity, threshold),
    archivedAt: str(row.archived_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Filtros de listado; el texto va siempre por buildSearchFilter (sin inyección en `.or()`). */
function applyFilters(query: unknown, ctx: TenantContext, params: InventoryListParams) {
  let result = (query as Chain).eq('organization_id', ctx.organizationId);
  switch (params.status) {
    case 'activos':
      result = result.is('archived_at', null);
      break;
    case 'archivados':
      result = result.not('archived_at', 'is', null);
      break;
    case 'bajo':
      result = result.is('archived_at', null).eq('stock_status', 'low');
      break;
    case 'agotado':
      result = result.is('archived_at', null).eq('stock_status', 'out');
      break;
    default:
      break;
  }
  const text = buildSearchFilter(params.q, ['reference', 'name', 'description']);
  if (text) result = result.or(text);
  return result;
}

export const inventoryService = {
  /** Listado paginado (20 por página) con búsqueda y filtro de estado. La página se acota al rango. */
  async list(
    ctx: TenantContext,
    params: InventoryListParams,
  ): Promise<ServiceResult<InventoryListResult>> {
    const counted = await applyFilters(
      db(ctx).from('inventory_items').select('id', { count: 'exact', head: true }),
      ctx,
      params,
    );
    if (counted.error) return failure(counted.error);
    const total = counted.count ?? 0;
    const pageCount = pageCountFor(total);
    const page = Math.min(params.page, pageCount);
    if (total === 0) return ok({ items: [], total, page, pageCount });

    const from = (page - 1) * PAGE_SIZE;
    const { data, error } = await applyFilters(
      db(ctx).from('inventory_items').select('*'),
      ctx,
      params,
    )
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return failure(error);
    return ok({ items: ((data ?? []) as Row[]).map(toView), total, page, pageCount });
  },

  async get(ctx: TenantContext, id: string): Promise<ServiceResult<InventoryItemView>> {
    if (!uuid.safeParse(id).success) return notFound();
    const { data, error } = await db(ctx)
      .from('inventory_items')
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) return failure(error);
    if (!data) return notFound();
    return ok(toView(data as Row));
  },

  /** Artículos activos con stock bajo y agotados (indicadores del listado y del panel). */
  async alertCounts(
    ctx: TenantContext,
  ): Promise<ServiceResult<{ low: number; out: number; active: number }>> {
    const count = async (status?: StockStatus) => {
      let query = (
        db(ctx)
          .from('inventory_items')
          .select('id', { count: 'exact', head: true }) as unknown as Chain
      )
        .eq('organization_id', ctx.organizationId)
        .is('archived_at', null);
      if (status) query = query.eq('stock_status', status);
      return query;
    };
    const [active, low, out] = await Promise.all([count(), count('low'), count('out')]);
    const error = active.error ?? low.error ?? out.error;
    if (error) return failure(error);
    return ok({ low: low.count ?? 0, out: out.count ?? 0, active: active.count ?? 0 });
  },

  /** Historial de movimientos del artículo (más reciente primero, hasta 50). */
  async movements(ctx: TenantContext, itemId: string): Promise<ServiceResult<MovementView[]>> {
    const { data, error } = await (db(ctx).from('stock_movements').select('*') as unknown as Chain)
      .eq('organization_id', ctx.organizationId)
      .eq('item_id', itemId)
      .order('seq', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) return failure(error);
    const rows = (data ?? []) as Row[];

    const orderIds = [
      ...new Set(rows.map((row) => str(row.order_id)).filter((id): id is string => id !== null)),
    ];
    const titles = new Map<string, string>();
    if (orderIds.length > 0) {
      const found = await (db(ctx).from('work_orders').select('id, title') as unknown as Chain)
        .eq('organization_id', ctx.organizationId)
        .in('id', orderIds);
      if (!found.error) {
        for (const row of (found.data ?? []) as Row[])
          titles.set(String(row.id), str(row.title) ?? '');
      }
    }

    const members = await (db(ctx).from('memberships').select('user_id') as unknown as Chain).eq(
      'organization_id',
      ctx.organizationId,
    );
    const memberIds = new Set(
      members.error ? [] : ((members.data ?? []) as Row[]).map((row) => String(row.user_id)),
    );

    return ok(
      rows.flatMap((row): MovementView[] => {
        if (!isMovementKind(row.kind)) return [];
        const actorId = String(row.created_by);
        const orderId = str(row.order_id);
        return [
          {
            id: String(row.id),
            kind: row.kind,
            quantity: int(row.quantity),
            balanceBefore: int(row.balance_before),
            balanceAfter: int(row.balance_after),
            orderId,
            orderTitle: orderId ? (titles.get(orderId) ?? null) : null,
            note: str(row.note),
            actor: actorId === ctx.userId ? 'self' : memberIds.has(actorId) ? 'member' : 'former',
            createdAt: String(row.created_at),
          },
        ];
      }),
    );
  },

  /** Órdenes no terminales de la organización, candidatas a recibir un consumo. */
  async openOrders(ctx: TenantContext): Promise<ServiceResult<OpenOrderOption[]>> {
    const { data, error } = await (
      db(ctx).from('work_orders').select('id, title, status, scheduled_date') as unknown as Chain
    )
      .eq('organization_id', ctx.organizationId)
      .in('status', OPEN_ORDER_STATUSES)
      .order('scheduled_date', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(ORDER_OPTIONS_LIMIT);
    if (error) return failure(error);
    return ok(
      ((data ?? []) as Row[]).map((row) => ({
        id: String(row.id),
        title: str(row.title) ?? '',
        status: str(row.status) ?? '',
        scheduledDate: str(row.scheduled_date) ?? '',
      })),
    );
  },

  async create(ctx: TenantContext, input: ItemCreateInput): Promise<ServiceResult<{ id: string }>> {
    const { data, error } = await db(ctx).rpc('create_inventory_item', {
      p_id: input.request_id,
      p_reference: input.reference,
      p_name: input.name,
      p_description: input.description,
      p_unit: input.unit,
      p_low_stock_threshold: input.low_stock_threshold,
    });
    if (error) return failure(error);
    return ok({ id: String(data) });
  },

  async update(ctx: TenantContext, input: ItemUpdateInput): Promise<ServiceResult<{ id: string }>> {
    const { error } = await db(ctx).rpc('update_inventory_item', {
      p_id: input.id,
      p_name: input.name,
      p_description: input.description,
      p_unit: input.unit,
      p_low_stock_threshold: input.low_stock_threshold,
    });
    if (error) return failure(error);
    return ok({ id: input.id });
  },

  async archive(ctx: TenantContext, id: string): Promise<ServiceResult<{ changed: boolean }>> {
    const { data, error } = await db(ctx).rpc('archive_inventory_item', { p_id: id });
    if (error) return failure(error);
    return ok({ changed: data === true });
  },

  async restore(ctx: TenantContext, id: string): Promise<ServiceResult<{ changed: boolean }>> {
    const { data, error } = await db(ctx).rpc('restore_inventory_item', { p_id: id });
    if (error) return failure(error);
    return ok({ changed: data === true });
  },

  /** Movimiento idempotente: la misma clave devuelve el original (replayed = true) sin duplicar. */
  async move(ctx: TenantContext, input: MovementInput): Promise<ServiceResult<MovementResult>> {
    const { data, error } = await db(ctx).rpc('record_stock_movement', {
      p_request_id: input.request_id,
      p_item_id: input.item_id,
      p_kind: input.kind,
      p_quantity: input.quantity,
      p_order_id: input.order_id,
      p_note: input.note,
    });
    if (error) return failure(error);
    const result = (data ?? {}) as Row;
    return ok({
      id: String(result.id),
      balance: int(result.balance),
      replayed: result.replayed === true,
    });
  },
};
