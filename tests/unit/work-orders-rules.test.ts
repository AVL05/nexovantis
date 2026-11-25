import { describe, expect, it } from 'vitest';

import { mapDbError } from '@/lib/records/errors';
import { formatDate, todayInMadrid } from '@/lib/records/format';
import { isProtectedPath } from '@/features/auth/routes';
import {
  ORDER_STATUSES,
  availableActions,
  isOrderPriority,
  isOrderStatus,
  isTerminal,
} from '@/features/work-orders/constants';
import {
  buildOrdersHref,
  hasActiveFilters,
  parseOrderListParams,
} from '@/features/work-orders/params';
import {
  dateString,
  orderAdvanceSchema,
  orderAssignSchema,
  orderCancelSchema,
  orderCreateSchema,
  orderUpdateSchema,
} from '@/features/work-orders/schema';

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

describe('acciones ofrecidas por estado (DH-01, DH-02, DH-03, DH-07)', () => {
  it.each([
    ['pending', { assign: true, reassign: false, start: false, complete: false, cancel: true }],
    ['assigned', { assign: false, reassign: true, start: true, complete: false, cancel: true }],
    ['in_progress', { assign: false, reassign: false, start: false, complete: true, cancel: true }],
    ['completed', { assign: false, reassign: false, start: false, complete: false, cancel: false }],
    ['cancelled', { assign: false, reassign: false, start: false, complete: false, cancel: false }],
  ] as const)('%s', (status, expected) => {
    expect(availableActions(status)).toMatchObject(expected);
  });

  it('solo los estados terminales son de solo lectura y no se editan', () => {
    for (const status of ORDER_STATUSES) {
      expect(isTerminal(status)).toBe(status === 'completed' || status === 'cancelled');
      expect(availableActions(status).edit).toBe(!isTerminal(status));
    }
  });

  it('valida estado y prioridad', () => {
    expect(isOrderStatus('in_progress')).toBe(true);
    expect(isOrderStatus('en curso')).toBe(false);
    expect(isOrderPriority('urgent')).toBe(true);
    expect(isOrderPriority('x')).toBe(false);
  });
});

describe('esquemas de entrada (servidor)', () => {
  const base = {
    request_id: ID,
    customer_id: ID2,
    technician_id: '',
    title: '  Revision de caldera  ',
    description: '',
    priority: 'normal',
    scheduled_date: '2026-12-01',
  };

  it('alta: recorta, vacio a null y tecnico opcional', () => {
    const parsed = orderCreateSchema.parse(base);
    expect(parsed).toMatchObject({
      title: 'Revision de caldera',
      description: null,
      technician_id: null,
    });
    expect(orderCreateSchema.parse({ ...base, technician_id: ID }).technician_id).toBe(ID);
  });

  it.each([
    ['titulo vacio', { title: '   ' }],
    ['titulo largo', { title: 'x'.repeat(121) }],
    ['descripcion larga', { description: 'x'.repeat(2001) }],
    ['prioridad invalida', { priority: 'maxima' }],
    ['fecha imposible', { scheduled_date: '2026-02-31' }],
    ['fecha con formato', { scheduled_date: '01/12/2026' }],
    ['cliente no uuid', { customer_id: 'abc' }],
    ['tecnico no uuid', { technician_id: 'abc' }],
    ['request_id ausente', { request_id: undefined }],
    ['organizacion enviada por el cliente', { organization_id: ID }],
    ['estado enviado por el cliente', { status: 'completed' }],
  ])('alta rechaza %s', (_name, override) => {
    expect(orderCreateSchema.safeParse({ ...base, ...override }).success).toBe(false);
  });

  it('edicion exige id y no admite estado, tecnico ni cliente', () => {
    const edit = {
      id: ID,
      title: 'T',
      description: null,
      priority: 'low',
      scheduled_date: '2026-12-01',
    };
    expect(orderUpdateSchema.safeParse(edit).success).toBe(true);
    expect(orderUpdateSchema.safeParse({ ...edit, status: 'pending' }).success).toBe(false);
    expect(orderUpdateSchema.safeParse({ ...edit, technician_id: ID }).success).toBe(false);
    expect(orderUpdateSchema.safeParse({ ...edit, id: 'x' }).success).toBe(false);
  });

  it('asignar, avanzar y cancelar', () => {
    expect(orderAssignSchema.safeParse({ id: ID, technician_id: ID2 }).success).toBe(true);
    expect(orderAssignSchema.safeParse({ id: ID, technician_id: '' }).success).toBe(false);
    expect(orderAdvanceSchema.safeParse({ id: ID, to: 'completed' }).success).toBe(true);
    // Sin saltos desde la interfaz: no se puede pedir pendiente, asignada ni cancelada por avanzar.
    for (const to of ['pending', 'assigned', 'cancelled', 'in-progress'])
      expect(orderAdvanceSchema.safeParse({ id: ID, to }).success).toBe(false);
    expect(orderCancelSchema.parse({ id: ID, reason: '  ' }).reason).toBeNull();
    expect(orderCancelSchema.parse({ id: ID, reason: ' Cliente ausente ' }).reason).toBe(
      'Cliente ausente',
    );
    expect(orderCancelSchema.safeParse({ id: ID, reason: 'x'.repeat(201) }).success).toBe(false);
  });

  it('dateString solo acepta fechas reales', () => {
    expect(dateString.safeParse('2028-02-29').success).toBe(true);
    expect(dateString.safeParse('2027-02-29').success).toBe(false);
    expect(dateString.safeParse('2026-13-01').success).toBe(false);
  });
});

describe('parametros de listado', () => {
  it('por defecto sin filtros y pagina 1', () => {
    const params = parseOrderListParams({});
    expect(params).toEqual({
      page: 1,
      q: '',
      status: null,
      priority: null,
      technician: null,
      customer: null,
      from: null,
      to: null,
    });
    expect(hasActiveFilters(params)).toBe(false);
  });

  it('descarta valores invalidos y normaliza el rango de fechas', () => {
    const params = parseOrderListParams({
      estado: 'borrada',
      prioridad: 'urgent',
      tecnico: "'; drop table work_orders; --",
      cliente: ID,
      desde: '2026-12-31',
      hasta: '2026-12-01',
      pagina: '-3',
      q: '  caldera \n\t grande ',
    });
    expect(params).toMatchObject({
      status: null,
      priority: 'urgent',
      technician: null,
      customer: ID,
      from: '2026-12-01',
      to: '2026-12-31',
      page: 1,
      q: 'caldera grande',
    });
    expect(parseOrderListParams({ tecnico: 'sin' }).technician).toBe('sin');
    expect(parseOrderListParams({ pagina: '7' }).page).toBe(7);
  });

  it('construye URLs cortas y reversibles', () => {
    expect(buildOrdersHref('/orders', {})).toBe('/orders');
    const params = parseOrderListParams({
      estado: 'pending',
      q: 'a b',
      pagina: '3',
      tecnico: 'sin',
    });
    const href = buildOrdersHref('/orders', params);
    expect(href).toBe('/orders?q=a+b&estado=pending&tecnico=sin&pagina=3');
    const back = new URL(href, 'http://x').searchParams;
    expect(parseOrderListParams(Object.fromEntries(back))).toEqual(params);
  });
});

describe('errores de dominio de PostgreSQL y fechas', () => {
  it.each([
    ['NX001', 'conflict'],
    ['NX002', 'conflict'],
    ['NX003', 'conflict'],
    ['NX004', 'conflict'],
    ['NX005', 'not_found'],
    ['42501', 'forbidden'],
    ['23514', 'invalid'],
  ])('%s -> %s sin filtrar detalles internos', (code, kind) => {
    const mapped = mapDbError({ code });
    expect(mapped.kind).toBe(kind);
    expect(mapped.message).not.toMatch(/NX00|work_orders|constraint|SQL/i);
  });

  it('formatea fechas de calendario sin desfase de zona', () => {
    expect(formatDate('2026-12-01')).toMatch(/1 dic 2026/);
    expect(formatDate('no-fecha')).toBe('—');
    expect(todayInMadrid(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01');
    expect(todayInMadrid(new Date('2026-12-01T22:30:00Z'))).toBe('2026-12-01');
  });

  it('las rutas de ordenes son protegidas', () => {
    for (const path of ['/orders', '/orders/new', `/orders/${ID}`, `/orders/${ID}/edit`]) {
      expect(isProtectedPath(path)).toBe(true);
    }
  });
});
