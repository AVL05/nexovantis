import { z } from 'zod';

import { milliToDecimal, parseEuroCents, parseQuantityMilli, QUOTE_LIMITS } from './money';

// Esquemas de entrada de las Server Actions de presupuestos. Se validan siempre en servidor. La
// organización, el estado, los totales y el actor nunca forman parte de la entrada: los fija
// PostgreSQL a partir de la sesión y de los conceptos (BR01, BR06). `strictObject` rechaza campos
// desconocidos. Los importes llegan como texto y se convierten con aritmética entera (sin floats).

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

const descriptive = {
  customer_id: z.uuid(),
  title: z.string().trim().min(1).max(QUOTE_LIMITS.title),
  description: optionalText(QUOTE_LIMITS.description),
};

/** Alta. `request_id` identifica el envío del formulario: un doble envío no duplica el presupuesto. */
export const quoteCreateSchema = z.strictObject({ request_id: z.uuid(), ...descriptive });

export const quoteUpdateSchema = z.strictObject({ id: z.uuid(), ...descriptive });

const itemFields = {
  description: z.string().trim().min(1).max(QUOTE_LIMITS.itemDescription),
  /** Cantidad > 0 con hasta 3 decimales; sale como texto decimal canónico ("2.500"). */
  quantity: z
    .string()
    .refine((value) => parseQuantityMilli(value) !== null)
    .transform((value) => milliToDecimal(parseQuantityMilli(value) as bigint)),
  /** Precio unitario en euros (hasta 2 decimales); sale en céntimos enteros. */
  unit_price: z
    .string()
    .refine((value) => parseEuroCents(value) !== null)
    .transform((value) => parseEuroCents(value) as number),
  /** IVA en puntos básicos (2100 = 21 %). */
  tax_rate_bp: z
    .string()
    .regex(/^\d{1,5}$/)
    .transform(Number)
    .pipe(z.number().int().min(QUOTE_LIMITS.minTaxBp).max(QUOTE_LIMITS.maxTaxBp)),
};

/** Alta de concepto. `request_id` identifica el envío (un reintento no duplica el concepto). */
export const itemCreateSchema = z.strictObject({
  quote_id: z.uuid(),
  request_id: z.uuid(),
  ...itemFields,
});

/** `quote_id` solo sirve para refrescar la página; la base resuelve el presupuesto desde el concepto. */
export const itemUpdateSchema = z.strictObject({ id: z.uuid(), quote_id: z.uuid(), ...itemFields });

export const itemRemoveSchema = z.strictObject({ id: z.uuid(), quote_id: z.uuid() });

export const quoteDecisionSchema = z.strictObject({ id: z.uuid() });

export type QuoteCreateInput = z.output<typeof quoteCreateSchema>;
export type QuoteUpdateInput = z.output<typeof quoteUpdateSchema>;
export type ItemCreateInput = z.output<typeof itemCreateSchema>;
export type ItemUpdateInput = z.output<typeof itemUpdateSchema>;
