"""
Deterministically generate the three partners' synthetic local datasets.

Ground truth: ONE coordinated campaign whose shared infrastructure (4 artifacts)
is independently touched by all three platforms, wrapped in party-unique noise so
that no single platform can see the coordination. Run:  python3 _generate.py
"""
import json
import os
import random

HERE = os.path.dirname(__file__)

# The coordinated campaign's shared infrastructure — the SAME four artifacts are
# independently observed by bank, marketplace, and messaging. These are what the
# protected match will (privately) discover in common.
CAMPAIGN = [
    "wallet:0x7f3a9b2c41e8",
    "domain:secure-refund-desk.link",
    "phone:+14155550142",
    "handle:@rapid-payout-support",
]

# Each partner: its modality, and its PRIVATE local features for the campaign
# slice it sees (event volume, local anomaly z-score, burst peak hour in a 24h
# window). Individually unremarkable; jointly damning.
PARTIES = {
    "fintrust": dict(
        kind="bank", modality="payee_cluster",
        blurb="unusual payout velocity to a newly-seen payee cluster",
        local=dict(events=5, velocity_z=2.3, peak_hour=14.2),
        noise_prefix="payee-cluster", noise_n=14),
    "swiftcart": dict(
        kind="marketplace", modality="seller_handle",
        blurb="seller steering buyers to settle off-platform",
        local=dict(events=7, velocity_z=1.9, peak_hour=14.6),
        noise_prefix="seller", noise_n=16),
    "pingline": dict(
        kind="messaging", modality="link_domain",
        blurb="burst of near-identical messages carrying a short link",
        local=dict(events=9, velocity_z=2.6, peak_hour=13.9),
        noise_prefix="msg-link", noise_n=18),
}


def build(org, spec, seed):
    rng = random.Random(seed)
    noise = []
    for i in range(spec["noise_n"]):
        noise.append({
            "raw": f"{spec['noise_prefix']}-{rng.randint(1000,9999)}-{i}",
            "events": rng.randint(1, 4),
            "velocity_z": round(rng.uniform(0.1, 1.4), 2),
            "peak_hour": round(rng.uniform(0.0, 24.0), 1),
        })
    return {
        "org": org,
        "kind": spec["kind"],
        "modality": spec["modality"],
        "blurb": spec["blurb"],
        "campaign": {
            "join_kind": "campaign_artifact",
            "signatures": CAMPAIGN,
            "local": spec["local"],
        },
        "noise": noise,
    }


def main():
    for idx, (org, spec) in enumerate(PARTIES.items()):
        data = build(org, spec, seed=1000 + idx)
        path = os.path.join(HERE, f"{org}.json")
        with open(path, "w") as fh:
            json.dump(data, fh, indent=2)
        print("wrote", path, f"({len(data['noise'])} noise + {len(CAMPAIGN)} campaign)")


if __name__ == "__main__":
    main()
