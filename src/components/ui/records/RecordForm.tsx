'use client';

import { useActionState } from 'react';

import { IDLE_FORM, type FormState, type RecordModule } from '@/lib/records/types';

import { Alert } from '../Alert';
import { Button } from '../Button';
import { LinkButton } from '../LinkButton';
import { Field, FieldError, Label, inputClass } from '../Field';
import { useFocusOnError } from '../forms';

/**
 * Formulario de alta/edición. Validación de cliente con atributos HTML (required, maxLength,
 * type=email) y de servidor con Zod; los errores por campo y los valores enviados se conservan.
 */
export function RecordForm({
  module,
  action,
  initial,
  submitLabel,
  cancelHref,
  recordId,
}: Readonly<{
  module: RecordModule;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: Record<string, string>;
  submitLabel: string;
  cancelHref: string;
  /** Presente solo al editar: se envía como campo oculto y el servidor lo valida. */
  recordId?: string;
}>) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM);
  const values = state.values ?? initial;
  const errors = state.fieldErrors ?? {};
  const errorRef = useFocusOnError(state);
  const notesError = errors.notes;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      {recordId ? <input type="hidden" name="id" value={recordId} /> : null}
      {state.status === 'error' && state.message ? (
        <div ref={errorRef} tabIndex={-1}>
          <Alert tone="danger" data-testid="form-error">
            {state.message}
          </Alert>
        </div>
      ) : null}
      <Field
        label={module.nameLabel}
        name={module.nameField}
        required
        maxLength={module.nameMaxLength}
        autoComplete="off"
        defaultValue={values[module.nameField] ?? ''}
        error={errors[module.nameField]}
      />
      <Field
        label="Correo electrónico"
        name="email"
        type="email"
        maxLength={module.emailMaxLength}
        autoComplete="off"
        defaultValue={values.email ?? ''}
        error={errors.email}
      />
      <Field
        label="Teléfono"
        name="phone"
        type="tel"
        maxLength={module.phoneMaxLength}
        autoComplete="off"
        defaultValue={values.phone ?? ''}
        error={errors.phone}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notas</Label>
        <textarea
          id="notes"
          name="notes"
          rows={5}
          maxLength={module.notesMaxLength}
          defaultValue={values.notes ?? ''}
          aria-invalid={notesError ? true : undefined}
          aria-describedby={notesError ? 'notes-error' : undefined}
          className={`${inputClass} h-auto min-h-28 py-2`}
        />
        {notesError ? <FieldError id="notes-error">{notesError}</FieldError> : null}
      </div>
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
