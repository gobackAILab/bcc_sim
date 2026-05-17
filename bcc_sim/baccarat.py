from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Protocol


class Outcome(Enum):
    PLAYER = "PLAYER"
    BANKER = "BANKER"
    TIE = "TIE"


@dataclass(frozen=True, slots=True)
class HandResult:
    outcome: Outcome
    player_total: int
    banker_total: int
    # Cards dealt to each side. Excluded from equality/repr so existing tests
    # that compare on outcome+totals continue to work.
    player_cards: tuple = field(default=(), compare=False, repr=False)
    banker_cards: tuple = field(default=(), compare=False, repr=False)


class _Drawable(Protocol):
    @property
    def baccarat_value(self) -> int: ...


class _DrawSource(Protocol):
    def draw(self) -> _Drawable: ...


def _settle(
    player_total: int,
    banker_total: int,
    player_cards: tuple,
    banker_cards: tuple,
) -> HandResult:
    if player_total > banker_total:
        outcome = Outcome.PLAYER
    elif banker_total > player_total:
        outcome = Outcome.BANKER
    else:
        outcome = Outcome.TIE
    return HandResult(
        outcome=outcome,
        player_total=player_total,
        banker_total=banker_total,
        player_cards=player_cards,
        banker_cards=banker_cards,
    )


def _banker_draws_after_player_third(banker_total: int, player_third_value: int) -> bool:
    if banker_total <= 2:
        return True
    if banker_total == 3:
        return player_third_value != 8
    if banker_total == 4:
        return player_third_value in (2, 3, 4, 5, 6, 7)
    if banker_total == 5:
        return player_third_value in (4, 5, 6, 7)
    if banker_total == 6:
        return player_third_value in (6, 7)
    return False  # banker_total == 7


def play_hand(shoe: _DrawSource) -> HandResult:
    p1c = shoe.draw()
    b1c = shoe.draw()
    p2c = shoe.draw()
    b2c = shoe.draw()
    p_cards: list[Any] = [p1c, p2c]
    b_cards: list[Any] = [b1c, b2c]

    player_total = (p1c.baccarat_value + p2c.baccarat_value) % 10
    banker_total = (b1c.baccarat_value + b2c.baccarat_value) % 10

    if player_total >= 8 or banker_total >= 8:
        return _settle(player_total, banker_total, tuple(p_cards), tuple(b_cards))

    player_third_value: int | None = None
    if player_total <= 5:
        p3c = shoe.draw()
        p_cards.append(p3c)
        player_third_value = p3c.baccarat_value
        player_total = (player_total + player_third_value) % 10

    if player_third_value is None:
        if banker_total <= 5:
            b3c = shoe.draw()
            b_cards.append(b3c)
            banker_total = (banker_total + b3c.baccarat_value) % 10
    else:
        if _banker_draws_after_player_third(banker_total, player_third_value):
            b3c = shoe.draw()
            b_cards.append(b3c)
            banker_total = (banker_total + b3c.baccarat_value) % 10

    return _settle(player_total, banker_total, tuple(p_cards), tuple(b_cards))
