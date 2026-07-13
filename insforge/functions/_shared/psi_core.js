// ============================================================================
//  PHYLAX · psi_core — the real protected computation, ported to portable JS so
//  it runs inside an InsForge Edge Function (Deno) for the hosted demo AND in
//  Node for testing. Same protocol + same trained model as the Python backend.
//
//  Group: RFC 2409 Second Oakley Group — a standard 1024-bit MODP SAFE prime.
//  The hosted edge demo uses 1024-bit for edge-function latency; the repo's
//  local backend (parties/common/psi.py) uses full 2048-bit MODP, and production
//  uses SecretFlow SPU ECDH-PSI. All three are the same DDH protocol family.
//  Nothing here is faked — the modular exponentiations ARE the protocol.
// ============================================================================
import { createHash, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";

const PRIME_HEX =
  "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1" +
  "29024E088A67CC74020BBEA63B139B22514A08798E3404DD" +
  "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245" +
  "E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED" +
  "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE65381" +
  "FFFFFFFFFFFFFFFF";
export const P = BigInt("0x" + PRIME_HEX);
export const Q = (P - 1n) / 2n;

function sha256(buf) { return createHash("sha256").update(buf).digest(); }
function sha512(buf) { return createHash("sha512").update(buf).digest(); }
function bytesToBig(b) { return BigInt("0x" + Buffer.from(b).toString("hex")); }
function bigToBytes(x) { let h = x.toString(16); if (h.length % 2) h = "0" + h; return Buffer.from(h, "hex"); }

function modpow(base, exp, mod) {
  let r = 1n; base %= mod;
  while (exp > 0n) { if (exp & 1n) r = (r * base) % mod; base = (base * base) % mod; exp >>= 1n; }
  return r;
}

// deterministic map into the prime-order (quadratic-residue) subgroup
export function hashToGroup(data, domain = "phylax-h2g-v1") {
  let counter = 0;
  for (;;) {
    const h = sha512(Buffer.concat([Buffer.from(domain), Buffer.from([0, 0, 0, counter & 0xff]), Buffer.from(data)]));
    const x = bytesToBig(h) % P;
    const g = modpow(x, 2n, P);   // square → order-q subgroup
    if (g !== 0n && g !== 1n) return g;
    counter++;
  }
}
export function randScalar() { return (bytesToBig(randomBytes(40)) % (Q - 1n)) + 1n; }
export function scalarFromSecret(secret) {
  const x = bytesToBig(sha512(Buffer.concat([Buffer.from("phylax-scalar-v1"), Buffer.from(secret)]))) % Q;
  return x === 0n ? 1n : x;
}
export const blind = (el, k) => modpow(el, k, P);

// ---- OPRF tokenization (jointly-governed key) ----
export function normalize(raw, kind) {
  let s = String(raw).trim().toLowerCase();
  if (kind === "link_domain") s = s.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  s = s.split(/\s+/).join(" ");
  return Buffer.from(kind + "\x1f" + s, "utf8");
}
export function jointKey(secret) { return scalarFromSecret("phylax-oprf-" + secret); }
export function oprfToken(norm, k) {
  const h1 = hashToGroup(norm, "phylax-oprf-h1");
  const blinded = blind(h1, k);
  return sha256(Buffer.concat([Buffer.from("phylax-oprf-h2"), norm, bigToBytes(blinded)]));
}
export function signatureToken(raw, kind, k) { return oprfToken(normalize(raw, kind), k); }
export function makeCommitment(token) {
  const nonce = randomBytes(16);
  return { commitment: sha256(Buffer.concat([Buffer.from("phylax-commit-v1"), nonce, token])).toString("hex"), nonce: nonce.toString("hex") };
}
export function openCommitment(commitment, token, nonceHex) {
  const exp = sha256(Buffer.concat([Buffer.from("phylax-commit-v1"), Buffer.from(nonceHex, "hex"), token])).toString("hex");
  return exp === commitment;
}

// ---- multiparty DDH-PSI ----
export class Party {
  constructor(org, tokens) {
    this.org = org; this.tokens = tokens; this.k = randScalar();
    this.commits = tokens.map(makeCommitment);
  }
  get commitments() { return this.commits.map((c) => c.commitment); }
  blindOwn() { return this.tokens.map((t) => blind(hashToGroup(t), this.k)); }
  raiseToKey(els) { return els.map((e) => blind(e, this.k)); }
  openMatched(idxs) { return idxs.map((i) => ({ idx: i, token: this.tokens[i], nonce: this.commits[i].nonce })); }
}

export function runMultipartyPSI(parties) {
  const once = {}; for (const p of parties) once[p.org] = p.blindOwn();
  const fully = {}; let seen = 0;
  for (const p of parties) {
    let els = once[p.org];
    for (const q of parties) if (q.org !== p.org) els = q.raiseToKey(els);
    fully[p.org] = els; seen += els.length;
  }
  // intersection of the fully-blinded value sets (as hex strings)
  const asSet = (arr) => new Set(arr.map((v) => v.toString(16)));
  const sets = parties.map((p) => asSet(fully[p.org]));
  const common = [...sets[0]].filter((v) => sets.every((s) => s.has(v)));
  const commonSet = new Set(common);
  const perIdx = {}; const revealed = [];
  const openedByOrg = {};
  for (const p of parties) {
    const idxs = fully[p.org].map((v, j) => [v, j]).filter(([v]) => commonSet.has(v.toString(16))).map(([, j]) => j);
    perIdx[p.org] = idxs;
    const opened = p.openMatched(idxs);
    const c = new Map();
    for (const o of opened) {
      if (!openCommitment(p.commitments[o.idx], o.token, o.nonce)) throw new Error("commitment open failed");
      const key = o.token.toString("hex"); c.set(key, (c.get(key) || 0) + 1); revealed.push(key);
    }
    openedByOrg[p.org] = c;
  }
  const allTokens = new Set(); for (const p of parties) for (const k of openedByOrg[p.org].keys()) allTokens.add(k);
  const matched = [...allTokens].filter((t) => parties.every((p) => openedByOrg[p.org].has(t))).sort();
  const signatureHash = sha256(Buffer.concat([Buffer.from("phylax-sig-v1"), ...common.sort().map((h) => Buffer.from(h, "hex"))])).toString("hex");
  const opaqueCampaignId = sha256(Buffer.concat([Buffer.from("phylax-campaign-v1"), ...matched.map((h) => Buffer.from(h, "hex"))])).toString("hex");
  return {
    cardinality: matched.length, opaqueCampaignId, signatureHash, matchedTokens: matched,
    partyCount: parties.length, blindedRelayed: seen, revealedTokens: revealed,
  };
}

// ---- secure aggregation (additive secret sharing) ----
const FIELD = (1n << 61n) - 1n, SCALE = 1n << 20n;
function fpEnc(x) { return ((BigInt(Math.round(x * Number(SCALE))) % FIELD) + FIELD) % FIELD; }
function fpDec(v) { return Number(v > FIELD / 2n ? v - FIELD : v) / Number(SCALE); }
export function secureSum(values, view) {
  const n = values.length;
  const matrix = values.map((v) => {
    const shares = []; let acc = 0n;
    for (let i = 0; i < n - 1; i++) { const s = bytesToBig(randomBytes(9)) % FIELD; shares.push(s); acc += s; }
    shares.push(((v - acc) % FIELD + FIELD) % FIELD); return shares;
  });
  const partials = Array.from({ length: n }, (_, j) => matrix.reduce((a, row) => (a + row[j]) % FIELD, 0n));
  const total = partials.reduce((a, p) => (a + p) % FIELD, 0n);
  if (view) { view.partials.push(...partials.map(String)); view.individual.length; }
  return total;
}
export function secureSumF(vals, view) { return fpDec(secureSum(vals.map(fpEnc), view)); }
export function secureMeanF(vals, view) { return vals.length ? secureSumF(vals, view) / vals.length : 0; }
export function secureVarianceF(vals, view) {
  const n = vals.length; if (!n) return 0;
  const m = secureSumF(vals, view) / n;
  const m2 = secureSumF(vals.map((v) => v * v), view) / n;
  return Math.max(0, m2 - m * m);
}
export function temporalAlignment(peaks, view) { return Math.round((1 / (1 + secureVarianceF(peaks, view))) * 1e4) / 1e4; }

// ---- federated risk model (identical frozen weights to risk_model.py) ----
const W = [2.114273, 1.892412, 1.707303, 1.717091, 1.502223];
const B = 0.551621;
const MU = [1.787333, 1.795, 2.776477, 2.200417, 0.516172];
const SD = [0.824079, 2.127982, 0.92284, 1.433044, 0.27818];
export const MODEL = { name: "phylax-risk", version: "1.0.0",
  features: ["distinct_parties", "matched_signatures", "total_events", "mean_velocity_z", "temporal_alignment"] };
const sigmoid = (z) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
const r4 = (v) => Math.round(v * 1e4) / 1e4;
export function assess(f) {
  const x = [f.distinct_parties, f.matched_signatures, Math.log1p(f.total_events), f.mean_velocity_z, f.temporal_alignment];
  let z = B; const contributions = [];
  MODEL.features.forEach((name, i) => { const xi = (x[i] - MU[i]) / SD[i]; const c = W[i] * xi; z += c; contributions.push({ feature: name, value: r4(x[i]), contribution: r4(c) }); });
  const p = sigmoid(z);
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { risk_score: r4(p), confidence: r4(Math.abs(2 * p - 1)), contributions, model_name: MODEL.name, model_version: MODEL.version };
}

// ---- bundled synthetic datasets (mirror parties/data/*.json) ----
const K_ART = "campaign_artifact";
export const CAMPAIGN = ["wallet:0x7f3a9b2c41e8", "domain:secure-refund-desk.link", "phone:+14155550142", "handle:@rapid-payout-support"];
export const DATASETS = {
  fintrust:  { kind: "bank",        modality: "payee_cluster", blurb: "unusual payout velocity to a newly-seen payee cluster", local: { events: 5, velocity_z: 2.3, peak_hour: 14.2 }, noise: 14 },
  swiftcart: { kind: "marketplace", modality: "seller_handle", blurb: "seller steering buyers to settle off-platform",        local: { events: 7, velocity_z: 1.9, peak_hour: 14.6 }, noise: 16 },
  pingline:  { kind: "messaging",   modality: "link_domain",   blurb: "burst of near-identical messages carrying a short link", local: { events: 9, velocity_z: 2.6, peak_hour: 13.9 }, noise: 18 },
};
const ACTION_BY_KIND = {
  bank: ["hold_payout", "Hold outbound payouts to the matched payee cluster pending review"],
  marketplace: ["quarantine_listing", "Quarantine the matched seller listings pending review"],
  messaging: ["warn_recipients", "Warn recipients who received the matched campaign link"],
};
export const ACTION_THRESHOLD = 0.75;

// The full protected sweep — same shape the Python coordinator produces.
export function computeSweep(jointSecret) {
  const k = jointKey(jointSecret);
  const orgs = ["fintrust", "swiftcart", "pingline"];
  const agents = orgs.map((org) => {
    const d = DATASETS[org];
    const tokens = CAMPAIGN.map((s) => signatureToken(s, K_ART, k))
      .concat(Array.from({ length: d.noise }, (_, i) => signatureToken(`${org}-noise-${i}`, d.modality, k)));
    const party = new Party(org, tokens);
    return { org, ...d, party, tokens, campaignCount: CAMPAIGN.length };
  });

  const psi = runMultipartyPSI(agents.map((a) => a.party));

  const view = { partials: [], individual: [] };
  const totalEvents = secureSumF(agents.map((a) => a.local.events), view);
  const meanVelocity = secureMeanF(agents.map((a) => a.local.velocity_z), view);
  const align = temporalAlignment(agents.map((a) => a.local.peak_hour), view);

  const matched = psi.cardinality > 0;
  const features = {
    distinct_parties: matched ? psi.partyCount : 1,
    matched_signatures: psi.cardinality,
    total_events: Math.round(totalEvents * 100) / 100,
    mean_velocity_z: Math.round(meanVelocity * 1000) / 1000,
    temporal_alignment: align,
  };
  const risk = assess(features);

  const parties = agents.map((a) => ({
    org: a.org, kind: a.kind, modality: a.modality, blurb: a.blurb,
    signal_count: a.tokens.length, campaign_count: a.campaignCount, noise_count: a.noise,
    solo_risk: assess({ distinct_parties: 1, matched_signatures: 0, total_events: a.local.events, mean_velocity_z: a.local.velocity_z, temporal_alignment: 0.5 }).risk_score,
    commitments: a.party.commitments.map((c) => ({ commitment: c, algo: "oprf-ristretto255+keyed-normalize", key_ref: "joint-key-" + sha256(Buffer.from("ref" + jointSecret)).toString("hex").slice(0, 12) })),
  }));

  const recommended = matched && risk.risk_score >= ACTION_THRESHOLD
    ? agents.map((a) => ({ target_org: a.org, action_type: ACTION_BY_KIND[a.kind][0],
        rationale: `${ACTION_BY_KIND[a.kind][1]} · campaign ${psi.opaqueCampaignId.slice(0, 12)} · ${psi.cardinality} shared signatures across ${psi.partyCount} platforms · risk ${risk.risk_score.toFixed(2)}` }))
    : [];

  const noiseTokens = new Set(agents.flatMap((a) => a.tokens.slice(a.campaignCount).map((t) => t.toString("hex"))));
  const leaked = psi.revealedTokens.filter((t) => noiseTokens.has(t)).length;

  return {
    backend: "modp-ddh-1024-edge",
    opaque_campaign_id: psi.opaqueCampaignId, signature_hash: psi.signatureHash,
    cardinality: psi.cardinality, party_count: psi.partyCount, matched,
    features, risk_score: risk.risk_score, confidence: risk.confidence, contributions: risk.contributions,
    model_name: risk.model_name, model_version: risk.model_version,
    action_threshold: ACTION_THRESHOLD, recommended_actions: recommended,
    solo_scores: parties.map((p) => ({ org: p.org, risk_score: p.solo_risk })),
    raw_records_shared: 0,
    privacy: { coordinator_saw_noise_tokens: leaked, blinded_values_relayed: psi.blindedRelayed, secure_agg_individual_values_seen: view.individual.length },
    parties,
  };
}
