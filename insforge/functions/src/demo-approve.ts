// PHYLAX · demo-approve (hosted)
// Anon-callable: records the human approval for every pending action on a run, as
// the seeded approver AT EACH TARGET ORG, then advances the run (any approval ->
// actioned; all rejected -> cancelled). Mirrors the guarded approve-action path.
import {
  admin, env, hmacHex, canonical, demoActor, insertRows, updateWhere, json, fail, handle,
} from "../_shared/core.ts";

export default (req: Request) => handle(req, async (req) => {
  const db = admin();
  const body = await req.json().catch(() => ({}));
  const runId = body?.runId;
  const decision = body?.decision === "reject" ? "reject" : "approve";
  if (!runId) return fail("bad_request", "runId is required", 400);

  const { data: actions } = await db.database.from("action_requests").select("*").eq("run_id", runId);
  const { data: orgs } = await db.database.from("organizations").select("id, slug");
  const slugOf = new Map((orgs ?? []).map((o: any) => [o.id, o.slug]));

  const results: any[] = [];
  for (const a of (actions ?? []).filter((x: any) => x.status === "requested")) {
    const slug = slugOf.get(a.target_org_id);
    const approver = await demoActor(db, slug, ["approver", "partner_admin"]);
    if (!approver) { results.push({ target: slug, error: "no approver" }); continue; }
    const signature = await hmacHex(env("RECEIPT_SIGNING_KEY"),
      canonical({ actionRequestId: a.id, decision, decidedBy: approver.userId, at: new Date().toISOString() }));
    await insertRows(db, "approval_decisions", [{
      action_request_id: a.id, run_id: runId, org_id: a.target_org_id, decision,
      decided_by: approver.userId, decided_by_role: approver.role, note: "approved via hosted demo", signature,
    }]);
    await updateWhere(db, "action_requests", { status: decision === "approve" ? "approved" : "rejected" }, { id: a.id });
    results.push({ target: slug, action: a.action_type, decision });
  }

  // advance the run once every action is decided
  const { data: after } = await db.database.from("action_requests").select("status").eq("run_id", runId);
  const pending = (after ?? []).filter((x: any) => x.status === "requested").length;
  let status: string | null = null;
  if (pending === 0) {
    const approved = (after ?? []).filter((x: any) => x.status === "approved").length;
    if (approved > 0) {
      await updateWhere(db, "detection_runs", { status: "actioned" }, { id: runId });
      await db.database.from("action_requests").update({ status: "executed" }).eq("run_id", runId).eq("status", "approved");
      status = "actioned";
    } else {
      await updateWhere(db, "detection_runs", { status: "cancelled", status_reason: "all recommended actions rejected" }, { id: runId });
      status = "cancelled";
    }
  }
  return json({ ok: true, status, results });
});
