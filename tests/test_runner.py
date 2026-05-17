from __future__ import annotations

from dataclasses import replace

from bcc_sim.baccarat import Outcome
from bcc_sim.runner import _derive_session_seeds, run_experiment
from bcc_sim.session import SessionConfig


def _base_config() -> SessionConfig:
    return SessionConfig(
        initial_won=1_000_000,
        target_won=2_000_000,
        ruin_won=0,
        table_max_won=10_000_000,
        base_bet_won=1_000,
        side=Outcome.BANKER,
        strategy_name="flat",
        martin_steps=None,
        pivot=False,
        seed=0,
    )


def test_session_seeds_are_distinct_and_reproducible() -> None:
    a = _derive_session_seeds(42, 100)
    b = _derive_session_seeds(42, 100)
    assert a == b
    assert len(set(a)) == 100


def test_session_seeds_change_with_master_seed() -> None:
    a = _derive_session_seeds(1, 50)
    b = _derive_session_seeds(2, 50)
    assert a != b


def test_experiment_result_basic_shape() -> None:
    config = _base_config()
    result = run_experiment(config, n_sessions=10, master_seed=7)
    assert result.n_sessions == 10
    assert 0.0 <= result.win_rate <= 1.0
    assert 0.0 <= result.ruin_rate <= 1.0
    assert abs(result.win_rate + result.ruin_rate - 1.0) < 1e-9
    assert result.theoretical_edge == -0.0106  # banker
    assert sum(result.ruin_reason_counts.values()) == int(result.ruin_rate * 10)


def test_experiment_is_reproducible() -> None:
    config = _base_config()
    a = run_experiment(config, n_sessions=50, master_seed=123)
    b = run_experiment(config, n_sessions=50, master_seed=123)
    assert a == b


def test_flat_bet_banker_avg_return_approximates_theoretical_edge() -> None:
    # Flat-bet on banker, tiny target to keep sessions short.
    config = SessionConfig(
        initial_won=1_000_000,
        target_won=1_001_000,
        ruin_won=0,
        table_max_won=10_000_000,
        base_bet_won=1_000,
        side=Outcome.BANKER,
        strategy_name="flat",
        martin_steps=None,
        pivot=False,
        seed=0,
    )
    result = run_experiment(config, n_sessions=500, master_seed=20260517)
    assert abs(result.avg_return_per_bet - (-0.0106)) < 0.01, (
        f"avg_return_per_bet = {result.avg_return_per_bet:.4f}"
    )


def test_player_side_uses_player_theoretical_edge() -> None:
    config = replace(_base_config(), side=Outcome.PLAYER)
    result = run_experiment(config, n_sessions=5, master_seed=1)
    assert result.theoretical_edge == -0.0124
