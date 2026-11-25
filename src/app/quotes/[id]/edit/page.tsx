import type { Metadata } from 'next';

import { QuoteEditPage } from '@/features/quotes/pages';

export const metadata: Metadata = { title: 'Editar presupuesto · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function EditQuotePage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <QuoteEditPage id={id} />;
}
