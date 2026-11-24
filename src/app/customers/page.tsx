import type { Metadata } from 'next';

import { customerModule } from '@/features/customers/config';
import { customerService } from '@/features/customers/service';
import { RecordListPage } from '@/lib/records/pages';

export const metadata: Metadata = { title: 'Clientes · Nexovantis' };
export const dynamic = 'force-dynamic';

export default function CustomersPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  return (
    <RecordListPage module={customerModule} service={customerService} searchParams={searchParams} />
  );
}
