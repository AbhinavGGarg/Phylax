"""
PHYLAX · parties.common.party
=============================
A single organization's detection agent. It owns its raw dataset, computes the
opaque OPRF campaign tokens + hiding commitments, and exposes ONLY:
  - a PSI Party (blinded tokens; raw never leaves)
  - hiding commitments for the neutral control plane (not comparable)
  - its private local features (which only ever enter secure aggregation)
  - the batch metadata (counts) safe to register centrally

Raw signals never leave this object.
"""
from __future__ import annotations
import json
import os
from dataclasses import dataclass

from . import signatures as sig
from . import risk_model
from .psi import Party

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


@dataclass
class PartyAgent:
    org: str
    kind: str
    modality: str
    blurb: str
    tokens: list          # list[bytes]
    commitments: list     # list[str] hex (parallel to tokens)
    nonces: list          # list[str] hex (kept private)
    local: dict           # private local features
    campaign_count: int
    noise_count: int
    key_ref: str

    @classmethod
    def load(cls, org: str, joint_secret: bytes, data_dir: str | None = None) -> "PartyAgent":
        path = os.path.join(data_dir or DATA_DIR, f"{org}.json")
        with open(path) as fh:
            d = json.load(fh)
        k = sig.joint_key(joint_secret)
        key_ref = "joint-key-" + sig.hashlib.sha256(b"ref" + joint_secret).hexdigest()[:12]

        tokens, commits, nonces = [], [], []
        # shared campaign artifacts (identical raw across all parties -> equal tokens)
        for s in d["campaign"]["signatures"]:
            t = sig.signature_token(s, sig.KIND_CAMPAIGN_ARTIFACT, k)
            c = sig.make_commitment(t)
            tokens.append(t); commits.append(c.commitment); nonces.append(c.nonce)
        # party-unique noise (own modality -> never collides across parties)
        for n in d["noise"]:
            t = sig.signature_token(n["raw"], d["modality"], k)
            c = sig.make_commitment(t)
            tokens.append(t); commits.append(c.commitment); nonces.append(c.nonce)

        return cls(org=org, kind=d["kind"], modality=d["modality"], blurb=d["blurb"],
                   tokens=tokens, commitments=commits, nonces=nonces,
                   local=d["campaign"]["local"],
                   campaign_count=len(d["campaign"]["signatures"]),
                   noise_count=len(d["noise"]), key_ref=key_ref)

    def psi_party(self) -> Party:
        p = Party(self.org, self.tokens)
        # reuse our precomputed commitments so central commitments == PSI openings
        p._commits = [sig.Commitment(commitment=c, nonce=n)
                      for c, n in zip(self.commitments, self.nonces)]
        return p

    def batch_meta(self) -> dict:
        return {"org": self.org, "label": f"{self.modality} signals ({self.blurb})",
                "signal_count": len(self.tokens)}

    def commitment_rows(self) -> list[dict]:
        return [{"commitment": c, "algo": "oprf-ristretto255+keyed-normalize",
                 "key_ref": self.key_ref} for c in self.commitments]

    def solo_assessment(self):
        """What THIS partner could conclude ALONE — deliberately weak: it sees one
        platform, no cross-party match, no co-timing. Below any action threshold."""
        return risk_model.assess({
            "distinct_parties": 1,
            "matched_signatures": 0,
            "total_events": self.local["events"],
            "mean_velocity_z": self.local["velocity_z"],
            "temporal_alignment": 0.5,
        })
