import type { Metadata } from 'next';

import { OrderNewPage } from '@/features/work-orders/pages';

export const metadata: Metadata = { title: 'Nueva orden · Nexovantis' };
export const dynamic = 'force-dynamic';

export default function NewOrderPage() {
  return <OrderNewPage />;
}
