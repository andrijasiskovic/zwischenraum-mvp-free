-- Zwischenraum MVP schema for Supabase Free.
-- Run this once in the Supabase SQL editor.

create extension if not exists pgcrypto;

do $$
begin
  create type public.member_role as enum ('owner', 'coach', 'client');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.task_status as enum ('open', 'done');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.interface_presets (
  id text primary key,
  label text not null,
  practitioner_label text not null,
  client_label text not null,
  assignment_label text not null,
  reflection_prompt text not null,
  accent_color text not null default '#5B7C99',
  support_color text not null default '#7FAEA3',
  default_image_url text not null default '',
  default_modules jsonb not null default '[]'::jsonb
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry_preset_id text not null references public.interface_presets(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  display_name text not null,
  logo_text text not null default 'ZR',
  logo_url text not null default '',
  hero_image_url text not null default '',
  primary_color text not null default '#5B7C99',
  secondary_color text not null default '#7FAEA3',
  brand_profiles jsonb not null default '{}'::jsonb,
  client_limit integer not null default 10,
  plan_name text not null default 'test',
  updated_at timestamptz not null default now()
);

alter table public.interface_presets
add column if not exists default_image_url text not null default '';

alter table public.organization_settings
add column if not exists logo_url text not null default '';

alter table public.organization_settings
add column if not exists hero_image_url text not null default '';

alter table public.organization_settings
add column if not exists brand_profiles jsonb not null default '{}'::jsonb;

alter table public.organization_settings
add column if not exists client_limit integer not null default 10;

alter table public.organization_settings
add column if not exists plan_name text not null default 'test';

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  contact_email text not null default '',
  full_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists contact_email text not null default '';

alter table public.profiles
add column if not exists phone text not null default '';

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.member_role not null,
  invited_by uuid not null references auth.users(id),
  client_coach_id uuid references auth.users(id),
  code text not null unique,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_client_relationships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, coach_id, client_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coach_id uuid not null references public.profiles(id),
  client_id uuid not null references public.profiles(id),
  title text not null,
  description text not null default '',
  due_date date not null,
  status public.task_status not null default 'open',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.profiles(id),
  text text not null,
  mood text,
  created_at timestamptz not null default now()
);

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  reflection_id uuid references public.reflections(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  file_type text not null default 'application/octet-stream',
  file_size bigint not null default 0,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists task_attachments_task_idx on public.task_attachments(task_id);
create index if not exists task_attachments_reflection_idx on public.task_attachments(reflection_id);

create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  preset_id text not null references public.interface_presets(id),
  title text not null,
  description text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_touch_updated_at on public.tasks;

create trigger tasks_touch_updated_at
before update on public.tasks
for each row execute function public.touch_updated_at();

drop trigger if exists organization_settings_touch_updated_at on public.organization_settings;

create trigger organization_settings_touch_updated_at
before update on public.organization_settings
for each row execute function public.touch_updated_at();

insert into public.interface_presets (
  id, label, practitioner_label, client_label, assignment_label, reflection_prompt, accent_color, support_color, default_image_url, default_modules
) values
  ('generic_coaching', 'Coaching / Beratung', 'Coach', 'Client', 'Aufgabe', 'Wie ist es dir mit dieser Aufgabe gegangen?', '#5B7C99', '#7FAEA3', 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80', '["Aufgaben", "Reflexion", "Fortschritt"]'),
  ('psychotherapy', 'Psychotherapie', 'Therapeut:in', 'Klient:in', 'Übung', 'Was hast du wahrgenommen und was war hilfreich oder schwierig?', '#6F8F8A', '#9B8DB8', 'https://images.unsplash.com/photo-1493836512294-502baa1986e2?auto=format&fit=crop&w=1200&q=80', '["Übungen", "Reflexion", "Stimmung"]'),
  ('physiotherapy', 'Physiotherapie', 'Physiotherapeut:in', 'Patient:in', 'Heimübung', 'Wie gut hat die Übung funktioniert und gab es Schmerzen?', '#6FA8B8', '#8EBF9F', 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1200&q=80', '["Übungsplan", "Schmerzskala", "Häufigkeit"]'),
  ('football', 'Fußballtraining', 'Trainer:in', 'Spieler:in', 'Trainingsaufgabe', 'Was hast du umgesetzt und was möchtest du verbessern?', '#6F9B73', '#C9B45A', 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80', '["Technik", "Athletik", "Wochenziele"]'),
  ('dog_training', 'Hundetraining', 'Hundetrainer:in', 'Halter:in', 'Trainingsplan', 'Wie hat dein Hund reagiert und in welcher Situation habt ihr geübt?', '#B08A66', '#7D9BB3', 'https://images.unsplash.com/photo-1534361960057-19889db9621e?auto=format&fit=crop&w=1200&q=80', '["Verhalten", "Situation", "Wiederholungen"]'),
  ('nutrition', 'Ernährungsberatung', 'Ernährungsberater:in', 'Client', 'Ernährungsziel', 'Was ist dir gelungen und wo brauchst du Unterstützung?', '#C97872', '#7FAE8A', 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1200&q=80', '["Gewohnheiten", "Mahlzeiten", "Check-ins"]')
on conflict (id) do update
set label = excluded.label,
    practitioner_label = excluded.practitioner_label,
    client_label = excluded.client_label,
    assignment_label = excluded.assignment_label,
    reflection_prompt = excluded.reflection_prompt,
    accent_color = excluded.accent_color,
    support_color = excluded.support_color,
    default_image_url = excluded.default_image_url,
    default_modules = excluded.default_modules;

update public.organization_settings settings
set brand_profiles = coalesce(settings.brand_profiles, '{}'::jsonb) || coalesce((
  select jsonb_object_agg(
    presets.id,
    jsonb_build_object(
      'display_name', settings.display_name,
      'logo_text', settings.logo_text,
      'logo_url', settings.logo_url,
      'hero_image_url', coalesce(settings.hero_image_url, ''),
      'primary_color', case
        when presets.id = organizations.industry_preset_id then settings.primary_color
        else presets.accent_color
      end,
      'secondary_color', case
        when presets.id = organizations.industry_preset_id then settings.secondary_color
        else presets.support_color
      end
    )
  )
  from public.interface_presets presets
  join public.organizations organizations on organizations.id = settings.organization_id
  where not (coalesce(settings.brand_profiles, '{}'::jsonb) ? presets.id)
), '{}'::jsonb);

update public.organization_settings settings
set brand_profiles = coalesce((
  select jsonb_object_agg(
    profile.key,
    profile.value || jsonb_build_object(
      'hero_image_url',
      coalesce(profile.value ->> 'hero_image_url', '')
    )
  )
  from jsonb_each(coalesce(settings.brand_profiles, '{}'::jsonb)) as profile(key, value)
), '{}'::jsonb);

do $$
declare
  palette record;
begin
  for palette in
    select *
    from (
      values
        ('generic_coaching', '#5B7C99', '#7FAEA3', '#2563eb', '#14b8a6'),
        ('psychotherapy', '#6F8F8A', '#9B8DB8', '#7c3aed', '#0f766e'),
        ('physiotherapy', '#6FA8B8', '#8EBF9F', '#0f766e', '#f97316'),
        ('football', '#6F9B73', '#C9B45A', '#16a34a', '#0284c7'),
        ('dog_training', '#B08A66', '#7D9BB3', '#b45309', '#2563eb'),
        ('nutrition', '#C97872', '#7FAE8A', '#dc2626', '#059669')
    ) as colors(preset_id, primary_color, secondary_color, old_primary_color, old_secondary_color)
  loop
    update public.organization_settings settings
    set brand_profiles = jsonb_set(
      coalesce(settings.brand_profiles, '{}'::jsonb),
      array[palette.preset_id],
      coalesce(settings.brand_profiles -> palette.preset_id, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'primary_color',
          case
            when coalesce(settings.brand_profiles #>> array[palette.preset_id, 'primary_color'], '') in ('', palette.old_primary_color)
              then palette.primary_color
            else null
          end,
          'secondary_color',
          case
            when coalesce(settings.brand_profiles #>> array[palette.preset_id, 'secondary_color'], '') in ('', palette.old_secondary_color)
              then palette.secondary_color
            else null
          end
        )),
      true
    )
    where coalesce(settings.brand_profiles, '{}'::jsonb) ? palette.preset_id
      and (
        coalesce(settings.brand_profiles #>> array[palette.preset_id, 'primary_color'], '') in ('', palette.old_primary_color)
        or coalesce(settings.brand_profiles #>> array[palette.preset_id, 'secondary_color'], '') in ('', palette.old_secondary_color)
      );
  end loop;
end $$;

alter table public.interface_presets enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;
alter table public.coach_client_relationships enable row level security;
alter table public.tasks enable row level security;
alter table public.reflections enable row level security;
alter table public.task_attachments enable row level security;
alter table public.coach_notes enable row level security;
alter table public.task_templates enable row level security;

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid() and active = true
  );
$$;

create or replace function public.has_org_role(org_id uuid, allowed_roles public.member_role[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
      and active = true
  );
$$;

create or replace function public.is_assigned_coach(org_id uuid, client uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.coach_client_relationships
    where organization_id = org_id
      and coach_id = auth.uid()
      and client_id = client
      and active = true
  );
$$;

drop policy if exists "presets are readable" on public.interface_presets;
create policy "presets are readable" on public.interface_presets
for select to anon, authenticated using (true);

drop policy if exists "profiles readable in own organizations" on public.profiles;
create policy "profiles readable in own organizations" on public.profiles
for select to authenticated using (
  id = auth.uid()
  or exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and mine.active = true
      and theirs.user_id = profiles.id
      and theirs.active = true
  )
);

drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile" on public.profiles
for insert to authenticated with check (id = auth.uid());

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "organizations readable by members" on public.organizations;
create policy "organizations readable by members" on public.organizations
for select to authenticated using (public.is_org_member(id));

drop policy if exists "organization settings readable by members" on public.organization_settings;
create policy "organization settings readable by members" on public.organization_settings
for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists "organization settings editable by owners" on public.organization_settings;
create policy "organization settings editable by owners" on public.organization_settings
for update to authenticated using (public.has_org_role(organization_id, array['owner']::public.member_role[]))
with check (public.has_org_role(organization_id, array['owner']::public.member_role[]));

drop policy if exists "members readable by members" on public.organization_members;
create policy "members readable by members" on public.organization_members
for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists "invitations readable by owners and coaches" on public.invitations;
create policy "invitations readable by owners and coaches" on public.invitations
for select to authenticated using (public.has_org_role(organization_id, array['owner','coach']::public.member_role[]));

drop policy if exists "relationships readable by org members" on public.coach_client_relationships;
create policy "relationships readable by org members" on public.coach_client_relationships
for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists "tasks visible to owners coaches and clients" on public.tasks;
create policy "tasks visible to owners coaches and clients" on public.tasks
for select to authenticated using (
  client_id = auth.uid()
  or coach_id = auth.uid()
  or public.has_org_role(organization_id, array['owner']::public.member_role[])
  or public.is_assigned_coach(organization_id, client_id)
);

drop policy if exists "coaches create tasks for assigned clients" on public.tasks;
create policy "coaches create tasks for assigned clients" on public.tasks
for insert to authenticated with check (
  coach_id = auth.uid()
  and (
    public.has_org_role(organization_id, array['owner']::public.member_role[])
    or public.is_assigned_coach(organization_id, client_id)
  )
);

drop policy if exists "coaches can edit own open tasks" on public.tasks;
create policy "coaches can edit own open tasks" on public.tasks
for update to authenticated using (coach_id = auth.uid() and status = 'open')
with check (coach_id = auth.uid());

drop policy if exists "reflections visible in task scope" on public.reflections;
create policy "reflections visible in task scope" on public.reflections
for select to authenticated using (
  client_id = auth.uid()
  or public.has_org_role(organization_id, array['owner']::public.member_role[])
  or public.is_assigned_coach(organization_id, client_id)
);

drop policy if exists "clients create own reflections" on public.reflections;
create policy "clients create own reflections" on public.reflections
for insert to authenticated with check (client_id = auth.uid());

drop policy if exists "attachments visible in task scope" on public.task_attachments;
create policy "attachments visible in task scope" on public.task_attachments
for select to authenticated using (
  exists (
    select 1
    from public.tasks
    where tasks.id = task_attachments.task_id
      and tasks.organization_id = task_attachments.organization_id
      and (
        tasks.client_id = auth.uid()
        or tasks.coach_id = auth.uid()
        or public.has_org_role(tasks.organization_id, array['owner']::public.member_role[])
        or public.is_assigned_coach(tasks.organization_id, tasks.client_id)
      )
  )
);

drop policy if exists "members create attachments in allowed task scope" on public.task_attachments;
create policy "members create attachments in allowed task scope" on public.task_attachments
for insert to authenticated with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.tasks
    where tasks.id = task_attachments.task_id
      and tasks.organization_id = task_attachments.organization_id
      and (
        (
          task_attachments.reflection_id is null
          and (
            tasks.coach_id = auth.uid()
            or public.has_org_role(tasks.organization_id, array['owner']::public.member_role[])
            or public.is_assigned_coach(tasks.organization_id, tasks.client_id)
          )
        )
        or (
          task_attachments.reflection_id is not null
          and tasks.client_id = auth.uid()
          and exists (
            select 1
            from public.reflections
            where reflections.id = task_attachments.reflection_id
              and reflections.task_id = tasks.id
              and reflections.client_id = auth.uid()
          )
        )
      )
  )
);

drop policy if exists "coach notes visible only to owning coach" on public.coach_notes;
create policy "coach notes visible only to owning coach" on public.coach_notes
for select to authenticated using (coach_id = auth.uid());

drop policy if exists "coaches create own notes for assigned clients" on public.coach_notes;
create policy "coaches create own notes for assigned clients" on public.coach_notes
for insert to authenticated with check (
  coach_id = auth.uid()
  and (
    public.has_org_role(organization_id, array['owner']::public.member_role[])
    or public.is_assigned_coach(organization_id, client_id)
  )
);

drop policy if exists "task templates readable by org members" on public.task_templates;
create policy "task templates readable by org members" on public.task_templates
for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists "task templates editable by owners and coaches" on public.task_templates;
create policy "task templates editable by owners and coaches" on public.task_templates
for all to authenticated using (public.has_org_role(organization_id, array['owner','coach']::public.member_role[]))
with check (public.has_org_role(organization_id, array['owner','coach']::public.member_role[]));

grant usage on schema public to anon, authenticated;

grant select on public.interface_presets to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.organizations to authenticated;
grant select, update on public.organization_settings to authenticated;
grant select on public.organization_members to authenticated;
grant select on public.invitations to authenticated;
grant select on public.coach_client_relationships to authenticated;
grant select, insert, update on public.tasks to authenticated;
grant select, insert on public.reflections to authenticated;
grant select, insert on public.task_attachments to authenticated;
grant select, insert on public.coach_notes to authenticated;
grant select, insert, update, delete on public.task_templates to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "brand assets are public" on storage.objects;
create policy "brand assets are public" on storage.objects
for select using (bucket_id = 'brand-assets');

drop policy if exists "authenticated users upload brand assets" on storage.objects;
create policy "authenticated users upload brand assets" on storage.objects
for insert to authenticated with check (bucket_id = 'brand-assets');

drop policy if exists "authenticated users update own brand assets" on storage.objects;
create policy "authenticated users update own brand assets" on storage.objects
for update to authenticated using (bucket_id = 'brand-assets')
with check (bucket_id = 'brand-assets');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-attachments',
  'task-attachments',
  false,
  10485760,
  null
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "task attachment objects readable by org members" on storage.objects;
create policy "task attachment objects readable by org members" on storage.objects
for select to authenticated using (
  bucket_id = 'task-attachments'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "task attachment objects uploadable by org members" on storage.objects;
create policy "task attachment objects uploadable by org members" on storage.objects
for insert to authenticated with check (
  bucket_id = 'task-attachments'
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

create or replace function public.ensure_profile(user_name text default '')
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  created_profile public.profiles;
begin
  insert into public.profiles (id, email, contact_email, full_name)
  values (
    auth.uid(),
    coalesce((auth.jwt() ->> 'email'), ''),
    coalesce((auth.jwt() ->> 'email'), ''),
    coalesce(nullif(user_name, ''), split_part(coalesce((auth.jwt() ->> 'email'), ''), '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email,
        contact_email = coalesce(nullif(public.profiles.contact_email, ''), excluded.contact_email),
        full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name)
  returning * into created_profile;

  return created_profile;
end;
$$;

create or replace function public.create_workspace(
  workspace_name text,
  preset_id text default 'generic_coaching'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  profile_row public.profiles;
  preset_row public.interface_presets;
begin
  profile_row := public.ensure_profile('');

  select * into preset_row
  from public.interface_presets
  where id = preset_id;

  if preset_row.id is null then
    raise exception 'Unknown interface preset';
  end if;

  insert into public.organizations (name, industry_preset_id, created_by)
  values (workspace_name, preset_row.id, auth.uid())
  returning id into org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (org_id, auth.uid(), 'owner');

  insert into public.organization_settings (
    organization_id, display_name, logo_text, hero_image_url, primary_color, secondary_color, brand_profiles
  ) values (
    org_id,
    workspace_name,
    upper(left(regexp_replace(workspace_name, '[^A-Za-z0-9]', '', 'g'), 2)),
    '',
    preset_row.accent_color,
    preset_row.support_color,
    jsonb_build_object(
      preset_row.id,
      jsonb_build_object(
        'display_name', workspace_name,
        'logo_text', upper(left(regexp_replace(workspace_name, '[^A-Za-z0-9]', '', 'g'), 2)),
        'logo_url', '',
        'hero_image_url', '',
        'primary_color', preset_row.accent_color,
        'secondary_color', preset_row.support_color
      )
    )
  );

  perform public.seed_task_templates_for_org(org_id, preset_row.id);

  return org_id;
end;
$$;

create or replace function public.create_invitation(
  org_id uuid,
  invite_email text,
  invite_role public.member_role,
  client_coach uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_code text;
  active_client_count integer := 0;
  pending_client_invite_count integer := 0;
  current_client_limit integer := 10;
  target_coach_id uuid;
begin
  if not public.has_org_role(org_id, array['owner','coach']::public.member_role[]) then
    raise exception 'Not allowed';
  end if;

  if invite_role = 'owner' and not public.has_org_role(org_id, array['owner']::public.member_role[]) then
    raise exception 'Only owners can invite owners';
  end if;

  if invite_role = 'client' then
    target_coach_id := coalesce(client_coach, auth.uid());

    select coalesce(client_limit, 10) into current_client_limit
    from public.organization_settings
    where organization_id = org_id;

    select count(distinct client_id) into active_client_count
    from public.coach_client_relationships
    where organization_id = org_id
      and coach_id = target_coach_id
      and active = true;

    select count(*) into pending_client_invite_count
    from public.invitations
    where organization_id = org_id
      and role = 'client'
      and coalesce(client_coach_id, invited_by) = target_coach_id
      and accepted_at is null;

    if current_client_limit > 0 and active_client_count + pending_client_invite_count >= current_client_limit then
      raise exception 'CLIENT_LIMIT_REACHED:%', current_client_limit;
    end if;
  end if;

  invite_code := upper(left(md5(random()::text || clock_timestamp()::text || auth.uid()::text), 10));

  insert into public.invitations (organization_id, email, role, invited_by, client_coach_id, code)
  values (org_id, lower(invite_email), invite_role, auth.uid(), client_coach, invite_code);

  return invite_code;
end;
$$;

drop function if exists public.accept_invitation(text, text);

create or replace function public.accept_invitation(
  invite_code text,
  selected_preset_id text default null,
  company_name text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.invitations;
  profile_row public.profiles;
  user_email text;
  new_org_id uuid;
  preset_row public.interface_presets;
  workspace_name text;
begin
  profile_row := public.ensure_profile('');
  user_email := lower(coalesce((auth.jwt() ->> 'email'), ''));

  select * into invite
  from public.invitations
  where code = upper(invite_code)
    and accepted_at is null;

  if invite.id is null then
    raise exception 'Invitation not found';
  end if;

  if lower(invite.email) <> user_email then
    raise exception 'Invitation is for another email address';
  end if;

  if invite.role = 'coach' then
    select * into preset_row
    from public.interface_presets
    where id = coalesce(selected_preset_id, 'generic_coaching');

    if preset_row.id is null then
      raise exception 'Unknown interface preset';
    end if;

    workspace_name := coalesce(
      nullif(trim(company_name), ''),
      nullif(profile_row.full_name, ''),
      split_part(user_email, '@', 1)
    );

    insert into public.organizations (name, industry_preset_id, created_by)
    values (
      workspace_name,
      preset_row.id,
      auth.uid()
    )
    returning id into new_org_id;

    insert into public.organization_members (organization_id, user_id, role)
    values (new_org_id, auth.uid(), 'owner');

    insert into public.organization_settings (
      organization_id, display_name, logo_text, hero_image_url, primary_color, secondary_color, brand_profiles
    ) values (
      new_org_id,
      workspace_name,
      upper(left(regexp_replace(workspace_name, '[^A-Za-z0-9]', '', 'g'), 2)),
      '',
      preset_row.accent_color,
      preset_row.support_color,
      jsonb_build_object(
        preset_row.id,
        jsonb_build_object(
          'display_name', workspace_name,
          'logo_text', upper(left(regexp_replace(workspace_name, '[^A-Za-z0-9]', '', 'g'), 2)),
          'logo_url', '',
          'hero_image_url', '',
          'primary_color', preset_row.accent_color,
          'secondary_color', preset_row.support_color
        )
      )
    );

    perform public.seed_task_templates_for_org(new_org_id, preset_row.id);
  else
    insert into public.organization_members (organization_id, user_id, role)
    values (invite.organization_id, auth.uid(), invite.role)
    on conflict (organization_id, user_id) do update
      set role = excluded.role,
          active = true;
  end if;

  if invite.role = 'client' then
    insert into public.coach_client_relationships (organization_id, coach_id, client_id)
    values (invite.organization_id, coalesce(invite.client_coach_id, invite.invited_by), auth.uid())
    on conflict (organization_id, coach_id, client_id) do update
      set active = true;
  end if;

  update public.invitations
  set accepted_at = now()
  where id = invite.id;

  return coalesce(new_org_id, invite.organization_id);
end;
$$;

insert into public.organization_members (organization_id, user_id, role, active)
select distinct invitations.organization_id, profiles.id, 'client'::public.member_role, true
from public.invitations
join public.profiles
  on lower(profiles.email) = lower(invitations.email)
  or lower(profiles.contact_email) = lower(invitations.email)
where invitations.role = 'client'
  and invitations.accepted_at is not null
on conflict (organization_id, user_id) do update
  set role = 'client'::public.member_role,
      active = true;

insert into public.coach_client_relationships (organization_id, coach_id, client_id, active)
select distinct
  invitations.organization_id,
  coalesce(invitations.client_coach_id, invitations.invited_by),
  profiles.id,
  true
from public.invitations
join public.profiles
  on lower(profiles.email) = lower(invitations.email)
  or lower(profiles.contact_email) = lower(invitations.email)
where invitations.role = 'client'
  and invitations.accepted_at is not null
on conflict (organization_id, coach_id, client_id) do update
  set active = true;

create or replace function public.get_invitation_info(invite_code text, invite_email text)
returns table(role public.member_role)
language sql
security definer
set search_path = public
as $$
  select invitations.role
  from public.invitations
  where invitations.code = upper(invite_code)
    and lower(invitations.email) = lower(invite_email)
    and invitations.accepted_at is null
  limit 1;
$$;

drop function if exists public.complete_task(uuid, text, text);

create or replace function public.complete_task(task_id uuid, reflection_text text, reflection_mood text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.tasks;
  new_reflection_id uuid;
begin
  select * into task_row
  from public.tasks
  where id = task_id;

  if task_row.id is null or task_row.client_id <> auth.uid() then
    raise exception 'Task not found';
  end if;

  if task_row.status = 'done' then
    raise exception 'Task already completed';
  end if;

  update public.tasks
  set status = 'done', completed_at = now()
  where id = task_id and client_id = auth.uid();

  insert into public.reflections (task_id, organization_id, client_id, text, mood)
  values (task_id, task_row.organization_id, auth.uid(), reflection_text, reflection_mood)
  returning id into new_reflection_id;

  return new_reflection_id;
end;
$$;

create or replace function public.seed_task_templates_for_org(seed_org_id uuid, seed_preset_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_templates (organization_id, preset_id, title, description, created_by)
  select seed_org_id, seed_preset_id, template.title, template.description, auth.uid()
  from (
    values
      ('generic_coaching', 'Wochenfokus festlegen', 'Formuliere einen konkreten Fokus für die kommende Woche und notiere, woran du erkennst, dass du ihn umgesetzt hast.'),
      ('generic_coaching', 'Reflexion nach Umsetzung', 'Nimm dir 10 Minuten Zeit und beschreibe, was gut funktioniert hat, was schwierig war und was du beim nächsten Mal anders machen möchtest.'),
      ('generic_coaching', 'Kleiner nächster Schritt', 'Wähle einen kleinen, realistischen Schritt aus und setze ihn bis zum nächsten Termin um.'),
      ('generic_coaching', 'Entscheidung vorbereiten', 'Sammle die wichtigsten Optionen, Vor- und Nachteile und formuliere, welche Entscheidung sich aktuell stimmig anfühlt.'),
      ('psychotherapy', 'Achtsamkeitsübung', 'Nimm dir täglich 5 Minuten Zeit, beobachte Atem, Körperempfindungen und Gedanken, ohne sie zu bewerten.'),
      ('psychotherapy', 'Situationsprotokoll', 'Beschreibe eine belastende Situation: Auslöser, Gedanken, Gefühle, Körperreaktionen und dein Verhalten.'),
      ('psychotherapy', 'Ressourcenmoment sammeln', 'Notiere jeden Tag einen Moment, der dir gutgetan hat oder in dem du etwas bewältigt hast.'),
      ('psychotherapy', 'Selbstfürsorge planen', 'Plane eine kleine konkrete Handlung, die dir Stabilität gibt, und notiere danach, wie sie sich ausgewirkt hat.'),
      ('physiotherapy', 'Heimübung durchführen', 'Führe die besprochene Übung wie vereinbart durch und achte auf saubere Ausführung sowie Schmerzsignale.'),
      ('physiotherapy', 'Schmerzskala dokumentieren', 'Notiere vor und nach der Übung deinen Schmerz von 0 bis 10 und was die Belastung beeinflusst hat.'),
      ('physiotherapy', 'Beweglichkeit beobachten', 'Teste vorsichtig die besprochene Bewegung und dokumentiere, ob Beweglichkeit oder Stabilität besser wird.'),
      ('physiotherapy', 'Alltagsbelastung testen', 'Wähle eine typische Alltagssituation und beobachte, wie gut sie mit der aktuellen Belastbarkeit funktioniert.'),
      ('football', 'Techniktraining Ballkontrolle', 'Trainiere 15 Minuten Ballführung mit beiden Füßen und notiere, was sicherer oder schwieriger wurde.'),
      ('football', 'Athletik-Einheit', 'Führe die vereinbarte kurze Athletik-Einheit durch und achte auf saubere Ausführung und Belastungsgefühl.'),
      ('football', 'Spielreflexion', 'Reflektiere dein letztes Training oder Spiel: Was war stark, was willst du konkret verbessern?'),
      ('football', 'Mentales Wochenziel', 'Formuliere ein mentales Ziel für Training oder Spiel, zum Beispiel Kommunikation, Fokus oder Umgang mit Fehlern.'),
      ('dog_training', 'Signal im Alltag üben', 'Übe das vereinbarte Signal in ruhiger Umgebung und steigere die Ablenkung erst, wenn es zuverlässig klappt.'),
      ('dog_training', 'Verhalten beobachten', 'Notiere Situation, Auslöser, Reaktion deines Hundes und was du in diesem Moment gemacht hast.'),
      ('dog_training', 'Kurze Trainingseinheiten', 'Plane drei kurze Einheiten von 3 bis 5 Minuten und beende jede Einheit mit einem positiven Abschluss.'),
      ('dog_training', 'Management-Maßnahme testen', 'Teste eine vereinbarte Management-Maßnahme im Alltag und notiere, ob sie Stress reduziert hat.'),
      ('nutrition', 'Proteinanker einbauen', 'Wähle für zwei Mahlzeiten eine passende Proteinquelle und beobachte Sättigung, Energie und Umsetzbarkeit.'),
      ('nutrition', 'Gemüseportion ergänzen', 'Ergänze an drei Tagen bewusst eine zusätzliche Gemüse- oder Obstportion und notiere, wann es leicht fiel.'),
      ('nutrition', 'Trinkroutine testen', 'Lege eine realistische Trinkroutine für den Tag fest und dokumentiere, wie gut sie in deinen Alltag passt.'),
      ('nutrition', 'Sättigungsskala nutzen', 'Bewerte vor und nach ausgewählten Mahlzeiten Hunger und Sättigung von 1 bis 10 und notiere Auffälligkeiten.'),
      ('nutrition', 'Einkauf vorbereiten', 'Plane eine einfache Einkaufsliste für zwei alltagstaugliche Mahlzeiten, die zu deinem aktuellen Ziel passen.')
  ) as template(preset_id, title, description)
  where template.preset_id = seed_preset_id
    and not exists (
      select 1
      from public.task_templates existing
      where existing.organization_id = seed_org_id
        and existing.preset_id = template.preset_id
        and existing.title = template.title
    );
end;
$$;

create or replace function public.remove_client_from_workspace(org_id uuid, removed_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.has_org_role(org_id, array['owner']::public.member_role[])
    or public.is_assigned_coach(org_id, removed_client_id)
  ) then
    raise exception 'Not allowed';
  end if;

  update public.coach_client_relationships
  set active = false
  where organization_id = org_id
    and client_id = removed_client_id
    and (
      coach_id = auth.uid()
      or public.has_org_role(org_id, array['owner']::public.member_role[])
    );

  update public.organization_members
  set active = false
  where organization_id = org_id
    and user_id = removed_client_id
    and role = 'client';
end;
$$;

create or replace function public.update_workspace_preset(org_id uuid, preset_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  preset_row public.interface_presets;
begin
  if not public.has_org_role(org_id, array['owner']::public.member_role[]) then
    raise exception 'Not allowed';
  end if;

  select * into preset_row
  from public.interface_presets
  where id = preset_id;

  if preset_row.id is null then
    raise exception 'Unknown interface preset';
  end if;

  update public.organizations
  set industry_preset_id = preset_row.id
  where id = org_id;

  update public.organization_settings
  set brand_profiles = case
    when coalesce(brand_profiles, '{}'::jsonb) ? preset_row.id then brand_profiles
    else coalesce(brand_profiles, '{}'::jsonb) || jsonb_build_object(
      preset_row.id,
      jsonb_build_object(
        'display_name', display_name,
        'logo_text', logo_text,
        'logo_url', logo_url,
        'hero_image_url', coalesce(hero_image_url, ''),
        'primary_color', preset_row.accent_color,
        'secondary_color', preset_row.support_color
      )
    )
  end
  where organization_id = org_id;

  perform public.seed_task_templates_for_org(org_id, preset_row.id);
end;
$$;

create or replace function public.update_profile_contact(
  target_user_id uuid,
  new_full_name text,
  new_contact_email text,
  new_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    target_user_id = auth.uid()
    or exists (
      select 1
      from public.coach_client_relationships rel
      where rel.coach_id = auth.uid()
        and rel.client_id = target_user_id
        and rel.active = true
    )
    or exists (
      select 1
      from public.organization_members owner_membership
      join public.organization_members target_membership
        on target_membership.organization_id = owner_membership.organization_id
      where owner_membership.user_id = auth.uid()
        and owner_membership.role = 'owner'
        and owner_membership.active = true
        and target_membership.user_id = target_user_id
        and target_membership.active = true
    )
  ) then
    raise exception 'Not allowed';
  end if;

  update public.profiles
  set full_name = trim(new_full_name),
      contact_email = lower(trim(new_contact_email)),
      phone = trim(coalesce(new_phone, ''))
  where id = target_user_id;
end;
$$;

do $$
declare
  org_row record;
  preset_row record;
begin
  for org_row in
    select id
    from public.organizations
  loop
    for preset_row in
      select id
      from public.interface_presets
    loop
      perform public.seed_task_templates_for_org(org_row.id, preset_row.id);
    end loop;
  end loop;
end $$;

grant execute on function public.ensure_profile(text) to authenticated;
grant execute on function public.create_workspace(text, text) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.member_role, uuid) to authenticated;
grant execute on function public.accept_invitation(text, text, text) to authenticated;
grant execute on function public.get_invitation_info(text, text) to anon, authenticated;
grant execute on function public.complete_task(uuid, text, text) to authenticated;
grant execute on function public.seed_task_templates_for_org(uuid, text) to authenticated;
grant execute on function public.remove_client_from_workspace(uuid, uuid) to authenticated;
grant execute on function public.update_workspace_preset(uuid, text) to authenticated;
grant execute on function public.update_profile_contact(uuid, text, text, text) to authenticated;
