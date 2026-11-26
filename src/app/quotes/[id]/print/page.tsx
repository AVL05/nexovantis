import type { Metadata } from 'next';

import { QuotePrintPage } from '@/features/quotes/pages';

export const metadata: Metadata = { title: 'Imprimir presupuesto · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function PrintPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <QuotePrintPage id={id} />;
}
