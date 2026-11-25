import type { Metadata } from 'next';

import { InventoryEditPage } from '@/features/inventory/pages';

export const metadata: Metadata = { title: 'Editar artículo · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function EditInventoryItemPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <InventoryEditPage id={id} />;
}
