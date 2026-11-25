'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { z } from 'zod';

import { zodFieldErrors, type ServiceResult } from '@/lib/records/errors';
import { pickFields } from '@/lib/records/form';
import { requireTenant, type TenantContext } from '@/lib/records/tenant';
import type { FormState } from '@/lib/records/types';

import {
  orderAdvanceSchema,
  orderAssignSchema,
  orderCancelSchema,
  orderCreateSchema,
  orderUpdateSchema,
} from './schema';
import { workOrderService } from './service';

// Server Actions de órdenes: adaptadores delgados. Cada una verifica identidad y membresía
// (requireTenant), valida con Zod en servidor, delega en el servicio (RPC de PostgreSQL con las
// reglas) y devuelve errores seguros. La organización y el actor salen de la sesión, nunca del
// formulario; los campos desconocidos se ignoran al extraer y se rechazan en el esquema.
// Un archivo 'use server' solo puede exportar funciones asíncronas.

export type OrderActionState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
};

const DESCRIPTIVE = ['title', 'description', 'priority', 'scheduled_date'] as const;

function refresh(id: string) {
  for (const path of ['/orders', `/orders/${id}`, '/dashboard']) revalidatePath(path);
}

type Checked<S extends z.ZodType> =
  { ok: true; data: z.output<S> } | { ok: false; state: FormState };

function check<S extends z.ZodType>(
  schema: S,
  raw: Record<string, string>,
  values: Record<string, string>,
): Checked<S> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    state: {
      status: 'error',
      message: 'Revisa los campos marcados.',
      fieldErrors: zodFieldErrors(parsed.error),
      values,
    },
  };
}

export async function createOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireTenant();
  const raw = pickFields(formData, ['request_id', 'customer_id', 'technician_id', ...DESCRIPTIVE]);
  const { request_id: _request, ...values } = raw;
  void _request;
  const checked = check(orderCreateSchema, raw, values);
  if (!checked.ok) return checked.state;

  const result = await workOrderService.create(ctx, checked.data);
  if (!result.ok) return { status: 'error', message: result.message, values };
  refresh(result.data.id);
  // redirect lanza una excepción de control de Next: fuera de cualquier try/catch.
  redirect(`/orders/${result.data.id}?aviso=creada`);
}

export async function updateOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireTenant();
  const raw = pickFields(formData, ['id', ...DESCRIPTIVE]);
  const { id: _id, ...values } = raw;
  void _id;
  const checked = check(orderUpdateSchema, raw, values);
  if (!checked.ok) return checked.state;

  const result = await workOrderService.update(ctx, checked.data);
  if (!result.ok) return { status: 'error', message: result.message, values };
  refresh(result.data.id);
  redirect(`/orders/${result.data.id}?aviso=actualizada`);
}

async function run<S extends z.ZodType<{ id: string }>>(
  schema: S,
  raw: Record<string, string>,
  execute: (
    ctx: TenantContext,
    data: z.output<S>,
  ) => Promise<ServiceResult<{ changed: boolean; alreadyCancelled?: boolean }>>,
  successMessage: string,
  repeatMessage?: string,
): Promise<OrderActionState> {
  const ctx = await requireTenant();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { status: 'error', message: 'Los datos enviados no son válidos.' };
  const result = await execute(ctx, parsed.data);
  if (!result.ok) return { status: 'error', message: result.message };
  refresh(parsed.data.id);
  // Un reintento (la orden ya estaba en ese estado) es un éxito sin efecto ni evento nuevo.
  const repeated = result.data.alreadyCancelled === true && repeatMessage;
  return { status: 'success', message: repeated ? repeatMessage : successMessage };
}

export async function assignOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  return run(
    orderAssignSchema,
    pickFields(formData, ['id', 'technician_id']),
    (ctx, data) => workOrderService.assign(ctx, data.id, data.technician_id),
    'Técnico asignado.',
  );
}

export async function advanceOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const raw = pickFields(formData, ['id', 'to']);
  return run(
    orderAdvanceSchema,
    raw,
    (ctx, data) => workOrderService.advance(ctx, data.id, data.to),
    raw.to === 'completed' ? 'Orden completada.' : 'Orden iniciada.',
  );
}

export async function cancelOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  return run(
    orderCancelSchema,
    pickFields(formData, ['id', 'reason']),
    (ctx, data) => workOrderService.cancel(ctx, data.id, data.reason),
    'Orden cancelada.',
    'La orden ya estaba cancelada.',
  );
}
