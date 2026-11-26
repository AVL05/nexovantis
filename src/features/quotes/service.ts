import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  NOT_FOUND_MESSAGE,
  fail,
  mapDbError,
  ok,
  type ServiceError,
  type ServiceFailure,
  type ServiceResult,
} from '@/lib/records/errors';
import { pageCountFor } from '@/lib/records/params';
import { buildSearchFilter, escapeLikePattern } from '@/lib/records/search';
import type { TenantContext } from '@/lib/records/tenant';

import {
  isQuoteEventAction,
  isQuoteStatus,
  type QuoteEventAction,
  type QuoteStatus,
} from './constants';
import { PAGE_SIZE, quoteNumberFromQuery, type QuoteListParams } from './params';
import type {
  ItemCreateInput,
  ItemUpdateInput,
  QuoteCreateInput,
  QuoteUpdateInput,
} from './schema';

// Servicio de presupuestos (solo servidor). Usa el cliente de la sesión del usuario: RLS es la
// frontera y toda escritura pasa por las RPC de PostgreSQL (rpc/*_quote*), que derivan la
// organización de la membresía, aplican las reglas (solo borrador editable, decisión terminal),
// calculan los totales y escriben los eventos en la misma transacción. La organización de `ctx`
// solo sirve para filtrar lecturas. Nunca se envían totales ni estados desde aquí.

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
  or(filters: string): Chain;
  ilike(column: string, pattern: string): Chain;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): Chain;
  range(from: number, to: number): Chain;
  limit(count: number): Chain;
}

const uuid = z.uuid();
const OPTIONS_LIMIT = 500;
const HISTORY_LIMIT = 50;

function db(ctx: TenantContext): SupabaseClient {
  return ctx.supabase as unknown as SupabaseClient;
}

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const int = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
};
const notFound = () => fail({ kind: 'not_found', message: NOT_FOUND_MESSAGE });

/** Errores de dominio de presupuestos (NX010..NX016); el resto, el mapeo común. */
export function mapQuoteError(error: { code?: string | null } | null | undefined): ServiceError {
  switch (error?.code) {
    case 'NX010':
      return { kind: 'not_found', message: NOT_FOUND_MESSAGE };
    case 'NX011':
      return {
        kind: 'conflict',
        message: 'Un presupuesto aceptado o rechazado es de solo lectura. Recarga la página.',
      };
    case 'NX012':
      return {
        kind: 'conflict',
        message:
          'El presupuesto ya fue aceptado o rechazado y no admite esa decisión. Recarga la página.',
      };
    case 'NX013':
      return {
        kind: 'conflict',
        message: 'El cliente elegido no está disponible. Elige otro activo.',
      };
    case 'NX014':
      return { kind: 'not_found', message: 'El concepto ya no existe. Recarga la página.' };
    case 'NX015':
      return { kind: 'conflict', message: 'Un presupuesto admite como máximo 100 conceptos.' };
    case 'NX016':
      return {
        kind: 'conflict',
        message: 'Añade al menos un concepto antes de aceptar el presupuesto.',
      };
    case '23514':
    case '22003':
    case '22P02':
      return { kind: 'invalid', message: 'Los datos enviados no son válidos.' };
    default:
      return mapDbError(error);
  }
}

const failure = (error: { code?: string | null }): ServiceFailure => fail(mapQuoteError(error));

export type QuoteView = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: QuoteStatus;
  customerId: string;
  customerName: string;
  customerArchived: boolean;
  /** Orden generada al aceptar (solo en aceptados). */
  orderId: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuoteItemView = {
  id: string;
  position: number;
  description: string;
  /** Texto decimal de la base ("2.5"). */
  quantity: string;
  unitPriceCents: number;
  taxRateBp: number;
  subtotalCents: number;
  taxCents: number;
};

export type QuoteListResult = {
  items: QuoteView[];
  total: number;
  page: number;
  pageCount: number;
};

export type CustomerOption = { id: string; name: string };

export type QuoteHistoryEntry = {
  id: string;
  action: QuoteEventAction;
  occurredAt: string;
  actor: 'self' | 'member' | 'former';
};

type Names = Map<string, { name: string; archived: boolean }>;

async function customerNames(
  ctx: TenantContext,
  ids: readonly string[],
): Promise<ServiceResult<Names>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return ok(new Map());
  const { data, error } = await (
    db(ctx).from('customers').select('id, name, archived_at') as unknown as Chain
  )
    .eq('organization_id', ctx.organizationId)
    .in('id', unique);
  if (error) return failure(error);
  const map: Names = new Map();
  for (const row of (data ?? []) as Row[]) {
    map.set(String(row.id), { name: str(row.name) ?? '', archived: row.archived_at !== null });
  }
  return ok(map);
}

function toView(row: Row, customers: Names): QuoteView {
  const customerId = String(row.customer_id);
  return {
    id: String(row.id),
    number: int(row.number),
    title: str(row.title) ?? '',
    description: str(row.description),
    status: isQuoteStatus(row.status) ? row.status : 'draft',
    customerId,
    customerName: customers.get(customerId)?.name ?? 'Cliente no disponible',
    customerArchived: customers.get(customerId)?.archived ?? false,
    orderId: str(row.order_id),
    subtotalCents: int(row.subtotal_cents),
    taxCents: int(row.tax_cents),
    totalCents: int(row.total_cents),
    decidedAt: str(row.decided_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function hydrate(ctx: TenantContext, rows: Row[]): Promise<ServiceResult<QuoteView[]>> {
  const customers = await customerNames(
    ctx,
    rows.map((row) => String(row.customer_id)),
  );
  if (!customers.ok) return customers;
  return ok(rows.map((row) => toView(row, customers.data)));
}

/**
 * Patrón ILIKE (texto literal) para buscar por nombre de cliente sobre el recurso embebido. Es un
 * filtro simple (no lógico): PostgREST toma el valor tal cual, sin comillas.
 */
function customerNamePattern(q: string): string {
  return `%${escapeLikePattern(q.replace(/[\u0000-\u001f\u007f]/g, ' ').trim())}%`;
}

/**
 * Embed vacío (no añade columnas a la respuesta) de la única FK hacia `customers`. Filtrado por
 * nombre, `search_customer.not.is.null` dentro del `or` equivale a "su cliente coincide": la
 * búsqueda se resuelve en la propia consulta, bajo RLS y sin límite de clientes coincidentes.
 */
const CUSTOMER_EMBED = 'search_customer:customers()';

/** Texto de búsqueda sobre las columnas propias (escapado); null si el término está vacío. */
const textFilter = (q: string) => buildSearchFilter(q, ['title', 'description']);

/** El embed solo se pide cuando hay término de búsqueda. */
const listColumns = (columns: string, q: string) =>
  textFilter(q) ? `${columns},${CUSTOMER_EMBED}` : columns;

/** Filtros de listado; el texto va siempre escapado (sin inyección en `.or()`). */
function applyFilters(query: unknown, ctx: TenantContext, params: QuoteListParams) {
  let result = (query as Chain).eq('organization_id', ctx.organizationId);
  if (params.status) result = result.eq('status', params.status);
  if (params.customer) result = result.eq('customer_id', params.customer);
  const text = textFilter(params.q);
  if (text) {
    const number = quoteNumberFromQuery(params.q);
    const byNumber = number === null ? '' : `,number.eq.${number}`;
    result = result
      .eq('search_customer.organization_id', ctx.organizationId)
      .ilike('search_customer.name', customerNamePattern(params.q))
      .or(`${text},search_customer.not.is.null${byNumber}`);
  }
  return result;
}

export const quoteService = {
  /** Listado paginado (20 por página) con búsqueda y filtros. La página se acota al rango válido. */
  async list(ctx: TenantContext, params: QuoteListParams): Promise<ServiceResult<QuoteListResult>> {
    const counted = await applyFilters(
      db(ctx).from('quotes').select(listColumns('id', params.q), { count: 'exact', head: true }),
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
      db(ctx).from('quotes').select(listColumns('*', params.q)),
      ctx,
      params,
    )
      .order('number', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return failure(error);
    const items = await hydrate(ctx, (data ?? []) as Row[]);
    if (!items.ok) return items;
    return ok({ items: items.data, total, page, pageCount });
  },

  async get(ctx: TenantContext, id: string): Promise<ServiceResult<QuoteView>> {
    if (!uuid.safeParse(id).success) return notFound();
    const { data, error } = await db(ctx)
      .from('quotes')
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

  /** Conceptos del presupuesto en su orden de alta. */
  async items(ctx: TenantContext, quoteId: string): Promise<ServiceResult<QuoteItemView[]>> {
    const { data, error } = await (db(ctx).from('quote_items').select('*') as unknown as Chain)
      .eq('organization_id', ctx.organizationId)
      .eq('quote_id', quoteId)
      .order('position', { ascending: true });
    if (error) return failure(error);
    return ok(
      ((data ?? []) as Row[]).map((row) => ({
        id: String(row.id),
        position: int(row.position),
        description: str(row.description) ?? '',
        quantity: String(row.quantity),
        unitPriceCents: int(row.unit_price_cents),
        taxRateBp: int(row.tax_rate_bp),
        subtotalCents: int(row.subtotal_cents),
        taxCents: int(row.tax_cents),
      })),
    );
  },

  /** Clientes activos para formularios, y todos para el filtro del listado. */
  async customers(
    ctx: TenantContext,
    mode: 'active' | 'all',
  ): Promise<ServiceResult<CustomerOption[]>> {
    let query = (db(ctx).from('customers').select('id, name') as unknown as Chain).eq(
      'organization_id',
      ctx.organizationId,
    );
    if (mode === 'active') query = query.is('archived_at', null);
    const { data, error } = await query.order('name', { ascending: true }).limit(OPTIONS_LIMIT);
    if (error) return failure(error);
    return ok(
      ((data ?? []) as Row[]).map((row) => ({ id: String(row.id), name: str(row.name) ?? '' })),
    );
  },

  async create(
    ctx: TenantContext,
    input: QuoteCreateInput,
  ): Promise<ServiceResult<{ id: string }>> {
    const { data, error } = await db(ctx).rpc('create_quote', {
      p_id: input.request_id,
      p_customer_id: input.customer_id,
      p_title: input.title,
      p_description: input.description,
    });
    if (error) return failure(error);
    return ok({ id: String(data) });
  },

  async update(
    ctx: TenantContext,
    input: QuoteUpdateInput,
  ): Promise<ServiceResult<{ id: string }>> {
    const { error } = await db(ctx).rpc('update_quote', {
      p_id: input.id,
      p_customer_id: input.customer_id,
      p_title: input.title,
      p_description: input.description,
    });
    if (error) return failure(error);
    return ok({ id: input.id });
  },

  async addItem(
    ctx: TenantContext,
    input: ItemCreateInput,
  ): Promise<ServiceResult<{ id: string }>> {
    const { data, error } = await db(ctx).rpc('add_quote_item', {
      p_quote_id: input.quote_id,
      p_item_id: input.request_id,
      p_description: input.description,
      p_quantity: input.quantity,
      p_unit_price_cents: input.unit_price,
      p_tax_rate_bp: input.tax_rate_bp,
    });
    if (error) return failure(error);
    return ok({ id: String(data) });
  },

  async updateItem(
    ctx: TenantContext,
    input: ItemUpdateInput,
  ): Promise<ServiceResult<{ id: string }>> {
    const { error } = await db(ctx).rpc('update_quote_item', {
      p_item_id: input.id,
      p_description: input.description,
      p_quantity: input.quantity,
      p_unit_price_cents: input.unit_price,
      p_tax_rate_bp: input.tax_rate_bp,
    });
    if (error) return failure(error);
    return ok({ id: input.id });
  },

  async removeItem(
    ctx: TenantContext,
    itemId: string,
  ): Promise<ServiceResult<{ removed: boolean }>> {
    const { data, error } = await db(ctx).rpc('remove_quote_item', { p_item_id: itemId });
    if (error) return failure(error);
    return ok({ removed: data === true });
  },

  /** Acepta (idempotente): devuelve la orden generada, la misma en cada repetición. */
  async accept(ctx: TenantContext, id: string): Promise<ServiceResult<{ orderId: string }>> {
    const { data, error } = await db(ctx).rpc('accept_quote', { p_id: id });
    if (error) return failure(error);
    return ok({ orderId: String(data) });
  },

  async reject(ctx: TenantContext, id: string): Promise<ServiceResult<{ changed: boolean }>> {
    const { data, error } = await db(ctx).rpc('reject_quote', { p_id: id });
    if (error) return failure(error);
    return ok({ changed: data === true });
  },

  /** Historial de eventos de un presupuesto (más reciente primero). */
  async history(ctx: TenantContext, quoteId: string): Promise<ServiceResult<QuoteHistoryEntry[]>> {
    const events = await (
      db(ctx)
        .from('activity_events')
        .select('id, action, actor_id, occurred_at') as unknown as Chain
    )
      .eq('organization_id', ctx.organizationId)
      .eq('entity_type', 'quote')
      .eq('entity_id', quoteId)
      .order('occurred_at', { ascending: false })
      .order('seq', { ascending: false, nullsFirst: false })
      .limit(HISTORY_LIMIT);
    if (events.error) return failure(events.error);

    const members = await (db(ctx).from('memberships').select('user_id') as unknown as Chain).eq(
      'organization_id',
      ctx.organizationId,
    );
    const memberIds = new Set(
      members.error ? [] : ((members.data ?? []) as Row[]).map((row) => String(row.user_id)),
    );

    return ok(
      ((events.data ?? []) as Row[]).flatMap((row): QuoteHistoryEntry[] => {
        if (!isQuoteEventAction(row.action)) return [];
        const actorId = String(row.actor_id);
        return [
          {
            id: String(row.id),
            action: row.action,
            occurredAt: String(row.occurred_at),
            actor: actorId === ctx.userId ? 'self' : memberIds.has(actorId) ? 'member' : 'former',
          },
        ];
      }),
    );
  },
};
