import 'server-only';

import { randomUUID } from 'node:crypto';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/LinkButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { formatDateTime } from '@/lib/records/format';
import { requireTenant } from '@/lib/records/tenant';

import {
  acceptQuoteAction,
  addQuoteItemAction,
  createQuoteAction,
  rejectQuoteAction,
  removeQuoteItemAction,
  updateQuoteAction,
  updateQuoteItemAction,
} from './actions';
import { availableActions } from './constants';
import { formatCents, formatQuoteNumber } from './money';
import { buildQuotesHref, parseQuoteListParams } from './params';
import { quoteService, type QuoteView } from './service';
import { QuoteActions } from './ui/QuoteActions';
import { QuoteStatusBadge } from './ui/QuoteBadges';
import { QuoteFilters } from './ui/QuoteFilters';
import { QuoteForm } from './ui/QuoteForm';
import { QuoteItems } from './ui/QuoteItems';
import { QuoteList } from './ui/QuoteList';
import { QuotePrintView } from './ui/QuotePrintView';
import { QuoteTimeline } from './ui/QuoteTimeline';
import { QuoteTotals } from './ui/QuoteTotals';

// Composición de las páginas de presupuestos (Server Components). Las rutas de src/app son
// envoltorios de una línea sobre estas funciones. Los detalles internos de un fallo no llegan a la
// interfaz: error.tsx muestra un mensaje genérico con reintento.

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const NOTICES: Record<string, string> = {
  creado: 'Presupuesto creado correctamente. Añade sus conceptos para calcular el importe.',
  actualizado: 'Cambios guardados correctamente.',
};

export async function QuotesListPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  const params = parseQuoteListParams(await searchParams);
  const ctx = await requireTenant();
  const [result, customers] = await Promise.all([
    quoteService.list(ctx, params),
    quoteService.customers(ctx, 'all'),
  ]);
  if (!result.ok) throw new Error('No se pudo cargar el listado.');
  const { items, total, page, pageCount } = result.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Presupuestos"
        description="Prepara presupuestos con conceptos e IVA y conviértelos en órdenes de servicio al aceptarlos."
        actions={<LinkButton href="/quotes/new">Nuevo presupuesto</LinkButton>}
      />
      <QuoteFilters params={params} customers={customers.ok ? customers.data : []} />
      <QuoteList items={items} params={params} />
      {total > 0 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          noun="presupuestos"
          hrefFor={(target) => buildQuotesHref('/quotes', { ...params, page: target })}
        />
      ) : null}
    </div>
  );
}

export async function QuoteNewPage() {
  const ctx = await requireTenant();
  const customers = await quoteService.customers(ctx, 'active');
  if (!customers.ok) throw new Error('No se pudieron cargar los datos del formulario.');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nuevo presupuesto" backHref="/quotes" backLabel="Volver a presupuestos" />
      <QuoteForm
        action={createQuoteAction}
        initial={{}}
        requestId={randomUUID()}
        customers={customers.data}
        submitLabel="Crear presupuesto"
        cancelHref="/quotes"
      />
    </div>
  );
}

function Item({ term, children }: Readonly<{ term: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{term}</dt>
      <dd className="text-sm [overflow-wrap:anywhere] text-ink">{children}</dd>
    </div>
  );
}

function QuoteDetails({ quote }: Readonly<{ quote: QuoteView }>) {
  return (
    <dl className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
      <Item term="Cliente">
        <Link
          className="font-medium text-accent underline underline-offset-2"
          href={`/customers/${quote.customerId}`}
        >
          {quote.customerName}
        </Link>
        {quote.customerArchived ? ' (archivado)' : ''}
      </Item>
      <Item term="Número">
        <span className="font-mono">{formatQuoteNumber(quote.number)}</span>
      </Item>
      <Item term="Alta">{formatDateTime(quote.createdAt)}</Item>
      <Item term="Última modificación">{formatDateTime(quote.updatedAt)}</Item>
      {quote.decidedAt ? (
        <Item term={quote.status === 'accepted' ? 'Aceptado' : 'Rechazado'}>
          {formatDateTime(quote.decidedAt)}
        </Item>
      ) : null}
      <Item term="Importe total (IVA incluido)">
        <span className="font-semibold tabular-nums">{formatCents(quote.totalCents)}</span>
      </Item>
      <div className="flex flex-col gap-0.5 sm:col-span-2">
        <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Descripción
        </dt>
        <dd className="text-sm [overflow-wrap:anywhere] whitespace-pre-wrap text-ink">
          {quote.description ?? 'Sin descripción'}
        </dd>
      </div>
    </dl>
  );
}

export async function QuoteDetailPage({
  id,
  searchParams,
}: Readonly<{ id: string; searchParams: SearchParams }>) {
  const ctx = await requireTenant();
  const found = await quoteService.get(ctx, id);
  if (!found.ok) {
    if (found.kind === 'not_found') notFound();
    throw new Error('No se pudo cargar el presupuesto.');
  }
  const quote = found.data;
  const [items, history] = await Promise.all([
    quoteService.items(ctx, quote.id),
    quoteService.history(ctx, quote.id),
  ]);
  const rawNotice = (await searchParams).aviso;
  const notice = typeof rawNotice === 'string' ? NOTICES[rawNotice] : undefined;
  const allowed = availableActions(quote.status);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={quote.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-mono">{formatQuoteNumber(quote.number)}</span>
            <QuoteStatusBadge status={quote.status} />
          </span>
        }
        backHref="/quotes"
        backLabel="Volver a presupuestos"
        actions={
          <>
            {items.ok && items.data.length > 0 ? (
              <LinkButton href={`/quotes/${quote.id}/print`} variant="secondary">
                Versión imprimible
              </LinkButton>
            ) : null}
            {allowed.edit ? (
              <LinkButton href={`/quotes/${quote.id}/edit`} variant="secondary">
                Editar
              </LinkButton>
            ) : null}
          </>
        }
      />
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {quote.status === 'accepted' && quote.orderId ? (
        <Alert tone="success" title="Presupuesto aceptado">
          Se generó una orden de servicio a partir de este presupuesto.{' '}
          <Link
            className="font-medium text-accent underline underline-offset-2"
            href={`/orders/${quote.orderId}`}
          >
            Ver la orden de servicio
          </Link>
        </Alert>
      ) : null}
      {quote.status === 'rejected' ? (
        <Alert tone="info" title="Presupuesto rechazado">
          Un presupuesto rechazado es de solo lectura y no genera ninguna orden.
        </Alert>
      ) : null}
      <div className="grid items-start gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <QuoteDetails quote={quote} />
          {items.ok ? (
            <QuoteItems
              quoteId={quote.id}
              items={items.data}
              editable={allowed.editItems}
              requestId={randomUUID()}
              addAction={addQuoteItemAction}
              updateAction={updateQuoteItemAction}
              removeAction={removeQuoteItemAction}
            />
          ) : (
            <Alert tone="warning">No se pudieron cargar los conceptos.</Alert>
          )}
          <QuoteTotals
            subtotalCents={quote.subtotalCents}
            taxCents={quote.taxCents}
            totalCents={quote.totalCents}
          />
          <QuoteActions
            quoteId={quote.id}
            status={quote.status}
            totalCents={quote.totalCents}
            itemCount={items.ok ? items.data.length : undefined}
            acceptAction={acceptQuoteAction}
            rejectAction={rejectQuoteAction}
          />
        </div>
        <section aria-labelledby="historial" className="flex min-w-0 flex-col gap-3">
          <h2 id="historial" className="text-base font-semibold">
            Historial
          </h2>
          {history.ok ? (
            <QuoteTimeline items={history.data} />
          ) : (
            <Alert tone="warning">No se pudo cargar el historial.</Alert>
          )}
        </section>
      </div>
    </div>
  );
}

export async function QuotePrintPage({ id }: Readonly<{ id: string }>) {
  const ctx = await requireTenant();
  const found = await quoteService.get(ctx, id);
  if (!found.ok) {
    if (found.kind === 'not_found') notFound();
    throw new Error('No se pudo cargar el presupuesto.');
  }
  const items = await quoteService.items(ctx, found.data.id);
  return (
    <QuotePrintView
      quote={found.data}
      items={items.ok ? items.data : null}
      organizationName={ctx.organizationName}
    />
  );
}

export async function QuoteEditPage({ id }: Readonly<{ id: string }>) {
  const ctx = await requireTenant();
  const found = await quoteService.get(ctx, id);
  if (!found.ok) {
    if (found.kind === 'not_found') notFound();
    throw new Error('No se pudo cargar el presupuesto.');
  }
  const quote = found.data;
  const detailHref = `/quotes/${quote.id}`;

  if (!availableActions(quote.status).edit) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Editar presupuesto"
          backHref={detailHref}
          backLabel="Volver al detalle"
        />
        <Alert tone="info" title="Presupuesto cerrado">
          Un presupuesto aceptado o rechazado es de solo lectura y no se puede editar.
        </Alert>
      </div>
    );
  }

  const customers = await quoteService.customers(ctx, 'active');
  if (!customers.ok) throw new Error('No se pudieron cargar los datos del formulario.');
  // El cliente actual puede estar archivado: se conserva como opción para no perderlo al guardar.
  const options = customers.data.some((c) => c.id === quote.customerId)
    ? customers.data
    : [{ id: quote.customerId, name: `${quote.customerName} (archivado)` }, ...customers.data];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Editar presupuesto" backHref={detailHref} backLabel="Volver al detalle" />
      <QuoteForm
        action={updateQuoteAction}
        quoteId={quote.id}
        initial={{
          customer_id: quote.customerId,
          title: quote.title,
          description: quote.description ?? '',
        }}
        customers={options}
        submitLabel="Guardar cambios"
        cancelHref={detailHref}
      />
    </div>
  );
}
