// PHYLAX · verify-receipt
// Anyone holding a receipt can verify it: recompute the canonical hash + HMAC and
// compare against what was sealed on the run. Returns only integrity booleans and
// hashes — safe to expose. This is the auditor's trust anchor.
import {
  admin, env, canonical, sha256Hex, hmacHex, timingSafeEqual, getRun, json, fail, handle,
} from "../_shared/core.ts";

const BUCKET = "phylax-artifacts";

export default (req: Request) => handle(req, async (req) => {
  const body = req.method === "GET"
    ? Object.fromEntries(new URL(req.url).searchParams)
    : await req.json().catch(() => ({}));
  const runId = body?.runId;
  if (!runId) return fail("bad_request", "runId is required", 400);

  const db = admin();
  const run = await getRun(db, runId);
  if (!run) return fail("not_found", "run not found", 404);
  if (!run.receipt_hash) return fail("no_receipt", "run has no issued receipt", 409);

  // receipt body: prefer one supplied by the caller, else fetch from Storage
  let receipt = body?.receipt;
  if (!receipt) {
    try {
      const { data: blob } = await (db as any).storage.from(BUCKET).download(`runs/${runId}/receipt.json`);
      const text = typeof blob?.text === "function" ? await blob.text() : String(blob ?? "");
      receipt = JSON.parse(text).receipt;
    } catch {
      return fail("unavailable", "receipt body not supplied and not retrievable from storage", 422);
    }
  }

  const canonicalReceipt = canonical(receipt);
  const computedHash = "sha256:" + await sha256Hex(canonicalReceipt);
  const computedSig = await hmacHex(env("RECEIPT_SIGNING_KEY"), canonicalReceipt);

  const hashMatches = timingSafeEqual(computedHash, run.receipt_hash);
  const signatureValid = run.receipt_signature ? timingSafeEqual(computedSig, run.receipt_signature) : false;

  return json({
    runId,
    valid: hashMatches && signatureValid,
    hashMatches,
    signatureValid,
    computedHash,
    storedHash: run.receipt_hash,
    issuedAt: run.receipt_issued_at,
  });
});
