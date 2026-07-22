"""Generate end-to-end Python engine fixtures for the TypeScript port."""

from __future__ import annotations

import json
import platform
from pathlib import Path

from bcc_sim.runner import _derive_session_seeds
from bcc_sim.session import run_session_traced
from bcc_sim.web.serialize import (
    DEFAULT_CONFIG,
    hand_record_to_dict,
    session_config_from_dict,
    session_config_to_dict,
    session_result_to_dict,
)


def build_case(name: str, raw_config: dict) -> dict[str, object]:
    config = session_config_from_dict(raw_config)
    result, history = run_session_traced(config)
    serialized_config = session_config_to_dict(config)
    serialized_config["seed"] = str(config.seed)
    serialized_config["hand_delay_ms"] = int(raw_config.get("hand_delay_ms", 0))
    serialized_config["auto_next"] = bool(raw_config.get("auto_next", False))
    return {
        "name": name,
        "config": serialized_config,
        "result": session_result_to_dict(result),
        "history": [hand_record_to_dict(record) for record in history],
    }


def main() -> None:
    session_seeds = _derive_session_seeds(42, 3)
    default_web = dict(DEFAULT_CONFIG)
    default_web["seed"] = session_seeds[0]

    direct_seed = dict(DEFAULT_CONFIG)
    direct_seed["seed"] = 42

    player_classic = {
        **DEFAULT_CONFIG,
        "initial_won": 100_000,
        "target_won": 105_000,
        "ruin_won": 95_000,
        "side": "PLAYER",
        "martin_steps": 3,
        "pivot": False,
        "seed": 12_345,
    }

    payload = {
        "generator": f"{platform.python_implementation()} {platform.python_version()}",
        "derived_session_seeds": {
            "master": "42",
            "values": [str(seed) for seed in session_seeds],
        },
        "cases": [
            build_case("default-web-first-session", default_web),
            build_case("default-direct-seed-42", direct_seed),
            build_case("player-classic-short", player_classic),
        ],
    }

    output = Path(__file__).parents[1] / "web/src/sim/fixtures/python-engine.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
