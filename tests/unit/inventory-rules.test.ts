import { describe, expect, it } from 'vitest';

import {
  availableActions,
  formatQuantity,
  formatWithUnit,
  isMovementKind,
  isUnit,
  stockStatus,
} from '@/features/inventory/constants';
import {
  buildInventoryHref,
  hasActiveFilters,
  parseInventoryFilter,
  parseInventoryListParams,
} from '@/features/inventory/params';
import { itemCreateSchema, itemUpdateSchema, movementSchema } from '@/features/inventory/schema';

// TASK-013: reglas puras del inventario (INV-1, INV-4, INV-6, INV-7) y validación de entradas.

const ID = '8f14e45f-ceea-467a-9575-0d9d3b8a1c11';
const ORDER = '9b2e3b4e-1f4b-4d5e-8a76-2a1c4f0d9e55';
const REQ = 'c4ca4238-a0b9-4382-8ad5-7a1f9d2b0c33';

describe('estado de stock (INV-7)', () => {
  it('agotado = 0; bajo = saldo > 0 y <= umbral; umbral 0 desactiva "bajo"', () => {
    expect(stockStatus(0, 5)).toBe('out');
    expect(stockStatus(0, 0)).toBe('out');
    expect(stockStatus(1, 5)).toBe('low');
    expect(stockStatus(5, 5)).toBe('low');
    expect(stockStatus(6, 5)).toBe('ok');
    expect(stockStatus(1, 0)).toBe('ok');
  });

  it('unidades de lista cerrada y tipos de movimiento', () => {
    for (const unit of ['ud', 'm', 'kg', 'l', 'caja']) expect(isUnit(unit)).toBe(true);
    for (const unit of ['pallet', '', null, 3]) expect(isUnit(unit)).toBe(false);
    for (const kind of ['in', 'out', 'consumption']) expect(isMovementKind(kind)).toBe(true);
    expect(isMovementKind('adjust')).toBe(false);
  });

  it('un archivado no admite ediciones ni movimientos (INV-8)', () => {
    expect(availableActions(false)).toEqual({ edit: true, move: true });
    expect(availableActions(true)).toEqual({ edit: false, move: false });
  });

  it('formatea cantidades enteras en es-ES', () => {
    expect(formatQuantity(1200)).toMatch(/^1\.?200$/);
    expect(formatWithUnit(5, 'kg')).toBe('5 kg');
  });
});

describe('parámetros de listado', () => {
  it('estado por defecto activos; admite bajo, agotado, archivados, todos y alias en singular', () => {
    expect(parseInventoryListParams({}).status).toBe('activos');
    for (const status of ['bajo', 'agotado', 'archivados', 'todos', 'activos']) {
      expect(parseInventoryListParams({ estado: status }).status).toBe(status);
    }
    expect(parseInventoryFilter('archivado')).toBe('archivados');
    expect(parseInventoryFilter('activo')).toBe('activos');
    expect(parseInventoryFilter('constructor')).toBe('activos');
    expect(parseInventoryFilter('x; drop table')).toBe('activos');
  });

  it('acota página y normaliza el texto de búsqueda', () => {
    expect(parseInventoryListParams({ pagina: '0' }).page).toBe(1);
    expect(parseInventoryListParams({ pagina: '-4' }).page).toBe(1);
    expect(parseInventoryListParams({ pagina: '99999999' }).page).toBe(1);
    expect(parseInventoryListParams({ pagina: '3' }).page).toBe(3);
    expect(parseInventoryListParams({ q: ['  tubo   15\n', 'otro'] }).q).toBe('tubo 15');
    expect(parseInventoryListParams({ q: 'x'.repeat(500) }).q).toHaveLength(100);
  });

  it('construye enlaces cortos y detecta filtros activos', () => {
    expect(buildInventoryHref('/inventory', {})).toBe('/inventory');
    expect(buildInventoryHref('/inventory', { status: 'activos', page: 1 })).toBe('/inventory');
    expect(buildInventoryHref('/inventory', { q: 'tubo', status: 'bajo', page: 2 })).toBe(
      '/inventory?q=tubo&estado=bajo&pagina=2',
    );
    expect(hasActiveFilters({ page: 1, q: '', status: 'activos' })).toBe(false);
    expect(hasActiveFilters({ page: 1, q: '', status: 'archivados' })).toBe(true);
    expect(hasActiveFilters({ page: 1, q: 'a', status: 'activos' })).toBe(true);
  });
});

describe('esquema de artículo', () => {
  const create = {
    request_id: REQ,
    reference: ' TUB-15 ',
    name: ' Tubo de cobre ',
    description: '',
    unit: 'm',
    low_stock_threshold: '',
  };

  it('normaliza texto, descripción vacía a null y umbral vacío a 0', () => {
    expect(itemCreateSchema.parse(create)).toEqual({
      request_id: REQ,
      reference: 'TUB-15',
      name: 'Tubo de cobre',
      description: null,
      unit: 'm',
      low_stock_threshold: 0,
    });
  });

  it('rechaza unidad fuera de lista, referencia con control o larga, nombre vacío y umbral no entero', () => {
    for (const bad of [
      { unit: 'pallet' },
      { reference: '' },
      { reference: 'a\nb' },
      { reference: 'x'.repeat(41) },
      { name: '   ' },
      { name: 'x'.repeat(121) },
      { description: 'x'.repeat(501) },
      { low_stock_threshold: '2.5' },
      { low_stock_threshold: '-1' },
      { low_stock_threshold: '1000001' },
      { low_stock_threshold: '1e3' },
    ]) {
      expect(itemCreateSchema.safeParse({ ...create, ...bad }).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
  });

  it('no admite campos desconocidos: organización, saldo o referencia en la edición', () => {
    const update = { id: ID, name: 'x', description: '', unit: 'ud', low_stock_threshold: '3' };
    expect(itemUpdateSchema.safeParse(update).success).toBe(true);
    for (const extra of [
      { organization_id: ID },
      { quantity: '50' },
      { reference: 'NUEVA' },
      { archived_at: '2026-01-01' },
    ]) {
      expect(itemUpdateSchema.safeParse({ ...update, ...extra }).success).toBe(false);
    }
    expect(itemCreateSchema.safeParse({ ...create, quantity: '5' }).success).toBe(false);
  });
});

describe('esquema de movimiento (INV-1, INV-4, INV-6)', () => {
  const base = { request_id: REQ, item_id: ID, kind: 'in', quantity: '10', order_id: '', note: '' };

  it('acepta entrada y salida sin orden y consumo con orden', () => {
    expect(movementSchema.parse(base)).toMatchObject({
      kind: 'in',
      quantity: 10,
      order_id: null,
      note: null,
    });
    expect(movementSchema.parse({ ...base, kind: 'out', note: '  merma ' })).toMatchObject({
      kind: 'out',
      note: 'merma',
    });
    expect(movementSchema.parse({ ...base, kind: 'consumption', order_id: ORDER })).toMatchObject({
      kind: 'consumption',
      order_id: ORDER,
    });
  });

  it('cantidades solo enteras positivas dentro del máximo', () => {
    for (const quantity of ['0', '-3', '2.5', '2,5', '1e3', '', 'abc', '1000001', ' ', '+4']) {
      expect(movementSchema.safeParse({ ...base, quantity }).success, quantity).toBe(false);
    }
    expect(movementSchema.safeParse({ ...base, quantity: '1' }).success).toBe(true);
    expect(movementSchema.safeParse({ ...base, quantity: '1000000' }).success).toBe(true);
  });

  it('el consumo exige orden y entradas y salidas no la admiten', () => {
    expect(movementSchema.safeParse({ ...base, kind: 'consumption' }).success).toBe(false);
    expect(movementSchema.safeParse({ ...base, kind: 'in', order_id: ORDER }).success).toBe(false);
    expect(movementSchema.safeParse({ ...base, kind: 'out', order_id: ORDER }).success).toBe(false);
    expect(
      movementSchema.safeParse({ ...base, kind: 'consumption', order_id: 'no-uuid' }).success,
    ).toBe(false);
  });

  it('rechaza tipo inválido, clave o artículo no UUID, nota larga y campos desconocidos', () => {
    for (const bad of [
      { kind: 'adjust' },
      { request_id: 'x' },
      { item_id: '' },
      { note: 'n'.repeat(201) },
      { organization_id: ID },
      { balance_after: '9' },
      { created_by: ID },
    ]) {
      expect(movementSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
    expect(movementSchema.safeParse({ ...base, note: 'n'.repeat(200) }).success).toBe(true);
  });
});
