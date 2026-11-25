import type { Metadata } from 'next';

import { archiveTechnicianAction, restoreTechnicianAction } from '@/features/technicians/actions';
import { technicianModule } from '@/features/technicians/config';
import { technicianService } from '@/features/technicians/service';
import { RecordDetailPage } from '@/lib/records/pages';

export const metadata: Metadata = { title: 'Técnico · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function TechnicianDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { id } = await params;
  return (
    <RecordDetailPage
      module={technicianModule}
      service={technicianService}
      entityType="technician"
      id={id}
      searchParams={searchParams}
      archiveAction={archiveTechnicianAction}
      restoreAction={restoreTechnicianAction}
    />
  );
}
