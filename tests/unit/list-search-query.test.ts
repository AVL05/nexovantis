// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

// TASK-014 / C7: construcción real (postgrest-js) de la consulta de los listados al buscar. La
// búsqueda por nombre de cliente va en la propia consulta (embed vacío + OR sobre el embed), sin
// lista previa de UUID ni tope de clientes. La resolución efectiva en PostgREST se comprueba en CI
// (tests/e2e-supabase/search.spec.ts): aquí no hay red.

vi.mock('server-only', () => ({}));

import { parseQuoteListParams } from '@/features/quotes/params';
import { quoteService } from '@/features/quotes/service';
import { parseOrderListParams } from '@/features/work-orders/params';
import { workOrderService } from '@/features/work-orders/service';

const ORG = '11111111-1111-4111-8111-111111111111';

function recordingContext() {
  const requests: { method: string; url: URL }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const method = init?.method ?? 'GET';
    requests.push({ method, url: new URL(String(input)) });
    return new Response(method === 'HEAD' ? null : '[]', {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-range': '0-0/45' },
    });
  };
  const supabase = createClient('http://127.0.0.1:1', 'clave-ficticia', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetcher },
  });
  return { ctx: { supabase, organizationId: ORG, userId: 'u1' } as never, requests };
}

const lists = [
  {
    table: 'work_orders',
    run: (ctx: never, raw: Record<string, string>) =>
      workOrderService.list(ctx, parseOrderListParams(raw)),
  },
  {
    table: 'quotes',
    run: (ctx: never, raw: Record<string, string>) =>
      quoteService.list(ctx, parseQuoteListParams(raw)),
  },
] as const;

describe.each(lists)('búsqueda en $table', ({ table, run }) => {
  it('filtra por cliente embebido en el recuento y en la página, sin consultar customers', async () => {
    const { ctx, requests } = recordingContext();
    const result = await run(ctx, { q: 'García', pagina: '2' });
    expect(result.ok && result.data).toMatchObject({ total: 45, page: 2, pageCount: 3 });

    expect(requests.map((r) => r.method)).toEqual(['HEAD', 'GET']);
    for (const { url } of requests) {
      expect(url.pathname).toBe(`/rest/v1/${table}`);
      const search = url.searchParams;
      expect(search.get('organization_id')).toBe(`eq.${ORG}`);
      expect(search.get('search_customer.organization_id')).toBe(`eq.${ORG}`);
      expect(search.get('search_customer.name')).toBe('ilike.%García%');
      expect(search.get('or')).toBe(
        '(title.ilike."%García%",description.ilike."%García%",search_customer.not.is.null)',
      );
      expect(url.search).not.toContain('customer_id');
    }
    expect(requests[0].url.searchParams.get('select')).toBe('id,search_customer:customers()');
    expect(requests[1].url.searchParams.get('select')).toBe('*,search_customer:customers()');
    expect(requests[1].url.searchParams.get('offset')).toBe('20');
    expect(requests[1].url.searchParams.get('limit')).toBe('20');
  });

  it('escapa los comodines y no permite añadir condiciones', async () => {
    const { ctx, requests } = recordingContext();
    await run(ctx, { q: '50%_a"),organization_id.neq.0,(b' });
    const search = requests[0].url.searchParams;
    // Filtro simple: literal con comodines escapados, sin comillas.
    expect(search.get('search_customer.name')).toBe(
      'ilike.%50\\%\\_a"),organization\\_id.neq.0,(b%',
    );
    // Filtro lógico: el término sigue entrecomillado y las condiciones son las previstas.
    const or = search.get('or') as string;
    expect(or.replace(/"(\\.|[^"\\])*"/g, '""')).toBe(
      '(title.ilike."",description.ilike."",search_customer.not.is.null)',
    );
    expect(search.getAll('organization_id')).toEqual([`eq.${ORG}`]);
  });

  it('sin término no pide el embed ni añade filtros de texto', async () => {
    const { ctx, requests } = recordingContext();
    await run(ctx, { q: '   ' });
    expect(requests.map((r) => r.url.searchParams.get('select'))).toEqual(['id', '*']);
    for (const { url } of requests) {
      expect(url.searchParams.has('or')).toBe(false);
      expect(url.searchParams.has('search_customer.name')).toBe(false);
    }
  });
});

describe('búsqueda de presupuestos por número', () => {
  it('combina número, texto y cliente en el mismo OR junto a los filtros', async () => {
    const { ctx, requests } = recordingContext();
    await quoteService.list(ctx, parseQuoteListParams({ q: 'PRE-0012', estado: 'draft' }));
    for (const { url } of requests) {
      expect(url.searchParams.get('or')).toMatch(
        /,search_customer\.not\.is\.null,number\.eq\.12\)$/,
      );
      expect(url.searchParams.get('status')).toBe('eq.draft');
    }
  });
});
