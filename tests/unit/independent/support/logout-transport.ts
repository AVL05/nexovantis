// Soporte compartido de TASK-010B (B-01/B-02). Propietario: Testing.
// Transporte simulado (fetch doble, SIN red) para ejercitar `auth-js` 2.119.2 REAL a traves del
// cliente de servidor REAL (`@/lib/supabase/server`) y la Server Action `logoutAction` REAL.
// Solo se doblan `next/headers`, `next/navigation` y `globalThis.fetch`.

export const SUPABASE_URL = 'https://proyecto.supabase.co';
export const PUBLISHABLE_KEY = 'sb_publishable_dummy';
export const COOKIE_NAME = 'sb-proyecto-auth-token';
export const ACCESS_TOKEN_MARKER = 'at-secret-marker-7f3a';
export const REFRESH_TOKEN_MARKER = 'rt-secret-marker-9c1b';
export const AVISO = '/login?aviso=cierre-no-confirmado';

/** Cookie de sesion de @supabase/ssr (codificacion base64url por defecto) con un token NO caducado. */
export function sessionCookieValue(): string {
  const session = {
    access_token: ACCESS_TOKEN_MARKER,
    refresh_token: REFRESH_TOKEN_MARKER,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '00000000-0000-4000-8000-000000000001', email: 'u@example.test' },
  };
  return `base64-${Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')}`;
}

export type CookieStore = ReturnType<typeof makeCookieStore>;

/** Almacen de cookies de Next doble (get/set/delete con semantica de caducidad). */
export function makeCookieStore(initial: Record<string, string>) {
  const jar = new Map(Object.entries(initial));
  return {
    jar,
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    has: (name: string) => jar.has(name),
    delete: (arg: string | { name: string }) => {
      jar.delete(typeof arg === 'string' ? arg : arg.name);
    },
    set: (
      arg: string | { name: string; value?: string; maxAge?: number; expires?: Date | number },
      value?: string,
      options?: { maxAge?: number; expires?: Date | number },
    ) => {
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
    },
  };
}

// --- Respuestas de la revocacion (POST {url}/auth/v1/logout?scope=local) --------------------------

export type Transport =
  | { kind: 'response'; status: number; body: string | null; headers?: Record<string, string> }
  | { kind: 'throw' };

const JSON_HEADERS = { 'content-type': 'application/json' };
const V2024 = { ...JSON_HEADERS, 'x-supabase-api-version': '2024-01-01' };
const HTML_HEADERS = { 'content-type': 'text/html' };

const json = (status: number, body: unknown, headers = JSON_HEADERS): Transport => ({
  kind: 'response',
  status,
  body: JSON.stringify(body),
  headers,
});

/** Cuerpo de error de GoTrue (formato heredado: `code` numerico + `error_code` + `msg`). */
const goTrueLegacy = (status: number, errorCode: string): Transport =>
  json(status, { code: status, error_code: errorCode, msg: `gotrue ${errorCode}` });
/** Cuerpo de error de GoTrue con la cabecera de version de API 2024-01-01 (`code` textual). */
const goTrueVersioned = (status: number, errorCode: string): Transport =>
  json(status, { code: errorCode, message: `gotrue ${errorCode}` }, V2024);

export type Outcome =
  /** Revocacion confirmada (204): /login sin aviso. */
  | 'confirmed'
  /** Auth acredita que la sesion ya no existe (GoTrue session_not_found/user_not_found): /login sin aviso. */
  | 'session-absent'
  /** Sin evidencia fiable de revocacion: aviso de incertidumbre. */
  | 'indeterminate';

export type TransportCase = {
  id: string;
  transport: Transport;
  expected: Outcome;
  /** Lo que devuelve `signOut({scope:'local'})` de auth-js 2.119.2 (verificado, ver informe). */
  sdk: { error: null } | { error: { name: string; status: number | undefined; code?: string } };
  /** True si, con el codigo actual (33e6b1c), la expectativa ya se cumple (control, no defecto). */
  passesToday: boolean;
};

const HTTP = (status: number): Transport => ({
  kind: 'response',
  status,
  body: null,
});

export const TRANSPORT_CASES: TransportCase[] = [
  {
    id: '204 sin cuerpo (revocacion efectiva)',
    transport: HTTP(204),
    expected: 'confirmed',
    sdk: { error: null },
    passesToday: true,
  },
  // --- Evidencia FIABLE de sesion inexistente: cuerpo de GoTrue con error_code concreto ---
  {
    id: '403 GoTrue session_not_found (formato heredado)',
    transport: goTrueLegacy(403, 'session_not_found'),
    expected: 'session-absent',
    sdk: { error: null },
    passesToday: true,
  },
  {
    id: '403 GoTrue session_not_found (api-version 2024-01-01)',
    transport: goTrueVersioned(403, 'session_not_found'),
    expected: 'session-absent',
    sdk: { error: null },
    passesToday: true,
  },
  {
    id: '403 GoTrue user_not_found',
    transport: goTrueLegacy(403, 'user_not_found'),
    expected: 'session-absent',
    sdk: { error: null },
    passesToday: true,
  },
  // --- Rechazos de pasarela / GoTrue sin evidencia de sesion inexistente (antes: falso /login) ---
  ...[401, 403, 404].map<TransportCase>((status) => ({
    id: `${status} de pasarela con JSON sin codigo de GoTrue`,
    transport: json(status, { message: 'rechazado por la pasarela' }),
    expected: 'indeterminate',
    sdk: { error: null },
    passesToday: false,
  })),
  {
    id: '403 GoTrue bad_jwt (no prueba que la sesion no exista)',
    transport: goTrueLegacy(403, 'bad_jwt'),
    expected: 'indeterminate',
    sdk: { error: null },
    passesToday: false,
  },
  {
    id: '401 GoTrue no_authorization',
    transport: goTrueLegacy(401, 'no_authorization'),
    expected: 'indeterminate',
    sdk: { error: null },
    passesToday: false,
  },
  {
    id: '403 GoTrue user_banned',
    transport: goTrueLegacy(403, 'user_banned'),
    expected: 'indeterminate',
    sdk: { error: null },
    passesToday: false,
  },
  // --- Rechazos con cuerpo no JSON: auth-js ya los devuelve como error (controles verdes) ---
  ...[401, 403, 404].map<TransportCase>((status) => ({
    id: `${status} de pasarela con cuerpo HTML`,
    transport: {
      kind: 'response',
      status,
      body: '<html>denegado</html>',
      headers: HTML_HEADERS,
    },
    expected: 'indeterminate',
    sdk: { error: { name: 'AuthUnknownError', status: undefined } },
    passesToday: true,
  })),
  // --- Errores de infraestructura: auth-js ya los devuelve como error (controles verdes) ---
  {
    id: '500 con JSON',
    transport: json(500, { message: 'fallo interno simulado' }),
    expected: 'indeterminate',
    sdk: { error: { name: 'AuthRetryableFetchError', status: 500 } },
    passesToday: true,
  },
  {
    id: '502 con HTML',
    transport: { kind: 'response', status: 502, body: '<html>bad gateway</html>' },
    expected: 'indeterminate',
    sdk: { error: { name: 'AuthRetryableFetchError', status: 502 } },
    passesToday: true,
  },
  {
    id: 'excepcion de transporte (fetch rechaza)',
    transport: { kind: 'throw' },
    expected: 'indeterminate',
    sdk: { error: { name: 'AuthRetryableFetchError', status: 0 } },
    passesToday: true,
  },
];

export type FetchCall = { url: string; method: string };

/** `fetch` doble: registra metodo y URL (nunca cabeceras ni cuerpo: contienen tokens). */
export function makeFetch(transport: Transport) {
  const calls: FetchCall[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: init?.method ?? 'GET' });
    if (transport.kind === 'throw') throw new TypeError('fetch failed (simulado)');
    const noBody = transport.body === null || transport.status === 204;
    return new Response(noBody ? null : transport.body, {
      status: transport.status,
      headers: transport.headers,
    });
  };
  return { impl, calls };
}
