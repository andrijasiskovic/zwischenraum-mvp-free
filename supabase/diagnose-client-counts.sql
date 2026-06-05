-- Diagnose fuer Client-Zaehlung in der Testphase.
-- Im Supabase SQL Editor ausfuehren, wenn die App eine unerwartete Client-Zahl zeigt.

-- 1. Aktive Mitglieder pro Workspace und Rolle.
select
  organizations.name as workspace,
  members.role,
  count(*) as active_members
from public.organization_members members
join public.organizations organizations on organizations.id = members.organization_id
where members.active = true
group by organizations.name, members.role
order by organizations.name, members.role;

-- 2. Aktive Client-Mitglieder je Workspace.
select
  organizations.name as workspace,
  profiles.email,
  profiles.full_name,
  members.created_at
from public.organization_members members
join public.organizations organizations on organizations.id = members.organization_id
join public.profiles profiles on profiles.id = members.user_id
where members.active = true
  and members.role = 'client'
order by organizations.name, profiles.email;

-- 3. Aktive Client-Plaetze pro Coach nach aktueller Produktlogik.
select
  organizations.name as workspace,
  coach.email as coach_email,
  coach.full_name as coach_name,
  count(distinct relationships.client_id) as active_client_slots
from public.coach_client_relationships relationships
join public.organization_members members
  on members.organization_id = relationships.organization_id
  and members.user_id = relationships.client_id
  and members.role = 'client'
  and members.active = true
join public.organizations organizations on organizations.id = relationships.organization_id
join public.profiles coach on coach.id = relationships.coach_id
where relationships.active = true
group by organizations.name, coach.email, coach.full_name
order by organizations.name, active_client_slots desc, coach.email;

-- 4. Offene Client-Einladungen, die nicht als verbrauchte Plaetze zaehlen.
select
  organizations.name as workspace,
  invitations.email,
  invitations.role,
  invitations.code,
  inviter.email as invited_by,
  assigned_coach.email as assigned_coach,
  invitations.created_at
from public.invitations invitations
join public.organizations organizations on organizations.id = invitations.organization_id
join public.profiles inviter on inviter.id = invitations.invited_by
left join public.profiles assigned_coach on assigned_coach.id = invitations.client_coach_id
where invitations.accepted_at is null
order by invitations.created_at desc;

-- 5. Stale Beziehungen: Beziehung aktiv, Client-Mitgliedschaft aber nicht aktiv.
select
  organizations.name as workspace,
  coach.email as coach_email,
  client.email as client_email,
  relationships.created_at
from public.coach_client_relationships relationships
join public.organizations organizations on organizations.id = relationships.organization_id
join public.profiles coach on coach.id = relationships.coach_id
join public.profiles client on client.id = relationships.client_id
where relationships.active = true
  and not exists (
    select 1
    from public.organization_members members
    where members.organization_id = relationships.organization_id
      and members.user_id = relationships.client_id
      and members.role = 'client'
      and members.active = true
  )
order by organizations.name, client.email;
