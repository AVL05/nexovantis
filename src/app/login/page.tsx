import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { safeNextPath } from '@/features/auth/redirect';
import { DASHBOARD_PATH } from '@/features/auth/routes';
import { hasValidSession } from '@/features/auth/session';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Iniciar sesión · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ next?: string | string[] }> }>) {
  if (await hasValidSession()) redirect(DASHBOARD_PATH);

  const { next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Iniciar sesión</h1>
      <LoginForm next={safeNextPath(next)} />
    </main>
  );
}
