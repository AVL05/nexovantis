import type { Metadata } from 'next';

import { InventoryListPage } from '@/features/inventory/pages';

export const metadata: Metadata = { title: 'Inventario · Nexovantis' };
export const dynamic = 'force-dynamic';

export default function InventoryPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  return <InventoryListPage searchParams={searchParams} />;
}
