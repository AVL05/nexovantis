import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guardas estaticas de TASK-011: fronteras de servidor, sin clave elevada y sin confiar en el
// cliente para organizacion, estado ni actor.

const read = (path: string) => readFileSync(path, 'utf8');
const FEATURE = 'src/features/work-orders';

describe('fronteras de servidor de las ordenes', () => {
  it('servicio y paginas son server-only; las acciones son Server Actions', () => {
    expect(read(`${FEATURE}/service.ts`)).toMatch(/^import 'server-only';/m);
    expect(read(`${FEATURE}/pages.tsx`)).toMatch(/^import 'server-only';/m);
    expect(read(`${FEATURE}/actions.ts`)).toMatch(/^'use server';/);
  });

  it('un archivo use server solo exporta funciones asincronas', () => {
    const exports = read(`${FEATURE}/actions.ts`).match(/^export .*/gm) ?? [];
    expect(exports.length).toBeGreaterThan(0);
    for (const line of exports) {
      expect(line).toMatch(/^export (async function \w+|type \w+)/);
    }
  });

  it('los componentes cliente no importan modulos de servidor', () => {
    for (const file of readdirSync(`${FEATURE}/ui`).filter((f) => f.endsWith('.tsx'))) {
      const source = read(`${FEATURE}/ui/${file}`);
      if (!source.startsWith("'use client'")) continue;
      expect(source, file).not.toMatch(
        /from '..\/service'|from '@\/lib\/records\/tenant'|server-only/,
      );
      // Solo se permiten importaciones de tipo desde las acciones.
      for (const line of source.match(/^import .*actions'.*$/gm) ?? []) {
        expect(line, file).toMatch(/^import type /);
      }
    }
  });

  it('sin service_role ni organizacion/estado/actor tomados del formulario', () => {
    for (const file of ['actions.ts', 'service.ts', 'schema.ts', 'pages.tsx']) {
      const source = read(`${FEATURE}/${file}`);
      expect(source, file).not.toMatch(/service_role|SERVICE_ROLE/);
    }
    const actions = read(`${FEATURE}/actions.ts`);
    expect(actions).not.toMatch(/pickFields\([^)]*organization_id/);
    expect(actions).not.toMatch(/pickFields\([^)]*'status'/);
    expect(actions).not.toMatch(/pickFields\([^)]*actor/);
    // La escritura pasa solo por las RPC de PostgreSQL (sin insert/update directos).
    const service = read(`${FEATURE}/service.ts`);
    expect(service).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    for (const rpc of [
      'create_work_order',
      'update_work_order',
      'assign_work_order',
      'advance_work_order',
      'cancel_work_order',
    ]) {
      expect(service).toContain(`rpc('${rpc}'`);
    }
  });

  it('las lecturas se acotan a la organizacion de la membresia (RLS es la frontera real)', () => {
    const service = read(`${FEATURE}/service.ts`);
    const scoped = service.match(/'organization_id',\s*ctx\.organizationId/g) ?? [];
    expect(scoped.length).toBeGreaterThanOrEqual(8);
    expect(service).not.toMatch(/organizationId:\s*(input|formData|params)/);
  });
});
