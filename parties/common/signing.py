"""
PHYLAX · parties.common.signing
===============================
Message authentication for worker→control-plane callbacks and for incident
receipts. Canonical JSON + HMAC-SHA256 with a dedicated per-purpose secret.

Trust model (documented honestly): in the DEMO, party services and the control
plane share symmetric HMAC secrets (WORKER_HMAC_SECRET, RECEIPT_SIGNING_KEY). In
PRODUCTION each organization holds an independent Ed25519 signing key and the
control plane verifies against the org's public `verify_key` — no shared symmetric
secret. The wire format (canonical body + `sig`) is identical; only the primitive
changes. See README "Security model & trust boundary".
"""
from __future__ import annotations
import hashlib
import hmac
import json


def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(obj) -> str:
    return "sha256:" + hashlib.sha256(canonical(obj)).hexdigest()


def sign(secret: str, payload: dict) -> str:
    return hmac.new(secret.encode(), canonical(payload), hashlib.sha256).hexdigest()


def sign_message(secret: str, message: str) -> str:
    """HMAC over an EXACT string — the control plane verifies against the same
    bytes, so there is no cross-language canonical-JSON ambiguity on the wire."""
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def verify(secret: str, payload: dict, signature: str) -> bool:
    expected = sign(secret, payload)
    return hmac.compare_digest(expected, signature or "")


def make_receipt_hash(body: dict) -> str:
    return digest(body)
