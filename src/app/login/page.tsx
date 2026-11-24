import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BrandName } from '@/components/shell/BrandMark';
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
    <main className="grid min-h-dvh md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="on-dark hidden flex-col justify-between bg-nav p-10 text-nav-text md:flex">
        <BrandName onDark />
        <div className="flex max-w-sm flex-col gap-3">
          <p className="text-2xl font-semibold tracking-tight text-white">
            Cada orden, cliente y técnico en un mismo sitio.
          </p>
          <p className="text-sm">
            Operaciones de servicio técnico para equipos pequeños que no quieren perder el hilo.
          </p>
        </div>
        <p className="text-xs text-nav-muted">Acceso solo para equipos con cuenta.</p>
      </aside>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="md:hidden">
            <BrandName />
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
            <p className="text-sm text-ink-muted">Accede con la cuenta de tu organización.</p>
          </div>
          <LoginForm next={safeNextPath(next)} />
        </div>
      </div>
    </main>
  );
}
