# ADR-001: roles, membresías y RLS (F3)

- Estado: **aprobada por el humano** (ratificación definitiva comunicada en TASK-010, 2026-11-24; registro: docs/reviews/claude/TASK-010.md). Se ratifican: roles `owner` y `member` según la matriz de esta ADR; una única organización por usuario en el MVP; aprovisionamiento externo de organizaciones y membresías con registro público desactivado; ambos roles gestionan clientes y técnicos de su organización; los clientes y técnicos archivados son de solo lectura hasta su restauración (implementación en TASK-010, A02-06). DH-04, DH-05 y DH-06 ya constaban aprobadas (TASK-008A); DH-04, DH-05 y la ampliación de DH-08 siguen vinculadas a sus fases.
- Tarea: TASK-006 (F3, base de datos). Fecha: 2026-11-24.
- Implementación: `supabase/migrations/20261124090000_f3_core_tables.sql`, `20261124090100_f3_private_functions_and_triggers.sql` y `20261124090200_f3_rls_and_grants.sql`.

## Contexto

Nexovantis es multiempresa: los datos de una organización no pueden verse ni modificarse desde otra (BR01). El producto no tiene registro público ni multiempresa avanzada (docs/PRODUCT_REQUIREMENTS.md). Supabase expone las tablas de `public` por PostgREST con los roles `anon` y `authenticated`, y concede por defecto todos los privilegios a ambos: sin GRANT/REVOKE explícitos, RLS sería la única barrera.

## Decisión

### Roles y matriz de acceso

Dos roles por membresía: `owner` y `member`.

| Recurso                                        | anon | member                                                       | owner                                |
| ---------------------------------------------- | ---- | ------------------------------------------------------------ | ------------------------------------ |
| organizations                                  | —    | SELECT propia                                                | SELECT propia; UPDATE solo de `name` |
| memberships                                    | —    | SELECT de su organización                                    | SELECT de su organización            |
| customers, technicians                         | —    | SELECT, INSERT, UPDATE (incluye archivar) en su organización | igual que member                     |
| DELETE / TRUNCATE en cualquier tabla           | —    | —                                                            | —                                    |
| Crear organización; alta o cambio de membresía | —    | —                                                            | — (fuera de la app)                  |

UPDATE de clientes y técnicos solo sobre registros activos: un registro archivado es de solo lectura y la única modificación admitida es su restauración (`archived_at` fecha -> null), sin cambios de otros campos en la misma operación (ratificado en TASK-010).

En F3 `owner` solo se diferencia de `member` en renombrar la organización. La diferencia crecerá con las fases siguientes (por ejemplo, gestión del equipo) y cada ampliación necesita su propia decisión.

### Creación de organizaciones y membresías fuera de la aplicación

No hay registro público. Las organizaciones y las membresías se crean con privilegios de administración (migración, SQL de administración o clave de servicio en entornos controlados), nunca con una sesión de usuario. `memberships` no tiene políticas de INSERT, UPDATE ni DELETE ni privilegios de escritura para `authenticated`: nadie puede autoasignarse un rol, cambiar el propio ni unirse a otra organización. `organizations` tampoco tiene INSERT ni DELETE para `authenticated`.

### Una organización por usuario

`memberships` tiene `unique (user_id)` además de la clave primaria `(organization_id, user_id)`. Simplifica `auth.uid()` → organización y es coherente con que la multiempresa avanzada esté fuera de alcance. Si el producto la necesitara, habría que revisar la restricción, las funciones auxiliares y la interfaz.

### Prevención de escalada de privilegios

- Sin privilegios de escritura sobre `memberships` para `authenticated`.
- Privilegios por columna: en `organizations` solo `update (name)`; en `customers` y `technicians`, `insert` y `update` solo de los campos editables (no `id`, `organization_id`, `created_at`, `updated_at`; `archived_at` solo en UPDATE).
- Políticas `to authenticated` con `USING` y `WITH CHECK` explícitos en cada operación de escritura.
- `organization_id` es inmutable por trigger, incluso con privilegios de administración.
- `updated_at` lo fija un trigger en el servidor.

### Funciones SECURITY DEFINER y su endurecimiento

`private.is_org_member(org uuid)` y `private.has_org_role(org uuid, required_role text)` consultan `memberships` sin pasar por su RLS, lo que evita la recursión de políticas. Medidas:

- Esquema `private`, no incluido en `[api] schemas` de `supabase/config.toml`: no son invocables por RPC. `anon` no tiene `USAGE` sobre el esquema.
- `set search_path = ''` y nombres calificados en el cuerpo.
- `revoke execute ... from public, anon`; `grant execute ... to authenticated`.
- No reciben el usuario como parámetro: usan siempre `auth.uid()`.
- Las políticas las invocan con la columna de organización de la fila, sin subconsultas recursivas sobre `memberships`.

Las funciones de trigger (`set_updated_at`, `prevent_organization_change`, `prevent_unarchive`) no son SECURITY DEFINER y no tienen EXECUTE para nadie salvo el propietario.

### Archivado y borrado

Archivar es UPDATE de `archived_at`; la fila sigue existiendo y siendo visible para su organización (historial). No existe DELETE para usuarios (BR02). Las claves foráneas hacia `organizations` no tienen `on delete cascade`: una organización con datos no se borra por accidente.

## Restricciones diferidas y decisiones vinculadas a fases

- **DH-04** (propuesta: impedir archivar técnicos con órdenes abiertas) y **DH-05** (ídem para clientes) dependen de las órdenes de trabajo, que no existen hasta F4. No se simulan. Punto exacto de F4: la rama `archived` (null -> fecha) de `private.prevent_unarchive()` en una migración nueva de F4 (`create or replace`), que comprobará la existencia de órdenes abiertas del técnico/cliente antes del `insert` del evento, en la misma transacción; el servicio de dominio (`archiveCustomer`/`archiveTechnician`) mapeará ese error a un conflicto legible.
- **DH-06** (restaurar con evento), implementada en `20261124100000_task008b_restore_and_activity.sql` (TASK-008B), ratificada por el humano el 2026-11-24 (registro: docs/reviews/claude/TASK-008B.md, que precisa el alcance de la inmutabilidad frente a administradores): `private.prevent_unarchive()` (SECURITY DEFINER, `search_path` vacío, sin EXECUTE para usuarios) se dispara solo cuando cambia `archived_at` (`WHEN` en los triggers). null -> fecha archiva con hora de servidor y evento `archived`; fecha -> null restaura con evento `restored`; fecha -> otra fecha da 23000; sin `auth.uid()` no se archiva ni restaura (23000). Los eventos van a `public.activity_events` (solo SELECT para miembros, sin políticas de escritura, inmutable incluso para administración, `organization_id` sin cascade, sin datos personales). Cualquier miembro (owner o member) puede archivar y restaurar. DH-08 (ampliar `entity_type`/`action` a órdenes) exigirá ampliar los CHECK. Scripts de mantenimiento que archiven sin JWT quedan rechazados por diseño.
- El filtro de archivados por defecto (TC-ARCH-02) no se implementa por RLS en F3: se resolverá en las consultas de la aplicación o en F4.
- Inicio de sesión, cierre, sesión, proxy y rutas protegidas: TASK-007.
- La desactivación del registro público en el proyecto de Supabase Cloud se configura en F6 con el despliegue; el stack local de CI usa los valores por defecto.

## Consecuencias

- Los cambios de roles, altas de equipo y creación de organizaciones requieren una vía de administración fuera de la app hasta que se decida otra cosa.
- Los GRANT por columna obligan a mantener las migraciones al añadir columnas editables.
- Verificación: las políticas, los privilegios y las funciones se prueban en PGlite (PostgreSQL real con un shim de `auth`; no es Supabase) con `pnpm test:integration`. La verificación en Supabase local (PostgREST, GoTrue, JWT reales) está definida en el job `supabase` de CI y **no se ha ejecutado** hasta que el humano autorice un push. Nada se ha probado contra un proyecto de Supabase Cloud.

## Alternativas descartadas

- **Tabla `profiles`**: no aporta valor en F3; `auth.users` tiene el email.
- **Varias organizaciones por usuario**: fuera de alcance y complica `auth.uid()` → organización.
- **Rol en el JWT (custom claims)**: introduce un hook de Auth y dificulta revocar roles de forma inmediata.
- **Políticas con subconsulta directa a `memberships`**: provocan recursión en la política de `memberships`.

## Cambios técnicos de TASK-010 (remediación de AUDIT-002)

Sin cambiar las decisiones ratificadas ni la matriz de acceso; no se debilita ninguna política, GRANT ni restricción. Migraciones nuevas (`supabase/migrations/20261125090000` a `20261125090300`, descripción en [ARCHITECTURE.md](../ARCHITECTURE.md)):

- **Archivados de solo lectura**: `private.prevent_unarchive()` rechaza (23000) todo UPDATE de una fila archivada que cambie columnas distintas de `archived_at`/`updated_at`, sin excepción por rol (tampoco administración), incluida la restauración combinada con edición. La única modificación admitida de un archivado es restaurarlo (evento `restored`). La rama `archived`/`restored` sigue siendo el punto de enganche de DH-04/DH-05 en F4.
- **Orden de eventos**: `activity_events.seq` asignado por la BD (no escribible por usuarios); eventos históricos con `seq` nulo.
- **Nombres**: CHECK sobre el valor almacenado (<= 200 caracteres, no solo espacio en blanco) en `organizations.name`, `customers.name` y `technicians.full_name`.
- **Identidad de fixtures del seed**: `private.demo_fixture_identity`, sin privilegios para `anon` ni `authenticated` (esquema `private`, RLS activada sin políticas).
