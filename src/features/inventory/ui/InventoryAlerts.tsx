import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { cn } from '@/components/ui/cn';

import { buildInventoryHref } from '../params';

type Counts = { low: number; out: number; active: number } | null;

const TILE =
  'flex min-w-0 flex-col gap-0.5 rounded-lg border border-line border-l-4 bg-surface px-4 py-3 hover:bg-sunken';

/**
 * Indicadores de existencias de los artículos ACTIVOS: stock bajo y agotados, con enlace a su filtro.
 * Si no se pueden cargar se avisa (nunca se inventa una cifra).
 */
export function InventoryAlerts({ counts }: Readonly<{ counts: Counts }>) {
  if (!counts) {
    return <Alert tone="warning">No se pudieron cargar los indicadores de stock.</Alert>;
  }
  return (
    <section aria-label="Indicadores de existencias" className="grid gap-3 sm:grid-cols-3">
      <Link
        href={buildInventoryHref('/inventory', {})}
        className={cn(TILE, 'border-l-line-strong')}
        data-testid="inventory-active"
      >
        <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Artículos activos
        </span>
        <span className="text-2xl font-semibold tabular-nums">{counts.active}</span>
      </Link>
      <Link
        href={buildInventoryHref('/inventory', { status: 'bajo' })}
        className={cn(TILE, 'border-l-warning')}
        data-testid="inventory-low"
      >
        <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Stock bajo
        </span>
        <span className="text-2xl font-semibold tabular-nums">{counts.low}</span>
      </Link>
      <Link
        href={buildInventoryHref('/inventory', { status: 'agotado' })}
        className={cn(TILE, 'border-l-danger')}
        data-testid="inventory-out"
      >
        <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Agotados
        </span>
        <span className="text-2xl font-semibold tabular-nums">{counts.out}</span>
      </Link>
    </section>
  );
}
