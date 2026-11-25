import 'server-only';

import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { requireTenant } from '@/lib/records/tenant';

import { buildActivityHref, isInvertedRange, parseActivityParams } from './params';
import { listActivity } from './service';
import { ActivityFilters } from './ui/ActivityFilters';
import { ActivityList } from './ui/ActivityList';

// Página de actividad (Server Component), de solo lectura y para ambos roles. La ruta de src/app es un
// envoltorio de una línea. Los detalles internos de un fallo no llegan a la interfaz: error.tsx muestra
// un mensaje genérico con reintento.

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function ActivityPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  const params = parseActivityParams(await searchParams);
  const ctx = await requireTenant();
  const inverted = isInvertedRange(params);
  const result = inverted
    ? { ok: true as const, data: { items: [], total: 0, page: 1, pageCount: 1 } }
    : await listActivity(ctx, params);
  if (!result.ok) throw new Error('No se pudo cargar la actividad.');
  const { items, total, page, pageCount } = result.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Actividad"
        description="Registro de solo lectura de lo que ocurre en tu organización: quién hizo qué y cuándo."
      />
      <ActivityFilters params={params} />
      <ActivityList items={items} params={params} skipped={inverted} />
      {total > 0 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          noun="eventos"
          hrefFor={(target) => buildActivityHref('/activity', { ...params, page: target })}
        />
      ) : null}
    </div>
  );
}
