-- F3 / TASK-006: tablas base del modelo multiempresa.
-- Ejecutable sin cambios en Supabase y en PGlite (con tests/support/supabase-shim.sql).
-- La seguridad (RLS, GRANT, politicas) se define en 20261124090200_f3_rls_and_grants.sql.

-- Organizacion (tenant). Se crea fuera de la aplicacion en F3 (sin registro publico).
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_name_length check (char_length(btrim(name)) between 1 and 200)
);

-- Membresia usuario-organizacion con rol. unique (user_id): un usuario pertenece como
-- maximo a una organizacion (multiempresa avanzada fuera de alcance).
create table public.memberships (
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint memberships_user_id_key unique (user_id),
  constraint memberships_role_check check (role in ('owner', 'member'))
);

-- Clientes. archived_at no nulo = archivado (no existe borrado para usuarios, BR02).
-- unique (organization_id, id) permite claves foraneas compuestas desde F4 (BR01).
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  email text,
  phone text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_organization_id_id_key unique (organization_id, id),
  constraint customers_name_length check (char_length(btrim(name)) between 1 and 200),
  constraint customers_email_length check (char_length(email) <= 254),
  constraint customers_phone_length check (char_length(phone) <= 40),
  constraint customers_notes_length check (char_length(notes) <= 2000)
);

-- Tecnicos. Mismas reglas que clientes (full_name en lugar de name).
create table public.technicians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  full_name text not null,
  email text,
  phone text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint technicians_organization_id_id_key unique (organization_id, id),
  constraint technicians_full_name_length check (char_length(btrim(full_name)) between 1 and 200),
  constraint technicians_email_length check (char_length(email) <= 254),
  constraint technicians_phone_length check (char_length(phone) <= 40),
  constraint technicians_notes_length check (char_length(notes) <= 2000)
);

-- La clave primaria de memberships ya indexa organization_id como primera columna, y las
-- claves unique (organization_id, id) de customers y technicians tambien.
