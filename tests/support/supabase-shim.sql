-- Shim minimo de Supabase para ejecutar las migraciones en PGlite (PostgreSQL real in-process).
-- Reproduce lo que las migraciones necesitan: roles anon/authenticated/service_role, el esquema
-- auth (auth.users, auth.uid(), auth.role(), auth.jwt()) y los privilegios por defecto de
-- Supabase en public. NO es Supabase: no hay PostgREST ni GoTrue ni el resto de roles.
-- Solo datos sinteticos; sin contrasenas.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;

-- Version reducida de auth.users: id y email bastan para las pruebas.
create table auth.users (
  id uuid primary key,
  email text
);

-- Los claims se leen de request.jwt.claims, como hace PostgREST en Supabase.
create function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create function auth.role()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'role', '');
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

-- Supabase concede por defecto todos los privilegios sobre los objetos nuevos de public.
-- Las migraciones deben revocar lo que no corresponda.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
