// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { requireLocalSupabaseEnv } from '../../../support/local-supabase';

// TASK-013-FIX POST independiente (AUDIT-004 / G4-01, G4-02, G4-03) contra el stack LOCAL de Supabase
// en CI (`pnpm test:supabase`): PostgREST, JWT y CONEXIONES DISTINTAS reales (PGlite solo tiene una).
// Propietario: Testing. NO se ha ejecutado en local (requiere Docker/Supabase CLI): queda pendiente de
// CI. Si faltan las variables SUPABASE_*, FALLA (no se salta). La clave de servicio solo prepara datos,
// lee y comprueba el rechazo de escrituras administrativas; nunca sustituye a un usuario.

type Actor = { id: string; client: SupabaseClient };
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error || r.data === null) {
    throw new Error(`Preparacion fallida (${what}): ${r.error?.message ?? 'sin datos'}`);
  }
  return r.data;
}

let admin: SupabaseClient;
let ownerA: Actor;
let memberA: Actor;
let orgA: string;
let customerA: string;

async function createActor(url: string, anonKey: string, label: string, run: string) {
  const email = `${label}-${run}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`Preparacion fallida (${label})`);
  const client = createClient(url, anonKey, authOptions);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw new Error(`Preparacion fallida (login ${label})`);
  return { id: created.data.user.id, client } satisfies Actor;
}

beforeAll(async () => {
  const { url, anonKey, serviceKey } = requireLocalSupabaseEnv();
  admin = createClient(url, serviceKey, authOptions);
  const run = randomUUID().slice(0, 8);
  ownerA = await createActor(url, anonKey, 't13fix-owner', run);
  memberA = await createActor(url, anonKey, 't13fix-member', run);
  orgA = (
    must(
      await admin
        .from('organizations')
        .insert({ name: `T13FIX ${run}` })
        .select('id'),
      'organizacion',
    ) as { id: string }[]
  )[0].id;
  must(
    await admin
      .from('memberships')
      .insert([
        { organization_id: orgA, user_id: ownerA.id, role: 'owner' },
        { organization_id: orgA, user_id: memberA.id, role: 'member' },
      ])
      .select('user_id'),
    'membresias',
  );
  customerA = (
    must(
      await admin
        .from('customers')
        .insert({ organization_id: orgA, name: 'Cliente Ficticio T13FIX' })
        .select('id'),
      'cliente',
    ) as { id: string }[]
  )[0].id;
}, 120_000);

async function newItem(label: string): Promise<string> {
  const id = randomUUID();
  const r = await ownerA.client.rpc('create_inventory_item', {
    p_id: id,
    p_reference: `T13-${label}-${id.slice(0, 6)}`,
    p_name: `Articulo ${label}`,
    p_description: null,
    p_unit: 'ud',
    p_low_stock_threshold: 0,
  });
  if (r.error) throw new Error(`Preparacion fallida (articulo): ${r.error.message}`);
  return id;
}

const movement = (
  client: SupabaseClient,
  item: string,
  kind: 'in' | 'out' | 'consumption',
  quantity: number,
  request: string = randomUUID(),
  order: string | null = null,
) =>
  client.rpc('record_stock_movement', {
    p_request_id: request,
    p_item_id: item,
    p_kind: kind,
    p_quantity: quantity,
    p_order_id: order,
    p_note: null,
  });

async function load(item: string, quantity: number): Promise<void> {
  const r = await movement(ownerA.client, item, 'in', quantity);
  if (r.error) throw new Error(`Preparacion fallida (carga): ${r.error.message}`);
}

async function ledger(item: string) {
  const rows = must(
    await admin
      .from('stock_movements')
      .select('seq, kind, quantity, balance_before, balance_after')
      .eq('item_id', item)
      .order('seq'),
    'libro',
  ) as {
    seq: number;
    kind: string;
    quantity: number;
    balance_before: number;
    balance_after: number;
  }[];
  const stored = must(
    await admin.from('inventory_items').select('quantity').eq('id', item).single(),
    'articulo',
  ) as { quantity: number };
  return { rows, quantity: stored.quantity };
}

/** Invariante del libro: cadena por seq, saldo nunca negativo y saldo del articulo = ultimo balance_after. */
function expectCoherent(l: Awaited<ReturnType<typeof ledger>>) {
  let previous = 0;
  for (const m of l.rows) {
    expect(m.balance_before).toBe(previous);
    expect(m.balance_after).toBe(m.kind === 'in' ? previous + m.quantity : previous - m.quantity);
    expect(m.balance_after).toBeGreaterThanOrEqual(0);
    previous = m.balance_after;
  }
  expect(l.quantity).toBe(previous);
}

const stockEvents = async (item: string) =>
  (
    must(
      await admin
        .from('activity_events')
        .select('id')
        .eq('entity_id', item)
        .in('action', ['stock_in', 'stock_out', 'stock_consumed']),
      'eventos',
    ) as unknown[]
  ).length;

describe('G4-01 con conexiones reales: un reintento idempotente en paralelo aplica el saldo una sola vez', () => {
  it('8 envios simultaneos con la misma clave y payload: un movimiento, un evento, saldo +10', async () => {
    const item = await newItem('replay');
    const request = randomUUID();
    const clients = [ownerA.client, memberA.client];
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => movement(clients[i % 2], item, 'in', 10, request)),
    );
    for (const r of results) expect(r.error).toBeNull();
    const payloads = results.map(
      (r) => r.data as { id: string; balance: number; replayed: boolean },
    );
    expect(new Set(payloads.map((p) => p.id)).size).toBe(1);
    expect(payloads.filter((p) => !p.replayed)).toHaveLength(1);
    expect(payloads.every((p) => p.balance === 10)).toBe(true);
    const l = await ledger(item);
    expect(l.rows).toHaveLength(1);
    expect(l.quantity).toBe(10);
    expect(await stockEvents(item)).toBe(1);
    expectCoherent(l);
  });

  it('misma clave con payloads distintos en paralelo: gana uno, el resto NX024, saldo = el ganador', async () => {
    const item = await newItem('clash');
    const request = randomUUID();
    const results = await Promise.all(
      [3, 4, 5, 6].map((q) => movement(ownerA.client, item, 'in', q, request)),
    );
    const ok = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    expect(ok).toHaveLength(1);
    for (const f of failed) expect(f.error?.message).toMatch(/otro contenido|NX024/);
    const l = await ledger(item);
    expect(l.rows).toHaveLength(1);
    expect(l.quantity).toBe(l.rows[0].quantity);
    expect(await stockEvents(item)).toBe(1);
    expectCoherent(l);
  });

  it('salidas simultaneas que exceden el saldo: solo caben 10, el resto falla, nunca negativo y la cadena cuadra', async () => {
    const item = await newItem('overdraw');
    await load(item, 10);
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        movement(i % 2 ? memberA.client : ownerA.client, item, 'out', 1),
      ),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(10);
    expect(results.filter((r) => r.error)).toHaveLength(6);
    const l = await ledger(item);
    expect(l.quantity).toBe(0);
    expect(l.rows).toHaveLength(11);
    expectCoherent(l);
    expect(await stockEvents(item)).toBe(11);
  });

  it('entradas y salidas mezcladas en paralelo: seq coherente con el orden de aplicacion', async () => {
    const item = await newItem('mixed');
    await load(item, 50);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        movement(
          i % 2 ? memberA.client : ownerA.client,
          item,
          i % 3 === 0 ? 'in' : 'out',
          (i % 4) + 1,
        ),
      ),
    );
    expectCoherent(await ledger(item));
  });
});

describe('consumos frente a cancelaciones concurrentes (sin interbloqueo, sin saldo huerfano)', () => {
  it('consumo y cancelacion de la misma orden en paralelo: o se consume antes o NX023; saldo y libro coherentes', async () => {
    for (let round = 0; round < 6; round += 1) {
      const item = await newItem(`cancel${round}`);
      await load(item, 5);
      const created = await ownerA.client.rpc('create_work_order', {
        p_id: randomUUID(),
        p_customer_id: customerA,
        p_title: `Orden carrera ${round}`,
        p_description: null,
        p_priority: 'normal',
        p_scheduled_date: '2026-12-01',
        p_technician_id: null,
      });
      expect(created.error).toBeNull();
      const order = String(created.data);
      const [consumed, cancelled] = await Promise.all([
        movement(memberA.client, item, 'consumption', 2, randomUUID(), order),
        ownerA.client.rpc('cancel_work_order', { p_id: order, p_reason: null }),
      ]);
      // La cancelacion nunca falla por el consumo; el consumo solo puede fallar con NX023.
      expect(cancelled.error).toBeNull();
      if (consumed.error) expect(consumed.error.message).toMatch(/orden|NX023/i);
      const l = await ledger(item);
      expect(l.quantity).toBe(consumed.error ? 5 : 3);
      expectCoherent(l);
    }
  });
});

describe('G4-03 con PostgREST y JWT reales', () => {
  async function quote(items: number) {
    const id = randomUUID();
    const c = await ownerA.client.rpc('create_quote', {
      p_id: id,
      p_customer_id: customerA,
      p_title: 'Presupuesto T13FIX',
      p_description: null,
    });
    expect(c.error).toBeNull();
    for (let i = 0; i < items; i += 1) {
      const a = await ownerA.client.rpc('add_quote_item', {
        p_quote_id: id,
        p_item_id: randomUUID(),
        p_description: `Concepto ${i + 1}`,
        p_quantity: 1,
        p_unit_price_cents: 10000,
        p_tax_rate_bp: 2100,
      });
      expect(a.error).toBeNull();
    }
    return id;
  }
  const status = async (id: string) =>
    must(
      await admin.from('quotes').select('status, order_id').eq('id', id).single(),
      'presupuesto',
    ) as { status: string; order_id: string | null };

  it('accept_quote (trigger de aceptacion) funciona en PostgreSQL real, es idempotente y una sola orden aunque se acepte en paralelo', async () => {
    const id = await quote(2);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        (i % 2 ? memberA : ownerA).client.rpc('accept_quote', { p_id: id }),
      ),
    );
    for (const r of results) expect(r.error).toBeNull();
    const orders = new Set(results.map((r) => String(r.data)));
    expect(orders.size).toBe(1);
    const q = await status(id);
    expect(q).toMatchObject({ status: 'accepted', order_id: [...orders][0] });
    const linked = must(
      await admin.from('work_orders').select('id').eq('id', q.order_id!),
      'orden',
    ) as unknown[];
    expect(linked).toHaveLength(1);
  });

  it('un usuario no puede aceptar por PostgREST (sin privilegio de UPDATE) ni por SQL de servicio sin actor', async () => {
    const empty = await quote(0);
    const withItem = await quote(1);
    const existing = String(
      (
        await ownerA.client.rpc('create_work_order', {
          p_id: randomUUID(),
          p_customer_id: customerA,
          p_title: 'Orden preexistente',
          p_description: null,
          p_priority: 'normal',
          p_scheduled_date: '2026-12-01',
          p_technician_id: null,
        })
      ).data,
    );
    const attempts = [
      ownerA.client
        .from('quotes')
        .update({ status: 'accepted', order_id: existing })
        .eq('id', withItem),
      admin.from('quotes').update({ status: 'accepted', order_id: existing }).eq('id', withItem),
      admin.from('quotes').update({ status: 'accepted', order_id: existing }).eq('id', empty),
    ];
    for (const result of await Promise.all(attempts)) {
      const r = result as { error: unknown; data: unknown };
      // Error de privilegio/guarda o 0 filas afectadas (RLS/grants): nunca una aceptacion.
      expect(r.error !== null || (Array.isArray(r.data) ? r.data.length === 0 : true)).toBe(true);
    }
    expect(await status(withItem)).toMatchObject({ status: 'draft', order_id: null });
    expect(await status(empty)).toMatchObject({ status: 'draft', order_id: null });
  });
});

describe('G4-02 con PostgREST: el id de una orden no se reescribe', () => {
  it('UPDATE del id con la clave de servicio se rechaza (23000) y la orden sigue enlazada', async () => {
    const id = randomUUID();
    const created = await ownerA.client.rpc('create_work_order', {
      p_id: id,
      p_customer_id: customerA,
      p_title: 'Orden id inmutable',
      p_description: null,
      p_priority: 'normal',
      p_scheduled_date: '2026-12-01',
      p_technician_id: null,
    });
    expect(created.error).toBeNull();
    const update = await admin.from('work_orders').update({ id: randomUUID() }).eq('id', id);
    expect(update.error?.code).toBe('23000');
    const still = must(
      await admin.from('work_orders').select('id').eq('id', id),
      'orden',
    ) as unknown[];
    expect(still).toHaveLength(1);
  });
});
