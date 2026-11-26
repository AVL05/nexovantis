import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { QuoteActionState } from '@/features/quotes/actions';
import { QuoteItems } from '@/features/quotes/ui/QuoteItems';

// TASK-014 / H-17: reabrir "Editar concepto" no muestra ni enfoca el fallo anterior.

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

const idle = async (): Promise<QuoteActionState> => ({ status: 'idle' });
const failure: QuoteActionState = {
  status: 'error',
  message: 'No se pudo guardar.',
  fieldErrors: { description: 'Dato no válido.' },
};

function setup() {
  let resolve!: () => void;
  const update = vi.fn(
    () =>
      new Promise<QuoteActionState>((done) => {
        resolve = () => done({ ...failure });
      }),
  );
  const view = render(
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
      updateAction={update}
      removeAction={idle}
    />,
  );
  const press = async (element: HTMLElement) => {
    await act(async () => {
      fireEvent.click(element);
    });
  };
  const open = () => press(screen.getByRole('button', { name: 'Editar concepto Material' }));
  const dialog = () => within(screen.getByRole('dialog'));
  const save = () => press(dialog().getByRole('button', { name: 'Guardar concepto' }));
  const fail = () => act(async () => resolve());
  const expectClean = () => {
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('No se pudo guardar.')).toBeNull();
    expect(dialog().getByLabelText('Concepto')).not.toHaveAttribute('aria-invalid');
  };
  return { ...view, press, open, dialog, save, fail, expectClean };
}

describe('H-17 reabrir editar concepto', () => {
  it('tras ver el fallo y volver, reabre limpio; un fallo nuevo se muestra', async () => {
    const { press, open, dialog, save, fail, expectClean } = setup();
    await open();
    await save();
    await fail();
    expect(dialog().getByRole('alert').parentElement).toHaveFocus();

    await press(dialog().getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('alert')).toBeNull();
    await open();
    expectClean();

    await save();
    await fail();
    expect(dialog().getByRole('alert')).toHaveTextContent('No se pudo guardar.');
  });

  it('cerrado durante el envío: el fallo se ve junto al botón y reabrir lo limpia', async () => {
    const { container, open, save, fail, expectClean } = setup();
    await open();
    await save();
    act(() => container.querySelector<HTMLDialogElement>('dialog[open]')!.close());
    await fail();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar.');
    expect(screen.getByRole('alert')).toHaveFocus();
    await open();
    expectClean();
  });
});
