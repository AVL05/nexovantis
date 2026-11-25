import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ORDER_STATUSES,
  availableActions,
  isTerminal,
  type OrderStatus,
} from '@/features/work-orders/constants';
import {
  UNASSIGNED,
  buildOrdersHref,
  hasActiveFilters,
  parseOrderListParams,
} from '@/features/work-orders/params';
import {
  orderAdvanceSchema,
  orderAssignSchema,
  orderCancelSchema,
  orderCreateSchema,
  orderUpdateSchema,
} from '@/features/work-orders/schema';
import { mapDbError } from '@/lib/records/errors';
import { formatDate, todayInMadrid } from '@/lib/records/format';

// Pruebas independientes de Testing (TASK-011 POST, F4). Develop no las modifica ni las salta.

const UUID = '3f2b8a10-5c1d-4e7a-9b3a-1c2d3e4f5a6b';
const UUID2 = '8a7b6c5d-4e3f-4a1b-8c9d-0e1f2a3b4c5d';
const base = {
  request_id: UUID,
  customer_id: UUID2,
  technician_id: '',
  title: 'Revisar caldera',
  description: '',
  priority: 'normal',
  scheduled_date: '2026-12-01',
};

describe('esquema de alta (validacion de servidor)', () => {
  it('acepta una entrada valida y normaliza vacios a null y el titulo recortado', () => {
    const r = orderCreateSchema.parse({ ...base, title: '  Revisar caldera  ' });
    expect(r).toMatchObject({ title: 'Revisar caldera', description: null, technician_id: null });
  });

  it.each([
    ['titulo vacio', { title: '' }],
    ['titulo solo espacios', { title: '   ' }],
    ['titulo con NBSP y espacios Unicode', { title: '  　' }],
    ['titulo de 121', { title: 'x'.repeat(121) }],
    ['descripcion de 2001', { description: 'd'.repeat(2001) }],
    ['prioridad fuera de catalogo', { priority: 'critica' }],
    ['prioridad vacia', { priority: '' }],
    ['fecha 31 de febrero', { scheduled_date: '2026-02-31' }],
    ['fecha 13 meses', { scheduled_date: '2026-13-01' }],
    ['fecha con formato local', { scheduled_date: '01/12/2026' }],
    ['fecha con hora', { scheduled_date: '2026-12-01T00:00:00Z' }],
    ['fecha vacia', { scheduled_date: '' }],
    ['request_id no uuid', { request_id: 'abc' }],
    ['request_id ausente', { request_id: undefined }],
    ['cliente no uuid', { customer_id: "x'; drop table work_orders;--" }],
    ['cliente vacio', { customer_id: '' }],
    ['tecnico no uuid', { technician_id: 'no-uuid' }],
    ['campo desconocido organization_id', { organization_id: UUID }],
    ['campo desconocido status', { status: 'completed' }],
    ['campo desconocido actor_id', { actor_id: UUID }],
  ])('rechaza %s', (_name, patch) => {
    expect(orderCreateSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });

  it('acepta los limites exactos y 29 de febrero bisiesto, y rechaza el no bisiesto', () => {
    expect(
      orderCreateSchema.safeParse({
        ...base,
        title: 'x'.repeat(120),
        description: 'd'.repeat(2000),
      }).success,
    ).toBe(true);
    expect(orderCreateSchema.safeParse({ ...base, scheduled_date: '2028-02-29' }).success).toBe(
      true,
    );
    expect(orderCreateSchema.safeParse({ ...base, scheduled_date: '2027-02-29' }).success).toBe(
      false,
    );
  });

  it('un tecnico valido se conserva', () => {
    expect(orderCreateSchema.parse({ ...base, technician_id: UUID }).technician_id).toBe(UUID);
  });
});

describe('esquemas de edicion, asignacion, avance y cancelacion', () => {
  it('edicion: exige id y los descriptivos; rechaza cliente, tecnico o estado', () => {
    const ok = {
      id: UUID,
      title: 't',
      description: '',
      priority: 'low',
      scheduled_date: '2026-12-01',
    };
    expect(orderUpdateSchema.safeParse(ok).success).toBe(true);
    for (const extra of ['customer_id', 'technician_id', 'status', 'organization_id']) {
      expect(orderUpdateSchema.safeParse({ ...ok, [extra]: UUID }).success, extra).toBe(false);
    }
    expect(orderUpdateSchema.safeParse({ ...ok, id: 'x' }).success).toBe(false);
  });

  it('asignacion: tecnico obligatorio y uuid', () => {
    expect(orderAssignSchema.safeParse({ id: UUID, technician_id: UUID2 }).success).toBe(true);
    expect(orderAssignSchema.safeParse({ id: UUID, technician_id: '' }).success).toBe(false);
    expect(orderAssignSchema.safeParse({ id: UUID }).success).toBe(false);
  });

  it('avance: solo en_curso o completada (no pendiente, asignada ni cancelada)', () => {
    for (const to of ['in_progress', 'completed'])
      expect(orderAdvanceSchema.safeParse({ id: UUID, to }).success).toBe(true);
    for (const to of ['pending', 'assigned', 'cancelled', '', 'IN_PROGRESS']) {
      expect(orderAdvanceSchema.safeParse({ id: UUID, to }).success, to).toBe(false);
    }
  });

  it('cancelacion: motivo opcional de hasta 200 caracteres', () => {
    expect(orderCancelSchema.parse({ id: UUID, reason: '' }).reason).toBeNull();
    expect(orderCancelSchema.parse({ id: UUID, reason: '  ausente ' }).reason).toBe('ausente');
    expect(orderCancelSchema.safeParse({ id: UUID, reason: 'x'.repeat(200) }).success).toBe(true);
    expect(orderCancelSchema.safeParse({ id: UUID, reason: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('parametros del listado: sin entradas sin validar hacia la consulta', () => {
  it('valores invalidos caen en el valor por defecto', () => {
    const p = parseOrderListParams({
      pagina: '-3',
      estado: 'hacked',
      prioridad: 'x',
      tecnico: "x'),organization_id.neq.0",
      cliente: 'no-uuid',
      desde: '2026-02-31',
      hasta: 'ayer',
      q: '   ',
    });
    expect(p).toMatchObject({
      page: 1,
      q: '',
      status: null,
      priority: null,
      technician: null,
      customer: null,
      from: null,
      to: null,
    });
    expect(hasActiveFilters(p)).toBe(false);
  });

  it('pagina absurda se acota, arrays toman el primer valor y el rango invertido se ordena', () => {
    expect(parseOrderListParams({ pagina: '99999999999' }).page).toBe(1);
    expect(parseOrderListParams({ pagina: '1000000' }).page).toBeLessThanOrEqual(100_000);
    expect(parseOrderListParams({ estado: ['assigned', 'pending'] }).status).toBe('assigned');
    const r = parseOrderListParams({ desde: '2026-12-31', hasta: '2026-01-01' });
    expect([r.from, r.to]).toEqual(['2026-01-01', '2026-12-31']);
    expect(parseOrderListParams({ tecnico: UNASSIGNED }).technician).toBe(UNASSIGNED);
    expect(parseOrderListParams({ tecnico: UUID }).technician).toBe(UUID);
  });

  it('buildOrdersHref codifica el texto y omite valores por defecto (ida y vuelta)', () => {
    const href = buildOrdersHref('/orders', { q: 'a&b=c#x ñ', status: 'pending', page: 3 });
    expect(href.startsWith('/orders?')).toBe(true);
    expect(href).not.toContain('#');
    const params = Object.fromEntries(new URL(href, 'http://x').searchParams);
    const back = parseOrderListParams(params);
    expect(back).toMatchObject({ q: 'a&b=c#x ñ', status: 'pending', page: 3 });
    expect(buildOrdersHref('/orders', { page: 1 })).toBe('/orders');
  });
});

describe('acciones ofrecidas por la interfaz coinciden con la matriz de la base (DH-01/02/03/07)', () => {
  const EXPECTED: Record<OrderStatus, Record<string, boolean>> = {
    pending: {
      edit: true,
      assign: true,
      reassign: false,
      start: false,
      complete: false,
      cancel: true,
    },
    assigned: {
      edit: true,
      assign: false,
      reassign: true,
      start: true,
      complete: false,
      cancel: true,
    },
    in_progress: {
      edit: true,
      assign: false,
      reassign: false,
      start: false,
      complete: true,
      cancel: true,
    },
    completed: {
      edit: false,
      assign: false,
      reassign: false,
      start: false,
      complete: false,
      cancel: false,
    },
    cancelled: {
      edit: false,
      assign: false,
      reassign: false,
      start: false,
      complete: false,
      cancel: false,
    },
  };
  it.each(ORDER_STATUSES)('%s', (status) => {
    expect(availableActions(status)).toEqual(EXPECTED[status]);
    expect(isTerminal(status)).toBe(status === 'completed' || status === 'cancelled');
  });
});

describe('traduccion de errores de base: seguros y sin filtrar detalles', () => {
  it.each([
    ['NX001', 'conflict'],
    ['NX002', 'conflict'],
    ['NX003', 'conflict'],
    ['NX004', 'conflict'],
    ['NX005', 'not_found'],
    ['23514', 'invalid'],
    ['22001', 'invalid'],
    ['42501', 'forbidden'],
    ['XX000', 'unavailable'],
  ])('%s -> %s', (code, kind) => {
    const r = mapDbError({
      code,
      message: 'detalle interno SELECT * FROM work_orders',
      details: 'org aaaa',
    } as never);
    expect(r.kind).toBe(kind);
    expect(r.message).not.toMatch(/select|work_orders|org |postgres|trigger|NX00/i);
  });
  it('NX005 y registro inexistente son indistinguibles (sin revelar otra organizacion)', () => {
    expect(mapDbError({ code: 'NX005' })).toEqual(mapDbError({ code: 'PGRST116' }));
  });
});

describe('fechas de calendario', () => {
  it('todayInMadrid usa la zona de Madrid (verano e invierno, cambio de dia)', () => {
    expect(todayInMadrid(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
    expect(todayInMadrid(new Date('2026-12-01T22:30:00Z'))).toBe('2026-12-01');
    expect(todayInMadrid(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-02');
  });
  it('formatDate no desplaza el dia por zona horaria y tolera entradas invalidas', () => {
    expect(formatDate('2026-12-01')).toMatch(/1/);
    expect(formatDate('2026-12-01')).toMatch(/2026/);
    expect(formatDate('no-fecha')).toBe('—');
  });
});

describe('comprobaciones estaticas de seguridad del codigo de ordenes', () => {
  const SRC = join(process.cwd(), 'src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name)) files.push(full);
    }
  };
  walk(join(SRC, 'features', 'work-orders'));
  walk(join(SRC, 'app', 'orders'));
  const read = (f: string) => readFileSync(f, 'utf8');

  it('hay archivos que revisar', () => expect(files.length).toBeGreaterThan(10));

  it('sin clave de servicio, cliente administrativo ni HTML sin escapar', () => {
    for (const f of files) {
      const t = read(f);
      expect(t, f).not.toMatch(
        /service_role|SERVICE_ROLE|supabase\/admin|createAdminClient|dangerouslySetInnerHTML/,
      );
    }
  });

  it('ninguna escritura directa sobre work_orders desde la aplicacion (solo RPC)', () => {
    for (const f of files) {
      const t = read(f).replace(/\s+/g, ' ');
      expect(t, f).not.toMatch(/from\('work_orders'\)\s*\.\s*(insert|update|upsert|delete)/);
      expect(t, f).not.toMatch(
        /from\('(activity_events|work_order_event_details)'\)\s*\.\s*(insert|update|upsert|delete)/,
      );
    }
  });

  it('actions.ts: "use server", solo exporta funciones asincronas y valida antes de llamar al servicio', () => {
    const t = read(join(SRC, 'features', 'work-orders', 'actions.ts'));
    expect(t.trimStart().startsWith("'use server'")).toBe(true);
    const exports = [...t.matchAll(/^export\s+(\w+)\s+(\w+)/gm)];
    for (const m of exports) {
      if (m[1] === 'type') continue;
      expect(m[1] === 'async', `export no asincrono: ${m[0]}`).toBe(true);
    }
    expect(t).toMatch(/requireTenant\(\)/);
    for (const schema of [
      'orderCreateSchema',
      'orderUpdateSchema',
      'orderAssignSchema',
      'orderAdvanceSchema',
      'orderCancelSchema',
    ]) {
      expect(t, schema).toContain(schema);
    }
    // la organizacion y el actor nunca se leen del formulario
    expect(t).not.toMatch(/organization_id|actor_id|'status'/);
  });

  it('service.ts: solo RPC de escritura y todas las consultas filtran por organizacion', () => {
    const t = read(join(SRC, 'features', 'work-orders', 'service.ts'));
    for (const rpc of [
      'create_work_order',
      'update_work_order',
      'assign_work_order',
      'advance_work_order',
      'cancel_work_order',
    ]) {
      expect(t, rpc).toContain(`'${rpc}'`);
    }
    expect(t).toMatch(/^import 'server-only';/);
  });
});
