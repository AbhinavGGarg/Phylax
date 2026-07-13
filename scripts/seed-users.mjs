#!/usr/bin/env node
// Seed demo users + org memberships (explicit test/demo setup). Idempotent:
// re-running signs existing users in and upserts their membership row.
import { createClient, createAdminClient } from "@insforge/sdk";
import { loadEnv, DEMO_PASSWORD, DEMO_USERS } from "./_env.mjs";

const cfg = loadEnv();
if (!cfg.baseUrl || !cfg.apiKey || !cfg.anonKey) {
  console.error("Missing INSFORGE_BASE_URL / API_KEY / INSFORGE_ANON_KEY in .env.local");
  process.exit(1);
}

const auth = createClient({ baseUrl: cfg.baseUrl, anonKey: cfg.anonKey });
const admin = createAdminClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey });

async function ensureUser(email, password) {
  let res = await auth.auth.signUp({ email, password });
  let user = res?.data?.user;
  if (!user) {
    const si = await auth.auth.signInWithPassword({ email, password });
    user = si?.data?.user;
    if (!user) throw new Error(`could not create or sign in ${email}: ${JSON.stringify(res?.error || si?.error)}`);
  }
  return user.id;
}

async function main() {
  const { data: orgs } = await admin.database.from("organizations").select("id, slug");
  const orgId = Object.fromEntries((orgs || []).map((o) => [o.slug, o.id]));

  for (const u of DEMO_USERS) {
    const uid = await ensureUser(u.email, DEMO_PASSWORD);
    const oid = orgId[u.org];
    if (!oid) throw new Error(`unknown org ${u.org}`);
    const { data: existing } = await admin.database.from("organization_members")
      .select("id").eq("org_id", oid).eq("user_id", uid).limit(1);
    if (existing?.length) {
      await admin.database.from("organization_members").update({ role: u.role }).eq("id", existing[0].id);
    } else {
      await admin.database.from("organization_members").insert([{ org_id: oid, user_id: uid, role: u.role }]);
    }
    console.log(`✓ ${u.email.padEnd(24)} → ${u.org}/${u.role}  (${uid.slice(0, 8)})`);
  }
  console.log(`\nSeeded ${DEMO_USERS.length} demo users. Password: ${DEMO_PASSWORD}`);
}

main().catch((e) => { console.error("seed failed:", e.message); process.exit(1); });
