-- Feature: Clients koennen Rueckfragen oder Zwischenstaende zu offenen Aufgaben senden,
-- ohne die Aufgabe abzuschliessen.
-- Im Supabase SQL Editor ausfuehren.

create table if not exists public.task_updates (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.profiles(id),
  message text not null default '',
  created_at timestamptz not null default now()
);

alter table public.task_attachments
  add column if not exists task_update_id uuid references public.task_updates(id) on delete cascade;

create index if not exists task_updates_task_idx on public.task_updates(task_id);
create index if not exists task_updates_client_idx on public.task_updates(client_id);
create index if not exists task_attachments_update_idx on public.task_attachments(task_update_id);

alter table public.task_updates enable row level security;

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

grant select, insert on public.task_updates to authenticated;
grant execute on function public.create_task_update(uuid, text) to authenticated;
grant execute on function public.delete_task_update_draft(uuid) to authenticated;
