# TASK-010B-RETEST — Testing RETEST dirigido B-01..B-04

- Fase: RETEST (POST de Develop). Crítica. Esfuerzo solicitado high; efectivo no observable.
- Rama `feat/supabase-auth`, base/HEAD `33e6b1c76b8bbdafd7da6b8130099188ded3d2dd`, árbol sin commit. Sin red, sin Cloud, sin commit.
- Git antes: `M` docs/ARCHITECTURE.md, docs/SUPABASE_CLOUD.md, src/app/login/page.tsx, src/features/auth/{actions,local-session}.ts, src/lib/supabase/server.ts, tests/e2e-supabase/independent/task010-ui.spec.ts, tests/unit/independent/login-logout-{failed-retest,notice}.test.tsx, tests/unit/login-logout-failed.test.tsx; `??` informes, migración `20261125100000_task010b_activity_seq_required.sql` y 4 archivos de test independientes.
- Git después: igual, más `??` `tests/unit/independent/logout-observer-scope.test.ts` y `tests/unit/independent/login-unreadable-nobypass.test.tsx` (nuevos, de Testing) y este informe. Nada en `src/`, migraciones previas, `package.json`/lockfile, `.github/`, `.claude/`. Sin `.skip/.only/.todo/xit` en las pruebas independientes ni en `task010-ui.spec.ts`. Migraciones previas sin cambios (solo `??` la nueva).
- Entorno: Windows, Node 24.22.2, vitest 5.1.1, `@supabase/auth-js` 2.119.2, PGlite.

## Matriz

| ID | Resultado | Evidencia |
| --- | --- | --- |
| B-01 | PASS (local) | `logout-action-transport` (204; 401/403/404 pasarela; `bad_jwt`, `no_authorization`, `user_banned`; `session_not_found`/`user_not_found` en ambos formatos; HTML 401/403/404; 500; 502; excepción; sin cookies; borrado local fallido): un único POST, URL fija, sin tokens en URL ni consola, cookies ajenas intactas. Los 7 rojos de la fase previa pasan a verde sin editar las pruebas. Nuevo `logout-observer-scope` (8): observador por solicitud (dos clientes concurrentes con respuestas cruzadas anotan cada uno la suya; un observador usado no contamina a otro; sin estado de módulo), solo anota `POST /auth/v1/logout` (otra llamada, `getUser`, no lo toca), `createClient()` sin `revocation` no instala fetch propio (una sola llamada, comportamiento nativo), el cuerpo sigue legible para el SDK (se clona), cuerpos no JSON/`null`/`error_code` no cadena no rompen, `code` solo en no-ok, claves del observador = `requested/status/code/threw` (sin tokens/cabeceras), consola sin llamadas. Estático: `server.ts` no menciona `headers`/`Authorization`/`console`/`token`; solo `init.method` y URL; `src/` no pasa `revocation` salvo `logoutAction`; los otros 7 llamantes de `createClient()` no cambian. R1 intacto (el cierre sigue siendo `signOut({scope:'local'})` único). |
| B-02 | PASS (local) | Presentes → alerta de fallo + reintento; ausentes → aviso habitual sin reintento; ilegibles (cookies() rechaza/lanza síncrono/`getAll` lanza, acción y render) → `logout-unknown-notice` (`role=alert`, "No se pudo…"), sin "se cerró en este navegador", reintento habilitado en `form`, sin redirigir ni consultar `hasValidSession`. Los 5 rojos previos pasan a verde. Nuevo `login-unreadable-nobypass` (11): ilegible + `next` hostil (`//evil`, `https://evil`, `/\evil`, HTML) no redirige, no refleja, sin campo `next` ni formulario de acceso; aviso inexacto (otro valor, mayúsculas, sufijo, vacío, array) no activa el estado; sin aviso y sin sesión: formulario normal. Aviso exacto sin bypass. |
| B-03 | PASS (local) | `activity-seq-notnull` 13/13 (PGlite): migración sin error sobre base con 3 históricos; históricos idénticos (todas las columnas, `seq` NULL); NULL explícito simple, multifila e `INSERT…SELECT` rechazados enteros (23502/23514); omitido recibe valor creciente; explícito válido aceptado, duplicado 23505; trigger de archivado asigna `seq`; UPDATE/DELETE/TRUNCATE → 23000; forma bigint+nextval+único; `authenticated` sin INSERT (42501). Estático: la migración es solo `ADD CONSTRAINT … CHECK (seq is not null) NOT VALID` + `COMMENT`; no valida, no reescribe, no toca triggers ni migraciones previas. |
| B-04 | PASS estático; ejecución pendiente de CI | `task010-ui.spec.ts`: eliminado `page.content()`; el aviso desconocido se verifica por heading, avisos por testid y por `role alert/status` con texto, `innerText`, `<b>` renderizado y recorrido de nodos de texto/atributos (sin script/style) y `title`: objetivo de no reflejo intacto. Redirección: origen, `/login`, `next` interno (no `//`, mismo origen), ruta `/customers`, `q` decodificado, sin parámetros extra, campo oculto, login completo y tras él origen/ruta/`q`/buscador con valor; el caso hostil no se toca. Riesgo residual: DOM real no observado (comprobar en CI que `/login` sin aviso no tenga otro `role=status` con texto). |

## Checks (locales, exit codes reales)

| Check | Exit | Resultado |
| --- | --- | --- |
| `pnpm format:check` | 0 | ok (repetido tras añadir mis 2 archivos: 0) |
| `pnpm lint` | 0 | ok (repetido: 0) |
| `pnpm typecheck` | 0 | ok (repetido: 0) |
| `pnpm test:unit` | 0 | 29 archivos / 672 (Develop+previas); con mis 2 nuevos: 31 archivos / 691, 0 fallos |
| `pnpm test:integration` | 0 | 14 archivos / 557, 0 fallos (incluye `activity-seq-notnull` 13) |
| `pnpm build` | 0 | ok |

Pendiente de CI (no ejecutable aquí): `pnpm test:supabase` y E2E con Auth real (`task010-ui`, `crm`, `logout-revocation`), en particular que el GoTrue real responda 204 en una revocación efectiva y 403 `session_not_found` en la sesión inexistente (supuesto de clasificación no verificado contra GoTrue real).

## Hallazgos
Ninguno confirmado. Informational: (I-1) la clasificación `session-absent` depende de que GoTrue devuelva `error_code`/`code` en el 403; si no lo hiciera, el caso se avisa como indeterminado (fallo seguro, nunca falso cierre). (I-2) `observingFetch` espera `response.clone().json()` en respuestas no ok antes de devolverlas; un cuerpo que no termine retrasaría el logout (sin impacto en seguridad).

## Veredicto
**PASS** sobre lo ejecutable en local; sin defectos confirmados. BLOCKED global por CI (supabase/E2E con Auth real sobre el nuevo SHA) se mantiene aparte.

- Correccion CI 45586882982 (archived-readonly.test.ts, A02-06): defecto de la prueba, no de la implementacion; `set archived_at = now()` podia coincidir con el archived_at almacenado (sin cambio real, el trigger no actua). Ahora usa `archived_at + interval '1 day'`; 23 passed, exit 0, prettier OK.
