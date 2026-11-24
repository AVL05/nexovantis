# Seed demo (clientes y técnicos)

Script: `supabase/seeds/demo-crm.sql` (TASK-008C). No es una migración y no se ejecuta con `supabase db reset` (`[db.seed]` está desactivado en `supabase/config.toml`).

## Qué crea

Solo clientes y técnicos **ficticios** en las organizaciones `Demo Norte` y `Demo Sur`:

| Organización | Clientes activos / archivados | Técnicos activos / archivados | Eventos `archived` |
| ------------ | ----------------------------- | ----------------------------- | ------------------ |
| Demo Norte   | 24 / 3                        | 6 / 2                         | 5                  |
| Demo Sur     | 8 / 2                         | 3 / 1                         | 3                  |

(Recuentos en una organización que solo contiene datos del seed.) Los archivados pasan por el trigger normal, así que el historial de actividad queda con el owner como actor. Convenciones de los datos: emails en subdominios de `example.com`; teléfonos `+34 000 …` (prefijo no asignable, no puede llamar a nadie real); notas con el prefijo `[DEMO]`; sin CIF/NIF, direcciones ni personas reales.

## Requisitos

- Migraciones 1 a 5 aplicadas (`supabase/migrations/`, hasta `task008b_restore_and_activity`).
- Las organizaciones `Demo Norte` y `Demo Sur` existen (nombre exacto, una sola vez) y cada una tiene **exactamente un `owner`** en `memberships`. Si no, el script aborta sin cambiar nada.

## Cómo ejecutarlo

Con privilegios de administración (rol `postgres`), una vez por entorno:

- SQL editor de Supabase: pegar el contenido del archivo y ejecutar.
- `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/demo-crm.sql`
- Conector de Supabase (`execute_sql`) con el contenido del archivo.

El script abre y cierra su propia transacción, y dentro actúa como el owner de cada organización (`set local role authenticated` + claims JWT), de modo que se aplican RLS, GRANT por columna y el trigger de archivado. No desactiva triggers, no usa `service_role` y no escribe en `activity_events`. Al terminar emite avisos (`RAISE NOTICE`) con los recuentos por organización y estado y los eventos `archived`.

## Idempotencia

Clave natural: organización + nombre exacto. Solo inserta lo que no existe (activo o archivado) y el archivado inicial se aplica únicamente a las filas insertadas en esa misma ejecución. Una segunda ejecución inserta 0 registros y genera 0 eventos. No actualiza campos ni borra, y los registros ajenos al seed no se tocan. Un registro demo designado como archivado que un usuario restaure (o modifique) permanece como lo dejó el usuario: una nueva ejecución no lo vuelve a archivar.

## Qué no hace

Sin órdenes, presupuestos ni inventario; no crea usuarios ni membresías; no modifica el esquema.

## Verificación (solo lectura, como administrador)

```sql
select o.name,
  (select count(*) from public.customers c where c.organization_id = o.id and c.archived_at is null)     as clientes_activos,
  (select count(*) from public.customers c where c.organization_id = o.id and c.archived_at is not null) as clientes_archivados,
  (select count(*) from public.technicians t where t.organization_id = o.id and t.archived_at is null)     as tecnicos_activos,
  (select count(*) from public.technicians t where t.organization_id = o.id and t.archived_at is not null) as tecnicos_archivados,
  (select count(*) from public.activity_events e where e.organization_id = o.id and e.action = 'archived') as eventos_archived
from public.organizations o
where o.name in ('Demo Norte', 'Demo Sur')
order by o.name;
```

Aislamiento: iniciar sesión en la aplicación como `owner.norte@example.com` (solo debe ver clientes y técnicos de Demo Norte) y como `owner.sur@example.com` (solo Demo Sur). La prueba `tests/integration/seed-demo.test.ts` lo comprueba por RLS en PGlite.

## Cómo deshacerlo

No hay borrado: la aplicación no borra datos (BR02) y `activity_events` es inmutable, por lo que el historial del seed permanece. Los datos demo se **archivan** desde la aplicación (el owner puede archivarlos), no se eliminan. Un borrado físico solo procedería por decisión humana expresa y fuera de este script.
