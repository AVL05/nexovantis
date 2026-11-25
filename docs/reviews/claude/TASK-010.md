# TASK-010 — Remediación de AUDIT-002

- Fecha: 2026-11-24. Rama `feat/supabase-auth`, base `7cc19be50dc3107e33e6169df66868f960504b12`.
- Origen: AUDIT-002 de Codex, veredicto **FAIL** sobre `7cc19be` (registro: [AUDIT-002](../codex/AUDIT-002.md)). G2 permanece abierta hasta la reauditoría independiente de Codex. No se inicia F4.
- Clasificación: **crítica** (sesiones, migraciones con impacto en datos, invariantes nuevas, idempotencia y concurrencia del seed). Flujo: Testing PRE focalizado en A02-01..A02-07 → Develop → Testing POST independiente. Esfuerzo solicitado: high para Develop y Testing (parámetro de invocación); modelo según la definición de los agentes (Sonnet). Valores efectivos no observables.

## Objetivo
Corregir los siete hallazgos de AUDIT-002 con soluciones simples y verificables, sin reestructurar el proyecto ni ampliar el alcance a F4.

## Hallazgos y criterios de partida (detalle verificable en TASK-010-PRE)
| ID | Sev. | Corrección exigida |
| --- | --- | --- |
| A02-01 | High | Logout distingue revocación remota confirmada, error devuelto y excepción; no comunica cierre remoto no confirmado; cierre local seguro cuando sea posible, con limitaciones comunicadas. Pruebas de las ramas de error y de la sesión copiada previamente cuando falla la revocación. R1 sigue aceptado solo en su alcance original. |
| A02-02 | High | Ambas suites de integración Supabase validan estrictamente un destino local autorizado antes de construir clientes administrativos o enviar peticiones; reutilizar la protección de las E2E. Pruebas: destinos remotos y variantes inválidas rechazados sin tráfico ni escrituras. |
| A02-03 | Medium | Identidad estable de fixtures del seed, independiente de campos editables; preserva registros existentes, renombrados, restaurados y modificados; reconciliación preparada (no ejecutada) para Cloud sin deducir identidades ambiguas por nombre; seed no destructivo, transaccional, idempotente y con protección simple frente a ejecuciones concurrentes. |
| A02-04 | Medium | Restricciones de nombre unificadas en PostgreSQL y Zod (organizaciones, clientes, técnicos): máximo 200 caracteres almacenados; rechazo de nombres solo con espacios en blanco (incluidas tabulaciones). Pruebas de límites y PostgREST. |
| A02-05 | Medium | Orden fiable de eventos de una entidad cuando coincide `occurred_at`, sin romper atomicidad ni inmutabilidad; sin inventar orden histórico para filas existentes. |
| A02-06 | Medium | Archivados de solo lectura hasta su restauración, alineado en PostgreSQL, servicios, UI y pruebas; sin elusión por PostgREST ni restauración+edición en una operación. |
| A02-07 | Medium | `safeNextPath` conserva parámetros legítimos codificados (espacios, porcentajes) sin abrir open redirects. |

## Límites
Nuevas migraciones versionadas; no modificar las cinco existentes. Sin migraciones, seeds ni escrituras en Cloud. Sin debilitar RLS, GRANT ni restricciones. Sin `service_role` en la app. Sin dependencias ni infraestructura nuevas. Sin commit ni push. No se revisa AUDIT-001.

## Decisiones humanas ratificadas (TASK-010)
Roles `owner`/`member` según ADR-001; una organización por usuario en el MVP; aprovisionamiento externo y registro público desactivado; ambos roles gestionan clientes y técnicos; archivados de solo lectura hasta restaurarse. Registradas por Orchestrator en docs/adr/ADR-001-roles-rls.md, docs/BUSINESS_RULES.md, docs/ARCHITECTURE.md y docs/STATUS.md antes de la primera delegación. DH-04, DH-05 y la ampliación de DH-08 siguen vinculadas a sus fases.

## Fases
1. **Testing PRE** ([TASK-010-PRE](TASK-010-PRE.md)): criterios y pruebas independientes en rojo (28 unit, 155 PGlite), contrato de interfaz. Orchestrator acepta los riesgos R-04 (sin edición de archivados para ningún rol, incluido superusuario), E-04 (`seq` NULL en eventos históricos), el contrato de reconciliación y la longitud en puntos de código.
2. **Develop**: primera ejecución detenida por el humano a medias (cambios parciales dentro de la lista permitida); el humano autorizó reanudar. Segunda ejecución interrumpida por el cierre de la sesión y reanudada sobre su transcripción. Informe final (mensaje de Develop, resumido):
   - Archivos: `src/features/auth/{actions,redirect,routes}.ts`, `src/app/login/page.tsx`, `src/features/activity/service.ts`, `src/lib/supabase/database.types.ts`; migraciones nuevas `20261125090000_task010_name_constraints.sql`, `…090100_task010_activity_seq.sql`, `…090200_task010_archived_readonly.sql`, `…090300_task010_demo_fixture_identity.sql`; `supabase/seeds/demo-crm.sql`, `supabase/seeds/reconcile-demo-crm.sql`, `supabase/checks/name-constraints-precheck.sql`; `tests/support/local-supabase.ts`, `tests/support/supabase-local-guard.setup.ts` (compartidos, nuevos), `vitest.supabase.config.mts`, `tests/integration/supabase/rls.supabase.test.ts`, `tests/e2e-supabase/support/crm-world.ts`, `tests/integration/{constraints,seed-demo}.test.ts`; `docs/SEED.md`, `docs/SUPABASE_CLOUD.md`, `docs/ARCHITECTURE.md`, `docs/adr/ADR-001-roles-rls.md` (sección técnica).
   - Checks propios: format, lint, typecheck, unit 582/582, build en verde; integración 535/536 (una prueba independiente incorrecta, confirmada por Testing).
3. **Testing POST** ([TASK-010-POST](TASK-010-POST.md)): **BLOCKED** solo por los criterios de CI (Supabase local y E2E con Auth real). Sin hallazgos Critical/High/Medium. Corrigió su prueba `activity-order.test.ts` (orden por alias de texto, P-01) y añadió `task010-post-hardening.test.ts`. Hallazgos Informational P-02..P-05 pendientes de aceptación humana; P-05 (falta de informe de Develop) queda atendido con el resumen anterior.

4. **Decisión humana sobre POST:** P-03 y P-04 aceptados como Informational, con sus limitaciones documentadas en TASK-010-POST. P-02 **no aceptado**: ante el fallo simultáneo de revocación remota y borrado local, aviso explícito de sesión no cerrada y opción de reintento, con corrección mínima.
5. **Develop (P-02):** `src/features/auth/{actions,routes}.ts`, `src/app/login/page.tsx`, nuevos `src/features/auth/local-session.ts` y `tests/unit/login-logout-failed.test.tsx`. `/login?aviso=cierre-no-confirmado` con cookies `sb-*-auth-token` presentes no redirige a `/dashboard`: alerta fija (`logout-failed-notice`) y botón "Reintentar cierre de sesión" que invoca `logoutAction`. Checks dirigidos: format, lint, typecheck exit 0; 122/122 en 7 archivos de auth/login.
6. **Testing RETEST P-02** ([TASK-010-RETEST](TASK-010-RETEST.md)): **PASS** para P-02 (30 casos independientes nuevos; 239/239 en 9 archivos de auth/login; format, lint, typecheck exit 0). Informational P-02-N1 (abrir a mano el aviso con sesión válida muestra el aviso de fallo, sin bypass) y P-02-N2 (doble fallo real solo cubierto con dobles) pendientes de aceptación humana. Sin suites completas, por instrucción humana: la regresión la hace CI.

## Comprobación Git (Orchestrator)
Antes y después de cada delegación: HEAD `7cc19be`, rama `feat/supabase-auth`, sin staging, ignorados sensibles sin cambios (`.claude/settings.local.json`, `.env.local`). Manifiestos de hashes comparados: cada ruta cambiada pertenece a la lista permitida del agente correspondiente; Develop no modificó `tests/**/independent/**` ni las cinco migraciones previas.

## Resultados
Locales (Testing POST, árbol sin commit): format, lint, typecheck, build exit 0; unit 582/582; integración PGlite 544/544. Pendientes de CI sobre un SHA autorizado: `pnpm test:supabase` (logout-revocation, name-constraints, archived-readonly, archive-restore, rls) y `pnpm test:e2e:supabase` (task010-ui, crm). Cloud: nada ejecutado; precheck, migraciones y reconciliación documentados en docs/SUPABASE_CLOUD.md y docs/SEED.md para una tarea autorizada.

## Matriz
| ID | Corrección | Pruebas | Evidencia local | Pendiente de CI | Estado |
| --- | --- | --- | --- | --- | --- |
| A02-01 | Distingue confirmado / error / excepción; sin confirmación borra cookies `sb-*-auth-token*` y avisa en `/login` sin afirmar cierre remoto; doble fallo (P-02): aviso de sesión no cerrada y reintento; R1 intacto | `logout-action`, `login-logout-notice`, `login-logout-failed(-retest)` | Unit verde (RETEST P-02 PASS) | `logout-revocation` (sesión copiada), E2E | Corregido local; CI pendiente |
| A02-02 | Guard `tests/support/local-supabase.ts` antes de construir clientes, en ambas suites, E2E y `setupFile` | `local-supabase-guard`, `supabase-suites-remote-guard` | Verde; 7 destinos remotos/invalidos sin tráfico | — | Corregido (local) |
| A02-03 | `private.demo_fixture_identity`; seed transaccional, idempotente, no destructivo, `pg_advisory_xact_lock`; reconciliación por firma original, comprobación por defecto | `seed-identity`, `seed-reconcile`, `seed-demo`, hardening | Verde PGlite | Concurrencia real y reconciliación en Cloud (no ejecutadas) | Corregido local; Cloud aplazado |
| A02-04 | CHECK ≤200 y no solo blancos en las 3 tablas; Zod equivalente; precheck de solo lectura | `name-constraints`, `name-schemas`, paridad BMP | Verde | PostgREST | Corregido local; CI pendiente |
| A02-05 | `activity_events.seq` por secuencia, no escribible, históricos NULL; orden `occurred_at, seq` | `activity-order`, `activity-history-order`, hardening | Verde | PostgREST | Corregido local; CI pendiente |
| A02-06 | Trigger: archivado solo admite restauración pura, sin excepción por rol; servicio y UI sin edición de archivados | `archived-readonly`, `archived-freeze`, `archive-restore`, `constraints` | Verde | PostgREST, E2E | Corregido local; CI pendiente |
| A02-07 | `safeNextPath` conserva `%20`, `%25` y acentos; sigue rechazando `//`, `\`, `..` y doble codificación | `safe-next-path-encoded`, `login-logout-notice`, fuzz 400 000 | Verde, 0 violaciones | E2E | Corregido local; CI pendiente |

## Estado
TASK-010 **BLOCKED** por CI (no es PASS). G2 abierta hasta CI verde sobre el nuevo SHA y reauditoría independiente de Codex. Commit de implementación `d42c38ef0264cfd646f6443f127bd5dbbbde1c84`, autorizado por el humano tras el RETEST de P-02. P-02-N1 y P-02-N2 aceptados por el humano (2026-11-25) como Informational, con sus limitaciones (TASK-010-RETEST). AUDIT-002 registrado literalmente en docs/reviews/codex/AUDIT-002.md (guardado por el humano; cabecera de Orchestrator con SHA-256 del original). Pendiente: push, CI sobre el SHA y reauditoría de Codex.
