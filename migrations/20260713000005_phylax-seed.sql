-- ============================================================================
--  PHYLAX · Control Plane · 0005 seed (reference/config data only)
--  ----------------------------------------------------------------------------
--  Seeds the consortium directory + the federated risk-model registry entry.
--  It seeds NO raw signals — those live only inside each partner's own party
--  service (parties/data). Deterministic UUIDs let the party services and the
--  frontend reference orgs without a lookup round-trip.
-- ============================================================================

insert into public.organizations (id, slug, name, kind, is_control) values
  ('11111111-1111-1111-1111-111111111111', 'phylax',    'Phylax Control',        'control',     true),
  ('22222222-2222-2222-2222-222222222222', 'fintrust',  'FinTrust Bank',         'bank',        false),
  ('33333333-3333-3333-3333-333333333333', 'swiftcart', 'SwiftCart Marketplace', 'marketplace', false),
  ('44444444-4444-4444-4444-444444444444', 'pingline',  'PingLine Messaging',    'messaging',   false)
on conflict (slug) do update
  set name = excluded.name, kind = excluded.kind, is_control = excluded.is_control;

-- The federated risk model (real logistic regression; weights hashed here, held
-- in private Storage in production). params_hash matches parties/common/risk_model.py.
insert into public.model_versions (id, name, version, kind, feature_spec, params_hash, active)
values (
  '55555555-5555-5555-5555-555555555555',
  'phylax-risk', '1.0.0', 'logistic_regression',
  '{"features":["distinct_parties","matched_signatures","total_events","mean_velocity_z","temporal_alignment"],
    "transform":{"total_events":"log1p"},
    "family":"logistic_regression",
    "trained_on":"synthetic labelled clusters (seed 20260713)",
    "notes":"features are all produced by the protected computation, never raw records"}'::jsonb,
  'sha256:3a5698ad3f303b6bb560934eb75eb884b81d43d1c499b8948dc36771e52d3131',
  true
)
on conflict (name, version) do update
  set feature_spec = excluded.feature_spec, params_hash = excluded.params_hash, active = true;
