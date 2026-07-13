// PHYLAX · demo-partner (hosted)
// Reads AS the partner (under that org's RLS) and proves it cannot see other
// orgs' private batches. Signs in the seeded partner admin server-side.
import { admin, env, demoUserClient, json, fail, handle } from "../_shared/core.ts";

const PARTNERS = ["fintrust", "swiftcart", "pingline"];

export default (req: Request) => handle(req, async (req) => {
  const body = req.method === "GET" ? Object.fromEntries(new URL(req.url).searchParams) : await req.json().catch(() => ({}));
  const slug = body?.slug;
  if (!PARTNERS.includes(slug)) return fail("bad_request", "unknown partner", 400);

  const db = admin();
  const { data: orgs } = await db.database.from("organizations").select("id, slug, name");
  const orgId = Object.fromEntries((orgs ?? []).map((o: any) => [o.slug, o.id]));

  const c = await demoUserClient(`admin@${slug}.demo`, env("PHYLAX_DEMO_PASSWORD", "phylax-demo-2026"));
  const [{ data: batches }, { data: commits }, { data: runs }] = await Promise.all([
    c.database.from("signal_batches").select("*").order("created_at", { ascending: false }),
    c.database.from("signal_commitments").select("id"),
    c.database.from("detection_runs").select("id,status,risk_score,created_at").order("created_at", { ascending: false }).limit(6),
  ]);

  const isolation: any[] = [];
  for (const other of PARTNERS.filter((s) => s !== slug)) {
    const { data } = await c.database.from("signal_batches").select("id").eq("org_id", orgId[other]);
    isolation.push({ org: other, name: (orgs ?? []).find((o: any) => o.slug === other)?.name, rowsVisible: (data ?? []).length });
  }

  return json({
    org: slug, name: (orgs ?? []).find((o: any) => o.slug === slug)?.name,
    ownBatches: batches ?? [], ownCommitments: (commits ?? []).length, runs: runs ?? [], isolation,
  });
});
