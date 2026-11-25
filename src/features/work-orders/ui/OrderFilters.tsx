import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';

import { ORDER_PRIORITIES, ORDER_STATUSES, PRIORITY_LABEL, STATUS_LABEL } from '../constants';
import { UNASSIGNED, hasActiveFilters, type OrderListParams } from '../params';
import type { PersonOption } from '../service';

/**
 * Búsqueda y filtros por GET: sin JavaScript, URL compartible y la página se reinicia al filtrar.
 */
export function OrderFilters({
  params,
  customers,
  technicians,
}: Readonly<{
  params: OrderListParams;
  customers: readonly PersonOption[];
  technicians: readonly PersonOption[];
}>) {
  return (
    <form action="/orders" method="get" role="search" aria-label="Buscar y filtrar órdenes">
      <div className="grid gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Field
            label="Buscar por título, descripción o cliente"
            name="q"
            type="search"
            maxLength={100}
            autoComplete="off"
            defaultValue={params.q}
          />
        </div>
        <Select
          label="Estado"
          name="estado"
          placeholder="Todos"
          defaultValue={params.status ?? ''}
          options={ORDER_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }))}
        />
        <Select
          label="Prioridad"
          name="prioridad"
          placeholder="Todas"
          defaultValue={params.priority ?? ''}
          options={ORDER_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] }))}
        />
        <Select
          label="Técnico"
          name="tecnico"
          placeholder="Todos"
          defaultValue={params.technician ?? ''}
          options={[
            { value: UNASSIGNED, label: 'Sin técnico asignado' },
            ...technicians.map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
        <Select
          label="Cliente"
          name="cliente"
          placeholder="Todos"
          defaultValue={params.customer ?? ''}
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Field label="Fecha desde" name="desde" type="date" defaultValue={params.from ?? ''} />
        <Field label="Fecha hasta" name="hasta" type="date" defaultValue={params.to ?? ''} />
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Filtrar</Button>
          {hasActiveFilters(params) ? (
            <Link
              href="/orders"
              className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-accent hover:underline"
            >
              Limpiar filtros
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  );
}
