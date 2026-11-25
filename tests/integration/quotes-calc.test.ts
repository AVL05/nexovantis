// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  formatCents,
  formatQuantity,
  formatQuoteNumber,
  formatTaxRate,
  lineAmounts,
  milliToDecimal,
  parseEuroCents,
  parseQuantityMilli,
  sumLines,
} from '../../src/features/quotes/money';

import { seedTwoOrgs } from '../support/fixtures';
import { createTestDb, type TestDb } from '../support/pglite';

// TASK-012 / F5: politica de importes (BR06) en PostgreSQL real (PGlite) con las migraciones reales:
// redondeo half-up por linea, IVA 0/4/10/21 %, cantidades decimales, limites y paridad exacta entre
// la previsualizacion de la UI (BigInt) y el calculo de la base. Sin floats en ningun punto.

type Row = Record<string, unknown>;

let db: TestDb;
let s: Awaited<ReturnType<typeof seedTwoOrgs>>;

const run = async (user: string, sql: string, params: unknown[] = []) =>
  (await db.asUser(user, (tx) => tx.query<Row>(sql, params))).rows;
const su = async (sql: string, params: unknown[] = []) =>
  (await db.asSuperuser((tx) => tx.query<Row>(sql, params))).rows;

const newQuote = async (title = 'Presupuesto de prueba') =>
  String(
    (
      await run(s.ownerA, `select public.create_quote($1::uuid, $2::uuid, $3, null) as id`, [
        randomUUID(),
        s.customerA,
        title,
      ])
    )[0].id,
  );

const addItem = async (
  quote: string,
  qty: string,
  priceCents: number,
  taxBp: number | null = 2100,
  description = 'Concepto',
) =>
  String(
    (
      await run(
        s.ownerA,
        `select public.add_quote_item($1::uuid, $2::uuid, $3, $4::numeric, $5::bigint, $6::int) as id`,
        [quote, randomUUID(), description, qty, priceCents, taxBp],
      )
    )[0].id,
  );

const itemRow = async (id: string) =>
  (await su(`select * from public.quote_items where id = $1`, [id]))[0];
const quoteRow = async (id: string) =>
  (await su(`select * from public.quotes where id = $1`, [id]))[0];

const failsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code });

beforeAll(async () => {
  db = await createTestDb();
  s = await seedTwoOrgs(db);
}, 120_000);

afterAll(async () => {
  await db.close();
});

// [cantidad, precio en centimos, IVA en puntos basicos, subtotal esperado, IVA esperado]
const CASES: [string, number, number, number, number][] = [
  ['1', 1000, 2100, 1000, 210],
  ['2.5', 4550, 2100, 11375, 2389], // 11375 x 0,21 = 2388,75 -> 2389
  ['0.5', 1, 2100, 1, 0], // 0,5 -> 1 (half-up); IVA 0,21 -> 0
  ['0.5', 3, 2100, 2, 0], // 1,5 -> 2; IVA 0,42 -> 0
  ['0.001', 499, 2100, 0, 0], // 0,499 -> 0
  ['0.001', 500, 2100, 1, 0], // 0,5 -> 1 (half-up)
  ['0.003', 500, 0, 2, 0], // 1,5 -> 2, IVA 0 %
  ['3', 1999, 1000, 5997, 600], // 599,7 -> 600
  ['1', 25, 2100, 25, 5], // 5,25 -> 5
  ['1', 50, 2100, 50, 11], // 10,5 -> 11 (half-up)
  ['1', 1000, 400, 1000, 40],
  ['1', 1000, 0, 1000, 0],
  ['1.333', 1000, 2100, 1333, 280], // 279,93 -> 280
  ['0.001', 0, 2100, 0, 0], // precio 0 permitido
  ['100000', 100000000, 10000, 10_000_000_000_000, 10_000_000_000_000], // limites maximos
  ['99999.999', 99999999, 2100, 9_999_999_800_000, 2_099_999_958_000],
];

describe('politica de importes en PostgreSQL (BR06)', () => {
  it.each(CASES)(
    'cantidad %s x %i centimos, IVA %i pb -> %i + %i',
    async (qty, price, bp, sub, tax) => {
      const quote = await newQuote();
      const id = await addItem(quote, qty, price, bp);
      const item = await itemRow(id);
      expect(Number(item.subtotal_cents)).toBe(sub);
      expect(Number(item.tax_cents)).toBe(tax);
      // La previsualizacion de la UI (BigInt) produce exactamente lo mismo.
      const milli = parseQuantityMilli(qty);
      expect(milli).not.toBeNull();
      const preview = lineAmounts(milli!, BigInt(price), BigInt(bp));
      expect(preview).toEqual({ subtotal: BigInt(sub), tax: BigInt(tax) });
      // Totales del presupuesto derivados por la base.
      const q = await quoteRow(quote);
      expect(Number(q.subtotal_cents)).toBe(sub);
      expect(Number(q.tax_cents)).toBe(tax);
      expect(Number(q.total_cents)).toBe(sub + tax);
    },
  );

  it('el redondeo es solo por linea: total = suma de subtotales + suma de IVA de linea', async () => {
    const quote = await newQuote();
    // Dos lineas de 25 centimos al 21 %: cada IVA 5,25 -> 5 (total IVA 10). Redondear la suma
    // (50 x 0,21 = 10,5 -> 11) daria un total distinto: no se hace.
    await addItem(quote, '1', 25, 2100);
    await addItem(quote, '1', 25, 2100);
    const q = await quoteRow(quote);
    expect(Number(q.subtotal_cents)).toBe(50);
    expect(Number(q.tax_cents)).toBe(10);
    expect(Number(q.total_cents)).toBe(60);
  });

  it('mezcla de tipos de IVA: cada linea usa su propia tasa', async () => {
    const quote = await newQuote();
    await addItem(quote, '2', 1000, 2100); // 2000 + 420
    await addItem(quote, '1', 5000, 1000); // 5000 + 500
    await addItem(quote, '3', 300, 0); // 900 + 0
    const q = await quoteRow(quote);
    expect([q.subtotal_cents, q.tax_cents, q.total_cents].map(Number)).toEqual([7900, 920, 8820]);
  });

  it('editar y quitar conceptos recalcula los totales; el IVA por defecto es 2100', async () => {
    const quote = await newQuote();
    const a = await addItem(quote, '1', 1000, null);
    expect(Number((await itemRow(a)).tax_rate_bp)).toBe(2100);
    const b = await addItem(quote, '1', 2000, 1000);
    await run(
      s.ownerA,
      `select public.update_quote_item($1::uuid, 'Concepto', 4::numeric, 1500::bigint, 400::int)`,
      [b],
    );
    let q = await quoteRow(quote);
    expect([q.subtotal_cents, q.tax_cents, q.total_cents].map(Number)).toEqual([7000, 450, 7450]);
    const removed = await run(s.ownerA, `select public.remove_quote_item($1::uuid) as ok`, [a]);
    expect(removed[0].ok).toBe(true);
    const again = await run(s.ownerA, `select public.remove_quote_item($1::uuid) as ok`, [a]);
    expect(again[0].ok).toBe(false); // doble envio: no es un error
    q = await quoteRow(quote);
    expect([q.subtotal_cents, q.tax_cents, q.total_cents].map(Number)).toEqual([6000, 240, 6240]);
  });

  it('paridad exacta UI/base sobre 80 lineas pseudoaleatorias (semilla fija)', async () => {
    const quote = await newQuote();
    let seed = 20261127;
    const next = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    const rates = [0, 400, 1000, 2100, 777, 10000];
    const lines: { milli: bigint; price: number; bp: number }[] = [];
    for (let i = 0; i < 80; i += 1) {
      const milli = BigInt(1 + next(500_000)); // 0,001 .. 500,000
      const price = next(2_000_000);
      const bp = rates[next(rates.length)];
      lines.push({ milli, price, bp });
      await addItem(quote, milliToDecimal(milli), price, bp);
    }
    const items = await su(
      `select quantity::text as q, unit_price_cents, tax_rate_bp, subtotal_cents, tax_cents
         from public.quote_items where quote_id = $1 order by position`,
      [quote],
    );
    const expected = lines.map((l) => lineAmounts(l.milli, BigInt(l.price), BigInt(l.bp)));
    items.forEach((row, index) => {
      expect(BigInt(row.subtotal_cents as number)).toBe(expected[index].subtotal);
      expect(BigInt(row.tax_cents as number)).toBe(expected[index].tax);
    });
    const totals = sumLines(expected);
    const q = await quoteRow(quote);
    expect(BigInt(q.subtotal_cents as number)).toBe(totals.subtotal);
    expect(BigInt(q.tax_cents as number)).toBe(totals.tax);
    expect(BigInt(q.total_cents as number)).toBe(totals.total);
  });

  it('el maximo de 100 conceptos y el desbordamiento estan acotados (total < 2^53)', async () => {
    const quote = await newQuote();
    const max = 100000000;
    await db.asSuperuser(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: s.ownerA, role: 'authenticated' }),
      ]);
      await tx.exec('set local role authenticated');
      for (let i = 0; i < 100; i += 1) {
        await tx.query(
          `select public.add_quote_item($1::uuid, $2::uuid, 'Linea maxima', 100000::numeric, $3::bigint, 10000::int)`,
          [quote, randomUUID(), max],
        );
      }
    });
    const q = await quoteRow(quote);
    expect(BigInt(q.total_cents as number)).toBe(2_000_000_000_000_000n);
    expect(Number.isSafeInteger(Number(q.total_cents))).toBe(true);
    await failsWith(addItem(quote, '1', 100, 2100), 'NX015');
  });
});

describe('limites y validaciones de conceptos (la base es la autoridad)', () => {
  const bad = (qty: string, price: number, bp: number) => async () => {
    const quote = await newQuote();
    return addItem(quote, qty, price, bp);
  };

  it.each([
    ['cantidad 0', '0', 100, 2100],
    ['cantidad negativa', '-1', 100, 2100],
    ['4 decimales', '1.0005', 100, 2100],
    ['cantidad sobre el maximo', '100000.001', 100, 2100],
    ['precio negativo', '1', -1, 2100],
    ['precio sobre el maximo', '1', 100000001, 2100],
    ['IVA negativo', '1', 100, -1],
    ['IVA sobre 10000', '1', 100, 10001],
  ] as const)('rechaza %s (23514)', async (_name, qty, price, bp) => {
    await failsWith(bad(qty, price, bp)(), '23514');
  });

  it('rechaza descripcion vacia, solo espacios (incluye Unicode) o demasiado larga', async () => {
    const quote = await newQuote();
    for (const text of ['', '   ', '  　', 'x'.repeat(201)]) {
      await failsWith(addItem(quote, '1', 100, 2100, text), '23514');
    }
    await addItem(quote, '1', 100, 2100, 'x'.repeat(200)); // el limite exacto es valido
  });

  it('un presupuesto exige titulo no vacio (<= 120) y descripcion <= 1500', async () => {
    const create = (title: string, description: string | null) =>
      run(s.ownerA, `select public.create_quote($1::uuid, $2::uuid, $3, $4)`, [
        randomUUID(),
        s.customerA,
        title,
        description,
      ]);
    await failsWith(create('   ', null), '23514');
    await failsWith(create('t'.repeat(121), null), '23514');
    await failsWith(create('ok', 'd'.repeat(1501)), '23514');
    await create('t'.repeat(120), 'd'.repeat(1500));
  });

  it('los totales no son escribibles: el trigger los deriva de los conceptos', async () => {
    const quote = await newQuote();
    await addItem(quote, '1', 1000, 2100);
    await su(
      `update public.quotes set subtotal_cents = 1, tax_cents = 1, total_cents = 2 where id = $1`,
      [quote],
    );
    expect(Number((await quoteRow(quote)).total_cents)).toBe(1210);
    const id = (await su(`select id from public.quote_items where quote_id = $1`, [quote]))[0].id;
    await su(`update public.quote_items set subtotal_cents = 1, tax_cents = 1 where id = $1`, [id]);
    expect(Number((await itemRow(String(id))).subtotal_cents)).toBe(1000);
    expect(Number((await quoteRow(quote)).total_cents)).toBe(1210);
  });

  it('no hay tipos de coma flotante en las tablas de presupuestos', async () => {
    const rows = await su(
      `select table_name, column_name, data_type from information_schema.columns
        where table_schema = 'public' and table_name in ('quotes', 'quote_items')
          and data_type in ('real', 'double precision', 'money')`,
    );
    expect(rows).toEqual([]);
  });
});

describe('previsualizacion de la interfaz (money.ts, solo enteros)', () => {
  it('parsea cantidades y precios con coma o punto y rechaza lo no valido', () => {
    expect(parseQuantityMilli('2')).toBe(2000n);
    expect(parseQuantityMilli('2,5')).toBe(2500n);
    expect(parseQuantityMilli('0.125')).toBe(125n);
    expect(parseQuantityMilli('0')).toBeNull();
    expect(parseQuantityMilli('0,000')).toBeNull();
    expect(parseQuantityMilli('1,0005')).toBeNull();
    expect(parseQuantityMilli('-1')).toBeNull();
    expect(parseQuantityMilli('1e3')).toBeNull();
    expect(parseQuantityMilli('100000')).toBe(100_000_000n);
    expect(parseQuantityMilli('100000,001')).toBeNull();
    expect(parseEuroCents('12')).toBe(1200);
    expect(parseEuroCents('12,5')).toBe(1250);
    expect(parseEuroCents('12.05')).toBe(1205);
    expect(parseEuroCents('0')).toBe(0);
    expect(parseEuroCents('1.000.000,00')).toBeNull();
    expect(parseEuroCents('12,555')).toBeNull();
    expect(parseEuroCents('1000000')).toBe(100_000_000);
    expect(parseEuroCents('1000000,01')).toBeNull();
    expect(parseEuroCents('-1')).toBeNull();
    expect(milliToDecimal(2500n)).toBe('2.500');
    expect(milliToDecimal(1n)).toBe('0.001');
  });

  it('formatea en es-ES sin pasar por coma flotante', () => {
    expect(formatCents(0)).toBe('0,00 €');
    expect(formatCents(5)).toBe('0,05 €');
    expect(formatCents(123456)).toBe('1.234,56 €');
    expect(formatCents(2_000_000_000_000_000n)).toBe('20.000.000.000.000,00 €');
    expect(formatCents(-250)).toBe('-2,50 €');
    expect(formatTaxRate(2100)).toBe('21 %');
    expect(formatTaxRate(1050)).toBe('10,5 %');
    expect(formatTaxRate(0)).toBe('0 %');
    expect(formatQuantity('2.500')).toBe('2,5');
    expect(formatQuantity(3)).toBe('3');
    expect(formatQuantity('0.125')).toBe('0,125');
    expect(formatQuoteNumber(12)).toBe('PRE-0012');
  });
});
