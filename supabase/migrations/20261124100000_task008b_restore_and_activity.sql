-- TASK-008B / DH-06: archivar y restaurar con evento de actividad.
-- Sustituye el bloqueo de restauracion de 20261124090300 por: restaurar permitido (archived_at
-- pasa de fecha a nulo) y cada archivado/restauracion deja un evento inmutable en
-- public.activity_events, de forma atomica con el cambio (mismo trigger, misma transaccion).
-- No se debilitan RLS, GRANT ni restricciones previas. El actor siempre es auth.uid(): nunca se
-- acepta del cliente ni existe una funcion parametrizada ejecutable por usuarios.

-- Historial de archivado/restauracion. Sin datos personales (ni nombre, ni email, ni notas):
-- solo referencias. entity_id es polimorfico (cliente o tecnico), sin FK, para que el historial
-- sobreviva a cualquier cambio futuro de la fila de origen. organization_id referencia a
-- organizations SIN cascade (F-06): una organizacion con historial no se puede borrar.
-- DH-08 (ampliar entity_type/action a ordenes) exigira ampliar estos CHECK en una migracion.
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  actor_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  occurred_at timestamptz not null default now(),
  constraint activity_events_entity_type_check check (entity_type in ('customer', 'technician')),
  constraint activity_events_action_check check (action in ('archived', 'restored'))
);

create index activity_events_entity_idx
  on public.activity_events (organization_id, entity_type, entity_id, occurred_at);

alter table public.activity_events enable row level security;

revoke all on table public.activity_events from public, anon, authenticated;
grant select on table public.activity_events to authenticated;

-- Solo lectura para miembros de la organizacion. Sin politicas de escritura.
create policy activity_events_select_member on public.activity_events
  for select to authenticated
  using (private.is_org_member(organization_id));

-- Inmutabilidad: ni UPDATE ni DELETE ni TRUNCATE, tampoco con privilegios de administracion.
create function private.prevent_event_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'el historial de actividad es inmutable (% sobre %)', tg_op, tg_table_name
    using errcode = '23000';
end;
$$;

revoke execute on function private.prevent_event_change() from public, anon, authenticated;

create trigger activity_events_prevent_change
  before update or delete on public.activity_events
  for each row execute function private.prevent_event_change();
create trigger activity_events_prevent_truncate
  before truncate on public.activity_events
  for each statement execute function private.prevent_event_change();

-- Funcion de trigger de archivado/restauracion (conserva el nombre, F-03). SECURITY DEFINER con
-- search_path vacio (F-01): inserta el evento con valores derivados de NEW y auth.uid(), sin
-- funcion auxiliar parametrizada que un usuario pudiera invocar para falsificar eventos.
-- Solo se dispara cuando archived_at cambia (clausula WHEN del trigger):
--   null  -> fecha : archivar. La hora la fija el servidor (se ignora la enviada). Evento 'archived'.
--   fecha -> null  : restaurar. Evento 'restored'.
--   fecha -> otra  : rechazado (23000): un archivado conserva su archived_at.
-- Sin auth.uid() no se archiva ni se restaura (23000): el actor nunca es nulo.
--
-- DH-04/DH-05 (F4): cuando existan ordenes, la regla "no archivar con ordenes activas
-- asignadas / no restaurar ..." se comprobara en este punto (rama 'archived' / 'restored'),
-- antes del INSERT del evento, para que sea atomica. Hoy no hay ordenes: no se simula.
create or replace function private.prevent_unarchive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_type text;
  v_action text;
begin
  if tg_table_name = 'customers' then
    v_type := 'customer';
  elsif tg_table_name = 'technicians' then
    v_type := 'technician';
  else
    raise exception 'tabla no soportada para archivado: %', tg_table_name using errcode = '23000';
  end if;

  if old.archived_at is not null and new.archived_at is not null then
    raise exception 'un registro archivado conserva su archived_at' using errcode = '23000';
  end if;

  if v_actor is null then
    raise exception 'archivar o restaurar requiere un usuario autenticado' using errcode = '23000';
  end if;

  if old.archived_at is null and new.archived_at is not null then
    new.archived_at := now();
    v_action := 'archived';
  else
    v_action := 'restored';
  end if;

  insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
  values (new.organization_id, v_actor, v_type, new.id, v_action);

  return new;
end;
$$;

revoke execute on function private.prevent_unarchive() from public, anon, authenticated;

-- Los triggers existentes disparaban en cualquier UPDATE; se recrean con WHEN para que la
-- funcion (que ahora escribe eventos) solo se ejecute cuando archived_at cambia de verdad.
drop trigger customers_prevent_unarchive on public.customers;
create trigger customers_prevent_unarchive
  before update on public.customers
  for each row
  when (old.archived_at is distinct from new.archived_at)
  execute function private.prevent_unarchive();

drop trigger technicians_prevent_unarchive on public.technicians;
create trigger technicians_prevent_unarchive
  before update on public.technicians
  for each row
  when (old.archived_at is distinct from new.archived_at)
  execute function private.prevent_unarchive();
