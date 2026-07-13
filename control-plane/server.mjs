// PHYLAX · local host (operator console backend)
// Serves the command center + bridges the browser to the LIVE control plane:
//   • POST /api/run     — runs the real protected sweep (coordinator + callbacks)
//   • GET  /api/stream  — Server-Sent Events forwarded from InsForge Realtime
//   • GET  /api/run/:id — persisted snapshot (the UI derives state from this first)
//   • POST /api/approve / issue-receipt / verify-receipt
// The browser needs no keys and no SDK — this host holds them.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { createClient } from "@insforge/sdk";
import {
  cfg, admin, signIn, invoke, runCoordinator, runSnapshot,
  decideAllActions, issueReceipt, verifyReceipt,
} from "./orchestrator.mjs";
import { DEMO_PASSWORD } from "../scripts/_env.mjs";

const PORT = Number(process.env.PORT || 8890);
const WEB = join(cfg.root, "frontend");

const REALTIME_EVENTS = [
  "run.created", "party.ready", "protected_match.started", "protected_match.completed",
  "risk.scored", "run.awaiting_approval", "action.requested", "action.approved",
  "action.rejected", "run.actioned", "receipt.issued", "run.failed", "run.cancelled",
];

// ---- SSE fan-out per run ----
const streams = new Map();            // runId -> Set<res>
function emit(runId, event, payload) {
  const set = streams.get(runId);
  if (!set) return;
  const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) { try { res.write(line); } catch { /* client gone */ } }
}

// ---- InsForge Realtime bridge (host subscribes with the operator token) ----
let rt = null;
const subscribed = new Set();
async function realtime() {
  if (rt) return rt;
  const token = await signIn("operator@phylax.demo");
  rt = createClient({ baseUrl: cfg.baseUrl, anonKey: cfg.anonKey });
  if (rt.setAccessToken) rt.setAccessToken(token);
  try {
    await rt.realtime.connect();
    for (const ev of REALTIME_EVENTS) {
      rt.realtime.on(ev, (payload) => {
        const runId = payload?.runId || payload?.meta?.channel?.split(":")[1];
        if (runId) emit(runId, payload?.event || ev, { source: "realtime", ...payload });
      });
    }
    console.log("● InsForge Realtime bridge connected");
  } catch (e) {
    console.warn("Realtime bridge unavailable, falling back to snapshot polling:", e.message);
    rt = null;
  }
  return rt;
}
async function watchRun(runId) {
  const c = await realtime();
  if (c && !subscribed.has(runId)) {
    try { await c.realtime.subscribe(`run:${runId}`); subscribed.add(runId); } catch { /* ignore */ }
  }
}

// ---- the paced protected sweep (async; the UI watches it live over SSE) ----
async function orchestrateSweep(runId, coord) {
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const cb of coord.callbacks) {
    const r = await invoke("receive-worker-callback", { token: cfg.anonKey, body: { signed: cb.signed, sig: cb.sig } });
    emit(runId, `phase.${cb.phase}`, { source: "host", phase: cb.phase, status: r.body?.status, ok: r.status < 400 });
    if (r.status >= 400) { emit(runId, "run.failed", { source: "host", reason: JSON.stringify(r.body) }); return; }
    await pause(900);                       // pacing so the sequence is legible on screen
  }
}

// ---- HTTP ----
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".png": "image/png" };
const ROUTES = { "/": "index.html", "/console": "console.html", "/partner": "partner.html",
  "/architecture": "architecture.html", "/sponsor": "sponsor.html" };

function sendJSON(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(obj));
}
async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { return {}; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  try {
    // ---- API ----
    if (path === "/api/config") {
      const { data: orgs } = await admin.database.from("organizations").select("id, slug, name, kind, is_control");
      const { data: models } = await admin.database.from("model_versions").select("name, version, params_hash").eq("active", true).limit(1);
      return sendJSON(res, 200, { orgs, model: models?.[0] || null, backend: cfg.psiBackend, appkey: cfg.baseUrl });
    }
    if (path === "/api/run" && req.method === "POST") {
      const b = await body(req);
      const token = await signIn("operator@phylax.demo");
      const created = await invoke("create-detection-run", { token, body: { policyKey: b.policyKey } });
      if (created.status >= 400) return sendJSON(res, 502, { error: created.body });
      const runId = created.body.runId;
      await watchRun(runId);
      emit(runId, "run.created", { source: "host", runId, status: "awaiting_parties" });
      await invoke("dispatch-party-run", { token, body: { runId } });
      emit(runId, "phase.dispatched", { source: "host", runId });
      // run the real coordinator, then pace the callbacks — all async so we can return now
      (async () => {
        try {
          const coord = await runCoordinator(runId);
          streams.set(runId + ":coord", coord);       // stash for snapshot enrich
          await orchestrateSweep(runId, coord);
        } catch (e) { emit(runId, "run.failed", { source: "host", reason: e.message }); }
      })();
      return sendJSON(res, 200, { runId });
    }
    if (path.startsWith("/api/run/") && req.method === "GET") {
      const runId = path.split("/").pop();
      const snap = await runSnapshot(runId);
      const coord = streams.get(runId + ":coord");
      return sendJSON(res, 200, { ...snap, coord: coord ? { summary: coord.summary, parties: coord.parties } : null });
    }
    if (path.startsWith("/api/stream/") && req.method === "GET") {
      const runId = path.split("/").pop();
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
        "Connection": "keep-alive", "Access-Control-Allow-Origin": "*" });
      res.write(`event: hello\ndata: ${JSON.stringify({ runId })}\n\n`);
      if (!streams.has(runId)) streams.set(runId, new Set());
      streams.get(runId).add(res);
      await watchRun(runId);
      const hb = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* */ } }, 15000);
      req.on("close", () => { clearInterval(hb); streams.get(runId)?.delete(res); });
      return;
    }
    if (path === "/api/approve" && req.method === "POST") {
      const b = await body(req);
      const results = await decideAllActions(b.runId, b.decision || "approve");
      return sendJSON(res, 200, { results });
    }
    if (path === "/api/issue-receipt" && req.method === "POST") {
      const b = await body(req);
      const r = await issueReceipt(b.runId);
      return sendJSON(res, r.status, r.body);
    }
    if (path === "/api/verify-receipt" && req.method === "POST") {
      const b = await body(req);
      const r = await verifyReceipt(b.runId, b.receipt);
      return sendJSON(res, r.status, r.body);
    }
    // Partner-restricted view: reads AS the partner (RLS-scoped), and proves it
    // cannot see other orgs' private batches.
    if (path.startsWith("/api/partner/") && req.method === "GET") {
      const slug = path.split("/").pop();
      if (!["fintrust", "swiftcart", "pingline"].includes(slug)) return sendJSON(res, 404, { error: "unknown partner" });
      const c = createClient({ baseUrl: cfg.baseUrl, anonKey: cfg.anonKey });
      await c.auth.signInWithPassword({ email: `admin@${slug}.demo`, password: DEMO_PASSWORD });
      const { data: orgs } = await admin.database.from("organizations").select("id, slug, name");
      const orgId = Object.fromEntries((orgs || []).map((o) => [o.slug, o.id]));
      const [{ data: batches }, { data: commits }, { data: runs }] = await Promise.all([
        c.database.from("signal_batches").select("*").order("created_at", { ascending: false }),
        c.database.from("signal_commitments").select("id"),
        c.database.from("detection_runs").select("id,status,risk_score,created_at").order("created_at", { ascending: false }).limit(6),
      ]);
      const isolation = [];
      for (const other of ["fintrust", "swiftcart", "pingline"].filter((s) => s !== slug)) {
        const { data } = await c.database.from("signal_batches").select("id").eq("org_id", orgId[other]);
        isolation.push({ org: other, name: (orgs || []).find((o) => o.slug === other)?.name, rowsVisible: (data || []).length });
      }
      return sendJSON(res, 200, {
        org: slug, name: (orgs || []).find((o) => o.slug === slug)?.name,
        ownBatches: batches || [], ownCommitments: (commits || []).length, runs: runs || [], isolation,
      });
    }

    // ---- static ----
    let rel = ROUTES[path] || path.replace(/^\//, "");
    const file = normalize(join(WEB, rel));
    if (!file.startsWith(WEB)) { res.writeHead(403); return res.end("forbidden"); }
    if (existsSync(file)) {
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
      return res.end(data);
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  } catch (e) {
    console.error("server error:", e);
    sendJSON(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  PHYLAX operator console → http://localhost:${PORT}/console`);
  console.log(`  landing → http://localhost:${PORT}/   ·   backend ${cfg.psiBackend}   ·   ${cfg.baseUrl}\n`);
});
