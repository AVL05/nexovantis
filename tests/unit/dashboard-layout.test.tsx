import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// TASK-008B-DEV4: el grid del panel no usa 3 columnas hasta lg y la cabecera de la tarjeta puede
// hacer wrap (evita desbordamiento a 768 px con el lateral de 256 px).
describe('dashboard: rejilla de módulos', () => {
  const src = readFileSync('src/app/dashboard/page.tsx', 'utf8');
  it('2 columnas en md y 3 desde lg; nunca md:grid-cols-3', () => {
    expect(src).toContain('md:grid-cols-2 lg:grid-cols-3');
    expect(src).not.toContain('md:grid-cols-3');
  });
  it('cabecera de tarjeta con wrap y min-w-0', () => {
    expect(src).toMatch(/min-w-0 flex-wrap/);
  });
});
