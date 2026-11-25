// Funcion pura (sin imports de servidor): se usa en el proxy, en Server Actions y en pruebas.

const DEFAULT_PATH = '/dashboard';
const MAX_LENGTH = 2048;
const MAX_DECODE_LEVELS = 5;
const BASE = 'http://nexovantis.invalid';

// Caracteres de control, DEL, espacios y barra invertida: nunca aparecen SIN codificar en el valor.
const FORBIDDEN_RAW = /[\u0000- \u007f\\]/;
// Tras decodificar la RUTA: controles y barra invertida siguen prohibidos; el espacio es un dato valido.
const FORBIDDEN_DECODED_PATH = /[\u0000-\u001f\u007f\\]/;

/** Ruta sin consulta ni fragmento: solo ella decide el origen y el destino de la navegacion. */
function splitPath(value: string): string {
  const end = value.search(/[?#]/);
  return end === -1 ? value : value.slice(0, end);
}

function isInternalPath(path: string, allowSpace: boolean): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (path.length > MAX_LENGTH) return false;
  if ((allowSpace ? FORBIDDEN_DECODED_PATH : FORBIDDEN_RAW).test(path)) return false;
  return !path.split('/').some((segment) => segment === '.' || segment === '..');
}

/**
 * Devuelve `value` solo si es una ruta interna segura (empieza por una unica "/"); en cualquier
 * otro caso devuelve `fallback`. Rechaza esquemas, `//`, `\`, caracteres de control sin codificar,
 * segmentos `.` y `..`, y rutas codificadas (hasta varios niveles) que al decodificarse dejarian
 * de ser una ruta interna. La consulta y el fragmento conservan su codificacion (`%20`, `%25`,
 * acentos...) porque no pueden cambiar el origen. Es idempotente: una ruta aceptada se devuelve
 * sin cambios.
 */
export function safeNextPath(value: unknown, fallback = DEFAULT_PATH): string {
  if (typeof value !== 'string' || value.length > MAX_LENGTH || FORBIDDEN_RAW.test(value)) {
    return fallback;
  }
  const rawPath = splitPath(value);
  if (!isInternalPath(rawPath, false)) return fallback;

  // Decodifica la ruta nivel a nivel para detectar `//`, `\`, controles o `..` ocultos.
  let current = rawPath;
  for (let level = 0; ; level += 1) {
    if (level >= MAX_DECODE_LEVELS) return fallback; // no converge: codificacion sospechosa
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return fallback;
    }
    if (decoded === current) break;
    if (!isInternalPath(decoded, true)) return fallback;
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
