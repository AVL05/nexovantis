import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';

import {
  ACTION_FILTER_LABEL,
  ACTIVITY_ACTIONS,
  ACTIVITY_ENTITIES,
  ENTITY_LABEL,
  ENTITY_PARAM,
} from '../constants';
import { hasActiveFilters, isInvertedRange, type ActivityListParams } from '../params';

/**
 * Filtros por GET: sin JavaScript, URL compartible y la página se reinicia al filtrar. El rango de
 * fechas es de día natural en Europe/Madrid, con ambos extremos incluidos.
 */
export function ActivityFilters({ params }: Readonly<{ params: ActivityListParams }>) {
  const inverted = isInvertedRange(params);
  return (
    <form action="/activity" method="get" role="search" aria-label="Filtrar actividad">
      <div className="grid gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Entidad"
          name="entidad"
          placeholder="Todas"
          defaultValue={params.entity ? ENTITY_PARAM[params.entity] : ''}
          options={ACTIVITY_ENTITIES.map((entity) => ({
            value: ENTITY_PARAM[entity],
            label: ENTITY_LABEL[entity],
          }))}
        />
        <Select
          label="Acción"
          name="accion"
          placeholder="Todas"
          defaultValue={params.action ?? ''}
          options={ACTIVITY_ACTIONS.map((action) => ({
            value: action,
            label: ACTION_FILTER_LABEL[action],
          }))}
        />
        <Field
          label="Desde"
          name="desde"
          type="date"
          min="2000-01-01"
          max="2100-12-31"
          defaultValue={params.from ?? ''}
          error={inverted ? 'La fecha inicial es posterior a la final.' : undefined}
        />
        <Field
          label="Hasta"
          name="hasta"
          type="date"
          min="2000-01-01"
          max="2100-12-31"
          defaultValue={params.to ?? ''}
          hint="Incluye el día completo (hora de Madrid)."
        />
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Filtrar</Button>
          {hasActiveFilters(params) ? (
            <Link
              href="/activity"
              className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-accent hover:underline"
            >
              Limpiar filtros
            </Link>
          ) : null}
        </div>
      </div>
      {inverted ? (
        <div className="pt-3">
          <Alert tone="warning">
            El rango de fechas es incoherente: la fecha inicial debe ser anterior o igual a la
            final.
          </Alert>
        </div>
      ) : null}
    </form>
  );
}
