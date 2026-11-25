import type { Metadata } from 'next';

import { InventoryNewPage } from '@/features/inventory/pages';

export const metadata: Metadata = { title: 'Nuevo artículo · Nexovantis' };
export const dynamic = 'force-dynamic';

export default function NewInventoryItemPage() {
  return <InventoryNewPage />;
}
