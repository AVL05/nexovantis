import 'server-only';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { zodFieldErrors } from './errors';
import { pickFields } from './form';
import type { RecordFields, RecordService } from './service';
import { requireTenant } from './tenant';
import type { ArchiveState, FormState, RecordModule } from './types';

// Núcleo de las Server Actions de Clientes y Técnicos. Cada actions.ts es un adaptador delgado:
// valida con Zod en servidor, verifica identidad y membresía (requireTenant) y devuelve errores
// seguros. La organización nunca viene del formulario.

const idSchema = z.uuid();

function fieldsOf(module: RecordModule): string[] {
  return [module.nameField, 'email', 'phone', 'notes'];
}

export async function saveRecord(args: {
  module: RecordModule;
  service: RecordService;
  mode: 'create' | 'update';
  /** Esquema Zod de alta (campos) o edición (campos + id). */
  schema: z.ZodType<Record<string, unknown>>;
  formData: FormData;
}): Promise<FormState> {
  const { module, service, mode, schema, formData } = args;
  const ctx = await requireTenant();

  const raw = pickFields(
    formData,
    mode === 'update' ? ['id', ...fieldsOf(module)] : fieldsOf(module),
  );
  const { id: _ignored, ...values } = raw;
  void _ignored;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Revisa los campos marcados.',
      fieldErrors: zodFieldErrors(parsed.error),
      values,
    };
  }

  const { id, ...fields } = parsed.data as { id?: string } & RecordFields;
  const result =
    mode === 'create'
      ? await service.create(ctx, fields)
      : await service.update(ctx, String(id), fields);
  if (!result.ok) return { status: 'error', message: result.message, values };

  revalidatePath(module.basePath);
  revalidatePath(`${module.basePath}/${result.data.id}`);
  // redirect lanza una excepcion de control de Next: va fuera de cualquier try/catch.
  redirect(
    `${module.basePath}/${result.data.id}?aviso=${mode === 'create' ? 'creado' : 'actualizado'}`,
  );
}

export async function changeArchivedState(args: {
  module: RecordModule;
  service: RecordService;
  operation: 'archive' | 'restore';
  formData: FormData;
}): Promise<ArchiveState> {
  const { module, service, operation, formData } = args;
  const ctx = await requireTenant();
  const id = idSchema.safeParse(formData.get('id'));
  if (!id.success) return { status: 'error', message: 'No se encontró el registro.' };

  const result =
    operation === 'archive'
      ? await service.archive(ctx, id.data)
      : await service.restore(ctx, id.data);
  if (!result.ok) return { status: 'error', message: result.message };

  revalidatePath(module.basePath);
  revalidatePath(`${module.basePath}/${id.data}`);
  const label = module.singular.charAt(0).toUpperCase() + module.singular.slice(1);
  return {
    status: 'success',
    message: operation === 'archive' ? `${label} archivado.` : `${label} restaurado.`,
  };
}
