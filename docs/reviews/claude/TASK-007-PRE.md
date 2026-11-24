# TASK-007 — PRE (Testing)

TASK-ID / GATE: TASK-007 (login, logout, proxy de sesión, `/dashboard` protegido) — tarea CRÍTICA (Auth, sesiones, autorización)
Fase: PRE
Fecha: 2026-11-24

## Agente, modelo y esfuerzo
Agente: Testing (subagente nativo, solo PRE; no implementa ni repara producción).
Modelo solicitado / efectivo: Sonnet 5.5 / no verificable (autoinformado por el entorno; sin comprobación por CLI).
Esfuerzo solicitado / efectivo: high / no verificable.
Grado de evidencia: autoinformado para modelo/esfuerzo; los resultados de comandos de este informe son salidas reales de esta sesión.

## Git
Rama: `feat/supabase-auth`. SHA base: `764397c`. Sin commit ni push.
Estado antes: `M docs/STATUS.md`, `M docs/reviews/claude/TASK-006.md`, `?? docs/SUPABASE_CLOUD.md` (ajenos a esta tarea; no tocados).
Estado después: lo anterior más `?? tests/e2e-supabase/` y `?? tests/unit/independent/{safe-next-path,auth-static-guards}.test.ts`, y este informe.

## Archivos creados (todos dentro de la lista permitida)
| Estado | Ruta | Justificación |
| --- | --- | --- |
| ?? | `tests/unit/independent/safe-next-path.test.ts` | T7-06: validación adversarial de `next` (87 casos) |
| ?? | `tests/unit/independent/auth-static-guards.test.ts` | T7-13/T7-14: guardas estáticas sobre `src/` |
| ?? | `tests/e2e-supabase/independent/support/world.ts` | Soporte autocontenido (usuarios, orgs, cookies, aserciones) |
| ?? | `tests/e2e-supabase/independent/anonymous-access.spec.ts` | T7-01, T7-02, T7-15, T7-16, T7-17 |
| ?? | `tests/e2e-supabase/independent/authenticated-access.spec.ts` | T7-03, T7-04, T7-05, T7-11, T7-12, T7-13 (bundle) |
| ?? | `tests/e2e-supabase/independent/login-logout.spec.ts` | T7-07, T7-08, T7-09, T7-10 |
| ?? | `docs/reviews/claude/TASK-007-PRE.md` | este informe |

No se tocó `src/`, `.github/`, `package.json`, `tests/support/` ni documentación fuera de `docs/reviews/claude/`.

## Criterios (17)
Origen: objetivo de TASK-007 (handoff), ARCHITECTURE.md «Backend de aplicación», ADR-001, POST-07 de TASK-006, TESTING_GUIDELINES.md. «CI-sb» = job `supabase` (Auth real, solo CI); «local» = ejecutable sin Docker.

| ID | Criterio | Verificación | Dónde | Esperado |
| --- | --- | --- | --- | --- |
| T7-01 | Sin sesión, `/dashboard` (y `?x=1`) responde 3xx a `/login` del mismo origen, sin datos de organización; variantes `/dashboard/`, `/%64ashboard`, `/dashboard//` y petición RSC no entregan datos ni 5xx | `anonymous-access.spec.ts` | CI-sb | PASS |
| T7-02 | La autorización de servidor no depende del proxy: con `x-middleware-subrequest` (6 variantes) y cabeceras de identidad inyectadas, `/dashboard` no entrega datos ni da 5xx | `anonymous-access.spec.ts` | CI-sb | PASS |
| T7-03 | Cookie de sesión manipulada (firma alterada, `sub` ajeno sin re-firmar, tokens vacíos, basura, truncada) no autoriza: 3xx a `/login`, sin 5xx ni datos, sin bucle | `authenticated-access.spec.ts` | CI-sb | PASS |
| T7-04 | Aislamiento entre dos organizaciones en `/dashboard`: owner A, member A y owner B ven solo su organización y su rol (HTML y RSC); parámetros, cabeceras y cookies `organization_id`/`role` inyectados se ignoran | `authenticated-access.spec.ts` | CI-sb | PASS |
| T7-05 | Usuario autenticado sin membresía: estado de acceso denegado, sin nombres/ids de organización, sin 5xx ni errores de página, con botón de logout operativo | `authenticated-access.spec.ts`, `login-logout.spec.ts` | CI-sb | PASS |
| T7-06 | `safeNextPath` solo devuelve rutas internas (rechaza `//`, `\`, esquemas, control chars, tab/CR/LF, codificados que decodifican a externo, no-cadenas); idempotente | `tests/unit/independent/safe-next-path.test.ts` | local + CI quality | PASS |
| T7-07 | Tras login con `next` hostil (3 variantes) se acaba en `/dashboard` del mismo origen sin navegar a externos; `next=/dashboard` desde el proxy vuelve a `/dashboard`; con sesión, `/login` (con o sin `next` hostil) lleva a `/dashboard` | `login-logout.spec.ts` | CI-sb | PASS |
| T7-08 | Logout (botón, POST): elimina las cookies de sesión, `/dashboard` pasa a 3xx a `/login`, «atrás» no muestra datos; ninguna ruta GET (`/logout`, `/auth/logout`, …) cierra la sesión | `login-logout.spec.ts` | CI-sb | PASS |
| T7-09 | La cookie copiada antes del logout y reproducida en otro navegador ya no autoriza (la sesión se invalida en Auth). **Requiere `getUser()` o comprobación de sesión equivalente en `requireUser`; `getClaims()` solo validaría el JWT hasta su expiración** (ver DH-T7-1) | `login-logout.spec.ts` | CI-sb | PASS |
| T7-10 | Errores de login genéricos: mismo mensaje para contraseña errónea y correo inexistente, sin pistas de existencia, sin eco de la contraseña, sin credenciales en la URL, sin cookies; entrada inválida/extrema (correo mal formado, vacíos, 400 y 20 000 caracteres, SQL) da error controlado sin 5xx ni trazas (validación de servidor ejercitada con `noValidate`) | `login-logout.spec.ts` | CI-sb | PASS |
| T7-11 | `/dashboard` autenticado (HTML y RSC) con `Cache-Control` `no-store`/`private`, sin `public`/`s-maxage`; redirecciones del proxy no permanentes ni públicas; cookies de sesión con `path=/` y `SameSite` distinto de `None` | `authenticated-access.spec.ts` | CI-sb | PASS |
| T7-12 | POST-07: cuando el proxy refresca una sesión caducada, la respuesta lleva `Set-Cookie` de sesión con `Cache-Control` no compartido y el usuario sigue autorizado | `authenticated-access.spec.ts` | CI-sb | PASS |
| T7-13 | Sin `service_role`/secretos: ni en `src/` (código, JWT incrustados, `.env.example`) ni en HTML/chunks JS servidos (clave de servicio, `sb_secret_`, JWT con rol `service_role`) | `auth-static-guards.test.ts` + `authenticated-access.spec.ts` | local + CI-sb | PASS |
| T7-14 | Arquitectura: `src/proxy.ts` con `proxy` y `config.matcher`, sin `middleware.ts`; sin `getSession()`, `signUp`, `auth.admin` en `src/`; identidad verificada con `getClaims()/getUser()` en el proxy y aparte en servidor; `/dashboard` de servidor y con `require*()`; sin `force-static`/`use cache`; Client Components no importan módulos de servidor ni llaman a `signInWithPassword`; login en Server Action con Zod que no devuelve `error.message` | `auth-static-guards.test.ts` | local + CI quality | PASS |
| T7-15 | Sin registro público: `/signup`, `/sign-up`, `/register`, `/registro`, `/registrarse`, `/auth/signup` dan 404 (o 3xx a `/login`); `/login` sin enlace de registro | `anonymous-access.spec.ts` | CI-sb | PASS |
| T7-16 | Accesibilidad de `/login`: `lang=es`, un `h1`, etiquetas asociadas, `type`/`autocomplete` correctos, un único botón de envío, tabulación correo→contraseña, envío con Enter | `anonymous-access.spec.ts`, `login-logout.spec.ts` | CI-sb | PASS |
| T7-17 | Regresión: job `quality` y E2E públicas (`tests/e2e`) en verde **sin variables de Supabase**; `pnpm build` sin variables; `/` 200 y ruta inexistente 404 también con el proxy activo; sin env, el proxy no rompe rutas públicas (rutas protegidas fallan cerrado) | `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:integration && pnpm build && pnpm test:e2e` sin `NEXT_PUBLIC_SUPABASE_*`; `anonymous-access.spec.ts` | local + CI quality + CI-sb | PASS |

## Contrato exigido a Develop

**Módulo puro**: `src/features/auth/redirect.ts` exporta `safeNextPath(value: unknown, fallback = '/dashboard'): string` (sin imports de servidor; ejecutable en jsdom). Si Develop quiere otra ruta/firma, lo pide vía Orchestrator y Testing decide.

**Rutas y estructura (T7-14)**: `src/proxy.ts` (exports `proxy` y `config` con `matcher`); `src/app/dashboard/page.tsx` como Server Component que, él o su `layout.tsx`, llama a una helper `require*()` (o `getClaims/getUser`) del lado servidor; al menos una `Server Action` con `'use server'`; esquema Zod bajo una ruta que contenga `auth` o `login` (p. ej. `src/features/auth/`). La verificación de identidad aparece tanto en el proxy como en código no-proxy. Ningún `getSession()` en `src/`. `src/app/login/` es la página de login.

**Marcadores de UI (E2E)**:
- `/login`: `<html lang="es">`, un único `h1`; `input[name="email"]` (`type` email o text, `autocomplete` `username` o `email`) e `input[name="password"]` (`type="password"`, `autocomplete="current-password"`), con `<label>` asociado (nombre accesible que casa con `/correo|email/i` y `/contrase/i`); un único botón de envío con nombre `/iniciar sesi[oó]n|entrar|acceder|sign in|log ?in/i`. Sin enlaces de registro.
- Error de login: elemento con `data-testid="form-error"` y `role="alert"`, texto idéntico para credenciales inválidas, con independencia de si el correo existe.
- `/dashboard` con membresía: `data-testid="org-name"` (texto exacto = nombre de la organización) y `data-testid="user-role"` (texto que casa con `/owner|propietari/i` o `/member|miembro/i`, sin que un owner case con el de member y viceversa). Estado 200.
- `/dashboard` sin membresía: estado 200 con `data-testid="access-denied"`, sin `org-name`/`user-role` y sin ningún nombre o id de organización en HTML/RSC.
- Botón de logout (`<button>` dentro de un formulario con Server Action, nombre `/cerrar sesi[oó]n|salir|sign out|log ?out/i`) en el dashboard y en el estado denegado; redirige a `/login`. No debe existir ninguna ruta GET que cierre sesión.
- Post-login: siempre `/dashboard` (también sin membresía) salvo `next` interno válido. Sin sesión, el proxy redirige `/dashboard` → `/login` (3xx; `next` ausente o `/dashboard`).

**Cabeceras (T7-11/T7-12)**: respuesta 200 de `/dashboard` (HTML y RSC) con `Cache-Control` que contenga `no-store` o `private`. El proxy debe aplicar a su respuesta tanto las cookies como los `headers` de `setAll(cookiesToSet, headers)` (POST-07) en un refresco de sesión.

**Verificación de sesión en servidor (T7-09)**: la helper de servidor debe comprobar la sesión contra Auth (`getUser()`), no solo la firma del JWT. Ver DH-T7-1.

**Entorno y configuración E2E** (a cargo de Develop):
- `playwright.supabase.config.ts` con `testDir: 'tests/e2e-supabase'` (las pruebas viven en `independent/`; `independent/support/world.ts` no casa con el patrón de pruebas), `baseURL`, `webServer` que construya y arranque la app con `NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_ANON_KEY` **en build y en start** (las `NEXT_PUBLIC_*` se incrustan al compilar). Sin `grep`/`testIgnore`/`retries` que oculten fallos. Recomendado `workers: 1` (ver riesgo de límite de logins). Script `test:e2e:supabase` y paso en el job `supabase` tras `pnpm test:supabase`.
- Mis pruebas **no dependen de `tests/support/` ni de un globalSetup**: crean sus usuarios y organizaciones por worker con la clave de servicio del stack local. Variables que deben llegar al proceso de Playwright: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (el job `supabase` ya las exporta a `GITHUB_ENV`). Si faltan, fallan (no se saltan). Se rechaza cualquier `SUPABASE_URL` que no sea `127.0.0.1`/`localhost`. Develop puede tener su propio globalSetup/fixtures para sus pruebas, sin colisionar (emails con sufijo aleatorio).
- Recomendado no propagar `SUPABASE_SERVICE_ROLE_KEY` al entorno del servidor Next (`env: { SUPABASE_SERVICE_ROLE_KEY: '' }` en `webServer`).

## Comandos y resultados (local, sin Docker/Auth)
Comando | exit | resultado
--- | --- | ---
`pnpm exec prettier --check tests/unit/independent tests/e2e-supabase` | 0 | formato correcto
`pnpm exec eslint tests/unit/independent tests/e2e-supabase --max-warnings=0` | 0 | sin avisos
`pnpm exec tsc --noEmit` | 2 | único error: `TS2307 Cannot find module '@/features/auth/redirect'` (esperado: aún no existe)
`pnpm exec vitest run` (completo) | 1 | 52 pasan, 5 fallan + 1 suite sin cargar: las guardas de T7-14 fallan por ausencia real de `src/proxy.ts`, dashboard y login; `safe-next-path` no resuelve el módulo
`pnpm exec playwright test --list` (config actual) | 0 | 9 pruebas: `tests/e2e-supabase` queda fuera de `tests/e2e` y del job `quality`
`playwright test --list` con config temporal en el scratchpad (no en el repo) | 0 | 42 pruebas E2E detectadas y compilan
Validación de las pruebas con implementación de referencia (scratchpad, fuera del repo) | 0 | `safeNextPath` de referencia: 87/87; implementación ingenua (`startsWith('/')`): 18 fallos (las pruebas discriminan). Guardas estáticas contra árbol sintético plausible (`TESTING_ROOT`): 13/13
Reproducción del estado previo (comprobación estática) | — | no existen `src/proxy.ts`, `src/app/login`, `src/app/dashboard`, `src/features/auth`: las 5 guardas T7-14 y T7-06 fallan por causa real, no forzada

## Validación estática / efectiva parcial / pendiente
Estática: lectura de código existente, typecheck, lint, formato, listado de pruebas.
Efectiva parcial: unit de T7-06 y T7-13/T7-14 contra implementación de referencia y árbol sintético (no contra el producto, que no existe).
Pendiente (CI `supabase`, tras Develop): las 42 pruebas E2E con Auth real (T7-01..T7-05, T7-07..T7-12, T7-13 bundle, T7-15..T7-17). **No se han ejecutado nunca**: pueden requerir ajuste de selectores/timings en su primera ejecución real; cualquier ajuste lo hace Testing, no Develop.

## Riesgos y decisiones humanas
- **DH-T7-1 (decisión humana, T7-09)**: «el logout invalida la cookie» exige comprobar la sesión en Auth (`getUser()` en `requireUser`, un viaje a Auth por página). Con solo `getClaims()` un JWT copiado antes del logout seguiría válido hasta su expiración (`jwt_expiry = 3600` s). Si el humano acepta ese riesgo residual, debe registrarlo explícitamente; Testing no relaja T7-09 por su cuenta (sería debilitar un criterio).
- **Riesgo de límite de logins**: el stack local limita `sign_in_sign_ups` a 30 por 5 min por IP. Estas pruebas hacen ≈15 inicios de sesión por worker (4 en caché + 11 puntuales) y `test:supabase` otros 4; quedan ≈11 de margen para las pruebas de Develop. Mitigación: `workers: 1` y, si hace falta, subir el límite en `supabase/config.toml` (cambio de Develop con autorización de Orchestrator).
- **No hacer push de estas pruebas solas**: `pnpm typecheck` (TS2307) y `pnpm test:unit` quedarán en rojo en `quality` hasta que Develop entregue `redirect.ts`, el proxy, el login y el dashboard. Deben llegar juntos en el mismo push/CI.
- Heurísticas estáticas de T7-14 (regex): posibles falsos positivos si Develop usa nombres atípicos; en ese caso lo comunica a Orchestrator para que Testing ajuste la heurística, nunca Develop.
- Prueba de «atrás» tras logout (T7-08) depende de que las páginas autenticadas lleven `no-store` (sin bfcache); es intencional.
- Sin modificar: Cloud no se usa; no hay datos reales; contraseñas generadas en ejecución, nunca en el repo.

## Hallazgos
Ninguno sobre producción (aún no hay implementación). Observación preexistente: POST-07 sigue abierto y queda cubierto por T7-12.

## Limitaciones (checks no ejecutados)
E2E con Auth real, `supabase start`, `pnpm build`/`pnpm test:e2e` de `quality` (sin implementación no aportan información nueva), regresión completa.

## Veredicto
PRE: criterios y pruebas independientes entregados; no emite PASS/FAIL de aceptación (se emitirá en POST). Estado de ejecución efectiva: BLOCKED para las E2E con Auth real hasta el job `supabase` de CI con la implementación de Develop.

Aceptación humana (pendiente): DH-T7-1.
