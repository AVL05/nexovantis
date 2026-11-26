import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BrandMark, BrandName } from '@/components/shell/BrandMark';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { logoutAction } from '@/features/auth/actions';
import { getLocalSessionState } from '@/features/auth/local-session';
import { safeNextPath } from '@/features/auth/redirect';
import { DASHBOARD_PATH, LOGOUT_UNCONFIRMED_NOTICE } from '@/features/auth/routes';
import { hasValidSession } from '@/features/auth/session';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Iniciar sesión · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ next?: string | string[]; aviso?: string | string[] }> }>) {
  const { next, aviso } = await searchParams;
  const logoutUnconfirmed = aviso === LOGOUT_UNCONFIRMED_NOTICE;
  // Con el aviso se distingue el estado de las cookies de sesion de este navegador:
  // - presentes (doble fallo: Auth y borrado local): la sesion sigue viva; se avisa y se reintenta.
  // - ilegibles: no se puede afirmar ni negar el cierre local; se avisa de la incertidumbre y se
  //   ofrece reintentar (nunca se afirma que la sesion se cerro).
  // - ausentes: el cierre local se logro; aviso habitual.
  const localState = logoutUnconfirmed ? await getLocalSessionState() : 'absent';
  const sessionStillOpen = localState === 'present';
  const localUnknown = localState === 'unreadable';
  if (!sessionStillOpen && !localUnknown && (await hasValidSession())) redirect(DASHBOARD_PATH);
  const retryAvailable = sessionStillOpen || localUnknown;

  return (
    <main className="grid min-h-dvh md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="hidden flex-col gap-16 bg-nav px-8 py-9 text-nav-text md:flex lg:px-12">
        <BrandName onDark />
        <div className="flex flex-1 flex-col justify-center gap-5">
          <BrandMark className="-ml-3 size-28 lg:-ml-4 lg:size-36" />
          <p className="max-w-[16ch] text-4xl leading-[1.08] font-semibold tracking-[-0.045em] text-balance text-white lg:text-5xl">
            Cada intervención, en un mismo sitio.
          </p>
          <p className="max-w-[32ch] text-base leading-relaxed text-pretty">
            Planifica órdenes, coordina técnicos y controla el material de cada trabajo.
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="border-b border-line bg-surface px-5 py-4 md:hidden">
          <BrandName />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 py-8 sm:px-6 md:items-center md:py-12">
          <div className="flex w-full max-w-md flex-col gap-7 rounded-[1.5rem] border border-line bg-surface p-5 shadow-card sm:p-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {retryAvailable ? 'Sesión sin cerrar' : 'Iniciar sesión'}
              </h1>
              <p className="text-base text-ink-muted">
                {sessionStillOpen
                  ? 'Tu cuenta sigue abierta en este navegador.'
                  : localUnknown
                    ? 'No podemos confirmar si tu cuenta sigue abierta en este navegador.'
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
            ) : localUnknown ? (
              <Alert
                tone="danger"
                title="No se pudo confirmar el cierre de tu sesión"
                data-testid="logout-unknown-notice"
              >
                No se pudo comprobar si tu sesión sigue abierta en este navegador. Inténtalo de
                nuevo; si el problema continúa, cierra el navegador y avisa a quien administra tu
                organización, sobre todo si usas un equipo compartido.
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
            {retryAvailable ? (
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
