import type { Metadata } from 'next';

import { createCustomerAction } from '@/features/customers/actions';
import { customerModule } from '@/features/customers/config';
import { RecordNewPage } from '@/lib/records/pages';

export const metadata: Metadata = { title: 'Nuevo cliente · Nexovantis' };
export const dynamic = 'force-dynamic';

export default function NewCustomerPage() {
  return <RecordNewPage module={customerModule} action={createCustomerAction} />;
}
