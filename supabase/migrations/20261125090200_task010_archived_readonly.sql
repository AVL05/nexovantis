-- TASK-010 / A02-06: los registros ARCHIVADOS son de solo lectura hasta su restauracion
-- (decision humana ratificada, docs/BUSINESS_RULES.md). Se restaura primero y despues se edita.
-- La regla vive en PostgreSQL (trigger) para que no se pueda eludir por PostgREST ni por SQL:
-- sin excepcion por rol, tampoco para administracion (el trigger se ejecuta siempre).
--
-- Sustituye el cuerpo de private.prevent_unarchive() (20261124100000) y recrea sus triggers con
-- una clausula WHEN mas amplia. Antes disparaba solo si archived_at cambiaba; ahora tambien en
-- cualquier UPDATE de una fila ya archivada.
--
-- Comportamiento (OLD = fila antes, NEW = despues):
--   OLD activa  -> NEW archivada : archivar (se permite editar otros campos en el mismo UPDATE:
--                                  la fila todavia era editable). Hora fijada por el servidor y
--                                  evento 'archived'. Sin cambios respecto a TASK-008B.
--   OLD archivada, cualquier columna distinta de archived_at y updated_at cambia -> 23000
--                                  (incluida la restauracion combinada con una edicion).
--   OLD archivada, NEW archived_at distinto y no nulo -> 23000 (conserva su archived_at).
--   OLD archivada -> NEW nula, sin otros cambios : restaurar puro. Evento 'restored'.
--   OLD archivada, NEW igual (UPDATE sin cambios reales) : se permite, sin evento.
-- updated_at no cuenta (lo fija un trigger posterior); la comparacion usa to_jsonb(), de modo que
-- cualquier columna futura queda protegida por defecto. organization_id ya es inmutable por su
-- propio trigger. Sin auth.uid() no se archiva ni se restaura (23000): el actor nunca es nulo.
--
-- DH-04/DH-05 (F4): la regla "ordenes activas" se comprobara en las ramas 'archived'/'restored',
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
    new.archived_at := now(); -- WHEN garantiza que NEW.archived_at no era nulo; la hora la fija el servidor
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

drop trigger customers_prevent_unarchive on public.customers;
create trigger customers_prevent_unarchive
  before update on public.customers
  for each row
  when (old.archived_at is not null or new.archived_at is not null)
  execute function private.prevent_unarchive();

drop trigger technicians_prevent_unarchive on public.technicians;
create trigger technicians_prevent_unarchive
  before update on public.technicians
  for each row
  when (old.archived_at is not null or new.archived_at is not null)
  execute function private.prevent_unarchive();
