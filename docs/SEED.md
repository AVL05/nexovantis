# Datos de demostración

## Preparación local

El stack de CI deshabilita Studio. Para preparar la demo con el panel local, habilítalo en una copia temporal de la configuración. Desde la raíz del repositorio, con Docker iniciado y los puertos 54321–54323 libres, ejecuta en PowerShell:

```powershell
$demoWorkspace = Join-Path ([IO.Path]::GetTempPath()) ("nexovantis-demo-" + [guid]::NewGuid())
$demoSupabaseDir = Join-Path $demoWorkspace 'supabase'
New-Item -ItemType Directory -Force -Path $demoSupabaseDir | Out-Null
Copy-Item -LiteralPath 'supabase/migrations' -Destination $demoSupabaseDir -Recurse
$demoConfig = (Get-Content -Raw 'supabase/config.toml').
  Replace('project_id = "nexovantis"', 'project_id = "nexovantis-demo"')
$demoConfig = $demoConfig -replace '(?m)(\[studio\]\r?\n)enabled = false', '${1}enabled = true'
Set-Content -LiteralPath (Join-Path $demoSupabaseDir 'config.toml') -Value $demoConfig
supabase start --workdir $demoWorkspace
```

El arranque aplica las migraciones. Abre Studio en `http://127.0.0.1:54323`. En **Authentication → Users**, crea dos usuarios ficticios confirmados y guarda sus contraseñas localmente. Copia sus UUID y ejecuta este SQL en el **SQL Editor** del proyecto local vacío, sustituyendo ambos marcadores. [Configuración de Studio](https://supabase.com/docs/guides/local-development/cli/config).

```sql
with demo_orgs as (
  insert into public.organizations (name)
  values ('Demo Norte'), ('Demo Sur')
  returning id, name
)
insert into public.memberships (organization_id, user_id, role)
select id, demo_users.user_id, 'owner'
from demo_orgs
join (values
  ('Demo Norte', '<uuid-usuario-norte>'::uuid),
  ('Demo Sur', '<uuid-usuario-sur>'::uuid)
) as demo_users (name, user_id) using (name);
```

Ejecuta los archivos de `supabase/seeds/` en este orden desde el SQL Editor local: `demo-crm.sql`, `demo-orders.sql`, `demo-quotes.sql` y `demo-inventory.sql`. Usa los valores públicos del stack local para configurar la app. Al terminar, puedes detenerlo con `supabase stop --workdir $demoWorkspace`.

## Scripts y datos de clientes y técnicos

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

`demo-crm.sql` no crea órdenes (las órdenes demo tienen su propio script, más abajo), presupuestos ni inventario; no crea usuarios ni membresías; no modifica el esquema.

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

## Órdenes demo (TASK-011, F4)

`supabase/seeds/demo-orders.sql` crea órdenes de servicio **ficticias** (descripciones con el prefijo `[DEMO]`) para `Demo Norte` y `Demo Sur`. Verificado en PGlite (`tests/integration/seed-orders.test.ts`) y ejecutado en Cloud con autorización humana (22 órdenes y segunda ejecución idempotente). [TASK-011](reviews/claude/TASK-011.md).

- **Requisitos**: migración `20261126090000_task011_work_orders` aplicada y `demo-crm.sql` ejecutado antes (las órdenes enlazan clientes y técnicos demo por su identidad estable). Las mismas precondiciones de organización y `owner` único que `demo-crm.sql`; si no se cumplen, aborta sin cambiar nada.
- **Qué crea**: Demo Norte 15 órdenes (5 pendientes, 3 asignadas, 2 en curso, 4 completadas, 1 cancelada con motivo) y Demo Sur 7 (2 / 1 / 1 / 2 / 1), con fechas programadas relativas al día de la primera ejecución. Solo usa clientes y técnicos demo **activos**; un fixture cuyo cliente o técnico no existe, está archivado o no tiene identidad se omite con un `RAISE NOTICE`.
- **Cómo lo hace**: actúa como el `owner` de cada organización y usa las mismas RPC que la aplicación (`create/assign/advance/cancel_work_order`), así que se aplican RLS, la matriz de transiciones y los eventos de actividad con el `owner` como actor. No desactiva triggers, no usa `service_role` y no escribe en `activity_events` ni en `work_orders` directamente.
- **Idempotencia**: cada orden lleva una clave estable (`o01`…, nunca cambiar una publicada) registrada en `private.demo_fixture_identity` con `entity_type = 'work_order'`. Una segunda ejecución inserta 0 órdenes y 0 eventos, y una orden que el usuario haya avanzado, editado o cancelado no se recrea ni se revierte. Una sola transacción con `pg_advisory_xact_lock`; sin `DELETE`, `TRUNCATE` ni `DROP`.
- **Ejecutar**: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/demo-orders.sql` (o pegar el contenido en el SQL editor), tras `demo-crm.sql`.
- **Deshacer**: no hay borrado (las órdenes no se borran y el historial es inmutable). Las órdenes demo abiertas se cancelan desde la aplicación; las cerradas son de solo lectura.
- **Verificación (solo lectura)**:

```sql
select o.name, w.status, count(*) as ordenes
from public.work_orders w join public.organizations o on o.id = w.organization_id
where o.name in ('Demo Norte', 'Demo Sur')
group by o.name, w.status order by o.name, w.status;
```

## Presupuestos demo (TASK-012, F5)

`supabase/seeds/demo-quotes.sql` crea presupuestos **ficticios** (descripciones con el prefijo `[DEMO]`, importes en céntimos enteros) para `Demo Norte` y `Demo Sur`. Verificado en PGlite (`tests/integration/quotes-seed.test.ts`) y ejecutado en Cloud con autorización humana (11 presupuestos, 4 órdenes generadas y segunda ejecución idempotente). [TASK-012](reviews/claude/TASK-012.md).

- **Requisitos**: migración `20261127090000_task012_quotes` aplicada y `demo-crm.sql` ejecutado antes (los presupuestos enlazan clientes demo por su identidad estable). No depende de `demo-orders.sql` (puede ejecutarse antes o después). Mismas precondiciones de organización y `owner` único que `demo-crm.sql`; si no se cumplen, aborta sin cambiar nada.
- **Qué crea**: Demo Norte 8 presupuestos (3 borrador, 3 aceptados, 2 rechazados) y Demo Sur 3 (1 / 1 / 1), con 2 a 3 conceptos cada uno y tipos de IVA 21 %, 10 % y 0 %. Cada presupuesto aceptado lleva **su orden de servicio** (pendiente, mismo cliente y título), creada por la misma RPC de aceptación que usa la aplicación; los borradores y rechazados no tienen orden. Numeración `PRE-0001…` por organización.
- **Cómo lo hace**: actúa como el `owner` de cada organización y usa las mismas RPC que la aplicación (`create_quote`, `add_quote_item`, `accept_quote`, `reject_quote`), así que se aplican RLS, el cálculo de totales en PostgreSQL, el solo lectura de terminales y los eventos de actividad con el `owner` como actor. No desactiva triggers, no usa `service_role` y no escribe directamente en `quotes`, `quote_items`, `work_orders` ni `activity_events`.
- **Idempotencia**: cada presupuesto lleva una clave estable (`q01`…, nunca cambiar una publicada) registrada en `private.demo_fixture_identity` con `entity_type = 'quote'`. Una segunda ejecución inserta 0 presupuestos, 0 órdenes y 0 eventos, y un presupuesto que el usuario haya aceptado, rechazado o editado no se recrea ni se revierte. Una sola transacción con `pg_advisory_xact_lock`; sin `DELETE`, `TRUNCATE` ni `DROP`. Las órdenes generadas por aceptación no reciben identidad propia (no son fixtures de `demo-orders.sql`).
- **Ejecutar**: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/demo-quotes.sql` (o pegar el contenido en el SQL editor), tras `demo-crm.sql`.
- **Deshacer**: no hay borrado (los presupuestos y las órdenes no se borran y el historial es inmutable). Los borradores demo se rechazan desde la aplicación; los aceptados y rechazados son de solo lectura.
- **Verificación (solo lectura)**:

```sql
select o.name, q.status, count(*) as presupuestos, sum(q.total_cents) as total_centimos
from public.quotes q join public.organizations o on o.id = q.organization_id
where o.name in ('Demo Norte', 'Demo Sur')
group by o.name, q.status order by o.name, q.status;
```

## Inventario demo (TASK-013, F6)

`supabase/seeds/demo-inventory.sql` crea artículos y movimientos **ficticios** (descripciones con el prefijo `[DEMO]`, cantidades enteras) para `Demo Norte` y `Demo Sur`. Verificado en PGlite (`tests/integration/inventory-seed.test.ts`) y **ejecutado en Cloud el 2026-11-25** con autorización humana expresa (11 artículos Norte y 5 Sur; segunda ejecución sin cambios). Cualquier nueva ejecución en Cloud requiere decisión humana expresa.

- **Requisitos**: migración `20261128090000_task013_inventory` aplicada. Para que haya consumos vinculados a órdenes conviene haber ejecutado antes `demo-orders.sql` (o `demo-quotes.sql`): sin órdenes abiertas en una organización los consumos de sus fixtures se omiten con un aviso, sin fallar. Mismas precondiciones de organización y `owner` único que `demo-crm.sql`; si no se cumplen, aborta sin cambiar nada.
- **Qué crea**: Demo Norte 11 artículos (5 disponibles, 3 con stock bajo, 2 agotados y 1 archivado con saldo) y Demo Sur 5 (2 disponibles, 1 bajo, 1 agotado y 1 archivado), con entradas, salidas y consumos en órdenes abiertas de su organización.
- **Cómo lo hace**: actúa como el `owner` de cada organización y usa las mismas RPC que la aplicación (`create_inventory_item`, `record_stock_movement`, `archive_inventory_item`), así que se aplican RLS, los triggers (saldo nunca negativo, solo lectura de archivados) y los eventos de actividad con el `owner` como actor (nunca nulo). No desactiva triggers, no usa `service_role` y no escribe directamente en `inventory_items`, `stock_movements` ni `activity_events`.
- **Idempotencia**: cada artículo lleva una clave estable (`i01`…, nunca cambiar una publicada) registrada en `private.demo_fixture_identity` con `entity_type = 'inventory_item'`; las claves de idempotencia de los movimientos son deterministas. Una segunda ejecución inserta 0 artículos, 0 movimientos y 0 eventos, y un artículo movido, editado o archivado por un usuario no se recrea ni se revierte.
- **Ejecutar**: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/demo-inventory.sql` (o pegar el contenido en el SQL editor), tras `demo-crm.sql` y, para los consumos, `demo-orders.sql`.
- **Órdenes consumidas (TASK-013-FIX)**: los consumos solo se aplican sobre órdenes **demo** abiertas de la misma organización, identificadas por `private.demo_fixture_identity` (`entity_type = 'work_order'`); nunca sobre órdenes creadas por usuarios, aunque estén abiertas. Las órdenes aceptadas desde `demo-quotes.sql` no tienen identidad de orden y no se consumen. Sin órdenes demo abiertas los consumos se omiten con un aviso.
- **Deshacer**: no hay borrado (los artículos y movimientos no se borran y el historial es inmutable). Los artículos demo se archivan desde la aplicación; la corrección de un saldo es un movimiento contrario.
- **Verificación (solo lectura)**:

```sql
select o.name, i.stock_status, (i.archived_at is not null) as archivado, count(*) as articulos, sum(i.quantity) as unidades
from public.inventory_items i join public.organizations o on o.id = i.organization_id
where o.name in ('Demo Norte', 'Demo Sur')
group by o.name, i.stock_status, (i.archived_at is not null) order by o.name, i.stock_status;
```
