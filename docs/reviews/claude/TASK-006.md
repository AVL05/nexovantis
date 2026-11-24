# TASK-006 — Supabase database foundation (contrato y registro de Orchestrator)

Fecha: 2026-11-24. Rama `feat/supabase-auth`, HEAD `9290a87` (publicado). Fase F3, primera tarea. Autorización: prompt TASK-006 del humano (2026-11-24).

## Decisión humana previa (2026-11-24)
Pregunta de Orchestrator sobre la ejecución de pruebas de base de datos sin Docker. Respuesta del humano: **"PGlite + CI Supabase"**: añadir `@electric-sql/pglite` (devDependency) para ejecutar migraciones y pruebas RLS en PostgreSQL real in-process con un shim mínimo de auth, y preparar un job de CI con `supabase start` en el runner de GitHub para pruebas reales de PostgreSQL y Auth, verificable solo tras un push autorizado.

## Entorno comprobado (Orchestrator, 2026-11-24)
Docker: no instalado. WSL: versión 2, sin distribuciones. Supabase CLI: no instalado. `psql`/`postgres`: no instalados. No se instala nada de esto. Conectores de Supabase visibles en la sesión: **no se usan** (instrucción del humano).

## Versiones (registro npm, `pnpm view`, 2026-11-24)
| Paquete | Versión | Tipo | Motivo |
|---|---|---|---|
| @supabase/supabase-js | 2.119.2 | dependencia | Última estable (2026-11-19); Node `>=22` |
| @supabase/ssr | 0.12.7 | dependencia | Última (2026-09-08); peer supabase-js `^2.114.0` |
| zod | 4.6.7 | dependencia | Validación de entrada en servidor y dominio |
| @electric-sql/pglite | 0.5.17 | devDependency | PostgreSQL real in-process para pruebas (decisión humana). 0.6.0 se publicó el 2026-11-23: se evita por recién salida |
| Supabase CLI | 2.122.1 | solo en CI (`supabase/setup-cli`) | No se instala en local: sin Docker no aporta. 3.x es una línea nueva (3.0.0 del 2026-11-02); se usa la última 2.x |
No se actualizan las dependencias de F2.

## Alcance
1. Migraciones SQL versionadas en `supabase/migrations/` (nombre `YYYYMMDDHHMMSS_descripcion.sql`), ejecutables sin cambios en Supabase y en PGlite con shim.
2. Esquema F3: `organizations`, `memberships`, `customers`, `technicians`. Sin `profiles` (no aporta valor en F3; `auth.users` tiene el email). Sin órdenes, presupuestos ni inventario.
3. Roles `owner` y `member`, matriz explícita, RLS por operación, GRANT/REVOKE, funciones auxiliares SECURITY DEFINER endurecidas.
4. Clientes Supabase de navegador y servidor con `@supabase/ssr` y validación de entorno con Zod; `.env.example` con nombres y valores vacíos. Login, logout, sesión, proxy y rutas protegidas: TASK-007.
5. Esquemas Zod de dominio para clientes y técnicos.
6. Datos sintéticos reproducibles (dos organizaciones, usuarios distintos, membresías, clientes y técnicos) y pruebas positivas y negativas de RLS y restricciones.
7. CI: `test:integration` (PGlite) en el job actual y nuevo job con Supabase local en el runner.

## Diseño propuesto por Orchestrator (Develop puede refinarlo justificándolo; los cambios de seguridad se informan)
- Identificadores `uuid` con `gen_random_uuid()`; `created_at`/`updated_at` `timestamptz not null default now()` y trigger de `updated_at`.
- `organizations(id, name)`; `name` no vacío y longitud acotada.
- `memberships(organization_id → organizations, user_id → auth.users on delete cascade, role in ('owner','member'))`, PK `(organization_id, user_id)` y **`unique(user_id)`**: un usuario pertenece como máximo a una organización (multiempresa avanzada fuera de alcance, PRODUCT_REQUIREMENTS).
- `customers` y `technicians`: `organization_id not null → organizations`, campos de contacto sintéticos, `archived_at timestamptz null`, `unique (organization_id, id)` para claves foráneas compuestas de F4 (BR01).
- `organization_id` inmutable tras la creación (trigger).
- Archivado = `archived_at` no nulo. Restaurar (DH-06) **no está ratificado**: un trigger impide pasar de archivado a no archivado hasta la decisión humana. Borrado: no existe para usuarios (BR02, TC-ARCH-03).
- Funciones auxiliares en un esquema no expuesto (p. ej. `private`): `is_org_member(org uuid)` y `has_org_role(org uuid, role text)`, `SECURITY DEFINER`, `set search_path = ''`, nombres calificados, `REVOKE EXECUTE FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated`. Evitan la recursión de políticas sobre `memberships`.
- GRANT/REVOKE: `REVOKE ALL` a `anon` en las cuatro tablas; a `authenticated` solo lo que la matriz permite (sin `DELETE` ni `TRUNCATE`).
- Creación de organizaciones y alta de membresías: **no disponibles desde la aplicación** en F3 (sin registro público, PRODUCT_REQUIREMENTS). Se hacen por migración/seed o administración fuera de la app. Ninguna política INSERT/UPDATE/DELETE en `memberships` para `authenticated`: impide autoasignarse roles o unirse a otra organización.

## Matriz de acceso propuesta (pendiente de aprobación humana)
| Recurso | anon | member | owner |
|---|---|---|---|
| organizations | — | SELECT propia | SELECT propia; UPDATE `name` |
| memberships | — | SELECT de su organización | SELECT de su organización |
| customers | — | SELECT, INSERT, UPDATE (incl. archivar) en su organización | igual que member |
| technicians | — | SELECT, INSERT, UPDATE (incl. archivar) en su organización | igual que member |
| DELETE en cualquier tabla | — | — | — |
| Crear organización / alta o cambio de membresía | — | — | — (fuera de la app en F3) |

## Contrato de pruebas (lo implementa Develop; Testing escribe sus casos contra él)
- `tests/support/pglite.ts` exporta `createTestDb(): Promise<TestDb>`, que crea una instancia PGlite en memoria, aplica `tests/support/supabase-shim.sql` (roles `anon`, `authenticated`, `service_role`; esquema `auth` con `auth.users(id uuid primary key, email text)`; `auth.uid()`, `auth.role()` y `auth.jwt()` leyendo `request.jwt.claims`; grants por defecto equivalentes a Supabase en `public`) y después todas las migraciones en orden. `TestDb`:
  - `asSuperuser(fn)`: ejecuta `fn(tx)` sin RLS (solo para preparar datos).
  - `asUser(userId, fn)`: transacción con `set local role authenticated` y `request.jwt.claims` = `{"sub": userId, "role": "authenticated"}`.
  - `asAnon(fn)`: transacción con `set local role anon`.
  - `close()`.
  - `tx.query(sql, params)` es la API de PGlite.
- `tests/support/fixtures.ts` exporta `seedTwoOrgs(db: TestDb)` con UUID fijos y devuelve `{ orgA, orgB, ownerA, memberA, ownerB, memberB, customerA, customerB, technicianA, technicianB }`. Emails `@example.test`, nombres ficticios.
- Script `test:integration`: Vitest en entorno node sobre `tests/integration/**/*.test.ts`, excluyendo `tests/integration/supabase/**`. Script `test:supabase`: Vitest sobre `tests/integration/supabase/**`; exige `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` del stack local de CI (`supabase status -o env`) y falla si faltan, sin saltarse pruebas. La clave de servicio local solo prepara usuarios y datos de prueba, nunca en código de `src/`. Las contraseñas de usuarios de prueba se generan aleatoriamente en tiempo de ejecución, nunca en archivos versionados.
- Las pruebas de F2 se conservan sin cambios.

## Archivos permitidos para Develop (lista cerrada)
`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (solo si pnpm exige aprobar scripts de build), `.env.example`, `vitest.config.mts`, `vitest.integration.config.mts` (y uno para Supabase si hace falta), `supabase/config.toml`, `supabase/migrations/**`, `supabase/seed.sql`, `src/lib/supabase/**`, `src/lib/env.ts`, `src/features/customers/**`, `src/features/technicians/**`, `src/features/organizations/**`, `tests/unit/**`, `tests/integration/**` (excepto `independent/`), `tests/support/**` (compartido; cada cambio se declara), `.github/workflows/ci.yml`, `README.md`, `docs/ARCHITECTURE.md` (modelo de datos y seguridad), `docs/adr/ADR-001-roles-rls.md` (nuevo).

## Archivos prohibidos
`.claude/**` (no leer `.claude/settings.local.json`), CLAUDE.md, AGENTS.md, `docs/reviews/**`, `docs/TESTING_GUIDELINES.md`, `docs/CHALLENGE.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/BUSINESS_RULES.md`, `docs/SECURITY.md`, `docs/STATUS.md`, `tests/acceptance/**`, `tests/**/independent/**`, `src/app/**` (páginas de F2 intactas), `.env`, `.env.local` y cualquier `.env*` distinto de `.env.example`, `.gitattributes`, `.editorconfig`, `.gitignore` (salvo que falte un artefacto generado: se pide).

## Restricciones
Sin proyectos remotos, sin conectores, sin servicios de pago, sin datos personales reales, sin claves ni contraseñas versionadas, sin `service_role` en `src/`, sin commits, push ni despliegues. Accesos remotos autorizados: registro npm para instalar las versiones de la tabla. `NEXT_TELEMETRY_DISABLED=1` en los comandos. Tras cualquier `pnpm dev`, comprobar que AGENTS.md y CLAUDE.md no cambian.

## Decisiones humanas pendientes
- Ratificar la matriz de acceso y la regla de una organización por usuario.
- DH-04 (propuesta del humano: impedir archivar técnicos con órdenes abiertas), DH-05 (impedir archivar clientes con órdenes abiertas) y DH-06 (permitir restaurar con evento). Son **propuestas no ratificadas**. DH-04 y DH-05 dependen de las órdenes (F4); DH-06 se mantiene bloqueado por trigger hasta su ratificación, y su evento depende de DH-08 (F4/F6).

## Registro de delegaciones (agentes nativos con la herramienta Agent; modelo autoinformado `claude-sonnet-5-5`, esfuerzo configurado `high`, efectivo no verificable)

| Paso | Agente | Resultado | Comprobación de Orchestrator (manifiesto `git hash-object`, HEAD `9290a87`, índice vacío) |
|---|---|---|---|
| PRE | testing | Criterios F3-01..F3-46 ([TASK-006-PRE](TASK-006-PRE.md)); prueba independiente `tests/integration/independent/rls.test.ts` (113 casos) | Solo las 2 rutas autorizadas |
| Implementación | develop | 4 dependencias exactas; 3 migraciones; RLS, GRANT/REVOKE por columna, funciones `private.*` endurecidas, triggers; clientes `@supabase/ssr`, `env.ts`, esquemas Zod; harness PGlite y fixtures; pruebas Supabase para CI; job `supabase`; ADR-001. unit 44/44, integration 127/127, e2e 9/9 | Todas las rutas dentro de la lista permitida |
| POST | testing | **BLOCKED** ([TASK-006-POST](TASK-006-POST.md)): todo lo local en verde (141/141 con `rls-extra.test.ts`, 14 casos nuevos), sin Critical/High/Medium; pendientes de CI Supabase y Cloud. Hallazgos Low POST-01, POST-02, POST-05 | Solo el informe y la prueba independiente nueva |
| Corrección | develop | POST-01 (README y ARCHITECTURE), POST-02 (`test:supabase` falla al cargar la configuración sin variables), POST-05 (migración `20261124090300_f3_freeze_archived_at.sql`: `archived_at` inmutable una vez fijado hasta DH-06) | 7 rutas, todas permitidas |
| RETEST | testing | **BLOCKED** ([TASK-006-RETEST](TASK-006-RETEST.md)): POST-01, POST-02 y POST-05 resueltos; unit 44/44, integration 151/151 (incluye `archived-freeze.test.ts`, 9 casos), e2e 9/9, build y lint en verde. Sin hallazgos nuevos | Solo el informe y la prueba independiente nueva |

Motivo del BLOCKED: F3-03 (`supabase start`), la ejecución del job `supabase` (F3-39) y F3-45 (20 pruebas PostgREST/Auth) requieren un push autorizado; F3-46 requiere un proyecto Supabase Cloud. No se declaran PASS.

Pendiente de aceptación humana: POST-04 (acciones de CI fijadas por versión mayor), POST-06 (tipos escritos a mano, sin `seed.sql`), POST-07 (`setAll` ignora `headers`; se revisa en TASK-007), PRE-01 (matriz y DH-04..DH-06 sin ratificar).

## Decisiones humanas tras el RETEST (2026-11-24)
- Commit de TASK-006 autorizado; push todavía no.
- POST-04 y POST-06 aceptados, con sus limitaciones registradas: acciones de CI fijadas por versión mayor; tipos de base de datos escritos a mano y sin `seed.sql`.
- POST-07 aplazado a TASK-007.
- El veredicto se mantiene **BLOCKED** mientras no se ejecuten las pruebas reales de Supabase (F3-03, F3-39, F3-45 y F3-46).
- Sin más delegaciones ni repetición de pruebas sobre contenido ya validado. El commit solo añade, respecto al árbol revisado en el RETEST, los registros de Orchestrator (`TASK-006.md` y `docs/STATUS.md`).
- Siguen pendientes de ratificación: la matriz de acceso, una organización por usuario, y DH-04, DH-05 y DH-06.
