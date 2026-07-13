"""
PHYLAX · parties.common.mpc_group
=================================
The prime-order group Phylax's ECDH/DDH private-set-intersection runs in.

We use the RFC 3526 2048-bit MODP safe prime p = 2q + 1. The quadratic residues
mod p form a subgroup of prime order q, where the Decisional Diffie-Hellman
assumption holds — exactly the hardness the PSI relies on to hide non-matching
elements. `hash_to_group` maps arbitrary bytes into that prime-order subgroup by
squaring, so every group element we exponentiate has order q.

This is the same cryptographic family as SecretFlow SPU's `ECDH_PSI_3PC`
(elliptic-curve DDH). We use a MODP group here because it runs with only the
Python standard library — no native wheels — which keeps the local demo
reproducible on any machine. The production party services use SecretFlow SPU on
a real curve (see parties/common/psi.py :: run_psi and Dockerfile.party).

Nothing here is a mock: the modular exponentiations are the real protocol.
"""
from __future__ import annotations
import hashlib
import secrets

# RFC 3526, Group 14 (2048-bit MODP). A safe prime: (p-1)/2 is also prime.
_SAFE_PRIME_HEX = (
    "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1"
    "29024E088A67CC74020BBEA63B139B22514A08798E3404DD"
    "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245"
    "E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED"
    "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D"
    "C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F"
    "83655D23DCA3AD961C62F356208552BB9ED529077096966D"
    "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B"
    "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9"
    "DE2BCBF6955817183995497CEA956AE515D2261898FA0510"
    "15728E5A8AACAA68FFFFFFFFFFFFFFFF"
)

P: int = int(_SAFE_PRIME_HEX, 16)
Q: int = (P - 1) // 2          # prime order of the QR subgroup
GENERATOR: int = 2


def _is_probable_prime(n: int, rounds: int = 8) -> bool:
    """Miller-Rabin. Used once at import to prove the embedded prime is intact."""
    if n < 2:
        return False
    for sp in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        if n % sp == 0:
            return n == sp
    d, r = n - 1, 0
    while d % 2 == 0:
        d //= 2
        r += 1
    for _ in range(rounds):
        a = 2 + secrets.randbelow(n - 3)
        x = pow(a, d, n)
        if x == 1 or x == n - 1:
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def _self_check() -> None:
    # Fail LOUDLY at import if the embedded prime was ever corrupted/mistyped,
    # rather than silently running PSI in a broken (insecure) group.
    if P.bit_length() != 2048:
        raise RuntimeError(f"MODP prime has {P.bit_length()} bits, expected 2048")
    if not _is_probable_prime(P):
        raise RuntimeError("embedded modulus is not prime")
    if not _is_probable_prime(Q):
        raise RuntimeError("modulus is not a SAFE prime ((p-1)/2 not prime)")


_self_check()


def hash_to_group(data: bytes, domain: bytes = b"phylax-h2g-v1") -> int:
    """
    Deterministically map bytes into the prime-order (QR) subgroup.

    We hash with a domain separator into a wide integer, reduce mod p, then
    square — squaring lands the value in the subgroup of quadratic residues,
    which has prime order q. Rejection of the degenerate {0,1} keeps every
    output a true order-q generator.
    """
    counter = 0
    while True:
        h = hashlib.sha512(domain + counter.to_bytes(4, "big") + data).digest()
        x = int.from_bytes(h, "big") % P
        g = pow(x, 2, P)          # force into the order-q QR subgroup
        if g not in (0, 1):
            return g
        counter += 1


def rand_exponent() -> int:
    """A fresh secret scalar in [1, q-1] — a party's per-run private DDH key."""
    return 1 + secrets.randbelow(Q - 1)


def scalar_from_secret(secret: bytes) -> int:
    """
    Derive a NON-ZERO scalar in [1, q-1] from a shared secret. Used for the
    jointly-governed OPRF key so all parties evaluate the same PRF.
    """
    x = int.from_bytes(hashlib.sha512(b"phylax-scalar-v1" + secret).digest(), "big") % Q
    return x if x != 0 else 1


def blind(element: int, scalar: int) -> int:
    """Raise a group element to a secret scalar: the ECDH/DDH blinding step."""
    return pow(element, scalar, P)
