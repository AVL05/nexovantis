import Link from 'next/link';

import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';
import { Table, Td, Th } from '@/components/ui/Table';
import { formatDate } from '@/lib/records/format';

import { formatCents, formatQuoteNumber } from '../money';
import { hasActiveFilters, type QuoteListParams } from '../params';
import type { QuoteView } from '../service';

import { QuoteStatusBadge } from './QuoteBadges';

const TITLE_LINK =
  'inline-flex min-h-10 items-center font-medium text-accent hover:underline focus-visible:underline';

const href = (id: string) => `/quotes/${id}`;
const day = (iso: string) => formatDate(iso.slice(0, 10));

/**
 * Listado de presupuestos: tabla desde 1024 px y tarjetas en móvil (sin scroll horizontal de página).
 * Incluye los estados vacíos: sin presupuestos (CTA de alta) y sin coincidencias.
 */
export function QuoteList({
  items,
  params,
}: Readonly<{ items: readonly QuoteView[]; params: QuoteListParams }>) {
  if (items.length === 0) {
    if (hasActiveFilters(params)) {
      return (
        <EmptyState
          headingLevel="h2"
          title="No hay presupuestos que coincidan"
          action={
            <LinkButton href="/quotes" variant="secondary">
              Limpiar búsqueda y filtros
            </LinkButton>
          }
        >
          Prueba con otro término o cambia los filtros.
        </EmptyState>
      );
    }
    return (
      <EmptyState
        headingLevel="h2"
        title="Todavía no hay presupuestos"
        action={<LinkButton href="/quotes/new">Crear el primer presupuesto</LinkButton>}
      >
        Cuando crees un presupuesto aparecerá aquí con su cliente, importe y estado.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <Table caption="Listado de presupuestos">
          <thead>
            <tr>
              <Th className="w-px whitespace-nowrap">Número</Th>
              <Th className="w-[34%] min-w-48">Presupuesto</Th>
              <Th className="w-[26%]">Cliente</Th>
              <Th className="w-px text-right whitespace-nowrap">Total</Th>
              <Th className="w-px whitespace-nowrap">Fecha</Th>
              <Th className="w-px whitespace-nowrap">Estado</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <Td className="font-mono whitespace-nowrap">{formatQuoteNumber(item.number)}</Td>
                <Td className="max-w-0">
                  <Link href={href(item.id)} className={`${TITLE_LINK} max-w-full truncate`}>
                    {item.title}
                  </Link>
                </Td>
                <Td className="max-w-0">
                  <span className="block truncate" title={item.customerName}>
                    {item.customerName}
                  </span>
                </Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  {formatCents(item.totalCents)}
                </Td>
                <Td className="whitespace-nowrap">{day(item.createdAt)}</Td>
                <Td className="whitespace-nowrap">
                  <QuoteStatusBadge status={item.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <ul aria-label="Listado de presupuestos" className="flex flex-col gap-3 lg:hidden">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <Link
                href={href(item.id)}
                className={`${TITLE_LINK} min-w-0 [overflow-wrap:anywhere]`}
              >
                {item.title}
              </Link>
              <QuoteStatusBadge status={item.status} />
            </div>
            <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">{item.customerName}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
              <span className="font-mono">{formatQuoteNumber(item.number)}</span>
              <span>{day(item.createdAt)}</span>
              <span className="font-semibold text-ink tabular-nums">
                {formatCents(item.totalCents)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
