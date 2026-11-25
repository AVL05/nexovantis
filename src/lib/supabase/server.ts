import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getSupabaseEnv } from '@/lib/env';

import type { Database } from './database.types';

/**
 * Resultado observado de la peticion de revocacion `POST /auth/v1/logout` de UNA solicitud.
 * `auth-js` descarta los 401/403/404 de la revocacion y devuelve `error: null`, asi que el SDK no
 * basta para saber si la sesion se revoco: se observa la respuesta HTTP en el transporte.
 * Solo contiene el estado y el codigo de error de GoTrue (texto corto); nunca cabeceras, cuerpos
 * de peticion ni tokens. Se crea por solicitud y no se comparte.
 */
export type RevocationObserver = {
  /** Se envio la peticion de revocacion. */
  requested: boolean;
  /** Estado HTTP de la respuesta, si llego una. */
  status: number | null;
  /** `error_code` (formato heredado) o `code` textual (api-version 2024-01-01) del cuerpo JSON. */
  code: string | null;
  /** El transporte lanzo una excepcion (red, DNS, tiempo de espera). */
  threw: boolean;
};

function isLogoutRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'POST') return false;
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return new URL(url).pathname.endsWith('/auth/v1/logout');
  } catch {
    return false;
  }
}

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json();
    if (typeof body !== 'object' || body === null) return null;
    const { error_code: legacy, code } = body as { error_code?: unknown; code?: unknown };
    if (typeof legacy === 'string') return legacy;
    return typeof code === 'string' ? code : null;
  } catch {
    return null; // cuerpo no JSON o ilegible
  }
}

/** `fetch` que delega en el global y, solo para el POST de revocacion, anota estado y codigo. */
function observingFetch(observer: RevocationObserver): typeof fetch {
  return async (input, init) => {
    if (!isLogoutRequest(input, init)) return fetch(input, init);
    observer.requested = true;
    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      observer.threw = true;
      throw error;
    }
    observer.status = response.status;
    if (!response.ok) observer.code = await readErrorCode(response);
    return response;
  };
}

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers. Se crea uno nuevo
 * por solicitud (nunca se comparte entre solicitudes) y usa solo la clave publicable: la
 * identidad y los permisos los aplica RLS con el JWT del usuario.
 *
 * `config.revocation` (solo logout) recibe el resultado HTTP de la revocacion remota.
 */
export async function createClient(config: { revocation?: RevocationObserver } = {}) {
  const env = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      ...(config.revocation ? { global: { fetch: observingFetch(config.revocation) } } : {}),
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
