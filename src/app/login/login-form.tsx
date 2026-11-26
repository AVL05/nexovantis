'use client';

import { useActionState, useId, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Label, inputClass } from '@/components/ui/Field';
import { useFocusOnError } from '@/components/ui/forms';
import { loginAction, type LoginState } from '@/features/auth/actions';

const initialState: LoginState = { error: null, email: '' };

/** Contraseña con botón accesible para mostrarla u ocultarla. No envía el formulario. */
export function PasswordField() {
  const inputId = useId();
  const [visible, setVisible] = useState(false);
  const label = visible ? 'Ocultar' : 'Mostrar';

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>Contraseña</Label>
      <div className="relative">
        <input
          id={inputId}
          name="password"
          type={visible ? 'text' : 'password'}
          autoComplete="current-password"
          required
          className={`${inputClass} pr-20`}
        />
        <button
          type="button"
          aria-controls={inputId}
          onClick={() => setVisible((value) => !value)}
          className="absolute inset-y-0 right-0 inline-flex min-w-16 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium text-accent hover:text-accent-hover hover:underline"
        >
          {label} <span className="sr-only">contraseña</span>
        </button>
      </div>
    </div>
  );
}

export function LoginForm({ next }: Readonly<{ next: string }>) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const errorRef = useFocusOnError(state);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <Field
        label="Correo electrónico"
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.email}
      />
      <PasswordField />
      {state.error ? (
        <div ref={errorRef} tabIndex={-1}>
          <Alert tone="danger" data-testid="form-error">
            {state.error}
          </Alert>
        </div>
      ) : null}
      <Button type="submit" size="lg" loading={pending}>
        {pending ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </Button>
    </form>
  );
}
