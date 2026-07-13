// PHYLAX · demo-sweep (hosted)
// Anon-callable: runs the REAL protected computation (DDH-PSI + secure aggregation
// + trained risk model, in psi_core) server-side and drives the full state machine
// as the seeded demo operator. This is the InsForge-hosted equivalent of the local
// coordinator — no LLM, no fake timer; the modular exponentiations are the protocol.
import {
  admin, env, orgIndex, insertRows, updateWhere, demoActor, canonical, sha256Hex, json, fail, handle,
} from "../_shared/core.ts";
import { computeSweep } from "../_shared/psi_core.js";

export default (req: Request) => handle(req, async () => {
  const db = admin();
  const JOINT = env("PHYLAX_JOINT_SECRET", "demo-consortium-shared-secret");

  const op = await demoActor(db, "phylax", ["operator", "platform_admin"]);
  if (!op) return fail("no_operator", "demo operator is not seeded (run seed:users)", 500);
  const idx = await orgIndex(db);
  const { data: models } = await db.database.from("model_versions").select("id").eq("active", true).limit(1);

  // draft -> awaiting_parties
  const [run] = await insertRows(db, "detection_runs", [{
    created_by_org: op.orgId, created_by_user: op.userId, status: "draft", model_version_id: models?.[0]?.id ?? null,
  }]);
  const partners = idx.all.filter((o: any) => !o.is_control);
  await insertRows(db, "run_participants", partners.map((o: any) => ({ run_id: run.id, org_id: o.id, status: "invited" })));
  await updateWhere(db, "detection_runs", { status: "awaiting_parties" }, { id: run.id });

  // ---- the real protected computation ----
  const c = computeSweep(JOINT);

  // parties_ready -> running
  for (const p of c.parties) {
    const org: any = idx.bySlug.get(p.org);
    const [batch] = await insertRows(db, "signal_batches", [{
      org_id: org.id, run_id: run.id, label: `${p.modality} signals (${p.blurb})`, signal_count: p.signal_count,
    }]);
    await insertRows(db, "signal_commitments", p.commitments.map((cm: any) => ({
      batch_id: batch.id, org_id: org.id, commitment: cm.commitment, algo: cm.algo, key_ref: cm.key_ref,
    })));
    await updateWhere(db, "run_participants", { status: "ready", ready_at: new Date().toISOString() }, { run_id: run.id, org_id: org.id });
  }
  await updateWhere(db, "detection_runs", { status: "running" }, { id: run.id });

  // protected_match
  await insertRows(db, "campaign_clusters", [{
    run_id: run.id, opaque_campaign_id: c.opaque_campaign_id, signature_hash: c.signature_hash,
    cardinality: c.cardinality, party_count: c.party_count,
  }]);
  await updateWhere(db, "detection_runs", { status: "protected_match" }, { id: run.id });
  await insertRows(db, "audit_events", [{
    run_id: run.id, actor: "worker:edge-coordinator", event_type: "protected_match.completed", phase: "protected_match",
    payload: { backend: c.backend, cardinality: c.cardinality, opaque_campaign_id: c.opaque_campaign_id }, result_hash: c.signature_hash,
  }]);

  // risk_scored
  const { data: clusters } = await db.database.from("campaign_clusters").select("id").eq("run_id", run.id).limit(1);
  await insertRows(db, "permitted_findings", Object.entries(c.features).map(([k, v]) => ({
    run_id: run.id, cluster_id: clusters?.[0]?.id ?? null, feature_key: k, feature_value: Number(v),
  })));
  await updateWhere(db, "detection_runs", { status: "risk_scored", risk_score: c.risk_score, confidence: c.confidence }, { id: run.id });
  await insertRows(db, "audit_events", [{
    run_id: run.id, actor: "worker:edge-coordinator", event_type: "risk.scored", phase: "risk_scored",
    payload: { model: c.model_name, version: c.model_version, contributions: c.contributions, solo_scores: c.solo_scores },
    result_hash: "sha256:" + await sha256Hex(canonical(c.features)),
  }]);

  // actions -> awaiting_approval
  if (c.recommended_actions.length) {
    for (const a of c.recommended_actions) {
      const org: any = idx.bySlug.get(a.target_org);
      await insertRows(db, "action_requests", [{
        run_id: run.id, target_org_id: org.id, action_type: a.action_type, rationale: a.rationale, status: "requested",
      }]);
    }
    await updateWhere(db, "detection_runs", { status: "awaiting_approval" }, { id: run.id });
  } else {
    await updateWhere(db, "detection_runs", { status: "cancelled", status_reason: "risk below action threshold" }, { id: run.id });
  }

  return json({ runId: run.id, summary: c, parties: c.parties }, 201);
});
