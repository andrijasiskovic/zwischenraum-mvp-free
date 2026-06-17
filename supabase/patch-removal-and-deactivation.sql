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

grant execute on function public.remove_client_from_workspace(uuid, uuid, text) to authenticated;
grant execute on function public.deactivate_coach_from_workspace(uuid, uuid, text) to authenticated;
