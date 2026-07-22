"""Generate CPython 3.11 random.Random integer-seed compatibility fixtures."""

from __future__ import annotations

import json
import platform
import random
import sys
from pathlib import Path


SEEDS = (
    0,
    1,
    -1,
    42,
    2**32,
    2**53 + 1,
    2**127 + 0x1234_5678_9ABC_DEF0,
    -(2**200 + 0xDEAD_BEEF),
)
BIT_WIDTHS = (0, 1, 5, 31, 32, 33, 63, 64, 65, 127)


def build_case(seed: int) -> dict[str, object]:
    bits_rng = random.Random(seed)
    boundary_rng = random.Random(seed)
    random_rng = random.Random(seed)
    range_rng = random.Random(seed)
    shuffle_rng = random.Random(seed)
    shuffled = list(range(52))
    shuffle_rng.shuffle(shuffled)
    boundary_values = [str(boundary_rng.getrandbits(32)) for _ in range(635)]

    return {
        "seed": str(seed),
        "mixedBits": [
            {"bits": width, "value": str(bits_rng.getrandbits(width))}
            for width in BIT_WIDTHS
        ],
        "getrandbits32AtStateBoundary": boundary_values[620:],
        "random": [random_rng.random() for _ in range(10)],
        "randrange2Pow63": [str(range_rng.randrange(2**63)) for _ in range(10)],
        "shuffle52": shuffled,
    }


def main() -> None:
    if platform.python_implementation() != "CPython" or sys.version_info[:2] != (3, 11):
        raise SystemExit("fixture generation requires CPython 3.11")

    output = Path(__file__).parents[1] / "web/src/sim/fixtures/python-random.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generator": f"CPython {platform.python_version()}",
        "cases": [build_case(seed) for seed in SEEDS],
    }
    output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
