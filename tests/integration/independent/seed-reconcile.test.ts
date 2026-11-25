// @vitest-environment node
import type { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fingerprint, lastRows, q, type Row } from './support/db';
import { ID, execAs, readReconcile, runSeed, seededOrgsDb, snapshot } from './support/seed-db';

// Prueba independiente de Testing (TASK-010 PRE, A02-03). Develop no la modifica.
// Reconciliacion preparada (NO ejecutada en Cloud) de las filas demo ya instaladas por la version
// anterior del seed, que no tienen identidad estable registrada.
//
// Contrato del script supabase/seeds/reconcile-demo-crm.sql (lo crea Develop):
//   - Se ejecuta con privilegios de administracion, igual que el seed (psql -f / SQL editor).
//   - Modo por la variable de sesion `nexovantis.reconcile_apply`: solo con el valor 'on' APLICA;
//     sin definir o con cualquier otro valor es modo COMPROBACION: no persiste ningun cambio en
//     ninguna tabla (ni en las de identidad). Un fallo aborta todo (transaccional).
//   - La ULTIMA sentencia devuelve un informe, una fila por fixture y organizacion, con columnas:
//       organization text   nombre de la organizacion demo ('Demo Norte' | 'Demo Sur')
//       entity_type  text   'customer' | 'technician'
//       fixture      text   nombre ORIGINAL del fixture en el seed
//       status       text   'would_map' (comprobacion) | 'mapped' (aplicado) | 'already_mapped' |
//                           'ambiguous' | 'not_found'
//       record_id    uuid   fila asignada; NULL salvo would_map/mapped/already_mapped
//   - NUNCA deduce una identidad ambigua a partir de los nombres ACTUALES: solo asigna una fila si
//     existe exactamente una candidata inequivoca en la MISMA organizacion; si hay 0 -> not_found;
//     si hay varias o la evidencia es contradictoria -> ambiguous (se informa, no se asigna). No
//     modifica customers, technicians ni activity_events.

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });

type Spec = {
  key: string;
  type: 'customer' | 'technician';
  org: 'norte' | 'sur';
  name: string;
  email: string;
  phone: string;
  notes: string;
  archived?: boolean;
};

// Firmas ORIGINALES copiadas de supabase/seeds/demo-crm.sql (version previa a TASK-010).
const F = {
  brisamar: {
    key: 'brisamar',
    type: 'customer',
    org: 'norte',
    name: 'Hotel Brisamar',
    email: 'mantenimiento@hotel-brisamar.example.com',
    phone: '+34 000 100 103',
    notes: '[DEMO] Contrato de mantenimiento preventivo trimestral de climatizacion',
  },
  costaSerena: {
    key: 'costaSerena',
    type: 'customer',
    org: 'norte',
    name: 'Hotel Costa Serena',
    email: 'mantenimiento@hotel-costa-serena.example.com',
    phone: '+34 000 100 104',
    notes: '[DEMO] Mantenimiento de calderas y produccion de agua caliente sanitaria',
  },
  rincon: {
    key: 'rincon',
    type: 'customer',
    org: 'norte',
    name: 'Hotel Rincón del Valle',
    email: 'mantenimiento@hotel-rincon-del-valle.example.com',
    phone: '+34 000 100 124',
    notes: '[DEMO] Contrato rescindido por cierre del establecimiento (archivado de demostracion)',
    archived: true,
  },
  marta: {
    key: 'marta',
    type: 'technician',
    org: 'norte',
    name: 'Marta Soler Vidal',
    email: 'marta.soler@demo-norte.example.com',
    phone: '+34 000 500 100',
    notes: '[DEMO] Especialidad: climatizacion',
  },
  ignacio: {
    key: 'ignacio',
    type: 'technician',
    org: 'norte',
    name: 'Ignacio Paredes Gil',
    email: 'ignacio.paredes@demo-norte.example.com',
    phone: '+34 000 500 106',
    notes: '[DEMO] Especialidad: electricidad. Baja de la plantilla (archivado de demostracion)',
    archived: true,
  },
  solPoniente: {
    key: 'solPoniente',
    type: 'customer',
    org: 'sur',
    name: 'Hotel Sol de Poniente',
    email: 'mantenimiento@hotel-sol-de-poniente.example.com',
    phone: '+34 000 200 101',
    notes: '[DEMO] Contrato de climatizacion y mantenimiento de piscina climatizada',
  },
} satisfies Record<string, Spec>;

const ORG_NAME = { norte: 'Demo Norte', sur: 'Demo Sur' } as const;
const OWNER = { norte: ID.ownerNorte, sur: ID.ownerSur } as const;
const ORG_ID = { norte: ID.norte, sur: ID.sur } as const;

let db: PGlite;

beforeEach(async () => {
  db = await seededOrgsDb();
});
afterEach(async () => {
  await db.close();
});

const esc = (v: string) => v.replaceAll("'", "''");

/** Instala una fila como lo hacia el seed anterior: como el owner (RLS, GRANT, trigger de archivado). */
async function install(spec: Spec, overrides: Partial<Spec> = {}): Promise<string> {
  const s = { ...spec, ...overrides };
  const table = s.type === 'customer' ? 'customers' : 'technicians';
  const nameCol = s.type === 'customer' ? 'name' : 'full_name';
  await execAs(
    db,
    OWNER[s.org],
    `insert into public.${table} (organization_id, ${nameCol}, email, phone, notes)
     values ('${ORG_ID[s.org]}', '${esc(s.name)}', '${esc(s.email)}', '${esc(s.phone)}', '${esc(s.notes)}')`,
  );
  const rows = await q(
    db,
    `select id::text from public.${table} where organization_id = $1 and ${nameCol} = $2 order by created_at desc, id desc limit 1`,
    [ORG_ID[s.org], s.name],
  );
  const id = rows[0].id as string;
  if (s.archived) {
    await execAs(
      db,
      OWNER[s.org],
      `update public.${table} set archived_at = now() where id = '${id}'`,
    );
  }
  return id;
}

async function report(mode: 'check' | 'apply'): Promise<Row[]> {
  if (mode === 'apply') await db.exec(`set nexovantis.reconcile_apply = 'on'`);
  else await db.exec(`reset nexovantis.reconcile_apply`);
  try {
    return lastRows((await db.exec(await readReconcile())) as unknown as { rows: Row[] }[]);
  } finally {
    await db.exec(`reset nexovantis.reconcile_apply`);
  }
}

const entry = (rows: Row[], spec: Spec) =>
  rows.find(
    (r) =>
      r.organization === ORG_NAME[spec.org] &&
      r.entity_type === spec.type &&
      r.fixture === spec.name,
  );

async function rowsById(ids: string[]) {
  return q(
    db,
    `select 'c' as k, id::text, name, email, phone, notes, archived_at::text, updated_at::text
       from public.customers where id = any($1::uuid[])
     union all
     select 't', id::text, full_name, email, phone, notes, archived_at::text, updated_at::text
       from public.technicians where id = any($1::uuid[]) order by 1, 2`,
    [ids],
  );
}

describe('A02-03 reconciliacion de filas demo instaladas sin identidad', () => {
  it('modo comprobacion (por defecto): informa de lo que mapearia y no persiste NADA', async () => {
    const ids = {
      brisamar: await install(F.brisamar),
      marta: await install(F.marta),
      rincon: await install(F.rincon),
    };
    const before = await fingerprint(db);
    const rows = await report('check');

    // Forma del informe.
    expect(rows.length).toBeGreaterThan(0);
    for (const col of ['organization', 'entity_type', 'fixture', 'status', 'record_id']) {
      expect(Object.keys(rows[0]), col).toContain(col);
    }
    expect(entry(rows, F.brisamar)).toMatchObject({ status: 'would_map', record_id: ids.brisamar });
    expect(entry(rows, F.marta)).toMatchObject({ status: 'would_map', record_id: ids.marta });
    expect(entry(rows, F.rincon)).toMatchObject({ status: 'would_map', record_id: ids.rincon });
    expect(entry(rows, F.costaSerena)).toMatchObject({ status: 'not_found', record_id: null });
    expect(await fingerprint(db)).toEqual(before); // ni public ni private cambian
    // Sin la variable definida o con otro valor, sigue siendo comprobacion.
    await db.exec(`set nexovantis.reconcile_apply = 'off'`);
    const off = lastRows((await db.exec(await readReconcile())) as unknown as { rows: Row[] }[]);
    await db.exec(`reset nexovantis.reconcile_apply`);
    expect(entry(off, F.brisamar)?.status).toBe('would_map');
    expect(await fingerprint(db)).toEqual(before);
  });

  it('modo aplicar: mapea, no toca clientes/tecnicos/eventos, es idempotente y el seed posterior no duplica', async () => {
    const ids = [
      await install(F.brisamar),
      await install(F.rincon),
      await install(F.marta),
      await install(F.ignacio),
      await install(F.solPoniente),
    ];
    const dataBefore = await snapshot(db);
    const legacyBefore = await rowsById(ids);

    const applied = await report('apply');
    for (const spec of [F.brisamar, F.rincon, F.marta, F.ignacio, F.solPoniente]) {
      expect(entry(applied, spec)?.status, spec.key).toBe('mapped');
    }
    expect(await snapshot(db)).toEqual(dataBefore); // la reconciliacion no escribe datos de negocio

    const again = await report('apply');
    for (const spec of [F.brisamar, F.rincon, F.marta, F.ignacio, F.solPoniente]) {
      expect(entry(again, spec)?.status, spec.key).toBe('already_mapped');
    }
    expect(await snapshot(db)).toEqual(dataBefore);

    // Seed tras reconciliar: las filas heredadas siguen identicas y no se duplican.
    await runSeed(db);
    expect(await rowsById(ids)).toEqual(legacyBefore);
    for (const spec of [F.brisamar, F.rincon, F.marta, F.ignacio, F.solPoniente]) {
      const table = spec.type === 'customer' ? 'customers' : 'technicians';
      const col = spec.type === 'customer' ? 'name' : 'full_name';
      const n = await q(db, `select count(*)::int as n from public.${table} where ${col} = $1`, [
        spec.name,
      ]);
      expect(n[0].n, `${spec.name} duplicado`).toBe(1);
    }
    const events = await q(
      db,
      `select count(*)::int as n from public.activity_events where entity_id = any($1::uuid[])`,
      [ids],
    );
    expect(events[0].n).toBe(2); // solo los archivados originales (rincon, ignacio)
    const snap = await snapshot(db);
    await runSeed(db);
    expect(await snapshot(db)).toEqual(snap); // y a partir de ahi, idempotente
  });

  it('un fixture instalado dos veces (identidad ambigua) se informa y no se asigna', async () => {
    const first = await install(F.brisamar);
    const second = await install(F.brisamar);
    const marta = await install(F.marta);
    const dataBefore = await snapshot(db);

    for (const mode of ['check', 'apply'] as const) {
      const rows = await report(mode);
      expect(entry(rows, F.brisamar), mode).toMatchObject({ status: 'ambiguous', record_id: null });
      expect(entry(rows, F.marta)?.record_id, mode).toBe(marta);
    }
    expect(await snapshot(db)).toEqual(dataBefore);
    // Ninguna de las dos filas ambiguas queda asignada: una posterior ejecucion del seed no las altera.
    const ambiguousBefore = await rowsById([first, second]);
    await runSeed(db);
    expect(await rowsById([first, second])).toEqual(ambiguousBefore);
    const names = await q(
      db,
      `select count(*)::int as n from public.customers where id = any($1::uuid[]) and name = 'Hotel Brisamar'`,
      [[first, second]],
    );
    expect(names[0].n).toBe(2);
  });

  it('no deduce identidades a partir de nombres actuales: renombres cruzados no se asignan al fixture equivocado', async () => {
    // P era Hotel Brisamar (datos de contacto de Brisamar) y hoy lleva el nombre de Hotel Costa Serena.
    // Q era Hotel Costa Serena (datos de contacto de Costa Serena) y hoy se llama distinto.
    const p = await install(F.brisamar, { name: 'Hotel Costa Serena' });
    const qid = await install(F.costaSerena, { name: 'Hotel Costa Serena (antiguo)' });
    const dataBefore = await snapshot(db);

    for (const mode of ['check', 'apply'] as const) {
      const rows = await report(mode);
      // Costa Serena nunca se asigna a P solo porque P tenga hoy ese nombre.
      expect([null, qid], `${mode} costa serena`).toContain(
        entry(rows, F.costaSerena)?.record_id ?? null,
      );
      expect([null, p], `${mode} brisamar`).toContain(entry(rows, F.brisamar)?.record_id ?? null);
      expect(entry(rows, F.costaSerena)?.record_id).not.toBe(p);
    }
    expect(await snapshot(db)).toEqual(dataBefore);
  });

  it('no mapea filas de otra organizacion aunque coincidan con un fixture de esta', async () => {
    // Hotel Brisamar existe SOLO en Demo Sur (instalado a mano): no es un fixture de Demo Sur.
    const foreign = await install(F.brisamar, { org: 'sur' });
    const rows = await report('check');
    expect(entry(rows, F.brisamar)).toMatchObject({ status: 'not_found', record_id: null });
    expect(rows.some((r) => r.record_id === foreign)).toBe(false);
    const applied = await report('apply');
    expect(applied.some((r) => r.record_id === foreign)).toBe(false);
  });

  it('el informe cubre cada fixture sin duplicar entradas y sin filas de otras entidades', async () => {
    await install(F.brisamar);
    const rows = await report('check');
    const keys = rows.map(
      (r) => `${r.organization as string}|${r.entity_type as string}|${r.fixture as string}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(rows.every((r) => ['Demo Norte', 'Demo Sur'].includes(r.organization as string))).toBe(
      true,
    );
    expect(rows.every((r) => ['customer', 'technician'].includes(r.entity_type as string))).toBe(
      true,
    );
    expect(
      rows.every((r) =>
        ['would_map', 'mapped', 'already_mapped', 'ambiguous', 'not_found'].includes(
          r.status as string,
        ),
      ),
    ).toBe(true);
  });
});
