// Guarda de psql para suites que escriben en el stack Supabase LOCAL (TASK-011-FIX2).
//
// psql hereda variables PG*, PGSERVICE(FILE), PGPASSFILE, PSQLRC, etc. que pueden redirigirlo a otro
// destino. Este modulo, puro y sin efectos (sin red ni procesos), fija una conexion unica al stack
// local autorizado, rechaza configuraciones alternativas y construye un entorno desde cero. Nunca se
// acepta una URL externa: SUPABASE_DB_URL solo se admite si es EXACTAMENTE la conexion autorizada.
// Los mensajes no incluyen valores recibidos (podrian llevar credenciales).

export const LOCAL_PSQL = {
  host: '127.0.0.1',
  port: '54322',
  user: 'postgres',
  database: 'postgres',
  password: 'postgres',
} as const;

export const AUTHORIZED_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const FIXED_PG_ENV: Readonly<Record<string, string>> = {
  PGHOST: LOCAL_PSQL.host,
  PGPORT: LOCAL_PSQL.port,
  PGUSER: LOCAL_PSQL.user,
  PGDATABASE: LOCAL_PSQL.database,
  PGPASSWORD: LOCAL_PSQL.password,
};

type Env = Record<string, string | undefined>;

/** SUPABASE_DB_URL, si existe, debe ser exactamente la conexion autorizada. */
export function assertAuthorizedDbUrl(env: Env): void {
  const value = env.SUPABASE_DB_URL;
  if (value === undefined || value.trim() === '') return;
  if (value.trim() !== AUTHORIZED_DB_URL) {
    throw new Error(
      'SUPABASE_DB_URL no es la conexion local autorizada (127.0.0.1:54322): se rechaza',
    );
  }
}

/**
 * Rechaza cualquier variable PG* o PSQLRC heredada con un valor distinto del autorizado (las cinco
 * variables fijas solo se admiten con su valor exacto; todo lo demas, p. ej. PGSERVICE, PGSERVICEFILE,
 * PGSYSCONFDIR, PGPASSFILE, PGOPTIONS, PGSSL*, PGCONNECT_TIMEOUT, PSQLRC, se rechaza si esta presente).
 */
export function assertNoForeignPgConfig(env: Env): void {
  for (const [name, value] of Object.entries(env)) {
    const key = name.toUpperCase();
    if (value === undefined || !(key.startsWith('PG') || key === 'PSQLRC')) continue;
    if (FIXED_PG_ENV[key] !== undefined && value === FIXED_PG_ENV[key]) continue;
    throw new Error(
      `Configuracion de psql no autorizada en el entorno (${key}): elimina las variables PG*/PSQLRC`,
    );
  }
}

/** Entorno de psql construido desde cero: PATH minimo + conexion fija. Aplica antes las guardas. */
export function buildPsqlEnv(parent: Env): NodeJS.ProcessEnv {
  assertAuthorizedDbUrl(parent);
  assertNoForeignPgConfig(parent);
  const env: Record<string, string> = {};
  const path = parent.PATH ?? parent.Path;
  if (path) env.PATH = path;
  if (parent.SystemRoot) env.SystemRoot = parent.SystemRoot; // necesario para winsock en Windows
  return { ...env, ...FIXED_PG_ENV } as NodeJS.ProcessEnv;
}

/** Argumentos de psql: sin psqlrc, conexion explicita fija y sin URL. */
export function buildPsqlArgs(extra: readonly string[]): string[] {
  return [
    '-X',
    '--no-psqlrc',
    '-h',
    LOCAL_PSQL.host,
    '-p',
    LOCAL_PSQL.port,
    '-U',
    LOCAL_PSQL.user,
    '-d',
    LOCAL_PSQL.database,
    '-v',
    'ON_ERROR_STOP=1',
    ...extra,
  ];
}

export type PsqlInvocation = {
  env: NodeJS.ProcessEnv;
  args: (extra: readonly string[]) => string[];
};

/** Punto unico: valida el entorno y devuelve lo necesario para invocar psql. Lanza si no es seguro. */
export function prepareLocalPsql(parent: Env): PsqlInvocation {
  return { env: buildPsqlEnv(parent), args: buildPsqlArgs };
}

/** Comprobacion cruzada: la API y PostgreSQL deben ver exactamente los mismos ids. */
export function assertSameStack(
  label: string,
  apiIds: readonly string[],
  dbIds: readonly string[],
) {
  const a = [...new Set(apiIds)].sort();
  const b = [...new Set(dbIds)].sort();
  if (a.length !== b.length || a.some((id, i) => id !== b[i])) {
    throw new Error(
      `La API y PostgreSQL no pertenecen al mismo stack aislado (${label}): se aborta sin escribir`,
    );
  }
}
