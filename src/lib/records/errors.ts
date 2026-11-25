import type { ZodError } from 'zod';

// Errores seguros: ni SQL, ni nombres de restricciones, ni mensajes internos llegan al cliente.

export type ServiceErrorKind = 'not_found' | 'conflict' | 'invalid' | 'forbidden' | 'unavailable';
export type ServiceError = { kind: ServiceErrorKind; message: string };
export type ServiceFailure = { ok: false } & ServiceError;
export type ServiceResult<T> = { ok: true; data: T } | ServiceFailure;

export const NOT_FOUND_MESSAGE = 'No se encontró el registro.';

export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}
export function fail(error: ServiceError): ServiceFailure {
  return { ok: false, ...error };
}

/** Traduce un error de PostgREST/PostgreSQL a un error seguro. Solo se lee `code`. */
export function mapDbError(error: { code?: string | null } | null | undefined): ServiceError {
  const code = error?.code ?? '';
  switch (code) {
    case 'PGRST116': // sin filas donde se esperaba una
      return { kind: 'not_found', message: NOT_FOUND_MESSAGE };
    case '42501': // RLS o GRANT
      return { kind: 'forbidden', message: 'No tienes permiso para realizar esta acción.' };
    case 'NX001': // transicion o reasignacion no permitida (ordenes)
      return {
        kind: 'conflict',
        message: 'Ese cambio no está permitido en el estado actual de la orden. Recarga la página.',
      };
    case 'NX002': // cliente o tecnico inexistente, archivado o de otra organizacion
      return {
        kind: 'conflict',
        message: 'El cliente o el técnico elegido no está disponible. Elige otro activo.',
      };
    case 'NX003':
      return {
        kind: 'conflict',
        message: 'Una orden completada o cancelada es de solo lectura.',
      };
    case 'NX004': // archivado bloqueado por ordenes abiertas (DH-04/DH-05)
      return {
        kind: 'conflict',
        message:
          'No se puede archivar: tiene órdenes abiertas. Ciérralas, cancélalas o reasígnalas antes.',
      };
    case 'NX005':
      return { kind: 'not_found', message: NOT_FOUND_MESSAGE };
    case '23000': // trigger de integridad (archivado)
    case '23505':
      return { kind: 'conflict', message: 'La operación no es posible en el estado actual.' };
    case '23502':
    case '23514':
    case '22001':
    case '22P02':
      return { kind: 'invalid', message: 'Los datos enviados no son válidos.' };
    default:
      return {
        kind: 'unavailable',
        message: 'No se pudo completar la operación. Inténtalo de nuevo.',
      };
  }
}

/** Mensaje en español para el primer problema de cada campo. Las claves son nombres de campo. */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = typeof issue.path[0] === 'string' ? issue.path[0] : '_form';
    if (key in result) continue;
    if (issue.code === 'too_small') result[key] = 'Este campo es obligatorio.';
    else if (issue.code === 'too_big') result[key] = `Máximo ${String(issue.maximum)} caracteres.`;
    else if (issue.code === 'invalid_format' && issue.format === 'email')
      result[key] = 'Introduce un correo electrónico válido.';
    else if (issue.code === 'invalid_type') result[key] = 'Este campo es obligatorio.';
    else result[key] = 'El valor no es válido.';
  }
  return result;
}
