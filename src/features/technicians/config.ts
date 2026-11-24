import type { RecordModule } from '@/lib/records/types';

import { TECHNICIAN_LIMITS } from './schema';

export const technicianModule: RecordModule = {
  basePath: '/technicians',
  navKey: 'technicians',
  singular: 'técnico',
  plural: 'técnicos',
  nameField: 'full_name',
  nameLabel: 'Nombre completo',
  nameMaxLength: TECHNICIAN_LIMITS.full_name,
  emailMaxLength: TECHNICIAN_LIMITS.email,
  phoneMaxLength: TECHNICIAN_LIMITS.phone,
  notesMaxLength: TECHNICIAN_LIMITS.notes,
};
