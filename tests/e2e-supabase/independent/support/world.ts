import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  expect,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';

// Soporte de las pruebas independientes de Testing para TASK-007 (Auth real, E2E).
// Propietario: Testing. Develop no lo modifica. No depende de tests/support/ ni del globalSetup de
// Develop: cada worker crea sus propios usuarios y organizaciones con la clave de servicio del
// stack LOCAL (solo en la preparacion, nunca en las comprobaciones de acceso). Las contrasenas se
// generan al ejecutar; no se guardan ni se imprimen.
//
// Entorno requerido (CI, job `supabase`): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Si faltan, las pruebas FALLAN (nunca se saltan). Si SUPABASE_URL no es local, se rechazan.

export type PwCookie = Awaited<ReturnType<BrowserContext['cookies']>>[number];
export type Role = 'owner' | 'member';
export type Org = { id: string; name: string };
export type TestUser = {
  id: string;
  email: string;
  password: string;
  membership: { org: Org; role: Role } | null;
};
export type World = {
  run: string;
  orgA: Org;
  orgB: Org;
  ownerA: TestUser;
  memberA: TestUser;
  ownerB: TestUser;
  outsider: TestUser;
  serviceKey: string;
  createUser: (label: string, membership: { org: Org; role: Role } | null) => Promise<TestUser>;
};

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function requireEnv() {
  const names = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Faltan variables del stack local de Supabase: ${missing.join(', ')}`);
  }
  const url = process.env.SUPABASE_URL as string;
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      'Las pruebas E2E con Auth real crean usuarios y solo pueden ejecutarse contra un stack local (127.0.0.1/localhost).',
    );
  }
  return {
    url,
    anonKey: process.env.SUPABASE_ANON_KEY as string,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  };
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error || result.data === null) {
    throw new Error(`Preparacion fallida (${what}): ${result.error?.message ?? 'sin datos'}`);
  }
  return result.data;
}

async function buildWorld(): Promise<World> {
  const { url, serviceKey } = requireEnv();
  const admin: SupabaseClient = createClient(url, serviceKey, authOptions);
  const run = randomUUID().slice(0, 8);

  const orgs = must(
    await admin
      .from('organizations')
      .insert([{ name: `Taller Alfa ${run}` }, { name: `Taller Beta ${run}` }])
      .select('id, name')
      .order('name'),
    'crear organizaciones',
  ) as Org[];
  const [orgA, orgB] = orgs;

  const createUser: World['createUser'] = async (label, membership) => {
    const email = `${label}-${run}-${randomBytes(3).toString('hex')}@example.test`;
    const password = randomBytes(24).toString('base64url');
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const user = created.data.user;
    if (created.error || !user) {
      throw new Error(`Preparacion fallida (usuario ${label}): ${created.error?.message}`);
    }
    if (membership) {
      must(
        await admin
          .from('memberships')
          .insert({ organization_id: membership.org.id, user_id: user.id, role: membership.role })
          .select('user_id'),
        `membresia ${label}`,
      );
    }
    return { id: user.id, email, password, membership };
  };

  const ownerA = await createUser('owner-a', { org: orgA, role: 'owner' });
  const memberA = await createUser('member-a', { org: orgA, role: 'member' });
  const ownerB = await createUser('owner-b', { org: orgB, role: 'owner' });
  const outsider = await createUser('outsider', null);

  return { run, orgA, orgB, ownerA, memberA, ownerB, outsider, serviceKey, createUser };
}

let worldPromise: Promise<World> | undefined;
/** Un mundo por proceso worker (memoizado). */
export function getWorld(): Promise<World> {
  worldPromise ??= buildWorld();
  return worldPromise;
}

export function baseOf(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('baseURL no definido en la configuracion de Playwright');
  return baseURL.replace(/\/$/, '');
}

// --- Marcadores de contrato de UI (ver docs/reviews/claude/TASK-007-PRE.md) ----------------------

export const ROLE_PATTERN: Record<Role, RegExp> = {
  owner: /owner|propietari/i,
  member: /member|miembro/i,
};

export const SUBMIT_NAME = /iniciar sesi[oó]n|entrar|acceder|sign in|log ?in/i;
export const LOGOUT_NAME = /cerrar sesi[oó]n|salir|sign out|log ?out/i;

// --- Cookies de sesion de @supabase/ssr -----------------------------------------------------------

const AUTH_COOKIE = /^(sb-.+-auth-token)(?:\.(\d+))?$/;
const CHUNK_SIZE = 3000;

export function authCookies(cookies: PwCookie[]): PwCookie[] {
  return cookies.filter((cookie) => AUTH_COOKIE.test(cookie.name));
}

type Session = Record<string, unknown> & { access_token?: string; refresh_token?: string };

export function readSession(cookies: PwCookie[]): {
  baseName: string;
  session: Session;
  template: PwCookie;
} {
  const own = authCookies(cookies).sort(
    (a, b) =>
      Number(AUTH_COOKIE.exec(a.name)![2] ?? -1) - Number(AUTH_COOKIE.exec(b.name)![2] ?? -1),
  );
  if (own.length === 0) throw new Error('No hay cookie de sesion de Supabase en el contexto');
  const baseName = AUTH_COOKIE.exec(own[0].name)![1];
  const raw = decodeURIComponent(own.map((cookie) => cookie.value).join(''));
  const json = raw.startsWith('base64-')
    ? Buffer.from(raw.slice('base64-'.length), 'base64url').toString('utf8')
    : raw;
  return { baseName, session: JSON.parse(json) as Session, template: own[0] };
}

export function encodeSessionCookies(baseName: string, value: string, template: PwCookie) {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) chunks.push(value.slice(i, i + CHUNK_SIZE));
  const names = chunks.length === 1 ? [baseName] : chunks.map((_, i) => `${baseName}.${i}`);
  return chunks.map((chunk, i) => ({ ...template, name: names[i], value: chunk }));
}

export function sessionToValue(session: Session): string {
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

function jwtParts(token: string): [string, string, string] {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT con formato inesperado');
  return parts as [string, string, string];
}

/** Cambia la firma del JWT (primer caracter distinto) manteniendo cabecera y payload. */
export function withBadSignature(token: string): string {
  const [header, payload, signature] = jwtParts(token);
  const first = signature[0] === 'A' ? 'B' : 'A';
  return `${header}.${payload}.${first}${signature.slice(1)}`;
}

/** Sustituye `sub` en el payload (identidad ajena) sin volver a firmar. */
export function withForeignSub(token: string, sub: string): string {
  const [header, payload, signature] = jwtParts(token);
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
  claims.sub = sub;
  return `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;
}

// --- Contextos y login ------------------------------------------------------------------------------

export async function contextWithCookies(browser: Browser, baseURL: string, cookies: PwCookie[]) {
  const context = await browser.newContext({ baseURL });
  await context.addCookies(cookies);
  return context;
}

export async function uiLogin(
  page: Page,
  user: Pick<TestUser, 'email' | 'password'>,
  next?: string,
) {
  await page.goto(next === undefined ? '/login' : `/login?next=${encodeURIComponent(next)}`);
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.getByRole('button', { name: SUBMIT_NAME }).click();
}

export function isDashboard(origin: string) {
  return (url: URL) => url.origin === origin && url.pathname === '/dashboard';
}

/** Inicia sesion por la UI en un contexto nuevo y devuelve sus cookies (el contexto se cierra). */
export async function loginCookies(
  browser: Browser,
  baseURL: string,
  user: Pick<TestUser, 'email' | 'password'>,
): Promise<PwCookie[]> {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await uiLogin(page, user);
    await page.waitForURL(isDashboard(new URL(baseURL).origin), { timeout: 20_000 });
    return await context.cookies();
  } finally {
    await context.close();
  }
}

const cookieCache = new Map<string, Promise<PwCookie[]>>();
/** Un unico login por usuario y worker (el limite de inicios de sesion de GoTrue es bajo). */
export function cachedLoginCookies(browser: Browser, baseURL: string, user: TestUser) {
  let entry = cookieCache.get(user.email);
  if (!entry) {
    entry = loginCookies(browser, baseURL, user);
    cookieCache.set(user.email, entry);
  }
  return entry;
}

export async function authedContext(browser: Browser, baseURL: string, user: TestUser) {
  return contextWithCookies(browser, baseURL, await cachedLoginCookies(browser, baseURL, user));
}

// --- Aserciones reutilizables ----------------------------------------------------------------------

export function locationOf(response: APIResponse, baseURL: string): URL {
  const location = response.headers()['location'];
  expect(location, `sin cabecera Location (estado ${response.status()})`).toBeTruthy();
  return new URL(location, baseURL);
}

export function expectRedirectToLogin(response: APIResponse, baseURL: string, what: string) {
  expect([301, 302, 303, 307, 308], `${what}: se esperaba una redireccion`).toContain(
    response.status(),
  );
  const target = locationOf(response, baseURL);
  expect(target.origin, `${what}: redireccion a otro origen`).toBe(new URL(baseURL).origin);
  expect(target.pathname, `${what}: debe redirigir a /login`).toBe('/login');
}

/** Respuestas con datos de usuario: nada de cache compartida. */
export function expectNotSharedCacheable(
  response: APIResponse,
  what: string,
  options: { required: boolean },
) {
  const headers = response.headers();
  const cacheControl = (headers['cache-control'] ?? '').toLowerCase();
  if (options.required) {
    expect(cacheControl, `${what}: falta Cache-Control no compartido`).toMatch(/no-store|private/);
  }
  expect(cacheControl, `${what}: Cache-Control permite cache compartida`).not.toMatch(
    /\bpublic\b|s-maxage/,
  );
  expect(headers['x-nextjs-cache'] ?? '', `${what}: respuesta servida desde cache`).not.toMatch(
    /HIT|STALE/i,
  );
}

export function setCookieLines(response: APIResponse): string[] {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value);
}
