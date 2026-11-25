// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// TASK-010 P-02 (Develop): con doble fallo de cierre (Auth + borrado local) la sesion sigue viva.
// /login no debe redirigir al panel: avisa de que NO se cerro y ofrece reintentar.

const h = vi.hoisted(() => ({
  hasValidSession: vi.fn(),
  cookies: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  logoutAction: vi.fn(),
}));

vi.mock('@/features/auth/session', () => ({ hasValidSession: h.hasValidSession }));
vi.mock('@/features/auth/actions', () => ({ loginAction: vi.fn(), logoutAction: h.logoutAction }));
vi.mock('next/headers', () => ({ cookies: h.cookies }));
vi.mock('next/navigation', () => ({ redirect: h.redirect }));

import LoginPage from '@/app/login/page';
import { getLocalSessionState, hasLocalSessionCookies } from '@/features/auth/local-session';

const jar = (names: string[]) => ({ getAll: () => names.map((name) => ({ name, value: 'x' })) });

async function renderLogin(params: Record<string, string | string[]>) {
  return render(await LoginPage({ searchParams: Promise.resolve(params) as never }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.hasValidSession.mockResolvedValue(true); // sesion viva
  h.cookies.mockResolvedValue(jar(['sb-proyecto-auth-token.0', 'theme']));
});
afterEach(cleanup);

describe('hasLocalSessionCookies', () => {
  it.each([
    [['sb-proyecto-auth-token'], true],
    [['sb-proyecto-auth-token.0', 'sb-proyecto-auth-token.1'], true],
    [['theme', 'sbx-auth-token', 'sb-proyecto-auth-token.x'], false],
    [[], false],
  ])('%j -> %s', async (names, expected) => {
    h.cookies.mockResolvedValue(jar(names));
    expect(await hasLocalSessionCookies()).toBe(expected);
  });

  it('sin almacen de cookies no hay evidencia de sesion viva', async () => {
    h.cookies.mockRejectedValue(new Error('sin contexto'));
    expect(await hasLocalSessionCookies()).toBe(false);
  });
});

describe('getLocalSessionState (TASK-010B B-02)', () => {
  it.each([
    [['sb-proyecto-auth-token.0', 'theme'], 'present'],
    [['theme'], 'absent'],
    [[], 'absent'],
  ])('%j -> %s', async (names, expected) => {
    h.cookies.mockResolvedValue(jar(names));
    expect(await getLocalSessionState()).toBe(expected);
  });

  it('cookies() que rechaza -> unreadable', async () => {
    h.cookies.mockRejectedValue(new Error('sin contexto'));
    expect(await getLocalSessionState()).toBe('unreadable');
  });

  it('getAll() que lanza -> unreadable', async () => {
    h.cookies.mockResolvedValue({
      getAll: () => {
        throw new Error('ilegible');
      },
    });
    expect(await getLocalSessionState()).toBe('unreadable');
  });
});

describe('/login con cookies ilegibles', () => {
  it('con el aviso no afirma el cierre local, no redirige y ofrece reintento', async () => {
    h.cookies.mockRejectedValue(new Error('ilegible'));
    const { container } = await renderLogin({ aviso: 'cierre-no-confirmado' });
    expect(h.redirect).not.toHaveBeenCalled();
    const notice = screen.getByTestId('logout-unknown-notice');
    expect(notice).toHaveAttribute('role', 'alert');
    expect(notice.textContent).toMatch(/no se pudo/i);
    expect(container.textContent).not.toMatch(/se cerró en este navegador/i);
    expect(screen.queryByTestId('logout-notice')).toBeNull();
    expect(screen.queryByTestId('logout-failed-notice')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reintentar cierre de sesión' })).toBeEnabled();
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
  });

  it('sin el aviso no cambia nada: sesion viva redirige al panel', async () => {
    h.cookies.mockRejectedValue(new Error('ilegible'));
    await expect(renderLogin({})).rejects.toThrow('REDIRECT /dashboard');
  });
});

describe('/login con doble fallo de cierre', () => {
  it('con sesion viva y aviso no redirige: muestra aviso de fallo y boton de reintento', async () => {
    await renderLogin({ aviso: 'cierre-no-confirmado', next: '/customers' });
    expect(h.redirect).not.toHaveBeenCalled();
    const notice = screen.getByTestId('logout-failed-notice');
    expect(notice).toHaveAttribute('role', 'alert');
    const text = (notice.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toMatch(/no se pudo cerrar/i);
    expect(text).toMatch(/sigue abierta/i);
    expect(screen.queryByTestId('logout-notice')).toBeNull();
    const retry = screen.getByRole('button', { name: 'Reintentar cierre de sesión' });
    expect(retry).toHaveAttribute('type', 'submit');
    expect(retry.closest('form')).not.toBeNull();
    // Sin formulario de acceso mientras la sesion sigue abierta.
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
  });

  it('sin cookies de sesion muestra el aviso habitual (cierre local logrado)', async () => {
    h.hasValidSession.mockResolvedValue(false);
    h.cookies.mockResolvedValue(jar(['theme']));
    await renderLogin({ aviso: 'cierre-no-confirmado' });
    expect(screen.getByTestId('logout-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('logout-failed-notice')).toBeNull();
    expect(screen.queryByRole('button', { name: /Reintentar/ })).toBeNull();
  });

  it.each([[{}], [{ aviso: 'otra-cosa' }], [{ aviso: ['cierre-no-confirmado', 'x'] }]])(
    'con sesion viva y sin el aviso exacto (%j) sigue redirigiendo al panel',
    async (params) => {
      await expect(renderLogin(params as Record<string, string | string[]>)).rejects.toThrow(
        'REDIRECT /dashboard',
      );
      expect(h.redirect).toHaveBeenCalledWith('/dashboard');
    },
  );

  it('no refleja texto arbitrario del query', async () => {
    const { container } = await renderLogin({ aviso: 'cierre-no-confirmado', x: '<b>evil</b>' });
    expect(container.innerHTML).not.toContain('evil');
  });
});
