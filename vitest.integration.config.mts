import { defineConfig } from 'vitest/config';

// Pruebas de integracion contra PostgreSQL in-process (PGlite). Las de Supabase real viven en
// tests/integration/supabase/ y se ejecutan con vitest.supabase.config.mts (stack local de CI).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['tests/integration/supabase/**', '**/node_modules/**'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
