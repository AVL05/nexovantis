-- F3 / TASK-006: RLS, privilegios y politicas. Matriz de acceso propuesta en
-- docs/adr/ADR-001-roles-rls.md (pendiente de aprobacion humana).
-- Principio: GRANT minimo + RLS por operacion. anon no tiene ningun privilegio.

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.customers enable row level security;
alter table public.technicians enable row level security;

-- Supabase concede por defecto todos los privilegios a anon y authenticated en public:
-- se revocan y se concede solo lo necesario. Sin DELETE ni TRUNCATE para nadie en la app.
revoke all on table public.organizations from public, anon, authenticated;
revoke all on table public.memberships from public, anon, authenticated;
revoke all on table public.customers from public, anon, authenticated;
revoke all on table public.technicians from public, anon, authenticated;

grant select on table public.organizations to authenticated;
grant select on table public.memberships to authenticated;
grant select on table public.customers to authenticated;
grant select on table public.technicians to authenticated;

-- Privilegios por columna: id, organization_id, created_at y updated_at no se escriben desde
-- la app. Solo se puede renombrar la organizacion; memberships es de solo lectura.
grant update (name) on table public.organizations to authenticated;
grant insert (organization_id, name, email, phone, notes) on table public.customers to authenticated;
grant update (name, email, phone, notes, archived_at) on table public.customers to authenticated;
grant insert (organization_id, full_name, email, phone, notes) on table public.technicians to authenticated;
grant update (full_name, email, phone, notes, archived_at) on table public.technicians to authenticated;

-- organizations: ver la propia; solo el owner la renombra. Sin INSERT/DELETE desde la app.
create policy organizations_select_member on public.organizations
  for select to authenticated
  using (private.is_org_member(id));

create policy organizations_update_owner on public.organizations
  for update to authenticated
  using (private.has_org_role(id, 'owner'))
  with check (private.has_org_role(id, 'owner'));

-- memberships: ver las de la propia organizacion. Sin politicas de escritura: nadie se
-- asigna roles ni se une a otra organizacion desde la app (altas fuera de la app en F3).
create policy memberships_select_member on public.memberships
  for select to authenticated
  using (private.is_org_member(organization_id));

-- customers: cualquier miembro lee, crea y actualiza (incluye archivar) en su organizacion.
-- WITH CHECK impide insertar o mover filas a otra organizacion. Sin DELETE.
create policy customers_select_member on public.customers
  for select to authenticated
  using (private.is_org_member(organization_id));

create policy customers_insert_member on public.customers
  for insert to authenticated
  with check (private.is_org_member(organization_id));

create policy customers_update_member on public.customers
  for update to authenticated
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));

-- technicians: mismas reglas que customers.
create policy technicians_select_member on public.technicians
  for select to authenticated
  using (private.is_org_member(organization_id));

create policy technicians_insert_member on public.technicians
  for insert to authenticated
  with check (private.is_org_member(organization_id));

create policy technicians_update_member on public.technicians
  for update to authenticated
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
