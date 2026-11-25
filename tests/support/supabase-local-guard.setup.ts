import { requireLocalSupabaseEnv } from './local-supabase';

// setupFile de vitest.supabase.config.mts (TASK-010, A02-02): se ejecuta antes de cargar cada
// archivo de pruebas, es decir, antes de que ninguna suite construya clientes o envie peticiones.
// Si el destino no es el stack local, el archivo falla con un error claro y sin trafico de red.
try {
  requireLocalSupabaseEnv();
} catch (error) {
  // Linea en texto plano (el salto inicial la separa de los codigos de color del reportero) para
  // que el motivo sea legible y localizable en los registros de CI. Sin URL recibida ni claves.
  const reason = error instanceof Error ? error.message : 'destino local no valido';
  console.error(`\nError: ${reason}`);
  throw error;
}
