import { beforeEach, describe, expect, it, vi } from 'vitest';

const cancel = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/records/tenant', () => ({ requireTenant: vi.fn(async () => ({})) }));
vi.mock('@/features/work-orders/service', () => ({ workOrderService: { cancel } }));

import { cancelOrderAction } from '@/features/work-orders/actions';

const ID = '8f14e45f-ceea-467a-9575-0d9d3b8a1c11';
const form = () => {
  const data = new FormData();
  data.set('id', ID);
  data.set('reason', '');
  return data;
};
const idle = { status: 'idle' } as const;

describe('cancelOrderAction (TC-CANC-02)', () => {
  beforeEach(() => cancel.mockReset());

  it('primera cancelacion: Orden cancelada.', async () => {
    cancel.mockResolvedValue({ ok: true, data: { changed: true, alreadyCancelled: false } });
    expect(await cancelOrderAction(idle, form())).toEqual({
      status: 'success',
      message: 'Orden cancelada.',
    });
  });

  it('segunda cancelacion: se rechaza como error', async () => {
    cancel.mockResolvedValue({ ok: true, data: { changed: false, alreadyCancelled: true } });
    expect(await cancelOrderAction(idle, form())).toEqual({
      status: 'error',
      message: 'La orden ya estaba cancelada.',
    });
  });

  it('un fallo del servicio se devuelve como error', async () => {
    cancel.mockResolvedValue({ ok: false, kind: 'conflict', message: 'No permitido' });
    expect(await cancelOrderAction(idle, form())).toEqual({
      status: 'error',
      message: 'No permitido',
    });
  });
});
