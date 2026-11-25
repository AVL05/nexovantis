import type { Metadata } from 'next';

import { QuoteDetailPage } from '@/features/quotes/pages';

export const metadata: Metadata = { title: 'Presupuesto · Nexovantis' };
export const dynamic = 'force-dynamic';

export default async function QuotePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { id } = await params;
  return <QuoteDetailPage id={id} searchParams={searchParams} />;
}
