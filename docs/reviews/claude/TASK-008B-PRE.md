# TASK-008B-PRE — Archivar y restaurar con evento (DH-06)

- Fase: PRE (tarea crítica). Modelo/esfuerzo: solicitado Sonnet, high; efectivo no verificable.
- Rama `feat/supabase-auth`, HEAD `50dd257`. Git antes: limpio. Después: `M` archived-freeze.test.ts, `M` rls.test.ts, `??` archive-restore.test.ts, `??` tests/integration/supabase/independent/ (1 archivo) y este informe. Sin commit.
- Entorno: Windows, PGlite (`pnpm test:integration`). No se ejecutó Supabase local (no hay stack).
- Veredicto de fase: no aplica PASS/FAIL de implementación; PRE entrega criterios y pruebas que hoy fallan por ausencia de la funcionalidad.

## Criterios verificables

Ámbito: P = PGlite (`tests/integration/independent/archive-restore.test.ts`); S = job `supabase` de CI (`tests/integration/supabase/independent/archive-restore.supabase.test.ts`, incluido por `vitest.supabase.config.mts` vía `tests/integration/supabase/**/*.test.ts`; sin tocar configs).

| ID | Criterio | Ámbito |
|---|---|---|
| C-01 | Owner y member archivan cliente/técnico de su organización; se crea 1 evento `archived` con organization_id de la fila, actor_id = auth.uid(), entity_type/entity_id correctos | P |
| C-02 | TC-ARCH-05 / TC-TEAM-11: owner y member restauran (`archived_at` nulo); evento `restored`; el registro vuelve a ser editable sin más eventos | P |
| C-03 | Ciclo archivar-restaurar-archivar: 3 eventos en orden, cada uno con su actor | P |
| C-04 | `archived_at` lo fija el servidor (= now()) ignorando fecha pasada o futura enviada; `occurred_at` cercano a now() | P, S |
| C-05/06 | Un evento por fila archivada, también con otros campos en la misma sentencia o varias filas | P |
| C-07 | Sin cambio de `archived_at` (otros campos, mismo valor, no archivado) no hay evento | P |
| C-08 | Archivado -> otra fecha no nula: 23000 para owner, member y superusuario; sin evento ni cambio | P, S |
| C-09/10 | Sin auth.uid() (superusuario sin JWT, claims sin sub, service_role) archivar o restaurar da 23000, sin cambio ni evento; ediciones sin cambio de `archived_at` siguen permitidas | P, S (service_role) |
| C-11 | Otra organización no archiva ni restaura (0 filas, sin evento), en ambos sentidos | P, S |
| C-12 | anon no archiva ni restaura (42501) | P |
| C-13/14 | SELECT de eventos solo para miembros de la organización; anon 42501; sin membresía 0 filas; al perder la membresía se pierde lectura y restauración | P, S |
| C-15/16 | authenticated y anon no insertan eventos (propios, de otra org, actor ajeno, default values): 42501 | P, S |
| C-17 | authenticated no actualiza, borra ni trunca eventos (42501) | P, S |
| C-18 | Con privilegios de administración UPDATE y DELETE sobre eventos dan 23000; evento intacto | P |
| C-19 | Borrado de la fila de origen sigue vedado a authenticated y los eventos persisten | P |
| C-20 | Columnas exactas (7), todas NOT NULL; sin PII; solo `action` y `entity_type` son text | P |
| C-21 | CHECK de entity_type y action (23514), NOT NULL (23502), FK a organizations (23503) | P |
| C-22 | RLS activada; solo políticas SELECT; authenticated solo SELECT; anon sin privilegios; sin privilegios de columna de escritura | P |
| C-23 | El evento no contiene nombre, email, teléfono ni notas del registro | P |
| C-24 | Toda función que inserta en activity_events: SECURITY DEFINER, `search_path` vacío, esquema `private` | P |
| C-25 | Ninguna función que referencie activity_events es ejecutable por public, anon ni authenticated (ver F-01) | P |
| C-26 | authenticated no puede invocar esas funciones (42501) | P |
| C-27 | Triggers BEFORE UPDATE FOR EACH ROW sobre `archived_at` en ambas tablas; se conservan los de organization_id y updated_at, todos habilitados | P |
| C-28 | Atomicidad: si falla el INSERT del evento (trigger de fallo simulado) se revierte archivar y restaurar; rollback externo no deja evento; sentencia multifila con una fila rechazada no deja eventos parciales | P |
| C-29 | GRANT de columna: sin UPDATE sobre id, organization_id, created_at, updated_at; sí sobre archived_at; cambio de organización sigue en 23000 para superusuario | P |
| C-30 | Sin INSERT con `archived_at`, sin DELETE; insertar filas normales no genera eventos | P |
| C-31..C-34 | Equivalentes con PostgREST y JWT reales: archivar/restaurar con actor del JWT, fecha de servidor, 23000 al reescribir, aislamiento, lectura por org, escritura de eventos denegada (42501), no hay RPC pública, service_role sin sub no archiva | S |

Solo verificable en el job supabase (PostgREST, GoTrue, exposición de esquemas, claims reales de service_role): C-31..C-34 y la afirmación "private no expuesto". Los tests S no se han podido ejecutar aquí; sólo pasan tsc y eslint (limpios).

## Aserciones cambiadas (archived-freeze.test.ts, mío) y rls.test.ts (mío)

| Archivo | Antes | Ahora | Motivo |
|---|---|---|---|
| archived-freeze | archivar con fecha fija conserva `2026-01-01` | la fecha enviada se ignora; `archived_at = now()` | diseño: la fija el servidor |
| archived-freeze | valor `null` en la lista de reescrituras rechazadas con 23000 (member, owner, su) | retirado de la lista; nuevo caso "restaurar permitido" para owner y member, y re-archivado | DH-06 |
| archived-freeze | "mismo archived_at" con parámetro `FIXED` | `set archived_at = archived_at` | la fecha ya no es controlable; sigue comprobando el no-op |
| archived-freeze | — | nuevo: superusuario sin actor no archiva ni restaura (23000) | diseño: actor nunca nulo |
| archived-freeze | `private.prevent_unarchive()` no ejecutable | todas las funciones de trigger de customers/technicians no ejecutables (42501), >= 3 | puede cambiar el nombre; el control no se debilita |
| rls.test.ts F3-31 | cada actor no restaura (23000), preparación archivando con superusuario | cada actor restaura con éxito; preparación archivando como owner; nuevo caso: no se restaura una fila de otra organización | DH-06 y actor obligatorio |

No se relajó ninguna otra aserción; no hay `.skip/.only/.todo`.

## Ejecución (`pnpm test:integration`)

- Antes del cambio: verde (suite existente).
- Ahora: 5 archivos, 210 tests: 149 pasan, 61 fallan (esperado, la migración no existe).
  - archive-restore.test.ts: 51 fallan; pasan solo C-29 (2 casos, guardas de regresión).
  - archived-freeze.test.ts: 6 fallan (archivar con fecha de servidor, restaurar, sin actor; x2 tablas), 7 pasan.
  - rls.test.ts: 4 fallan (F3-31 restaurar); el resto pasa. rls-extra y constraints verdes hoy.
- `tsc --noEmit` y `eslint tests/integration`: sin errores.

## Hallazgos para Orchestrator

| ID | Gravedad | Detalle | Acción propuesta |
|---|---|---|---|
| F-01 | Medium | Si el trigger es SECURITY INVOKER y llama a una función SECURITY DEFINER con parámetros, authenticated necesita EXECUTE sobre ella y podría falsificar eventos (actor, acción, organización) invocándola directamente. C-25/C-26 exigen que no exista EXECUTE | Que la propia función de trigger sea SECURITY DEFINER (search_path vacío) e inserte con valores derivados de NEW y auth.uid(), sin función auxiliar parametrizada ejecutable |
| F-02 | High (bloqueante de integración) | Fuera de mi alcance y rotas por el diseño: `tests/integration/constraints.test.ts` l.119-156 (restaurar rechazado; archivar con superusuario sin actor; fecha fija conservada) y `tests/integration/supabase/rls.supabase.test.ts` l.327-351 (restaurar bloqueado). Hoy pasan; fallarán tras la migración | Incluirlas en el handoff de Develop para que las actualice conforme a C-xx. Si prefiere que las modifique yo, requiere ampliar mi alcance |
| F-03 | Medium | `rls-extra.test.ts` l.44 espera `private.prevent_unarchive()` con 42501. Si Develop renombra o elimina la función dará 42883 | Mantener el nombre `prevent_unarchive` (basta CREATE OR REPLACE en migración nueva) o pedirme actualizar esa prueba |
| F-04 | Low | El trigger de inmutabilidad es por fila: TRUNCATE por administración lo elude (authenticated no tiene el privilegio) | Opcional: trigger BEFORE TRUNCATE; no probado |
| F-05 | Low | Con sesión de administración y claims falsificados (`sub` de un usuario ajeno) el actor registrado es ese sub sin validar membresía. No alcanzable vía PostgREST (service_role no lleva sub de usuario) | Aceptar y documentar |
| F-06 | Informational | `organization_id` con FK: con ON DELETE CASCADE el borrado de una organización chocaría con el trigger de inmutabilidad (23000). `entity_id` sin FK (polimórfico), correcto para historial. Definir ON DELETE RESTRICT o dejarlo explícito | Decisión de diseño |
| F-07 | Informational | `entity_type` limitado a customer/technician y `action` a archived/restored: DH-08 pendiente exigirá ampliar los CHECK; no se resuelve aquí | Registrar |
| F-08 | Informational | Scripts de semilla o mantenimiento que archiven con service_role/superusuario sin JWT quedarán rechazados por diseño (C-09) | Revisar `supabase/seed.sql` si existe |

## Pendiente

Validación efectiva: C-01..C-30 se ejecutan en PGlite cuando exista la migración; C-31..C-34 en CI. Nada verificado en Supabase real. POST de TASK-008B debe repetir `git diff --name-only` sobre `tests/**/independent/**`.
