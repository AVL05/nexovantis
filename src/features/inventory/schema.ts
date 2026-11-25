import { z } from 'zod';

import { INVENTORY_LIMITS, MOVEMENT_KINDS, UNITS } from './constants';

// Esquemas de entrada de las Server Actions de inventario. Se validan siempre en servidor. La
// organización, el saldo, el actor y los saldos anterior/posterior nunca forman parte de la entrada:
// los fija PostgreSQL a partir de la sesión y de los movimientos (BR01, BR07). `strictObject` rechaza
// campos desconocidos. Las cantidades llegan como texto y son ENTERAS (INV-1): sin decimales ni float.

const emptyToNull = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const optionalText = (max: number) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .max(max)
      .nullish()
      .transform((value) => value ?? null),
  );

/** Entero decimal sin signo, sin separadores ni exponentes: "40" sí; "4.5", "-3", "1e3" no. */
const integer = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,9}$/)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

const CONTROL = /[\u0000-\u001f\u007f]/;

const itemFields = {
  name: z.string().trim().min(1).max(INVENTORY_LIMITS.name),
  description: optionalText(INVENTORY_LIMITS.description),
  unit: z.enum(UNITS),
  /** Vacío = 0 (sin umbral: el estado "bajo" queda desactivado). */
  low_stock_threshold: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? '0' : value),
    integer(0, INVENTORY_LIMITS.maxThreshold),
  ),
};

/** Alta. `request_id` identifica el envío del formulario: un doble envío no duplica el artículo. */
export const itemCreateSchema = z.strictObject({
  request_id: z.uuid(),
  reference: z
    .string()
    .trim()
    .min(1)
    .max(INVENTORY_LIMITS.reference)
    .refine((value) => !CONTROL.test(value)),
  ...itemFields,
});

/** La referencia es inmutable (INV-2): no forma parte de la edición. */
export const itemUpdateSchema = z.strictObject({ id: z.uuid(), ...itemFields });

export const itemIdSchema = z.strictObject({ id: z.uuid() });

/**
 * Movimiento. `request_id` es la clave de idempotencia del envío (INV-5). El consumo exige una orden
 * (INV-6) y las entradas y salidas no la admiten.
 */
export const movementSchema = z
  .strictObject({
    request_id: z.uuid(),
    item_id: z.uuid(),
    kind: z.enum(MOVEMENT_KINDS),
    quantity: integer(1, INVENTORY_LIMITS.maxMovement),
    order_id: z.preprocess(emptyToNull, z.uuid().nullish()).transform((value) => value ?? null),
    note: optionalText(INVENTORY_LIMITS.note),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'consumption' && !value.order_id) {
      ctx.addIssue({ code: 'custom', path: ['order_id'], message: 'required' });
    }
    if (value.kind !== 'consumption' && value.order_id) {
      ctx.addIssue({ code: 'custom', path: ['order_id'], message: 'not-allowed' });
    }
  });

export type ItemCreateInput = z.output<typeof itemCreateSchema>;
export type ItemUpdateInput = z.output<typeof itemUpdateSchema>;
export type MovementInput = z.output<typeof movementSchema>;
