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

## AUDIT-003-RETEST (Codex) sobre `2bb4e69`: FAIL → corregido
CI 45610056050 en verde. BR04, ratificación DH e idempotencia del seed aprobadas por Codex (no reabiertas). Dos hallazgos:
1. **TC-CANC-02**: la segunda cancelación debía devolver `status: 'error'` con «La orden ya estaba cancelada.». Corregido en `cancelOrderAction` (sin `revalidatePath`); estado, motivo e historial intactos; criterio de aceptación sin cambios.
2. **High, `seed-orders.supabase.test.ts`**: `psql` podía conectar a un destino distinto del stack local desechable. Corregido (TASK-011-FIX2): conexión fija a 127.0.0.1:54322 sin URLs a libpq, `SUPABASE_DB_URL` solo si es exactamente la autorizada, entorno del hijo construido desde cero con PG* fijas, cualquier otra PG*/PSQLRC rechazada, `-X --no-psqlrc`, guarda y comprobación cruzada de solo lectura (puerto, `auth.users`, `organizations`) antes de cualquier escritura o cliente privilegiado. Módulo `tests/support/local-psql-guard.ts`.

Testing RETEST-3: H1 **PASS**, H2 **PASS** en local (revisión estática y 19 unit en verde, eslint/prettier OK; `tsc` solo muestra 2 errores ajenos en `.next/types/validator.ts`, artefacto ignorado por git). La ejecución real del test del seed sigue **BLOCKED** local (sin Docker/`psql`) hasta CI sobre el nuevo SHA; que `ubuntu-latest` traiga `psql` es hipótesis sin verificar (Low). Detalle en [TASK-011-POST](TASK-011-POST.md).

## CI 45618668319 sobre `058fc54`: supabase FAIL → corregido (TASK-011-FIX3)
`quality` PASS; `supabase` FAIL en `assertSameLocalStack` («PostgreSQL no escucha en el puerto local autorizado»): la guarda comparaba `SHOW port` con el puerto publicado 54322, pero PostgreSQL dentro del contenedor escucha en 5432. Corrección: el cliente sigue fijo a `127.0.0.1:54322` (publicado) y el servidor debe informar exactamente `5432` por `SHOW port` e `inet_server_port()` (`assertServerPort`, sin rangos). Se conservan conexión fija, entorno saneado, rechazo de PG*/PSQLRC/`SUPABASE_DB_URL` y comprobaciones cruzadas API↔PostgreSQL. Testing RETEST-4: **PASS local** (17 unit, eslint/prettier OK); ejecución real del job BLOCKED local, pendiente de CI.

## Cloud y revisión visual T10 (2026-11-25, autorizados por el humano)
- **AUDIT-003-RETEST-2: PASS** sobre `4ac0244`; CI 45620418326 en verde.
- **Cloud (`nexovantis`)**: 11/11 migraciones aplicadas (última `20261126090000`). Precondiciones de SEED.md verificadas (1 owner por organización; Demo Norte 24 clientes/6 técnicos activos, Demo Sur 8/3; 0 órdenes). `demo-orders.sql` ejecutado con autorización humana.
- **Recuentos**: Demo Norte 15 (5 pendientes, 3 asignadas, 2 en curso, 4 completadas, 1 cancelada); Demo Sur 7 (2/1/1/2/1); 22 órdenes, 22 identidades de fixture, 54 eventos `activity_events` y 54 detalles, 0 eventos sin actor.
- **Idempotencia**: segunda ejecución → mismos recuentos (0 órdenes y 0 eventos nuevos).
- **T10 visual** (Premium Frontend Director, solo lectura, sesión owner Demo Norte, navegador del panel): dashboard coherente con BD (5/3/2/4/1, abiertas 10, vencidas 2, total 15; pendientes y actividad reciente reales; accesos rápidos presentes); `/orders` (listado, filtros), detalle (acciones y historial, orden completada de solo lectura) y `/orders/new` a 375, 768, 1024 y 1440 px sin desbordes horizontales ni errores de consola; teclado: foco visible (outline 2 px), diálogo de cancelación modal con foco inicial en el motivo, Escape lo cierra y devuelve el foco. No se ejecutaron acciones de escritura desde la UI ni axe/Lighthouse. Observación Low (F7): a 375 px el bloque de filtros ocupa la primera pantalla y empuja el listado; podría plegarse. No se detectaron defectos que bloqueen.

## Cierre de F4 y G3 (decisión humana, 2026-11-25)
El humano acepta las observaciones menores y las mejoras diferidas a F7 (límite de 100 clientes en la búsqueda, diálogo de cancelación que se cierra ante error, `p_id` repetido, filtros a 375 px, pendientes de axe/Lighthouse y de comprobación manual de escritura por UI en Cloud) y autoriza el cierre de G3 y F4 con las evidencias y limitaciones registradas: AUDIT-003-RETEST-2 PASS sobre `4ac0244`, CI 45620418326 en verde, Cloud 11/11, seed idempotente y revisión visual T10. Merge y push de la rama: pendientes de autorización humana específica.
