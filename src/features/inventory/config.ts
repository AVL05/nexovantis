import type { RecordModule } from '@/lib/records/types';

import { INVENTORY_LIMITS } from './constants';

// Configuración del módulo para los componentes compartidos de registros (ArchiveControl). Solo
// datos: los límites de contacto no se usan en inventario.
export const INVENTORY_MODULE: RecordModule = {
  basePath: '/inventory',
  navKey: 'inventory',
  singular: 'artículo',
  plural: 'artículos',
  nameField: 'name',
  nameLabel: 'Nombre',
  nameMaxLength: INVENTORY_LIMITS.name,
  emailMaxLength: 0,
  phoneMaxLength: 0,
  notesMaxLength: INVENTORY_LIMITS.description,
};
