# TASK-006-POST — Revisión independiente de F3 (Supabase database foundation)

## Cabecera
- TASK-ID: TASK-006. Fase: POST. Fecha: 2026-11-24.
- Agente: testing. Modelo solicitado: Sonnet 5.5, esfuerzo estándar. Efectivo: autoinformado como Sonnet 5.5 (`claude-sonnet-5-5`), no verificado por CLI; esfuerzo no verificable.
- Rama `feat/supabase-auth`, SHA base `9290a87c63b5b4f9d44f4373609a278bb7ef4889` (sin commit; HEAD sin cambios). Diff final: los cambios de Develop (sin tocar) más los 2 archivos de esta fase.
- Git antes: 5 `M` (ci.yml, README.md, docs/ARCHITECTURE.md, package.json, pnpm-lock.yaml) y el conjunto `??` del manifiesto de Orchestrator más PRE; índice vacío; `git stash list` vacío. Git después: igual, más `?? tests/integration/independent/rls-extra.test.ts` y `?? docs/reviews/claude/TASK-006-POST.md`; índice vacío; HEAD `9290a87…`.
- Entorno: Windows 11, Git Bash, Node 24.22.2, pnpm 12.16.1. Sin Docker, sin Supabase CLI, sin `psql`. Sin servicios remotos, conectores ni MCP; sin descargas. No se leyó `.claude/settings.local.json`. No se ejecutó `pnpm dev`.

## Veredicto: BLOCKED
Todo lo ejecutable en local (PGlite) se superó y no hay hallazgos Critical/High ni incumplimientos ejecutados. El veredicto es BLOCKED, no PASS, porque criterios aprobados aplicables no tienen evidencia: F3-03 y F3-45 (y la ejecución del job de F3-39) dependen del CI Supabase (push autorizado), y F3-46 de Supabase Cloud. Lo no ejecutado no es PASS. Si el humano acepta de forma explícita y registrada excluirlos hasta el push (como se anticipó en PRE), el resto queda en PASS con los hallazgos Low/Informational de abajo.

## Comandos ejecutados (todos con `NEXT_TELEMETRY_DISABLED=1`)
| Comando | Exit | Resultado |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | Lockfile al día, sin cambios |
| `pnpm format:check` | 0 | (también tras añadir mi prueba) |
| `pnpm lint` | 0 | `--max-warnings=0` |
| `pnpm typecheck` | 0 | |
| `pnpm test:unit` | 0 | 5 archivos, 44/44 |
| `pnpm test:integration` | 0 | Antes de mis casos: 2 archivos, 127/127 (113 `rls.test.ts` + 14 `constraints.test.ts`). Con mis casos: 3 archivos, 141/141. Reporter JSON: 0 omitidas, 0 `todo` |
| `pnpm build` | 0 | Rutas `/`, `/_not-found`, `/icon.svg`; el build no exige variables de Supabase |
| `pnpm test:e2e` | 0 | 9/9 (F2 sin cambios) |
| `pnpm test:supabase` sin variables | 1 | Falla `beforeAll` con "Faltan variables del stack local de Supabase: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY"; Vitest informa "20 tests, 20 skipped" (ver POST-02) |
| `pnpm list --depth 0` (filtrado) | 0 | ssr 0.12.7, supabase-js 2.119.2, zod 4.6.7, pglite 0.5.17 |
| `git hash-object` | — | rls.test.ts `4371b4c…` (igual que PRE), AGENTS.md `bdf3e10…`, CLAUDE.md `4745713…` (iguales a los esperados) |
| `git diff --name-only HEAD -- src/app tests/unit/independent tests/e2e tests/acceptance` | 0 | Sin salida (F2 intacto) |
| Greps `.skip/.only/.todo/xit/xtest/fixme/passWithNoTests/retries/continue-on-error/if: false/pull_request_target` en `tests vitest*.mts package.json .github src supabase` | — | Sin coincidencias |
| Grep de secretos y `service_role` sobre ficheros versionados y no ignorados | — | Solo nombres de variable/roles SQL/CI/documentación; sin `eyJ…`, `sk_live`, claves privadas ni contraseñas; **ninguna coincidencia en `src/`** |

## Validación por capa
- **Ejecutada y superada en PGlite** (PostgreSQL real con shim; no es Supabase): migraciones desde cero, esquema, constraints, GRANT/REVOKE, RLS, funciones SECURITY DEFINER, triggers, aislamiento y escalada.
- **Estática superada**: dependencias, migraciones, clientes `@supabase/ssr`, env, `.env.example`, CI, documentación, alcance.
- **Pendiente de CI Supabase** (push autorizado): F3-03, F3-39 (ejecución del job), F3-45.
- **Pendiente de Supabase Cloud**: F3-46 (no aplicable en F3-T006).

## Criterios F3-01..F3-46
Leyenda: S = superado en PGlite/estático local; P-CI = pendiente de CI Supabase; P-Cloud = pendiente de Cloud.

| ID | Resultado | Evidencia |
|---|---|---|
| F3-01 | S | `package.json` con versiones exactas sin `^`/`~`; lockfile +108 líneas, solo transitivas de supabase-js/ssr (`@supabase/auth-js`, `functions-js`, `postgrest-js`, `realtime-js`, `storage-js`, `phoenix`, `cookie`, `iceberg-js`, `tslib`); F2 sin cambios; install frozen exit 0; sin `pnpm-workspace.yaml` nuevo |
| F3-02 | S | Tres migraciones `20261124090{000,100,200}_*.sql` por orden; aplicadas desde cero en cada `createTestDb()`; sin `drop`/`truncate`/`delete` |
| F3-03 | **P-CI** | `supabase start`/`db reset` no ejecutado; `config.toml` sin secretos, mínimo, sin validar con la CLI |
| F3-03b | S (con POST-02) | Scripts presentes; `test:integration` excluye `tests/integration/supabase/**`; sin `--passWithNoTests`; las 113 pruebas de `rls.test.ts` ejecutadas, 0 omitidas; `test:supabase` falla con exit 1 sin variables |
| F3-04..F3-16 | S | Describe "esquema, restricciones y privilegios" en verde (113/113 de `rls.test.ts`) y revisión de las migraciones: RLS en las 4 tablas; `anon` sin privilegios; `authenticated` solo SELECT (+ INSERT/UPDATE por columna); sin políticas DELETE/ALL; WITH CHECK explícito; sin referencia directa a `memberships` en políticas de `memberships`; FKs, índices, unique, checks y triggers según criterio |
| F3-17 | S | `is_org_member`/`has_org_role` en `private`, SECURITY DEFINER, `set search_path = ''`, nombres calificados, `revoke … from public, anon`, `grant … to authenticated`; funciones de trigger sin SECURITY DEFINER y sin EXECUTE para nadie (confirmado además con mis casos: 42501 para `authenticated` y `anon`) |
| F3-18..F3-31 | S | Pruebas F3-18..F3-31 de `rls.test.ts` en verde: anon 42501; SELECT aislado; INSERT propio y ajeno; UPDATE propio/ajeno; org_id inmovible; renombrado solo owner; sin DELETE/TRUNCATE; escalada de roles, membresías y organizaciones bloqueadas; archivado permitido y restauración bloqueada |
| F3-31b | No aplicable | DH-04/DH-05 excluidos hasta F4 (sin órdenes); registrado, no PASS de funcionalidad |
| F3-32 | S (estático, `build`/`typecheck` exit 0) | `client.ts` con `createBrowserClient`; `server.ts` con `createServerClient`, `getAll`/`setAll`, cliente nuevo por llamada, sin caché a nivel de módulo, `await cookies()`; coincide con el README local de `@supabase/ssr` 0.12.7. Sin `service_role` en `src/`; sin login/proxy/rutas. Los tipos de `database.types.ts` funcionan con `createClient<Database>` (comprobación temporal con `tsc`, archivo eliminado) |
| F3-33 | S | `env.ts` Zod, perezoso, sin valores por defecto; error nombra variables sin valores; `env.test.ts` en verde |
| F3-34 | S | `.env.example` (sin cambios respecto a HEAD) solo nombres con valor vacío; no hay otro `.env*` |
| F3-35 | S | Esquemas `strictObject` (rechazan `organization_id`), trim, límites alineados con los CHECK; sin `any`; 44/44 unit |
| F3-36 | S | Greps sin secretos; contraseñas de pruebas Supabase generadas con `randomBytes` en ejecución; claves de CI desde `supabase status -o env` |
| F3-37 | S (con POST-06) | Emails `@example.test`, nombres ficticios, UUID fijos; no hay `seed.sql` (seed desactivado en `config.toml`, justificado) |
| F3-38 | S | Format/lint/typecheck/unit/build/e2e en verde; sin cambios en `src/app`, `tests/e2e`, `tests/unit/independent`, `tests/unit/app-shell.test.tsx` |
| F3-39 | S estático; ejecución **P-CI** | `test:integration` en `quality` antes de `build`; job `supabase` con `supabase/setup-cli@v1` y `version: 2.122.1`, `supabase status -o env`, `::add-mask::`, `pnpm test:supabase`, `supabase stop --no-backup` con `if: always()`; permisos de solo lectura heredados; sin `continue-on-error`/`pull_request_target`; Node 24; acciones con etiqueta mayor igual que el job existente (POST-04) |
| F3-40 | S | Sin `.skip/.only/.todo/…`; hash de `rls.test.ts` intacto |
| F3-41 | S | Todos los archivos tocados están en la lista permitida; nada en `.claude/**`, `CLAUDE.md`, `AGENTS.md`, `src/app/**`, `.env*`, docs prohibidos; `tests/support/**` nuevo y declarado (`pglite.ts`, `fixtures.ts`, `supabase-shim.sql`) |
| F3-42 | S | HEAD `9290a87…`, índice vacío, sin stash, sin commit/push |
| F3-43 | S | Revisión estática de las migraciones (ver "Revisión de seguridad") |
| F3-44 | S | README, ARCHITECTURE y ADR distinguen PGlite / CI Supabase / Cloud, no afirman verificación en Supabase, marcan matriz y DH-04..DH-06 como no ratificadas y DH-06 bloqueada por trigger. Reserva: POST-01 |
| F3-45 | **P-CI** | `rls.supabase.test.ts` (20 pruebas) revisada estáticamente, no ejecutada; ver POST-03 |
| F3-46 | **P-Cloud** | No aplicable ni autorizado |

## Revisión de seguridad (migraciones y refinamiento de Develop)
- Privilegios por columna (INSERT/UPDATE en `customers`/`technicians`, `update (name)` en `organizations`): **aceptado**. Reduce la superficie frente al diseño base (no se escriben `id`, `organization_id`, `created_at`, `updated_at`), coincide con "grants mínimos" de F3-43, y no rompe F3-04..F3-31 (113/113). El trigger de `organization_id` sigue cubriendo a superusuario. Coste de mantenimiento documentado en el ADR (nuevas columnas editables requieren migración).
- Cubierto con mis casos nuevos (`rls-extra.test.ts`): `updated_at`/`created_at`/`id` no actualizables ni insertables por `authenticated` (42501), funciones de trigger no ejecutables, DDL denegado en `public` y `private`, `anon` sin acceso a `private`, funciones auxiliares sin oráculo sobre otros usuarios, y revocación inmediata de acceso al borrar la membresía.
- Sin RLS forzada (`FORCE ROW LEVEL SECURITY` ausente): correcto, las funciones SECURITY DEFINER dependen de que el propietario omita RLS; confirmar en CI (POST-03).
- Sin hueco real de RLS detectado en PGlite.

## Casos independientes añadidos (declaración)
- `tests/integration/independent/rls-extra.test.ts` (nuevo, 14 pruebas, hash `4281ede571aa7575948418fdaee20898ae6a6b4b`). Pertenece a Testing; Develop no puede modificarla ni saltarla. Una de ellas (`ON CONFLICT DO UPDATE`) es débil por diseño: el `id` lo genera el servidor, solo comprueba que no cambian las filas de B.
- Archivo temporal de comprobación de tipos creado y eliminado en el mismo directorio.

## Hallazgos
Ninguno Critical/High/Medium.

| ID | Gravedad | Archivo / línea | Descripción y reproducción | Esperado / obtenido | Estado |
|---|---|---|---|---|---|
| POST-01 | Low | `src/lib/README.md`, `src/features/README.md` (y la frase "Estructura de F2" de `docs/ARCHITECTURE.md`) | `cat` de ambos README: "Vacío en F2: aún no hay integración…". Ya hay `env.ts`, clientes y esquemas Zod | Documentación coherente con F3 / obtenida obsoleta | **Develop debe corregir** (archivos dentro de su lista permitida) |
| POST-02 | Low | `vitest.supabase.config.mts`, `tests/integration/supabase/rls.supabase.test.ts:20,75` | `pnpm test:supabase` sin variables: exit 1 (falla), pero la salida muestra "20 skipped" porque `beforeAll` falla. No es salto deliberado y el exit code es correcto. Mejor que falle antes de recolectar, por ejemplo con la comprobación de las 3 variables en la configuración o en `globalSetup`, para que no aparezcan pruebas omitidas | "falla si faltan variables, sin saltar pruebas" / obtenido: falla con exit 1, informe con omitidas | **Develop debe corregir** (recomendado; no bloquea si Orchestrator lo acepta con registro) |
| POST-03 | Informational | `.github/workflows/ci.yml`, `supabase/config.toml`, `rls.supabase.test.ts` | Sin verificar (requieren CI): nombres `API_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY` en `supabase status -o env` de la CLI 2.122.1; validez de `config.toml`; aceptación por GoTrue de correos `@example.test`; que el propietario `postgres` omita RLS en funciones SECURITY DEFINER; que `service_role` pueda actualizar filas con triggers cuyo EXECUTE está revocado (no se comprueba el EXECUTE al disparar el trigger en PostgreSQL); códigos PostgREST (`42501`, 0 filas) | Verificación efectiva en el job `supabase` | Pendiente de push autorizado |
| POST-04 | Informational | `.github/workflows/ci.yml` | Acciones fijadas por etiqueta mayor (`@v5`, `@v4`, `@v1`), no por SHA, igual que el job existente; solo `supabase` CLI tiene versión exacta | Aceptable salvo política más estricta | Aceptación humana |
| POST-05 | Low | `supabase/migrations/…_f3_private_functions_and_triggers.sql` (`prevent_unarchive`) | Un miembro puede reescribir `archived_at` de un registro ya archivado (no nulo a otro valor, incluido futuro): solo se bloquea pasar a nulo. Reproducción: `update customers set archived_at = now() + interval '1 year'` sobre una fila archivada, como `authenticated` | Historial de archivado no manipulable / obtenido: manipulable. No incumple un criterio aprobado | Decisión humana junto con DH-06 |
| POST-06 | Informational | `src/lib/supabase/database.types.ts`; ausencia de `supabase/seed.sql` | Tipos escritos a mano (Insert/Update incluyen columnas no escribibles por RLS/GRANT); sin seed local. Documentado en README | Regenerar con la CLI cuando exista | Aceptación humana |
| POST-07 | Informational | `src/lib/supabase/server.ts` | `setAll(cookiesToSet)` ignora el segundo argumento `headers` (cabeceras de caché del README de ssr); sin `import 'server-only'`. Sin efecto hasta TASK-007 (proxy) | Revisar en TASK-007 | Pendiente (TASK-007) |
| PRE-01..PRE-04 | Informational/Low | — | PRE-01 sigue abierto (matriz y DH-04..DH-06 sin ratificar); PRE-03/PRE-04 resueltos (los soportes existen y `asUser` relanza el error original) | — | PRE-01 abierto (humano) |

## Qué debe corregir Develop y qué decide el humano
- Develop: POST-01 (Low) y, preferiblemente, POST-02 (Low). Ninguno invalida el veredicto técnico.
- Humano: aceptar POST-04/05/06/07; ratificar matriz y DH-04..DH-06 (PRE-01); autorizar el push para ejecutar el job `supabase` (cierra F3-03, F3-39, F3-45) o excluir esos criterios del veredicto con registro explícito.

## Checks no ejecutados
`supabase start`, `supabase db reset`, `pnpm test:supabase` con stack real, Auth/JWT/PostgREST reales, proyecto Cloud, `pnpm dev`, ejecución del workflow en GitHub, concurrencia y `FORCE ROW LEVEL SECURITY`.
