import type { Metadata } from 'next';

import { OrderDetailPage } from '@/features/work-orders/pages';

export const metadata: Metadata = { title: 'Orden · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function OrderPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { id } = await params;
  return <OrderDetailPage id={id} searchParams={searchParams} />;
}
