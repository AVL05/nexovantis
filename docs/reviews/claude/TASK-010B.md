# TASK-010B — Remediación focalizada de AUDIT-002-RETEST

- Fecha: 2026-11-25. Rama `feat/supabase-auth`, base `33e6b1c76b8bbdafd7da6b8130099188ded3d2dd`.
- Origen: [AUDIT-002-RETEST](../codex/AUDIT-002-RETEST.md), veredicto **FAIL** sobre `33e6b1c` (CI 45579875538: `quality` verde; `supabase` con 2/61 E2E fallidas). G2 abierta. Sin F4.
- Clasificación: **crítica** (sesiones, migración con invariante nueva). Alcance limitado por el humano: sin Testing PRE general; las reproducciones de Codex son los criterios de partida. Flujo: Testing (corrección de E2E y reproducciones dirigidas) → Develop → Testing RETEST dirigido. Esfuerzo solicitado high; valores efectivos no observables.
- No se reabren A02-02, A02-03, A02-04 ni A02-06 (resueltos según Codex).

## Criterios (de Codex)
| ID | Sev. | Criterio |
| --- | --- | --- |
| B-01 (A02-01) | High | Con `auth-js` 2.119.2, la revocación de logout con respuesta `204`, `401`, `403`, `404`, `500` y excepción se clasifica como revocación confirmada, sesión confirmada como inexistente o resultado remoto indeterminado; sin evidencia fiable de revocación se comunica la incertidumbre. Sin auth propia, sin exponer tokens, sin dependencias. |
| B-02 (A02-01/P-02) | Medium | Cookies de sesión presentes, ausentes e ilegibles se distinguen; con estado indeterminado no se afirma que la sesión local se cerró y se conserva el reintento. |
| B-03 (A02-05/E-03) | Medium | Ninguna inserción nueva en `activity_events` almacena `seq = NULL` (incluidas inserciones administrativas ordinarias); los eventos históricos con `seq = NULL` se conservan intactos, sin orden inventado. Migración nueva versionada (p. ej. `CHECK (seq is not null) NOT VALID`). |
| B-04 (E2E) | High | `task010-ui.spec.ts`: el aviso desconocido se verifica por contenido visible y elementos renderizados, no por el HTML serializado; la redirección verifica origen, ruta, `q` decodificado y contenido final del buscador tras completar el login (María López). Sin relajar los objetivos de seguridad. |

## Límites
Sin Cloud, sin migraciones ni seeds ejecutados fuera de PGlite, sin F4. Las migraciones existentes no se modifican. Commit autorizado por el humano solo si Testing supera todo lo ejecutable en local sin defectos confirmados; BLOCKED hasta CI sobre el nuevo SHA.

## Fases
1. **Testing (dirigido)** ([TASK-010B-TESTS](TASK-010B-TESTS.md)): caracterización de `auth-js` 2.119.2 (`signOut` devuelve `error: null` ante 204 y ante 401/403/404 con JSON; la evidencia solo es observable en el transporte); reproducciones en rojo (12 unit, 4 PGlite); corrección justificada de `task010-ui.spec.ts` (aviso desconocido por contenido renderizado; redirección por origen, ruta y `q` decodificado con login completo) y de dos pruebas propias que esperaban el falso cierre local.
2. **Develop:** `src/lib/supabase/server.ts` (`createClient({ revocation })` opcional que observa estado y `error_code`/`code` de `POST /auth/v1/logout`, sin leer cabeceras ni tokens), `src/features/auth/{actions,local-session}.ts`, `src/app/login/page.tsx` (alerta `logout-unknown-notice` con reintento para almacén ilegible), migración nueva `20261125100000_task010b_activity_seq_required.sql` (`CHECK (seq is not null) NOT VALID`), `tests/unit/login-logout-failed.test.tsx`, `docs/ARCHITECTURE.md`, `docs/SUPABASE_CLOUD.md`. Checks dirigidos: 148/148 unit, 114/114 integración.
3. **Testing RETEST** ([TASK-010B-RETEST](TASK-010B-RETEST.md)): **PASS** en lo ejecutable en local, sin defectos confirmados. Añade `logout-observer-scope` (8) y `login-unreadable-nobypass` (11). Informational I-1 (`session_not_found` depende del cuerpo real de GoTrue; si falta, se avisa como indeterminado) e I-2 (espera del cuerpo en respuestas no ok).

## Comprobación Git
Antes y después de cada delegación: HEAD `33e6b1c`, sin staging, ignorados sensibles sin cambios; manifiestos de hashes con cambios solo dentro de la lista de cada agente. Migraciones previas sin cambios.

## Matriz
| ID | Corrección | Evidencia local | Pendiente de CI | Estado |
| --- | --- | --- | --- | --- |
| B-01 (A02-01) | 2xx → confirmado; 403 `session_not_found`/`user_not_found` → sesión inexistente; resto (401/403/404 de pasarela, 500, 502, no JSON, excepción) → indeterminado con aviso y cookies borradas | Unit verde (casos de Codex 204/401/403/404/500/excepción) | `logout-revocation`, E2E | Corregido local |
| B-02 (P-02) | Cookies presentes / ausentes / ilegibles; ilegible no afirma cierre y ofrece reintento | Unit verde | — | Corregido local |
| B-03 (A02-05) | `CHECK (seq is not null) NOT VALID`; históricos intactos | PGlite 13/13 | Supabase local | Corregido local |
| B-04 (E2E) | Aserciones de `task010-ui.spec.ts` corregidas sin relajar objetivos | Revisión estática | E2E con Auth real | Pendiente de CI |

Checks locales (RETEST): format, lint, typecheck, build exit 0; unit 691/691; integración PGlite 557/557.

## CI y cierre de la prueba
- CI 45586882982 sobre `3375fe8`: `supabase` **PASS** (193/193 integración, 61/61 E2E con Auth real); `quality` falló solo en `archived-readonly.test.ts:278`. Testing confirmó un defecto de la prueba (`archived_at = now()` podía coincidir con el valor almacenado, sin cambio real; el trigger acertaba al no dispararse) y la corrigió con `archived_at + interval '1 day'`, manteniendo la expectativa 23000. Archivo afectado: 23/23, exit 0. Develop no intervino (sin defecto de implementación).
- I-1 e I-2 aceptados por el humano (2026-11-25) como Informational.

## Estado
**BLOCKED** hasta CI verde en ambos jobs sobre el nuevo SHA. G2 abierta hasta reauditoría de Codex. Cloud sin cambios: cinco migraciones nuevas pendientes de aplicación autorizada.
