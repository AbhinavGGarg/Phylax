"""
PHYLAX · compute-core proofs (no network).
Run:  python3 -m pytest parties/tests/test_crypto.py -q
 or:  python3 parties/tests/test_crypto.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from common import risk_model
from common.mpc_group import P, Q, hash_to_group, blind, rand_exponent
from common.psi import Party, run_psi, run_multiparty_psi
from common.secure_agg import AggView, secure_sum_float, secure_variance_float, temporal_alignment
from common.signatures import (
    signature_token, joint_key, make_commitment, open_commitment,
    KIND_CAMPAIGN_ARTIFACT as ART, KIND_PAYEE_CLUSTER as PC, KIND_SELLER_HANDLE as SH, KIND_LINK_DOMAIN as LD,
)
from common.party import PartyAgent
from coordinator import run_protected_sweep

K = joint_key(b"unit-test-consortium-secret")


def _campaign_tokens(n=4):
    return [signature_token(f"artifact-{i}", ART, K) for i in range(n)]


def _party(org, kind, campaign, noise_prefix, noise_n):
    noise_kind = {"bank": PC, "marketplace": SH, "messaging": LD}[kind]
    toks = list(campaign) + [signature_token(f"{noise_prefix}-{i}", noise_kind, K) for i in range(noise_n)]
    return Party(org, toks)


# ---------------- group ----------------
def test_group_is_prime_order_and_commutative():
    h = hash_to_group(b"x")
    assert pow(h, Q, P) == 1                       # element has order q
    a, b = rand_exponent(), rand_exponent()
    assert blind(blind(h, a), b) == blind(blind(h, b), a)


# ---------------- PSI ----------------
def test_psi_finds_shared_campaign():
    camp = _campaign_tokens(4)
    res = run_psi([_party("fintrust", "bank", camp, "fin", 12),
                   _party("swiftcart", "marketplace", camp, "swc", 15),
                   _party("pingline", "messaging", camp, "png", 18)])
    assert res.cardinality == 4
    assert set(res.matched_tokens) == set(camp)
    assert res.party_count == 3


def test_psi_hides_non_matching_tokens():
    camp = _campaign_tokens(4)
    a = _party("fintrust", "bank", camp, "fin", 12)
    b = _party("swiftcart", "marketplace", camp, "swc", 15)
    c = _party("pingline", "messaging", camp, "png", 18)
    noise = (set(a.tokens) | set(b.tokens) | set(c.tokens)) - set(camp)
    res = run_multiparty_psi([a, b, c])
    # the coordinator must NEVER have seen a non-matching token
    assert not (set(res.view.revealed_tokens) & noise)
    assert set(res.view.revealed_tokens) == set(camp)


def test_psi_campaign_id_is_stable_across_runs():
    camp = _campaign_tokens(4)
    r1 = run_psi([_party("a", "bank", camp, "a", 3), _party("b", "marketplace", camp, "b", 3), _party("c", "messaging", camp, "c", 3)])
    r2 = run_psi([_party("a", "bank", camp, "a", 9), _party("b", "marketplace", camp, "b", 9), _party("c", "messaging", camp, "c", 9)])
    assert r1.opaque_campaign_id == r2.opaque_campaign_id   # fresh keys, same id


def test_psi_empty_when_disjoint():
    res = run_psi([_party("a", "bank", [], "a", 10), _party("b", "marketplace", [], "b", 10), _party("c", "messaging", [], "c", 10)])
    assert res.cardinality == 0


# ---------------- secure aggregation ----------------
def test_secure_sum_correct_and_hides_individuals():
    view = AggView()
    total = secure_sum_float([5.0, 7.0, 9.0], view)
    assert abs(total - 21.0) < 1e-6
    assert view.individual_values_seen == []          # never sees a raw value


def test_secure_variance():
    view = AggView()
    v = secure_variance_float([14.2, 14.6, 13.9], view)
    assert 0 <= v < 0.2                                # tightly co-timed
    assert temporal_alignment([14.2, 14.6, 13.9]) > 0.8


# ---------------- risk model ----------------
def test_risk_model_reproduces_frozen_weights():
    assert risk_model.verify_frozen() is True


def test_collective_risk_beats_every_solo():
    collective = risk_model.assess({"distinct_parties": 3, "matched_signatures": 4,
                                    "total_events": 21, "mean_velocity_z": 2.27, "temporal_alignment": 0.92})
    for velocity in (2.3, 1.9, 2.6):
        solo = risk_model.assess({"distinct_parties": 1, "matched_signatures": 0,
                                  "total_events": 7, "mean_velocity_z": velocity, "temporal_alignment": 0.5})
        assert solo.risk_score < 0.5 < collective.risk_score
    assert collective.risk_score > 0.9


# ---------------- OPRF signatures ----------------
def test_oprf_token_depends_on_joint_key():
    t1 = signature_token("wallet:0xabc", ART, joint_key(b"key-1"))
    t2 = signature_token("wallet:0xabc", ART, joint_key(b"key-2"))
    assert t1 != t2                                   # not a plain hash — key matters


def test_commitment_is_hiding_and_binding():
    tok = signature_token("wallet:0xabc", ART, K)
    c = make_commitment(tok)
    assert c.commitment != tok.hex()                  # commitment hides the token
    assert open_commitment(c.commitment, tok, c.nonce)
    assert not open_commitment(c.commitment, tok, "00" * 16)   # wrong nonce fails


# ---------------- full sweep invariants ----------------
def test_coordinator_sweep_invariants():
    out = run_protected_sweep("test-run", b"unit-test-consortium-secret", "unit-hmac-secret")
    s = out["summary"]
    assert s["cardinality"] == 4
    assert s["risk_score"] > 0.9
    assert s["raw_records_shared"] == 0
    assert s["privacy"]["coordinator_saw_noise_tokens"] == 0
    assert s["privacy"]["secure_agg_individual_values_seen"] == 0
    assert [c["phase"] for c in out["callbacks"]] == ["parties_ready", "protected_match", "risk_scored"]
    assert all(p["solo_risk"] < 0.5 for p in out["parties"])


if __name__ == "__main__":
    fns = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    fails = 0
    for n, f in fns:
        try:
            f(); print(f"  ✓ {n}")
        except Exception as e:
            fails += 1; print(f"  ✗ {n}: {e}")
    print(f"\n{len(fns) - fails}/{len(fns)} passed")
    sys.exit(1 if fails else 0)
