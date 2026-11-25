import { defineConfig, devices } from '@playwright/test';

// E2E con Auth real contra el stack local de Supabase (job `supabase` de CI, `pnpm test:e2e:supabase`).
// Variables esperadas del stack local: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Las pruebas fallan (no se saltan) si faltan; este fichero no lanza para poder usar `--list`.
const PORT = 3200; // distinto del de playwright.config.ts (3100)
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e-supabase',
  fullyParallel: false,
  workers: 1, // limite de inicios de sesion del stack local y estado compartido por worker
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Las NEXT_PUBLIC_* se incrustan al compilar: deben estar definidas en build y en start.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_ANON_KEY ?? '',
      // La app nunca usa la clave de servicio: no se propaga al proceso del servidor.
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
