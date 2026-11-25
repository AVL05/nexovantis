import { z } from 'zod';

// Limites alineados con los CHECK de supabase/migrations/ (technicians).
export const TECHNICIAN_LIMITS = { full_name: 200, email: 254, phone: 40, notes: 2000 } as const;

// Texto opcional: se recorta y el vacio pasa a null. organization_id no forma parte de la
// entrada: la organizacion la determina el servidor a partir de la sesion (BR01).
const normalize = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const optionalText = (max: number) =>
  z.preprocess(
    normalize,
    z
      .string()
      .max(max)
      .nullish()
      .transform((value) => value ?? null),
  );

const optionalEmail = z.preprocess(
  normalize,
  z
    .email()
    .max(TECHNICIAN_LIMITS.email)
    .nullish()
    .transform((value) => value ?? null),
);

const technicianFields = {
  full_name: z.string().trim().min(1).max(TECHNICIAN_LIMITS.full_name),
  email: optionalEmail,
  phone: optionalText(TECHNICIAN_LIMITS.phone),
  notes: optionalText(TECHNICIAN_LIMITS.notes),
};

/** Alta de tecnico. Campos desconocidos (p. ej. organization_id) se rechazan. */
export const technicianCreateSchema = z.strictObject(technicianFields);

/** Edicion de tecnico: mismos campos mas el identificador del registro. */
export const technicianUpdateSchema = z.strictObject({ id: z.uuid(), ...technicianFields });

export type TechnicianCreateInput = z.output<typeof technicianCreateSchema>;
export type TechnicianUpdateInput = z.output<typeof technicianUpdateSchema>;
