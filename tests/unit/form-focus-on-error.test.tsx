import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { RecordForm } from '@/components/ui/records/RecordForm';
import { customerModule } from '@/features/customers/config';
import { InventoryForm } from '@/features/inventory/ui/InventoryForm';
import { QuoteForm } from '@/features/quotes/ui/QuoteForm';
import { QuoteItems } from '@/features/quotes/ui/QuoteItems';
import { OrderForm } from '@/features/work-orders/ui/OrderForm';

// TASK-014 / H-13: tras un fallo al guardar, el foco no se queda en <body> y tampoco se roba.

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(cleanup);

type Failure = {
  status: 'error';
  message: string;
  fieldErrors?: Record<string, string>;
  values: Record<string, string>;
};

function deferred() {
  let resolve!: () => void;
  let fieldErrors: Record<string, string> | undefined;
  const action = vi.fn(
    (_prev: unknown, data: FormData) =>
      new Promise<Failure>((done) => {
        const values = Object.fromEntries(data) as Record<string, string>;
        resolve = () =>
          done({ status: 'error', message: 'No se pudo guardar.', fieldErrors, values });
      }),
  );
  return {
    action: action as never,
    calls: action,
    fail: async (errors?: Record<string, string>) => {
      fieldErrors = errors;
      await act(async () => resolve());
    },
  };
}

const people = [{ id: 'p1', name: 'Persona' }];
const common = { submitLabel: 'Guardar', cancelHref: '/' };
const idle = async () => ({ status: 'idle' as const });

type Case = {
  name: string;
  submit: string;
  /** Campo de texto al que el usuario puede moverse y con error por campo. */
  field: [label: string, name: string];
  show: (action: never) => void;
};

const cases: Case[] = [
  {
    name: 'orden',
    submit: 'Guardar',
    field: ['Título', 'title'],
    show: (action) =>
      void render(
        <OrderForm
          {...common}
          action={action}
          orderId="o1"
          initial={{ title: 'T', scheduled_date: '2026-12-01' }}
        />,
      ),
  },
  {
    name: 'presupuesto',
    submit: 'Guardar',
    field: ['Título', 'title'],
    show: (action) =>
      void render(
        <QuoteForm
          {...common}
          action={action}
          initial={{ customer_id: 'p1', title: 'T' }}
          customers={people}
        />,
      ),
  },
  {
    name: 'artículo',
    submit: 'Guardar',
    field: ['Nombre', 'name'],
    show: (action) =>
      void render(
        <InventoryForm {...common} action={action} initial={{ reference: 'R', name: 'N' }} />,
      ),
  },
  {
    name: 'cliente o técnico (RecordForm)',
    submit: 'Guardar',
    field: ['Nombre', 'name'],
    show: (action) =>
      void render(
        <RecordForm {...common} module={customerModule} action={action} initial={{ name: 'N' }} />,
      ),
  },
  {
    name: 'editar concepto (diálogo)',
    submit: 'Guardar concepto',
    field: ['Concepto', 'description'],
    show: (action) => {
      render(
        <QuoteItems
          quoteId="q1"
          editable
          requestId="r1"
          items={[
            {
              id: 'it1',
              position: 1,
              description: 'Material',
              quantity: '1',
              unitPriceCents: 100,
              taxRateBp: 2100,
              subtotalCents: 100,
              taxCents: 21,
            },
          ]}
          addAction={idle}
          updateAction={action}
          removeAction={idle}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Editar concepto Material' }));
    },
  },
];

describe.each(cases)('fallo al guardar $name', ({ name, submit, field, show }) => {
  const inDialog = name.includes('diálogo');
  const scope = () => within(inDialog ? screen.getByRole('dialog') : document.body);
  const press = async () => {
    await act(async () => {
      fireEvent.click(scope().getByRole('button', { name: submit }));
    });
  };
  const message = () => scope().getByRole('alert');

  it('foco en el mensaje, también al repetir el fallo y con errores por campo', async () => {
    const { action, calls, fail } = deferred();
    show(action);
    await press();
    await fail();
    expect(message().parentElement).toHaveFocus();

    (document.activeElement as HTMLElement).blur();
    await press();
    expect(calls).toHaveBeenCalledTimes(2);
    await fail({ [field[1]]: 'Dato no válido.' });
    expect(message().parentElement).toHaveFocus();
    expect(scope().getByLabelText(field[0])).toHaveAttribute('aria-invalid', 'true');
    if (inDialog) expect(screen.getByRole('dialog')).toContainElement(message());
  });

  it('no roba el foco si el usuario está en otro control', async () => {
    const { action, fail } = deferred();
    show(action);
    await press();
    const input = scope().getByLabelText(field[0]);
    input.focus();
    await fail();
    expect(input).toHaveFocus();
  });
});
