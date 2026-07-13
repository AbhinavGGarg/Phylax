// PHYLAX · request-action
// Records a proportionate, human-approvable intervention targeting one org. This
// is never an accusation and never auto-executes. (The risk_scored callback also
// creates these automatically; this is the manual operator path.)
import {
  admin, currentUser, memberships, getRun, orgIndex, insertRows, updateWhere,
  json, fail, handle,
} from "../_shared/core.ts";

const ALLOWED = ["hold_payout", "quarantine_listing", "warn_recipients", "monitor"];

export default (req: Request) => handle(req, async (req) => {
  const user = await currentUser(req);
  if (!user) return fail("unauthorized", "authentication required", 401);

  const db = admin();
  const mems = await memberships(db, user.id);
  const control = mems.find((m) => m.is_control && ["operator", "platform_admin"].includes(m.role));
  if (!control) return fail("forbidden", "only a Phylax operator may request actions", 403);

  const body = await req.json().catch(() => ({}));
  const { runId, targetOrgSlug, actionType, rationale } = body ?? {};
  if (!runId || !targetOrgSlug || !actionType) {
    return fail("bad_request", "runId, targetOrgSlug, actionType are required", 400);
  }
  if (!ALLOWED.includes(actionType)) return fail("bad_request", `invalid actionType '${actionType}'`, 400);

  const run = await getRun(db, runId);
  if (!run) return fail("not_found", "run not found", 404);

  const idx = await orgIndex(db);
  const target = idx.bySlug.get(targetOrgSlug) as any;
  if (!target) return fail("unknown_org", `unknown org '${targetOrgSlug}'`, 400);

  const [action] = await insertRows(db, "action_requests", [{
    run_id: runId, target_org_id: target.id, action_type: actionType,
    rationale: rationale ?? `Proportionate containment for run ${runId}`, status: "requested",
    requested_by: `user:${user.id}`,
  }]);

  // if the run is at risk_scored, move it into approval
  if (run.status === "risk_scored") {
    await updateWhere(db, "detection_runs", { status: "awaiting_approval" }, { id: runId });
  }

  return json({ ok: true, actionRequestId: action.id, target: targetOrgSlug, actionType }, 201);
});
