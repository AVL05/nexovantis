# TASK-006-RETEST — Revalidación de F3 tras las correcciones de Develop

## Cabecera
- TASK-ID: TASK-006. Fase: RETEST. Fecha: 2026-11-24. Agente: testing. Modelo solicitado: Sonnet 5.5, esfuerzo estándar. Efectivo: autoinformado `claude-sonnet-5-5`, no verificado por CLI; esfuerzo no verificable.
- Rama `feat/supabase-auth`, SHA base `9290a87c63b5b4f9d44f4373609a278bb7ef4889` (sin commit; HEAD sin cambios).
- Git antes: 7 `M` (ci.yml, README.md, docs/ARCHITECTURE.md, package.json, pnpm-lock.yaml, src/features/README.md, src/lib/README.md) y el conjunto `??` de F3, con `0300_f3_freeze_archived_at.sql` nuevo; índice vacío; sin stash. Después: igual más `?? tests/integration/independent/archived-freeze.test.ts` y `?? docs/reviews/claude/TASK-006-RETEST.md`.
- Entorno: Windows 11, Git Bash, Node 24.22.2, pnpm 12.16.1; `NEXT_TELEMETRY_DISABLED=1`. Sin servicios remotos, MCP ni descargas; no se leyó `.claude/settings.local.json`.

## Veredicto: BLOCKED
Todo el alcance local ejecutado se superó y las tres correcciones están verificadas; no hay hallazgos Critical/High ni incumplimientos ejecutados. El veredicto sigue siendo BLOCKED y no PASS porque F3-03, la ejecución del job de F3-39, F3-45 (CI Supabase) y F3-46 (Cloud) no tienen evidencia y no pueden ser PASS. Si el humano acepta de forma explícita y registrada excluirlos hasta el push autorizado, el resto queda en PASS.

## Comandos
| Comando | Exit | Resultado |
|---|---|---|
| `pnpm format:check` | 0 | Prettier correcto |
| `pnpm lint` | 0 | `--max-warnings=0` |
| `pnpm typecheck` | 0 | |
| `pnpm test:unit` | 0 | 5 archivos, 44/44 |
| `pnpm test:integration` (antes de mi caso) | 0 | 3 archivos, 142/142 (141 de POST + 1 nueva de Develop) |
| `pnpm test:integration` (con mi caso) | 0 | 4 archivos, 151/151 |
| `pnpm build` | 0 | Rutas `/`, `/_not-found`, `/icon.svg` |
| `pnpm test:e2e` | 0 | 9/9 |
| `pnpm test:supabase` sin variables (con `env -u`) | 1 | "Startup Error": falla al cargar `vitest.supabase.config.mts`, nombra las 3 variables, sin recoger pruebas ni mostrar omitidas |
| `eslint`/`prettier`/`tsc` sobre mi archivo nuevo | 0 | |
| `git hash-object` | — | `rls.test.ts` `4371b4c…`, `rls-extra.test.ts` `4281ede…` (iguales a lo esperado), AGENTS.md `bdf3e10…`, CLAUDE.md `4745713…` (iguales a POST) |
| Greps `.skip/.only/.todo/xit/xtest/fixme/passWithNoTests/retries/continue-on-error/if: false/pull_request_target` en `tests vitest*.mts package.json .github src supabase` | — | Sin coincidencias |
| `git diff --name-only HEAD -- src/app tests/unit/independent tests/e2e tests/acceptance .claude CLAUDE.md AGENTS.md` | 0 | Sin salida |
| grep `service_role`/`eyJ` en `src/` | — | Sin coincidencias |

## Estado de hallazgos de POST
| ID | Estado | Verificación |
|---|---|---|
| POST-01 | **Resuelto** | `src/lib/README.md`, `src/features/README.md` y `docs/ARCHITECTURE.md` describen `env.ts`, `supabase/`, los esquemas Zod y el modelo F3. Distinguen PGlite (ejecutado), job `supabase` de CI (no ejecutado) y Cloud (no usado), y remiten a ADR-001 para matriz y DH-04..DH-06 no ratificadas. Sin frases obsoletas "Vacío en F2" |
| POST-02 | **Resuelto** | Sin variables, `pnpm test:supabase` termina con exit 1 por "Startup Error" al cargar la configuración, antes de recoger pruebas; ya no se informan pruebas omitidas. Con variables definidas, el job de CI las exporta a `GITHUB_ENV` antes de `pnpm test:supabase` (revisión estática; no ejecutado). `lint`/`typecheck`/`format:check` siguen en verde |
| POST-05 | **Resuelto** (en PGlite) | Migración `…090300_f3_freeze_archived_at.sql` con `create or replace` de `private.prevent_unarchive()`: rechaza con 23000 cualquier cambio de `archived_at` si `old.archived_at` no es nulo; sin SECURITY DEFINER, `search_path = ''`. La migración 0100 conserva el cuerpo original (no editada; su contenido se ve intacto, aunque como archivo no versionado git no puede demostrarlo). Verificación propia abajo |
| POST-03 | Pendiente (Informational) | Requiere CI Supabase; sin cambios |
| POST-04 | Pendiente de aceptación humana | Sin cambios |
| POST-06 | Pendiente de aceptación humana | Sin cambios |
| POST-07 | Pendiente (TASK-007) | Sin cambios |
| PRE-01 | Abierto (humano) | Matriz y DH-04..DH-06 sin ratificar |

## Verificación independiente de POST-05
Nuevo `tests/integration/independent/archived-freeze.test.ts` (propiedad de Testing; 9 pruebas, 151 en total). Para `customers` y `technicians`:
1. Archivar (nulo a fecha) sigue permitido para `member`.
2. Reescribir `archived_at` con ahora, futuro, pasado o `null` falla con 23000 para `member`, `owner` y superusuario; el valor queda sin cambios.
3. Actualizar con el mismo `archived_at` y editar otros campos de un archivado sigue permitido.
4. Una fila no archivada de otra organización no se ve afectada.
Más: `private.prevent_unarchive()` sigue sin ser ejecutable por `authenticated` (42501). Todas en verde. No ejecuté el caso contra la versión anterior de la función (no está permitido editar migraciones); el fallo previo se documentó en POST-05 por análisis del código.
La prueba de Develop en `constraints.test.ts` ("un registro archivado conserva su archived_at") se ejecutó y supera; y la anterior "restaurar un archivado falla…" y F3-31 de `rls.test.ts` siguen en verde, sin relajar aserciones.

## Criterios F3-01..F3-46
Sin cambios respecto a POST salvo: F3-44 pasa de S con reserva a **S** (POST-01 resuelto); F3-03b pasa a **S** (POST-02 resuelto); F3-04..F3-31 siguen **S** (151/151 en PGlite, incluida la restauración bloqueada y el congelado de `archived_at`).
- **Pendiente de CI Supabase (no ejecutado, no PASS):** F3-03 (`supabase start`/`db reset`), F3-39 (solo estático; ejecución del job), F3-45 (`rls.supabase.test.ts`, 20 pruebas).
- **Pendiente de Cloud (no ejecutado, no PASS):** F3-46.
- Alcance local ejecutado (PGlite + estático): todo lo demás en PASS, excepto F3-31b (no aplicable, DH-04/DH-05 hasta F4).

## Hallazgos nuevos
Ninguno. Observación Informational: PGlite no es Supabase; el comportamiento del trigger bajo PostgREST/`service_role` queda cubierto solo cuando corra el job de CI.

## Archivos
Modificados por mí: `?? tests/integration/independent/archived-freeze.test.ts` y `?? docs/reviews/claude/TASK-006-RETEST.md`. Nada más; sin commit ni push. Tocados por Develop (verificados dentro de lo declarado): migración 0300, `vitest.supabase.config.mts`, `tests/integration/constraints.test.ts`, `src/lib/README.md`, `src/features/README.md`, `docs/ARCHITECTURE.md`, `docs/adr/ADR-001-roles-rls.md`.

## Checks no ejecutados
`supabase start`/`db reset`, `pnpm test:supabase` con stack real, Auth/JWT/PostgREST reales, Cloud, `pnpm dev`, ejecución del workflow en GitHub, verificación de la migración 0300 en Supabase, concurrencia y `FORCE ROW LEVEL SECURITY`.
