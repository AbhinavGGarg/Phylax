# Φ Phylax

**Prove the campaign. Share nothing.**

Phylax is a privacy-preserving, real-time **collective campaign-containment network**. A bank, a marketplace, and a messaging platform each see a weak, non-actionable fragment of an emerging scam. Phylax lets them *prove a coordinated campaign together* — without exposing customer identities, raw messages, private watchlists, or embeddings — and coordinate the smallest safe, human-approved intervention.

> Built for the **Bay Builders Hackathon** ("Build your own AI company"), targeting **Best Use of InsForge**.
> InsForge is the operating system; **SecretFlow** performs the privacy-preserving computation.

---

## The one thing to understand

Individually, none of the three platforms can act:

| Platform | What it sees | Its solo risk score |
|---|---|---|
| **FinTrust** (bank) | unusual payout velocity to a new payee cluster | **0.77 %** |
| **SwiftCart** (marketplace) | a seller steering buyers off-platform | **0.82 %** |
| **PingLine** (messaging) | a burst of near-identical messages with a short link | **2.79 %** |

Run one **protected sweep** and the same three fragments, matched cryptographically, become a near-certain coordinated campaign:

```
collective risk 99.98 %   ·   4 shared signatures across 3 platforms   ·   0 raw records shared
```

No raw record ever entered a neutral database. The match happened in **Private Set Intersection**; the score came from a **real trained model** over **securely-aggregated** features; every step is on an **immutable, signed audit ledger**.

---

## What is real (read this first)

Phylax is deliberately honest about the demo-vs-production boundary.

- ✅ **The privacy-preserving computation is real.** Private Set Intersection and secure aggregation actually run — they are not a loading spinner. The local backend runs a genuine 2048-bit **MODP Decisional-Diffie-Hellman PSI** (the same cryptographic family as SecretFlow's `ECDH_PSI_3PC`); the production party services run **SecretFlow SPU** ECDH-PSI. We prove in tests that the coordinator never sees a single non-matching token.
- ✅ **The risk model is a real trained model** — a logistic regression over five aggregate features (`params_hash` verifies it reproduces from seed). It is **not** an LLM and **not** a random score. There is no chatbot anywhere in Phylax.
- ✅ **The InsForge control plane is live and load-bearing.** Postgres + RLS + a server-enforced monotonic state machine + append-only audit + 8 Edge Functions + Realtime + private Storage, deployed to a real InsForge project (`kd6vibk3`). Clicking "Run Protected Sweep" invokes the real orchestration path; the UI updates from actual backend state and Realtime events.
- ⚠️ **The demo uses synthetic data and a single-account topology.** All party services run in one host/account. This is a **functional demonstration**, not proof of adversarial infrastructure isolation. In production each organization runs its own InsForge project, its own party compute service, and its own key material (see [Security model](#security-model--limitations)).
- ❌ We do **not** claim end-to-end encryption we don't have, legal/compliance certification, or that anyone is a criminal. Phylax detects a *coordinated campaign* and recommends *proportionate actions subject to human approval*.

---

## Architecture

```
        PARTNER SPACE (per org, RLS-isolated)              ║ TRUST         NEUTRAL PLANE
                                                           ║ MEMBRANE      (InsForge · project kd6vibk3)
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐    ║
 │  FinTrust    │   │  SwiftCart   │   │  PingLine    │    ║   opaque      ┌───────────────────────────┐
 │  bank        │   │  marketplace │   │  messaging   │    ║   commitments │  Auth + RLS (6 roles)     │
 │  • raw data  │   │  • raw data  │   │  • raw data  │    ║   ───────────▶│  Postgres + state machine │
 │  • vectors*  │   │  • vectors*  │   │  • vectors*  │    ║   aggregate   │  8 Edge Functions         │
 │  • party     │   │  • party     │   │  • party     │    ║   findings    │  Realtime (safe events)   │
 │    agent ────┼───┼──── agent ───┼───┼──── agent    │    ║   ───────────▶│  private Storage          │
 └──────┬───────┘   └──────┬───────┘   └──────┬───────┘    ║   proof       │  append-only audit ledger │
        │     SecretFlow / DDH PSI  +  secure agg          ║   hashes      └───────────────────────────┘
        └───────────────── coordinator ───────────────────╫──────────────▶  receive-worker-callback (HMAC)
                                                           ║
   Raw messages, identities, account numbers, watchlists, embeddings  →  NEVER cross the membrane.
   Only opaque commitments, an opaque campaign id, permitted aggregate features, scores, and hashes cross.
```

A richer interactive diagram lives on the **Architecture** page (`/architecture`).

> **\* Local vectors are an optional, feature-flagged production component**, not exercised in the synthetic demo. In production each partner may build a local pgvector cluster of scam variants under its own RLS to form a *candidate* local signature before matching; those embeddings never leave the partner and never enter the neutral plane. Phylax does **not** fake a vector pipeline — the mandatory, real path is the PSI/MPC match over opaque tokens.

### The containment workflow (server-enforced state machine)

```
draft → awaiting_parties → running → protected_match → risk_scored
      → awaiting_approval → actioned → receipted        (+ failed / cancelled with a reason)
```

Transitions are **monotonic and enforced by a Postgres trigger** for every role — even the admin key cannot make an illegal jump. `raw_records_shared` is a hard DB invariant pinned at `0`.

---

## InsForge feature map

InsForge is not used for auth-and-deploy convenience; it is structurally indispensable.

| InsForge product | How Phylax uses it |
|---|---|
| **Auth + RLS** | 6 roles (`platform_admin, partner_admin, analyst, operator, approver, auditor`). Strict tenant isolation — a FinTrust user cannot read SwiftCart's private `signal_batches` / `signal_commitments`. Proven by a live test. |
| **Postgres** | 13 core tables + a **server-enforced monotonic state machine**, **append-only** audit/approval/commitment ledgers, recursion-safe `SECURITY DEFINER` RLS helpers, and the `raw_records_shared = 0` invariant. |
| **Edge Functions** | 8 functions form the entire control-plane API. `receive-worker-callback` verifies HMAC over the exact signed string, enforces a timestamp window, a single-use **nonce** ledger (replay protection), a forbidden-field scan, and legal state. |
| **Realtime** | Live incident timeline on `run:<id>` / `org:<id>` channels with **subscription RLS**. Payloads carry only safe metadata — a test asserts no prohibited field ever appears. |
| **Storage** | Private `phylax-artifacts` bucket for signed run reports / receipts. The control tables store references + checksums, never raw evidence. |
| **Custom Compute** | The Dockerized SecretFlow party services / coordinator (see `parties/`, `docker-compose.yml`, `docs/deploy-compute.md`). |
| **Backend Branching** | Documented schema-only security-branch workflow for applying RLS/trigger/function changes safely (`docs/backend-branching.md`). |
| **Sites** | Frontend deploy target (`npx @insforge/cli deployments deploy web`). |

## SecretFlow feature map

| SecretFlow capability | Role in Phylax |
|---|---|
| **ECDH Private Set Intersection** (`ECDH_PSI_3PC`) | The protected cross-party match over opaque campaign tokens. Production backend (`parties/common/psi_secretflow.py`, pinned `secretflow==1.10.0b1`). |
| **Secure aggregation** | Permitted aggregate features (`total_events`, `mean_velocity_z`, `temporal_alignment`) computed via additive secret sharing — no party's individual value is revealed. |
| **Federated numeric model** | A real logistic-regression risk score over the aggregate features (not an LLM, not random). |

> The default local backend (`parties/common/psi.py`) implements the **same DDH commutative-encryption protocol** in pure Python so the demo runs anywhere; set `PHYLAX_PSI_BACKEND=secretflow` in a party service that has SecretFlow installed to route through SPU. Results are identical.

SecretFlow is a dependency, not a fork. See [`NOTICE`](NOTICE) for its Apache-2.0 attribution.

---

## Quick start (local demo)

Prereqs: **Node ≥ 20**, **Python ≥ 3.10**, and the credentials in `.env.local` (already present if you set up the InsForge project — see below).

```bash
cd phylax
npm install                     # installs @insforge/sdk (party compute needs no pip installs)
npm run seed:users              # idempotent: demo operator + partner approvers
npm run dev                     # host on http://localhost:8890
```

Open **http://localhost:8890/console** and click **Run Protected Sweep**.

Pages:
- `/` — landing (the pitch)
- `/console` — the operator command center
- `/partner` — a partner-restricted view (live RLS isolation)
- `/architecture` — the InsForge + SecretFlow design
- `/sponsor` — why this is built natively on InsForge

### Run the real computation from the CLI

```bash
python3 parties/coordinator.py --run-id demo-001    # prints the full protected-sweep result as JSON
```

---

## InsForge setup & deployment (from scratch)

Everything below is real and was used to deploy the live project. Requires `npx @insforge/cli login`.

```bash
cd phylax

# 1. create the neutral control-plane project (or link an existing one)
npx @insforge/cli create --json --name "Phylax Control" --org-id <ORG_ID> --region us-east --template empty

# 2. apply schema, RLS, state machine, realtime, seed  (6 migrations)
npx @insforge/cli db migrations up --all

# 3. secrets (base URL + API key are auto-provisioned; add the signing keys)
npx @insforge/cli secrets add WORKER_HMAC_SECRET   "$(openssl rand -hex 32)"
npx @insforge/cli secrets add RECEIPT_SIGNING_KEY  "$(openssl rand -hex 32)"

# 4. private artifacts bucket
npx @insforge/cli storage create-bucket phylax-artifacts --private

# 5. auth config (no email verification for demo users)
npx @insforge/cli config apply -y

# 6. build + deploy the 8 edge functions (single-file inlined)
npm run build:functions
npm run deploy:functions        # loops `functions deploy <slug> --file insforge/functions/_dist/<slug>.ts`

# 7. seed demo users + memberships
npm run seed:users

# 8. (optional) deploy the frontend to InsForge Sites
npx @insforge/cli deployments deploy web
```

`.env.local` is generated with the project's base URL, API key, anon key, and freshly-generated `WORKER_HMAC_SECRET` / `RECEIPT_SIGNING_KEY` / `PHYLAX_JOINT_SECRET`. See [`.env.example`](.env.example) for the shape. **Never commit `.env.local` or `.insforge/`.**

The SecretFlow party services deploy to **InsForge Custom Compute** — see [`docs/deploy-compute.md`](docs/deploy-compute.md).

---

## Tests & verification

```bash
npm run test:py       # 12 crypto-core proofs (PSI correctness + privacy, secure agg, model, OPRF)
npm run test:node     # 14 live-InsForge tests (RLS isolation, replay/signature/stale/forbidden
                      #   callbacks, illegal transitions, append-only, receipt verify+tamper, realtime hygiene)
npm run verify:e2e    # the full demo path end-to-end with asserted invariants
```

All 26 tests pass against the live control plane. Highlights they prove:

- PSI finds the 4 shared signatures and leaks **0** non-matching tokens to the coordinator.
- Collective risk clears the action threshold while every solo risk stays below it.
- RLS blocks cross-tenant reads of private batches/commitments.
- Replayed / mis-signed / stale / forbidden-field callbacks are rejected.
- Illegal state transitions and `raw_records_shared != 0` are rejected by the DB.
- The receipt verifies; a tampered receipt is rejected.
- Realtime payloads contain only allow-listed safe keys.

### Demo assets

Screenshots referenced by this README live in `docs/assets/`. To capture a GIF of a live sweep, record the console at `/console` while clicking **Run Protected Sweep** through to the sealed receipt (~30 s). Place it at `docs/assets/demo.gif` and it will render here:

<!-- ![Phylax protected sweep](docs/assets/demo.gif) -->

---

## Security model & limitations

- **PSI/MPC execution is real.** DDH-PSI (local) and SecretFlow SPU ECDH-PSI (production) are genuine protocols; non-matching elements are hidden by the DDH assumption.
- **Signatures & tokenization.** Campaign signatures are prepared with a **2HashDH OPRF** keyed by a jointly-governed key — *not* a plain SHA-256 of a low-entropy identifier. What the neutral plane stores is a **hiding commitment** to each token, so it cannot join partners itself.
- **Local vectors are optional and not built for the demo.** The partner-side pgvector pipeline (local scam-variant clustering to form a candidate signature) is a documented, feature-flagged production component. It is not exercised here; the demo's real path is the PSI/MPC match over opaque tokens. Embeddings never enter the neutral plane in either mode.
- **Demo vs production trust boundary.** The demo runs all party services in one account: a functional demonstration, **not** adversarial isolation. Production requires each organization to run its own InsForge project + party service + independent key material, with the OPRF key jointly governed / threshold, and per-org Ed25519 signing (the demo uses shared HMAC secrets, same wire format).
- **No overclaiming.** Nothing here is "end-to-end encrypted" unless it is. There is no legal/compliance certification. Phylax makes **no automatic accusations** and takes **no irreversible enforcement action** — every intervention is proportionate and human-approved.

---

## Hackathon eligibility

**Theme — "Build your own AI company."** Phylax is a B2B **trust-&-safety company**: banks, marketplaces, and messaging platforms join a *containment consortium* and pay to reduce fraud losses and collaborate in a regulator-safe way. It is "AI" without a chatbot, three real ways: a federated risk **model**, autonomous party **agents**, and an agentic containment **workflow**.

- **Primary track — Track 1 (AI SaaS / B2B tools).** An AI product that helps companies reduce cost and make better decisions.
- **Compatible — Track 3 (AI Agent Company):** the party services + coordinator are autonomous agents that take a goal ("prove a coordinated campaign") and execute a workflow end-to-end. **Track 4 (Vertical AI):** deep specialization in fraud/fincrime.
- **Prize — Best Use of InsForge.** See the [InsForge feature map](#insforge-feature-map); InsForge is the product's operating system, not a name-drop.
- **BAND alignment (honest):** Phylax's human-in-the-loop approval + multi-party governance is exactly the human↔agent collaboration layer BAND describes; noted for alignment, not integrated.

We deliberately did **not** bolt on unrelated sponsor SDKs (search, memory, etc.) — they have no place in a privacy-preserving detection path, and adding them would weaken the product.

---

## 45-second pitch

> Scam rings are cross-platform, but the platforms are siloed. Your bank sees a weird payout, a marketplace sees a shady seller, a messaging app sees a link burst — each one, alone, is below the bar to act. They can't pool raw data: it's illegal, unsafe, and a privacy nightmare. So the rings win.
> Phylax is the neutral network that lets them prove the campaign *together* without sharing anything. Real cryptography — private set intersection and secure aggregation — finds the coordination across all three, a trained model scores it, and a human approves the smallest safe action. The neutral control plane stores zero raw records; it's all on a signed, immutable ledger.
> It's built natively on InsForge — auth, an isolated Postgres control plane, long-running compute, realtime, storage, and a tamper-evident audit trail — with SecretFlow doing the private math. A privacy-security company, not a CRUD app.

## 90-second demo script

1. **"Three companies each see a signal too weak to act on."** Point at the left panel — solo risks under 3 %.
2. Click **Run Protected Sweep**.
3. Three party nodes go ready; a protected session is established across the **trust membrane**.
4. **"The Phylax control plane has zero raw records"** — the sealed **0** on the membrane holds while encrypted packets cross.
5. The real protected match runs (PSI + MPC, a few seconds).
6. One **opaque coordinated campaign** crystallizes — 4 shared signatures, **99.98 %** collective risk, with the model's own feature drivers shown.
7. **Human approval required** — nothing auto-executes.
8. Approve *hold payout / quarantine listing / warn recipients*, each by an approver **at the target org**.
9. **Issue the signed incident receipt** — then verify it (and watch a tampered copy get rejected).
10. Open the audit timeline: *"The campaign was discovered collectively. The underlying customer data was never centralized."*

---

## Repository layout

```
phylax/
  migrations/            6 InsForge migrations (schema, state machine, RLS, realtime, seed, infra)
  insforge/functions/    8 edge functions (src/ + _shared/core.ts → _dist/ inlined for deploy)
  parties/               real privacy-preserving compute
    common/              mpc_group · signatures(OPRF) · psi(DDH) · psi_secretflow(SPU) · secure_agg · risk_model · signing
    coordinator.py       orchestrates a protected sweep → signed callbacks
    data/                synthetic per-org datasets (one shared campaign + noise)
    party_service.py     FastAPI party agent  ·  coordinator_service.py  ·  Dockerfile.*  (Custom Compute)
    tests/               crypto-core proofs
  control-plane/         Node host: orchestrator.mjs + server.mjs (serves the console, bridges Realtime→SSE)
  web/                   console · landing · architecture · sponsor · partner  (+ assets/phylax.css)
  scripts/               build-functions · deploy-functions · seed-users · verify-e2e
  tests/node/            live-InsForge integration tests
  docs/                  deploy-compute · backend-branching · assets
```

## License

Phylax's own code is MIT. It **depends on** [SecretFlow](https://github.com/secretflow/secretflow) (Apache-2.0) — see [`NOTICE`](NOTICE).
