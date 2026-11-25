// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Prueba independiente de Testing (TASK-010 PRE, A02-01). Develop no la modifica.
//
// Es una prueba UNITARIA con dobles de `next/navigation`, `next/headers` y del cliente de Supabase:
// verifica las RAMAS de logoutAction. No es evidencia de integracion; la revocacion real y la
// validez de una sesion copiada se comprueban en
// tests/integration/supabase/independent/logout-revocation.supabase.test.ts (CI).
//
// Contrato de logoutAction (src/features/auth/actions.ts):
//   1. Llama UNA vez a supabase.auth.signOut({ scope: 'local' }) (sin cambiar el alcance).
//   2. Distingue tres resultados:
//        a) { error: null }           -> revocacion remota confirmada -> redirect('/login') EXACTO.
//        b) { error } devuelto        -> NO confirmada
//        c) excepcion (incluye fallo de createClient)  -> NO confirmada
//      En b) y c): redirect('/login?aviso=cierre-no-confirmado') (valor fijo; nunca el texto del
//      error) y cierre local seguro: se eliminan TODAS las cookies de sesion de Supabase
//      (nombre ^sb-.+-auth-token(\.\d+)?$) del almacen de cookies de la solicitud, aunque
//      signOut haya devuelto error sin borrarlas. Las demas cookies no se tocan.
//   3. Si el borrado de cookies falla, igualmente se redirige a la URL de aviso (sin propagar).
//   4. redirect() se invoca exactamente una vez y fuera de cualquier try/catch que lo capture.

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
  };
});

vi.mock('next/navigation', () => ({ redirect: h.redirect }));
vi.mock('next/headers', () => ({ cookies: h.cookies }));
vi.mock('@/lib/supabase/server', () => ({ createClient: h.createClient }));

import { logoutAction } from '@/features/auth/actions';

const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;
const SESSION_COOKIES = {
  'sb-proyecto-auth-token.0': 'base64-AAAA',
  'sb-proyecto-auth-token.1': 'BBBB',
  'sb-proyecto-auth-token': 'unico',
};
const OTHER_COOKIES = { theme: 'dark', sidebar_state: 'open', 'sbx-preferences': '1' };

type SetArg = string | { name: string; value?: string; maxAge?: number; expires?: Date | number };

function makeStore(initial: Record<string, string>, opts: { failing?: boolean } = {}) {
  const jar = new Map(Object.entries(initial));
  const boom = () => {
    throw new Error('almacen de cookies no disponible');
  };
  return {
    jar,
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    has: (name: string) => jar.has(name),
    delete: vi.fn((arg: string | { name: string }) => {
      if (opts.failing) boom();
      jar.delete(typeof arg === 'string' ? arg : arg.name);
    }),
    // set(name, '', { maxAge: 0 }) o set({ name, value: '', expires: ... }) tambien cuentan
    // como borrado (es lo que hace la libreria al cerrar sesion).
    set: vi.fn((arg: SetArg, value?: string, options?: { maxAge?: number; expires?: Date }) => {
      if (opts.failing) boom();
      const name = typeof arg === 'string' ? arg : arg.name;
      const val = typeof arg === 'string' ? value : arg.value;
      const o = typeof arg === 'string' ? options : arg;
      const expiresMs = o?.expires === undefined ? undefined : new Date(o.expires).getTime();
      const expired =
        val === '' ||
        (o?.maxAge !== undefined && o.maxAge <= 0) ||
        (expiresMs !== undefined && expiresMs <= Date.now());
      if (expired) jar.delete(name);
      else jar.set(name, val ?? '');
    }),
  };
}

type Store = ReturnType<typeof makeStore>;

async function runLogout(): Promise<string> {
  try {
    await logoutAction();
  } catch (error) {
    if (error instanceof h.RedirectSignal) return error.url;
    throw error;
  }
  throw new Error('logoutAction termino sin redirigir');
}

const sessionCookiesLeft = (store: Store) =>
  [...store.jar.keys()].filter((n) => AUTH_COOKIE.test(n));

let store: Store;
const signOut = vi.fn();

function useStore(next: Store) {
  store = next;
  h.cookies.mockResolvedValue(store);
}

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockReset();
  h.createClient.mockResolvedValue({ auth: { signOut } });
  useStore(makeStore({ ...SESSION_COOKIES, ...OTHER_COOKIES }));
});

describe('A02-01 logoutAction: revocacion remota confirmada', () => {
  it('redirige a /login exacto, sin aviso, con signOut local una sola vez', async () => {
    signOut.mockImplementation(async () => {
      // La libreria elimina las cookies de sesion al cerrar.
      for (const name of Object.keys(SESSION_COOKIES)) store.jar.delete(name);
      return { error: null };
    });
    expect(await runLogout()).toBe('/login');
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(h.redirect).toHaveBeenCalledTimes(1);
    expect([...store.jar.keys()].sort()).toEqual(Object.keys(OTHER_COOKIES).sort());
  });
});

describe('A02-01 logoutAction: error devuelto por signOut (revocacion NO confirmada)', () => {
  const returnedErrors = [
    ['5xx de Auth', { name: 'AuthApiError', message: 'internal error', status: 500 }],
    ['red / reintentable', { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 }],
    [
      'sesion incompleta',
      { name: 'AuthUnknownError', message: 'tecnico-secreto-123', status: 400 },
    ],
  ] as const;

  it.each(returnedErrors)(
    '%s: aviso de cierre no confirmado y cookies de sesion eliminadas aunque signOut no las borro',
    async (_name, error) => {
      signOut.mockResolvedValue({ error });
      const url = await runLogout();
      expect(url).toBe('/login?aviso=cierre-no-confirmado');
      expect(url).not.toContain('tecnico-secreto-123');
      expect(h.redirect).toHaveBeenCalledTimes(1);
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(sessionCookiesLeft(store)).toEqual([]);
      // Las cookies ajenas a la sesion no se tocan.
      for (const [name, value] of Object.entries(OTHER_COOKIES)) {
        expect(store.jar.get(name), name).toBe(value);
      }
    },
  );

  it('si la libreria ya borro las cookies localmente, el aviso se mantiene (el cierre remoto sigue sin confirmar)', async () => {
    signOut.mockImplementation(async () => {
      for (const name of Object.keys(SESSION_COOKIES)) store.jar.delete(name);
      return { error: { name: 'AuthApiError', message: 'x', status: 500 } };
    });
    expect(await runLogout()).toBe('/login?aviso=cierre-no-confirmado');
    expect(sessionCookiesLeft(store)).toEqual([]);
  });

  it('nunca redirige a /login simple tras un error (no se afirma un cierre completo)', async () => {
    signOut.mockResolvedValue({ error: { name: 'AuthApiError', message: 'x', status: 500 } });
    expect(await runLogout()).not.toBe('/login');
  });
});

describe('A02-01 logoutAction: excepciones (revocacion NO confirmada)', () => {
  it('signOut lanza: mismo aviso y cookies de sesion eliminadas', async () => {
    signOut.mockRejectedValue(new TypeError('fetch failed tecnico-secreto-456'));
    const url = await runLogout();
    expect(url).toBe('/login?aviso=cierre-no-confirmado');
    expect(url).not.toContain('tecnico-secreto-456');
    expect(sessionCookiesLeft(store)).toEqual([]);
    expect(store.jar.get('theme')).toBe('dark');
    expect(h.redirect).toHaveBeenCalledTimes(1);
  });

  it('createClient lanza (configuracion o red): mismo aviso y limpieza local sin cliente', async () => {
    h.createClient.mockRejectedValue(new Error('Faltan variables de entorno'));
    expect(await runLogout()).toBe('/login?aviso=cierre-no-confirmado');
    expect(signOut).not.toHaveBeenCalled();
    expect(sessionCookiesLeft(store)).toEqual([]);
    expect(h.redirect).toHaveBeenCalledTimes(1);
  });

  it('si el almacen de cookies falla al borrar, redirige igualmente al aviso (sin propagar el error)', async () => {
    useStore(makeStore({ ...SESSION_COOKIES, ...OTHER_COOKIES }, { failing: true }));
    signOut.mockResolvedValue({ error: { name: 'AuthApiError', message: 'x', status: 500 } });
    expect(await runLogout()).toBe('/login?aviso=cierre-no-confirmado');
    expect(h.redirect).toHaveBeenCalledTimes(1);
  });

  it('si ni siquiera se puede obtener el almacen de cookies, redirige al aviso', async () => {
    h.cookies.mockRejectedValue(new Error('sin contexto de solicitud'));
    signOut.mockRejectedValue(new Error('x'));
    expect(await runLogout()).toBe('/login?aviso=cierre-no-confirmado');
    expect(h.redirect).toHaveBeenCalledTimes(1);
  });
});

describe('A02-01 logoutAction: el redirect no se captura', () => {
  it('la excepcion de redirect llega intacta al llamador (no se traga ni se duplica)', async () => {
    signOut.mockResolvedValue({ error: null });
    await expect(logoutAction()).rejects.toBeInstanceOf(h.RedirectSignal);
    expect(h.redirect).toHaveBeenCalledTimes(1);
  });
});
