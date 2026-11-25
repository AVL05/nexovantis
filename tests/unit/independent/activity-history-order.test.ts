// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Prueba independiente de Testing (TASK-010 PRE, A02-05). Develop no la modifica.
// UNITARIA con un doble del cliente de datos: solo comprueba la CONSULTA que construye
// listEntityHistory (src/features/activity/service.ts). El orden real en base de datos se
// verifica en tests/integration/independent/activity-order.test.ts (PGlite) y por PostgREST en CI.
//
// Contrato: el historial (mas reciente primero) se pide ordenando por occurred_at DESC y, como
// desempate, por seq DESC (columna creada por la migracion de TASK-010). La aplicacion no
// reordena en memoria: conserva el orden recibido.

vi.mock('server-only', () => ({}));

import { listEntityHistory } from '@/features/activity/service';

type OrderCall = [string, { ascending?: boolean } | undefined];

function fakeContext(events: Record<string, unknown>[]) {
  const calls: { table: string; order: OrderCall[]; limit?: number }[] = [];
  const supabase = {
    from(table: string) {
      const record = { table, order: [] as OrderCall[], limit: undefined as number | undefined };
      calls.push(record);
      const result =
        table === 'activity_events'
          ? { data: events, error: null }
          : { data: [{ user_id: 'user-1' }], error: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        order: (column: string, options?: { ascending?: boolean }) => {
          record.order.push([column, options]);
          return builder;
        },
        limit: (n: number) => {
          record.limit = n;
          return builder;
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return builder;
    },
  };
  return { ctx: { supabase, organizationId: 'org-1', userId: 'user-1' } as never, calls };
}

describe('A02-05 listEntityHistory: orden determinista del historial', () => {
  it('ordena por occurred_at descendente y despues por seq descendente', async () => {
    const { ctx, calls } = fakeContext([]);
    const result = await listEntityHistory(ctx, 'customer', 'entity-1');
    expect(result.ok).toBe(true);
    const events = calls.find((c) => c.table === 'activity_events')!;
    expect(events.order.map(([column]) => column)).toEqual(['occurred_at', 'seq']);
    expect(events.order.every(([, options]) => options?.ascending === false)).toBe(true);
  });

  it('conserva el orden recibido para eventos con el mismo occurred_at (sin reordenar en memoria)', async () => {
    const same = '2026-11-24T10:00:00.000Z';
    const { ctx } = fakeContext([
      { id: 'e3', action: 'archived', actor_id: 'user-1', occurred_at: same, seq: 3 },
      { id: 'e2', action: 'restored', actor_id: 'user-1', occurred_at: same, seq: 2 },
      { id: 'e1', action: 'archived', actor_id: 'user-1', occurred_at: same, seq: 1 },
    ]);
    const result = await listEntityHistory(ctx, 'customer', 'entity-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((entry) => entry.id)).toEqual(['e3', 'e2', 'e1']);
    expect(result.data.map((entry) => entry.action)).toEqual(['archived', 'restored', 'archived']);
  });
});
