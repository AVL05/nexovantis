import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { QuoteItemView, QuoteView } from '@/features/quotes/service';
import { QuotePrintView } from '@/features/quotes/ui/QuotePrintView';

const quote: QuoteView = {
  id: 'pressure-quote',
  number: 1,
  title: 'Sustitución de bomba',
  description: null,
  status: 'draft',
  customerId: 'demo-customer',
  customerName: 'Comunidad Robledal',
  customerArchived: false,
  orderId: null,
  subtotalCents: 10000,
  taxCents: 2100,
  totalCents: 12100,
  decidedAt: null,
  createdAt: '2026-11-26T10:00:00Z',
  updatedAt: '2026-11-26T10:00:00Z',
};

const item: QuoteItemView = {
  id: 'demo-item',
  position: 1,
  description: 'Mano de obra',
  quantity: '2',
  unitPriceCents: 5000,
  taxRateBp: 2100,
  subtotalCents: 10000,
  taxCents: 2100,
};

describe('versión imprimible de presupuesto', () => {
  afterEach(cleanup);

  it('muestra el cliente y los conceptos cuando cuadran con el presupuesto', () => {
    render(<QuotePrintView quote={quote} items={[item]} organizationName="Demo Norte" />);

    expect(screen.getByRole('heading', { name: quote.title })).toBeVisible();
    expect(screen.getByRole('table', { name: 'Conceptos del presupuesto' })).toBeVisible();
    expect(screen.getByText(quote.customerName)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Imprimir o guardar PDF' })).toBeVisible();
  });

  it('evita imprimir cuando los conceptos y los totales se han leído en estados distintos', () => {
    render(
      <QuotePrintView
        quote={quote}
        items={[{ ...item, subtotalCents: 5000, taxCents: 1050 }]}
        organizationName="Demo Norte"
      />,
    );

    expect(screen.getByText(/no se pudo preparar el presupuesto completo/i)).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Imprimir o guardar PDF' }),
    ).not.toBeInTheDocument();
  });
});
