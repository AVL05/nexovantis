import type { Metadata } from 'next';

import { LogoutButton } from '@/features/auth/LogoutButton';
import { requireMembership } from '@/features/auth/session';

export const metadata: Metadata = { title: 'Panel · Nexovantis' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL = { owner: 'Propietario', member: 'Miembro' } as const;

export default async function DashboardPage() {
  // Identidad, organizacion y rol salen del servidor (Auth + memberships bajo RLS).
  const { user, membership } = await requireMembership();

  if (!membership) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight">Panel</h1>
        <section data-testid="access-denied" className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Acceso denegado</h2>
          <p>
            Tu cuenta no pertenece a ninguna organización. Solicita acceso a un administrador de tu
            organización.
          </p>
        </section>
        <LogoutButton />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Panel</h1>
      <p className="text-sm opacity-80">Sesión iniciada como {user.email}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="font-medium">Organización</dt>
        <dd data-testid="org-name">{membership.organizationName}</dd>
        <dt className="font-medium">Rol</dt>
        <dd data-testid="user-role">{ROLE_LABEL[membership.role]}</dd>
      </dl>
      <LogoutButton />
    </main>
  );
}
