# PHYLAX — Bay Builders Demo Script
# Target: Best Use of InsForge  |  2 min 30 sec


## ═══ SETUP ═══

Open these tabs before you start:
- `/` (landing)
- `/architecture`
- `/console` 
- `/sponsor`
- Run the server: `npm run dev`

---

## 0:00 – 0:20 │ THE HOOK │ Landing page

"Scam rings win because platforms can't talk to each other.

A bank sees a payout spike. Point eight percent risk. Noise.
A marketplace sees a shady seller. Point eight percent risk. Noise.
A messenger sees a link burst. Two point eight percent risk. Noise.

Three platforms, three fragments — none can act alone.

And they can't pool the raw data. It's illegal. It'd be a privacy disaster.

So the ring wins. Every time.

We built something that changes that. It's called Phylax."

---

## 0:20 – 0:50 │ HOW IT WORKS │ Architecture page

"Here's the architecture.

Three partners — FinTrust, SwiftCart, PingLine — each keeps their raw data inside their own walls. Row-level security. Their stuff, their control.

Between them and the neutral plane? A trust membrane.

Nothing raw crosses. Only opaque commitments and hashes. That zero in the middle — that's the number of raw records we've ever centralized. It's sealed. It's enforced by a database trigger. It will never move.

The neutral plane — this whole thing — that's **InsForge**.

Not a database we plugged in. InsForge IS the control plane."

---

## 0:50 – 1:15 │ INSFORGE FEATURE MAP │ Same page, scroll

"We use eight InsForge products. Here's what they do for us:

**Auth + RLS.** Six roles. A FinTrust user cannot read SwiftCart's data. Not hidden in the frontend — enforced at the database row level.

**Postgres.** Our state machine — draft to receipted — lives in InsForge Postgres. You can't skip a step, even as admin. The trigger won't let you.

**Edge Functions.** Eight functions, that's our entire API. Every callback from the compute layer is HMAC-signed, timestamp-verified, AND checked against a nonce ledger. You can't replay an attack here.

**Realtime.** Live incident feed, gated by RLS. InsForge streams only safe metadata.

**Storage.** Private artifacts bucket. Signed receipts, model artifacts. The database only stores pointers — never evidence.

**Custom Compute.** Dockerized SecretFlow doing the private math. InsForge hosts it.

**Backend Branching.** Any schema change goes through a security branch first.

**Sites.** This whole frontend — deployed on InsForge.

We didn't integrate with InsForge. Our product IS InsForge spread across eight primitives."

---

## 1:15 – 1:50 │ LIVE DEMO │ Console page

"Let me show you it running.

[Click: Run Protected Sweep]

While this runs — watch the state machine. InsForge Postgres moves the run from draft to awaiting_parties to running. Every transition enforced. Every step on an append-only audit ledger.

The real cryptography happens now — ECDH private-set-intersection across three parties. SecretFlow does the math. But InsForge is the platform that makes it a product.

The coordinator only sees the intersection. Non-matching tokens never leave their org. And every callback into the control plane passes through our edge functions — HMAC verified, nonce consumed, replay impossible.

There it is. Four shared signatures. Three platforms. Ninety-nine point nine eight percent collective risk — versus sub-three percent solo. A proven campaign. And raw records shared? Still zero."

---

## 1:50 – 2:15 │ THE THESIS │ Sponsor page

"Read this line. This is the whole pitch.

Phylax is built natively on InsForge. InsForge creates the trust boundaries. Hosts the compute. Enforces access controls. Persists the ledger. Streams the incident response. Stores artifacts. Deploys the frontend.

SecretFlow does the private math. InsForge makes that math a usable, trusted, deployable product.

Without InsForge, this is a crypto whitepaper. With InsForge, banks and platforms can actually run this. InsForge is not a backend we added afterwards — it's the reason this works at all."

---

## 2:15 – 2:30 │ THE CLOSE │ Landing page

"To the InsForge team — we didn't name-drop you. Every security boundary in Phylax is an InsForge policy. Every incident runs through an InsForge state machine. Every receipt lives in an InsForge bucket.

We're competing for Best Use of InsForge because our product doesn't work without it. Literally.

Phylax. Prove the campaign. Share nothing. Built on InsForge."

---

## ═══ CHEAT SHEET ═══

**Tabs:** `/` → `/architecture` → `/console` → `/sponsor` → `/`

**Before stage:**
- Run `npm run dev`
- Pre-load all 4 tabs
- Test sweep once

**8 InsForge mentions checklist:**
- Auth + RLS
- Postgres (state machine, trigger)
- Edge Functions (HMAC, nonce)
- Realtime (RLS-gated)
- Storage (pointers only)
- Custom Compute (Docker)
- Backend Branching
- Sites (deploy)

**Key phrases to remember:**
- "The product IS InsForge"
- "We didn't integrate — the product IS InsForge spread across eight primitives"
- "Without InsForge, this is a crypto whitepaper"
- "InsForge makes that math a product"
