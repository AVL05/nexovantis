// Funciones puras de rutas de autenticacion (sin imports de servidor).

export const LOGIN_PATH = '/login';
export const DASHBOARD_PATH = '/dashboard';

/** Valor fijo del parametro `aviso` cuando no se pudo confirmar la revocacion remota al cerrar sesion. */
export const LOGOUT_UNCONFIRMED_NOTICE = 'cierre-no-confirmado';
export const LOGOUT_UNCONFIRMED_PATH = `${LOGIN_PATH}?aviso=${LOGOUT_UNCONFIRMED_NOTICE}`;

/**
 * Cookies de sesion de @supabase/ssr: `sb-<ref>-auth-token` o fragmentos `.0`, `.1`...
 * Si tras cerrar sesion queda alguna, la sesion local sigue viva.
 */
export const SESSION_COOKIE_PATTERN = /^sb-.+-auth-token(\.\d+)?$/;

export const CUSTOMERS_PATH = '/customers';
export const TECHNICIANS_PATH = '/technicians';
export const ORDERS_PATH = '/orders';
export const QUOTES_PATH = '/quotes';

const PROTECTED_PREFIXES = [
  DASHBOARD_PATH,
  CUSTOMERS_PATH,
  TECHNICIANS_PATH,
  ORDERS_PATH,
  QUOTES_PATH,
];

/** Normaliza una ruta para decidir si es protegida: decodifica, une barras y pasa a minusculas. */
function normalize(pathname: string): string {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Una codificacion invalida se evalua tal cual.
  }
  const collapsed = decoded
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .toLowerCase();
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
}

/** True si la ruta requiere sesion. Las rutas desconocidas no son protegidas (responden 404). */
export function isProtectedPath(pathname: string): boolean {
  const path = normalize(pathname);
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
