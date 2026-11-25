-- TASK-011 / F4: ordenes de servicio (BR01, BR02, BR03, BR08) y decisiones DH-01..DH-05, DH-07, DH-08, DH-13.
-- Todas las invariantes viven en PostgreSQL: no dependen de la UI ni de las Server Actions.
--
-- Diseno:
--  * public.work_orders: RLS por organizacion y SOLO SELECT para usuarios (sin INSERT/UPDATE/DELETE
--    directos por PostgREST: ni siquiera por columna). Toda escritura pasa por las funciones RPC
--    public.create/update/assign/advance/cancel_work_order (envoltorios INVOKER de funciones SECURITY
--    DEFINER del esquema private, search_path vacio, sin EXECUTE para anon). Las RPC derivan la organizacion de la membresia de auth.uid(); nunca la
--    reciben del cliente.
--  * Las reglas NO estan en las RPC sino en triggers de la tabla (work_orders_guard): el mismo
--    control se aplica a cualquier via de escritura (RPC, SQL de administracion).
--  * Eventos (BR08/DH-08): trigger AFTER en la MISMA transaccion y sentencia que el cambio, con
--    actor = auth.uid() (sin actor no se escribe nada). Un cambio que no altera estado ni tecnico
--    (reintento, doble envio) no dispara el trigger y por tanto no duplica eventos.
--  * Concurrencia: crear/asignar bloquea la fila del cliente/tecnico con FOR SHARE y valida que
--    siga activa; archivar hace UPDATE de esa fila (FOR NO KEY UPDATE, que entra en conflicto con
--    FOR SHARE) y comprueba las ordenes abiertas DESPUES de obtener el bloqueo. Orden de bloqueo
--    unico: orden -> cliente -> tecnico en las RPC; archivar solo bloquea su propia fila y lee
--    ordenes sin bloquearlas: no hay ciclo posible (sin deadlock).
--  * Errores de dominio con SQLSTATE propios (la app los traduce a mensajes seguros):
--      NX001 transicion/reasignacion no permitida   NX002 cliente o tecnico no valido
--      NX003 orden terminal o inmutable             NX004 archivado bloqueado por ordenes abiertas
--      NX005 orden inexistente (o de otra organizacion)

-- ---------------------------------------------------------------------------------------------
-- 1. Eventos de actividad: ordenes
-- ---------------------------------------------------------------------------------------------
-- activity_events NO cambia de forma (mismas columnas, sin datos personales): solo se amplian los
-- valores admitidos. El detalle propio de las ordenes (estado anterior/nuevo, tecnico, motivo de
-- cancelacion) va en una tabla hermana inmutable, escrita por el mismo trigger y transaccion.
alter table public.activity_events
  drop constraint activity_events_entity_type_check,
  drop constraint activity_events_action_check,
  add constraint activity_events_entity_type_check
    check (entity_type in ('customer', 'technician', 'work_order')),
  add constraint activity_events_action_check
    check (action in ('archived', 'restored', 'created', 'status_changed', 'assigned', 'reassigned', 'cancelled')),
  add constraint activity_events_entity_action_check check (
    (entity_type in ('customer', 'technician') and action in ('archived', 'restored'))
    or (entity_type = 'work_order' and action in ('created', 'status_changed', 'assigned', 'reassigned', 'cancelled'))
  );

create index activity_events_recent_idx
  on public.activity_events (organization_id, occurred_at desc, seq desc);

-- event_id enlaza con activity_events.id SIN clave foranea a proposito: una FK impediria el TRUNCATE
-- (0A000) antes de que el trigger de inmutabilidad lo rechace con 23000 como en activity_events. La
-- integridad la garantiza el unico escritor (trigger work_orders_record_event, misma transaccion)
-- y la inmutabilidad de ambas tablas.
create table public.work_order_event_details (
  event_id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  from_status text,
  to_status text,
  technician_id uuid,
  detail text,
  constraint work_order_event_details_status_check check (
    (from_status is null or from_status in ('pending', 'assigned', 'in_progress', 'completed', 'cancelled'))
    and (to_status is null or to_status in ('pending', 'assigned', 'in_progress', 'completed', 'cancelled'))
  ),
  constraint work_order_event_details_detail_length check (char_length(detail) <= 200)
);

alter table public.work_order_event_details enable row level security;
revoke all on table public.work_order_event_details from public, anon, authenticated;
grant select on table public.work_order_event_details to authenticated;

create policy work_order_event_details_select_member on public.work_order_event_details
  for select to authenticated
  using (private.is_org_member(organization_id));

create trigger work_order_event_details_prevent_change
  before update or delete on public.work_order_event_details
  for each row execute function private.prevent_event_change();
create trigger work_order_event_details_prevent_truncate
  before truncate on public.work_order_event_details
  for each statement execute function private.prevent_event_change();

-- La identidad de fixtures del seed tambien cubre las ordenes demo.
alter table private.demo_fixture_identity
  drop constraint demo_fixture_identity_entity_type_check,
  add constraint demo_fixture_identity_entity_type_check
    check (entity_type in ('customer', 'technician', 'work_order'));

-- ---------------------------------------------------------------------------------------------
-- 2. Tabla de ordenes
-- ---------------------------------------------------------------------------------------------
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  customer_id uuid not null,
  technician_id uuid,
  title text not null,
  description text,
  priority text not null default 'normal',
  scheduled_date date not null,
  status text not null default 'pending',
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_orders_organization_id_id_key unique (organization_id, id),
  -- BR01: cliente y tecnico de la MISMA organizacion (claves foraneas compuestas). Con
  -- technician_id nulo la clave no se comprueba (MATCH SIMPLE). Sin ON DELETE: no se borra.
  constraint work_orders_customer_fkey foreign key (organization_id, customer_id)
    references public.customers (organization_id, id),
  constraint work_orders_technician_fkey foreign key (organization_id, technician_id)
    references public.technicians (organization_id, id),
  -- Mismo criterio de nombre que TASK-010: valor almacenado, sin solo espacios en blanco
  -- (conjunto de String.prototype.trim() de JavaScript, con escapes explicitos).
  constraint work_orders_title_check check (
    char_length(title) <= 120
    and title ~ '[^ \t\n\r\v\f   -     　﻿]'
  ),
  constraint work_orders_description_check check (char_length(description) <= 2000),
  constraint work_orders_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint work_orders_status_check
    check (status in ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
  -- BR03: asignada, en curso y completada exigen tecnico; pendiente no lo tiene (sin retrocesos).
  constraint work_orders_technician_status_check check (
    (status = 'pending' and technician_id is null)
    or (status in ('assigned', 'in_progress', 'completed') and technician_id is not null)
    or status = 'cancelled'
  ),
  constraint work_orders_cancellation_reason_check check (
    cancellation_reason is null
    or (status = 'cancelled' and char_length(cancellation_reason) <= 200)
  )
);

-- Listados y comprobaciones DH-04/DH-05 (ordenes abiertas por tecnico y por cliente).
create index work_orders_org_status_idx on public.work_orders (organization_id, status, scheduled_date);
create index work_orders_org_customer_idx on public.work_orders (organization_id, customer_id);
create index work_orders_org_technician_idx
  on public.work_orders (organization_id, technician_id) where technician_id is not null;
create index work_orders_open_technician_idx
  on public.work_orders (organization_id, technician_id) where status in ('assigned', 'in_progress');
create index work_orders_open_customer_idx
  on public.work_orders (organization_id, customer_id) where status in ('pending', 'assigned', 'in_progress');
create index work_orders_org_created_idx on public.work_orders (organization_id, created_at desc, id);

-- ---------------------------------------------------------------------------------------------
-- 3. RLS y privilegios: solo lectura para usuarios
-- ---------------------------------------------------------------------------------------------
alter table public.work_orders enable row level security;
revoke all on table public.work_orders from public, anon, authenticated;
grant select on table public.work_orders to authenticated;

create policy work_orders_select_member on public.work_orders
  for select to authenticated
  using (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------------------------
-- 4. Triggers de la tabla
-- ---------------------------------------------------------------------------------------------
-- Valida y BLOQUEA (FOR SHARE) el cliente o tecnico referenciado: misma organizacion y activo.
-- SECURITY DEFINER para poder bloquear filas con independencia de RLS/GRANT del usuario.
create function private.work_orders_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('pending', 'assigned') then
      raise exception 'una orden nace pendiente o asignada' using errcode = 'NX001';
    end if;
    if new.status = 'assigned' and new.technician_id is null then
      raise exception 'una orden asignada requiere un tecnico valido' using errcode = 'NX002';
    end if;
    perform 1 from public.customers c
      where c.id = new.customer_id and c.organization_id = new.organization_id and c.archived_at is null
      for share;
    if not found then
      raise exception 'el cliente no existe, esta archivado o es de otra organizacion' using errcode = 'NX002';
    end if;
    if new.technician_id is not null then
      perform 1 from public.technicians t
        where t.id = new.technician_id and t.organization_id = new.organization_id and t.archived_at is null
        for share;
      if not found then
        raise exception 'el tecnico no existe, esta archivado o es de otra organizacion' using errcode = 'NX002';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE. DH-07: una orden terminal es de solo lectura (sin excepcion por rol).
  if old.status in ('completed', 'cancelled') then
    if new.status is distinct from old.status then
      raise exception 'una orden terminal no cambia de estado' using errcode = 'NX001';
    end if;
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'una orden completada o cancelada es de solo lectura' using errcode = 'NX003';
    end if;
    return new;
  end if;

  if new.customer_id is distinct from old.customer_id then
    raise exception 'el cliente de una orden no se puede cambiar' using errcode = 'NX003';
  end if;

  -- BR03 / DH-03: secuencia lineal sin saltos ni retrocesos; cancelacion desde cualquier abierta.
  if new.status is distinct from old.status
     and not (
       (old.status = 'pending' and new.status in ('assigned', 'cancelled'))
       or (old.status = 'assigned' and new.status in ('in_progress', 'cancelled'))
       or (old.status = 'in_progress' and new.status in ('completed', 'cancelled'))
     ) then
    raise exception 'transicion de estado no permitida (% -> %)', old.status, new.status
      using errcode = 'NX001';
  end if;

  if new.status in ('assigned', 'in_progress', 'completed') and new.technician_id is null then
    raise exception 'este estado requiere un tecnico valido' using errcode = 'NX002';
  end if;

  -- DH-01: el tecnico solo cambia al asignar (pendiente -> asignada) o al reasignar (asignada).
  if new.technician_id is distinct from old.technician_id
     and not (
       new.technician_id is not null
       and new.status = 'assigned'
       and old.status in ('pending', 'assigned')
     ) then
    raise exception 'el tecnico solo se asigna en pendiente o se reasigna en asignada' using errcode = 'NX001';
  end if;

  -- Tecnico valido y bloqueado al asignar, reasignar o iniciar.
  if new.technician_id is not null
     and (new.technician_id is distinct from old.technician_id
          or (new.status = 'in_progress' and old.status <> 'in_progress')) then
    perform 1 from public.technicians t
      where t.id = new.technician_id and t.organization_id = new.organization_id and t.archived_at is null
      for share;
    if not found then
      raise exception 'el tecnico no existe, esta archivado o es de otra organizacion' using errcode = 'NX002';
    end if;
  end if;

  return new;
end;
$$;

-- Evento de actividad en la misma transaccion que el cambio (DH-08). Actor = auth.uid().
create function private.work_orders_record_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_event uuid;
begin
  if v_actor is null then
    raise exception 'las ordenes requieren un usuario autenticado (actor de los eventos)' using errcode = '23000';
  end if;

  if tg_op = 'INSERT' then
    insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
    values (new.organization_id, v_actor, 'work_order', new.id, 'created')
    returning id into v_event;
    insert into public.work_order_event_details (event_id, organization_id, to_status)
    values (v_event, new.organization_id, new.status);
    if new.technician_id is not null then
      insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
      values (new.organization_id, v_actor, 'work_order', new.id, 'assigned')
      returning id into v_event;
      insert into public.work_order_event_details (event_id, organization_id, from_status, to_status, technician_id)
      values (v_event, new.organization_id, 'pending', new.status, new.technician_id);
    end if;
  elsif new.status is distinct from old.status then
    insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
    values (
      new.organization_id, v_actor, 'work_order', new.id,
      case new.status when 'assigned' then 'assigned' when 'cancelled' then 'cancelled' else 'status_changed' end
    )
    returning id into v_event;
    insert into public.work_order_event_details
      (event_id, organization_id, from_status, to_status, technician_id, detail)
    values (
      v_event, new.organization_id, old.status, new.status,
      case when new.status = 'assigned' then new.technician_id end,
      case when new.status = 'cancelled' then new.cancellation_reason end
    );
  elsif new.technician_id is distinct from old.technician_id then
    insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
    values (new.organization_id, v_actor, 'work_order', new.id, 'reassigned')
    returning id into v_event;
    insert into public.work_order_event_details
      (event_id, organization_id, from_status, to_status, technician_id)
    values (v_event, new.organization_id, old.status, new.status, new.technician_id);
  end if;
  return null;
end;
$$;

create function private.prevent_work_order_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'las ordenes no se borran (% sobre %)', tg_op, tg_table_name using errcode = '23000';
end;
$$;

revoke execute on function private.work_orders_guard() from public, anon, authenticated;
revoke execute on function private.work_orders_record_event() from public, anon, authenticated;
revoke execute on function private.prevent_work_order_delete() from public, anon, authenticated;

create trigger work_orders_guard
  before insert or update on public.work_orders
  for each row execute function private.work_orders_guard();
create trigger work_orders_prevent_organization_change
  before update on public.work_orders
  for each row execute function private.prevent_organization_change();
create trigger work_orders_set_updated_at
  before update on public.work_orders
  for each row execute function private.set_updated_at();
create trigger work_orders_prevent_delete
  before delete on public.work_orders
  for each row execute function private.prevent_work_order_delete();
create trigger work_orders_prevent_truncate
  before truncate on public.work_orders
  for each statement execute function private.prevent_work_order_delete();
create trigger work_orders_event_insert
  after insert on public.work_orders
  for each row execute function private.work_orders_record_event();
create trigger work_orders_event_update
  after update on public.work_orders
  for each row
  when (old.status is distinct from new.status or old.technician_id is distinct from new.technician_id)
  execute function private.work_orders_record_event();

-- ---------------------------------------------------------------------------------------------
-- 5. Funciones RPC (unica via de escritura). Organizacion siempre derivada de auth.uid().
-- ---------------------------------------------------------------------------------------------
create function private.require_org()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'se requiere un usuario autenticado' using errcode = '42501';
  end if;
  select m.organization_id into v_org from public.memberships m where m.user_id = auth.uid();
  if v_org is null then
    raise exception 'el usuario no pertenece a ninguna organizacion' using errcode = '42501';
  end if;
  return v_org;
end;
$$;
revoke execute on function private.require_org() from public, anon, authenticated;

-- Alta. p_id lo genera la app por formulario: un reintento o doble envio con el mismo id devuelve la
-- orden ya creada sin duplicarla ni repetir eventos. Con tecnico (DH-13) la orden nace asignada.
create function private.create_work_order(
  p_id uuid,
  p_customer_id uuid,
  p_title text,
  p_description text,
  p_priority text,
  p_scheduled_date date,
  p_technician_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_existing uuid;
  v_rows int;
begin
  select w.organization_id into v_existing from public.work_orders w where w.id = v_id;
  if found then
    if v_existing <> v_org then
      raise exception 'identificador no disponible' using errcode = '23505';
    end if;
    return v_id;
  end if;

  insert into public.work_orders
    (id, organization_id, customer_id, technician_id, title, description, priority, scheduled_date, status)
  values (
    v_id, v_org, p_customer_id, p_technician_id, p_title, p_description,
    coalesce(p_priority, 'normal'), p_scheduled_date,
    case when p_technician_id is null then 'pending' else 'assigned' end
  )
  on conflict (id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    -- Carrera con un envio identico: la otra transaccion ya la creo.
    select w.organization_id into v_existing from public.work_orders w where w.id = v_id;
    if v_existing is distinct from v_org then
      raise exception 'identificador no disponible' using errcode = '23505';
    end if;
  end if;
  return v_id;
end;
$$;

-- Edicion de campos descriptivos. No cambia estado, tecnico ni cliente. Terminal: NX003.
create function private.update_work_order(
  p_id uuid,
  p_title text,
  p_description text,
  p_priority text,
  p_scheduled_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_status text;
begin
  select w.status into v_status from public.work_orders w
    where w.id = p_id and w.organization_id = v_org for update;
  if not found then
    raise exception 'orden no encontrada' using errcode = 'NX005';
  end if;
  if v_status in ('completed', 'cancelled') then
    raise exception 'una orden completada o cancelada es de solo lectura' using errcode = 'NX003';
  end if;
  update public.work_orders
    set title = p_title, description = p_description,
        priority = coalesce(p_priority, priority), scheduled_date = p_scheduled_date
    where id = p_id and organization_id = v_org;
end;
$$;

-- Asignar (pendiente -> asignada) o reasignar (asignada -> asignada). Devuelve true si cambio algo;
-- repetir la misma asignacion es un no-op sin evento.
create function private.assign_work_order(p_id uuid, p_technician_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_order public.work_orders%rowtype;
begin
  if p_technician_id is null then
    raise exception 'se requiere un tecnico' using errcode = 'NX002';
  end if;
  select * into v_order from public.work_orders w
    where w.id = p_id and w.organization_id = v_org for update;
  if not found then
    raise exception 'orden no encontrada' using errcode = 'NX005';
  end if;
  if v_order.status = 'assigned' and v_order.technician_id = p_technician_id then
    return false;
  end if;
  if v_order.status not in ('pending', 'assigned') then
    raise exception 'la orden no admite asignacion en su estado actual' using errcode = 'NX001';
  end if;
  update public.work_orders set status = 'assigned', technician_id = p_technician_id
    where id = p_id and organization_id = v_org;
  return true;
end;
$$;

-- Avanzar: asignada -> en curso, en curso -> completada. Si ya esta en el estado pedido: no-op.
create function private.advance_work_order(p_id uuid, p_to text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_status text;
begin
  if p_to is null or p_to not in ('in_progress', 'completed') then
    raise exception 'estado de destino no valido' using errcode = 'NX001';
  end if;
  select w.status into v_status from public.work_orders w
    where w.id = p_id and w.organization_id = v_org for update;
  if not found then
    raise exception 'orden no encontrada' using errcode = 'NX005';
  end if;
  if v_status = p_to then
    return false;
  end if;
  update public.work_orders set status = p_to where id = p_id and organization_id = v_org;
  return true;
end;
$$;

-- Cancelar (DH-02): desde pendiente, asignada o en curso; motivo corto opcional guardado en el
-- evento. Ya cancelada: no-op.
create function private.cancel_work_order(p_id uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_status text;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if char_length(v_reason) > 200 then
    raise exception 'motivo demasiado largo' using errcode = '22001';
  end if;
  select w.status into v_status from public.work_orders w
    where w.id = p_id and w.organization_id = v_org for update;
  if not found then
    raise exception 'orden no encontrada' using errcode = 'NX005';
  end if;
  if v_status = 'cancelled' then
    return false;
  end if;
  update public.work_orders set status = 'cancelled', cancellation_reason = v_reason
    where id = p_id and organization_id = v_org;
  return true;
end;
$$;

-- Las funciones SECURITY DEFINER viven en el esquema private (no expuesto por la API de datos, como
-- is_org_member). PostgREST solo expone public: cada RPC publica es un envoltorio SECURITY INVOKER
-- de una linea, sin privilegios propios, que delega en la funcion privada. El usuario necesita
-- EXECUTE sobre la privada; anon no (ni sobre la privada ni sobre el envoltorio).
revoke execute on function private.create_work_order(uuid, uuid, text, text, text, date, uuid) from public, anon;
revoke execute on function private.update_work_order(uuid, text, text, text, date) from public, anon;
revoke execute on function private.assign_work_order(uuid, uuid) from public, anon;
revoke execute on function private.advance_work_order(uuid, text) from public, anon;
revoke execute on function private.cancel_work_order(uuid, text) from public, anon;
grant execute on function private.create_work_order(uuid, uuid, text, text, text, date, uuid) to authenticated;
grant execute on function private.update_work_order(uuid, text, text, text, date) to authenticated;
grant execute on function private.assign_work_order(uuid, uuid) to authenticated;
grant execute on function private.advance_work_order(uuid, text) to authenticated;
grant execute on function private.cancel_work_order(uuid, text) to authenticated;

create function public.create_work_order(
  p_id uuid, p_customer_id uuid, p_title text, p_description text, p_priority text,
  p_scheduled_date date, p_technician_id uuid default null
)
returns uuid
language sql
set search_path = ''
as $$ select private.create_work_order($1, $2, $3, $4, $5, $6, $7) $$;

create function public.update_work_order(
  p_id uuid, p_title text, p_description text, p_priority text, p_scheduled_date date
)
returns void
language sql
set search_path = ''
as $$ select private.update_work_order($1, $2, $3, $4, $5) $$;

create function public.assign_work_order(p_id uuid, p_technician_id uuid)
returns boolean
language sql
set search_path = ''
as $$ select private.assign_work_order($1, $2) $$;

create function public.advance_work_order(p_id uuid, p_to text)
returns boolean
language sql
set search_path = ''
as $$ select private.advance_work_order($1, $2) $$;

create function public.cancel_work_order(p_id uuid, p_reason text default null)
returns boolean
language sql
set search_path = ''
as $$ select private.cancel_work_order($1, $2) $$;

revoke execute on function public.create_work_order(uuid, uuid, text, text, text, date, uuid) from public, anon;
revoke execute on function public.update_work_order(uuid, text, text, text, date) from public, anon;
revoke execute on function public.assign_work_order(uuid, uuid) from public, anon;
revoke execute on function public.advance_work_order(uuid, text) from public, anon;
revoke execute on function public.cancel_work_order(uuid, text) from public, anon;
grant execute on function public.create_work_order(uuid, uuid, text, text, text, date, uuid) to authenticated;
grant execute on function public.update_work_order(uuid, text, text, text, date) to authenticated;
grant execute on function public.assign_work_order(uuid, uuid) to authenticated;
grant execute on function public.advance_work_order(uuid, text) to authenticated;
grant execute on function public.cancel_work_order(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. DH-04 / DH-05: archivar con ordenes abiertas se rechaza (mismo trigger y transaccion)
-- ---------------------------------------------------------------------------------------------
-- create or replace de private.prevent_unarchive() (20261125090200): identico salvo la rama
-- 'archived', que ahora rechaza (NX004) antes de escribir el evento. Los triggers no cambian.
-- La fila ya esta bloqueada por este UPDATE (FOR NO KEY UPDATE), asi que una asignacion concurrente
-- (FOR SHARE) espera, y la comprobacion lee las ordenes con una instantanea posterior al bloqueo.
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

  if old.archived_at is not null then
    if new.archived_at is not null and new.archived_at is distinct from old.archived_at then
      raise exception 'un registro archivado conserva su archived_at' using errcode = '23000';
    end if;

    if (to_jsonb(new) - 'archived_at' - 'updated_at')
       is distinct from (to_jsonb(old) - 'archived_at' - 'updated_at') then
      raise exception 'un registro archivado es de solo lectura: restauralo antes de editarlo'
        using errcode = '23000';
    end if;

    if new.archived_at is not null then
      return new; -- UPDATE sin cambios reales sobre un archivado: no hay evento
    end if;
    v_action := 'restored';
  else
    -- DH-04: tecnico con ordenes abiertas asignadas. DH-05: cliente con ordenes abiertas.
    if v_type = 'technician' and exists (
      select 1 from public.work_orders w
      where w.organization_id = new.organization_id
        and w.technician_id = new.id
        and w.status in ('assigned', 'in_progress')
    ) then
      raise exception 'el tecnico tiene ordenes abiertas asignadas: reasignalas o cierralas antes de archivarlo'
        using errcode = 'NX004';
    end if;
    if v_type = 'customer' and exists (
      select 1 from public.work_orders w
      where w.organization_id = new.organization_id
        and w.customer_id = new.id
        and w.status in ('pending', 'assigned', 'in_progress')
    ) then
      raise exception 'el cliente tiene ordenes abiertas: cierralas o cancelalas antes de archivarlo'
        using errcode = 'NX004';
    end if;
    new.archived_at := now(); -- la hora la fija el servidor
    v_action := 'archived';
  end if;

  if v_actor is null then
    raise exception 'archivar o restaurar requiere un usuario autenticado' using errcode = '23000';
  end if;

  insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
  values (new.organization_id, v_actor, v_type, new.id, v_action);

  return new;
end;
$$;

revoke execute on function private.prevent_unarchive() from public, anon, authenticated;
