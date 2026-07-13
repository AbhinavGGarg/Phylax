// PHYLAX · approve-action
// A human approver AT THE TARGET ORG accepts or rejects a recommended action. A
// FinTrust approver can only decide FinTrust's actions. When every action on a run
// is decided, the run advances: any approval -> actioned; all rejected -> cancelled.
import {
  admin, currentUser, memberships, env, hmacHex, canonical,
  insertRows, updateWhere, json, fail, handle,
} from "../_shared/core.ts";

export default (req: Request) => handle(req, async (req) => {
  const user = await currentUser(req);
  if (!user) return fail("unauthorized", "authentication required", 401);

  const db = admin();
  const body = await req.json().catch(() => ({}));
  const { actionRequestId, decision, note } = body ?? {};
  if (!actionRequestId || !["approve", "reject"].includes(decision)) {
    return fail("bad_request", "actionRequestId and decision(approve|reject) required", 400);
  }

  const { data: actions } = await db.database.from("action_requests").select("*").eq("id", actionRequestId).limit(1);
  const action = actions?.[0];
  if (!action) return fail("not_found", "action request not found", 404);

  // the caller must approve for the TARGET org, with an approving role
  const mems = await memberships(db, user.id);
  const mem = mems.find((m) => m.org_id === action.target_org_id && ["approver", "partner_admin"].includes(m.role));
  if (!mem) return fail("forbidden", "only an approver at the target org may decide this action", 403);
  if (action.status !== "requested") return fail("bad_state", `action already ${action.status}`, 409);

  const signature = await hmacHex(env("RECEIPT_SIGNING_KEY"),
    canonical({ actionRequestId, decision, decidedBy: user.id, at: new Date().toISOString() }));

  await insertRows(db, "approval_decisions", [{
    action_request_id: actionRequestId, run_id: action.run_id, org_id: action.target_org_id,
    decision, decided_by: user.id, decided_by_role: mem.role, note: note ?? null, signature,
  }]);
  await updateWhere(db, "action_requests",
    { status: decision === "approve" ? "approved" : "rejected" }, { id: actionRequestId });

  // has every action for this run been decided?
  const { data: siblings } = await db.database.from("action_requests").select("status").eq("run_id", action.run_id);
  const pending = (siblings ?? []).filter((a: any) => a.status === "requested").length;
  let runStatus: string | null = null;
  if (pending === 0) {
    const approved = (siblings ?? []).filter((a: any) => a.status === "approved").length;
    if (approved > 0) {
      await updateWhere(db, "detection_runs", { status: "actioned" }, { id: action.run_id });
      // mark approved actions executed
      await db.database.from("action_requests").update({ status: "executed" })
        .eq("run_id", action.run_id).eq("status", "approved");
      runStatus = "actioned";
    } else {
      await updateWhere(db, "detection_runs",
        { status: "cancelled", status_reason: "all recommended actions rejected" }, { id: action.run_id });
      runStatus = "cancelled";
    }
  }

  return json({ ok: true, decision, actionRequestId, runStatus, pending });
});
