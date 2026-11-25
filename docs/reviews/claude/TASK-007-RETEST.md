# TASK-007 RETEST (dirigido, solo lectura de CI)

Veredicto: **PASS** (con la salvedad de DH-T7-1 descrita abajo).

## Evidencia
- CI ejecución 45447327998: conclusión success, headSha 09fb32012f847eb96a1b8300c48e56e65fbbac3e (= commit revisado). No se ejecutaron pruebas locales; evidencia de CI, no ejecutada por Testing.
- Job supabase: `pnpm test:supabase` 20/20; `pnpm test:e2e:supabase` "Running 42 tests using 1 worker" y "42 passed (28.6s)". El log no contiene líneas skipped/flaky/retry/failed. El reporter no lista casos por nombre, así que la identificación de las 42 con `tests/e2e-supabase/independent/**` se apoya en el recuento y en que ese es el directorio del script; no se verificó por nombre.
- Job quality: unit 164/164, integration 151/151, e2e 9/9.
- `git status` limpio y `git diff 09fb320` vacío. Las rutas de src/ y tests/ en 09fb320 son las revisadas en POST. No se comparó contenido contra un árbol POST guardado, porque no hay un SHA POST separado.
- F7-01 resuelto: `supabase start` arrancó con `[auth.rate_limit]` en CI y las 4 migraciones se aplicaron (dato aportado por Orchestrator; no se vio fallo en el log).

## T7-09 y DH-T7-1
Lo que demuestra T7-09 (`login-logout.spec.ts`, 1.er test de "T7-08 y T7-09 logout efectivo"):
- El logout por UI elimina las cookies de sesión del navegador.
- `/dashboard` redirige a `/login` tras el logout.
- "Atrás" no muestra datos de la organización.
- Las cookies capturadas antes del logout, copiadas a un contexto de navegador nuevo, son rechazadas por Nexovantis. `/dashboard` redirige a `/login`, el HTML no contiene el nombre de la org y la navegación real acaba en `/login`.

Esto demuestra el cierre efectivo de la sesión dentro de Nexovantis, porque el servidor verifica con `getUser()`.

**No demostrado:** que el access token (JWT) previo al logout deje de ser válido directamente contra PostgREST o Supabase hasta su expiración. Ninguna prueba E2E llama a PostgREST con ese token tras el logout. Los usos de `access_token` en `authenticated-access.spec.ts` solo manipulan tokens (firma, `sub` ajeno, vacío) y los envían a la aplicación, no a PostgREST. Un JWT firmado y no expirado puede seguir siendo aceptado por PostgREST/RLS hasta su `exp`. Con `signOut({scope:'local'})` la revocación afecta a la sesión y al refresh token, no al JWT ya emitido. Debe constar como riesgo residual aceptado por el humano, o como mejora futura (JWT de vida corta, o una prueba específica).

## Tabla T7-01..T7-17
| ID | Estado final |
|---|---|
| T7-01..05, 07, 08, 10, 11, 12, 15, 16 | PASS (E2E Auth real 42/42 en CI) |
| T7-09 | PASS en el alcance de Nexovantis (replay de cookie). Uso directo del JWT contra PostgREST: no demostrado |
| T7-06 | PASS (87 casos independientes, unit CI) |
| T7-13 | PASS (estático POST y bundle sin secretos; repetición con variables cubierta por E2E CI en la medida del recuento 42/42) |
| T7-14 | PASS (guardas independientes) |
| T7-17 | PASS (quality unit/integration/e2e en verde) |

## Hallazgos residuales (sin Critical/High)
- R1 (Medium, aceptación humana): validez residual del JWT ante PostgREST hasta su expiración tras el logout; no demostrada ni cubierta (ver arriba).
- F7-02 (Informational): CRLF/LF mixto en `supabase/config.toml`.
- F7-03 (Informational): sin limitación de intentos a nivel de aplicación; depende del rate limit de Auth.
- Nota: el recuento 42 y la pertenencia a `independent/**` se infieren del script y del log, no de una lista nominal.
