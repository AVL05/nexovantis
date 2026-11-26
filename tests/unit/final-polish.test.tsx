import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ArchiveControl } from '@/components/ui/records/ArchiveControl';
import { parseActivityParams } from '@/features/activity/params';
import type { RecentActivity } from '@/features/activity/service';
import { ActivityFilters } from '@/features/activity/ui/ActivityFilters';
import { INVENTORY_MODULE } from '@/features/inventory/config';
import { QuoteItems } from '@/features/quotes/ui/QuoteItems';
import type { OrderActionState } from '@/features/work-orders/actions';
import { parseOrderListParams } from '@/features/work-orders/params';
import { RecentActivityList } from '@/features/work-orders/ui/DashboardPanels';
import { OrderActions } from '@/features/work-orders/ui/OrderActions';
import { OrderFilters } from '@/features/work-orders/ui/OrderFilters';

// TASK-014 (pulido final): C3, C4, C5, C6 y C8.

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// jsdom no implementa <dialog>: apertura, cierre y evento `close` como en el navegador.
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

describe('C3 actividad reciente con inventario', () => {
  it.each([
    ['created', 'Artículo creado'],
    ['stock_in', 'Entrada de stock'],
    ['stock_out', 'Salida de stock'],
    ['stock_consumed', 'Consumo en orden'],
    ['archived', 'Artículo archivado'],
    ['restored', 'Artículo restaurado'],
  ] as const)('inventario %s: "%s" con enlace al artículo', (action, text) => {
    const item: RecentActivity = {
      id: 'e1',
      entityType: 'inventory_item',
      entityId: 'i1',
      entityLabel: 'Tubo de cobre',
      action,
      occurredAt: '2026-11-25T10:00:00Z',
      actor: 'self',
    };
    render(<RecentActivityList items={[item]} />);
    expect(screen.getByRole('listitem')).toHaveTextContent(`${text} · Tubo de cobre`);
    expect(screen.queryByText(/Orden creada/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Tubo de cobre' })).toHaveAttribute(
      'href',
      '/inventory/i1',
    );
  });
});

describe('C4 filtros plegables', () => {
  it('botón con aria-expanded/aria-controls, contador y campos siempre dentro del formulario', () => {
    render(
      <OrderFilters
        params={parseOrderListParams({ q: 'x', estado: 'assigned', desde: '2026-01-01' })}
        customers={[]}
        technicians={[]}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Filtros (2 activos)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('type', 'button');
    const panel = document.getElementById(toggle.getAttribute('aria-controls') as string)!;
    expect(panel).toHaveClass('max-md:hidden', 'max-md:noscript:grid', 'md:contents');
    expect(within(panel).getByLabelText('Estado')).toBeInTheDocument();
    // La búsqueda queda fuera del panel y los campos plegados se envían igual.
    expect(panel).not.toContainElement(screen.getByRole('searchbox'));
    const data = new FormData(screen.getByRole('search') as HTMLFormElement);
    expect(data.get('estado')).toBe('assigned');
    expect(data.get('desde')).toBe('2026-01-01');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveClass('max-md:hidden');
  });

  it('con un rango incoherente nace abierto', () => {
    render(
      <ActivityFilters
        params={parseActivityParams({ desde: '2026-03-02', hasta: '2026-03-01' })}
      />,
    );
    expect(screen.getByRole('button', { name: /^Filtros/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('al cambiar los filtros por enlace los campos se reinician', () => {
    const view = (raw: Record<string, string>) => (
      <OrderFilters params={parseOrderListParams(raw)} customers={[]} technicians={[]} />
    );
    const { rerender } = render(view({ estado: 'assigned' }));
    rerender(view({}));
    expect(screen.getByLabelText('Estado')).toHaveValue('');
  });
});

describe('C5 conceptos de presupuesto', () => {
  it('conserva cabeceras, cifras y acciones, con la descripción en su propia celda', () => {
    const idle = async () => ({ status: 'idle' as const });
    render(
      <QuoteItems
        quoteId="q1"
        editable
        requestId="r1"
        addAction={idle}
        updateAction={idle}
        removeAction={idle}
        items={[
          {
            id: 'it1',
            position: 1,
            description: 'Mano de obra',
            quantity: '2',
            unitPriceCents: 1250,
            taxRateBp: 2100,
            subtotalCents: 2500,
            taxCents: 525,
          },
        ]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Conceptos del presupuesto' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(7);
    expect(within(table).getByRole('cell', { name: 'Mano de obra' })).toBeInTheDocument();
    expect(table).toHaveTextContent(/12,50.*21.*25,00.*5,25/);
    expect(
      within(table).getByRole('button', { name: 'Editar concepto Mano de obra' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('button', { name: 'Quitar concepto Mano de obra' }),
    ).toBeInTheDocument();
  });
});

describe('C6 archivar', () => {
  it('disparador discreto y ajustado; el rojo sólido queda en la confirmación', () => {
    const idle = async () => ({ status: 'idle' as const });
    render(
      <ArchiveControl
        module={INVENTORY_MODULE}
        recordId="i1"
        recordName="Tubo"
        archived={false}
        archiveAction={idle}
        restoreAction={idle}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Archivar artículo' });
    expect(trigger).toHaveClass('self-start', 'h-10', 'text-danger');
    expect(trigger).not.toHaveClass('bg-danger');
    fireEvent.click(trigger);
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Archivar' }),
    ).toHaveClass('bg-danger');
  });
});

describe('C8 cancelación de una orden', () => {
  const idle = async (): Promise<OrderActionState> => ({ status: 'idle' });
  const failure: OrderActionState = { status: 'error', message: 'La orden ya estaba cancelada.' };

  function deferred() {
    let resolve!: (state: OrderActionState) => void;
    const action = vi.fn<(prev: OrderActionState, data: FormData) => Promise<OrderActionState>>(
      () =>
        new Promise<OrderActionState>((done) => {
          resolve = done;
        }),
    );
    return { action, settle: (state: OrderActionState) => act(async () => resolve(state)) };
  }

  const view = (
    cancelAction: (prev: OrderActionState, data: FormData) => Promise<OrderActionState>,
    status: 'pending' | 'cancelled' = 'pending',
  ) => (
    <OrderActions
      orderId="o1"
      status={status}
      technicianId={null}
      technicians={[]}
      assignAction={idle}
      advanceAction={idle}
      cancelAction={cancelAction}
    />
  );

  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Cancelar orden' }));
  const submit = async () => {
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Motivo (opcional)'), {
      target: { value: 'Cliente ausente' },
    });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar orden' }));
    });
  };

  it('fallo: diálogo abierto, un único error dentro con foco y motivo conservado', async () => {
    const { action, settle } = deferred();
    render(view(action));
    open();
    await submit();
    expect(action.mock.calls[0][1].get('reason')).toBe('Cliente ausente');
    await settle(failure);

    const dialog = screen.getByRole('dialog');
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(dialog).toContainElement(alerts[0]);
    expect(alerts[0]).toHaveTextContent('La orden ya estaba cancelada.');
    expect(alerts[0].parentElement).toHaveFocus();
    expect(within(dialog).getByLabelText('Motivo (opcional)')).toHaveValue('Cliente ausente');

    // Cerrar y reabrir limpia el error y mantiene el motivo.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('alert')).toBeNull();
    open();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Motivo (opcional)')).toHaveValue('Cliente ausente');

    // Un segundo fallo idéntico vuelve a anunciarse.
    await submit();
    await settle(failure);
    expect(screen.getByRole('dialog')).toContainElement(screen.getByRole('alert'));
  });

  it('cerrado durante el envío: el fallo se ve en la página', async () => {
    const { action, settle } = deferred();
    const { container } = render(view(action));
    open();
    await submit();
    // Escape: el navegador cierra el diálogo y emite `close`.
    act(() => container.querySelector('dialog')!.close());
    await settle(failure);
    expect(screen.queryByRole('dialog')).toBeNull();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('La orden ya estaba cancelada.');
    expect(container.querySelector('dialog')).not.toContainElement(alert);
  });

  it('anuncia el último éxito aunque haya otro anterior en la misma sesión', async () => {
    const assigned = async (): Promise<OrderActionState> => ({
      status: 'success',
      message: 'Técnico asignado.',
    });
    const cancel = async (): Promise<OrderActionState> => ({
      status: 'success',
      message: 'Orden cancelada.',
    });
    const actions = (status: 'pending' | 'cancelled') => (
      <OrderActions
        orderId="o1"
        status={status}
        technicianId={null}
        technicians={[{ id: 't1', name: 'Marta Soler' }]}
        assignAction={assigned}
        advanceAction={idle}
        cancelAction={cancel}
      />
    );
    const { rerender } = render(actions('pending'));
    fireEvent.change(screen.getByLabelText('Asignar técnico'), { target: { value: 't1' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Asignar' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Técnico asignado.');
    open();
    await submit();
    rerender(actions('cancelled'));
    expect(screen.getByText('Orden cancelada.')).toBeInTheDocument();
    expect(screen.queryByText('Técnico asignado.')).toBeNull();
  });

  it('H-18: un fallo de cancelación antiguo no tapa el resultado de acciones posteriores', async () => {
    const { action, settle } = deferred();
    let attempt = 0;
    const assign = async (): Promise<OrderActionState> => ({
      status: 'success',
      message: 'Técnico asignado.',
    });
    const advance = async (): Promise<OrderActionState> => ({
      status: 'error',
      message: `No se pudo iniciar ${(attempt += 1)}.`,
    });
    const { container } = render(
      <OrderActions
        orderId="o1"
        status="assigned"
        technicianId={null}
        technicians={[{ id: 't1', name: 'Marta Soler' }]}
        assignAction={assign}
        advanceAction={advance}
        cancelAction={action}
      />,
    );
    open();
    await submit();
    act(() => container.querySelector('dialog')!.close());
    await settle(failure);
    expect(screen.getByRole('alert')).toHaveTextContent('La orden ya estaba cancelada.');

    fireEvent.change(screen.getByLabelText('Reasignar a'), { target: { value: 't1' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Técnico asignado.')).toBeInTheDocument();

    (document.activeElement as HTMLElement).blur();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Iniciar orden' }));
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No se pudo iniciar 1.');
    expect(alert.parentElement).toHaveFocus();
    expect(screen.queryByText('La orden ya estaba cancelada.')).toBeNull();

    // Y un fallo de cancelación posterior vuelve a ser el que se muestra.
    open();
    await submit();
    await settle(failure);
    expect(screen.getByRole('dialog')).toContainElement(
      screen.getByText('La orden ya estaba cancelada.'),
    );
  });

  it('éxito: cierra, anuncia y lleva el foco al aviso de orden cerrada', async () => {
    const { action, settle } = deferred();
    const { rerender } = render(view(action));
    open();
    await submit();
    await settle({ status: 'success', message: 'Orden cancelada.' });
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(view(action, 'cancelled'));
    expect(screen.getByText('Orden cancelada.')).toBeInTheDocument();
    expect(document.activeElement).toHaveTextContent('Orden cerrada');
    expect(document.activeElement).not.toBe(document.body);
  });
});
