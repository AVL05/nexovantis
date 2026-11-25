'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createClient, type RevocationObserver } from '@/lib/supabase/server';

import { safeNextPath } from './redirect';
import { LOGIN_PATH, LOGOUT_UNCONFIRMED_PATH, SESSION_COOKIE_PATTERN } from './routes';
import { loginSchema } from './schema';

export type LoginState = { error: string | null; email: string };

// Mismo mensaje para cualquier fallo: no revela si el correo existe ni el motivo.
const GENERIC_ERROR = 'No se pudo iniciar sesión. Revisa tus datos e inténtalo de nuevo.';

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = formData.get('email');
  const email = typeof rawEmail === 'string' ? rawEmail.slice(0, 254) : '';
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: GENERIC_ERROR, email };

  let ok = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    ok = !error;
  } catch {
    ok = false;
  }
  if (!ok) return { error: GENERIC_ERROR, email };

  // redirect() lanza una excepcion de control de flujo: debe quedar fuera del try/catch.
  redirect(safeNextPath(formData.get('next')));
}

/** Cierre local seguro: elimina las cookies de sesion de esta solicitud aunque Auth haya fallado. */
async function clearLocalSession(): Promise<void> {
  try {
    const store = await cookies();
    for (const { name } of store.getAll()) {
      if (!SESSION_COOKIE_PATTERN.test(name)) continue;
      try {
        store.delete(name);
      } catch {
        // Un fallo al borrar una cookie no debe impedir borrar el resto ni redirigir.
      }
    }
  } catch {
    // Sin almacen de cookies disponible solo queda redirigir con el aviso.
  }
}

// Codigos de GoTrue que acreditan que la sesion ya no existe en Auth (nada que revocar).
const SESSION_ABSENT_CODES = new Set(['session_not_found', 'user_not_found']);

/**
 * Clasifica el resultado de la revocacion. `auth-js` devuelve `error: null` ante 401/403/404, asi
 * que el SDK no basta: se combina con la respuesta HTTP observada en el transporte.
 * - `confirmed`: 2xx, o no hubo peticion (sin cookies de sesion no hay nada que revocar).
 * - `session-absent`: 403 de GoTrue con `session_not_found`/`user_not_found`.
 * - `indeterminate`: cualquier otra cosa (resto de no 2xx, cuerpo no JSON, excepcion, error del SDK).
 */
function classifyRevocation(
  observer: RevocationObserver,
  sdkError: unknown,
): 'confirmed' | 'session-absent' | 'indeterminate' {
  if (observer.threw) return 'indeterminate';
  if (observer.status === null) {
    // Sin respuesta observada: si hubo peticion es que no llego; si no la hubo, decide el SDK.
    return observer.requested || sdkError ? 'indeterminate' : 'confirmed';
  }
  if (observer.status >= 200 && observer.status < 300) {
    return sdkError ? 'indeterminate' : 'confirmed';
  }
  if (
    observer.status === 403 &&
    observer.code !== null &&
    SESSION_ABSENT_CODES.has(observer.code)
  ) {
    return 'session-absent';
  }
  return 'indeterminate';
}

/**
 * Cierra la sesion de este navegador con UN unico intento de revocacion (sin reintentos). Solo una
 * revocacion confirmada (2xx) o una sesion que Auth acredita inexistente redirigen a /login sin mas.
 * Cualquier otro resultado (error del SDK, 401/403/404 sin evidencia de sesion inexistente, 5xx,
 * cuerpo no JSON o excepcion) deja la revocacion SIN confirmar: se limpian las cookies locales y se
 * redirige con un aviso fijo (nunca el error ni el codigo). Si ademas el borrado local falla,
 * /login lo detecta (siguen las cookies de sesion) y en vez de redirigir al panel avisa de que la
 * sesion NO se cerro y ofrece reintentar.
 */
export async function logoutAction(): Promise<void> {
  const observer: RevocationObserver = { requested: false, status: null, code: null, threw: false };
  let outcome: ReturnType<typeof classifyRevocation> = 'indeterminate';
  try {
    const supabase = await createClient({ revocation: observer });
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    outcome = classifyRevocation(observer, error);
  } catch {
    outcome = 'indeterminate';
  }
  if (outcome !== 'confirmed') await clearLocalSession();

  // redirect() lanza una excepcion de control de flujo: debe quedar fuera de cualquier try/catch.
  redirect(outcome === 'indeterminate' ? LOGOUT_UNCONFIRMED_PATH : LOGIN_PATH);
}
