# TASK-007 — POST (Testing)

Fase: POST. Tarea crítica. Fecha: 2026-11-24. Rama `feat/supabase-auth`, SHA base `764397c` (sin commit ni push).
Modelo/esfuerzo solicitado: Sonnet 5.5 / high; efectivo: no verificable (autoinformado).
Git antes/después: sin cambios en `src/`, `tests/**`, `.github/`, `package.json`, `supabase/` por parte de Testing; solo se añade este informe. `git diff --name-only` no toca `tests/**` (las independientes no cambiaron); no hay `.skip/.only/xit/xtest/.todo/retries` en `tests/` ni en `playwright.supabase.config.ts`.
Decisión Orchestrator DH-T7-1: `requireUser()` usa `getUser()`. Verificado en `src/features/auth/session.ts`.

## Veredicto: BLOCKED
Sin hallazgos Critical/High ni incumplimientos detectados en lo ejecutable localmente. Las 42 E2E con Auth real (aceptación efectiva de T7-01..05, 07..12, 15..16) no se han ejecutado nunca: dependen del job `supabase` de CI (requiere push no autorizado). BLOCKED no se convierte en PASS sin esa evidencia.

## Comandos (local, sin Docker; ejecutados por Testing)
| Comando | Exit | Resultado |
| --- | --- | --- |
| `vitest run` (completo, incluye independientes) | 0 | 164/164 |
| `pnpm test:integration` | 0 | 151/151 |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | 0 | limpio |
| `pnpm build` con `NEXT_PUBLIC_SUPABASE_*` vacías | 0 | rutas `/`, `/login` (dinámica), `/dashboard` (dinámica), Proxy |
| `pnpm start` sin variables + curl | — | ver T7-17/T7-01/T7-02 abajo |
| `grep service_role/sb_secret_/SERVICE_ROLE` en `.next/static` y `src/` | — | 0 coincidencias (también sin `getSession`, `auth.admin`, `signUp`) |
| `playwright test -c playwright.supabase.config.ts --list` | 0 | 42 pruebas, 3 archivos |

Comprobación con la app arrancada sin variables: `/` 200; `/nope` 404; `/login` 200 (`lang="es"`, un `h1`, `Cache-Control: private, no-cache, no-store`); `/dashboard`, `/dashboard?x=1`, `/%64ashboard` y petición RSC → 307 a `/login?next=…` con `private, no-store` (`/dashboard/` y `/dashboard//` → 308 de normalización de Next a la misma ruta, que vuelve a pasar por el proxy); 4 variantes de `x-middleware-subrequest` (`middleware`, `src/middleware`, `proxy`, `src/proxy`) no evitan la redirección. `/login?next=//evil.com` → 200 (el valor se descarta en servidor).

## Criterio → estado
S = verificado localmente (estático/ejecutado); P-CI = pendiente del job `supabase`.

| ID | Estado | Nota |
| --- | --- | --- |
| T7-01 | S parcial + P-CI | Redirección y variantes comprobadas sin Auth (fallo cerrado); falta E2E con Auth |
| T7-02 | S parcial + P-CI | Subrequest sin efecto en proxy; `requireMembership`/`requireUser` verifican `getUser()` en servidor, independiente del proxy |
| T7-03 | P-CI | Cookie manipulada: `getUser()` rechaza; sin ejecución real |
| T7-04 | P-CI | Org/rol salen de `memberships` bajo RLS (`unique(user_id)`, sin parámetros del cliente); revisión estática OK |
| T7-05 | P-CI | `access-denied` sin nombres de org; logout presente (estático OK) |
| T7-06 | S | `safe-next-path` independiente 87 casos PASS; `redirect.ts` revisado (decodifica 3 niveles, rechaza `//`, `\`, control, `..`) |
| T7-07 | P-CI | `next` se re-sanea en el servidor (`loginAction`, `LoginPage`); `/login` con sesión redirige a `/dashboard` |
| T7-08 | P-CI | Logout = Server Action POST; sin ruta GET (guardas estáticas PASS) |
| T7-09 | P-CI | `getUser()` + `signOut({scope:'local'})` revoca la sesión en Auth; efecto real solo verificable con Auth |
| T7-10 | P-CI | Mensaje único `GENERIC_ERROR`, sin `error.message`, Zod en servidor, eco solo del correo |
| T7-11 | S parcial + P-CI | `force-dynamic`; cabeceras `private, no-store` confirmadas en `/login` y redirecciones; falta `/dashboard` autenticado |
| T7-12 | S parcial + P-CI | Ver POST-07 abajo |
| T7-13 | S | Sin secretos en `src/` ni en bundle (build sin variables) ni `.env.example`; repetir sobre bundle con variables en CI (E2E) |
| T7-14 | S | 5 guardas independientes PASS |
| T7-15 | S parcial + P-CI | No existen rutas de registro ni enlaces en `/login`; 404 efectivo en E2E |
| T7-16 | S parcial + P-CI | `lang=es`, un `h1`, etiquetas, `type`/`autocomplete` (estático/HTML); tabulación/Enter en E2E |
| T7-17 | S | Build, `/` 200, 404 y rutas públicas con proxy activo sin variables; protegidas fallan cerradas; format/lint/typecheck/unit/integration en verde (E2E públicas 9/9 informadas por Develop, no repetidas) |

## POST-07 (`server.ts`)
Justificación aceptada: `cookies()` de Next no admite cabeceras, así que `setAll` en servidor ignora `headers`; el refresco real lo hace `src/proxy.ts`, que actualiza `request.cookies`, recrea la respuesta, aplica `set` de cookies con `options` y copia todas las `headers` de `setAll` (cache-control anti-cache de la librería). `redirectToLogin` conserva cookies y cabeceras (salvo `set-cookie`/`x-middleware*`) y fija `private, no-store`. Verificación efectiva en T7-12 (CI).

## Hallazgos
| ID | Gravedad | Archivo | Descripción / acción |
| --- | --- | --- | --- |
| F7-01 | Low | `supabase/config.toml` | `[auth.rate_limit] sign_in_sign_ups = 300`: la clave es válida en la referencia de config de la CLI (`email_sent`, `sms_sent`, `anonymous_users`, `token_refresh`, `sign_in_sign_ups`, `token_verifications`) y la CLI actual 2.122.1 la soporta según mi conocimiento, pero no he podido comprobarlo estáticamente (CLI no instalada, sin descargas). Se confirma en `supabase start` de CI; si la CLI la rechazase, el job falla de forma visible. Sin acción salvo observar CI. |
| F7-02 | Informational | `supabase/config.toml` | Aviso git `CRLF will be replaced by LF`: fin de línea mixto en el archivo de trabajo; no funcional. |
| F7-03 | Informational | `src/features/auth/actions.ts` | Sin limitación de intentos a nivel de aplicación (depende del rate limit de Auth, ampliado a 300 solo en local). Aceptable en el alcance; considerar en tareas posteriores. |

No hay hallazgos accionables para Develop.

## Pendiente de CI (job `supabase`, tras push autorizado por el humano)
- Las 42 E2E de `tests/e2e-supabase/independent/*` (primera ejecución real; posibles ajustes de selectores/timings los hace Testing, no Develop).
- `supabase start` con `[auth.rate_limit]` (F7-01) y presupuesto de logins (~15 por worker + `test:supabase`).
- Job `quality` (format, lint, typecheck, unit, integration, build, E2E públicas) sin variables, del mismo SHA.
- Aceptación efectiva de T7-03, 04, 05, 07, 08, 09, 10, 11 (autenticado), 12 y bundle de cliente con variables reales.

Tras CI en verde: RETEST/cierre → PASS. Si alguna E2E falla por producto, FAIL con hallazgos para Develop.

## Archivos modificados por Testing
`?? docs/reviews/claude/TASK-007-POST.md` (nuevo). No se añadieron casos independientes nuevos.
