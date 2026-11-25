import type { Metadata } from 'next';

import { updateTechnicianAction } from '@/features/technicians/actions';
import { technicianModule } from '@/features/technicians/config';
import { technicianService } from '@/features/technicians/service';
import { RecordEditPage } from '@/lib/records/pages';

export const metadata: Metadata = { title: 'Editar técnico · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function EditTechnicianPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return (
    <RecordEditPage
      module={technicianModule}
      service={technicianService}
      id={id}
      action={updateTechnicianAction}
    />
  );
}
