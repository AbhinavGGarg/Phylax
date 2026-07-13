// PHYLAX · orchestrator
// Drives the real containment workflow against the LIVE InsForge control plane:
// create → dispatch → run the Python coordinator (real PSI/MPC) → relay its signed
// callbacks into receive-worker-callback → approvals → receipt. Shared by the
// local host (control-plane/server.mjs) and the E2E verifier.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { createClient, createAdminClient } from "@insforge/sdk";
import { loadEnv, DEMO_PASSWORD } from "../scripts/_env.mjs";

export const cfg = loadEnv();
export const admin = createAdminClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey });

const PARTNER_ADMIN = {
  fintrust: "admin@fintrust.demo",
  swiftcart: "admin@swiftcart.demo",
  pingline: "admin@pingline.demo",
};

const tokenCache = new Map();
export async function signIn(email, password = DEMO_PASSWORD) {
  if (tokenCache.has(email)) return tokenCache.get(email);
  const c = createClient({ baseUrl: cfg.baseUrl, anonKey: cfg.anonKey });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (!data?.accessToken) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(error)}`);
  tokenCache.set(email, data.accessToken);
  return data.accessToken;
}

export async function invoke(slug, { token, body } = {}) {
  const res = await fetch(`${cfg.baseUrl}/functions/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token || cfg.anonKey}` },
    body: JSON.stringify(body || {}),
  });
  let json = {};
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

// spawn the real coordinator; returns { summary, callbacks, parties }
export function runCoordinator(runId) {
  return new Promise((resolve, reject) => {
    const args = ["coordinator.py", "--run-id", runId,
      "--joint-secret", cfg.jointSecret, "--hmac-secret", cfg.workerSecret];
    if (cfg.psiBackend && cfg.psiBackend !== "modp-ddh") args.push("--backend", cfg.psiBackend);
    const py = spawn("python3", args, { cwd: join(cfg.root, "parties"), env: { ...process.env } });
    let out = "", err = "";
    py.stdout.on("data", (d) => (out += d));
    py.stderr.on("data", (d) => (err += d));
    py.on("error", reject);
    py.on("close", (code) => {
      if (code !== 0) return reject(new Error(`coordinator exited ${code}: ${err.slice(-500)}`));
      try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`bad coordinator output: ${e.message}\n${out.slice(0, 300)}`)); }
    });
  });
}

// full protected sweep: returns runId + the coordinator summary/parties
export async function runSweep({ operatorEmail = "operator@phylax.demo", policyKey } = {}, onPhase = () => {}) {
  const token = await signIn(operatorEmail);
  const created = await invoke("create-detection-run", { token, body: { policyKey } });
  if (created.status >= 400) throw new Error(`create failed: ${JSON.stringify(created.body)}`);
  const runId = created.body.runId;
  onPhase({ phase: "created", runId });

  await invoke("dispatch-party-run", { token, body: { runId } });
  onPhase({ phase: "dispatched", runId });

  const coord = await runCoordinator(runId);
  for (const cb of coord.callbacks) {
    const r = await invoke("receive-worker-callback", { token: cfg.anonKey, body: { signed: cb.signed, sig: cb.sig } });
    if (r.status >= 400) throw new Error(`callback ${cb.phase} rejected (${r.status}): ${JSON.stringify(r.body)}`);
    onPhase({ phase: cb.phase, runId, result: r.body });
  }
  return { runId, summary: coord.summary, parties: coord.parties };
}

// list a run's pending action requests (admin read)
export async function runActions(runId) {
  const { data: actions } = await admin.database.from("action_requests").select("*").eq("run_id", runId);
  const { data: orgs } = await admin.database.from("organizations").select("id, slug");
  const slugOf = new Map((orgs || []).map((o) => [o.id, o.slug]));
  return (actions || []).map((a) => ({ ...a, targetSlug: slugOf.get(a.target_org_id) }));
}

// approve (or reject) every pending action, each by an approver AT THE TARGET ORG
export async function decideAllActions(runId, decision = "approve") {
  const actions = await runActions(runId);
  const results = [];
  for (const a of actions.filter((x) => x.status === "requested")) {
    const email = PARTNER_ADMIN[a.targetSlug];
    const token = await signIn(email);
    const r = await invoke("approve-action", { token, body: { actionRequestId: a.id, decision, note: `${decision} via demo` } });
    results.push({ action: a.action_type, target: a.targetSlug, status: r.status, body: r.body });
  }
  return results;
}

export async function issueReceipt(runId, operatorEmail = "operator@phylax.demo") {
  const token = await signIn(operatorEmail);
  return invoke("issue-receipt", { token, body: { runId } });
}

export async function verifyReceipt(runId, receipt) {
  return invoke("verify-receipt", { token: cfg.anonKey, body: { runId, receipt } });
}

// snapshot of everything the operator console renders for a run (admin read)
export async function runSnapshot(runId) {
  const [run, cluster, findings, actions, decisions, audit, participants] = await Promise.all([
    admin.database.from("detection_runs").select("*").eq("id", runId).limit(1).then((r) => r.data?.[0] || null),
    admin.database.from("campaign_clusters").select("*").eq("run_id", runId).limit(1).then((r) => r.data?.[0] || null),
    admin.database.from("permitted_findings").select("feature_key, feature_value").eq("run_id", runId).then((r) => r.data || []),
    admin.database.from("action_requests").select("*").eq("run_id", runId).then((r) => r.data || []),
    admin.database.from("approval_decisions").select("*").eq("run_id", runId).then((r) => r.data || []),
    admin.database.from("audit_events").select("*").eq("run_id", runId).order("created_at", { ascending: true }).then((r) => r.data || []),
    admin.database.from("run_participants").select("*").eq("run_id", runId).then((r) => r.data || []),
  ]);
  return { run, cluster, findings, actions, decisions, audit, participants };
}
