import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getSupabaseEnv } from '@/lib/env';

import type { Database } from './database.types';

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers. Se crea uno nuevo
 * por solicitud (nunca se comparte entre solicitudes) y usa solo la clave publicable: la
 * identidad y los permisos los aplica RLS con el JWT del usuario.
 */
export async function createClient() {
  const env = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Un Server Component no puede escribir cookies. El refresco de la sesion lo hara el
            // proxy de TASK-007; mientras tanto la escritura se ignora de forma segura.
          }
        },
      },
    },
  );
}
