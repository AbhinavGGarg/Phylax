# PHYLAX — 2 Minute InsForge Pitch
# Target: Best Use of InsForge


## SETUP: 4 tabs open
  1. Landing  2. Architecture  3. Console (pre-test sweep)  4. Sponsor
  Run: `npm run dev`


## ─── 0:00 – 0:20 │ OPENING ───

[tab: landing]

"We built Phylax to stop coordinated scam rings across banks,
marketplaces, and messaging platforms — without sharing a single raw
record.

I could talk about the cryptography for ten minutes. ECDH private-set-
intersection. Secure aggregation. Federated risk models. But I'm not
going to — because what makes Phylax real isn't the math. It's **InsForge.**

InsForge is the reason this exists as a product and not a research paper.
Let me show you."


## ─── 0:20 – 0:50 │ INSFORGE DEEP DIVE ───

[tab: architecture — scroll to feature map]

"We use every major InsForge product. Not for convenience. For necessity.
This product literally cannot function without InsForge. Here's how deep
it goes:

**Auth + RLS** — the trust boundary between organizations. Six roles, four
orgs. A FinTrust user queries SwiftCart's private batches — InsForge
returns zero rows. Not hidden. Denied at the database level.

**Postgres** — 13 tables. Monotonic state machine. Every sweep goes through
enforced stages. We tried to skip steps with the admin key. InsForge
rejected it. The trigger won't budge.

**Edge Functions** — our entire API is 8 InsForge functions. The worker
callback verifies HMAC-SHA256 on a signed envelope, checks a timestamp
window, and burns a single-use nonce from an InsForge ledger. Replay
attacks are mathematically impossible because InsForge won't accept a
spent nonce.

**Realtime** — live incident feed, RLS-gated, delivering only safe metadata.
**Storage** — private bucket, pointers and checksums, zero raw evidence ever
touches it. **Custom Compute** — Dockerized SecretFlow party services,
hosted by InsForge. **Branching** — schema-only security branches so we
can't accidentally break the boundary. **Sites** — this frontend deploys
from the same InsForge project.

That's not integration. That's architecture. InsForge didn't support our
product — InsForge IS the product."


## ─── 0:50 – 1:20 │ LIVE DEMO ───

[tab: console — click Run Protected Sweep]

"Let me show you it running. Three fragments on the left — solo risks
under 3%. Noise. Nobody can act alone. Click sweep."

"InsForge Postgres creates the run. State machine kicks in — draft to
awaiting parties. Dispatch fires. Party agents go ready. Protected match
running — real cryptography, ECDH-PSI. InsForge edge functions verify
every signed callback. HMAC check. Timestamp check. Nonce consumed."

"Campaign crystallizes. 4 shared signatures. 99.98% collective risk. And
that zero? InsForge's database trigger has kept it at zero since day one."

"Now human approval. InsForge's state machine enforces it. Nothing
auto-executes. Receipt sealed in InsForge storage. Audit trail — immutable.

The entire workflow ran through InsForge. Every step. Every check. Every
record."


## ─── 1:20 – 1:50 │ THE THESIS ───

[tab: sponsor]

"This is our thesis statement. You've seen it before — I want you to
really read it now.

Phylax is built natively on InsForge. InsForge creates the trust
boundaries. Hosts the compute. Enforces access controls. Persists the
decision ledger. Streams the incident response. Stores artifacts. Deploys
the control plane. SecretFlow performs the private math — InsForge makes
that math a usable, trusted, deployable product.

Without InsForge — this is a crypto demo you run in a terminal. With
InsForge — this is something a bank compliance officer logs into. InsForge
took our protocol and turned it into a company."


## ─── 1:50 – 2:00 │ THE CLOSE ───

[tab: landing]

"InsForge team — we didn't build on InsForge. We built because of
InsForge. Every security guarantee we make — RLS, state machine, HMAC,
nonce, audit ledger, receipt verification — every single one of them
flows through an InsForge primitive. You can't remove InsForge from
Phylax without removing Phylax.

Thank you for building the platform that made this possible."


## ═══ CHEAT SHEET ═══

Tabs:  Landing → Architecture → Console → Sponsor → Landing

8 products to hit:  Auth · Postgres · Edge Fns · Realtime ·
Storage · Compute · Branching · Sites

Remember:
- "InsForge IS the product" (not "supports" or "integrates")
- "Without InsForge — crypto demo. With InsForge — a company."
- "You can't remove InsForge from Phylax without removing Phylax."
