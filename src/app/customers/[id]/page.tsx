import type { Metadata } from 'next';

import { archiveCustomerAction, restoreCustomerAction } from '@/features/customers/actions';
import { customerModule } from '@/features/customers/config';
import { customerService } from '@/features/customers/service';
import { RecordDetailPage } from '@/lib/records/pages';

export const metadata: Metadata = { title: 'Cliente · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { id } = await params;
  return (
    <RecordDetailPage
      module={customerModule}
      service={customerService}
      entityType="customer"
      id={id}
      searchParams={searchParams}
      archiveAction={archiveCustomerAction}
      restoreAction={restoreCustomerAction}
    />
  );
}
