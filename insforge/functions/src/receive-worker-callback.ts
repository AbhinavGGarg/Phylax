// PHYLAX · receive-worker-callback
// The ONLY endpoint the protected-compute coordinator calls. It is defended by:
//   • HMAC-SHA256 over the exact signed envelope string (WORKER_HMAC_SECRET)
//   • timestamp freshness window (replay window)
//   • single-use nonce ledger (worker_nonces) — hard replay protection
//   • a forbidden-field scan so no raw signal/token/vector can enter the plane
//   • state-machine guards: each phase is only accepted from the legal prior state
// It carries only opaque + aggregate results and advances the run via the DB
// (whose triggers enforce monotonic transitions and publish safe realtime events).
import {
  admin, env, hmacHex, timingSafeEqual, canonical, sha256Hex, assertNoRawFields,
  orgIndex, getRun, insertRows, updateWhere, json, fail, handle, PhylaxError,
} from "../_shared/core.ts";

const WINDOW_S = 300;

export default (req: Request) => handle(req, async (req) => {
  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw.signed !== "string" || typeof raw.sig !== "string") {
    return fail("bad_request", "expected { signed, sig }", 400);
  }

  // 1. verify HMAC over the exact signed string
  const expected = await hmacHex(env("WORKER_HMAC_SECRET"), raw.signed);
  if (!timingSafeEqual(expected, raw.sig)) return fail("bad_signature", "HMAC verification failed", 401);

  // 2. parse envelope + freshness
  let envlp: any;
  try { envlp = JSON.parse(raw.signed); } catch { return fail("bad_request", "signed is not JSON", 400); }
  const { runId, phase, nonce, ts, body } = envlp ?? {};
  if (!runId || !phase || !nonce || typeof ts !== "number" || typeof body !== "object") {
    return fail("bad_request", "malformed envelope", 400);
  }
  if (Math.abs(Date.now() / 1000 - ts) > WINDOW_S) {
    return fail("stale_callback", "timestamp outside replay window", 401);
  }

  // 3. no raw private values may cross into the neutral plane
  assertNoRawFields(body);

  const db = admin();

  // 4. hard replay protection — nonce is single-use
  try {
    await insertRows(db, "worker_nonces", [{ nonce, run_id: runId, phase }]);
  } catch {
    return fail("replay", "callback nonce already used", 409);
  }

  const run = await getRun(db, runId);
  if (!run) return fail("not_found", "run not found", 404);
  const idx = await orgIndex(db);
  const orgBySlug = (slug: string) => {
    const o = idx.bySlug.get(slug);
    if (!o) throw new PhylaxError("unknown_org", `unknown org '${slug}'`, 400);
    return o as any;
  };

  // 5. phase routing (each guarded by the required current status)
  if (phase === "parties_ready") {
    if (run.status !== "awaiting_parties") return fail("bad_state", `parties_ready invalid in '${run.status}'`, 409);
    for (const p of body.parties ?? []) {
      const org = orgBySlug(p.org);
      const [batch] = await insertRows(db, "signal_batches", [{
        org_id: org.id, run_id: runId, label: p.batch?.label ?? "signals",
        signal_count: p.batch?.signal_count ?? 0,
      }]);
      if (Array.isArray(p.commitments) && p.commitments.length) {
        await insertRows(db, "signal_commitments", p.commitments.map((c: any) => ({
          batch_id: batch.id, org_id: org.id, commitment: c.commitment,
          algo: c.algo ?? "oprf-ristretto255+keyed-normalize", key_ref: c.key_ref ?? "unknown",
        })));
      }
      await updateWhere(db, "run_participants", { status: "ready", ready_at: new Date().toISOString() },
        { run_id: runId, org_id: org.id });
    }
    await updateWhere(db, "detection_runs", { status: "running" }, { id: runId });
    return json({ ok: true, phase, status: "running" });
  }

  if (phase === "protected_match") {
    if (run.status !== "running") return fail("bad_state", `protected_match invalid in '${run.status}'`, 409);
    await insertRows(db, "campaign_clusters", [{
      run_id: runId, opaque_campaign_id: body.opaque_campaign_id,
      signature_hash: body.signature_hash, cardinality: body.cardinality, party_count: body.party_count,
    }]);
    await updateWhere(db, "detection_runs", { status: "protected_match" }, { id: runId });
    await insertRows(db, "audit_events", [{
      run_id: runId, actor: "worker:coordinator", event_type: "protected_match.completed",
      phase: "protected_match", elapsed_ms: body.protected_match_ms ?? null,
      payload: { backend: body.backend, cardinality: body.cardinality, opaque_campaign_id: body.opaque_campaign_id },
      result_hash: body.signature_hash,
    }]);
    return json({ ok: true, phase, status: "protected_match", cardinality: body.cardinality });
  }

  if (phase === "risk_scored") {
    if (run.status !== "protected_match") return fail("bad_state", `risk_scored invalid in '${run.status}'`, 409);
    const { data: clusters } = await db.database.from("campaign_clusters").select("id").eq("run_id", runId).limit(1);
    const clusterId = clusters?.[0]?.id ?? null;

    const feats = body.features ?? {};
    await insertRows(db, "permitted_findings", Object.entries(feats).map(([k, v]) => ({
      run_id: runId, cluster_id: clusterId, feature_key: k, feature_value: Number(v),
    })));

    await updateWhere(db, "detection_runs",
      { status: "risk_scored", risk_score: body.risk_score, confidence: body.confidence }, { id: runId });

    await insertRows(db, "audit_events", [{
      run_id: runId, actor: "worker:coordinator", event_type: "risk.scored", phase: "risk_scored",
      payload: {
        model: body.model_name, version: body.model_version, params_hash: body.params_hash,
        contributions: body.contributions, solo_scores: body.solo_scores,
      },
      result_hash: "sha256:" + await sha256Hex(canonical(feats)),
    }]);

    const actions = Array.isArray(body.recommended_actions) ? body.recommended_actions : [];
    if (actions.length) {
      for (const a of actions) {
        const org = orgBySlug(a.target_org);
        await insertRows(db, "action_requests", [{
          run_id: runId, target_org_id: org.id, action_type: a.action_type,
          rationale: a.rationale, status: "requested",
        }]);
      }
      await updateWhere(db, "detection_runs", { status: "awaiting_approval" }, { id: runId });
      return json({ ok: true, phase, status: "awaiting_approval", actions: actions.length });
    }
    await updateWhere(db, "detection_runs",
      { status: "cancelled", status_reason: "risk below action threshold" }, { id: runId });
    return json({ ok: true, phase, status: "cancelled" });
  }

  return fail("bad_phase", `unknown phase '${phase}'`, 400);
});
