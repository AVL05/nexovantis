// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Prueba independiente de Testing (TASK-010 PRE, A02-01 y A02-07). Develop no la modifica.
//
// Contrato de UI de /login (src/app/login/page.tsx, Server Component asincrono con
// `searchParams: Promise<...>`):
//   - ?aviso=cierre-no-confirmado  -> un elemento con data-testid="logout-notice" y role "status"
//     o "alert" que (a) dice que no se pudo confirmar el cierre de sesion en el servidor,
//     (b) indica que la sesion se cerro en ESTE navegador/dispositivo y (c) NO afirma un cierre
//     completo o remoto. El texto es fijo: nunca se refleja el valor del parametro.
//   - Cualquier otro valor de `aviso` (o ausencia) -> sin aviso.
//   - `next` valido (incluidos parametros codificados) se conserva en el campo oculto del formulario.

vi.mock('@/features/auth/session', () => ({ hasValidSession: vi.fn(async () => false) }));
vi.mock('@/features/auth/actions', () => ({ loginAction: vi.fn(), logoutAction: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect inesperado');
  }),
}));

import LoginPage from '@/app/login/page';

afterEach(cleanup);

async function renderLogin(params: Record<string, string | string[]>) {
  // El tipo de searchParams lo amplia Develop con `aviso`; aqui se evita acoplar la firma.
  const ui = await LoginPage({ searchParams: Promise.resolve(params) as never });
  return render(ui);
}

describe('A02-01 /login: aviso de cierre de sesion no confirmado', () => {
  it('muestra un aviso anunciable que no afirma un cierre remoto', async () => {
    await renderLogin({ aviso: 'cierre-no-confirmado' });
    const notice = screen.getByTestId('logout-notice');
    expect(['status', 'alert']).toContain(notice.getAttribute('role'));
    const text = (notice.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toMatch(/no se pudo confirmar/i);
    expect(text).toMatch(/(este|en este) (navegador|dispositivo|equipo)/i);
    // No debe contradecir el estado real: ni "cerrada correctamente" ni cierre en el servidor/todos.
    expect(text).not.toMatch(/cerrada? correctamente|sesi[oó]n cerrada\b(?! en este)/i);
    expect(text).not.toMatch(
      /(en|de) todos los dispositivos|revocad[ao]|invalidad[ao] en el servidor/i,
    );
    // El formulario de acceso sigue disponible.
    expect(screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it.each([
    [{}],
    [{ aviso: '' }],
    [{ aviso: 'otra-cosa' }],
    [{ aviso: '<img src=x onerror=alert(1)>' }],
    [{ aviso: ['cierre-no-confirmado', 'x'] }],
  ])('sin aviso para %j y sin reflejar el valor recibido', async (params) => {
    const { container } = await renderLogin(params as Record<string, string | string[]>);
    if (Array.isArray((params as { aviso?: unknown }).aviso)) {
      // Parametro repetido: no debe fallar; ambos comportamientos son seguros.
      expect(container.querySelector('script, img[onerror]')).toBeNull();
      return;
    }
    expect(screen.queryByTestId('logout-notice')).toBeNull();
    expect(container.innerHTML).not.toContain('otra-cosa');
    expect(container.querySelector('img[onerror]')).toBeNull();
  });
});

describe('A02-07 /login: el destino codificado se conserva en el formulario', () => {
  it.each([
    '/customers?q=Mar%C3%ADa%20L%C3%B3pez',
    '/customers?q=100%25',
    '/technicians?q=Jos%C3%A9&estado=archivados&page=2',
  ])('next=%s llega al campo oculto sin cambios', async (next) => {
    const { container } = await renderLogin({ next });
    const hidden = container.querySelector<HTMLInputElement>('input[type="hidden"][name="next"]');
    expect(hidden?.value).toBe(next);
  });

  it.each(['//evil.example', '/%2F%2Fevil.example', 'https://evil.example', '/\\evil.example'])(
    'next hostil %s se sustituye por /dashboard',
    async (next) => {
      const { container } = await renderLogin({ next });
      const hidden = container.querySelector<HTMLInputElement>('input[type="hidden"][name="next"]');
      expect(hidden?.value).toBe('/dashboard');
    },
  );
});
