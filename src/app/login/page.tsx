import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BrandMark, BrandName } from '@/components/shell/BrandMark';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { logoutAction } from '@/features/auth/actions';
import { hasLocalSessionCookies } from '@/features/auth/local-session';
import { safeNextPath } from '@/features/auth/redirect';
import { DASHBOARD_PATH, LOGOUT_UNCONFIRMED_NOTICE } from '@/features/auth/routes';
import { hasValidSession } from '@/features/auth/session';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Iniciar sesión · Nexovantis' };
export const dynamic = 'force-dynamic';

/** Retícula de plano técnico: líneas finas y marcas de cota. Decorativa, sin recursos externos. */
function BlueprintGrid({ id }: Readonly<{ id: string }>) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-0 size-full text-nav-focus"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id={`${id}-fine`} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="currentColor" strokeOpacity="0.07" />
        </pattern>
        <pattern id={`${id}-coarse`} width="120" height="120" patternUnits="userSpaceOnUse">
          <path d="M120 0H0V120" fill="none" stroke="currentColor" strokeOpacity="0.14" />
          <path d="M0 0l6 6M0 6l6-6" stroke="currentColor" strokeOpacity="0.3" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}-fine)`} />
      <rect width="100%" height="100%" fill={`url(#${id}-coarse)`} />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ next?: string | string[]; aviso?: string | string[] }> }>) {
  const { next, aviso } = await searchParams;
  const logoutUnconfirmed = aviso === LOGOUT_UNCONFIRMED_NOTICE;
  // Doble fallo al cerrar sesion (Auth y borrado local): la sesion sigue viva en este navegador.
  // No se redirige al panel: se avisa de que NO se cerro y se ofrece reintentar.
  const sessionStillOpen = logoutUnconfirmed && (await hasLocalSessionCookies());
  if (!sessionStillOpen && (await hasValidSession())) redirect(DASHBOARD_PATH);

  return (
    <main className="grid min-h-dvh overflow-x-clip md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="on-dark relative hidden flex-col justify-between overflow-hidden bg-nav p-12 text-nav-text md:flex">
        <BlueprintGrid id="bp-side" />
        <div className="relative">
          <BrandName onDark />
        </div>
        <div className="relative flex max-w-md flex-col gap-4">
          <BrandMark className="mb-4 size-16 rounded-[14px] ring-1 ring-nav-active" />
          <p className="text-3xl leading-tight font-semibold tracking-tight text-balance text-white">
            Cada orden, cliente y técnico en un mismo sitio.
          </p>
          <p className="text-base text-pretty">
            Operaciones de servicio técnico para equipos pequeños que no quieren perder el hilo.
          </p>
        </div>
        <p className="relative border-t border-nav-active pt-4 text-xs text-nav-muted">
          Acceso solo para equipos con cuenta.
        </p>
      </aside>
      <div className="flex flex-col">
        <div className="on-dark relative overflow-hidden bg-nav px-6 py-5 md:hidden">
          <BlueprintGrid id="bp-top" />
          <div className="relative">
            <BrandName onDark />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 md:py-12">
          <div className="flex w-full max-w-sm flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {sessionStillOpen ? 'Sesión sin cerrar' : 'Iniciar sesión'}
              </h1>
              <p className="text-base text-ink-muted">
                {sessionStillOpen
                  ? 'Tu cuenta sigue abierta en este navegador.'
                  : 'Accede con la cuenta de tu organización.'}
              </p>
            </div>
            {sessionStillOpen ? (
              <Alert
                tone="danger"
                title="No se pudo cerrar tu sesión"
                data-testid="logout-failed-notice"
              >
                Tu sesión sigue abierta en este navegador. Inténtalo de nuevo; si el problema
                continúa, cierra el navegador y avisa a quien administra tu organización, sobre todo
                si usas un equipo compartido.
              </Alert>
            ) : logoutUnconfirmed ? (
              <Alert
                tone="warning"
                title="No se pudo confirmar el cierre de sesión en el servidor"
                data-testid="logout-notice"
              >
                Tu sesión se cerró en este navegador. Si alguien copió tu sesión antes, podría
                seguir siendo válida hasta que caduque. Si usas un equipo compartido o sospechas de
                un acceso ajeno, avisa a quien administra tu organización.
              </Alert>
            ) : null}
            {sessionStillOpen ? (
              <form action={logoutAction}>
                <Button type="submit" size="lg" className="w-full" data-testid="logout-retry">
                  Reintentar cierre de sesión
                </Button>
              </form>
            ) : (
              <LoginForm next={safeNextPath(next)} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
