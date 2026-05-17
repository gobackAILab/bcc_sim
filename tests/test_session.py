from __future__ import annotations

from dataclasses import replace

from bcc_sim.baccarat import HandResult, Outcome
from bcc_sim.session import SessionConfig, run_session


def _make_config(**overrides) -> SessionConfig:
    base = SessionConfig(
        initial_won=1_000_000,
        target_won=2_000_000,
        ruin_won=0,
        table_max_won=1_000_000,
        base_bet_won=1_000,
        side=Outcome.BANKER,
        strategy_name="martingale",
        martin_steps=None,
        pivot=False,
        seed=42,
    )
    return replace(base, **overrides)


def _hand(outcome: Outcome) -> HandResult:
    return HandResult(outcome=outcome, player_total=0, banker_total=0)


def test_same_seed_yields_identical_session_result() -> None:
    config = _make_config(seed=12345)
    a = run_session(config)
    b = run_session(config)
    assert a == b


def test_different_seeds_can_yield_different_results() -> None:
    a = run_session(_make_config(seed=1))
    b = run_session(_make_config(seed=2))
    assert a != b


def test_win_when_capital_reaches_target() -> None:
    config = _make_config(
        initial_won=1_999_000,
        target_won=1_999_500,
        base_bet_won=1_000,
        strategy_name="flat",
        side=Outcome.BANKER,
    )
    result = run_session(config, hands=[_hand(Outcome.BANKER)])
    assert result.outcome == "WIN"
    assert result.final_won == 1_999_000 + 950
    assert result.hands_played == 1
    assert result.bets_placed == 1


def test_ruin_reason_bet_exceeds_capital() -> None:
    config = _make_config(
        initial_won=500,
        base_bet_won=1_000,
        table_max_won=100_000,
        target_won=10_000_000,
        strategy_name="flat",
    )
    result = run_session(config, hands=[])
    assert result.outcome == "RUIN"
    assert result.ruin_reason == "bet_exceeds_capital"
    assert result.hands_played == 0
    assert result.final_won == 500


def test_ruin_reason_bet_exceeds_table_max() -> None:
    config = _make_config(
        initial_won=100_000,
        base_bet_won=1_000,
        table_max_won=500,
        target_won=10_000_000,
        strategy_name="flat",
    )
    result = run_session(config, hands=[])
    assert result.outcome == "RUIN"
    assert result.ruin_reason == "bet_exceeds_table_max"
    assert result.hands_played == 0


def test_ruin_reason_both_when_both_fire() -> None:
    config = _make_config(
        initial_won=300,
        base_bet_won=1_000,
        table_max_won=500,
        target_won=10_000_000,
        strategy_name="flat",
    )
    result = run_session(config, hands=[])
    assert result.outcome == "RUIN"
    assert result.ruin_reason == "both"


def test_ruin_reason_capital_depleted_after_a_losing_hand() -> None:
    config = _make_config(
        initial_won=1_000,
        base_bet_won=1_000,
        table_max_won=100_000,
        target_won=10_000_000,
        strategy_name="flat",
        side=Outcome.BANKER,
    )
    result = run_session(config, hands=[_hand(Outcome.PLAYER)])
    assert result.outcome == "RUIN"
    assert result.ruin_reason == "capital_depleted"
    assert result.final_won == 0
    assert result.hands_played == 1
    assert result.bets_placed == 1


def test_tie_hand_does_not_change_capital_or_streak() -> None:
    # Classic martingale (no pivot)
    config = _make_config(
        initial_won=1_000_000,
        base_bet_won=1_000,
        table_max_won=10_000_000,
        target_won=1_000_500,
        strategy_name="martingale",
        martin_steps=None,
        pivot=False,
        side=Outcome.BANKER,
    )
    hands = [_hand(Outcome.PLAYER), _hand(Outcome.TIE), _hand(Outcome.PLAYER), _hand(Outcome.BANKER)]
    result = run_session(config, hands=hands)
    assert result.outcome == "WIN"
    assert result.final_won == 1_000_000 - 1_000 - 2_000 + ((4_000 * 95) // 100)
    assert result.hands_played == 4
    assert result.bets_placed == 3
    assert result.total_wagered_won == 1_000 + 2_000 + 4_000
    assert result.max_loss_streak == 2


def test_max_loss_streak_tracking() -> None:
    config = _make_config(
        initial_won=3_000,
        base_bet_won=1_000,
        table_max_won=100_000,
        target_won=10_000_000,
        strategy_name="flat",
        side=Outcome.PLAYER,
    )
    hands = [_hand(Outcome.BANKER)] * 3
    result = run_session(config, hands=hands)
    assert result.outcome == "RUIN"
    assert result.ruin_reason == "capital_depleted"
    assert result.hands_played == 3
    assert result.max_loss_streak == 3


def test_player_side_pays_1_to_1() -> None:
    config = _make_config(
        initial_won=100_000,
        target_won=101_000,
        base_bet_won=1_000,
        strategy_name="flat",
        side=Outcome.PLAYER,
    )
    result = run_session(config, hands=[_hand(Outcome.PLAYER)])
    assert result.final_won == 101_000
    assert result.outcome == "WIN"


def test_banker_side_pays_with_commission() -> None:
    config = _make_config(
        initial_won=100_000,
        target_won=101_000,
        base_bet_won=1_000,
        strategy_name="flat",
        side=Outcome.BANKER,
    )
    result = run_session(
        config,
        hands=[_hand(Outcome.BANKER), _hand(Outcome.BANKER)],
    )
    assert result.final_won == 100_000 + 950 + 950
    assert result.outcome == "WIN"


# --- Pivot mode integration ---


def test_session_pivot_cycle_2_from_user_example() -> None:
    """Rows 2-7 of user's readme example.

    Starting cap 100k. Sequence: B(L), P(L), P(L), P(L), P(L), P(W on Player)
    Bet sequence (with pivot): 1k(Banker), 2k(Player), 4k(P), 8k(P), 16k(P), 32k(P)
    Cash flow: -1k, -2k, -4k, -8k, -16k, +32k = +1k net
    Hand outcomes that produce this: Player won, Banker won x4, Player won
    """
    config = _make_config(
        initial_won=100_000,
        target_won=200_000,  # don't auto-win
        base_bet_won=1_000,
        table_max_won=100_000,
        side=Outcome.BANKER,
        strategy_name="martingale",
        martin_steps=5,
        pivot=True,
    )
    # 6 hands then we need to terminate. Add capital depletion path.
    hands = [
        _hand(Outcome.PLAYER),   # B bet 1k loses
        _hand(Outcome.BANKER),   # P bet 2k loses (Banker won)
        _hand(Outcome.BANKER),   # P bet 4k loses
        _hand(Outcome.BANKER),   # P bet 8k loses
        _hand(Outcome.BANKER),   # P bet 16k loses
        _hand(Outcome.PLAYER),   # P bet 32k wins → +32k
    ]
    # After these: cap = 100_000 - 1 - 2 - 4 - 8 - 16 + 32 (in thousands) = 101_000
    # Add 99 wins on Banker (1k each = +950) to reach target... 99 * 950 = 94_050 → 195_050 < 200_000
    # Add 99 wins anyway, then check status
    hands += [_hand(Outcome.BANKER)] * 200  # plenty for target
    result = run_session(config, hands=hands)
    assert result.outcome == "WIN"
    # After 6 hands of the user trace: cap = 101_000
    # Need 99_000 more to hit 200_000; each Banker win adds 950 → need ceil(99_000/950) = 105 wins
    # → total 6 + 105 = 111 hands
    assert result.hands_played == 111


def test_session_pivot_returns_to_primary_after_win() -> None:
    """After a martin-ending win on Player, the NEXT bet returns to Banker.

    Verified via +950 (Banker commission) on hand 3 — only possible if bet
    side is Banker (Player win pays 1:1 = +1000, not +950).
    """
    config = _make_config(
        initial_won=100_000,
        target_won=101_500,  # reachable only after the 3rd hand's +950
        ruin_won=0,
        base_bet_won=1_000,
        table_max_won=100_000,
        side=Outcome.BANKER,
        strategy_name="martingale",
        martin_steps=5,
        pivot=True,
    )
    hands = [
        _hand(Outcome.PLAYER),   # B 1k bet, P wins → -1k → pivot to Player 2k
        _hand(Outcome.PLAYER),   # P 2k bet, P wins → +2k → reset to Banker base
        _hand(Outcome.BANKER),   # B 1k bet, B wins → +950 (Banker commission) → WIN
    ]
    result = run_session(config, hands=hands)
    assert result.outcome == "WIN"
    assert result.final_won == 100_000 - 1_000 + 2_000 + 950  # = 101_950 ≥ 101_500
    assert result.hands_played == 3
    assert result.bets_placed == 3
    # Total wagered: 1k + 2k + 1k = 4k
    assert result.total_wagered_won == 4_000


def test_session_pivot_full_user_example_22_hands() -> None:
    """End-to-end trace of the user's 22-hand readme example.

    Hand outcomes drive the bet sides per the pivot rule. After all 22 hands
    plus 5 forced-loss escalation hands (P, B, B, B, B), capital depletes
    enough that the next 32k bet exceeds it → RUIN bet_exceeds_capital.

    What we verify here: final capital trajectory and hand count match the
    expected pivot logic.
    """
    config = _make_config(
        initial_won=100_000,
        target_won=10_000_000,  # unreachable
        ruin_won=0,
        base_bet_won=1_000,
        table_max_won=1_000_000,
        side=Outcome.BANKER,
        strategy_name="martingale",
        martin_steps=5,
        pivot=True,
    )
    # Hand outcomes per user's readme trace
    user_trace = [
        Outcome.BANKER,   # 1: B(W) → +950
        Outcome.PLAYER,   # 2: B bet, P wins → -1k → pivot to P 2k
        Outcome.BANKER,   # 3: P bet 2k, B wins → -2k → P 4k
        Outcome.BANKER,   # 4: P bet 4k, B wins → -4k → P 8k
        Outcome.BANKER,   # 5: P bet 8k, B wins → -8k → P 16k
        Outcome.BANKER,   # 6: P bet 16k, B wins → -16k → P 32k
        Outcome.PLAYER,   # 7: P bet 32k, P wins → +32k → reset to B 1k
        Outcome.PLAYER,   # 8: B bet 1k, P wins → -1k → pivot
        Outcome.PLAYER,   # 9: P bet 2k, P wins → +2k → reset
        Outcome.BANKER,   # 10: B(W) → +950
        Outcome.TIE,      # 11: T → 0 (Banker base stays)
        Outcome.BANKER,   # 12: B(W) → +950
        Outcome.BANKER,   # 13: B(W) → +950
        Outcome.BANKER,   # 14: B(W) → +950
        Outcome.PLAYER,   # 15: B bet, P wins → -1k → pivot
        Outcome.BANKER,   # 16: P bet 2k, B wins → -2k → P 4k
        Outcome.TIE,      # 17: T → 0 (P 4k holds)
        Outcome.BANKER,   # 18: P bet 4k, B wins → -4k → P 8k
        Outcome.BANKER,   # 19: P bet 8k, B wins → -8k → P 16k
        Outcome.BANKER,   # 20: P bet 16k, B wins → -16k → P 32k
        Outcome.BANKER,   # 21: P bet 32k, B wins → -32k → 6th loss → reset
        Outcome.BANKER,   # 22: B(W) → +950
    ]
    # After 22 hands cap = 44_700. Force RUIN by escalating losses.
    forced_end = [
        Outcome.PLAYER,   # 23: B 1k, P → -1k. cap=43,700. pivot.
        Outcome.BANKER,   # 24: P 2k, B → -2k. cap=41,700.
        Outcome.BANKER,   # 25: P 4k, B → -4k. cap=37,700.
        Outcome.BANKER,   # 26: P 8k, B → -8k. cap=29,700.
        Outcome.BANKER,   # 27: P 16k, B → -16k. cap=13,700. next bet 32k > 13,700 → RUIN
    ]
    hands = [_hand(o) for o in user_trace + forced_end]
    result = run_session(config, hands=hands)
    assert result.outcome == "RUIN"
    assert result.ruin_reason == "bet_exceeds_capital"
    assert result.hands_played == 27
    # Final cap = 13_700 (computed above)
    assert result.final_won == 13_700
    # Tie hands (11, 17) excluded from bets_placed; total 25 bets placed
    assert result.bets_placed == 25


def test_unknown_strategy_raises() -> None:
    import pytest

    config = _make_config(strategy_name="kelly")
    with pytest.raises(ValueError):
        run_session(config, hands=[])
