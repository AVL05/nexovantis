# TASK-010 RETEST (dirigido a P-02)

- Fase: RETEST. Rama `feat/supabase-auth`, HEAD `7cc19be`, árbol sin commit. Esfuerzo solicitado: high (efectivo: no verificable).
- Alcance: solo P-02 (doble fallo de cierre de sesión). El BLOCKED global de TASK-010 por CI se mantiene.
- Archivos revisados (diff): `src/features/auth/actions.ts`, `routes.ts`, `local-session.ts` (nuevo), `src/app/login/page.tsx`, `tests/unit/login-logout-failed.test.tsx` (nuevo, de Develop).
- Archivos míos: A `tests/unit/independent/login-logout-failed-retest.test.tsx` (30 casos); A este informe. Sin otras escrituras. Sin `.skip/.only/.todo/xit` en las pruebas nuevas.

## Revisión estática
- `logoutAction`: solo `signOut` sin error confirma y redirige a `/login`; error o excepción limpian cookies `sb-*-auth-token(.n)` (borrado tolerante a fallos) y redirigen a `/login?aviso=cierre-no-confirmado` (valor fijo). `redirect()` queda fuera de try/catch.
- `/login`: `sessionStillOpen = aviso === 'cierre-no-confirmado' && cookies de sesión presentes`. Solo entonces omite el redirect a `/dashboard`, oculta `LoginForm` (y con él el campo `next`) y muestra `Alert tone=danger` (role="alert", `logout-failed-notice`) más formulario con `logout-retry` -> `logoutAction`. Texto fijo, sin eco del query. `safeNextPath`, proxy y `isProtectedPath` no cambian; el proxy no redirige `/login`, así que no hay otra vía que oculte el aviso.
- `cookies()` ilegible: `hasLocalSessionCookies` devuelve false (no hay evidencia) y se aplica el flujo previo (aviso habitual, o redirect si la sesión es válida).

## Resultados por criterio
| Criterio | Resultado |
| --- | --- |
| Doble fallo (error Auth o `createClient` lanza, borrado local falla) -> aviso explícito "No se pudo cerrar tu sesión / sigue abierta", sin afirmar cierre, sin texto técnico, sin form de acceso | OK |
| Reintento: botón es submit de un form hacia `logoutAction` (envío observado: llama a `signOut`) | OK |
| Reintento con éxito -> `/login` sin aviso ni alerta de fallo, formulario de acceso | OK |
| Reintento que vuelve a fallar -> de nuevo aviso (2 iteraciones), sin falso cierre | OK |
| Sin reflejo del query (`tecnico-secreto-777`, `evil.example`, `<b>evil</b>`) | OK |
| Sin bypass: aviso + `next` hostil/válido (`//evil`, `https://`, `/%2F%2F`, `/\`, `/customers`, `/dashboard`) no redirige ni conserva `next`; sin sesión, `next` hostil -> `/dashboard`; aviso con otra capitalización/espacio/vacío/repetido/ausente + sesión viva -> `/dashboard` | OK |
| Sin regresión A02-01: confirmado -> `/login` exacto; error con cookies borradas -> aviso habitual sin alerta de fallo ni botón | OK |
| Caso límite: cookie caducada presente | Con aviso exacto muestra el aviso de fallo (el criterio es la presencia de cookie, no su validez); el reintento la limpia. Sin aviso: login normal. Ver P-02-N1 |
| Caso límite: `cookies()` ilegible (rechazo o excepción síncrona) | OK: no lanza, aviso habitual |
| Patrón de nombre: `-code-verifier`, `SB-`, `sb--auth-token`, `.` final, prefijo extra -> no coinciden; `sb-a-b-auth-token.12` coincide | OK |

## Comandos y resultados
- `vitest run` de 9 archivos auth/login (mi archivo nuevo, `login-logout-failed`, `logout-action`, `login-logout-notice`, `login-form`, `auth-routes`, `safe-next-path`, `safe-next-path-encoded`, `auth-static-guards`): 9 archivos, 239 tests, exit 0. Mi archivo aislado tras prettier: 30/30, exit 0. (Una primera ejecución dejó una promesa de redirect sin capturar en mi propia prueba; corregida en la prueba, no es defecto de producción.)
- `format:check` exit 0; `lint` (max-warnings=0) exit 0; `typecheck` exit 0.
- No ejecutado (fuera de alcance): regresión completa, integración/Supabase local, E2E, navegador real. Las pruebas son unitarias con dobles de Next/Supabase: el borrado de cookies y la lectura de `cookies()` en un Server Action real no se han observado en navegador.

## Hallazgos
- P-02-N1 (Informational, sin criterio incumplido): quien tenga sesión válida y abra a mano `/login?aviso=cierre-no-confirmado` (marcador, botón atrás tras un doble fallo) ve el aviso "No se pudo cerrar tu sesión" en vez de ser redirigido al panel. Es texto fijo, el botón ofrece cerrar sesión de verdad y no abre bypass; es coherente con "sesión viva + aviso exacto". Un enlace ajeno solo puede mostrar ese texto fijo a un usuario con sesión. Requiere aceptación humana registrada.
- P-02-N2 (Informational): la comprobación E2E del doble fallo real (Auth caído + `cookies().delete` fallando) no es reproducible sin inyección de fallos; queda cubierta solo con dobles unitarios.

## Veredicto P-02: PASS
Todos los criterios aplicables al requisito humano se ejecutaron y superaron a nivel unitario/encadenado; sin hallazgos Critical/High. N1 y N2 son Informational y requieren aceptación humana. El BLOCKED global de TASK-010 por CI sigue vigente.
