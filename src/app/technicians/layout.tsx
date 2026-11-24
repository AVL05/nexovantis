import type { ReactNode } from 'react';

import { technicianModule } from '@/features/technicians/config';
import { RecordModuleLayout } from '@/lib/records/pages';

export default function TechniciansLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <RecordModuleLayout navKey={technicianModule.navKey}>{children}</RecordModuleLayout>;
}
