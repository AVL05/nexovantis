import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { CollapsibleFilters } from '@/components/ui/CollapsibleFilters';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';

import { QUOTE_STATUSES, STATUS_LABEL } from '../constants';
import { buildQuotesHref, hasActiveFilters, type QuoteListParams } from '../params';
import type { CustomerOption } from '../service';

/** Búsqueda y filtros por GET: sin JavaScript, URL compartible y la página se reinicia al filtrar. */
export function QuoteFilters({
  params,
  customers,
}: Readonly<{ params: QuoteListParams; customers: readonly CustomerOption[] }>) {
  const activeCount = [params.status, params.customer].filter(Boolean).length;
  return (
    // La clave reinicia los campos no controlados al cambiar los filtros por enlace ("Limpiar").
    <form
      key={buildQuotesHref('', { ...params, page: 1 })}
      action="/quotes"
      method="get"
      role="search"
      aria-label="Buscar y filtrar presupuestos"
    >
      <CollapsibleFilters
        activeCount={activeCount}
        search={
          <Field
            label="Buscar por número, título, descripción o cliente"
            name="q"
            type="search"
            maxLength={100}
            autoComplete="off"
            defaultValue={params.q}
          />
        }
        actions={
          <>
            <Button type="submit">Filtrar</Button>
            {hasActiveFilters(params) ? (
              <Link
                href="/quotes"
                className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-accent hover:underline"
              >
                Limpiar filtros
              </Link>
            ) : null}
          </>
        }
      >
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
      </CollapsibleFilters>
    </form>
  );
}
