import type { Metadata } from 'next';

import { technicianModule } from '@/features/technicians/config';
import { technicianService } from '@/features/technicians/service';
import { RecordListPage } from '@/lib/records/pages';

export const metadata: Metadata = { title: 'Técnicos · Nexovantis' };
export const dynamic = 'force-dynamic';

export default function TechniciansPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  return (
    <RecordListPage
      module={technicianModule}
      service={technicianService}
      searchParams={searchParams}
    />
  );
}
