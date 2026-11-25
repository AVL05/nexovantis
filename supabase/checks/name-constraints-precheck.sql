-- TASK-010 / A02-04: comprobacion PREVIA (solo lectura) de la migracion
-- 20261125090000_task010_name_constraints.sql. No modifica nada: una unica sentencia SELECT.
--
-- Lista cada organizacion, cliente o tecnico cuyo nombre ALMACENADO violaria la restriccion nueva:
--   * mas de 200 caracteres (puntos de codigo; incluye el relleno en blanco), o
--   * nombre vacio o compuesto solo por espacio en blanco (conjunto de String.prototype.trim():
--     espacios, tabulaciones, saltos de linea, NBSP, U+2000-200A, U+3000, U+FEFF...).
-- Cero filas = la migracion se puede aplicar. Con filas, la migracion FALLARIA entera; hay que
-- corregir cada registro (decision humana, nunca automatica: aqui no se recorta ni se reescribe
-- nada) y repetir esta comprobacion. Ejecutar con privilegios de administracion, p. ej.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/checks/name-constraints-precheck.sql
-- Solo devuelve identificadores y el motivo: no incluye el nombre (puede ser un dato personal).

select table_name, id, reason
from (
  select 'organizations'::text as table_name, o.id, o.name as value from public.organizations o
  union all
  select 'customers', c.id, c.name from public.customers c
  union all
  select 'technicians', t.id, t.full_name from public.technicians t
) as names
cross join lateral (
  select case
    when char_length(names.value) > 200
      then 'el nombre almacenado tiene ' || char_length(names.value) || ' caracteres (maximo 200)'
    else 'el nombre esta vacio o solo contiene espacios en blanco'
  end as reason
) as why
where char_length(names.value) > 200
   or names.value !~ '[^ \t\n\r\v\f   -     　﻿]'
order by table_name, id;
