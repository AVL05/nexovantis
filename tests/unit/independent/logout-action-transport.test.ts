// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_TOKEN_MARKER,
  AVISO,
  COOKIE_NAME,
  PUBLISHABLE_KEY,
  REFRESH_TOKEN_MARKER,
  SUPABASE_URL,
  TRANSPORT_CASES,
  makeCookieStore,
  makeFetch,
  sessionCookieValue,
  type CookieStore,
} from './support/logout-transport';

// Prueba independiente de Testing (TASK-010B, B-01 / AUDIT-002-RETEST hallazgo 1). Develop no la
// modifica.
//
// `logoutAction` REAL + cliente de servidor REAL + `@supabase/auth-js` 2.119.2 REAL; solo se doblan
// `next/headers`, `next/navigation` y `globalThis.fetch` (sin red). Reproduce la revision de Codex:
// con 401/403/404 de pasarela (cuerpo JSON sin codigo de GoTrue) el SDK devuelve `error: null` y la
// accion redirigia a /login sin aviso aunque la revocacion no se confirmo.
//
// CONTRATO (criterio esperado, ver informe TASK-010B-TESTS):
//   confirmed        204                                  -> redirect('/login') exacto, sin aviso.
//   session-absent   403 con error_code/code de GoTrue    -> redirect('/login') exacto, sin aviso
//                    `session_not_found` o `user_not_found`   (la sesion no existe en Auth: no hay
//                    (formato heredado o api-version 2024-01-01)  nada que revocar; la copia no sirve).
//   indeterminate    cualquier otra respuesta no 2xx (401/403/404 de pasarela, bad_jwt, 500...) o
//                    excepcion de transporte             -> redirect('/login?aviso=cierre-no-confirmado')
//                    + cierre local seguro (cookies de sesion eliminadas). Nunca se afirma cierre remoto.
//   - Un unico POST /auth/v1/logout?scope=local; sin reintentos automaticos ni refresco previo.
//   - La URL de redireccion es fija: no incluye estado, cuerpo, mensaje, codigo ni tokens.
//   - Ningun token se escribe en la consola.
//   - Sin sesion en cookies (auth-js no emite peticion) -> '/login' (no hay nada que revocar).
//
// "passesToday=false" marca los casos que reproducen el defecto en 33e6b1c (esperados en ROJO hasta
// que Develop lo corrija); los demas son controles que ya pasan y evitan una sobrecorreccion.

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
    cookies: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({ redirect: h.redirect }));
vi.mock('next/headers', () => ({ cookies: h.cookies }));

import { logoutAction } from '@/features/auth/actions';

const SESSION_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;
const OTHER = { theme: 'dark', sidebar_state: 'open' };

async function runLogout(): Promise<string> {
  try {
    await logoutAction();
  } catch (error) {
    if (error instanceof h.RedirectSignal) return error.url;
    throw error;
  }
  throw new Error('logoutAction termino sin redirigir');
}

const sessionCookiesLeft = (store: CookieStore) =>
  [...store.jar.keys()].filter((name) => SESSION_COOKIE.test(name));

let consoleSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', PUBLISHABLE_KEY);
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('B-01 logoutAction con auth-js 2.119.2 y transporte simulado', () => {
  it.each(TRANSPORT_CASES)('$id', async ({ transport, expected }) => {
    const store = makeCookieStore({ [COOKIE_NAME]: sessionCookieValue(), ...OTHER });
    h.cookies.mockResolvedValue(store);
    const { impl, calls } = makeFetch(transport);
    vi.stubGlobal('fetch', impl);

    const url = await runLogout();

    // Un unico intento de revocacion contra el endpoint esperado.
    expect(calls).toEqual([{ url: `${SUPABASE_URL}/auth/v1/logout?scope=local`, method: 'POST' }]);
    expect(h.redirect).toHaveBeenCalledTimes(1);

    if (expected === 'indeterminate') {
      expect(url, 'sin evidencia fiable de revocacion hay que avisar').toBe(AVISO);
    } else {
      expect(url, 'revocacion confirmada o sesion inexistente: sin aviso').toBe('/login');
    }

    // El cierre local es siempre seguro y no toca cookies ajenas.
    expect(sessionCookiesLeft(store)).toEqual([]);
    for (const [name, value] of Object.entries(OTHER)) expect(store.jar.get(name)).toBe(value);

    // Sin fuga: ni tokens ni datos de la respuesta en la URL o en la consola.
    for (const leak of [
      ACCESS_TOKEN_MARKER,
      REFRESH_TOKEN_MARKER,
      'gotrue',
      'pasarela',
      'denegado',
    ]) {
      expect(url).not.toContain(leak);
    }
    for (const spy of consoleSpies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(ACCESS_TOKEN_MARKER);
      expect(JSON.stringify(spy.mock.calls)).not.toContain(REFRESH_TOKEN_MARKER);
    }
  });

  it('sin cookies de sesion no hay peticion que confirmar: /login sin aviso (no se sobrecorrige)', async () => {
    const store = makeCookieStore({ ...OTHER });
    h.cookies.mockResolvedValue(store);
    const { impl, calls } = makeFetch({ kind: 'response', status: 500, body: '{}' });
    vi.stubGlobal('fetch', impl);

    expect(await runLogout()).toBe('/login');
    expect(calls).toHaveLength(0);
  });

  it('el aviso ante 401/403/404 de pasarela convive con el borrado local fallido (alerta de /login: ver B-02)', async () => {
    // Si ademas el almacen no permite borrar, siguen las cookies y /login debe ofrecer reintento;
    // aqui solo se fija que la accion NO propaga errores y redirige al aviso.
    const store = makeCookieStore({ [COOKIE_NAME]: sessionCookieValue(), ...OTHER });
    h.cookies.mockResolvedValue({
      ...store,
      set: () => {
        throw new Error('almacen no escribible');
      },
      delete: () => {
        throw new Error('almacen no escribible');
      },
    });
    const { impl } = makeFetch({
      kind: 'response',
      status: 403,
      body: JSON.stringify({ message: 'rechazado por la pasarela' }),
      headers: { 'content-type': 'application/json' },
    });
    vi.stubGlobal('fetch', impl);

    expect(await runLogout()).toBe(AVISO);
    expect(h.redirect).toHaveBeenCalledTimes(1);
  });
});
