import 'server-only';

import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/shell/AppShell';
import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/LinkButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { ArchiveControl } from '@/components/ui/records/ArchiveControl';
import { HistoryList } from '@/components/ui/records/HistoryList';
import { RecordDetails } from '@/components/ui/records/RecordDetails';
import { RecordForm } from '@/components/ui/records/RecordForm';
import { RecordList, StatusBadge } from '@/components/ui/records/RecordList';
import { SearchBar } from '@/components/ui/SearchBar';
import { SegmentedLinks } from '@/components/ui/SegmentedLinks';
import { listEntityHistory, type ActivityEntityType } from '@/features/activity/service';
import { DASHBOARD_PATH } from '@/features/auth/routes';
import { LogoutButton } from '@/features/auth/LogoutButton';
import { requireMembership } from '@/features/auth/session';
import { NAV_ITEMS } from '@/features/navigation/items';

import { buildListHref, parseListParams, STATUS_FILTERS, type StatusFilter } from './params';
import type { RecordService } from './service';
import { requireTenant } from './tenant';
import type { ArchiveState, FormState, RecordModule } from './types';

// Composición de las páginas de Clientes y Técnicos (Server Components). Las rutas de src/app
// son envoltorios de una línea sobre estas funciones.

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ROLE_LABEL = { owner: 'Propietario', member: 'Miembro' } as const;
const STATUS_LABEL: Record<StatusFilter, string> = {
  activos: 'Activos',
  archivados: 'Archivados',
  todos: 'Todos',
};
const NOTICES: Record<string, string> = {
  creado: 'Registro creado correctamente.',
  actualizado: 'Cambios guardados correctamente.',
};

/** Layout de módulo: shell autenticado con organización y rol. Sin membresía, al panel. */
export async function RecordModuleLayout({
  navKey,
  children,
}: Readonly<{ navKey: string; children: ReactNode }>) {
  const { membership } = await requireMembership();
  if (!membership) redirect(DASHBOARD_PATH);
  return (
    <AppShell
      items={NAV_ITEMS}
      current={navKey}
      organizationName={membership.organizationName}
      roleLabel={ROLE_LABEL[membership.role]}
      actions={<LogoutButton />}
    >
      {children}
    </AppShell>
  );
}

export async function RecordListPage({
  module,
  service,
  searchParams,
}: Readonly<{ module: RecordModule; service: RecordService; searchParams: SearchParams }>) {
  const params = parseListParams(await searchParams);
  const ctx = await requireTenant();
  const result = await service.list(ctx, params);
  // Los detalles internos no llegan a la UI: error.tsx muestra un mensaje genérico con reintento.
  if (!result.ok) throw new Error('No se pudo cargar el listado.');
  const { items, total, page, pageCount } = result.data;
  const title = module.plural.charAt(0).toUpperCase() + module.plural.slice(1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={`Gestiona los ${module.plural} de tu organización.`}
        actions={<LinkButton href={`${module.basePath}/new`}>Nuevo {module.singular}</LinkButton>}
      />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="lg:w-full lg:max-w-md">
          <SearchBar
            action={module.basePath}
            label={`Buscar ${module.plural} por nombre, correo o teléfono`}
            defaultValue={params.q}
            hidden={params.status === 'activos' ? undefined : { estado: params.status }}
            clearHref={buildListHref(module.basePath, { status: params.status })}
          />
        </div>
        <SegmentedLinks
          label="Filtrar por estado"
          items={STATUS_FILTERS.map((status) => ({
            label: STATUS_LABEL[status],
            href: buildListHref(module.basePath, { q: params.q, status }),
            current: params.status === status,
          }))}
        />
      </div>
      <RecordList module={module} items={items} params={params} />
      {total > 0 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          noun={module.plural}
          hrefFor={(target) => buildListHref(module.basePath, { ...params, page: target })}
        />
      ) : null}
    </div>
  );
}

export function RecordNewPage({
  module,
  action,
}: Readonly<{
  module: RecordModule;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}>) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Nuevo ${module.singular}`}
        backHref={module.basePath}
        backLabel={`Volver a ${module.plural}`}
      />
      <RecordForm
        module={module}
        action={action}
        initial={{}}
        submitLabel={`Crear ${module.singular}`}
        cancelHref={module.basePath}
      />
    </div>
  );
}

export async function RecordDetailPage({
  module,
  service,
  entityType,
  id,
  searchParams,
  archiveAction,
  restoreAction,
}: Readonly<{
  module: RecordModule;
  service: RecordService;
  entityType: ActivityEntityType;
  id: string;
  searchParams: SearchParams;
  archiveAction: (prev: ArchiveState, formData: FormData) => Promise<ArchiveState>;
  restoreAction: (prev: ArchiveState, formData: FormData) => Promise<ArchiveState>;
}>) {
  const ctx = await requireTenant();
  const found = await service.get(ctx, id);
  if (!found.ok) {
    if (found.kind === 'not_found') notFound();
    throw new Error('No se pudo cargar el registro.');
  }
  const record = found.data;
  const history = await listEntityHistory(ctx, entityType, record.id);
  const rawNotice = (await searchParams).aviso;
  const notice = typeof rawNotice === 'string' ? NOTICES[rawNotice] : undefined;
  const archived = record.archivedAt !== null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={record.name}
        description={<StatusBadge archived={archived} />}
        backHref={module.basePath}
        backLabel={`Volver a ${module.plural}`}
        actions={
          archived ? null : (
            <LinkButton href={`${module.basePath}/${record.id}/edit`} variant="secondary">
              Editar
            </LinkButton>
          )
        }
      />
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {archived ? (
        <Alert tone="info" title="Registro archivado">
          No se puede editar mientras esté archivado. Restáuralo para volver a modificarlo.
        </Alert>
      ) : null}
      <div className="grid items-start gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <RecordDetails module={module} record={record} />
          <ArchiveControl
            module={module}
            recordId={record.id}
            recordName={record.name}
            archived={archived}
            archiveAction={archiveAction}
            restoreAction={restoreAction}
          />
        </div>
        <section aria-labelledby="historial" className="flex min-w-0 flex-col gap-3">
          <h2 id="historial" className="text-base font-semibold">
            Historial de archivado
          </h2>
          {history.ok ? (
            <HistoryList items={history.data} />
          ) : (
            <Alert tone="warning">No se pudo cargar el historial.</Alert>
          )}
        </section>
      </div>
    </div>
  );
}

export async function RecordEditPage({
  module,
  service,
  id,
  action,
}: Readonly<{
  module: RecordModule;
  service: RecordService;
  id: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}>) {
  const ctx = await requireTenant();
  const found = await service.get(ctx, id);
  if (!found.ok) {
    if (found.kind === 'not_found') notFound();
    throw new Error('No se pudo cargar el registro.');
  }
  const record = found.data;
  const detailHref = `${module.basePath}/${record.id}`;

  if (record.archivedAt) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={`Editar ${module.singular}`}
          backHref={detailHref}
          backLabel="Volver al detalle"
        />
        <Alert tone="info" title="Registro archivado">
          Un registro archivado no se puede editar. Restáuralo desde su detalle para modificarlo.
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Editar ${module.singular}`}
        backHref={detailHref}
        backLabel="Volver al detalle"
      />
      <RecordForm
        module={module}
        action={action}
        recordId={record.id}
        initial={{
          [module.nameField]: record.name,
          email: record.email ?? '',
          phone: record.phone ?? '',
          notes: record.notes ?? '',
        }}
        submitLabel="Guardar cambios"
        cancelHref={detailHref}
      />
    </div>
  );
}
