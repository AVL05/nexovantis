import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/app/login/login-form';

// TASK-014 / H-19: con credenciales rechazadas el foco va al mensaje, sin robarlo.

const h = vi.hoisted(() => ({ loginAction: vi.fn() }));
vi.mock('@/features/auth/actions', () => ({ loginAction: h.loginAction }));

afterEach(cleanup);

function setup() {
  let resolve!: () => void;
  h.loginAction.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = () => done({ error: 'Credenciales rechazadas.', email: 'a@ejemplo.test' });
      }),
  );
  render(<LoginForm next="/dashboard" />);
  const submit = async () => {
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'a@ejemplo.test' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'ficticia' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Iniciar sesión|Iniciando/ }));
    });
  };
  return { submit, fail: () => act(async () => resolve()) };
}

describe('H-19 acceso rechazado', () => {
  it('foco en el mensaje, también en el segundo intento', async () => {
    const { submit, fail } = setup();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await submit();
      await fail();
      expect(screen.getByTestId('form-error')).toHaveAttribute('role', 'alert');
      expect(screen.getByTestId('form-error').parentElement).toHaveFocus();
      (document.activeElement as HTMLElement).blur();
    }
  });

  it('no roba el foco si el usuario ya está en un campo', async () => {
    const { submit, fail } = setup();
    await submit();
    const email = screen.getByLabelText('Correo electrónico');
    email.focus();
    await fail();
    expect(email).toHaveFocus();
  });
});
