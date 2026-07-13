// PHYLAX · submit-signal-manifest
// A partner analyst registers their batch of local signals for a run: metadata +
// hiding commitments only (never raw signals). The org is derived from the caller's
// membership, so a FinTrust user can only ever submit as FinTrust.
import {
  admin, currentUser, memberships, getRun, insertRows, updateWhere,
  assertNoRawFields, json, fail, handle,
} from "../_shared/core.ts";

export default (req: Request) => handle(req, async (req) => {
  const user = await currentUser(req);
  if (!user) return fail("unauthorized", "authentication required", 401);

  const db = admin();
  const mems = await memberships(db, user.id);
  const body = await req.json().catch(() => ({}));

  // choose the caller's partner org (optionally the one named, if they belong to it)
  const partnerMems = mems.filter((m) => !m.is_control);
  const chosen = body?.orgSlug
    ? partnerMems.find((m) => m.slug === body.orgSlug)
    : partnerMems[0];
  if (!chosen) return fail("forbidden", "caller is not a member of a partner organization", 403);
  if (!["analyst", "operator", "partner_admin"].includes(chosen.role)) {
    return fail("forbidden", `role '${chosen.role}' may not submit manifests`, 403);
  }

  const runId = body?.runId;
  if (!runId) return fail("bad_request", "runId is required", 400);
  const run = await getRun(db, runId);
  if (!run) return fail("not_found", "run not found", 404);

  const commitments = Array.isArray(body?.commitments) ? body.commitments : [];
  assertNoRawFields({ commitments });

  const [batch] = await insertRows(db, "signal_batches", [{
    org_id: chosen.org_id, run_id: runId,
    label: typeof body?.label === "string" ? body.label : "partner signal batch",
    signal_count: Number(body?.signalCount ?? commitments.length),
    submitted_by: user.id,
  }]);

  if (commitments.length) {
    await insertRows(db, "signal_commitments", commitments.map((c: any) => ({
      batch_id: batch.id, org_id: chosen.org_id, commitment: c.commitment,
      algo: c.algo ?? "oprf-ristretto255+keyed-normalize", key_ref: c.key_ref ?? c.keyRef ?? "unknown",
    })));
  }

  await updateWhere(db, "run_participants", { status: "ready", ready_at: new Date().toISOString() },
    { run_id: runId, org_id: chosen.org_id });

  return json({ ok: true, batchId: batch.id, org: chosen.slug, committed: commitments.length }, 201);
});
