'use client';

import { useActionState } from 'react';

import { loginAction, type LoginState } from '@/features/auth/actions';

const initialState: LoginState = { error: null, email: '' };

export function LoginForm({ next }: Readonly<{ next: string }>) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className="rounded border border-current bg-transparent px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded border border-current bg-transparent px-3 py-2"
        />
      </div>
      <div aria-live="polite">
        {state.error ? (
          <p data-testid="form-error" role="alert" className="text-sm font-medium text-red-700">
            {state.error}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </button>
    </form>
  );
}
