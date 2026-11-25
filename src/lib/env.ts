import { z } from 'zod';

// Variables publicas de Supabase. Solo claves publicables: nunca claves de servicio (service
// role) en variables NEXT_PUBLIC_* ni en src/.
const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^https?$/ })),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().trim().min(1),
});

export type SupabaseEnv = z.infer<typeof supabaseEnvSchema>;

/**
 * Valida un origen de variables. Si algo falta o es invalido lanza un error que nombra las
 * variables afectadas, sin incluir sus valores.
 */
export function parseSupabaseEnv(source: Partial<Record<keyof SupabaseEnv, string | undefined>>) {
  const result = supabaseEnvSchema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(
      `Configuracion de Supabase invalida o ausente: ${names.join(', ')}. Revisa .env.example.`,
    );
  }
  return result.data;
}

/**
 * Lee y valida el entorno bajo demanda (no al importar el modulo), de modo que `next build` no
 * exige las variables. Next sustituye `process.env.NEXT_PUBLIC_*` solo con acceso literal.
 */
export function getSupabaseEnv(): SupabaseEnv {
  return parseSupabaseEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
