// PHYLAX · containment console — graph + live protected-sweep controller.
const $ = (s) => document.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";
const fmtPct = (v) => (v == null ? "—" : (v * 100).toFixed(2).replace(/\.00$/, "") + "%");
const short = (h) => (h ? h.slice(0, 10) + "…" + h.slice(-4) : "—");

const ORG = {
  fintrust:  { name: "FinTrust",  kind: "Bank" },
  swiftcart: { name: "SwiftCart", kind: "Marketplace" },
  pingline:  { name: "PingLine",  kind: "Messaging" },
};
const P = {
  fintrust: { x: 175, y: 135 }, swiftcart: { x: 150, y: 280 }, pingline: { x: 175, y: 425 },
  seal: { x: 545, y: 280 }, phylax: { x: 838, y: 280 }, cluster: { x: 700, y: 280 },
};

let state = { runId: null, coord: null, config: null, es: null, packetsOn: false, receipt: null };

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

/* ---------------- graph ---------------- */
function buildGraph() {
  const g = $("#graph"); g.innerHTML = "";
  const defs = el("defs", {}, g);
  defs.innerHTML = `
    <linearGradient id="mem" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="rgba(53,224,212,0)"/><stop offset=".5" stop-color="rgba(53,224,212,.55)"/>
      <stop offset="1" stop-color="rgba(53,224,212,0)"/></linearGradient>
    <radialGradient id="sealg" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="rgba(53,224,212,.28)"/><stop offset="1" stop-color="rgba(53,224,212,0)"/></radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="3"/></filter>`;

  // zone labels
  el("text", { x: 165, y: 34, fill: "var(--faint)", "font-size": 11, "font-family": "var(--mono)", "letter-spacing": 2, "text-anchor": "middle" }, g).textContent = "PARTNER SPACE";
  el("text", { x: 838, y: 34, fill: "var(--faint)", "font-size": 11, "font-family": "var(--mono)", "letter-spacing": 2, "text-anchor": "middle" }, g).textContent = "NEUTRAL PLANE";

  // trust membrane
  el("rect", { x: 535, y: 60, width: 20, height: 440, fill: "url(#mem)" }, g);
  for (let y = 76; y < 500; y += 22) el("line", { x1: 545, y1: y, x2: 545, y2: y + 10, stroke: "rgba(53,224,212,.5)", "stroke-width": 1 }, g);
  el("text", { x: 545, y: 512, fill: "var(--cyan)", "font-size": 10, "font-family": "var(--mono)", "letter-spacing": 2, "text-anchor": "middle", opacity: .8 }, g).textContent = "TRUST MEMBRANE";

  // edges (geometry paths — kept for packet routing)
  const edges = el("g", { id: "edges" }, g);
  for (const k of ["fintrust", "swiftcart", "pingline"]) {
    const a = P[k], b = P.seal;
    const mx = (a.x + b.x) / 2;
    el("path", { id: "e-" + k, d: `M${a.x},${a.y} C ${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`, fill: "none", stroke: "var(--line)", "stroke-width": 1.4, class: "edge" }, edges);
  }
  el("path", { id: "e-out", d: `M${P.seal.x},${P.seal.y} L ${P.phylax.x},${P.phylax.y}`, fill: "none", stroke: "var(--line)", "stroke-width": 1.4 }, edges);

  // crimson coordination arcs (revealed on match)
  const arcs = el("g", { id: "arcs", opacity: 0 }, g);
  for (const k of ["fintrust", "swiftcart", "pingline"]) {
    const a = P[k], c = P.cluster;
    el("path", { d: `M${c.x},${c.y} Q ${(a.x + c.x) / 2},${(a.y + c.y) / 2 - 40} ${a.x},${a.y}`, fill: "none", stroke: "var(--crimson)", "stroke-width": 1.3, "stroke-dasharray": "3 4", opacity: .8 }, arcs);
  }

  el("g", { id: "packets" }, g);

  // nodes
  function node(id, x, y, label, sub, r = 34) {
    const grp = el("g", { id: "n-" + id, transform: `translate(${x},${y})`, class: "node" }, g);
    el("circle", { r: r + 9, fill: "none", stroke: "var(--line)", "stroke-width": 1, class: "ring" }, grp);
    el("circle", { r, fill: "rgba(12,18,32,.9)", stroke: "var(--line-2)", "stroke-width": 1.5, class: "core" }, grp);
    const t = el("text", { y: 4, "text-anchor": "middle", fill: "var(--ink)", "font-size": 13, "font-weight": 600 }, grp);
    t.textContent = label;
    if (sub) { const s = el("text", { y: r + 26, "text-anchor": "middle", fill: "var(--faint)", "font-size": 10.5, "font-family": "var(--mono)" }, grp); s.textContent = sub; }
    return grp;
  }
  node("fintrust", P.fintrust.x, P.fintrust.y, "FinTrust", "bank");
  node("swiftcart", P.swiftcart.x, P.swiftcart.y, "SwiftCart", "marketplace");
  node("pingline", P.pingline.x, P.pingline.y, "PingLine", "messaging");
  node("phylax", P.phylax.x, P.phylax.y, "Phylax", "control", 38);

  // sealed zero on the membrane — the signature
  const seal = el("g", { id: "n-seal", transform: `translate(${P.seal.x},${P.seal.y})` }, g);
  el("circle", { r: 60, fill: "url(#sealg)" }, seal);
  el("circle", { r: 44, fill: "rgba(6,12,22,.95)", stroke: "var(--cyan)", "stroke-width": 1.5, id: "sealring" }, seal);
  const z = el("text", { y: 6, "text-anchor": "middle", fill: "var(--cyan)", "font-size": 34, "font-weight": 600, "font-family": "var(--mono)" }, seal);
  z.textContent = "0"; z.setAttribute("filter", "");
  el("text", { y: -20, "text-anchor": "middle", fill: "var(--dim)", "font-size": 8.5, "font-family": "var(--mono)", "letter-spacing": 1.5 }, seal).textContent = "RAW SHARED";
  el("text", { y: 26, "text-anchor": "middle", fill: "var(--faint)", "font-size": 8, "font-family": "var(--mono)", "letter-spacing": 1 }, seal).textContent = "SEALED";

  // campaign cluster (hidden until match)
  const cl = el("g", { id: "n-cluster", transform: `translate(${P.cluster.x},${P.cluster.y})`, opacity: 0 }, g);
  el("circle", { r: 26, fill: "rgba(255,77,109,.12)", stroke: "var(--crimson)", "stroke-width": 1.5 }, cl);
  el("text", { y: 4, "text-anchor": "middle", fill: "#ffb3c1", "font-size": 10, "font-family": "var(--mono)", "font-weight": 600 }, cl).textContent = "CAMPAIGN";
}

function setNodeState(id, s) {
  const ring = document.querySelector(`#n-${id} .ring`);
  const core = document.querySelector(`#n-${id} .core`);
  if (!ring) return;
  const map = { ready: "var(--emerald)", active: "var(--cyan)", flagged: "var(--crimson)", idle: "var(--line)" };
  ring.setAttribute("stroke", map[s] || "var(--line)");
  ring.setAttribute("stroke-width", s === "idle" ? 1 : 2);
  if (core && s !== "idle") core.setAttribute("stroke", map[s]);
}

/* ---------------- packets ---------------- */
let raf = null, spawnTimers = [];
function spawnPacket(pathId, color, dur, onArrive) {
  const path = document.getElementById(pathId);
  if (!path) return;
  const len = path.getTotalLength();
  const dot = el("circle", { r: 3.6, fill: color, filter: "" }, $("#packets"));
  dot.style.filter = `drop-shadow(0 0 5px ${color})`;
  const t0 = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - t0) / dur);
    const pt = path.getPointAtLength(p * len);
    dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y);
    if (p < 1) requestAnimationFrame(step); else { dot.remove(); onArrive && onArrive(); }
  })(t0);
}
function pulseSeal() {
  const r = $("#sealring"); if (!r) return;
  r.animate([{ strokeWidth: 1.5, opacity: 1 }, { strokeWidth: 4, opacity: .4 }, { strokeWidth: 1.5, opacity: 1 }], { duration: 700 });
}
function startPackets() {
  if (state.packetsOn) return; state.packetsOn = true;
  const orgs = ["fintrust", "swiftcart", "pingline"];
  orgs.forEach((k, i) => {
    const timer = setInterval(() => {
      if (!state.packetsOn) return;
      spawnPacket("e-" + k, "var(--cyan)", 1100, () => {
        pulseSeal();
        spawnPacket("e-out", "var(--iris)", 800); // raw → sealed → opaque
      });
    }, 900 + i * 130);
    spawnTimers.push(timer);
  });
}
function stopPackets() { state.packetsOn = false; spawnTimers.forEach(clearInterval); spawnTimers = []; setTimeout(() => { const p = $("#packets"); if (p) p.innerHTML = ""; }, 900); }

function revealCampaign() {
  const cl = $("#n-cluster"), arcs = $("#arcs");
  cl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, fill: "forwards" }); cl.setAttribute("opacity", 1);
  arcs.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, fill: "forwards" }); arcs.setAttribute("opacity", 1);
  ["fintrust", "swiftcart", "pingline"].forEach((k) => setNodeState(k, "flagged"));
  $("#sealring").setAttribute("stroke", "var(--cyan)"); // 0 holds, still cyan/sealed
}

/* ---------------- timeline + phase ---------------- */
const EV_META = {
  "run.created": ["Run opened", "cy"], "phase.dispatched": ["Parties dispatched", "cy"],
  "protected_match.started": ["Protected session established", "cy"], "party.ready": ["Party ready", "em"],
  "protected_match.completed": ["Protected match complete", "cr"], "risk.scored": ["Risk scored", "am"],
  "run.awaiting_approval": ["Awaiting human approval", "am"], "action.requested": ["Action requested", "am"],
  "action.approved": ["Action approved", "em"], "action.rejected": ["Action rejected", "cr"],
  "run.actioned": ["Actions executed", "em"], "receipt.issued": ["Receipt sealed", "cy"],
  "run.failed": ["Run failed", "cr"], "run.cancelled": ["Run cancelled", "am"],
};
function tl(event, sub) {
  const [label, cls] = EV_META[event] || [event, ""];
  const wrap = document.createElement("div"); wrap.className = "tl " + cls;
  const now = new Date().toLocaleTimeString("en-US", { hour12: false });
  wrap.innerHTML = `<div class="rail"><i></i><b></b></div><div class="body"><div class="ev">${label}</div><div class="mt">${now}${sub ? " · " + sub : ""}</div></div>`;
  $("#timeline").prepend(wrap);
}
function phase(lab, sub, color = "var(--cyan)") {
  $("#phaselab").textContent = lab; $("#phasesub").textContent = sub || "";
  $("#phaselab").style.color = color; $("#phasedot").style.background = color; $("#phasedot").style.boxShadow = `0 0 9px ${color}`;
}

/* ---------------- rendering ---------------- */
function renderSignals(parties) {
  const box = $("#signals");
  const cfgOrgs = state.config?.orgs || [];
  const rows = ["fintrust", "swiftcart", "pingline"].map((slug) => {
    const p = (parties || []).find((x) => x.org === slug);
    const meta = ORG[slug];
    const solo = p ? p.solo_risk : null;
    return `<div class="signal">
      <div class="top"><span class="org">${meta.name}</span><span class="tag mono">${meta.kind}</span></div>
      <div class="blurb">${p ? p.blurb : "Monitoring local signals…"}</div>
      <div class="solo"><span>solo risk</span><div class="meter"><i style="width:${solo != null ? Math.max(3, solo * 100) : 3}%;background:var(--emerald)"></i></div><span class="mono">${solo != null ? fmtPct(solo) : "—"}</span></div>
    </div>`;
  }).join("");
  box.innerHTML = `<p class="muted" style="margin:2px 0 12px">Three platforms, three fragments. Each below its own action threshold.</p>` + rows;
}

async function loadSnapshot() {
  const r = await fetch(`/api/run/${state.runId}`); const s = await r.json();
  if (s.coord) { state.coord = s.coord; renderSignals(s.coord.parties); $("#backendTag").textContent = "psi: " + (s.coord.summary.backend || "modp-ddh"); }
  return s;
}

function renderFinding(s) {
  const cl = s.cluster, sum = s.coord?.summary;
  if (!cl) return;
  $("#findingEmpty").classList.add("hidden"); $("#finding").classList.remove("hidden");
  $("#fCampaign").textContent = short(cl.opaque_campaign_id);
  $("#fCard").textContent = `${cl.cardinality} shared`;
  $("#fParties").textContent = `${cl.party_count} of 3`;
  $("#fProof").textContent = short(cl.signature_hash);
  $("#verdictTag").textContent = "coordinated campaign proven"; $("#verdictTag").className = "tag cr";
}
function renderRisk(s) {
  const sum = s.coord?.summary; if (!sum) return;
  $("#riskPct").textContent = fmtPct(sum.risk_score);
  $("#riskBar").style.width = Math.max(4, sum.risk_score * 100) + "%";
  $("#confVal").textContent = fmtPct(sum.confidence);
  const drivers = (sum.contributions || []).slice(0, 5).map((c) => {
    const mag = Math.min(100, Math.abs(c.contribution) / 3.2 * 100);
    const col = c.contribution >= 0 ? "var(--crimson)" : "var(--emerald)";
    return `<div class="row"><span class="nm">${c.feature.replace(/_/g, " ")}</span><div class="meter"><i style="width:${mag}%;background:${col}"></i></div><span class="vv">${c.value}</span></div>`;
  }).join("");
  $("#drivers").innerHTML = drivers;
}
function renderActions(s) {
  const acts = s.actions || [];
  const byOrg = Object.fromEntries((state.config?.orgs || []).map((o) => [o.id, o]));
  const decided = new Set((s.decisions || []).map((d) => d.action_request_id));
  if (!acts.length) { return; }
  $("#actions").innerHTML = acts.map((a) => {
    const org = byOrg[a.target_org_id]; const done = a.status !== "requested";
    const stateTag = a.status === "approved" || a.status === "executed" ? `<span class="tag em">approved</span>` :
      a.status === "rejected" ? `<span class="tag cr">rejected</span>` : `<span class="tag am">pending</span>`;
    return `<div class="act"><div><div class="lbl">${a.action_type.replace(/_/g, " ")}</div><div class="sub">${org ? org.name : a.target_org_id}</div></div>${stateTag}</div>`;
  }).join("");
  const allDecided = acts.every((a) => a.status !== "requested");
  if (!allDecided && !$("#approveAllBtn")) {
    const btn = document.createElement("button"); btn.id = "approveAllBtn"; btn.className = "btn btn-primary"; btn.style.width = "100%"; btn.style.marginTop = "4px";
    btn.textContent = "Approve all (as target-org approvers)";
    btn.onclick = approveAll; $("#actions").appendChild(btn);
  }
}
async function renderReceiptBox(s) {
  const box = $("#receiptBox"); box.classList.remove("hidden");
  if (s.run?.status === "receipted" && state.receipt) {
    const v = state.receiptVerified;
    box.innerHTML = `<div class="act" style="border-color:rgba(53,224,212,.4)"><div><div class="lbl">Incident receipt sealed</div><div class="sub">${short(state.receipt.receiptHash)}</div></div>
      <span class="tag ${v ? "cy" : "am"}">${v ? "verified ✓" : "verifying…"}</span></div>`;
  } else if (s.run?.status === "actioned") {
    box.innerHTML = `<button class="btn" id="issueBtn" style="width:100%">Issue signed incident receipt</button>`;
    $("#issueBtn").onclick = issueReceipt;
  }
}

/* ---------------- controller ---------------- */
async function refresh() {
  const s = await loadSnapshot();
  renderFinding(s); renderRisk(s); renderActions(s); renderReceiptBox(s);
  $("#sweepstate").textContent = s.run?.status || "idle";
  return s;
}

function handleEvent(event, data) {
  if (EV_META[event]) tl(event, data?.status || "");
  switch (event) {
    case "protected_match.started": phase("Protected match · running", "commutative ECDH-PSI over opaque tokens", "var(--cyan)"); startPackets(); break;
    case "party.ready": if (data.orgId) { const o = (state.config.orgs || []).find((x) => x.id === data.orgId); if (o) setNodeState(o.slug, "ready"); } break;
    case "protected_match.completed": stopPackets(); revealCampaign(); phase("Campaign proven", `cardinality ${data.matchCardinality ?? ""}`, "var(--crimson)"); setNodeState("phylax", "active"); refresh(); break;
    case "risk.scored": phase("Risk scored · awaiting approval", "human decision required", "var(--amber)"); refresh(); break;
    case "run.awaiting_approval": refresh(); break;
    case "action.approved": case "action.rejected": refresh(); break;
    case "run.actioned": phase("Actions executed", "issue receipt to seal", "var(--emerald)"); refresh(); break;
    case "receipt.issued": phase("Sealed", "immutable receipt issued", "var(--cyan)"); $("#sweepstate").textContent = "sealed"; break;
    case "run.failed": phase("Run failed", data.reason || "", "var(--crimson)"); break;
  }
}

function openStream(runId) {
  if (state.es) state.es.close();
  const es = new EventSource(`/api/stream/${runId}`); state.es = es;
  const evs = Object.keys(EV_META).concat(["phase.dispatched", "phase.parties_ready", "phase.protected_match", "phase.risk_scored"]);
  for (const ev of evs) es.addEventListener(ev, (m) => { try { handleEvent(ev, JSON.parse(m.data)); } catch { handleEvent(ev, {}); } });
  es.onerror = () => {/* browser auto-reconnects */ };
}

async function runSweep() {
  $("#runBtn").disabled = true; $("#runBtn").textContent = "Sweeping…";
  $("#timeline").innerHTML = ""; $("#sweepstate").textContent = "running"; $("#netdot").className = "dot warn";
  phase("Establishing protected session", "dispatching parties", "var(--cyan)");
  ["fintrust", "swiftcart", "pingline", "phylax"].forEach((k) => setNodeState(k, "idle"));
  try {
    const r = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const j = await r.json();
    if (!j.runId) throw new Error(JSON.stringify(j.error || j));
    state.runId = j.runId; state.receipt = null; state.receiptVerified = false;
    $("#runIdTag").textContent = j.runId.slice(0, 8); $("#runIdTag").className = "tag cy";
    openStream(j.runId);
    tl("run.created");
  } catch (e) {
    phase("Run failed", e.message, "var(--crimson)"); $("#runBtn").disabled = false; $("#runBtn").textContent = "Run Protected Sweep";
  }
}
async function approveAll() {
  const b = $("#approveAllBtn"); if (b) { b.disabled = true; b.textContent = "Approving…"; }
  await fetch("/api/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: state.runId, decision: "approve" }) });
  setTimeout(refresh, 600);
}
async function issueReceipt() {
  const b = $("#issueBtn"); if (b) { b.disabled = true; b.textContent = "Sealing…"; }
  const r = await fetch("/api/issue-receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: state.runId }) });
  const j = await r.json();
  state.receipt = j; await renderReceiptBox({ run: { status: "receipted" } });
  const v = await fetch("/api/verify-receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: state.runId, receipt: j.receipt }) });
  const vj = await v.json(); state.receiptVerified = vj.valid;
  await renderReceiptBox({ run: { status: "receipted" } });
  $("#runBtn").disabled = false; $("#runBtn").textContent = "Run Another Sweep";
  if (state.es) { state.es.close(); state.es = null; }   // run sealed — release the live stream
}

async function init() {
  buildGraph();
  ["fintrust", "swiftcart", "pingline", "phylax"].forEach((k) => setNodeState(k, "idle"));
  try {
    const r = await fetch("/api/config"); state.config = await r.json();
    $("#participants").textContent = (state.config.orgs || []).length;
    if (state.config.model) $("#modelTag").textContent = `${state.config.model.name} ${state.config.model.version}`;
    renderSignals(null);
  } catch { renderSignals(null); }
  $("#runBtn").onclick = runSweep;
}
init();
