import Link from 'next/link';

import { BrandName } from '@/components/shell/BrandMark';
import { Alert } from '@/components/ui/Alert';
import { formatDateTime } from '@/lib/records/format';

import { STATUS_LABEL } from '../constants';
import { formatCents, formatQuantity, formatQuoteNumber, formatTaxRate, sumLines } from '../money';
import type { QuoteItemView, QuoteView } from '../service';

import { PrintQuoteButton } from './PrintQuoteButton';

export function QuotePrintView({
  quote,
  items,
  organizationName,
}: Readonly<{
  quote: QuoteView;
  items: readonly QuoteItemView[] | null;
  organizationName: string;
}>) {
  const totals = sumLines(
    (items ?? []).map((item) => ({
      subtotal: BigInt(item.subtotalCents),
      tax: BigInt(item.taxCents),
    })),
  );
  const ready =
    items &&
    items.length > 0 &&
    totals.subtotal === BigInt(quote.subtotalCents) &&
    totals.tax === BigInt(quote.taxCents) &&
    totals.total === BigInt(quote.totalCents);

  return (
    <div className="quote-print-preview mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/quotes/${quote.id}`}
          className="inline-flex min-h-10 items-center text-sm font-medium text-accent hover:underline"
        >
          ← Volver al presupuesto
        </Link>
        {ready ? <PrintQuoteButton /> : null}
      </div>
      {ready ? (
        <article className="min-w-0 rounded-lg border border-line bg-surface p-5 sm:p-8 print:border-0 print:p-0">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
            <div>
              <BrandName />
              <p className="mt-2 text-sm font-medium">{organizationName}</p>
            </div>
            <div className="text-sm text-ink-muted">
              <p className="font-mono font-semibold text-ink">{formatQuoteNumber(quote.number)}</p>
              <p>{STATUS_LABEL[quote.status]}</p>
              <time dateTime={quote.createdAt}>{formatDateTime(quote.createdAt)}</time>
            </div>
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">{quote.title}</h1>
          <p className="mt-2 text-sm">
            <strong>Cliente</strong> {quote.customerName}
          </p>
          {quote.description ? (
            <p className="mt-3 text-sm whitespace-pre-wrap text-ink-muted">{quote.description}</p>
          ) : null}
          <div
            role="region"
            aria-label="Desplazamiento de conceptos"
            tabIndex={0}
            className="mt-6 overflow-x-auto print:overflow-visible"
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Conceptos del presupuesto</caption>
              <thead className="border-y border-line bg-sunken">
                <tr>
                  <th scope="col" className="px-2 py-2">
                    Concepto
                  </th>
                  <th scope="col" className="px-2 py-2 text-right">
                    Cantidad
                  </th>
                  <th scope="col" className="px-2 py-2 text-right">
                    Precio unitario
                  </th>
                  <th scope="col" className="px-2 py-2 text-right">
                    IVA
                  </th>
                  <th scope="col" className="px-2 py-2 text-right">
                    Importe con IVA
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line print:break-inside-avoid">
                    <th scope="row" className="px-2 py-2 font-medium wrap-anywhere">
                      {item.description}
                    </th>
                    <td className="px-2 py-2 text-right">{formatQuantity(item.quantity)}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {formatCents(item.unitPriceCents)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {formatTaxRate(item.taxRateBp)}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {formatCents(BigInt(item.subtotalCents) + BigInt(item.taxCents))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-6 ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm tabular-nums print:break-inside-avoid">
            <dt>Base imponible</dt>
            <dd className="text-right">{formatCents(totals.subtotal)}</dd>
            <dt>IVA</dt>
            <dd className="text-right">{formatCents(totals.tax)}</dd>
            <dt className="border-t border-line pt-2 font-semibold">Total con IVA</dt>
            <dd className="border-t border-line pt-2 text-right font-semibold">
              {formatCents(totals.total)}
            </dd>
          </dl>
        </article>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Versión imprimible</h1>
          <Alert tone="warning">
            {items?.length === 0
              ? 'Añade al menos un concepto antes de imprimir el presupuesto.'
              : 'No se pudo preparar el presupuesto completo. Recarga la página para reintentar.'}
          </Alert>
        </>
      )}
    </div>
  );
}
