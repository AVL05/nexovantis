-- F3 / TASK-006 (POST-05): un registro archivado conserva su archived_at.
-- Hasta que se ratifique DH-06 (restaurar con evento, docs/BUSINESS_RULES.md), una vez
-- archivado no se puede restaurar ni reescribir la fecha de archivado: se rechaza cualquier
-- cambio de archived_at cuando el valor anterior no es nulo (tambien con privilegios de
-- administracion). Sustituye el cuerpo de la funcion de 20261124090100; los triggers
-- customers_prevent_unarchive y technicians_prevent_unarchive no cambian.
create or replace function private.prevent_unarchive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is not null and new.archived_at is distinct from old.archived_at then
    raise exception 'un registro archivado conserva su archived_at (DH-06 pendiente)'
      using errcode = '23000';
  end if;
  return new;
end;
$$;
