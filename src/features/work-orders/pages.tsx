import 'server-only';

import { randomUUID } from 'node:crypto';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/LinkButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { formatDate, formatDateTime, todayInMadrid } from '@/lib/records/format';
import { requireTenant } from '@/lib/records/tenant';

import {
  advanceOrderAction,
  assignOrderAction,
  cancelOrderAction,
  createOrderAction,
  updateOrderAction,
} from './actions';
import { availableActions } from './constants';
import { buildOrdersHref, parseOrderListParams } from './params';
import { workOrderService, type OrderView } from './service';
import { OrderActions } from './ui/OrderActions';
import { OrderPriorityBadge, OrderStatusBadge } from './ui/OrderBadges';
import { OrderFilters } from './ui/OrderFilters';
import { OrderForm } from './ui/OrderForm';
import { OrderList } from './ui/OrderList';
import { OrderTimeline } from './ui/OrderTimeline';

// Composición de las páginas de órdenes (Server Components). Las rutas de src/app son
// envoltorios de una línea sobre estas funciones. Los detalles internos de un fallo no llegan a la
// interfaz: error.tsx muestra un mensaje genérico con reintento.

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const NOTICES: Record<string, string> = {
  creada: 'Orden creada correctamente.',
  actualizada: 'Cambios guardados correctamente.',
};

export async function OrdersListPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  const params = parseOrderListParams(await searchParams);
  const ctx = await requireTenant();
  const [result, options] = await Promise.all([
    workOrderService.list(ctx, params),
    workOrderService.options(ctx, 'all'),
  ]);
  if (!result.ok) throw new Error('No se pudo cargar el listado.');
  const { items, total, page, pageCount } = result.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Órdenes de servicio"
        description="Sigue cada orden desde la solicitud hasta su cierre."
        actions={<LinkButton href="/orders/new">Nueva orden</LinkButton>}
      />
      <OrderFilters
        params={params}
        customers={options.ok ? options.data.customers : []}
        technicians={options.ok ? options.data.technicians : []}
      />
      <OrderList items={items} params={params} />
      {total > 0 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          noun="órdenes"
          hrefFor={(target) => buildOrdersHref('/orders', { ...params, page: target })}
        />
      ) : null}
    </div>
  );
}

export async function OrderNewPage() {
  const ctx = await requireTenant();
  const options = await workOrderService.options(ctx, 'active');
  if (!options.ok) throw new Error('No se pudieron cargar los datos del formulario.');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nueva orden" backHref="/orders" backLabel="Volver a órdenes" />
      <OrderForm
        action={createOrderAction}
        initial={{ scheduled_date: todayInMadrid(), priority: 'normal' }}
        requestId={randomUUID()}
        customers={options.data.customers}
        technicians={options.data.technicians}
        submitLabel="Crear orden"
        cancelHref="/orders"
      />
    </div>
  );
}

function Item({ term, children }: Readonly<{ term: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{term}</dt>
      <dd className="text-sm break-words text-ink">{children}</dd>
    </div>
  );
}

function OrderDetails({ order }: Readonly<{ order: OrderView }>) {
  return (
    <dl className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2 xl:grid-cols-3">
      <Item term="Cliente">
        <Link
          className="font-medium text-accent hover:underline"
          href={`/customers/${order.customerId}`}
        >
          {order.customerName}
        </Link>
        {order.customerArchived ? ' (archivado)' : ''}
      </Item>
      <Item term="Técnico">
        {order.technicianId ? (
          <Link
            className="font-medium text-accent hover:underline"
            href={`/technicians/${order.technicianId}`}
          >
            {order.technicianName ?? 'Técnico'}
          </Link>
        ) : (
          'Sin asignar'
        )}
      </Item>
      <Item term="Fecha programada">{formatDate(order.scheduledDate)}</Item>
      <Item term="Prioridad">
        <OrderPriorityBadge priority={order.priority} />
      </Item>
      <Item term="Alta">{formatDateTime(order.createdAt)}</Item>
      <Item term="Última modificación">{formatDateTime(order.updatedAt)}</Item>
      {order.cancellationReason ? (
        <Item term="Motivo de cancelación">{order.cancellationReason}</Item>
      ) : null}
      <div className="flex flex-col gap-0.5 sm:col-span-2 xl:col-span-3">
        <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Descripción
        </dt>
        <dd className="text-sm break-words whitespace-pre-wrap text-ink">
          {order.description ?? 'Sin descripción'}
        </dd>
      </div>
    </dl>
  );
}

export async function OrderDetailPage({
  id,
  searchParams,
}: Readonly<{ id: string; searchParams: SearchParams }>) {
  const ctx = await requireTenant();
  const found = await workOrderService.get(ctx, id);
  if (!found.ok) {
    if (found.kind === 'not_found') notFound();
    throw new Error('No se pudo cargar la orden.');
  }
  const order = found.data;
  const [history, options] = await Promise.all([
    workOrderService.history(ctx, order.id),
    workOrderService.options(ctx, 'active'),
  ]);
  const rawNotice = (await searchParams).aviso;
  const notice = typeof rawNotice === 'string' ? NOTICES[rawNotice] : undefined;
  const allowed = availableActions(order.status);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={order.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <OrderPriorityBadge priority={order.priority} />
          </span>
        }
        backHref="/orders"
        backLabel="Volver a órdenes"
        actions={
          allowed.edit ? (
            <LinkButton href={`/orders/${order.id}/edit`} variant="secondary">
              Editar
            </LinkButton>
          ) : null
        }
      />
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <div className="grid items-start gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <OrderDetails order={order} />
          <OrderActions
            orderId={order.id}
            status={order.status}
            technicianId={order.technicianId}
            technicians={options.ok ? options.data.technicians : []}
            assignAction={assignOrderAction}
            advanceAction={advanceOrderAction}
            cancelAction={cancelOrderAction}
          />
        </div>
        <section aria-labelledby="historial" className="flex min-w-0 flex-col gap-3">
          <h2 id="historial" className="text-base font-semibold">
            Historial
          </h2>
          {history.ok ? (
            <OrderTimeline items={history.data} />
          ) : (
            <Alert tone="warning">No se pudo cargar el historial.</Alert>
          )}
        </section>
      </div>
    </div>
  );
}

export async function OrderEditPage({ id }: Readonly<{ id: string }>) {
  const ctx = await requireTenant();
  const found = await workOrderService.get(ctx, id);
  if (!found.ok) {
    if (found.kind === 'not_found') notFound();
    throw new Error('No se pudo cargar la orden.');
  }
  const order = found.data;
  const detailHref = `/orders/${order.id}`;

  if (!availableActions(order.status).edit) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Editar orden" backHref={detailHref} backLabel="Volver al detalle" />
        <Alert tone="info" title="Orden cerrada">
          Una orden completada o cancelada es de solo lectura y no se puede editar.
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Editar orden" backHref={detailHref} backLabel="Volver al detalle" />
      <OrderForm
        action={updateOrderAction}
        orderId={order.id}
        initial={{
          title: order.title,
          description: order.description ?? '',
          priority: order.priority,
          scheduled_date: order.scheduledDate,
        }}
        submitLabel="Guardar cambios"
        cancelHref={detailHref}
      />
    </div>
  );
}
