# TASK-011 — F4 Órdenes de servicio y dashboard

Registro único del módulo. Rama `feat/work-orders-dashboard`, base `4ea5739`. Modelo/esfuerzo efectivos: no verificables (solicitado Sonnet medium).

## Delegación y criterios
- Orchestrator fijó criterios y rutas; sin PRE (riesgos conocidos RLS/invariantes/concurrencia cubiertos con criterios explícitos y POST dirigido).
- Decisiones humanas aprobadas (2026-11-25): DH-01, 02, 03, 07, 08 y 13; DH-04 y DH-05 aplicadas. Registro en [BUSINESS_RULES.md](../../BUSINESS_RULES.md).
- Develop: implementación completa. Migración `20261126090000_task011_work_orders.sql`, seed `supabase/seeds/demo-orders.sql`, UI `/orders` y dashboard. No aplicada en Cloud.
- Testing POST independiente: [TASK-011-POST](TASK-011-POST.md), **BLOCKED** solo por comprobaciones sin Docker (concurrencia real, PostgREST/JWT, E2E, revisión visual); sin Critical/High/Medium.
- Commit `5c30155`; CI completa en verde sobre ese SHA.

## AUDIT-003 (Codex) sobre `5c30155`: FAIL
CI completa en verde; dos defectos confirmados:
1. **BR04**: indicadores y órdenes pendientes del dashboard se obtenían con varias consultas sin snapshot común; pueden ser incoherentes entre sí.
2. **TC-CANC-02**: una segunda cancelación no comunicaba que la orden ya estaba cancelada (contrato RPC y respuesta de la acción ambiguos).

Corrección dirigida (TASK-011-FIX): dashboard en una única sentencia bajo RLS con SECURITY INVOKER, sin privilegios elevados; resultado de cancelación distinguible y mensaje alineado; prueba del seed para el Supabase aislado de CI. Resultados de Develop/Testing: véase abajo.

## Mejoras diferidas a F7 (aceptadas por el humano)
- Búsqueda por nombre de cliente limitada a 100 clientes coincidentes (`MAX_SEARCH_CUSTOMERS`) — Low.
- El diálogo de cancelación se cierra aunque la acción falle — Informational.
- Un `p_id` repetido en la misma organización devuelve la orden existente — Informational.

## Alcance de concurrencia comprobado
Bajo el aislamiento predeterminado de PostgREST (READ COMMITTED): orden de bloqueo único orden → cliente → técnico con `FOR SHARE` al asignar y bloqueo de la propia fila al archivar; sin deadlock en los entrelazados A-B/B-A secuenciales y 250 operaciones aleatorias con semilla fija (PGlite, una conexión). La concurrencia real con varias conexiones (incluida asignación vs archivado y 40P01) se ejerce en el job `supabase` de CI. No se afirma serializabilidad ni garantías bajo REPEATABLE READ/SERIALIZABLE. Los indicadores del dashboard son consistentes porque se calculan en una sola sentencia (un snapshot), no por una transacción de lectura.

## Resultado de TASK-011-FIX
- Develop: migración `20261126090000` editada en sitio (no aplicada en Cloud): `public.work_orders_dashboard` (SECURITY INVOKER, una sentencia, `search_path` fijo, solo `authenticated`) y `cancel_work_order` devuelve `'cancelled' | 'already_cancelled'`; `service.ts`, `cancelOrderAction` ("La orden ya estaba cancelada.") y tests alineados; nuevo `seed-orders.supabase.test.ts` para el Supabase aislado de CI (usa `psql` y por defecto `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, con guarda de host local; que el runner traiga `psql` es hipótesis sin verificar, Low).
- Testing RETEST: **FAIL** (High: `work-orders.supabase.test.ts` esperaba el booleano de cancel en cancelaciones concurrentes). Corregido por Develop; RETEST-2 **PASS local** (130 tests de integración PGlite de los archivos afectados + 662 en el RETEST previo, 123 unit, tsc/eslint/prettier). Detalle en [TASK-011-POST](TASK-011-POST.md).
- Pruebas independientes actualizadas por Testing (propietario) al nuevo contrato, sin relajar aserciones.
- **BLOCKED local** (sin Docker): `work-orders.supabase.test.ts`, `seed-orders.supabase.test.ts` y E2E; los valida CI sobre el SHA objetivo. Sin build ni suites completas locales (por instrucción).
