'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { z } from 'zod';

import { zodFieldErrors, type ServiceResult } from '@/lib/records/errors';
import { pickFields } from '@/lib/records/form';
import { requireTenant, type TenantContext } from '@/lib/records/tenant';
import type { FormState } from '@/lib/records/types';

import {
  itemCreateSchema,
  itemRemoveSchema,
  itemUpdateSchema,
  quoteCreateSchema,
  quoteDecisionSchema,
  quoteUpdateSchema,
} from './schema';
import { quoteService } from './service';

// Server Actions de presupuestos: adaptadores delgados. Cada una verifica identidad y membresía
// (requireTenant), valida con Zod en servidor, delega en el servicio (RPC de PostgreSQL con las
// reglas) y devuelve errores seguros. La organización, el estado, los totales y el actor salen de la
// sesión y de la base, nunca del formulario; los campos desconocidos se ignoran al extraer y se
// rechazan en el esquema. Un archivo 'use server' solo puede exportar funciones asíncronas.

export type QuoteActionState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Record<string, string>;
};

const DESCRIPTIVE = ['customer_id', 'title', 'description'] as const;
const ITEM_FIELDS = ['description', 'quantity', 'unit_price', 'tax_rate_bp'] as const;

function refresh(id: string, extra: readonly string[] = []) {
  for (const path of ['/quotes', `/quotes/${id}`, ...extra]) revalidatePath(path);
}

type Checked<S extends z.ZodType> =
  { ok: true; data: z.output<S> } | { ok: false; fieldErrors: Record<string, string> };

function check<S extends z.ZodType>(schema: S, raw: Record<string, string>): Checked<S> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };
}

export async function createQuoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireTenant();
  const raw = pickFields(formData, ['request_id', ...DESCRIPTIVE]);
  const { request_id: _request, ...values } = raw;
  void _request;
  const checked = check(quoteCreateSchema, raw);
  if (!checked.ok) {
    return {
      status: 'error',
      message: 'Revisa los campos marcados.',
      fieldErrors: checked.fieldErrors,
      values,
    };
  }
  const result = await quoteService.create(ctx, checked.data);
  if (!result.ok) return { status: 'error', message: result.message, values };
  refresh(result.data.id);
  // redirect lanza una excepción de control de Next: fuera de cualquier try/catch.
  redirect(`/quotes/${result.data.id}?aviso=creado`);
}

export async function updateQuoteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireTenant();
  const raw = pickFields(formData, ['id', ...DESCRIPTIVE]);
  const { id: _id, ...values } = raw;
  void _id;
  const checked = check(quoteUpdateSchema, raw);
  if (!checked.ok) {
    return {
      status: 'error',
      message: 'Revisa los campos marcados.',
      fieldErrors: checked.fieldErrors,
      values,
    };
  }
  const result = await quoteService.update(ctx, checked.data);
  if (!result.ok) return { status: 'error', message: result.message, values };
  refresh(result.data.id);
  redirect(`/quotes/${result.data.id}?aviso=actualizado`);
}

async function run<S extends z.ZodType>(
  schema: S,
  raw: Record<string, string>,
  execute: (ctx: TenantContext, data: z.output<S>) => Promise<ServiceResult<unknown>>,
  quoteIdOf: (data: z.output<S>) => string,
  successMessage: string,
  extraPaths: readonly string[] = [],
): Promise<QuoteActionState> {
  const ctx = await requireTenant();
  const checked = check(schema, raw);
  if (!checked.ok) {
    return {
      status: 'error',
      message: 'Revisa los campos marcados.',
      fieldErrors: checked.fieldErrors,
    };
  }
  const result = await execute(ctx, checked.data);
  if (!result.ok) return { status: 'error', message: result.message };
  refresh(quoteIdOf(checked.data), extraPaths);
  return { status: 'success', message: successMessage };
}

export async function addQuoteItemAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const raw = pickFields(formData, ['quote_id', 'request_id', ...ITEM_FIELDS]);
  return run(
    itemCreateSchema,
    raw,
    (ctx, data) => quoteService.addItem(ctx, data),
    (data) => data.quote_id,
    'Concepto añadido.',
  );
}

export async function updateQuoteItemAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  return run(
    itemUpdateSchema,
    pickFields(formData, ['id', 'quote_id', ...ITEM_FIELDS]),
    (ctx, data) => quoteService.updateItem(ctx, data),
    (data) => data.quote_id,
    'Concepto actualizado.',
  );
}

export async function removeQuoteItemAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  return run(
    itemRemoveSchema,
    pickFields(formData, ['id', 'quote_id']),
    (ctx, data) => quoteService.removeItem(ctx, data.id),
    (data) => data.quote_id,
    'Concepto eliminado.',
  );
}

export async function acceptQuoteAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  return run(
    quoteDecisionSchema,
    pickFields(formData, ['id']),
    (ctx, data) => quoteService.accept(ctx, data.id),
    (data) => data.id,
    'Presupuesto aceptado. Se ha generado la orden de servicio.',
    ['/orders', '/dashboard'],
  );
}

export async function rejectQuoteAction(
  _prev: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  return run(
    quoteDecisionSchema,
    pickFields(formData, ['id']),
    (ctx, data) => quoteService.reject(ctx, data.id),
    (data) => data.id,
    'Presupuesto rechazado.',
  );
}
