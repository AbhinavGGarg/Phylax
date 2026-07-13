-- ============================================================================
--  PHYLAX · Control Plane · 0003 RLS + tenant isolation
--  ----------------------------------------------------------------------------
--  Model: authenticated users get SCOPED READ ONLY. Every write flows through
--  an edge function using the admin key, which derives authorization from the
--  authenticated user + membership (never from a client-supplied org id) and is
--  further constrained by the 0002 triggers. RLS is the last line of defense.
--
--  The headline isolation guarantee: a FinTrust user cannot read SwiftCart's
--  private signal_batches, signal_commitments, or org-owned run_artifacts.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Recursion-safe membership helpers (SECURITY DEFINER bypasses RLS on the
-- tables they read, so policies calling them can't recurse into RLS).
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.member_role(p_org uuid)
returns public.phylax_role language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select m.role from public.organization_members m
  where m.org_id = p_org and m.user_id = (select auth.uid())
  limit 1;
$$;

create or replace function public.is_control_member()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id = m.org_id
    where m.user_id = (select auth.uid()) and o.is_control
  );
$$;

create or replace function public.can_view_run(p_run uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select public.is_control_member()
     or exists (select 1 from public.detection_runs r
                where r.id = p_run and public.is_org_member(r.created_by_org))
     or exists (select 1 from public.run_participants rp
                where rp.run_id = p_run and public.is_org_member(rp.org_id));
$$;

grant execute on function public.is_org_member(uuid)   to anon, authenticated;
grant execute on function public.member_role(uuid)     to anon, authenticated;
grant execute on function public.is_control_member()   to anon, authenticated;
grant execute on function public.can_view_run(uuid)    to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere.
-- ---------------------------------------------------------------------------
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.model_versions       enable row level security;
alter table public.detection_runs       enable row level security;
alter table public.run_participants      enable row level security;
alter table public.signal_batches        enable row level security;
alter table public.signal_commitments    enable row level security;
alter table public.campaign_clusters     enable row level security;
alter table public.permitted_findings    enable row level security;
alter table public.action_requests       enable row level security;
alter table public.approval_decisions    enable row level security;
alter table public.run_artifacts         enable row level security;
alter table public.audit_events          enable row level security;

-- ---------------------------------------------------------------------------
-- Lock the write surface: authenticated & anon may only SELECT. All mutation
-- goes through edge functions (project_admin), gated by triggers + code authz.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','organization_members','model_versions','detection_runs',
    'run_participants','signal_batches','signal_commitments','campaign_clusters',
    'permitted_findings','action_requests','approval_decisions','run_artifacts',
    'audit_events'] loop
    execute format('revoke insert, update, delete on public.%I from anon, authenticated;', t);
    execute format('grant  select on public.%I to authenticated;', t);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- SELECT policies.
-- ---------------------------------------------------------------------------

-- Consortium directory + model registry: readable by any authenticated member
-- (names, slugs, public verify keys, model metadata — nothing sensitive).
create policy orgs_read       on public.organizations
  for select to authenticated using (true);
create policy models_read     on public.model_versions
  for select to authenticated using (true);

-- Rosters: you see co-members of your own orgs; control sees all.
create policy members_read    on public.organization_members
  for select to authenticated
  using (public.is_org_member(org_id) or public.is_control_member());

-- Run metadata: creator org, participant orgs, and the control plane.
create policy runs_read       on public.detection_runs
  for select to authenticated using (public.can_view_run(id));
create policy participants_read on public.run_participants
  for select to authenticated using (public.can_view_run(run_id));
create policy clusters_read   on public.campaign_clusters
  for select to authenticated using (public.can_view_run(run_id));
create policy findings_read   on public.permitted_findings
  for select to authenticated using (public.can_view_run(run_id));

-- PARTNER-PRIVATE tables: STRICT org scope. Not even the control plane reads
-- these — this is the tenant-isolation boundary the demo test asserts.
create policy batches_read    on public.signal_batches
  for select to authenticated using (public.is_org_member(org_id));
create policy commitments_read on public.signal_commitments
  for select to authenticated using (public.is_org_member(org_id));

-- Actions: run viewers, plus the org the action targets.
create policy actions_read    on public.action_requests
  for select to authenticated
  using (public.can_view_run(run_id) or public.is_org_member(target_org_id));
create policy approvals_read  on public.approval_decisions
  for select to authenticated
  using (public.can_view_run(run_id) or public.is_org_member(org_id));

-- Artifacts: org-owned artifacts are strict org scope; neutral run reports /
-- receipts (org_id NULL) are visible to everyone who can view the run.
create policy artifacts_read  on public.run_artifacts
  for select to authenticated
  using (
    (org_id is not null and public.is_org_member(org_id))
    or (org_id is null and public.can_view_run(run_id))
  );

-- Audit ledger: run-scoped events to run viewers; org-scoped events to that
-- org; global system events to the control plane.
create policy audit_read      on public.audit_events
  for select to authenticated
  using (
    (run_id is not null and public.can_view_run(run_id))
    or (run_id is null and org_id is not null and public.is_org_member(org_id))
    or (run_id is null and org_id is null and public.is_control_member())
  );
