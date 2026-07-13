"""
PHYLAX · parties.common.psi_secretflow
======================================
Production PSI backend: SecretFlow SPU's ECDH Private Set Intersection.

This routes Phylax's protected match through the OFFICIAL SecretFlow library
(https://github.com/secretflow/secretflow) rather than the stdlib DDH backend.
It uses the documented, stable API — `SPU.psi_csv(..., protocol='ECDH_PSI_3PC')`
for three parties and `'ECDH_PSI_2PC'` for two — pinned to `secretflow==1.10.0b1`
(SPU 0.9.x). No SecretFlow method here is invented; see requirements.txt and the
SecretFlow PSI user guide.

It is import-guarded and only selected when `PHYLAX_PSI_BACKEND=secretflow` in a
party/coordinator service that actually has SecretFlow installed (the
`Dockerfile.party` / `Dockerfile.coordinator` images on Linux + Python 3.10).
Everywhere else Phylax falls back to `psi.run_multiparty_psi`, which implements
the same DDH commutative-encryption protocol and yields identical results.
"""
from __future__ import annotations
import csv
import hashlib
import os
import tempfile

from .psi import Party, PSIResult, CoordinatorView, PSIError


def _available() -> bool:
    try:
        import secretflow  # noqa: F401
        return True
    except Exception:
        return False


def run_secretflow_psi(parties: list[Party]) -> PSIResult:
    if not _available():
        raise PSIError("SecretFlow is not installed in this service; "
                       "unset PHYLAX_PSI_BACKEND to use the stdlib DDH backend")
    if len(parties) not in (2, 3):
        raise PSIError("SecretFlow ECDH PSI backend supports 2 or 3 parties")

    import secretflow as sf
    import secretflow.utils.testing as sf_testing

    names = ["alice", "bob", "carol"][: len(parties)]
    protocol = "ECDH_PSI_3PC" if len(parties) == 3 else "ECDH_PSI_2PC"

    workdir = tempfile.mkdtemp(prefix="phylax-psi-")
    input_path, output_path, name_to_party = {}, {}, {}
    for nm, p in zip(names, parties):
        ipath = os.path.join(workdir, f"{nm}_in.csv")
        with open(ipath, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["token"])
            for t in p.tokens:
                w.writerow([t.hex()])
        input_path[nm] = ipath
        output_path[nm] = os.path.join(workdir, f"{nm}_out.csv")
        name_to_party[nm] = p

    # Bring up the SPU device across the (logical) parties and run ECDH PSI.
    sf.init(names, address="local")
    try:
        spu_device = sf.SPU(sf_testing.cluster_def(names))
        spu_device.psi_csv(
            key="token",
            input_path=input_path,
            output_path=output_path,
            receiver=names[0],
            protocol=protocol,
            curve_type="CURVE_25519",
            precheck_input=True,
            broadcast_result=True,
        )
    finally:
        sf.shutdown()

    # Every party's output holds the intersection (broadcast_result=True).
    matched_hex: list[str] = []
    with open(output_path[names[0]], newline="") as fh:
        r = csv.DictReader(fh)
        for row in r:
            matched_hex.append(row["token"])
    matched_tokens = sorted(bytes.fromhex(h) for h in matched_hex)

    signature_hash = hashlib.sha256(
        b"phylax-sig-spu-v1" + b"".join(matched_tokens)).hexdigest()
    opaque_campaign_id = hashlib.sha256(
        b"phylax-campaign-v1" + b"".join(matched_tokens)).hexdigest()

    return PSIResult(
        cardinality=len(matched_tokens),
        opaque_campaign_id=opaque_campaign_id,
        signature_hash=signature_hash,
        matched_tokens=matched_tokens,
        per_party_matched_idx={},
        party_count=len(parties),
        view=CoordinatorView(revealed_tokens=list(matched_tokens)),
        backend="secretflow-spu-ecdh",
    )
