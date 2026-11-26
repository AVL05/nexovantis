// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// TASK-014 / C3: qué eventos pide el panel y cómo etiqueta los artículos de inventario.

vi.mock('server-only', () => ({}));

import { listRecentActivity } from '@/features/activity/service';

describe('C3 consulta de actividad reciente', () => {
  function context(events: Record<string, unknown>[]) {
    const filters: Record<string, readonly string[]> = {};
    const rows: Record<string, unknown[]> = {
      activity_events: events,
      inventory_items: [{ id: 'i1', name: 'Tubo de cobre' }],
      memberships: [{ user_id: 'u1' }],
    };
    const supabase = {
      from(table: string) {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => builder,
          in: (column: string, values: readonly string[]) => {
            if (table === 'activity_events') filters[column] = values;
            return builder;
          },
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve),
        };
        return builder;
      },
    };
    return { ctx: { supabase, organizationId: 'o1', userId: 'u1' } as never, filters };
  }

  it('pide los eventos de inventario (no los de presupuestos) y etiqueta el artículo', async () => {
    const { ctx, filters } = context([
      {
        id: 'e1',
        entity_type: 'inventory_item',
        entity_id: 'i1',
        action: 'stock_consumed',
        actor_id: 'u1',
        occurred_at: '2026-11-25T10:00:00Z',
      },
    ]);
    const result = await listRecentActivity(ctx, 10);
    expect(filters.entity_type).toContain('inventory_item');
    expect(filters.entity_type).not.toContain('quote');
    for (const action of ['created', 'stock_in', 'stock_out', 'stock_consumed', 'restored']) {
      expect(filters.action).toContain(action);
    }
    expect(filters.action).not.toContain('accepted');
    expect(result.ok && result.data[0]).toMatchObject({
      entityType: 'inventory_item',
      entityLabel: 'Tubo de cobre',
      action: 'stock_consumed',
      actor: 'self',
    });
  });
});
