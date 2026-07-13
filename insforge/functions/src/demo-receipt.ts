// PHYLAX · demo-receipt (hosted)
// Anon-callable: seals the actioned run into a signed incident receipt (as the
// demo operator) and stores it. Same receipt body/hash/signature as issue-receipt.
import {
  admin, env, canonical, sha256Hex, hmacHex, getRun, insertRows, updateWhere, json, fail, handle,
} from "../_shared/core.ts";

const BUCKET = "phylax-artifacts";

export default (req: Request) => handle(req, async (req) => {
  const db = admin();
  const body = await req.json().catch(() => ({}));
  const runId = body?.runId;
  if (!runId) return fail("bad_request", "runId is required", 400);

  const run = await getRun(db, runId);
  if (!run) return fail("not_found", "run not found", 404);
  if (run.status !== "actioned") return fail("bad_state", `receipt requires 'actioned' (got '${run.status}')`, 409);

  const [{ data: clusters }, { data: findings }, { data: actions }, { data: decisions },
    { data: batches }, { data: model }, { data: orgs }] = await Promise.all([
    db.database.from("campaign_clusters").select("*").eq("run_id", runId).limit(1),
    db.database.from("permitted_findings").select("feature_key, feature_value").eq("run_id", runId),
    db.database.from("action_requests").select("*").eq("run_id", runId),
    db.database.from("approval_decisions").select("*").eq("run_id", runId),
    db.database.from("signal_batches").select("id").eq("run_id", runId),
    db.database.from("model_versions").select("name, version, params_hash").eq("id", run.model_version_id).limit(1),
    db.database.from("organizations").select("id, slug"),
  ]);

  const slugOf = new Map((orgs ?? []).map((o: any) => [o.id, o.slug]));
  const cluster: any = clusters?.[0] ?? {};
  const features = Object.fromEntries((findings ?? []).map((f: any) => [f.feature_key, f.feature_value]));

  const batchIds = (batches ?? []).map((b: any) => b.id);
  let runCommitments: string[] = [];
  if (batchIds.length) {
    const { data: cm } = await db.database.from("signal_commitments").select("commitment").in("batch_id", batchIds);
    runCommitments = (cm ?? []).map((c: any) => c.commitment).sort();
  }

  const receipt = {
    kind: "phylax.incident.receipt", version: "1.0", runId,
    opaqueCampaignId: cluster.opaque_campaign_id ?? null, signatureHash: cluster.signature_hash ?? null,
    cardinality: cluster.cardinality ?? null, partyCount: cluster.party_count ?? null,
    protocol: run.protocol, protocolVersion: run.protocol_version, model: model?.[0] ?? null,
    riskScore: run.risk_score, confidence: run.confidence, features,
    inputCommitmentsRoot: "sha256:" + await sha256Hex(canonical(runCommitments)), inputCommitmentCount: runCommitments.length,
    actions: (actions ?? []).map((a: any) => ({ target: slugOf.get(a.target_org_id), actionType: a.action_type, status: a.status })),
    decisions: (decisions ?? []).map((d: any) => ({ org: slugOf.get(d.org_id), decision: d.decision, role: d.decided_by_role, at: d.created_at })),
    rawRecordsShared: 0, issuedBy: "demo-operator", issuedAt: new Date().toISOString(),
  };

  const canonicalReceipt = canonical(receipt);
  const receiptHash = "sha256:" + await sha256Hex(canonicalReceipt);
  const receiptSignature = await hmacHex(env("RECEIPT_SIGNING_KEY"), canonicalReceipt);

  const key = `runs/${runId}/receipt.json`;
  let stored = false;
  try {
    const blob = new Blob([JSON.stringify({ receipt, receiptHash, receiptSignature }, null, 2)], { type: "application/json" });
    const { error } = await (db as any).storage.from(BUCKET).upload(key, blob);
    stored = !error;
  } catch { stored = false; }

  await insertRows(db, "run_artifacts", [{
    run_id: runId, org_id: null, kind: "receipt", storage_bucket: BUCKET, storage_key: key,
    checksum: receiptHash, size_bytes: canonicalReceipt.length,
  }]);
  await updateWhere(db, "detection_runs", {
    status: "receipted", receipt_hash: receiptHash, receipt_signature: receiptSignature, receipt_issued_at: new Date().toISOString(),
  }, { id: runId });

  return json({ ok: true, runId, receiptHash, receiptSignature, stored, receipt }, 201);
});
