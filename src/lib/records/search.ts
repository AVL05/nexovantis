// Búsqueda segura frente a inyección en filtros PostgREST (`.or()` con `ilike`).
//
// El texto del usuario nunca se concatena tal cual: (1) se escapan los comodines de LIKE
// (\ % _) para que sean literales; (2) el valor se entrecomilla con comillas dobles, con \ y "
// escapados, de modo que comas, paréntesis, puntos, dos puntos y asteriscos no puedan cerrar el
// valor ni añadir condiciones al filtro lógico.

const COLUMN = /^[a-z_]+$/;

/** Escapa los comodines de LIKE/ILIKE (\, % y _) para tratarlos como texto literal. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** Entrecomilla un valor para un filtro lógico de PostgREST escapando \ y ". */
export function quotePostgrestValue(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&')}"`;
}

/**
 * Filtro para `.or()`: coincide con el término contenido en cualquiera de las columnas
 * (insensible a mayúsculas). Devuelve null si el término está vacío. Los nombres de columna
 * deben ser constantes del código: se validan y se lanza un error si no lo son.
 */
export function buildSearchFilter(term: string, columns: readonly string[]): string | null {
  const clean = term.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!clean) return null;
  const pattern = quotePostgrestValue(`%${escapeLikePattern(clean)}%`);
  return columns
    .map((column) => {
      if (!COLUMN.test(column)) throw new Error('Columna de busqueda no valida.');
      return `${column}.ilike.${pattern}`;
    })
    .join(',');
}
