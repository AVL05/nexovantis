'use client';

import { useId, useState, type ReactNode } from 'react';

import { Button } from './Button';
import { cn } from './cn';

/**
 * Rejilla de un formulario de filtros por GET. Por debajo de 768 px los filtros se pliegan tras un
 * botón (`aria-expanded`/`aria-controls`) que indica cuántos hay activos; la búsqueda y las acciones
 * quedan siempre a la vista. Desde 768 px (`md`) se muestran siempre. Los campos plegados siguen en
 * el formulario y se envían igual. Sin JavaScript (`scripting: none`) no se pliega nada.
 */
export function CollapsibleFilters({
  activeCount,
  forceOpen = false,
  search,
  actions,
  children,
}: Readonly<{
  /** Filtros aplicados entre los plegables (la búsqueda no cuenta: siempre está visible). */
  activeCount: number;
  /** Abre el panel (p. ej. con un error en uno de sus campos) mientras el usuario no lo cierre. */
  forceOpen?: boolean;
  /** Campo siempre visible. */
  search?: ReactNode;
  /** Botón de envío y enlaces; siempre visibles. */
  actions: ReactNode;
  /** Campos plegables. */
  children: ReactNode;
}>) {
  const panelId = useId();
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? forceOpen;
  const count =
    activeCount > 0 ? ` (${activeCount} ${activeCount === 1 ? 'activo' : 'activos'})` : '';

  return (
    <div className="grid grid-cols-1 gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
      {search ? <div className="min-w-0 sm:col-span-2">{search}</div> : null}
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setChoice(!open)}
        className="sm:col-span-2 sm:self-end md:hidden noscript:hidden"
      >
        Filtros{count}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={cn('size-4', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </Button>
      <div
        id={panelId}
        className={cn(
          'grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2 md:contents',
          !open && 'max-md:hidden max-md:noscript:grid',
        )}
      >
        {children}
      </div>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">{actions}</div>
    </div>
  );
}
