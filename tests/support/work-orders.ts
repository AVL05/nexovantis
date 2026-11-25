import { randomUUID } from 'node:crypto';

import type { TestDb } from './pglite';

// Ayudas compartidas de las pruebas de ordenes de servicio (TASK-011). Solo PGlite: llaman a las
// funciones RPC reales (public.*_work_order) con el rol authenticated y claims JWT del usuario.

type Row = Record<string, unknown>;

export type OrderInput = {
  id?: string;
  customer: string;
  title?: string;
  description?: string | null;
  priority?: string;
  date?: string;
  technician?: string | null;
};

export function orderApi(db: TestDb) {
  const run = async (user: string, sql: string, params: unknown[]) =>
    (await db.asUser(user, (tx) => tx.query<Row>(sql, params))).rows;
  const su = async (sql: string, params: unknown[] = []) =>
    (await db.asSuperuser((tx) => tx.query<Row>(sql, params))).rows;

  return {
    su,
    run,
    async create(user: string, input: OrderInput): Promise<string> {
      const rows = await run(
        user,
        `select public.create_work_order($1::uuid, $2::uuid, $3, $4, $5, $6::date, $7::uuid) as id`,
        [
          input.id ?? randomUUID(),
          input.customer,
          input.title ?? 'Revision de caldera',
          input.description ?? null,
          input.priority ?? 'normal',
          input.date ?? '2026-12-01',
          input.technician ?? null,
        ],
      );
      return String(rows[0].id);
    },
    async assign(user: string, id: string, technician: string | null) {
      const rows = await run(user, `select public.assign_work_order($1::uuid, $2::uuid) as ok`, [
        id,
        technician,
      ]);
      return rows[0].ok as boolean;
    },
    async advance(user: string, id: string, to: string) {
      const rows = await run(user, `select public.advance_work_order($1::uuid, $2) as ok`, [
        id,
        to,
      ]);
      return rows[0].ok as boolean;
    },
    async cancel(user: string, id: string, reason: string | null = null) {
      const rows = await run(user, `select public.cancel_work_order($1::uuid, $2) as ok`, [
        id,
        reason,
      ]);
      return rows[0].ok as boolean;
    },
    async update(user: string, id: string, fields: { title: string; description?: string | null }) {
      await run(
        user,
        `select public.update_work_order($1::uuid, $2, $3, 'normal', '2026-12-05'::date)`,
        [id, fields.title, fields.description ?? null],
      );
    },
    async order(id: string): Promise<Row> {
      return (await su(`select * from public.work_orders where id = $1`, [id]))[0];
    },
    async events(id: string): Promise<Row[]> {
      return su(
        `select e.action, d.from_status, d.to_status, d.technician_id, d.detail, e.actor_id
         from public.activity_events e
         join public.work_order_event_details d on d.event_id = e.id
         where e.entity_type = 'work_order' and e.entity_id = $1
         order by e.seq`,
        [id],
      );
    },
    async newCustomer(org: string, name = 'Cliente de prueba'): Promise<string> {
      const rows = await su(
        `insert into public.customers (organization_id, name) values ($1, $2) returning id`,
        [org, name],
      );
      return String(rows[0].id);
    },
    async newTechnician(org: string, name = 'Tecnico de prueba'): Promise<string> {
      const rows = await su(
        `insert into public.technicians (organization_id, full_name) values ($1, $2) returning id`,
        [org, name],
      );
      return String(rows[0].id);
    },
  };
}
