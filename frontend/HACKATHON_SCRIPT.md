# ═══════════════════════════════════════════════════════════════════════════
# PHYLAX — BAY BUILDERS HACKATHON DEMO SCRIPT
# Target: Best Use of InsForge  |  Duration: 2:30
# Presenter: [Your Name]
# ═══════════════════════════════════════════════════════════════════════════

## ───── BEFORE YOU START ─────

Open these tabs. Order matters.
  1. http://localhost:8890          (landing)
  2. http://localhost:8890/console  (login & run a test sweep beforehand)
  3. http://localhost:8890/architecture
  4. http://localhost:8890/sponsor

- Server ON:  `npm run dev`
- Browser:    Full screen, hide bookmarks bar
- Font size:  Zoom so text is readable from the projector
- Test sweep: Run it once so you know the timing
- Have the partner tab ready just in case


# ═══════════════════════════════════════════════════════════════════════════
# THE SCRIPT
# ═══════════════════════════════════════════════════════════════════════════


## ───── 0:00 – 0:25 │ LANDING PAGE ─────

[tab: landing  —  http://localhost:8890]

"Hey. I'm [name], and this is Phylax.

Here's the problem. Scam rings are cross-platform. A bank sees a weird
payout. A marketplace sees a shady seller. A messaging app sees a link
burst. Three fragments — each one, taken alone, is basically noise. The
bank can't freeze the account. The marketplace can't ban the seller. The
messenger can't block the link. Nobody has the full picture.

The obvious answer is: pool the data. But you can't. Customer identities,
raw messages, account numbers, watchlists — sharing any of that is
illegal, unsafe, or both. So the ring wins by default.

Phylax changes the game. We prove the campaign together — without sharing
a single raw record."

[scroll down — point to the stats bar]

"Three platforms co-observing. Four shared signatures found. And this
number — zero raw records shared. That's not a UX trick. That zero is a
hard database invariant. It's enforced by trigger. It will never move."

[scroll to the pipeline section]

"Here's how it works. Five steps. Each party computes its own signals
locally — under its own row-level security. Those become opaque
commitments under a jointly-governed key. Then real cryptography — ECDH
private-set-intersection — finds the shared signatures without anyone
ever seeing the raw tokens. A trained model scores the collective risk.
And nothing executes without human approval. Every action needs a person
at the target organization to sign off."


## ───── 0:25 – 0:55 │ ARCHITECTURE PAGE ─────

[tab: architecture  —  http://localhost:8890/architecture]

"This page is where we show our work. And where InsForge becomes the story."

[point to the SVG diagram]

"Three partner spaces on the left — FinTrust, SwiftCart, PingLine. Each
one runs its own compute agent, on its own infrastructure. Their raw data
never leaves.

Then this blue dashed line — the trust membrane. Only opaque commitments,
aggregate findings, and hashes cross this line. Nothing else. Never.

And the right side — the neutral control plane. This is InsForge. This
whole box."

[scroll to InsForge feature map]

"We use eight InsForge products. Not because we wanted to check boxes —
because each one does a job that nothing else could do.

**Auth + RLS.** Six roles across four organizations. And here's the thing —
it's not cosmetic. A FinTrust analyst literally cannot read a SwiftCart
batch. We proved this in tests. InsForge's Row-Level Security enforces it
at the database level. You can't bypass it in the frontend because it's
not a frontend rule.

**Postgres.** Thirteen tables. But the important part is the state machine.
Every detection run goes through a strict sequence — draft, awaiting
parties, running, protected match, risk scored, awaiting approval,
actioned, receipted. You cannot skip a step. You cannot go backwards. Even
with the admin key. That's enforced by a Postgres trigger, and we proved
it in tests by trying to make illegal transitions.

**Edge Functions.** Eight functions form our entire API. The critical one is
receive-worker-callback. When the compute layer finishes the private-set-
intersection, it signs the result and sends it back. Our edge function
verifies the HMAC-SHA256 signature, checks the timestamp is within a
freshness window, and then consumes a single-use nonce from a dedicated
ledger. That nonce can never be used again. Replay attacks are impossible —
not because we think so, because InsForge's database makes it impossible.

**Realtime.** Live incident timeline. Payloads carry only safe metadata. No
signals, no identifiers. And subscription is gated by RLS — only authorized
viewers can subscribe.

**Storage.** Private bucket called phylax-artifacts. Signed receipts, model
artifacts, run reports. The database stores only bucket keys and checksums.
Never the raw contents.

**Custom Compute.** Dockerized SecretFlow party services running Python 3.10.
Each org gets its own container for its share of the PSI and secure
aggregation. InsForge hosts them.

**Backend Branching.** Every schema change — RLS policy, trigger, function —
goes through a security branch first. We can't accidentally break the
trust boundary.

**Sites.** This entire frontend deploys on InsForge Sites from the same
project that governs the data. One control plane, front to back."

[scroll to SecretFlow section]

"Quick note on SecretFlow — it does the privacy-preserving computation.
The ECDH private-set-intersection, the secure aggregation, the federated
risk model. It never touches the neutral plane. But SecretFlow is a
compute library. InsForge is what makes it a deployable, auditable,
production-ready product."


## ───── 0:55 – 1:30 │ CONSOLE — LIVE DEMO ─────

[tab: console  —  http://localhost:8890/console]

"This is the operator console. I'm going to run a live protected sweep."

[point left panel]

"Left side — what each organization sees. FinTrust sees unusual payout
velocity. Solo risk: 0.77%. Below any action threshold. SwiftCart sees
off-platform steering. 0.82%. PingLine sees a link burst. 2.79%. Each
one alone — noise."

[point to the zero counter at the top]

"That zero — raw records shared — never moves. I want you to watch it
through this whole demo."

[click: Run Protected Sweep]

"Here we go. Watch the timeline on the right. Run created. Parties
dispatched. Now three party agents go ready — FinTrust, SwiftCart,
PingLine. The green rings on the graph show their status."

"Protected session established. The encrypted match runs now — ECDH
private-set-intersection across all three parties. The coordinator sees
the intersection only. Non-matching tokens are hidden by the DDH
assumption."

"You can see the graph update live. The node states change. Packets move
across the trust membrane. The sealed zero holds."

"Protected match complete. Campaign proven. Four shared signatures across
three platforms. The crimson arcs appear — these are the coordination
links that were invisible before."

"And here's the score: 99.98% collective risk. Versus under 3% solo. The
model's feature drivers show you why — total events, mean velocity,
temporal alignment. A real logistic regression, not a random number. Not
an LLM."

"Now the state machine moves to awaiting approval. Human required. Nothing
auto-executes. Hold payout. Quarantine listing. Warn recipients. Each
action needs a human at the target org to sign off."

"Receipt issued and verified. The signed receipt is in InsForge's storage
bucket. The audit trail is immutable — append-only ledger, every step
recorded."

"And that zero? Still zero. It's been zero this whole time."


## ───── 1:30 – 2:00 │ SPONSOR PAGE ─────

[tab: sponsor  —  http://localhost:8890/sponsor]

"Let me show you the page we made specifically for the InsForge judges."

[point to the thesis statement]

"This is the thesis. Read it — actually read it.

Phylax is built natively on InsForge. InsForge creates the trust
boundaries between organizations. Hosts the long-running protected-
compute services. Enforces access controls. Persists the auditable
decision ledger. Streams the live incident response. Stores private
artifacts. Deploys the control plane.

SecretFlow performs the privacy-preserving computation. InsForge makes
that computation a usable, trusted product.

That last line is the whole thing. SecretFlow is a math library — an
incredible one. But math doesn't ship. Math doesn't authenticate. Math
doesn't audit. Math doesn't stream. Without InsForge, this project is
a cryptography demo. With InsForge, it's a product that a bank compliance
officer could actually deploy."

[scroll to the table]

"Every InsForge primitive, mapped to a containment function. Auth creates
the trust boundaries. Postgres persists the decision ledger. Edge
Functions drive the workflow. Custom Compute hosts the party agents.
Realtime streams the incident. Storage holds the artifacts. Branching
guards the schema. Sites deploys the surface."

"One platform, one project, one control plane. We didn't wire eight
services together. InsForge IS the stack."

[scroll to hackathon tracks]

"We're submitting for Track 1 — AI SaaS, B2B. Phylax is a subscription
trust-and-safety product for a consortium of banks, marketplaces, and
messaging platforms. It's also compatible with Track 3 — AI Agent Company
— because our party agents run autonomously. And Track 4 — Vertical AI —
because we go deep on financial crime. But the prize we really want is
Best Use of InsForge."


## ───── 2:00 – 2:30 │ CLOSE ─────

[tab: back to landing  —  http://localhost:8890]

"So here's what we built.

A privacy-preserving, real-time collective campaign containment network.
Three platforms prove a coordinated ring exists without sharing customer
identities, raw messages, bank account numbers, watchlists, or embeddings.

We run real cryptography — not a loading spinner. Private set intersection
and secure aggregation execute for real. The risk model is a trained
logistic regression, not a random number, not an LLM. The zero is a hard
database invariant, enforced by trigger.

And it all runs on InsForge. Every security boundary. Every state
transition. Every live event. Every sealed receipt. Every deployed page.

To the InsForge team — we didn't use InsForge as a database. We used it
as the operating system for an AI security company.

Phylax. Prove the campaign. Share nothing. Built on InsForge.

Thank you."


# ═══════════════════════════════════════════════════════════════════════════
# CHEAT SHEET
# ═══════════════════════════════════════════════════════════════════════════

# TAB ORDER:
#   Landing  →  Architecture  →  Console  →  Sponsor  →  Landing

# INSFORGE CHECKLIST (hit all 8):
#   □ Auth + RLS         "enforced at the database row level"
#   □ Postgres           "state machine, trigger-enforced, illegal jumps rejected"
#   □ Edge Functions     "HMAC-SHA256, timestamp window, single-use nonce ledger"
#   □ Realtime           "RLS-gated subscriptions, safe metadata only"
#   □ Storage            "private bucket, pointers + checksums, never raw evidence"
#   □ Custom Compute     "Dockerized SecretFlow, Linux + Python 3.10"
#   □ Backend Branching  "schema-only security branch, can't break the boundary"
#   □ Sites              "frontend deploys from the same project"

# KEY LINES TO MEMORIZE:
#   "The product IS InsForge"
#   "InsForge makes that computation a usable, trusted product"
#   "Without InsForge this is a crypto whitepaper"
#   "That zero is a hard database invariant — enforced by trigger"
#   "We didn't wire eight services together — InsForge IS the stack"
#   "Not because we think so — because InsForge's database makes it impossible"

# IF YOU RUN SHORT ON TIME:
#   - Speed up the InsForge feature map (hit Auth, Postgres, Edge Fns, skip rest)
#   - Skip SecretFlow section entirely
#   - Shorten the console demo by pre-running the sweep and showing the result

# IF YOU HAVE EXTRA TIME:
#   - Show partner page to prove RLS isolation
#   - Show the architecture checklist (what's real vs staged)
#   - Talk about the 26 passing tests
