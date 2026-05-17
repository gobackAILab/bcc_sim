from __future__ import annotations

import pytest

from bcc_sim.baccarat import Outcome
from bcc_sim.strategy import FlatBet, Martingale, payout_won


def test_flatbet_returns_constant_bet() -> None:
    s = FlatBet(base_won=1_000, side=Outcome.BANKER)
    assert s.side == Outcome.BANKER
    assert s.next_bet() == 1_000
    s.update(Outcome.PLAYER)
    assert s.next_bet() == 1_000
    assert s.side == Outcome.BANKER
    s.update(Outcome.BANKER)
    assert s.next_bet() == 1_000
    s.update(Outcome.TIE)
    assert s.next_bet() == 1_000


# --- Martingale: classic (no pivot) ---


def test_martingale_classic_sequence_LLLW() -> None:
    m = Martingale(base_won=1_000, primary_side=Outcome.BANKER, pivot=False)
    bets = []
    sides = []
    for outcome in [Outcome.PLAYER, Outcome.PLAYER, Outcome.PLAYER, Outcome.BANKER]:
        bets.append(m.next_bet())
        sides.append(m.side)
        m.update(outcome)
    assert bets == [1_000, 2_000, 4_000, 8_000]
    assert sides == [Outcome.BANKER] * 4
    assert m.next_bet() == 1_000  # reset after win


def test_martingale_classic_tie_preserves_state() -> None:
    m = Martingale(base_won=1_000, primary_side=Outcome.BANKER, pivot=False)
    bets = []
    for outcome in [Outcome.PLAYER, Outcome.TIE, Outcome.PLAYER, Outcome.BANKER]:
        bets.append(m.next_bet())
        m.update(outcome)
    assert bets == [1_000, 2_000, 2_000, 4_000]


def test_martingale_classic_no_steps_doubles_indefinitely() -> None:
    m = Martingale(base_won=1_000, primary_side=Outcome.BANKER,
                   martin_steps=None, pivot=False)
    for _ in range(8):
        m.update(Outcome.PLAYER)
    assert m.next_bet() == 1_000 * (2 ** 8)


# --- Martingale: pivot (default Banker → Player) ---


def test_martingale_pivot_starts_on_primary() -> None:
    m = Martingale(base_won=1_000, primary_side=Outcome.BANKER, pivot=True)
    assert m.side == Outcome.BANKER
    assert m.next_bet() == 1_000


def test_martingale_pivot_switches_on_primary_loss() -> None:
    """After a Banker loss, next bet is on Player at double base."""
    m = Martingale(base_won=1_000, primary_side=Outcome.BANKER, pivot=True)
    assert m.side == Outcome.BANKER
    m.update(Outcome.PLAYER)  # primary (Banker) loses
    assert m.side == Outcome.PLAYER
    assert m.next_bet() == 2_000


def test_martingale_pivot_stays_on_primary_after_win() -> None:
    m = Martingale(base_won=1_000, primary_side=Outcome.BANKER, pivot=True)
    m.update(Outcome.BANKER)  # primary wins
    assert m.side == Outcome.BANKER
    assert m.next_bet() == 1_000


def test_martingale_pivot_returns_to_primary_after_pivot_win() -> None:
    """During martin on Player, a Player win ends martin and returns to Banker."""
    m = Martingale(base_won=1_000, primary_side=Outcome.BANKER, pivot=True,
                   martin_steps=5)
    m.update(Outcome.PLAYER)  # Banker loses → switch to Player, double
    assert (m.side, m.next_bet()) == (Outcome.PLAYER, 2_000)
    m.update(Outcome.BANKER)  # we're on Player, Banker wins → we lose, double
    assert (m.side, m.next_bet()) == (Outcome.PLAYER, 4_000)
    m.update(Outcome.PLAYER)  # we're on Player, Player wins → we win → reset
    assert (m.side, m.next_bet()) == (Outcome.BANKER, 1_000)


def test_martingale_pivot_full_userexample_cycle_2() -> None:
    """Trace user's table rows 2-7: B(L), then 5 Player bets ending in win.
    Bet sequence: 1k(B,L), 2k(P,L), 4k(P,L), 8k(P,L), 16k(P,L), 32k(P,W) → reset.
    """
    m = Martingale(base_won=1_000, primary_side=Outcome.BANKER,
                   martin_steps=5, pivot=True)
    bets = []
    sides = []
    # 5 losses (1 on Banker primary, 4 on Player pivot), then 5th Player loss, then Player win
    sequence = [
        # (outcome of this hand from our bet's perspective)
        # Row 2: Banker bet, Player won the hand → we lose
        ("loss", Outcome.PLAYER),
        # Row 3-6: Player bet, Banker won the hand → we lose
        ("loss", Outcome.BANKER),
        ("loss", Outcome.BANKER),
        ("loss", Outcome.BANKER),
        ("loss", Outcome.BANKER),
        # Row 7: Player bet, Player won → we win
        ("win", Outcome.PLAYER),
    ]
    for label, hand_outcome in sequence:
        bets.append(m.next_bet())
        sides.append(m.side)
        m.update(hand_outcome)
    assert bets == [1_000, 2_000, 4_000, 8_000, 16_000, 32_000]
    assert sides == [Outcome.BANKER, Outcome.PLAYER, Outcome.PLAYER,
                     Outcome.PLAYER, Outcome.PLAYER, Outcome.PLAYER]
    # After win at row 7: reset to Banker base
    assert (m.side, m.next_bet()) == (Outcome.BANKER, 1_000)


def test_martingale_pivot_full_userexample_cycle_3_give_up() -> None:
    """Trace user's rows 15-21 (without Tie for simplicity):
    1k(B,L), 2k(P,L), 4k(P,L), 8k(P,L), 16k(P,L), 32k(P,L) → give up reset.
    6 losses total (martin_steps=5 → 6th loss triggers reset).
    """
    m = Martingale(base_won=1_000, primary_side=Outcome.BANKER,
                   martin_steps=5, pivot=True)
    bets = []
    # Banker bet loses, then 5 Player bets all losing
    losses = [Outcome.PLAYER, Outcome.BANKER, Outcome.BANKER,
              Outcome.BANKER, Outcome.BANKER, Outcome.BANKER]
    for hand_outcome in losses:
        bets.append(m.next_bet())
        m.update(hand_outcome)
    assert bets == [1_000, 2_000, 4_000, 8_000, 16_000, 32_000]
    # After 6th loss: give up, reset to Banker base
    assert (m.side, m.next_bet()) == (Outcome.BANKER, 1_000)


def test_martingale_pivot_tie_preserves_state() -> None:
    """Tie during martin keeps same side, same bet."""
    m = Martingale(base_won=1_000, primary_side=Outcome.BANKER,
                   martin_steps=5, pivot=True)
    m.update(Outcome.PLAYER)  # Banker loses, pivot to Player
    bet_before = m.next_bet()
    side_before = m.side
    m.update(Outcome.TIE)
    assert m.next_bet() == bet_before
    assert m.side == side_before


def test_martingale_pivot_with_no_martin_limit() -> None:
    """pivot=True, martin_steps=None: doubles indefinitely on pivot side."""
    m = Martingale(base_won=1_000, primary_side=Outcome.BANKER,
                   martin_steps=None, pivot=True)
    # Banker loses, then 7 more Player losses → still doubling on Player
    losses = [Outcome.PLAYER] + [Outcome.BANKER] * 7
    bets = []
    for hand_outcome in losses:
        bets.append(m.next_bet())
        m.update(hand_outcome)
    assert bets == [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 128_000]
    # No reset
    assert m.next_bet() == 256_000


# --- Payout ---


def test_banker_win_pays_exactly_950_per_1000_bet() -> None:
    assert payout_won(Outcome.BANKER, 1_000, Outcome.BANKER) == 950


def test_banker_win_floors_fractional_won() -> None:
    assert payout_won(Outcome.BANKER, 33, Outcome.BANKER) == 31


def test_player_win_pays_exactly_1000_per_1000_bet() -> None:
    assert payout_won(Outcome.PLAYER, 1_000, Outcome.PLAYER) == 1_000


def test_banker_loss_returns_negative_bet() -> None:
    assert payout_won(Outcome.BANKER, 1_000, Outcome.PLAYER) == -1_000


def test_player_loss_returns_negative_bet() -> None:
    assert payout_won(Outcome.PLAYER, 2_500, Outcome.BANKER) == -2_500


def test_tie_returns_zero_for_both_sides() -> None:
    assert payout_won(Outcome.BANKER, 1_000, Outcome.TIE) == 0
    assert payout_won(Outcome.PLAYER, 1_000, Outcome.TIE) == 0


# --- Validation ---


def test_strategy_rejects_tie_side() -> None:
    with pytest.raises(ValueError):
        FlatBet(base_won=1_000, side=Outcome.TIE)
    with pytest.raises(ValueError):
        Martingale(base_won=1_000, primary_side=Outcome.TIE)


def test_strategy_rejects_nonpositive_base() -> None:
    with pytest.raises(ValueError):
        FlatBet(base_won=0, side=Outcome.BANKER)
    with pytest.raises(ValueError):
        Martingale(base_won=-1, primary_side=Outcome.BANKER)


def test_martingale_rejects_zero_steps() -> None:
    with pytest.raises(ValueError):
        Martingale(base_won=1_000, primary_side=Outcome.BANKER, martin_steps=0)
