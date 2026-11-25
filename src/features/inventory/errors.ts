import { NOT_FOUND_MESSAGE, mapDbError, type ServiceError } from '@/lib/records/errors';

// Errores de dominio de inventario (SQLSTATE NX020..NX026 de la migración 20261128090000). La app
// los traduce a mensajes seguros: ni SQL, ni nombres de restricciones llegan al cliente.

/** Errores de dominio de inventario (NX020..NX026); el resto, el mapeo común. */
export function mapInventoryError(
  error: { code?: string | null } | null | undefined,
): ServiceError {
  switch (error?.code) {
    case 'NX020':
      return { kind: 'not_found', message: NOT_FOUND_MESSAGE };
    case 'NX021':
      return {
        kind: 'conflict',
        message:
          'Un artículo archivado es de solo lectura. Restáuralo para modificarlo o registrar movimientos.',
      };
    case 'NX022':
      return {
        kind: 'conflict',
        message: 'No hay existencias suficientes: el saldo no puede quedar negativo.',
      };
    case 'NX023':
      return {
        kind: 'conflict',
        message:
          'La orden elegida no está disponible: debe ser de tu organización y estar pendiente, asignada o en curso.',
      };
    case 'NX024':
      return {
        kind: 'conflict',
        message:
          'Este envío ya se registró con otros datos. Recarga la página e inténtalo de nuevo.',
      };
    case 'NX025':
      return { kind: 'conflict', message: 'Ya existe un artículo con esa referencia.' };
    case 'NX026':
      return { kind: 'conflict', message: 'El saldo no puede superar 1.000.000.000.' };
    case '23514':
    case '22003':
    case '22P02':
      return { kind: 'invalid', message: 'Los datos enviados no son válidos.' };
    default:
      return mapDbError(error);
  }
}
