"""
PHYLAX · parties.common.psi
===========================
Multiparty ECDH/DDH Private Set Intersection over opaque campaign tokens.

This is the real protected computation — the same cryptographic family as
SecretFlow SPU's `ECDH_PSI_3PC` (commutative encryption in a DDH-hard group).
Set `PHYLAX_PSI_BACKEND=secretflow` in a party service that has SecretFlow
installed to route through SPU instead (see psi_secretflow.py); the default
pure-stdlib backend below runs everywhere and produces identical results.

Protocol (n parties, honest-but-curious), coordinator relays but never learns
non-matching inputs:

  1.  Each party i maps every token t to a group element H2G(t) and raises it to
      its OWN secret key k_i (which never leaves the party).
  2.  The coordinator routes each party's once-blinded set through every OTHER
      party, who each raise it to their key. After all keys are applied, every
      element is H2G(t)^K with K = k_1·k_2·…·k_n — a value equal across parties
      IFF the underlying token is equal.
  3.  The coordinator intersects the fully-blinded value sets. It sees only
      opaque group elements (DDH hides the tokens); it cannot invert them or
      test membership of any token it doesn't already hold.
  4.  For the MATCHED positions only, each party opens its token + commitment
      nonce. These are shared campaign signatures — the intended output — and are
      still opaque OPRF outputs, never raw identifiers. Non-matching tokens are
      NEVER revealed to anyone.

The neutral control plane persists only the derived opaque campaign id, the
cardinality, and a signature hash — never a token.
"""
from __future__ import annotations
import hashlib
import os
from collections import Counter
from dataclasses import dataclass, field
from typing import Callable

from .mpc_group import P, hash_to_group, blind, rand_exponent
from . import signatures as sig

_ELEM_BYTES = (P.bit_length() + 7) // 8


class PSIError(Exception):
    pass


class Party:
    """A single organization's PSI agent. Its secret key never leaves it."""

    def __init__(self, org_slug: str, tokens: list[bytes]):
        self.org = org_slug
        self.tokens = list(tokens)
        self.__k = rand_exponent()                       # secret; name-mangled
        self._commits = [sig.make_commitment(t) for t in self.tokens]

    @property
    def commitments(self) -> list[str]:
        return [c.commitment for c in self._commits]

    def blind_own(self) -> list[int]:
        """Step 1: H2G(t)^{k_i} for each own token (order preserved)."""
        return [blind(hash_to_group(t), self.__k) for t in self.tokens]

    def raise_to_key(self, elements: list[int]) -> list[int]:
        """Step 2: raise another party's set to our secret key, elementwise."""
        return [blind(e, self.__k) for e in elements]

    def open_matched(self, idxs: list[int]) -> list[tuple[int, bytes, str]]:
        """Step 4: reveal (index, token, nonce) for matched positions only."""
        return [(i, self.tokens[i], self._commits[i].nonce) for i in idxs]


@dataclass
class CoordinatorView:
    """Exactly what the coordinator observes — used to prove the privacy claim."""
    blinded_values_seen: int = 0
    revealed_tokens: list[bytes] = field(default_factory=list)  # matched only


@dataclass
class PSIResult:
    cardinality: int
    opaque_campaign_id: str
    signature_hash: str
    matched_tokens: list[bytes]
    per_party_matched_idx: dict
    party_count: int
    view: CoordinatorView
    backend: str = "modp-ddh"


def _elem_bytes(v: int) -> bytes:
    return v.to_bytes(_ELEM_BYTES, "big")


def run_multiparty_psi(parties: list[Party]) -> PSIResult:
    if len(parties) < 2:
        raise PSIError("PSI needs at least two parties")
    view = CoordinatorView()

    # Step 1: each party one-key-blinds its own tokens.
    once = {p.org: p.blind_own() for p in parties}

    # Step 2: route each set through every other party to reach H2G(t)^K.
    fully: dict[str, list[int]] = {}
    for p in parties:
        elems = once[p.org]
        for q in parties:
            if q.org != p.org:
                elems = q.raise_to_key(elems)
        fully[p.org] = elems
        view.blinded_values_seen += len(elems)

    # Step 3: intersect the fully-blinded value sets (coordinator sees opaque ints).
    common = set.intersection(*[set(fully[p.org]) for p in parties])
    per_idx = {p.org: [j for j, v in enumerate(fully[p.org]) if v in common]
               for p in parties}

    # Step 4: open matched tokens; verify each opens its own commitment; require
    # every party to agree on the same matched token multiset.
    opened_multisets: dict[str, Counter] = {}
    for p in parties:
        opened = p.open_matched(per_idx[p.org])
        c = Counter()
        for idx, token, nonce in opened:
            if not sig.open_commitment(p.commitments[idx], token, nonce):
                raise PSIError(f"party {p.org} failed to open commitment at {idx}")
            c[token] += 1
            view.revealed_tokens.append(token)
        opened_multisets[p.org] = c

    # A token is a true coordinated signature iff every party opened it.
    matched_tokens = sorted(
        t for t in set().union(*[set(c) for c in opened_multisets.values()])
        if all(t in opened_multisets[p.org] for p in parties)
    )

    signature_hash = hashlib.sha256(
        b"phylax-sig-v1" + b"".join(sorted(_elem_bytes(v) for v in common))
    ).hexdigest()
    opaque_campaign_id = hashlib.sha256(
        b"phylax-campaign-v1" + b"".join(matched_tokens)
    ).hexdigest()

    return PSIResult(
        cardinality=len(matched_tokens),
        opaque_campaign_id=opaque_campaign_id,
        signature_hash=signature_hash,
        matched_tokens=matched_tokens,
        per_party_matched_idx=per_idx,
        party_count=len(parties),
        view=view,
    )


def run_psi(parties: list[Party],
            backend: str | None = None,
            secretflow_runner: Callable[[list[Party]], PSIResult] | None = None
            ) -> PSIResult:
    """
    Backend-dispatching entrypoint.
    - "modp-ddh"    : the pure-stdlib protocol above (default; runs anywhere).
    - "secretflow"  : route through SecretFlow SPU ECDH_PSI (production party
                      services with SecretFlow installed); see psi_secretflow.py.
    """
    backend = backend or os.environ.get("PHYLAX_PSI_BACKEND", "modp-ddh")
    if backend == "secretflow":
        if secretflow_runner is None:
            from .psi_secretflow import run_secretflow_psi as secretflow_runner  # type: ignore
        res = secretflow_runner(parties)
        res.backend = "secretflow-spu-ecdh"
        return res
    return run_multiparty_psi(parties)
