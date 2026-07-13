# Phylax — Bay Builders Hackathon submission

**Tagline:** Prove the campaign. Share nothing.

**One-liner:** A privacy-preserving network that lets a bank, a marketplace, and a
messaging platform prove a coordinated scam campaign *together* — using real
cryptography (PSI + secure aggregation) — without centralizing a single raw
customer record, then coordinate the smallest human-approved intervention.

## Theme & tracks

- **Theme — "Build your own AI company":** Phylax is a B2B **trust-&-safety company**.
  Banks / marketplaces / messaging platforms join a *containment consortium* and pay
  to cut fraud losses and collaborate in a regulator-safe way. It is "AI" without a
  chatbot: a federated risk **model**, autonomous party **agents**, and an agentic
  containment **workflow**.
- **Primary track:** Track 1 — AI SaaS / B2B tools.
- **Compatible tracks:** Track 3 — AI Agent Company; Track 4 — Vertical AI (fincrime).
- **Prize target:** ⚙️ **Best Use of InsForge.**

## Why this is built natively on InsForge

> Phylax is built natively on InsForge. InsForge creates the trust boundaries
> between organizations, hosts the long-running protected-compute services,
> enforces access controls, persists the auditable decision ledger, streams the
> live incident response, stores private artifacts, and deploys the control
> plane. Phylax's own privacy-preserving computation runs on that foundation;
> InsForge makes that computation a usable, trusted product.

## What's real

- **Live InsForge control plane** — project `kd6vibk3` (`https://kd6vibk3.us-east.insforge.app`):
  14 tables, RLS on all, a server-enforced monotonic state machine, append-only
  audit ledger, 8 edge functions (all active), Realtime, and a private Storage bucket.
- **Real privacy-preserving computation** — 2048-bit MODP DDH-PSI locally,
  a 1024-bit MODP group on the hosted edge; OPRF-keyed tokenization + additive-
  secret-sharing secure aggregation; a real trained logistic-regression risk model. No LLM anywhere.
- **26 passing tests** — crypto-core proofs + live-InsForge RLS/replay/state-machine/
  receipt/realtime-hygiene tests.
- **Verified demo numbers** — 4 shared signatures, 99.98 % collective risk vs
  <3 % solo, ~6 s protected match, **0 raw records shared**.

## Links

- **▶ Live demo (InsForge Sites): https://kd6vibk3.insforge.site** — the whole app runs on InsForge; the sweep executes real PSI/MPC in an edge function.
- Live control plane (InsForge): `https://kd6vibk3.us-east.insforge.app`
- Repo: `https://github.com/AbhinavGGarg/Phylax`
- Demo script + architecture: `README.md`, https://kd6vibk3.insforge.site/architecture.html

## 90-second demo

See the "90-second demo script" section of `README.md`. Short version: open
`/console`, click **Run Protected Sweep**, watch three weak signals become one
proven campaign across the trust membrane (0 raw shared), approve the
proportionate actions as each target org's approver, issue + verify the signed
receipt, and read the audit timeline.

## Remaining actions requiring the submitter (not automated)

These are intentionally left for you — they create accounts / push to external
services / require your identity:

1. **Register for AWS Builder Loft** — https://events.builder.aws.com/aRP80l
   (bring a government-issued physical ID for venue access).
2. **Push the repo to GitHub** — `github.com/karthikpottabathini1-bot/Phylax`.
   The code is committed-ready; `.env.local` and `.insforge/` are gitignored.
   Suggested: `git init && git add . && git commit -m "Phylax" && git remote add origin <url> && git push -u origin main`.
3. **Submit on Sublet** — https://sublet--saurabhskhire.replit.app/ before the deadline.
4. *(Optional)* **Deploy the frontend to InsForge Sites** — `npx @insforge/cli deployments deploy web`.
5. *(Optional)* **Deploy the party compute services to InsForge Custom Compute** — see `docs/deploy-compute.md`.
