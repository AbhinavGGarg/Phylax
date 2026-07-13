// PHYLAX · full live flow (one real protected sweep against InsForge):
//   • RLS tenant isolation — a FinTrust user cannot read SwiftCart's private data
//   • receipt hash + signature verify; a tampered receipt is rejected
//   • realtime payloads carry only safe metadata (no raw fields, rawRecordsShared=0)
//   • orchestration success path reaches 'receipted'
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@insforge/sdk";
import {
  cfg, admin, signIn, invoke, runCoordinator, decideAllActions, issueReceipt, verifyReceipt, runSnapshot,
} from "../../control-plane/orchestrator.mjs";
import { DEMO_PASSWORD } from "../../scripts/_env.mjs";
import { ALLOWED_RT_KEYS, FORBIDDEN_KEYS } from "./_util.mjs";

const RT_EVENTS = ["run.created", "party.ready", "protected_match.started", "protected_match.completed",
  "risk.scored", "run.awaiting_approval", "action.requested", "action.approved", "run.actioned", "receipt.issued"];

const ctx = { runId: null, events: [], orgIds: {}, receipt: null, verify: null, tamper: null, snap: null };

async function clientFor(email) {
  // sign in ON this client so its session drives both DB (RLS) and realtime auth
  const c = createClient({ baseUrl: cfg.baseUrl, anonKey: cfg.anonKey });
  await c.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  return c;
}
function deepForbidden(obj) {
  if (!obj || typeof obj !== "object") return false;
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.has(k.toLowerCase())) return k;
    if (v && typeof v === "object") { const f = deepForbidden(v); if (f) return f; }
  }
  return false;
}

before(async () => {
  const { data: orgs } = await admin.database.from("organizations").select("id, slug");
  ctx.orgIds = Object.fromEntries(orgs.map((o) => [o.slug, o.id]));

  // create + dispatch
  const opTok = await signIn("operator@phylax.demo");
  const created = await invoke("create-detection-run", { token: opTok, body: {} });
  ctx.runId = created.body.runId;

  // subscribe realtime BEFORE the phases fire
  const rt = await clientFor("operator@phylax.demo");
  await rt.realtime.connect();
  for (const ev of RT_EVENTS) rt.realtime.on(ev, (p) => ctx.events.push({ ev, p }));
  await rt.realtime.subscribe(`run:${ctx.runId}`);

  await invoke("dispatch-party-run", { token: opTok, body: { runId: ctx.runId } });

  // real coordinator + relay signed callbacks
  const coord = await runCoordinator(ctx.runId);
  for (const cb of coord.callbacks) {
    const r = await invoke("receive-worker-callback", { token: cfg.anonKey, body: { signed: cb.signed, sig: cb.sig } });
    assert.ok(r.status < 400, `callback ${cb.phase}: ${JSON.stringify(r.body)}`);
  }
  await decideAllActions(ctx.runId, "approve");
  const rec = await issueReceipt(ctx.runId);
  ctx.receipt = rec.body;
  ctx.verify = (await verifyReceipt(ctx.runId, rec.body.receipt)).body;
  ctx.tamper = (await verifyReceipt(ctx.runId, { ...rec.body.receipt, riskScore: 0.01 })).body;
  await new Promise((r) => setTimeout(r, 1800));     // let realtime flush
  ctx.snap = await runSnapshot(ctx.runId);
  try { rt.realtime.disconnect(); } catch { /* */ }
});

test("orchestration reaches 'receipted'", () => {
  assert.equal(ctx.snap.run.status, "receipted");
  assert.equal(ctx.snap.run.raw_records_shared, 0);
  assert.equal(ctx.snap.cluster.cardinality, 4);
});

test("RLS: a FinTrust user cannot read SwiftCart's private batches or commitments", async () => {
  const fin = await clientFor("admin@fintrust.demo");
  const { data: batches } = await fin.database.from("signal_batches").select("*");
  assert.ok((batches || []).length >= 1, "FinTrust should see its own batch");
  assert.ok((batches || []).every((b) => b.org_id === ctx.orgIds.fintrust), "FinTrust must see ONLY its own batches");

  const { data: swc } = await fin.database.from("signal_batches").select("*").eq("org_id", ctx.orgIds.swiftcart);
  assert.equal((swc || []).length, 0, "FinTrust must not read SwiftCart batches even by explicit filter");

  const { data: commits } = await fin.database.from("signal_commitments").select("*");
  assert.ok((commits || []).every((c) => c.org_id === ctx.orgIds.fintrust), "FinTrust must see ONLY its own commitments");
});

test("RLS: a FinTrust participant CAN read the shared run + cluster", async () => {
  const fin = await clientFor("admin@fintrust.demo");
  const { data: run } = await fin.database.from("detection_runs").select("id,status").eq("id", ctx.runId);
  assert.equal((run || []).length, 1, "participant can read the run it is in");
  const { data: cl } = await fin.database.from("campaign_clusters").select("cardinality").eq("run_id", ctx.runId);
  assert.equal((cl || []).length, 1, "participant can read the run's campaign cluster");
});

test("receipt hash + signature verify; tampered receipt is rejected", () => {
  assert.ok(ctx.receipt.receiptHash?.startsWith("sha256:"));
  assert.equal(ctx.verify.valid, true);
  assert.equal(ctx.verify.hashMatches, true);
  assert.equal(ctx.verify.signatureValid, true);
  assert.equal(ctx.tamper.valid, false);
});

test("realtime payloads carry only safe metadata (no raw fields)", () => {
  assert.ok(ctx.events.length >= 4, `expected several realtime events, got ${ctx.events.length}`);
  for (const { ev, p } of ctx.events) {
    const forbidden = deepForbidden(p);
    assert.equal(forbidden, false, `event ${ev} leaked a forbidden field: ${forbidden}`);
    for (const k of Object.keys(p)) {
      assert.ok(ALLOWED_RT_KEYS.has(k), `event ${ev} has unexpected key '${k}'`);
    }
    if ("rawRecordsShared" in p) assert.equal(p.rawRecordsShared, 0);
  }
});

test("the timeline is reproducible from persisted audit state", () => {
  const types = new Set(ctx.snap.audit.map((e) => e.event_type));
  for (const t of ["run.created", "protected_match.completed", "risk.scored"]) {
    assert.ok(types.has(t), `audit ledger missing ${t}`);
  }
});
