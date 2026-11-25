import type { Metadata } from 'next';

import { QuoteNewPage } from '@/features/quotes/pages';

export const metadata: Metadata = { title: 'Nuevo presupuesto · Nexovantis' };
export const dynamic = 'force-dynamic';

export default function NewQuotePage() {
  return <QuoteNewPage />;
}
