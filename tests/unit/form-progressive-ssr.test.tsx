// @vitest-environment node
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { RecordForm } from '@/components/ui/records/RecordForm';
import { customerModule } from '@/features/customers/config';
import { InventoryForm } from '@/features/inventory/ui/InventoryForm';
import { QuoteForm } from '@/features/quotes/ui/QuoteForm';
import { OrderActions } from '@/features/work-orders/ui/OrderActions';
import { OrderForm } from '@/features/work-orders/ui/OrderForm';

// TASK-014 / H-15 y H-14. El HTML del servidor debe permitir el envío sin JavaScript en los
// formularios que ya lo permitían: React solo lo genera si `useActionState` recibe la Server Action
// sin envoltorios de cliente.

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** Imita una referencia de Server Action: `bind` conserva los metadatos del formulario. */
function serverReference(id: string) {
  const reference = (): unknown =>
    Object.assign(async () => ({ status: 'idle' as const }), {
      $$FORM_ACTION: () => ({
        name: `$ACTION_REF_${id}`,
        method: 'POST',
        encType: 'multipart/form-data',
        data: null,
      }),
      bind: () => reference(),
    });
  return reference() as never;
}

const forms = (html: string) => html.match(/<form[^>]*>(<input[^>]*>)*/g) ?? [];
const expectPost = (html: string, id: string) => {
  const form = forms(html).find((f) => f.includes(`$ACTION_REF_${id}`));
  expect(form, `formulario ${id}`).toMatch(/method="POST"/);
};

const people = [{ id: 'p1', name: 'Persona' }];
const common = { submitLabel: 'Guardar', cancelHref: '/' };

describe('envío sin JavaScript (HTML del servidor)', () => {
  it.each([
    ['pending', ['assign']],
    ['assigned', ['assign', 'advance']],
    ['in_progress', ['advance']],
  ] as const)('orden %s: %j se envían por POST', (status, ids) => {
    const html = renderToString(
      <OrderActions
        orderId="o1"
        status={status}
        technicianId={null}
        technicians={people}
        assignAction={serverReference('assign')}
        advanceAction={serverReference('advance')}
        cancelAction={serverReference('cancel')}
      />,
    );
    for (const id of ids) expectPost(html, id);
    // Cancelar pide confirmación en un diálogo y necesita JavaScript (como antes).
    expect(html).not.toContain('$ACTION_REF_cancel');
  });

  it.each([
    [
      'orden',
      <OrderForm key="o" {...common} action={serverReference('f')} initial={{}} requestId="r" />,
    ],
    [
      'presupuesto',
      <QuoteForm
        key="q"
        {...common}
        action={serverReference('f')}
        initial={{}}
        customers={people}
      />,
    ],
    ['artículo', <InventoryForm key="i" {...common} action={serverReference('f')} initial={{}} />],
    [
      'cliente',
      <RecordForm
        key="r"
        {...common}
        module={customerModule}
        action={serverReference('f')}
        initial={{}}
      />,
    ],
  ])('formulario de %s: POST', (_name, element) => {
    expectPost(renderToString(element), 'f');
  });
});

describe('cabeceras de tabla', () => {
  it('no se parten a mitad de palabra aunque main permita partir textos', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toMatch(/main th \{\s*overflow-wrap: normal;\s*\}/);
  });
});
