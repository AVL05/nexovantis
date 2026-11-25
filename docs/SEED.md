# Seed demo (clientes y técnicos)

Scripts (no son migraciones y no se ejecutan con `supabase db reset`; `[db.seed]` está desactivado en `supabase/config.toml`):

- `supabase/seeds/demo-crm.sql`: el seed (TASK-008C; identidad estable en TASK-010).
- `supabase/seeds/reconcile-demo-crm.sql`: reconciliación de filas instaladas por la versión anterior del seed (TASK-010, A02-03). **Ejecutada en Cloud el 2026-11-25 (49 identidades; véase TASK-010B).**

## Qué crea

Solo clientes y técnicos **ficticios** en las organizaciones `Demo Norte` y `Demo Sur`:

| Organización | Clientes activos / archivados | Técnicos activos / archivados | Eventos `archived` |
| ------------ | ----------------------------- | ----------------------------- | ------------------ |
| Demo Norte   | 24 / 3                        | 6 / 2                         | 5                  |
| Demo Sur     | 8 / 2                         | 3 / 1                         | 3                  |

(Recuentos en una organización que solo contiene datos del seed.) Los archivados pasan por el trigger normal, así que el historial de actividad queda con el owner como actor. Convenciones de los datos: emails en subdominios de `example.com`; teléfonos `+34 000 …` (prefijo no asignable, no puede llamar a nadie real); notas con el prefijo `[DEMO]`; sin CIF/NIF, direcciones ni personas reales.

## Requisitos

- Migraciones aplicadas hasta `20261125090300_task010_demo_fixture_identity` (crea `private.demo_fixture_identity`).
- Las organizaciones `Demo Norte` y `Demo Sur` existen (nombre exacto, una sola vez) y cada una tiene **exactamente un `owner`** en `memberships`. Si no, el script aborta sin cambiar nada.

## Cómo ejecutarlo

Con privilegios de administración (rol `postgres`):

- SQL editor de Supabase: pegar el contenido del archivo y ejecutar.
- `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/demo-crm.sql`
- Conector de Supabase (`execute_sql`) con el contenido del archivo.

El script abre y cierra su propia transacción, y dentro actúa como el owner de cada organización (`set local role authenticated` + claims JWT), de modo que se aplican RLS, GRANT por columna y los triggers de archivado. No desactiva triggers, no usa `service_role` y no escribe en `activity_events`. Al terminar emite avisos (`RAISE NOTICE`) con los recuentos por organización y estado.

## Identidad estable de los fixtures (A02-03)

Antes la clave era organización + nombre: un usuario que renombraba un cliente o técnico demo provocaba un duplicado en la siguiente ejecución. Ahora cada fixture lleva una **clave constante** (`k`: `c01`…, `t01`…, única por organización y tipo) que no depende de ningún campo editable. Al insertar un fixture, el seed registra `(organización, tipo, clave) -> id` en `private.demo_fixture_identity`:

- Esquema `private` (no expuesto por la API), RLS activada y **sin privilegios para `anon` ni `authenticated`**: la identidad no se lee ni se escribe desde la aplicación; solo el seed y la reconciliación (administración) la escriben. `record_id` es único por tipo.
- Un fixture con identidad registrada **no se vuelve a insertar, archivar, restaurar ni actualizar**, aunque el usuario lo renombre, edite, archive o restaure.
- **Nunca cambiar una clave publicada** del seed: una clave nueva se trata como un fixture nuevo.

## Idempotencia, no destructividad y concurrencia

- Una sola transacción: un fallo no aplica nada. Sin `DELETE`, `TRUNCATE`, `DROP` ni desactivación de triggers; no modifica filas existentes. El archivado inicial solo se aplica a las filas insertadas en esa misma ejecución. Una segunda ejecución inserta 0 filas y genera 0 eventos.
- Lo primero que hace es `pg_advisory_xact_lock`: un bloqueo de **transacción** (se libera al hacer commit o rollback, sin riesgo de quedar retenido tras un fallo). Dos ejecuciones simultáneas se serializan y la segunda ve la identidad que registró la primera. La clave primaria de la tabla de identidad es la última defensa.
- **Filas sin identidad** (instaladas por la versión anterior del seed, o creadas por un usuario): un fixture sin identidad **no se inserta** si en su organización existe una fila sin identidad con su mismo nombre o con su misma firma de contacto (email + teléfono + notas). Se omite y el script avisa (`OMITIDOS …`). Así el seed nunca duplica ni altera filas ajenas. Un fixture omitido por colisión con una fila del usuario se queda sin insertar (es lo esperado); si la fila procede del seed anterior, hay que reconciliar.

## Reconciliación de filas heredadas (Cloud)

Aplica a entornos donde ya corrió la versión anterior del seed (sin identidad registrada). **Orden recomendado**: aplicar las migraciones, ejecutar la reconciliación en modo comprobación, revisar el informe con una persona, ejecutarla en modo aplicar y, solo después, volver a lanzar el seed.

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/reconcile-demo-crm.sql          # comprobación
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c "set nexovantis.reconcile_apply = 'on'" -f supabase/seeds/reconcile-demo-crm.sql      # aplicar
```

(En el SQL editor, ejecutar antes `set nexovantis.reconcile_apply = 'on';` en la misma sesión; sin esa variable es siempre comprobación.)

- Una única sentencia (atómica). Solo escribe en `private.demo_fixture_identity`; nunca toca `customers`, `technicians` ni `activity_events`. En comprobación no persiste nada.
- Criterio: para cada fixture busca, **en la misma organización y tipo**, las filas sin identidad cuya firma de contacto original (email + teléfono + notas, copiada de la versión anterior del seed) coincide exactamente. **Nunca usa el nombre actual** (es editable). Una candidata única -> asigna; ninguna -> `not_found`; varias, o una fila candidata de varios fixtures -> `ambiguous` (se informa y no se asigna).
- Informe (una fila por fixture y organización): `organization`, `entity_type`, `fixture` (nombre original), `status` (`would_map` | `mapped` | `already_mapped` | `ambiguous` | `not_found`) y `record_id`.

### Riesgos operativos

- Una fila a la que el usuario cambió email, teléfono o notas ya no es identificable: queda `not_found` y requiere decisión humana (asignarla a mano en `private.demo_fixture_identity`, o aceptar que el seed inserte un fixture nuevo si su nombre no colisiona con ninguna fila sin identidad; si colisiona, el seed lo omite).
- `ambiguous`: hay que resolverlo a mano antes de asignar (por ejemplo archivando el duplicado y asignando el otro). Mientras tanto el seed omite ese fixture por colisión de nombre.
- No ejecutar la reconciliación a la vez que el seed ni dos reconciliaciones en paralelo (la restricción única haría fallar a una, sin dejar cambios).
- No hay borrado en el seed ni en la reconciliación; deshacer una asignación implica `DELETE` manual en `private.demo_fixture_identity`, con decisión humana.
- No se ha ejecutado nada en Cloud: ver las verificaciones previas en [SUPABASE_CLOUD.md](SUPABASE_CLOUD.md).

## Qué no hace

Sin órdenes, presupuestos ni inventario; no crea usuarios ni membresías; no modifica el esquema.

## Verificación (solo lectura, como administrador)

```sql
select o.name,
  (select count(*) from public.customers c where c.organization_id = o.id and c.archived_at is null)     as clientes_activos,
  (select count(*) from public.customers c where c.organization_id = o.id and c.archived_at is not null) as clientes_archivados,
  (select count(*) from public.technicians t where t.organization_id = o.id and t.archived_at is null)     as tecnicos_activos,
  (select count(*) from public.technicians t where t.organization_id = o.id and t.archived_at is not null) as tecnicos_archivados,
  (select count(*) from public.activity_events e where e.organization_id = o.id and e.action = 'archived') as eventos_archived,
  (select count(*) from private.demo_fixture_identity i where i.organization_id = o.id)                   as fixtures_con_identidad
from public.organizations o
where o.name in ('Demo Norte', 'Demo Sur')
order by o.name;
```

Aislamiento: iniciar sesión en la aplicación como `owner.norte@example.com` (solo debe ver clientes y técnicos de Demo Norte) y como `owner.sur@example.com` (solo Demo Sur). Las pruebas `tests/integration/seed-demo.test.ts` y las independientes `seed-identity` y `seed-reconcile` lo comprueban en PGlite.

## Cómo deshacerlo

No hay borrado: la aplicación no borra datos (BR02) y `activity_events` es inmutable, por lo que el historial del seed permanece. Los datos demo se **archivan** desde la aplicación (el owner puede archivarlos), no se eliminan. Un registro archivado es de solo lectura hasta que se restaura. Un borrado físico solo procedería por decisión humana expresa y fuera de estos scripts.
