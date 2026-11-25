// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { seedTwoOrgs } from '../../support/fixtures';
import { createTestDb, type TestDb, type TestTx } from '../../support/pglite';

// Pruebas independientes de Testing (TASK-011 POST, F4). Develop no las modifica ni las salta.
// PGlite = PostgreSQL real in-process con las migraciones reales y un shim de auth. NO es PostgREST
// ni Supabase Auth, y NO hay concurrencia real (una sola conexion): los entrelazados se prueban
// como secuencias; la concurrencia real queda para el job `supabase` de CI.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

type Row = Record<string, unknown>;
type Seed = Awaited<ReturnType<typeof seedTwoOrgs>>;
type Status = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';

let db: TestDb;
let s: Seed;

const q = async (user: string, sql: string, params: unknown[] = []) =>
  (await db.asUser(user, (tx) => tx.query<Row>(sql, params))).rows;
const su = async (sql: string, params: unknown[] = []) =>
  (await db.asSuperuser((tx) => tx.query<Row>(sql, params))).rows;

/** Superusuario (sin RLS ni GRANT) pero con claims de un usuario: simula SQL de administracion con actor. */
async function adminAs<T>(user: string, fn: (tx: TestTx) => Promise<T>): Promise<T> {
  return db.asSuperuser(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: user, role: 'authenticated' }),
    ]);
    return fn(tx);
  });
}

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    return String((e as { code?: string }).code ?? 'sin-codigo');
  }
  return 'OK';
};

const newCustomer = async (org: string) =>
  String(
    (
      await su(
        `insert into public.customers (organization_id, name) values ($1, 'Cliente ' || gen_random_uuid()::text) returning id`,
        [org],
      )
    )[0].id,
  );
const newTech = async (org: string) =>
  String(
    (
      await su(
        `insert into public.technicians (organization_id, full_name) values ($1, 'Tecnico ' || gen_random_uuid()::text) returning id`,
        [org],
      )
    )[0].id,
  );

const create = async (
  user: string,
  customer: string,
  technician: string | null = null,
  id?: string,
) =>
  String(
    (
      await q(
        user,
        `select public.create_work_order($1::uuid,$2::uuid,'Orden independiente',null,'normal','2026-12-01'::date,$3::uuid) as id`,
        [id ?? randomUUID(), customer, technician],
      )
    )[0].id,
  );
const assign = (user: string, id: string, tech: string | null) =>
  q(user, `select public.assign_work_order($1::uuid,$2::uuid) as r`, [id, tech]);
const advance = (user: string, id: string, to: string) =>
  q(user, `select public.advance_work_order($1::uuid,$2) as r`, [id, to]);
const cancel = (user: string, id: string, reason: string | null = null) =>
  q(user, `select public.cancel_work_order($1::uuid,$2) as r`, [id, reason]);
const update = (user: string, id: string, title = 'Nuevo titulo') =>
  q(user, `select public.update_work_order($1::uuid,$2,'desc','high','2026-12-09'::date)`, [
    id,
    title,
  ]);
const archive = (user: string, table: 'customers' | 'technicians', id: string) =>
  q(user, `update public.${table} set archived_at = now() where id = $1`, [id]);
const restore = (user: string, table: 'customers' | 'technicians', id: string) =>
  q(user, `update public.${table} set archived_at = null where id = $1`, [id]);

const orderRow = async (id: string) =>
  (await su(`select * from public.work_orders where id = $1`, [id]))[0];
const eventCount = async (id: string) =>
  Number(
    (
      await su(
        `select count(*)::int as n from public.activity_events where entity_id = $1 and entity_type = 'work_order'`,
        [id],
      )
    )[0].n,
  );

/** Lleva una orden recien creada al estado pedido usando solo las RPC. */
async function orderIn(status: Status, org = s.orgA, user = s.ownerA) {
  const customer = await newCustomer(org);
  const tech = await newTech(org);
  const id = await create(user, customer, status === 'pending' ? null : tech);
  if (status === 'in_progress' || status === 'completed') await advance(user, id, 'in_progress');
  if (status === 'completed') await advance(user, id, 'completed');
  if (status === 'cancelled') await cancel(user, id, 'motivo');
  return { id, customer, tech };
}

const STATUSES: Status[] = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
});
afterAll(async () => {
  await db.close();
});

describe('matriz de transiciones a nivel de tabla (BR03, DH-03): cualquier via de escritura', () => {
  const ALLOWED = new Set([
    'pending>assigned',
    'pending>cancelled',
    'assigned>in_progress',
    'assigned>cancelled',
    'in_progress>completed',
    'in_progress>cancelled',
  ]);
  const pairs = STATUSES.flatMap((from) =>
    STATUSES.filter((to) => to !== from).map((to) => [from, to] as const),
  );

  it.each(pairs)('%s -> %s', async (from, to) => {
    const { id, tech } = await orderIn(from);
    const before = await eventCount(id);
    const outcome = await code(
      adminAs(s.ownerA, (tx) =>
        tx.query(
          `update public.work_orders set status = $2,
                  technician_id = case when $2 = 'pending' then null when $2 = 'assigned' then coalesce(technician_id, $3::uuid) else technician_id end
            where id = $1`,
          [id, to, tech],
        ),
      ),
    );
    if (ALLOWED.has(`${from}>${to}`)) {
      expect(outcome, `${from}->${to} debe permitirse`).toBe('OK');
      expect((await orderRow(id)).status).toBe(to);
      expect(await eventCount(id)).toBe(before + 1);
    } else {
      expect(outcome, `${from}->${to} debe rechazarse con NX001`).toBe('NX001');
      expect((await orderRow(id)).status).toBe(from);
      expect(await eventCount(id)).toBe(before);
    }
  });

  it('el estado no se puede fijar a un valor fuera del catalogo ni nacer en un estado avanzado', async () => {
    const customer = await newCustomer(s.orgA);
    const tech = await newTech(s.orgA);
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(
            `insert into public.work_orders (organization_id, customer_id, technician_id, title, scheduled_date, status)
             values ($1,$2,$3,'x','2026-12-01','in_progress')`,
            [s.orgA, customer, tech],
          ),
        ),
      ),
    ).toBe('NX001');
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(
            `insert into public.work_orders (organization_id, customer_id, title, scheduled_date, status)
             values ($1,$2,'x','2026-12-01','paused')`,
            [s.orgA, customer],
          ),
        ),
      ),
    ).not.toBe('OK');
  });
});

describe('matriz de operaciones RPC por estado (DH-01, DH-02, DH-03, DH-07)', () => {
  type Op = 'assign-other' | 'assign-same' | 'start' | 'complete' | 'cancel' | 'edit';
  // Resultado esperado: true/false = cambio / no-op (assign, advance, edit); 'cancelled' / 'already_cancelled' (cancel, text); otra cadena = SQLSTATE.
  const EXPECTED: Record<Status, Record<Op, boolean | string>> = {
    pending: {
      'assign-other': true,
      'assign-same': true,
      start: 'NX001',
      complete: 'NX001',
      cancel: 'cancelled',
      edit: true,
    },
    assigned: {
      'assign-other': true,
      'assign-same': false,
      start: true,
      complete: 'NX001',
      cancel: 'cancelled',
      edit: true,
    },
    in_progress: {
      'assign-other': 'NX001',
      'assign-same': 'NX001',
      start: false,
      complete: true,
      cancel: 'cancelled',
      edit: true,
    },
    completed: {
      'assign-other': 'NX001',
      'assign-same': 'NX001',
      start: 'NX001',
      complete: false,
      cancel: 'NX001',
      edit: 'NX003',
    },
    cancelled: {
      'assign-other': 'NX001',
      'assign-same': 'NX001',
      start: 'NX001',
      complete: 'NX001',
      cancel: 'already_cancelled',
      edit: 'NX003',
    },
  };
  const cases = STATUSES.flatMap((st) =>
    (Object.keys(EXPECTED[st]) as Op[]).map((op) => [st, op] as const),
  );

  it.each(cases)('estado %s, operacion %s', async (status, op) => {
    const { id, tech } = await orderIn(status);
    const other = await newTech(s.orgA);
    const before = await orderRow(id);
    const eventsBefore = await eventCount(id);
    const run = async () => {
      switch (op) {
        case 'assign-other':
          return (await assign(s.ownerA, id, other))[0].r;
        case 'assign-same':
          return (await assign(s.ownerA, id, tech))[0].r;
        case 'start':
          return (await advance(s.ownerA, id, 'in_progress'))[0].r;
        case 'complete':
          return (await advance(s.ownerA, id, 'completed'))[0].r;
        case 'cancel':
          return (await cancel(s.ownerA, id, 'x'))[0].r;
        case 'edit':
          await update(s.ownerA, id);
          return true;
      }
    };
    const want = EXPECTED[status][op];
    let got: unknown;
    try {
      got = await run();
    } catch (e) {
      got = String((e as { code?: string }).code);
    }
    expect(got, `${status}/${op}`).toBe(want);
    const after = await orderRow(id);
    if (typeof want === 'string' && want.startsWith('NX')) {
      // un rechazo no cambia nada: ni fila ni eventos
      expect(after.status).toBe(before.status);
      expect(after.technician_id).toBe(before.technician_id);
      expect(after.title).toBe(before.title);
      expect(await eventCount(id)).toBe(eventsBefore);
    }
    if (want === false || want === 'already_cancelled')
      expect(await eventCount(id), 'un no-op no emite evento').toBe(eventsBefore);
  });

  it('asignar a pendiente la deja asignada con tecnico; no es posible desasignar', async () => {
    const { id } = await orderIn('pending');
    const t = await newTech(s.orgA);
    expect((await assign(s.ownerA, id, t))[0].r).toBe(true);
    const row = await orderRow(id);
    expect([row.status, row.technician_id]).toEqual(['assigned', t]);
    expect(await code(assign(s.ownerA, id, null))).toBe('NX002');
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(`update public.work_orders set technician_id = null where id = $1`, [id]),
        ),
      ),
    ).not.toBe('OK');
  });

  it('el tecnico no cambia en en curso ni en terminales ni por SQL de administracion (DH-01)', async () => {
    for (const st of ['in_progress', 'completed', 'cancelled'] as Status[]) {
      const { id } = await orderIn(st);
      const other = await newTech(s.orgA);
      const outcome = await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(`update public.work_orders set technician_id = $2 where id = $1`, [id, other]),
        ),
      );
      expect(outcome, st).toMatch(/^NX00[13]$/);
    }
  });

  it('cancelar guarda el motivo (opcional, recortado, max 200) solo en el estado cancelado', async () => {
    const a = await orderIn('assigned');
    await cancel(s.ownerA, a.id, '   ');
    expect((await orderRow(a.id)).cancellation_reason).toBeNull();
    const b = await orderIn('in_progress');
    await cancel(s.ownerA, b.id, '  Cliente ausente  ');
    expect((await orderRow(b.id)).cancellation_reason).toBe('Cliente ausente');
    const c = await orderIn('pending');
    expect(await code(cancel(s.ownerA, c.id, 'x'.repeat(201)))).toBe('22001');
    expect((await orderRow(c.id)).status).toBe('pending');
    await cancel(s.ownerA, c.id, 'x'.repeat(200));
    // un reintento con otro motivo no sobrescribe el original (terminal inmutable)
    expect((await cancel(s.ownerA, c.id, 'otro'))[0].r).toBe('already_cancelled');
    expect((await orderRow(c.id)).cancellation_reason).toBe('x'.repeat(200));
    // motivo fuera de cancelada rechazado por restriccion
    const d = await orderIn('pending');
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(`update public.work_orders set cancellation_reason = 'x' where id = $1`, [d.id]),
        ),
      ),
    ).not.toBe('OK');
  });
});

describe('eventos, actor y atomicidad (DH-08 / BR08)', () => {
  it('cada evento tiene su detalle y el actor es quien opera (owner o member), nunca nulo', async () => {
    const customer = await newCustomer(s.orgA);
    const t1 = await newTech(s.orgA);
    const t2 = await newTech(s.orgA);
    const id = await create(s.memberA, customer, t1);
    await assign(s.ownerA, id, t2);
    await advance(s.memberA, id, 'in_progress');
    await advance(s.ownerA, id, 'completed');
    const ev = await su(
      `select e.action, e.actor_id, d.from_status, d.to_status, d.technician_id
         from public.activity_events e
         left join public.work_order_event_details d on d.event_id = e.id
        where e.entity_id = $1 and e.entity_type = 'work_order' order by e.seq`,
      [id],
    );
    expect(ev.map((e) => e.action)).toEqual([
      'created',
      'assigned',
      'reassigned',
      'status_changed',
      'status_changed',
    ]);
    expect(ev.map((e) => e.actor_id)).toEqual([
      s.memberA,
      s.memberA,
      s.ownerA,
      s.memberA,
      s.ownerA,
    ]);
    expect(ev.every((e) => e.to_status !== undefined && e.actor_id !== null)).toBe(true);
    expect(ev[1]).toMatchObject({
      from_status: 'pending',
      to_status: 'assigned',
      technician_id: t1,
    });
    expect(ev[2]).toMatchObject({
      from_status: 'assigned',
      to_status: 'assigned',
      technician_id: t2,
    });
    expect(ev[4]).toMatchObject({ from_status: 'in_progress', to_status: 'completed' });
    const orphans = await su(
      `select count(*)::int as n from public.activity_events e
        where e.entity_type = 'work_order' and not exists (select 1 from public.work_order_event_details d where d.event_id = e.id)`,
    );
    expect(orphans[0].n).toBe(0);
  });

  it('sin actor (auth.uid nulo) ni se cambia la orden ni se escribe un evento', async () => {
    const { id } = await orderIn('assigned');
    const before = await eventCount(id);
    expect(
      await code(su(`update public.work_orders set status = 'in_progress' where id = $1`, [id])),
    ).toBe('23000');
    expect((await orderRow(id)).status).toBe('assigned');
    expect(await eventCount(id)).toBe(before);
    // las RPC exigen sesion
    expect(
      await code(
        db.asAnon((tx) => tx.query(`select public.cancel_work_order($1::uuid, null)`, [id])),
      ),
    ).toBe('42501');
  });

  it('un fallo a mitad de operacion revierte orden y eventos (misma transaccion)', async () => {
    const customer = await newCustomer(s.orgA);
    const tech = await newTech(s.orgA);
    const archivedTech = await newTech(s.orgA);
    await adminAs(s.ownerA, (tx) =>
      tx.query(`update public.technicians set archived_at = now() where id = $1`, [archivedTech]),
    );
    const id = randomUUID();
    expect(await code(create(s.ownerA, customer, archivedTech, id))).toBe('NX002');
    expect(await su(`select 1 from public.work_orders where id = $1`, [id])).toHaveLength(0);
    expect(await eventCount(id)).toBe(0);
    // transaccion explicita: crear + asignar a archivado -> todo se deshace
    const id2 = randomUUID();
    expect(
      await code(
        db.asUser(s.ownerA, async (tx) => {
          await tx.query(
            `select public.create_work_order($1::uuid,$2::uuid,'t',null,'normal','2026-12-01'::date,$3::uuid)`,
            [id2, customer, tech],
          );
          await tx.query(`select public.assign_work_order($1::uuid,$2::uuid)`, [id2, archivedTech]);
        }),
      ),
    ).toBe('NX002');
    expect(await su(`select 1 from public.work_orders where id = $1`, [id2])).toHaveLength(0);
    expect(await eventCount(id2)).toBe(0);
  });

  it('eventos y detalles son inmutables incluso para el superusuario', async () => {
    const { id } = await orderIn('assigned');
    for (const sql of [
      `update public.activity_events set action = 'created' where entity_id = '${id}'`,
      `delete from public.activity_events where entity_id = '${id}'`,
      `truncate public.activity_events`,
      `update public.work_order_event_details set detail = 'x'`,
      `delete from public.work_order_event_details`,
      `truncate public.work_order_event_details`,
      `delete from public.work_orders where id = '${id}'`,
      `truncate public.work_orders`,
    ]) {
      expect(await code(su(sql)), sql).not.toBe('OK');
    }
    expect(await eventCount(id)).toBe(2);
  });

  it('el historial legible por un miembro de la organizacion no es visible para otra', async () => {
    const { id } = await orderIn('pending');
    expect(
      (
        await q(
          s.memberA,
          `select count(*)::int as n from public.activity_events where entity_id = $1`,
          [id],
        )
      )[0].n,
    ).toBe(1);
    for (const table of ['activity_events', 'work_order_event_details']) {
      const rows = await q(
        s.ownerB,
        `select count(*)::int as n from public.${table} where organization_id = $1`,
        [s.orgA],
      );
      expect(rows[0].n, table).toBe(0);
    }
  });
});

describe('RLS, privilegios y aislamiento (BR01)', () => {
  it('catalogo: RLS activa, solo politicas SELECT y sin privilegios de escritura para usuarios', async () => {
    const t = await su(
      `select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('work_orders','work_order_event_details')`,
    );
    expect(t).toHaveLength(2);
    expect(t.every((r) => r.rls === true)).toBe(true);
    const pol = await su(
      `select tablename, cmd from pg_policies where schemaname='public' and tablename in ('work_orders','work_order_event_details')`,
    );
    expect(pol.map((p) => p.cmd).every((c) => c === 'SELECT')).toBe(true);
    expect(pol).toHaveLength(2);
    for (const table of ['work_orders', 'work_order_event_details']) {
      for (const role of ['anon', 'authenticated']) {
        for (const priv of ['insert', 'update', 'delete', 'truncate', 'references', 'trigger']) {
          const r = await su(`select has_table_privilege($1, $2, $3) as ok`, [
            role,
            `public.${table}`,
            priv,
          ]);
          expect(r[0].ok, `${role} ${priv} ${table}`).toBe(false);
        }
      }
      expect(
        (await su(`select has_table_privilege('anon', $1, 'select') as ok`, [`public.${table}`]))[0]
          .ok,
      ).toBe(false);
      expect(
        (
          await su(`select has_table_privilege('authenticated', $1, 'select') as ok`, [
            `public.${table}`,
          ])
        )[0].ok,
      ).toBe(true);
    }
    const cols = await su(
      `select count(*)::int as n from information_schema.column_privileges
        where table_schema='public' and table_name='work_orders' and grantee in ('anon','authenticated','PUBLIC') and privilege_type <> 'SELECT'`,
    );
    expect(cols[0].n).toBe(0);
  });

  it('catalogo: toda funcion SECURITY DEFINER fija search_path vacio; anon sin EXECUTE en ninguna funcion de ordenes', async () => {
    const defs = await su(
      `select n.nspname, p.proname, ('search_path=""' = any(coalesce(p.proconfig, '{}'))) as pinned
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.prosecdef and n.nspname in ('public','private')`,
    );
    expect(defs.length).toBeGreaterThan(5);
    for (const f of defs) expect(f.pinned, `${f.nspname}.${f.proname}`).toBe(true);
    const fns = await su(
      `select p.oid::regprocedure::text as sig, n.nspname, p.proname, p.prosecdef,
              has_function_privilege('anon', p.oid, 'execute') as anon_exec,
              exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','private')
          and (p.proname like '%work_order%' or p.proname in ('require_org','prevent_unarchive'))`,
    );
    expect(fns.length).toBeGreaterThanOrEqual(13);
    for (const f of fns) {
      expect(f.anon_exec, `anon -> ${f.sig}`).toBe(false);
      expect(f.public_exec, `PUBLIC -> ${f.sig}`).toBe(false);
    }
    // los envoltorios publicos no son SECURITY DEFINER (sin privilegios propios)
    for (const f of fns.filter((x) => x.nspname === 'public'))
      expect(f.prosecdef, String(f.sig)).toBe(false);
    // funciones de trigger: ni authenticated puede invocarlas
    for (const name of [
      'work_orders_guard',
      'work_orders_record_event',
      'prevent_work_order_delete',
      'require_org',
      'prevent_unarchive',
    ]) {
      const r = await su(
        `select has_function_privilege('authenticated', p.oid, 'execute') as ok from pg_proc p
           join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname=$1`,
        [name],
      );
      expect(r.length).toBeGreaterThan(0);
      expect(
        r.every((x) => x.ok === false),
        name,
      ).toBe(true);
    }
  });

  it('un usuario autenticado no escribe directamente en work_orders ni en tablas de eventos (42501)', async () => {
    const { id, customer } = await orderIn('assigned');
    const attempts: [string, unknown[]][] = [
      [
        `insert into public.work_orders (organization_id, customer_id, title, scheduled_date) values ('${s.orgA}', '${customer}', 'x', '2026-12-01')`,
        [],
      ],
      [`update public.work_orders set title = 'hack' where id = $1`, [id]],
      [`update public.work_orders set status = 'completed' where id = $1`, [id]],
      [`delete from public.work_orders where id = $1`, [id]],
      [
        `insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action) values ('${s.orgA}', '${s.ownerA}', 'work_order', $1, 'created')`,
        [id],
      ],
      [
        `insert into public.work_order_event_details (event_id, organization_id) values (gen_random_uuid(), '${s.orgA}')`,
        [],
      ],
      [`update public.work_order_event_details set detail = 'x'`, []],
      [`delete from public.activity_events`, []],
    ];
    for (const [sql, params] of attempts)
      expect(await code(q(s.ownerA, sql, params)), sql).toBe('42501');
    expect((await orderRow(id)).title).not.toBe('hack');
  });

  it('cada organizacion ve solo sus ordenes y sus detalles; anon no ve nada', async () => {
    const a = await orderIn('pending', s.orgA, s.ownerA);
    const b = await orderIn('pending', s.orgB, s.ownerB);
    const seenA = (await q(s.memberA, `select id from public.work_orders`)).map((r) => r.id);
    expect(seenA).toContain(a.id);
    expect(seenA).not.toContain(b.id);
    const seenB = (await q(s.ownerB, `select id from public.work_orders`)).map((r) => r.id);
    expect(seenB).toContain(b.id);
    expect(seenB).not.toContain(a.id);
    expect(
      await q(s.ownerB, `select 1 from public.work_orders where id = $1`, [a.id]),
    ).toHaveLength(0);
    expect(await code(db.asAnon((tx) => tx.query(`select * from public.work_orders`)))).toBe(
      '42501',
    );
  });

  it('operar sobre una orden de otra organizacion es NX005 (indistinguible de inexistente) y no deja rastro', async () => {
    const a = await orderIn('assigned', s.orgA, s.ownerA);
    const techB = await newTech(s.orgB);
    const before = await orderRow(a.id);
    const eventsBefore = await eventCount(a.id);
    const missing = randomUUID();
    for (const run of [
      (id: string) => assign(s.ownerB, id, techB),
      (id: string) => advance(s.ownerB, id, 'in_progress'),
      (id: string) => cancel(s.ownerB, id),
      (id: string) => update(s.ownerB, id),
    ]) {
      expect(await code(run(a.id))).toBe('NX005');
      expect(await code(run(missing))).toBe('NX005');
    }
    expect(await orderRow(a.id)).toEqual(before);
    expect(await eventCount(a.id)).toBe(eventsBefore);
  });

  it('cliente/tecnico de otra organizacion, inexistentes o archivados se rechazan (NX002) al crear y asignar', async () => {
    const custA = await newCustomer(s.orgA);
    const custB = await newCustomer(s.orgB);
    const techA = await newTech(s.orgA);
    const techB = await newTech(s.orgB);
    expect(await code(create(s.ownerA, custA, techA))).toBe('OK'); // control positivo
    expect(await code(create(s.ownerA, custB))).toBe('NX002');
    expect(await code(create(s.ownerA, custA, techB))).toBe('NX002');
    expect(await code(create(s.ownerA, randomUUID()))).toBe('NX002');
    expect(await code(create(s.ownerA, custA, randomUUID()))).toBe('NX002');
    const o = await create(s.ownerA, custA);
    expect(await code(assign(s.ownerA, o, techB))).toBe('NX002');
    expect(await code(assign(s.ownerA, o, randomUUID()))).toBe('NX002');
    await adminAs(s.ownerA, (tx) =>
      tx.query(`update public.customers set archived_at = now() where id = $1`, [custB]),
    );
    expect(await code(create(s.ownerB, custB))).toBe('NX002');
    const custArchived = await newCustomer(s.orgA);
    await adminAs(s.ownerA, (tx) =>
      tx.query(`update public.customers set archived_at = now() where id = $1`, [custArchived]),
    );
    expect(await code(create(s.ownerA, custArchived))).toBe('NX002');
    const techArchived = await newTech(s.orgA);
    await adminAs(s.ownerA, (tx) =>
      tx.query(`update public.technicians set archived_at = now() where id = $1`, [techArchived]),
    );
    expect(await code(assign(s.ownerA, o, techArchived))).toBe('NX002');
    expect(await code(create(s.ownerA, custA, techArchived))).toBe('NX002');
    expect((await orderRow(o)).status).toBe('pending');
    // la clave foranea compuesta tambien lo impide por SQL de administracion (BR01 en la tabla)
    expect(
      await code(
        adminAs(s.ownerA, (tx) =>
          tx.query(
            `insert into public.work_orders (organization_id, customer_id, title, scheduled_date) values ($1,$2,'x','2026-12-01')`,
            [s.orgA, custB],
          ),
        ),
      ),
    ).not.toBe('OK');
  });

  it('un id de orden de otra organizacion no se reutiliza ni se revela; mismo id en la misma org es idempotente', async () => {
    const custA = await newCustomer(s.orgA);
    const custB = await newCustomer(s.orgB);
    const id = await create(s.ownerA, custA);
    expect(await code(create(s.ownerB, custB, null, id))).toBe('23505');
    expect(await create(s.ownerA, custA, null, id)).toBe(id);
    expect(await create(s.memberA, custA, null, id)).toBe(id);
    expect(await eventCount(id)).toBe(1);
    expect((await orderRow(id)).organization_id).toBe(s.orgA);
  });

  it('usuario sin membresia y organizacion no enviada por el cliente: org siempre de la sesion', async () => {
    const orphan = '00000000-0000-4000-8000-0000000000f9';
    await su(`insert into auth.users (id, email) values ($1, 'huerfano@example.test')`, [orphan]);
    const custA = await newCustomer(s.orgA);
    expect(await code(create(orphan, custA))).toBe('42501');
    // la firma de las RPC no admite organization_id: una llamada con ese argumento no existe
    expect(
      await code(
        q(
          s.ownerA,
          `select public.create_work_order(gen_random_uuid(), $1::uuid, 't', null, 'normal', '2026-12-01'::date, null, $2::uuid)`,
          [custA, s.orgB],
        ),
      ),
    ).not.toBe('OK');
    const id = await create(s.ownerB, await newCustomer(s.orgB));
    expect((await orderRow(id)).organization_id).toBe(s.orgB);
    // cambiar la organizacion de una orden es imposible (ni siquiera como administrador)
    expect(
      await code(
        adminAs(s.ownerB, (tx) =>
          tx.query(`update public.work_orders set organization_id = $2 where id = $1`, [
            id,
            s.orgA,
          ]),
        ),
      ),
    ).not.toBe('OK');
  });

  it('validaciones de datos en la base: titulo en blanco o largo, prioridad, fechas y descripcion', async () => {
    const custA = await newCustomer(s.orgA);
    const mk = (
      title: string | null,
      desc: string | null,
      prio: string | null,
      date: string | null,
    ) =>
      q(
        s.ownerA,
        `select public.create_work_order(gen_random_uuid(), $1::uuid, $2, $3, $4, $5::date, null)`,
        [custA, title, desc, prio, date],
      );
    expect(await code(mk('   ', null, 'normal', '2026-12-01'))).toBe('23514');
    expect(await code(mk('   ', null, 'normal', '2026-12-01'))).toBe('23514');
    expect(await code(mk('x'.repeat(121), null, 'normal', '2026-12-01'))).toBe('23514');
    expect(await code(mk('x'.repeat(120), null, 'normal', '2026-12-01'))).toBe('OK');
    expect(await code(mk('ok', 'd'.repeat(2001), 'normal', '2026-12-01'))).toBe('23514');
    expect(await code(mk('ok', 'd'.repeat(2000), 'normal', '2026-12-01'))).toBe('OK');
    expect(await code(mk('ok', null, 'critica', '2026-12-01'))).toBe('23514');
    expect(await code(mk('ok', null, null, '2026-12-01'))).toBe('OK');
    expect(await code(mk(null, null, 'normal', '2026-12-01'))).toBe('23502');
    expect(await code(mk('ok', null, 'normal', null))).toBe('23502');
    expect(await code(mk('ok', null, 'normal', '2026-02-31'))).not.toBe('OK');
    // la edicion aplica las mismas reglas y no cambia estado ni tecnico
    const o = await create(s.ownerA, custA);
    expect(await code(update(s.ownerA, o, '   '))).toBe('23514');
    await update(s.ownerA, o, 'Titulo editado');
    const row = await orderRow(o);
    expect([row.title, row.status, row.technician_id, row.customer_id]).toEqual([
      'Titulo editado',
      'pending',
      null,
      custA,
    ]);
    expect(await eventCount(o)).toBe(1);
  });
});

describe('DH-04 / DH-05: archivado con ordenes abiertas (en PostgreSQL)', () => {
  it.each(STATUSES)('tecnico con una orden %s', async (status) => {
    const { id, tech } = await orderIn(status);
    const blocks = status === 'assigned' || status === 'in_progress';
    const eventsBefore = Number(
      (
        await su(`select count(*)::int as n from public.activity_events where entity_id = $1`, [
          tech,
        ])
      )[0].n,
    );
    const outcome = await code(archive(s.ownerA, 'technicians', tech));
    if (status === 'pending') {
      // una pendiente no tiene tecnico: el tecnico de orderIn no tiene ordenes
      expect(outcome).toBe('OK');
    } else if (blocks) {
      expect(outcome).toBe('NX004');
      expect(
        (await su(`select archived_at from public.technicians where id = $1`, [tech]))[0]
          .archived_at,
      ).toBeNull();
      expect(
        Number(
          (
            await su(`select count(*)::int as n from public.activity_events where entity_id = $1`, [
              tech,
            ])
          )[0].n,
        ),
      ).toBe(eventsBefore);
      // tambien por SQL de administracion con actor
      expect(
        await code(
          adminAs(s.ownerA, (tx) =>
            tx.query(`update public.technicians set archived_at = now() where id = $1`, [tech]),
          ),
        ),
      ).toBe('NX004');
    } else {
      expect(outcome).toBe('OK');
    }
    expect((await orderRow(id)).status).toBe(status);
  });

  it.each(STATUSES)('cliente con una orden %s', async (status) => {
    const { id, customer } = await orderIn(status);
    const blocks = status === 'pending' || status === 'assigned' || status === 'in_progress';
    const outcome = await code(archive(s.ownerA, 'customers', customer));
    expect(outcome).toBe(blocks ? 'NX004' : 'OK');
    if (blocks) {
      expect(
        (await su(`select archived_at from public.customers where id = $1`, [customer]))[0]
          .archived_at,
      ).toBeNull();
      expect(
        await code(
          adminAs(s.memberA, (tx) =>
            tx.query(`update public.customers set archived_at = now() where id = $1`, [customer]),
          ),
        ),
      ).toBe('NX004');
    } else {
      // restaurar tras archivar: la orden terminal sigue intacta y legible
      expect(await code(restore(s.ownerA, 'customers', customer))).toBe('OK');
    }
    expect((await orderRow(id)).status).toBe(status);
  });

  it('se desbloquea al cancelar o completar; reasignar libera al tecnico de origen y bloquea al de destino', async () => {
    const custA = await newCustomer(s.orgA);
    const t1 = await newTech(s.orgA);
    const t2 = await newTech(s.orgA);
    const o = await create(s.ownerA, custA, t1);
    expect(await code(archive(s.ownerA, 'technicians', t1))).toBe('NX004');
    await assign(s.ownerA, o, t2);
    expect(await code(archive(s.ownerA, 'technicians', t1))).toBe('OK');
    expect(await code(archive(s.ownerA, 'technicians', t2))).toBe('NX004');
    expect(await code(archive(s.ownerA, 'customers', custA))).toBe('NX004');
    await advance(s.ownerA, o, 'in_progress');
    expect(await code(archive(s.ownerA, 'technicians', t2))).toBe('NX004');
    await advance(s.ownerA, o, 'completed');
    expect(await code(archive(s.ownerA, 'technicians', t2))).toBe('OK');
    expect(await code(archive(s.ownerA, 'customers', custA))).toBe('OK');
    // un archivado ya no puede recibir ordenes; restaurarlo lo permite de nuevo
    expect(await code(create(s.ownerA, custA))).toBe('NX002');
    await restore(s.ownerA, 'customers', custA);
    expect(await code(create(s.ownerA, custA))).toBe('OK');
  });

  it('las ordenes de otra organizacion no bloquean y el rechazo no emite evento de archivado', async () => {
    const custB = await newCustomer(s.orgB);
    await create(s.ownerB, custB);
    const custA = await newCustomer(s.orgA);
    expect(await code(archive(s.ownerA, 'customers', custA))).toBe('OK');
    const { customer } = await orderIn('pending');
    const before = Number(
      (
        await su(
          `select count(*)::int as n from public.activity_events where entity_type='customer' and entity_id = $1`,
          [customer],
        )
      )[0].n,
    );
    expect(await code(archive(s.ownerA, 'customers', customer))).toBe('NX004');
    const after = Number(
      (
        await su(
          `select count(*)::int as n from public.activity_events where entity_type='customer' and entity_id = $1`,
          [customer],
        )
      )[0].n,
    );
    expect(after).toBe(before);
  });
});

describe('entrelazados secuenciales de asignar / crear / archivar', () => {
  it('secuencias A-B y B-A de cada par dejan siempre un estado valido', async () => {
    const custA = await newCustomer(s.orgA);
    const t = await newTech(s.orgA);
    const o = await create(s.ownerA, custA);
    // asignar -> archivar tecnico: archivar falla
    await assign(s.ownerA, o, t);
    expect(await code(archive(s.ownerA, 'technicians', t))).toBe('NX004');
    // archivar -> asignar (otro tecnico y otra orden)
    const t2 = await newTech(s.orgA);
    const o2 = await create(s.ownerA, custA);
    expect(await code(archive(s.ownerA, 'technicians', t2))).toBe('OK');
    expect(await code(assign(s.ownerA, o2, t2))).toBe('NX002');
    // crear con tecnico -> archivar cliente / archivar cliente -> crear
    const c3 = await newCustomer(s.orgA);
    const o3 = await create(s.ownerA, c3);
    expect(await code(archive(s.ownerA, 'customers', c3))).toBe('NX004');
    await cancel(s.ownerA, o3);
    expect(await code(archive(s.ownerA, 'customers', c3))).toBe('OK');
    expect(await code(create(s.ownerA, c3))).toBe('NX002');
    // archivar el tecnico de origen justo despues de reasignar
    const t4 = await newTech(s.orgA);
    const t5 = await newTech(s.orgA);
    const o4 = await create(s.ownerA, custA, t4);
    await assign(s.ownerA, o4, t5);
    expect(await code(archive(s.ownerA, 'technicians', t4))).toBe('OK');
    expect(await code(assign(s.ownerA, o4, t4))).toBe('NX002');
    expect((await orderRow(o4)).technician_id).toBe(t5);
  });

  it('dentro de una misma transaccion el archivado ve la asignacion no confirmada y viceversa', async () => {
    const custA = await newCustomer(s.orgA);
    const t = await newTech(s.orgA);
    const o = await create(s.ownerA, custA);
    expect(
      await code(
        db.asUser(s.ownerA, async (tx) => {
          await tx.query(`select public.assign_work_order($1::uuid,$2::uuid)`, [o, t]);
          await tx.query(`update public.technicians set archived_at = now() where id = $1`, [t]);
        }),
      ),
    ).toBe('NX004');
    expect((await orderRow(o)).status).toBe('pending');
    expect(
      await code(
        db.asUser(s.ownerA, async (tx) => {
          await tx.query(`update public.technicians set archived_at = now() where id = $1`, [t]);
          await tx.query(`select public.assign_work_order($1::uuid,$2::uuid)`, [o, t]);
        }),
      ),
    ).toBe('NX002');
    const row = await orderRow(o);
    expect([row.status, row.technician_id]).toEqual(['pending', null]);
    expect(
      (await su(`select archived_at from public.technicians where id = $1`, [t]))[0].archived_at,
    ).toBeNull();
  });

  it('propiedad: 250 operaciones aleatorias (semilla fija) nunca violan los invariantes ni la contabilidad de eventos', async () => {
    let seed = 20261126;
    const rnd = (n: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return Math.floor((seed / 4294967296) * n);
    };
    const pick = <T>(xs: T[]) => xs[rnd(xs.length)];
    const customers = [
      await newCustomer(s.orgA),
      await newCustomer(s.orgA),
      await newCustomer(s.orgA),
    ];
    const techs = [await newTech(s.orgA), await newTech(s.orgA), await newTech(s.orgA)];
    const orders: string[] = [];
    const before = Number(
      (
        await su(
          `select count(*)::int as n from public.activity_events where entity_type='work_order'`,
        )
      )[0].n,
    );
    let expectedEvents = 0;
    const KNOWN = new Set(['NX001', 'NX002', 'NX003', 'NX004', 'NX005', '23000']);
    const users = [s.ownerA, s.memberA];
    const step = async (run: () => Promise<number>) => {
      try {
        expectedEvents += await run();
      } catch (e) {
        const c = String((e as { code?: string }).code);
        expect(KNOWN.has(c), `codigo inesperado ${c}: ${(e as Error).message}`).toBe(true);
      }
    };
    for (let i = 0; i < 250; i++) {
      const user = pick(users);
      const op = rnd(9);
      if (op <= 1 || orders.length === 0) {
        await step(async () => {
          const withTech = rnd(2) === 0 ? pick(techs) : null;
          const id = await create(user, pick(customers), withTech);
          orders.push(id);
          return withTech ? 2 : 1;
        });
      } else if (op === 2) {
        await step(async () =>
          ((await assign(user, pick(orders), pick(techs)))[0].r as boolean) ? 1 : 0,
        );
      } else if (op === 3 || op === 4) {
        await step(async () =>
          ((await advance(user, pick(orders), rnd(2) ? 'in_progress' : 'completed'))[0]
            .r as boolean)
            ? 1
            : 0,
        );
      } else if (op === 5) {
        await step(async () => ((await cancel(user, pick(orders)))[0].r === 'cancelled' ? 1 : 0));
      } else if (op === 6) {
        await step(async () => {
          if (rnd(2)) await archive(user, 'technicians', pick(techs));
          else await archive(user, 'customers', pick(customers));
          return 0;
        });
      } else if (op === 7) {
        await step(async () => (await restore(user, 'technicians', pick(techs)), 0));
      } else {
        await step(async () => (await restore(user, 'customers', pick(customers)), 0));
      }
      const bad = await su(
        `select w.id from public.work_orders w
           join public.customers c on c.id = w.customer_id
           left join public.technicians t on t.id = w.technician_id
          where (w.status in ('pending','assigned','in_progress') and c.archived_at is not null)
             or (w.status in ('assigned','in_progress') and t.archived_at is not null)
             or (w.status = 'pending' and w.technician_id is not null)
             or (w.status in ('assigned','in_progress','completed') and w.technician_id is null)`,
      );
      expect(bad, `invariante violado en el paso ${i} (op ${op})`).toHaveLength(0);
    }
    // nota: archivar un cliente/tecnico sin ordenes abiertas puede ocurrir; los intentos con tipo
    // incorrecto (id de cliente en tecnicos) simplemente no afectan filas.
    const after = Number(
      (
        await su(
          `select count(*)::int as n from public.activity_events where entity_type='work_order'`,
        )
      )[0].n,
    );
    expect(after - before).toBe(expectedEvents);
    const details = Number(
      (
        await su(
          `select count(*)::int as n from public.work_order_event_details d join public.activity_events e on e.id = d.event_id where e.entity_type='work_order'`,
        )
      )[0].n,
    );
    expect(details).toBe(after);
    expect(orders.length).toBeGreaterThan(5);
  });
});

describe('panel en una sentencia (BR04, RETEST AUDIT-003)', () => {
  type Dash = {
    counts: Record<Status, number>;
    overdue: number;
    total: number;
    pending: { id: string; status: string; organization_id: string }[];
  };
  const dash = async (user: string, org: string, today = '2026-12-05', limit = 50) =>
    (
      await q(user, `select public.work_orders_dashboard($1::uuid,$2::date,$3::int) as d`, [
        org,
        today,
        limit,
      ])
    )[0].d as Dash;

  it('indicadores y pendientes coinciden exactamente con las filas de la organizacion', async () => {
    const cust = await newCustomer(s.orgA);
    await create(s.ownerA, cust);
    await orderIn('assigned');
    await orderIn('completed');
    await orderIn('cancelled');
    await orderIn('pending', s.orgB, s.ownerB);
    const d = await dash(s.ownerA, s.orgA);
    const rows = await su(
      `select status, count(*)::int as n,
              count(*) filter (where status in ('pending','assigned','in_progress') and scheduled_date < '2026-12-05')::int as od
         from public.work_orders where organization_id = $1 group by status`,
      [s.orgA],
    );
    for (const st of STATUSES) {
      expect(d.counts[st], st).toBe(Number(rows.find((r) => r.status === st)?.n ?? 0));
    }
    expect(d.total).toBe(rows.reduce((x, r) => x + Number(r.n), 0));
    expect(d.total).toBe(STATUSES.reduce((x, st) => x + d.counts[st], 0));
    expect(d.overdue).toBe(rows.reduce((x, r) => x + Number(r.od), 0));
    const pend = await su(
      `select id from public.work_orders where organization_id = $1 and status = 'pending'`,
      [s.orgA],
    );
    expect(d.pending.map((p) => p.id).sort()).toEqual(pend.map((p) => String(p.id)).sort());
    expect(d.pending).toHaveLength(d.counts.pending);
  });

  it('organizacion ajena: ceros y lista vacia; el limite se respeta', async () => {
    const cust = await newCustomer(s.orgA);
    for (let i = 0; i < 3; i++) await create(s.ownerA, cust);
    const other = await dash(s.ownerB, s.orgA);
    expect(other.total).toBe(0);
    expect(Object.values(other.counts).every((n) => n === 0)).toBe(true);
    expect(other.pending).toEqual([]);
    expect(other.overdue).toBe(0);
    const own = await dash(s.ownerA, s.orgA, '2026-12-05', 2);
    expect(own.pending).toHaveLength(2);
    expect(own.counts.pending).toBeGreaterThan(2);
    const none = await dash(s.ownerA, s.orgA, '2026-12-05', 0);
    expect(none.pending).toEqual([]);
  });

  it('cancelar sale de pendientes y entra en canceladas en el mismo snapshot (TC-CANC-04)', async () => {
    const before = await dash(s.ownerA, s.orgA);
    const { id } = await orderIn('pending');
    const mid = await dash(s.ownerA, s.orgA);
    expect(mid.pending.map((p) => p.id)).toContain(id);
    expect(mid.counts.pending).toBe(before.counts.pending + 1);
    expect(await cancel(s.ownerA, id, 'x')).toEqual([{ r: 'cancelled' }]);
    const after = await dash(s.ownerA, s.orgA);
    expect(after.pending.map((p) => p.id)).not.toContain(id);
    expect(after.counts.pending).toBe(before.counts.pending);
    expect(after.counts.cancelled).toBe(before.counts.cancelled + 1);
    expect(after.total).toBe(before.total + 1);
    // la segunda cancelacion no altera el panel
    expect(await cancel(s.ownerA, id, 'y')).toEqual([{ r: 'already_cancelled' }]);
    expect(await dash(s.ownerA, s.orgA)).toEqual(after);
  });

  it('funcion SECURITY INVOKER, search_path fijo, solo authenticated, anon rechazado, sentencia unica', async () => {
    const f = (
      await su(
        `select p.prosecdef, p.provolatile, l.lanname, p.proconfig::text as cfg, p.prosrc,
                has_function_privilege('anon', p.oid, 'execute') as anon_x,
                has_function_privilege('authenticated', p.oid, 'execute') as auth_x
           from pg_proc p join pg_language l on l.oid = p.prolang
          where p.proname = 'work_orders_dashboard' and p.pronamespace = 'public'::regnamespace`,
      )
    )[0];
    expect(f.prosecdef).toBe(false);
    expect(f.lanname).toBe('sql');
    expect(String(f.cfg)).toMatch(/search_path=\\"\\"/);
    expect(f.anon_x).toBe(false);
    expect(f.auth_x).toBe(true);
    // una unica sentencia SQL: un solo SELECT final, sin separadores de sentencias
    expect(String(f.prosrc).trim().replace(/;\s*$/, '')).not.toContain(';');
    expect(
      await code(
        db.asAnon((tx) =>
          tx.query(`select public.work_orders_dashboard($1::uuid,'2026-12-05'::date,3)`, [s.orgA]),
        ),
      ),
    ).toBe('42501');
  });

  it('las demas RPC conservan su contrato (assign/advance siguen devolviendo boolean)', async () => {
    const { id } = await orderIn('assigned');
    const t = await newTech(s.orgA);
    expect((await assign(s.ownerA, id, t))[0].r).toBe(true);
    expect((await advance(s.ownerA, id, 'in_progress'))[0].r).toBe(true);
    expect((await advance(s.ownerA, id, 'in_progress'))[0].r).toBe(false);
    const types = await su(
      `select proname, pg_get_function_result(oid) as res from pg_proc
        where pronamespace = 'public'::regnamespace
          and proname in ('assign_work_order','advance_work_order','cancel_work_order','update_work_order','create_work_order')`,
    );
    const res = Object.fromEntries(types.map((r) => [r.proname, r.res]));
    expect(res.cancel_work_order).toBe('text');
    expect(res.assign_work_order).toBe('boolean');
    expect(res.advance_work_order).toBe('boolean');
  });

  it('cancelar completada sigue rechazada (NX001) y cancelar dos veces no duplica eventos', async () => {
    const done = await orderIn('completed');
    const ev = await eventCount(done.id);
    expect(await code(cancel(s.ownerA, done.id, 'x'))).toBe('NX001');
    expect(await eventCount(done.id)).toBe(ev);
    const c = await orderIn('assigned');
    await cancel(s.ownerA, c.id, 'a');
    const evC = await eventCount(c.id);
    expect((await cancel(s.ownerA, c.id, 'b'))[0].r).toBe('already_cancelled');
    expect(await eventCount(c.id)).toBe(evC);
    expect((await orderRow(c.id)).cancellation_reason).toBe('a');
  });
});
