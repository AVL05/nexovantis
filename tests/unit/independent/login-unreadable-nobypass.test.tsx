// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prueba independiente de Testing (TASK-010B RETEST, B-02). Develop no la modifica.
// Con el almacen de cookies ilegible: el estado indeterminado solo se activa con el aviso EXACTO,
// nunca refleja `next`/`aviso`, no ofrece el formulario de acceso (sin destino que desviar) y el
// reintento apunta a la accion de cierre (sin parametros).

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

const AVISO = 'cierre-no-confirmado';
const renderLogin = async (params: Record<string, string | string[]>) =>
  render(await LoginPage({ searchParams: Promise.resolve(params) as never }));

beforeEach(() => {
  vi.clearAllMocks();
  h.hasValidSession.mockResolvedValue(true);
  h.cookies.mockRejectedValue(new Error('almacen ilegible'));
});
afterEach(cleanup);

describe('B-02 cookies ilegibles: sin bypass ni reflejo', () => {
  it.each(['//evil.example', 'https://evil.example', '/\\evil.example', '/customers?q=<b>x</b>'])(
    'aviso exacto + next hostil %s: no redirige, no refleja y no hay formulario de acceso',
    async (next) => {
      const { container } = await renderLogin({ aviso: AVISO, next });
      expect(h.redirect).not.toHaveBeenCalled();
      expect(screen.getByTestId('logout-unknown-notice')).toBeInTheDocument();
      expect(container.innerHTML).not.toContain('evil.example');
      expect(container.innerHTML).not.toContain('<b>x');
      expect(container.querySelector('input[name="next"]')).toBeNull();
      expect(screen.queryByLabelText('Contraseña')).toBeNull();
      // El reintento es un formulario que solo apunta a la accion de cierre.
      const retry = screen.getByTestId('logout-retry');
      expect(retry).toBeEnabled();
      expect(retry.closest('form')).not.toBeNull();
      expect(container.querySelectorAll('form input[type="hidden"][name="next"]')).toHaveLength(0);
    },
  );

  it.each([
    ['otro valor', 'otra-cosa'],
    ['mayusculas', 'CIERRE-NO-CONFIRMADO'],
    ['con sufijo', `${AVISO}x`],
    ['vacio', ''],
  ])(
    'aviso inexacto (%s): estado normal (sesion viva -> /dashboard), sin aviso de incertidumbre',
    async (_n, aviso) => {
      await expect(renderLogin({ aviso })).rejects.toThrow('REDIRECT /dashboard');
      expect(screen.queryByTestId('logout-unknown-notice')).toBeNull();
    },
  );

  it('aviso duplicado (array) no activa el estado indeterminado', async () => {
    await expect(renderLogin({ aviso: [AVISO, AVISO] })).rejects.toThrow('REDIRECT /dashboard');
  });

  it('ilegible sin aviso y sin sesion: formulario de acceso normal, sin avisos ni reintento', async () => {
    h.hasValidSession.mockResolvedValue(false);
    await renderLogin({});
    expect(screen.queryByTestId('logout-unknown-notice')).toBeNull();
    expect(screen.queryByTestId('logout-retry')).toBeNull();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  it('ilegible con aviso no consulta la sesion de Auth ni redirige al panel aunque sea valida', async () => {
    h.hasValidSession.mockResolvedValue(true);
    await renderLogin({ aviso: AVISO });
    expect(h.hasValidSession).not.toHaveBeenCalled();
    expect(h.redirect).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/se cerró en este navegador|sesión cerrada/i);
  });
});
