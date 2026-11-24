'use server';

import { changeArchivedState, saveRecord } from '@/lib/records/handlers';
import type { ArchiveState, FormState } from '@/lib/records/types';

import { customerModule } from './config';
import { customerCreateSchema, customerUpdateSchema } from './schema';
import { customerService } from './service';

const base = { module: customerModule, service: customerService };

export async function createCustomerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveRecord({ ...base, mode: 'create', schema: customerCreateSchema, formData });
}

export async function updateCustomerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveRecord({ ...base, mode: 'update', schema: customerUpdateSchema, formData });
}

export async function archiveCustomerAction(
  _prev: ArchiveState,
  formData: FormData,
): Promise<ArchiveState> {
  return changeArchivedState({ ...base, operation: 'archive', formData });
}

export async function restoreCustomerAction(
  _prev: ArchiveState,
  formData: FormData,
): Promise<ArchiveState> {
  return changeArchivedState({ ...base, operation: 'restore', formData });
}
