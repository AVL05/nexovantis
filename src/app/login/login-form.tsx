'use client';

import { useActionState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { loginAction, type LoginState } from '@/features/auth/actions';

const initialState: LoginState = { error: null, email: '' };

export function LoginForm({ next }: Readonly<{ next: string }>) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

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
      <Field
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {state.error ? (
        <Alert tone="danger" data-testid="form-error">
          {state.error}
        </Alert>
      ) : null}
      <Button type="submit" size="lg" loading={pending}>
        {pending ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </Button>
    </form>
  );
}
