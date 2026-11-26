'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, FieldError, Label, inputClass } from '@/components/ui/Field';
import { submitKeepingValues, useFocusOnError } from '@/components/ui/forms';
import { LinkButton } from '@/components/ui/LinkButton';
import { Select } from '@/components/ui/Select';
import { IDLE_FORM, type FormState } from '@/lib/records/types';

import { INVENTORY_LIMITS, UNITS, UNIT_LABEL } from '../constants';

/**
 * Formulario de alta y edición de artículos. La referencia solo se fija en el alta (INV-2) y el saldo
 * no se edita nunca: la existencia inicial se registra como una entrada en el detalle (INV-3). Validación
 * de cliente con atributos HTML y de servidor con Zod; los errores por campo y los valores enviados se
 * conservan. En el alta, `requestId` identifica el envío (un doble envío no duplica el artículo).
 */
export function InventoryForm({
  action,
  initial,
  submitLabel,
  cancelHref,
  requestId,
  itemId,
  reference,
}: Readonly<{
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: Record<string, string>;
  submitLabel: string;
  cancelHref: string;
  requestId?: string;
  itemId?: string;
  /** Edición: referencia (solo lectura). */
  reference?: string;
}>) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM);
  const values = state.values ?? initial;
  const errors = state.fieldErrors ?? {};
  const errorRef = useFocusOnError(state);

  return (
    <form
      action={formAction}
      onSubmit={submitKeepingValues(formAction)}
      className="flex max-w-2xl flex-col gap-5"
    >
      {requestId ? <input type="hidden" name="request_id" value={requestId} /> : null}
      {itemId ? <input type="hidden" name="id" value={itemId} /> : null}
      {state.status === 'error' && state.message ? (
        <div ref={errorRef} tabIndex={-1}>
          <Alert tone="danger" data-testid="form-error">
            {state.message}
          </Alert>
        </div>
      ) : null}

      {reference ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Referencia</span>
          <span className="font-mono text-sm text-ink" data-testid="item-reference">
            {reference}
          </span>
          <p className="text-sm text-ink-muted">La referencia no se puede cambiar tras el alta.</p>
        </div>
      ) : (
        <Field
          label="Referencia"
          name="reference"
          required
          maxLength={INVENTORY_LIMITS.reference}
          autoComplete="off"
          defaultValue={values.reference ?? ''}
          error={errors.reference}
          hint="Código interno único en tu organización (no distingue mayúsculas). No se podrá cambiar."
        />
      )}

      <Field
        label="Nombre"
        name="name"
        required
        maxLength={INVENTORY_LIMITS.name}
        autoComplete="off"
        defaultValue={values.name ?? ''}
        error={errors.name}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Descripción</Label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={INVENTORY_LIMITS.description}
          defaultValue={values.description ?? ''}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? 'description-error' : undefined}
          className={`${inputClass} h-auto min-h-24 py-2`}
        />
        {errors.description ? (
          <FieldError id="description-error">{errors.description}</FieldError>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Select
          label="Unidad"
          name="unit"
          required
          defaultValue={values.unit || 'ud'}
          error={errors.unit}
          options={UNITS.map((unit) => ({ value: unit, label: UNIT_LABEL[unit] }))}
        />
        <Field
          label="Umbral de stock bajo"
          name="low_stock_threshold"
          type="number"
          inputMode="numeric"
          min={0}
          max={INVENTORY_LIMITS.maxThreshold}
          step={1}
          defaultValue={values.low_stock_threshold ?? '0'}
          error={errors.low_stock_threshold}
          hint="Se marca «stock bajo» cuando el saldo es positivo y no supera el umbral. 0 lo desactiva."
        />
      </div>

      {!reference ? (
        <Alert tone="info">
          El artículo se crea con saldo 0. Registra su existencia inicial como una entrada desde el
          detalle.
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending}>
          {pending ? 'Guardando…' : submitLabel}
        </Button>
        <LinkButton href={cancelHref} variant="secondary">
          Cancelar
        </LinkButton>
      </div>
    </form>
  );
}
