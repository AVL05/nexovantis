-- TASK-010 / A02-03: identidad estable de los fixtures del seed demo (supabase/seeds/demo-crm.sql).
-- Hasta ahora el seed identificaba cada fixture por organizacion + nombre, un campo editable: si un
-- usuario renombraba un cliente o tecnico demo, la siguiente ejecucion lo duplicaba. Ahora el seed
-- registra aqui, por cada fixture que inserta, (organizacion, tipo, clave estable del fixture) ->
-- id de la fila. La clave es una constante del seed que no depende de ningun dato editable.
--
-- Esquema private (no expuesto por la API) y sin ningun privilegio para anon ni authenticated: la
-- identidad no se puede leer ni escribir desde la aplicacion. Solo la escriben el seed y la
-- reconciliacion (supabase/seeds/reconcile-demo-crm.sql), con privilegios de administracion.
-- record_id es polimorfico (cliente o tecnico, segun entity_type) y no lleva clave foranea; es
-- unico por tipo, de modo que una fila no puede ser dos fixtures.
create table private.demo_fixture_identity (
  organization_id uuid not null references public.organizations (id),
  entity_type text not null,
  fixture_key text not null,
  record_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, entity_type, fixture_key),
  constraint demo_fixture_identity_record_key unique (entity_type, record_id),
  constraint demo_fixture_identity_entity_type_check check (entity_type in ('customer', 'technician')),
  constraint demo_fixture_identity_key_check check (fixture_key <> '')
);

alter table private.demo_fixture_identity enable row level security;
revoke all on table private.demo_fixture_identity from public, anon, authenticated;
