// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';

import { buildStack, must, type Stack } from './support/stack';

// Caso independiente de Testing (TASK-010 PRE, A02-06 y A02-05) contra el stack LOCAL de Supabase
// en CI (`pnpm test:supabase`): PostgREST y JWT reales. Complementa a
// tests/integration/independent/archived-readonly.test.ts y activity-order.test.ts (PGlite).
// Si faltan SUPABASE_*, FALLA. NO se ha podido ejecutar en local (sin Docker): validacion efectiva
// pendiente de CI.
//
// A02-06: un archivado es de solo lectura: ningun PATCH directo por la API cambia campos, tampoco
//   combinado con la restauracion; restaurar solo (archived_at = null) sigue siendo posible.
// A02-05: public.activity_events.seq (bigint) se expone en lectura a la organizacion, crece en el
//   orden de los eventos y no se puede escribir por la API.

let stack: Stack;
beforeAll(async () => {
  stack = await buildStack('ro');
}, 120_000);

const KINDS = [
  { table: 'customers', col: 'name', type: 'customer' },
  { table: 'technicians', col: 'full_name', type: 'technician' },
] as const;

async function archivedRow(table: 'customers' | 'technicians', col: string): Promise<string> {
  const row = must(
    await stack.admin
      .from(table)
      .insert({
        organization_id: stack.orgA.id,
        [col]: 'Original',
        email: 'o@example.test',
        phone: '+34 000 111 111',
        notes: 'nota original',
      })
      .select('id')
      .single(),
    'fila',
  ) as { id: string };
  must(
    await stack.ownerA.client
      .from(table)
      .update({ archived_at: new Date().toISOString() })
      .eq('id', row.id)
      .select('id'),
    'archivar',
  );
  return row.id;
}

const state = async (table: string, id: string) =>
  must(await stack.admin.from(table).select('*').eq('id', id).single(), 'estado') as Record<
    string,
    unknown
  >;
const actions = async (id: string) =>
  (
    must(
      await stack.admin
        .from('activity_events')
        .select('action, occurred_at')
        .eq('entity_id', id)
        .order('occurred_at'),
      'eventos',
    ) as { action: string }[]
  ).map((e) => e.action);

describe.each(KINDS)(
  'A02-06 por PostgREST: archivado de solo lectura en $table',
  ({ table, col, type }) => {
    it.each([
      ['owner', () => stack.ownerA.client],
      ['member', () => stack.memberA.client],
    ] as const)(
      'N: %s no edita ningun campo de un archivado (23000) y la fila no cambia',
      async (_who, client) => {
        const id = await archivedRow(table, col);
        const before = await state(table, id);
        for (const patch of [
          { [col]: 'Nombre editado' },
          { email: 'editado@example.test' },
          { phone: '+34 000 222 222' },
          { notes: 'editada' },
          { [col]: 'X', notes: 'Y' },
        ]) {
          const res = await client().from(table).update(patch).eq('id', id).select('id');
          expect(res.error?.code, JSON.stringify(patch)).toBe('23000');
        }
        expect(await state(table, id)).toEqual(before);
        expect(await actions(id)).toEqual(['archived']);
      },
    );

    it('N: restaurar y editar en el mismo PATCH se rechaza (23000), sigue archivado y sin evento restored', async () => {
      for (const patch of [
        { archived_at: null, [col]: 'Nombre editado' },
        { archived_at: null, notes: 'editada' },
        { archived_at: null, email: 'editado@example.test', phone: '+34 000 333 333' },
      ]) {
        const id = await archivedRow(table, col);
        const before = await state(table, id);
        const res = await stack.ownerA.client.from(table).update(patch).eq('id', id).select('id');
        expect(res.error?.code, JSON.stringify(patch)).toBe('23000');
        expect(await state(table, id)).toEqual(before);
        expect(await actions(id)).toEqual(['archived']);
      }
    });

    it('N: un PATCH masivo sobre activos y archivados falla entero (ninguna fila cambia)', async () => {
      const archived = await archivedRow(table, col);
      const active = must(
        await stack.admin
          .from(table)
          .insert({ organization_id: stack.orgA.id, [col]: 'Activo mixto', notes: 'n0' })
          .select('id')
          .single(),
        'activo',
      ) as { id: string };
      const res = await stack.ownerA.client
        .from(table)
        .update({ notes: 'masivo' })
        .in('id', [archived, active.id])
        .select('id');
      expect(res.error?.code).toBe('23000');
      expect((await state(table, active.id)).notes).toBe('n0');
    });

    it('N: otra organizacion no ve el archivado: 0 filas y sin cambios', async () => {
      const id = await archivedRow(table, col);
      const before = await state(table, id);
      const res = await stack.ownerB.client
        .from(table)
        .update({ notes: 'ajeno' })
        .eq('id', id)
        .select('id');
      expect(res.error).toBeNull();
      expect(res.data).toEqual([]);
      expect(await state(table, id)).toEqual(before);
    });

    it('P: restaurar solo con archived_at = null funciona y despues se puede editar', async () => {
      const id = await archivedRow(table, col);
      const restore = await stack.memberA.client
        .from(table)
        .update({ archived_at: null })
        .eq('id', id)
        .select('archived_at');
      expect(restore.error).toBeNull();
      expect(restore.data).toEqual([{ archived_at: null }]);
      const edit = await stack.memberA.client
        .from(table)
        .update({ notes: 'tras restaurar' })
        .eq('id', id)
        .select('notes');
      expect(edit.error).toBeNull();
      expect(edit.data).toEqual([{ notes: 'tras restaurar' }]);
      expect(await actions(id)).toEqual(['archived', 'restored']);
      const events = must(
        await stack.admin.from('activity_events').select('entity_type').eq('entity_id', id),
        'tipo',
      ) as { entity_type: string }[];
      expect(events.every((e) => e.entity_type === type)).toBe(true);
    });
  },
);

describe('A02-05 por PostgREST: seq de activity_events', () => {
  it('los miembros leen seq, crece con el orden de los eventos y es unico', async () => {
    const id = await archivedRow('customers', 'name');
    must(
      await stack.ownerA.client
        .from('customers')
        .update({ archived_at: null })
        .eq('id', id)
        .select('id'),
      'restaurar',
    );
    must(
      await stack.memberA.client
        .from('customers')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
        .select('id'),
      'archivar de nuevo',
    );
    const res = await stack.memberA.client
      .from('activity_events')
      .select('action, seq')
      .eq('entity_id', id)
      .order('seq', { ascending: true });
    expect(res.error).toBeNull();
    expect(res.data!.map((e) => e.action)).toEqual(['archived', 'restored', 'archived']);
    const seqs = res.data!.map((e) => BigInt(String(e.seq)));
    expect(seqs.every((v, i) => i === 0 || v > seqs[i - 1])).toBe(true);
    // El historial de otra organizacion no es visible.
    const other = await stack.ownerB.client
      .from('activity_events')
      .select('seq')
      .eq('entity_id', id);
    expect(other.data).toEqual([]);
  });

  it('no se puede escribir seq ni insertar eventos por la API (42501)', async () => {
    const id = await archivedRow('technicians', 'full_name');
    const forged = await stack.ownerA.client.from('activity_events').insert({
      organization_id: stack.orgA.id,
      actor_id: stack.ownerA.id,
      entity_type: 'technician',
      entity_id: id,
      action: 'archived',
      seq: 1,
    });
    expect(forged.error?.code).toBe('42501');
    const upd = await stack.ownerA.client
      .from('activity_events')
      .update({ seq: 1 })
      .eq('entity_id', id);
    expect(upd.error?.code).toBe('42501');
    expect((await stack.anon.from('activity_events').select('seq')).error?.code).toBe('42501');
  });
});
