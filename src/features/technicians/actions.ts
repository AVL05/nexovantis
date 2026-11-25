'use server';

import { changeArchivedState, saveRecord } from '@/lib/records/handlers';
import type { ArchiveState, FormState } from '@/lib/records/types';

import { technicianModule } from './config';
import { technicianCreateSchema, technicianUpdateSchema } from './schema';
import { technicianService } from './service';

const base = { module: technicianModule, service: technicianService };

export async function createTechnicianAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveRecord({ ...base, mode: 'create', schema: technicianCreateSchema, formData });
}

export async function updateTechnicianAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return saveRecord({ ...base, mode: 'update', schema: technicianUpdateSchema, formData });
}

export async function archiveTechnicianAction(
  _prev: ArchiveState,
  formData: FormData,
): Promise<ArchiveState> {
  return changeArchivedState({ ...base, operation: 'archive', formData });
}

export async function restoreTechnicianAction(
  _prev: ArchiveState,
  formData: FormData,
): Promise<ArchiveState> {
  return changeArchivedState({ ...base, operation: 'restore', formData });
}
