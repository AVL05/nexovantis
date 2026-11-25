# TASK-010-PRE: criterios y pruebas independientes para A02-01..A02-07

TASK-ID: TASK-010 (crítica, remediación de AUDIT-002). Fase: PRE. Fecha: 2026-11-24.
Agente: Testing. Modelo/esfuerzo solicitados: Sonnet / high; efectivos: no verificables (autoinformado).
Rama `feat/supabase-auth`, SHA base `7cc19be50dc3107e33e6169df66868f960504b12`. Diff final: solo `tests/**/independent/**` (sin commit).
Git antes: `M docs/{ARCHITECTURE,BUSINESS_RULES,STATUS}.md, docs/adr/ADR-001-roles-rls.md`, `?? docs/reviews/claude/TASK-010.md` (Orchestrator). Después: lo anterior más los archivos de tests listados abajo. No se tocó `src/`, `supabase/`, `tests/support/`, configs ni `.github/`.

## Validación

- Estática: lectura de código y de la versión instalada de `@supabase/auth-js` 2.119.2 (comportamiento de `signOut`), comparación del diff con la lista permitida, búsqueda de `.skip/.only/xit/xtest/.todo/fixme` en lo añadido (ninguno), `prettier --check tests` y `eslint tests --max-warnings=0` (OK), `tsc --noEmit` (solo 4 errores TS2307 por el módulo `tests/support/local-supabase`, que crea Develop).
- Efectiva parcial (local, sin Docker ni red): `npx vitest run` (unit) → 28 fallos / 462 aciertos; `npx vitest run -c vitest.integration.config.mts` (PGlite) → 155 fallos / 381 aciertos. Los fallos son los rojos esperados de abajo; los aciertos incluyen lo que ya cumple y sirve de regresión. Exit code 1 en ambos.
- Pendiente de CI (stack local de Supabase, Auth/PostgREST reales y Playwright): `logout-revocation`, `name-constraints`, `archived-readonly` (`*.supabase.test.ts`), `archive-restore.supabase` modificado y `task010-ui.spec.ts`. No ejecutados por mí; no se presentan como superados.

## Criterios por hallazgo

Nivel: U = unit (Vitest, dobles), P = PGlite (PostgreSQL real, shim de Auth), S = Supabase-CI (Auth y PostgREST reales), E = E2E-CI (Playwright). Tipo P/N = positivo/negativo. "Rojo" = falla hoy por el defecto; "verde" = ya se cumple (regresión).

### A02-01 (High) logout

| ID | Caso | P/N | Nivel | Hoy |
| --- | --- | --- | --- | --- |
| L-01 | Revocación confirmada (`error: null`): `redirect('/login')` exacto, `signOut({scope:'local'})` una vez, un solo `redirect` | P | U `logout-action.test.ts` | verde |
| L-02 | Error devuelto (5xx, red, desconocido): `redirect('/login?aviso=cierre-no-confirmado')` (valor fijo, sin texto del error), cookies `^sb-.+-auth-token(\.\d+)?$` eliminadas aunque `signOut` no las borrara, las demás intactas | N | U | rojo |
| L-03 | Error devuelto aunque la librería ya borró las cookies: se mantiene el aviso; nunca `/login` simple tras error | N | U | rojo |
| L-04 | Excepción en `signOut`, en `createClient` o en el almacén de cookies: mismo aviso; fallo al borrar cookies no se propaga | N | U | rojo |
| L-05 | El `redirect` no se captura ni se duplica | N | U | verde |
| L-06 | `/login?aviso=cierre-no-confirmado` muestra `data-testid="logout-notice"` (role status/alert) con «no se pudo confirmar», «este navegador/dispositivo» y sin afirmar cierre remoto ni «todos los dispositivos»; otros valores no muestran ni reflejan nada | P/N | U `login-logout-notice.test.tsx`; E `task010-ui.spec.ts` | rojo (U) |
| L-07 | Un logout confirmado real aterriza en `/login` sin `aviso` | P | E | verde |
| L-08 | Con revocación fallida (500 o red): `signOut` devuelve error, la sesión local de ese cliente desaparece, y la sesión copiada antes SIGUE válida en Auth (`getUser`, `refreshSession`, datos por RLS); reintentar con red sana la revoca. Con revocación confirmada, la copia deja de valer | P/N | S `logout-revocation.supabase.test.ts` | caracterización (no depende de Develop) |

R1 (JWT residual ante PostgREST) no se reevalúa. L-08 documenta la base factual del aviso: si la revocación falla, la copia sigue siendo plenamente válida y la UI no debe decir lo contrario. El fallo se simula con un `fetch` que rechaza solo `/auth/v1/logout`; no hay forma de simularlo en el servidor Next en E2E (limitación declarada).

### A02-02 (High) destino local en suites Supabase

| ID | Caso | P/N | Nivel | Hoy |
| --- | --- | --- | --- | --- |
| G-01 | `assertLocalSupabaseUrl` acepta `http://127.0.0.1:p`, `localhost`, `[::1]` (también mayúsculas y barra final) | P | U `local-supabase-guard.test.ts` | rojo (falta módulo) |
| G-02 | Rechaza remotos (`*.supabase.co`, IP privadas, `host.docker.internal`, `0.0.0.0`), variantes (`localhost.evil.com`, `127.0.0.1.nip.io`, `evil.com/127.0.0.1`, `127.0.0.1@evil.com`, `evil.com\@127.0.0.1`…), credenciales en la URL, protocolos distintos de http, URLs inválidas y entradas no cadena | N | U | rojo |
| G-03 | El error no incluye la clave de la URL ni claves de API; rechazar no llama a `fetch` ni a `createClient` | N | U | rojo |
| G-04 | `requireLocalSupabaseEnv` exige las 3 variables (no se salta), valida la URL y no filtra claves | P/N | U | rojo |
| G-05 | Ejecutar las suites reales (`vitest run -c vitest.supabase.config.mts`) con destinos no autorizados (`.invalid`, sufijo de localhost, usuario@host, credenciales, https, URL inválida) termina con código distinto de 0, con línea `Error: … local …` y SIN rastro de red (ENOTFOUND, ECONNREFUSED, «fetch failed», TLS) ni filtración de claves. Cubre `rls.supabase.test.ts` y las independientes sin Docker | N | U `supabase-suites-remote-guard.test.ts` (proceso hijo) | rojo (7/7) |
| G-06 | Los 5 puntos de entrada (`rls.supabase`, `archive-restore.supabase`, `support/stack.ts`, `crm-world.ts`, `world.ts`) importan `support/local-supabase` y ya no leen `process.env.SUPABASE_URL as string` | N | U estático | rojo (falta el módulo; `rls.supabase` y `crm-world` aún no lo usan) |

Aplicado por mí: `archive-restore.supabase.test.ts`, `tests/e2e-supabase/independent/support/world.ts` y `support/stack.ts` ya usan el helper.

### A02-03 (Medium) identidad estable del seed

| ID | Caso | P/N | Nivel | Hoy |
| --- | --- | --- | --- | --- |
| S-01 | Renombrar un cliente y un técnico demo y re-ejecutar: sin altas ni cambios (snapshot idéntico, sin fila con el nombre original) | N | P `seed-identity.test.ts` | rojo |
| S-02 | Restaurar + renombrar un designado archivado: no se re-archiva ni se duplica; sin eventos | N | P | rojo |
| S-03 | Restaurar, renombrar y volver a archivar: sigue archivado, sin duplicado | N | P | rojo |
| S-04 | Modificar todos los campos editables de todos los fixtures (ambas organizaciones): 0 altas, 0 cambios | N | P | rojo |
| S-05 | Registro previo del usuario con nombre de fixture: no se modifica ni archiva ni recibe eventos (el seed puede insertar el fixture o negarse; ambas válidas) y si corre es idempotente | P/N | P | verde |
| S-06 | La identidad no queda expuesta: tablas/columnas/funciones con `fixture|seed|demo` sin privilegios de escritura (ni lectura de tabla) para `anon`/`authenticated` | N | P | verde (vacío hoy) |
| S-07 | Estático: transacción única; bloqueo de transacción (`pg_advisory_xact_lock` o `LOCK TABLE`) antes del primer INSERT, sin bloqueo de sesión; sin DELETE/TRUNCATE/DROP, sin desactivar triggers, sin `service_role` | P/N | P estático | rojo (sin bloqueo) |
| RC-01 | Reconciliación en modo comprobación (por defecto, o `nexovantis.reconcile_apply` ≠ `on`): informa `would_map`/`not_found` y no persiste nada en `public` ni `private` | P/N | P `seed-reconcile.test.ts` | rojo |
| RC-02 | Modo aplicar: `mapped`; no escribe en clientes/técnicos/eventos; segunda vez `already_mapped`; el seed posterior deja las filas heredadas idénticas, sin duplicados y con solo los 2 eventos originales; luego idempotente | P | P | rojo |
| RC-03 | Fixture instalado dos veces (ambiguo): `ambiguous`, `record_id` nulo, no se asigna; el resto sí | N | P | rojo |
| RC-04 | Renombres cruzados: un fixture nunca se asigna a otra fila solo por su nombre actual | N | P | rojo |
| RC-05 | Fila equivalente de otra organización no se asigna | N | P | rojo |
| RC-06 | Informe: columnas `organization, entity_type, fixture, status, record_id`; sin duplicados; estados del vocabulario | P | P | rojo |

Concurrencia real (dos sesiones) no es verificable en PGlite: solo S-07 estático. Recomendación opcional de CI: dos `psql -f demo-crm.sql` en paralelo contra el stack local con comprobación de recuentos (no escrito: añade infraestructura).

### A02-04 (Medium) nombres PostgreSQL = Zod

Casos compartidos en `tests/unit/independent/support/name-cases.ts` (35): vacío, espacios, `\t`, `\n`, `\r`, CRLF, `\v`, `\f`, NBSP, U+2003, U+3000, U+2028/2029, U+FEFF, mezclas; 200/201 caracteres (ASCII, acentuados, emojis como puntos de código), 10 000; relleno en blanco (200 + 5 espacios o tabulaciones: Zod acepta tras recortar, BD rechaza el valor tal cual por superar 200 almacenados); 200 almacenados con 1 espacio inicial; válidos con tab/salto interior y Unicode.

| ID | Caso | P/N | Nivel | Hoy |
| --- | --- | --- | --- | --- |
| N-01 | `customers.name`, `technicians.full_name`, `organizations.name`: INSERT directo y UPDATE como owner vía RLS/GRANT cumplen la tabla (blancos y exceso → 23514; válidos aceptados) | P/N | P `name-constraints.test.ts` | rojo (114 casos: blancos distintos de espacio y relleno) |
| N-02 | Zod (alta y edición de cliente y técnico) rechaza/acepta según la tabla; lo almacenado es el valor recortado, 1..200 puntos de código | P/N | U `name-schemas.test.ts` | verde (144) |
| N-03 | Paridad: lo que Zod acepta se almacena (valor recortado); lo que Zod rechaza lo rechaza la BD por SQL directo | P/N | P | rojo (BD) |
| N-04 | Por PostgREST (alta y edición como member/owner; renombrar organización) los casos inválidos dan 23514 sin crear/cambiar nada; 200 válido; un member sigue sin renombrar | P/N | S `name-constraints.supabase.test.ts` | pendiente CI |
| N-05 | Verificación previa de solo lectura `supabase/checks/name-constraints-precheck.sql`: sobre un estado heredado (migraciones hasta `20261124100000`) lista exactamente las filas violadoras (`table_name, id, reason`), 0 filas si no hay, sin modificar nada | P/N | P | rojo (falta script) |
| N-06 | Migración sobre datos heredados conflictivos: nunca recorta ni reescribe datos (falla limpia o conserva filas); si aplica, la restricción rige para filas nuevas. Con datos corregidos se aplica y queda activa | P/N | P | rojo (arrastra N-05) |

### A02-05 (Medium) orden de eventos

| ID | Caso | P/N | Nivel | Hoy |
| --- | --- | --- | --- | --- |
| E-01 | Archivar, restaurar y archivar en UNA transacción (mismo `occurred_at`): `seq` no nulo, estrictamente creciente, orden correcto; clientes y técnicos | P | P `activity-order.test.ts` | rojo |
| E-02 | Sentencia multifila: `seq` distinto y no nulo por evento; transacciones separadas: crece con el orden de confirmación | P | P | rojo |
| E-03 | `seq` bigint, índice único; filas nuevas nunca nulas; `authenticated`/`anon` sin INSERT/UPDATE de columna (insert → 42501); UPDATE/DELETE/TRUNCATE siguen 23000 incluso superusuario; un archivado revertido no deja eventos | N | P | rojo |
| E-04 | Eventos históricos (estado `20261124100000` con dos eventos del mismo `occurred_at`): tras migrar conservan `seq` NULL (no se inventa orden), mismas filas y marcas; los nuevos reciben `seq` | P/N | P | rojo |
| E-05 | `listEntityHistory` ordena por `occurred_at` desc y `seq` desc y no reordena en memoria | P | U `activity-history-order.test.ts` | rojo |
| E-06 | Por PostgREST: miembros leen `seq` creciente; otra organización no; no se escribe (42501) | P/N | S `archived-readonly.supabase.test.ts` | pendiente CI |

Decisión de diseño fijada: `seq` nulo para históricos (documentar en la migración/SEED). Alternativas que inventan un orden entre empates no son aceptables.

### A02-06 (Medium) archivados de solo lectura

| ID | Caso | P/N | Nivel | Hoy |
| --- | --- | --- | --- | --- |
| R-01 | Owner y member no editan name/full_name, email, phone ni notes de un archivado (23000), tampoco varias a la vez con `archived_at = archived_at`; sin cambios ni eventos | N | P `archived-readonly.test.ts` | rojo |
| R-02 | Restaurar + editar en el mismo UPDATE → 23000; sigue archivado; sin evento `restored`; multifila atómico | N | P | rojo |
| R-03 | UPDATE masivo con activos y archivados falla entero | N | P | rojo |
| R-04 | Sin excepción por rol: superusuario (con o sin `sub`) tampoco edita un archivado | N | P | rojo |
| R-05 | Otra organización: 0 filas, sin cambios | N | P | verde |
| R-06 | Restaurar solo (`archived_at = null`) permitido para owner/member y después se edita; eventos `archived`, `restored`; restaurar reasignando los mismos valores es permitido | P | P | verde |
| R-07 | Filas activas se editan igual; archivar junto con otros campos (C-05) sigue permitido | P | P | verde |
| R-08 | Por PostgREST: PATCH de cada campo y combinado con `archived_at: null` → 23000, fila intacta; restaurar solo y luego editar funciona | P/N | S `archived-readonly.supabase.test.ts` | pendiente CI |
| R-09 | Formulario de edición abierto antes del archivado: el envío posterior se rechaza con mensaje y el registro no cambia | N | E `task010-ui.spec.ts` | pendiente CI (probablemente verde: guard de regresión del servicio) |

UI: ya existe (botón Editar oculto y página de edición sin formulario, cubiertos en `crm.spec.ts`); servicio `update` ya filtra `archived_at is null`. No se duplica.

### A02-07 (Medium) `safeNextPath`

| ID | Caso | P/N | Nivel | Hoy |
| --- | --- | --- | --- | --- |
| X-01 | Se conservan sin cambios 15 destinos legítimos (`%20`, `%25`, acentos `%C3%AD`, `%26`, `%3D`, `%2F`, `+`, `%2520`, fragmento, UUID con `aviso`), idempotentes y del mismo origen | P | U `safe-next-path-encoded.test.ts` | rojo (8) |
| X-02 | Siguen rechazados: `/%2F%2F…`, `/%5C…`, doble codificación `%252F`/`%255C`, `%2e%2e`, `//evil`, `/\evil`, esquemas, espacio sin codificar, ruta completa codificada | N | U | verde |
| X-03 | Controles codificados (`%00`, `%09`, `%0d%0a`) nunca salen del origen | N | U | verde |
| X-04 | El campo oculto `next` de `/login` conserva destinos codificados y sustituye los hostiles por `/dashboard` | P/N | U `login-logout-notice.test.tsx` | rojo (2) |
| X-05 | Proxy → `/login?next` → login → destino con `q=María López` y `q=100%`; destino hostil codificado termina en `/dashboard` | P/N | E `task010-ui.spec.ts` | pendiente CI (rojo esperado) |

## Archivos

Creados (A): `docs/reviews/claude/TASK-010-PRE.md`; `tests/unit/independent/{local-supabase-guard,supabase-suites-remote-guard,logout-action,activity-history-order,name-schemas,safe-next-path-encoded}.test.ts`; `tests/unit/independent/login-logout-notice.test.tsx`; `tests/unit/independent/support/name-cases.ts`; `tests/integration/independent/{name-constraints,activity-order,archived-readonly,seed-identity,seed-reconcile}.test.ts`; `tests/integration/independent/support/{db,seed-db}.ts`; `tests/integration/supabase/independent/{logout-revocation,name-constraints,archived-readonly}.supabase.test.ts`; `tests/integration/supabase/independent/support/stack.ts`; `tests/e2e-supabase/independent/task010-ui.spec.ts`.
Modificados (M): `tests/integration/independent/{archive-restore,archived-freeze}.test.ts`, `tests/integration/supabase/independent/archive-restore.supabase.test.ts`, `tests/e2e-supabase/independent/support/world.ts` (estos ficheros pasaron de CRLF a LF al reescribirlos; el repositorio normaliza a LF, `.gitattributes`).

## Contrato de interfaz para Develop

Nombres exactos que las pruebas esperan (nada más).

1. `tests/support/local-supabase.ts` (nuevo, compartido): `assertLocalSupabaseUrl(value: unknown): string` y `requireLocalSupabaseEnv(env = process.env): { url; anonKey; serviceKey }`. Reglas y mensajes en la cabecera de `local-supabase-guard.test.ts`. Sin importar `@supabase/supabase-js`, sin red. Hostname normalizado exacto `127.0.0.1|localhost|[::1]`, protocolo `http:`, sin usuario/clave; el error no incluye claves ni la clave de la URL. Recomendado: `tests/support/supabase-local-guard.setup.ts` registrado en `setupFiles` de `vitest.supabase.config.mts` (y, si procede, en la propia config) además de usar el helper en `rls.supabase.test.ts` y `crm-world.ts` (eliminar su `LOCAL_HOSTS`/`process.env.SUPABASE_URL as string`). El error debe aparecer como línea `Error: … local …`.
2. `logoutAction` (`src/features/auth/actions.ts`): ver contrato en la cabecera de `logout-action.test.ts`. Constantes literales: `/login` y `/login?aviso=cierre-no-confirmado`; `signOut({ scope: 'local' })`; borrado de cookies `^sb-.+-auth-token(\.\d+)?$` con `(await cookies())` (`delete` o `set` con valor vacío/`maxAge` 0).
3. `/login` (`src/app/login/page.tsx`): aviso con `data-testid="logout-notice"`, `role="status"` o `"alert"`; texto fijo con «no se pudo confirmar», «este navegador/dispositivo/equipo», sin «correctamente», «revocad[ao]» ni «todos los dispositivos»; solo para `aviso=cierre-no-confirmado`.
4. `safeNextPath`: conservar destinos con codificación; la comprobación tras decodificar no debe rechazar espacio ni fallar por un `%` literal en niveles > 1; mantener rechazo de `//`, `\`, segmentos de punto y controles al inicio, y multinivel.
5. Nueva(s) migración(es) con versión > `20261124100000` (no tocar las 5 existentes):
   - Nombres: CHECK en `organizations.name`, `customers.name`, `technicians.full_name` que rechacen en blanco (conjunto de `String.prototype.trim()`) y `char_length(name) <= 200` sobre el valor ALMACENADO (sin `btrim`). Error 23514. Constraint existente puede sustituirse (mismo nombre o nuevo).
   - `public.activity_events.seq bigint` con valor por defecto de secuencia/identidad, índice único; históricos con `seq` NULL (añadir la columna sin default, rellenar nada, y luego fijar el default); sin privilegios de escritura para `anon`/`authenticated` (la columna entra en el SELECT de tabla ya concedido); `prevent_event_change` sigue activo.
   - Archivados de solo lectura: el trigger de `customers`/`technicians` debe rechazar con `errcode 23000` cualquier UPDATE sobre fila con `OLD.archived_at` no nulo que cambie `name|full_name|email|phone|notes` (comparar `IS DISTINCT FROM`), incluida la restauración combinada, sin excepción por rol. Restaurar solo, restaurar reasignando los mismos valores y archivar una fila activa junto con otros cambios siguen permitidos. Actualizar la cláusula `WHEN` del trigger (hoy solo dispara si cambia `archived_at`).
   - Identidad de fixtures: esquema `private` (o columna) sin privilegios para `anon`/`authenticated`; nombre libre pero, si contiene `fixture|seed|demo`, las pruebas exigen que no sea accesible.
6. `supabase/seeds/demo-crm.sql`: identidad estable sin depender de campos editables; una sola transacción; `pg_advisory_xact_lock(...)` (o `LOCK TABLE`) antes del primer INSERT; sin DELETE/TRUNCATE/DROP/desactivar triggers/`service_role`; no modifica filas existentes. Con filas heredadas sin mapear puede abortar con mensaje claro o no duplicarlas; no puede duplicar ni alterar filas del usuario.
7. `supabase/seeds/reconcile-demo-crm.sql` (nuevo): contrato en la cabecera de `seed-reconcile.test.ts` (GUC `nexovantis.reconcile_apply`, última sentencia = informe con `organization, entity_type, fixture, status, record_id`; estados `would_map|mapped|already_mapped|ambiguous|not_found`; solo asigna con una única candidata inequívoca de la misma organización, nunca por nombre actual; no toca `customers/technicians/activity_events`). Nota: las pruebas incrustan las firmas originales (nombre, email, teléfono, notas) de seis fixtures del seed actual; si el contenido de los fixtures cambia, hay que avisar a Testing.
8. `supabase/checks/name-constraints-precheck.sql` (nuevo, solo lectura): última sentencia devuelve `table_name` (`organizations|customers|technicians`), `id`, `reason` (texto no vacío) por cada fila existente que violaría la restricción nueva (blanca o de más de 200 caracteres almacenados).
9. `listEntityHistory`: `.order('occurred_at', { ascending: false }).order('seq', { ascending: false })`.

Tests de Develop que quedarán en rojo por la decisión de A02-06 y que Develop debe actualizar (su propiedad; no los he tocado): `tests/integration/constraints.test.ts` (~línea 163, «Otras ediciones de un registro archivado siguen permitidas») y `tests/integration/seed-demo.test.ts` («un designado modificado por un usuario no es alterado por la re-ejecucion», edita `Metálicas Granito` y `Carmen Bosch Vera` archivados). Además `docs/SEED.md` describe la clave natural por nombre y habrá que actualizarlo (fuera de mi alcance de escritura).

## Cambios justificados en criterios independientes anteriores

| Prueba | Antes | Ahora | Justificación |
| --- | --- | --- | --- |
| `archived-freeze.test.ts`, caso «actualizar con el mismo archived_at y editar otros campos sigue permitido» (POST-05, TASK-006 RETEST) | Editar otros campos de un archivado se permitía (owner, y superusuario) | «editar otros campos de un archivado se rechaza con 23000» para owner, member y superusuario | Decisión humana ratificada 2026-11-24 (archivados de solo lectura), que sustituye al criterio previo. Pasa a rojo hasta que Develop implemente el trigger |
| `archive-restore.test.ts` C-07 (TASK-008B-PRE C-07) | Tras archivar, `notes='b'` (owner) y `notes='c'` (superusuario) y `archived_at = archived_at` seguían permitidos y no emitían evento | Las dos ediciones se rechazan con 23000 y siguen sin generar evento; se elimina la aserción del no-op `archived_at = archived_at` (válido o rechazado, no se prescribe) | Misma decisión ratificada. Se conserva el objetivo del caso (no hay eventos sin cambio de `archived_at`) |
| `archive-restore.test.ts` C-20 y C-23 | Columnas exactas de `activity_events` sin `seq`; todas NOT NULL | Se añade `seq` (bigint, nullable) y se mantiene NOT NULL en el resto; C-23 incluye `seq` en las claves y sigue sin datos personales | A02-05: nueva columna de orden; nullable porque los históricos no tienen orden reconstruible. No se relaja ninguna otra aserción |
| `archive-restore.test.ts` C-02 («registro restaurado vuelve a ser editable») y C-05 (archivar con otros campos) | Sin cambio | Sin cambio (siguen vigentes: se edita tras restaurar; se archiva una fila activa con otros campos) | Compatibles con la regla ratificada |
| `archive-restore.supabase.test.ts` y `world.ts` | Lectura directa de `SUPABASE_*` / `LOCAL_HOSTS` | Usan `requireLocalSupabaseEnv` | A02-02. Sin cambios en los casos |
| TASK-008B-PRE C-09/10 («ediciones sin cambio de archived_at siguen permitidas») | — | Sigue siendo válido solo para filas ACTIVAS (C-10b edita una fila activa); no se modifica el informe histórico | Aclaración registrada aquí |

Ningún caso se ha eliminado ni relajado sin la sustitución por su contrario (A02-06) o la ampliación necesaria (A02-05).

## Riesgos y decisiones abiertas para Orchestrator

1. R-04 (sin excepción por rol, incluido superusuario) es una decisión de diseño mía coherente con `prevent_organization_change` y con el rechazo ya vigente de reescribir `archived_at` para el superusuario. Si Orchestrator prefiere permitir a administración corregir archivados, retirar R-04 y el caso superusuario de `archived-freeze`/C-07 antes de Develop.
2. Los históricos con `seq` nulo (E-04) son la única forma de no inventar un orden entre empates; si Develop rellena `seq`, E-04 fallará y habrá que decidir de nuevo.
3. Las pruebas de reconciliación (RC-xx) y de la verificación previa fijan un contrato (GUC, informe, rutas) que no estaba en la solicitud original; es el mínimo para observar el comportamiento sin acoplarse a la tabla de correspondencia.
4. G-05 arranca `vitest` en un proceso hijo (~1 s por destino; 7 destinos) dentro de `pnpm test:unit`. Es la única prueba que demuestra "sin tráfico" sin Docker; si se considera costosa, puede moverse a un script de CI.
5. Unidad de longitud: puntos de código Unicode (150 emojis = 150 caracteres). Zod 4 ya cuenta así (N-02 verde); la BD lo cumple con `char_length`, no con `octet_length`.
6. Rate limit de GoTrue local (30 inicios de sesión/5 min): las nuevas suites añaden ~13 inicios (stack, 7 de logout menos los de stack) y la E2E ~6; vigilar flakiness en CI.
7. `supabase-js` pinneado a 2.119.2: L-08 asume que `signOut({scope:'local'})` borra la sesión local antes de la petición y devuelve el error remoto (verificado leyendo el código instalado, no ejecutado). Una actualización podría cambiarlo.
8. Limitación: no se puede simular un fallo de revocación dentro del servidor Next en E2E; la rama real se cubre por U (dobles) y por la caracterización S.

## Quedan para CI (no ejecutado, no afirmado)

- `pnpm test:supabase`: `logout-revocation`, `name-constraints`, `archived-readonly`, `archive-restore` (modificado) y `rls` (tras el cambio de Develop).
- `pnpm test:e2e:supabase`: `task010-ui.spec.ts` y la regresión de `crm.spec.ts`.
- Regresión completa (`lint`, `typecheck`, `test:unit`, `test:integration`, `build`) tras Develop.

## Veredicto de la fase

PRE no tiene veredicto PASS/FAIL/BLOCKED de implementación: fija criterios y deja pruebas en rojo donde existe el defecto (28 unit, 155 PGlite en la ejecución local de referencia, sin Develop). Pendiente de Develop y de CI.
