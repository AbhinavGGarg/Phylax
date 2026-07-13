// PHYLAX · server-enforced guards (live InsForge).
//   • state machine rejects illegal transitions
//   • the raw_records_shared=0 invariant is a hard DB constraint
//   • ledgers are append-only
//   • receive-worker-callback rejects bad signatures, forbidden fields, stale
//     timestamps, illegal states, and replays
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { cfg, admin, signIn, invoke } from "../../control-plane/orchestrator.mjs";
import { signEnvelope } from "./_util.mjs";

let runId;
before(async () => {
  const token = await signIn("operator@phylax.demo");
  const r = await invoke("create-detection-run", { token, body: {} });
  runId = r.body.runId;                       // now in awaiting_parties
});

test("state machine rejects an illegal transition (awaiting_parties -> receipted)", async () => {
  const { error } = await admin.database.from("detection_runs").update({ status: "receipted" }).eq("id", runId).select();
  assert.ok(error, "DB trigger should reject the illegal jump");
});

test("raw_records_shared must remain 0 (hard invariant)", async () => {
  const { error } = await admin.database.from("detection_runs").update({ raw_records_shared: 7 }).eq("id", runId).select();
  assert.ok(error, "DB trigger should reject raw_records_shared != 0");
});

test("audit_events are append-only (update + delete blocked)", async () => {
  const { data: rows } = await admin.database.from("audit_events").select("id").eq("run_id", runId).limit(1);
  assert.ok(rows?.length, "run should have at least one audit event");
  const id = rows[0].id;
  const upd = await admin.database.from("audit_events").update({ actor: "tamper" }).eq("id", id).select();
  assert.ok(upd.error, "audit update should be blocked");
  const del = await admin.database.from("audit_events").delete().eq("id", id).select();
  assert.ok(del.error, "audit delete should be blocked");
});

test("callback with a bad signature is rejected (401)", async () => {
  const { signed } = signEnvelope(cfg.workerSecret, { runId, phase: "parties_ready", body: { parties: [] } });
  const r = await invoke("receive-worker-callback", { token: cfg.anonKey, body: { signed, sig: "deadbeef" } });
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, "bad_signature");
});

test("callback carrying a forbidden raw field is rejected (422)", async () => {
  const env = signEnvelope(cfg.workerSecret, { runId, phase: "parties_ready", body: { token: "0xRAW", parties: [] } });
  const r = await invoke("receive-worker-callback", { token: cfg.anonKey, body: env });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.code, "forbidden_field");
});

test("stale callback (old timestamp) is rejected (401)", async () => {
  const env = signEnvelope(cfg.workerSecret, { runId, phase: "parties_ready", body: { parties: [] }, ts: 1000000000 });
  const r = await invoke("receive-worker-callback", { token: cfg.anonKey, body: env });
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, "stale_callback");
});

test("callback for the wrong state is rejected (409)", async () => {
  // protected_match is illegal while the run is still awaiting_parties
  const env = signEnvelope(cfg.workerSecret, { runId, phase: "protected_match",
    body: { opaque_campaign_id: "x", signature_hash: "y", cardinality: 1, party_count: 3 } });
  const r = await invoke("receive-worker-callback", { token: cfg.anonKey, body: env });
  assert.equal(r.status, 409);
});

test("a replayed callback nonce is rejected (409)", async () => {
  const env = signEnvelope(cfg.workerSecret, { runId, phase: "parties_ready", body: { parties: [] } });
  const first = await invoke("receive-worker-callback", { token: cfg.anonKey, body: env });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const second = await invoke("receive-worker-callback", { token: cfg.anonKey, body: env });
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, "replay");
});
