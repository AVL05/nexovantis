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
--  G4-03  Aceptar un presupuesto solo es valido si (a) tiene al menos un concepto y (b) su orden fue
--         creada POR LA ACEPTACION en la misma transaccion. Se verifica sobre datos que el llamador no
--         controla como autorizacion unica: la fila 'created' de activity_events de esa orden (tabla
--         inmutable, escrita solo por el trigger de la orden con el mismo actor) debe haber sido
--         insertada por la transaccion en curso (xmin = xid de la transaccion actual). Una orden
--         preexistente o ya vinculada a otro presupuesto se rechaza aunque se escriba por SQL de
--         administracion, sin pasar por accept_quote. No se usa ninguna variable de sesion (GUC).
--         Limite conocido: un SAVEPOINT / subtransaccion hace que xmin sea el de la subtransaccion y la
--         comprobacion falle CERRADA (rechaza); accept_quote no usa subtransacciones.
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
create function private.quotes_guard_accept()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.quote_items i
      where i.quote_id = new.id and i.organization_id = new.organization_id
  ) then
    raise exception 'un presupuesto sin conceptos no se puede aceptar' using errcode = 'NX016';
  end if;

  -- La orden debe haber sido CREADA por esta transaccion (acceptance): su evento 'created' lo escribio
  -- el trigger de la orden en la transaccion en curso y con el actor actual. Una orden preexistente
  -- (de cualquier presupuesto o creada de forma independiente) no cumple esta condicion.
  if new.order_id is null or not exists (
    select 1
      from public.work_orders w
      join public.activity_events e
        on e.organization_id = w.organization_id
       and e.entity_type = 'work_order'
       and e.entity_id = w.id
       and e.action = 'created'
     where w.id = new.order_id
       and w.organization_id = new.organization_id
       and w.customer_id = new.customer_id
       and e.actor_id = auth.uid()
       and e.xmin::text::bigint = (pg_current_xact_id()::text::bigint % 4294967296)
  ) then
    raise exception 'la orden enlazada debe haberse creado en la propia aceptacion del presupuesto'
      using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke execute on function private.quotes_guard_accept() from public, anon, authenticated;

-- "quotes_guard_accept" > "quotes_guard": se ejecuta despues de las validaciones y totales del guard.
create trigger quotes_guard_accept
  before update on public.quotes
  for each row
  when (old.status = 'draft' and new.status = 'accepted')
  execute function private.quotes_guard_accept();

-- ---------------------------------------------------------------------------------------------
-- 3. Trazabilidad: PRE-<n> sin truncar a partir de 10000
-- ---------------------------------------------------------------------------------------------
create or replace function private.quote_label(p_number bigint)
returns text
language sql
immutable
set search_path = ''
as $$ select 'PRE-' || case when p_number < 10000 then lpad(p_number::text, 4, '0') else p_number::text end $$;
