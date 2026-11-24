// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

// Pruebas contra el stack LOCAL de Supabase (`supabase start`) en CI: Auth (GoTrue), JWT reales y
// PostgREST. Se ejecutan con `pnpm test:supabase` y requieren SUPABASE_URL, SUPABASE_ANON_KEY y
// SUPABASE_SERVICE_ROLE_KEY (de `supabase status -o env`). Si faltan, FALLAN: nunca se saltan.
//
// La clave de servicio solo se usa en la preparacion (usuarios, organizaciones, membresias y datos
// de prueba), nunca en las comprobaciones de acceso, que usan clientes anon y autenticados.
// Las contrasenas se generan al ejecutar y no se guardan ni se imprimen.

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

type Row = Record<string, unknown>;
type Actor = { id: string; client: SupabaseClient };

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Faltan variables del stack local de Supabase: ${missing.join(', ')}`);
  }
  return {
    url: process.env.SUPABASE_URL as string,
    anonKey: process.env.SUPABASE_ANON_KEY as string,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  };
}

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error || result.data === null) {
    throw new Error(`Preparacion fallida (${what}): ${result.error?.message ?? 'sin datos'}`);
  }
  return result.data;
}

let anon: SupabaseClient;
let admin: SupabaseClient;
let ownerA: Actor;
let memberA: Actor;
let ownerB: Actor;
let memberB: Actor;
let orgA: string;
let orgB: string;
let customerA: string;
let customerB: string;
let technicianA: string;
let technicianB: string;

async function createActor(url: string, anonKey: string, label: string, run: string) {
  const email = `${label}-${run}@example.test`;
  const password = randomBytes(24).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const user = created.data.user;
  if (created.error || !user) {
    throw new Error(
      `Preparacion fallida (usuario ${label}): ${created.error?.message ?? 'sin usuario'}`,
    );
  }
  const client = createClient(url, anonKey, authOptions);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error)
    throw new Error(`Preparacion fallida (login ${label}): ${signedIn.error.message}`);
  return { id: user.id, client } satisfies Actor;
}

async function adminRows(table: string, column: string, value: string): Promise<Row[]> {
  return must(await admin.from(table).select('*').eq(column, value), `leer ${table}`) as Row[];
}

beforeAll(async () => {
  const { url, anonKey, serviceKey } = requireEnv();
  anon = createClient(url, anonKey, authOptions);
  admin = createClient(url, serviceKey, authOptions);
  const run = randomUUID().slice(0, 8);

  ownerA = await createActor(url, anonKey, 'owner-a', run);
  memberA = await createActor(url, anonKey, 'member-a', run);
  ownerB = await createActor(url, anonKey, 'owner-b', run);
  memberB = await createActor(url, anonKey, 'member-b', run);

  const orgs = must(
    await admin
      .from('organizations')
      .insert([{ name: `Organizacion Alfa ${run}` }, { name: `Organizacion Beta ${run}` }])
      .select('id, name')
      .order('name'),
    'crear organizaciones',
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
        { organization_id: orgB, user_id: memberB.id, role: 'member' },
      ])
      .select('user_id'),
    'crear membresias',
  );

  const customers = must(
    await admin
      .from('customers')
      .insert([
        { organization_id: orgA, name: 'Cliente Ficticio Alfa' },
        { organization_id: orgB, name: 'Cliente Ficticio Beta' },
      ])
      .select('id, organization_id'),
    'crear clientes',
  ) as { id: string; organization_id: string }[];
  customerA = customers.find((row) => row.organization_id === orgA)!.id;
  customerB = customers.find((row) => row.organization_id === orgB)!.id;

  const technicians = must(
    await admin
      .from('technicians')
      .insert([
        { organization_id: orgA, full_name: 'Tecnico Ficticio Alfa' },
        { organization_id: orgB, full_name: 'Tecnico Ficticio Beta' },
      ])
      .select('id, organization_id'),
    'crear tecnicos',
  ) as { id: string; organization_id: string }[];
  technicianA = technicians.find((row) => row.organization_id === orgA)!.id;
  technicianB = technicians.find((row) => row.organization_id === orgB)!.id;
}, 120_000);

describe('configuracion del stack local', () => {
  it('las variables SUPABASE_* estan definidas (si faltan, la suite falla)', () => {
    expect(() => requireEnv()).not.toThrow();
  });
});

describe('aislamiento entre organizaciones (JWT y PostgREST reales)', () => {
  it('cada usuario solo ve su organizacion', async () => {
    for (const [actor, org] of [
      [ownerA, orgA],
      [memberA, orgA],
      [ownerB, orgB],
      [memberB, orgB],
    ] as const) {
      const { data, error } = await actor.client.from('organizations').select('id');
      expect(error).toBeNull();
      expect(data).toEqual([{ id: org }]);
    }
  });

  it('cada usuario solo ve membresias, clientes y tecnicos de su organizacion', async () => {
    const memberships = await ownerA.client.from('memberships').select('organization_id, user_id');
    expect(memberships.error).toBeNull();
    expect(memberships.data).toHaveLength(2);
    expect(memberships.data?.every((row) => row.organization_id === orgA)).toBe(true);

    const customers = await memberA.client.from('customers').select('id');
    expect(customers.error).toBeNull();
    expect(customers.data).toEqual([{ id: customerA }]);

    const technicians = await ownerB.client.from('technicians').select('id');
    expect(technicians.error).toBeNull();
    expect(technicians.data).toEqual([{ id: technicianB }]);
  });

  it('el acceso directo por id a datos ajenos devuelve 0 filas', async () => {
    const customer = await ownerA.client.from('customers').select('id').eq('id', customerB);
    const technician = await memberB.client.from('technicians').select('id').eq('id', technicianA);
    expect(customer.error).toBeNull();
    expect(customer.data).toEqual([]);
    expect(technician.error).toBeNull();
    expect(technician.data).toEqual([]);
  });
});

describe('anon no accede a los datos', () => {
  it.each(['organizations', 'memberships', 'customers', 'technicians'])(
    'anon no lee %s (42501)',
    async (table) => {
      const { data, error } = await anon.from(table).select('*');
      expect(error?.code).toBe('42501');
      expect(data).toBeNull();
    },
  );

  it('anon no inserta clientes (42501)', async () => {
    const { error } = await anon.from('customers').insert({ organization_id: orgA, name: 'Anon' });
    expect(error?.code).toBe('42501');
    expect(await adminRows('customers', 'name', 'Anon')).toEqual([]);
  });
});

describe('escrituras rechazadas', () => {
  it.each([
    ['customers', 'name'],
    ['technicians', 'full_name'],
  ] as const)('INSERT en %s con organizacion ajena -> 42501', async (table, column) => {
    const marker = `Intruso ${table}`;
    const { error } = await ownerA.client
      .from(table)
      .insert({ organization_id: orgB, [column]: marker });
    expect(error?.code).toBe('42501');
    expect(await adminRows(table, column, marker)).toEqual([]);
  });

  it('un member no cambia su rol ni el de otros', async () => {
    const own = await memberA.client
      .from('memberships')
      .update({ role: 'owner' })
      .eq('user_id', memberA.id)
      .select();
    expect(own.error?.code).toBe('42501');
    const other = await ownerA.client
      .from('memberships')
      .update({ role: 'member' })
      .eq('user_id', ownerA.id)
      .select();
    expect(other.error?.code).toBe('42501');
    expect(await adminRows('memberships', 'user_id', memberA.id)).toMatchObject([
      { role: 'member' },
    ]);
    expect(await adminRows('memberships', 'user_id', ownerA.id)).toMatchObject([{ role: 'owner' }]);
  });

  it('nadie inserta membresias (ni autoasignarse a otra organizacion)', async () => {
    const { error } = await ownerA.client
      .from('memberships')
      .insert({ organization_id: orgB, user_id: ownerA.id, role: 'owner' });
    expect(error?.code).toBe('42501');
    expect(await adminRows('memberships', 'user_id', ownerA.id)).toMatchObject([
      { organization_id: orgA },
    ]);
  });

  it('nadie crea organizaciones', async () => {
    const { error } = await ownerA.client.from('organizations').insert({ name: 'Org pirata' });
    expect(error?.code).toBe('42501');
  });

  it('un member no renombra su organizacion y un owner no renombra otra', async () => {
    const asMember = await memberA.client
      .from('organizations')
      .update({ name: 'Renombrada por member' })
      .eq('id', orgA)
      .select();
    expect(asMember.error).toBeNull();
    expect(asMember.data).toEqual([]);
    const foreign = await ownerA.client
      .from('organizations')
      .update({ name: 'Renombrada por ajeno' })
      .eq('id', orgB)
      .select();
    expect(foreign.error).toBeNull();
    expect(foreign.data).toEqual([]);
    const names = [
      ...(await adminRows('organizations', 'id', orgA)),
      ...(await adminRows('organizations', 'id', orgB)),
    ];
    expect(names.map((row) => row.name)).not.toContain('Renombrada por member');
    expect(names.map((row) => row.name)).not.toContain('Renombrada por ajeno');
  });

  it('un usuario no actualiza ni mueve datos de otra organizacion', async () => {
    const update = await ownerA.client
      .from('customers')
      .update({ name: 'Secuestrado' })
      .eq('id', customerB)
      .select();
    expect(update.error).toBeNull();
    expect(update.data).toEqual([]);
    const move = await ownerA.client
      .from('customers')
      .update({ organization_id: orgB })
      .eq('id', customerA)
      .select();
    expect(move.error?.code).toBe('42501');
    expect(await adminRows('customers', 'id', customerB)).toMatchObject([
      { name: 'Cliente Ficticio Beta' },
    ]);
    expect(await adminRows('customers', 'id', customerA)).toMatchObject([
      { organization_id: orgA },
    ]);
  });

  it('nadie borra datos (DELETE no existe para usuarios)', async () => {
    for (const [table, id] of [
      ['customers', customerA],
      ['technicians', technicianA],
    ] as const) {
      const { error } = await ownerA.client.from(table).delete().eq('id', id);
      expect(error?.code).toBe('42501');
      expect(await adminRows(table, 'id', id)).toHaveLength(1);
    }
  });
});

describe('operaciones permitidas', () => {
  it('owner y member crean y editan en su organizacion; owner renombra la organizacion', async () => {
    const created = await memberA.client
      .from('customers')
      .insert({ organization_id: orgA, name: 'Alta desde member' })
      .select('id')
      .single();
    expect(created.error).toBeNull();
    const edited = await ownerA.client
      .from('customers')
      .update({ notes: 'Nota de prueba' })
      .eq('id', created.data?.id)
      .select('id, notes');
    expect(edited.error).toBeNull();
    expect(edited.data).toHaveLength(1);

    const rename = await ownerA.client
      .from('organizations')
      .update({ name: 'Organizacion Alfa renombrada' })
      .eq('id', orgA)
      .select('id');
    expect(rename.error).toBeNull();
    expect(rename.data).toEqual([{ id: orgA }]);
  });

  it('archivar esta permitido y restaurar queda bloqueado (DH-06 pendiente)', async () => {
    const created = await ownerA.client
      .from('technicians')
      .insert({ organization_id: orgA, full_name: 'Tecnico para archivar' })
      .select('id')
      .single();
    expect(created.error).toBeNull();
    const id = created.data?.id as string;

    const archive = await memberA.client
      .from('technicians')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');
    expect(archive.error).toBeNull();
    expect(archive.data).toHaveLength(1);

    const restore = await ownerA.client
      .from('technicians')
      .update({ archived_at: null })
      .eq('id', id)
      .select('id');
    expect(restore.error).not.toBeNull();
    const [row] = await adminRows('technicians', 'id', id);
    expect(row.archived_at).not.toBeNull();
  });
});

describe('funciones auxiliares no expuestas', () => {
  it('no se pueden invocar por RPC (ni desde public ni desde private)', async () => {
    const inPublic = await ownerA.client.rpc('is_org_member', { org: orgA });
    expect(inPublic.error).not.toBeNull();
    expect(inPublic.data).toBeNull();
    const inPrivate = await ownerA.client.schema('private').rpc('is_org_member', { org: orgA });
    expect(inPrivate.error).not.toBeNull();
    expect(inPrivate.data).toBeNull();
    const asAnon = await anon
      .schema('private')
      .rpc('has_org_role', { org: orgA, required_role: 'owner' });
    expect(asAnon.error).not.toBeNull();
    expect(asAnon.data).toBeNull();
  });
});
