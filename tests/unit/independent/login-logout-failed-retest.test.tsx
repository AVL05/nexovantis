// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prueba independiente de Testing (TASK-010 RETEST P-02). Develop no la modifica.
//
// Requisito humano: si fallan a la vez la revocacion remota y el borrado local de cookies, el
// usuario recibe un aviso explicito de que NO se cerro su sesion y una opcion para reintentar.
//
// A diferencia de tests/unit/login-logout-failed.test.tsx (que simula la pagina con dobles de
// logoutAction), aqui se encadenan el logoutAction REAL, hasLocalSessionCookies REAL y la pagina
// REAL sobre un almacen de cookies compartido; solo se doblan Next, Supabase y hasValidSession.

const h = vi.hoisted(() => {
  class RedirectSignal extends Error {
    constructor(public readonly url: string) {
      super('NEXT_REDIRECT');
    }
  }
  return {
    RedirectSignal,
    redirect: vi.fn((url: string) => {
      throw new RedirectSignal(url);
    }),
    createClient: vi.fn(),
    cookies: vi.fn(),
    hasValidSession: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({ redirect: h.redirect }));
vi.mock('next/headers', () => ({ cookies: h.cookies }));
vi.mock('@/lib/supabase/server', () => ({ createClient: h.createClient }));
vi.mock('@/features/auth/session', () => ({ hasValidSession: h.hasValidSession }));

import LoginPage from '@/app/login/page';
import { logoutAction } from '@/features/auth/actions';
import { hasLocalSessionCookies } from '@/features/auth/local-session';

const SESSION = ['sb-proyecto-auth-token.0', 'sb-proyecto-auth-token.1'];
const AVISO = '/login?aviso=cierre-no-confirmado';
const AUTH_ERROR = { name: 'AuthApiError', message: 'tecnico-secreto-777', status: 500 };

function makeStore(initial: string[], opts: { deleteFails?: boolean } = {}) {
  const jar = new Set(initial);
  return {
    jar,
    getAll: () => [...jar].map((name) => ({ name, value: 'x' })),
    delete: vi.fn((name: string) => {
      if (opts.deleteFails) throw new Error('no se puede borrar');
      jar.delete(name);
    }),
  };
}
type Store = ReturnType<typeof makeStore>;
let store: Store;
const signOut = vi.fn();

const useStore = (next: Store) => {
  store = next;
  h.cookies.mockResolvedValue(store);
};

async function runLogout(): Promise<string> {
  try {
    await logoutAction();
  } catch (error) {
    if (error instanceof h.RedirectSignal) return error.url;
    throw error;
  }
  throw new Error('logoutAction termino sin redirigir');
}

/** Renderiza /login con la query de la URL de redireccion recibida. */
async function visit(url: string) {
  const query = Object.fromEntries(new URL(url, 'http://x.invalid').searchParams);
  return render(await LoginPage({ searchParams: Promise.resolve(query) as never }));
}

/**
 * Contrato B-02 para el estado "almacen de cookies ILEGIBLE" en /login?aviso=cierre-no-confirmado:
 * ni se afirma que la sesion local se cerro (ni que sigue abierta), se anuncia que no se pudo
 * confirmar/cerrar con role alert|status, y el reintento esta disponible.
 */
function expectLocalCloseUnknown(container: HTMLElement) {
  const text = (container.textContent ?? '').replace(/\s+/g, ' ');
  expect(text).not.toMatch(
    /se cerr[oó] en este navegador|sesi[oó]n cerrada|cerrada correctamente/i,
  );
  expect(text).not.toMatch(/revocad/i);
  const announced = [...container.querySelectorAll('[role="alert"], [role="status"]')];
  expect(announced.length, 'debe haber un aviso anunciable').toBeGreaterThan(0);
  expect(
    announced.some((el) => /no se pudo/i.test(el.textContent ?? '')),
    'el aviso debe decir que no se pudo cerrar/confirmar',
  ).toBe(true);
  const retry = screen.getByTestId('logout-retry');
  expect(retry).toBeEnabled();
  expect(retry).toHaveAttribute('type', 'submit');
  expect(retry.closest('form')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Reintentar cierre de sesión' })).toBeEnabled();
}

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockReset();
  h.createClient.mockImplementation(
    async (opts?: { revocation?: { requested: boolean; status: number | null } }) => ({
      auth: {
        // Doble fiel al transporte: un signOut sin error implica una peticion 2xx observada.
        signOut: async (...args: unknown[]) => {
          const res = await (
            signOut as (...a: unknown[]) => Promise<{ error: unknown } | undefined>
          )(...args);
          if (res && res.error === null && opts?.revocation) {
            opts.revocation.requested = true;
            opts.revocation.status = 200;
          }
          return res;
        },
      },
    }),
  );
  h.hasValidSession.mockResolvedValue(true);
  useStore(makeStore([...SESSION, 'theme']));
});
afterEach(cleanup);

describe('P-02 doble fallo: aviso explicito y reintento (flujo real encadenado)', () => {
  it('signOut con error + borrado local fallido -> /login muestra que NO se cerro y ofrece reintentar', async () => {
    useStore(makeStore([...SESSION, 'theme'], { deleteFails: true }));
    signOut.mockResolvedValue({ error: AUTH_ERROR });
    const url = await runLogout();
    expect(url).toBe(AVISO);
    expect(url).not.toContain('tecnico-secreto-777');
    expect(store.getAll().map((c) => c.name)).toEqual(expect.arrayContaining(SESSION));

    const { container } = await visit(url);
    expect(h.redirect).toHaveBeenCalledTimes(1); // solo el del logout; /login no redirige
    const notice = screen.getByTestId('logout-failed-notice');
    expect(notice).toHaveAttribute('role', 'alert');
    const text = (notice.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toMatch(/no se pudo cerrar/i);
    expect(text).toMatch(/sigue abierta/i);
    // No afirma un cierre: ni local ni remoto.
    expect(text).not.toMatch(/se cerr[oó]|cerrada correctamente|sesi[oó]n cerrada|revocad/i);
    expect(screen.queryByTestId('logout-notice')).toBeNull();
    expect(container.innerHTML).not.toContain('tecnico-secreto-777');
    expect(screen.getByRole('button', { name: 'Reintentar cierre de sesión' })).toBeEnabled();
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
    expect(container.querySelector('input[name="next"]')).toBeNull();
  });

  it('createClient lanza + almacen de cookies ilegible al borrar: aviso /login y, con cookies aun presentes, alerta', async () => {
    h.createClient.mockRejectedValue(new Error('sin configuracion'));
    // getAll funciona para la pagina pero delete falla (cookies siguen).
    useStore(makeStore(SESSION, { deleteFails: true }));
    const url = await runLogout();
    expect(url).toBe(AVISO);
    await visit(url);
    expect(screen.getByTestId('logout-failed-notice')).toBeInTheDocument();
  });

  it('reintento con exito -> /login simple, sin aviso ni alerta de fallo', async () => {
    useStore(makeStore(SESSION, { deleteFails: true }));
    signOut.mockResolvedValueOnce({ error: AUTH_ERROR });
    expect(await runLogout()).toBe(AVISO);

    // Reintento: Auth responde y la libreria borra la sesion local.
    signOut.mockImplementationOnce(async () => {
      store.jar.clear();
      return { error: null };
    });
    h.hasValidSession.mockResolvedValue(false);
    const retryUrl = await runLogout();
    expect(retryUrl).toBe('/login');
    expect(signOut).toHaveBeenCalledTimes(2);

    await visit(retryUrl);
    expect(screen.queryByTestId('logout-failed-notice')).toBeNull();
    expect(screen.queryByTestId('logout-notice')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('reintento que vuelve a fallar -> de nuevo aviso explicito (sin bucle ni falso cierre)', async () => {
    useStore(makeStore(SESSION, { deleteFails: true }));
    signOut.mockResolvedValue({ error: AUTH_ERROR });
    for (let i = 0; i < 2; i += 1) {
      const url = await runLogout();
      expect(url).toBe(AVISO);
      cleanup();
      await visit(url);
      expect(screen.getByTestId('logout-failed-notice')).toBeInTheDocument();
    }
  });

  it('A02-01 sin regresion: Auth falla pero el borrado local funciona -> aviso habitual, no el de fallo', async () => {
    signOut.mockResolvedValue({ error: AUTH_ERROR });
    const url = await runLogout();
    expect(url).toBe(AVISO);
    expect(store.getAll().map((c) => c.name)).toEqual(['theme']);
    h.hasValidSession.mockResolvedValue(false);
    await visit(url);
    expect(screen.getByTestId('logout-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('logout-failed-notice')).toBeNull();
    expect(screen.queryByRole('button', { name: /Reintentar/ })).toBeNull();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  it('A02-01 sin regresion: signOut confirmado -> /login exacto', async () => {
    signOut.mockImplementation(async () => {
      for (const n of SESSION) store.jar.delete(n);
      return { error: null };
    });
    expect(await runLogout()).toBe('/login');
  });

  it('el boton de reintento envia el formulario a logoutAction', async () => {
    // Con la pagina real, logoutAction es la accion real; se observa via signOut.
    signOut.mockResolvedValue({ error: AUTH_ERROR });
    useStore(makeStore(SESSION, { deleteFails: true }));
    await visit(AVISO);
    const retry = screen.getByTestId('logout-retry');
    const form = retry.closest('form');
    expect(form).not.toBeNull();
    // React 19 sustituye el atributo action por un javascript: de seguridad; basta con que sea un form POST de accion.
    expect(retry).toHaveAttribute('type', 'submit');
    expect(form?.querySelectorAll('input[name="next"]')).toHaveLength(0);
    // El envio real no es un navegador: se neutraliza el redirect de este unico disparo para no
    // dejar una promesa rechazada sin capturar (la excepcion de redirect ya se prueba arriba).
    h.redirect.mockImplementationOnce((() => undefined) as never);
    fireEvent.submit(form as HTMLFormElement);
    await vi.waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(h.redirect).toHaveBeenCalledWith(AVISO));
  });
});

describe('P-02 sin bypass de rutas ni de safeNextPath', () => {
  const HOSTILE = [
    '//evil.example',
    'https://evil.example/x',
    '/%2F%2Fevil.example',
    '/\\evil.example',
    '/customers?q=a',
    '/dashboard',
  ];

  it.each(HOSTILE)(
    'aviso exacto + sesion viva + next=%s: sin redireccion ni next reflejado',
    async (next) => {
      const { container } = await visit(`${AVISO}&next=${encodeURIComponent(next)}`);
      expect(h.redirect).not.toHaveBeenCalled();
      expect(screen.getByTestId('logout-failed-notice')).toBeInTheDocument();
      expect(container.querySelector('input[name="next"]')).toBeNull();
      expect(container.innerHTML).not.toContain('evil.example');
      expect(container.querySelector('a[href*="evil"]')).toBeNull();
    },
  );

  it.each([
    ['aviso distinto', '/login?aviso=Cierre-No-Confirmado'],
    ['aviso con espacio final', '/login?aviso=cierre-no-confirmado%20'],
    ['aviso vacio', '/login?aviso='],
    ['sin aviso', '/login?next=%2Fcustomers'],
    ['aviso repetido', '/login?aviso=cierre-no-confirmado&aviso=x'],
  ])('%s con sesion viva sigue redirigiendo a /dashboard (no abre bypass)', async (_n, url) => {
    await expect(visit(url)).rejects.toMatchObject({ url: '/dashboard' });
  });

  it('con el aviso exacto y sesion valida pero SIN cookies de sesion, la sesion viva sigue yendo a /dashboard', async () => {
    // Estado imposible en navegador real (valida => lleva cookie), pero fija que el criterio es la cookie.
    useStore(makeStore(['theme']));
    await expect(visit(AVISO)).rejects.toMatchObject({ url: '/dashboard' });
  });

  it('el aviso nunca cambia el destino de login: sin sesion, next hostil se sustituye por /dashboard', async () => {
    h.hasValidSession.mockResolvedValue(false);
    useStore(makeStore(['theme']));
    const { container } = await visit(`${AVISO}&next=${encodeURIComponent('//evil.example')}`);
    expect(
      container.querySelector<HTMLInputElement>('input[type="hidden"][name="next"]')?.value,
    ).toBe('/dashboard');
    expect(screen.getByTestId('logout-notice')).toBeInTheDocument();
  });
});

describe('P-02 casos limite de cookies', () => {
  it('cookie de sesion caducada/invalida presente (hasValidSession=false) con aviso exacto: muestra el aviso de fallo y permite reintentar', async () => {
    h.hasValidSession.mockResolvedValue(false);
    await visit(AVISO);
    expect(screen.getByTestId('logout-failed-notice')).toBeInTheDocument();
    expect(screen.getByTestId('logout-retry')).toBeInTheDocument();
  });

  it('cookie caducada presente, sin aviso: formulario de acceso normal (no hay aviso de fallo)', async () => {
    h.hasValidSession.mockResolvedValue(false);
    await visit('/login');
    expect(screen.queryByTestId('logout-failed-notice')).toBeNull();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  // TASK-010B / B-02 (cambio justificado): estas dos pruebas esperaban `logout-notice` ("Tu sesion se
  // cerro en este navegador") con el almacen ILEGIBLE. Es el falso positivo del hallazgo 2 de
  // AUDIT-002-RETEST: si no se puede leer el almacen, el cierre local es INDETERMINADO y la pagina no
  // debe afirmarlo. Ahora fijan lo contrario; el criterio completo esta en el bloque B-02 al final.
  it('cookies() ilegible al renderizar /login con aviso: no afirma cierre local, ofrece reintento y no lanza', async () => {
    h.cookies.mockRejectedValue(new Error('sin contexto'));
    h.hasValidSession.mockResolvedValue(false);
    const { container } = await visit(AVISO);
    expectLocalCloseUnknown(container);
  });

  it('cookies() que lanza de forma sincrona tampoco rompe la pagina ni afirma el cierre local', async () => {
    h.cookies.mockImplementation(() => {
      throw new Error('sync');
    });
    h.hasValidSession.mockResolvedValue(false);
    const { container } = await visit(AVISO);
    expectLocalCloseUnknown(container);
  });

  it.each([
    [['sb-x-auth-token-code-verifier'], false],
    [['SB-x-auth-token'], false],
    [['sb--auth-token'], false],
    [['sb-x-auth-token.'], false],
    [['xsb-x-auth-token'], false],
    [['sb-a-b-auth-token.12'], true],
  ])('hasLocalSessionCookies(%j) = %s', async (names, expected) => {
    useStore(makeStore(names));
    expect(await hasLocalSessionCookies()).toBe(expected);
  });
});

describe('B-02 presentes / ausentes / ilegibles se distinguen (flujo real encadenado)', () => {
  it('PRESENTES: la accion no pudo borrarlas -> alerta de fallo con reintento (sin afirmar cierre)', async () => {
    useStore(makeStore([...SESSION, 'theme'], { deleteFails: true }));
    signOut.mockResolvedValue({ error: AUTH_ERROR });
    const url = await runLogout();
    h.hasValidSession.mockResolvedValue(false);
    const { container } = await visit(url);
    expect(screen.getByTestId('logout-failed-notice')).toHaveAttribute('role', 'alert');
    expect(screen.getByTestId('logout-retry')).toBeEnabled();
    expect(screen.queryByTestId('logout-notice')).toBeNull();
    expect(container.textContent).not.toMatch(/se cerr[oó] en este navegador/i);
  });

  it('AUSENTES: la accion las borro -> aviso habitual "se cerro en este navegador", sin reintento', async () => {
    signOut.mockResolvedValue({ error: AUTH_ERROR });
    const url = await runLogout();
    expect(store.getAll().map((c) => c.name)).toEqual(['theme']);
    h.hasValidSession.mockResolvedValue(false);
    await visit(url);
    const notice = screen.getByTestId('logout-notice');
    expect((notice.textContent ?? '').replace(/\s+/g, ' ')).toMatch(
      /se cerr[oó] en este navegador/i,
    );
    expect(screen.queryByTestId('logout-failed-notice')).toBeNull();
    expect(screen.queryByTestId('logout-retry')).toBeNull();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  it('ILEGIBLES en accion y render (cookies() rechaza siempre): no afirma cierre local y ofrece reintento', async () => {
    h.cookies.mockRejectedValue(new Error('almacen ilegible'));
    h.hasValidSession.mockResolvedValue(false);
    signOut.mockResolvedValue({ error: AUTH_ERROR });
    const url = await runLogout();
    // La accion no puede ni borrar ni comprobar; igualmente redirige a un aviso de /login.
    expect(url.startsWith('/login?aviso=')).toBe(true);
    expect(url).not.toContain('tecnico-secreto-777');
    const { container } = await visit(url);
    expectLocalCloseUnknown(container);
  });

  it('ILEGIBLES: createClient lanza y el almacen no se puede leer (accion y render)', async () => {
    h.createClient.mockRejectedValue(new Error('sin configuracion'));
    h.cookies.mockRejectedValue(new Error('almacen ilegible'));
    h.hasValidSession.mockResolvedValue(false);
    const url = await runLogout();
    expect(url.startsWith('/login?aviso=')).toBe(true);
    const { container } = await visit(url);
    expectLocalCloseUnknown(container);
  });

  it('ILEGIBLES: cookies() resuelve pero getAll() lanza al renderizar (accion previa borro todo)', async () => {
    signOut.mockResolvedValue({ error: AUTH_ERROR });
    const url = await runLogout();
    h.cookies.mockResolvedValue({
      getAll: () => {
        throw new Error('getAll ilegible');
      },
    });
    h.hasValidSession.mockResolvedValue(false);
    const { container } = await visit(url);
    expectLocalCloseUnknown(container);
  });

  it('ILEGIBLES: sin el aviso no hay mensaje ni reintento (formulario de acceso normal)', async () => {
    h.cookies.mockRejectedValue(new Error('almacen ilegible'));
    h.hasValidSession.mockResolvedValue(false);
    await visit('/login');
    expect(screen.queryByTestId('logout-notice')).toBeNull();
    expect(screen.queryByTestId('logout-failed-notice')).toBeNull();
    expect(screen.queryByTestId('logout-retry')).toBeNull();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });

  it('ILEGIBLES: un reintento con exito (Auth ok y cierre local verificable) vuelve a /login simple', async () => {
    signOut.mockImplementationOnce(async () => {
      store.jar.clear();
      return { error: null };
    });
    expect(await runLogout()).toBe('/login');
  });
});
