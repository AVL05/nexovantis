import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { RecentActivity } from '@/features/activity/service';
import type { OrderActionState } from '@/features/work-orders/actions';
import { parseOrderListParams } from '@/features/work-orders/params';
import type { DashboardData, OrderHistoryEntry, OrderView } from '@/features/work-orders/service';
import {
  OrderIndicators,
  PendingOrders,
  QuickActions,
  RecentActivityList,
} from '@/features/work-orders/ui/DashboardPanels';
import { OrderActions } from '@/features/work-orders/ui/OrderActions';
import { OrderFilters } from '@/features/work-orders/ui/OrderFilters';
import { OrderForm } from '@/features/work-orders/ui/OrderForm';
import { OrderList } from '@/features/work-orders/ui/OrderList';
import { OrderTimeline } from '@/features/work-orders/ui/OrderTimeline';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// jsdom no implementa <dialog>.showModal(): se simula solo la apertura/cierre.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

afterEach(cleanup);

const order = (over: Partial<OrderView> = {}): OrderView => ({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Revisión de caldera',
  description: null,
  priority: 'high',
  scheduledDate: '2026-12-01',
  status: 'pending',
  cancellationReason: null,
  customerId: '22222222-2222-4222-8222-222222222222',
  customerName: 'Cliente Uno',
  customerArchived: false,
  technicianId: null,
  technicianName: null,
  createdAt: '2026-11-25T10:00:00Z',
  updatedAt: '2026-11-25T10:00:00Z',
  ...over,
});

const noop = async (): Promise<OrderActionState> => ({ status: 'idle' });
const techs = [
  { id: 'a0000000-0000-4000-8000-000000000001', name: 'Marta Soler' },
  { id: 'a0000000-0000-4000-8000-000000000002', name: 'Javier Ortega' },
];

describe('OrderList', () => {
  it('estado vacio sin filtros: CTA de alta', () => {
    render(<OrderList items={[]} params={parseOrderListParams({})} />);
    expect(screen.getByText('Todavía no hay órdenes de servicio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear la primera orden' })).toHaveAttribute(
      'href',
      '/orders/new',
    );
  });

  it('estado vacio con filtros: limpiar', () => {
    render(<OrderList items={[]} params={parseOrderListParams({ estado: 'pending' })} />);
    expect(screen.getByText('No hay órdenes que coincidan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Limpiar búsqueda y filtros' })).toHaveAttribute(
      'href',
      '/orders',
    );
  });

  it('muestra cliente, tecnico, fecha, prioridad y estado con texto (no solo color)', () => {
    render(
      <OrderList
        items={[order({ status: 'in_progress', technicianName: 'Marta Soler', technicianId: 'x' })]}
        params={parseOrderListParams({})}
      />,
    );
    const table = screen.getByRole('region', { name: 'Listado de órdenes de servicio' });
    expect(within(table).getByRole('link', { name: 'Revisión de caldera' })).toHaveAttribute(
      'href',
      '/orders/11111111-1111-4111-8111-111111111111',
    );
    for (const text of ['Cliente Uno', 'Marta Soler', 'Alta', 'En curso']) {
      expect(within(table).getByText(text)).toBeInTheDocument();
    }
    expect(within(table).getByText(/1 dic 2026/)).toBeInTheDocument();
  });
});

describe('OrderFilters', () => {
  it('es un formulario GET de busqueda con todos los filtros etiquetados', () => {
    render(
      <OrderFilters
        params={parseOrderListParams({ estado: 'assigned', tecnico: 'sin' })}
        customers={[{ id: 'c1', name: 'Cliente Uno' }]}
        technicians={techs}
      />,
    );
    const form = screen.getByRole('search', { name: 'Buscar y filtrar órdenes' });
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/orders');
    for (const label of [
      'Buscar por título, descripción o cliente',
      'Estado',
      'Prioridad',
      'Técnico',
      'Cliente',
      'Fecha desde',
      'Fecha hasta',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Estado')).toHaveValue('assigned');
    expect(screen.getByLabelText('Técnico')).toHaveValue('sin');
    expect(screen.getByRole('link', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });
});

describe('OrderActions segun estado', () => {
  const show = (
    status: Parameters<typeof OrderActions>[0]['status'],
    technicianId: string | null,
  ) =>
    render(
      <OrderActions
        orderId="11111111-1111-4111-8111-111111111111"
        status={status}
        technicianId={technicianId}
        technicians={techs}
        assignAction={noop}
        advanceAction={noop}
        cancelAction={noop}
      />,
    );

  it('pendiente: asignar y cancelar; sin iniciar ni completar (sin saltos)', () => {
    show('pending', null);
    expect(screen.getByLabelText('Asignar técnico')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Asignar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar orden' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar orden' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Completar orden' })).toBeNull();
  });

  it('asignada: reasignar (sin el tecnico actual), iniciar y cancelar', () => {
    show('assigned', techs[0].id);
    const select = screen.getByLabelText('Reasignar a');
    expect(within(select).queryByRole('option', { name: 'Marta Soler' })).toBeNull();
    expect(within(select).getByRole('option', { name: 'Javier Ortega' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar orden' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Completar orden' })).toBeNull();
  });

  it('en curso: completar y cancelar; sin reasignar (DH-01)', () => {
    show('in_progress', techs[0].id);
    expect(screen.getByRole('button', { name: 'Completar orden' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Reasignar a')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iniciar orden' })).toBeNull();
  });

  it.each(['completed', 'cancelled'] as const)(
    '%s: solo lectura, sin acciones (DH-07)',
    (status) => {
      show(status, techs[0].id);
      expect(screen.getByText('Orden cerrada')).toBeInTheDocument();
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    },
  );

  it('el dialogo de cancelacion ofrece motivo opcional con limite', () => {
    show('pending', null);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar orden' }));
    const reason = screen.getByLabelText('Motivo (opcional)', { selector: 'textarea' });
    expect(reason).toHaveAttribute('maxlength', '200');
    expect(reason).not.toBeRequired();
  });
});

describe('OrderForm', () => {
  const action = async () => ({ status: 'idle' as const });

  it('alta: cliente y tecnico opcional, id de envio oculto y sin organizacion ni estado', () => {
    const { container } = render(
      <OrderForm
        action={action}
        initial={{ scheduled_date: '2026-11-25', priority: 'normal' }}
        requestId="33333333-3333-4333-8333-333333333333"
        customers={[{ id: 'c1', name: 'Cliente Uno' }]}
        technicians={techs}
        submitLabel="Crear orden"
        cancelHref="/orders"
      />,
    );
    expect(screen.getByLabelText('Cliente')).toBeRequired();
    expect(screen.getByLabelText('Título')).toBeRequired();
    expect(screen.getByLabelText('Fecha programada')).toHaveValue('2026-11-25');
    expect(screen.getByLabelText('Técnico (opcional)')).not.toBeRequired();
    expect(container.querySelector('input[name="request_id"]')).toHaveValue(
      '33333333-3333-4333-8333-333333333333',
    );
    expect(container.querySelector('[name="organization_id"]')).toBeNull();
    expect(container.querySelector('[name="status"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Crear orden' })).toBeEnabled();
  });

  it('alta sin clientes activos: aviso y envio bloqueado', () => {
    render(
      <OrderForm
        action={action}
        initial={{}}
        requestId="33333333-3333-4333-8333-333333333333"
        customers={[]}
        technicians={[]}
        submitLabel="Crear orden"
        cancelHref="/orders"
      />,
    );
    expect(screen.getByText('No hay clientes activos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear orden' })).toBeDisabled();
  });

  it('edicion: solo campos descriptivos, sin cliente ni tecnico', () => {
    const { container } = render(
      <OrderForm
        action={action}
        orderId="11111111-1111-4111-8111-111111111111"
        initial={{
          title: 'Revisión',
          description: 'Detalle',
          priority: 'urgent',
          scheduled_date: '2026-12-01',
        }}
        submitLabel="Guardar cambios"
        cancelHref="/orders/x"
      />,
    );
    expect(screen.queryByLabelText('Cliente')).toBeNull();
    expect(screen.queryByLabelText('Técnico (opcional)')).toBeNull();
    expect(screen.getByLabelText('Prioridad')).toHaveValue('urgent');
    expect(container.querySelector('input[name="id"]')).toHaveValue(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(container.querySelector('input[name="request_id"]')).toBeNull();
  });
});

describe('OrderTimeline', () => {
  const entry = (over: Partial<OrderHistoryEntry>): OrderHistoryEntry => ({
    id: 'e1',
    action: 'created',
    occurredAt: '2026-11-25T10:00:00Z',
    actor: 'self',
    fromStatus: null,
    toStatus: 'pending',
    technicianName: null,
    reason: null,
    ...over,
  });

  it('vacio', () => {
    render(<OrderTimeline items={[]} />);
    expect(screen.getByText('Sin movimientos registrados.')).toBeInTheDocument();
  });

  it('muestra accion, transicion, tecnico, motivo y actor identificado', () => {
    render(
      <OrderTimeline
        items={[
          entry({
            id: 'e3',
            action: 'cancelled',
            fromStatus: 'assigned',
            toStatus: 'cancelled',
            reason: 'Cliente ausente',
            actor: 'member',
          }),
          entry({
            id: 'e2',
            action: 'assigned',
            fromStatus: 'pending',
            toStatus: 'assigned',
            technicianName: 'Marta Soler',
          }),
          entry({ id: 'e1' }),
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Orden cancelada')).toBeInTheDocument();
    expect(within(items[0]).getByText('Asignada → Cancelada')).toBeInTheDocument();
    expect(within(items[0]).getByText('Motivo: Cliente ausente')).toBeInTheDocument();
    expect(within(items[0]).getByText(/Miembro de la organización/)).toBeInTheDocument();
    expect(within(items[1]).getByText('Técnico asignado a Marta Soler')).toBeInTheDocument();
    expect(within(items[2]).getByText(/Tú/)).toBeInTheDocument();
  });
});

describe('panel: indicadores, pendientes, actividad y accesos', () => {
  const data: DashboardData = {
    counts: { pending: 12, assigned: 3, in_progress: 2, completed: 40, cancelled: 1 },
    open: 17,
    total: 58,
    overdue: 4,
    pending: [order({ title: 'Cambio de fusibles' })],
  };

  it('indicadores con las cifras recibidas, enlazadas al listado filtrado', () => {
    render(<OrderIndicators data={data} />);
    expect(screen.getByTestId('orders-pending')).toHaveTextContent('12');
    expect(screen.getByTestId('orders-completed')).toHaveTextContent('40');
    expect(screen.getByTestId('orders-open')).toHaveTextContent('17');
    expect(screen.getByTestId('orders-overdue')).toHaveTextContent('4');
    expect(screen.getByTestId('orders-total')).toHaveTextContent('58');
    expect(screen.getByRole('link', { name: /Pendientes/ })).toHaveAttribute(
      'href',
      '/orders?estado=pending',
    );
    expect(screen.getByRole('link', { name: /En curso/ })).toHaveAttribute(
      'href',
      '/orders?estado=in_progress',
    );
  });

  it('sin datos: aviso y ninguna cifra inventada', () => {
    render(<OrderIndicators data={null} />);
    expect(screen.getByText('Indicadores no disponibles')).toBeInTheDocument();
    expect(screen.queryByTestId('orders-pending')).toBeNull();
  });

  it('pendientes: lista con enlace al detalle, resto enlazado y vacio con CTA', () => {
    const { rerender } = render(<PendingOrders data={data} />);
    expect(screen.getByRole('link', { name: 'Cambio de fusibles' })).toHaveAttribute(
      'href',
      '/orders/11111111-1111-4111-8111-111111111111',
    );
    expect(screen.getByRole('link', { name: 'Ver las 12 órdenes pendientes' })).toBeInTheDocument();
    rerender(
      <PendingOrders data={{ ...data, pending: [], counts: { ...data.counts, pending: 0 } }} />,
    );
    expect(screen.getByText('No hay órdenes pendientes')).toBeInTheDocument();
  });

  const activity = (over: Partial<RecentActivity>): RecentActivity => ({
    id: 'a1',
    entityType: 'work_order',
    entityId: '11111111-1111-4111-8111-111111111111',
    entityLabel: 'Revisión de caldera',
    action: 'created',
    occurredAt: '2026-11-25T10:00:00Z',
    actor: 'self',
    ...over,
  });

  it('actividad reciente: acciones, enlaces por entidad y estados vacio/error', () => {
    const { rerender } = render(
      <RecentActivityList
        items={[
          activity({}),
          activity({
            id: 'a2',
            entityType: 'customer',
            entityId: 'c1',
            entityLabel: null,
            action: 'archived',
            actor: 'former',
          }),
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Revisión de caldera' })).toHaveAttribute(
      'href',
      '/orders/11111111-1111-4111-8111-111111111111',
    );
    expect(screen.getByRole('link', { name: 'Cliente' })).toHaveAttribute('href', '/customers/c1');
    expect(screen.getByText(/Antiguo miembro/)).toBeInTheDocument();
    rerender(<RecentActivityList items={[]} />);
    expect(screen.getByText('Sin actividad todavía')).toBeInTheDocument();
    rerender(<RecentActivityList items={null} />);
    expect(screen.getByText('No se pudo cargar la actividad reciente.')).toBeInTheDocument();
  });

  it('accesos rapidos funcionales: solo rutas existentes', () => {
    render(<QuickActions />);
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['/orders/new', '/orders', '/customers/new', '/technicians/new']);
  });
});
