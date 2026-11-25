// Proteccion de destino de las suites que usan la clave de servicio (TASK-010, A02-02).
//
// Las suites Supabase (integracion y E2E) crean usuarios, organizaciones y datos con la clave de
// servicio: solo pueden ejecutarse contra el stack LOCAL (`supabase start`). Este modulo valida el
// destino de forma estricta ANTES de construir ningun cliente o enviar una peticion. Sin red, sin
// efectos y sin importar @supabase/supabase-js. Los mensajes no incluyen la URL recibida (podria
// llevar credenciales) ni valores de claves de API.

const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

const REJECTED =
  'SUPABASE_URL no es un destino local autorizado: solo se admite un stack local de Supabase ' +
  '(http://127.0.0.1, http://localhost o http://[::1], con puerto, sin credenciales ni ruta).';

/**
 * Devuelve el origen normalizado de una URL de Supabase local o lanza un Error. Exige protocolo
 * `http:`, hostname exacto `127.0.0.1`, `localhost` o `[::1]` (ya normalizado por WHATWG URL), sin
 * usuario ni clave, ruta, consulta ni fragmento.
 */
export function assertLocalSupabaseUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(REJECTED);
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(REJECTED);
  }
  const plain = parsed.pathname === '/' && parsed.search === '' && parsed.hash === '';
  if (
    parsed.protocol !== 'http:' ||
    !LOCAL_HOSTNAMES.has(parsed.hostname) ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    !plain
  ) {
    throw new Error(REJECTED);
  }
  return parsed.origin;
}

export type LocalSupabaseEnv = { url: string; anonKey: string; serviceKey: string };

/**
 * Exige SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY (no se saltan si faltan) y
 * valida que la URL sea local.
 */
export function requireLocalSupabaseEnv(
  env: Record<string, string | undefined> = process.env,
): LocalSupabaseEnv {
  const names = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Faltan variables del stack local de Supabase: ${missing.join(', ')}`);
  }
  return {
    url: assertLocalSupabaseUrl(env.SUPABASE_URL),
    anonKey: env.SUPABASE_ANON_KEY as string,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY as string,
  };
}
