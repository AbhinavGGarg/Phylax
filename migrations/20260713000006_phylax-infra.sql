-- ============================================================================
--  PHYLAX · Control Plane · 0006 infra (replay protection)
--  ----------------------------------------------------------------------------
--  Server-only nonce ledger. `receive-worker-callback` inserts each callback's
--  nonce here; a duplicate insert (ON CONFLICT) means a replay and is rejected.
--  No client role can read or write it.
-- ============================================================================
create table if not exists public.worker_nonces (
  nonce      text primary key,
  run_id     uuid,
  phase      text,
  created_at timestamptz not null default now()
);
create index if not exists worker_nonces_run_idx on public.worker_nonces (run_id);

alter table public.worker_nonces enable row level security;
revoke all on public.worker_nonces from anon, authenticated;
-- (no policies + no grants ⇒ only project_admin / edge functions can touch it)
