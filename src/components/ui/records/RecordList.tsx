import Link from 'next/link';

import { buildListHref, type ListParams } from '@/lib/records/params';
import type { RecordModule, RecordView } from '@/lib/records/types';

import { Badge } from '../Badge';
import { LinkButton } from '../LinkButton';
import { EmptyState } from '../EmptyState';
import { Table, Td, Th } from '../Table';

const NAME_LINK =
  'inline-flex min-h-10 items-center font-medium text-accent hover:underline focus-visible:underline';

export function StatusBadge({ archived }: Readonly<{ archived: boolean }>) {
  return archived ? <Badge tone="neutral">Archivado</Badge> : <Badge tone="success">Activo</Badge>;
}

/**
 * Listado de registros: tabla desde 1024 px y tarjetas en móvil (sin scroll horizontal de
 * página). Incluye los estados vacíos: sin registros (CTA de alta) y sin coincidencias.
 */
export function RecordList({
  module,
  items,
  params,
}: Readonly<{ module: RecordModule; items: readonly RecordView[]; params: ListParams }>) {
  if (items.length === 0) {
    const filtered = params.q !== '' || params.status !== 'activos';
    if (filtered) {
      return (
        <EmptyState
          headingLevel="h2"
          title={`No hay ${module.plural} que coincidan`}
          action={
            <LinkButton href={buildListHref(module.basePath, {})} variant="secondary">
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
        headingLevel="h2"
        title={`Todavía no hay ${module.plural} activos`}
        action={
          <LinkButton href={`${module.basePath}/new`}>Crear el primer {module.singular}</LinkButton>
        }
      >
        Cuando crees un {module.singular} aparecerá aquí con sus datos de contacto.
      </EmptyState>
    );
  }

  const href = (id: string) => `${module.basePath}/${id}`;
  const caption = `Listado de ${module.plural}`;

  return (
    <>
      <div className="hidden lg:block">
        <Table caption={caption}>
          <thead>
            <tr>
              <Th className="w-[34%] min-w-48">{module.nameLabel}</Th>
              <Th className="w-[40%]">Correo electrónico</Th>
              <Th className="w-px whitespace-nowrap">Teléfono</Th>
              <Th className="w-px whitespace-nowrap">Estado</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <Td>
                  <Link href={href(item.id)} className={NAME_LINK}>
                    {item.name}
                  </Link>
                </Td>
                <Td className="max-w-0">
                  <span className="block truncate" title={item.email ?? undefined}>
                    {item.email ?? '—'}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">{item.phone ?? '—'}</Td>
                <Td className="whitespace-nowrap">
                  <StatusBadge archived={item.archivedAt !== null} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <ul aria-label={caption} className="flex flex-col gap-3 lg:hidden">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <Link href={href(item.id)} className={`${NAME_LINK} [overflow-wrap:anywhere]`}>
                {item.name}
              </Link>
              <StatusBadge archived={item.archivedAt !== null} />
            </div>
            <p className="min-w-0 text-sm [overflow-wrap:anywhere] text-ink-muted">
              {item.email ?? 'Sin correo'}
            </p>
            <p className="text-sm whitespace-nowrap text-ink-muted">
              {item.phone ?? 'Sin teléfono'}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
