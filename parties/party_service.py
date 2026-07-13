"""
PHYLAX · parties.party_service
==============================
FastAPI detection-agent service for ONE partner organization (fintrust,
swiftcart, or pingline). This is the TRUE distributed topology: each org runs its
own service, holding its own raw dataset + its own PSI secret key, so raw tokens
and the per-run secret exponent NEVER leave this process. The coordinator only
ever relays blinded group elements and signed aggregates between these services.

Wraps the existing (do-not-modify) core:
  - common.party.PartyAgent.load(org, joint_secret, data_dir) -> tokens/commitments/local
  - common.psi.Party.blind_own() / raise_to_key() / open_matched()

Wire-format note (IMPORTANT): PSI group elements are 2048-bit MODP integers.
JSON numbers cannot carry them without precision loss in most clients (e.g. JS
Number), so every group element crosses the wire as a DECIMAL STRING and is
parsed back with int(). This convention is consistent across /psi/blind-own
(response), /psi/raise (request + response). Small indices in /psi/open stay
plain JSON ints.

Logging: structured JSON, one object per line, keys ts/level/service/org plus
phase/elapsedMs where relevant. Raw tokens and nonces are NEVER logged.

Startup: the PartyAgent + psi.Party are built ONCE at import into module-level
singletons, so the party's secret exponent is stable for the whole session (the
blind/raise/open steps of a run must all use the same key). Run this service with
a SINGLE uvicorn worker (the default CMD) — multiple workers would each hold a
different key and break the protocol.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

# Make `common` importable whether launched as `uvicorn party_service:app` from
# parties/ (the Docker WORKDIR) or from a different cwd.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException          # noqa: E402
from pydantic import BaseModel                       # noqa: E402

from common.party import PartyAgent                  # noqa: E402
from common.psi import Party                         # noqa: E402

VALID_ORGS = ("fintrust", "swiftcart", "pingline")
ORG = os.environ.get("PHYLAX_ORG", "").strip().lower()
JOINT_SECRET = os.environ.get("PHYLAX_JOINT_SECRET", "demo-consortium-shared-secret")
DATA_DIR = os.environ.get("PHYLAX_DATA_DIR") or None
BACKEND = os.environ.get("PHYLAX_PSI_BACKEND", "modp-ddh")
SERVICE = "party"


# --------------------------------------------------------------------------- #
# Structured JSON logging (inline formatter; one JSON object per line).        #
# Never emit a raw token or nonce value into a log record.                     #
# --------------------------------------------------------------------------- #
class _JsonFormatter(logging.Formatter):
    def __init__(self, base: dict):
        super().__init__()
        self._base = base

    def format(self, record: logging.LogRecord) -> str:
        out = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc)
            .isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "level": record.levelname.lower(),
        }
        out.update(self._base)                       # service, org
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            for k, v in fields.items():
                if v is not None:
                    out[k] = v
        msg = record.getMessage()
        if msg:
            out["msg"] = msg
        return json.dumps(out, separators=(",", ":"))


_logger = logging.getLogger("phylax.party")
_logger.setLevel(logging.INFO)
_logger.propagate = False
if not _logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(_JsonFormatter({"service": SERVICE, "org": ORG}))
    _logger.addHandler(_handler)


def _log(msg: str, level: int = logging.INFO, **fields) -> None:
    _logger.log(level, msg, extra={"fields": fields})


# --------------------------------------------------------------------------- #
# Boot: load this org's agent + build its stable PSI party ONCE.               #
# --------------------------------------------------------------------------- #
def _boot() -> tuple[PartyAgent, Party]:
    if ORG not in VALID_ORGS:
        raise RuntimeError(
            f"PHYLAX_ORG must be one of {VALID_ORGS}; got {ORG!r}")
    agent = PartyAgent.load(ORG, JOINT_SECRET.encode(), DATA_DIR)
    party = agent.psi_party()          # its secret exponent is fixed for this process
    return agent, party


AGENT, PARTY = _boot()
_log("party service ready", phase="startup",
     tokens=len(AGENT.tokens), campaigns=AGENT.campaign_count,
     noise=AGENT.noise_count, key_ref=AGENT.key_ref, backend=BACKEND)


# --------------------------------------------------------------------------- #
# Request models                                                               #
# --------------------------------------------------------------------------- #
class RaiseBody(BaseModel):
    # Decimal strings of 2048-bit group elements (see wire-format note above).
    elements: list[str]


class OpenBody(BaseModel):
    idxs: list[int]


app = FastAPI(title=f"PHYLAX party · {ORG}", version="1.0.0")


@app.get("/health")
def health():
    return {"status": "ok", "org": ORG, "tokens": len(AGENT.tokens)}


@app.post("/psi/blind-own")
def psi_blind_own():
    """PSI step 1: H2G(t)^{k_self} for each own token (order preserved)."""
    t0 = time.time()
    elements = [str(v) for v in PARTY.blind_own()]        # int -> decimal string
    _log("blinded own tokens", phase="psi.blind_own",
         count=len(elements), elapsedMs=int((time.time() - t0) * 1000))
    return {"elements": elements}


@app.post("/psi/raise")
def psi_raise(body: RaiseBody):
    """PSI step 2: raise a peer's blinded set to our secret key, elementwise."""
    t0 = time.time()
    try:
        peer = [int(s) for s in body.elements]           # decimal string -> int
    except (ValueError, TypeError):
        raise HTTPException(status_code=422,
                            detail="elements must be decimal-integer strings")
    raised = [str(v) for v in PARTY.raise_to_key(peer)]  # int -> decimal string
    _log("raised peer set to our key", phase="psi.raise",
         count=len(raised), elapsedMs=int((time.time() - t0) * 1000))
    return {"elements": raised}


@app.post("/psi/open")
def psi_open(body: OpenBody):
    """PSI step 4: reveal (idx, token, nonce) for MATCHED positions only."""
    t0 = time.time()
    try:
        opened = PARTY.open_matched(body.idxs)
    except IndexError:
        raise HTTPException(status_code=422,
                            detail="idx out of range for this party's token set")
    # token is bytes -> hex; nonce is already a hex string. Neither is logged.
    payload = [{"idx": i, "token": tok.hex(), "nonce": nonce}
               for (i, tok, nonce) in opened]
    _log("opened matched positions", phase="psi.open",
         count=len(payload), elapsedMs=int((time.time() - t0) * 1000))
    return {"opened": payload}


@app.get("/commitments")
def commitments():
    """Hiding commitments for the neutral control plane (not comparable)."""
    rows = AGENT.commitment_rows()
    _log("served commitments", phase="commitments", count=len(rows))
    return {"org": ORG, "key_ref": AGENT.key_ref, "commitments": rows}


@app.get("/features")
def features():
    """
    This party's PRIVATE local features (events / velocity_z / peak_hour).

    DEMO SEAM: in the real protocol these never leave in clear — each value is
    additively secret-shared into secure aggregation (common/secure_agg.py) so
    that neither the coordinator nor any peer ever sees this org's individual
    contribution. This endpoint returns them directly only to keep the local
    demo's secure-aggregation wiring legible. Values are NOT logged.
    """
    _log("served local features", phase="features")
    return {
        "org": ORG,
        "features": AGENT.local,
        "_note": ("demo seam — in production these are additively secret-shared "
                  "into secure aggregation, never sent in the clear"),
    }
