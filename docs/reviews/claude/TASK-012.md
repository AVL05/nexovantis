# TASK-012 — F5 Presupuestos — Testing POST independiente

- Fecha: 2026-11-25. Agente: Testing (Sonnet 5.5; esfuerzo efectivo no observable).
- SHA base: 4657bd7674ee9ffca09b8565cda7190965c99e6c (rama feat/quotes). Cambios SIN commit en el árbol (diff real + archivos no rastreados revisados).
- Entorno: Windows 11, Node + Vitest 5.1.1, PGlite 0.5.17 (PostgreSQL in-process, migraciones reales + shim de auth). No hay Docker, psql, PostgreSQL ni Supabase CLI; WSL sin distribuciones. Sin acceso a Cloud (no se escribió nada).

## Veredicto: BLOCKED

Todos los criterios ejecutables se verificaron y se superaron. Un criterio aplicable no se puede ejecutar aquí: **concurrencia real** (>=10 aceptaciones en paralelo y carrera aceptar/rechazar). PGlite usa una sola conexión, así que no hay concurrencia real. BLOCKED no es PASS. El caso ya existe, listo para CI, en `tests/e2e-supabase/quotes.spec.ts` (líneas 244 y 306: N=10 en paralelo, 1 orden, orden enlazada, eventos `created`/`accepted`; carrera aceptar/rechazar con estado final coherente). Se necesita evidencia de CI sobre el SHA objetivo. Por revisión de código, `accept_quote` y `reject_quote` serializan con `SELECT ... FOR UPDATE` y releen el estado tras el bloqueo (READ COMMITTED), y `quotes_order_id_key` UNIQUE es la red de seguridad; no es evidencia ejecutada.

Pasaría a PASS con: CI verde (job supabase / e2e-supabase) para esos dos casos en el SHA objetivo, y decisión humana registrada sobre el hallazgo M-1.

## Comprobación Git (AGENT_WORKFLOW)
- Inicio: HEAD 4657bd7; modificados: docs/SEED.md, NavList.tsx, auth/routes.ts, navigation/items.ts, tests/unit/crm-routes.test.ts; sin rastrear: src/app/quotes, src/features/quotes, migración 20261127090000, seed demo-quotes.sql, tests quotes-*, e2e-supabase/quotes.spec.ts.
- Final: igual más mis dos cambios (abajo). HEAD sin cambios; sin stage, commit ni push.
- Prohibidos intactos: no hay cambios en `.claude/**`, CLAUDE.md, AGENTS.md, package.json/lockfiles, `.github/`, docs normativos (BUSINESS_RULES, TESTING_GUIDELINES…). Develop no modificó nada en `tests/acceptance/**` ni `tests/**/independent/**` (única modificación de independent es la mía). Sin `.skip/.only/.todo/xit/xtest/fixme` en pruebas nuevas ni modificadas. Aserciones de Develop no relajadas (crm-routes solo añade casos).
- Nota: BR05 ya existe en docs/BUSINESS_RULES.md (sin cambios del diff).

## Ejecución (comandos y resultados reales)
| Comando | Resultado |
|---|---|
| `vitest run -c vitest.integration.config.mts` quotes-calc + quotes-db + quotes-seed (Develop) | 3 ficheros, 75 tests PASS |
| mismo config, `tests/integration/independent/quotes-post.test.ts` (mío, nuevo) | 52 tests PASS (127 con los de Develop) |
| `vitest run` app-shell-a11y.test.tsx + crm-routes.test.ts | 36 PASS |
| `npm run typecheck` | OK (sin errores) |
| `eslint` sobre quotes, app/quotes, tests quotes y a11y, `--max-warnings=0` | OK |
| `prettier --check src tests` | 1 aviso: `tests/unit/crm-routes.test.ts` (ver L-1) |
No se ejecutó suite completa, ni Playwright (UI/e2e-supabase), ni Cloud.

## Criterios verificados (PASS)
- Cálculo exacto (19 casos tabulados + límites): half-up en 0,5 exacto y por debajo, 0/10/21 % y tipos no estándar, cantidad 0,001 a 100000, 3 decimales, redondeo SOLO por línea (3x3 c al 21 % da IVA 3, no 2), mezcla de tipos con edición/borrado, máximos (10^13 por línea; 100 conceptos = 2x10^15 < 2^53), concepto 101 rechazado (NX015), rechazos 23514 (cantidad 0/negativa/>100000/4 decimales, precio negativo/>máx, IVA <0/>10000), IVA nulo = 2100. Sin tipos real/double en tablas; importes `bigint`. Los totales no se pueden fijar ni por SQL de administración (el trigger los sobrescribe). Sin float en TS/SQL (grep: solo `Number(...)` de conversión a entero seguro tras BigInt; sin parseFloat/toFixed).
- RLS: B no lee presupuestos/conceptos de A; todas las RPC de B sobre objetos de A devuelven NX010/NX014/false sin efectos; cliente de otra organización en alta/edición (NX013); reutilizar id ajeno (23505); por SQL de administración, cliente ajeno bloqueado por FK compuesta y orden de otra organización o de otro cliente bloqueada (23503); usuarios sin DML directo (42501) ni acceso a `private.quote_counters`; anon sin lectura ni ejecución; sin sesión no hay RPC.
- Hardening: todas las funciones `quote*` (public y private): ACL explícita, sin EXECUTE a PUBLIC ni anon, SECURITY DEFINER con `search_path=""`; las 7 RPC y wrappers ejecutables por authenticated; las funciones de trigger no.
- Solo borrador editable también en BD: aceptado y rechazado rechazan (NX011) RPC y SQL de administración sobre presupuesto y conceptos (insert/update/delete), y transiciones ilegales; no se borra ni se vacía (TRUNCATE/DELETE rechazados), número inmutable, alta solo en borrador (NX012).
- Aceptación: una sola orden coherente (cliente, título, estado pendiente, sin técnico, org correcta, importe en la descripción), idempotente (2 miembros y 12 reintentos: 1 orden, 1 evento), UNIQUE quote-orden efectivo, rollback total con cliente archivado (NX002: presupuesto sigue en borrador, sin orden ni evento; tras restaurar se acepta), aceptar rechazado y rechazar aceptado dan NX012 sin efectos, rechazar dos veces devuelve false sin evento extra, otra organización NX010.
- Eventos: `created`/`accepted`/`rejected` con actor = usuario, `seq` no nulo y creciente; sin actor no se escribe nada.
- Numeración por organización sin huecos; alta idempotente por id; alta fallida no consume número; cliente archivado rechazado.
- Seed: pruebas de Develop (idempotencia, guardas) pasan; revisión del SQL: una transacción con advisory lock, actúa como owner vía RPC, sin DELETE/TRUNCATE/DROP, sin `service_role`, no ejecutado en Cloud.
- Rutas protegidas: `/quotes`, `/quotes/new`, mayúsculas, codificadas y `//` protegidas; `/quote`, `/quotesx` no (crm-routes).
- UI (revisión estática, no renderizada): acciones solo Aceptar/Rechazar con confirmación y solo en borrador; sin PDF, facturación, inventario ni botones ficticios (grep).
- No regresión F3/F4 en lo ejecutado dirigido (a11y, crm-routes, work-orders vía accept). Regresión completa: pendiente en CI.

## Prueba independiente actualizada (aprobación registrada)
`tests/unit/independent/app-shell-a11y.test.tsx`: la navegación esperada pasa de 4 a 5 enlaces (`/quotes`, "Presupuestos"). Justificación: el alcance aprobado de F5 activa Presupuestos en la navegación, igual que TASK-011 con `/orders`. Es una actualización de expectativa por cambio de alcance aprobado, no un relajamiento: se añaden aserciones (enlace "Presupuestos" con href) y se mantiene el resto. Aprobado por Testing (propietario).

## Decisiones de Develop evaluadas
- (a) Importe como texto en la descripción de la orden: aceptable (Informational). El presupuesto aceptado es inmutable y fuente de verdad; la descripción de la orden puede editarse y desalinearse, sin impacto contable. Longitud acotada (<= 2000, probado).
- (b) Sin FK `order_id` hacia work_orders: aceptable (Informational). Equivalente probado por trigger (orden existe, misma org y mismo cliente: 23503), UNIQUE y órdenes inborrables.
- (c) Presupuesto vacío: ver M-1.
- (d) Cliente editable en borrador: aceptable (Informational). Validado en BD (activo, misma org) y reválida en aceptación.

## Hallazgos
- **M-1 (Medium)**: un presupuesto sin conceptos se puede aceptar y genera una orden "Importe total 0,00 EUR" (`private.accept_quote`, migración líneas ~635-672; caso `HALLAZGO (c)` en quotes-post.test.ts). No incumple un criterio aprobado explícito (BR05 no exige conceptos), por eso no es FAIL, pero casi seguro no es la intención de negocio. Recomendación: rechazar la aceptación con error de dominio controlado si no hay conceptos (o total 0). Si Develop lo cambia, invertir esa aserción (es mía). Si se acepta tal cual, requiere aceptación humana explícita y registrada.
- **L-1 (Low)**: `tests/unit/crm-routes.test.ts` no pasa `prettier --check` (el `it.each` con 8 elementos supera el ancho); `format:check` fallaría en CI. Reproducción: `npx prettier --check tests`. Develop debe ejecutar `prettier --write` sobre ese archivo.
- **I-1 (Informational)**: `TRUNCATE public.quotes` es rechazado, pero posiblemente con 0A000 (FK de `quote_items`) y no con 23000; no hay impacto de seguridad. Mi prueba solo exige que falle.

## Archivos míos
- Nuevo: `tests/integration/independent/quotes-post.test.ts` (52 tests).
- Modificado: `tests/unit/independent/app-shell-a11y.test.tsx` (+5/-1 líneas; prettier aplicado).
- Este registro: `docs/reviews/claude/TASK-012.md`.

## Pendiente
1. Evidencia de CI sobre el SHA objetivo: concurrencia real (e2e-supabase quotes.spec.ts) y regresión completa (incluye Playwright/UI).
2. Decisión sobre M-1 y corrección de L-1.
3. Un RETEST dirigido tras los cambios de Develop.

---

# RETEST dirigido (2026-11-25)

Veredicto: **PASS local; concurrencia real pendiente de CI (BLOCKED solo para ese criterio)**. Según TESTING_GUIDELINES, el veredicto global no pasa a PASS pleno hasta que CI (job supabase / e2e-supabase, `quotes.spec.ts`: N=10 aceptaciones en paralelo y carrera aceptar/rechazar) y la regresión completa den verde sobre el SHA objetivo. Sigue sin ser ejecutable aquí: PGlite usa una sola conexión. No es evidencia ejecutada por mí.

## Git (AGENT_WORKFLOW)
Antes y después: HEAD 4657bd7, misma lista de modificados/sin rastrear (16 entradas); sin stage/commit/push. Mi única modificación en este retest: `tests/integration/independent/quotes-post.test.ts`, más esta sección. No toqué src/ ni migraciones. Sin `.skip/.only/.todo/xit/xtest/fixme` en pruebas de quotes ni crm-routes. En `tests/unit/crm-routes.test.ts` el diff solo añade casos (`/quotes`, `/quotes/new`, `/Quotes/aaaa`, `/%71uotes`, `//quotes/`, `/quote`, `/quotesx`) y reformatea el `it.each` sin cambiar aserciones.

## M-1 (resuelto)
Revisión de `private.accept_quote` (migración ~659-665): el chequeo NX016 va DESPUÉS de las ramas `accepted` (devuelve la misma orden) y `rejected` (NX012), y ANTES de `create_work_order`, por lo que no rompe idempotencia ni NX012, y todo sigue en una transacción (rollback intacto). Mapeo NX016 presente en `service.ts`; UI deshabilita Aceptar con motivo (revisión estática, no renderizada).
Pruebas mías (`quotes-post.test.ts`): la aserción "HALLAZGO (c)" invertida a: vacío => NX016, sin orden nueva, sigue en borrador (`order_id`/`decided_by` nulos), sin eventos nuevos, y tras añadir un concepto se acepta con una sola orden (descripción con 12,10 EUR). Añadidos: NX016 no altera idempotencia de aceptados (misma orden, sin orden extra; un aceptado sigue sin poder vaciarse, NX011) ni NX012 de rechazados vacíos; y rollback con cliente archivado y concepto => NX002 sin orden, borrador y sin evento. Aprobación de modificar la prueba independiente: la registro yo (propietario), por cambio de regla de negocio aplicado por Develop.
Además Develop añadió casos en `quotes-db.test.ts` (línea 493) y `quotes.spec.ts` (línea 329, carrera con concepto añadido).

## Ejecución (resultados reales)
| Comando | Resultado |
|---|---|
| `vitest run -c vitest.integration.config.mts` quotes-calc, quotes-db, quotes-seed, independent/quotes-post | 4 ficheros, 129 tests PASS |
| `vitest run tests/unit` (incluye navegación, rutas, a11y) | 840 PASS |
| `prettier --check src tests docs/SEED.md supabase` | OK (L-1 resuelto) |
| `eslint` sobre quotes, auth, navigation, shell, tests/integration, tests/unit, tests/e2e-supabase, `--max-warnings=0` | OK, exit 0 |
| `npm run typecheck` | OK, exit 0 |
No se ejecutó suite completa, Playwright, e2e-supabase ni Cloud.

## Hallazgos
- M-1: cerrado. L-1: cerrado.
- I-1 (Informational, reevaluado): `TRUNCATE public.quotes` sigue siendo rechazado (mi prueba exige solo el fallo); el código exacto (posiblemente 0A000 por la FK de `quote_items`) no afecta a seguridad ni a criterios. Sin acción; sin aceptación humana requerida más allá del registro.

## Pendiente
1. CI sobre el SHA objetivo: concurrencia real (e2e-supabase quotes.spec.ts) y regresión completa.

## Cierre Orchestrator (2026-11-25): CI, Cloud y revisión visual

Autor: Orchestrator, con autorización humana expresa (CI 45636395225 verde sobre `0699277`; aceptadas las observaciones de Testing: no aceptar presupuestos vacíos, importe de la orden como texto, código de error de TRUNCATE sin impacto).

**Cloud (proyecto `nexovantis`, solo este proyecto):**
- `list_migrations`: 12/12 migraciones, incluida `20261127090000_task012_quotes`. Tablas `quotes` y `quote_items` y 8 funciones de RPC presentes.
- Precondiciones de docs/SEED.md (solo lectura): `Demo Norte` y `Demo Sur` existen una vez, 1 `owner` cada una, clientes demo con identidad (27 y 10), 15 y 7 órdenes de F4, 0 presupuestos.
- `supabase/seeds/demo-quotes.sql` ejecutado tal cual (primera ejecución): 11 presupuestos (Norte 3 borrador / 3 aceptados / 2 rechazados; Sur 1 / 1 / 1), 11 identidades, órdenes 22 → 26 (4 generadas por aceptación: Norte 18, Sur 8), eventos de presupuesto created 11 / accepted 4 / rejected 3, 0 eventos sin actor, 0 aceptados sin orden, 0 órdenes duplicadas.
- Segunda ejecución del mismo script: sin cambios (11 presupuestos, 11 identidades, 26 órdenes, mismos eventos). Idempotente.
- Recálculo independiente en SQL (half-up por línea, enteros): 25 líneas, 0 diferencias de subtotal/IVA; 0 totales de presupuesto incoherentes. Comprobación manual de PRE-0006: 4×112,50 + 5,25×42,00 = 670,50 € + 10 % = 737,55 €, coincide con la lista.
- No se escribió nada más en Cloud.

**Revisión visual (Premium Frontend Director, solo lectura, servidor de desarrollo ya activo en :3000 con sesión de Demo Norte):**
- PASS (1440 px): listado de 8 presupuestos con estados Borrador/Aceptado/Rechazado diferenciados, filtros y totales en euros con formato es-ES; formulario de alta.
- NOT RUN: detalle, conceptos y totales, estados terminales en detalle, edición y responsive 375/768. El servidor de desarrollo devolvió 500 («Jest worker encountered 2 child process exceptions») en 8/8 detalles de presupuestos y también en 2/3 detalles de órdenes de F4 en la misma ráfaga, y se repitió tras un reintento secuencial. Sugiere inestabilidad del worker del servidor de desarrollo, no un fallo específico de F5, pero no está demostrado; no se leyeron los logs del servidor. Pendiente de repetir con un servidor reiniciado.
- Dashboard: F5 no añadió indicadores de presupuestos al panel (no hay referencias a presupuestos en el código del dashboard); no hay coherencia que comprobar. Los presupuestos no cuentan en las órdenes del panel salvo las 4 órdenes generadas, que son órdenes pendientes normales.
