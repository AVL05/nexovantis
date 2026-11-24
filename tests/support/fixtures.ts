import type { TestDb } from './pglite';

// Datos sinteticos reproducibles: dos organizaciones con owner, member, un cliente y un tecnico
// cada una. UUID fijos, emails @example.test y nombres ficticios. Sin contrasenas.

export const SEED = {
  orgA: 'aaaaaaaa-0000-4000-8000-000000000001',
  orgB: 'bbbbbbbb-0000-4000-8000-000000000001',
  ownerA: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  memberA: 'aaaaaaaa-0000-4000-8000-0000000000a2',
  ownerB: 'bbbbbbbb-0000-4000-8000-0000000000b1',
  memberB: 'bbbbbbbb-0000-4000-8000-0000000000b2',
  customerA: 'aaaaaaaa-0000-4000-8000-0000000000c1',
  customerB: 'bbbbbbbb-0000-4000-8000-0000000000c1',
  technicianA: 'aaaaaaaa-0000-4000-8000-0000000000d1',
  technicianB: 'bbbbbbbb-0000-4000-8000-0000000000d1',
} as const;

export type SeedIds = { -readonly [K in keyof typeof SEED]: string };

export async function seedTwoOrgs(db: TestDb): Promise<SeedIds> {
  await db.asSuperuser(async (tx) => {
    await tx.query(
      `insert into public.organizations (id, name) values ($1, 'Organizacion Alfa'), ($2, 'Organizacion Beta')`,
      [SEED.orgA, SEED.orgB],
    );
    await tx.query(
      `insert into auth.users (id, email) values
         ($1, 'owner.a@example.test'), ($2, 'member.a@example.test'),
         ($3, 'owner.b@example.test'), ($4, 'member.b@example.test')`,
      [SEED.ownerA, SEED.memberA, SEED.ownerB, SEED.memberB],
    );
    await tx.query(
      `insert into public.memberships (organization_id, user_id, role) values
         ($1, $3, 'owner'), ($1, $4, 'member'), ($2, $5, 'owner'), ($2, $6, 'member')`,
      [SEED.orgA, SEED.orgB, SEED.ownerA, SEED.memberA, SEED.ownerB, SEED.memberB],
    );
    await tx.query(
      `insert into public.customers (id, organization_id, name, email) values
         ($1, $2, 'Cliente Ficticio Alfa', 'cliente.a@example.test'),
         ($3, $4, 'Cliente Ficticio Beta', 'cliente.b@example.test')`,
      [SEED.customerA, SEED.orgA, SEED.customerB, SEED.orgB],
    );
    await tx.query(
      `insert into public.technicians (id, organization_id, full_name, email) values
         ($1, $2, 'Tecnico Ficticio Alfa', 'tecnico.a@example.test'),
         ($3, $4, 'Tecnico Ficticio Beta', 'tecnico.b@example.test')`,
      [SEED.technicianA, SEED.orgA, SEED.technicianB, SEED.orgB],
    );
  });
  return { ...SEED };
}
