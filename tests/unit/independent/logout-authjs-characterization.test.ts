// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COOKIE_NAME,
  PUBLISHABLE_KEY,
  SUPABASE_URL,
  TRANSPORT_CASES,
  makeCookieStore,
  makeFetch,
  sessionCookieValue,
} from './support/logout-transport';

// Prueba independiente de Testing (TASK-010B, B-01). Develop no la modifica.
//
// CARACTERIZACION de `signOut({ scope: 'local' })` con `@supabase/auth-js` 2.119.2 (version fijada)
// a traves del cliente de servidor real de la app y un `fetch` doble (sin red). Documenta que ve
// `logoutAction` hoy: el SDK devuelve `error: null` ante 401/403/404 con cuerpo JSON y ante
// `session_not_found`, de modo que el RESULTADO de signOut no basta para distinguir revocacion
// confirmada, sesion inexistente y rechazo de pasarela. Estas pruebas deben pasar en el codigo
// actual y SOLO fallarian si cambia la dependencia (aviso para revisar el contrato de B-01).
//
// Evidencia observable por clase (ver informe TASK-010B-TESTS): codigo HTTP de POST /logout, campo
// `error_code`/`code` (cadena) del cuerpo JSON de GoTrue y cabecera `x-supabase-api-version`.

const h = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: h.cookies }));

import { createClient } from '@/lib/supabase/server';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', PUBLISHABLE_KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('B-01 auth-js 2.119.2: resultado de signOut local por respuesta de revocacion', () => {
  it.each(TRANSPORT_CASES)('$id', async ({ transport, sdk }) => {
    const store = makeCookieStore({ [COOKIE_NAME]: sessionCookieValue() });
    h.cookies.mockResolvedValue(store);
    const { impl, calls } = makeFetch(transport);
    vi.stubGlobal('fetch', impl);

    const supabase = await createClient();
    const result = await supabase.auth.signOut({ scope: 'local' });

    // Una sola peticion: POST /auth/v1/logout?scope=local (sin refresco previo).
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe(`${SUPABASE_URL}/auth/v1/logout?scope=local`);
    // Con scope local la sesion local se elimina ANTES de la peticion, sea cual sea la respuesta.
    expect([...store.jar.keys()]).toEqual([]);

    if (sdk.error === null) {
      expect(result.error).toBeNull();
    } else {
      expect(result.error).not.toBeNull();
      expect(result.error?.name).toBe(sdk.error.name);
      if (sdk.error.status !== undefined) {
        expect((result.error as { status?: number }).status).toBe(sdk.error.status);
      }
    }
  });

  it('sin cookies de sesion no se envia ninguna peticion de revocacion y no hay error', async () => {
    const store = makeCookieStore({ theme: 'dark' });
    h.cookies.mockResolvedValue(store);
    const { impl, calls } = makeFetch({ kind: 'response', status: 204, body: null });
    vi.stubGlobal('fetch', impl);

    const supabase = await createClient();
    const result = await supabase.auth.signOut({ scope: 'local' });
    expect(result.error).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
