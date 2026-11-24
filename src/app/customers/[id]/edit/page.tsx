import type { Metadata } from 'next';

import { updateCustomerAction } from '@/features/customers/actions';
import { customerModule } from '@/features/customers/config';
import { customerService } from '@/features/customers/service';
import { RecordEditPage } from '@/lib/records/pages';

export const metadata: Metadata = { title: 'Editar cliente · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function EditCustomerPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return (
    <RecordEditPage
      module={customerModule}
      service={customerService}
      id={id}
      action={updateCustomerAction}
    />
  );
}
