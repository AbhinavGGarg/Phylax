-- ============================================================================
--  PHYLAX · Control Plane · 0001 core schema
--  ----------------------------------------------------------------------------
--  Phylax Control is the NEUTRAL project. It never stores raw messages, users,
--  account numbers, watchlists, or embeddings. It stores only: authenticated
--  membership, run metadata, opaque commitments, permitted aggregate findings,
--  derived risk scores, human approvals, an append-only audit ledger, and
--  signed artifact references (checksums + storage keys, never raw evidence).
--
--  InsForge wraps each migration in its own transaction — no BEGIN/COMMIT here.
--  No pgvector in the control plane BY DESIGN: embeddings never leave a partner.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ENUMS · the vocabulary of the containment workflow.
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.phylax_role as enum
    ('platform_admin','partner_admin','analyst','operator','approver','auditor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.org_kind as enum ('bank','marketplace','messaging','control');
exception when duplicate_object then null; end $$;

-- The monotonic containment state machine (enforced server-side in 0002).
do $$ begin
  create type public.run_status as enum (
    'draft','awaiting_parties','running','protected_match','risk_scored',
    'awaiting_approval','actioned','receipted','failed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.participant_status as enum ('invited','ready','submitted','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.action_type as enum
    ('hold_payout','quarantine_listing','warn_recipients','monitor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.action_status as enum ('requested','approved','rejected','executed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.artifact_kind as enum
    ('input_package','model_artifact','run_report','receipt');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.decision_kind as enum ('approve','reject');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- ORGANIZATIONS · the parties. Three partners + one neutral control plane.
-- verify_key is the party's public signing key (Ed25519, base64). Phylax uses
-- it to verify signed worker callbacks and receipts. Private keys never land
-- in the control plane.
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  kind        public.org_kind not null,
  is_control  boolean not null default false,
  verify_key  text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ORGANIZATION_MEMBERS · who belongs to which org, and in what role.
-- Authorization is ALWAYS derived from (auth.uid(), org_id, role) here — never
-- from an org id supplied by the client.
-- ---------------------------------------------------------------------------
create table if not exists public.organization_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.phylax_role not null default 'analyst',
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists org_members_user_idx on public.organization_members (user_id);
create index if not exists org_members_org_idx  on public.organization_members (org_id);

-- ---------------------------------------------------------------------------
-- MODEL_VERSIONS · the federated risk model registry. The model is a real
-- numeric model (logistic regression over permitted aggregate features); its
-- weights live in private Storage, only the hash + feature spec are central.
-- ---------------------------------------------------------------------------
create table if not exists public.model_versions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  version      text not null,
  kind         text not null default 'logistic_regression',
  feature_spec jsonb not null,
  params_hash  text not null,
  weights_ref  text,
  active       boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (name, version)
);

-- ---------------------------------------------------------------------------
-- DETECTION_RUNS · one protected sweep. The heart of the state machine.
-- Clients never write this table; edge functions advance it and the 0002
-- trigger enforces monotonic, legal transitions.
-- ---------------------------------------------------------------------------
create table if not exists public.detection_runs (
  id                 uuid primary key default gen_random_uuid(),
  created_by_org     uuid not null references public.organizations(id),
  created_by_user    uuid references auth.users(id),
  status             public.run_status not null default 'draft',
  status_reason      text,
  policy_key         text not null default 'coordinated_campaign_v1',
  protocol           text not null default 'ECDH_PSI_3PC',
  protocol_version   text not null default '1.0.0',
  model_version_id   uuid references public.model_versions(id),
  campaign_cluster_id uuid,                    -- set at protected_match
  match_cardinality  integer,                  -- policy-permitted cardinality only
  risk_score         double precision,         -- derived, [0,1]
  confidence         double precision,         -- [0,1]
  receipt_hash       text,
  receipt_signature  text,
  receipt_issued_at  timestamptz,
  raw_records_shared integer not null default 0, -- INVARIANT: must stay 0
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  started_at         timestamptz,
  matched_at         timestamptz,
  scored_at          timestamptz,
  approved_at        timestamptz,
  receipted_at       timestamptz
);
create index if not exists runs_status_idx on public.detection_runs (status, created_at desc);
create index if not exists runs_org_idx    on public.detection_runs (created_by_org);
create index if not exists runs_cluster_idx on public.detection_runs (campaign_cluster_id);

-- ---------------------------------------------------------------------------
-- RUN_PARTICIPANTS · which orgs are in a run and their readiness. Feeds the
-- "3 separate party nodes become ready" moment of the demo.
-- ---------------------------------------------------------------------------
create table if not exists public.run_participants (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references public.detection_runs(id) on delete cascade,
  org_id      uuid not null references public.organizations(id),
  status      public.participant_status not null default 'invited',
  ready_at    timestamptz,
  created_at  timestamptz not null default now(),
  unique (run_id, org_id)
);
create index if not exists run_participants_run_idx on public.run_participants (run_id);
create index if not exists run_participants_org_idx on public.run_participants (org_id);

-- ---------------------------------------------------------------------------
-- SIGNAL_BATCHES · PARTNER-PRIVATE. Metadata about a batch of local signals a
-- partner contributes to a run. Never the raw signals themselves — only counts
-- and a label. Strictly org-scoped (RLS): FinTrust can never read SwiftCart's.
-- ---------------------------------------------------------------------------
create table if not exists public.signal_batches (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  run_id       uuid references public.detection_runs(id) on delete set null,
  label        text not null,
  signal_count integer not null default 0,
  window_start timestamptz,
  window_end   timestamptz,
  submitted_by uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists signal_batches_org_idx on public.signal_batches (org_id);
create index if not exists signal_batches_run_idx on public.signal_batches (run_id);

-- ---------------------------------------------------------------------------
-- SIGNAL_COMMITMENTS · PARTNER-PRIVATE. The opaque, keyed-normalized campaign
-- SIGNATURE commitments a partner puts forward for protected matching. These
-- are NOT raw identifiers and NOT plain SHA-256 of low-entropy values: they are
-- OPRF-style / jointly-governed-token commitments (see parties/common). Only
-- these opaque commitments ever enter the PSI. Strictly org-scoped.
-- ---------------------------------------------------------------------------
create table if not exists public.signal_commitments (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.signal_batches(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  commitment  text not null,          -- opaque commitment (hex), no raw value
  algo        text not null default 'oprf-ristretto255+keyed-normalize',
  key_ref     text not null,          -- id of the jointly-governed key, NOT the key
  created_at  timestamptz not null default now()
);
create index if not exists signal_commitments_batch_idx on public.signal_commitments (batch_id);
create index if not exists signal_commitments_org_idx   on public.signal_commitments (org_id);

-- ---------------------------------------------------------------------------
-- CAMPAIGN_CLUSTERS · the derived, opaque coordinated campaign a protected run
-- reveals. No raw source records — only an opaque campaign id + signature hash
-- + policy-permitted cardinality.
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_clusters (
  id                 uuid primary key default gen_random_uuid(),
  run_id             uuid not null references public.detection_runs(id) on delete cascade,
  opaque_campaign_id text not null,      -- derived, opaque (not reversible to raw)
  signature_hash     text not null,      -- hash of the matched intersection witness
  cardinality        integer not null,   -- # of parties / matched signatures (policy-permitted)
  party_count        integer not null,
  created_at         timestamptz not null default now(),
  unique (run_id, opaque_campaign_id)
);
create index if not exists campaign_clusters_run_idx on public.campaign_clusters (run_id);

-- ---------------------------------------------------------------------------
-- PERMITTED_FINDINGS · policy-permitted AGGREGATE features only (never a raw
-- value): e.g. distinct_parties=3, payout_velocity_z=4.1, link_burst_rate=...
-- ---------------------------------------------------------------------------
create table if not exists public.permitted_findings (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.detection_runs(id) on delete cascade,
  cluster_id    uuid references public.campaign_clusters(id) on delete cascade,
  feature_key   text not null,
  feature_value double precision not null,
  unit          text,
  created_at    timestamptz not null default now()
);
create index if not exists permitted_findings_run_idx on public.permitted_findings (run_id);

-- ---------------------------------------------------------------------------
-- ACTION_REQUESTS · the smallest safe intervention Phylax recommends, targeting
-- a specific org, subject to human approval. Never an automatic accusation.
-- ---------------------------------------------------------------------------
create table if not exists public.action_requests (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.detection_runs(id) on delete cascade,
  target_org_id uuid not null references public.organizations(id),
  action_type   public.action_type not null,
  rationale     text not null,
  status        public.action_status not null default 'requested',
  requested_by  text not null default 'phylax-coordinator',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists action_requests_run_idx on public.action_requests (run_id);
create index if not exists action_requests_org_idx on public.action_requests (target_org_id);

-- ---------------------------------------------------------------------------
-- APPROVAL_DECISIONS · a human at the TARGET org accepts/rejects the action.
-- Append-only. An org can only decide on actions targeting itself (RLS, 0003).
-- ---------------------------------------------------------------------------
create table if not exists public.approval_decisions (
  id                uuid primary key default gen_random_uuid(),
  action_request_id uuid not null references public.action_requests(id) on delete cascade,
  run_id            uuid not null references public.detection_runs(id) on delete cascade,
  org_id            uuid not null references public.organizations(id),
  decision          public.decision_kind not null,
  decided_by        uuid references auth.users(id),
  decided_by_role   public.phylax_role,
  note              text,
  signature         text,
  created_at        timestamptz not null default now()
);
create index if not exists approval_decisions_action_idx on public.approval_decisions (action_request_id);
create index if not exists approval_decisions_run_idx    on public.approval_decisions (run_id);

-- ---------------------------------------------------------------------------
-- RUN_ARTIFACTS · references (bucket/key + checksum) to private Storage
-- objects: encrypted party input packages, model artifacts, signed run reports.
-- Never raw evidence in this table — only pointers and hashes.
-- ---------------------------------------------------------------------------
create table if not exists public.run_artifacts (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references public.detection_runs(id) on delete cascade,
  org_id         uuid references public.organizations(id),
  kind           public.artifact_kind not null,
  storage_bucket text not null,
  storage_key    text not null,
  checksum       text not null,
  size_bytes     bigint,
  created_at     timestamptz not null default now()
);
create index if not exists run_artifacts_run_idx on public.run_artifacts (run_id);
create index if not exists run_artifacts_org_idx on public.run_artifacts (org_id);

-- ---------------------------------------------------------------------------
-- AUDIT_EVENTS · APPEND-ONLY decision ledger. Safe metadata only (runId,
-- phase, actor, result hash) — never raw private values. Immutability enforced
-- by trigger in 0002.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references public.detection_runs(id) on delete set null,
  org_id      uuid references public.organizations(id) on delete set null,
  actor       text not null,          -- 'system' | 'worker:<party>' | 'user:<uid>'
  event_type  text not null,          -- e.g. run.created, protected_match.completed
  phase       text,
  elapsed_ms  integer,
  payload     jsonb not null default '{}'::jsonb,   -- SAFE metadata only
  result_hash text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_events_run_idx  on public.audit_events (run_id, created_at);
create index if not exists audit_events_type_idx on public.audit_events (event_type);

-- add the FK from detection_runs.campaign_cluster_id now that clusters exist
do $$ begin
  alter table public.detection_runs
    add constraint detection_runs_cluster_fk
    foreign key (campaign_cluster_id) references public.campaign_clusters(id)
    on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance (InsForge built-in system.update_updated_at()).
-- ---------------------------------------------------------------------------
do $$ begin
  create trigger detection_runs_updated_at before update on public.detection_runs
    for each row execute function system.update_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger action_requests_updated_at before update on public.action_requests
    for each row execute function system.update_updated_at();
exception when duplicate_object then null; end $$;
