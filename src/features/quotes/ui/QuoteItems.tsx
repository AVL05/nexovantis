'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { focusLost, submitKeepingValues, useFocusOnError } from '@/components/ui/forms';
import { LiveRegion } from '@/components/ui/LiveRegion';
import { Select } from '@/components/ui/Select';

import type { QuoteActionState } from '../actions';
import {
  COMMON_TAX_RATES_BP,
  DEFAULT_TAX_BP,
  QUOTE_LIMITS,
  centsToInput,
  formatCents,
  formatQuantity,
  formatTaxRate,
  lineAmounts,
  parseEuroCents,
  parseQuantityMilli,
} from '../money';
import type { QuoteItemView } from '../service';

type Action = (prev: QuoteActionState, formData: FormData) => Promise<QuoteActionState>;
const IDLE: QuoteActionState = { status: 'idle' };

type Values = { description: string; quantity: string; unit_price: string; tax_rate_bp: string };
const EMPTY: Values = {
  description: '',
  quantity: '1',
  unit_price: '',
  tax_rate_bp: String(DEFAULT_TAX_BP),
};

/** Previsualización con aritmética entera (BigInt), idéntica al cálculo de PostgreSQL (fuente de verdad). */
function Preview({ values }: Readonly<{ values: Values }>) {
  const milli = parseQuantityMilli(values.quantity);
  const cents = parseEuroCents(values.unit_price);
  if (milli === null || cents === null) {
    return (
      <p className="text-sm text-ink-muted">
        Introduce una cantidad (hasta 3 decimales) y un precio (hasta 2 decimales) válidos para ver
        el importe.
      </p>
    );
  }
  const { subtotal, tax } = lineAmounts(milli, BigInt(cents), BigInt(values.tax_rate_bp));
  return (
    <p className="text-sm text-ink-muted" data-testid="item-preview">
      Previsualización: base {formatCents(subtotal)} + IVA {formatCents(tax)} ={' '}
      <strong className="text-ink">{formatCents(subtotal + tax)}</strong>. El importe definitivo lo
      calcula el servidor.
    </p>
  );
}

function ItemFields({
  idPrefix,
  values,
  onChange,
  errors,
}: Readonly<{
  idPrefix: string;
  values: Values;
  onChange: (next: Values) => void;
  errors: Record<string, string>;
}>) {
  const rates: number[] = [...COMMON_TAX_RATES_BP];
  const current = Number(values.tax_rate_bp);
  if (Number.isInteger(current) && !rates.includes(current)) rates.push(current);
  const set = (key: keyof Values) => (value: string) => onChange({ ...values, [key]: value });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field
          id={`${idPrefix}-description`}
          label="Concepto"
          name="description"
          required
          maxLength={QUOTE_LIMITS.itemDescription}
          autoComplete="off"
          value={values.description}
          onChange={(event) => set('description')(event.target.value)}
          error={errors.description}
        />
      </div>
      <Field
        id={`${idPrefix}-quantity`}
        label="Cantidad"
        name="quantity"
        required
        inputMode="decimal"
        autoComplete="off"
        hint="Hasta 3 decimales."
        value={values.quantity}
        onChange={(event) => set('quantity')(event.target.value)}
        error={
          errors.quantity
            ? 'Indica una cantidad mayor que 0 (máx. 100000, hasta 3 decimales).'
            : undefined
        }
      />
      <Field
        id={`${idPrefix}-unit-price`}
        label="Precio unitario (€, sin IVA)"
        name="unit_price"
        required
        inputMode="decimal"
        autoComplete="off"
        hint="Hasta 2 decimales."
        value={values.unit_price}
        onChange={(event) => set('unit_price')(event.target.value)}
        error={errors.unit_price ? 'Indica un precio válido (0 a 1.000.000,00).' : undefined}
      />
      <Select
        id={`${idPrefix}-tax`}
        label="IVA"
        name="tax_rate_bp"
        required
        value={values.tax_rate_bp}
        onChange={(event) => set('tax_rate_bp')(event.target.value)}
        options={rates.map((bp) => ({ value: String(bp), label: formatTaxRate(bp) }))}
        error={errors.tax_rate_bp}
      />
      <div className="flex items-end sm:col-span-2">
        <Preview values={values} />
      </div>
    </div>
  );
}

function AddItemForm({
  quoteId,
  requestId,
  action,
}: Readonly<{ quoteId: string; requestId: string; action: Action }>) {
  const idPrefix = useId();
  const [values, setValues] = useState<Values>(EMPTY);
  const [state, formAction, pending] = useActionState(
    async (prev: QuoteActionState, formData: FormData) => {
      const next = await action(prev, formData);
      if (next.status === 'success') setValues(EMPTY);
      return { ...next };
    },
    IDLE,
  );
  // El envío deshabilita el botón: si el foco se perdió, va al mensaje de error o al título.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === 'idle' || !focusLost()) return;
    (errorRef.current ?? headingRef.current)?.focus();
  }, [state]);

  return (
    <form
      action={formAction}
      onSubmit={submitKeepingValues(formAction)}
      aria-labelledby={`${idPrefix}-title`}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5"
    >
      <h3
        id={`${idPrefix}-title`}
        ref={headingRef}
        tabIndex={-1}
        className="text-base font-semibold"
      >
        Añadir concepto
      </h3>
      <input type="hidden" name="quote_id" value={quoteId} />
      <input type="hidden" name="request_id" value={requestId} />
      {state.status === 'error' ? (
        <div ref={errorRef} tabIndex={-1}>
          <Alert tone="danger">{state.message}</Alert>
        </div>
      ) : null}
      <ItemFields
        idPrefix={idPrefix}
        values={values}
        onChange={setValues}
        errors={state.fieldErrors ?? {}}
      />
      <div>
        <Button type="submit" loading={pending}>
          Añadir concepto
        </Button>
      </div>
      <LiveRegion>{state.status === 'success' ? state.message : undefined}</LiveRegion>
    </form>
  );
}

function EditItemDialog({
  quoteId,
  item,
  action,
}: Readonly<{ quoteId: string; item: QuoteItemView; action: Action }>) {
  const idPrefix = useId();
  const formId = `${idPrefix}-form`;
  const initial: Values = {
    description: item.description,
    quantity: formatQuantity(item.quantity),
    unit_price: centsToInput(item.unitPriceCents),
    tax_rate_bp: String(item.taxRateBp),
  };
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(initial);
  const [state, formAction, pending] = useActionState(
    async (prev: QuoteActionState, formData: FormData) => {
      const next = await action(prev, formData);
      if (next.status === 'success') setOpen(false);
      return { ...next };
    },
    IDLE,
  );
  // Como al cancelar una orden: reabrir limpia el fallo anterior; si el diálogo se cerró durante
  // el envío, el fallo aparece junto al botón.
  const [dismissed, setDismissed] = useState<QuoteActionState | null>(null);
  const failure = !pending && state.status === 'error' && state !== dismissed ? state : null;
  const toggle = (next: boolean) => {
    setDismissed(state);
    setOpen(next);
  };
  // Con el diálogo abierto el mensaje está dentro: el foco no sale de él.
  const errorRef = useFocusOnError(state);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setValues(initial);
          toggle(true);
        }}
        aria-label={`Editar concepto ${item.description}`}
      >
        Editar
      </Button>
      {failure && !open ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="max-w-48 text-xs text-danger">
          {failure.message}
        </div>
      ) : null}
      <Dialog
        open={open}
        onClose={() => toggle(false)}
        title="Editar concepto"
        footer={
          <>
            <Button variant="secondary" onClick={() => toggle(false)} disabled={pending}>
              Volver
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              Guardar concepto
            </Button>
          </>
        }
      >
        <form
          id={formId}
          action={formAction}
          onSubmit={submitKeepingValues(formAction)}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="quote_id" value={quoteId} />
          {failure && open ? (
            <div ref={errorRef} tabIndex={-1}>
              <Alert tone="danger">{failure.message}</Alert>
            </div>
          ) : null}
          <ItemFields
            idPrefix={idPrefix}
            values={values}
            onChange={setValues}
            errors={failure?.fieldErrors ?? {}}
          />
        </form>
      </Dialog>
    </div>
  );
}

type Removal = { id: string; message?: string };

/**
 * Quitar un concepto con confirmación. Si falla, el diálogo sigue abierto con el error dentro (si se
 * cerró durante el envío, aparece junto al botón); si tiene éxito, `onRemoved` reubica el foco.
 */
function RemoveItemControl({
  quoteId,
  item,
  action,
  onRemoved,
}: Readonly<{
  quoteId: string;
  item: QuoteItemView;
  action: Action;
  onRemoved: (removal: Removal) => void;
}>) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: QuoteActionState, formData: FormData) => {
      const next = await action(prev, formData);
      if (next.status === 'success') {
        setOpen(false);
        onRemoved({ id: item.id, message: next.message });
      }
      return { ...next };
    },
    IDLE,
  );
  const [dismissed, setDismissed] = useState<QuoteActionState | null>(null);
  const error = !pending && state.status === 'error' && state !== dismissed ? state : null;
  const toggle = (next: boolean) => {
    setDismissed(state);
    setOpen(next);
  };

  const dialogErrorRef = useRef<HTMLDivElement>(null);
  const rowErrorRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!error) return;
    if (open) dialogErrorRef.current?.focus();
    else if (focusLost()) rowErrorRef.current?.focus();
  }, [error, open]);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="danger-outline"
        size="sm"
        onClick={() => toggle(true)}
        aria-label={`Quitar concepto ${item.description}`}
      >
        Quitar
      </Button>
      {error && !open ? (
        <span
          ref={rowErrorRef}
          tabIndex={-1}
          role="alert"
          className="max-w-48 text-xs font-medium text-danger"
        >
          {error.message}
        </span>
      ) : null}
      <Dialog
        open={open}
        onClose={() => toggle(false)}
        title="Quitar concepto"
        footer={
          <>
            <Button variant="secondary" onClick={() => toggle(false)} disabled={pending}>
              Volver
            </Button>
            <Button type="submit" form={formId} variant="danger" loading={pending}>
              Quitar concepto
            </Button>
          </>
        }
      >
        <form id={formId} action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="quote_id" value={quoteId} />
          {error && open ? (
            <div ref={dialogErrorRef} tabIndex={-1}>
              <Alert tone="danger">{error.message}</Alert>
            </div>
          ) : null}
          <p className="[overflow-wrap:anywhere]">
            Se quitará «{item.description}» y se recalcularán los totales. Esta acción no se puede
            deshacer.
          </p>
        </form>
      </Dialog>
    </div>
  );
}

const CAPTION = 'Conceptos del presupuesto';
const COLUMNS = ['Concepto', 'Cantidad', 'Precio unitario', 'IVA', 'Base', 'Importe IVA'];

/** Cifra de un concepto: la etiqueta visible es decorativa (la cabecera de columna ya la anuncia). */
function Figure({ label, children }: Readonly<{ label: string; children: string }>) {
  return (
    <td role="cell" className="block min-w-0 [overflow-wrap:anywhere] tabular-nums">
      <span aria-hidden="true" className="block text-xs text-ink-muted">
        {label}
      </span>
      {children}
    </td>
  );
}

/**
 * Tabla sin scroll horizontal a cualquier ancho: cada concepto ocupa un bloque (descripción, cifras
 * en rejilla y acciones) que se reparte según el ancho del contenedor, no del viewport (la columna
 * del detalle es estrecha incluso en escritorio). Los `role` explícitos conservan la semántica de
 * tabla al cambiar `display`.
 */
function ItemsTable({
  quoteId,
  items,
  editable,
  updateAction,
  removeAction,
  onRemoved,
}: Readonly<{
  quoteId: string;
  items: readonly QuoteItemView[];
  editable: boolean;
  updateAction: Action;
  removeAction: Action;
  onRemoved: (removal: Removal) => void;
}>) {
  return (
    <div className="@container rounded-lg border border-line bg-surface">
      <table role="table" className="block w-full text-left text-sm">
        <caption className="block px-4 py-3 text-left text-sm font-semibold text-ink">
          {CAPTION}
        </caption>
        <thead role="rowgroup" className="sr-only">
          <tr role="row">
            {COLUMNS.map((column) => (
              <th key={column} role="columnheader" scope="col">
                {column}
              </th>
            ))}
            {editable ? (
              <th role="columnheader" scope="col">
                Acciones
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody role="rowgroup" className="block">
          {items.map((item) => (
            <tr
              key={item.id}
              role="row"
              data-item-id={item.id}
              className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line px-4 py-3 @sm:grid-cols-3 @lg:grid-cols-5"
            >
              <td
                role="cell"
                className="col-span-full block min-w-0 font-medium [overflow-wrap:anywhere]"
              >
                {item.description}
              </td>
              <Figure label="Cantidad">{formatQuantity(item.quantity)}</Figure>
              <Figure label="Precio unitario">{formatCents(item.unitPriceCents)}</Figure>
              <Figure label="IVA">{formatTaxRate(item.taxRateBp)}</Figure>
              <Figure label="Base">{formatCents(item.subtotalCents)}</Figure>
              <Figure label="Importe IVA">{formatCents(item.taxCents)}</Figure>
              {editable ? (
                <td role="cell" className="col-span-full block">
                  <div className="flex flex-wrap items-start justify-end gap-2">
                    <EditItemDialog quoteId={quoteId} item={item} action={updateAction} />
                    <RemoveItemControl
                      quoteId={quoteId}
                      item={item}
                      action={removeAction}
                      onRemoved={onRemoved}
                    />
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Conceptos del presupuesto. En borrador se pueden añadir, editar y quitar; aceptado o rechazado es
 * de solo lectura (sin controles). Los importes mostrados son los calculados por PostgreSQL.
 */
export function QuoteItems({
  quoteId,
  items,
  editable,
  requestId,
  addAction,
  updateAction,
  removeAction,
}: Readonly<{
  quoteId: string;
  items: readonly QuoteItemView[];
  editable: boolean;
  requestId: string;
  addAction: Action;
  updateAction: Action;
  removeAction: Action;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  // La fila (y su botón) desaparece: el foco pasa al título de la sección.
  useEffect(() => {
    if (!removal) return;
    const inRow = document.activeElement?.closest(`[data-item-id="${removal.id}"]`);
    if (inRow || focusLost()) headingRef.current?.focus();
  }, [removal]);

  return (
    <section aria-labelledby="conceptos" className="flex min-w-0 flex-col gap-4">
      <LiveRegion>
        {removal ? <span key={removal.id}>{removal.message}</span> : undefined}
      </LiveRegion>
      <h2 id="conceptos" ref={headingRef} tabIndex={-1} className="text-base font-semibold">
        Conceptos
      </h2>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface p-5 text-sm text-ink-muted">
          {editable
            ? 'Este presupuesto todavía no tiene conceptos. Añade el primero para calcular el importe.'
            : 'Este presupuesto no tiene conceptos.'}
        </p>
      ) : (
        <ItemsTable
          quoteId={quoteId}
          items={items}
          editable={editable}
          updateAction={updateAction}
          removeAction={removeAction}
          onRemoved={setRemoval}
        />
      )}
      {editable ? <AddItemForm quoteId={quoteId} requestId={requestId} action={addAction} /> : null}
    </section>
  );
}
