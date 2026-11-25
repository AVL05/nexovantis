import Link from 'next/link';

import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';
import { Table, Td, Th } from '@/components/ui/Table';
import { formatDate } from '@/lib/records/format';

import { hasActiveFilters, type OrderListParams } from '../params';
import type { OrderView } from '../service';

import { OrderPriorityBadge, OrderStatusBadge } from './OrderBadges';

const TITLE_LINK =
  'inline-flex min-h-10 items-center font-medium text-accent hover:underline focus-visible:underline';

const href = (id: string) => `/orders/${id}`;

/**
 * Listado de órdenes: tabla desde 1024 px y tarjetas en móvil (sin scroll horizontal de página).
 * Incluye los estados vacíos: sin órdenes (CTA de alta) y sin coincidencias.
 */
export function OrderList({
  items,
  params,
}: Readonly<{ items: readonly OrderView[]; params: OrderListParams }>) {
  if (items.length === 0) {
    if (hasActiveFilters(params)) {
      return (
        <EmptyState
          title="No hay órdenes que coincidan"
          action={
            <LinkButton href="/orders" variant="secondary">
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
        title="Todavía no hay órdenes de servicio"
        action={<LinkButton href="/orders/new">Crear la primera orden</LinkButton>}
      >
        Cuando crees una orden aparecerá aquí con su cliente, técnico, fecha y estado.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <Table caption="Listado de órdenes de servicio">
          <thead>
            <tr>
              <Th className="w-[30%] min-w-48">Orden</Th>
              <Th className="w-[22%]">Cliente</Th>
              <Th className="w-[20%]">Técnico</Th>
              <Th className="w-px whitespace-nowrap">Fecha</Th>
              <Th className="w-px whitespace-nowrap">Prioridad</Th>
              <Th className="w-px whitespace-nowrap">Estado</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
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
                <Td className="max-w-0">
                  <span className="block truncate" title={item.technicianName ?? undefined}>
                    {item.technicianName ?? 'Sin asignar'}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">{formatDate(item.scheduledDate)}</Td>
                <Td className="whitespace-nowrap">
                  <OrderPriorityBadge priority={item.priority} />
                </Td>
                <Td className="whitespace-nowrap">
                  <OrderStatusBadge status={item.status} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <ul aria-label="Listado de órdenes de servicio" className="flex flex-col gap-3 lg:hidden">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <Link href={href(item.id)} className={`${TITLE_LINK} min-w-0 break-words`}>
                {item.title}
              </Link>
              <OrderStatusBadge status={item.status} />
            </div>
            <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">{item.customerName}</p>
            <p className="text-sm text-ink-muted">
              {item.technicianName ?? 'Sin técnico asignado'}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <span>{formatDate(item.scheduledDate)}</span>
              <OrderPriorityBadge priority={item.priority} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
