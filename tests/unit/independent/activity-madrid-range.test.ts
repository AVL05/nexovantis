import { describe, expect, it } from 'vitest';

import { activityRange, madridDayStartIso, parseActivityParams } from '@/features/activity/params';

// TASK-013 (POST, Testing): el filtro de fechas de /activity es el dia natural de Europe/Madrid, tambien
// en los dias con cambio de hora (23 y 25 horas) y con el dia final incluido entero.
describe('rango de fechas de actividad (Europe/Madrid)', () => {
  it.each([
    ['2026-01-15', '2026-01-14T23:00:00.000Z'],
    ['2026-07-01', '2026-06-30T22:00:00.000Z'],
    ['2026-03-29', '2026-03-28T23:00:00.000Z'], // dia de 23 h (primavera)
    ['2026-03-30', '2026-03-29T22:00:00.000Z'],
    ['2026-10-25', '2026-10-24T22:00:00.000Z'], // dia de 25 h (otono)
    ['2026-10-26', '2026-10-25T23:00:00.000Z'],
  ])('inicio del dia %s', (day, expected) => {
    expect(madridDayStartIso(day)).toBe(expected);
  });

  it('el dia final se incluye entero: hasta = inicio del dia siguiente (exclusivo)', () => {
    expect(activityRange({ from: '2026-10-25', to: '2026-10-25' })).toEqual({
      fromIso: '2026-10-24T22:00:00.000Z',
      toIso: '2026-10-25T23:00:00.000Z',
    });
    expect(activityRange({ from: null, to: '2026-12-31' }).toIso).toBe('2026-12-31T23:00:00.000Z');
    expect(activityRange({ from: null, to: null })).toEqual({ fromIso: null, toIso: null });
  });

  it('valores no validos caen en el valor por defecto', () => {
    const params = parseActivityParams({
      entidad: 'x',
      accion: 'drop table',
      desde: '2026-02-30',
      hasta: "2026-01-01'; --",
      pagina: '-3',
    });
    expect(params).toEqual({ page: 1, entity: null, action: null, from: null, to: null });
  });
});
