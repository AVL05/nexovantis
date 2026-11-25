import { cookies } from 'next/headers';

import { SESSION_COOKIE_PATTERN } from './routes';

/**
 * True si la solicitud actual aun lleva cookies de sesion de Supabase. No consulta a Auth: sirve
 * para saber si el cierre local de sesion fallo aunque Auth no responda. Si el almacen de cookies
 * no esta disponible no hay evidencia de sesion viva y devuelve false.
 */
export async function hasLocalSessionCookies(): Promise<boolean> {
  try {
    const store = await cookies();
    return store.getAll().some(({ name }) => SESSION_COOKIE_PATTERN.test(name));
  } catch {
    return false;
  }
}
