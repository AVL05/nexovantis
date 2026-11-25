// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedTwoOrgs } from '../support/fixtures';
import { createTestDb, type TestDb } from '../support/pglite';
import { orderApi } from '../support/work-orders';

// TASK-011 / F4: ordenes de servicio en PostgreSQL real (PGlite) con las migraciones reales, bajo
// RLS y con las funciones RPC reales. No es PostgREST ni Supabase Auth. La concurrencia real entre
// conexiones no es posible en PGlite (una sola conexion): se prueba en
// tests/integration/supabase/work-orders.supabase.test.ts (job `supabase` de CI). Aqui se prueba
// cada entrelazado secuencial de asignar y archivar, que es lo que decide el resultado.

let db: TestDb;
let s: Awaited<ReturnType<typeof seedTwoOrgs>>;
let api: ReturnType<typeof orderApi>;

const failsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code });

const archive = (user: string, table: 'customers' | 'technicians', id: string) =>
  api.run(user, `update public.${table} set archived_at = now() where id = $1`, [id]);

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
  api = orderApi(db);
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe('alta (BR01, BR02, DH-08, DH-13)', () => {
  it('sin tecnico nace pendiente con un unico evento created y actor identificado', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA });
    const order = await api.order(id);
    expect(order).toMatchObject({
      status: 'pending',
      technician_id: null,
      organization_id: s.orgA,
      priority: 'normal',
    });
    const events = await api.events(id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'created',
      to_status: 'pending',
      actor_id: s.memberA,
    });
  });

  it('con tecnico (DH-13) nace asignada con eventos created y assigned', async () => {
    const id = await api.create(s.ownerA, { customer: s.customerA, technician: s.technicianA });
    expect(await api.order(id)).toMatchObject({ status: 'assigned', technician_id: s.technicianA });
    const events = await api.events(id);
    expect(events.map((e) => e.action)).toEqual(['created', 'assigned']);
    expect(events[1]).toMatchObject({
      from_status: 'pending',
      to_status: 'assigned',
      technician_id: s.technicianA,
      actor_id: s.ownerA,
    });
  });

  it('un reintento o doble envio con el mismo id no duplica orden ni eventos', async () => {
    const id = randomUUID();
    await api.create(s.memberA, { id, customer: s.customerA, technician: s.technicianA });
    await api.create(s.memberA, { id, customer: s.customerA, technician: s.technicianA });
    await api.create(s.ownerA, { id, customer: s.customerA });
    const rows = await api.su(`select count(*)::int as n from public.work_orders where id = $1`, [
      id,
    ]);
    expect(rows[0].n).toBe(1);
    expect(await api.events(id)).toHaveLength(2);
  });

  it('un id ya usado por otra organizacion se rechaza sin revelar la orden', async () => {
    const id = await api.create(s.memberB, { customer: s.customerB });
    await failsWith(api.create(s.memberA, { id, customer: s.customerA }), '23505');
  });

  it('rechaza cliente o tecnico de otra organizacion (NX002)', async () => {
    await failsWith(api.create(s.memberA, { customer: s.customerB }), 'NX002');
    await failsWith(
      api.create(s.memberA, { customer: s.customerA, technician: s.technicianB }),
      'NX002',
    );
    await failsWith(api.create(s.memberA, { customer: randomUUID() }), 'NX002');
  });

  it('rechaza cliente o tecnico archivado (BR02)', async () => {
    const customer = await api.newCustomer(s.orgA);
    const technician = await api.newTechnician(s.orgA);
    await archive(s.memberA, 'customers', customer);
    await archive(s.memberA, 'technicians', technician);
    await failsWith(api.create(s.memberA, { customer }), 'NX002');
    await failsWith(api.create(s.memberA, { customer: s.customerA, technician }), 'NX002');
  });

  it('validaciones de la tabla: titulo en blanco, prioridad, longitudes', async () => {
    await failsWith(api.create(s.memberA, { customer: s.customerA, title: ' \t  ' }), '23514');
    await failsWith(
      api.create(s.memberA, { customer: s.customerA, title: 'x'.repeat(121) }),
      '23514',
    );
    await failsWith(api.create(s.memberA, { customer: s.customerA, priority: 'maxima' }), '23514');
    await failsWith(
      api.create(s.memberA, { customer: s.customerA, description: 'x'.repeat(2001) }),
      '23514',
    );
  });

  it('sin sesion o sin membresia no se puede crear (42501)', async () => {
    await expect(
      db.asAnon((tx) =>
        tx.query(
          `select public.create_work_order(null, $1, 't', null, 'normal', '2026-12-01', null)`,
          [s.customerA],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
    const loner = randomUUID();
    await api.su(`insert into auth.users (id, email) values ($1, 'sin.org@example.test')`, [loner]);
    await failsWith(api.create(loner, { customer: s.customerA }), '42501');
  });
});

describe('transiciones (BR03, DH-01, DH-02, DH-03)', () => {
  it('flujo completo pendiente -> asignada -> en curso -> completada con un evento por cambio', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA });
    expect(await api.assign(s.memberA, id, s.technicianA)).toBe(true);
    expect(await api.advance(s.ownerA, id, 'in_progress')).toBe(true);
    expect(await api.advance(s.memberA, id, 'completed')).toBe(true);
    expect(await api.order(id)).toMatchObject({
      status: 'completed',
      technician_id: s.technicianA,
    });
    const events = await api.events(id);
    expect(events.map((e) => [e.action, e.from_status, e.to_status])).toEqual([
      ['created', null, 'pending'],
      ['assigned', 'pending', 'assigned'],
      ['status_changed', 'assigned', 'in_progress'],
      ['status_changed', 'in_progress', 'completed'],
    ]);
    expect(events.every((e) => typeof e.actor_id === 'string')).toBe(true);
  });

  it('reintentos y doble envio son no-op y no duplican eventos', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA });
    expect(await api.assign(s.memberA, id, s.technicianA)).toBe(true);
    expect(await api.assign(s.memberA, id, s.technicianA)).toBe(false);
    expect(await api.advance(s.memberA, id, 'in_progress')).toBe(true);
    expect(await api.advance(s.memberA, id, 'in_progress')).toBe(false);
    expect(await api.advance(s.memberA, id, 'completed')).toBe(true);
    expect(await api.advance(s.memberA, id, 'completed')).toBe(false);
    expect(await api.events(id)).toHaveLength(4);
  });

  it('sin saltos (DH-03): no se llega a en curso ni a completada sin pasar por cada estado', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA });
    await failsWith(api.advance(s.memberA, id, 'in_progress'), 'NX001');
    await failsWith(api.advance(s.memberA, id, 'completed'), 'NX001');
    await failsWith(api.advance(s.memberA, id, 'assigned'), 'NX001');
    await api.assign(s.memberA, id, s.technicianA);
    await failsWith(api.advance(s.memberA, id, 'completed'), 'NX001');
    expect(await api.order(id)).toMatchObject({ status: 'assigned' });
    expect(await api.events(id)).toHaveLength(2);
  });

  it('sin retrocesos ni escrituras directas de estado o tecnico (DH-01)', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA, technician: s.technicianA });
    await api.advance(s.memberA, id, 'in_progress');
    // Por SQL de administracion (los triggers aplican siempre) y con actor.
    const asAdmin = (sql: string) =>
      db.asSuperuser(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: s.ownerA }),
        ]);
        return tx.query(sql, [id]);
      });
    await failsWith(
      asAdmin(`update public.work_orders set status = 'assigned' where id = $1`),
      'NX001',
    );
    await failsWith(
      asAdmin(`update public.work_orders set status = 'pending' where id = $1`),
      'NX001',
    );
    await failsWith(
      asAdmin(
        `update public.work_orders set technician_id = null, status = 'pending' where id = $1`,
      ),
      'NX001',
    );
    // En curso no admite reasignacion.
    const other = await api.newTechnician(s.orgA);
    await failsWith(api.assign(s.memberA, id, other), 'NX001');
    expect(await api.order(id)).toMatchObject({
      status: 'in_progress',
      technician_id: s.technicianA,
    });
  });

  it('reasignacion solo en asignada, con evento reassigned (DH-01)', async () => {
    const other = await api.newTechnician(s.orgA);
    const id = await api.create(s.memberA, { customer: s.customerA, technician: s.technicianA });
    expect(await api.assign(s.memberA, id, other)).toBe(true);
    expect(await api.order(id)).toMatchObject({ status: 'assigned', technician_id: other });
    const last = (await api.events(id)).at(-1)!;
    expect(last).toMatchObject({ action: 'reassigned', technician_id: other, actor_id: s.memberA });
    await failsWith(api.assign(s.memberA, id, null), 'NX002');
    await failsWith(api.assign(s.memberA, id, s.technicianB), 'NX002');
  });

  it('cancelar desde pendiente, asignada y en curso con motivo opcional en el evento (DH-02)', async () => {
    const pending = await api.create(s.memberA, { customer: s.customerA });
    const assigned = await api.create(s.memberA, {
      customer: s.customerA,
      technician: s.technicianA,
    });
    const running = await api.create(s.memberA, {
      customer: s.customerA,
      technician: s.technicianA,
    });
    await api.advance(s.memberA, running, 'in_progress');

    expect(await api.cancel(s.memberA, pending)).toBe(true);
    expect(await api.cancel(s.memberA, assigned, '  Cliente ausente  ')).toBe(true);
    expect(await api.cancel(s.memberA, running, 'Pieza no disponible')).toBe(true);
    expect(await api.cancel(s.memberA, running, 'otro motivo')).toBe(false); // reintento: no-op

    for (const id of [pending, assigned, running]) {
      expect(await api.order(id)).toMatchObject({ status: 'cancelled' });
    }
    expect((await api.events(pending)).at(-1)).toMatchObject({ action: 'cancelled', detail: null });
    expect((await api.events(assigned)).at(-1)).toMatchObject({
      action: 'cancelled',
      from_status: 'assigned',
      to_status: 'cancelled',
      detail: 'Cliente ausente',
      actor_id: s.memberA,
    });
    expect(await api.events(running)).toHaveLength(4); // creada, asignada, en curso, cancelada
    expect((await api.order(running)).cancellation_reason).toBe('Pieza no disponible');
  });

  it('no se cancela una orden completada y el motivo larguisimo se rechaza', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA, technician: s.technicianA });
    await failsWith(api.cancel(s.memberA, id, 'x'.repeat(201)), '22001');
    await api.advance(s.memberA, id, 'in_progress');
    await api.advance(s.memberA, id, 'completed');
    await failsWith(api.cancel(s.memberA, id), 'NX001');
  });

  it('un tecnico archivado no se asigna ni puede iniciar (BR02)', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA });
    const tech = await api.newTechnician(s.orgA);
    await archive(s.memberA, 'technicians', tech);
    await failsWith(api.assign(s.memberA, id, tech), 'NX002');
    expect(await api.order(id)).toMatchObject({ status: 'pending' });
  });
});

describe('orden terminal de solo lectura (DH-07) e inmutabilidad', () => {
  it('completada y cancelada no se editan ni por RPC ni por SQL de administracion', async () => {
    const done = await api.create(s.memberA, { customer: s.customerA, technician: s.technicianA });
    await api.advance(s.memberA, done, 'in_progress');
    await api.advance(s.memberA, done, 'completed');
    const cancelled = await api.create(s.memberA, { customer: s.customerA });
    await api.cancel(s.memberA, cancelled);

    for (const id of [done, cancelled]) {
      await failsWith(api.update(s.memberA, id, { title: 'Otro titulo' }), 'NX003');
      await failsWith(api.assign(s.memberA, id, s.technicianA), 'NX001');
      await failsWith(api.advance(s.memberA, id, 'in_progress'), 'NX001');
      const attempt = (sql: string) =>
        db.asSuperuser(async (tx) => {
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: s.ownerA }),
          ]);
          return tx.query(sql, [id]);
        });
      await failsWith(
        attempt(`update public.work_orders set title = 'Hack' where id = $1`),
        'NX003',
      );
      await failsWith(
        attempt(`update public.work_orders set status = 'pending' where id = $1`),
        'NX001',
      );
    }
  });

  it('edita campos descriptivos mientras no sea terminal, sin tocar estado ni eventos', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA, technician: s.technicianA });
    await api.update(s.ownerA, id, { title: 'Titulo nuevo', description: 'Detalle' });
    expect(await api.order(id)).toMatchObject({
      title: 'Titulo nuevo',
      description: 'Detalle',
      status: 'assigned',
      priority: 'normal',
      scheduled_date: new Date('2026-12-05T00:00:00.000Z'),
    });
    expect(await api.events(id)).toHaveLength(2);
    await failsWith(api.update(s.ownerA, randomUUID(), { title: 'x' }), 'NX005');
    await failsWith(api.update(s.memberA, id, { title: '   ' }), '23514');
  });

  it('organizacion y cliente de una orden son inmutables', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA });
    const attempt = (sql: string, params: unknown[]) =>
      db.asSuperuser((tx) => tx.query(sql, params));
    await expect(
      attempt(`update public.work_orders set organization_id = $2 where id = $1`, [id, s.orgB]),
    ).rejects.toMatchObject({ code: '23000' });
    const other = await api.newCustomer(s.orgA);
    await failsWith(
      attempt(`update public.work_orders set customer_id = $2 where id = $1`, [id, other]),
      'NX003',
    );
  });

  it('el historial es inmutable y sin actor no se escribe nada', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA });
    await failsWith(
      api.su(`update public.activity_events set action = 'created' where entity_id = $1`, [id]),
      '23000',
    );
    await failsWith(
      api.su(`delete from public.activity_events where entity_id = $1`, [id]),
      '23000',
    );
    await failsWith(api.su(`truncate public.activity_events`), '23000');
    await failsWith(api.su(`truncate public.work_order_event_details`), '23000');
    // Actor nulo: ni siquiera con privilegios de administracion se inserta una orden o se cambia el estado.
    await failsWith(
      api.su(
        `insert into public.work_orders (organization_id, customer_id, title, scheduled_date)
         values ($1, $2, 'Sin actor', '2026-12-01')`,
        [s.orgA, s.customerA],
      ),
      '23000',
    );
    await failsWith(
      api.su(`update public.work_orders set status = 'cancelled' where id = $1`, [id]),
      '23000',
    );
    expect(await api.order(id)).toMatchObject({ status: 'pending' });
    expect(await api.events(id)).toHaveLength(1);
  });

  it('las ordenes no se borran', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA });
    await failsWith(api.su(`delete from public.work_orders where id = $1`, [id]), '23000');
    await failsWith(api.su(`truncate public.work_orders`), '23000');
  });
});

describe('RLS, privilegios y exposicion (BR01)', () => {
  it('cada organizacion solo ve sus ordenes; anon no ve nada', async () => {
    const a = await api.create(s.memberA, { customer: s.customerA });
    const b = await api.create(s.memberB, { customer: s.customerB });
    const seenByA = await api.run(s.ownerA, `select id from public.work_orders`, []);
    expect(seenByA.map((r) => r.id)).toContain(a);
    expect(seenByA.map((r) => r.id)).not.toContain(b);
    const seenByB = await api.run(s.memberB, `select id from public.work_orders where id = $1`, [
      a,
    ]);
    expect(seenByB).toHaveLength(0);
    await expect(
      db.asAnon((tx) => tx.query(`select id from public.work_orders`)),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('sin escritura directa para usuarios (ni insert, ni update de estado o tecnico, ni delete)', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA });
    await failsWith(
      api.run(
        s.memberA,
        `insert into public.work_orders (organization_id, customer_id, title, scheduled_date)
         values ($1, $2, 'Directa', '2026-12-01')`,
        [s.orgA, s.customerA],
      ),
      '42501',
    );
    await failsWith(
      api.run(s.memberA, `update public.work_orders set status = 'completed' where id = $1`, [id]),
      '42501',
    );
    await failsWith(
      api.run(s.memberA, `update public.work_orders set technician_id = $2 where id = $1`, [
        id,
        s.technicianA,
      ]),
      '42501',
    );
    await failsWith(
      api.run(s.memberA, `update public.work_orders set title = 'x' where id = $1`, [id]),
      '42501',
    );
    await failsWith(
      api.run(s.memberA, `delete from public.work_orders where id = $1`, [id]),
      '42501',
    );
  });

  it('un usuario no opera sobre ordenes de otra organizacion (NX005) y no escribe eventos', async () => {
    const b = await api.create(s.memberB, { customer: s.customerB });
    await failsWith(api.assign(s.memberA, b, s.technicianA), 'NX005');
    await failsWith(api.advance(s.memberA, b, 'in_progress'), 'NX005');
    await failsWith(api.cancel(s.memberA, b), 'NX005');
    await failsWith(api.update(s.memberA, b, { title: 'Ajena' }), 'NX005');
    await failsWith(
      api.run(
        s.memberA,
        `insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
         values ($1, $2, 'work_order', $3, 'created')`,
        [s.orgA, s.memberA, b],
      ),
      '42501',
    );
    expect(await api.events(b)).toHaveLength(1);
  });

  it('anon no puede ejecutar las RPC y las funciones de trigger no son invocables', async () => {
    for (const call of [
      `select public.assign_work_order(gen_random_uuid(), gen_random_uuid())`,
      `select public.advance_work_order(gen_random_uuid(), 'completed')`,
      `select public.cancel_work_order(gen_random_uuid(), null)`,
      `select public.update_work_order(gen_random_uuid(), 't', null, 'normal', '2026-12-01')`,
    ]) {
      await expect(db.asAnon((tx) => tx.query(call))).rejects.toMatchObject({ code: '42501' });
    }
    await failsWith(api.run(s.memberA, `select private.require_org()`, []), '42501');
    await failsWith(api.run(s.memberA, `select private.work_orders_record_event()`, []), '42501');
    const grants = await api.su(
      `select n.nspname, p.proname, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              p.prosecdef, p.proconfig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.proname like '%\_work\_order' and p.proname not like 'prevent%'`,
    );
    // 5 envoltorios en public (INVOKER) + 5 funciones en private (DEFINER, search_path fijo).
    expect(grants).toHaveLength(10);
    for (const g of grants) {
      expect(g.anon, `${g.nspname}.${g.proname}`).toBe(false);
      expect(g.auth).toBe(true);
      expect(g.prosecdef).toBe(g.nspname === 'private');
      expect(String(g.proconfig)).toContain('search_path=');
    }
  });
});

describe('DH-04 / DH-05: archivado con ordenes abiertas', () => {
  it('rechaza archivar un tecnico con ordenes asignadas o en curso (NX004)', async () => {
    const tech = await api.newTechnician(s.orgA);
    const id = await api.create(s.memberA, { customer: s.customerA, technician: tech });
    await failsWith(archive(s.memberA, 'technicians', tech), 'NX004');
    await api.advance(s.memberA, id, 'in_progress');
    await failsWith(archive(s.memberA, 'technicians', tech), 'NX004');
    const rows = await api.su(`select archived_at from public.technicians where id = $1`, [tech]);
    expect(rows[0].archived_at).toBeNull();
    await api.advance(s.memberA, id, 'completed');
    await archive(s.memberA, 'technicians', tech);
    const events = await api.su(`select action from public.activity_events where entity_id = $1`, [
      tech,
    ]);
    expect(events).toEqual([{ action: 'archived' }]);
  });

  it('el tecnico se archiva tras cancelar o reasignar, y tecnicos con solo ordenes pendientes ajenas no se ven afectados', async () => {
    const t1 = await api.newTechnician(s.orgA);
    const t2 = await api.newTechnician(s.orgA);
    const id = await api.create(s.memberA, { customer: s.customerA, technician: t1 });
    await failsWith(archive(s.memberA, 'technicians', t1), 'NX004');
    await api.assign(s.memberA, id, t2); // reasignar libera a t1
    await archive(s.memberA, 'technicians', t1);
    await failsWith(archive(s.memberA, 'technicians', t2), 'NX004');
    await api.cancel(s.memberA, id);
    await archive(s.memberA, 'technicians', t2);
  });

  it('rechaza archivar un cliente con ordenes pendientes, asignadas o en curso (NX004)', async () => {
    const customer = await api.newCustomer(s.orgA);
    const id = await api.create(s.memberA, { customer });
    await failsWith(archive(s.memberA, 'customers', customer), 'NX004');
    await api.assign(s.memberA, id, s.technicianA);
    await failsWith(archive(s.memberA, 'customers', customer), 'NX004');
    await api.advance(s.memberA, id, 'in_progress');
    await failsWith(archive(s.memberA, 'customers', customer), 'NX004');
    await api.cancel(s.memberA, id, 'Duplicada');
    await archive(s.memberA, 'customers', customer);
    // El historial de la orden se conserva y el cliente archivado sigue referenciado.
    expect(await api.order(id)).toMatchObject({ customer_id: customer, status: 'cancelled' });
  });

  it('un cliente con una orden completada se puede archivar y restaurar sin tocar la orden', async () => {
    const customer = await api.newCustomer(s.orgA);
    const id = await api.create(s.memberA, { customer, technician: s.technicianA });
    await api.advance(s.memberA, id, 'in_progress');
    await api.advance(s.memberA, id, 'completed');
    await archive(s.memberA, 'customers', customer);
    await api.run(s.memberA, `update public.customers set archived_at = null where id = $1`, [
      customer,
    ]);
    expect(await api.order(id)).toMatchObject({ status: 'completed' });
  });

  it('las ordenes de otra organizacion no bloquean el archivado', async () => {
    const tech = await api.newTechnician(s.orgA);
    await api.create(s.memberB, { customer: s.customerB, technician: s.technicianB });
    await archive(s.memberA, 'technicians', tech);
  });
});

describe('asignar vs archivar: entrelazados secuenciales (la concurrencia real: suite supabase)', () => {
  it('asignar y luego archivar: el archivado falla; archivar y luego asignar: la asignacion falla', async () => {
    const tA = await api.newTechnician(s.orgA);
    const o1 = await api.create(s.memberA, { customer: s.customerA });
    await api.assign(s.memberA, o1, tA);
    await failsWith(archive(s.memberA, 'technicians', tA), 'NX004');

    const tB = await api.newTechnician(s.orgA);
    const o2 = await api.create(s.memberA, { customer: s.customerA });
    await archive(s.memberA, 'technicians', tB);
    await failsWith(api.assign(s.memberA, o2, tB), 'NX002');
    expect(await api.order(o2)).toMatchObject({ status: 'pending', technician_id: null });
  });

  it('crear y archivar cliente en ambos ordenes', async () => {
    const c1 = await api.newCustomer(s.orgA);
    await api.create(s.memberA, { customer: c1 });
    await failsWith(archive(s.memberA, 'customers', c1), 'NX004');
    const c2 = await api.newCustomer(s.orgA);
    await archive(s.memberA, 'customers', c2);
    await failsWith(api.create(s.memberA, { customer: c2 }), 'NX002');
  });

  it('en una misma transaccion archivar y asignar no deja una orden abierta con tecnico archivado', async () => {
    const tech = await api.newTechnician(s.orgA);
    const id = await api.create(s.memberA, { customer: s.customerA });
    await failsWith(
      db.asUser(s.memberA, async (tx) => {
        await tx.query(`update public.technicians set archived_at = now() where id = $1`, [tech]);
        await tx.query(`select public.assign_work_order($1::uuid, $2::uuid)`, [id, tech]);
      }),
      'NX002',
    );
    const open = await api.su(
      `select count(*)::int as n from public.work_orders w join public.technicians t
         on t.id = w.technician_id and t.organization_id = w.organization_id
       where w.status in ('assigned','in_progress') and t.archived_at is not null`,
    );
    expect(open[0].n).toBe(0);
  });

  it('el orden de bloqueo es unico: las RPC bloquean orden -> cliente -> tecnico', async () => {
    // Comprobacion estatica sobre la definicion real: la guarda toma FOR SHARE y el archivado no
    // bloquea ordenes. Si alguien cambia el orden de bloqueo, este caso lo detecta.
    const guard = await api.su(
      `select pg_get_functiondef('private.work_orders_guard'::regproc) as def`,
    );
    const def = String(guard[0].def);
    expect(def.indexOf('public.customers')).toBeGreaterThan(-1);
    expect(def.indexOf('public.customers')).toBeLessThan(def.indexOf('public.technicians'));
    expect((def.match(/for share/gi) ?? []).length).toBeGreaterThanOrEqual(3);
    const archiveDef = String(
      (await api.su(`select pg_get_functiondef('private.prevent_unarchive'::regproc) as def`))[0]
        .def,
    );
    expect(archiveDef).not.toMatch(/for (update|share)/i);
  });
});

describe('detalle de eventos de ordenes (DH-08, BR08)', () => {
  it('es de solo lectura para usuarios, inmutable y aislado por organizacion', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA, technician: s.technicianA });
    const seenByA = await api.run(
      s.ownerA,
      `select count(*)::int as n from public.work_order_event_details where organization_id = $1`,
      [s.orgA],
    );
    expect(seenByA[0].n).toBeGreaterThanOrEqual(2);
    const seenByB = await api.run(
      s.ownerB,
      `select count(*)::int as n from public.work_order_event_details where organization_id = $1`,
      [s.orgA],
    );
    expect(seenByB[0].n).toBe(0);
    await failsWith(
      api.run(
        s.memberA,
        `insert into public.work_order_event_details (event_id, organization_id) select id, organization_id from public.activity_events limit 1`,
        [],
      ),
      '42501',
    );
    await failsWith(
      api.su(`update public.work_order_event_details set detail = 'x' where organization_id = $1`, [
        s.orgA,
      ]),
      '23000',
    );
    await failsWith(
      api.su(`delete from public.work_order_event_details where organization_id = $1`, [s.orgA]),
      '23000',
    );
    expect(await api.events(id)).toHaveLength(2);
  });

  it('no almacena datos personales: solo estados, referencia al tecnico y motivo', async () => {
    const columns = await api.su(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'work_order_event_details' order by 1`,
    );
    expect(columns.map((c) => c.column_name)).toEqual([
      'detail',
      'event_id',
      'from_status',
      'organization_id',
      'technician_id',
      'to_status',
    ]);
  });

  it('los eventos de una misma transaccion conservan el orden de insercion (seq)', async () => {
    const id = await api.create(s.memberA, { customer: s.customerA, technician: s.technicianA });
    const rows = await api.su(
      `select action, seq from public.activity_events where entity_id = $1 order by seq`,
      [id],
    );
    expect(rows.map((r) => r.action)).toEqual(['created', 'assigned']);
    expect(rows.every((r) => r.seq !== null)).toBe(true);
  });

  it('el alta y la asignacion son atomicas: un fallo posterior no deja orden ni eventos', async () => {
    const before = await api.su(`select count(*)::int as n from public.activity_events`);
    await failsWith(
      db.asUser(s.memberA, async (tx) => {
        await tx.query(
          `select public.create_work_order($1::uuid, $2::uuid, 'Atomica', null, 'normal', '2026-12-01', $3::uuid)`,
          [randomUUID(), s.customerA, s.technicianA],
        );
        await tx.query(`select public.advance_work_order($1::uuid, 'completed')`, [randomUUID()]);
      }),
      'NX005',
    );
    const after = await api.su(`select count(*)::int as n from public.activity_events`);
    expect(after[0].n).toBe(before[0].n);
    const orphan = await api.su(
      `select count(*)::int as n from public.work_orders where title = 'Atomica'`,
    );
    expect(orphan[0].n).toBe(0);
  });
});
