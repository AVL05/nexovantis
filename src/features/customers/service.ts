import 'server-only';

import { createRecordService } from '@/lib/records/service';

export const customerService = createRecordService({ table: 'customers', nameColumn: 'name' });
