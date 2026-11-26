import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { metadata } from '@/app/layout';
import Home from '@/app/page';

const PROVISIONAL = /fundación|estado:|provisional|próximamente|en construcción/i;

describe('layout (metadata)', () => {
  it('define el título "Nexovantis" y una descripción no vacía', () => {
    expect(metadata.title).toBe('Nexovantis');
    expect(typeof metadata.description).toBe('string');
    expect((metadata.description as string).length).toBeGreaterThan(20);
  });
});

describe('página inicial', () => {
  it('describe el producto y sus funcionalidades, sin textos provisionales', () => {
    render(<Home />);

    const main = screen.getByRole('main');
    expect(screen.getByText(/servicios técnicos para pequeñas empresas/i)).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Funcionalidades' });
    expect(main).toContainElement(list);
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringMatching(/^Clientes y técnicos:/),
      expect.stringMatching(/^Órdenes de servicio:/),
      expect.stringMatching(/^Presupuestos /),
      expect.stringMatching(/^Inventario:/),
      expect.stringMatching(/^Panel .*registro de actividad/),
    ]);

    expect(main).not.toHaveTextContent(PROVISIONAL);
  });
});
