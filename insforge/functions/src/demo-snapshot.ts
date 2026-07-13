// PHYLAX · demo-snapshot (hosted)
// The persisted state the hosted console renders for a run.
import { admin, json, fail, handle } from "../_shared/core.ts";

export default (req: Request) => handle(req, async (req) => {
  const body = req.method === "GET" ? Object.fromEntries(new URL(req.url).searchParams) : await req.json().catch(() => ({}));
  const runId = body?.runId;
  if (!runId) return fail("bad_request", "runId is required", 400);
  const db = admin();

  const [run, cluster, findings, actions, decisions, audit, participants, orgs] = await Promise.all([
    db.database.from("detection_runs").select("*").eq("id", runId).limit(1).then((r: any) => r.data?.[0] || null),
    db.database.from("campaign_clusters").select("*").eq("run_id", runId).limit(1).then((r: any) => r.data?.[0] || null),
    db.database.from("permitted_findings").select("feature_key, feature_value").eq("run_id", runId).then((r: any) => r.data || []),
    db.database.from("action_requests").select("*").eq("run_id", runId).then((r: any) => r.data || []),
    db.database.from("approval_decisions").select("*").eq("run_id", runId).then((r: any) => r.data || []),
    db.database.from("audit_events").select("*").eq("run_id", runId).order("created_at", { ascending: true }).then((r: any) => r.data || []),
    db.database.from("run_participants").select("*").eq("run_id", runId).then((r: any) => r.data || []),
    db.database.from("organizations").select("id, slug, name").then((r: any) => r.data || []),
  ]);

  return json({ run, cluster, findings, actions, decisions, audit, participants, orgs });
});
