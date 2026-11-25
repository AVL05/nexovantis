import type { ReactNode } from 'react';

import { RecordModuleLayout } from '@/lib/records/pages';

export default function OrdersLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <RecordModuleLayout navKey="orders">{children}</RecordModuleLayout>;
}
