import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { fail, mapDbError, ok, type ServiceResult } from '@/lib/records/errors';
import type { TenantContext } from '@/lib/records/tenant';

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
