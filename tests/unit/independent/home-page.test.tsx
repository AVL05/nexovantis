// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import Page from '@/app/page';

// Prueba independiente de Testing (TASK-004). Develop no la modifica.

afterEach(() => {
  cleanup();
});

describe('página inicial (@/app/page)', () => {
  it('muestra un único h1 accesible con "Nexovantis"', () => {
    render(<Page />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Nexovantis');
    expect(screen.getByRole('heading', { level: 1, name: /nexovantis/i })).toBeInTheDocument();
  });

  it('ofrece un único enlace visible para iniciar sesión y ningún botón ficticio', () => {
    render(<Page />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    const loginLink = screen.getByRole('link', { name: 'Iniciar sesión' });
    expect(loginLink).toBeVisible();
    expect(loginLink).toHaveAttribute('href', '/login');
  });
});
