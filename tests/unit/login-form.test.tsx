// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/app/login/login-form';

vi.mock('@/features/auth/actions', () => ({ loginAction: vi.fn() }));

afterEach(cleanup);

describe('LoginForm: mostrar/ocultar contraseña', () => {
  it('alterna type y nombre accesible sin enviar el formulario', () => {
    render(<LoginForm next="/dashboard" />);
    const input = screen.getByLabelText('Contraseña');
    const submit = vi.fn((event: Event) => event.preventDefault());
    input.closest('form')!.addEventListener('submit', submit);

    const toggle = screen.getByRole('button', { name: 'Mostrar contraseña' });
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-controls', input.id);
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'current-password');

    fireEvent.click(toggle);
    const hide = screen.getByRole('button', { name: 'Ocultar contraseña' });
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('autocomplete', 'current-password');

    fireEvent.click(hide);
    expect(input).toHaveAttribute('type', 'password');
    expect(submit).not.toHaveBeenCalled();
  });
});
