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
