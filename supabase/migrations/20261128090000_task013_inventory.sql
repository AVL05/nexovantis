-- TASK-013 / F6: inventario y movimientos de stock (BR07, P1) y eventos de actividad (BR08, DH-08 P1).
-- Decisiones aprobadas por el humano (2026-11-25), registradas en docs/BUSINESS_RULES.md:
--  INV-1 cantidades ENTERAS; unidad = etiqueta de lista cerrada (ud, m, kg, l, caja).
--  INV-2 referencia unica por organizacion sin distinguir mayusculas e inmutable tras el alta;
--        nombre, descripcion, unidad y umbral editables.
--  INV-3 el articulo nace con saldo 0; la existencia inicial es una entrada; el saldo NO se edita
--        directamente, solo cambia por movimientos (el trigger del movimiento es el unico que puede).
--  INV-4 movimientos entrada/salida/consumo, cantidad > 0, nota opcional <= 200 caracteres; sin
--        anulaciones ni borrados (la correccion es un movimiento contrario). Saldo nunca negativo:
--        bloqueo de fila (FOR UPDATE) + CHECK (quantity >= 0) en la base.
--  INV-5 idempotencia: clave UUID por envio, unica por organizacion; el reintento con el mismo
--        contenido devuelve el movimiento original sin duplicar; con contenido distinto se rechaza.
--  INV-6 consumo solo sobre ordenes de la MISMA organizacion en estado no terminal (pendiente,
--        asignada, en curso); consumo, movimiento y evento en la misma transaccion.
--  INV-7 agotado = saldo 0; bajo = saldo > 0 y <= umbral; umbral 0 desactiva "bajo" (stock_status).
--  INV-8 archivar permitido con cualquier saldo; archivado = solo lectura y sin movimientos;
--        restaurable; historial conservado; archivar y restaurar generan evento.
--  INV-9 owner y member pueden crear, editar y mover (como el CRM).
--
-- Diseno (mismo patron que TASK-011/012):
--  * inventory_items, stock_movements e inventory_event_details: RLS por organizacion y SOLO SELECT para
--    usuarios. Toda escritura pasa por RPC public.* (envoltorios INVOKER) sobre funciones SECURITY
--    DEFINER del esquema private (search_path vacio, EXECUTE solo authenticated; sin anon ni PUBLIC).
--    La organizacion se deriva de la membresia de auth.uid() (private.require_org), nunca del cliente.
--  * Las reglas viven en triggers de las tablas: aplican a cualquier via de escritura.
--  * Eventos (DH-08): activity_events + inventory_event_details (cantidad, saldo anterior/nuevo, orden;
--    SIN la nota libre) los escriben triggers en la MISMA transaccion. Actor = auth.uid(), nunca nulo.
--  * Orden de bloqueo unico: articulo (FOR UPDATE) -> orden (FOR SHARE). Ningun camino bloquea una
--    orden y despues un articulo, asi que no hay ciclo (sin deadlock). Las claves de idempotencia se
--    serializan con un advisory lock de transaccion tomado ANTES de los bloqueos de fila.
--  * Errores de dominio (SQLSTATE propios; la app los traduce a mensajes seguros):
--      NX020 articulo inexistente (o de otra organizacion)   NX021 articulo archivado: solo lectura
--      NX022 saldo insuficiente                              NX023 orden no valida para consumo
--      NX024 clave de idempotencia usada con otro contenido  NX025 referencia ya existente
--      NX026 saldo maximo superado
--  * DESVIACION DOCUMENTADA (INV-6): stock_movements.order_id NO lleva clave foranea a work_orders. Una
--    FK haria que TRUNCATE public.work_orders fallase con 0A000 antes de que el trigger de
--    inmutabilidad lo rechace con 23000 (contrato de F4 verificado por tests/integration/independent/
--    work-orders-post.test.ts). La integridad (misma organizacion y estado no terminal) la garantiza el
--    trigger stock_movements_apply, que bloquea la orden con FOR SHARE en la propia transaccion; las
--    ordenes no se borran ni se vacian (work_orders_prevent_delete / _truncate).

-- ---------------------------------------------------------------------------------------------
-- 1. Eventos de actividad y fixtures: inventario
-- ---------------------------------------------------------------------------------------------
alter table public.activity_events
  drop constraint activity_events_entity_action_check,
  drop constraint activity_events_entity_type_check,
  drop constraint activity_events_action_check,
  add constraint activity_events_entity_type_check
    check (entity_type in ('customer', 'technician', 'work_order', 'quote', 'inventory_item')),
  add constraint activity_events_action_check
    check (action in (
      'archived', 'restored', 'created', 'status_changed', 'assigned', 'reassigned', 'cancelled',
      'accepted', 'rejected', 'stock_in', 'stock_out', 'stock_consumed'
    )),
  add constraint activity_events_entity_action_check check (
    (entity_type in ('customer', 'technician') and action in ('archived', 'restored'))
    or (entity_type = 'work_order' and action in ('created', 'status_changed', 'assigned', 'reassigned', 'cancelled'))
    or (entity_type = 'quote' and action in ('created', 'accepted', 'rejected'))
    or (entity_type = 'inventory_item' and action in (
      'created', 'archived', 'restored', 'stock_in', 'stock_out', 'stock_consumed'
    ))
  );

alter table private.demo_fixture_identity
  drop constraint demo_fixture_identity_entity_type_check,
  add constraint demo_fixture_identity_entity_type_check
    check (entity_type in ('customer', 'technician', 'work_order', 'quote', 'inventory_item'));

-- ---------------------------------------------------------------------------------------------
-- 2. Tablas
-- ---------------------------------------------------------------------------------------------
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  reference text not null,
  name text not null,
  description text,
  unit text not null,
  low_stock_threshold integer not null default 0,
  -- Saldo actual. Solo cambia por movimientos (inventory_items_guard).
  quantity integer not null default 0,
  -- INV-7. Derivado por la base: permite filtrar y contar sin comparar columnas desde PostgREST.
  stock_status text generated always as (
    case when quantity = 0 then 'out' when quantity <= low_stock_threshold then 'low' else 'ok' end
  ) stored,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_organization_id_id_key unique (organization_id, id),
  constraint inventory_items_reference_check check (
    char_length(reference) between 1 and 40
    and reference !~ '[[:cntrl:]]'
    and reference ~ '^[^[:space:]](.*[^[:space:]])?$'
  ),
  constraint inventory_items_name_check check (
    char_length(name) <= 120
    and name ~ '[^ \t\n\r\v\f   -     　﻿]'
  ),
  constraint inventory_items_description_check check (char_length(description) <= 500),
  constraint inventory_items_unit_check check (unit in ('ud', 'm', 'kg', 'l', 'caja')),
  constraint inventory_items_threshold_check check (low_stock_threshold between 0 and 1000000),
  constraint inventory_items_quantity_check check (quantity between 0 and 1000000000)
);

-- INV-2: la referencia es unica por organizacion SIN distinguir mayusculas.
create unique index inventory_items_org_reference_key
  on public.inventory_items (organization_id, lower(reference));
create index inventory_items_org_name_idx on public.inventory_items (organization_id, name, id);
create index inventory_items_org_status_idx
  on public.inventory_items (organization_id, archived_at, stock_status);

-- seq se asigna DENTRO del trigger BEFORE INSERT, despues de bloquear el articulo (FOR UPDATE): asi su
-- orden coincide con el orden real de aplicacion y con la cadena balance_before/balance_after. No hay
-- DEFAULT (un default se evaluaria antes del bloqueo) y el trigger sobrescribe cualquier valor recibido.
create sequence public.stock_movements_seq_seq as bigint;

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  -- Orden total de insercion (created_at es la hora de INICIO de la transaccion y puede coincidir).
  seq bigint not null,
  organization_id uuid not null references public.organizations (id),
  item_id uuid not null,
  kind text not null,
  quantity integer not null,
  balance_before integer not null,
  balance_after integer not null,
  order_id uuid,
  note text,
  -- INV-5: clave de idempotencia por envio, unica por organizacion.
  request_id uuid not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint stock_movements_organization_id_id_key unique (organization_id, id),
  constraint stock_movements_request_key unique (organization_id, request_id),
  constraint stock_movements_seq_key unique (seq),
  -- BR01: articulo de la MISMA organizacion (clave foranea compuesta). Sin ON DELETE.
  constraint stock_movements_item_fkey foreign key (organization_id, item_id)
    references public.inventory_items (organization_id, id),
  constraint stock_movements_kind_check check (kind in ('in', 'out', 'consumption')),
  constraint stock_movements_quantity_check check (quantity between 1 and 1000000),
  constraint stock_movements_note_check check (char_length(note) <= 200),
  -- El consumo se vincula siempre a una orden; entradas y salidas, nunca.
  constraint stock_movements_order_check check ((kind = 'consumption') = (order_id is not null)),
  -- El saldo posterior es coherente con el movimiento y nunca negativo (BR07).
  constraint stock_movements_balance_check check (
    balance_before >= 0 and balance_after >= 0
    and (
      (kind = 'in' and balance_after = balance_before + quantity)
      or (kind in ('out', 'consumption') and balance_after = balance_before - quantity)
    )
  )
);

alter sequence public.stock_movements_seq_seq owned by public.stock_movements.seq;

create index stock_movements_item_idx on public.stock_movements (organization_id, item_id, seq desc);
create index stock_movements_order_idx
  on public.stock_movements (organization_id, order_id) where order_id is not null;

-- Detalle estructurado de los eventos de stock. event_id enlaza con activity_events.id SIN clave
-- foranea a proposito (mismo criterio que work_order_event_details). SIN la nota libre (BR08: sin
-- datos innecesarios).
create table public.inventory_event_details (
  event_id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  movement_id uuid not null,
  quantity integer not null,
  balance_before integer not null,
  balance_after integer not null,
  order_id uuid,
  constraint inventory_event_details_values_check check (
    quantity > 0 and balance_before >= 0 and balance_after >= 0
  )
);
create index inventory_event_details_org_idx on public.inventory_event_details (organization_id);

-- ---------------------------------------------------------------------------------------------
-- 3. RLS y privilegios: solo lectura para usuarios
-- ---------------------------------------------------------------------------------------------
alter table public.inventory_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.inventory_event_details enable row level security;
revoke all on table public.inventory_items from public, anon, authenticated;
revoke all on table public.stock_movements from public, anon, authenticated;
revoke all on table public.inventory_event_details from public, anon, authenticated;
revoke all on sequence public.stock_movements_seq_seq from public, anon, authenticated;
grant select on table public.inventory_items to authenticated;
grant select on table public.stock_movements to authenticated;
grant select on table public.inventory_event_details to authenticated;

create policy inventory_items_select_member on public.inventory_items
  for select to authenticated
  using (private.is_org_member(organization_id));
create policy stock_movements_select_member on public.stock_movements
  for select to authenticated
  using (private.is_org_member(organization_id));
create policy inventory_event_details_select_member on public.inventory_event_details
  for select to authenticated
  using (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------------------------
-- 4. Triggers
-- ---------------------------------------------------------------------------------------------
-- Articulo: nace con saldo 0 y activo; referencia inmutable; saldo solo por el trigger de movimientos;
-- archivado de solo lectura (solo se restaura); archivar y restaurar no se combinan con ediciones.
create function private.inventory_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.quantity <> 0 then
      raise exception 'un articulo nace con saldo 0: la existencia inicial es una entrada' using errcode = '23000';
    end if;
    if new.archived_at is not null then
      raise exception 'un articulo nace activo' using errcode = '23000';
    end if;
    return new;
  end if;

  if new.reference is distinct from old.reference or new.created_at is distinct from old.created_at then
    raise exception 'la referencia de un articulo no cambia' using errcode = '23000';
  end if;

  -- Un archivado es de solo lectura: solo cambia archived_at (restaurar). Sin edicion combinada.
  if old.archived_at is not null then
    if new.archived_at is not null and new.archived_at is distinct from old.archived_at then
      raise exception 'un articulo archivado conserva su archived_at' using errcode = 'NX021';
    end if;
    if (to_jsonb(new) - 'archived_at' - 'updated_at' - 'stock_status') is distinct from (to_jsonb(old) - 'archived_at' - 'updated_at' - 'stock_status') then
      raise exception 'un articulo archivado es de solo lectura: restauralo antes de modificarlo'
        using errcode = 'NX021';
    end if;
    return new;
  end if;

  -- Saldo: solo lo cambia el trigger de movimientos (se ejecuta dentro de otro trigger: profundidad >= 2).
  if new.quantity is distinct from old.quantity and pg_trigger_depth() < 2 then
    raise exception 'el saldo solo cambia por movimientos de stock' using errcode = '23000';
  end if;

  if new.archived_at is not null then
    -- Archivar: la hora la fija el servidor y no se combina con ediciones.
    if (to_jsonb(new) - 'archived_at' - 'updated_at' - 'stock_status') is distinct from (to_jsonb(old) - 'archived_at' - 'updated_at' - 'stock_status') then
      raise exception 'archivar no se combina con otras modificaciones' using errcode = '23000';
    end if;
    new.archived_at := now();
  end if;
  return new;
end;
$$;

-- Evento de actividad del articulo (alta, archivado, restauracion). Actor = auth.uid(): sin actor no hay evento.
create function private.inventory_items_record_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'el inventario requiere un usuario autenticado (actor de los eventos)' using errcode = '23000';
  end if;
  insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
  values (
    new.organization_id, v_actor, 'inventory_item', new.id,
    case
      when tg_op = 'INSERT' then 'created'
      when new.archived_at is not null then 'archived'
      else 'restored'
    end
  );
  return null;
end;
$$;

create function private.prevent_inventory_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'el inventario y sus movimientos no se borran ni se modifican (% sobre %)', tg_op, tg_table_name
    using errcode = '23000';
end;
$$;

-- Movimiento (BEFORE INSERT): bloquea el articulo, valida estado y saldo, bloquea la orden en consumos
-- y aplica el nuevo saldo. Es el UNICO camino que cambia inventory_items.quantity.
create function private.stock_movements_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_item public.inventory_items%rowtype;
  v_status text;
  v_after bigint;
begin
  if v_actor is null then
    raise exception 'los movimientos requieren un usuario autenticado (actor de los eventos)' using errcode = '23000';
  end if;
  if new.kind is null or new.kind not in ('in', 'out', 'consumption') then
    raise exception 'tipo de movimiento no valido' using errcode = '23514';
  end if;
  if new.quantity is null or new.quantity < 1 or new.quantity > 1000000 then
    raise exception 'la cantidad de un movimiento debe estar entre 1 y 1000000' using errcode = '23514';
  end if;
  new.created_by := v_actor;

  select * into v_item from public.inventory_items i
    where i.id = new.item_id and i.organization_id = new.organization_id
    for update;
  if not found then
    raise exception 'articulo no encontrado' using errcode = 'NX020';
  end if;
  if v_item.archived_at is not null then
    raise exception 'un articulo archivado es de solo lectura: no admite movimientos' using errcode = 'NX021';
  end if;

  -- Tras el bloqueo del articulo: el orden de seq es el orden de aplicacion. Siempre lo fija el trigger.
  new.seq := nextval('public.stock_movements_seq_seq');
  new.balance_before := v_item.quantity;
  v_after := case new.kind when 'in' then v_item.quantity::bigint + new.quantity
                           else v_item.quantity::bigint - new.quantity end;
  if v_after < 0 then
    raise exception 'saldo insuficiente' using errcode = 'NX022';
  end if;
  if v_after > 1000000000 then
    raise exception 'el saldo maximo es 1000000000' using errcode = 'NX026';
  end if;
  new.balance_after := v_after;

  if new.kind = 'consumption' then
    -- INV-6: orden de la misma organizacion en estado no terminal. FOR SHARE: una cancelacion o
    -- finalizacion concurrente espera a este consumo (o este ve el estado ya terminal).
    select w.status into v_status from public.work_orders w
      where w.id = new.order_id and w.organization_id = new.organization_id
      for share;
    if not found or v_status not in ('pending', 'assigned', 'in_progress') then
      raise exception 'el consumo requiere una orden de la organizacion pendiente, asignada o en curso'
        using errcode = 'NX023';
    end if;
  end if;

  update public.inventory_items set quantity = v_after::integer
    where id = v_item.id and organization_id = v_item.organization_id;
  return new;
end;
$$;

-- Movimiento (AFTER INSERT): evento y detalle estructurado en la misma transaccion (sin la nota libre).
create function private.stock_movements_record_event()
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
    raise exception 'los movimientos requieren un usuario autenticado (actor de los eventos)' using errcode = '23000';
  end if;
  insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
  values (
    new.organization_id, v_actor, 'inventory_item', new.item_id,
    case new.kind when 'in' then 'stock_in' when 'out' then 'stock_out' else 'stock_consumed' end
  )
  returning id into v_event;
  insert into public.inventory_event_details
    (event_id, organization_id, movement_id, quantity, balance_before, balance_after, order_id)
  values
    (v_event, new.organization_id, new.id, new.quantity, new.balance_before, new.balance_after, new.order_id);
  return null;
end;
$$;

revoke execute on function private.inventory_items_guard() from public, anon, authenticated;
revoke execute on function private.inventory_items_record_event() from public, anon, authenticated;
revoke execute on function private.prevent_inventory_change() from public, anon, authenticated;
revoke execute on function private.stock_movements_apply() from public, anon, authenticated;
revoke execute on function private.stock_movements_record_event() from public, anon, authenticated;

create trigger inventory_items_guard
  before insert or update on public.inventory_items
  for each row execute function private.inventory_items_guard();
create trigger inventory_items_prevent_organization_change
  before update on public.inventory_items
  for each row execute function private.prevent_organization_change();
create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function private.set_updated_at();
create trigger inventory_items_prevent_delete
  before delete on public.inventory_items
  for each row execute function private.prevent_inventory_change();
create trigger inventory_items_prevent_truncate
  before truncate on public.inventory_items
  for each statement execute function private.prevent_inventory_change();
create trigger inventory_items_event_insert
  after insert on public.inventory_items
  for each row execute function private.inventory_items_record_event();
create trigger inventory_items_event_update
  after update on public.inventory_items
  for each row
  when (old.archived_at is distinct from new.archived_at)
  execute function private.inventory_items_record_event();

create trigger stock_movements_apply
  before insert on public.stock_movements
  for each row execute function private.stock_movements_apply();
create trigger stock_movements_event_insert
  after insert on public.stock_movements
  for each row execute function private.stock_movements_record_event();
create trigger stock_movements_prevent_change
  before update or delete on public.stock_movements
  for each row execute function private.prevent_inventory_change();
create trigger stock_movements_prevent_truncate
  before truncate on public.stock_movements
  for each statement execute function private.prevent_inventory_change();

create trigger inventory_event_details_prevent_change
  before update or delete on public.inventory_event_details
  for each row execute function private.prevent_event_change();
create trigger inventory_event_details_prevent_truncate
  before truncate on public.inventory_event_details
  for each statement execute function private.prevent_event_change();

-- ---------------------------------------------------------------------------------------------
-- 5. Funciones RPC (unica via de escritura). Organizacion siempre derivada de auth.uid().
-- ---------------------------------------------------------------------------------------------
-- Alta. p_id lo genera la app por formulario: un reintento o doble envio con el mismo id devuelve el
-- articulo ya creado sin duplicarlo ni repetir eventos. El saldo inicial es siempre 0.
create function private.create_inventory_item(
  p_id uuid,
  p_reference text,
  p_name text,
  p_description text,
  p_unit text,
  p_low_stock_threshold integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_reference text := btrim(p_reference);
  v_existing uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('nexovantis.inventory.create:' || v_id::text, 0));
  select i.organization_id into v_existing from public.inventory_items i where i.id = v_id;
  if found then
    if v_existing <> v_org then
      raise exception 'identificador no disponible' using errcode = '23505';
    end if;
    return v_id;
  end if;

  if exists (
    select 1 from public.inventory_items i
      where i.organization_id = v_org and lower(i.reference) = lower(v_reference)
  ) then
    raise exception 'ya existe un articulo con esa referencia' using errcode = 'NX025';
  end if;

  begin
    insert into public.inventory_items
      (id, organization_id, reference, name, description, unit, low_stock_threshold)
    values (v_id, v_org, v_reference, p_name, p_description, p_unit, coalesce(p_low_stock_threshold, 0));
  exception when unique_violation then
    -- Carrera con otra alta de la misma referencia (indice unico por organizacion).
    raise exception 'ya existe un articulo con esa referencia' using errcode = 'NX025';
  end;
  return v_id;
end;
$$;

-- Edicion de nombre, descripcion, unidad y umbral. La referencia y el saldo no cambian.
create function private.update_inventory_item(
  p_id uuid,
  p_name text,
  p_description text,
  p_unit text,
  p_low_stock_threshold integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_archived timestamptz;
begin
  select i.archived_at into v_archived from public.inventory_items i
    where i.id = p_id and i.organization_id = v_org for update;
  if not found then
    raise exception 'articulo no encontrado' using errcode = 'NX020';
  end if;
  if v_archived is not null then
    raise exception 'un articulo archivado es de solo lectura' using errcode = 'NX021';
  end if;
  update public.inventory_items
    set name = p_name, description = p_description, unit = p_unit,
        low_stock_threshold = coalesce(p_low_stock_threshold, 0)
    where id = p_id and organization_id = v_org;
end;
$$;

-- Archivar / restaurar. Devuelve true si cambio algo; repetir es un no-op sin evento.
create function private.archive_inventory_item(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_archived timestamptz;
begin
  select i.archived_at into v_archived from public.inventory_items i
    where i.id = p_id and i.organization_id = v_org for update;
  if not found then
    raise exception 'articulo no encontrado' using errcode = 'NX020';
  end if;
  if v_archived is not null then
    return false;
  end if;
  update public.inventory_items set archived_at = now() where id = p_id and organization_id = v_org;
  return true;
end;
$$;

create function private.restore_inventory_item(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_archived timestamptz;
begin
  select i.archived_at into v_archived from public.inventory_items i
    where i.id = p_id and i.organization_id = v_org for update;
  if not found then
    raise exception 'articulo no encontrado' using errcode = 'NX020';
  end if;
  if v_archived is null then
    return false;
  end if;
  update public.inventory_items set archived_at = null where id = p_id and organization_id = v_org;
  return true;
end;
$$;

-- Movimiento de stock idempotente (INV-4, INV-5, INV-6). Devuelve {id, balance, replayed}. La clave
-- p_request_id se serializa con un advisory lock de transaccion (antes de cualquier bloqueo de fila):
-- dos envios simultaneos con la misma clave producen UN movimiento y el segundo recibe el original.
-- Misma clave con otro contenido (articulo, tipo, cantidad, orden o nota) -> NX024.
create function private.record_stock_movement(
  p_request_id uuid,
  p_item_id uuid,
  p_kind text,
  p_quantity integer,
  p_order_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_note text := nullif(btrim(p_note), '');
  v_old public.stock_movements%rowtype;
  v_id uuid;
  v_balance integer;
begin
  if p_request_id is null or p_item_id is null then
    raise exception 'faltan la clave de envio o el articulo' using errcode = '23514';
  end if;
  if p_kind is null or p_kind not in ('in', 'out', 'consumption') then
    raise exception 'tipo de movimiento no valido' using errcode = '23514';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000000 then
    raise exception 'la cantidad debe estar entre 1 y 1000000' using errcode = '23514';
  end if;
  if char_length(v_note) > 200 then
    raise exception 'la nota admite como maximo 200 caracteres' using errcode = '23514';
  end if;
  if (p_kind = 'consumption') <> (p_order_id is not null) then
    raise exception 'el consumo exige una orden y las entradas y salidas no la admiten' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('nexovantis.stock.request:' || v_org::text || ':' || p_request_id::text, 0)
  );
  select * into v_old from public.stock_movements m
    where m.organization_id = v_org and m.request_id = p_request_id;
  if found then
    if v_old.item_id = p_item_id and v_old.kind = p_kind and v_old.quantity = p_quantity
       and v_old.order_id is not distinct from p_order_id and v_old.note is not distinct from v_note then
      return jsonb_build_object('id', v_old.id, 'balance', v_old.balance_after, 'replayed', true);
    end if;
    raise exception 'la clave de envio ya se uso con otro contenido' using errcode = 'NX024';
  end if;

  -- balance_before, balance_after y created_by los fija el trigger stock_movements_apply.
  insert into public.stock_movements (organization_id, item_id, kind, quantity, order_id, note, request_id)
  values (v_org, p_item_id, p_kind, p_quantity, p_order_id, v_note, p_request_id)
  returning id, balance_after into v_id, v_balance;
  return jsonb_build_object('id', v_id, 'balance', v_balance, 'replayed', false);
end;
$$;

revoke execute on function private.create_inventory_item(uuid, text, text, text, text, integer) from public, anon;
revoke execute on function private.update_inventory_item(uuid, text, text, text, integer) from public, anon;
revoke execute on function private.archive_inventory_item(uuid) from public, anon;
revoke execute on function private.restore_inventory_item(uuid) from public, anon;
revoke execute on function private.record_stock_movement(uuid, uuid, text, integer, uuid, text) from public, anon;
grant execute on function private.create_inventory_item(uuid, text, text, text, text, integer) to authenticated;
grant execute on function private.update_inventory_item(uuid, text, text, text, integer) to authenticated;
grant execute on function private.archive_inventory_item(uuid) to authenticated;
grant execute on function private.restore_inventory_item(uuid) to authenticated;
grant execute on function private.record_stock_movement(uuid, uuid, text, integer, uuid, text) to authenticated;

-- Envoltorios publicos (PostgREST solo expone public): SECURITY INVOKER de una linea.
create function public.create_inventory_item(
  p_id uuid, p_reference text, p_name text, p_description text, p_unit text,
  p_low_stock_threshold integer default 0
)
returns uuid
language sql
set search_path = ''
as $$ select private.create_inventory_item($1, $2, $3, $4, $5, $6) $$;

create function public.update_inventory_item(
  p_id uuid, p_name text, p_description text, p_unit text, p_low_stock_threshold integer
)
returns void
language sql
set search_path = ''
as $$ select private.update_inventory_item($1, $2, $3, $4, $5) $$;

create function public.archive_inventory_item(p_id uuid)
returns boolean
language sql
set search_path = ''
as $$ select private.archive_inventory_item($1) $$;

create function public.restore_inventory_item(p_id uuid)
returns boolean
language sql
set search_path = ''
as $$ select private.restore_inventory_item($1) $$;

create function public.record_stock_movement(
  p_request_id uuid, p_item_id uuid, p_kind text, p_quantity integer,
  p_order_id uuid default null, p_note text default null
)
returns jsonb
language sql
set search_path = ''
as $$ select private.record_stock_movement($1, $2, $3, $4, $5, $6) $$;

revoke execute on function public.create_inventory_item(uuid, text, text, text, text, integer) from public, anon;
revoke execute on function public.update_inventory_item(uuid, text, text, text, integer) from public, anon;
revoke execute on function public.archive_inventory_item(uuid) from public, anon;
revoke execute on function public.restore_inventory_item(uuid) from public, anon;
revoke execute on function public.record_stock_movement(uuid, uuid, text, integer, uuid, text) from public, anon;
grant execute on function public.create_inventory_item(uuid, text, text, text, text, integer) to authenticated;
grant execute on function public.update_inventory_item(uuid, text, text, text, integer) to authenticated;
grant execute on function public.archive_inventory_item(uuid) to authenticated;
grant execute on function public.restore_inventory_item(uuid) to authenticated;
grant execute on function public.record_stock_movement(uuid, uuid, text, integer, uuid, text) to authenticated;
