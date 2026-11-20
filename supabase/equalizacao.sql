create schema equalizacao_private;
revoke all on schema equalizacao_private from public;
grant usage on schema equalizacao_private to authenticated;

create table equalizacao_private.settings (
  id boolean primary key default true check (id),
  allowed_domain text not null check (allowed_domain ~ '^[a-z0-9][a-z0-9.-]+[.][a-z]+$')
);

create table public.equalizacao_roles (
  role_id text primary key,
  label text not null,
  can_edit boolean not null default false,
  can_manage_users boolean not null default false
);

insert into public.equalizacao_roles values ('member', 'Padrão', true, true);

create table public.equalizacao_members (
  email text primary key check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  role_id text not null default 'member' references public.equalizacao_roles
);

create table public.equalizacao_project (
  id boolean primary key default true check (id),
  payload jsonb check (jsonb_typeof(payload) = 'object'),
  revision integer not null default 0
);
insert into public.equalizacao_project (id) values (true);

create function equalizacao_private.has_access(permission text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join auth.identities i on i.user_id = u.id and i.provider = 'google'
      and lower(i.identity_data->>'email') = lower(u.email)
      and i.identity_data->>'email_verified' = 'true'
    join equalizacao_private.settings s on s.allowed_domain = split_part(lower(u.email), '@', 2)
      and s.allowed_domain = coalesce(i.identity_data->>'hd', i.identity_data->'custom_claims'->>'hd')
    join public.equalizacao_members m on m.email = lower(u.email)
    join public.equalizacao_roles r on r.role_id = m.role_id
    where u.id = (select auth.uid())
      and (select auth.jwt()->'app_metadata'->>'provider') = 'google'
      and case permission
        when 'read' then true
        when 'edit' then r.can_edit
        when 'manage' then r.can_manage_users
        else false
      end
  );
$$;

create function equalizacao_private.allowed_email(candidate text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select equalizacao_private.has_access('manage') and exists (
    select 1 from equalizacao_private.settings
    where allowed_domain = split_part(candidate, '@', 2)
  );
$$;

revoke all on function equalizacao_private.has_access(text), equalizacao_private.allowed_email(text) from public;
grant execute on function equalizacao_private.has_access(text), equalizacao_private.allowed_email(text) to authenticated;

alter table public.equalizacao_roles enable row level security;
alter table public.equalizacao_members enable row level security;
alter table public.equalizacao_project enable row level security;

revoke all on public.equalizacao_roles, public.equalizacao_members, public.equalizacao_project from anon, authenticated;
grant select on public.equalizacao_roles, public.equalizacao_members, public.equalizacao_project to authenticated;
grant insert (email) on public.equalizacao_members to authenticated;
grant update (payload, revision) on public.equalizacao_project to authenticated;

create policy roles_read on public.equalizacao_roles for select to authenticated
  using ((select equalizacao_private.has_access('read')));
create policy members_read on public.equalizacao_members for select to authenticated
  using ((select equalizacao_private.has_access('manage')) or (
    (select equalizacao_private.has_access('read')) and email = lower((select auth.jwt()->>'email'))
  ));
create policy members_add on public.equalizacao_members for insert to authenticated
  with check (role_id = 'member' and equalizacao_private.allowed_email(email));
create policy project_read on public.equalizacao_project for select to authenticated
  using ((select equalizacao_private.has_access('read')));
create policy project_edit on public.equalizacao_project for update to authenticated
  using ((select equalizacao_private.has_access('edit')))
  with check ((select equalizacao_private.has_access('edit')));
