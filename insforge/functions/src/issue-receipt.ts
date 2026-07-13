// PHYLAX · issue-receipt
// Seals the run into an immutable, signed incident receipt: input commitments,
// algorithm + model version, the derived score, the human decisions + approvers,
// timestamp, and a result hash. Stored in private Storage; hash + signature land
// on the run. Advances actioned -> receipted.
import {
  admin, currentUser, memberships, getRun, env, canonical, sha256Hex, hmacHex,
  insertRows, updateWhere, json, fail, handle,
} from "../_shared/core.ts";

const BUCKET = "phylax-artifacts";

export default (req: Request) => handle(req, async (req) => {
  const user = await currentUser(req);
  if (!user) return fail("unauthorized", "authentication required", 401);

  const db = admin();
  const mems = await memberships(db, user.id);
  const control = mems.find((m) => m.is_control && ["operator", "platform_admin", "auditor"].includes(m.role));
  if (!control) return fail("forbidden", "only a Phylax operator/auditor may issue receipts", 403);

  const body = await req.json().catch(() => ({}));
  const runId = body?.runId;
  if (!runId) return fail("bad_request", "runId is required", 400);

  const run = await getRun(db, runId);
  if (!run) return fail("not_found", "run not found", 404);
  if (run.status !== "actioned") return fail("bad_state", `receipt requires status 'actioned' (got '${run.status}')`, 409);

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
  const cluster = clusters?.[0] ?? {};
  const features = Object.fromEntries((findings ?? []).map((f: any) => [f.feature_key, f.feature_value]));

  // input-commitments root ties the receipt to the exact committed inputs for THIS run
  const batchIds = (batches ?? []).map((b: any) => b.id);
  let runCommitments: string[] = [];
  if (batchIds.length) {
    const { data: commitments } = await db.database.from("signal_commitments").select("commitment").in("batch_id", batchIds);
    runCommitments = (commitments ?? []).map((c: any) => c.commitment).sort();
  }
  const commitmentsRoot = "sha256:" + await sha256Hex(canonical(runCommitments));

  const decisionList = (decisions ?? []).map((d: any) => ({
    org: slugOf.get(d.org_id), decision: d.decision, role: d.decided_by_role, at: d.created_at,
  }));
  const actionList = (actions ?? []).map((a: any) => ({
    target: slugOf.get(a.target_org_id), actionType: a.action_type, status: a.status,
  }));

  const receipt = {
    kind: "phylax.incident.receipt",
    version: "1.0",
    runId,
    opaqueCampaignId: cluster.opaque_campaign_id ?? null,
    signatureHash: cluster.signature_hash ?? null,
    cardinality: cluster.cardinality ?? null,
    partyCount: cluster.party_count ?? null,
    protocol: run.protocol,
    protocolVersion: run.protocol_version,
    model: model?.[0] ?? null,
    riskScore: run.risk_score,
    confidence: run.confidence,
    features,
    inputCommitmentsRoot: commitmentsRoot,
    inputCommitmentCount: runCommitments.length,
    actions: actionList,
    decisions: decisionList,
    rawRecordsShared: 0,
    issuedBy: `user:${user.id}`,
    issuedAt: new Date().toISOString(),
  };

  const canonicalReceipt = canonical(receipt);
  const receiptHash = "sha256:" + await sha256Hex(canonicalReceipt);
  const receiptSignature = await hmacHex(env("RECEIPT_SIGNING_KEY"), canonicalReceipt);

  // persist to private Storage (best-effort); the hash + signature on the run are
  // authoritative regardless of storage availability.
  const key = `runs/${runId}/receipt.json`;
  let stored = false;
  try {
    const blob = new Blob([JSON.stringify({ receipt, receiptHash, receiptSignature }, null, 2)],
      { type: "application/json" });
    const { error } = await (db as any).storage.from(BUCKET).upload(key, blob);
    stored = !error;
  } catch { stored = false; }

  await insertRows(db, "run_artifacts", [{
    run_id: runId, org_id: null, kind: "receipt", storage_bucket: BUCKET,
    storage_key: key, checksum: receiptHash, size_bytes: canonicalReceipt.length,
  }]);

  await updateWhere(db, "detection_runs", {
    status: "receipted", receipt_hash: receiptHash,
    receipt_signature: receiptSignature, receipt_issued_at: new Date().toISOString(),
  }, { id: runId });

  return json({ ok: true, runId, receiptHash, receiptSignature, stored, receipt }, 201);
});
