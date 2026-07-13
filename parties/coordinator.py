"""
PHYLAX · coordinator
====================
The protected coordinator/runner. Given a run id, it drives the three party
agents through the real protected computation and emits a sequence of SIGNED
phase callbacks for the control plane's `receive-worker-callback` edge function.

It NEVER emits a raw signal, token, or vector — only: opaque campaign id,
policy-permitted aggregate features, a derived risk score, and proof hashes.

Phases emitted (each HMAC-signed, with nonce + ts for replay protection):
  1. parties_ready   — batch metadata + hiding commitments per party
  2. protected_match — opaque campaign id, cardinality, signature hash, backend
  3. risk_scored     — permitted aggregate features, risk score, model version,
                        per-feature contributions, solo scores, recommended actions

Run in-process via `run_protected_sweep(...)`, or as a subprocess:
    python3 coordinator.py --run-id <id> --joint-secret <s> --hmac-secret <s>
which prints one JSON object {summary, callbacks, parties} to stdout.
"""
from __future__ import annotations
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from common import risk_model, signing                       # noqa: E402
from common.party import PartyAgent                          # noqa: E402
from common.psi import run_psi                               # noqa: E402
from common.secure_agg import (                              # noqa: E402
    AggView, secure_sum_float, secure_mean_float, temporal_alignment)

PARTY_ORGS = ["fintrust", "swiftcart", "pingline"]
ACTION_THRESHOLD = 0.75
ACTION_BY_KIND = {
    "bank":        ("hold_payout",        "Hold outbound payouts to the matched payee cluster pending review"),
    "marketplace": ("quarantine_listing", "Quarantine the matched seller listings pending review"),
    "messaging":   ("warn_recipients",    "Warn recipients who received the matched campaign link"),
}


def _rand_nonce() -> str:
    return signing.hashlib.sha256(os.urandom(16)).hexdigest()[:24]


def _sign(hmac_secret: str, run_id: str, phase: str, body: dict) -> dict:
    # Sign the EXACT canonical envelope string; the control plane verifies the
    # same bytes ({signed, sig}) — no cross-language JSON canonicalization risk.
    envelope = {"runId": run_id, "phase": phase, "nonce": _rand_nonce(),
                "ts": int(time.time()), "body": body}
    signed = signing.canonical(envelope).decode()
    return {"phase": phase, "signed": signed, "sig": signing.sign_message(hmac_secret, signed)}


def run_protected_sweep(run_id: str, joint_secret: bytes, hmac_secret: str,
                        backend: str | None = None,
                        data_dir: str | None = None) -> dict:
    t0 = time.time()
    agents = [PartyAgent.load(org, joint_secret, data_dir) for org in PARTY_ORGS]

    # ---- phase 1: parties ready ----
    parties_payload = []
    parties_public = []
    for a in agents:
        parties_payload.append({"org": a.org, "batch": a.batch_meta(),
                                "commitments": a.commitment_rows()})
        solo = a.solo_assessment()
        parties_public.append({
            "org": a.org, "kind": a.kind, "modality": a.modality, "blurb": a.blurb,
            "signal_count": len(a.tokens), "campaign_count": a.campaign_count,
            "noise_count": a.noise_count, "solo_risk": solo.risk_score,
        })

    # ---- phase 2: protected match (REAL PSI) ----
    t_match = time.time()
    psi = run_psi([a.psi_party() for a in agents], backend=backend)
    match_ms = int((time.time() - t_match) * 1000)

    # ---- phase 3: secure aggregation of PERMITTED features + risk score ----
    agg = AggView()
    total_events = secure_sum_float([float(a.local["events"]) for a in agents], agg)
    mean_velocity = secure_mean_float([float(a.local["velocity_z"]) for a in agents], agg)
    align = temporal_alignment([float(a.local["peak_hour"]) for a in agents], agg)

    matched = psi.cardinality > 0
    features = {
        "distinct_parties": psi.party_count if matched else 1,
        "matched_signatures": psi.cardinality,
        "total_events": round(total_events, 2),
        "mean_velocity_z": round(mean_velocity, 3),
        "temporal_alignment": align,
    }
    assessment = risk_model.assess(features)

    recommended = []
    if matched and assessment.risk_score >= ACTION_THRESHOLD:
        short = psi.opaque_campaign_id[:12]
        for a in agents:
            atype, rationale = ACTION_BY_KIND[a.kind]
            recommended.append({
                "target_org": a.org, "action_type": atype,
                "rationale": f"{rationale} · campaign {short} · "
                             f"{psi.cardinality} shared signatures across "
                             f"{psi.party_count} platforms · risk {assessment.risk_score:.2f}",
            })

    # privacy accounting — provable, not decorative
    noise_tokens = set()
    for a in agents:
        noise_tokens |= set(a.tokens[a.campaign_count:])
    leaked = len(set(psi.view.revealed_tokens) & noise_tokens)

    summary = {
        "runId": run_id,
        "backend": psi.backend,
        "opaque_campaign_id": psi.opaque_campaign_id,
        "signature_hash": psi.signature_hash,
        "cardinality": psi.cardinality,
        "party_count": psi.party_count,
        "matched": matched,
        "features": features,
        "risk_score": assessment.risk_score,
        "confidence": assessment.confidence,
        "contributions": assessment.contributions,
        "model_name": assessment.model_name,
        "model_version": assessment.model_version,
        "params_hash": risk_model.params_hash(),
        "action_threshold": ACTION_THRESHOLD,
        "recommended_actions": recommended,
        "solo_scores": [{"org": p["org"], "risk_score": p["solo_risk"]} for p in parties_public],
        "raw_records_shared": 0,
        "privacy": {
            "coordinator_saw_noise_tokens": leaked,       # MUST be 0
            "blinded_values_relayed": psi.view.blinded_values_seen,
            "secure_agg_individual_values_seen": len(agg.individual_values_seen),  # MUST be 0
            "protected_match_ms": match_ms,
        },
        "elapsed_ms": int((time.time() - t0) * 1000),
    }

    callbacks = [
        _sign(hmac_secret, run_id, "parties_ready", {"parties": parties_payload}),
        _sign(hmac_secret, run_id, "protected_match", {
            "opaque_campaign_id": psi.opaque_campaign_id,
            "signature_hash": psi.signature_hash,
            "cardinality": psi.cardinality, "party_count": psi.party_count,
            "backend": psi.backend, "protected_match_ms": match_ms}),
        _sign(hmac_secret, run_id, "risk_scored", {
            "features": features, "risk_score": assessment.risk_score,
            "confidence": assessment.confidence, "contributions": assessment.contributions,
            "model_name": assessment.model_name, "model_version": assessment.model_version,
            "params_hash": risk_model.params_hash(),
            "recommended_actions": recommended,
            "solo_scores": summary["solo_scores"]}),
    ]

    return {"summary": summary, "callbacks": callbacks, "parties": parties_public}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-id", required=True)
    ap.add_argument("--joint-secret", default=os.environ.get("PHYLAX_JOINT_SECRET", "demo-consortium-shared-secret"))
    ap.add_argument("--hmac-secret", default=os.environ.get("WORKER_HMAC_SECRET", "demo-worker-hmac-secret"))
    ap.add_argument("--backend", default=os.environ.get("PHYLAX_PSI_BACKEND"))
    ap.add_argument("--data-dir", default=None)
    args = ap.parse_args()
    out = run_protected_sweep(args.run_id, args.joint_secret.encode(), args.hmac_secret,
                              backend=args.backend, data_dir=args.data_dir)
    json.dump(out, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
