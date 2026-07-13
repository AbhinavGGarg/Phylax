-- ============================================================================
--  PHYLAX · Control Plane · 0004 realtime
--  ----------------------------------------------------------------------------
--  Live, authenticated, auditable run progress. Payloads carry ONLY safe
--  metadata (run id, phase, derived score, cardinality, the 0-raw counter) —
--  never a raw signal, identifier, or vector. The UI derives its timeline from
--  persisted state first, then enhances live via these events, so reconnect and
--  refresh are always correct.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Channel patterns: per-run and per-org.
-- ---------------------------------------------------------------------------
insert into realtime.channels (pattern, description, enabled) values
  ('run:%', 'Per-run protected-sweep progress', true),
  ('org:%', 'Per-organization incident feed', true)
on conflict (pattern) do update
  set description = excluded.description, enabled = excluded.enabled;

-- ---------------------------------------------------------------------------
-- Publish run lifecycle. Status → canonical event name.
-- ---------------------------------------------------------------------------
create or replace function public.rt_run_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  ev text;
  body jsonb;
begin
  if tg_op = 'INSERT' then
    ev := 'run.created';
  else
    if new.status is not distinct from old.status then
      return new;
    end if;
    ev := case new.status
      when 'running'           then 'protected_match.started'
      when 'protected_match'   then 'protected_match.completed'
      when 'risk_scored'       then 'risk.scored'
      when 'awaiting_approval' then 'run.awaiting_approval'
      when 'actioned'          then 'run.actioned'
      when 'receipted'         then 'receipt.issued'
      when 'failed'            then 'run.failed'
      when 'cancelled'         then 'run.cancelled'
      else 'run.' || new.status::text
    end;
  end if;

  body := jsonb_build_object(
    'runId',             new.id,
    'status',            new.status,
    'event',             ev,
    'riskScore',         new.risk_score,
    'confidence',        new.confidence,
    'matchCardinality',  new.match_cardinality,
    'campaignClusterId', new.campaign_cluster_id,
    'rawRecordsShared',  new.raw_records_shared,   -- always 0
    'reason',            new.status_reason,
    'at',                now()
  );

  perform realtime.publish('run:' || new.id::text, ev, body);
  if tg_op = 'INSERT' then
    perform realtime.publish('org:' || new.created_by_org::text, ev, body);
  end if;
  return new;
end;
$$;

do $$ begin
  create trigger detection_runs_rt_insert after insert on public.detection_runs
    for each row execute function public.rt_run_lifecycle();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger detection_runs_rt_update after update on public.detection_runs
    for each row execute function public.rt_run_lifecycle();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Party readiness → 'party.ready'.
-- ---------------------------------------------------------------------------
create or replace function public.rt_party_ready()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.status = 'ready' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform realtime.publish(
      'run:' || new.run_id::text, 'party.ready',
      jsonb_build_object('runId', new.run_id, 'orgId', new.org_id,
                         'event', 'party.ready', 'at', now()));
  end if;
  return new;
end;
$$;

do $$ begin
  create trigger run_participants_rt_ins after insert on public.run_participants
    for each row execute function public.rt_party_ready();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger run_participants_rt_upd after update on public.run_participants
    for each row execute function public.rt_party_ready();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Action requested → 'action.requested' (run channel + target org channel).
-- ---------------------------------------------------------------------------
create or replace function public.rt_action_requested()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare body jsonb;
begin
  body := jsonb_build_object('runId', new.run_id, 'actionRequestId', new.id,
            'actionType', new.action_type, 'targetOrgId', new.target_org_id,
            'event', 'action.requested', 'at', now());
  perform realtime.publish('run:' || new.run_id::text, 'action.requested', body);
  perform realtime.publish('org:' || new.target_org_id::text, 'action.requested', body);
  return new;
end;
$$;

do $$ begin
  create trigger action_requests_rt after insert on public.action_requests
    for each row execute function public.rt_action_requested();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Approval decision → 'action.approved' / 'action.rejected'.
-- ---------------------------------------------------------------------------
create or replace function public.rt_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare ev text;
begin
  ev := case when new.decision = 'approve' then 'action.approved' else 'action.rejected' end;
  perform realtime.publish('run:' || new.run_id::text, ev,
    jsonb_build_object('runId', new.run_id, 'actionRequestId', new.action_request_id,
                       'decision', new.decision, 'event', ev, 'at', now()));
  return new;
end;
$$;

do $$ begin
  create trigger approval_decisions_rt after insert on public.approval_decisions
    for each row execute function public.rt_approval();
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Channel-subscription RLS: only authorized viewers may subscribe.
-- ---------------------------------------------------------------------------
alter table realtime.channels enable row level security;

do $$ begin
  create policy subscribe_run_channels on realtime.channels
    for select to authenticated
    using (
      pattern = 'run:%'
      and public.can_view_run(nullif(split_part(realtime.channel_name(), ':', 2), '')::uuid)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy subscribe_org_channels on realtime.channels
    for select to authenticated
    using (
      pattern = 'org:%'
      and public.is_org_member(nullif(split_part(realtime.channel_name(), ':', 2), '')::uuid)
    );
exception when duplicate_object then null; end $$;
