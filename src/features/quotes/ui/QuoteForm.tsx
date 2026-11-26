'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, FieldError, Label, inputClass } from '@/components/ui/Field';
import { submitKeepingValues, useFocusOnError } from '@/components/ui/forms';
import { LinkButton } from '@/components/ui/LinkButton';
import { Select } from '@/components/ui/Select';
import { IDLE_FORM, type FormState } from '@/lib/records/types';

import { QUOTE_LIMITS } from '../money';

type Person = { id: string; name: string };

/**
 * Formulario de alta y edición de presupuestos (cliente, título y descripción). Los importes se
 * gestionan como conceptos en el detalle. Validación de cliente con atributos HTML y de servidor con
 * Zod; los errores por campo y los valores enviados se conservan. En el alta, `requestId` identifica
 * el envío (un doble envío no duplica el presupuesto).
 */
export function QuoteForm({
  action,
  initial,
  submitLabel,
  cancelHref,
  requestId,
  quoteId,
  customers,
}: Readonly<{
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: Record<string, string>;
  submitLabel: string;
  cancelHref: string;
  requestId?: string;
  quoteId?: string;
  customers: readonly Person[];
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
      {quoteId ? <input type="hidden" name="id" value={quoteId} /> : null}
      {state.status === 'error' && state.message ? (
        <div ref={errorRef} tabIndex={-1}>
          <Alert tone="danger" data-testid="form-error">
            {state.message}
          </Alert>
        </div>
      ) : null}

      {customers.length > 0 ? (
        <Select
          label="Cliente"
          name="customer_id"
          required
          placeholder="Selecciona un cliente"
          defaultValue={values.customer_id ?? ''}
          error={errors.customer_id}
          options={customers.map((c) => ({ value: c.id, label: c.name }))}
        />
      ) : (
        <Alert tone="warning" title="No hay clientes activos">
          Crea un cliente antes de registrar un presupuesto.
        </Alert>
      )}

      <Field
        label="Título"
        name="title"
        required
        maxLength={QUOTE_LIMITS.title}
        autoComplete="off"
        defaultValue={values.title ?? ''}
        error={errors.title}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Descripción</Label>
        <textarea
          id="description"
          name="description"
          rows={5}
          maxLength={QUOTE_LIMITS.description}
          defaultValue={values.description ?? ''}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? 'description-error' : undefined}
          className={`${inputClass} h-auto min-h-28 py-2`}
        />
        {errors.description ? (
          <FieldError id="description-error">{errors.description}</FieldError>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending} disabled={customers.length === 0}>
          {pending ? 'Guardando…' : submitLabel}
        </Button>
        <LinkButton href={cancelHref} variant="secondary">
          Cancelar
        </LinkButton>
      </div>
    </form>
  );
}
