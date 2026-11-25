import { describe, expect, it } from 'vitest';

import { actionLabel } from '@/features/activity/constants';
import {
  activityRange,
  buildActivityHref,
  hasActiveFilters,
  isInvertedRange,
  madridDayStartIso,
  nextDay,
  parseActivityParams,
  parseDay,
} from '@/features/activity/params';

// TASK-013: parámetros de /activity y rango de fechas en día natural de Europe/Madrid.

describe('parseDay', () => {
  it('acepta fechas reales y rechaza formatos o días inexistentes', () => {
    expect(parseDay('2026-12-31')).toBe('2026-12-31');
    expect(parseDay('2028-02-29')).toBe('2028-02-29');
    for (const bad of [
      '2026-02-30',
      '2026-13-01',
      '2026-1-1',
      '26-01-01',
      '',
      undefined,
      '2026-01-01T00:00',
      '1999-12-31',
    ]) {
      expect(parseDay(bad), String(bad)).toBeNull();
    }
  });
});

describe('parseActivityParams', () => {
  it('sin parámetros: sin filtros y página 1', () => {
    const params = parseActivityParams({});
    expect(params).toEqual({ page: 1, entity: null, action: null, from: null, to: null });
    expect(hasActiveFilters(params)).toBe(false);
  });

  it('entidades en español (y valores internos) y acciones válidas; el resto se ignora', () => {
    const cases: [string, string][] = [
      ['cliente', 'customer'],
      ['tecnico', 'technician'],
      ['técnico', 'technician'],
      ['orden', 'work_order'],
      ['presupuesto', 'quote'],
      ['inventario', 'inventory_item'],
      ['inventory_item', 'inventory_item'],
    ];
    for (const [param, entity] of cases) {
      expect(parseActivityParams({ entidad: param }).entity).toBe(entity);
    }
    expect(parseActivityParams({ entidad: 'otra' }).entity).toBeNull();
    expect(parseActivityParams({ entidad: 'constructor' }).entity).toBeNull();
    expect(parseActivityParams({ accion: 'stock_in' }).action).toBe('stock_in');
    expect(parseActivityParams({ accion: 'drop' }).action).toBeNull();
  });

  it('acota la página y valida las fechas', () => {
    expect(parseActivityParams({ pagina: '0' }).page).toBe(1);
    expect(parseActivityParams({ pagina: '7' }).page).toBe(7);
    expect(parseActivityParams({ pagina: 'x' }).page).toBe(1);
    const params = parseActivityParams({ desde: '2026-03-01', hasta: '2026-02-30' });
    expect(params.from).toBe('2026-03-01');
    expect(params.to).toBeNull();
  });

  it('detecta un rango invertido y construye enlaces cortos', () => {
    expect(isInvertedRange({ from: '2026-03-02', to: '2026-03-01' })).toBe(true);
    expect(isInvertedRange({ from: '2026-03-01', to: '2026-03-01' })).toBe(false);
    expect(isInvertedRange({ from: null, to: '2026-03-01' })).toBe(false);
    expect(buildActivityHref('/activity', {})).toBe('/activity');
    expect(
      buildActivityHref('/activity', {
        entity: 'inventory_item',
        action: 'stock_out',
        from: '2026-03-01',
        to: '2026-03-31',
        page: 3,
      }),
    ).toBe(
      '/activity?entidad=inventario&accion=stock_out&desde=2026-03-01&hasta=2026-03-31&pagina=3',
    );
  });
});

describe('día natural de Europe/Madrid', () => {
  it('invierno (UTC+1) y verano (UTC+2)', () => {
    expect(madridDayStartIso('2026-01-15')).toBe('2026-01-14T23:00:00.000Z');
    expect(madridDayStartIso('2026-07-15')).toBe('2026-07-14T22:00:00.000Z');
  });

  it('días con cambio de hora (23 y 25 horas)', () => {
    // 29/03/2026: a las 02:00 se pasa a las 03:00. Medianoche local 28->29 sigue en CET.
    expect(madridDayStartIso('2026-03-29')).toBe('2026-03-28T23:00:00.000Z');
    expect(madridDayStartIso('2026-03-30')).toBe('2026-03-29T22:00:00.000Z');
    // 25/10/2026: a las 03:00 se retrocede a las 02:00. Medianoche local 24->25 sigue en CEST.
    expect(madridDayStartIso('2026-10-25')).toBe('2026-10-24T22:00:00.000Z');
    expect(madridDayStartIso('2026-10-26')).toBe('2026-10-25T23:00:00.000Z');
    const long =
      Date.parse(madridDayStartIso('2026-10-26')) - Date.parse(madridDayStartIso('2026-10-25'));
    const short =
      Date.parse(madridDayStartIso('2026-03-30')) - Date.parse(madridDayStartIso('2026-03-29'));
    expect(long / 3_600_000).toBe(25);
    expect(short / 3_600_000).toBe(23);
  });

  it('un evento a las 23:30 de Madrid pertenece a su día aunque en UTC sea el mismo o anterior', () => {
    const { fromIso, toIso } = activityRange({ from: '2026-07-15', to: '2026-07-15' });
    expect(fromIso).toBe('2026-07-14T22:00:00.000Z');
    expect(toIso).toBe('2026-07-15T22:00:00.000Z');
    const at = (iso: string) => iso >= (fromIso as string) && iso < (toIso as string);
    expect(at('2026-07-15T21:30:00.000Z')).toBe(true); // 23:30 hora de Madrid
    expect(at('2026-07-15T22:00:00.000Z')).toBe(false); // 00:00 del día siguiente
    expect(at('2026-07-14T21:59:59.000Z')).toBe(false);
  });

  it('el día final se incluye entero y los extremos ausentes quedan abiertos', () => {
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
    expect(activityRange({ from: null, to: null })).toEqual({ fromIso: null, toIso: null });
    expect(activityRange({ from: '2026-01-15', to: null })).toEqual({
      fromIso: '2026-01-14T23:00:00.000Z',
      toIso: null,
    });
  });
});

describe('etiquetas', () => {
  it('textos específicos por entidad y por defecto', () => {
    expect(actionLabel('work_order', 'created')).toBe('Orden creada');
    expect(actionLabel('inventory_item', 'stock_consumed')).toBe('Consumo en orden');
    expect(actionLabel('quote', 'accepted')).toBe('Presupuesto aceptado');
    expect(actionLabel('customer', 'archived')).toBe('Cliente archivado');
    expect(actionLabel('customer', 'created')).toBe('Creación');
  });
});
