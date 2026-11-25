'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

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

/**
 * Cierra la sesion de este navegador. Solo un `signOut` sin error confirma la revocacion remota
 * (redirige a /login). Si Auth devuelve un error o lanza una excepcion, la revocacion NO esta
 * confirmada: se limpian las cookies locales y se redirige con un aviso fijo (nunca el error).
 * Si ademas el borrado local falla, /login lo detecta (siguen las cookies de sesion) y en vez de
 * redirigir al panel avisa de que la sesion NO se cerro y ofrece reintentar.
 */
export async function logoutAction(): Promise<void> {
  let confirmed = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    confirmed = !error;
  } catch {
    confirmed = false;
  }
  if (!confirmed) await clearLocalSession();

  // redirect() lanza una excepcion de control de flujo: debe quedar fuera de cualquier try/catch.
  redirect(confirmed ? LOGIN_PATH : LOGOUT_UNCONFIRMED_PATH);
}
