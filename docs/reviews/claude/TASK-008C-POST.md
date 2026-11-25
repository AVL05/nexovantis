# TASK-008C-POST (Testing, revisión pre-aplicación del seed demo)

- Fase: POST, tarea estándar. Rama `feat/supabase-auth`, HEAD `3617d58` (cambios sin commitear). Modelo/esfuerzo: Sonnet, medium solicitado; efectivo autoinformado, no verificable por CLI.
- Estado Git antes/después: sin cambios por mi parte salvo este informe. Pendientes de commit: `supabase/seeds/demo-crm.sql`, `tests/integration/seed-demo.test.ts`, `docs/SEED.md` (??); `docs/SUPABASE_CLOUD.md`, `docs/STATUS.md`, `docs/reviews/claude/TASK-008B.md` (M, fuera de mi revisión). Ningún archivo de `src/`, migraciones, `tests/acceptance` ni `independent/` modificado.
- Entorno: PGlite local con migraciones reales y shim de Supabase. No se tocó Cloud.

## Veredicto: PASS (revisión pre-aplicación)

Pendiente, no bloqueante de esta revisión: la aplicación en Supabase Cloud y su verificación posterior (Orchestrator).

## Comandos

| Comando                                                                                           | Exit | Resultado                                |
| ------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------- |
| `pnpm exec vitest run -c vitest.integration.config.mts tests/integration/seed-demo.test.ts`       | 0    | 1 archivo, 13/13 pruebas                 |
| `pnpm format:check` / `pnpm lint` / `pnpm typecheck`                                              | 0    | Limpios                                  |

## 1. Revisión estática del SQL (superada)

- Una transacción (`begin`/`commit`) con un único bloque `DO`. Resolución por nombre exacto con `raise exception` si hay 0 o 2 organizaciones y si hay 0 o 2 owners. Los abortos se comprueban en ambas organizaciones antes de escribir nada en esa iteración, y el rollback global cubre la atomicidad (probado).
- Actúa como owner con `set_config('request.jwt.claims', ..., true)` y `set local role authenticated`. Después de cada organización hace `reset role`, y al final vacía los claims.
- Sin `service_role`, `session_replication_role`, `DISABLE TRIGGER`, `DELETE`/`TRUNCATE`, inserts en `activity_events` ni `archived_at` explícito de fecha fija (usa `now()`, que el trigger sobrescribe). Sin UUID, secretos, CIF/NIF ni direcciones (grep).
- Todos los INSERT/UPDATE quedan dentro de las columnas con GRANT. Las filas ajenas no se tocan: la clave es organización + nombre, y solo se actualiza `archived_at` de las designadas.
- Recuentos: 27 clientes (24+3) y 8 técnicos (6+2) en Norte, 10 (8+2) y 4 (3+1) en Sur. Nombres sin duplicados (grep y prueba), sin solapamiento Norte/Sur. Emails solo `*.example.com`, únicos. Teléfonos `+34 000 ...` únicos. Longitudes muy por debajo de los CHECK (200/254/40/2000).
- Datos genéricos y plausibles para mantenimiento y servicios técnicos en España; no he detectado entidades reales reconocibles.

## 2. Riesgo en Supabase real

- `auth.uid()` de Supabase lee `request.jwt.claims`->>'sub' (y el claim legado `request.jwt.claim.sub`). El shim hace lo mismo, así que el comportamiento coincide.
- `set local role authenticated` desde `postgres`: en Supabase `postgres` es miembro de `authenticated`, por lo que el cambio de rol está permitido y no hace falta superusuario. Es el patrón habitual de las pruebas RLS. Dentro de un `DO` no `SECURITY DEFINER` se permite `SET ROLE` y `RESET ROLE`. Las funciones privadas del RLS ya las usa `authenticated` desde la aplicación.
- Diferencia relevante PGlite/Supabase (Informational): PGlite ejecuta como superusuario y el shim crea los roles. La pertenencia de `postgres` a `authenticated` solo se confirma en Cloud. Si falla, el error es `permission denied to set role` y la transacción se revierte sin dejar datos.
- Conector o SQL editor: si el conector envuelve la ejecución en su propia transacción, el `begin` emitirá un aviso ("already a transaction in progress") y el `commit` cerrará la del conector. Es inocuo, pero conviene saberlo. `RAISE NOTICE` puede no devolverse por `execute_sql`, así que hay que verificar con la consulta de recuentos de `docs/SEED.md`. Recomiendo añadir esta consulta de actor:

```sql
select o.name, e.entity_type, count(*) as n, count(distinct e.actor_id) as actores,
       bool_and(m.role = 'owner') as actor_es_owner
from public.activity_events e
join public.organizations o on o.id = e.organization_id
left join public.memberships m on m.organization_id = e.organization_id and m.user_id = e.actor_id
where o.name in ('Demo Norte','Demo Sur') and e.action = 'archived'
group by 1, 2 order by 1, 2;
```

Esperado: Norte customer 3 y technician 2, Sur customer 2 y technician 1, un solo actor y `actor_es_owner` en true. Si la organización ya tenía datos reales, los recuentos de clientes pueden superar lo esperado: la consulta de `SEED.md` no distingue datos del seed.

## 3. Prueba de integración (superada)

Lee el archivo real del seed y las migraciones reales. Cubre recuentos exactos, actor owner y entidades de los eventos, coincidencia `archived_at` = `occurred_at` (trigger), ausencia de `restored`, formato ficticio, unicidad, idempotencia (snapshot completo idéntico y mismos ids de eventos), registro ajeno intacto, aislamiento RLS con owner y member, restauración de rol y claims, y cuatro abortos (0 y 2 organizaciones, 0 y 2 owners) con comprobación de que no se escribió nada. No es tautológica. Huecos menores no bloqueantes: no hay caso de re-ejecución tras restaurar un registro (ver H-1) y no hay caso de organización con datos previos del mismo nombre. No añadí pruebas independientes: el valor marginal es bajo.

## 4. docs/SEED.md

Breve, correcto y reutilizable. Incluye consulta de recuentos y la advertencia sobre restaurados. Mejoras opcionales: añadir la consulta de actor anterior y una consulta de aislamiento por SQL (hoy solo se propone iniciar sesión).

## Hallazgos

| ID  | Gravedad | Ubicación                                           | Descripción                                                                                                                                                                                                                                                                                                       | Estado   |
| --- | -------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| H-1 | Low      | `supabase/seeds/demo-crm.sql:129-132, 143-146`      | Re-ejecutar vuelve a archivar un registro designado que un usuario restauró. Esto revierte una decisión humana y genera un nuevo evento `archived` con el owner como actor, que no lo hizo. Es aceptable para un seed de demostración que se ejecuta una vez por entorno y está documentado en SEED.md. Mitigación barata si se desea: no re-archivar cuando exista un evento `restored` para la entidad (se puede leer como owner, `activity_events` tiene SELECT). | Aceptación humana registrada pendiente |
| H-2 | Informational | `docs/SEED.md`                                  | Faltan la consulta de actor y la de aislamiento por SQL. El conector puede no mostrar los `RAISE NOTICE`.                                                                                                                                                                                                         | Opcional |

## Checks no ejecutados

Ejecución real en Supabase Cloud (membresía de `postgres` en `authenticated`, comportamiento del conector, recuentos finales): validación efectiva pendiente, a cargo de Orchestrator tras aplicar. Regresión completa: no solicitada.
