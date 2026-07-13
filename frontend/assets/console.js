// PHYLAX · containment console — light theme, driven by the InsForge edge functions.
const $ = (s) => document.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";
const fmtPct = (v) => (v == null ? "—" : (v * 100).toFixed(2).replace(/\.00$/, "") + "%");
const short = (h) => (h ? h.slice(0, 10) + "…" + h.slice(-4) : "—");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = (window.PHYLAX && window.PHYLAX.base) || "", ANON = (window.PHYLAX && window.PHYLAX.anon) || "";
async function fn(slug, body) {
  const r = await fetch(`${API}/functions/${slug}`, {
    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON}` },
    body: JSON.stringify(body || {}),
  });
  return r.json();
}

const ORG = { fintrust: { name: "FinTrust", kind: "Bank" }, swiftcart: { name: "SwiftCart", kind: "Marketplace" }, pingline: { name: "PingLine", kind: "Messaging" } };
const P = { fintrust: { x: 175, y: 135 }, swiftcart: { x: 150, y: 280 }, pingline: { x: 175, y: 425 }, seal: { x: 545, y: 280 }, phylax: { x: 838, y: 280 }, cluster: { x: 700, y: 280 } };
let state = { runId: null, summary: null, parties: null, config: null, actions: [], receipt: null, receiptVerified: false };
function el(tag, attrs = {}, parent) { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; }

/* ---------------- graph (light theme) ---------------- */
function buildGraph() {
  const g = $("#graph"); g.innerHTML = "";
  const defs = el("defs", {}, g);
  defs.innerHTML = `
    <linearGradient id="mem" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(30,45,255,0)"/><stop offset=".5" stop-color="rgba(30,45,255,.55)"/><stop offset="1" stop-color="rgba(30,45,255,0)"/></linearGradient>
    <radialGradient id="sealg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="rgba(30,45,255,.28)"/><stop offset="1" stop-color="rgba(30,45,255,0)"/></radialGradient>`;
  el("text", { x: 165, y: 34, fill: "#999AA8", "font-size": 11, "font-family": "monospace", "letter-spacing": 2, "text-anchor": "middle" }, g).textContent = "PARTNER SPACE";
  el("text", { x: 838, y: 34, fill: "#999AA8", "font-size": 11, "font-family": "monospace", "letter-spacing": 2, "text-anchor": "middle" }, g).textContent = "NEUTRAL PLANE";
  el("rect", { x: 535, y: 60, width: 20, height: 440, fill: "url(#mem)" }, g);
  for (let y = 76; y < 500; y += 22) el("line", { x1: 545, y1: y, x2: 545, y2: y + 10, stroke: "rgba(30,45,255,.5)", "stroke-width": 1 }, g);
  el("text", { x: 545, y: 512, fill: "#1E2DFF", "font-size": 10, "font-family": "monospace", "letter-spacing": 2, "text-anchor": "middle", opacity: .8 }, g).textContent = "TRUST MEMBRANE";
  const edges = el("g", { id: "edges" }, g);
  for (const k of ["fintrust", "swiftcart", "pingline"]) { const a = P[k], b = P.seal, mx = (a.x + b.x) / 2; el("path", { id: "e-" + k, d: `M${a.x},${a.y} C ${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`, fill: "none", stroke: "rgba(0,0,0,0.08)", "stroke-width": 1.4 }, edges); }
  el("path", { id: "e-out", d: `M${P.seal.x},${P.seal.y} L ${P.phylax.x},${P.phylax.y}`, fill: "none", stroke: "rgba(0,0,0,0.08)", "stroke-width": 1.4 }, edges);
  const arcs = el("g", { id: "arcs", opacity: 0 }, g);
  for (const k of ["fintrust", "swiftcart", "pingline"]) { const a = P[k], c = P.cluster; el("path", { d: `M${c.x},${c.y} Q ${(a.x + c.x) / 2},${(a.y + c.y) / 2 - 40} ${a.x},${a.y}`, fill: "none", stroke: "#DC2626", "stroke-width": 1.3, "stroke-dasharray": "3 4", opacity: .8 }, arcs); }
  el("g", { id: "packets" }, g);
  function node(id, x, y, label, sub, r = 34) {
    const grp = el("g", { id: "n-" + id, transform: `translate(${x},${y})` }, g);
    el("circle", { r: r + 9, fill: "none", stroke: "rgba(0,0,0,0.08)", "stroke-width": 1, class: "ring" }, grp);
    el("circle", { r, fill: "rgba(255,255,255,0.95)", stroke: "rgba(0,0,0,0.12)", "stroke-width": 1.5, class: "core" }, grp);
    el("text", { y: 4, "text-anchor": "middle", fill: "#0A0A1A", "font-size": 13, "font-weight": 600 }, grp).textContent = label;
    if (sub) el("text", { y: r + 26, "text-anchor": "middle", fill: "#999AA8", "font-size": 10.5, "font-family": "monospace" }, grp).textContent = sub;
  }
  node("fintrust", P.fintrust.x, P.fintrust.y, "FinTrust", "bank");
  node("swiftcart", P.swiftcart.x, P.swiftcart.y, "SwiftCart", "marketplace");
  node("pingline", P.pingline.x, P.pingline.y, "PingLine", "messaging");
  node("phylax", P.phylax.x, P.phylax.y, "Phylax", "control", 38);
  const seal = el("g", { transform: `translate(${P.seal.x},${P.seal.y})` }, g);
  el("circle", { r: 60, fill: "url(#sealg)" }, seal);
  el("circle", { r: 44, fill: "rgba(255,255,255,0.97)", stroke: "#1E2DFF", "stroke-width": 1.5, id: "sealring" }, seal);
  el("text", { y: 6, "text-anchor": "middle", fill: "#1E2DFF", "font-size": 34, "font-weight": 600, "font-family": "monospace" }, seal).textContent = "0";
  el("text", { y: -20, "text-anchor": "middle", fill: "#555566", "font-size": 8.5, "font-family": "monospace", "letter-spacing": 1.5 }, seal).textContent = "RAW SHARED";
  el("text", { y: 26, "text-anchor": "middle", fill: "#999AA8", "font-size": 8, "font-family": "monospace", "letter-spacing": 1 }, seal).textContent = "SEALED";
  const cl = el("g", { id: "n-cluster", transform: `translate(${P.cluster.x},${P.cluster.y})`, opacity: 0 }, g);
  el("circle", { r: 26, fill: "rgba(220,38,38,0.08)", stroke: "#DC2626", "stroke-width": 1.5 }, cl);
  el("text", { y: 4, "text-anchor": "middle", fill: "#DC2626", "font-size": 10, "font-family": "monospace", "font-weight": 600 }, cl).textContent = "CAMPAIGN";
}
function setNodeState(id, s) {
  const ring = document.querySelector(`#n-${id} .ring`), core = document.querySelector(`#n-${id} .core`);
  if (!ring) return;
  const map = { ready: "#169B5A", active: "#1E2DFF", flagged: "#DC2626", idle: "rgba(0,0,0,0.08)" };
  ring.setAttribute("stroke", map[s] || "rgba(0,0,0,0.08)"); ring.setAttribute("stroke-width", s === "idle" ? 1 : 2);
  if (core && s !== "idle") core.setAttribute("stroke", map[s]);
}
/* ---------------- packets ---------------- */
let spawnTimers = [], packetsOn = false;
function spawnPacket(pathId, color, dur, onArrive) {
  const path = document.getElementById(pathId); if (!path) return;
  const len = path.getTotalLength(), dot = el("circle", { r: 3.6, fill: color }, $("#packets"));
  dot.style.filter = `drop-shadow(0 0 5px ${color})`; const t0 = performance.now();
  (function step(t) { const p = Math.min(1, (t - t0) / dur), pt = path.getPointAtLength(p * len); dot.setAttribute("cx", pt.x); dot.setAttribute("cy", pt.y); if (p < 1) requestAnimationFrame(step); else { dot.remove(); onArrive && onArrive(); } })(t0);
}
function pulseSeal() { const r = $("#sealring"); if (r) r.animate([{ strokeWidth: 1.5, opacity: 1 }, { strokeWidth: 4, opacity: .4 }, { strokeWidth: 1.5, opacity: 1 }], { duration: 700 }); }
function startPackets() { if (packetsOn) return; packetsOn = true; ["fintrust", "swiftcart", "pingline"].forEach((k, i) => spawnTimers.push(setInterval(() => { if (packetsOn) spawnPacket("e-" + k, "#1E2DFF", 1100, () => { pulseSeal(); spawnPacket("e-out", "#1E2DFF", 800); }); }, 900 + i * 130))); }
function stopPackets() { packetsOn = false; spawnTimers.forEach(clearInterval); spawnTimers = []; setTimeout(() => { const p = $("#packets"); if (p) p.innerHTML = ""; }, 900); }
function revealCampaign() {
  const cl = $("#n-cluster"), arcs = $("#arcs");
  cl.setAttribute("opacity", 1); cl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
  arcs.setAttribute("opacity", 1); arcs.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900 });
  ["fintrust", "swiftcart", "pingline"].forEach((k) => setNodeState(k, "flagged"));
}

/* ---------------- timeline + phase ---------------- */
const EV = {
  "run.created": ["Run opened", "cy"], "party.ready": ["Party ready", "em"], "protected_match.started": ["Protected session established", "cy"],
  "protected_match.completed": ["Protected match complete", "cr"], "risk.scored": ["Risk scored", "am"], "action.requested": ["Action requested", "am"],
  "action.approved": ["Action approved", "em"], "run.actioned": ["Actions executed", "em"], "receipt.issued": ["Receipt sealed", "cy"],
};
function tl(event, sub) {
  const [label, cls] = EV[event] || [event, ""]; const wrap = document.createElement("div"); wrap.className = "tl " + cls;
  const now = new Date().toLocaleTimeString("en-US", { hour12: false });
  wrap.innerHTML = `<div class="r"><i></i><span></span></div><div class="b"><div class="ev">${label}</div><div class="mt">${now}${sub ? " · " + sub : ""}</div></div>`;
  $("#timeline").prepend(wrap);
}
function phase(lab, sub, color = "#1E2DFF") { $("#phaselab").textContent = lab; $("#phasesub").textContent = sub || ""; $("#phaselab").style.color = color; const d = $("#phasedot"); d.className = "dot"; d.style.background = color; d.style.boxShadow = `0 0 9px ${color}55`; }

/* ---------------- rendering (their CSS classes) ---------------- */
function renderSignals(parties) {
  const rows = ["fintrust", "swiftcart", "pingline"].map((slug) => {
    const p = (parties || []).find((x) => x.org === slug), meta = ORG[slug], solo = p ? p.solo_risk : null;
    return `<div class="sig"><div class="sig-top"><span class="who">${meta.name}</span><span class="tag">${meta.kind}</span></div>
      <div class="blurb">${p ? p.blurb : "Monitoring local signals…"}</div>
      <div class="risk"><span>solo risk</span><div class="bar"><i style="width:${solo != null ? Math.max(3, solo * 100) : 3}%"></i></div><span>${solo != null ? fmtPct(solo) : "—"}</span></div></div>`;
  }).join("");
  $("#signals").innerHTML = `<p class="mt" style="margin:0 0 8px">Three platforms, three fragments. Each below its own action threshold.</p>` + rows;
  if (window._animRefresh) window._animRefresh();
}
function renderFinding(s) {
  $("#findingEmpty").classList.add("hidden"); $("#finding").classList.remove("hidden");
  $("#fCampaign").textContent = short(s.opaque_campaign_id); $("#fCard").textContent = `${s.cardinality} shared`;
  $("#fParties").textContent = `${s.party_count} of 3`; $("#fProof").textContent = short(s.signature_hash);
  $("#verdictTag").textContent = "campaign proven"; $("#verdictTag").className = "tag cr";
  $("#backendTag").textContent = "psi: " + s.backend;
}
function renderRisk(s) {
  const pct = s.risk_score * 100;
  $("#riskPct").textContent = fmtPct(s.risk_score);                 // always show the value…
  if (window._animAnimateCount) {                                    // …count up to it when rAF is available…
    window._animAnimateCount($("#riskPct"), pct, 2, 1200);
    setTimeout(() => { $("#riskPct").textContent = fmtPct(s.risk_score); }, 1400);  // …and guarantee the final value
  }
  $("#riskBar").style.width = Math.max(4, s.risk_score * 100) + "%"; $("#confVal").textContent = fmtPct(s.confidence);
  $("#drivers").innerHTML = (s.contributions || []).slice(0, 5).map((c) => {
    const mag = Math.min(100, Math.abs(c.contribution) / 3.2 * 100), col = c.contribution >= 0 ? "#DC2626" : "#169B5A";
    return `<div class="r2"><span class="nm">${c.feature.replace(/_/g, " ")}</span><div class="bar"><i style="width:${mag}%;background:${col}"></i></div><span class="vv">${c.value}</span></div>`;
  }).join("");
}
function renderActions() {
  const nameOf = Object.fromEntries((state.config?.orgs || []).map((o) => [o.slug, o.name]));
  $("#actions").innerHTML = state.actions.map((a) => {
    const tag = a.status === "approved" || a.status === "executed" ? `<span class="tag em">approved</span>` : a.status === "rejected" ? `<span class="tag cr">rejected</span>` : `<span class="tag am">pending</span>`;
    return `<div class="act"><div><div class="lbl">${a.action_type.replace(/_/g, " ")}</div><div class="s">${nameOf[a.target_org] || a.target_org}</div></div>${tag}</div>`;
  }).join("");
  if (state.actions.length && state.actions.every((a) => a.status === "requested") && !$("#approveAllBtn")) {
    const btn = document.createElement("button"); btn.id = "approveAllBtn"; btn.className = "btn btn-p"; btn.style.cssText = "width:100%;margin-top:4px"; btn.textContent = "Approve all (as target-org approvers)"; btn.onclick = approveAll; $("#actions").appendChild(btn);
  }
}
function renderReceipt() {
  const box = $("#receiptBox"); box.classList.remove("hidden");
  if (state.receipt) box.innerHTML = `<div class="act" style="border-color:rgba(30,45,255,.4)"><div><div class="lbl">Incident receipt sealed</div><div class="s">${short(state.receipt.receiptHash)}</div></div><span class="tag ${state.receiptVerified ? "cy" : "am"}">${state.receiptVerified ? "verified ✓" : "verifying…"}</span></div>`;
  else { box.innerHTML = `<button class="btn btn-g" id="issueBtn" style="width:100%">Issue signed incident receipt</button>`; $("#issueBtn").onclick = issueReceipt; }
}

/* ---------------- flow (edge functions) ---------------- */
function resetBtn(label) { $("#runBtn").disabled = false; $("#runBtn").textContent = label || "Run Protected Sweep"; }
async function runSweep() {
  $("#runBtn").disabled = true; $("#runBtn").textContent = "Sweeping…";
  $("#timeline").innerHTML = ""; $("#sweepstate").textContent = "running"; $("#netdot").className = "dot warn";
  $("#finding").classList.add("hidden"); $("#findingEmpty").classList.remove("hidden"); $("#actions").innerHTML = ""; $("#receiptBox").classList.add("hidden"); $("#drivers").innerHTML = ""; $("#riskPct").textContent = "—"; $("#riskBar").style.width = 0;
  buildGraph(); ["fintrust", "swiftcart", "pingline", "phylax"].forEach((k) => setNodeState(k, "idle"));
  phase("Establishing protected session", "dispatching parties", "#1E2DFF"); tl("run.created");
  const sweep = fn("demo-sweep");
  await sleep(500);
  ["fintrust", "swiftcart", "pingline"].forEach((k, i) => setTimeout(() => { setNodeState(k, "ready"); tl("party.ready", ORG[k].name); }, i * 180));
  phase("Protected match · running", "commutative ECDH-PSI over opaque tokens", "#1E2DFF"); startPackets();
  let res; try { [res] = await Promise.all([sweep, sleep(3600)]); } catch (e) { phase("Run failed", e.message, "#DC2626"); resetBtn(); return; }
  if (!res || !res.runId) { phase("Run failed", (res && res.error && res.error.message) || "sweep error", "#DC2626"); resetBtn(); return; }
  const s = res.summary; state.runId = res.runId; state.summary = s; state.parties = s.parties;
  state.actions = (s.recommended_actions || []).map((a) => ({ ...a, status: "requested" })); state.receipt = null; state.receiptVerified = false;
  $("#runIdTag").textContent = res.runId.slice(0, 8); $("#runIdTag").className = "tag bl";
  stopPackets(); revealCampaign(); setNodeState("phylax", "active");
  tl("protected_match.completed", `cardinality ${s.cardinality}`);
  renderSignals(state.parties); renderFinding(s); renderRisk(s);
  tl("risk.scored", `${fmtPct(s.risk_score)} risk`); state.actions.forEach((a) => tl("action.requested", a.action_type.replace(/_/g, " "))); renderActions();
  phase("Risk scored · awaiting approval", "human decision required", "#CC6C00");
  $("#sweepstate").textContent = "awaiting_approval"; $("#netdot").className = "dot bad";
  resetBtn("Run Another Sweep");
}
async function approveAll() {
  const b = $("#approveAllBtn"); if (b) { b.disabled = true; b.textContent = "Approving…"; }
  const res = await fn("demo-approve", { runId: state.runId });
  state.actions = state.actions.map((a) => ({ ...a, status: "approved" })); state.actions.forEach((a) => tl("action.approved", a.action_type.replace(/_/g, " "))); renderActions();
  if (res.status === "actioned") { tl("run.actioned"); phase("Actions executed", "issue receipt to seal", "#169B5A"); $("#sweepstate").textContent = "actioned"; renderReceipt(); }
}
async function issueReceipt() {
  const b = $("#issueBtn"); if (b) { b.disabled = true; b.textContent = "Sealing…"; }
  const r = await fn("demo-receipt", { runId: state.runId }); state.receipt = r; renderReceipt();
  const v = await fn("verify-receipt", { runId: state.runId, receipt: r.receipt }); state.receiptVerified = v.valid === true; renderReceipt();
  tl("receipt.issued", short(r.receiptHash)); phase("Sealed", "immutable receipt issued", "#1E2DFF"); $("#sweepstate").textContent = "sealed";
}
async function init() {
  buildGraph(); ["fintrust", "swiftcart", "pingline", "phylax"].forEach((k) => setNodeState(k, "idle"));
  try {
    state.config = await fn("demo-config");
    $("#participants").textContent = (state.config.orgs || []).length;
    if (state.config.model) $("#modelTag").textContent = `${state.config.model.name} ${state.config.model.version}`;
    if (state.config.backend) $("#backendTag").textContent = "psi: " + state.config.backend;
  } catch { /* offline */ }
  renderSignals(null);
  $("#runBtn").onclick = runSweep;
}
init();
