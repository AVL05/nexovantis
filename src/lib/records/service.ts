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
} from './errors';
import { PAGE_SIZE, pageCountFor, type ListParams } from './params';
import { buildSearchFilter } from './search';
import type { TenantContext } from './tenant';
import type { ListResult, RecordView } from './types';

// Servicio de acceso a datos compartido por Clientes y Técnicos. Solo server-only: usa el cliente
// del usuario (RLS es la frontera) y filtra siempre por la organización de la membresía.

export type RecordConfig = {
  table: 'customers' | 'technicians';
  nameColumn: 'name' | 'full_name';
};

/** Campos editables ya validados (claves = columnas). Nunca incluye organization_id. */
export type RecordFields = Record<string, string | null>;

type Row = Record<string, unknown>;

type QueryResult = {
  data: unknown;
  error: { code?: string | null } | null;
  count: number | null;
};

/** Vista mínima del constructor de consultas de PostgREST (evita tipos recursivos profundos). */
interface Chain extends PromiseLike<QueryResult> {
  eq(column: string, value: string): Chain;
  is(column: string, value: null): Chain;
  not(column: string, operator: string, value: null): Chain;
  or(filters: string): Chain;
  order(column: string, options: { ascending: boolean }): Chain;
  range(from: number, to: number): Chain;
}

const uuid = z.uuid();

function db(ctx: TenantContext): SupabaseClient {
  // Los tipos de tabla son una unión (cliente/técnico): se usa una vista sin tipos de tabla y la
  // lectura se normaliza en `toView`.
  return ctx.supabase as unknown as SupabaseClient;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toView(row: Row, nameColumn: RecordConfig['nameColumn']): RecordView {
  return {
    id: String(row.id),
    name: str(row[nameColumn]) ?? '',
    email: str(row.email),
    phone: str(row.phone),
    notes: str(row.notes),
    archivedAt: str(row.archived_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function applyFilters(
  query: unknown,
  config: RecordConfig,
  ctx: TenantContext,
  params: Pick<ListParams, 'q' | 'status'>,
): Chain {
  let result = (query as Chain).eq('organization_id', ctx.organizationId);
  if (params.status === 'activos') result = result.is('archived_at', null);
  if (params.status === 'archivados') result = result.not('archived_at', 'is', null);
  const search = buildSearchFilter(params.q, [config.nameColumn, 'email', 'phone']);
  if (search) result = result.or(search);
  return result;
}

export function createRecordService(config: RecordConfig) {
  const { table, nameColumn } = config;

  async function fetchRow(ctx: TenantContext, id: string): Promise<ServiceResult<RecordView>> {
    if (!uuid.safeParse(id).success) return fail({ kind: 'not_found', message: NOT_FOUND_MESSAGE });
    const { data, error } = await db(ctx)
      .from(table)
      .select('*')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (error) return fail(mapDbError(error));
    if (!data) return fail({ kind: 'not_found', message: NOT_FOUND_MESSAGE });
    return ok(toView(data as Row, nameColumn));
  }

  /** Tras un UPDATE sin filas: no existe (o es de otra organización) o está en otro estado. */
  async function explainNoChange(
    ctx: TenantContext,
    id: string,
    whenArchived: string,
    whenActive: string,
  ): Promise<ServiceFailure> {
    const current = await fetchRow(ctx, id);
    if (!current.ok) return current;
    return fail({
      kind: 'conflict',
      message: current.data.archivedAt ? whenArchived : whenActive,
    });
  }

  return {
    /** Listado paginado con búsqueda y filtro de estado. La página se acota al rango válido. */
    async list(ctx: TenantContext, params: ListParams): Promise<ServiceResult<ListResult>> {
      const counted = await applyFilters(
        db(ctx).from(table).select('id', { count: 'exact', head: true }),
        config,
        ctx,
        params,
      );
      if (counted.error) return fail(mapDbError(counted.error));
      const total = counted.count ?? 0;
      const pageCount = pageCountFor(total);
      const page = Math.min(params.page, pageCount);
      if (total === 0) return ok({ items: [], total, page, pageCount });

      const from = (page - 1) * PAGE_SIZE;
      const { data, error } = await applyFilters(
        db(ctx).from(table).select('*'),
        config,
        ctx,
        params,
      )
        .order(nameColumn, { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) return fail(mapDbError(error));
      const items = ((data ?? []) as Row[]).map((row) => toView(row, nameColumn));
      return ok({ items, total, page, pageCount });
    },

    get: fetchRow,

    async create(ctx: TenantContext, fields: RecordFields): Promise<ServiceResult<{ id: string }>> {
      const { data, error } = await db(ctx)
        .from(table)
        .insert({ ...fields, organization_id: ctx.organizationId })
        .select('id')
        .single();
      if (error) return fail(mapDbError(error));
      return ok({ id: String((data as Row).id) });
    },

    async update(
      ctx: TenantContext,
      id: string,
      fields: RecordFields,
    ): Promise<ServiceResult<{ id: string }>> {
      if (!uuid.safeParse(id).success) {
        return fail({ kind: 'not_found', message: NOT_FOUND_MESSAGE });
      }
      const { data, error } = await db(ctx)
        .from(table)
        .update(fields)
        .eq('id', id)
        .eq('organization_id', ctx.organizationId)
        .is('archived_at', null)
        .select('id');
      if (error) return fail(mapDbError(error));
      if ((data ?? []).length === 0) {
        return explainNoChange(
          ctx,
          id,
          'Un registro archivado no se puede editar. Restáuralo primero.',
          'No se pudo guardar el registro. Inténtalo de nuevo.',
        );
      }
      return ok({ id });
    },

    /**
     * Archiva (la hora la fija PostgreSQL; el valor enviado se ignora). El evento se escribe en
     * la misma transacción por trigger. DH-04/DH-05 (F4): la comprobación "sin órdenes abiertas"
     * se añadirá en la función de trigger private.prevent_unarchive() (ver ADR-001); un rechazo
     * llegará aquí como error 23000 y se mapeará a conflicto.
     */
    async archive(ctx: TenantContext, id: string): Promise<ServiceResult<{ id: string }>> {
      if (!uuid.safeParse(id).success) {
        return fail({ kind: 'not_found', message: NOT_FOUND_MESSAGE });
      }
      const { data, error } = await db(ctx)
        .from(table)
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', ctx.organizationId)
        .is('archived_at', null)
        .select('id');
      if (error) return fail(mapDbError(error));
      if ((data ?? []).length === 0) {
        return explainNoChange(ctx, id, 'El registro ya está archivado.', 'No se pudo archivar.');
      }
      return ok({ id });
    },

    async restore(ctx: TenantContext, id: string): Promise<ServiceResult<{ id: string }>> {
      if (!uuid.safeParse(id).success) {
        return fail({ kind: 'not_found', message: NOT_FOUND_MESSAGE });
      }
      const { data, error } = await db(ctx)
        .from(table)
        .update({ archived_at: null })
        .eq('id', id)
        .eq('organization_id', ctx.organizationId)
        .not('archived_at', 'is', null)
        .select('id');
      if (error) return fail(mapDbError(error));
      if ((data ?? []).length === 0) {
        return explainNoChange(ctx, id, 'No se pudo restaurar.', 'El registro ya está activo.');
      }
      return ok({ id });
    },

    /** Recuento exacto de registros activos de la organización (dato persistido, bajo RLS). */
    async countActive(ctx: TenantContext): Promise<ServiceResult<number>> {
      const { count, error } = await db(ctx)
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)
        .is('archived_at', null);
      if (error) return fail(mapDbError(error));
      return ok(count ?? 0);
    },
  };
}

export type RecordService = ReturnType<typeof createRecordService>;
