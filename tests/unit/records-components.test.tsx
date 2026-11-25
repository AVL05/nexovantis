import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Pagination } from '@/components/ui/Pagination';
import { HistoryList } from '@/components/ui/records/HistoryList';
import { RecordForm } from '@/components/ui/records/RecordForm';
import { RecordList } from '@/components/ui/records/RecordList';
import { SearchBar } from '@/components/ui/SearchBar';
import { SegmentedLinks } from '@/components/ui/SegmentedLinks';
import { customerModule } from '@/features/customers/config';
import { technicianModule } from '@/features/technicians/config';
import type { RecordView } from '@/lib/records/types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const record = (over: Partial<RecordView> = {}): RecordView => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Cliente Uno',
  email: 'uno@example.test',
  phone: '600000000',
  notes: null,
  archivedAt: null,
  createdAt: '2026-11-24T10:00:00Z',
  updatedAt: '2026-11-24T10:00:00Z',
  ...over,
});

describe('Pagination', () => {
  const hrefFor = (page: number) => `/customers?pagina=${page}`;

  it('en la primera pagina desactiva Anterior y enlaza Siguiente', () => {
    render(<Pagination page={1} pageCount={3} total={45} hrefFor={hrefFor} noun="clientes" />);
    const nav = screen.getByRole('navigation', { name: 'Paginación' });
    expect(within(nav).getByText('Página 1 de 3')).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Siguiente' })).toHaveAttribute(
      'href',
      '/customers?pagina=2',
    );
    expect(within(nav).queryByRole('link', { name: 'Anterior' })).toBeNull();
    expect(within(nav).getByText('Anterior')).toHaveAttribute('aria-disabled', 'true');
  });

  it('en la ultima pagina enlaza Anterior y desactiva Siguiente', () => {
    render(<Pagination page={3} pageCount={3} total={45} hrefFor={hrefFor} noun="clientes" />);
    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute(
      'href',
      '/customers?pagina=2',
    );
    expect(screen.queryByRole('link', { name: 'Siguiente' })).toBeNull();
  });
});

describe('SearchBar', () => {
  it('es un formulario GET con etiqueta, valor, limite y filtros ocultos', () => {
    const { container } = render(
      <SearchBar
        action="/customers"
        label="Buscar clientes"
        defaultValue="ana"
        hidden={{ estado: 'todos' }}
        clearHref="/customers?estado=todos"
      />,
    );
    const form = screen.getByRole('search');
    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/customers');
    const input = screen.getByLabelText('Buscar clientes');
    expect(input).toHaveValue('ana');
    expect(input).toHaveAttribute('maxlength', '100');
    expect(container.querySelector('input[type="hidden"][name="estado"]')).toHaveValue('todos');
    expect(screen.getByRole('link', { name: 'Limpiar' })).toHaveAttribute(
      'href',
      '/customers?estado=todos',
    );
  });

  it('sin termino no muestra Limpiar', () => {
    render(<SearchBar action="/c" label="Buscar" defaultValue="" clearHref="/c" />);
    expect(screen.queryByRole('link', { name: 'Limpiar' })).toBeNull();
  });
});

describe('SegmentedLinks', () => {
  it('marca la opcion actual con aria-current', () => {
    render(
      <SegmentedLinks
        label="Filtrar por estado"
        items={[
          { label: 'Activos', href: '/c', current: true },
          { label: 'Archivados', href: '/c?estado=archivados', current: false },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Activos' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Archivados' })).not.toHaveAttribute('aria-current');
  });
});

describe('RecordList', () => {
  const params = { page: 1, q: '', status: 'activos' } as const;

  it('sin registros ni filtros ofrece crear el primero', () => {
    render(<RecordList module={customerModule} items={[]} params={params} />);
    expect(
      screen.getByRole('heading', { name: 'Todavía no hay clientes activos' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear el primer cliente' })).toHaveAttribute(
      'href',
      '/customers/new',
    );
  });

  it('con filtros distingue "sin coincidencias" y ofrece limpiar', () => {
    render(
      <RecordList
        module={technicianModule}
        items={[]}
        params={{ page: 1, q: 'zzz', status: 'activos' }}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'No hay técnicos que coincidan' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Limpiar búsqueda y filtros' })).toHaveAttribute(
      'href',
      '/technicians',
    );
  });

  it('muestra tabla con caption y lista de tarjetas con estado en texto', () => {
    render(
      <RecordList
        module={customerModule}
        items={[
          record(),
          record({ id: '2', name: 'Cliente Dos', archivedAt: '2026-11-24T11:00:00Z' }),
        ]}
        params={params}
      />,
    );
    const table = screen.getByRole('table', { name: 'Listado de clientes' });
    expect(within(table).getByText('Listado de clientes', { selector: 'caption' })).toBeVisible();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Nombre', 'Correo electrónico', 'Teléfono', 'Estado']);
    expect(within(table).getByRole('link', { name: 'Cliente Uno' })).toHaveAttribute(
      'href',
      '/customers/11111111-1111-4111-8111-111111111111',
    );
    expect(within(table).getByText('Archivado')).toBeInTheDocument();
    expect(within(table).getByText('Activo')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Listado de clientes' })).toBeInTheDocument();
  });
});

describe('HistoryList', () => {
  it('estado vacio', () => {
    render(<HistoryList items={[]} />);
    expect(screen.getByText(/Sin movimientos/)).toBeInTheDocument();
  });

  it('no inventa actores: solo "Tú" o "Miembro de la organización" si se conocen', () => {
    render(
      <HistoryList
        items={[
          { id: 'a', action: 'restored', occurredAt: '2026-11-24T12:00:00Z', actor: 'self' },
          { id: 'b', action: 'archived', occurredAt: '2026-11-24T11:00:00Z', actor: 'member' },
          { id: 'c', action: 'archived', occurredAt: '2026-11-24T10:00:00Z', actor: null },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toMatch(/Restaurado.*Tú/);
    expect(items[1]).toMatch(/Archivado.*Miembro de la organización/);
    expect(items[2]).toMatch(/^Archivado/);
    expect(items[2]).not.toMatch(/Tú|Miembro/);
  });
});

describe('RecordForm', () => {
  const noop = async () => ({ status: 'idle' as const });

  it('expone validacion HTML (required, maxLength, type=email) y etiquetas', () => {
    render(
      <RecordForm
        module={technicianModule}
        action={noop}
        initial={{ full_name: 'Tec Uno', email: 'tec@example.test' }}
        submitLabel="Crear técnico"
        cancelHref="/technicians"
      />,
    );
    const name = screen.getByLabelText('Nombre completo');
    expect(name).toBeRequired();
    expect(name).toHaveAttribute('maxlength', '200');
    expect(name).toHaveAttribute('name', 'full_name');
    expect(name).toHaveValue('Tec Uno');
    const email = screen.getByLabelText('Correo electrónico');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('maxlength', '254');
    expect(screen.getByLabelText('Teléfono')).toHaveAttribute('maxlength', '40');
    expect(screen.getByLabelText('Notas')).toHaveAttribute('maxlength', '2000');
    expect(screen.getByRole('button', { name: 'Crear técnico' })).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute('href', '/technicians');
    expect(document.querySelector('input[name="organization_id"]')).toBeNull();
  });

  it('en edicion incluye el id como campo oculto', () => {
    const { container } = render(
      <RecordForm
        module={customerModule}
        action={noop}
        initial={{}}
        submitLabel="Guardar cambios"
        cancelHref="/customers/1"
        recordId="11111111-1111-4111-8111-111111111111"
      />,
    );
    expect(container.querySelector('input[type="hidden"][name="id"]')).toHaveValue(
      '11111111-1111-4111-8111-111111111111',
    );
  });
});
