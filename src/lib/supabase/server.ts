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
        // El segundo argumento (cabeceras anti-cache de la libreria) no se puede aplicar aqui: Next
        // no permite fijar cabeceras desde `cookies()`. No hace falta: las respuestas que escriben
        // cookies (Server Actions) y las paginas que leen cookies son dinamicas y privadas. El
        // refresco de la sesion lo hace `src/proxy.ts`, que si aplica cookies y cabeceras (POST-07).
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Un Server Component no puede escribir cookies; el proxy ya refresca la sesion.
          }
        },
      },
    },
  );
}
