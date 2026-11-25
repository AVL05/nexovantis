# Supabase Cloud — proyecto nexovantis

Aprovisionado por Orchestrator el 2026-11-24 con el conector oficial de Supabase, con autorización humana expresa (coste autorizado: 0 €). Este documento no contiene secretos: la clave `service_role`, la contraseña de la base de datos y los tokens no se han solicitado ni se guardan en Git.

## Proyecto

- Organización: AVL05, plan **Free** (`tier_free`). Coste de creación consultado con `get_cost`: **0 $/mes**; sin facturación ni recursos de pago.
- Proyecto: `nexovantis`, ref `sokguksbymvfcuceswdo`, región `eu-central-1` (Frankfurt), PostgreSQL 17, estado `ACTIVE_HEALTHY`.
- Otro proyecto de la organización (`lumaflow-storage`) no se ha modificado. El plan Free admite 2 proyectos activos: ambos cupos están ocupados.
- Los proyectos Free se pausan tras un periodo de inactividad; se reactivan desde el panel sin coste.

## Configuración local (valores públicos)

`.env.local` (ignorado por Git, véase `.gitignore`) con las variables de `src/lib/env.ts`:

```
NEXT_PUBLIC_SUPABASE_URL=https://sokguksbymvfcuceswdo.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<clave publicable sb_publishable_… del panel: Project Settings → API Keys>
```

La clave publicable no es secreta (la protege RLS), pero tampoco se versiona. No usar la clave `anon` heredada (JWT) ni la `service_role` en la aplicación.

## Migraciones

Aplicadas en orden con `apply_migration`, con el contenido literal de `supabase/migrations/`:

| Repositorio                                        | Versión registrada en Cloud |
| -------------------------------------------------- | --------------------------- |
| `20261124090000_f3_core_tables`                    | `20261124160408`            |
| `20261124090100_f3_private_functions_and_triggers` | `20261124160426`            |
| `20261124090200_f3_rls_and_grants`                 | `20261124160439`            |
| `20261124090300_f3_freeze_archived_at`             | `20261124160449`            |

El conector asigna la versión según la hora de aplicación. Antes de usar `supabase db push` contra Cloud, hay que alinear el historial (`supabase migration repair`, que requiere la CLI y la contraseña de la base de datos) o hacerlo por SQL con autorización humana. Hasta entonces, las migraciones nuevas se aplican por el mismo conector.

## Verificación (solo lectura, sin pruebas destructivas)

- RLS activada en `organizations`, `memberships`, `customers` y `technicians` (sin `FORCE`, como en ADR-001).
- 21 restricciones (PK, FK, `unique`, `check`), 9 políticas solo para `authenticated`, 7 triggers.
- Privilegios: `authenticated` con SELECT en las 4 tablas, INSERT/UPDATE solo en las columnas previstas y sin DELETE; `anon` sin privilegios de tabla ni USAGE en `private`.
- Funciones `private.*` con `search_path=''`; `is_org_member` y `has_org_role` SECURITY DEFINER, ejecutables solo por `authenticated`; las funciones de trigger no son ejecutables por `anon` ni `authenticated`; `prevent_unarchive` con el cuerpo de la migración 0300.
- Avisos de Supabase (security y performance): **0**.

## Pasos manuales pendientes

1. **Desactivar el registro público**: el conector no permite cambiar la configuración de Auth. Panel → Authentication → Sign In / Providers → desactivar "Allow new users to sign up". (`supabase/config.toml` no fija `enable_signup` para el entorno local.)
2. Crear `.env.local` con los dos valores de arriba.

## Aprovisionamiento demo para TASK-007 (preparado, no ejecutado)

Organizaciones y membresías se crean fuera de la app (ADR-001). Procedimiento propuesto, pendiente de aprobación con los criterios de TASK-007:

1. El humano crea los usuarios demo en el panel (Authentication → Users → Add user, con "Auto Confirm User") y elige sus contraseñas; no se registran en Git ni en el chat. Propuesta: dos organizaciones ficticias con un `owner` y un `member` cada una, con correos de un dominio ficticio.
2. Orchestrator inserta organizaciones y membresías por SQL (rol `postgres`, que omite RLS), resolviendo `user_id` por correo:

```sql
with org as (
  insert into public.organizations (name) values ('Demo Norte') returning id
)
insert into public.memberships (organization_id, user_id, role)
select org.id, u.id, r.role
from org
join (values ('owner-norte@<dominio-demo>', 'owner'), ('member-norte@<dominio-demo>', 'member')) as r(email, role) on true
join auth.users u on u.email = r.email;
```

3. Verificar con una consulta de solo lectura que cada usuario tiene exactamente una membresía.

## Historial de migraciones alineado (2026-11-24)

El humano ejecutó `supabase migration repair` con la CLI 2.122.1 (login y link solo de `nexovantis`). Verificación de Orchestrator por el conector, en lectura: `supabase_migrations.schema_migrations` contiene exactamente `20261124090000`, `20261124090100`, `20261124090200` y `20261124090300`, con los mismos nombres que el repositorio, y ninguna versión antigua. `repair --status applied` guarda el SQL dividido en sentencias, por eso su MD5 ya no coincide con el del archivo; el SQL no se volvió a ejecutar. El humano también desactivó el registro público y creó `.env.local` (no verificado por Orchestrator, porque no se lee `.env.local`).

## Datos demo (2026-11-24)

Organizaciones creadas por Orchestrator con el conector: `Demo Norte` y `Demo Sur`. Las membresías se crean cuando existan los usuarios, porque Auth no se gestiona desde el conector y las contraseñas las elige el humano.

| Usuario (correo ficticio)  | Organización | Rol    | Para qué sirve                   |
| -------------------------- | ------------ | ------ | -------------------------------- |
| `owner.norte@example.com`  | Demo Norte   | owner  | flujo demo principal             |
| `member.norte@example.com` | Demo Norte   | member | diferencias de rol               |
| `owner.sur@example.com`    | Demo Sur     | owner  | aislamiento entre organizaciones |
| `sin.org@example.com`      | —            | —      | estado de acceso denegado        |

SQL de membresías que ejecuta Orchestrator después de que existan los usuarios. Es idempotente y solo inserta:

```sql
insert into public.memberships (organization_id, user_id, role)
select o.id, u.id, r.role
from (values ('owner.norte@example.com', 'Demo Norte', 'owner'),
             ('member.norte@example.com', 'Demo Norte', 'member'),
             ('owner.sur@example.com', 'Demo Sur', 'owner')) as r(email, org, role)
join auth.users u on u.email = r.email
join public.organizations o on o.name = r.org
on conflict do nothing;
```

Seed de datos demo (clientes y técnicos ficticios, idempotente): véase [SEED.md](SEED.md).

## Migraciones de TASK-010 (remediación de AUDIT-002): preparadas, NO aplicadas en Cloud

Cinco migraciones nuevas, posteriores a `20261124100000`: `20261125090000_task010_name_constraints`, `20261125090100_task010_activity_seq`, `20261125090200_task010_archived_readonly`, `20261125090300_task010_demo_fixture_identity` y `20261125100000_task010b_activity_seq_required` (TASK-010B: `CHECK (seq is not null) NOT VALID`). No se ha ejecutado nada en Cloud. Su aplicación requiere autorización humana expresa.

### Verificaciones previas (solo lectura), antes de aplicarlas

1. **Nombres** (`supabase/checks/name-constraints-precheck.sql`, con privilegios de administración): debe devolver **0 filas**. Lista `table_name`, `id` y `reason` de cada organización, cliente o técnico con nombre vacío, solo espacios en blanco (tabulaciones, saltos de línea, NBSP…) o de más de 200 caracteres almacenados. Si devuelve filas, la migración `…090000` **fallaría entera** (no recorta ni reescribe datos): corregirlas a mano, con decisión humana, y repetir la comprobación.
2. **Eventos**: anotar `select count(*) from public.activity_events` y comprobar que la migración `…090100` los deja con `seq` nulo (los eventos existentes no reciben orden inventado). `…100000` no reescribe ni valida esos eventos (`NOT VALID`): solo rechaza `seq = NULL` en filas nuevas; no ejecutar `VALIDATE CONSTRAINT`.
3. **Archivados con edición pendiente**: `…090200` no cambia datos, pero desde su aplicación los archivados son de solo lectura (también para administración vía SQL: restaurar primero). Avisar a quien mantenga scripts que editen archivados.
4. **Seed y reconciliación**: si Cloud ya recibió el seed anterior, aplicar `…090300`, ejecutar `supabase/seeds/reconcile-demo-crm.sql` en modo comprobación, revisar el informe y solo entonces aplicar y volver a lanzar el seed (orden y riesgos en [SEED.md](SEED.md)). No lanzar el seed nuevo sin reconciliar: omitiría los fixtures que colisionen, pero nunca duplica filas con el mismo nombre ni con la misma firma de contacto.
5. Orden de aplicación por el conector (`apply_migration`), una a una y en el orden de la versión; después alinear el historial como se hizo antes (versión del conector distinta de la del repositorio).

### Comprobaciones aplazadas (stack local de Supabase en CI y, tras la autorización, Cloud)

Sin ejecutar: `pnpm test:supabase` (`logout-revocation`, `name-constraints`, `archived-readonly`, `archive-restore`, `rls`) y `pnpm test:e2e:supabase` (`task010-ui`, `crm`) con Auth y PostgREST reales; la caracterización de la sesión copiada cuando falla la revocación remota (A02-01) solo se comprueba allí. Tras aplicar en Cloud, en solo lectura: restricciones `*_name_length` con la definición nueva, columna `activity_events.seq` (bigint, única, sin INSERT/UPDATE para `anon` y `authenticated`), restricción `activity_events_seq_required` (`convalidated = false`), triggers `*_prevent_unarchive` con `WHEN (old.archived_at is not null or new.archived_at is not null)` y `private.demo_fixture_identity` sin privilegios para `anon` y `authenticated`; los avisos de seguridad de Supabase deben seguir en 0.

## Migración de TASK-013 (F6, inventario y actividad): preparada, NO aplicada en Cloud

`20261128090000_task013_inventory` (tablas `inventory_items`, `stock_movements` e `inventory_event_details`, RPC de inventario y ampliación de los CHECK de `activity_events` y de `private.demo_fixture_identity`) no se ha aplicado en Cloud ni se ha ejecutado `supabase/seeds/demo-inventory.sql`. Su aplicación requiere autorización humana expresa y, como el resto, por el conector `apply_migration` y alineando después el historial.
