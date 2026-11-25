'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { z } from 'zod';

import { zodFieldErrors } from '@/lib/records/errors';
import { pickFields } from '@/lib/records/form';
import { requireTenant } from '@/lib/records/tenant';
import type { ArchiveState, FormState } from '@/lib/records/types';

import { itemCreateSchema, itemIdSchema, itemUpdateSchema, movementSchema } from './schema';
import { inventoryService } from './service';

// Server Actions de inventario: adaptadores delgados. Cada una verifica identidad y membresía
// (requireTenant), valida con Zod en servidor, delega en el servicio (RPC de PostgreSQL con las
// reglas) y devuelve errores seguros. La organización, el saldo y el actor salen de la sesión y de la
// base, nunca del formulario; los campos desconocidos se ignoran al extraer y se rechazan en el
// esquema. Un archivo 'use server' solo puede exportar funciones asíncronas.

export type MovementActionState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
};

const ITEM_FIELDS = ['reference', 'name', 'description', 'unit', 'low_stock_threshold'] as const;
const EDIT_FIELDS = ['name', 'description', 'unit', 'low_stock_threshold'] as const;
const MOVEMENT_FIELDS = ['request_id', 'item_id', 'kind', 'quantity', 'order_id', 'note'] as const;

function refresh(id: string) {
  for (const path of ['/inventory', `/inventory/${id}`, '/activity', '/dashboard']) {
    revalidatePath(path);
  }
}

type Checked<S extends z.ZodType> =
  { ok: true; data: z.output<S> } | { ok: false; fieldErrors: Record<string, string> };

function check<S extends z.ZodType>(schema: S, raw: Record<string, string>): Checked<S> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
}

export async function createInventoryItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenant();
  const raw = pickFields(formData, ['request_id', ...ITEM_FIELDS]);
  const { request_id: _request, ...values } = raw;
  void _request;
  const checked = check(itemCreateSchema, raw);
  if (!checked.ok) {
    return {
      status: 'error',
      message: 'Revisa los campos marcados.',
      fieldErrors: checked.fieldErrors,
      values,
    };
  }
  const result = await inventoryService.create(ctx, checked.data);
  if (!result.ok) {
    return {
      status: 'error',
      message: result.message,
      // La referencia duplicada se marca en su propio campo.
      fieldErrors:
        result.message === 'Ya existe un artículo con esa referencia.'
          ? { reference: result.message }
          : undefined,
      values,
    };
  }
  refresh(result.data.id);
  // redirect lanza una excepción de control de Next: fuera de cualquier try/catch.
  redirect(`/inventory/${result.data.id}?aviso=creado`);
}

export async function updateInventoryItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireTenant();
  const raw = pickFields(formData, ['id', ...EDIT_FIELDS]);
  const { id: _id, ...values } = raw;
  void _id;
  const checked = check(itemUpdateSchema, raw);
  if (!checked.ok) {
    return {
      status: 'error',
      message: 'Revisa los campos marcados.',
      fieldErrors: checked.fieldErrors,
      values,
    };
  }
  const result = await inventoryService.update(ctx, checked.data);
  if (!result.ok) return { status: 'error', message: result.message, values };
  refresh(result.data.id);
  redirect(`/inventory/${result.data.id}?aviso=actualizado`);
}

async function toggleArchive(
  formData: FormData,
  mode: 'archive' | 'restore',
): Promise<ArchiveState> {
  const ctx = await requireTenant();
  const checked = check(itemIdSchema, pickFields(formData, ['id']));
  if (!checked.ok) return { status: 'error', message: 'Los datos enviados no son válidos.' };
  const { id } = checked.data;
  const result =
    mode === 'archive'
      ? await inventoryService.archive(ctx, id)
      : await inventoryService.restore(ctx, id);
  if (!result.ok) return { status: 'error', message: result.message };
  refresh(id);
  if (!result.data.changed) {
    return {
      status: 'success',
      message:
        mode === 'archive' ? 'El artículo ya estaba archivado.' : 'El artículo ya estaba activo.',
    };
  }
  return {
    status: 'success',
    message: mode === 'archive' ? 'Artículo archivado.' : 'Artículo restaurado.',
  };
}

export async function archiveInventoryItemAction(
  _prev: ArchiveState,
  formData: FormData,
): Promise<ArchiveState> {
  return toggleArchive(formData, 'archive');
}

export async function restoreInventoryItemAction(
  _prev: ArchiveState,
  formData: FormData,
): Promise<ArchiveState> {
  return toggleArchive(formData, 'restore');
}

export async function recordMovementAction(
  _prev: MovementActionState,
  formData: FormData,
): Promise<MovementActionState> {
  const ctx = await requireTenant();
  const raw = pickFields(formData, [...MOVEMENT_FIELDS]);
  const checked = check(movementSchema, raw);
  if (!checked.ok) {
    const fieldErrors = { ...checked.fieldErrors };
    if (fieldErrors.order_id) {
      fieldErrors.order_id =
        raw.kind === 'consumption'
          ? 'Elige la orden a la que se imputa el consumo.'
          : 'Solo el consumo se vincula a una orden.';
    }
    if (fieldErrors.quantity) {
      fieldErrors.quantity = 'Introduce una cantidad entera mayor que 0.';
    }
    return { status: 'error', message: 'Revisa los campos marcados.', fieldErrors };
  }
  const result = await inventoryService.move(ctx, checked.data);
  if (!result.ok) return { status: 'error', message: result.message };
  refresh(checked.data.item_id);
  return {
    status: 'success',
    message: result.data.replayed
      ? `Este movimiento ya estaba registrado. Saldo actual: ${result.data.balance}.`
      : `Movimiento registrado. Saldo actual: ${result.data.balance}.`,
  };
}
