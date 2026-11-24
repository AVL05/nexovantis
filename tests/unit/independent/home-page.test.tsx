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

  it('no presenta botones ni enlaces ficticios', () => {
    render(<Page />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
