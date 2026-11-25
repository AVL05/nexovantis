import { describe, expect, it } from 'vitest';

import { isProtectedPath } from '@/features/auth/routes';
import { NAV_ITEMS } from '@/features/navigation/items';

describe('rutas de Clientes y Tecnicos', () => {
  it.each([
    '/customers',
    '/customers/new',
    '/customers/aaaa/edit',
    '/Customers',
    '/%63ustomers',
    '//technicians',
    '/technicians/',
    '/technicians/abc',
    '/orders',
    '/orders/new',
    '/Orders/aaaa/edit',
    '/%6frders',
    '//orders/',
  ])('protege %s', (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each(['/customer', '/customersx', '/technician', '/api/customers', '/order', '/ordersx'])(
    'no protege %s',
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    },
  );
});

describe('navegacion', () => {
  it('Clientes, Tecnicos y Ordenes enlazan a su modulo', () => {
    const byKey = Object.fromEntries(NAV_ITEMS.map((item) => [item.key, item.href]));
    expect(byKey.customers).toBe('/customers');
    expect(byKey.technicians).toBe('/technicians');
    expect(byKey.orders).toBe('/orders');
  });
});
