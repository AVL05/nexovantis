// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { requireLocalSupabaseEnv } from '../../support/local-supabase';

// TASK-011 / F4: ordenes con Auth, JWT y PostgREST REALES (stack local de Supabase en el job
// `supabase` de CI: `pnpm test:supabase`). Incluye la prueba de CONCURRENCIA real (conexiones
// distintas): asignar vs archivar tecnico/cliente, doble envio y reintentos. Si faltan las
// variables SUPABASE_*, FALLA (nunca se salta). La clave de servicio solo prepara datos.
// NO se ha ejecutado en local (requiere Docker/Supabase CLI): ver el informe de TASK-011.

type Row = Record<string, unknown>;
type Actor = { id: string; client: SupabaseClient };

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error || result.data === null) {
    throw new Error(`Preparacion fallida (${what}): ${result.error?.message ?? 'sin datos'}`);
  }
  return result.data;
}

let url: string;
let anonKey: string;
let admin: SupabaseClient;
let anon: SupabaseClient;
let orgA: string;
let orgB: string;
let ownerA: Actor;
let memberA: Actor;
let ownerB: Actor;
let customerA: string;
let customerB: string;
let technicianA: string;
let technicianB: string;

async function createActor(label: string, run: string, org: string, role: 'owner' | 'member') {
  const email = `${label}-${run}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const user = created.data.user;
  if (created.error || !user) throw new Error(`Preparacion fallida (usuario ${label})`);
  must(
    await admin
      .from('memberships')
      .insert({ organization_id: org, user_id: user.id, role })
      .select('user_id'),
    `membresia ${label}`,
  );
  // Un cliente por intento de sesion: cada Actor usa su propia conexion HTTP/JWT.
  const client = createClient(url, anonKey, authOptions);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`Preparacion fallida (login ${label})`);
  return { id: user.id, client } satisfies Actor;
}

const newCustomer = async (org: string, name: string) =>
  String(
    (
      must(
        await admin.from('customers').insert({ organization_id: org, name }).select('id').single(),
        'cliente',
      ) as Row
    ).id,
  );
const newTechnician = async (org: string, name: string) =>
  String(
    (
      must(
        await admin
          .from('technicians')
          .insert({ organization_id: org, full_name: name })
          .select('id')
          .single(),
        'tecnico',
      ) as Row
    ).id,
  );

const create = (
  actor: Actor,
  args: { customer: string; technician?: string | null; id?: string },
) =>
  actor.client.rpc('create_work_order', {
    p_id: args.id ?? randomUUID(),
    p_customer_id: args.customer,
    p_title: 'Revision de caldera',
    p_description: null,
    p_priority: 'normal',
    p_scheduled_date: '2026-12-01',
    p_technician_id: args.technician ?? null,
  });

const archive = (actor: Actor, table: 'customers' | 'technicians', id: string) =>
  actor.client.from(table).update({ archived_at: new Date().toISOString() }).eq('id', id);

const eventsOf = async (id: string) =>
  must(
    await admin
      .from('activity_events')
      .select('action, actor_id')
      .eq('entity_type', 'work_order')
      .eq('entity_id', id)
      .order('seq'),
    'eventos',
  ) as Row[];

beforeAll(async () => {
  const env = requireLocalSupabaseEnv();
  url = env.url;
  anonKey = env.anonKey;
  admin = createClient(url, env.serviceKey, authOptions);
  anon = createClient(url, anonKey, authOptions);
  const run = randomUUID().slice(0, 8);

  const orgs = must(
    await admin
      .from('organizations')
      .insert([{ name: `Ordenes Alfa ${run}` }, { name: `Ordenes Beta ${run}` }])
      .select('id, name')
      .order('name'),
    'organizaciones',
  ) as { id: string }[];
  [orgA, orgB] = [orgs[0].id, orgs[1].id];
  ownerA = await createActor('wo-owner-a', run, orgA, 'owner');
  memberA = await createActor('wo-member-a', run, orgA, 'member');
  ownerB = await createActor('wo-owner-b', run, orgB, 'owner');
  customerA = await newCustomer(orgA, 'Cliente Ficticio Alfa');
  customerB = await newCustomer(orgB, 'Cliente Ficticio Beta');
  technicianA = await newTechnician(orgA, 'Tecnico Ficticio Alfa');
  technicianB = await newTechnician(orgB, 'Tecnico Ficticio Beta');
}, 120_000);

describe('ordenes con PostgREST y JWT reales', () => {
  it('flujo completo con eventos y actor, visible solo para la organizacion', async () => {
    const created = await create(memberA, { customer: customerA });
    expect(created.error).toBeNull();
    const id = String(created.data);
    expect(
      (await memberA.client.rpc('assign_work_order', { p_id: id, p_technician_id: technicianA }))
        .error,
    ).toBeNull();
    expect(
      (await ownerA.client.rpc('advance_work_order', { p_id: id, p_to: 'in_progress' })).error,
    ).toBeNull();
    expect(
      (await memberA.client.rpc('advance_work_order', { p_id: id, p_to: 'completed' })).error,
    ).toBeNull();

    const own = await ownerA.client.from('work_orders').select('id, status').eq('id', id);
    expect(own.data).toEqual([{ id, status: 'completed' }]);
    expect((await ownerB.client.from('work_orders').select('id').eq('id', id)).data).toEqual([]);

    const events = await eventsOf(id);
    expect(events.map((e) => e.action)).toEqual([
      'created',
      'assigned',
      'status_changed',
      'status_changed',
    ]);
    expect(events.every((e) => typeof e.actor_id === 'string')).toBe(true);
    // Historial y detalle visibles para la propia organizacion y no para otra.
    const details = await ownerA.client.from('work_order_event_details').select('event_id');
    expect((details.data ?? []).length).toBeGreaterThanOrEqual(4);
    expect(
      (await ownerB.client.from('work_order_event_details').select('event_id').limit(1000)).data,
    ).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ event_id: expect.anything() })]),
    );
  });

  it('referencias de otra organizacion, saltos y terminales se rechazan desde la API de datos', async () => {
    expect((await create(memberA, { customer: customerB })).error?.code).toBe('NX002');
    expect(
      (await create(memberA, { customer: customerA, technician: technicianB })).error?.code,
    ).toBe('NX002');
    const id = String((await create(memberA, { customer: customerA })).data);
    expect(
      (await memberA.client.rpc('advance_work_order', { p_id: id, p_to: 'completed' })).error?.code,
    ).toBe('NX001');
    expect(
      (await ownerB.client.rpc('cancel_work_order', { p_id: id, p_reason: null })).error?.code,
    ).toBe('NX005');
    expect(
      (await memberA.client.rpc('cancel_work_order', { p_id: id, p_reason: 'x' })).error,
    ).toBeNull();
    expect(
      (
        await memberA.client.rpc('update_work_order', {
          p_id: id,
          p_title: 'Nuevo',
          p_description: null,
          p_priority: 'normal',
          p_scheduled_date: '2026-12-02',
        })
      ).error?.code,
    ).toBe('NX003');
  });

  it('sin escritura directa en work_orders ni en los eventos; anon sin acceso', async () => {
    const id = String((await create(memberA, { customer: customerA })).data);
    const insert = await memberA.client.from('work_orders').insert({
      organization_id: orgA,
      customer_id: customerA,
      title: 'Directa',
      scheduled_date: '2026-12-01',
    });
    expect(insert.error?.code).toBe('42501');
    expect(
      (await memberA.client.from('work_orders').update({ status: 'completed' }).eq('id', id)).error
        ?.code,
    ).toBe('42501');
    expect(
      (await memberA.client.from('work_orders').update({ technician_id: technicianA }).eq('id', id))
        .error?.code,
    ).toBe('42501');
    expect((await memberA.client.from('work_orders').delete().eq('id', id)).error?.code).toBe(
      '42501',
    );
    expect(
      (
        await memberA.client.from('activity_events').insert({
          organization_id: orgA,
          actor_id: memberA.id,
          entity_type: 'work_order',
          entity_id: id,
          action: 'created',
        })
      ).error?.code,
    ).toBe('42501');
    expect(
      (await anon.rpc('assign_work_order', { p_id: id, p_technician_id: technicianA })).error,
    ).not.toBeNull();
    expect((await anon.from('work_orders').select('id')).error).not.toBeNull();
    // Las funciones SECURITY DEFINER no estan expuestas (esquema private).
    expect(
      (await memberA.client.schema('private' as never).rpc('require_org' as never)).error,
    ).not.toBeNull();
  });

  it('DH-04 y DH-05 desde la API de datos', async () => {
    const tech = await newTechnician(orgA, 'Tecnico con orden');
    const customer = await newCustomer(orgA, 'Cliente con orden');
    const id = String((await create(memberA, { customer, technician: tech })).data);
    expect((await archive(memberA, 'technicians', tech)).error?.code).toBe('NX004');
    expect((await archive(memberA, 'customers', customer)).error?.code).toBe('NX004');
    expect(
      (await memberA.client.rpc('cancel_work_order', { p_id: id, p_reason: null })).error,
    ).toBeNull();
    expect((await archive(memberA, 'technicians', tech)).error).toBeNull();
    expect((await archive(memberA, 'customers', customer)).error).toBeNull();
  });
});

describe('concurrencia real (conexiones distintas)', () => {
  const ROUNDS = 12;
  const deadlock = (code?: string) => code === '40P01';

  it('asignar vs archivar tecnico: nunca queda una orden abierta con tecnico archivado, sin deadlock', async () => {
    let assigned = 0;
    let archived = 0;
    for (let round = 0; round < ROUNDS; round++) {
      const tech = await newTechnician(orgA, `Tecnico carrera ${round}`);
      const id = String((await create(memberA, { customer: customerA })).data);
      // Orden de lanzamiento alterno para cubrir ambos entrelazados.
      const [assign, arch] =
        round % 2 === 0
          ? await Promise.all([
              memberA.client.rpc('assign_work_order', { p_id: id, p_technician_id: tech }),
              archive(ownerA, 'technicians', tech),
            ])
          : (
              await Promise.all([
                archive(ownerA, 'technicians', tech),
                memberA.client.rpc('assign_work_order', { p_id: id, p_technician_id: tech }),
              ])
            ).reverse();

      expect(deadlock(assign.error?.code) || deadlock(arch.error?.code)).toBe(false);
      // Exactamente uno de los dos gana, con el error de dominio esperado en el otro.
      expect([assign.error?.code ?? null, arch.error?.code ?? null]).toSatisfy(
        (codes: (string | null)[]) =>
          (codes[0] === null && codes[1] === 'NX004') ||
          (codes[0] === 'NX002' && codes[1] === null),
      );
      const order = (
        await admin.from('work_orders').select('status, technician_id').eq('id', id).single()
      ).data as Row;
      const tr = (await admin.from('technicians').select('archived_at').eq('id', tech).single())
        .data as Row;
      if (assign.error === null) {
        assigned++;
        expect(order).toMatchObject({ status: 'assigned', technician_id: tech });
        expect(tr.archived_at).toBeNull();
      } else {
        archived++;
        expect(order).toMatchObject({ status: 'pending', technician_id: null });
        expect(tr.archived_at).not.toBeNull();
      }
    }
    expect(assigned + archived).toBe(ROUNDS);
  }, 120_000);

  it('crear orden vs archivar cliente: nunca queda una orden abierta de un cliente archivado', async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const customer = await newCustomer(orgA, `Cliente carrera ${round}`);
      const [created, arch] = await Promise.all([
        create(memberA, { customer }),
        archive(ownerA, 'customers', customer),
      ]);
      expect(deadlock(created.error?.code) || deadlock(arch.error?.code)).toBe(false);
      expect([created.error?.code ?? null, arch.error?.code ?? null]).toSatisfy(
        (codes: (string | null)[]) =>
          (codes[0] === null && codes[1] === 'NX004') ||
          (codes[0] === 'NX002' && codes[1] === null),
      );
      const open = await admin
        .from('work_orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', customer)
        .in('status', ['pending', 'assigned', 'in_progress']);
      const cust = (await admin.from('customers').select('archived_at').eq('id', customer).single())
        .data as Row;
      expect(cust.archived_at !== null && (open.count ?? 0) > 0).toBe(false);
    }
  }, 120_000);

  it('reasignar vs archivar el tecnico de destino y archivar el de origen: sin deadlock ni estados invalidos', async () => {
    for (let round = 0; round < ROUNDS / 2; round++) {
      const from = await newTechnician(orgA, `Origen ${round}`);
      const to = await newTechnician(orgA, `Destino ${round}`);
      const id = String((await create(memberA, { customer: customerA, technician: from })).data);
      const results = await Promise.all([
        memberA.client.rpc('assign_work_order', { p_id: id, p_technician_id: to }),
        archive(ownerA, 'technicians', to),
        archive(ownerA, 'technicians', from),
      ]);
      expect(results.some((r) => deadlock(r.error?.code))).toBe(false);
      const order = (
        await admin.from('work_orders').select('status, technician_id').eq('id', id).single()
      ).data as Row;
      const techs = must(
        await admin.from('technicians').select('id, archived_at').in('id', [from, to]),
        'tecnicos',
      ) as Row[];
      const archivedIds = new Set(
        techs.filter((t) => t.archived_at !== null).map((t) => String(t.id)),
      );
      // Invariante: el tecnico de una orden abierta asignada no esta archivado.
      expect(archivedIds.has(String(order.technician_id))).toBe(false);
    }
  }, 120_000);

  it('doble envio concurrente del alta: una sola orden y un solo conjunto de eventos', async () => {
    const id = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        create(memberA, { id, customer: customerA, technician: technicianA }),
      ),
    );
    // Una puede perder la carrera por la clave unica (23505): el servicio reintenta con el mismo id.
    for (const r of results) expect([null, '23505']).toContain(r.error?.code ?? null);
    const retry = await create(memberA, { id, customer: customerA, technician: technicianA });
    expect(retry.error).toBeNull();
    const orders = await admin
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('id', id);
    expect(orders.count).toBe(1);
    expect((await eventsOf(id)).map((e) => e.action)).toEqual(['created', 'assigned']);
  });

  it('transiciones repetidas en paralelo: un solo cambio y un solo evento por transicion', async () => {
    const id = String(
      (await create(memberA, { customer: customerA, technician: technicianA })).data,
    );
    const starts = await Promise.all(
      Array.from({ length: 6 }, () =>
        memberA.client.rpc('advance_work_order', { p_id: id, p_to: 'in_progress' }),
      ),
    );
    expect(starts.every((r) => r.error === null)).toBe(true);
    expect(starts.filter((r) => r.data === true)).toHaveLength(1);
    const cancels = await Promise.all(
      Array.from({ length: 6 }, () =>
        ownerA.client.rpc('cancel_work_order', { p_id: id, p_reason: 'Duplicada' }),
      ),
    );
    expect(cancels.every((r) => r.error === null)).toBe(true);
    expect(cancels.filter((r) => r.data === 'cancelled')).toHaveLength(1);
    expect(cancels.filter((r) => r.data === 'already_cancelled')).toHaveLength(5);
    expect((await eventsOf(id)).map((e) => e.action)).toEqual([
      'created',
      'assigned',
      'status_changed',
      'cancelled',
    ]);
  });
});
