import type { Metadata } from 'next';

import { createTechnicianAction } from '@/features/technicians/actions';
import { technicianModule } from '@/features/technicians/config';
import { RecordNewPage } from '@/lib/records/pages';

export const metadata: Metadata = { title: 'Nuevo técnico · Nexovantis' };
export const dynamic = 'force-dynamic';

export default function NewTechnicianPage() {
  return <RecordNewPage module={technicianModule} action={createTechnicianAction} />;
}
