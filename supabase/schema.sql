-- Moment:um MVP schema for Supabase Free.
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
  logo_text text not null default 'M',
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

create table if not exists public.club_licenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  admin_email text not null,
  admin_user_id uuid references public.profiles(id) on delete set null,
  admin_organization_id uuid references public.organizations(id) on delete set null,
  industry_preset_id text not null references public.interface_presets(id),
  trainer_limit integer not null default 10 check (trainer_limit > 0),
  client_limit_per_trainer integer not null default 10 check (client_limit_per_trainer > 0),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.club_trainers (
  club_id uuid not null references public.club_licenses(id) on delete cascade,
  trainer_user_id uuid not null references public.profiles(id) on delete cascade,
  trainer_organization_id uuid not null references public.organizations(id) on delete cascade,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (club_id, trainer_user_id)
);

create table if not exists public.club_client_transfers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.club_licenses(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  source_trainer_id uuid not null references public.profiles(id),
  source_organization_id uuid not null references public.organizations(id),
  assigned_trainer_id uuid references public.profiles(id),
  assigned_organization_id uuid references public.organizations(id),
  status text not null default 'pending' check (status in ('pending', 'assigned')),
  created_at timestamptz not null default now(),
  assigned_at timestamptz
);

create unique index if not exists club_client_transfers_pending_unique
on public.club_client_transfers(club_id, client_id, source_trainer_id)
where status = 'pending';

alter table public.invitations
add column if not exists club_license_id uuid references public.club_licenses(id) on delete cascade;

alter table public.invitations
add column if not exists invitation_kind text not null default 'standard'
check (invitation_kind in ('standard', 'club_admin', 'club_trainer'));

create table if not exists public.coach_client_relationships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, coach_id, client_id)
);

create table if not exists public.client_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists client_groups_org_coach_idx on public.client_groups(organization_id, coach_id);

create table if not exists public.client_group_members (
  group_id uuid not null references public.client_groups(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, client_id)
);

create index if not exists client_group_members_org_client_idx on public.client_group_members(organization_id, client_id);

create table if not exists public.assignment_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  due_date date not null,
  recipient_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists assignment_batches_org_coach_idx on public.assignment_batches(organization_id, coach_id);

create table if not exists public.assignment_batch_recipients (
  batch_id uuid not null references public.assignment_batches(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null references public.client_groups(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (batch_id, group_id, client_id)
);

create index if not exists assignment_batch_recipients_org_group_idx on public.assignment_batch_recipients(organization_id, group_id);
create index if not exists assignment_batch_recipients_batch_client_idx on public.assignment_batch_recipients(batch_id, client_id);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coach_id uuid not null references public.profiles(id),
  client_id uuid not null references public.profiles(id),
  assignment_batch_id uuid references public.assignment_batches(id) on delete set null,
  title text not null,
  description text not null default '',
  due_date date not null,
  status public.task_status not null default 'open',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks
  add column if not exists assignment_batch_id uuid references public.assignment_batches(id) on delete set null;

create index if not exists tasks_assignment_batch_idx on public.tasks(assignment_batch_id);

create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.profiles(id),
  text text not null,
  mood text,
  created_at timestamptz not null default now()
);

create table if not exists public.task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.profiles(id),
  message text not null default '',
  response text,
  responded_by uuid references public.profiles(id),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.task_updates
  add column if not exists response text,
  add column if not exists responded_by uuid references public.profiles(id),
  add column if not exists responded_at timestamptz;

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  reflection_id uuid references public.reflections(id) on delete cascade,
  task_update_id uuid references public.task_updates(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  file_type text not null default 'application/octet-stream',
  file_size bigint not null default 0,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

alter table public.task_attachments
  add column if not exists task_update_id uuid references public.task_updates(id) on delete cascade;

create index if not exists task_updates_task_idx on public.task_updates(task_id);
create index if not exists task_updates_client_idx on public.task_updates(client_id);
create index if not exists task_attachments_task_idx on public.task_attachments(task_id);
create index if not exists task_attachments_reflection_idx on public.task_attachments(reflection_id);
create index if not exists task_attachments_update_idx on public.task_attachments(task_update_id);

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
  ('martial_arts', 'Kampfsport', 'Trainer:in', 'Sportler:in', 'Trainingsaufgabe', 'Was hast du geübt, wie hat es sich angefühlt und woran möchtest du weiterarbeiten?', '#7E8F86', '#C6A878', 'https://images.unsplash.com/photo-1555597673-b21d5c935865?auto=format&fit=crop&w=1200&q=80', '["Technik", "Körpergefühl", "Disziplin"]'),
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
        ('martial_arts', '#7E8F86', '#C6A878', '#7E8F86', '#C6A878'),
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
alter table public.club_licenses enable row level security;
alter table public.club_trainers enable row level security;
alter table public.club_client_transfers enable row level security;
alter table public.coach_client_relationships enable row level security;
alter table public.client_groups enable row level security;
alter table public.client_group_members enable row level security;
alter table public.assignment_batches enable row level security;
alter table public.assignment_batch_recipients enable row level security;
alter table public.tasks enable row level security;
alter table public.reflections enable row level security;
alter table public.task_updates enable row level security;
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

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'andrija.siskovic@gmail.com';
$$;

create or replace function public.is_club_admin(club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_licenses licenses
    where licenses.id = club_id
      and licenses.admin_user_id = auth.uid()
      and licenses.active = true
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
  or exists (
    select 1
    from public.club_client_transfers transfers
    join public.club_licenses licenses on licenses.id = transfers.club_id
    where transfers.client_id = profiles.id
      and licenses.admin_user_id = auth.uid()
      and licenses.active = true
  )
  or exists (
    select 1
    from public.club_trainers trainers
    join public.club_licenses licenses on licenses.id = trainers.club_id
    where trainers.trainer_user_id = profiles.id
      and licenses.admin_user_id = auth.uid()
      and licenses.active = true
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
for update to authenticated using (
  public.has_org_role(organization_id, array['owner']::public.member_role[])
  and not exists (
    select 1 from public.club_trainers trainers
    where trainers.trainer_organization_id = organization_settings.organization_id
      and trainers.active = true
  )
)
with check (
  public.has_org_role(organization_id, array['owner']::public.member_role[])
  and not exists (
    select 1 from public.club_trainers trainers
    where trainers.trainer_organization_id = organization_settings.organization_id
      and trainers.active = true
  )
);

drop policy if exists "members readable by members" on public.organization_members;
create policy "members readable by members" on public.organization_members
for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists "invitations readable by owners and coaches" on public.invitations;
create policy "invitations readable by owners and coaches" on public.invitations
for select to authenticated using (public.has_org_role(organization_id, array['owner','coach']::public.member_role[]));

drop policy if exists "club licenses visible in license scope" on public.club_licenses;
create policy "club licenses visible in license scope" on public.club_licenses
for select to authenticated using (
  public.is_platform_owner()
  or admin_user_id = auth.uid()
  or exists (
    select 1 from public.club_trainers trainers
    where trainers.club_id = club_licenses.id
      and trainers.trainer_user_id = auth.uid()
      and trainers.active = true
  )
);

drop policy if exists "club trainers visible to club admins and self" on public.club_trainers;
create policy "club trainers visible to club admins and self" on public.club_trainers
for select to authenticated using (
  public.is_platform_owner()
  or trainer_user_id = auth.uid()
  or public.is_club_admin(club_id)
);

drop policy if exists "club transfers visible to club admins" on public.club_client_transfers;
create policy "club transfers visible to club admins" on public.club_client_transfers
for select to authenticated using (
  public.is_platform_owner()
  or public.is_club_admin(club_id)
);

drop policy if exists "relationships readable by org members" on public.coach_client_relationships;
create policy "relationships readable by org members" on public.coach_client_relationships
for select to authenticated using (public.is_org_member(organization_id));

drop policy if exists "client groups readable by owners and owning coach" on public.client_groups;
create policy "client groups readable by owners and owning coach" on public.client_groups
for select to authenticated using (
  public.has_org_role(organization_id, array['owner']::public.member_role[])
  or coach_id = auth.uid()
);

drop policy if exists "client groups editable by owners and owning coach" on public.client_groups;
create policy "client groups editable by owners and owning coach" on public.client_groups
for all to authenticated using (
  public.has_org_role(organization_id, array['owner']::public.member_role[])
  or coach_id = auth.uid()
)
with check (
  public.has_org_role(organization_id, array['owner']::public.member_role[])
  or coach_id = auth.uid()
);

drop policy if exists "client group members readable by group scope" on public.client_group_members;
create policy "client group members readable by group scope" on public.client_group_members
for select to authenticated using (
  exists (
    select 1
    from public.client_groups groups
    where groups.id = client_group_members.group_id
      and groups.organization_id = client_group_members.organization_id
      and (
        groups.coach_id = auth.uid()
        or public.has_org_role(groups.organization_id, array['owner']::public.member_role[])
      )
  )
);

drop policy if exists "client group members editable by group scope" on public.client_group_members;
create policy "client group members editable by group scope" on public.client_group_members
for all to authenticated using (
  exists (
    select 1
    from public.client_groups groups
    where groups.id = client_group_members.group_id
      and groups.organization_id = client_group_members.organization_id
      and (
        groups.coach_id = auth.uid()
        or public.has_org_role(groups.organization_id, array['owner']::public.member_role[])
      )
  )
)
with check (
  exists (
    select 1
    from public.client_groups groups
    where groups.id = client_group_members.group_id
      and groups.organization_id = client_group_members.organization_id
      and (
        groups.coach_id = auth.uid()
        or public.has_org_role(groups.organization_id, array['owner']::public.member_role[])
      )
  )
  and exists (
    select 1
    from public.organization_members members
    where members.organization_id = client_group_members.organization_id
      and members.user_id = client_group_members.client_id
      and members.role = 'client'
      and members.active = true
  )
  and (
    public.has_org_role(organization_id, array['owner']::public.member_role[])
    or public.is_assigned_coach(organization_id, client_id)
  )
);

drop policy if exists "assignment batches readable by owners and owning coach" on public.assignment_batches;
create policy "assignment batches readable by owners and owning coach" on public.assignment_batches
for select to authenticated using (
  public.has_org_role(organization_id, array['owner']::public.member_role[])
  or coach_id = auth.uid()
);

drop policy if exists "assignment batches editable by owners and owning coach" on public.assignment_batches;
create policy "assignment batches editable by owners and owning coach" on public.assignment_batches
for all to authenticated using (
  public.has_org_role(organization_id, array['owner']::public.member_role[])
  or coach_id = auth.uid()
)
with check (
  public.has_org_role(organization_id, array['owner']::public.member_role[])
  or coach_id = auth.uid()
);

drop policy if exists "assignment batch recipients readable by batch scope" on public.assignment_batch_recipients;
create policy "assignment batch recipients readable by batch scope" on public.assignment_batch_recipients
for select to authenticated using (
  exists (
    select 1
    from public.assignment_batches batches
    where batches.id = assignment_batch_recipients.batch_id
      and batches.organization_id = assignment_batch_recipients.organization_id
      and (
        batches.coach_id = auth.uid()
        or public.has_org_role(batches.organization_id, array['owner']::public.member_role[])
      )
  )
);

drop policy if exists "assignment batch recipients editable by batch scope" on public.assignment_batch_recipients;
create policy "assignment batch recipients editable by batch scope" on public.assignment_batch_recipients
for all to authenticated using (
  exists (
    select 1
    from public.assignment_batches batches
    where batches.id = assignment_batch_recipients.batch_id
      and batches.organization_id = assignment_batch_recipients.organization_id
      and (
        batches.coach_id = auth.uid()
        or public.has_org_role(batches.organization_id, array['owner']::public.member_role[])
      )
  )
)
with check (
  exists (
    select 1
    from public.assignment_batches batches
    where batches.id = assignment_batch_recipients.batch_id
      and batches.organization_id = assignment_batch_recipients.organization_id
      and (
        batches.coach_id = auth.uid()
        or public.has_org_role(batches.organization_id, array['owner']::public.member_role[])
      )
  )
  and exists (
    select 1
    from public.client_groups groups
    where groups.id = assignment_batch_recipients.group_id
      and groups.organization_id = assignment_batch_recipients.organization_id
      and (
        groups.coach_id = auth.uid()
        or public.has_org_role(groups.organization_id, array['owner']::public.member_role[])
      )
  )
  and (
    public.has_org_role(organization_id, array['owner']::public.member_role[])
    or public.is_assigned_coach(organization_id, client_id)
  )
);

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
  or exists (
    select 1
    from public.tasks
    where tasks.id = reflections.task_id
      and tasks.coach_id = auth.uid()
  )
);

drop policy if exists "clients create own reflections" on public.reflections;
create policy "clients create own reflections" on public.reflections
for insert to authenticated with check (client_id = auth.uid());

drop policy if exists "task updates visible in task scope" on public.task_updates;
create policy "task updates visible in task scope" on public.task_updates
for select to authenticated using (
  exists (
    select 1
    from public.tasks
    where tasks.id = task_updates.task_id
      and tasks.organization_id = task_updates.organization_id
      and (
        tasks.client_id = auth.uid()
        or tasks.coach_id = auth.uid()
        or public.has_org_role(tasks.organization_id, array['owner']::public.member_role[])
        or public.is_assigned_coach(tasks.organization_id, tasks.client_id)
      )
  )
);

drop policy if exists "clients create updates for own open tasks" on public.task_updates;
create policy "clients create updates for own open tasks" on public.task_updates
for insert to authenticated with check (
  client_id = auth.uid()
  and exists (
    select 1
    from public.tasks
    where tasks.id = task_updates.task_id
      and tasks.organization_id = task_updates.organization_id
      and tasks.client_id = auth.uid()
      and tasks.status = 'open'
  )
);

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
          and task_attachments.task_update_id is null
          and (
            tasks.coach_id = auth.uid()
            or public.has_org_role(tasks.organization_id, array['owner']::public.member_role[])
            or public.is_assigned_coach(tasks.organization_id, tasks.client_id)
          )
        )
        or (
          task_attachments.reflection_id is not null
          and task_attachments.task_update_id is null
          and tasks.client_id = auth.uid()
          and exists (
            select 1
            from public.reflections
            where reflections.id = task_attachments.reflection_id
              and reflections.task_id = tasks.id
              and reflections.client_id = auth.uid()
          )
        )
        or (
          task_attachments.task_update_id is not null
          and task_attachments.reflection_id is null
          and tasks.client_id = auth.uid()
          and exists (
            select 1
            from public.task_updates
            where task_updates.id = task_attachments.task_update_id
              and task_updates.task_id = tasks.id
              and task_updates.client_id = auth.uid()
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
for select to authenticated using (
  public.is_org_member(organization_id)
  or exists (
    select 1
    from public.club_trainers trainers
    join public.club_licenses licenses on licenses.id = trainers.club_id
    where trainers.trainer_user_id = auth.uid()
      and trainers.active = true
      and licenses.admin_organization_id = task_templates.organization_id
      and licenses.active = true
  )
);

drop policy if exists "task templates editable by owners and coaches" on public.task_templates;
create policy "task templates editable by owners and coaches" on public.task_templates
for all to authenticated using (
  public.has_org_role(organization_id, array['owner','coach']::public.member_role[])
  and not exists (
    select 1 from public.club_trainers trainers
    where trainers.trainer_organization_id = task_templates.organization_id
      and trainers.active = true
  )
)
with check (
  public.has_org_role(organization_id, array['owner','coach']::public.member_role[])
  and not exists (
    select 1 from public.club_trainers trainers
    where trainers.trainer_organization_id = task_templates.organization_id
      and trainers.active = true
  )
);

grant usage on schema public to anon, authenticated;

grant select on public.interface_presets to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.organizations to authenticated;
grant select, update on public.organization_settings to authenticated;
grant select on public.organization_members to authenticated;
grant select on public.invitations to authenticated;
grant select on public.club_licenses to authenticated;
grant select on public.club_trainers to authenticated;
grant select on public.club_client_transfers to authenticated;
grant select on public.coach_client_relationships to authenticated;
grant select, insert, update, delete on public.client_groups to authenticated;
grant select, insert, delete on public.client_group_members to authenticated;
grant select, insert, update, delete on public.assignment_batches to authenticated;
grant select, insert, update, delete on public.assignment_batch_recipients to authenticated;
grant select, insert, update on public.tasks to authenticated;
grant select, insert on public.reflections to authenticated;
grant select, insert on public.task_updates to authenticated;
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
  52428800,
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
  current_client_limit integer := 10;
  target_coach_id uuid;
begin
  if not public.has_org_role(org_id, array['owner','coach']::public.member_role[]) then
    raise exception 'Not allowed';
  end if;

  if invite_role in ('owner', 'coach') and not public.is_platform_owner() then
    raise exception 'Only the platform owner can invite owners or independent coaches';
  end if;

  if invite_role = 'client' then
    target_coach_id := coalesce(client_coach, auth.uid());

    select coalesce(client_limit, 10) into current_client_limit
    from public.organization_settings
    where organization_id = org_id;

    select count(distinct client_id) into active_client_count
    from public.coach_client_relationships relationships
    join public.organization_members members
      on members.organization_id = relationships.organization_id
      and members.user_id = relationships.client_id
      and members.role = 'client'
      and members.active = true
    where relationships.organization_id = org_id
      and relationships.coach_id = target_coach_id
      and relationships.active = true;

    if current_client_limit > 0 and active_client_count >= current_client_limit then
      raise exception 'CLIENT_LIMIT_REACHED:%', current_client_limit;
    end if;
  end if;

  invite_code := upper(left(md5(random()::text || clock_timestamp()::text || auth.uid()::text), 10));

  insert into public.invitations (organization_id, email, role, invited_by, client_coach_id, code)
  values (org_id, lower(invite_email), invite_role, auth.uid(), client_coach, invite_code);

  return invite_code;
end;
$$;

create or replace function public.create_club_license(
  source_org_id uuid,
  license_name text,
  administrator_email text,
  preset_id text,
  trainer_limit_value integer default 10,
  client_limit_value integer default 10
)
returns table(club_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_club_id uuid;
  new_code text;
  invitation_org_id uuid;
begin
  if not public.is_platform_owner() then
    raise exception 'Not allowed';
  end if;

  if nullif(trim(license_name), '') is null or nullif(trim(administrator_email), '') is null then
    raise exception 'Name and administrator email are required';
  end if;

  if not exists (select 1 from public.interface_presets presets where presets.id = preset_id) then
    raise exception 'Unknown interface preset';
  end if;

  select members.organization_id into invitation_org_id
  from public.organization_members members
  where members.organization_id = source_org_id
    and members.user_id = auth.uid()
    and members.role = 'owner'
    and members.active = true
  order by members.created_at
  limit 1;

  if invitation_org_id is null then
    raise exception 'Owner workspace required';
  end if;

  insert into public.club_licenses (
    name, admin_email, industry_preset_id, trainer_limit,
    client_limit_per_trainer, created_by
  ) values (
    trim(license_name), lower(trim(administrator_email)), preset_id,
    greatest(coalesce(trainer_limit_value, 10), 1),
    greatest(coalesce(client_limit_value, 10), 1), auth.uid()
  ) returning id into new_club_id;

  new_code := upper(left(md5(random()::text || clock_timestamp()::text || auth.uid()::text), 10));
  insert into public.invitations (
    organization_id, email, role, invited_by, code, club_license_id, invitation_kind
  ) values (
    invitation_org_id, lower(trim(administrator_email)), 'coach', auth.uid(),
    new_code, new_club_id, 'club_admin'
  );

  return query select new_club_id, new_code;
end;
$$;

create or replace function public.create_club_trainer_invitation(
  target_club_id uuid,
  trainer_email text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  license_row public.club_licenses;
  active_trainers integer := 0;
  open_trainer_invites integer := 0;
  new_code text;
begin
  select * into license_row
  from public.club_licenses licenses
  where licenses.id = target_club_id
    and licenses.active = true;

  if license_row.id is null or license_row.admin_user_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  select count(*) into active_trainers
  from public.club_trainers trainers
  where trainers.club_id = target_club_id
    and trainers.active = true;

  select count(*) into open_trainer_invites
  from public.invitations invitations
  where invitations.club_license_id = target_club_id
    and invitations.invitation_kind = 'club_trainer'
    and invitations.accepted_at is null;

  if active_trainers + open_trainer_invites >= license_row.trainer_limit then
    raise exception 'TRAINER_LIMIT_REACHED:%', license_row.trainer_limit;
  end if;

  if exists (
    select 1 from public.invitations invitations
    where invitations.club_license_id = target_club_id
      and lower(invitations.email) = lower(trim(trainer_email))
      and invitations.invitation_kind = 'club_trainer'
      and invitations.accepted_at is null
  ) then
    raise exception 'An open invitation already exists for this email';
  end if;

  if exists (
    select 1
    from public.club_trainers trainers
    join public.profiles profiles on profiles.id = trainers.trainer_user_id
    where trainers.club_id = target_club_id
      and trainers.active = true
      and lower(coalesce(nullif(profiles.contact_email, ''), profiles.email)) = lower(trim(trainer_email))
  ) then
    raise exception 'This trainer is already active in the club';
  end if;

  new_code := upper(left(md5(random()::text || clock_timestamp()::text || auth.uid()::text), 10));
  insert into public.invitations (
    organization_id, email, role, invited_by, code, club_license_id, invitation_kind
  ) values (
    license_row.admin_organization_id, lower(trim(trainer_email)), 'coach', auth.uid(),
    new_code, target_club_id, 'club_trainer'
  );

  return new_code;
end;
$$;

create or replace function public.get_club_context(org_id uuid)
returns table(
  club_id uuid,
  club_name text,
  club_role text,
  admin_user_id uuid,
  admin_organization_id uuid,
  trainer_limit integer,
  client_limit_per_trainer integer,
  industry_preset_id text
)
language sql
security definer
set search_path = public
as $$
  select
    licenses.id,
    licenses.name,
    case when licenses.admin_organization_id = org_id then 'admin' else 'trainer' end,
    licenses.admin_user_id,
    licenses.admin_organization_id,
    licenses.trainer_limit,
    licenses.client_limit_per_trainer,
    licenses.industry_preset_id
  from public.club_licenses licenses
  left join public.club_trainers trainers
    on trainers.club_id = licenses.id
    and trainers.trainer_organization_id = org_id
    and trainers.active = true
  where licenses.active = true
    and (
      (
        licenses.admin_organization_id = org_id
        and (licenses.admin_user_id = auth.uid() or public.is_platform_owner())
      )
      or (
        trainers.trainer_organization_id = org_id
        and (trainers.trainer_user_id = auth.uid() or public.is_platform_owner())
      )
    )
  limit 1;
$$;

create or replace function public.get_club_trainer_stats(target_club_id uuid)
returns table(
  trainer_user_id uuid,
  active_clients bigint,
  total_tasks bigint,
  completed_tasks bigint
)
language sql
security definer
set search_path = public
as $$
  select
    trainers.trainer_user_id,
    count(distinct relationships.client_id) filter (where relationships.active = true),
    count(distinct tasks.id),
    count(distinct tasks.id) filter (where tasks.status = 'done')
  from public.club_trainers trainers
  join public.club_licenses licenses on licenses.id = trainers.club_id
  left join public.coach_client_relationships relationships
    on relationships.organization_id = trainers.trainer_organization_id
    and relationships.coach_id = trainers.trainer_user_id
  left join public.tasks tasks
    on tasks.organization_id = trainers.trainer_organization_id
    and tasks.coach_id = trainers.trainer_user_id
  where trainers.club_id = target_club_id
    and (
      licenses.admin_user_id = auth.uid()
      or public.is_platform_owner()
    )
  group by trainers.trainer_user_id;
$$;

create or replace function public.sync_club_branding(target_club_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  license_row public.club_licenses;
  source_settings public.organization_settings;
begin
  select * into license_row from public.club_licenses where id = target_club_id and active = true;
  if license_row.id is null or license_row.admin_user_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  select * into source_settings
  from public.organization_settings
  where organization_id = license_row.admin_organization_id;

  update public.organizations organizations
  set industry_preset_id = license_row.industry_preset_id
  where organizations.id in (
    select trainers.trainer_organization_id
    from public.club_trainers trainers
    where trainers.club_id = target_club_id and trainers.active = true
  );

  update public.organization_settings settings
  set display_name = source_settings.display_name,
      logo_text = source_settings.logo_text,
      logo_url = source_settings.logo_url,
      hero_image_url = source_settings.hero_image_url,
      primary_color = source_settings.primary_color,
      secondary_color = source_settings.secondary_color,
      brand_profiles = source_settings.brand_profiles,
      client_limit = license_row.client_limit_per_trainer,
      plan_name = 'club',
      updated_at = now()
  where settings.organization_id in (
    select trainers.trainer_organization_id
    from public.club_trainers trainers
    where trainers.club_id = target_club_id and trainers.active = true
  );
end;
$$;

create or replace function public.deactivate_club_trainer(
  target_club_id uuid,
  target_trainer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  license_row public.club_licenses;
  trainer_row public.club_trainers;
begin
  select * into license_row
  from public.club_licenses licenses
  where licenses.id = target_club_id and licenses.active = true;

  if license_row.id is null or license_row.admin_user_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  select * into trainer_row
  from public.club_trainers trainers
  where trainers.club_id = target_club_id
    and trainers.trainer_user_id = target_trainer_id
    and trainers.active = true;

  if trainer_row.club_id is null then
    raise exception 'Trainer not found';
  end if;

  insert into public.club_client_transfers (
    club_id, client_id, source_trainer_id, source_organization_id
  )
  select
    target_club_id, relationships.client_id, target_trainer_id,
    trainer_row.trainer_organization_id
  from public.coach_client_relationships relationships
  where relationships.organization_id = trainer_row.trainer_organization_id
    and relationships.coach_id = target_trainer_id
    and relationships.active = true
  on conflict do nothing;

  update public.coach_client_relationships
  set active = false
  where organization_id = trainer_row.trainer_organization_id
    and coach_id = target_trainer_id;

  update public.organization_members members
  set active = false
  where members.organization_id = trainer_row.trainer_organization_id
    and members.role = 'client';

  update public.organization_members
  set active = false
  where organization_id = trainer_row.trainer_organization_id
    and user_id = target_trainer_id;

  update public.club_trainers
  set active = false
  where club_id = target_club_id
    and trainer_user_id = target_trainer_id;

  delete from public.invitations invitations
  where invitations.organization_id = trainer_row.trainer_organization_id
    and invitations.accepted_at is null;
end;
$$;

create or replace function public.assign_club_transfer(
  transfer_id uuid,
  target_trainer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  transfer_row public.club_client_transfers;
  license_row public.club_licenses;
  target_org_id uuid;
begin
  select * into transfer_row
  from public.club_client_transfers transfers
  where transfers.id = transfer_id
    and transfers.status = 'pending';

  if transfer_row.id is null then
    raise exception 'Transfer not found';
  end if;

  select * into license_row
  from public.club_licenses licenses
  where licenses.id = transfer_row.club_id and licenses.active = true;

  if license_row.id is null or license_row.admin_user_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  if target_trainer_id = license_row.admin_user_id then
    target_org_id := license_row.admin_organization_id;
  else
    select trainers.trainer_organization_id into target_org_id
    from public.club_trainers trainers
    where trainers.club_id = transfer_row.club_id
      and trainers.trainer_user_id = target_trainer_id
      and trainers.active = true;
  end if;

  if target_org_id is null then
    raise exception 'Target trainer not found';
  end if;

  if transfer_row.assigned_organization_id is not null
     and transfer_row.assigned_trainer_id is not null
     and transfer_row.assigned_trainer_id <> target_trainer_id then
    update public.coach_client_relationships
    set active = false
    where organization_id = transfer_row.assigned_organization_id
      and coach_id = transfer_row.assigned_trainer_id
      and client_id = transfer_row.client_id;

    update public.organization_members members
    set active = false
    where members.organization_id = transfer_row.assigned_organization_id
      and members.user_id = transfer_row.client_id
      and members.role = 'client'
      and not exists (
        select 1 from public.coach_client_relationships relationships
        where relationships.organization_id = transfer_row.assigned_organization_id
          and relationships.client_id = transfer_row.client_id
          and relationships.active = true
      );
  end if;

  insert into public.organization_members (organization_id, user_id, role, active)
  values (target_org_id, transfer_row.client_id, 'client', true)
  on conflict (organization_id, user_id) do update
    set role = 'client', active = true;

  insert into public.coach_client_relationships (
    organization_id, coach_id, client_id, active
  ) values (
    target_org_id, target_trainer_id, transfer_row.client_id, true
  )
  on conflict (organization_id, coach_id, client_id) do update
    set active = true;

  update public.club_client_transfers
  set assigned_trainer_id = target_trainer_id,
      assigned_organization_id = target_org_id,
      status = case when target_trainer_id = license_row.admin_user_id then 'pending' else 'assigned' end,
      assigned_at = now()
  where id = transfer_row.id;
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
  license_row public.club_licenses;
  user_email text;
  new_org_id uuid;
  preset_row public.interface_presets;
  workspace_name text;
  active_client_count integer := 0;
  current_client_limit integer := 10;
  target_coach_id uuid;
  active_trainer_count integer := 0;
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
    if invite.club_license_id is not null then
      select * into license_row
      from public.club_licenses licenses
      where licenses.id = invite.club_license_id
        and licenses.active = true;

      if license_row.id is null then
        raise exception 'Club license not found';
      end if;

      if invite.invitation_kind = 'club_trainer' then
        select count(*) into active_trainer_count
        from public.club_trainers trainers
        where trainers.club_id = license_row.id
          and trainers.active = true;

        if active_trainer_count >= license_row.trainer_limit then
          raise exception 'TRAINER_LIMIT_REACHED:%', license_row.trainer_limit;
        end if;
      end if;

      select * into preset_row
      from public.interface_presets
      where id = license_row.industry_preset_id;
    else
      select * into preset_row
      from public.interface_presets
      where id = coalesce(selected_preset_id, 'generic_coaching');
    end if;

    if preset_row.id is null then
      raise exception 'Unknown interface preset';
    end if;

    workspace_name := case
      when invite.invitation_kind = 'club_admin' then license_row.name
      when invite.invitation_kind = 'club_trainer' then coalesce(
        nullif(profile_row.full_name, ''),
        split_part(user_email, '@', 1)
      ) || ' · ' || license_row.name
      else coalesce(
        nullif(trim(company_name), ''),
        nullif(profile_row.full_name, ''),
        split_part(user_email, '@', 1)
      )
    end;

    insert into public.organizations (name, industry_preset_id, created_by)
    values (
      workspace_name,
      preset_row.id,
      auth.uid()
    )
    returning id into new_org_id;

    insert into public.organization_members (organization_id, user_id, role)
    values (new_org_id, auth.uid(), 'owner');

    if invite.invitation_kind = 'club_trainer' then
      insert into public.organization_settings (
        organization_id, display_name, logo_text, logo_url, hero_image_url,
        primary_color, secondary_color, brand_profiles, client_limit, plan_name
      )
      select
        new_org_id, settings.display_name, settings.logo_text, settings.logo_url,
        settings.hero_image_url, settings.primary_color, settings.secondary_color,
        settings.brand_profiles, license_row.client_limit_per_trainer, 'club'
      from public.organization_settings settings
      where settings.organization_id = license_row.admin_organization_id;

      insert into public.club_trainers (club_id, trainer_user_id, trainer_organization_id)
      values (license_row.id, auth.uid(), new_org_id)
      on conflict (club_id, trainer_user_id) do update
        set trainer_organization_id = excluded.trainer_organization_id,
            active = true,
            joined_at = now();
    else
      insert into public.organization_settings (
        organization_id, display_name, logo_text, hero_image_url, primary_color,
        secondary_color, brand_profiles, client_limit, plan_name
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
        ),
        case when invite.invitation_kind = 'club_admin' then license_row.client_limit_per_trainer else 10 end,
        case when invite.invitation_kind = 'club_admin' then 'club' else 'test' end
      );

      perform public.seed_task_templates_for_org(new_org_id, preset_row.id);

      if invite.invitation_kind = 'club_admin' then
        update public.club_licenses
        set admin_user_id = auth.uid(),
            admin_organization_id = new_org_id,
            admin_email = user_email
        where id = license_row.id;
      end if;
    end if;
  else
    insert into public.organization_members (organization_id, user_id, role)
    values (invite.organization_id, auth.uid(), invite.role)
    on conflict (organization_id, user_id) do update
      set role = excluded.role,
          active = true;
  end if;

  if invite.role = 'client' then
    target_coach_id := coalesce(invite.client_coach_id, invite.invited_by);

    select coalesce(client_limit, 10) into current_client_limit
    from public.organization_settings
    where organization_id = invite.organization_id;

    select count(distinct relationships.client_id) into active_client_count
    from public.coach_client_relationships relationships
    join public.organization_members members
      on members.organization_id = relationships.organization_id
      and members.user_id = relationships.client_id
      and members.role = 'client'
      and members.active = true
    where relationships.organization_id = invite.organization_id
      and relationships.coach_id = target_coach_id
      and relationships.client_id <> auth.uid()
      and relationships.active = true;

    if current_client_limit > 0 and active_client_count >= current_client_limit then
      raise exception 'CLIENT_LIMIT_REACHED:%', current_client_limit;
    end if;

    insert into public.coach_client_relationships (organization_id, coach_id, client_id)
    values (invite.organization_id, target_coach_id, auth.uid())
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
on conflict (organization_id, user_id) do nothing;

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
on conflict (organization_id, coach_id, client_id) do nothing;

drop function if exists public.get_invitation_info(text, text);

create or replace function public.get_invitation_info(invite_code text, invite_email text)
returns table(
  role public.member_role,
  invitation_kind text,
  club_name text,
  preset_id text
)
language sql
security definer
set search_path = public
as $$
  select
    invitations.role,
    invitations.invitation_kind,
    licenses.name,
    licenses.industry_preset_id
  from public.invitations
  left join public.club_licenses licenses on licenses.id = invitations.club_license_id
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
  from public.tasks as tasks
  where tasks.id = complete_task.task_id;

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

create or replace function public.create_reflection_for_task(task_id uuid, reflection_text text, reflection_mood text default null)
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
  from public.tasks as tasks
  where tasks.id = create_reflection_for_task.task_id;

  if task_row.id is null or task_row.client_id <> auth.uid() then
    raise exception 'Task not found';
  end if;

  if task_row.status = 'done' then
    raise exception 'Task already completed';
  end if;

  insert into public.reflections (task_id, organization_id, client_id, text, mood)
  values (task_id, task_row.organization_id, auth.uid(), reflection_text, reflection_mood)
  returning id into new_reflection_id;

  return new_reflection_id;
end;
$$;

create or replace function public.finish_task_after_reflection(task_id uuid, reflection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.tasks;
  reflection_row public.reflections;
begin
  select * into task_row
  from public.tasks as tasks
  where tasks.id = finish_task_after_reflection.task_id;

  if task_row.id is null or task_row.client_id <> auth.uid() then
    raise exception 'Task not found';
  end if;

  if task_row.status = 'done' then
    raise exception 'Task already completed';
  end if;

  select * into reflection_row
  from public.reflections as reflections
  where reflections.id = finish_task_after_reflection.reflection_id
    and reflections.task_id = task_row.id
    and reflections.client_id = auth.uid();

  if reflection_row.id is null then
    raise exception 'Reflection not found';
  end if;

  update public.tasks
  set status = 'done', completed_at = now()
  where id = task_row.id
    and client_id = auth.uid()
    and status = 'open';
end;
$$;

create or replace function public.delete_reflection_draft(reflection_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reflection_row public.reflections;
  task_row public.tasks;
begin
  select * into reflection_row
  from public.reflections as reflections
  where reflections.id = delete_reflection_draft.reflection_id
    and reflections.client_id = auth.uid();

  if reflection_row.id is null then
    return;
  end if;

  select * into task_row
  from public.tasks as tasks
  where tasks.id = reflection_row.task_id;

  if task_row.status = 'open' then
    delete from public.reflections as reflections
    where reflections.id = reflection_row.id
      and reflections.client_id = auth.uid();
  end if;
end;
$$;

create or replace function public.create_task_update(task_id uuid, update_message text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.tasks;
  new_update_id uuid;
begin
  select * into task_row
  from public.tasks as tasks
  where tasks.id = create_task_update.task_id;

  if task_row.id is null or task_row.client_id <> auth.uid() then
    raise exception 'Task not found';
  end if;

  if task_row.status = 'done' then
    raise exception 'Task already completed';
  end if;

  insert into public.task_updates (task_id, organization_id, client_id, message)
  values (task_row.id, task_row.organization_id, auth.uid(), coalesce(update_message, ''))
  returning id into new_update_id;

  return new_update_id;
end;
$$;

create or replace function public.delete_task_update_draft(task_update_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  update_row public.task_updates;
  task_row public.tasks;
begin
  select * into update_row
  from public.task_updates as task_updates
  where task_updates.id = delete_task_update_draft.task_update_id
    and task_updates.client_id = auth.uid();

  if update_row.id is null then
    return;
  end if;

  select * into task_row
  from public.tasks as tasks
  where tasks.id = update_row.task_id;

  if task_row.status = 'open' then
    delete from public.task_updates as task_updates
    where task_updates.id = update_row.id
      and task_updates.client_id = auth.uid();
  end if;
end;
$$;

create or replace function public.answer_task_update(task_update_id uuid, response_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  update_row public.task_updates;
  task_row public.tasks;
begin
  select * into update_row
  from public.task_updates as task_updates
  where task_updates.id = answer_task_update.task_update_id;

  if update_row.id is null then
    raise exception 'Rückfrage nicht gefunden';
  end if;

  select * into task_row
  from public.tasks as tasks
  where tasks.id = update_row.task_id;

  if task_row.id is null then
    raise exception 'Aufgabe nicht gefunden';
  end if;

  if not (
    task_row.coach_id = auth.uid()
    or public.has_org_role(task_row.organization_id, array['owner']::public.member_role[])
    or public.is_assigned_coach(task_row.organization_id, task_row.client_id)
  ) then
    raise exception 'Not allowed';
  end if;

  if coalesce(trim(response_text), '') = '' then
    raise exception 'Bitte Antwort eingeben';
  end if;

  update public.task_updates
  set response = response_text,
      responded_by = auth.uid(),
      responded_at = now()
  where id = update_row.id;
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
      ('martial_arts', 'Technikdrill wiederholen', 'Übe den besprochenen Technikablauf langsam und kontrolliert. Achte auf Stand, Atmung, Balance und saubere Ausführung.'),
      ('martial_arts', 'Beweglichkeit und Stabilität', 'Führe die vereinbarte kurze Beweglichkeits- oder Stabilitätseinheit durch und notiere, welche Bewegung sich sicherer anfühlt.'),
      ('martial_arts', 'Rundenreflexion', 'Reflektiere dein letztes Training: Was war technisch sauber, wo hast du gezögert und woran möchtest du weiterarbeiten?'),
      ('martial_arts', 'Mentale Vorbereitung', 'Formuliere einen Fokus für die nächste Einheit, zum Beispiel Ruhe, Distanzgefühl, Reaktion oder konsequente Grundstellung.'),
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

drop function if exists public.remove_client_from_workspace(uuid, uuid);
drop function if exists public.remove_client_from_workspace(uuid, uuid, text);

create or replace function public.remove_client_from_workspace(
  org_id uuid,
  removed_client_id uuid,
  removal_mode text default 'archive'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_owner boolean := false;
  removed_email text := '';
  removed_contact_email text := '';
begin
  removal_mode := coalesce(nullif(trim(removal_mode), ''), 'archive');
  if removal_mode not in ('archive', 'anonymize') then
    raise exception 'Unknown removal mode';
  end if;

  is_owner := public.has_org_role(org_id, array['owner']::public.member_role[]);

  if not (is_owner or public.is_assigned_coach(org_id, removed_client_id)) then
    raise exception 'Not allowed';
  end if;

  select lower(coalesce(email, '')), lower(coalesce(contact_email, ''))
  into removed_email, removed_contact_email
  from public.profiles
  where id = removed_client_id;

  delete from storage.objects objects
  using public.task_attachments attachments
  join public.tasks tasks on tasks.id = attachments.task_id
  where objects.bucket_id = 'task-attachments'
    and objects.name = attachments.storage_path
    and tasks.organization_id = org_id
    and tasks.client_id = removed_client_id
    and tasks.status <> 'done'
    and (is_owner or tasks.coach_id = auth.uid());

  delete from public.tasks tasks
  where tasks.organization_id = org_id
    and tasks.client_id = removed_client_id
    and tasks.status <> 'done'
    and (is_owner or tasks.coach_id = auth.uid());

  delete from public.invitations invitations
  where invitations.organization_id = org_id
    and invitations.role = 'client'
    and invitations.accepted_at is null
    and (
      lower(invitations.email) = removed_email
      or lower(invitations.email) = removed_contact_email
    )
    and (
      is_owner
      or coalesce(invitations.client_coach_id, invitations.invited_by) = auth.uid()
    );

  delete from public.client_group_members members
  using public.client_groups groups
  where members.group_id = groups.id
    and members.organization_id = org_id
    and members.client_id = removed_client_id
    and (
      is_owner
      or groups.coach_id = auth.uid()
    );

  if removal_mode = 'anonymize' then
    delete from storage.objects objects
    using public.task_attachments attachments
    join public.tasks tasks on tasks.id = attachments.task_id
    where objects.bucket_id = 'task-attachments'
      and objects.name = attachments.storage_path
      and tasks.organization_id = org_id
      and tasks.client_id = removed_client_id
      and (is_owner or tasks.coach_id = auth.uid());

    delete from public.task_attachments attachments
    using public.tasks tasks
    where attachments.task_id = tasks.id
      and tasks.organization_id = org_id
      and tasks.client_id = removed_client_id
      and (is_owner or tasks.coach_id = auth.uid());

    delete from public.coach_notes notes
    where notes.organization_id = org_id
      and notes.client_id = removed_client_id
      and (is_owner or notes.coach_id = auth.uid());

    update public.reflections reflections
    set text = '[Anonymisiert]',
        mood = null
    from public.tasks tasks
    where reflections.task_id = tasks.id
      and tasks.organization_id = org_id
      and tasks.client_id = removed_client_id
      and (is_owner or tasks.coach_id = auth.uid());

    update public.task_updates updates
    set message = '[Anonymisiert]',
        response = case when response is null then null else '[Anonymisiert]' end
    from public.tasks tasks
    where updates.task_id = tasks.id
      and tasks.organization_id = org_id
      and tasks.client_id = removed_client_id
      and (is_owner or tasks.coach_id = auth.uid());
  end if;

  delete from public.assignment_batch_recipients recipients
  using public.assignment_batches batches
  where recipients.batch_id = batches.id
    and recipients.organization_id = org_id
    and recipients.client_id = removed_client_id
    and (
      is_owner
      or batches.coach_id = auth.uid()
    );

  update public.coach_client_relationships
  set active = false
  where organization_id = org_id
    and client_id = removed_client_id
    and (
      coach_id = auth.uid()
      or is_owner
    );

  update public.organization_members
  set active = false
  where organization_id = org_id
    and user_id = removed_client_id
    and role = 'client'
    and not exists (
      select 1
      from public.coach_client_relationships relationships
      where relationships.organization_id = org_id
        and relationships.client_id = removed_client_id
        and relationships.active = true
    );

  if removal_mode = 'anonymize'
     and not exists (
       select 1
       from public.organization_members members
       where members.user_id = removed_client_id
         and members.active = true
     ) then
    update public.profiles
    set full_name = 'Ehemaliger Nutzer',
        contact_email = '',
        phone = '',
        email = 'deleted-' || removed_client_id::text || '@momentum.local'
    where id = removed_client_id;
  end if;
end;
$$;

create or replace function public.deactivate_coach_from_workspace(
  org_id uuid,
  removed_coach_id uuid,
  removal_mode text default 'archive'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  removal_mode := coalesce(nullif(trim(removal_mode), ''), 'archive');
  if removal_mode not in ('archive', 'anonymize') then
    raise exception 'Unknown removal mode';
  end if;

  if not public.has_org_role(org_id, array['owner']::public.member_role[]) then
    raise exception 'Not allowed';
  end if;

  if removed_coach_id = auth.uid() then
    raise exception 'Owner cannot deactivate own access here';
  end if;

  delete from storage.objects objects
  using public.task_attachments attachments
  join public.tasks tasks on tasks.id = attachments.task_id
  where objects.bucket_id = 'task-attachments'
    and objects.name = attachments.storage_path
    and tasks.organization_id = org_id
    and tasks.coach_id = removed_coach_id
    and (
      tasks.status <> 'done'
      or removal_mode = 'anonymize'
    );

  if removal_mode = 'anonymize' then
    delete from public.task_attachments attachments
    using public.tasks tasks
    where attachments.task_id = tasks.id
      and tasks.organization_id = org_id
      and tasks.coach_id = removed_coach_id;

    delete from public.coach_notes notes
    where notes.organization_id = org_id
      and notes.coach_id = removed_coach_id;

    update public.reflections reflections
    set text = '[Anonymisiert]',
        mood = null
    from public.tasks tasks
    where reflections.task_id = tasks.id
      and tasks.organization_id = org_id
      and tasks.coach_id = removed_coach_id;

    update public.task_updates updates
    set message = '[Anonymisiert]',
        response = case when response is null then null else '[Anonymisiert]' end
    from public.tasks tasks
    where updates.task_id = tasks.id
      and tasks.organization_id = org_id
      and tasks.coach_id = removed_coach_id;
  end if;

  delete from public.tasks tasks
  where tasks.organization_id = org_id
    and tasks.coach_id = removed_coach_id
    and tasks.status <> 'done';

  delete from public.invitations invitations
  where invitations.organization_id = org_id
    and invitations.accepted_at is null
    and (
      invitations.invited_by = removed_coach_id
      or invitations.client_coach_id = removed_coach_id
    );

  delete from public.client_group_members members
  using public.client_groups groups
  where members.group_id = groups.id
    and groups.organization_id = org_id
    and groups.coach_id = removed_coach_id;

  delete from public.client_groups groups
  where groups.organization_id = org_id
    and groups.coach_id = removed_coach_id;

  delete from public.assignment_batch_recipients recipients
  using public.assignment_batches batches
  where recipients.batch_id = batches.id
    and batches.organization_id = org_id
    and batches.coach_id = removed_coach_id;

  delete from public.assignment_batches batches
  where batches.organization_id = org_id
    and batches.coach_id = removed_coach_id;

  update public.coach_client_relationships
  set active = false
  where organization_id = org_id
    and coach_id = removed_coach_id;

  update public.organization_members members
  set active = false
  where members.organization_id = org_id
    and members.role = 'client'
    and not exists (
      select 1
      from public.coach_client_relationships relationships
      where relationships.organization_id = org_id
        and relationships.client_id = members.user_id
        and relationships.active = true
    );

  update public.organization_members
  set active = false
  where organization_id = org_id
    and user_id = removed_coach_id
    and role = 'coach';

  if removal_mode = 'anonymize'
     and not exists (
       select 1
       from public.organization_members members
       where members.user_id = removed_coach_id
         and members.active = true
     ) then
    update public.profiles
    set full_name = 'Ehemaliger Coach',
        contact_email = '',
        phone = '',
        email = 'deleted-' || removed_coach_id::text || '@momentum.local'
    where id = removed_coach_id;
  end if;
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
grant execute on function public.create_club_license(uuid, text, text, text, integer, integer) to authenticated;
grant execute on function public.create_club_trainer_invitation(uuid, text) to authenticated;
grant execute on function public.get_club_context(uuid) to authenticated;
grant execute on function public.get_club_trainer_stats(uuid) to authenticated;
grant execute on function public.sync_club_branding(uuid) to authenticated;
grant execute on function public.deactivate_club_trainer(uuid, uuid) to authenticated;
grant execute on function public.assign_club_transfer(uuid, uuid) to authenticated;
grant execute on function public.accept_invitation(text, text, text) to authenticated;
grant execute on function public.get_invitation_info(text, text) to anon, authenticated;
grant execute on function public.complete_task(uuid, text, text) to authenticated;
grant execute on function public.create_reflection_for_task(uuid, text, text) to authenticated;
grant execute on function public.finish_task_after_reflection(uuid, uuid) to authenticated;
grant execute on function public.delete_reflection_draft(uuid) to authenticated;
grant execute on function public.create_task_update(uuid, text) to authenticated;
grant execute on function public.delete_task_update_draft(uuid) to authenticated;
grant execute on function public.answer_task_update(uuid, text) to authenticated;
grant execute on function public.seed_task_templates_for_org(uuid, text) to authenticated;
grant execute on function public.remove_client_from_workspace(uuid, uuid, text) to authenticated;
grant execute on function public.deactivate_coach_from_workspace(uuid, uuid, text) to authenticated;
grant execute on function public.update_workspace_preset(uuid, text) to authenticated;
grant execute on function public.update_profile_contact(uuid, text, text, text) to authenticated;
