-- F3 / TASK-006: esquema privado, funciones auxiliares de autorizacion y triggers.
-- El esquema "private" no se expone por la API de datos (config.toml: solo "public").

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- is_org_member: el usuario autenticado pertenece a la organizacion. SECURITY DEFINER para
-- leer memberships sin pasar por su RLS (evita recursion de politicas). search_path vacio y
-- nombres calificados: sin secuestro por search_path. No acepta el usuario como parametro:
-- siempre usa auth.uid().
create function private.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
  );
$$;

-- has_org_role: el usuario autenticado tiene el rol indicado en la organizacion.
create function private.has_org_role(org uuid, required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.role = required_role
  );
$$;

revoke execute on function private.is_org_member(uuid) from public, anon;
revoke execute on function private.has_org_role(uuid, text) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text) to authenticated;

-- updated_at: se fija siempre en el servidor, nunca desde el cliente.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- organization_id es inmutable: una fila no cambia de organizacion ni siquiera con privilegios
-- de administracion (defensa en profundidad frente a RLS y GRANT).
create function private.prevent_organization_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id es inmutable en %', tg_table_name
      using errcode = '23000';
  end if;
  return new;
end;
$$;

-- Restaurar (archived_at de no nulo a nulo) esta bloqueado hasta ratificar DH-06
-- (docs/BUSINESS_RULES.md): su evento depende de DH-08 (F4/F6).
create function private.prevent_unarchive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.archived_at is not null and new.archived_at is null then
    raise exception 'restaurar registros archivados no esta permitido (DH-06 pendiente)'
      using errcode = '23000';
  end if;
  return new;
end;
$$;

-- Las funciones de trigger no se invocan directamente: sin EXECUTE para nadie salvo el
-- propietario (el privilegio solo se comprueba al crear el trigger).
revoke execute on function private.set_updated_at() from public, anon, authenticated;
revoke execute on function private.prevent_organization_change() from public, anon, authenticated;
revoke execute on function private.prevent_unarchive() from public, anon, authenticated;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();
create trigger customers_prevent_organization_change
  before update on public.customers
  for each row execute function private.prevent_organization_change();
create trigger customers_prevent_unarchive
  before update on public.customers
  for each row execute function private.prevent_unarchive();

create trigger technicians_set_updated_at
  before update on public.technicians
  for each row execute function private.set_updated_at();
create trigger technicians_prevent_organization_change
  before update on public.technicians
  for each row execute function private.prevent_organization_change();
create trigger technicians_prevent_unarchive
  before update on public.technicians
  for each row execute function private.prevent_unarchive();
