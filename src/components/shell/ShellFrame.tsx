'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/components/ui/cn';

import { BrandMark, BrandName } from './BrandMark';

const NAV_ID = 'app-nav';
const DESKTOP_QUERY = '(min-width: 768px)';

/**
 * Marco responsive: sidebar fija en escritorio; en móvil, panel desplegable con
 * aria-expanded/aria-controls, cierre con Escape y devolución del foco al botón.
 * El panel se cierra al cambiar de ruta, al pulsar un enlace (también el de la ruta actual) y
 * al cruzar a escritorio. Mientras está abierto en móvil, el resto queda inerte y el body sin
 * scroll; en escritorio no hay capa ni bloqueo. Los slots llegan ya renderizados del servidor.
 */
export function ShellFrame({
  nav,
  headerContext,
  headerActions,
  children,
}: Readonly<{
  nav: ReactNode;
  headerContext?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  // Cierre al cambiar de ruta o de query (ajuste de estado durante el render).
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? '';
  const routeKey = `${pathname ?? ''}?${search}`;
  const [lastRoute, setLastRoute] = useState(routeKey);
  if (lastRoute !== routeKey) {
    setLastRoute(routeKey);
    if (open) setOpen(false);
  }

  const close = useCallback(() => {
    restoreFocus.current = true;
    setOpen(false);
  }, []);

  // Devuelve el foco al botón cuando el cierre lo pidió el usuario (tras retirar el inert).
  useEffect(() => {
    if (!open && restoreFocus.current) {
      restoreFocus.current = false;
      toggleRef.current?.focus();
    }
  }, [open]);

  // Abierto: Escape, contenido inerte y body sin scroll. Cierra al pasar a escritorio.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    const content = contentRef.current;
    content?.setAttribute('inert', '');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const media = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null;
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    media?.addEventListener('change', onChange);

    return () => {
      document.removeEventListener('keydown', onKey);
      content?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      media?.removeEventListener('change', onChange);
    };
  }, [open, close]);

  return (
    <div className="min-h-dvh">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-pop"
      >
        Saltar al contenido
      </a>

      {open ? (
        <div
          aria-hidden="true"
          onClick={close}
          className="fixed inset-0 z-30 bg-nav/50 md:hidden"
        />
      ) : null}

      <div
        id={NAV_ID}
        className={cn(
          'on-dark fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col gap-6 bg-nav px-3 py-4 transition-[transform,visibility] duration-200 ease-out md:visible md:w-64 md:translate-x-0',
          open ? 'visible translate-x-0 shadow-pop' : 'invisible -translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-1">
          <BrandName onDark />
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar panel"
            className="-mr-2 inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-nav-text hover:bg-nav-active hover:text-white md:hidden"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <nav
          aria-label="Principal"
          onClick={(event) => {
            if ((event.target as Element).closest('a')) close();
          }}
        >
          {nav}
        </nav>
      </div>

      <div ref={contentRef} className="flex min-h-dvh flex-col md:pl-64">
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-line bg-surface px-3 py-2 sm:gap-3 sm:px-4 md:px-8">
          <button
            ref={toggleRef}
            type="button"
            aria-label="Menú"
            aria-expanded={open}
            aria-controls={NAV_ID}
            onClick={() => (open ? close() : setOpen(true))}
            className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line-strong md:hidden"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
          <div className="flex shrink-0 items-center gap-2 md:hidden">
            <BrandMark />
            <span className="hidden text-base font-semibold tracking-tight sm:inline">
              Nexovantis
            </span>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            {headerContext}
            <div className="shrink-0">{headerActions}</div>
          </div>
        </header>
        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 outline-none sm:py-8 md:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
