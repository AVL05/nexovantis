// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// TASK-010B-RETEST2 (A02-01): sin peticion HTTP y sin error del SDK, solo un almacen legible y sin
// cookies de sesion acredita el cierre. Cookie truncada/ilegible o almacen ilegible -> no confirmado.

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

type Observer = { requested: boolean; status: number | null; code: string | null; threw: boolean };

function makeStore(initial: Record<string, string>) {
  const jar = new Map(Object.entries(initial));
  return {
    jar,
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    delete: vi.fn((name: string) => void jar.delete(name)),
  };
}

async function runLogout(): Promise<string> {
  try {
    await logoutAction();
  } catch (e) {
    if (e instanceof h.RedirectSignal) return e.url;
    throw e;
  }
  throw new Error('logoutAction no redirigio');
}

/** El SDK no envia peticion alguna (observer intacto) y no devuelve error. */
function noRequestClient() {
  h.createClient.mockResolvedValue({ auth: { signOut: vi.fn(async () => ({ error: null })) } });
}

const AVISO = '/login?aviso=cierre-no-confirmado';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('logoutAction sin peticion HTTP y sin error del SDK', () => {
  it('cookie de sesion truncada -> indeterminado y limpieza local', async () => {
    const store = makeStore({ 'sb-proyecto-auth-token': 'base64-trunc', theme: 'dark' });
    h.cookies.mockResolvedValue(store);
    noRequestClient();
    expect(await runLogout()).toBe(AVISO);
    expect(store.jar.has('sb-proyecto-auth-token')).toBe(false);
    expect(store.jar.has('theme')).toBe(true);
  });

  it('almacen vacio (legible, sin cookies de sesion) -> confirmado', async () => {
    h.cookies.mockResolvedValue(makeStore({ theme: 'dark' }));
    noRequestClient();
    expect(await runLogout()).toBe('/login');
  });

  it('almacen ilegible -> indeterminado', async () => {
    h.cookies.mockRejectedValue(new Error('sin almacen'));
    noRequestClient();
    expect(await runLogout()).toBe(AVISO);
  });

  it('sesion valida con peticion 2xx -> confirmado', async () => {
    h.cookies.mockResolvedValue(makeStore({ 'sb-proyecto-auth-token': 'base64-ok' }));
    h.createClient.mockImplementation(async (opts: { revocation: Observer }) => ({
      auth: {
        signOut: vi.fn(async () => {
          Object.assign(opts.revocation, { requested: true, status: 204 });
          return { error: null };
        }),
      },
    }));
    expect(await runLogout()).toBe('/login');
  });
});
