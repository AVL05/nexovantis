# TASK-013 POST (Testing independiente) - F6 Inventario y actividad

- Fecha: 2026-11-25. Rama `feat/inventory-activity`, base `0a221e6`, cambios sin commit (diff + archivos sin seguimiento).
- Entorno: Windows 11, Node local, Vitest 5.1.1 (PGlite para integracion). Sin Docker/Supabase, sin Cloud, sin dev server, sin capturas. Modelo solicitado: Sonnet medium (efectivo no observable).
- Revision: diff real de migracion, seed, servicio, acciones, esquemas, UI y tests; no se tomo como evidencia el informe de Develop.

## Veredicto inicial: BLOCKED (con 1 hallazgo Medium accionable antes de CI). Veredicto final: ver seccion RETEST (BLOCKED, solo por concurrencia real pendiente de CI).

No hay incumplimiento demostrado de un criterio aprobado, pero la concurrencia real, PostgREST y el job `supabase` no pueden ejecutarse localmente (BLOCKED, no PASS). Ademas hay un defecto probable (F-1) que hara fallar de forma intermitente un test e2e de CI.

## Comandos y resultados (reales)

| Comando | Resultado |
|---|---|
| `npx vitest run -c vitest.integration.config.mts tests/integration/inventory-db.test.ts tests/integration/inventory-seed.test.ts` | 2 archivos, 52 tests OK (exit 0) |
| Integracion dirigida de regresion: `tests/integration/independent` + constraints, work-orders, quotes-db, seed-demo, seed-orders, quotes-seed, records-flow | 21 archivos, 796 tests OK |
| `npx vitest run tests/unit` | 43 archivos, 903 tests OK (tras actualizar app-shell-a11y; antes fallaba solo esa prueba) |
| `pnpm typecheck` | OK (exit 0) |
| `pnpm lint` (eslint --max-warnings=0) | OK |
| `pnpm format:check` | OK (tras `prettier --write` de mi archivo editado) |
| Nuevo `tests/unit/independent/activity-madrid-range.test.ts` | 8 tests OK |

## Cambios de Testing

- `tests/unit/independent/app-shell-a11y.test.tsx`: anadidas `/inventory` y `/activity` al final de las dos comprobaciones de la lista exacta de enlaces y ajustado el titulo/comentario. Cambio LEGITIMO: Orchestrator autorizo dos enlaces nuevos de navegacion (F6); es una actualizacion de la lista exacta, no una relajacion (se mantienen igualdad estricta, orden y `aria-current`). Aprobacion registrada aqui por ser el propietario.
- Nuevo `tests/unit/independent/activity-madrid-range.test.ts`: dia natural Europe/Madrid, dias de 23 h (2026-03-29) y 25 h (2026-10-25), dia final inclusivo, entradas invalidas en searchParams.
- Comprobacion Git: no hay `.skip/.only/.todo/xit/xtest` en archivos nuevos; no se tocaron otros `tests/acceptance/**` ni `tests/**/independent/**`; `package.json` y lockfile sin cambios (sin dependencias nuevas); `tests/unit/crm-routes.test.ts` (Develop) solo anade casos. Develop modifico `docs/ARCHITECTURE.md`, `BUSINESS_RULES.md`, `SEED.md`, `SUPABASE_CLOUD.md`: confirmar que el handoff los permite (solo registran INV-1..9, DH-08 y la migracion no aplicada).

## Matriz criterio -> evidencia

| Criterio | Evidencia | Estado |
|---|---|---|
| INV-1 enteros, unidad cerrada | CHECK `unit`, `integer`; Zod `^\d{1,9}$`; inventory-db "valida unidad..." / "cantidad ... no entera" | PASS (PGlite) |
| INV-2 referencia unica ci, inmutable | indice `lower(reference)`, guard; tests NX025 + "ni con SQL de administracion" | PASS (PGlite); carrera real: pendiente CI |
| INV-3 saldo 0, no editable | guard INSERT/UPDATE (`pg_trigger_depth()<2`); revisado: sin camino de usuario para UPDATE | PASS (PGlite) |
| INV-4 movimientos, nota<=200, sin borrado, FOR UPDATE + CHECK | triggers, `prevent_inventory_change`; tests saldo/inmutabilidad | PASS (PGlite); sobregiro paralelo: pendiente CI |
| INV-5 idempotencia | advisory lock + comparacion de payload (NX024); tests de replay/NX024/por organizacion | PASS secuencial; misma clave en paralelo: pendiente CI |
| INV-6 consumo/orden misma org no terminal, misma transaccion | trigger `FOR SHARE`, tests orden ajena/estados/rollback | PASS (PGlite); consumir vs cancelar: pendiente CI |
| INV-7 estados | columna generada + tests | PASS |
| INV-8 archivado solo lectura | guard NX021 + movimientos NX021, evento | PASS; archivar vs mover paralelo: pendiente CI |
| INV-9 owner y member | tests create/move como member | PASS (PGlite) |
| DH-08 P1 eventos | triggers, actor `auth.uid()` NOT NULL, detalle sin nota, inmutables, seq | PASS (PGlite) |
| /activity | params/DST (mi test), servicio, UI revisada | PASS estatico/unit; e2e pendiente CI |
| Seed idempotente via RPC como owner | inventory-seed (2a ejecucion no cambia nada; rollback sin owner) | PASS (PGlite) |
| Hardening RPC | `security definer` + `search_path=''`, EXECUTE revocado a PUBLIC/anon, org por `require_org()`; tests de privilegios | PASS (PGlite) |
| RLS / aislamiento 2 orgs | SELECT solo miembros, RPC ajena NX020, orden ajena NX023 | PASS (PGlite); PostgREST real: pendiente CI |

## Hallazgos

### F-1 (Medium, accionable) `seq` de `stock_movements` no refleja el orden real de aplicacion bajo concurrencia
- Ruta: `supabase/migrations/20261128090000_task013_inventory.sql:117` (identity) + `:310-312` (bloqueo en el trigger BEFORE); consumidores: `tests/e2e-supabase/inventory.spec.ts:329-340`, `src/features/inventory/service.ts:227` (orden `seq desc`).
- Escenario: el valor por defecto de `seq` (`nextval`) se evalua al construir la fila, ANTES del trigger BEFORE que toma `FOR UPDATE` sobre el articulo. Dos movimientos concurrentes pueden obtener `seq` en un orden y el bloqueo en el contrario (A: seq 1, B: seq 2, pero B aplica 10->7 y despues A 7->4). Resultado: el historial "mas reciente primero" puede mostrar la cadena de saldos invertida y el test "salidas concurrentes" (comprueba `balance_before[i] === balance_after[i-1]` ordenando por `seq`) fallara de forma intermitente en CI con 14 peticiones paralelas. No verificado empiricamente (PGlite tiene una sola conexion); deduccion del orden de evaluacion de defaults en PostgreSQL.
- Arreglo sugerido: asignar el orden dentro del trigger tras el bloqueo (p. ej. `new.seq := nextval(pg_get_serial_sequence('public.stock_movements','seq'))` tras el `FOR UPDATE`, o un contador por articulo `item_seq = balance_count+1` bajo el bloqueo), o ordenar historial/test por la cadena de saldos. Anadir al e2e la comprobacion tras el arreglo.
- Relacionado (Low, preexistente): `/activity` ordena por `occurred_at` (inicio de transaccion) antes que `seq`; bajo concurrencia dos eventos del mismo articulo pueden aparecer en orden distinto al de aplicacion.

### Desviacion `stock_movements.order_id` sin FK (Informational: suficiente)
- La garantia real es el trigger `FOR SHARE` (`:334-336`), que es mas fuerte que una FK: una FK solo toma `FOR KEY SHARE`, que NO bloquea el `UPDATE` de estado; `FOR SHARE` choca con el `FOR NO KEY UPDATE` de cancelar/completar. Resultado: la cancelacion espera al consumo o el consumo (READ COMMITTED, relee la fila) ve el estado terminal y falla con NX023. Sin ciclo: el orden de bloqueo es articulo -> orden y ningun camino de ordenes toma articulos (no hay deadlock).
- Huerfanos: las ordenes no se borran ni se vacian (triggers de F4), por lo que no pueden quedar `order_id` colgantes salvo bypass de superusuario (`session_replication_role=replica`). Alternativa: FK compuesta `(organization_id, order_id)` ademas del trigger; exigiria cambiar el contrato de TRUNCATE de la prueba independiente de F4 (0A000 vs 23000), decision de Testing. No recomendada para F6; mantener el diseno.
- Un consumo ya confirmado sobre una orden que se cancela despues es valido (documentado y probado).

### Otros (Informational/Low, requieren aceptacion humana o F7)
- Low: los tests e2e de carrera (archivar/mover, consumir/cancelar) son probabilisticos (`Promise.all`, 4 rondas); no hay prueba determinista que mantenga un bloqueo desde otra conexion. Aceptable para el MVP; el sobregiro (14 en paralelo), la misma clave (10 en paralelo) y la referencia duplicada (8 en paralelo) si son concurrentes de verdad (JWT/sesiones distintas contra PostgREST).
- Low: `create_inventory_item` con un `p_id` ya existente en la misma organizacion devuelve el articulo original sin comparar el contenido (distinto de INV-5 de movimientos; INV-5 no lo exige).
- Informational: el seed aborta (fail-closed, transaccion completa) si una referencia demo ya existe creada a mano sin identidad; documentarlo en SEED.md si no consta.
- Informational: `MovementForm` reutiliza `requestId` hasta que llega el nuevo RSC tras `revalidatePath`; un envio inmediato distinto produce NX024 (mensaje seguro, sin duplicados). Sin impacto de integridad.
- Accesibilidad/UI (revision estatica, sin capturas): formularios con `aria-label`, `Label/htmlFor`, `aria-invalid/aria-describedby`, `LiveRegion` para resultados, tabla con `caption` y lista `ol` con `aria-label` en movil, indicador de nivel `aria-hidden` con el estado en texto, confirmacion por dialogo para archivar. Sin hallazgos.

## Pendiente para CI (no cuenta como PASS)
`pnpm test:e2e:supabase` (inventory.spec.ts, activity.spec.ts) sobre el SHA objetivo con Postgres/PostgREST reales: concurrencia (sobregiro, misma clave, archivar/mover, consumir/cancelar, referencia duplicada), EXECUTE/RLS reales, `search_path` y regresion completa. Aplicacion de la migracion en Cloud: no realizada ni autorizada.

## RETEST (F-1) - 2026-11-25

Veredicto final: **BLOCKED**. Causa unica y correcta: la concurrencia real (PostgreSQL/PostgREST con conexiones distintas, job `supabase` de CI) no se puede ejecutar localmente. Todo lo verificable en local pasa; F-1 queda CORREGIDO a nivel de diseno y de PGlite.

Verificacion independiente (lectura de la migracion editada):
- Correccion real: `seq bigint not null` sin DEFAULT (migracion :122), `unique (seq)` (:137), secuencia propia `public.stock_movements_seq_seq` (:117, `owned by` :156). `new.seq := nextval(...)` esta en `stock_movements_apply` (:329) DESPUES del `select ... for update` del articulo y de las comprobaciones NX020/NX021 (:310-326) y se asigna siempre, sobrescribiendo cualquier valor recibido. El default ya no existe, asi que no se evalua antes del bloqueo. Efecto secundario aceptable: un movimiento rechazado puede dejar huecos en `seq` (no hay requisito de continuidad).
- Privilegios: `revoke all on sequence public.stock_movements_seq_seq from public, anon, authenticated` (:188), posterior a su creacion (revoca tambien los grants por defecto de Supabase en `public`). La funcion que llama a `nextval` es SECURITY DEFINER, por lo que los usuarios no necesitan acceso. Prueba PGlite: `nextval` como authenticated -> 42501; INSERT directo con `seq=1` -> 42501; como superusuario el valor 1 se sobrescribe. Obligatorio (NOT NULL) y unico (constraint). Comprobacion de ACL real con los default privileges de Supabase: pendiente de CI (PGlite no los reproduce).
- Historial: `src/features/inventory/service.ts:227` ordena por `seq desc`, ahora coherente con el orden de aplicacion; el indice `stock_movements_item_idx` usa `seq desc`.
- Sin regresion: el `seq` de `activity_events` no se toca (la migracion solo lo usa por defecto en los INSERT de los triggers); los tests de orden/NOT NULL de actividad pasan.

Comandos y resultados:
| Comando | Resultado |
|---|---|
| `npx vitest run -c vitest.integration.config.mts` inventory-db, inventory-seed, independent/{activity-order, activity-seq-notnull, work-orders-post, seed-identity} | 6 archivos, 180 tests OK |
| `npx vitest run` inventory-actions, inventory-components, inventory-rules, activity-params, independent/{app-shell-a11y, activity-madrid-range} | 6 archivos, 69 tests OK |
| `pnpm typecheck` | OK (exit 0) |
| `pnpm lint` | OK |
| `pnpm format:check` | OK |

Pendiente para CI (BLOCKED): `pnpm test:e2e:supabase` sobre el SHA objetivo; en particular que "salidas concurrentes" cumpla ya la cadena `balance_before[i] === balance_after[i-1]` ordenando por `seq`, ademas de misma clave en paralelo, archivar/mover, consumir/cancelar, referencia duplicada y ACL real de la secuencia. Sin hallazgos nuevos.

## RETEST-CI (CI 45650393444, HEAD 1a6c4db)

Fallo: `inventory.spec.ts:116` (strict mode): tabla de escritorio y lista movil (`lg:block` / `lg:hidden`) coexisten en el DOM. Correccion solo en tests, con helper local `visible = (l) => l.filter({ visible: true })`; sin `.first()`/`.nth()` nuevos, aserciones intactas.

- inventory.spec.ts: historial `link orderTitle` y `text 'Existencia inicial'` (l.180-181), y los 5 `getByRole('link', { name })` del listado de articulos (`?estado=bajo|agotado|archivados`, `?q=`, listado base) envueltos en `visible(...)`.
- activity.spec.ts (mismo defecto, en la comprobacion de orden): `.locator('time')` pasa a `.locator('time:visible')`; antes recogia los `time` de ambas representaciones (secuencia duplicada, nunca ordenada).
- Local: typecheck, eslint y prettier --check OK; `playwright --list` detecta ambos specs. Sin app modificada.
- Veredicto: PASS dirigido estatico; E2E real BLOCKED por CI (requiere Supabase local) sobre el SHA del nuevo commit.

## RETEST-CI-2 (CI 45651894003, HEAD 7681ec5)

Fallo: `orders.spec.ts:100` (listado): `q=world.run` y `new RegExp(world.run)` coinciden con 6 ordenes, porque inventory/activity/quotes comparten `world.run` y la organizacion A. El "1 NOT RUN" es `orders.spec.ts:127` (cancelar): el fichero usa `mode: 'serial'` y workers=1, por lo que un fallo salta los tests siguientes del mismo describe.

Correccion solo en `tests/e2e-supabase/orders.spec.ts`: clave propia `scenario = OS${world.run}` (beforeAll) en los titulos de las ordenes que crea el spec ("Revision caldera", "Orden a cancelar") y en las 3 busquedas `?q=` y el regex del enlace. Sin `.first()`/`.nth()` nuevos, aserciones sin debilitar (el conteo "una fila completada" y "ninguna cancelada" ahora son sobre datos del escenario). Clientes/tecnicos conservan `world.run` (no se buscan). inventory/activity no se tocan y no pueden contener `OS<run>`; orders.spec no crea datos que ellos cuenten (activity solo asserta por sus etiquetas y orden relativo).
Local: tsc, eslint, prettier OK; `--list` 82 tests. Veredicto: PASS dirigido estatico; E2E real BLOCKED por CI.

## DIAGNOSTICO-CI-001 (Testing, sobre 984a59e; correccion conjunta del arnes E2E autorizada por el humano)

No se dispone del texto del diagnostico de Codex: cada uno de los 7 puntos se verifico leyendo el codigo real. Solo tests; sin app, migraciones, `.github/**`, `playwright.supabase.config.ts` ni `independent/**`. Sin `waitForTimeout`, retries, `.skip/.only` ni aserciones debilitadas.

| # | Confirmado | Cambio |
|---|---|---|
| 1 | Si. `ActivityList` pinta tabla (`role=region`, `lg:block`) y `<ol aria-label>` (`lg:hidden`); el test leia `time:visible` sin esperar al 2.o evento. | activity.spec: helper `log(page)` = `region.or(list)` (las consultas por rol solo hallan la representacion visible) y `eventsOf(label)`; el orden espera `toHaveCount(2)` (alta + entrada del caso), compara `datetime` numericos descendentes y que "Entrada de stock" precede a "Articulo creado". |
| 2 | Si. `getCrmWorld()` memoizaba UN mundo por worker; 4 specs compartian `orgA`/`run`. | `getCrmWorld(key = 'crm')`: `Map<clave, Promise>`; clave validada `^[a-z][a-z0-9-]{0,15}$`; nombres/emails llevan la clave. Cada spec usa la suya (`orders`, `quotes`, `inventory`, `activity`); `crm.spec.ts` NO se toca (clave por defecto `crm`, mismo comportamiento). |
| 3 | Si. `world.run`/regex y `.first()` sobre datos (quotes l.176-186, activity, inventory historial de actividad). | Titulos propios (`Revision caldera ${scenario}`, `Reforma de bano ${run} (ampliado)`, etiquetas `A/F/D/O/P/I/J${run}` en activity), filas por `has: link` + `hasText`, conteos exactos (inventory: 7 eventos del articulo, 2 entradas, 7 con "Tu", 7 enlaces). `.first()` de "Tu" -> `not.toHaveCount(0)`; navegacion lateral -> `navigation {name:'Principal'}` sin `.first()`; avisos -> `getByRole('status').filter(...)`. |
| 4 | Si. Varias ausencias iban justo tras `goto`. | Control previo: `settled()`/`listSettled()` (registro o estado vacio de esa consulta), fila de control propia o recalculo (`total` antes de "Material" ausente; heading "Todavia no hay presupuestos" antes de `getByText(title)`). |
| 5 | Si. El `movement-error` del "31" (stock insuficiente) seguia en pantalla al comprobar el saldo tras "2.5". | Espera `movement-error` con "Revisa los campos marcados" y el error de campo "Introduce una cantidad entera mayor que 0." antes del saldo; recarga y saldo 30 persistido. |
| 6 | Si. `today` salia del reloj del test; rango sin pagina. | `occurred_at` leido con la clave de servicio (solo preparacion) y `Intl` Europe/Madrid; dia, +-1 dia (ausente tras `settled`) y rango que abarca; PAGE_SIZE=20 (`src/lib/records/params.ts`): organizacion B, 21 entradas (+101..+121): pagina 1 = 20 (primero +121, ultimo +102, fechas descendentes), "Siguiente" -> pagina 2 = 1 (+101). |
| 7 | Si, sin dependencias: ningun caso lee datos de otro. | Quitado `serial` en activity (7 casos, cada uno siembra su etiqueta). Se mantiene `serial` en orders, quotes e inventory (el listado de quotes/orders depende de la orden/presupuesto creados por el primer caso; inventory comparte estado y su flujo es secuencial). |

Casos de actividad: 4 -> 7 (filtros, fechas y paginacion separados; orden propio). `--list`: 82 -> 85 (+3, todos de activity). 

Residual deliberado: `.first()` solo donde el destino es identico y no depende de datos (enlaces "Nueva orden"/"Nuevo articulo" duplicados en panel/cabecera, boton "Cancelar orden", mensaje de referencia duplicada) y en aserciones posicionales de orden (`first()`/`last()` de la pagina 1). Dependencia de orden de fichero en activity: los eventos del caso son los mas recientes de su organizacion cuando los consulta (un worker); la paginacion usa la org. B.

### Implicaciones de autenticacion y recursos de CI (analisis; sin cambios en config/CI)
- Mundos: 5 en total (crm + 4) = 10 organizaciones y 15 usuarios creados con `auth.admin.createUser` (API de administrador, no cuenta como inicio de sesion). Antes 1 mundo compartido; coste: ~15 llamadas admin extra en `beforeAll`, del orden de segundos.
- Limite de login: `supabase/config.toml` fija `[auth.rate_limit] sign_in_sign_ups = 300` (por 5 min e IP). Inicios reales: UI `loginAs` (crm 6, orders 4, quotes 10 incl. concurrencia, inventory 13, activity 5-8) mas `signInWithPassword` de preparacion; unas ~45-55 en total, que ademas se reparten en minutos. Con mundos aislados NO crece el numero de logins por prueba (cada caso ya iniciaba sesion); el margen frente a 300/5 min es amplio. El caso de paginacion agrega 1 login API + 1 UI. La clave por spec no reutiliza JWT entre specs: cada sesion es de un usuario distinto, sin colision de refresco (`autoRefreshToken: false`).
- JWT/sesiones: cada spec solo ve su propio usuario; `clearCookies` se mantiene al cambiar de rol. Sin cambio en caducidad.
- Recursos: workers=1 se mantiene (sin paralelismo extra de conexiones); la paginacion hace 22 RPC secuenciales (~1-2 s). Los especs de concurrencia ya abrian N conexiones paralelas (14/10/8) y no cambian. Datos: +~10 filas de organizaciones y +~20 eventos; irrelevante para el runner.
- Recomendacion (no aplicada): si se quisiera paralelizar specs por fichero en el futuro, los mundos aislados lo permiten, pero habria que revisar el limite de 300/5 min y las conexiones de Postgres; hoy no es necesario.

### Comprobaciones (reales, sin simular CI)
- `npx tsc --noEmit`: exit 0. `npx eslint tests/e2e-supabase`: exit 0. `npx prettier --check tests/e2e-supabase`: OK.
- `npx playwright test -c playwright.supabase.config.ts --list`: 85 tests en 10 ficheros (HEAD: 82; +3 de activity, justificado).
- Busqueda de `waitForTimeout|.skip|.only|retries` en `tests/e2e-supabase/*.ts` y `support/`: sin coincidencias.
- E2E real: NO ejecutado (sin Supabase local). Veredicto: PASS dirigido estatico; E2E real BLOCKED por CI sobre el SHA del commit de Orchestrator.
- Riesgo residual de la ejecucion no verificada: conteos exactos introducidos (inventory 7 eventos; activity alta+entrada=2) asumen que cada accion genera exactamente un evento y que las ediciones de cabecera no generan evento (no hay accion `updated` en `ACTIVITY_ACTIONS`); si CI los contradice, es dato de comportamiento a revisar, no a relajar.

## AUDIT-004 / TASK-013-FIX (Testing POST independiente + G4-04) - 2026-11-25

- Rama feat/inventory-activity, HEAD c600a31, cambios de Develop sin commit (diff + migracion aditiva y test sin seguimiento). Sonnet; esfuerzo efectivo no observable. Sin commit, push ni Cloud. Entorno: PGlite (Postgres real in-process, 1 conexion); sin Docker/psql/Supabase local.
- **Veredicto: BLOCKED.** Todo lo ejecutable en local pasa y no hay incumplimientos ni Critical/High. No se puede verificar sin CI: la concurrencia real con varias conexiones (G4-01) y los E2E (G4-04; 85 tests listados, no ejecutados).

### Matriz hallazgo -> evidencia
| Hallazgo | Evidencia | Estado |
|---|---|---|
| G4-01 saldo solo por fila insertada | Lectura SQL: BEFORE sin UPDATE; AFTER `stock_movements_apply_balance` aplica y comprueba `balance_before`; seq tras FOR UPDATE; orden alfabetico apply_balance < event_insert. inventory-db (6 casos de Develop) y 6 mios en independent/task013-fix-post.test.ts: replay mismo payload y NX024 sin efectos; multifila con 2 articulos intercalados; sobregiro multifila revierte ambos; ON CONFLICT con clave de otro articulo; consumos multifila y orden cancelada NX023; UPDATE directo de saldo (-1, +1, 0) rechazado; libro inmutable; invariantes globales (saldo = ultimo balance_after = neto, >= 0, 1 detalle y 1 evento por movimiento) | PASS local |
| G4-01 concurrencia | tests/integration/supabase/independent/task013-fix.supabase.test.ts: 8 reintentos paralelos misma clave, payloads distintos NX024, 16 salidas sobre saldo 10, mezcla, consumo vs cancelacion x6 | BLOCKED (CI) |
| F-1 e idempotencia | inventory-db existente y casos anteriores | PASS local |
| G4-02 id inmutable | task013-fix-hardening (Develop) y mio: orden con consumo y presupuesto aceptado, UPDATE multifila con CASE, vinculos siguen resolviendo; service_role por PostgREST 23000 (CI) | PASS local / CI pendiente |
| G4-03 aceptacion | Develop (vacio NX016, preexistente 23503, ya vinculada) y mios: order_id sobre aceptado NX011, INSERT directo accepted NX012, otro cliente, otra organizacion, otro actor, SAVEPOINT (falla cerrado 23503), 2 presupuestos con la misma orden creada en la tx (23505 por UNIQUE), sin actor 23000, reject de vacio permitido, accept_quote vacio NX016 sin orden huerfana. xmin en PostgreSQL real y 5 accept_quote paralelos con UNA orden: CI | PASS local / CI pendiente |
| Seed con ordenes no demo | inventory-seed (2 casos de Develop): 0 consumos sobre ordenes de usuario, idempotente; sin ordenes demo omite | PASS |
| quote_label > 9999 | Develop: 1..99999999, firma, privilegios, search_path vacio, immutable, descripcion PRE-9999/10000/10001 | PASS |
| Migraciones aplicadas intactas | `git diff HEAD --stat -- supabase/migrations`: solo 20261128090000 (editable, no aplicada en Cloud) | PASS |
| Aditiva sobre datos existentes | task013-fix-post: BD con migraciones anteriores a 20261128100000 y datos reales (presupuestos, orden, articulo, movimientos); fingerprint de todas las tablas public/private identico tras aplicarla; accept_quote sigue funcionando | PASS |
| Sin .skip/.only/.todo/xit | grep en tests/e2e-supabase y tests/integration: 0 | PASS |

### G4-04 aserciones recuperadas (c600a31 -> ahora; lineas actuales)
Comparacion: `git diff 984a59e c600a31 -- tests/e2e-supabase`. `log()` = region (>= 1024 px) o lista (movil) segun el viewport, sin `.or()`. `expectRepresentation` exige la correcta visible y la otra oculta (`includeHidden` + `toBeHidden`). `expectVisibleCount` = toHaveCount + toBeVisible de cada elemento. Sin waitForTimeout; workers 1 y mundos por spec intactos.
- activity.spec.ts 36-60 (helpers) y 147-155: antes `getByText('Entrada de stock').first()` visible; c600a31 solo `toHaveCount` + `toContainText`. Ahora: filas visibles, entrada visible, enlace visible con href y detalle `+12 kg · saldo 0 → 12` visible.
- activity 172-179 (filtros), 199/213 (rango de fechas), 239 (orden), 285-299 (paginacion: 20 filas visibles, representacion, `+101 ud` visible), 316 (aislamiento): `toHaveCount(n)` sin visibilidad y `.or(region, list)` pasan a `expectVisibleCount` y `expectRepresentation`. `first()`/`last()` se mantienen solo como posiciones semanticas del orden (+121/+102).
- inventory.spec.ts ~262-292: actividad con `.or()` y conteos (`Tú` 7, enlaces 7) pasa a representacion exacta, cada tipo de evento visible, 7 filas visibles, "Tú" y enlace a la entidad visibles en cada fila, y enlace de la orden visible en el consumo (antes `toContainText`).
- orders.spec.ts 108-117: `history.getByText(/Tú/).first()` visible; c600a31 `.not.toHaveCount(0)`. Ahora "Tú" visible en cada entrada (creada, asignada, En curso, Completada). 125-142: panel `locator(a[href]).not.toHaveCount(0)` pasa a evento "Orden creada" con enlace visible y href, y cada "Cambio de estado" visible con "Tú", dentro de Actividad reciente.
- quotes.spec.ts 133-137: historial `Tú` `.not.toHaveCount(0)` pasa a visible en "creado" y "aceptado". Listado: fila `toContainText('Aceptado')` pasa a fila visible y badge `Aceptado` visible.
- Sin cambios (refuerzos de c600a31, no debilitaciones): `listSettled`/`settled` como condicion previa de ausencias, toasts por `role=status`, selectores exactos de titulo, reordenaciones de comprobaciones.
- No ejecutado: los selectores se basan en el marcado real (ActivityList, Table, OrderTimeline, QuoteTimeline, DashboardPanels). Riesgo residual de ajuste en CI; el panel no afirma un numero exacto de eventos de la orden.

### Hallazgos por severidad
- Critical/High/Medium: ninguno.
- Low: supabase/migrations/20261128100000_task013_fix_orders_quotes_hardening.sql:68-83. La guarda acepta una orden creada en la MISMA transaccion por otra via (p. ej. `create_work_order` y luego UPDATE por SQL) con mismo actor y cliente. No es reutilizar una existente y UNIQUE(order_id) evita compartirla, pero la orden no lleva la descripcion ni el importe de `accept_quote`. Solo alcanzable con SQL multi-sentencia de administracion; ya cubierto y documentado en task013-fix-hardening.test.ts. Requiere aceptacion humana registrada.
- Informational: (1) INSERT multifila de varios articulos en orden distinto desde dos sesiones puede producir interbloqueo de bloqueos de fila (FOR UPDATE por articulo); la RPC de una fila no (articulo y luego orden; la cancelacion solo bloquea la orden). (2) `inventory_items_guard` usa `pg_trigger_depth() < 2` (preexistente): una funcion de administracion invocada desde un trigger podria editar el saldo. (3) El helper `visible()` de inventory.spec.ts:24 (`filter({visible:true})`) es anterior a c600a31 y no se toco. (4) Un SAVEPOINT en una escritura administrativa se rechaza (falla cerrado), documentado.

### Comandos reales
- `npx vitest run -c vitest.integration.config.mts` sobre inventory-db, inventory-seed, task013-fix-hardening e independent/task013-fix-post: 4 ficheros, 95 tests, exit 0. Lote de regresion (quotes-calc, quotes-db, quotes-seed, work-orders, seed-orders, independent/{work-orders-post, quotes-post, seed-orders-post, activity-order}): 9 ficheros, 286 tests, exit 0. Nuevos de Testing: 20 (PGlite).
- `npx tsc --noEmit` exit 0; `npx eslint tests/e2e-supabase tests/integration` exit 0; `npx prettier --check tests/e2e-supabase tests/integration` OK (el .sql no tiene parser).
- `npx playwright test -c playwright.supabase.config.ts --list`: 85 tests en 10 ficheros; diferencia 0 respecto a HEAD (G4-04 no anade ni quita tests).

### Pendiente de CI (BLOCKED, no PASS)
`pnpm test:supabase` (nuevo task013-fix.supabase.test.ts, 8 tests de concurrencia y PostgREST) y `pnpm test:e2e:supabase` (4 specs modificados, 85 tests) sobre el SHA objetivo. Si un selector no coincide en CI se corrige en tests, no en produccion.

### Archivos de Testing y Git
Nuevos: tests/integration/independent/task013-fix-post.test.ts, tests/integration/supabase/independent/task013-fix.supabase.test.ts. Modificados (G4-04): tests/e2e-supabase/{activity,inventory,orders,quotes}.spec.ts. No se tocaron src/, migraciones, .github/ ni docs fuera de este informe. Incidente: un `git stash` accidental mio se revirtio de inmediato con `git stash pop` (estado identico, lista de stash vacia).
