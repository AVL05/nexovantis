// Funcion pura (sin imports de servidor): se usa en el proxy, en Server Actions y en pruebas.

const DEFAULT_PATH = '/dashboard';
const MAX_LENGTH = 2048;
const BASE = 'http://nexovantis.invalid';

// Caracteres de control, DEL, espacios y barra invertida: nunca en una ruta interna valida.
const FORBIDDEN = /[\u0000- \u007f\\]/;

function isInternal(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (path.length > MAX_LENGTH || FORBIDDEN.test(path)) return false;
  if (/(^|\/)\.\.?(\/|\?|#|$)/.test(path)) return false;
  return true;
}

/**
 * Devuelve `value` solo si es una ruta interna segura (empieza por una unica "/"); en cualquier
 * otro caso devuelve `fallback`. Rechaza esquemas, `//`, `\`, caracteres de control, segmentos `.`
 * y `..`, y formas codificadas que al decodificarse dejarian de ser una ruta interna.
 * Es idempotente: una ruta aceptada se devuelve sin cambios.
 */
export function safeNextPath(value: unknown, fallback = DEFAULT_PATH): string {
  if (typeof value !== 'string' || !isInternal(value)) return fallback;

  // Revisa las versiones decodificadas (hasta 3 niveles) para detectar `//` o `\` ocultos.
  let current = value;
  for (let level = 0; level < 3; level += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return fallback;
    }
    if (decoded === current) break;
    if (!isInternal(decoded)) return fallback;
    current = decoded;
  }

  // El navegador normaliza la ruta al resolverla: debe seguir en el mismo origen y no empezar por `//`.
  try {
    const parsed = new URL(value, BASE);
    if (parsed.origin !== BASE || parsed.pathname.startsWith('//')) return fallback;
  } catch {
    return fallback;
  }
  return value;
}
