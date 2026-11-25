import { defineConfig } from 'vitest/config';

// Pruebas contra el stack local de Supabase (`supabase start`) en CI. Requieren SUPABASE_URL,
// SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY. Se validan al cargar la configuracion: si
// falta alguna, el comando termina con error antes de recoger pruebas (no se saltan).
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  throw new Error(
    `test:supabase requiere las variables del stack local de Supabase (supabase status -o env). Faltan: ${missing.join(', ')}`,
  );
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/supabase/**/*.test.ts'],
    // Valida que SUPABASE_URL sea el stack LOCAL antes de cargar cualquier suite (A02-02).
    setupFiles: ['tests/support/supabase-local-guard.setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
