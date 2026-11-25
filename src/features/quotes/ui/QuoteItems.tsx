'use client';

import { useActionState, useId, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { LiveRegion } from '@/components/ui/LiveRegion';
import { Select } from '@/components/ui/Select';
import { Table, Td, Th } from '@/components/ui/Table';

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
      return next;
    },
    IDLE,
  );

  return (
    <form
      action={formAction}
      aria-labelledby={`${idPrefix}-title`}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5"
    >
      <h3 id={`${idPrefix}-title`} className="text-base font-semibold">
        Añadir concepto
      </h3>
      <input type="hidden" name="quote_id" value={quoteId} />
      <input type="hidden" name="request_id" value={requestId} />
      {state.status === 'error' ? <Alert tone="danger">{state.message}</Alert> : null}
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
      return next;
    },
    IDLE,
  );

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setValues(initial);
          setOpen(true);
        }}
        aria-label={`Editar concepto ${item.description}`}
      >
        Editar
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Editar concepto"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Volver
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              Guardar concepto
            </Button>
          </>
        }
      >
        <form id={formId} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="quote_id" value={quoteId} />
          {state.status === 'error' ? <Alert tone="danger">{state.message}</Alert> : null}
          <ItemFields
            idPrefix={idPrefix}
            values={values}
            onChange={setValues}
            errors={state.fieldErrors ?? {}}
          />
        </form>
      </Dialog>
    </>
  );
}

function RemoveItemForm({
  quoteId,
  item,
  action,
}: Readonly<{ quoteId: string; item: QuoteItemView; action: Action }>) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="quote_id" value={quoteId} />
      <Button
        type="submit"
        variant="danger"
        size="sm"
        loading={pending}
        aria-label={`Quitar concepto ${item.description}`}
      >
        Quitar
      </Button>
      {state.status === 'error' ? (
        <span role="alert" className="max-w-48 text-xs font-medium text-danger">
          {state.message}
        </span>
      ) : null}
    </form>
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
  return (
    <section aria-labelledby="conceptos" className="flex min-w-0 flex-col gap-4">
      <h2 id="conceptos" className="text-base font-semibold">
        Conceptos
      </h2>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-surface p-5 text-sm text-ink-muted">
          {editable
            ? 'Este presupuesto todavía no tiene conceptos. Añade el primero para calcular el importe.'
            : 'Este presupuesto no tiene conceptos.'}
        </p>
      ) : (
        <Table caption="Conceptos del presupuesto">
          <thead>
            <tr>
              <Th className="min-w-48">Concepto</Th>
              <Th className="text-right whitespace-nowrap">Cantidad</Th>
              <Th className="text-right whitespace-nowrap">Precio unitario</Th>
              <Th className="text-right whitespace-nowrap">IVA</Th>
              <Th className="text-right whitespace-nowrap">Base</Th>
              <Th className="text-right whitespace-nowrap">Importe IVA</Th>
              {editable ? (
                <Th className="whitespace-nowrap">
                  <span className="sr-only">Acciones</span>
                </Th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <Td className="max-w-xs break-words">{item.description}</Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  {formatQuantity(item.quantity)}
                </Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  {formatCents(item.unitPriceCents)}
                </Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  {formatTaxRate(item.taxRateBp)}
                </Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  {formatCents(item.subtotalCents)}
                </Td>
                <Td className="text-right whitespace-nowrap tabular-nums">
                  {formatCents(item.taxCents)}
                </Td>
                {editable ? (
                  <Td className="whitespace-nowrap">
                    <div className="flex items-start gap-2">
                      <EditItemDialog quoteId={quoteId} item={item} action={updateAction} />
                      <RemoveItemForm quoteId={quoteId} item={item} action={removeAction} />
                    </div>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editable ? <AddItemForm quoteId={quoteId} requestId={requestId} action={addAction} /> : null}
    </section>
  );
}
