# TASK-010-POST: verificación independiente de la remediación de AUDIT-002

TASK-ID: TASK-010 (crítica). Fase: POST. Fecha: 2026-11-25. Agente: Testing.
Modelo/esfuerzo solicitados: Sonnet / high; efectivos: no verificables (autoinformado).
Rama `feat/supabase-auth`, SHA base `7cc19be50dc3107e33e6169df66868f960504b12`, diff final: árbol de trabajo sin commit (22 archivos M, 31 rutas `??` al inicio; ver "Archivos").
Entorno: Windows 11, Node 24.22.2, pnpm 12.16.1, Git 2.56.0; sin Docker, sin Supabase CLI, sin red externa, sin Cloud.
Git antes: M en docs (6), src (6), supabase/seeds, tests (11), `vitest.supabase.config.mts`; `??` migraciones 090000..090300, `supabase/checks/`, `supabase/seeds/reconcile-demo-crm.sql` y los tests independientes del PRE. Después: lo mismo más `?? tests/integration/independent/task010-post-hardening.test.ts` (mío) y una corrección en `tests/integration/independent/activity-order.test.ts` (mía). No se tocó `src/`, `supabase/`, `tests/support/`, tests de Develop, configs, `.github/` ni `.claude/`. La compilación (`pnpm build`) no dejó cambios rastreados.

## Veredicto

**BLOCKED** (solo por evidencia pendiente de CI). Sin hallazgos Critical/High ni incumplimientos de criterios abiertos en la validación local: unit 582/582, PGlite 544/544, format, lint, typecheck y build con exit 0. Los criterios que exigen Auth y PostgREST reales (L-08, N-04, R-08, E-06) y Playwright con Auth real (L-07, R-09, X-05, `crm.spec.ts`) no se pueden ejecutar aquí, y las directrices prohíben convertir esa falta en PASS. Pasa a PASS si el job `supabase` de CI sobre el mismo SHA (tras el commit que decida el humano) supera `pnpm test:supabase` y `pnpm test:e2e:supabase`, y el job `quality` queda en verde.

## Hallazgos

| ID | Gravedad | Archivo/línea | Descripción | Estado |
| --- | --- | --- | --- | --- |
| P-01 | Informational (defecto de MI prueba, corregido) | `tests/integration/independent/activity-order.test.ts` (`eventsBySeq`, ~54-62; consulta de ~247) | Develop acertó. `select ..., seq::text as seq ... order by seq` ordena por la columna de SALIDA (texto: `'10' < '8'`), no por la columna bigint. Fallaba «en transacciones distintas el seq crece con el orden de confirmación» (customers): recibido `[restored, archived, restored]`, esperado `[archived, restored, archived]`, por el orden léxico y no por defecto de implementación. Corrección: `order by public.activity_events.seq` (columna calificada), en las dos consultas con el alias. No se debilita ninguna aserción (siguen acción, orden estrictamente creciente y no nulidad). Verificado: 12/12 en verde sin tocar la implementación. | Cerrado |
| P-02 | Informational | `src/features/auth/actions.ts` + `src/app/login/page.tsx` | Si además del fallo de revocación falla `cookies()` (doble fallo) y la sesión local sigue viva, `/login` redirige a `/dashboard` antes de mostrar el aviso: el usuario queda dentro sin mensaje. No afirma cierre, no abre brecha; solo es un caso límite de UX. | Sin acción; para conocimiento |
| P-03 | Informational | `playwright.supabase.config.ts:27` | El `webServer` recibe `NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL` antes de que actúe el guardia (que corre en el mundo de las pruebas). No hay tráfico a Supabase hasta que una prueba navega y el guardia ya habría impedido crear el cliente administrativo. Sin brecha; el guardia no cubre la configuración de Playwright. | Sin acción; para conocimiento |
| P-04 | Informational | `docs/SEED.md`, reconciliación en modo aplicar | El modo aplicar depende de `set nexovantis.reconcile_apply` en la MISMA sesión. Si el editor SQL de Supabase usara otra conexión, el modo degradaría a comprobación (`would_map`): falla en el lado seguro. | Sin acción |
| P-05 | Informational | handoff/informe de Develop | No hay informe de Develop (`TASK-010.md`: "Fases: se completa al cierre") ni lista permitida a comparar. No puedo verificar que los archivos modificados pertenezcan a la lista del handoff ni quién escribió cada documento de `docs/`. Los archivos compartidos nuevos `tests/support/local-supabase.ts` y `tests/support/supabase-local-guard.setup.ts` deben constar en el handoff (propiedad compartida). | Pendiente de Orchestrator |

No hay hallazgos de Medium o superior.

## Matriz A02-01..A02-07

| ID | Corrección (revisada en el diff) | Pruebas | Evidencia local | Pendiente de CI | Estado |
| --- | --- | --- | --- | --- | --- |
| A02-01 High | `logoutAction`: `redirect('/login')` solo si `signOut` no devuelve error; error devuelto o excepción -> borra cookies `^sb-.+-auth-token(\.\d+)?$` (cada borrado y el almacén protegidos) y redirige a `/login?aviso=cierre-no-confirmado` (valor fijo, sin el error); `redirect` fuera de los `try`. `/login` muestra aviso fijo (sin afirmar cierre remoto). R1 sin cambios | U `logout-action` (L-01..L-05), U `login-logout-notice` (L-06), S `logout-revocation` | Unit verde (582) | L-08 (sesión copiada sigue válida si falla la revocación y deja de valer si se confirma), L-07 E2E | Código y unit superados; CI pendiente |
| A02-02 High | `tests/support/local-supabase.ts` (`assertLocalSupabaseUrl`: http, host exacto `127.0.0.1\|localhost\|[::1]`, sin credenciales/ruta; `requireLocalSupabaseEnv`) usado por `rls.supabase`, `archive-restore.supabase`, `support/stack.ts`, `crm-world.ts`, `world.ts`; además `setupFiles` en `vitest.supabase.config.mts`. No quedan lecturas directas de `SUPABASE_URL` en los tests | U `local-supabase-guard` (G-01..G-04, G-06), U `supabase-suites-remote-guard` (G-05: 7 destinos, proceso hijo con las suites reales) | Unit verde: código != 0, línea `Error: ... local`, sin rastro de red ni claves | Nada de red real | Superado en local |
| A02-03 Medium | Migración `…090300` (`private.demo_fixture_identity`, RLS sin políticas, sin privilegios para `anon`/`authenticated`, única por tipo/registro); `demo-crm.sql`: una transacción, `pg_advisory_xact_lock` antes de leer o escribir, inserción por fixture y registro de identidad, sin DELETE/TRUNCATE/DROP ni desactivar triggers, omite y avisa ante colisión con filas sin identidad (nombre o firma); `reconcile-demo-crm.sql`: comprobación por defecto, una sentencia, solo firma original inequívoca de la misma organización, `ambiguous` si hay más de una candidata o una candidata de varios fixtures, escribe solo en la tabla de identidad | PGlite `seed-identity` (S-01..S-07), `seed-reconcile` (RC-01..RC-06), `seed-demo`; mis nuevas `task010-post-hardening` (sin privilegios de tabla, RLS sin políticas, esquema `private`, owner autenticado -> 42501) | Verde (544). Concurrencia real no verificable en PGlite: solo el bloqueo estático | Ejecución de seed/reconciliación contra Cloud: no hecha ni afirmada | Superado en local |
| A02-04 Medium | `…090000`: `char_length(col) <= 200` y `col ~ '[^ \t\n\r\v\f<conjunto de trim()>]'` sobre el valor almacenado, en las 3 tablas; falla la migración entera si hay datos conflictivos (no recorta); `supabase/checks/name-constraints-precheck.sql` de solo lectura. Zod (`trim().min(1).max(200)`) equivale | PGlite `name-constraints` (N-01, N-03, N-05, N-06), U `name-schemas` (N-02), mía: paridad exhaustiva BMP | Verde. Mi prueba nueva compara los 65 000+ puntos de código BMP contra la restricción REAL de cada tabla y contra `String.prototype.trim()`: ninguna discrepancia | N-04 por PostgREST | Superado en local |
| A02-05 Medium | `…090100`: `seq bigint` con default de secuencia sobre históricos NULL, índice único, secuencia sin privilegios para `public/anon/authenticated`; `listEntityHistory` ordena `occurred_at desc, seq desc nulls last`; `prevent_event_change` intacto | PGlite `activity-order` (E-01..E-04, tras mi corrección P-01), U `activity-history-order` (E-05), mías: `has_sequence_privilege`, nextval/setval/currval/select -> 42501 | Verde. Históricos conservan seq NULL | E-06 por PostgREST | Superado en local |
| A02-06 Medium | `…090200`: trigger con `WHEN (old.archived_at is not null or new.archived_at is not null)`; sobre archivada, cualquier cambio de columna distinta de `archived_at`/`updated_at` (vía `to_jsonb`) -> 23000, incluida la restauración combinada, sin excepción por rol; restaurar solo y archivar con otros campos siguen permitidos. Servicio y UI ya cumplían (ver abajo) | PGlite `archived-readonly` (R-01..R-07), `archived-freeze`, `archive-restore`, `constraints` actualizado | Verde | R-08 PostgREST, R-09 E2E | Superado en local |
| A02-07 Medium | `safeNextPath`: la ruta se decodifica por niveles (<=5) y se rechaza `//`, `\`, controles, `.`/`..`; consulta y fragmento conservan su codificación | U `safe-next-path-encoded` (X-01..X-03), `login-logout-notice` (X-04); mi fuzz de 400 000 entradas | Verde. Fuzz: 36 854 aceptadas, 0 violaciones (mismo origen, idempotente, sin `//`, `\` ni segmentos de punto tras decodificar en ningún nivel) | X-05 E2E | Superado en local |

## Puntos de atención del Orchestrator

1. **activity-order**: confirmado (P-01). Era un defecto de la prueba y está corregido y justificado; no es FAIL de Develop.
2. **A02-06 servicio/UI y A02-04 Zod**: confirmados por lectura. `update` filtra `.is('archived_at', null)` y `.eq('organization_id')`; `saveRecord` usa `pickFields` (solo `id,name/full_name,email,phone,notes`) y `z.strictObject`, de modo que un POST directo a la Server Action no puede enviar `archived_at`; con un id archivado el UPDATE afecta 0 filas y devuelve conflicto («Un registro archivado no se puede editar. Restáuralo primero.»), sin restaurar ni editar. La acción de restaurar solo envía `archived_at = null`. Aunque el servicio fallara, el trigger rechaza la edición (R-01..R-04). La UI oculta «Editar» y la página de edición solo muestra el aviso. Zod usa `trim()` de JS, que coincide con el conjunto de la regex SQL (verificado de forma exhaustiva en BMP) y cuenta puntos de código como `char_length`. Borde sin alcance: un sustituto suelto no se puede almacenar en PostgreSQL.
3. **Migraciones nuevas** (lectura y pruebas): `prevent_unarchive` sigue siendo `SECURITY DEFINER`, `search_path = ''`, sin EXECUTE para `public/anon/authenticated` (C-24/C-25 genéricas, ahora sobre las migraciones nuevas); `private.demo_fixture_identity` en esquema `private` (la API solo expone `public`, `supabase/config.toml`), RLS activada sin políticas, sin privilegios de tabla para `anon`/`authenticated`; secuencia sin USAGE/SELECT/UPDATE; sin `GRANT` de INSERT/UPDATE sobre `seq`; UPDATE/DELETE/TRUNCATE de eventos siguen dando 23000 hasta para el superusuario; ningún GRANT, política ni constraint se debilita. Las 5 migraciones previas no están modificadas (`git diff HEAD -- supabase/migrations` vacío). La de nombres falla entera ante datos conflictivos (N-06) y el precheck de solo lectura devuelve exactamente las filas violadoras (N-05). Restricción de orden: el nombre del trigger conserva el orden alfabético previo (`…organization_change` < `…unarchive` < `…set_updated_at`).
4. **Seed y documentación**: `docs/SEED.md` y `docs/SUPABASE_CLOUD.md` describen con exactitud el comportamiento del código (omite y avisa ante colisión, firma original, `ambiguous`/`not_found`, riesgos operativos, orden de aplicación, comprobaciones aplazadas) y declaran que no se ha ejecutado nada en Cloud ni en el stack local con Auth real. Sin afirmaciones de ejecución no realizadas.
5. **A02-01/02/07**: ver matriz. Las ramas confirmado, error y excepción están cubiertas por doble en unit; el borrado de cookies no afecta a otras cookies; el aviso nunca incluye el error; el guardia corre antes de construir clientes (setupFile y helper) y G-05 lo demuestra con las suites reales.
6. **Higiene**: sin `.skip/.only/.todo/xit/xtest/fixme/skipIf/runIf` ni `eslint-disable`/`@ts-ignore` en los 31 archivos de test tocados. Los archivos `tests/**/independent/**` no tienen cambios posteriores al informe PRE salvo mi corrección (mtime; sin línea base en Git por ser nuevos). Los dos tests de Develop actualizados (`constraints.test.ts`, `seed-demo.test.ts`) solo sustituyen la edición de archivados por su contrario (23000; restaurar y editar), sin perder cobertura de la regla previa. `crm.spec.ts` no edita archivados (alta, edición activa, archivar, comprobar que no se edita, restaurar); `rls.supabase.test.ts` solo archiva y restaura. No se espera rotura en CI por esto.
7. **Regresión local**: ver tabla.

## Comandos y resultados

| Comando | Exit | Resultado |
| --- | --- | --- |
| `pnpm format:check` | 0 | Todo conforme (tras añadir mi prueba) |
| `pnpm lint` (`--max-warnings=0`) | 0 | Sin avisos |
| `pnpm typecheck` | 0 | `next typegen` + `tsc --noEmit` |
| `pnpm test:unit` | 0 | 25 archivos, 582 pasadas |
| `pnpm test:integration` (PGlite) | 0 | 13 archivos, 544 pasadas (antes de corregir P-01: 535/536, 1 fallo por mi prueba) |
| `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 … pnpm build` | 0 | Compila; se aísla del `.env.local` para no usar Cloud |
| fuzz de `safeNextPath` (script externo, 400 000 casos) | 0 | 0 violaciones |

## Archivos de este POST

| Estado | Ruta | Justificación |
| --- | --- | --- |
| ?? | `docs/reviews/claude/TASK-010-POST.md` | Este informe |
| ?? | `tests/integration/independent/task010-post-hardening.test.ts` | Nuevo, 8 casos: paridad exhaustiva BMP y privilegios de secuencia/identidad |
| M (sobre el `??` del PRE) | `tests/integration/independent/activity-order.test.ts` | Corrección P-01 (orden por columna numérica) |

El fuzz usa un script en el directorio temporal, fuera del repositorio.

## Validación estática, efectiva parcial y pendiente

- Estática: diff completo de `src/`, `supabase/`, tests de Develop y documentos; lectura de migraciones, seed, reconciliación, precheck, servicio, acciones y páginas; búsqueda de skips y relajaciones; comparación de archivos con las rutas prohibidas.
- Efectiva parcial (local): unit, PGlite (PostgreSQL real con shim de Auth, no Supabase), build, lint, typecheck, format, fuzz.
- Pendiente (CI, job `supabase` y `quality`; responsable: Orchestrator/CI): `pnpm test:supabase` (`logout-revocation`, `name-constraints`, `archived-readonly`, `archive-restore`, `rls`), `pnpm test:e2e:supabase` (`task010-ui`, `crm`, independientes), `pnpm test:e2e` y regresión completa en CI. Vigilar el límite de inicios de sesión de GoTrue local (PRE, riesgo 6). Cloud: no se ha usado; las migraciones y el seed están sin aplicar.

## Limitaciones

Sin Docker/Supabase CLI/psql: ni PostgREST ni Auth reales; concurrencia real del seed no verificable; la versión de `@supabase/auth-js` de L-08 no se ejecutó. El árbol no está confirmado en un commit, así que la evidencia de CI debe obtenerse sobre el SHA que cree el humano. Ver P-05 sobre el handoff.

## Aceptación humana

Pendiente para P-02..P-05 (todos Informational).
