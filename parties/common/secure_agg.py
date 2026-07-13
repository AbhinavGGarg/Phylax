"""
PHYLAX · parties.common.secure_agg
==================================
Secure aggregation by additive secret sharing — real MPC, not a sum in the
clear. Parties compute consortium totals/means/variance over their PRIVATE local
feature contributions without any party (or the coordinator) learning another
party's individual value.

Construction (information-theoretic under no full collusion): to sum values
v_1..v_n, each party i splits v_i into n uniformly random shares over a prime
field that sum to v_i, and sends one share to each party. Each party adds the
shares it received (a "partial", itself uniformly random) and the partials are
combined into the total. The coordinator only ever sees the random partials and
the final total — never a v_i.

Only these aggregates leave the protocol into `permitted_findings`.
"""
from __future__ import annotations
import secrets
from dataclasses import dataclass, field

FIELD = (1 << 61) - 1          # Mersenne prime; big enough for our fixed-point sums
SCALE = 1 << 20                # fixed-point precision for floats


def encode(x: float) -> int:
    return int(round(x * SCALE)) % FIELD


def decode(v: int) -> float:
    if v > FIELD // 2:          # interpret as signed
        v -= FIELD
    return v / SCALE


@dataclass
class AggView:
    """What the coordinator sees. `individual_values_seen` MUST stay empty."""
    partials_seen: list = field(default_factory=list)
    totals_seen: list = field(default_factory=list)
    individual_values_seen: list = field(default_factory=list)


def secure_sum(values: list[int], view: AggView | None = None) -> int:
    """Additive-secret-sharing sum over the field. Coordinator sees only partials
    and the total."""
    n = len(values)
    # matrix[i][j] = share of party i's value routed to party j
    matrix = []
    for v in values:
        shares = [secrets.randbelow(FIELD) for _ in range(n - 1)]
        shares.append((v - sum(shares)) % FIELD)
        matrix.append(shares)
    partials = [sum(matrix[i][j] for i in range(n)) % FIELD for j in range(n)]
    total = sum(partials) % FIELD
    if view is not None:
        view.partials_seen.extend(partials)
        view.totals_seen.append(total)
    return total


def secure_sum_float(values: list[float], view: AggView | None = None) -> float:
    return decode(secure_sum([encode(v) for v in values], view))


def secure_mean_float(values: list[float], view: AggView | None = None) -> float:
    n = len(values)
    return secure_sum_float(values, view) / n if n else 0.0


def secure_variance_float(values: list[float], view: AggView | None = None) -> float:
    """Population variance via secure sums of the first two moments. The
    coordinator learns only Σx and Σx² — never an individual x."""
    n = len(values)
    if n == 0:
        return 0.0
    s1 = secure_sum_float(values, view)
    s2 = secure_sum_float([v * v for v in values], view)
    mean = s1 / n
    return max(0.0, s2 / n - mean * mean)


def temporal_alignment(peak_hours: list[float], view: AggView | None = None) -> float:
    """Map the secure variance of parties' local burst-peak hours to a [0,1]
    co-timing score: tightly co-timed bursts → ~1, dispersed → ~0."""
    var = secure_variance_float(peak_hours, view)
    return round(1.0 / (1.0 + var), 4)
