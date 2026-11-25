import { z } from 'zod';

import { ORDER_LIMITS, ORDER_PRIORITIES } from './constants';

// Esquemas de entrada de las Server Actions de órdenes. Se validan siempre en servidor. La
// organización, el estado y el actor nunca forman parte de la entrada: los fija PostgreSQL a partir
// de la sesión (BR01). `strictObject` rechaza campos desconocidos.

const emptyToNull = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** Fecha de calendario real en formato AAAA-MM-DD (rechaza p. ej. 2026-02-31). */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  });

const optionalText = (max: number) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .max(max)
      .nullish()
      .transform((value) => value ?? null),
  );

const optionalUuid = z.preprocess(
  emptyToNull,
  z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
);

const descriptiveFields = {
  title: z.string().trim().min(1).max(ORDER_LIMITS.title),
  description: optionalText(ORDER_LIMITS.description),
  priority: z.enum(ORDER_PRIORITIES),
  scheduled_date: dateString,
};

/** Alta. `request_id` identifica el envío del formulario: un doble envío no duplica la orden. */
export const orderCreateSchema = z.strictObject({
  request_id: z.uuid(),
  customer_id: z.uuid(),
  technician_id: optionalUuid,
  ...descriptiveFields,
});

export const orderUpdateSchema = z.strictObject({ id: z.uuid(), ...descriptiveFields });

export const orderAssignSchema = z.strictObject({ id: z.uuid(), technician_id: z.uuid() });

export const orderAdvanceSchema = z.strictObject({
  id: z.uuid(),
  to: z.enum(['in_progress', 'completed']),
});

export const orderCancelSchema = z.strictObject({
  id: z.uuid(),
  reason: optionalText(ORDER_LIMITS.reason),
});

export type OrderCreateInput = z.output<typeof orderCreateSchema>;
export type OrderUpdateInput = z.output<typeof orderUpdateSchema>;
