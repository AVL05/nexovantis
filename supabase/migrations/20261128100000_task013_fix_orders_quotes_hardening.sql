-- TASK-013-FIX (AUDIT-004 / G4): endurecimiento ADITIVO sobre las migraciones ya aplicadas de ordenes
-- (TASK-011) y presupuestos (TASK-012). No modifica ni reescribe datos; solo anade triggers y
-- sustituye una funcion pura. Se puede aplicar sobre datos validos existentes (los triggers solo
-- actuan sobre escrituras nuevas; no hay constraints que validar sobre filas antiguas, asi que no hace
-- falta NOT VALID).
--
--  G4-02  work_orders.id es inmutable. stock_movements.order_id y quotes.order_id enlazan con la orden
--         SIN clave foranea (decision documentada: una FK rompe el contrato 23000 de TRUNCATE de F4);
--         si el id pudiera reescribirse esos vinculos quedarian colgando. Trigger BEFORE UPDATE.
--         Error 23000 (el mismo SQLSTATE que el resto de inmutabilidades de la tabla). El trigger de la
--         tabla work_orders_guard se ejecuta ANTES (orden alfabetico) y conserva sus errores NX001/NX003.
--  G4-03  La orden de un presupuesto la crea EXCLUSIVAMENTE la propia transicion draft->accepted: el
--         trigger BEFORE UPDATE quotes_accept_create_order (unico creador) valida >=1 concepto (NX016),
--         crea la orden con private.create_work_order (id generado por la BD, mismo contenido que
--         produce accept_quote) y asigna new.order_id. Cualquier order_id suministrado por el llamador
--         se RECHAZA (23503); nunca se vincula una orden existente ni creada por otra via, tambien en
--         escrituras administrativas multi-sentencia. Sin xmin ni variables de sesion. accept_quote
--         solo bloquea (FOR UPDATE), comprueba estado y hace el UPDATE; es idempotente como antes.
--         El trigger se llama "quotes_accept_create_order" para ejecutarse ANTES de quotes_guard (orden
--         alfabetico), que despues valida cliente/organizacion de la orden y deriva los totales.
--  Traza  private.quote_label truncaba a 4 digitos a partir de PRE-10000 (lpad recorta). Se reemplaza
--         con la misma firma, privilegios (CREATE OR REPLACE los conserva) y search_path vacio; los
--         numeros < 10000 siguen siendo PRE-0001... Las ordenes no tienen etiqueta en SQL.
--  Limite no cubierto: un superusuario que desactive triggers deliberadamente o altere el esquema
--         (session_replication_role, DISABLE TRIGGER, ALTER ...) queda fuera de estas garantias.

-- ---------------------------------------------------------------------------------------------
-- 1. G4-02: work_orders.id inmutable
-- ---------------------------------------------------------------------------------------------
create function private.prevent_work_order_id_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'el identificador de una orden no cambia' using errcode = '23000';
end;
$$;
revoke execute on function private.prevent_work_order_id_change() from public, anon, authenticated;

-- "work_orders_prevent_id_change" > "work_orders_guard": el guard conserva sus errores propios.
create trigger work_orders_prevent_id_change
  before update on public.work_orders
  for each row
  when (old.id is distinct from new.id)
  execute function private.prevent_work_order_id_change();

-- ---------------------------------------------------------------------------------------------
-- 2. G4-03: integridad de la aceptacion de presupuestos
-- ---------------------------------------------------------------------------------------------
create function private.quotes_accept_create_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_sub bigint;
  v_tax bigint;
  v_description text;
  v_rows bigint;
begin
  if new.status = 'accepted' and auth.uid() is null then
    raise exception 'la decision requiere un usuario autenticado' using errcode = '23000';
  end if;
  if new.status <> 'accepted' then
    -- Rechazo o edicion de borrador: nunca llevan orden.
    if new.order_id is not null then
      raise exception 'un presupuesto no aceptado no puede tener orden' using errcode = '23503';
    end if;
    return new;
  end if;
  select coalesce(sum(i.subtotal_cents), 0), coalesce(sum(i.tax_cents), 0), count(*)
    into v_sub, v_tax, v_rows
    from public.quote_items i
    where i.quote_id = new.id and i.organization_id = new.organization_id;
  if v_rows = 0 then
    raise exception 'un presupuesto sin conceptos no se puede aceptar' using errcode = 'NX016';
  end if;
  -- Solo la propia transicion asigna la orden: nunca el llamador.
  if new.order_id is not null then
    raise exception 'la orden de un presupuesto la crea su aceptacion y no se puede suministrar'
      using errcode = '23503';
  end if;
  v_org := private.require_org();
  if new.organization_id <> v_org then
    raise exception 'el presupuesto pertenece a otra organizacion' using errcode = '23503';
  end if;

  v_description := coalesce(new.description || E'

', '')
    || 'Origen: presupuesto ' || private.quote_label(new.number)
    || '. Importe total (IVA incluido): ' || private.format_cents(v_sub + v_tax) || ' EUR.';

  new.order_id := private.create_work_order(
    gen_random_uuid(), new.customer_id, new.title, v_description, 'normal',
    (now() at time zone 'Europe/Madrid')::date, null
  );
  return new;
end;
$$;
revoke execute on function private.quotes_accept_create_order() from public, anon, authenticated;

create trigger quotes_accept_create_order
  before update on public.quotes
  for each row
  when (old.status = 'draft' and (new.status = 'accepted' or new.order_id is not null))
  execute function private.quotes_accept_create_order();

-- accept_quote (CREATE OR REPLACE: misma firma, retorno, errores y privilegios). La orden la crea el
-- trigger anterior; aqui solo se bloquea, se resuelve idempotencia/rechazo y se lee la orden generada.
create or replace function private.accept_quote(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := private.require_org();
  v_q public.quotes%rowtype;
  v_order uuid;
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

  update public.quotes
    set status = 'accepted', decided_by = auth.uid(), decided_at = now()
    where id = v_q.id and organization_id = v_org
    returning order_id into v_order;
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Trazabilidad: PRE-<n> sin truncar a partir de 10000
-- ---------------------------------------------------------------------------------------------
create or replace function private.quote_label(p_number bigint)
returns text
language sql
immutable
set search_path = ''
as $$ select 'PRE-' || case when p_number < 10000 then lpad(p_number::text, 4, '0') else p_number::text end $$;
