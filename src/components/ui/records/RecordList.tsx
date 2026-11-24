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
              <Th>{module.nameLabel}</Th>
              <Th>Correo electrónico</Th>
              <Th>Teléfono</Th>
              <Th>Estado</Th>
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
                <Td className="break-all">{item.email ?? '—'}</Td>
                <Td>{item.phone ?? '—'}</Td>
                <Td>
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
              <Link href={href(item.id)} className={`${NAME_LINK} break-words`}>
                {item.name}
              </Link>
              <StatusBadge archived={item.archivedAt !== null} />
            </div>
            <p className="text-sm break-all text-ink-muted">{item.email ?? 'Sin correo'}</p>
            <p className="text-sm text-ink-muted">{item.phone ?? 'Sin teléfono'}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
