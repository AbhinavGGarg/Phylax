"""
PHYLAX · parties.common.signatures
===================================
Turns a partner's raw local observation into an opaque *campaign signature*
that is safe to bring to cross-party matching.

Two properties this guarantees (both are Phylax non-negotiables):

1.  NOT a plain hash of a low-entropy identifier. A raw payee handle, link
    domain, or seller id has little entropy — SHA-256 of it is trivially
    reversible by dictionary. Instead we run a **2HashDH Oblivious PRF** keyed by
    a JOINTLY-GOVERNED key: token = H2( norm, H1(norm)^K_joint ). Without the
    key K (in production, held jointly / threshold across the consortium; in the
    demo, a shared config secret) the token cannot be computed or inverted. This
    is the "OPRF-style preparation before PSI" the design requires.

2.  What the neutral control plane persists is a HIDING COMMITMENT to the token,
    not the token: commit = H( nonce , token ). Two partners who share a campaign
    produce equal *tokens* (so PSI can match them) but unequal *commitments* (so
    the control plane can never join them into a match by itself). The party
    keeps (token, nonce) and can open the commitment for matched items only.
"""
from __future__ import annotations
import hashlib
import secrets as _secrets
from dataclasses import dataclass

from .mpc_group import P, hash_to_group, blind, scalar_from_secret

# Canonical signal kinds a partner can contribute.
KIND_PAYEE_CLUSTER = "payee_cluster"      # bank: opaque payout-destination cluster
KIND_SELLER_HANDLE = "seller_handle"      # marketplace: seller moving off-platform
KIND_LINK_DOMAIN = "link_domain"          # messaging: suspicious link / short domain
KIND_CAMPAIGN_ARTIFACT = "campaign_artifact"  # shared infra all parties independently touch


def normalize(raw: str, kind: str) -> bytes:
    """Canonicalize a raw observation so equivalent inputs across partners agree."""
    s = raw.strip().lower()
    if kind == KIND_LINK_DOMAIN:
        # strip scheme + path, keep registrable-ish host
        s = s.replace("https://", "").replace("http://", "").split("/")[0]
        s = s.lstrip("www.")
    s = " ".join(s.split())
    return (kind + "\x1f" + s).encode("utf-8")


def joint_key(shared_secret: bytes) -> int:
    """The jointly-governed OPRF key K, derived from the consortium shared secret."""
    return scalar_from_secret(b"phylax-oprf-" + shared_secret)


def oprf_token(normalized: bytes, k_joint: int) -> bytes:
    """
    2HashDH OPRF: token = H2( norm , H1(norm)^K ). 32 bytes, high-entropy,
    non-invertible without K. Deterministic, so matching campaigns collide.
    """
    h1 = hash_to_group(normalized, domain=b"phylax-oprf-h1")
    blinded = blind(h1, k_joint)                      # H1(norm)^K in the group
    return hashlib.sha256(
        b"phylax-oprf-h2" + normalized + blinded.to_bytes((P.bit_length() + 7) // 8, "big")
    ).digest()


def signature_token(raw: str, kind: str, k_joint: int) -> bytes:
    """Full pipeline: raw observation -> normalized -> opaque OPRF campaign token."""
    return oprf_token(normalize(raw, kind), k_joint)


@dataclass(frozen=True)
class Commitment:
    commitment: str   # hex — what the neutral control plane stores
    nonce: str        # hex — kept private by the party, used to open


def make_commitment(token: bytes) -> Commitment:
    """Hiding, binding commitment to a token: H(nonce || token). Not comparable."""
    nonce = _secrets.token_bytes(16)
    c = hashlib.sha256(b"phylax-commit-v1" + nonce + token).hexdigest()
    return Commitment(commitment=c, nonce=nonce.hex())


def open_commitment(commitment_hex: str, token: bytes, nonce_hex: str) -> bool:
    """Verify a party's opened (token, nonce) matches what it committed centrally."""
    expect = hashlib.sha256(b"phylax-commit-v1" + bytes.fromhex(nonce_hex) + token).hexdigest()
    return _secrets.compare_digest(expect, commitment_hex)
