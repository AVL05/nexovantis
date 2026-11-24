// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/shell/AppShell';
import { NAV_ITEMS } from '@/features/navigation/items';

// Regresión TASK-008B-DEV2: el panel móvil se quedaba abierto (y su capa oscurecía el contenido)
// al pulsar la ruta actual, al cambiar de ruta y al pasar a escritorio.

const nav = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} onClick={(event) => event.preventDefault()} {...rest}>
      {children}
    </a>
  ),
}));

const logout = <button type="submit">Cerrar sesión</button>;

function renderShell() {
  const ui = () => (
    <AppShell
      items={NAV_ITEMS}
      current="dashboard"
      organizationName="Org Ficticia"
      roleLabel="Propietario"
      actions={logout}
    >
      <h1>Panel</h1>
    </AppShell>
  );
  const view = render(ui());
  return { ...view, rerenderShell: () => view.rerender(ui()) };
}

const overlay = () => document.querySelector('div[aria-hidden="true"].fixed.inset-0');
const toggle = () => screen.getByRole('button', { name: 'Menú' });

beforeEach(() => {
  nav.pathname = '/dashboard';
  document.body.style.overflow = '';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ShellFrame: panel móvil', () => {
  it('cerrado: sin capa, sin inert y sin bloqueo de scroll', () => {
    const { container } = renderShell();
    expect(overlay()).toBeNull();
    expect(container.querySelector('[inert]')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('abierto: capa, resto inerte y body sin scroll; al cerrar se restaura todo', () => {
    const { container } = renderShell();
    fireEvent.click(toggle());
    expect(overlay()).not.toBeNull();
    expect(container.querySelector('[inert]')).not.toBeNull();
    expect(container.querySelector('[inert] main')).not.toBeNull();
    expect(document.getElementById('app-nav')?.closest('[inert]')).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(overlay()).toBeNull();
    expect(container.querySelector('[inert]')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(toggle());
  });

  it('pulsar el enlace de la ruta actual cierra el panel y quita la capa', () => {
    renderShell();
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('link', { name: 'Panel' }));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(overlay()).toBeNull();
  });

  it('cambiar de ruta con el panel abierto lo cierra', () => {
    const { rerenderShell } = renderShell();
    fireEvent.click(toggle());
    nav.pathname = '/customers';
    rerenderShell();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(overlay()).toBeNull();
  });

  it('el botón del panel y la capa lo cierran', () => {
    renderShell();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar panel' }));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle());
    fireEvent.click(overlay()!);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('al cruzar a escritorio (matchMedia) se cierra y no vuelve a abrirse', () => {
    let listener: ((event: { matches: boolean }) => void) | null = null;
    const mql = {
      matches: false,
      addEventListener: (_: string, cb: (event: { matches: boolean }) => void) => {
        listener = cb;
      },
      removeEventListener: () => {
        listener = null;
      },
    };
    vi.stubGlobal('matchMedia', () => mql);
    window.matchMedia = (() => mql) as unknown as typeof window.matchMedia;

    renderShell();
    fireEvent.click(toggle());
    expect(overlay()).not.toBeNull();

    act(() => listener?.({ matches: true }));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(overlay()).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('cabecera móvil', () => {
  it('menú con nombre accesible y organización/rol una sola vez', () => {
    const { container } = renderShell();
    expect(toggle()).toHaveAttribute('aria-controls', 'app-nav');
    expect(container.querySelectorAll('[data-testid="org-name"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="user-role"]')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /cerrar sesi/i })).toHaveLength(1);
  });
});
