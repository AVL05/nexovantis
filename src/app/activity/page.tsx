import type { Metadata } from 'next';

import { ActivityPage } from '@/features/activity/pages';

export const metadata: Metadata = { title: 'Actividad · Nexovantis' };
export const dynamic = 'force-dynamic';

export default function ActivityRoute({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  return <ActivityPage searchParams={searchParams} />;
}
