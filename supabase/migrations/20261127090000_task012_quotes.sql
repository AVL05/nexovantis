-- TASK-012 / F5: presupuestos (BR05, BR06) con la politica de dinero aprobada por el humano.
-- Todas las invariantes viven en PostgreSQL: no dependen de la UI ni de las Server Actions.
--
-- Politica de importes (BR06):
--  * Moneda unica EUR; importes en centimos ENTEROS (bigint). Sin float/double/real en ningun punto.
--  * IVA por concepto en puntos basicos enteros (2100 = 21 %), por defecto 2100, rango 0..10000.
--  * Cantidad numeric(9,3) (hasta 3 decimales, > 0, <= 100000). Precio unitario en centimos, 0..100000000.
--  * Por linea: subtotal = half-up(cantidad x precio) y IVA = half-up(subtotal x tasa / 10000),
--    calculados con ARITMETICA ENTERA (cantidad en milesimas): (x + mitad) / divisor con bigint
--    trunca hacia cero y los valores son no negativos, asi que equivale a half-up exacto.
--    Redondeo SOLO por linea. Total = suma de subtotales + suma de IVA de linea.
--  * Limites elegidos para que ninguna cuenta desborde bigint ni los enteros seguros de JavaScript:
--    subtotal de linea <= 10^13, <= 100 conceptos => total del presupuesto <= 2 x 10^15 < 2^53.
--  * Los totales (de linea y de presupuesto) los fija PostgreSQL en triggers: ningun cliente puede
--    escribirlos ni siquiera por SQL de administracion (el trigger los sobrescribe).
--
-- Diseno (mismo patron que TASK-011):
--  * quotes y quote_items: RLS por organizacion y SOLO SELECT para usuarios. Toda escritura pasa por
--    RPC public.* (envoltorios INVOKER) sobre funciones SECURITY DEFINER del esquema private
--    (search_path vacio, EXECUTE solo authenticated; sin anon ni PUBLIC). La organizacion se deriva
--    de la membresia de auth.uid() (private.require_org), nunca del cliente.
--  * Las reglas estan en triggers de las tablas (quotes_guard, quote_items_guard): se aplican a
--    cualquier via de escritura. Aceptado/rechazado es de solo lectura (presupuesto y conceptos).
--  * Aceptar: UNA transaccion; bloquea el presupuesto (FOR UPDATE), crea EXACTAMENTE una orden con
--    private.create_work_order (misma logica, triggers y eventos del modulo de ordenes), enlaza
--    quote.order_id (UNIQUE) y deja el evento 'accepted'. Repetir devuelve la misma orden.
--  * Numeracion legible por organizacion: contador por organizacion (private.quote_counters)
--    incrementado en la misma transaccion del alta (sin huecos si la transaccion falla).
--  * Errores de dominio (SQLSTATE propios; la app los traduce a mensajes seguros):
--      NX010 presupuesto inexistente (o de otra organizacion)  NX011 presupuesto terminal: solo lectura
--      NX012 decision contraria sobre un presupuesto terminal   NX013 cliente no valido
--      NX014 concepto inexistente                               NX015 maximo de conceptos superado
--      NX016 no se puede aceptar un presupuesto sin conceptos

-- ---------------------------------------------------------------------------------------------
-- 1. Eventos de actividad y fixtures: presupuestos
-- ---------------------------------------------------------------------------------------------
alter table public.activity_events
  drop constraint activity_events_entity_action_check,
  drop constraint activity_events_entity_type_check,
  drop constraint activity_events_action_check,
  add constraint activity_events_entity_type_check
    check (entity_type in ('customer', 'technician', 'work_order', 'quote')),
  add constraint activity_events_action_check
    check (action in (
      'archived', 'restored', 'created', 'status_changed', 'assigned', 'reassigned', 'cancelled',
      'accepted', 'rejected'
    )),
  add constraint activity_events_entity_action_check check (
    (entity_type in ('customer', 'technician') and action in ('archived', 'restored'))
    or (entity_type = 'work_order' and action in ('created', 'status_changed', 'assigned', 'reassigned', 'cancelled'))
    or (entity_type = 'quote' and action in ('created', 'accepted', 'rejected'))
  );

alter table private.demo_fixture_identity
  drop constraint demo_fixture_identity_entity_type_check,
  add constraint demo_fixture_identity_entity_type_check
    check (entity_type in ('customer', 'technician', 'work_order', 'quote'));

-- ---------------------------------------------------------------------------------------------
-- 2. Contador de numeracion por organizacion (no accesible para usuarios)
-- ---------------------------------------------------------------------------------------------
create table private.quote_counters (
  organization_id uuid primary key references public.organizations (id),
  last_number bigint not null,
  constraint quote_counters_last_number_check check (last_number >= 0)
);
alter table private.quote_counters enable row level security;
revoke all on table private.quote_counters from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Tablas
-- ---------------------------------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  number bigint not null,
  customer_id uuid not null,
  title text not null,
  description text,
  status text not null default 'draft',
  order_id uuid,
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_organization_id_id_key unique (organization_id, id),
  constraint quotes_organization_number_key unique (organization_id, number),
  -- BR05: una orden proviene de, como mucho, un presupuesto (y un presupuesto genera una orden).
  constraint quotes_order_id_key unique (order_id),
  -- BR01: cliente de la MISMA organizacion (clave foranea compuesta). Sin ON DELETE.
  constraint quotes_customer_fkey foreign key (organization_id, customer_id)
    references public.customers (organization_id, id),
  -- order_id NO lleva clave foranea a proposito (mismo criterio que work_order_event_details.event_id
  -- en TASK-011): una FK hacia work_orders haria que TRUNCATE public.work_orders fallase con 0A000
  -- antes de que el trigger de inmutabilidad lo rechace con 23000 (contrato de F4). La integridad la
  -- garantizan quotes_guard (la orden existe, es de la MISMA organizacion y del MISMO cliente: se
  -- comprueba en la propia transaccion de aceptacion), UNIQUE(order_id) y que las ordenes no se
  -- borran ni se vacian (work_orders_prevent_delete / _truncate).
  constraint quotes_number_check check (number > 0),
  constraint quotes_title_check check (
    char_length(title) <= 120
    and title ~ '[^ \t\n\r\v\f   -     　﻿]'
  ),
  -- 1500 deja margen para la linea de origen que se anade a la descripcion de la orden (<= 2000).
  constraint quotes_description_check check (char_length(description) <= 1500),
  constraint quotes_status_check check (status in ('draft', 'accepted', 'rejected')),
  constraint quotes_order_status_check check ((status = 'accepted') = (order_id is not null)),
  constraint quotes_decision_check check (
    (status = 'draft' and decided_at is null and decided_by is null)
    or (status <> 'draft' and decided_at is not null and decided_by is not null)
  ),
  constraint quotes_totals_check check (
    subtotal_cents >= 0 and tax_cents >= 0 and total_cents = subtotal_cents + tax_cents
  )
);

create index quotes_org_created_idx on public.quotes (organization_id, created_at desc, id);
create index quotes_org_status_idx on public.quotes (organization_id, status);
create index quotes_org_customer_idx on public.quotes (organization_id, customer_id);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  quote_id uuid not null,
  position int not null,
  description text not null,
  quantity numeric(9, 3) not null,
  unit_price_cents bigint not null,
  tax_rate_bp integer not null default 2100,
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_items_quote_fkey foreign key (organization_id, quote_id)
    references public.quotes (organization_id, id),
  constraint quote_items_position_key unique (quote_id, position),
  constraint quote_items_position_check check (position > 0),
  constraint quote_items_description_check check (
    char_length(description) <= 200
    and description ~ '[^ \t\n\r\v\f   -     　﻿]'
  ),
  constraint quote_items_quantity_check check (quantity > 0 and quantity <= 100000),
  constraint quote_items_unit_price_check check (unit_price_cents >= 0 and unit_price_cents <= 100000000),
  constraint quote_items_tax_rate_check check (tax_rate_bp >= 0 and tax_rate_bp <= 10000),
  constraint quote_items_amounts_check check (subtotal_cents >= 0 and tax_cents >= 0)
);

create index quote_items_quote_idx on public.quote_items (organization_id, quote_id, position);

-- ---------------------------------------------------------------------------------------------
-- 4. RLS y privilegios: solo lectura para usuarios
-- ---------------------------------------------------------------------------------------------
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
revoke all on table public.quotes from public, anon, authenticated;
revoke all on table public.quote_items from public, anon, authenticated;
grant select on table public.quotes to authenticated;
grant select on table public.quote_items to authenticated;

create policy quotes_select_member on public.quotes
  for select to authenticated
  using (private.is_org_member(organization_id));
create policy quote_items_select_member on public.quote_items
  for select to authenticated
  using (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------------------------
-- Presupuesto: alta en borrador, edicion solo en borrador, decision terminal, totales derivados.
create function private.quotes_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub bigint;
  v_tax bigint;
  v_order public.work_orders%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.order_id is not null then
      raise exception 'un presupuesto nace en borrador' using errcode = 'NX012';
    end if;
    perform 1 from public.customers c
      where c.id = new.customer_id and c.organization_id = new.organization_id and c.archived_at is null
      for share;
    if not found then
      raise exception 'el cliente no existe, esta archivado o es de otra organizacion' using errcode = 'NX013';
    end if;
    new.subtotal_cents := 0;
    new.tax_cents := 0;
    new.total_cents := 0;
    return new;
  end if;

  -- UPDATE. Aceptado o rechazado: terminal y de solo lectura (sin excepcion por rol).
  if old.status <> 'draft' then
    if new.status is distinct from old.status then
      raise exception 'un presupuesto aceptado o rechazado no cambia de estado' using errcode = 'NX012';
    end if;
    if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      raise exception 'un presupuesto aceptado o rechazado es de solo lectura' using errcode = 'NX011';
    end if;
    return new;
  end if;

  if new.number is distinct from old.number or new.created_at is distinct from old.created_at then
    raise exception 'el numero de un presupuesto no cambia' using errcode = '23000';
  end if;

  if new.status = 'draft' then
    if new.customer_id is distinct from old.customer_id then
      perform 1 from public.customers c
        where c.id = new.customer_id and c.organization_id = new.organization_id and c.archived_at is null
        for share;
      if not found then
        raise exception 'el cliente no existe, esta archivado o es de otra organizacion' using errcode = 'NX013';
      end if;
    end if;
  else
    -- draft -> accepted | rejected: los campos descriptivos no cambian en la decision.
    if new.customer_id is distinct from old.customer_id
       or new.title is distinct from old.title
       or new.description is distinct from old.description then
      raise exception 'la decision no modifica el presupuesto' using errcode = 'NX011';
    end if;
    if new.decided_by is distinct from auth.uid() or auth.uid() is null then
      raise exception 'la decision requiere un usuario autenticado' using errcode = '23000';
    end if;
    new.decided_at := now();
    if new.status = 'accepted' then
      select * into v_order from public.work_orders w
        where w.id = new.order_id and w.organization_id = new.organization_id for share;
      if not found or v_order.customer_id is distinct from new.customer_id then
        raise exception 'la orden enlazada no existe o no corresponde al cliente' using errcode = '23503';
      end if;
    end if;
  end if;

  -- Totales: SIEMPRE derivados de los conceptos (fuente de verdad), nunca del llamador.
  select coalesce(sum(i.subtotal_cents), 0), coalesce(sum(i.tax_cents), 0)
    into v_sub, v_tax
    from public.quote_items i where i.quote_id = new.id;
  new.subtotal_cents := v_sub;
  new.tax_cents := v_tax;
  new.total_cents := v_sub + v_tax;
  return new;
end;
$$;

-- Evento de actividad en la misma transaccion (DH-08). Actor = auth.uid(): sin actor no hay evento.
create function private.quotes_record_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'los presupuestos requieren un usuario autenticado (actor de los eventos)' using errcode = '23000';
  end if;
  insert into public.activity_events (organization_id, actor_id, entity_type, entity_id, action)
  values (
    new.organization_id, v_actor, 'quote', new.id,
    case when tg_op = 'INSERT' then 'created' when new.status = 'accepted' then 'accepted' else 'rejected' end
  );
  return null;
end;
$$;

create function private.prevent_quote_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'los presupuestos no se borran (% sobre %)', tg_op, tg_table_name using errcode = '23000';
end;
$$;

-- Concepto: solo en presupuestos en borrador; calcula SUS importes (politica de redondeo).
create function private.quote_items_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote uuid;
  v_org uuid;
  v_status text;
  v_count int;
begin
  if tg_op = 'DELETE' then
    v_quote := old.quote_id;
    v_org := old.organization_id;
  else
    v_quote := new.quote_id;
    v_org := new.organization_id;
  end if;

  -- FOR UPDATE: serializa con aceptar/rechazar y con otros cambios de conceptos del mismo presupuesto.
  select q.status into v_status from public.quotes q
    where q.id = v_quote and q.organization_id = v_org for update;
  if not found then
    raise exception 'presupuesto no encontrado' using errcode = 'NX010';
  end if;
  if v_status <> 'draft' then
    raise exception 'un presupuesto aceptado o rechazado es de solo lectura' using errcode = 'NX011';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.quote_id is distinct from old.quote_id or new.organization_id is distinct from old.organization_id then
      raise exception 'un concepto no cambia de presupuesto' using errcode = '23000';
    end if;
  else
    select count(*) into v_count from public.quote_items i where i.quote_id = new.quote_id;
    if v_count >= 100 then
      raise exception 'un presupuesto admite como maximo 100 conceptos' using errcode = 'NX015';
    end if;
  end if;

  -- Aritmetica entera: cantidad en milesimas (exacta, escala 3); half-up por linea.
  new.subtotal_cents := ((new.quantity * 1000)::bigint * new.unit_price_cents + 500) / 1000;
  new.tax_cents := (new.subtotal_cents * new.tax_rate_bp + 5000) / 10000;
  return new;
end;
$$;

-- Tras cualquier cambio de conceptos se "toca" el presupuesto: quotes_guard recalcula los totales.
create function private.quote_items_touch_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote uuid := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  v_org uuid := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
begin
  update public.quotes set updated_at = now() where id = v_quote and organization_id = v_org;
  return null;
end;
$$;

revoke execute on function private.quotes_guard() from public, anon, authenticated;
revoke execute on function private.quotes_record_event() from public, anon, authenticated;
revoke execute on function private.prevent_quote_delete() from public, anon, authenticated;
revoke execute on function private.quote_items_guard() from public, anon, authenticated;
revoke execute on function private.quote_items_touch_quote() from public, anon, authenticated;

create trigger quotes_guard
  before insert or update on public.quotes
  for each row execute function private.quotes_guard();
create trigger quotes_prevent_organization_change
  before update on public.quotes
  for each row execute function private.prevent_organization_change();
create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function private.set_updated_at();
create trigger quotes_prevent_delete
  before delete on public.quotes
  for each row execute function private.prevent_quote_delete();
create trigger quotes_prevent_truncate
  before truncate on public.quotes
  for each statement execute function private.prevent_quote_delete();
create trigger quotes_event_insert
  after insert on public.quotes
  for each row execute function private.quotes_record_event();
create trigger quotes_event_update
  after update on public.quotes
  for each row
  when (old.status is distinct from new.status)
  execute function private.quotes_record_event();

create trigger quote_items_guard
  before insert or update or delete on public.quote_items
  for each row execute function private.quote_items_guard();
create trigger quote_items_set_updated_at
  before update on public.quote_items
  for each row execute function private.set_updated_at();
create trigger quote_items_prevent_truncate
  before truncate on public.quote_items
  for each statement execute function private.prevent_quote_delete();
create trigger quote_items_touch_quote
  after insert or update or delete on public.quote_items
  for each row execute function private.quote_items_touch_quote();

-- ---------------------------------------------------------------------------------------------
-- 6. Funciones auxiliares
-- ---------------------------------------------------------------------------------------------
create function private.quote_label(p_number bigint)
returns text
language sql
immutable
set search_path = ''
as $$ select 'PRE-' || lpad(p_number::text, 4, '0') $$;

-- Centimos -> "1234,56" (sin float; separador decimal es-ES).
create function private.format_cents(p_cents bigint)
returns text
language sql
immutable
set search_path = ''
as $$ select (p_cents / 100)::text || ',' || lpad((p_cents % 100)::text, 2, '0') $$;

revoke execute on function private.quote_label(bigint) from public, anon;
revoke execute on function private.format_cents(bigint) from public, anon;
grant execute on function private.quote_label(bigint) to authenticated;
grant execute on function private.format_cents(bigint) to authenticated;

-- Validacion de los datos de un concepto (la base es la autoridad; la UI y Zod solo avisan antes).
create function private.check_quote_item_values(p_quantity numeric, p_unit_price_cents bigint, p_tax_rate_bp int)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity > 100000 or p_quantity <> round(p_quantity, 3) then
    raise exception 'cantidad no valida (> 0, hasta 3 decimales, maximo 100000)' using errcode = '23514';
  end if;
  if p_unit_price_cents is null or p_unit_price_cents < 0 or p_unit_price_cents > 100000000 then
    raise exception 'precio unitario no valido' using errcode = '23514';
  end if;
  if p_tax_rate_bp is null or p_tax_rate_bp < 0 or p_tax_rate_bp > 10000 then
    raise exception 'tipo de IVA no valido (0 a 10000 puntos basicos)' using errcode = '23514';
  end if;
end;
$$;
revoke execute on function private.check_quote_item_values(numeric, bigint, int) from public, anon;
grant execute on function private.check_quote_item_values(numeric, bigint, int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. Funciones RPC (unica via de escritura). Organizacion siempre derivada de auth.uid().
-- ---------------------------------------------------------------------------------------------
-- Alta en borrador. p_id lo genera la app por formulario: un reintento o doble envio con el mismo id
-- devuelve el presupuesto ya creado sin duplicarlo ni consumir otro numero.
create function private.create_quote(
  p_id uuid,
  p_customer_id uuid,
  p_title text,
  p_description text
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
  v_number bigint;
begin
  -- Serializa los envios con el mismo id (reintentos simultaneos) antes de consumir un numero.
  perform pg_advisory_xact_lock(hashtextextended('nexovantis.quote.create:' || v_id::text, 0));
  select q.organization_id into v_existing from public.quotes q where q.id = v_id;
  if found then
    if v_existing <> v_org then
      raise exception 'identificador no disponible' using errcode = '23505';
    end if;
    return v_id;
  end if;

  insert into private.quote_counters as c (organization_id, last_number)
  values (v_org, 1)
  on conflict (organization_id) do update set last_number = c.last_number + 1
  returning c.last_number into v_number;

  insert into public.quotes (id, organization_id, number, customer_id, title, description)
  values (v_id, v_org, v_number, p_customer_id, p_title, p_description);
  return v_id;
end;
$$;

-- Edicion de cliente, titulo y descripcion. Solo en borrador (NX011 si es terminal).
create function private.update_quote(p_id uuid, p_customer_id uuid, p_title text, p_description text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_status text;
begin
  select q.status into v_status from public.quotes q
    where q.id = p_id and q.organization_id = v_org for update;
  if not found then
    raise exception 'presupuesto no encontrado' using errcode = 'NX010';
  end if;
  if v_status <> 'draft' then
    raise exception 'un presupuesto aceptado o rechazado es de solo lectura' using errcode = 'NX011';
  end if;
  update public.quotes
    set customer_id = p_customer_id, title = p_title, description = p_description
    where id = p_id and organization_id = v_org;
end;
$$;

-- Alta de concepto. p_item_id lo genera la app por formulario (reintento = mismo concepto).
create function private.add_quote_item(
  p_quote_id uuid,
  p_item_id uuid,
  p_description text,
  p_quantity numeric,
  p_unit_price_cents bigint,
  p_tax_rate_bp int default 2100
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_id uuid := coalesce(p_item_id, gen_random_uuid());
  v_status text;
  v_quote uuid;
  v_item_org uuid;
  v_position int;
begin
  select q.status into v_status from public.quotes q
    where q.id = p_quote_id and q.organization_id = v_org for update;
  if not found then
    raise exception 'presupuesto no encontrado' using errcode = 'NX010';
  end if;

  select i.quote_id, i.organization_id into v_quote, v_item_org from public.quote_items i where i.id = v_id;
  if found then
    if v_item_org <> v_org or v_quote <> p_quote_id then
      raise exception 'identificador no disponible' using errcode = '23505';
    end if;
    return v_id;
  end if;

  if v_status <> 'draft' then
    raise exception 'un presupuesto aceptado o rechazado es de solo lectura' using errcode = 'NX011';
  end if;
  perform private.check_quote_item_values(p_quantity, p_unit_price_cents, coalesce(p_tax_rate_bp, 2100));
  select coalesce(max(i.position), 0) + 1 into v_position from public.quote_items i where i.quote_id = p_quote_id;
  insert into public.quote_items
    (id, organization_id, quote_id, position, description, quantity, unit_price_cents, tax_rate_bp)
  values (v_id, v_org, p_quote_id, v_position, p_description, p_quantity, p_unit_price_cents,
          coalesce(p_tax_rate_bp, 2100));
  return v_id;
end;
$$;

create function private.update_quote_item(
  p_item_id uuid,
  p_description text,
  p_quantity numeric,
  p_unit_price_cents bigint,
  p_tax_rate_bp int default 2100
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_quote uuid;
  v_status text;
  v_rows int;
begin
  select i.quote_id into v_quote from public.quote_items i where i.id = p_item_id and i.organization_id = v_org;
  if not found then
    raise exception 'concepto no encontrado' using errcode = 'NX014';
  end if;
  select q.status into v_status from public.quotes q
    where q.id = v_quote and q.organization_id = v_org for update;
  if v_status <> 'draft' then
    raise exception 'un presupuesto aceptado o rechazado es de solo lectura' using errcode = 'NX011';
  end if;
  perform private.check_quote_item_values(p_quantity, p_unit_price_cents, coalesce(p_tax_rate_bp, 2100));
  update public.quote_items
    set description = p_description, quantity = p_quantity, unit_price_cents = p_unit_price_cents,
        tax_rate_bp = coalesce(p_tax_rate_bp, 2100)
    where id = p_item_id and organization_id = v_org;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'concepto no encontrado' using errcode = 'NX014';
  end if;
end;
$$;

-- Baja de concepto. Devuelve false si ya no existia (doble envio): no es un error.
create function private.remove_quote_item(p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_quote uuid;
  v_status text;
  v_rows int;
begin
  select i.quote_id into v_quote from public.quote_items i where i.id = p_item_id and i.organization_id = v_org;
  if not found then
    return false;
  end if;
  select q.status into v_status from public.quotes q
    where q.id = v_quote and q.organization_id = v_org for update;
  if v_status <> 'draft' then
    raise exception 'un presupuesto aceptado o rechazado es de solo lectura' using errcode = 'NX011';
  end if;
  delete from public.quote_items where id = p_item_id and organization_id = v_org;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Aceptar: UNA transaccion. Bloquea el presupuesto, crea exactamente una orden (estado inicial
-- vigente del modulo de ordenes: pendiente, sin tecnico, prioridad normal, fecha = hoy en
-- Europe/Madrid) con el mismo cliente, titulo y descripcion, y enlaza quote.order_id (UNIQUE). Si la
-- creacion de la orden falla (p. ej. cliente archivado, NX002) TODO se revierte. Idempotente: si ya
-- esta aceptado devuelve la MISMA orden. Rechazado -> NX012 (decision contraria).
-- Importe: work_orders no tiene columna de importe (F4 cerrada): el total se copia como una linea de
-- texto al final de la descripcion de la orden; la fuente de verdad sigue siendo el presupuesto.
create function private.accept_quote(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_q public.quotes%rowtype;
  v_order uuid;
  v_description text;
begin
  select * into v_q from public.quotes q
    where q.id = p_id and q.organization_id = v_org for update;
  if not found then
    raise exception 'presupuesto no encontrado' using errcode = 'NX010';
  end if;
  if v_q.status = 'accepted' then
    return v_q.order_id;
  end if;
  if v_q.status = 'rejected' then
    raise exception 'el presupuesto ya fue rechazado' using errcode = 'NX012';
  end if;
  -- Un presupuesto sin conceptos no genera una orden de 0,00 EUR (la transaccion se revierte).
  if not exists (
    select 1 from public.quote_items i
      where i.quote_id = v_q.id and i.organization_id = v_org
  ) then
    raise exception 'un presupuesto sin conceptos no se puede aceptar' using errcode = 'NX016';
  end if;

  v_description := coalesce(v_q.description || E'\n\n', '')
    || 'Origen: presupuesto ' || private.quote_label(v_q.number)
    || '. Importe total (IVA incluido): ' || private.format_cents(v_q.total_cents) || ' EUR.';

  v_order := private.create_work_order(
    gen_random_uuid(), v_q.customer_id, v_q.title, v_description, 'normal',
    (now() at time zone 'Europe/Madrid')::date, null
  );

  update public.quotes
    set status = 'accepted', order_id = v_order, decided_by = auth.uid(), decided_at = now()
    where id = v_q.id and organization_id = v_org;
  return v_order;
end;
$$;

-- Rechazar: terminal. Devuelve true si rechazo ahora; false si ya estaba rechazado (sin cambios ni
-- eventos). Aceptado -> NX012 (decision contraria).
create function private.reject_quote(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_status text;
begin
  select q.status into v_status from public.quotes q
    where q.id = p_id and q.organization_id = v_org for update;
  if not found then
    raise exception 'presupuesto no encontrado' using errcode = 'NX010';
  end if;
  if v_status = 'rejected' then
    return false;
  end if;
  if v_status = 'accepted' then
    raise exception 'el presupuesto ya fue aceptado' using errcode = 'NX012';
  end if;
  update public.quotes
    set status = 'rejected', decided_by = auth.uid(), decided_at = now()
    where id = p_id and organization_id = v_org;
  return true;
end;
$$;

revoke execute on function private.create_quote(uuid, uuid, text, text) from public, anon;
revoke execute on function private.update_quote(uuid, uuid, text, text) from public, anon;
revoke execute on function private.add_quote_item(uuid, uuid, text, numeric, bigint, int) from public, anon;
revoke execute on function private.update_quote_item(uuid, text, numeric, bigint, int) from public, anon;
revoke execute on function private.remove_quote_item(uuid) from public, anon;
revoke execute on function private.accept_quote(uuid) from public, anon;
revoke execute on function private.reject_quote(uuid) from public, anon;
grant execute on function private.create_quote(uuid, uuid, text, text) to authenticated;
grant execute on function private.update_quote(uuid, uuid, text, text) to authenticated;
grant execute on function private.add_quote_item(uuid, uuid, text, numeric, bigint, int) to authenticated;
grant execute on function private.update_quote_item(uuid, text, numeric, bigint, int) to authenticated;
grant execute on function private.remove_quote_item(uuid) to authenticated;
grant execute on function private.accept_quote(uuid) to authenticated;
grant execute on function private.reject_quote(uuid) to authenticated;

-- Envoltorios publicos (PostgREST solo expone public): SECURITY INVOKER de una linea.
create function public.create_quote(p_id uuid, p_customer_id uuid, p_title text, p_description text)
returns uuid
language sql
set search_path = ''
as $$ select private.create_quote($1, $2, $3, $4) $$;

create function public.update_quote(p_id uuid, p_customer_id uuid, p_title text, p_description text)
returns void
language sql
set search_path = ''
as $$ select private.update_quote($1, $2, $3, $4) $$;

create function public.add_quote_item(
  p_quote_id uuid, p_item_id uuid, p_description text, p_quantity numeric,
  p_unit_price_cents bigint, p_tax_rate_bp int default 2100
)
returns uuid
language sql
set search_path = ''
as $$ select private.add_quote_item($1, $2, $3, $4, $5, $6) $$;

create function public.update_quote_item(
  p_item_id uuid, p_description text, p_quantity numeric, p_unit_price_cents bigint,
  p_tax_rate_bp int default 2100
)
returns void
language sql
set search_path = ''
as $$ select private.update_quote_item($1, $2, $3, $4, $5) $$;

create function public.remove_quote_item(p_item_id uuid)
returns boolean
language sql
set search_path = ''
as $$ select private.remove_quote_item($1) $$;

create function public.accept_quote(p_id uuid)
returns uuid
language sql
set search_path = ''
as $$ select private.accept_quote($1) $$;

create function public.reject_quote(p_id uuid)
returns boolean
language sql
set search_path = ''
as $$ select private.reject_quote($1) $$;

revoke execute on function public.create_quote(uuid, uuid, text, text) from public, anon;
revoke execute on function public.update_quote(uuid, uuid, text, text) from public, anon;
revoke execute on function public.add_quote_item(uuid, uuid, text, numeric, bigint, int) from public, anon;
revoke execute on function public.update_quote_item(uuid, text, numeric, bigint, int) from public, anon;
revoke execute on function public.remove_quote_item(uuid) from public, anon;
revoke execute on function public.accept_quote(uuid) from public, anon;
revoke execute on function public.reject_quote(uuid) from public, anon;
grant execute on function public.create_quote(uuid, uuid, text, text) to authenticated;
grant execute on function public.update_quote(uuid, uuid, text, text) to authenticated;
grant execute on function public.add_quote_item(uuid, uuid, text, numeric, bigint, int) to authenticated;
grant execute on function public.update_quote_item(uuid, text, numeric, bigint, int) to authenticated;
grant execute on function public.remove_quote_item(uuid) to authenticated;
grant execute on function public.accept_quote(uuid) to authenticated;
grant execute on function public.reject_quote(uuid) to authenticated;
