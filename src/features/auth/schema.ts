import { z } from 'zod';

// Limites generosos pero acotados: evitan entradas de tamano abusivo antes de llegar a Auth.
export const loginSchema = z.object({
  email: z.string().trim().min(1).max(254).pipe(z.email()),
  password: z.string().min(1).max(1024),
});

export type LoginInput = z.infer<typeof loginSchema>;
