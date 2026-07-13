"""
PHYLAX · parties.coordinator_service
====================================
FastAPI wrapper around the protected coordinator/runner. This is the HTTP
entrypoint that the InsForge `dispatch-party-run` edge function would POST to in
production; in the local demo the host (control-plane/server.mjs) spawns the
coordinator directly instead, so this service and that path produce identical
signed callbacks.

It wraps the existing (do-not-modify) coordinator.run_protected_sweep, which
drives the three party agents through the REAL PSI/MPC sweep in-process and
returns {summary, callbacks, parties}. It NEVER returns or logs a raw signal,
token, or vector — only opaque campaign ids, permitted aggregates, a risk score,
and proof hashes.

Logging: structured JSON, one object per line, keys ts/level/service/runId plus
phase/elapsedMs/resultHash where relevant. `resultHash` carries ONLY the opaque
campaign id + signature hash — never raw records.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

# Make `common` + `coordinator` importable regardless of launch cwd.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException           # noqa: E402
from pydantic import BaseModel                        # noqa: E402

import coordinator                                    # noqa: E402  (parties/coordinator.py)

BACKEND = os.environ.get("PHYLAX_PSI_BACKEND") or "modp-ddh"
JOINT_SECRET = os.environ.get("PHYLAX_JOINT_SECRET", "demo-consortium-shared-secret")
WORKER_HMAC_SECRET = os.environ.get("WORKER_HMAC_SECRET", "demo-worker-hmac-secret")
SERVICE = "coordinator"


# --------------------------------------------------------------------------- #
# Structured JSON logging (inline formatter; one JSON object per line).        #
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
        out.update(self._base)                        # service
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            for k, v in fields.items():
                if v is not None:
                    out[k] = v
        msg = record.getMessage()
        if msg:
            out["msg"] = msg
        return json.dumps(out, separators=(",", ":"))


_logger = logging.getLogger("phylax.coordinator")
_logger.setLevel(logging.INFO)
_logger.propagate = False
if not _logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(_JsonFormatter({"service": SERVICE}))
    _logger.addHandler(_handler)


def _log(msg: str, level: int = logging.INFO, **fields) -> None:
    _logger.log(level, msg, extra={"fields": fields})


_log("coordinator service ready", phase="startup", backend=BACKEND,
     joint_secret_set=bool(os.environ.get("PHYLAX_JOINT_SECRET")),
     worker_hmac_set=bool(os.environ.get("WORKER_HMAC_SECRET")))


# --------------------------------------------------------------------------- #
# Request model                                                                #
# --------------------------------------------------------------------------- #
class RunBody(BaseModel):
    runId: str


app = FastAPI(title="PHYLAX coordinator", version="1.0.0")


@app.get("/health")
def health():
    return {"status": "ok", "backend": BACKEND}


@app.post("/run")
def run(body: RunBody):
    """Run the protected sweep and return {summary, callbacks, parties}."""
    t0 = time.time()
    _log("protected sweep requested", runId=body.runId, phase="run.dispatch",
         backend=BACKEND)
    try:
        result = coordinator.run_protected_sweep(
            body.runId, JOINT_SECRET.encode(), WORKER_HMAC_SECRET, backend=BACKEND)
    except Exception as exc:                           # fail-closed, no raw leak
        _log("protected sweep failed", level=logging.ERROR, runId=body.runId,
             phase="run.error", error=f"{type(exc).__name__}: {exc}",
             elapsedMs=int((time.time() - t0) * 1000))
        raise HTTPException(status_code=500,
                            detail=f"{type(exc).__name__}: {exc}")

    summary = result.get("summary", {})
    _log("protected sweep complete", runId=body.runId, phase="run.complete",
         elapsedMs=int((time.time() - t0) * 1000),
         backend=summary.get("backend"),
         cardinality=summary.get("cardinality"),
         resultHash={"opaque_campaign_id": summary.get("opaque_campaign_id"),
                     "signature_hash": summary.get("signature_hash")})
    return result
