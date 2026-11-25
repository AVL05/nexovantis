import { cookies } from 'next/headers';

import { SESSION_COOKIE_PATTERN } from './routes';

/**
 * Estado de las cookies de sesion de Supabase de la solicitud actual:
 * - `present`: hay al menos una cookie de sesion.
 * - `absent`: el almacen se leyo y no hay ninguna.
 * - `unreadable`: el almacen no se pudo leer; no hay evidencia ni de una cosa ni de la otra.
 */
export type LocalSessionState = 'present' | 'absent' | 'unreadable';

/** No consulta a Auth: solo distingue presentes / ausentes / ilegibles. */
export async function getLocalSessionState(): Promise<LocalSessionState> {
  try {
    const store = await cookies();
    return store.getAll().some(({ name }) => SESSION_COOKIE_PATTERN.test(name))
      ? 'present'
      : 'absent';
  } catch {
    return 'unreadable';
  }
}

/** True solo si hay evidencia de cookies de sesion (un almacen ilegible no cuenta como presente). */
export async function hasLocalSessionCookies(): Promise<boolean> {
  return (await getLocalSessionState()) === 'present';
}
