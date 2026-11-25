import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';

import { QUOTE_STATUSES, STATUS_LABEL } from '../constants';
import { hasActiveFilters, type QuoteListParams } from '../params';
import type { CustomerOption } from '../service';

/** Búsqueda y filtros por GET: sin JavaScript, URL compartible y la página se reinicia al filtrar. */
export function QuoteFilters({
  params,
  customers,
}: Readonly<{ params: QuoteListParams; customers: readonly CustomerOption[] }>) {
  return (
    <form action="/quotes" method="get" role="search" aria-label="Buscar y filtrar presupuestos">
      <div className="grid gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Field
            label="Buscar por número, título, descripción o cliente"
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
          options={QUOTE_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }))}
        />
        <Select
          label="Cliente"
          name="cliente"
          placeholder="Todos"
          defaultValue={params.customer ?? ''}
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
        />
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Filtrar</Button>
          {hasActiveFilters(params) ? (
            <Link
              href="/quotes"
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
