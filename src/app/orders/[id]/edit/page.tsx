import type { Metadata } from 'next';

import { OrderEditPage } from '@/features/work-orders/pages';

export const metadata: Metadata = { title: 'Editar orden · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function EditOrderPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <OrderEditPage id={id} />;
}
