import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityFilters } from '@/features/activity/ui/ActivityFilters';
import { ActivityList } from '@/features/activity/ui/ActivityList';
import type { ActivityEntry } from '@/features/activity/service';
import { parseActivityParams } from '@/features/activity/params';
import type { MovementActionState } from '@/features/inventory/actions';
import { parseInventoryListParams } from '@/features/inventory/params';
import type { InventoryItemView, MovementView } from '@/features/inventory/service';
import { InventoryAlerts } from '@/features/inventory/ui/InventoryAlerts';
import { InventoryForm } from '@/features/inventory/ui/InventoryForm';
import { InventoryList } from '@/features/inventory/ui/InventoryList';
import { MovementForm } from '@/features/inventory/ui/MovementForm';
import { MovementHistory } from '@/features/inventory/ui/MovementHistory';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const ID = '8f14e45f-ceea-467a-9575-0d9d3b8a1c11';
const ORDER = '9b2e3b4e-1f4b-4d5e-8a76-2a1c4f0d9e55';

const item = (over: Partial<InventoryItemView> = {}): InventoryItemView => ({
  id: ID,
  reference: 'TUB-15',
  name: 'Tubo de cobre 15 mm',
  description: null,
  unit: 'm',
  threshold: 20,
  quantity: 50,
  status: 'ok',
  archivedAt: null,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  ...over,
});

describe('InventoryList', () => {
  const params = parseInventoryListParams({});

  it('muestra saldo con unidad, umbral y un estado con texto (no solo color)', () => {
    render(
      <InventoryList
        params={params}
        items={[
          item(),
          item({ id: 'b', reference: 'VAL', name: 'Válvula', quantity: 0, status: 'out' }),
          item({ id: 'c', reference: 'JUN', name: 'Junta', quantity: 5, status: 'low' }),
          item({
            id: 'd',
            reference: 'OLD',
            name: 'Bomba',
            archivedAt: '2026-11-21T10:00:00.000Z',
          }),
        ]}
      />,
    );
    const table = screen.getByRole('region', { name: 'Listado de inventario' });
    expect(within(table).getByText('Disponible')).toBeInTheDocument();
    expect(within(table).getByText('Agotado')).toBeInTheDocument();
    expect(within(table).getByText('Stock bajo')).toBeInTheDocument();
    expect(within(table).getByText('Archivado')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Tubo de cobre 15 mm' })).toHaveAttribute(
      'href',
      `/inventory/${ID}`,
    );
  });

  it('estado vacío sin artículos (con alta) y sin coincidencias (con limpiar)', () => {
    const { rerender } = render(<InventoryList params={params} items={[]} />);
    expect(screen.getByRole('heading', { name: 'Todavía no hay artículos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear el primer artículo' })).toHaveAttribute(
      'href',
      '/inventory/new',
    );
    rerender(<InventoryList params={parseInventoryListParams({ q: 'zzz' })} items={[]} />);
    expect(
      screen.getByRole('heading', { name: 'No hay artículos que coincidan' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Limpiar búsqueda y filtros' })).toHaveAttribute(
      'href',
      '/inventory',
    );
  });
});

describe('InventoryAlerts', () => {
  it('muestra los recuentos y enlaza a los filtros bajo y agotado', () => {
    render(<InventoryAlerts counts={{ active: 11, low: 3, out: 2 }} />);
    expect(screen.getByTestId('inventory-low')).toHaveTextContent('3');
    expect(screen.getByTestId('inventory-low')).toHaveAttribute('href', '/inventory?estado=bajo');
    expect(screen.getByTestId('inventory-out')).toHaveAttribute(
      'href',
      '/inventory?estado=agotado',
    );
    expect(screen.getByTestId('inventory-active')).toHaveTextContent('11');
  });

  it('si no se pueden cargar avisa y no inventa cifras', () => {
    render(<InventoryAlerts counts={null} />);
    expect(screen.getByText('No se pudieron cargar los indicadores de stock.')).toBeInTheDocument();
    expect(screen.queryByTestId('inventory-low')).toBeNull();
  });
});

describe('InventoryForm', () => {
  const noop = async () => ({ status: 'idle' as const });

  it('alta: referencia editable, umbral numérico entero y aviso de saldo 0', () => {
    render(
      <InventoryForm
        action={noop}
        initial={{}}
        submitLabel="Crear artículo"
        cancelHref="/inventory"
        requestId={ID}
      />,
    );
    expect(screen.getByLabelText('Referencia')).toBeEnabled();
    const threshold = screen.getByLabelText('Umbral de stock bajo');
    expect(threshold).toHaveAttribute('type', 'number');
    expect(threshold).toHaveAttribute('step', '1');
    expect(screen.getByLabelText('Unidad')).toHaveValue('ud');
    expect(screen.getByText(/se crea con saldo 0/)).toBeInTheDocument();
    expect(document.querySelector('input[name="request_id"]')).toHaveValue(ID);
    expect(document.querySelector('input[name="quantity"]')).toBeNull();
  });

  it('edición: la referencia es de solo lectura y no se envía', () => {
    render(
      <InventoryForm
        action={noop}
        initial={{ name: 'Tubo', unit: 'kg', low_stock_threshold: '4' }}
        submitLabel="Guardar cambios"
        cancelHref={`/inventory/${ID}`}
        itemId={ID}
        reference="TUB-15"
      />,
    );
    expect(screen.getByTestId('item-reference')).toHaveTextContent('TUB-15');
    expect(document.querySelector('input[name="reference"]')).toBeNull();
    expect(screen.getByLabelText('Unidad')).toHaveValue('kg');
    expect(screen.getByLabelText('Umbral de stock bajo')).toHaveValue(4);
  });
});

describe('MovementForm', () => {
  const orders = [
    { id: ORDER, title: 'Cambio de bomba', status: 'in_progress', scheduledDate: '2026-12-01' },
  ];
  const idle: MovementActionState = { status: 'idle' };
  const form = (action = vi.fn(async () => idle), list = orders) =>
    render(
      <MovementForm
        itemId={ID}
        unit="m"
        requestId="c4ca4238-a0b9-4382-8ad5-7a1f9d2b0c33"
        orders={list}
        action={action}
      />,
    );

  it('lleva la clave de idempotencia y el artículo; cantidad entera positiva', () => {
    form();
    expect(document.querySelector('input[name="request_id"]')).toHaveValue(
      'c4ca4238-a0b9-4382-8ad5-7a1f9d2b0c33',
    );
    expect(document.querySelector('input[name="item_id"]')).toHaveValue(ID);
    const quantity = screen.getByLabelText('Cantidad (m)');
    expect(quantity).toHaveAttribute('min', '1');
    expect(quantity).toHaveAttribute('step', '1');
    expect(screen.queryByLabelText('Orden de servicio')).toBeNull();
  });

  it('el consumo muestra el selector de órdenes abiertas y lo exige', () => {
    form();
    fireEvent.change(screen.getByLabelText('Tipo de movimiento'), {
      target: { value: 'consumption' },
    });
    const select = screen.getByLabelText('Orden de servicio');
    expect(select).toBeRequired();
    expect(
      within(select).getByRole('option', { name: /Cambio de bomba · En curso/ }),
    ).toBeInTheDocument();
  });

  it('sin órdenes abiertas explica por qué no se puede consumir y bloquea el envío', () => {
    form(undefined, []);
    fireEvent.change(screen.getByLabelText('Tipo de movimiento'), {
      target: { value: 'consumption' },
    });
    expect(screen.getByText('No hay órdenes abiertas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar movimiento' })).toBeDisabled();
  });
});

describe('MovementHistory', () => {
  const movement = (over: Partial<MovementView> = {}): MovementView => ({
    id: 'm1',
    kind: 'in',
    quantity: 10,
    balanceBefore: 0,
    balanceAfter: 10,
    orderId: null,
    orderTitle: null,
    note: null,
    actor: 'self',
    createdAt: '2026-11-20T10:00:00.000Z',
    ...over,
  });

  it('estado vacío sin movimientos', () => {
    render(<MovementHistory items={[]} unit="m" />);
    expect(screen.getByRole('heading', { name: 'Sin movimientos todavía' })).toBeInTheDocument();
  });

  it('muestra tipo, cantidad con signo, saldos, orden enlazada, nota y actor; sin acciones de edición', () => {
    render(
      <MovementHistory
        unit="m"
        items={[
          movement({
            id: 'm2',
            kind: 'consumption',
            quantity: 4,
            balanceBefore: 10,
            balanceAfter: 6,
            orderId: ORDER,
            orderTitle: 'Cambio de bomba',
            note: 'Obra norte',
          }),
          movement(),
        ]}
      />,
    );
    const table = screen.getByRole('region', { name: 'Historial de movimientos' });
    expect(within(table).getByText('Consumo en orden')).toBeInTheDocument();
    expect(within(table).getByText('Entrada')).toBeInTheDocument();
    expect(within(table).getByText('−4 m')).toBeInTheDocument();
    expect(within(table).getByText('+10 m')).toBeInTheDocument();
    expect(within(table).getByText('10 → 6')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Cambio de bomba' })).toHaveAttribute(
      'href',
      `/orders/${ORDER}`,
    );
    expect(within(table).getByText('Obra norte')).toBeInTheDocument();
    expect(within(table).queryByRole('button')).toBeNull();
  });
});

describe('Actividad', () => {
  const entry = (over: Partial<ActivityEntry> = {}): ActivityEntry => ({
    id: 'e1',
    entityType: 'inventory_item',
    entityId: ID,
    entityLabel: 'Tubo de cobre 15 mm',
    action: 'stock_out',
    occurredAt: '2026-11-20T10:00:00.000Z',
    actor: 'member',
    detail: {
      quantity: 4,
      balanceBefore: 10,
      balanceAfter: 6,
      orderId: ORDER,
      orderTitle: 'Cambio de bomba',
      unit: 'm',
    },
    ...over,
  });

  it('lista con entidad enlazada, acción, detalle estructurado y actor identificado', () => {
    render(
      <ActivityList
        params={parseActivityParams({})}
        items={[
          entry(),
          entry({
            id: 'e2',
            entityType: 'quote',
            action: 'accepted',
            entityLabel: null,
            detail: null,
            actor: 'self',
            entityId: ORDER,
          }),
        ]}
      />,
    );
    const table = screen.getByRole('region', { name: 'Registro de actividad' });
    expect(within(table).getByText('Salida de stock')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Tubo de cobre 15 mm' })).toHaveAttribute(
      'href',
      `/inventory/${ID}`,
    );
    expect(within(table).getByText(/−4 m · saldo 10 → 6/)).toBeInTheDocument();
    expect(within(table).getByText('Miembro de la organización')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Presupuesto' })).toHaveAttribute(
      'href',
      `/quotes/${ORDER}`,
    );
    expect(within(table).getByText('Presupuesto aceptado')).toBeInTheDocument();
  });

  it('estados vacíos: sin actividad y sin coincidencias', () => {
    const { rerender } = render(<ActivityList params={parseActivityParams({})} items={[]} />);
    expect(screen.getByRole('heading', { name: 'Todavía no hay actividad' })).toBeInTheDocument();
    rerender(<ActivityList params={parseActivityParams({ entidad: 'orden' })} items={[]} />);
    expect(
      screen.getByRole('heading', { name: 'No hay actividad que coincida' }),
    ).toBeInTheDocument();
  });

  it('los filtros conservan los valores y avisan de un rango incoherente', () => {
    render(
      <ActivityFilters
        params={parseActivityParams({
          entidad: 'inventario',
          accion: 'stock_in',
          desde: '2026-03-02',
          hasta: '2026-03-01',
        })}
      />,
    );
    expect(screen.getByLabelText('Entidad')).toHaveValue('inventario');
    expect(screen.getByLabelText('Acción')).toHaveValue('stock_in');
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-03-02');
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-03-01');
    expect(screen.getAllByText(/fecha inicial/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Limpiar filtros' })).toHaveAttribute(
      'href',
      '/activity',
    );
  });
});
