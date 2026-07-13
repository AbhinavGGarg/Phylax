// PHYLAX · demo-config (hosted)
// Public consortium directory + active model, for the hosted console to bootstrap.
import { admin, json, handle } from "../_shared/core.ts";

export default (req: Request) => handle(req, async () => {
  const db = admin();
  const [{ data: orgs }, { data: models }] = await Promise.all([
    db.database.from("organizations").select("id, slug, name, kind, is_control"),
    db.database.from("model_versions").select("name, version, params_hash").eq("active", true).limit(1),
  ]);
  return json({ orgs: orgs ?? [], model: models?.[0] ?? null, backend: "modp-ddh-1024-edge", actionThreshold: 0.75 });
});
