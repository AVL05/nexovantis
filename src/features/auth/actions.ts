'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { safeNextPath } from './redirect';
import { LOGIN_PATH } from './routes';
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

export async function logoutAction(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Aunque Auth falle, se vuelve a /login; las cookies locales se limpian en signOut cuando es posible.
  }
  redirect(LOGIN_PATH);
}
