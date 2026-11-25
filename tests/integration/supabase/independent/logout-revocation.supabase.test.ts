// @vitest-environment node
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { authOptions, createActor, localBase } from './support/stack';

// Caso independiente de Testing (TASK-010 PRE, A02-01) contra el stack LOCAL de Supabase en CI
// (`pnpm test:supabase`). Si faltan SUPABASE_*, FALLA. NO se ha podido ejecutar en local (sin
// Docker): validacion efectiva pendiente de CI.
//
// Objetivo: caracterizar con Auth REAL que ocurre con una sesion copiada ANTES del logout segun la
// revocacion remota se confirme o falle. Es la base factual del aviso de /login (A02-01): si la
// revocacion falla, la sesion copiada sigue siendo valida en el servidor de Auth y la interfaz no
// debe afirmar lo contrario. R1 (validez residual del JWT frente a PostgREST hasta su caducidad) se
// mantiene aceptado solo en su alcance original y no se re-evalua aqui.
//
// El fallo de revocacion se simula con un `fetch` que rechaza unicamente POST /auth/v1/logout;
// el resto del trafico va al stack local real.

let stack: ReturnType<typeof localBase>;

// Sin organizaciones ni membresias: solo usuarios con sesion (menos inicios de sesion en el stack).
beforeAll(() => {
  stack = localBase();
});

type FailureMode = 'http500' | 'network';

function logoutFailingFetch(mode: FailureMode): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/auth/v1/logout')) {
      if (mode === 'network') throw new TypeError('fetch failed (simulado)');
      return new Response(JSON.stringify({ message: 'simulated upstream failure' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    return fetch(input, init);
  };
}

async function sessionOf(client: SupabaseClient) {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new Error('Preparacion fallida: sin sesion');
  return data.session;
}

/** Nuevo usuario con sesion; devuelve un cliente "victima" (con el fetch indicado) y la copia de sus tokens. */
async function victimWithCopiedSession(label: string, fetchImpl?: typeof fetch) {
  const actor = await createActor(stack.admin, stack.url, stack.anonKey, label, stack.run);
  const session = await sessionOf(actor.client);
  const copied = { accessToken: session.access_token, refreshToken: session.refresh_token };
  const victim = createClient(stack.url, stack.anonKey, {
    auth: authOptions.auth,
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });
  const set = await victim.auth.setSession({
    access_token: copied.accessToken,
    refresh_token: copied.refreshToken,
  });
  if (set.error) throw new Error(`Preparacion fallida (setSession): ${set.error.message}`);
  return { actor, victim, copied };
}

const freshClient = () => createClient(stack.url, stack.anonKey, authOptions);

describe('A02-01 revocacion remota confirmada: la sesion copiada deja de ser valida', () => {
  it('signOut local sin error: getUser y refreshSession con los tokens copiados fallan', async () => {
    const { victim, copied } = await victimWithCopiedSession('lo-ok');
    const result = await victim.auth.signOut({ scope: 'local' });
    expect(result.error).toBeNull();
    expect((await victim.auth.getSession()).data.session).toBeNull();

    const attacker = freshClient();
    expect((await attacker.auth.getUser(copied.accessToken)).error).not.toBeNull();
    const refreshed = await attacker.auth.refreshSession({ refresh_token: copied.refreshToken });
    expect(refreshed.error).not.toBeNull();
    expect(refreshed.data.session).toBeNull();
  });
});

describe.each([
  ['respuesta 500 de Auth', 'http500'],
  ['fallo de red', 'network'],
] as const)('A02-01 revocacion remota fallida: %s', (_name, mode) => {
  it('signOut devuelve error (no lo ignora la libreria) y la sesion local de ese cliente desaparece', async () => {
    const { victim } = await victimWithCopiedSession(`lo-${mode}`, logoutFailingFetch(mode));
    const result = await victim.auth.signOut({ scope: 'local' });
    // El error se devuelve: logoutAction debe tratarlo como "revocacion NO confirmada".
    expect(result.error, 'signOut debia devolver el error de revocacion').not.toBeNull();
    // Con scope local la sesion local se elimina antes de la peticion: no depende de la red.
    expect((await victim.auth.getSession()).data.session).toBeNull();
  });

  it('la sesion copiada antes del logout SIGUE siendo valida en Auth: getUser, refresh y datos por RLS', async () => {
    const { actor, victim, copied } = await victimWithCopiedSession(
      `lo-copy-${mode}`,
      logoutFailingFetch(mode),
    );
    await victim.auth.signOut({ scope: 'local' });

    const attacker = freshClient();
    // 1) El access token copiado sigue verificandose contra Auth.
    const user = await attacker.auth.getUser(copied.accessToken);
    expect(user.error).toBeNull();
    expect(user.data.user?.id).toBe(actor.id);
    // 2) El refresh token copiado sigue sirviendo: se puede obtener una sesion nueva. Esto es lo
    //    que la interfaz NO debe negar al mostrar el aviso de cierre no confirmado.
    const refreshed = await attacker.auth.refreshSession({ refresh_token: copied.refreshToken });
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.session?.access_token).toBeTruthy();
    // 3) La sesion renovada accede a datos protegidos por RLS como ese usuario.
    const memberships = await attacker.from('memberships').select('user_id');
    expect(memberships.error).toBeNull();
    expect(Array.isArray(memberships.data)).toBe(true);

    // Limpieza: revoca la sesion renovada en el servidor para no dejarla viva.
    await attacker.auth.signOut({ scope: 'global' });
  });

  it('reintentar el cierre con red sana revoca la sesion: tras el segundo intento deja de ser valida', async () => {
    const { victim, copied } = await victimWithCopiedSession(
      `lo-retry-${mode}`,
      logoutFailingFetch(mode),
    );
    await victim.auth.signOut({ scope: 'local' }); // falla la revocacion remota

    // El usuario vuelve a iniciar sesion con la copia y cierra de nuevo con red sana.
    const second = freshClient();
    const set = await second.auth.setSession({
      access_token: copied.accessToken,
      refresh_token: copied.refreshToken,
    });
    expect(set.error).toBeNull();
    expect((await second.auth.signOut({ scope: 'local' })).error).toBeNull();

    const attacker = freshClient();
    expect((await attacker.auth.getUser(copied.accessToken)).error).not.toBeNull();
  });
});
