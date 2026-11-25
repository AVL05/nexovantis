import { createBrowserClient } from '@supabase/ssr';

import { getSupabaseEnv } from '@/lib/env';

import type { Database } from './database.types';

/** Cliente de Supabase para componentes de cliente (navegador). Usa solo la clave publicable. */
export function createClient() {
  const env = getSupabaseEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
