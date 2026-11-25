-- TASK-010 / A02-04: restricciones de nombre unificadas (PostgreSQL = Zod) sobre el valor ALMACENADO.
-- Sustituye (mismo nombre) los CHECK de 20261124090000, que median char_length(btrim(name)): btrim
-- solo recorta espacios, asi que aceptaban nombres compuestos por tabulaciones o saltos de linea
-- y valores de mas de 200 caracteres con relleno en blanco.
--
-- Regla nueva, sobre el valor tal cual se almacena (sin recortar):
--   * como maximo 200 caracteres (char_length cuenta puntos de codigo Unicode, igual que Zod 4);
--   * al menos un caracter que no sea espacio en blanco. "Espacio en blanco" es el conjunto de
--     String.prototype.trim() de JavaScript: SP, TAB, LF, VT, FF, CR, NBSP, U+1680, U+2000-200A,
--     U+2028, U+2029, U+202F, U+205F, U+3000 y U+FEFF. Un nombre vacio tampoco cumple.
-- Zod recorta antes de validar y almacena el valor recortado; la base valida lo que le llega por
-- cualquier via (PostgREST o SQL), por eso el relleno en blanco cuenta para el maximo.
--
-- Datos existentes: ADD CONSTRAINT valida todas las filas. Si alguna viola la regla, la migracion
-- FALLA entera (no se recorta ni se reescribe ningun dato). Antes de aplicarla, ejecutar la
-- comprobacion de solo lectura supabase/checks/name-constraints-precheck.sql (docs/SUPABASE_CLOUD.md).

alter table public.organizations
  drop constraint organizations_name_length,
  add constraint organizations_name_length check (
    char_length(name) <= 200
    and name ~ '[^ \t\n\r\v\f   -     　﻿]'
  );

alter table public.customers
  drop constraint customers_name_length,
  add constraint customers_name_length check (
    char_length(name) <= 200
    and name ~ '[^ \t\n\r\v\f   -     　﻿]'
  );

alter table public.technicians
  drop constraint technicians_full_name_length,
  add constraint technicians_full_name_length check (
    char_length(full_name) <= 200
    and full_name ~ '[^ \t\n\r\v\f   -     　﻿]'
  );
