import Link from 'next/link';

import type { ReactNode } from 'react';

/** Cabecera de página: un único h1, descripción opcional y acciones (una primaria por vista). */
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel,
}: Readonly<{
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}>) {
  return (
    <header className="flex flex-col gap-3">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex min-h-10 w-fit items-center text-sm font-medium text-accent hover:underline"
        >
          ← {backLabel ?? 'Volver'}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
            {title}
          </h1>
          {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
