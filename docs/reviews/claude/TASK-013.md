# TASK-013 — F6 Inventario y actividad (registro)

- Fecha: 2026-11-25. Rama `feat/inventory-activity`, base `0a221e6`. Flujo orientado a entrega (Sonnet medium; esfuerzo efectivo no observable). Sin PRE: riesgos conocidos (RLS, invariantes, concurrencia) cubiertos por criterios explícitos y POST dirigido.
- Decisión humana (2026-11-25, aprobación conjunta): INV-1..INV-9 y DH-08 ACTIVITY P1 tal como se propusieron (registradas en docs/BUSINESS_RULES.md y docs/ARCHITECTURE.md).

## Delegación
| Fase | Agente | Resultado |
|---|---|---|
| DEV1 | develop | Módulo completo: migración `20261128090000_task013_inventory.sql`, seed `demo-inventory.sql`, `src/features/inventory`, `/inventory`, `/activity`, tarjeta de dashboard y tests propios. Bloqueo por dos archivos fuera de la lista (navegación y rutas protegidas), ampliados por Orchestrator. |
| POST | testing | **BLOCKED** (solo concurrencia real pendiente de CI) + F-1 (Medium): `seq` de `stock_movements` evaluado antes del bloqueo. Informe: [TASK-013-POST](TASK-013-POST.md). |
| DEV2 | develop | F-1 corregido: `seq` asignado en el trigger tras `FOR UPDATE`, sin default, no manipulable. |
| RETEST | testing | **BLOCKED** solo por concurrencia real en CI; sin hallazgos nuevos. |

## Comprobación Git
HEAD `0a221e6` y rama sin cambios durante las delegaciones; sin staging; diferencias dentro de la lista permitida más `src/features/navigation/items.ts` y `src/features/auth/routes.ts` (ampliación autorizada por Orchestrator) y los tests de Testing (`tests/unit/independent/app-shell-a11y.test.tsx`, `activity-madrid-range.test.ts`). Ignorados sensibles sin cambios respecto a la línea base.

## Resultados locales (reales, de los informes)
- Integración PGlite inventario: 55/55; regresión dirigida de integración 180/180; unit 69/69 y 90/90 en los dirigidos; typecheck, lint y format:check en verde.
- Tras Develop: unit completa 902/903; el fallo (lista exacta del lateral) lo corrigió Testing por ser propietario del test.

## Decisiones y desviaciones
- `stock_movements.order_id` sin FK a `work_orders`: una FK cambiaría el error 23000 de los tests independientes de F4 por 0A000; la misma organización y el estado no terminal los garantiza el trigger con `FOR SHARE`. Testing: suficiente, serializa con cancelar/completar sin deadlock.
- Actor mostrado como "Tú", "Miembro" o "Antiguo miembro" (sin tabla de perfiles).
- Edición en ruta propia `/inventory/[id]/edit`.

## Pendiente
- CI sobre el SHA objetivo: `pnpm test:e2e:supabase` (inventario y actividad: salidas concurrentes, misma clave en paralelo, archivar vs mover, consumir vs cancelar, referencia duplicada, ACL real de la secuencia) y regresión completa.
- Migración y seed **no aplicados en Cloud**.
- Sin revisión visual en navegador (375–1440 px) todavía.
- Hallazgos Low/Informational de Testing (tests e2e de carrera probabilísticos, orden de `/activity` por `occurred_at`, seed cerrado ante referencia demo existente, reutilización de `requestId`) en TASK-013-POST, para F7 con aceptación humana.
- G4 con Codex sobre presupuestos e inventario.

## DIAGNOSTICO-CI-001 (arnes E2E, Testing)
Correccion solo de tests tras el diagnostico de Codex sobre 984a59e (7 puntos verificados contra el codigo; los 7 confirmados): mundos aislados por spec (`getCrmWorld(clave)`), selectores/etiquetas propios, esperas de control antes de ausencias, espera del error de validacion decimal, dia de Madrid desde `occurred_at`, paginacion real (20 + 1) y casos de actividad sin `serial`. Detalle, implicaciones de login/CI y resultados en TASK-013-POST.md. Local: tsc/eslint/prettier OK, `--list` 85 (antes 82). E2E real BLOCKED por CI. Sin commit (lo hace Orchestrator).

## AUDIT-004 / TASK-013-FIX (G4, Codex FAIL sobre c600a31)
Informe de Codex no incluido en el repositorio; hallazgos tal como los comunicó el humano (CI anterior 2097/2097 PASS).
- DEV3 (develop): G4-01 saldo aplicado solo por un AFTER INSERT (un `ON CONFLICT DO NOTHING` no modifica existencias; INSERT multifila cubierto); G4-02 `work_orders.id` inmutable; G4-03 guarda `quotes_guard_accept` (≥1 concepto y orden creada en la misma transacción, mismo actor y cliente, sin variable de sesión); seed de consumos limitado a órdenes de `private.demo_fixture_identity` (regresión con órdenes no demo); `private.quote_label` corregido para números > 9999. Migración de inventario `20261128090000` editada (no aplicada en Cloud) y migración aditiva nueva `20261128100000_task013_fix_orders_quotes_hardening.sql`; ninguna de las 12 migraciones aplicadas se modificó. Límite documentado en ARCHITECTURE.md: un superusuario que desactive triggers o altere el esquema no está cubierto.
- POST/G4-04 (testing): **BLOCKED** solo por concurrencia real y E2E pendientes de CI. Local: 95 tests dirigidos y 286 de regresión (9 archivos) en PGlite, tsc/eslint/prettier limpios; 20 tests independientes nuevos en PGlite y 8 para CI (`tests/integration/supabase/independent/task013-fix.supabase.test.ts`). Aserciones de visibilidad debilitadas por DIAGNÓSTICO-CI-001 recuperadas (`playwright --list`: 85). Detalle en [TASK-013-POST](TASK-013-POST.md).
- Hallazgos para aceptación humana: **Low** — la guarda de G4-03 acepta una orden creada en la misma transacción por otra vía (p. ej. `create_work_order` + UPDATE por SQL administrativo de varias sentencias); el UNIQUE de `order_id` impide compartirla. **Informational** — INSERT multifila de varios artículos en orden distinto desde dos sesiones puede dar interbloqueo (la RPC de una fila no); `pg_trigger_depth() < 2` preexistente.
- Incidente de Testing: un `git stash` accidental revertido de inmediato con `git stash pop`; árbol idéntico y lista de stash vacía (verificado por Orchestrator).
- Migraciones pendientes en Cloud: `20261128090000` y `20261128100000` (más el seed `demo-inventory.sql`); no aplicadas.

## TASK-013-FIX-2 (cierre de G4-03, AUDIT-004-RETEST FAIL sobre 648da09)
- Problema: la guarda por `xmin` admitía una orden creada independientemente en la misma transacción (incumple BR05).
- DEV4 (develop): `quotes_guard_accept` y el `xmin` eliminados. Nuevo trigger BEFORE UPDATE `private.quotes_accept_create_order()` que crea la orden dentro de la transición draft→accepted y asigna `order_id`; cualquier `order_id` suministrado se rechaza (23503); `accept_quote` redefinida sobre esa operación con su API pública intacta. Solo se modificó la migración pendiente `20261128100000`.
- POST dirigido (testing): **BLOCKED** solo por CI (concurrencia real y PostgREST). Local: 13 archivos y 390 tests PGlite en verde, tsc/eslint/prettier de tests OK, huella de datos idéntica al aplicar la migración sobre presupuestos aceptados. Regresión invertida (enlazar una orden independiente de la misma transacción exige rechazo); `task013-fix-post.test.ts:408` pasa de 23505 a 23503 estricto. Informational: finales CRLF normalizados a LF al commit. Detalle en [TASK-013-POST](TASK-013-POST.md).
- Migraciones de F6 pendientes en Cloud: `20261128090000` y `20261128100000` (más el seed `demo-inventory.sql`), no aplicadas.
