'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/components/ui/cn';

import { BrandName } from './BrandMark';

const NAV_ID = 'app-nav';

/**
 * Marco responsive: sidebar fija en escritorio; en móvil, panel desplegable con
 * aria-expanded/aria-controls, cierre con Escape y devolución del foco al botón.
 * Los slots llegan ya renderizados desde el servidor.
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

  const close = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
          'on-dark fixed inset-y-0 left-0 z-40 flex w-72 flex-col gap-6 bg-nav px-3 py-4 transition-[transform,visibility] duration-200 ease-out md:visible md:w-64 md:translate-x-0',
          open ? 'visible translate-x-0 shadow-pop' : 'invisible -translate-x-full',
        )}
      >
        <div className="px-3 py-1">
          <BrandName onDark />
        </div>
        <nav aria-label="Principal">{nav}</nav>
      </div>

      <div className="flex min-h-dvh flex-col md:pl-64">
        <header className="sticky top-0 z-20 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4 py-2 md:px-8">
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls={NAV_ID}
            onClick={() => (open ? close() : setOpen(true))}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 text-sm font-medium md:hidden"
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
            Menú
          </button>
          <div className="md:hidden">
            <BrandName />
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            {headerContext}
            {headerActions}
          </div>
        </header>
        <main
          id="contenido"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 outline-none md:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
