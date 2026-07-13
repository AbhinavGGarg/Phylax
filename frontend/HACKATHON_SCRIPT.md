# ═══════════════════════════════════════════════════════════════════════════
# PHYLAX · Bay Builders Hackathon — DEMO SCRIPT
# Target: Best Use of InsForge  |  Duration: 2 min 30 sec
# ═══════════════════════════════════════════════════════════════════════════

# ═══ Timestamps show where you should be in the console at each moment ═══


## ───── 0:00 – 0:20 │ THE HOOK │ Show landing page ─────

> Tab: http://localhost:8890 (the landing page)

"Scam rings are cross-platform. A bank sees a weird payout. A marketplace
sees a shady seller. A messenger sees a link burst. Three fragments, each
below the action threshold — each one, alone, useless.

The obvious fix is to pool the data. But you can't. It's illegal. It's
unsafe. It's a privacy nightmare. So the ring wins.

Unless — you can prove the campaign together without sharing a single raw
record. That's Phylax."

━━━


## ───── 0:20 – 0:50 │ THE ARCHITECTURE │ Show architecture page ─────

> Tab: /architecture.html — scroll to the diagram

"Here's how it works. Three partner spaces — a bank, a marketplace, a
messaging platform. Each holds raw data inside its own perimeter, under
its own row-level security. They never share raw records.

Between them and the neutral plane is a trust membrane. Only opaque
commitments, aggregate findings, and hashes cross. The membrane stores
zero raw records. That zero is sealed. It's a hard database invariant.

Behind the membrane: the neutral control plane. And this is where the
story gets interesting — because this entire control plane is INSFORGE."

[click to highlight the InsForge control plane box in the diagram]

"InsForge is not a database we happen to use. It IS the trust boundary.
Let me show you exactly how."

━━━


## ───── 0:50 – 1:20 │ INSFORGE FEATURE MAP │ Scroll through map ─────

> Same page — scroll through the InsForge feature map section

"We use eight InsForge products. Not for convenience — for necessity.
Here's the mapping:

One: Auth + RLS. Six roles. Partner isolation. A FinTrust user literally
cannot read SwiftCart's private signal batches. Not hidden by the UI —
enforced at the database row level. We proved it in tests.

Two: Postgres. Thirteen tables. A monotonic state machine — draft,
awaiting_parties, running, match, scored, approval, actioned, receipted.
Server-enforced by trigger. Even the admin key can't make an illegal jump.

Three: Edge Functions. Eight functions that form the entire control-plane
API. Worker callbacks are authenticated with HMAC-SHA256 over a signed
envelope, a freshness window, AND a single-use nonce ledger for hard
replay protection. This is production-grade security.

Four: Realtime. Live incident timeline on run and org channels. RLS-gated
subscriptions. Payloads carry ONLY safe metadata — we assert in tests that
no prohibited field ever appears.

Five: Storage. Private phylax-artifacts bucket. The DB stores only
pointers and checksums — never raw evidence.

Six: Custom Compute. Dockerized SecretFlow party services — Linux, Python
3.10. Each org's PSI and secure-aggregation share runs here.

Seven: Backend Branching. Schema-only security branch validates every RLS
and trigger change before production.

Eight: Sites. The entire frontend — this page, the console — deployed on
InsForge Sites from the same project that governs the data.

That's not integration. That's infrastructure. InsForge IS the operating
system of this product."

━━━


## ───── 1:20 – 1:50 │ LIVE DEMO │ Switch to console ─────

> Tab: /console.html — the operator dashboard

"Let me show you this live. This is the operator console. Three platforms
— FinTrust, SwiftCart, PingLine — each seeing a fragment too weak to act
on. Solo risks under three percent. Nobody can move on this alone.

Watch what happens when we run a protected sweep."

[CLICK: Run Protected Sweep]

"Behind the scenes — and this is where InsForge does the real work — the
operator hits our create-detection-run edge function. InsForge Postgres
creates the run in 'awaiting_parties' state. The state machine enforces
the transition — no one skips a step.

The dispatch-party-run function fires. Three party agents go ready. A
protected session is established across the trust membrane.

Now real cryptography runs: ECDH private-set-intersection across three
parties. The coordinator relays fully-blinded group elements. It learns
only the intersection. Non-matching tokens are never revealed. That's
SecretFlow doing the math — but InsForge is the platform that MAKES it
a usable product.

The receive-worker-callback edge function accepts the signed result. HMAC
verification. Timestamp check. Nonce consumption — that nonce can never
be used again. Replay attacks are impossible.

The campaign crystallizes. Four shared signatures across three platforms.
99.98 percent collective risk — versus under three percent solo. That's a
proven coordinated campaign.

And look at this number: raw records shared — zero. It never moves. It's
enforced by a database trigger on InsForge Postgres.

Now the state machine moves to awaiting_approval. Human approval required.
Nothing auto-executes. Every action — hold payout, quarantine listing,
warn recipients — must be approved by a human at the target organization.

The receipt is sealed. Ed25519-signed. Stored in InsForge's private
artifacts bucket. The audit trail is append-only — immutable."

━━━


## ───── 1:50 – 2:15 │ INSFORGE IS THE PRODUCT │ Back to architecture ─────

> Tab: /sponsor.html — the thesis statement

"Here's the thesis. Read it carefully. Phylax is built natively on
InsForge. InsForge creates the trust boundaries. Hosts the long-running
compute. Enforces access controls. Persists the auditable ledger. Streams
the live incident response. Stores private artifacts. Deploys the control
plane. SecretFlow performs the privacy-preserving math. InsForge makes
that math a usable, trusted, deployable product.

Without InsForge, this would be a cryptography whitepaper. With InsForge,
it's a containment product that banks, marketplaces, and messaging
platforms can actually deploy and use.

Think about what we DIDN'T have to build: no auth system, no custom RLS
framework, no function deployment pipeline, no realtime infrastructure,
no storage layer, no migration tooling. InsForge gave us all of that —
not as a convenience layer, but as the structural backbone of the product.
The trust boundary IS InsForge. Every security guarantee we make flows
through InsForge's primitives.

We chose InsForge because this product couldn't exist as a stack of
loosely-wired services. It needed one control plane that could be the
trust boundary, the state machine, the audit ledger, and the live stream
— all in one. That's exactly the shape InsForge has."

━━━


## ───── 2:15 – 2:30 │ THE CLOSE │ Landing page CTA ─────

> Tab: / — scroll to the bottom CTA

"To the InsForge team: we didn't bolt InsForge onto our product. The
product IS InsForge. Every layer of our architecture maps to an InsForge
primitive. Every security boundary is an InsForge policy. Every incident
that runs through this system leaves its trail in InsForge's audit ledger.

We're competing for Best Use of InsForge because we believe we've used
it the way it was meant to be used — not as a backend-as-a-service, but
as the operating system for an AI security company.

Phylax. Prove the campaign. Share nothing. Built on InsForge."

━━━


# ═══════════════════════════════════════════════════════════════════════════
# QUICK REFERENCE CARD
# ═══════════════════════════════════════════════════════════════════════════

# TABS TO HAVE OPEN:
#   1. http://localhost:8890              (landing — hook + close)
#   2. http://localhost:8890/architecture.html  (diagram + feature maps)
#   3. http://localhost:8890/console.html       (live demo — RUN SWEEP BEFOREHAND!)
#   4. http://localhost:8890/sponsor.html       (thesis statement)

# BEFORE GOING ON STAGE:
#   □ Start the server: npm run dev
#   □ Pre-load all 4 tabs
#   □ Run a sweep once to warm up (or get timing right)
#   □ Mute notifications
#   □ Set browser to full screen
#   □ Hide bookmarks bar

# KEY INSFORGE FEATURES TO HIT (check as you say them):
#   □ Auth + RLS (6 roles, tenant isolation)
#   □ Postgres (state machine, triggers, raw_records_shared=0)
#   □ Edge Functions (8 fns, HMAC, nonce ledger)
#   □ Realtime (live timeline, RLS-gated, safe metadata)
#   □ Storage (private bucket, pointers only)
#   □ Custom Compute (Dockerized SecretFlow)
#   □ Backend Branching (schema safety)
#   □ Sites (frontend deploy)

# TRANSITION PHRASES:
#   "And this is where InsForge..."
#   "InsForge makes that..."
#   "Without InsForge... / With InsForge..."
#   "That's not integration. That's infrastructure."
#   "The product IS InsForge."
