import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  move: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock('@/lib/records/tenant', () => ({ requireTenant: vi.fn(async () => ({ marker: 'ctx' })) }));
vi.mock('@/features/inventory/service', () => ({ inventoryService: service }));

import {
  archiveInventoryItemAction,
  createInventoryItemAction,
  recordMovementAction,
  restoreInventoryItemAction,
  updateInventoryItemAction,
} from '@/features/inventory/actions';
import { mapInventoryError } from '@/features/inventory/errors';

const ID = '8f14e45f-ceea-467a-9575-0d9d3b8a1c11';
const ORDER = '9b2e3b4e-1f4b-4d5e-8a76-2a1c4f0d9e55';
const REQ = 'c4ca4238-a0b9-4382-8ad5-7a1f9d2b0c33';
const idle = { status: 'idle' } as const;

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const movement = (over: Record<string, string> = {}) =>
  form({
    request_id: REQ,
    item_id: ID,
    kind: 'in',
    quantity: '5',
    order_id: '',
    note: '',
    ...over,
  });

beforeEach(() => {
  for (const fn of Object.values(service)) fn.mockReset();
});

describe('recordMovementAction', () => {
  it('envía al servicio solo los campos validados (sin organización, saldo ni actor del formulario)', async () => {
    service.move.mockResolvedValue({ ok: true, data: { id: ID, balance: 5, replayed: false } });
    const data = movement({ note: ' alta ' });
    data.set('organization_id', ORDER);
    data.set('balance_after', '999');
    data.set('created_by', ORDER);
    const result = await recordMovementAction(idle, data);
    expect(result).toEqual({
      status: 'success',
      message: 'Movimiento registrado. Saldo actual: 5.',
    });
    expect(service.move).toHaveBeenCalledTimes(1);
    const [ctx, input] = service.move.mock.calls[0];
    expect(ctx).toEqual({ marker: 'ctx' });
    expect(input).toEqual({
      request_id: REQ,
      item_id: ID,
      kind: 'in',
      quantity: 5,
      order_id: null,
      note: 'alta',
    });
  });

  it('un reintento (clave ya registrada) lo comunica sin duplicar', async () => {
    service.move.mockResolvedValue({ ok: true, data: { id: ID, balance: 5, replayed: true } });
    const result = await recordMovementAction(idle, movement());
    expect(result.status).toBe('success');
    expect(result.message).toContain('ya estaba registrado');
  });

  it('cantidad no entera o no positiva: error por campo y el servicio no se invoca', async () => {
    for (const quantity of ['0', '-1', '2.5', '', 'abc']) {
      const result = await recordMovementAction(idle, movement({ quantity }));
      expect(result.status).toBe('error');
      expect(result.fieldErrors?.quantity).toBe('Introduce una cantidad entera mayor que 0.');
    }
    expect(service.move).not.toHaveBeenCalled();
  });

  it('el consumo sin orden se rechaza en servidor y la entrada con orden también', async () => {
    const noOrder = await recordMovementAction(idle, movement({ kind: 'consumption' }));
    expect(noOrder.fieldErrors?.order_id).toBe('Elige la orden a la que se imputa el consumo.');
    const withOrder = await recordMovementAction(idle, movement({ kind: 'out', order_id: ORDER }));
    expect(withOrder.fieldErrors?.order_id).toBe('Solo el consumo se vincula a una orden.');
    expect(service.move).not.toHaveBeenCalled();
    service.move.mockResolvedValue({ ok: true, data: { id: ID, balance: 1, replayed: false } });
    const ok = await recordMovementAction(idle, movement({ kind: 'consumption', order_id: ORDER }));
    expect(ok.status).toBe('success');
    expect(service.move.mock.calls[0][1]).toMatchObject({ kind: 'consumption', order_id: ORDER });
  });

  it('un fallo del servicio (saldo insuficiente, archivado, orden) se devuelve como error seguro', async () => {
    service.move.mockResolvedValue({
      ok: false,
      kind: 'conflict',
      message: 'No hay existencias suficientes: el saldo no puede quedar negativo.',
    });
    expect(await recordMovementAction(idle, movement({ kind: 'out' }))).toEqual({
      status: 'error',
      message: 'No hay existencias suficientes: el saldo no puede quedar negativo.',
    });
  });
});

describe('alta, edición, archivado y restauración', () => {
  const createForm = (over: Record<string, string> = {}) =>
    form({
      request_id: REQ,
      reference: 'TUB-15',
      name: 'Tubo',
      description: '',
      unit: 'm',
      low_stock_threshold: '5',
      ...over,
    });

  it('el alta redirige al detalle con aviso y no admite saldo inicial ni organización', async () => {
    service.create.mockResolvedValue({ ok: true, data: { id: ID } });
    const data = createForm();
    data.set('quantity', '50');
    data.set('organization_id', ORDER);
    await expect(createInventoryItemAction(idle, data)).rejects.toThrow(
      `REDIRECT:/inventory/${ID}?aviso=creado`,
    );
    expect(Object.keys(service.create.mock.calls[0][1]).sort()).toEqual([
      'description',
      'low_stock_threshold',
      'name',
      'reference',
      'request_id',
      'unit',
    ]);
  });

  it('referencia duplicada: el error se marca en su campo y se conservan los valores', async () => {
    service.create.mockResolvedValue({
      ok: false,
      kind: 'conflict',
      message: 'Ya existe un artículo con esa referencia.',
    });
    const result = await createInventoryItemAction(idle, createForm());
    expect(result).toMatchObject({
      status: 'error',
      fieldErrors: { reference: 'Ya existe un artículo con esa referencia.' },
      values: { reference: 'TUB-15', name: 'Tubo' },
    });
  });

  it('datos inválidos no llegan al servicio', async () => {
    const result = await createInventoryItemAction(idle, createForm({ unit: 'pallet', name: ' ' }));
    expect(result.status).toBe('error');
    expect(result.fieldErrors).toHaveProperty('unit');
    expect(result.fieldErrors).toHaveProperty('name');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('la edición no acepta cambiar la referencia', async () => {
    const data = form({
      id: ID,
      name: 'Nuevo',
      description: '',
      unit: 'ud',
      low_stock_threshold: '',
    });
    data.set('reference', 'OTRA');
    service.update.mockResolvedValue({ ok: true, data: { id: ID } });
    await expect(updateInventoryItemAction(idle, data)).rejects.toThrow(
      `REDIRECT:/inventory/${ID}?aviso=actualizado`,
    );
    expect(service.update.mock.calls[0][1]).not.toHaveProperty('reference');
    expect(service.update.mock.calls[0][1]).toMatchObject({ low_stock_threshold: 0 });
  });

  it('archivar y restaurar informan del resultado y de los no-op', async () => {
    service.archive.mockResolvedValue({ ok: true, data: { changed: true } });
    expect(await archiveInventoryItemAction(idle, form({ id: ID }))).toEqual({
      status: 'success',
      message: 'Artículo archivado.',
    });
    service.archive.mockResolvedValue({ ok: true, data: { changed: false } });
    expect((await archiveInventoryItemAction(idle, form({ id: ID }))).message).toBe(
      'El artículo ya estaba archivado.',
    );
    service.restore.mockResolvedValue({ ok: true, data: { changed: true } });
    expect((await restoreInventoryItemAction(idle, form({ id: ID }))).message).toBe(
      'Artículo restaurado.',
    );
    expect((await archiveInventoryItemAction(idle, form({ id: 'no-uuid' }))).status).toBe('error');
  });
});

describe('mapInventoryError', () => {
  it('traduce los errores de dominio a mensajes seguros sin detalles internos', () => {
    expect(mapInventoryError({ code: 'NX020' }).kind).toBe('not_found');
    expect(mapInventoryError({ code: 'NX021' }).message).toContain('archivado');
    expect(mapInventoryError({ code: 'NX022' }).message).toContain('negativo');
    expect(mapInventoryError({ code: 'NX023' }).kind).toBe('conflict');
    expect(mapInventoryError({ code: 'NX024' }).kind).toBe('conflict');
    expect(mapInventoryError({ code: 'NX025' }).message).toBe(
      'Ya existe un artículo con esa referencia.',
    );
    expect(mapInventoryError({ code: 'NX026' }).kind).toBe('conflict');
    expect(mapInventoryError({ code: '23514' }).kind).toBe('invalid');
    expect(mapInventoryError({ code: '42501' }).kind).toBe('forbidden');
    expect(mapInventoryError({ code: 'XX000' }).kind).toBe('unavailable');
    expect(mapInventoryError(null).kind).toBe('unavailable');
  });
});

describe('guardas estáticas (TASK-013)', () => {
  const read = (path: string) => readFileSync(path, 'utf8');

  it('servicio y páginas son server-only; las acciones son Server Actions', () => {
    for (const file of [
      'src/features/inventory/service.ts',
      'src/features/inventory/pages.tsx',
      'src/features/activity/service.ts',
      'src/features/activity/pages.tsx',
    ]) {
      expect(read(file), file).toMatch(/^import 'server-only';/m);
    }
    expect(read('src/features/inventory/actions.ts')).toMatch(/^'use server';/);
  });

  it('la organización nunca se lee del formulario ni se usa el rol de servicio', () => {
    for (const file of [
      'src/features/inventory/actions.ts',
      'src/features/inventory/service.ts',
      'src/features/inventory/schema.ts',
      'src/features/activity/service.ts',
    ]) {
      const code = read(file);
      expect(code, file).not.toMatch(/service_role|SERVICE_ROLE/);
      expect(code, file).not.toMatch(/formData\.get\(['"]organization_id/);
    }
    const schema = read('src/features/inventory/schema.ts')
      .split(/\r?\n/)
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join('\n');
    expect(schema).not.toMatch(/organization_id|actor|balance_/);
    expect(read('src/features/inventory/actions.ts')).toContain('requireTenant()');
  });

  it('los componentes de cliente no importan módulos de servidor', () => {
    for (const file of [
      'src/features/inventory/ui/MovementForm.tsx',
      'src/features/inventory/ui/InventoryForm.tsx',
    ]) {
      const code = read(file);
      expect(code, file).toMatch(/^'use client';/);
      expect(code, file).not.toMatch(/server-only|\/service'|lib\/supabase\/server/);
    }
  });
});
