// Casos compartidos de nombres (TASK-010 PRE, A02-04). Propietario: Testing.
// Criterio unificado PostgreSQL + Zod para organizations.name, customers.name y technicians.full_name:
//   - Maximo 200 caracteres ALMACENADOS (unidad: puntos de codigo Unicode, como char_length).
//   - Se rechazan los nombres compuestos solo por espacio en blanco: el mismo conjunto que
//     String.prototype.trim() de JavaScript (SP, TAB, LF, VT, FF, CR, NBSP, U+1680, U+2000-200A,
//     U+2028/2029, U+202F, U+205F, U+3000, U+FEFF).
//   - Zod recorta antes de validar y almacena el valor recortado; la BD valida el valor tal cual
//     llega (por PostgREST o SQL directo), por eso el relleno en blanco cuenta para el maximo.

export type NameCase = {
  id: string;
  /** Valor tal cual llega. */
  value: string;
  /** Veredicto esperado de Zod (customerCreateSchema / technicianCreateSchema). */
  zod: 'accept' | 'reject';
  /** Veredicto esperado de la restriccion de PostgreSQL sobre el valor SIN recortar. */
  db: 'accept' | 'reject';
};

const WS = (code: string) => ({ value: code });

export const BLANK_CASES: NameCase[] = [
  ['vacio', ''],
  ['espacios', '   '],
  ['tabulacion', '\t'],
  ['salto de linea', '\n'],
  ['retorno de carro', '\r'],
  ['CRLF', '\r\n'],
  ['tab vertical', '\v'],
  ['salto de pagina', '\f'],
  ['mezcla ASCII', ' \t \n \r '],
  ['NBSP', '\u00a0'],
  ['espacio em', '\u2003'],
  ['espacio ideografico', '\u3000'],
  ['separador de linea', '\u2028'],
  ['separador de parrafo', '\u2029'],
  ['BOM / ZWNBSP', '\ufeff'],
  ['mezcla Unicode', ' \u00a0\u3000\t '],
].map(
  ([id, value]) => ({ id: `blanco: ${id}`, ...WS(value), zod: 'reject', db: 'reject' }) as NameCase,
);

export const LENGTH_CASES: NameCase[] = [
  { id: '1 caracter', value: 'a', zod: 'accept', db: 'accept' },
  { id: '200 caracteres', value: 'a'.repeat(200), zod: 'accept', db: 'accept' },
  { id: '200 acentuados', value: 'á'.repeat(200), zod: 'accept', db: 'accept' },
  { id: '201 caracteres', value: 'a'.repeat(201), zod: 'reject', db: 'reject' },
  { id: '201 acentuados', value: 'á'.repeat(201), zod: 'reject', db: 'reject' },
  { id: '10000 caracteres', value: 'a'.repeat(10_000), zod: 'reject', db: 'reject' },
  // Relleno en blanco: Zod recorta (200 almacenados) pero la BD recibe el valor tal cual.
  { id: '200 + 5 espacios finales', value: `${'a'.repeat(200)}     `, zod: 'accept', db: 'reject' },
  {
    id: '5 espacios iniciales + 200',
    value: `     ${'a'.repeat(200)}`,
    zod: 'accept',
    db: 'reject',
  },
  { id: '200 + tabulaciones', value: `${'a'.repeat(200)}\t\t\t`, zod: 'accept', db: 'reject' },
  {
    id: '1 espacio + 199 (200 almacenados)',
    value: ` ${'a'.repeat(199)}`,
    zod: 'accept',
    db: 'accept',
  },
  { id: '201 tras recortar', value: ` ${'a'.repeat(201)} `, zod: 'reject', db: 'reject' },
  // Puntos de codigo (no unidades UTF-16): 150 emojis son 150 caracteres almacenados.
  {
    id: '150 emojis (150 caracteres)',
    value: '\u{1F600}'.repeat(150),
    zod: 'accept',
    db: 'accept',
  },
  { id: '200 emojis', value: '\u{1F600}'.repeat(200), zod: 'accept', db: 'accept' },
  { id: '201 emojis', value: '\u{1F600}'.repeat(201), zod: 'reject', db: 'reject' },
];

export const VALID_CASES: NameCase[] = [
  { id: 'nombre normal', value: 'Ana Garcia', zod: 'accept', db: 'accept' },
  { id: 'con espacios laterales', value: '  Ana Garcia  ', zod: 'accept', db: 'accept' },
  { id: 'tabulacion interior', value: 'Ana\tGarcia', zod: 'accept', db: 'accept' },
  { id: 'salto interior', value: 'Ana\nGarcia', zod: 'accept', db: 'accept' },
  { id: 'unicode', value: 'Zoë Ñandú 山田', zod: 'accept', db: 'accept' },
];

export const NAME_CASES: NameCase[] = [...BLANK_CASES, ...LENGTH_CASES, ...VALID_CASES];

/** Lo que Zod almacenaria: valor recortado con la misma semantica que JavaScript. */
export const zodStored = (value: string) => value.trim();
