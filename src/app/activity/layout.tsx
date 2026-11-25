import type { ReactNode } from 'react';

import { RecordModuleLayout } from '@/lib/records/pages';

export default function ActivityLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <RecordModuleLayout navKey="activity">{children}</RecordModuleLayout>;
}
