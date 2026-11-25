import { formatCents } from '../money';

/**
 * Totales del presupuesto tal como los calcula PostgreSQL (suma de subtotales + suma del IVA de cada
 * línea, redondeo solo por línea). La interfaz nunca los recalcula al mostrarlos.
 */
export function QuoteTotals({
  subtotalCents,
  taxCents,
  totalCents,
}: Readonly<{ subtotalCents: number; taxCents: number; totalCents: number }>) {
  return (
    <dl
      aria-label="Totales del presupuesto"
      className="ml-auto flex w-full max-w-sm flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 text-sm"
    >
      <div className="flex justify-between gap-4">
        <dt className="text-ink-muted">Base imponible</dt>
        <dd className="tabular-nums" data-testid="quote-subtotal">
          {formatCents(subtotalCents)}
        </dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-ink-muted">IVA</dt>
        <dd className="tabular-nums" data-testid="quote-tax">
          {formatCents(taxCents)}
        </dd>
      </div>
      <div className="flex justify-between gap-4 border-t border-line pt-2 text-base font-semibold">
        <dt>Total</dt>
        <dd className="tabular-nums" data-testid="quote-total">
          {formatCents(totalCents)}
        </dd>
      </div>
    </dl>
  );
}
