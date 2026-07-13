-- ============================================================================
--  PHYLAX · Control Plane · 0002 state machine + integrity
--  ----------------------------------------------------------------------------
--  The containment workflow is monotonic and SERVER-ENFORCED. Even the edge
--  functions (which use the admin key and bypass RLS) cannot make an illegal
--  jump — the transition guard fires for every role. Ledgers are append-only.
--  The "0 raw records shared" promise is a hard DB invariant, not a UI label.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Legal transitions of the run_status state machine.
--   draft → awaiting_parties → running → protected_match → risk_scored
--         → awaiting_approval → actioned → receipted
--   plus: any non-terminal → failed | cancelled (with a recorded reason)
-- ---------------------------------------------------------------------------
create or replace function public.run_status_transition_ok(
  old_status public.run_status,
  new_status public.run_status
) returns boolean
language sql immutable
as $$
  select case old_status
    when 'draft'             then new_status in ('awaiting_parties','cancelled','failed')
    when 'awaiting_parties'  then new_status in ('running','cancelled','failed')
    when 'running'           then new_status in ('protected_match','failed','cancelled')
    when 'protected_match'   then new_status in ('risk_scored','failed','cancelled')
    when 'risk_scored'       then new_status in ('awaiting_approval','failed','cancelled')
    when 'awaiting_approval' then new_status in ('actioned','cancelled','failed')
    when 'actioned'          then new_status in ('receipted','failed')
    else false   -- receipted, failed, cancelled are terminal
  end;
$$;

-- ---------------------------------------------------------------------------
-- Enforce the transition + phase timestamps + immutable + privacy invariants
-- on every UPDATE of detection_runs.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_run_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  -- Immutable identity: the creating org can never be rewritten.
  if new.created_by_org is distinct from old.created_by_org then
    raise exception 'created_by_org is immutable';
  end if;

  -- Hard privacy invariant: the neutral plane centralizes ZERO raw records.
  if new.raw_records_shared <> 0 then
    raise exception 'invariant violation: raw_records_shared must remain 0 (got %)',
      new.raw_records_shared;
  end if;

  -- Only police the transition when status actually changes.
  if new.status is distinct from old.status then
    if not public.run_status_transition_ok(old.status, new.status) then
      raise exception 'illegal run transition: % -> %', old.status, new.status;
    end if;

    -- terminal failure/cancel must record why
    if new.status in ('failed','cancelled')
       and (new.status_reason is null or length(trim(new.status_reason)) = 0) then
      raise exception 'transition to % requires status_reason', new.status;
    end if;

    -- stamp phase timestamps as we cross each boundary
    if new.status = 'awaiting_parties' and new.started_at   is null then new.started_at   := now(); end if;
    if new.status = 'protected_match'  and new.matched_at   is null then new.matched_at   := now(); end if;
    if new.status = 'risk_scored'      and new.scored_at    is null then new.scored_at    := now(); end if;
    if new.status = 'actioned'         and new.approved_at  is null then new.approved_at  := now(); end if;
    if new.status = 'receipted'        and new.receipted_at is null then new.receipted_at := now(); end if;
  end if;

  return new;
end;
$$;

do $$ begin
  create trigger detection_runs_enforce_transition
    before update on public.detection_runs
    for each row execute function public.enforce_run_transition();
exception when duplicate_object then null; end $$;

-- guard the raw_records_shared invariant at INSERT too
create or replace function public.enforce_run_insert()
returns trigger
language plpgsql
as $$
begin
  if new.raw_records_shared <> 0 then
    raise exception 'invariant violation: raw_records_shared must be 0 at creation';
  end if;
  if new.status <> 'draft' then
    raise exception 'runs must be created in draft status';
  end if;
  return new;
end;
$$;

do $$ begin
  create trigger detection_runs_enforce_insert
    before insert on public.detection_runs
    for each row execute function public.enforce_run_insert();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Auto-audit: every run status change appends a canonical, immutable ledger
-- entry. The ledger is thus never client-driven — it is a byproduct of state.
-- ---------------------------------------------------------------------------
create or replace function public.audit_run_status()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events(run_id, org_id, actor, event_type, phase, payload)
    values (new.id, new.created_by_org, 'system', 'run.created', new.status,
            jsonb_build_object('policy', new.policy_key, 'protocol', new.protocol));
  elsif new.status is distinct from old.status then
    insert into public.audit_events(run_id, org_id, actor, event_type, phase, payload)
    values (new.id, new.created_by_org, 'system', 'run.' || new.status::text, new.status,
            jsonb_build_object('from', old.status, 'to', new.status,
                               'reason', new.status_reason));
  end if;
  return new;
end;
$$;

do $$ begin
  create trigger detection_runs_audit_insert
    after insert on public.detection_runs
    for each row execute function public.audit_run_status();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger detection_runs_audit_update
    after update on public.detection_runs
    for each row execute function public.audit_run_status();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Append-only enforcement. These tables are write-once facts / ledgers:
-- audit_events, approval_decisions, campaign_clusters, permitted_findings,
-- signal_commitments. Block UPDATE and DELETE for EVERY role (incl. admin).
-- ---------------------------------------------------------------------------
create or replace function public.block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only (% blocked)', tg_table_name, tg_op;
end;
$$;

do $$ begin
  create trigger audit_events_append_only
    before update or delete on public.audit_events
    for each row execute function public.block_mutation();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger approval_decisions_append_only
    before update or delete on public.approval_decisions
    for each row execute function public.block_mutation();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger campaign_clusters_append_only
    before update or delete on public.campaign_clusters
    for each row execute function public.block_mutation();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger permitted_findings_append_only
    before update or delete on public.permitted_findings
    for each row execute function public.block_mutation();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger signal_commitments_append_only
    before update or delete on public.signal_commitments
    for each row execute function public.block_mutation();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Maintain campaign_cluster_id / cardinality on the run when a cluster is
-- written (trusted, so the client can never set the finding pointer directly).
-- ---------------------------------------------------------------------------
create or replace function public.link_cluster_to_run()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  update public.detection_runs
     set campaign_cluster_id = new.id,
         match_cardinality   = new.cardinality
   where id = new.run_id
     and campaign_cluster_id is null;
  return new;
end;
$$;

do $$ begin
  create trigger campaign_clusters_link
    after insert on public.campaign_clusters
    for each row execute function public.link_cluster_to_run();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Audit an approval decision as it is written.
-- ---------------------------------------------------------------------------
create or replace function public.audit_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  insert into public.audit_events(run_id, org_id, actor, event_type, phase, payload)
  values (new.run_id, new.org_id,
          'user:' || coalesce(new.decided_by::text, 'unknown'),
          'action.' || (case when new.decision = 'approve' then 'approved' else 'rejected' end),
          'awaiting_approval',
          jsonb_build_object('action_request_id', new.action_request_id,
                             'decision', new.decision, 'role', new.decided_by_role));
  return new;
end;
$$;

do $$ begin
  create trigger approval_decisions_audit
    after insert on public.approval_decisions
    for each row execute function public.audit_approval();
exception when duplicate_object then null; end $$;
