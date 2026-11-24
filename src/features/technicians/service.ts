import 'server-only';

import { createRecordService } from '@/lib/records/service';

export const technicianService = createRecordService({
  table: 'technicians',
  nameColumn: 'full_name',
});
