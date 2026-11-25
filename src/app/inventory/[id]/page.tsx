import type { Metadata } from 'next';

import { InventoryDetailPage } from '@/features/inventory/pages';

export const metadata: Metadata = { title: 'Artículo · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function InventoryItemPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { id } = await params;
  return <InventoryDetailPage id={id} searchParams={searchParams} />;
}
