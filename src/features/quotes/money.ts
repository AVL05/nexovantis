// Aritmética de dinero de los presupuestos (funciones puras, sin servidor). Política aprobada (BR06):
// moneda única EUR, importes en céntimos ENTEROS, IVA en puntos básicos enteros, cantidades con
// hasta 3 decimales y redondeo half-up SOLO por línea. Todo el cálculo usa enteros (BigInt): nunca
// coma flotante. La fuente de verdad es PostgreSQL (trigger quote_items_guard); estas funciones solo
// sirven para validar la entrada y mostrar una previsualización idéntica al cálculo de la base.

export const QUOTE_LIMITS = {
  title: 120,
  description: 1500,
  itemDescription: 200,
  maxItems: 100,
  /** Cantidad máxima (unidades). */
  maxQuantity: 100_000,
  /** Precio unitario máximo en céntimos (1.000.000,00 EUR). */
  maxUnitPriceCents: 100_000_000,
  minTaxBp: 0,
  maxTaxBp: 10_000,
} as const;

export const DEFAULT_TAX_BP = 2100;

/** Tipos de IVA que ofrece la interfaz (el rango válido en base es 0 a 10000 puntos básicos). */
export const COMMON_TAX_RATES_BP = [2100, 1000, 400, 0] as const;

const MAX_QUANTITY_MILLI = BigInt(QUOTE_LIMITS.maxQuantity) * 1000n;

/** Cantidad en milésimas desde texto ("2", "2,5", "0.125"). null si no es válida (>0, ≤3 decimales). */
export function parseQuantityMilli(text: string): bigint | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,3}))?$/.exec(text.trim());
  if (!match) return null;
  const milli = BigInt(match[1]) * 1000n + BigInt((match[2] ?? '').padEnd(3, '0') || '0');
  return milli > 0n && milli <= MAX_QUANTITY_MILLI ? milli : null;
}

/** Precio en céntimos desde texto en euros ("12", "12,5", "12.50"). null si no es válido (≥0, ≤2 decimales). */
export function parseEuroCents(text: string): number | null {
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  return cents <= BigInt(QUOTE_LIMITS.maxUnitPriceCents) ? Number(cents) : null;
}

/** Cantidad en milésimas -> texto canónico para la base ("2.500"). */
export function milliToDecimal(milli: bigint): string {
  const whole = milli / 1000n;
  const fraction = (milli % 1000n).toString().padStart(3, '0');
  return `${whole.toString()}.${fraction}`;
}

export type LineAmounts = { subtotal: bigint; tax: bigint };

/**
 * Importes de una línea. subtotal = half-up(cantidad × precio); IVA = half-up(subtotal × tasa / 10000).
 * Con enteros no negativos, (x + mitad) / divisor trunca hacia cero y equivale a half-up exacto.
 */
export function lineAmounts(
  quantityMilli: bigint,
  unitPriceCents: bigint,
  taxRateBp: bigint,
): LineAmounts {
  const subtotal = (quantityMilli * unitPriceCents + 500n) / 1000n;
  const tax = (subtotal * taxRateBp + 5000n) / 10000n;
  return { subtotal, tax };
}

export type QuoteTotals = { subtotal: bigint; tax: bigint; total: bigint };

/** Total = Σ subtotales + Σ IVA de línea (sin redondeo adicional). */
export function sumLines(lines: readonly LineAmounts[]): QuoteTotals {
  let subtotal = 0n;
  let tax = 0n;
  for (const line of lines) {
    subtotal += line.subtotal;
    tax += line.tax;
  }
  return { subtotal, tax, total: subtotal + tax };
}

const INTEGER_FORMAT = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });

/** Céntimos -> "1.234,56 €" (es-ES) sin pasar por coma flotante. */
export function formatCents(value: number | bigint): string {
  const cents = typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = INTEGER_FORMAT.format(abs / 100n);
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole},${fraction} €`;
}

/** Céntimos -> texto editable en euros ("12,50"), para precargar formularios. */
export function centsToInput(cents: number): string {
  const abs = BigInt(Math.trunc(Math.abs(cents)));
  return `${(abs / 100n).toString()},${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Puntos básicos -> "21 %" / "10,5 %" / "4 %". */
export function formatTaxRate(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const fraction = bp % 100;
  if (fraction === 0) return `${whole} %`;
  const digits = fraction.toString().padStart(2, '0').replace(/0$/, '');
  return `${whole},${digits} %`;
}

/** Cantidad (número o texto de la base) -> "2,5" con hasta 3 decimales, sin ceros sobrantes. */
export function formatQuantity(value: number | string): string {
  const text = typeof value === 'number' ? value.toString() : value;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return text;
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  return fraction ? `${match[1]},${fraction}` : match[1];
}

/** Numeración legible por organización: 12 -> "PRE-0012". */
export function formatQuoteNumber(number: number): string {
  return `PRE-${number.toString().padStart(4, '0')}`;
}
