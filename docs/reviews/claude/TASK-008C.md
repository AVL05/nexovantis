# TASK-008C — Seed demo de clientes y técnicos (registro de Orchestrator)

- **Fecha:** 2026-11-24.
- **Rama y base:** `feat/supabase-auth`, base `3617d58`. Sin commit ni push, por instrucción humana.
- **Clasificación:** estándar. Develop implementa, Testing hace el POST y Orchestrator lo aplica en Cloud con autorización humana expresa, limitada a "Demo Norte" y "Demo Sur".
- **Modelos y esfuerzo efectivos:** no verificables.
- **Archivos:**
  - `supabase/seeds/demo-crm.sql`: no es una migración; `[db.seed]` sigue desactivado.
  - `tests/integration/seed-demo.test.ts`.
  - [docs/SEED.md](../../SEED.md): procedimiento reutilizable.
  - Una línea en `docs/SUPABASE_CLOUD.md`.

## Fases
| Fase | Agente | Resultado |
|---|---|---|
| DEV | develop | Seed transaccional que actúa como owner (claims + `set local role authenticated`), idempotente por organización y nombre. Prueba PGlite 13/13. |
| POST | testing | **PASS** previo a la aplicación ([TASK-008C-POST](TASK-008C-POST.md)). H-1 Low y H-2 Informational. |

Comprobación Git antes y después de cada delegación:
- SHA `3617d58` y staging vacío.
- Ignorados sensibles sin cambios.
- Diferencias limitadas a los archivos permitidos y al informe de Testing.

## Aplicación en Supabase Cloud (Orchestrator, conector, 2026-11-24)
- **Preparación:**
  - El conector ejecuta como `postgres`, que es miembro de `authenticated`.
  - Se ejecutó el contenido de `demo-crm.sql` con hash `e44cc0f5…`, sin comentarios de cabecera.
  - No se desactivaron triggers ni se usó `service_role`.
  - No se insertó en `activity_events` ni se borró nada.
- **Recuentos tras la primera ejecución** (mismos valores que los objetivos):

  | Organización | Clientes activos/archivados | Técnicos activos/archivados | Eventos `archived` | Eventos con actor = owner | Eventos huérfanos | Nombres duplicados |
  |---|---|---|---|---|---|---|
  | Demo Norte | 24 / 3 | 6 / 2 | 5 | 5 | 0 | 0 |
  | Demo Sur | 8 / 2 | 3 / 1 | 3 | 3 | 0 | 0 |

- **Aislamiento por RLS:** se comprobó simulando la sesión de cada uno de los 3 miembros reales (claims + rol `authenticated`), cada uno contando las filas que ve.
  - Norte (owner y member): ven 27 clientes, 8 técnicos y 5 eventos, con 0 filas de otra organización.
  - Sur (owner): ve 10 clientes, 4 técnicos y 3 eventos, con 0 filas de otra organización.
- **Idempotencia real:** la segunda ejecución completa deja todo igual: 37 clientes, 12 técnicos, 8 eventos y el mismo `max(updated_at)`. Al terminar, el rol vuelve a `postgres`.
- **App:** en `/customers`, con la sesión del owner de Demo Norte, se ven «24 clientes», página 1 de 2 con 20 filas y sin scroll horizontal.

## Hallazgos y pendientes
- **H-1 (Low, pendiente de aceptación humana):** volver a ejecutar el seed archiva otra vez un registro designado que alguien haya restaurado, con un evento a nombre del owner. Está documentado en SEED.md. Se puede evitar comprobando si existe un evento `restored` para esa entidad.
- **H-2 (Informational):** SEED.md podría añadir las consultas de actor y de aislamiento usadas aquí.
- **TASK-008B-M2 (mejora visual menor, nueva):** en la tabla de clientes, a anchos de escritorio intermedios, el teléfono y el email se parten en dos líneas. El teléfono necesita `whitespace-nowrap` y el email un truncado o ajuste más legible. No bloquea.
- No se han creado órdenes, presupuestos ni inventario. No se ha empezado TASK-009.
