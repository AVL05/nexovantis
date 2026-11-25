# TASK-007 — Login, logout, sesión, proxy y rutas protegidas

- Clasificación: **crítica** (autenticación, sesiones, autorización). Flujo: Testing PRE → Develop → Testing POST. Esfuerzo `high` solicitado en cada invocación; modelo y esfuerzo efectivos no verificables.
- Rama `feat/supabase-auth`, HEAD `764397c`, sin commit ni push (pendiente de autorización humana).

## Alcance entregado
- `src/proxy.ts`: refresca la sesión con `getClaims()` y aplica las cookies y las `headers` de `setAll` (POST-07). Si no hay sesión, redirige `/dashboard` a `/login` (307, `private, no-store`). Sin variables de Supabase, las rutas protegidas fallan cerradas.
- `src/features/auth/`:
  - `safeNextPath` (anti open redirect).
  - Esquema Zod de login.
  - Server Actions de login (error genérico) y de logout (POST, `signOut`).
  - `requireUser()` con `getUser()` y `requireMembership()` (organización y rol desde `memberships` bajo RLS).
- `/login` y `/dashboard`: dinámicas y sin caché compartida. `/dashboard` muestra la organización y el rol, o un estado de acceso denegado si no hay membresía. No hay registro público.
- CI: el job `supabase` ejecuta `pnpm test:e2e:supabase` (`playwright.supabase.config.ts`) con Auth real. `supabase/config.toml` sube `auth.rate_limit.sign_in_sign_ups` a 300, solo en el stack local.

## Decisiones de Orchestrator
- DH-T7-1: `requireUser()` usa `getUser()`, así la sesión cerrada deja de autorizar (T7-09) sin aceptar riesgo residual.
- Subida del límite de logins del stack local de CI para las E2E (solo `[auth.rate_limit]`).

## Delegaciones (comprobación Git por manifiesto `git hash-object`; índice vacío; HEAD sin cambios)
| Paso | Agente | Resultado | Rutas |
|---|---|---|---|
| PRE | testing | 17 criterios T7-01..T7-17 ([TASK-007-PRE](TASK-007-PRE.md)). Pruebas independientes: 2 unitarias y 3 E2E con Auth real (42 casos) | Solo las permitidas |
| Implementación | develop | Lo descrito arriba. Local: format, lint y typecheck exit 0; unit 164/164; build exit 0; e2e 9/9; `--list` de Auth real 42 | Todas dentro de la lista cerrada; independientes intactas |
| POST | testing | **BLOCKED** ([TASK-007-POST](TASK-007-POST.md)). Sin Critical, High ni Medium. Unit 164/164, integration 151/151. App sin variables: rutas públicas 200/404, protegidas 307 a `/login` (también con variantes de ruta y `x-middleware-subrequest`). Sin secretos en `.next/static`. F7-01 Low (clave de rate limit sin validar con la CLI), F7-02 y F7-03 Informational | Solo el informe |

Motivo del BLOCKED: las 42 E2E con Auth real (T7-01..T7-05, T7-07..T7-13, T7-15 y T7-16) solo se ejecutan en el job `supabase` de CI, que requiere un push autorizado. Si CI pasa, un RETEST dirigido emite PASS. Si falla por producto, se devuelve FAIL a Develop.

## Supabase Cloud
Organizaciones demo `Demo Norte` y `Demo Sur` creadas. Las membresías quedan pendientes de que el humano cree los usuarios demo ([SUPABASE_CLOUD.md](../../SUPABASE_CLOUD.md)).

## Decisiones humanas tras el POST (2026-11-24)
- Commit de TASK-007 autorizado. El push lo ejecuta el humano, porque los permisos lo deniegan.
- F7-01 (Low, clave `auth.rate_limit` en `config.toml`) aceptado provisionalmente, pendiente de verificarlo en CI.
- DH-T7-1: se mantiene la comprobación de identidad contra Supabase Auth (`getUser()`).
  - **Cierre de sesión en Nexovantis**: tras el logout, las páginas y acciones de la app dejan de autorizar la cookie anterior. Lo verifica T7-09 con Auth real en CI. No se declara cumplido hasta ver ese resultado.
  - **Validez residual ante PostgREST**: un access token (JWT) copiado antes del logout puede seguir aceptándose en llamadas directas a la API de datos hasta su expiración (`jwt_expiry` = 3600 s). No se ha demostrado lo contrario y no se afirma una revocación inmediata. No se añaden mecanismos de revocación sin una necesidad demostrada.
- TASK-007 sigue en **BLOCKED** hasta verificar las E2E con Auth real en CI.
- Usuarios demo: el humano informó de que los había creado, pero `auth.users` del proyecto `nexovantis` tiene 0 filas (consulta de lectura). Las membresías quedan pendientes. `sin.org@example.com` se mantendrá sin membresía.

## CI con Auth real y RETEST (2026-11-24)
- Push de `09fb320` realizado por el humano. GitHub Actions 45447327998: **success**.
  - Job `supabase`: 4 migraciones aplicadas con `[auth.rate_limit]` (F7-01 resuelto). `test:supabase` 20/20. Las E2E con Auth real superaron 42/42, con 1 worker y sin skipped, flaky ni retry.
  - Job `quality`: unit 164/164, integration 151/151, e2e 9/9.
- Testing RETEST: **PASS** ([TASK-007-RETEST](TASK-007-RETEST.md)). T7-09 demuestra que, tras el logout, Nexovantis borra las cookies y rechaza una cookie copiada antes del logout. No demuestra nada sobre el uso directo del access token contra PostgREST: R1 (Medium) queda como no demostrado, pendiente de aceptación humana (DH-T7-1).

## Verificación no destructiva en Cloud (registro de Orchestrator)
- Membresías demo insertadas: `owner.norte` (owner) y `member.norte` (member) en Demo Norte, `owner.sur` (owner) en Demo Sur; `sin.org` sin membresía. Los 4 usuarios están confirmados.
- RLS simulando cada usuario (`role authenticated` y claims, en transacción de solo lectura): `member.norte` ve solo Demo Norte y 2 membresías; `owner.sur` ve solo Demo Sur y 1 membresía; `sin.org` ve 0 organizaciones y 0 membresías.
- API con la clave publicable y sin sesión: las 4 tablas devuelven 401/42501; `rpc/is_org_member` da 404 (esquema `private` no expuesto). Un login con credenciales inválidas devuelve el error genérico `invalid_credentials`.
- **Hallazgo ORC7-01 (Medium)**: `GET /auth/v1/settings` devuelve `disable_signup=false`, así que el registro público sigue activo en Cloud aunque el humano informó de que lo había desactivado. No se probó un alta para no crear datos. La app no ofrece registro, pero la API de Auth lo admitiría. Acción manual: desactivarlo en el panel y volver a comprobar la configuración.
- No se probó un login real con los usuarios demo, porque las contraseñas son del humano y no se comparten.
- Decisión humana (2026-11-24): **R1 aceptado**. Un access token copiado antes del logout puede seguir aceptándose ante PostgREST hasta su expiración (`jwt_expiry` = 3600 s). Riesgo residual registrado; no se añaden mecanismos de revocación.

## Cierre (2026-11-24)
- ORC7-01 resuelto: `GET /auth/v1/settings` en Cloud devuelve `disable_signup=true`.
- Expiración del access token en Cloud: `app.settings.jwt_exp` = 3600 s (consulta de lectura, sin modificar); coincide con `jwt_expiry` = 3600 del stack local de CI. Es el límite de R1.
- El humano acepta el resto de resultados del RETEST. **TASK-007 cerrada en PASS**. Limitaciones reales:
  - Las E2E con Auth real se ejecutaron contra el stack local de CI, no contra Cloud.
  - En Cloud solo se hicieron comprobaciones no destructivas (RLS simulando cada usuario, API sin sesión, configuración de Auth), sin login real con los usuarios demo.
  - R1 aceptado como riesgo residual, para revisión en AUDIT-002 (Codex).
