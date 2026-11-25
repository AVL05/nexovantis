import type { ReactNode } from 'react';

import { RecordModuleLayout } from '@/lib/records/pages';

export default function InventoryLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <RecordModuleLayout navKey="inventory">{children}</RecordModuleLayout>;
}
