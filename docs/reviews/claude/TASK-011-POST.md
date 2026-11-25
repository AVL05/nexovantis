# TASK-011 POST — Testing independiente de F4 (ordenes y panel)

- Fecha: 2026-11-25. Rama `feat/work-orders-dashboard`, HEAD `4ea5739` + cambios sin commit (diff + untracked). Modelo solicitado: Sonnet medium (efectivo no observable).
- Entorno: Windows, Node/pnpm locales, PGlite (PostgreSQL real in-process con shim de auth). Sin Docker: sin Supabase/PostgREST/Auth real, sin Playwright contra stack.

## Veredicto: BLOCKED

Sin defectos Critical/High/Medium ni incumplimientos detectados en lo ejecutable. BLOCKED solo por lo no verificable localmente (concurrencia real, PostgREST/JWT real, E2E con Auth real, revision visual). No se convierte en PASS sin el job `supabase` de CI sobre el SHA objetivo.

## Por criterio

| Criterio | Veredicto | Evidencia |
|---|---|---|
| Listado/busqueda/filtros/paginacion | PASS (logica) / BLOCKED (consulta PostgREST real) | Pruebas unitarias independientes de `params`/`buildOrdersHref` (invalidos a defecto, ida y vuelta). Revision de `service.list`: busqueda via `buildSearchFilter`. |
| Alta, tecnico opcional nace asignada, created+assigned (DH-13) | PASS | PGlite: matriz y eventos. |
| Detalle con historial | PASS (datos) / BLOCKED (render real) | Eventos+detalle verificados en PGlite; UI no renderizada contra datos reales. |
| Edicion solo no terminales (DH-07) | PASS | Matriz RPC 5 estados x 6 operaciones; terminal NX003 y por SQL admin. |
| Asignar/reasignar solo en asignada (DH-01) | PASS | Matriz RPC; tecnico inmutable en en curso/terminales por SQL admin. |
| Transiciones sin saltos ni retrocesos (DH-03) | PASS | 20 pares de estado por SQL de administracion (6 permitidos, 14 NX001) + matriz RPC. |
| Cancelar desde pendiente/asignada/en curso, motivo opcional (DH-02) | PASS | Motivo recortado, vacio a null, max 200 (22001), no sobrescribible. |
| Terminales inmutables | PASS | RPC y SQL admin; delete/truncate rechazados. |
| Eventos: actor no nulo, misma transaccion, inmutables (DH-08/BR08) | PASS | Actor owner/member correcto; sin `auth.uid()` falla 23000 sin rastro; rollback atomico; UPDATE/DELETE/TRUNCATE rechazados incluso como superusuario. |
| DH-04/DH-05 en PostgreSQL | PASS | Cada estado de orden x tecnico/cliente (NX004 solo donde corresponde), via RPC/admin, sin evento en el rechazo; reasignar libera/bloquea. |
| Concurrencia asignar vs archivar sin deadlock | PASS (secuencial, por analisis de bloqueos) / BLOCKED (concurrencia real) | Entrelazados A-B y B-A, misma transaccion, y propiedad aleatoria de 250 ops (invariantes y contabilidad de eventos). El diseno de bloqueos (FOR SHARE vs UPDATE de la fila, orden unico orden→cliente→tecnico) es correcto por analisis; la prueba multiconexion `work-orders.supabase.test.ts` es CI. |
| RLS/BR01 incl. PostgREST | PASS (PGlite: privilegios, RLS, funciones) / BLOCKED (PostgREST real) | Catalogo: solo SELECT, sin INSERT/UPDATE/DELETE/TRUNCATE para anon/authenticated, SECURITY DEFINER con `search_path=""`, sin EXECUTE para anon/PUBLIC, envoltorios INVOKER. Otra organizacion: NX005 indistinguible de inexistente. |
| Cliente/tecnico de otra org o archivados invalidos | PASS | NX002 en alta y asignacion; FK compuesta tambien por SQL admin. |
| Idempotencia de reintentos | PASS | Mismo id: sin duplicado ni eventos; no-ops sin evento; id ajeno 23505. |
| Dashboard indicadores reales/pendientes/actividad/accesos | PASS (codigo, tests Develop, build) / BLOCKED (render con BD real) | `dashboard()` cuenta por estado bajo RLS; `next build` OK. No renderizado. |
| Seed demo idempotente | PASS | 22 ordenes; 3 ejecuciones con cambios de usuario entre medias: sin recrear/revertir ni eventos; org no demo intacta; aborta atomico con 2 owners; sin DML destructivo; sesion restaurada. NO ejecutado en Cloud. |
| UI responsive y accesible | BLOCKED | App no levantable con datos (sin Supabase). Revision estatica: etiquetas visibles, `aria-describedby`, `role=search`, `LiveRegion`, Dialog. Sin revision visual. |
| 10 migraciones previas sin cambios | PASS | `git diff --name-only -- supabase/migrations` vacio; solo se anade `20261126090000`. |

## Comandos (exit codes)

- `pnpm format:check` 0; `pnpm lint` 0 (tras corregir un warning propio); `pnpm typecheck` 0; `pnpm build` 0 (rutas `/orders`, `/orders/[id]`, `/orders/[id]/edit`, `/orders/new`).
- `pnpm test:unit`: 36 archivos, 813 tests OK (antes de actualizar la prueba independiente fallaba 1: ver abajo).
- `pnpm test:integration` (PGlite): 18 archivos, 693 tests OK, incluidas las nuevas.
- No ejecutados: `test:supabase`, `test:e2e:supabase`, Playwright: requieren Docker/Supabase (BLOCKED, CI).

## Pruebas independientes anadidas (Testing)

- `tests/integration/independent/work-orders-post.test.ts` (83): matriz de transiciones por tabla, matriz RPC estado x operacion, eventos/actor/atomicidad/inmutabilidad, catalogo de privilegios y SECURITY DEFINER, RLS y aislamiento, validaciones, DH-04/05 por estado, entrelazados y propiedad aleatoria.
- `tests/integration/independent/seed-orders-post.test.ts` (7): idempotencia, no destructividad, atomicidad, fixture archivado.
- `tests/unit/independent/work-orders-post.test.ts` (51 con la prueba de shell): esquemas Zod, parametros, `availableActions` vs matriz de BD, `mapDbError`, fechas Madrid, comprobaciones estaticas (sin clave de servicio, sin escritura directa, actions con `requireTenant`).

## Aprobacion de cambio en prueba independiente

`tests/unit/independent/app-shell-a11y.test.tsx`, caso de navegacion: antes exigia "Ordenes sin enlace" (TASK-008B). Choca con el alcance aprobado de F4 (`/orders` activo). Decision de Testing (propietario): se actualiza para exigir `/orders` enlazado como cuarto elemento, con `aria-current` solo en el Panel. Sigue siendo estricto (orden y conjunto exactos de enlaces). Aprobada y registrada aqui.

`tests/e2e-supabase/independent/**`: revision estatica; solo dependen de `org-name`, `user-role` y rutas; no usan la tarjeta "Proximamente" ni indicadores. Sin impacto previsto; ejecucion real en CI.

## Revision de pruebas de Develop

Sin `.skip/.only/xit/xtest/.todo` ni aserciones debiles (un `expect.anything()` legitimo en un `objectContaining`). Unico test de Develop modificado: `tests/unit/crm-routes.test.ts` (amplia cobertura de `/orders` y navegacion; coherente con el alcance). Archivos fuera de `src/`, `supabase/`, `tests/`: `docs/ARCHITECTURE.md` y `docs/SEED.md` modificados (no pude contrastar con la lista permitida del handoff, que no recibi).

## Hallazgos (ninguno bloquea; requieren aceptacion humana registrada)

- Low — `src/features/work-orders/service.ts` `matchingCustomerIds`: la busqueda por nombre de cliente se limita a 100 clientes (`MAX_SEARCH_CUSTOMERS`); con mas coincidencias algunas ordenes no aparecen en la busqueda. Reproduccion: organizacion con mas de 100 clientes con el mismo texto. Impacto bajo en MVP.
- Informational — `private.create_work_order`: un `p_id` ya existente en la misma organizacion devuelve el id existente sin comparar los datos (idempotencia por id); un id de otra organizacion devuelve 23505 (revela solo la existencia de un UUID aleatorio). Aceptable.
- Informational — `OrderActions.tsx`: el dialogo de cancelacion se cierra tambien si la accion falla (el error se muestra en la alerta superior). Sin perdida de datos.

## Pendiente (BLOCKED, CI sobre el SHA objetivo)

`pnpm test:supabase` (incluye concurrencia real asignar/archivar, doble envio y PostgREST/JWT), `pnpm test:e2e:supabase` (flujo de ordenes, panel y suites independientes de TASK-007/010), revision visual responsive/accesibilidad en navegador, y reconciliacion/ejecucion del seed en Cloud (requiere decision humana).

## Archivos y comprobacion Git

Escritos por Testing: los 3 tests nuevos arriba, `tests/unit/independent/app-shell-a11y.test.tsx` y este informe. Sin tocar `src/`, `supabase/`, `package.json`, `.github/` ni otros docs. Sin commit.
