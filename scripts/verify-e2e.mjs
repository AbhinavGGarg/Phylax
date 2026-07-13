#!/usr/bin/env node
// End-to-end proof against the LIVE InsForge control plane + real coordinator.
// Runs the exact demo path and asserts the invariants that make Phylax real.
import {
  runSweep, decideAllActions, issueReceipt, verifyReceipt, runSnapshot,
} from "../control-plane/orchestrator.mjs";

const A = (cond, msg) => { if (!cond) { console.error("✗ FAIL:", msg); process.exit(1); } console.log("  ✓", msg); };

console.log("── Phylax E2E (live InsForge + real PSI/MPC) ──\n");

console.log("1. Protected sweep …");
const { runId, summary, parties } = await runSweep({}, (p) => console.log(`   → ${p.phase}${p.runId ? " " + p.runId.slice(0, 8) : ""}`));
console.log(`\n   collective risk ${summary.risk_score}  ·  cardinality ${summary.cardinality}  ·  backend ${summary.backend}`);
console.log("   solo:", parties.map((p) => `${p.org} ${p.solo_risk}`).join("  "));

A(summary.cardinality === 4, "PSI found the 4 shared campaign signatures");
A(summary.risk_score >= 0.75, `collective risk ${summary.risk_score} clears action threshold`);
A(parties.every((p) => p.solo_risk < 0.5), "every partner's SOLO risk is below threshold (individually weak)");
A(summary.privacy.coordinator_saw_noise_tokens === 0, "0 non-matching tokens leaked to the coordinator");
A(summary.raw_records_shared === 0, "0 raw records shared centrally");

console.log("\n2. State after scoring …");
let snap = await runSnapshot(runId);
A(snap.run.status === "awaiting_approval", `run is awaiting_approval (got ${snap.run.status})`);
A(snap.run.raw_records_shared === 0, "detection_runs.raw_records_shared invariant holds (0)");
A(snap.cluster && snap.cluster.cardinality === 4, "campaign_cluster persisted with cardinality 4");
A(snap.findings.length >= 5, `${snap.findings.length} permitted aggregate findings persisted`);
A(snap.actions.length === 3, "3 proportionate actions requested");

console.log("\n3. Human approvals (each by an approver at the target org) …");
const decisions = await decideAllActions(runId, "approve");
decisions.forEach((d) => A(d.status < 400, `${d.target} approved: ${d.action}`));
snap = await runSnapshot(runId);
A(snap.run.status === "actioned", `run advanced to actioned (got ${snap.run.status})`);

console.log("\n4. Issue + verify signed receipt …");
const rec = await issueReceipt(runId);
A(rec.status < 400 && rec.body.receiptHash, "receipt issued with hash + signature");
snap = await runSnapshot(runId);
A(snap.run.status === "receipted", "run advanced to receipted (terminal)");
const ver = await verifyReceipt(runId, rec.body.receipt);
A(ver.body.valid === true, "verify-receipt confirms hash + signature valid");

// tamper check
const tampered = { ...rec.body.receipt, riskScore: 0.01 };
const bad = await verifyReceipt(runId, tampered);
A(bad.body.valid === false, "tampered receipt is rejected");

console.log("\n5. Audit ledger …");
A(snap.audit.some((e) => e.event_type === "run.created"), "ledger has run.created");
A(snap.audit.some((e) => e.event_type === "protected_match.completed"), "ledger has protected_match.completed");
A(snap.audit.some((e) => e.event_type === "risk.scored"), "ledger has risk.scored");

console.log(`\n✅ E2E PASSED — run ${runId}`);
console.log(`   The campaign was discovered collectively; raw customer data was never centralized.`);
process.exit(0);
