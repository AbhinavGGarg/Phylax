// PHYLAX · create-detection-run
// A Phylax operator opens a protected sweep. Authorization is derived from the
// authenticated user's control-plane membership — never from client input.
import {
  admin, currentUser, memberships, orgIndex, insertRows, updateWhere,
  json, fail, handle,
} from "../_shared/core.ts";

export default (req: Request) => handle(req, async (req) => {
  const user = await currentUser(req);
  if (!user) return fail("unauthorized", "authentication required", 401);

  const db = admin();
  const mems = await memberships(db, user.id);
  const control = mems.find((m) => m.is_control && ["operator", "platform_admin"].includes(m.role));
  if (!control) return fail("forbidden", "only a Phylax operator may create a run", 403);

  const body = await req.json().catch(() => ({}));
  const policyKey = typeof body?.policyKey === "string" ? body.policyKey : "coordinated_campaign_v1";

  const idx = await orgIndex(db);
  const partners = idx.all.filter((o: any) => !o.is_control);
  const { data: models } = await db.database.from("model_versions").select("id").eq("active", true).limit(1);

  const [run] = await insertRows(db, "detection_runs", [{
    created_by_org: control.org_id,
    created_by_user: user.id,
    status: "draft",
    policy_key: policyKey,
    model_version_id: models?.[0]?.id ?? null,
  }]);

  await insertRows(db, "run_participants", partners.map((o: any) => ({
    run_id: run.id, org_id: o.id, status: "invited",
  })));

  // draft -> awaiting_parties (participants are now invited)
  await updateWhere(db, "detection_runs", { status: "awaiting_parties" }, { id: run.id });

  return json({
    runId: run.id,
    status: "awaiting_parties",
    policyKey,
    participants: partners.map((o: any) => o.slug),
  }, 201);
});
