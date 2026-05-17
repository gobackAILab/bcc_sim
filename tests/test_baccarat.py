from __future__ import annotations

import random
from dataclasses import dataclass

import pytest

from bcc_sim.baccarat import HandResult, Outcome, play_hand
from bcc_sim.deck import Shoe


@dataclass(frozen=True)
class _FakeCard:
    value: int

    @property
    def baccarat_value(self) -> int:
        return self.value


class _SequenceShoe:
    """Returns cards in the exact order given. Raises if exhausted."""

    def __init__(self, values: list[int]) -> None:
        self._cards = [_FakeCard(v) for v in values]
        self._index = 0

    def draw(self) -> _FakeCard:
        card = self._cards[self._index]
        self._index += 1
        return card

    def cards_used(self) -> int:
        return self._index


def _play(values: list[int]) -> tuple[HandResult, int]:
    shoe = _SequenceShoe(values)
    result = play_hand(shoe)
    return result, shoe.cards_used()


def test_natural_8_player_ends_hand_immediately() -> None:
    # P: 3+5=8 (natural), B: 4+2=6
    result, used = _play([3, 4, 5, 2])
    assert result == HandResult(Outcome.PLAYER, 8, 6)
    assert used == 4


def test_natural_9_banker_ends_hand_immediately() -> None:
    # P: 4+2=6, B: 4+5=9 (natural)
    result, used = _play([4, 4, 2, 5])
    assert result == HandResult(Outcome.BANKER, 6, 9)
    assert used == 4


def test_natural_tie_8_8() -> None:
    result, used = _play([3, 4, 5, 4])
    assert result == HandResult(Outcome.TIE, 8, 8)
    assert used == 4


def test_player_stands_on_6() -> None:
    # P: 2+4=6 (stand), B: 0+0=0 → banker draws (0..5 with player stand)
    # B draws a 5 → banker total = 5
    result, used = _play([2, 0, 4, 0, 5])
    assert result == HandResult(Outcome.PLAYER, 6, 5)
    assert used == 5


def test_player_stands_on_7() -> None:
    # P: 3+4=7 (stand), B: 0+1=1 → banker draws → b3=0 → banker=1
    result, used = _play([3, 0, 4, 1, 0])
    assert result == HandResult(Outcome.PLAYER, 7, 1)
    assert used == 5


@pytest.mark.parametrize("p1,p2", [(0, 0), (0, 1), (1, 1), (1, 4), (2, 3)])
def test_player_draws_on_0_through_5(p1: int, p2: int) -> None:
    # P draws on 0..5. Use B=7 to force banker to stand (banker stands on 7 always).
    # P: p1+p2 ≤ 5 → draws 0 → unchanged
    result, used = _play([p1, 0, p2, 7, 0])
    expected_player = (p1 + p2) % 10
    assert result.player_total == expected_player
    assert result.banker_total == 7
    assert used == 5


def test_banker_stands_on_7_always_when_player_drew() -> None:
    # P: 0+0=0 → draws, B: 3+4=7 → must stand regardless of player's 3rd card
    # P third = 9 → player_total = 9
    result, used = _play([0, 3, 0, 4, 9])
    assert result == HandResult(Outcome.PLAYER, 9, 7)
    assert used == 5


def test_banker_draws_0_1_2_regardless_of_player_third() -> None:
    # banker_total=2 (1+1), player draws → banker must draw even if player's 3rd = 8
    # P: 0+0=0 → draws 8 → player=8, B: 1+1=2 → draws 0 → banker=2
    result, used = _play([0, 1, 0, 1, 8, 0])
    assert result == HandResult(Outcome.PLAYER, 8, 2)
    assert used == 6


def test_banker_3_draws_unless_player_third_is_8() -> None:
    # banker=3, player_third=8 → banker stands
    # P: 0+0=0 → draws 8, B: 1+2=3 → stands
    result, _ = _play([0, 1, 0, 2, 8])
    assert result == HandResult(Outcome.PLAYER, 8, 3)

    # banker=3, player_third=7 → banker draws
    # P: 0+0=0 → draws 7, B: 1+2=3 → draws 0 → banker=3
    result, _ = _play([0, 1, 0, 2, 7, 0])
    assert result == HandResult(Outcome.PLAYER, 7, 3)


def test_banker_4_draws_only_if_player_third_in_2_to_7() -> None:
    # banker=4, p3=2 → draws
    result, _ = _play([0, 2, 0, 2, 2, 0])
    assert result.banker_total == 4

    # banker=4, p3=7 → draws
    result, _ = _play([0, 2, 0, 2, 7, 0])
    assert result.banker_total == 4

    # banker=4, p3=1 → stands
    result, used = _play([0, 2, 0, 2, 1])
    assert result.banker_total == 4
    assert used == 5  # no banker 3rd

    # banker=4, p3=8 → stands
    result, used = _play([0, 2, 0, 2, 8])
    assert result.banker_total == 4
    assert used == 5

    # banker=4, p3=0 → stands
    result, used = _play([0, 2, 0, 2, 0])
    assert result.banker_total == 4
    assert used == 5


def test_banker_5_draws_only_if_player_third_in_4_to_7() -> None:
    # banker=5 (2+3), p3=4 → draws
    result, used = _play([0, 2, 0, 3, 4, 0])
    assert result.banker_total == 5
    assert used == 6

    # banker=5, p3=7 → draws
    result, used = _play([0, 2, 0, 3, 7, 0])
    assert result.banker_total == 5
    assert used == 6

    # banker=5, p3=3 → stands
    result, used = _play([0, 2, 0, 3, 3])
    assert result.banker_total == 5
    assert used == 5

    # banker=5, p3=8 → stands
    result, used = _play([0, 2, 0, 3, 8])
    assert result.banker_total == 5
    assert used == 5


def test_banker_6_draws_only_if_player_third_in_6_or_7() -> None:
    # banker=6 (3+3), p3=6 → draws
    result, used = _play([0, 3, 0, 3, 6, 0])
    assert result.banker_total == 6
    assert used == 6

    # banker=6, p3=7 → draws
    result, used = _play([0, 3, 0, 3, 7, 0])
    assert result.banker_total == 6
    assert used == 6

    # banker=6, p3=5 → stands
    result, used = _play([0, 3, 0, 3, 5])
    assert result.banker_total == 6
    assert used == 5


def test_banker_no_third_when_player_stands_and_banker_in_6_7() -> None:
    # P: 3+3=6 → stands, B: 3+4=7 → stands
    result, used = _play([3, 3, 3, 4])
    assert result == HandResult(Outcome.BANKER, 6, 7)
    assert used == 4

    # P: 3+3=6 → stands, B: 3+3=6 → stands (tie at 6-6)
    result, used = _play([3, 3, 3, 3])
    assert result == HandResult(Outcome.TIE, 6, 6)
    assert used == 4


def test_outcome_frequencies_within_1pct_of_theoretical() -> None:
    """100k hands should land within 1% of textbook frequencies.

    Theoretical (8-deck): Player ≈ 44.62%, Banker ≈ 45.86%, Tie ≈ 9.52%.
    """
    rng = random.Random(20260517)
    shoe = Shoe(n_decks=8, cut_offset=14, rng=rng)
    counts = {Outcome.PLAYER: 0, Outcome.BANKER: 0, Outcome.TIE: 0}
    n = 100_000
    for _ in range(n):
        if shoe.cards_remaining() < 6:
            shoe.maybe_reshuffle()
        counts[play_hand(shoe).outcome] += 1
    p = counts[Outcome.PLAYER] / n
    b = counts[Outcome.BANKER] / n
    t = counts[Outcome.TIE] / n
    assert abs(p - 0.4462) < 0.01, f"Player rate {p:.4f}"
    assert abs(b - 0.4586) < 0.01, f"Banker rate {b:.4f}"
    assert abs(t - 0.0952) < 0.01, f"Tie rate {t:.4f}"
