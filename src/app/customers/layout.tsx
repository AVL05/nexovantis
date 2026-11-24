import type { ReactNode } from 'react';

import { customerModule } from '@/features/customers/config';
import { RecordModuleLayout } from '@/lib/records/pages';

export default function CustomersLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <RecordModuleLayout navKey={customerModule.navKey}>{children}</RecordModuleLayout>;
}
