import type { Metadata } from 'next';

import { OrdersListPage } from '@/features/work-orders/pages';

export const metadata: Metadata = { title: 'Órdenes · Nexovantis' };
export const dynamic = 'force-dynamic';

export default function OrdersPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  return <OrdersListPage searchParams={searchParams} />;
}
