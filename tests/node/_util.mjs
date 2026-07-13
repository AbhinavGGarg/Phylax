// Test helpers: craft signed worker-callback envelopes exactly as the coordinator
// does ({signed, sig} where sig = HMAC-SHA256(secret, signed) over the exact string).
import crypto from "node:crypto";

export function hmac(secret, message) {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

export function signEnvelope(secret, { runId, phase, body, ts, nonce }) {
  const env = {
    runId, phase, body,
    nonce: nonce || crypto.randomBytes(12).toString("hex"),
    ts: ts ?? Math.floor(Date.now() / 1000),
  };
  const signed = JSON.stringify(env);
  return { signed, sig: hmac(secret, signed), nonce: env.nonce };
}

// Keys a realtime payload is allowed to carry (safe metadata only).
export const ALLOWED_RT_KEYS = new Set([
  "runId", "status", "event", "riskScore", "confidence", "matchCardinality",
  "campaignClusterId", "rawRecordsShared", "reason", "at", "orgId",
  "actionRequestId", "actionType", "targetOrgId", "decision", "meta", "source", "messageId", "timestamp",
]);

export const FORBIDDEN_KEYS = new Set([
  "raw", "message", "email", "phone", "account", "token", "tokens",
  "embedding", "embeddings", "vector", "vectors", "watchlist", "pii", "nonce", "signed", "sig",
]);
