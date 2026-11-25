import { z } from 'zod';

// Limites alineados con los CHECK de supabase/migrations/ (customers).
export const CUSTOMER_LIMITS = { name: 200, email: 254, phone: 40, notes: 2000 } as const;

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
    .max(CUSTOMER_LIMITS.email)
    .nullish()
    .transform((value) => value ?? null),
);

const customerFields = {
  name: z.string().trim().min(1).max(CUSTOMER_LIMITS.name),
  email: optionalEmail,
  phone: optionalText(CUSTOMER_LIMITS.phone),
  notes: optionalText(CUSTOMER_LIMITS.notes),
};

/** Alta de cliente. Campos desconocidos (p. ej. organization_id) se rechazan. */
export const customerCreateSchema = z.strictObject(customerFields);

/** Edicion de cliente: mismos campos mas el identificador del registro. */
export const customerUpdateSchema = z.strictObject({ id: z.uuid(), ...customerFields });

export type CustomerCreateInput = z.output<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.output<typeof customerUpdateSchema>;
