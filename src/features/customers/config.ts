import type { RecordModule } from '@/lib/records/types';

import { CUSTOMER_LIMITS } from './schema';

export const customerModule: RecordModule = {
  basePath: '/customers',
  navKey: 'customers',
  singular: 'cliente',
  plural: 'clientes',
  nameField: 'name',
  nameLabel: 'Nombre',
  nameMaxLength: CUSTOMER_LIMITS.name,
  emailMaxLength: CUSTOMER_LIMITS.email,
  phoneMaxLength: CUSTOMER_LIMITS.phone,
  notesMaxLength: CUSTOMER_LIMITS.notes,
};
