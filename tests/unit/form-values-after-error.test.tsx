import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { InventoryForm } from '@/features/inventory/ui/InventoryForm';
import { QuoteForm } from '@/features/quotes/ui/QuoteForm';
import { QuoteItems } from '@/features/quotes/ui/QuoteItems';
import { OrderForm } from '@/features/work-orders/ui/OrderForm';
import type { FormState } from '@/lib/records/types';

// TASK-014: tras un envío fallido, el reseteo automático de React 19 devolvía los `<select>` a su
// valor inicial y el reintento enviaba un dato distinto del elegido (IVA, cliente, prioridad,
// técnico, unidad). Se comprueba lo mostrado y lo que se reenvía.

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

type Sent = Record<string, string>;

/** Imita la acción de servidor: registra lo enviado y, al fallar, devuelve esos valores. */
function serverAction() {
  const sent: Sent[] = [];
  const result = { status: 'error' as 'error' | 'success' };
  const action = async (_prev: unknown, data: FormData) => {
    const values = Object.fromEntries(data) as Sent;
    sent.push(values);
    return result.status === 'error'
      ? { status: 'error' as const, message: 'No se pudo guardar.', values }
      : { status: 'success' as const, message: 'Guardado.' };
  };
  return { action, sent, result };
}

type Action = (prev: FormState, data: FormData) => Promise<FormState>;

const people = [
  { id: 'p1', name: 'Primera persona' },
  { id: 'p2', name: 'Segunda persona' },
];

type Case = {
  name: string;
  submit: string;
  /** Etiqueta del selector y valor elegido, distinto del inicial. */
  selects: [label: string, field: string, value: string][];
  texts: [label: string, value: string][];
  show: (action: Action) => void;
};

const common = { submitLabel: 'Guardar', cancelHref: '/' };
const quoteItems = (action: Action) => (
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
    addAction={action as never}
    updateAction={action as never}
    removeAction={action as never}
  />
);

const cases: Case[] = [
  {
    name: 'OrderForm (alta): cliente, prioridad y técnico',
    submit: 'Guardar',
    selects: [
      ['Cliente', 'customer_id', 'p2'],
      ['Prioridad', 'priority', 'urgent'],
      ['Técnico (opcional)', 'technician_id', 'p2'],
    ],
    texts: [['Título', 'Revisión']],
    show: (action) =>
      void render(
        <OrderForm
          {...common}
          action={action}
          initial={{ scheduled_date: '2026-12-01', priority: 'normal' }}
          requestId="r1"
          customers={people}
          technicians={people}
        />,
      ),
  },
  {
    name: 'OrderForm (edición): prioridad',
    submit: 'Guardar',
    selects: [['Prioridad', 'priority', 'urgent']],
    texts: [['Título', 'Otro']],
    show: (action) =>
      void render(
        <OrderForm
          {...common}
          action={action}
          orderId="o1"
          initial={{ title: 'T', priority: 'high', scheduled_date: '2026-12-01' }}
        />,
      ),
  },
  {
    name: 'QuoteForm (alta): cliente',
    submit: 'Guardar',
    selects: [['Cliente', 'customer_id', 'p2']],
    texts: [['Título', 'Reforma']],
    show: (action) =>
      void render(
        <QuoteForm {...common} action={action} initial={{}} requestId="r1" customers={people} />,
      ),
  },
  {
    name: 'QuoteForm (edición): cliente',
    submit: 'Guardar',
    selects: [['Cliente', 'customer_id', 'p2']],
    texts: [['Título', 'Otro']],
    show: (action) =>
      void render(
        <QuoteForm
          {...common}
          action={action}
          quoteId="q1"
          initial={{ customer_id: 'p1', title: 'T' }}
          customers={people}
        />,
      ),
  },
  {
    name: 'InventoryForm (alta): unidad',
    submit: 'Guardar',
    selects: [['Unidad', 'unit', 'kg']],
    texts: [
      ['Referencia', 'REF-1'],
      ['Nombre', 'Tubo'],
    ],
    show: (action) =>
      void render(<InventoryForm {...common} action={action} initial={{}} requestId="r1" />),
  },
  {
    name: 'InventoryForm (edición): unidad',
    submit: 'Guardar',
    selects: [['Unidad', 'unit', 'kg']],
    texts: [['Nombre', 'Otro']],
    show: (action) =>
      void render(
        <InventoryForm
          {...common}
          action={action}
          itemId="i1"
          reference="REF-1"
          initial={{ name: 'Tubo', unit: 'm' }}
        />,
      ),
  },
  {
    name: 'Añadir concepto: IVA',
    submit: 'Añadir concepto',
    selects: [['IVA', 'tax_rate_bp', '0']],
    texts: [
      ['Concepto', 'Mano de obra'],
      ['Precio unitario (€, sin IVA)', '3'],
    ],
    show: (action) => void render(quoteItems(action)),
  },
  {
    name: 'Editar concepto: IVA',
    submit: 'Guardar concepto',
    selects: [['IVA', 'tax_rate_bp', '0']],
    texts: [['Concepto', 'Cambiado']],
    show: (action) => {
      render(quoteItems(action));
      fireEvent.click(screen.getByRole('button', { name: 'Editar concepto Material' }));
    },
  },
];

describe.each(cases)('$name', ({ name, submit, selects, texts, show }) => {
  const scope = () =>
    within(name.startsWith('Editar') ? screen.getByRole('dialog') : document.body);
  // En el detalle del presupuesto conviven el alta y el diálogo: se acota al formulario activo.
  const form = () =>
    name.startsWith('Añadir')
      ? within(screen.getByRole('form', { name: 'Añadir concepto' }))
      : scope();
  const press = async () => {
    await act(async () => {
      fireEvent.click(form().getByRole('button', { name: submit }));
    });
  };

  it('conserva lo elegido tras fallar y lo reenvía igual', async () => {
    const { action, sent } = serverAction();
    show(action as never);
    for (const [label, , value] of selects) {
      fireEvent.change(form().getByLabelText(label), { target: { value } });
    }
    for (const [label, value] of texts) {
      fireEvent.change(form().getByLabelText(label), { target: { value } });
    }
    // El `action` del formulario se mantiene (envío sin JavaScript).
    const element = form().getByRole('button', { name: submit }) as HTMLButtonElement;
    expect(element.form).toHaveAttribute('action');

    for (const attempt of [1, 2]) {
      await press();
      expect(sent).toHaveLength(attempt);
      for (const [label, field, value] of selects) {
        expect(sent[attempt - 1][field], `envío ${attempt}: ${field}`).toBe(value);
        expect(form().getByLabelText(label), `tras fallo ${attempt}`).toHaveValue(value);
      }
      for (const [label, value] of texts) {
        expect(form().getByLabelText(label)).toHaveValue(value);
      }
    }
  });
});

describe('éxito en los conceptos: como hasta ahora', () => {
  it('añadir limpia el formulario y editar cierra el diálogo', async () => {
    const { action, result } = serverAction();
    result.status = 'success';
    render(quoteItems(action as never));
    const add = within(screen.getByRole('form', { name: 'Añadir concepto' }));
    fireEvent.change(add.getByLabelText('Concepto'), { target: { value: 'Mano de obra' } });
    fireEvent.change(add.getByLabelText('Precio unitario (€, sin IVA)'), {
      target: { value: '3' },
    });
    fireEvent.change(add.getByLabelText('IVA'), { target: { value: '0' } });
    await act(async () => {
      fireEvent.click(add.getByRole('button', { name: 'Añadir concepto' }));
    });
    expect(add.getByLabelText('Concepto')).toHaveValue('');
    expect(add.getByLabelText('Cantidad')).toHaveValue('1');
    expect(add.getByLabelText('Precio unitario (€, sin IVA)')).toHaveValue('');
    expect(add.getByLabelText('IVA')).toHaveValue('2100');

    fireEvent.click(screen.getByRole('button', { name: 'Editar concepto Material' }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar concepto' }),
      );
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
