// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COOKIE_NAME,
  PUBLISHABLE_KEY,
  SUPABASE_URL,
  makeCookieStore,
  sessionCookieValue,
} from './support/logout-transport';

// Prueba independiente de Testing (TASK-010B RETEST, B-01). Develop no la modifica.
// Alcance del observador de revocacion de `createClient({ revocation })`: por solicitud (sin estado
// compartido), solo para `POST /auth/v1/logout`, sin alterar las llamadas de un cliente normal y
// sin consola. `next/headers` y `globalThis.fetch` son los unicos dobles (sin red).

const h = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: h.cookies }));

import { createClient, type RevocationObserver } from '@/lib/supabase/server';

const fresh = (): RevocationObserver => ({
  requested: false,
  status: null,
  code: null,
  threw: false,
});

type Call = { url: string; method: string };

/** fetch doble: decide la respuesta por URL/metodo; registra solo metodo y URL. */
function stubFetch(respond: (call: Call, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = {
      url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      method: init?.method ?? 'GET',
    };
    calls.push(call);
    return respond(call, init);
  });
  return calls;
}

/** Cada signOut local borra la cookie de sesion: se repone antes de crear otro cliente. */
const withSession = () =>
  h.cookies.mockResolvedValue(makeCookieStore({ [COOKIE_NAME]: sessionCookieValue() }));

const goTrue = (status: number, errorCode: string) =>
  new Response(JSON.stringify({ code: status, error_code: errorCode, msg: 'x' }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

let consoleSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', PUBLISHABLE_KEY);
  h.cookies.mockResolvedValue(makeCookieStore({ [COOKIE_NAME]: sessionCookieValue() }));
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('B-01 observador de revocacion: alcance', () => {
  it('es por solicitud: dos clientes concurrentes anotan cada uno SU respuesta', async () => {
    // El token (cabecera de la PETICION, solo visible en el doble) decide la respuesta; el codigo
    // de produccion nunca lo lee: aqui solo sirve para forzar respuestas distintas por cliente.
    let n = 0;
    stubFetch(async () => {
      const mine = ++n;
      await new Promise((r) => setTimeout(r, mine === 1 ? 20 : 0)); // se cruzan las respuestas
      return mine === 1 ? new Response(null, { status: 204 }) : goTrue(403, 'bad_jwt');
    });
    const a = fresh();
    const b = fresh();
    const [ca, cb] = await Promise.all([
      createClient({ revocation: a }),
      createClient({ revocation: b }),
    ]);
    await Promise.all([ca.auth.signOut({ scope: 'local' }), cb.auth.signOut({ scope: 'local' })]);

    expect([a.status, b.status].sort()).toEqual([204, 403]);
    const ok = a.status === 204 ? a : b;
    const bad = a.status === 204 ? b : a;
    expect(ok).toMatchObject({ requested: true, status: 204, code: null, threw: false });
    expect(bad).toMatchObject({ requested: true, status: 403, code: 'bad_jwt', threw: false });
  });

  it('un observador usado antes no contamina a uno nuevo (sin estado de modulo)', async () => {
    stubFetch(() => goTrue(403, 'bad_jwt'));
    const first = fresh();
    await (await createClient({ revocation: first })).auth.signOut({ scope: 'local' });
    expect(first.code).toBe('bad_jwt');

    stubFetch(() => new Response(null, { status: 204 }));
    withSession();
    const second = fresh();
    await (await createClient({ revocation: second })).auth.signOut({ scope: 'local' });
    expect(second).toEqual({ requested: true, status: 204, code: null, threw: false });
    expect(first.code).toBe('bad_jwt'); // el primero no cambia
  });

  it('una excepcion de transporte marca threw y no status', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed (simulado)');
    });
    const o = fresh();
    const { error } = await (
      await createClient({ revocation: o })
    ).auth.signOut({
      scope: 'local',
    });
    expect(o).toMatchObject({ requested: true, status: null, threw: true });
    expect(error).not.toBeNull(); // auth-js lo devuelve como error (no lanza)
  });

  it('solo anota POST /auth/v1/logout: otras llamadas del mismo cliente no lo tocan', async () => {
    const calls = stubFetch((call) =>
      call.url.includes('/auth/v1/user')
        ? goTrue(401, 'bad_jwt')
        : new Response('{}', { status: 200 }),
    );
    const o = fresh();
    const client = await createClient({ revocation: o });
    await client.auth.getUser('un-jwt-cualquiera');
    expect(calls.some((c) => c.url.includes('/auth/v1/user'))).toBe(true);
    expect(o).toEqual(fresh());
  });

  it('sin `revocation`, createClient no instala fetch propio: el logout no se observa y fetch se usa tal cual', async () => {
    const calls = stubFetch(() => goTrue(403, 'bad_jwt'));
    const client = await createClient();
    const { error } = await client.auth.signOut({ scope: 'local' });
    // Una sola llamada, la del SDK (sin duplicados ni lecturas extra por el observador).
    expect(calls).toEqual([{ url: `${SUPABASE_URL}/auth/v1/logout?scope=local`, method: 'POST' }]);
    expect(error).toBeNull(); // comportamiento nativo de auth-js, intacto
  });

  it('con observador, el cuerpo de la respuesta sigue siendo legible por el SDK (se clona)', async () => {
    stubFetch(() => goTrue(500, 'unexpected_failure'));
    const o = fresh();
    const { error } = await (
      await createClient({ revocation: o })
    ).auth.signOut({
      scope: 'local',
    });
    expect(o).toMatchObject({ status: 500, code: 'unexpected_failure' });
    expect(error).toMatchObject({ status: 500 });
  });

  it('respuestas ok no guardan codigo; cuerpos no JSON o raros no rompen ni se guardan', async () => {
    for (const [body, expected] of [
      ['<html>x</html>', null],
      ['null', null],
      ['{"error_code": 12}', null],
      ['{"code": "session_not_found"}', 'session_not_found'],
    ] as const) {
      stubFetch(() => new Response(body, { status: 403 }));
      withSession();
      const o = fresh();
      await (await createClient({ revocation: o })).auth.signOut({ scope: 'local' });
      expect(o.status).toBe(403);
      expect(o.code, body).toBe(expected);
    }
    stubFetch(() => new Response(JSON.stringify({ error_code: 'x' }), { status: 200 }));
    withSession();
    const ok = fresh();
    await (await createClient({ revocation: ok })).auth.signOut({ scope: 'local' });
    expect(ok.code).toBeNull();
  });

  it('el observador solo contiene estado/codigo: ni tokens ni cabeceras; nada en consola', async () => {
    stubFetch(() => goTrue(403, 'bad_jwt'));
    const o = fresh();
    await (await createClient({ revocation: o })).auth.signOut({ scope: 'local' });
    expect(Object.keys(o).sort()).toEqual(['code', 'requested', 'status', 'threw']);
    const dump = JSON.stringify(o);
    expect(dump).not.toMatch(/secret-marker|authorization|bearer/i);
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});
