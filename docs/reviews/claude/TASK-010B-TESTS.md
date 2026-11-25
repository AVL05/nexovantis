# TASK-010B-TESTS — Testing, fase dirigida previa a Develop (B-01..B-04)

- Fase: PRE dirigido (no PRE general). Crítica. Esfuerzo solicitado high; efectivo no observable.
- Rama `feat/supabase-auth`, base `33e6b1c76b8bbdafd7da6b8130099188ded3d2dd`. Sin commit. Sin red externa, sin Cloud.
- Git antes: solo `?? docs/reviews/claude/TASK-010B.md`, `?? docs/reviews/codex/AUDIT-002-RETEST.md`.
- Git después (esta tarea): `M` task010-ui.spec.ts, login-logout-failed-retest.test.tsx, login-logout-notice.test.tsx; `??` logout-authjs-characterization.test.ts, logout-action-transport.test.ts, support/logout-transport.ts, activity-seq-notnull.test.ts, y este informe. Nada fuera de `tests/**/independent/**` y este informe. Sin `.skip/.only/.todo`.
- Entorno: Windows, Node 24.22.2, vitest 5.1.1, `@supabase/auth-js` 2.119.2 (instalado en `node_modules/.pnpm`), PGlite local. E2E con Auth real: no ejecutable aquí (solo CI).

## B-01 — Comportamiento de auth-js 2.119.2 (leído en `src/GoTrueClient.ts#_signOut`, `lib/fetch.ts#handleError`; verificado con transporte simulado)

`signOut({scope:'local'})` borra la sesión local ANTES de la petición y luego hace `POST {url}/auth/v1/logout?scope=local`. Sin cookies de sesión no envía nada y devuelve `error: null`. Ignora (devuelve `error: null`) todo `AuthApiError` con status 401/403/404 y todo `AuthSessionMissingError`; este último se fabrica ante cualquier respuesta cuyo cuerpo traiga `session_not_found`. Su propio comentario reconoce que es incorrecto para GoTrue actual (TODO v3).

| Respuesta de revocación | `signOut` devuelve | `logoutAction` hoy |
| --- | --- | --- |
| 204 | `error: null` | `/login` (correcto) |
| 401/403/404 con JSON sin código GoTrue (pasarela) | `error: null` (AuthApiError ignorado) | `/login` sin aviso (**defecto**) |
| 403 `bad_jwt`, 401 `no_authorization`, 403 `user_banned` (GoTrue) | `error: null` | `/login` sin aviso (**defecto**: nada se revocó) |
| 403 `session_not_found` (formato heredado `error_code` o api-version 2024-01-01 `code`) / `user_not_found` | `error: null` (AuthSessionMissingError o ApiError ignorado) | `/login` (aceptable: sesión inexistente) |
| 401/403/404 con cuerpo HTML | `AuthUnknownError` (sin status) | aviso (correcto) |
| 500 JSON / 502 HTML | `AuthRetryableFetchError` status 500/502 | aviso (correcto) |
| fetch rechaza | `AuthRetryableFetchError` status 0 (devuelto, no lanzado) | aviso (correcto) |

Evidencia que distingue las clases (solo observable en el transporte, no en el resultado de `signOut`): código HTTP de la respuesta del `POST /auth/v1/logout`; campo de cuerpo `error_code` (heredado) o `code` textual (con cabecera de respuesta `x-supabase-api-version: 2024-01-01`), que es lo mismo que lee auth-js; que haya o no petición. No he podido verificar en local qué cabeceras añade el GoTrue real (p. ej. `x-sb-error-code`): no se usa.

### Criterio esperado (fijado en los tests)
- `confirmed`: 204 → `redirect('/login')` exacto, sin aviso.
- `session-absent`: respuesta de GoTrue con `session_not_found` o `user_not_found` (status 403, ambos formatos de cuerpo) → `/login` sin aviso. Justificación: la sesión no existe en Auth (sus refresh tokens dependen de ella), no queda nada que revocar y una copia no sirve. Es control anti-sobrecorrección.
- `indeterminate`: cualquier otra respuesta no 2xx (401/403/404 de pasarela, `bad_jwt`, `no_authorization`, `user_banned`, 500, 502), cuerpo no JSON, excepción → `redirect('/login?aviso=cierre-no-confirmado')` + cierre local seguro (cookies de sesión eliminadas, ajenas intactas). Nunca se afirma cierre remoto.
- Un único POST; sin reintentos; URL de redirección fija sin estado/cuerpo/código/tokens; ningún token en consola.
- Sin cookies de sesión (auth-js no emite petición) → `/login` (no hay nada que revocar).

### Contrato mínimo de interfaz para Develop
Las pruebas usan `logoutAction` y `@/lib/supabase/server#createClient` reales y solo doblan `next/*` y `globalThis.fetch`: no fijan una API interna. Diseño verificado como viable en un prototipo desechado (16/16 casos): pasar a `createServerClient` una opción `global.fetch` que delegue en `fetch` y, solo para el `POST …/auth/v1/logout`, registre `status` y el código de error leído de `res.clone().json()` (`error_code` o `code` si es cadena; únicamente en respuestas no ok). No leer ni guardar cabecera `Authorization`, cuerpo de petición ni tokens; el registro vive en el alcance de la solicitud (no módulo global). Regla de decisión: no observada → resultado de `signOut` (`error:null`→`/login`, error→aviso); excepción de transporte → indeterminado; 2xx → confirmado (si `signOut` devolvió error, indeterminado); 403 con código `session_not_found`/`user_not_found` → sesión inexistente; resto → indeterminado. Sin auth propia ni dependencias (`package.json` y lockfile sin cambios). Debe mantenerse compatible con `logout-action.test.ts` (que doblan `createClient` con `{auth:{signOut}}`).

## B-02 — presentes / ausentes / ilegibles (`login-logout-failed-retest.test.tsx`)
Contrato: aviso y almacén legible con cookies → `logout-failed-notice` (alert) + `logout-retry` (sin cambios); legible sin cookies → `logout-notice` "se cerró en este navegador", sin reintento (sin cambios); **ilegible** (`cookies()` rechaza o lanza síncrono, o `getAll()` lanza) → no se afirma cierre local (ni `se cerró en este navegador`, ni `sesión cerrada`), aviso anunciable (`role` alert|status) con "no se pudo…", y reintento `logout-retry` habilitado dentro de un `form`. La acción con almacén ilegible sigue redirigiendo a `/login?aviso=…` sin propagar (el valor del aviso lo decide Develop; las pruebas encadenan la URL devuelta). Sin aviso, almacén ilegible → formulario normal.

### Cambios en pruebas existentes (justificados)
1. `login-logout-failed-retest.test.tsx`: dos pruebas de `cookies()` ilegible esperaban `logout-notice` ("se cerró…"): era precisamente el falso positivo del hallazgo 2; ahora fijan el criterio B-02. Se añade bloque de 7 casos (presentes, ausentes, ilegibles acción+render, createClient+ilegible, getAll lanza, sin aviso, reintento ok) y helper `expectLocalCloseUnknown`.
2. `login-logout-notice.test.tsx`: no doblaba `next/headers`; fuera de una solicitud `cookies()` lanza, es decir, probaba con el almacén ilegible. Se dobla un almacén legible sin cookies de sesión para que la prueba cubra el estado "ausentes" (sin eso fallaría al corregir B-02 por una causa ajena a su objetivo). Sus aserciones no se relajan.

## B-03 — `tests/integration/independent/activity-seq-notnull.test.ts` (PGlite)
13 casos: existe migración con versión > 20261125090300 (las anteriores presentes); sobre base con 3 eventos históricos (`seq` NULL) migrada hasta 20261125090300 y luego con la nueva: migración sin error, histórico idéntico (todas las columnas y seq NULL), `seq = NULL` explícito rechazado (23502/23514; transacción revertida para no contaminar), multifila y `INSERT…SELECT` con NULL rechazados enteros, `seq` omitido recibe valor creciente, `seq` explícito válido aceptado y duplicado → 23505, trigger de archivado sigue asignando seq, inmutabilidad (UPDATE/DELETE/TRUNCATE → 23000, históricos siguen siendo 3), forma bigint+default nextval+único, `authenticated` sigue sin INSERT (42501). Validado con una migración de muestra desechada (`CHECK (seq is not null) NOT VALID`): 12/13 verdes; el 13.º exige el archivo de migración.

## B-04 — `task010-ui.spec.ts` (validación estática; ejecución pendiente de CI)
- Aviso desconocido: se elimina `page.content()`. Ahora: heading visible; `logout-notice`, `logout-failed-notice`, `logout-retry` = 0; ningún `[role=alert|status]` con texto; `document.body.innerText` sin el valor, sin `<b>` ni textos de aviso; ningún `<b>` con el valor; recorrido del DOM renderizado (nodos de texto y atributos, excluyendo script/style, y `title`) sin el valor. Objetivo de seguridad (sin reflejo) intacto.
- María López / `100%`: la igualdad literal `next == path` se sustituye por: origen y `/login` correctos, `next` ruta interna (no `//`, mismo origen), pathname `/customers`, `q` decodificado = esperado y sin parámetros extra, campo oculto equivalente; tras login: origen, ruta, `q` decodificado, sin parámetros extra y buscador con el valor. Cubre sin open redirect (el caso hostil no se toca).
- Riesgo residual: no se ha podido observar el DOM real; en CI revisar que no exista otro `role=status` con texto en `/login` sin aviso (grep del código: solo `Alert`).

## Resultados de checks (locales)
| Check | Resultado |
| --- | --- |
| `pnpm format:check` / `pnpm lint` / `pnpm typecheck` | exit 0 / 0 / 0 |
| vitest dirigido unit (6 archivos, incl. `logout-action.test.ts` y `tests/unit/login-logout-failed.test.tsx` de Develop) | 95 pasan, **12 rojos esperados** |
| vitest integración `activity-seq-notnull` + `activity-order` | 21 pasan, **4 rojos esperados** |
| E2E Playwright con Auth real (B-04), `test:supabase` | no ejecutado (CI) |
| Regresión completa unit/integración | no ejecutada (alcance dirigido) |

### Pruebas en rojo esperadas (defecto presente en 33e6b1c)
- B-01 (7, `logout-action-transport.test.ts`): 401/403/404 pasarela JSON, 403 `bad_jwt`, 401 `no_authorization`, 403 `user_banned`, y el caso con borrado local fallido. Aserción: `'/login'` en lugar de `/login?aviso=cierre-no-confirmado`.
- B-02 (5, `login-logout-failed-retest.test.tsx`): ilegible en render/acción+render muestra "se cerró en este navegador" y no ofrece reintento.
- B-03 (4, `activity-seq-notnull.test.ts`): sin migración nueva; `seq = NULL` aceptado (single, multifila, INSERT…SELECT).
- Verdes de control (no defecto): 204, `session_not_found`/`user_not_found`, HTML 401/403/404, 500, 502, excepción, sin cookies; caracterización auth-js (17).

## Notas para Develop / Orchestrator
- `tests/unit/login-logout-failed.test.tsx` (de Develop, no tocada) pasa hoy; si el cambio de B-02 la invalida, actualizarla por vía de handoff.
- Los 12 + 4 rojos deben pasar a verde sin editar estos archivos; cualquier ajuste se solicita por Orchestrator.
- Veredicto de esta fase: no aplica (PRE dirigido). Sin hallazgos nuevos; B-01..B-04 confirmados por reproducción.
