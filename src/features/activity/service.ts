import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { fail, mapDbError, ok, type ServiceResult } from '@/lib/records/errors';
import { pageCountFor } from '@/lib/records/params';
import type { TenantContext } from '@/lib/records/tenant';

import {
  ACTIVITY_ACTIONS,
  ACTIVITY_ENTITIES,
  type ActivityAction,
  type ActivityActor,
  type ActivityEntity,
} from './constants';
import { PAGE_SIZE, activityRange, type ActivityListParams } from './params';

export type ActivityEntityType = 'customer' | 'technician';

export type HistoryEntry = {
  id: string;
  action: 'archived' | 'restored';
  occurredAt: string;
  /**
   * Quién lo hizo, solo si se puede determinar con datos reales: 'self' si es el usuario actual,
   * 'member' si sigue siendo miembro de la organización; null en otro caso (solo acción y fecha).
   */
  actor: 'self' | 'member' | null;
};

const HISTORY_LIMIT = 50;

/** Historial de archivado/restauración de un registro (lectura bajo RLS, más reciente primero). */
export async function listEntityHistory(
  ctx: TenantContext,
  entityType: ActivityEntityType,
  entityId: string,
): Promise<ServiceResult<HistoryEntry[]>> {
  const db = ctx.supabase as unknown as SupabaseClient;
  const events = await db
    .from('activity_events')
    .select('id, action, actor_id, occurred_at')
    .eq('organization_id', ctx.organizationId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    // Orden total: occurred_at es la hora de INICIO de la transaccion y puede coincidir (archivar y
    // restaurar en una misma transaccion); seq la fija la BD al insertar y desempata. Los eventos
    // historicos (anteriores a la migracion) tienen seq nulo: nunca se inventa su orden relativo.
    .order('occurred_at', { ascending: false })
    .order('seq', { ascending: false, nullsFirst: false })
    .limit(HISTORY_LIMIT);
  if (events.error) return fail(mapDbError(events.error));

  // Los miembros actuales se leen de memberships (visible para la propia organización).
  const members = await db
    .from('memberships')
    .select('user_id')
    .eq('organization_id', ctx.organizationId);
  const memberIds = new Set(
    members.error ? [] : ((members.data ?? []) as { user_id: string }[]).map((m) => m.user_id),
  );

  const entries = ((events.data ?? []) as Record<string, unknown>[]).flatMap(
    (row): HistoryEntry[] => {
      const action = row.action;
      if (action !== 'archived' && action !== 'restored') return [];
      const actorId = String(row.actor_id);
      const actor: HistoryEntry['actor'] =
        actorId === ctx.userId ? 'self' : memberIds.has(actorId) ? 'member' : null;
      return [{ id: String(row.id), action, occurredAt: String(row.occurred_at), actor }];
    },
  );
  return ok(entries);
}

export type RecentActivity = {
  id: string;
  entityType: 'customer' | 'technician' | 'work_order';
  entityId: string;
  /** Nombre o título de la entidad si todavía es legible bajo RLS; null en otro caso. */
  entityLabel: string | null;
  action:
    | 'archived'
    | 'restored'
    | 'created'
    | 'status_changed'
    | 'assigned'
    | 'reassigned'
    | 'cancelled';
  occurredAt: string;
  actor: 'self' | 'member' | 'former';
};

const RECENT_ACTIONS = [
  'archived',
  'restored',
  'created',
  'status_changed',
  'assigned',
  'reassigned',
  'cancelled',
] as const;
const RECENT_TYPES = ['customer', 'technician', 'work_order'] as const;

const LABEL_SOURCE = {
  customer: { table: 'customers', column: 'name' },
  technician: { table: 'technicians', column: 'full_name' },
  work_order: { table: 'work_orders', column: 'title' },
} as const;

/** Actividad reciente de la organización (lectura bajo RLS, más reciente primero). */
export async function listRecentActivity(
  ctx: TenantContext,
  limit = 10,
): Promise<ServiceResult<RecentActivity[]>> {
  const db = ctx.supabase as unknown as SupabaseClient;
  const events = await db
    .from('activity_events')
    .select('id, entity_type, entity_id, action, actor_id, occurred_at')
    .eq('organization_id', ctx.organizationId)
    // Solo lo que el panel sabe mostrar: los demás eventos (presupuestos, inventario) viven en /activity
    // y no deben ocupar huecos del límite.
    .in('entity_type', RECENT_TYPES)
    .in('action', RECENT_ACTIONS)
    .order('occurred_at', { ascending: false })
    .order('seq', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (events.error) return fail(mapDbError(events.error));
  const rows = (events.data ?? []) as Record<string, unknown>[];

  const labels = new Map<string, string>();
  for (const type of RECENT_TYPES) {
    const ids = [
      ...new Set(
        rows.filter((row) => row.entity_type === type).map((row) => String(row.entity_id)),
      ),
    ];
    if (ids.length === 0) continue;
    const { table, column } = LABEL_SOURCE[type];
    const found = await db
      .from(table)
      .select(`id, ${column}`)
      .eq('organization_id', ctx.organizationId)
      .in('id', ids);
    if (found.error) continue; // sin etiqueta: se muestra solo la acción
    for (const row of (found.data ?? []) as unknown as Record<string, unknown>[]) {
      if (typeof row[column] === 'string') labels.set(`${type}:${String(row.id)}`, row[column]);
    }
  }

  const members = await db
    .from('memberships')
    .select('user_id')
    .eq('organization_id', ctx.organizationId);
  const memberIds = new Set(
    members.error ? [] : ((members.data ?? []) as { user_id: string }[]).map((m) => m.user_id),
  );

  return ok(
    rows.flatMap((row): RecentActivity[] => {
      const type = RECENT_TYPES.find((t) => t === row.entity_type);
      const action = RECENT_ACTIONS.find((a) => a === row.action);
      if (!type || !action) return [];
      const actorId = String(row.actor_id);
      return [
        {
          id: String(row.id),
          entityType: type,
          entityId: String(row.entity_id),
          entityLabel: labels.get(`${type}:${String(row.entity_id)}`) ?? null,
          action,
          occurredAt: String(row.occurred_at),
          actor: actorId === ctx.userId ? 'self' : memberIds.has(actorId) ? 'member' : 'former',
        },
      ];
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Página de actividad (/activity): lectura paginada y filtrable de activity_events bajo RLS.
// ---------------------------------------------------------------------------------------------

export type ActivityDetail = {
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  orderId: string | null;
  orderTitle: string | null;
  unit: string | null;
};

export type ActivityEntry = {
  id: string;
  entityType: ActivityEntity;
  entityId: string;
  /** Nombre o título de la entidad si todavía es legible bajo RLS; null en otro caso. */
  entityLabel: string | null;
  action: ActivityAction;
  occurredAt: string;
  actor: ActivityActor;
  /** Detalle estructurado de los movimientos de stock (sin la nota libre); null en el resto. */
  detail: ActivityDetail | null;
};

export type ActivityPage = {
  items: ActivityEntry[];
  total: number;
  page: number;
  pageCount: number;
};

const ENTITY_LABEL_SOURCE: Record<
  ActivityEntity,
  { table: string; select: string; column: string }
> = {
  customer: { table: 'customers', select: 'id, name', column: 'name' },
  technician: { table: 'technicians', select: 'id, full_name', column: 'full_name' },
  work_order: { table: 'work_orders', select: 'id, title', column: 'title' },
  quote: { table: 'quotes', select: 'id, title', column: 'title' },
  inventory_item: { table: 'inventory_items', select: 'id, name, unit', column: 'name' },
};

interface ActivityChain extends PromiseLike<{
  data: unknown;
  error: { code?: string | null } | null;
  count: number | null;
}> {
  eq(column: string, value: string): ActivityChain;
  gte(column: string, value: string): ActivityChain;
  lt(column: string, value: string): ActivityChain;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): ActivityChain;
  range(from: number, to: number): ActivityChain;
}

/**
 * Actividad de la organización, más reciente primero (occurred_at desc, seq desc), paginada de 20 en
 * 20. Filtros opcionales: entidad, acción y rango de fechas (día natural de Europe/Madrid, extremos
 * incluidos). `entityId` acota a una sola entidad. Lectura bajo RLS con el cliente de la sesión.
 */
export async function listActivity(
  ctx: TenantContext,
  params: ActivityListParams,
  options: { entityId?: string } = {},
): Promise<ServiceResult<ActivityPage>> {
  const db = ctx.supabase as unknown as SupabaseClient;
  const { fromIso, toIso } = activityRange(params);

  // Vista mínima del constructor de PostgREST (evita tipos recursivos profundos).
  const filtered = (query: unknown): ActivityChain => {
    let result = (query as ActivityChain).eq('organization_id', ctx.organizationId);
    if (params.entity) result = result.eq('entity_type', params.entity);
    if (options.entityId) result = result.eq('entity_id', options.entityId);
    if (params.action) result = result.eq('action', params.action);
    if (fromIso) result = result.gte('occurred_at', fromIso);
    if (toIso) result = result.lt('occurred_at', toIso);
    return result;
  };

  const counted = await filtered(
    db.from('activity_events').select('id', { count: 'exact', head: true }),
  );
  if (counted.error) return fail(mapDbError(counted.error));
  const total = counted.count ?? 0;
  const pageCount = pageCountFor(total);
  const page = Math.min(params.page, pageCount);
  if (total === 0) return ok({ items: [], total, page, pageCount });

  const start = (page - 1) * PAGE_SIZE;
  const events = await filtered(
    db.from('activity_events').select('id, entity_type, entity_id, action, actor_id, occurred_at'),
  )
    .order('occurred_at', { ascending: false })
    .order('seq', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .range(start, start + PAGE_SIZE - 1);
  if (events.error) return fail(mapDbError(events.error));
  const rows = (events.data ?? []) as Record<string, unknown>[];

  const labels = new Map<string, { label: string; unit: string | null }>();
  for (const type of ACTIVITY_ENTITIES) {
    const ids = [
      ...new Set(
        rows.filter((row) => row.entity_type === type).map((row) => String(row.entity_id)),
      ),
    ];
    if (ids.length === 0) continue;
    const source = ENTITY_LABEL_SOURCE[type];
    const found = await db
      .from(source.table)
      .select(source.select)
      .eq('organization_id', ctx.organizationId)
      .in('id', ids);
    if (found.error) continue; // sin etiqueta: se muestra solo la acción
    for (const row of (found.data ?? []) as unknown as Record<string, unknown>[]) {
      const label = row[source.column];
      if (typeof label === 'string') {
        labels.set(`${type}:${String(row.id)}`, {
          label,
          unit: typeof row.unit === 'string' ? row.unit : null,
        });
      }
    }
  }

  // Detalle estructurado de los movimientos de stock (cantidad y saldos; nunca la nota libre).
  const stockIds = rows
    .filter(
      (row) => row.entity_type === 'inventory_item' && String(row.action).startsWith('stock_'),
    )
    .map((row) => String(row.id));
  const details = new Map<string, Record<string, unknown>>();
  if (stockIds.length > 0) {
    const found = await db
      .from('inventory_event_details')
      .select('event_id, quantity, balance_before, balance_after, order_id')
      .eq('organization_id', ctx.organizationId)
      .in('event_id', stockIds);
    if (!found.error) {
      for (const row of (found.data ?? []) as Record<string, unknown>[]) {
        details.set(String(row.event_id), row);
      }
    }
  }
  const orderIds = [
    ...new Set(
      [...details.values()]
        .map((row) => row.order_id)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ];
  const orderTitles = new Map<string, string>();
  if (orderIds.length > 0) {
    const found = await db
      .from('work_orders')
      .select('id, title')
      .eq('organization_id', ctx.organizationId)
      .in('id', orderIds);
    if (!found.error) {
      for (const row of (found.data ?? []) as Record<string, unknown>[]) {
        if (typeof row.title === 'string') orderTitles.set(String(row.id), row.title);
      }
    }
  }

  const members = await db
    .from('memberships')
    .select('user_id')
    .eq('organization_id', ctx.organizationId);
  const memberIds = new Set(
    members.error ? [] : ((members.data ?? []) as { user_id: string }[]).map((m) => m.user_id),
  );

  const items = rows.flatMap((row): ActivityEntry[] => {
    const type = ACTIVITY_ENTITIES.find((t) => t === row.entity_type);
    const action = ACTIVITY_ACTIONS.find((a) => a === row.action);
    if (!type || !action) return [];
    const actorId = String(row.actor_id);
    const entityId = String(row.entity_id);
    const meta = labels.get(`${type}:${entityId}`);
    const raw = details.get(String(row.id));
    const orderId = raw && typeof raw.order_id === 'string' ? raw.order_id : null;
    return [
      {
        id: String(row.id),
        entityType: type,
        entityId,
        entityLabel: meta?.label ?? null,
        action,
        occurredAt: String(row.occurred_at),
        actor: actorId === ctx.userId ? 'self' : memberIds.has(actorId) ? 'member' : 'former',
        detail: raw
          ? {
              quantity: Number(raw.quantity),
              balanceBefore: Number(raw.balance_before),
              balanceAfter: Number(raw.balance_after),
              orderId,
              orderTitle: orderId ? (orderTitles.get(orderId) ?? null) : null,
              unit: meta?.unit ?? null,
            }
          : null,
      },
    ];
  });
  return ok({ items, total, page, pageCount });
}
