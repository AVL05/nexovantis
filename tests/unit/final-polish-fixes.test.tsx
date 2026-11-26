import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { MovementActionState } from '@/features/inventory/actions';
import { MovementForm } from '@/features/inventory/ui/MovementForm';
import type { QuoteActionState } from '@/features/quotes/actions';
import { QuoteActions } from '@/features/quotes/ui/QuoteActions';
import { QuoteItems } from '@/features/quotes/ui/QuoteItems';
import type { OrderActionState } from '@/features/work-orders/actions';
import { OrderActions } from '@/features/work-orders/ui/OrderActions';

// TASK-014, correcciones tras Testing POST: H-03 (foco), H-04 (confirmación) y H-06 (valores).

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

/** Acción controlada: cada llamada queda pendiente hasta `settle`. */
function deferred<S>() {
  let resolve!: (state: S) => void;
  const action = vi.fn<(prev: S, data: FormData) => Promise<S>>(
    () =>
      new Promise<S>((done) => {
        resolve = done;
      }),
  );
  return { action, settle: (state: S) => act(async () => resolve(state)) };
}

const press = async (element: HTMLElement) => {
  await act(async () => {
    fireEvent.click(element);
  });
};

describe('H-04 quitar concepto', () => {
  const idle = async (): Promise<QuoteActionState> => ({ status: 'idle' });
  const item = {
    id: 'it1',
    position: 1,
    description: 'Material',
    quantity: '1',
    unitPriceCents: 100,
    taxRateBp: 2100,
    subtotalCents: 100,
    taxCents: 21,
  };
  const view = (
    removeAction: (prev: QuoteActionState, data: FormData) => Promise<QuoteActionState>,
    items = [item],
  ) => (
    <QuoteItems
      quoteId="q1"
      editable
      requestId="r1"
      items={items}
      addAction={idle}
      updateAction={idle}
      removeAction={removeAction}
    />
  );
  const trigger = () => screen.getByRole('button', { name: 'Quitar concepto Material' });
  const confirm = () =>
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar concepto' });

  it('pide confirmación, no duplica el envío y muestra el fallo dentro con foco', async () => {
    const { action, settle } = deferred<QuoteActionState>();
    render(view(action));
    await press(trigger());
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('Material');

    await press(confirm());
    expect(confirm()).toBeDisabled();
    await press(confirm());
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][1].get('id')).toBe('it1');
    expect(action.mock.calls[0][1].get('quote_id')).toBe('q1');

    await settle({ status: 'error', message: 'No se pudo quitar.' });
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(screen.getByRole('dialog')).toContainElement(alerts[0]);
    expect(alerts[0].parentElement).toHaveFocus();

    await press(within(screen.getByRole('dialog')).getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('alert')).toBeNull();
    await press(trigger());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cerrado durante el envío: el fallo aparece junto al botón', async () => {
    const { action, settle } = deferred<QuoteActionState>();
    const { container } = render(view(action));
    await press(trigger());
    await press(confirm());
    act(() => container.querySelector<HTMLDialogElement>('dialog[open]')!.close());
    await settle({ status: 'error', message: 'No se pudo quitar.' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('alert')).toHaveFocus();
  });

  it('éxito: cierra, anuncia y deja el foco en el título al desaparecer la fila', async () => {
    const { action, settle } = deferred<QuoteActionState>();
    const { rerender } = render(view(action));
    await press(trigger());
    await press(confirm());
    await settle({ status: 'success', message: 'Concepto eliminado.' });
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(view(action, []));
    expect(screen.getByRole('heading', { name: 'Conceptos' })).toHaveFocus();
    expect(screen.getByText('Concepto eliminado.')).toBeInTheDocument();
  });
});

describe('H-03 foco tras las acciones', () => {
  const idle = async (): Promise<OrderActionState> => ({ status: 'idle' });
  const technicians = [{ id: 't1', name: 'Marta Soler' }];
  type OrderAction = (prev: OrderActionState, data: FormData) => Promise<OrderActionState>;
  const order = (assignAction: OrderAction, advanceAction: OrderAction = idle) => (
    <OrderActions
      orderId="o1"
      status="assigned"
      technicianId={null}
      technicians={technicians}
      assignAction={assignAction}
      advanceAction={advanceAction}
      cancelAction={idle}
    />
  );
  const choose = () =>
    fireEvent.change(screen.getByLabelText('Reasignar a'), { target: { value: 't1' } });

  it('reasignar con fallo: foco en el error y técnico conservado; con éxito: título y limpio', async () => {
    const { action, settle } = deferred<OrderActionState>();
    render(order(action));
    choose();
    await press(screen.getByRole('button', { name: 'Reasignar' }));
    expect(action.mock.calls[0][1].get('technician_id')).toBe('t1');
    await settle({ status: 'error', message: 'No se pudo asignar.' });
    expect(screen.getByRole('alert').parentElement).toHaveFocus();
    expect(screen.getByLabelText('Reasignar a')).toHaveValue('t1');

    (document.activeElement as HTMLElement).blur();
    await press(screen.getByRole('button', { name: 'Reasignar' }));
    await settle({ status: 'success', message: 'Técnico asignado.' });
    expect(screen.getByRole('heading', { name: 'Acciones' })).toHaveFocus();
    expect(screen.getByLabelText('Reasignar a')).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('iniciar: foco en el título, y el fallo posterior reciente sustituye al anterior', async () => {
    const { action, settle } = deferred<OrderActionState>();
    render(order(async () => ({ status: 'error', message: 'Fallo antiguo.' }), action));
    choose();
    await press(screen.getByRole('button', { name: 'Reasignar' }));
    (document.activeElement as HTMLElement).blur();
    await press(screen.getByRole('button', { name: 'Iniciar orden' }));
    await settle({ status: 'success', message: 'Orden iniciada.' });
    expect(screen.getByRole('heading', { name: 'Acciones' })).toHaveFocus();
    expect(screen.queryByText('Fallo antiguo.')).toBeNull();
  });

  it.each([
    ['Aceptar presupuesto', 'Aceptar y crear orden'],
    ['Rechazar presupuesto', 'Rechazar presupuesto'],
  ])('%s con fallo: foco en el mensaje', async (openName, confirmName) => {
    const { action, settle } = deferred<QuoteActionState>();
    render(
      <QuoteActions
        quoteId="q1"
        status="draft"
        totalCents={100}
        itemCount={1}
        acceptAction={action}
        rejectAction={action}
      />,
    );
    await press(screen.getByRole('button', { name: openName }));
    await press(within(screen.getByRole('dialog')).getByRole('button', { name: confirmName }));
    await settle({ status: 'error', message: 'No se pudo decidir.' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('alert').parentElement).toHaveFocus();
  });
});

describe('H-06 registrar movimiento', () => {
  it('conserva todos los valores si falla y limpia solo con éxito', async () => {
    const { action, settle } = deferred<MovementActionState>();
    render(
      <MovementForm
        itemId="i1"
        unit="m"
        requestId="r1"
        orders={[{ id: 'o1', title: 'Obra', status: 'pending', scheduledDate: '2026-12-01' }]}
        action={action}
      />,
    );
    const kind = () => screen.getByLabelText('Tipo de movimiento');
    const quantity = () => screen.getByLabelText('Cantidad (m)');
    const note = () => screen.getByLabelText('Nota (opcional)');
    const orderField = () => screen.getByLabelText('Orden de servicio');
    fireEvent.change(kind(), { target: { value: 'consumption' } });
    fireEvent.change(quantity(), { target: { value: '5' } });
    fireEvent.change(orderField(), { target: { value: 'o1' } });
    fireEvent.change(note(), { target: { value: 'Tramo norte' } });
    const submit = () => screen.getByRole('button', { name: /Registrar movimiento|Registrando/ });

    await press(submit());
    expect(Object.fromEntries(action.mock.calls[0][1])).toMatchObject({
      kind: 'consumption',
      quantity: '5',
      order_id: 'o1',
      note: 'Tramo norte',
      item_id: 'i1',
      request_id: 'r1',
    });
    await settle({ status: 'error', message: 'No hay existencias suficientes.' });
    expect(kind()).toHaveValue('consumption');
    expect(quantity()).toHaveValue(5);
    expect(orderField()).toHaveValue('o1');
    expect(note()).toHaveValue('Tramo norte');

    await press(submit());
    await settle({ status: 'success', message: 'Movimiento registrado.' });
    expect(kind()).toHaveValue('in');
    expect(quantity()).toHaveValue(null);
    expect(note()).toHaveValue('');
  });
});

describe('H-03 foco tras registrar un movimiento y añadir un concepto', () => {
  const idle = async (): Promise<QuoteActionState> => ({ status: 'idle' });
  type Result = { status: 'success' | 'error'; message: string };
  const forms = [
    {
      name: 'Registrar movimiento',
      other: 'Nota (opcional)',
      fill: () =>
        fireEvent.change(screen.getByLabelText('Cantidad (m)'), { target: { value: '1' } }),
      show: (action: (prev: Result, data: FormData) => Promise<Result>) =>
        render(
          <MovementForm itemId="i1" unit="m" requestId="r1" orders={[]} action={action as never} />,
        ),
    },
    {
      name: 'Añadir concepto',
      other: 'Concepto',
      fill: () => {
        fireEvent.change(screen.getByLabelText('Concepto'), { target: { value: 'Mano de obra' } });
        fireEvent.change(screen.getByLabelText('Precio unitario (€, sin IVA)'), {
          target: { value: '1' },
        });
      },
      show: (action: (prev: Result, data: FormData) => Promise<Result>) =>
        render(
          <QuoteItems
            quoteId="q1"
            editable
            requestId="r1"
            items={[]}
            addAction={action as never}
            updateAction={idle}
            removeAction={idle}
          />,
        ),
    },
  ];

  describe.each(forms)('$name', ({ name, other, fill, show }) => {
    const send = async () => {
      fill();
      await press(screen.getByRole('button', { name }));
    };

    it('error: foco en el mensaje; éxito: foco en el título', async () => {
      const { action, settle } = deferred<Result>();
      show(action);
      await send();
      await settle({ status: 'error', message: 'No se pudo guardar.' });
      expect(screen.getByRole('alert').parentElement).toHaveFocus();

      (document.activeElement as HTMLElement).blur();
      await send();
      await settle({ status: 'success', message: 'Guardado.' });
      expect(screen.getByRole('heading', { name })).toHaveFocus();
    });

    it.each(['success', 'error'] as const)(
      '%s: no roba el foco si el usuario ya se ha movido',
      async (status) => {
        const { action, settle } = deferred<Result>();
        show(action);
        await send();
        const field = screen.getByLabelText(other);
        field.focus();
        await settle({ status, message: 'Resultado.' });
        expect(field).toHaveFocus();
      },
    );
  });
});
