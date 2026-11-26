import Link from 'next/link';

import { cn } from './cn';

const LINK =
  'inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-sunken';
const DISABLED =
  'inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md border border-line px-4 text-sm text-ink-subtle';

/**
 * Paginación por enlaces (funciona sin JavaScript). `hrefFor(page)` construye cada URL; el
 * estado actual se anuncia con aria-current en el texto "Página X de Y".
 */
export function Pagination({
  page,
  pageCount,
  total,
  hrefFor,
  noun,
}: Readonly<{
  page: number;
  pageCount: number;
  total: number;
  hrefFor: (page: number) => string;
  /** Plural en español para el resumen: "clientes". */
  noun: string;
}>) {
  return (
    <nav
      aria-label="Paginación"
      className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-ink-muted">
        <span aria-current="page">
          Página {page} de {pageCount}
        </span>{' '}
        · {total} {noun}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} rel="prev" className={cn(LINK)}>
            Anterior
          </Link>
        ) : (
          <span aria-disabled="true" className={DISABLED}>
            Anterior
          </span>
        )}
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} rel="next" className={cn(LINK)}>
            Siguiente
          </Link>
        ) : (
          <span aria-disabled="true" className={DISABLED}>
            Siguiente
          </span>
        )}
      </div>
    </nav>
  );
}
