# TASK-006-PRE — Criterios verificables de F3 (Supabase database foundation)

## Cabecera
- TASK-ID: TASK-006. Fase: PRE. Fecha: 2026-11-24.
- Agente: testing. Modelo solicitado: Sonnet 5.5, esfuerzo estándar. Efectivo: modelo autoinformado como Sonnet 5.5 (`claude-sonnet-5-5`), no verificado por CLI; esfuerzo no verificable.
- Rama `feat/supabase-auth`, SHA base `9290a87c63b5b4f9d44f4373609a278bb7ef4889`, sin commit. Diff final: solo los 2 archivos permitidos de esta fase.
- Git antes: `?? docs/reviews/claude/TASK-006.md`; índice vacío. Git después: además `?? docs/reviews/claude/TASK-006-PRE.md` y `?? tests/integration/independent/rls.test.ts`; índice vacío (`git diff --cached --name-only` sin salida).
- Entorno: Windows 11, Git Bash. Sin Docker, sin Supabase CLI, sin `psql`. No se usó ningún servicio remoto ni conector.

## Nivel de validación
- Validación estática: lectura del contrato, `prettier --write` y `eslint --max-warnings=0` sobre la prueba (exit 0 ambos), `tsc --noEmit` (solo falla por los módulos `tests/support/pglite` y `tests/support/fixtures`, que aún no existen; el resto son errores en cascada por ese motivo).
- Validación efectiva: **ninguna** en PRE. La prueba no puede ejecutarse hasta que Develop cree `tests/support/pglite.ts`, `tests/support/fixtures.ts`, las migraciones y `@electric-sql/pglite`. No se ha fabricado ningún FAIL: el "fallo previo" es la ausencia de esquema y de soporte (`ls supabase tests/support/pglite.ts` falla). Tras instalar dependencias, antes de las migraciones la suite debe fallar por importación/esquema; eso no es evidencia de defecto.
- Separación obligatoria en POST de lo que cada capa demuestra:
  1. **Ejecutado en PGlite**: PostgreSQL real con shim mínimo de auth. Demuestra esquema, constraints, GRANT/REVOKE, RLS y funciones. No es Supabase (ni PostgREST, ni GoTrue, ni roles reales de Supabase).
  2. **Pendiente de CI Supabase** (requiere push autorizado por el humano): `supabase start`, migraciones en el stack real, `test:supabase`, Auth real.
  3. **Pendiente de proyecto Supabase Cloud**: despliegue, claves reales, comportamiento remoto. Fuera de F3-T006.
  Lo no ejecutado nunca puede ser PASS; los criterios marcados `[CI]` o `[Cloud]` quedan como "pendiente", y el veredicto POST será BLOCKED mientras falte un criterio aplicable sin evidencia (o PASS parcial solo si el Orchestrator/humano acepta explícitamente excluirlos del veredicto y lo registra).

## Contrato asumido por las pruebas independientes
Fijado aquí para Develop (las pruebas de Testing no se tocan; si el contrato es incorrecto, se pide cambio vía Orchestrator).
- `createTestDb()` y `seedTwoOrgs(db)` según TASK-006.md. `seedTwoOrgs` devuelve UUID (string) en `orgA, orgB, ownerA, memberA, ownerB, memberB, customerA, customerB, technicianA, technicianB`. Exactamente dos organizaciones en el seed (una prueba cuenta `organizations` = 2 con superusuario). Cada organización tiene al menos su cliente y su técnico.
- `db.asUser(id, fn)` / `db.asAnon(fn)` / `db.asSuperuser(fn)`: ejecutan `fn(tx)` en una transacción, **devuelven el valor de `fn`**, y ante un error SQL **hacen rollback y relanzan el error original** (con `.code` SQLSTATE). No deben tragarse el error. `tx.query<T>(sql, params)` devuelve `{ rows }`.
- **Columnas fijadas como contrato** (no hay otros nombres en las pruebas): `organizations(id, name, created_at, updated_at)`; `memberships(organization_id, user_id, role, created_at)`; `customers(id, organization_id, name, archived_at, created_at, updated_at)`; `technicians(id, organization_id, full_name, archived_at, created_at, updated_at)`. Cualquier otra columna (contacto) debe ser nullable o tener default: las pruebas insertan solo `(organization_id, name|full_name)`. `id` con default `gen_random_uuid()`. `memberships.role` sin `updated_at`. Esquema `public`.
- Funciones auxiliares con esos nombres y firmas: `is_org_member(uuid)` y `has_org_role(uuid, text)`; el esquema se descubre por catálogo (debe ser distinto de `public`).
- `auth.users(id, email)` admite `insert (id, email)` (se crea un usuario sin membresía en pruebas).
- Códigos SQLSTATE esperados: `42501` para REVOKE/ausencia de privilegio y WITH CHECK de INSERT; 0 filas (con `returning`) para UPDATE/DELETE sobre filas ocultas por USING (o `42501` si el privilegio está revocado, ambos aceptados en "sin efecto"); `23505` unique(user_id); `23514` check; `23502` not null; `23503` FK. Toda prueba rechaza como evidencia un error de clase `42` distinto de `42501` (SQL inválido, columna inexistente, recursión `42P17`).
- Restauración (`archived_at` no nulo a nulo) y mover `organization_id`: debe lanzar error (trigger o RLS); el código concreto no se fija.
- Las pruebas son lentas por crear una base PGlite: usan `vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 })`. `vitest.integration.config.mts` debe incluir `tests/integration/**/*.test.ts`, excluir `tests/integration/supabase/**`, y no fijar un entorno distinto de node ni un `testTimeout` menor.

## Criterios (aprobados en alcance; no reducibles)
Comandos desde la raíz con `NEXT_TELEMETRY_DISABLED=1`. "Exit 0" = código de salida 0. Marcas: **[PGlite]** ejecutable local; **[CI]** pendiente de push autorizado; **[Cloud]** pendiente de proyecto Cloud; **[Est]** estático.

### Dependencias y reproducibilidad
| ID | Criterio | Comando | Resultado esperado |
|---|---|---|---|
| F3-01 | Dependencias exactas y ninguna extra [Est] | `pnpm list --depth 0 --json` y comparar con `package.json` y `git diff HEAD -- package.json pnpm-lock.yaml` | Solo se añaden `@supabase/supabase-js` 2.119.2, `@supabase/ssr` 0.12.7, `zod` 4.6.7 (dependencies) y `@electric-sql/pglite` 0.5.17 (devDependency), todas **sin prefijos `^`/`~`** (el resto del `package.json` usa versiones exactas). Ningún otro paquete directo (ORM, `pg`, `postgres`, `supabase` CLI, `dotenv`, UI kits…); las versiones de F2 no cambian. Transitivas solo las necesarias. `pnpm install --frozen-lockfile` exit 0 sin cambiar el lockfile. Si pnpm pide aprobar scripts de build, solo `pnpm-workspace.yaml` y se justifica |
| F3-02 | Migraciones versionadas aplicables desde cero [PGlite] | `pnpm test:integration` (ejecuta `createTestDb()`, que aplica shim y todas las migraciones por orden) | Exit 0. Nombres `supabase/migrations/YYYYMMDDHHMMSS_*.sql`, orden lexicográfico = orden de aplicación, sin duplicar timestamps; no editan migraciones previas; sin `drop`/`truncate`/`delete` de datos de usuario; reaplicables sobre base vacía en cada prueba |
| F3-03 | Migraciones aplicables en Supabase local [CI] | Job `supabase` de CI: `supabase start` y `supabase db reset` (o arranque con migraciones) | Pendiente de push autorizado. No cuenta como PASS hasta ver el job en verde (log y SHA). `supabase/config.toml` solo con lo necesario, sin secretos |
| F3-03b | Scripts | `node -e "const s=require('./package.json').scripts;for(const k of ['test:integration','test:supabase'])if(!s[k])throw new Error(k)"` y `pnpm test:integration` | Exit 0; `test:integration` es Vitest `run` en node sobre `tests/integration/**/*.test.ts` excluyendo `tests/integration/supabase/**`, sin `--passWithNoTests`; `test:supabase` ejecuta solo `tests/integration/supabase/**`, falla si faltan `SUPABASE_URL`, `SUPABASE_ANON_KEY` o `SUPABASE_SERVICE_ROLE_KEY` y no salta pruebas. Cada prueba de `tests/integration/independent/rls.test.ts` aparece ejecutada, 0 omitidas |

### Esquema y restricciones (en `rls.test.ts`, describe "esquema, restricciones y privilegios")
| ID | Criterio | Verificación | Resultado esperado |
|---|---|---|---|
| F3-04 | RLS activada en `organizations`, `memberships`, `customers`, `technicians` | Prueba F3-04 (`pg_class.relrowsecurity`) | Las 4 en `true` |
| F3-05 | `anon` y PUBLIC sin privilegios en las 4 tablas | Pruebas F3-05 (`has_table_privilege`, `has_any_column_privilege`, `aclexplode`) | Ningún privilegio de tabla ni de columna para `anon`; ninguna concesión a PUBLIC (grantee 0) |
| F3-06 | `authenticated` lee las 4 tablas, sin DELETE ni TRUNCATE | Pruebas F3-06 | `SELECT` true, `DELETE` false, `TRUNCATE` false |
| F3-07 | No hay políticas DELETE ni ALL; `memberships` solo con SELECT; `organizations` sin INSERT | Pruebas F3-07 (`pg_policies`) | Listas vacías |
| F3-08 | Políticas INSERT/UPDATE con `WITH CHECK` explícito; UPDATE solo en `customers`, `organizations`, `technicians` | Prueba F3-08 | Sin `with_check` nulo; conjunto exacto de tablas con UPDATE |
| F3-09 | Sin recursión: las políticas de `memberships` no consultan `memberships` directamente | Prueba F3-09 (heurística sobre texto de `qual`/`with_check`) más las lecturas de F3-19 (sin `42P17`) | Sin coincidencias; todas las lecturas de membresías sin error |
| F3-10 | Tipos y nulabilidad: `id`, `organization_id`, `user_id` uuid not null; `name`, `role`, `full_name` not null; `archived_at` timestamptz nullable | Prueba F3-10 (`information_schema`) | Cumple |
| F3-11 | `created_at`/`updated_at` timestamptz not null con default (`updated_at` en organizations, customers, technicians) | Prueba F3-11 | Cumple |
| F3-12 | FKs: memberships, customers, technicians → organizations; memberships.user_id → auth.users `on delete cascade` | Prueba F3-12 (`pg_constraint`) | Cumple (`confdeltype='c'`) |
| F3-13 | `unique (organization_id, id)` y un índice con `organization_id` primero en customers y technicians; índice por `organization_id` y `unique(user_id)` en memberships | Pruebas F3-13 (`pg_index`) | Cumple |
| F3-14 | Constraints efectivas: `unique(user_id)` (23505), `role in ('owner','member')` (23514), `organizations.name` no vacío y acotado (23514, 10 000 caracteres rechazados), `organization_id` no nulo (23502) y existente (23503), nombre no nulo (23502) | Pruebas F3-14 | Cada una con su SQLSTATE |
| F3-15 | `organization_id` inmutable aun con superusuario (trigger) en customers y technicians | Pruebas F3-15 | UPDATE rechazado; fila intacta |
| F3-16 | Trigger `updated_at`: avanza al actualizar; `created_at` no cambia (organizations, customers, technicians) | Pruebas F3-16 | `updated_at` posterior; `created_at` igual |

### Funciones SECURITY DEFINER (describe "funciones SECURITY DEFINER")
| ID | Criterio | Verificación | Resultado esperado |
|---|---|---|---|
| F3-17 | Todas las funciones `SECURITY DEFINER` fuera de `pg_catalog`, `information_schema` y `auth`: existen `is_org_member` y `has_org_role`; `search_path` vacío o fijado (`search_path=""` o empieza por `pg_catalog`); esquema distinto de `public`; sin EXECUTE para PUBLIC ni `anon`; `anon` recibe `42501` al invocarlas; `authenticated` las ejecuta y obtiene el rol correcto | Pruebas F3-17 y revisión de la migración (nombres calificados, `grant execute … to authenticated`, `revoke … from public, anon`) | Cumple |

### Aislamiento y RLS por operación
| ID | Criterio | Verificación | Resultado esperado |
|---|---|---|---|
| F3-18 | `anon`: SELECT, INSERT, UPDATE, DELETE y TRUNCATE en las 4 tablas | Pruebas F3-18 | Siempre `42501`; sin cambios posteriores |
| F3-19 | SELECT aislado por organización para owner y member de A (y owner y member de B); usuario sin membresía no ve nada; acceso directo por id ajeno = 0 filas; sin errores de recursión | Pruebas F3-19 | Cumple |
| F3-20 | INSERT propio permitido (owner y member) en customers y technicians; la fila es visible solo para la organización propia | Pruebas F3-20 | Cumple |
| F3-21 | INSERT con `organization_id` ajeno rechazado (WITH CHECK), también para usuario sin membresía | Pruebas F3-21 | `42501`; sin fila insertada |
| F3-22 | UPDATE propio permitido (customers, technicians; `name` de organización solo owner); nombre de organización vacío rechazado | Pruebas F3-22 | Cumple (1 fila; `23514` con vacío) |
| F3-23 | UPDATE de filas ajenas sin efecto | Pruebas F3-23 | 0 filas; fila intacta |
| F3-24 | No se mueve una fila a otra organización ni se roba una ajena cambiando `organization_id` | Pruebas F3-24 | Rechazado (error) o sin efecto (0 filas, 42501); `organization_id` intacto |
| F3-25 | Un member no renombra su organización; nadie renombra otra organización; el id de la organización no se actualiza | Pruebas F3-25 | Sin efecto o `42501`; datos intactos |
| F3-26 | DELETE inexistente: owner y member no borran filas propias ni ajenas en customers, technicians, organizations ni memberships; DELETE masivo y TRUNCATE rechazados | Pruebas F3-26 (TC-ARCH-03, BR02) | `42501` o 0 filas; todas las filas siguen existiendo; TRUNCATE `42501` |
| F3-27 | Escalada: un member no cambia su role; un owner no cambia roles de membresías (ni propia ni ajenas); nadie actúa sobre membresías de otra organización ni se mueve de organización | Pruebas F3-27 | Sin efecto o `42501`; roles y organización intactos |
| F3-28 | Nadie inserta membresías desde `authenticated` (otro usuario, mismo o distinto rol, otra organización, autoasignación; usuario sin membresía) | Pruebas F3-28 | `42501`; sin filas nuevas |
| F3-29 | Nadie crea organizaciones desde `authenticated` | Pruebas F3-29 | `42501` |
| F3-30 | Archivado permitido (UPDATE `archived_at`) por owner y member en su organización; la fila sigue visible (historial); no se archiva una fila ajena | Pruebas F3-30 (TC-ARCH-01, TC-TEAM-07) | Cumple |
| F3-31 | Restauración (`archived_at` de no nulo a nulo) rechazada hasta DH-06; el estado archivado se conserva | Pruebas F3-31 (TC-ARCH-05 / TC-TEAM-11 permanecen "Excluido: DH-06": la prueba comprueba el bloqueo, no la funcionalidad) | Error SQL; `archived_at` intacto |
| F3-31b | Reglas DH-04/DH-05 (archivar con órdenes abiertas) | No aplicable en F3-T006 (no hay órdenes) | Registro "excluido hasta F4", no PASS |

### Capa de aplicación (verificación estática y unit)
| ID | Criterio | Comando | Resultado esperado |
|---|---|---|---|
| F3-32 | Clientes `@supabase/ssr` según documentación | Revisar `src/lib/supabase/**` y contrastar con la documentación vigente de `@supabase/ssr` 0.12.7 (navegador: `createBrowserClient`; servidor: `createServerClient` con `getAll`/`setAll` de cookies, sin `get/set/remove` obsoletos). `grep -rnE "service_role\|SERVICE_ROLE" src` | Cliente de navegador y de servidor separados; servidor no cachea un cliente a nivel de módulo; sin `service_role` en `src/`; sin código de login/logout/proxy/rutas protegidas (TASK-007); `next build` y `pnpm typecheck` exit 0 |
| F3-33 | Validación de entorno con Zod (`src/lib/env.ts`) | `pnpm test:unit` (pruebas de Develop) y revisión | URL válida y clave publicable no vacía; falta o valor vacío → error claro sin imprimir valores; no se leen variables privadas en cliente; sin valores por defecto reales. Casos válidos e inválidos cubiertos |
| F3-34 | `.env.example` solo nombres y valores vacíos | `cat .env.example`; `grep -nE "=.+" .env.example` | Cada variable con valor vacío (`NOMBRE=`); sin claves JWT (`eyJ`), URLs de proyectos ni contraseñas; los comentarios no incluyen secretos; no hay otro `.env*` en el árbol |
| F3-35 | Zod de clientes y técnicos | `pnpm test:unit` | Esquemas con casos válidos (campos mínimos, trim, longitud máxima) e inválidos (vacío, solo espacios, sobrelargo, email malformado si existe, tipos erróneos, campos inesperados rechazados o descartados de forma explícita, `organization_id` no aceptado desde la entrada del usuario) cubiertos por pruebas de Develop (T03 en parte, TC-TEAM-02); sin `any` |
| F3-36 | Sin secretos ni contraseñas versionadas | `git ls-files -z \| xargs -0 grep -IEn "(sk_live\|eyJ[A-Za-z0-9_-]{20,}\.\|-----BEGIN [A-Z ]*PRIVATE KEY\|service_role\|password\s*[:=]\s*['\"][^'\"]+)"` más `git status --porcelain -uall \| grep -E "\.env"` | Sin coincidencias reales (`service_role` solo en roles SQL/CI y documentación, nunca como clave; las pruebas Supabase generan contraseñas aleatorias en ejecución). Las claves de CI proceden de `supabase status -o env`, no de literales |
| F3-37 | Datos sintéticos | Revisar `supabase/seed.sql`, `tests/support/fixtures.ts` | Emails `@example.test`, nombres ficticios, UUID fijos; sin personas ni empresas reales; seed sin contraseñas |

### F2 intacto, CI y alcance
| ID | Criterio | Comando | Resultado esperado |
|---|---|---|---|
| F3-38 | F2 intacto | `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build && pnpm test:e2e`; `git diff --name-only HEAD -- src/app tests/unit/independent tests/e2e tests/acceptance` | Todos exit 0 con las mismas pruebas de F2 (sin saltar); sin cambios en `src/app/**`, `tests/e2e/**`, `tests/unit/independent/**`, `tests/unit/app-shell.test.tsx` |
| F3-39 | CI: `test:integration` en el job actual y job Supabase | Leer `.github/workflows/ci.yml`; ejecutar localmente cada `run:` del job `quality` | `pnpm test:integration` en `quality` antes de build; nuevo job con `supabase/setup-cli` **version 2.122.1** fija, `supabase start`, extracción de URL y claves con `supabase status -o env` (sin literales), `pnpm test:supabase`, `supabase stop` o limpieza; `permissions: contents: read`; sin `continue-on-error`, sin `if: false`, sin pruebas saltadas, sin `pull_request_target`; acciones con versión fija, Node 24, `pnpm install --frozen-lockfile`. **Ejecución del job: [CI] pendiente de push autorizado** |
| F3-40 | Pruebas no debilitadas | `git diff --name-only HEAD`; `grep -rnE "\.skip\|\.only\|\.todo\|\bxit\b\|\bxtest\b\|\bxdescribe\b\|fixme\|passWithNoTests\|retries:\s*[1-9]" tests vitest*.mts package.json .github` | Sin coincidencias; `tests/integration/independent/rls.test.ts` con `git hash-object` = `4371b4c4872f7b97ba9fab95eba0712f20729184` (valor de PRE; sin cambios de Develop) |
| F3-41 | Alcance cerrado | `git diff --name-only HEAD` + `git ls-files --others --exclude-standard` contra la lista permitida de TASK-006.md | Ningún archivo fuera de lista; nada en `.claude/**`, `CLAUDE.md`, `AGENTS.md`, `docs/reviews/**` (salvo informes de Testing), `docs/TESTING_GUIDELINES.md`, `docs/SECURITY.md`, `docs/BUSINESS_RULES.md`, `.env*` (salvo `.env.example`), `src/app/**`. Cambios en `tests/support/**` declarados. Fuera de lista = High |
| F3-42 | Sin operaciones prohibidas | `git log --oneline -1`, `git diff --cached --name-only`, `git stash list` | HEAD sigue en `9290a87…`; índice vacío; sin commit, push ni merge de Develop |
| F3-43 | Revisión de la migración (RLS/GRANT) [Est] | Leer `supabase/migrations/**` | `enable row level security` en las 4 tablas; `revoke all … from anon` (y `public`) explícito; `authenticated` sin `delete`/`truncate`; grants mínimos recomendados (p. ej. `update (name)` en organizations y ningún INSERT/UPDATE/DELETE en memberships); políticas `to authenticated` (no `to public`); `(select auth.uid())`/funciones auxiliares sin subconsultas recursivas; funciones con nombres calificados; sin `security definer` fuera de `private`. Las diferencias menores son Low/Informational, no FAIL, salvo que rompan F3-04..F3-31 |
| F3-44 | Documentación sin afirmar lo no ejecutado | Leer `README.md`, `docs/ARCHITECTURE.md`, ADR-001 | Distingue PGlite, CI Supabase y Cloud; no declara verificado en Supabase lo que solo se probó en PGlite; documenta que la matriz y DH-04..DH-06 no están ratificadas y que DH-06 sigue bloqueada por trigger; sin comandos aspiracionales |
| F3-45 | Pruebas Supabase reales (`tests/integration/supabase/**`) [CI] | `pnpm test:supabase` en CI | Pendiente de push autorizado: Auth real (usuarios creados con clave de servicio local, contraseñas aleatorias), JWT real, PostgREST: lectura y escritura cruzadas rechazadas, `anon` sin acceso, RPC de funciones no expuestas. Hasta entonces: "no ejecutado" |
| F3-46 | Proyecto Supabase Cloud [Cloud] | — | Fuera de F3-T006 / sin autorización. "No aplicable, pendiente" |

## Cobertura de las pruebas independientes (`tests/integration/independent/rls.test.ts`)
- 978 líneas, 56 bloques `it`/`it.each` (se expanden por tabla, actor y operación). Sin `.skip`, `.only`, `.todo`. `git hash-object`: `4371b4c4872f7b97ba9fab95eba0712f20729184`.
- Trazabilidad: BR01/T06 (F3-19, F3-21, F3-23, F3-24), BR02/TC-ARCH-03 (F3-26), TC-ARCH-01/TC-TEAM-07 (F3-30), TC-ARCH-05/TC-TEAM-11 (F3-31 comprueba bloqueo), TC-TEAM-04 (F3-19 en `technicians`), TC-ARCH-02/TC-TEAM-08 (el filtro de archivados por RLS no se puede probar sin órdenes: no hay política que lo implemente en F3; queda para F4; **no es un criterio de F3**).
- Diseño: base compartida (`beforeAll`) para pruebas que no deben mutar datos y base nueva por prueba (`beforeEach`) para mutaciones permitidas y escalada. Cada denegación verifica el estado posterior con superusuario.
- Pruebas que no cubren (brechas declaradas): rol `service_role` y `authenticator`/PostgREST (shim PGlite); JWT real y `auth.uid()` real; concurrencia; `FORCE ROW LEVEL SECURITY`; columnas de contacto de Develop (no están en el contrato); `has_org_role` con roles distintos de owner/member; archivado re-idempotente (no nulo a otro no nulo). Se cubren en POST por revisión y, cuando exista, en `test:supabase`.

## Hallazgos de PRE
| ID | Gravedad | Descripción | Estado |
|---|---|---|---|
| PRE-01 | Informational | La matriz de acceso, la regla "una organización por usuario" y DH-04..DH-06 siguen sin ratificar; las pruebas F3-27/F3-28/F3-31 las toman como contrato. Si el humano cambia la matriz hay que revisar F3-06..F3-31. | Abierto (humano) |
| PRE-02 | Informational | El contrato fija `name` (customers) y `full_name` (technicians) y que organizations carece de columnas obligatorias adicionales. Develop no puede añadir columnas obligatorias sin default sin pedir cambio de la prueba (vía Orchestrator, decide Testing). | Abierto |
| PRE-03 | Informational | `tests/support/**` aún no existe: el criterio de que `asUser` relance el error original no está escrito en el contrato TASK-006.md, solo implícito. Se añade en "Contrato asumido". Orchestrator debe trasladarlo a Develop. | Abierto |
| PRE-04 | Low | `pnpm typecheck` fallará mientras falten `tests/support/*`: la prueba independiente no puede compilar antes de que Develop los entregue. Es esperado en PRE. | Esperado |

## Veredicto PRE
No aplica veredicto de ejecución: PRE solo define criterios y pruebas. Estado: criterios definidos; pruebas independientes escritas, sin ejecutar (no hay runner de integración). Los criterios [CI] y [Cloud] no pueden ser PASS en F3-T006 sin push/proyecto autorizado.
