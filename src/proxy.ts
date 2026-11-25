import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { safeNextPath } from '@/features/auth/redirect';
import { LOGIN_PATH, isProtectedPath } from '@/features/auth/routes';
import { getSupabaseEnv } from '@/lib/env';

// Refresca la sesion de Supabase y redirige a /login las rutas protegidas sin sesion. NO es la
// unica barrera: cada pagina/accion de servidor verifica la identidad por su cuenta (requireUser).

function redirectToLogin(request: NextRequest, carry?: NextResponse): NextResponse {
  const url = request.nextUrl.clone();
  const next = safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`, '');
  url.pathname = LOGIN_PATH;
  url.search = '';
  if (next) url.searchParams.set('next', next);
  const response = NextResponse.redirect(url, 307);
  // Conserva cookies (p. ej. sesion caducada eliminada) y cabeceras anti-cache de la libreria.
  carry?.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  carry?.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (name !== 'set-cookie' && !name.startsWith('x-middleware')) {
      response.headers.set(key, value);
    }
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function proxy(request: NextRequest) {
  const protectedPath = isProtectedPath(request.nextUrl.pathname);

  let env: ReturnType<typeof getSupabaseEnv>;
  try {
    env = getSupabaseEnv();
  } catch {
    // Sin configuracion de Supabase: las rutas publicas siguen funcionando; las protegidas
    // fallan cerradas.
    return protectedPath ? redirectToLogin(request) : NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // POST-07: las respuestas que escriben cookies de sesion no deben cachearse de forma
          // compartida; se aplican las cabeceras que entrega la libreria.
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  let authenticated = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    authenticated = !error && !!data?.claims?.sub;
  } catch {
    authenticated = false;
  }

  if (!authenticated && protectedPath) return redirectToLogin(request, response);
  return response;
}

export const config = {
  matcher: [
    // Todo salvo recursos estaticos de Next y ficheros de imagen/fuente.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
