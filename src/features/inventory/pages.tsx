import 'server-only';

import { randomUUID } from 'node:crypto';

import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Alert } from '@/components/ui/Alert';
import { cn } from '@/components/ui/cn';
import { LinkButton } from '@/components/ui/LinkButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { ArchiveControl } from '@/components/ui/records/ArchiveControl';
import { SearchBar } from '@/components/ui/SearchBar';
import { SegmentedLinks } from '@/components/ui/SegmentedLinks';
import { formatDateTime } from '@/lib/records/format';
import { requireTenant } from '@/lib/records/tenant';

import {
  archiveInventoryItemAction,
  createInventoryItemAction,
  recordMovementAction,
  restoreInventoryItemAction,
  updateInventoryItemAction,
} from './actions';
import { INVENTORY_MODULE } from './config';
import { UNIT_LABEL, availableActions, formatQuantity } from './constants';
import {
  FILTER_LABEL,
  INVENTORY_FILTERS,
  buildInventoryHref,
  parseInventoryListParams,
} from './params';
import { inventoryService, type InventoryItemView } from './service';
import { ItemStatusBadge } from './ui/InventoryBadges';
import { InventoryAlerts } from './ui/InventoryAlerts';
import { InventoryForm } from './ui/InventoryForm';
import { InventoryList } from './ui/InventoryList';
import { MovementForm } from './ui/MovementForm';
import { MovementHistory } from './ui/MovementHistory';

// Composición de las páginas de inventario (Server Components). Las rutas de src/app son envoltorios
// de una línea sobre estas funciones. Los detalles internos de un fallo no llegan a la interfaz:
// error.tsx muestra un mensaje genérico con reintento.

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const NOTICES: Record<string, string> = {
  creado: 'Artículo creado con saldo 0. Registra su existencia inicial como una entrada.',
  actualizado: 'Cambios guardados correctamente.',
};

export async function InventoryListPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  const params = parseInventoryListParams(await searchParams);
  const ctx = await requireTenant();
  const [result, counts] = await Promise.all([
    inventoryService.list(ctx, params),
    inventoryService.alertCounts(ctx),
  ]);
  if (!result.ok) throw new Error('No se pudo cargar el listado.');
  const { items, total, page, pageCount } = result.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inventario"
        description="Controla las existencias de materiales: el saldo solo cambia con entradas, salidas y consumos en órdenes."
        actions={<LinkButton href="/inventory/new">Nuevo artículo</LinkButton>}
      />
      <InventoryAlerts counts={counts.ok ? counts.data : null} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="lg:w-full lg:max-w-md">
          <SearchBar
            action="/inventory"
            label="Buscar por referencia, nombre o descripción"
            defaultValue={params.q}
            hidden={params.status === 'activos' ? undefined : { estado: params.status }}
            clearHref={buildInventoryHref('/inventory', { status: params.status })}
          />
        </div>
        <SegmentedLinks
          label="Filtrar por estado"
          items={INVENTORY_FILTERS.map((status) => ({
            label: FILTER_LABEL[status],
            href: buildInventoryHref('/inventory', { q: params.q, status }),
            current: params.status === status,
          }))}
        />
      </div>
      <InventoryList items={items} params={params} />
      {total > 0 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          noun="artículos"
          hrefFor={(target) => buildInventoryHref('/inventory', { ...params, page: target })}
        />
      ) : null}
    </div>
  );
}

export function InventoryNewPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nuevo artículo" backHref="/inventory" backLabel="Volver a inventario" />
      <InventoryForm
        action={createInventoryItemAction}
        initial={{}}
        requestId={randomUUID()}
        submitLabel="Crear artículo"
        cancelHref="/inventory"
      />
    </div>
  );
}

function Item({
  term,
  children,
  className,
}: Readonly<{ term: string; children: ReactNode; className?: string }>) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{term}</dt>
      <dd className="text-sm [overflow-wrap:anywhere] text-ink">{children}</dd>
    </div>
  );
}

const LEVEL_TONE = { ok: 'bg-success', low: 'bg-warning', out: 'bg-danger' } as const;

/** Saldo actual: cifra grande, estado y un indicador de nivel decorativo (el texto lleva el significado). */
function BalanceCard({ item }: Readonly<{ item: InventoryItemView }>) {
  const archived = item.archivedAt !== null;
  // Referencia visual: el doble del umbral (o el propio saldo si no hay umbral). Solo decorativo.
  const reference = Math.max(item.threshold * 2, item.quantity, 1);
  const percent = Math.min(100, Math.round((item.quantity / reference) * 100));
  return (
    <section
      aria-labelledby="saldo"
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="saldo" className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Saldo actual
          </h2>
          <p
            className="text-3xl font-semibold tracking-tight tabular-nums"
            data-testid="item-balance"
          >
            {formatQuantity(item.quantity)}{' '}
            <span className="text-lg text-ink-muted">{item.unit}</span>
          </p>
        </div>
        <ItemStatusBadge status={item.status} archived={archived} />
      </div>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-sm bg-sunken">
        <div
          className={cn('h-full', archived ? 'bg-line-strong' : LEVEL_TONE[item.status])}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-sm text-ink-muted">
        {item.threshold > 0
          ? `Se avisa de stock bajo cuando el saldo es positivo y no supera ${formatQuantity(item.threshold)} ${item.unit}.`
          : 'Sin umbral de stock bajo: solo se avisa cuando el artículo se agota.'}
      </p>
    </section>
  );
}

function ItemDetails({ item }: Readonly<{ item: InventoryItemView }>) {
  return (
    <dl className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
      <Item term="Referencia">
        <span className="font-mono">{item.reference}</span>
      </Item>
      <Item term="Unidad">{UNIT_LABEL[item.unit]}</Item>
      <Item term="Alta">{formatDateTime(item.createdAt)}</Item>
      <Item term="Última modificación">{formatDateTime(item.updatedAt)}</Item>
      {item.archivedAt ? <Item term="Archivado">{formatDateTime(item.archivedAt)}</Item> : null}
      <Item term="Descripción" className="sm:col-span-2">
        <span className="whitespace-pre-wrap">{item.description ?? 'Sin descripción'}</span>
      </Item>
    </dl>
  );
}

export async function InventoryDetailPage({
  id,
  searchParams,
}: Readonly<{ id: string; searchParams: SearchParams }>) {
  const ctx = await requireTenant();
  const found = await inventoryService.get(ctx, id);
  if (!found.ok) {
    if (found.kind === 'not_found') notFound();
    throw new Error('No se pudo cargar el artículo.');
  }
  const item = found.data;
  const archived = item.archivedAt !== null;
  const allowed = availableActions(archived);
  const [movements, orders] = await Promise.all([
    inventoryService.movements(ctx, item.id),
    allowed.move ? inventoryService.openOrders(ctx) : Promise.resolve(null),
  ]);
  const rawNotice = (await searchParams).aviso;
  const notice = typeof rawNotice === 'string' ? NOTICES[rawNotice] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={item.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono">{item.reference}</span>
            <ItemStatusBadge status={item.status} archived={archived} />
          </span>
        }
        backHref="/inventory"
        backLabel="Volver a inventario"
        actions={
          allowed.edit ? (
            <LinkButton href={`/inventory/${item.id}/edit`} variant="secondary">
              Editar
            </LinkButton>
          ) : null
        }
      />
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {archived ? (
        <Alert tone="info" title="Artículo archivado">
          Es de solo lectura: no admite ediciones ni movimientos. Restáuralo para volver a trabajar
          con él; su historial se conserva.
        </Alert>
      ) : null}
      <div className="grid items-start gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <BalanceCard item={item} />
          <ItemDetails item={item} />
          <ArchiveControl
            module={INVENTORY_MODULE}
            recordId={item.id}
            recordName={item.name}
            archived={archived}
            archiveAction={archiveInventoryItemAction}
            restoreAction={restoreInventoryItemAction}
          />
        </div>
        {allowed.move ? (
          orders && !orders.ok ? (
            <Alert tone="warning">No se pudieron cargar las órdenes abiertas.</Alert>
          ) : (
            <MovementForm
              itemId={item.id}
              unit={item.unit}
              requestId={randomUUID()}
              orders={orders?.ok ? orders.data : []}
              action={recordMovementAction}
            />
          )
        ) : null}
      </div>
      <section aria-labelledby="historial" className="flex min-w-0 flex-col gap-3">
        <h2 id="historial" className="text-base font-semibold">
          Historial de movimientos
        </h2>
        {movements.ok ? (
          <MovementHistory items={movements.data} unit={item.unit} />
        ) : (
          <Alert tone="warning">No se pudo cargar el historial de movimientos.</Alert>
        )}
      </section>
    </div>
  );
}

export async function InventoryEditPage({ id }: Readonly<{ id: string }>) {
  const ctx = await requireTenant();
  const found = await inventoryService.get(ctx, id);
  if (!found.ok) {
    if (found.kind === 'not_found') notFound();
    throw new Error('No se pudo cargar el artículo.');
  }
  const item = found.data;
  const detailHref = `/inventory/${item.id}`;

  if (!availableActions(item.archivedAt !== null).edit) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Editar artículo" backHref={detailHref} backLabel="Volver al detalle" />
        <Alert tone="info" title="Artículo archivado">
          Un artículo archivado es de solo lectura. Restáuralo desde su detalle para modificarlo.
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Editar artículo" backHref={detailHref} backLabel="Volver al detalle" />
      <InventoryForm
        action={updateInventoryItemAction}
        itemId={item.id}
        reference={item.reference}
        initial={{
          name: item.name,
          description: item.description ?? '',
          unit: item.unit,
          low_stock_threshold: String(item.threshold),
        }}
        submitLabel="Guardar cambios"
        cancelHref={detailHref}
      />
    </div>
  );
}
