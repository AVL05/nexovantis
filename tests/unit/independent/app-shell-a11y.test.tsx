// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AppShell } from '@/components/shell/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { NAV_ITEMS } from '@/features/navigation/items';

// Pruebas independientes de Testing (TASK-008A). Develop no las modifica.

afterEach(cleanup);

const logout = <button type="submit">Cerrar sesión</button>;

function shell(props: Partial<Parameters<typeof AppShell>[0]> = {}) {
  return render(
    <AppShell
      items={NAV_ITEMS}
      current="dashboard"
      organizationName="Org Ficticia"
      roleLabel="Propietario"
      actions={logout}
      {...props}
    >
      <h1>Panel</h1>
    </AppShell>,
  );
}

describe('AppShell', () => {
  it('estructura: landmarks, un h1, testids y logout unicos', () => {
    const { container } = shell();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="org-name"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="user-role"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="access-denied"]')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /cerrar sesi/i })).toHaveLength(1);
  });

  it('sin membresia no hay org-name ni user-role', () => {
    const { container } = shell({
      organizationName: null,
      roleLabel: null,
      userEmail: 'a@b.test',
    });
    expect(container.querySelector('[data-testid="org-name"]')).toBeNull();
    expect(container.querySelector('[data-testid="user-role"]')).toBeNull();
  });

  it('navegacion: Panel con aria-current; otros sin enlace', () => {
    shell();
    const nav = screen.getByRole('navigation');
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/dashboard');
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    for (const label of ['Clientes', 'Técnicos', 'Órdenes']) {
      expect(within(nav).getByText(label).closest('a')).toBeNull();
    }
    expect(NAV_ITEMS.filter((i) => i.href).map((i) => i.href)).toEqual(['/dashboard']);
  });

  it('menu movil: aria-expanded/aria-controls, Escape cierra y devuelve foco', () => {
    shell();
    const toggle = screen.getByRole('button', { name: /men/i });
    const controls = toggle.getAttribute('aria-controls')!;
    expect(document.getElementById(controls)).not.toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const link = screen.getByRole('link', { name: /panel/i });
    link.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(toggle);

    // Segundo toggle: abrir y cerrar con el boton
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('panel cerrado: no enfocable (invisible por clase) y abierto: visible', () => {
    shell();
    const toggle = screen.getByRole('button', { name: /men/i });
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(panel.className).toMatch(/\binvisible\b/);
    fireEvent.click(toggle);
    expect(panel.className).toMatch(/\bvisible\b/);
    expect(panel.className).not.toMatch(/(^|\s)invisible\b/);
  });
});

describe('componentes ui', () => {
  it('Field: label, aria-describedby y aria-invalid', () => {
    render(<Field label="Correo" name="e" hint="Ayuda" error="Error" />);
    const input = screen.getByLabelText('Correo');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(document.getElementById(id)).not.toBeNull();
  });

  it('Field sin error no marca aria-invalid', () => {
    render(<Field label="Correo" name="e" />);
    expect(screen.getByLabelText('Correo')).not.toHaveAttribute('aria-invalid');
  });

  it('Button loading: deshabilitado, aria-busy y conserva nombre; type por defecto button', () => {
    render(<Button loading>Guardar</Button>);
    const b = screen.getByRole('button', { name: /guardar/i });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
    expect(b).toHaveAttribute('type', 'button');
  });

  it('Alert danger usa role alert y propaga data-testid', () => {
    render(
      <Alert tone="danger" data-testid="form-error">
        Mal
      </Alert>,
    );
    expect(screen.getByTestId('form-error')).toHaveAttribute('role', 'alert');
  });
});
