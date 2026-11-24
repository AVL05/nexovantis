import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { metadata } from '@/app/layout';
import Home from '@/app/page';

describe('layout (metadata)', () => {
  it('define el título "Nexovantis" y una descripción no vacía', () => {
    expect(metadata.title).toBe('Nexovantis');
    expect(typeof metadata.description).toBe('string');
    expect((metadata.description as string).length).toBeGreaterThan(20);
  });
});

describe('página inicial', () => {
  it('describe el producto y declara el estado de fundación técnica', () => {
    render(<Home />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByText(/servicios técnicos/i)).toBeInTheDocument();
    expect(screen.getByText(/fundación técnica/i)).toBeInTheDocument();
  });
});
