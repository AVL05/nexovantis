import type { ReactNode } from 'react';

import { RecordModuleLayout } from '@/lib/records/pages';

export default function QuotesLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <RecordModuleLayout navKey="quotes">{children}</RecordModuleLayout>;
}
