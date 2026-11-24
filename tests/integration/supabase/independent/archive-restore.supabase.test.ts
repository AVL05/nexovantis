// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

// Caso independiente de Testing (TASK-008B PRE, DH-06) contra el stack LOCAL de Supabase en CI
// (`pnpm test:supabase`): PostgREST y JWT reales. Complementa a
// tests/integration/independent/archive-restore.test.ts (PGlite). Criterios C-31..C-34 en
// docs/reviews/claude/TASK-008B-PRE.md. Si faltan las variables SUPABASE_*, FALLA (no se salta).
// La clave de servicio solo prepara datos, lee eventos y comprueba el rechazo sin actor; nunca se
// usa para las comprobaciones de acceso de usuario. Las contrasenas se generan al ejecutar.

type Actor = { id: string; client: SupabaseClient };

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

function env() {
  const names = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  const missing = names.filter((n) => !process.env[n]?.trim());
  if (missing.length > 0) throw new Error(`Faltan variables SUPABASE_*: ${missing.join(', ')}`);
  return {
    url: process.env.SUPABASE_URL as string,
    anonKey: process.env.SUPABASE_ANON_KEY as string,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  };
}

function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error || r.data === null) {
    throw new Error(`Preparacion fallida (${what}): ${r.error?.message ?? 'sin datos'}`);
  }
  return r.data;
}

let anon: SupabaseClient;
let admin: SupabaseClient;
let ownerA: Actor;
let memberA: Actor;
let ownerB: Actor;
let orgA: string;
let orgB: string;
const rows = { customerA: '', customerB: '', technicianA: '', technicianB: '' };

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
  const { url, anonKey, serviceKey } = env();
  anon = createClient(url, anonKey, authOptions);
  admin = createClient(url, serviceKey, authOptions);
  const run = randomUUID().slice(0, 8);
  ownerA = await createActor(url, anonKey, 'ar-owner-a', run);
  memberA = await createActor(url, anonKey, 'ar-member-a', run);
  ownerB = await createActor(url, anonKey, 'ar-owner-b', run);
  const orgs = must(
    await admin
      .from('organizations')
      .insert([{ name: `AR Alfa ${run}` }, { name: `AR Beta ${run}` }])
      .select('id, name')
      .order('name'),
    'organizaciones',
  ) as { id: string }[];
  orgA = orgs[0].id;
  orgB = orgs[1].id;
  must(
    await admin
      .from('memberships')
      .insert([
        { organization_id: orgA, user_id: ownerA.id, role: 'owner' },
        { organization_id: orgA, user_id: memberA.id, role: 'member' },
        { organization_id: orgB, user_id: ownerB.id, role: 'owner' },
      ])
      .select('user_id'),
    'membresias',
  );
  const customers = must(
    await admin
      .from('customers')
      .insert([
        { organization_id: orgA, name: 'Cliente Ficticio AR A' },
        { organization_id: orgB, name: 'Cliente Ficticio AR B' },
      ])
      .select('id, organization_id'),
    'clientes',
  ) as { id: string; organization_id: string }[];
  rows.customerA = customers.find((r) => r.organization_id === orgA)!.id;
  rows.customerB = customers.find((r) => r.organization_id === orgB)!.id;
  const technicians = must(
    await admin
      .from('technicians')
      .insert([
        { organization_id: orgA, full_name: 'Tecnico Ficticio AR A' },
        { organization_id: orgB, full_name: 'Tecnico Ficticio AR B' },
      ])
      .select('id, organization_id'),
    'tecnicos',
  ) as { id: string; organization_id: string }[];
  rows.technicianA = technicians.find((r) => r.organization_id === orgA)!.id;
  rows.technicianB = technicians.find((r) => r.organization_id === orgB)!.id;
}, 120_000);

const adminEvents = async (entityId: string) =>
  must(
    await admin
      .from('activity_events')
      .select('organization_id, actor_id, entity_type, entity_id, action, occurred_at')
      .eq('entity_id', entityId)
      .order('occurred_at'),
    'leer eventos',
  ) as Record<string, string>[];

describe('C-31 archivar y restaurar por PostgREST con JWT real', () => {
  it.each([
    ['customers', 'customerA', 'customer'],
    ['technicians', 'technicianA', 'technician'],
  ] as const)(
    '%s: archivar y restaurar generan eventos con el actor del JWT; la fecha la fija el servidor',
    async (table, key, type) => {
      const id = rows[key];
      const archive = await memberA.client
        .from(table)
        .update({ archived_at: '1999-01-01T00:00:00Z' })
        .eq('id', id)
        .select('archived_at');
      expect(archive.error).toBeNull();
      expect(archive.data).toHaveLength(1);
      expect(new Date(archive.data![0].archived_at as string).getFullYear()).toBeGreaterThan(2000);

      const restore = await ownerA.client
        .from(table)
        .update({ archived_at: null })
        .eq('id', id)
        .select('archived_at');
      expect(restore.error).toBeNull();
      expect(restore.data).toEqual([{ archived_at: null }]);

      const events = await adminEvents(id);
      expect(events.map((e) => [e.action, e.actor_id, e.organization_id, e.entity_type])).toEqual([
        ['archived', memberA.id, orgA, type],
        ['restored', ownerA.id, orgA, type],
      ]);
    },
  );

  it('reescribir archived_at ya archivado devuelve 23000 y no crea eventos', async () => {
    const id = rows.customerA;
    must(
      await ownerA.client
        .from('customers')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
        .select('id'),
      'archivar',
    );
    const before = (await adminEvents(id)).length;
    const res = await ownerA.client
      .from('customers')
      .update({ archived_at: '2030-01-01T00:00:00Z' })
      .eq('id', id)
      .select('id');
    expect(res.error?.code).toBe('23000');
    expect(await adminEvents(id)).toHaveLength(before);
  });
});

describe('C-32 aislamiento y lectura de eventos por PostgREST', () => {
  it('cada organizacion lee solo sus eventos; anon no lee (42501)', async () => {
    must(
      await ownerB.client
        .from('technicians')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', rows.technicianB)
        .select('id'),
      'archivar B',
    );
    const a = await memberA.client.from('activity_events').select('organization_id');
    expect(a.error).toBeNull();
    expect(a.data!.length).toBeGreaterThan(0);
    expect(a.data!.every((r) => r.organization_id === orgA)).toBe(true);
    const b = await ownerB.client.from('activity_events').select('organization_id');
    expect(b.data!.length).toBeGreaterThan(0);
    expect(b.data!.every((r) => r.organization_id === orgB)).toBe(true);
    expect((await anon.from('activity_events').select('*')).error?.code).toBe('42501');
  });

  it('un usuario de otra organizacion no archiva ni restaura (0 filas) y no se crean eventos', async () => {
    const before = (await adminEvents(rows.customerB)).length;
    const archive = await ownerA.client
      .from('customers')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', rows.customerB)
      .select('id');
    expect(archive.error).toBeNull();
    expect(archive.data).toEqual([]);
    const restore = await ownerA.client
      .from('technicians')
      .update({ archived_at: null })
      .eq('id', rows.technicianB)
      .select('id');
    expect(restore.data).toEqual([]);
    expect(await adminEvents(rows.customerB)).toHaveLength(before);
  });
});

describe('C-33 los eventos no se escriben por la API', () => {
  it('authenticated y anon no insertan, actualizan ni borran eventos (42501)', async () => {
    const forged = {
      organization_id: orgA,
      actor_id: ownerA.id,
      entity_type: 'customer',
      entity_id: rows.customerA,
      action: 'archived',
    };
    expect((await ownerA.client.from('activity_events').insert(forged)).error?.code).toBe('42501');
    expect((await anon.from('activity_events').insert(forged)).error?.code).toBe('42501');
    const upd = await ownerA.client
      .from('activity_events')
      .update({ action: 'restored' })
      .eq('organization_id', orgA);
    expect(upd.error?.code).toBe('42501');
    const del = await ownerA.client.from('activity_events').delete().eq('organization_id', orgA);
    expect(del.error?.code).toBe('42501');
  });

  it('no existe RPC publica para insertar eventos', async () => {
    const res = await ownerA.client.rpc('record_activity_event', {});
    expect(res.error).not.toBeNull();
  });
});

describe('C-34 sin actor no se archiva ni restaura', () => {
  it('service_role (JWT sin sub) no archiva: 23000; no se crea evento', async () => {
    const id = rows.technicianA;
    const before = (await adminEvents(id)).length;
    const archive = await admin
      .from('technicians')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');
    expect(archive.error?.code).toBe('23000');
    expect(await adminEvents(id)).toHaveLength(before);
  });
});
