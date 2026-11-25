import type { Metadata } from 'next';

import { QuotesListPage } from '@/features/quotes/pages';

export const metadata: Metadata = { title: 'Presupuestos · Nexovantis' };
export const dynamic = 'force-dynamic';

export default function QuotesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  return <QuotesListPage searchParams={searchParams} />;
}
