import Link from 'next/link';

import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';
import { Table, Td, Th } from '@/components/ui/Table';

import { formatQuantity } from '../constants';
import { hasActiveFilters, type InventoryListParams } from '../params';
import type { InventoryItemView } from '../service';

import { ItemStatusBadge } from './InventoryBadges';

const NAME_LINK =
  'inline-flex min-h-10 items-center font-medium text-accent hover:underline focus-visible:underline';

const href = (id: string) => `/inventory/${id}`;

/**
 * Listado de artículos: tabla desde 1024 px y tarjetas en móvil (sin scroll horizontal de página).
 * Incluye los estados vacíos: sin artículos (CTA de alta) y sin coincidencias.
 */
export function InventoryList({
  items,
  params,
}: Readonly<{ items: readonly InventoryItemView[]; params: InventoryListParams }>) {
  if (items.length === 0) {
    if (hasActiveFilters(params)) {
      return (
        <EmptyState
          title="No hay artículos que coincidan"
          action={
            <LinkButton href="/inventory" variant="secondary">
              Limpiar búsqueda y filtros
            </LinkButton>
          }
        >
          Prueba con otro término o cambia el filtro de estado.
        </EmptyState>
      );
    }
    return (
      <EmptyState
        title="Todavía no hay artículos"
        action={<LinkButton href="/inventory/new">Crear el primer artículo</LinkButton>}
      >
        Da de alta un artículo y registra su primera entrada para empezar a controlar existencias.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <Table caption="Listado de inventario">
          <thead>
            <tr>
              <Th className="w-px whitespace-nowrap">Referencia</Th>
              <Th className="w-[40%] min-w-48">Artículo</Th>
              <Th className="w-px text-right whitespace-nowrap">Saldo</Th>
              <Th className="w-px text-right whitespace-nowrap">Umbral</Th>
              <Th className="w-px whitespace-nowrap">Estado</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <Td className="font-mono whitespace-nowrap">{item.reference}</Td>
                <Td className="max-w-0">
                  <Link href={href(item.id)} className={`${NAME_LINK} max-w-full truncate`}>
                    {item.name}
                  </Link>
                </Td>
                <Td className="text-right font-semibold whitespace-nowrap tabular-nums">
                  {formatQuantity(item.quantity)}{' '}
                  <span className="font-normal text-ink-muted">{item.unit}</span>
                </Td>
                <Td className="text-right whitespace-nowrap text-ink-muted tabular-nums">
                  {item.threshold > 0 ? formatQuantity(item.threshold) : '—'}
                </Td>
                <Td className="whitespace-nowrap">
                  <ItemStatusBadge status={item.status} archived={item.archivedAt !== null} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <ul aria-label="Listado de inventario" className="flex flex-col gap-3 lg:hidden">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <Link href={href(item.id)} className={`${NAME_LINK} min-w-0 break-words`}>
                {item.name}
              </Link>
              <ItemStatusBadge status={item.status} archived={item.archivedAt !== null} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
              <span className="font-mono">{item.reference}</span>
              <span className="font-semibold text-ink tabular-nums">
                {formatQuantity(item.quantity)} {item.unit}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
