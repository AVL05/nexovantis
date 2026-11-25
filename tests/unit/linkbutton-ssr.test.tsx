import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LinkButton } from '@/components/ui/LinkButton';
import { RecordForm } from '@/components/ui/records/RecordForm';
import { customerModule } from '@/features/customers/config';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// TASK-008B-DEV3: LinkButton (usa buttonClass de Button) debe renderizar en SSR, también desde
// componentes 'use client' como RecordForm.
describe('SSR de LinkButton', () => {
  it('renderiza LinkButton con clases de botón', () => {
    const html = renderToString(<LinkButton href="/x">Ir</LinkButton>);
    expect(html).toContain('href="/x"');
    expect(html).toContain('bg-accent');
  });

  it('renderiza RecordForm (cliente) en servidor con el enlace Cancelar', () => {
    const html = renderToString(
      <RecordForm
        module={customerModule}
        action={async (prev) => prev}
        initial={{}}
        submitLabel="Crear"
        cancelHref="/customers"
      />,
    );
    expect(html).toContain('Cancelar');
    expect(html).toContain('href="/customers"');
  });
});
