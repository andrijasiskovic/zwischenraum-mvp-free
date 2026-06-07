-- Fix: Coaches duerfen ausschliesslich Clients einladen.
-- Im Supabase SQL Editor ausfuehren.

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

  if invite_role in ('owner', 'coach') and not public.has_org_role(org_id, array['owner']::public.member_role[]) then
    raise exception 'Only owners can invite owners or coaches';
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

grant execute on function public.create_invitation(uuid, text, public.member_role, uuid) to authenticated;
