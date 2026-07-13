// PHYLAX · dispatch-party-run
// Signals the protected-compute coordinator to begin. In production this POSTs to
// the InsForge Custom Compute coordinator service; in the demo the local party
// host performs the run and calls back into receive-worker-callback. This handler
// only authorizes the caller, records the dispatch in the audit ledger, and hands
// back the run context — it does NOT advance state (the parties_ready callback does).
import { admin, currentUser, memberships, getRun, insertRows, json, fail, handle } from "../_shared/core.ts";

export default (req: Request) => handle(req, async (req) => {
  const user = await currentUser(req);
  if (!user) return fail("unauthorized", "authentication required", 401);

  const db = admin();
  const mems = await memberships(db, user.id);
  const control = mems.find((m) => m.is_control && ["operator", "platform_admin"].includes(m.role));
  if (!control) return fail("forbidden", "only a Phylax operator may dispatch a run", 403);

  const body = await req.json().catch(() => ({}));
  const runId = body?.runId;
  if (!runId) return fail("bad_request", "runId is required", 400);

  const run = await getRun(db, runId);
  if (!run) return fail("not_found", "run not found", 404);
  if (run.status !== "awaiting_parties") {
    return fail("bad_state", `cannot dispatch a run in status '${run.status}'`, 409);
  }

  await insertRows(db, "audit_events", [{
    run_id: runId, org_id: control.org_id, actor: `user:${user.id}`,
    event_type: "run.dispatched", phase: "awaiting_parties",
    payload: { coordinator: "phylax-coordinator", protocol: run.protocol },
  }]);

  return json({ runId, status: run.status, dispatched: true, protocol: run.protocol });
});
