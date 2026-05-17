from __future__ import annotations

from typing import Protocol, runtime_checkable

from .baccarat import Outcome


@runtime_checkable
class Strategy(Protocol):
    @property
    def side(self) -> Outcome:
        """Side that the NEXT bet will be placed on."""
        ...

    def next_bet(self) -> int:
        """Return intended bet in Won (₩)."""
        ...

    def update(self, hand_outcome: Outcome) -> None:
        """Update internal state given the hand result. TIE leaves state unchanged."""
        ...


class FlatBet:
    def __init__(self, base_won: int, side: Outcome) -> None:
        if base_won <= 0:
            raise ValueError("base_won must be > 0")
        if side not in (Outcome.PLAYER, Outcome.BANKER):
            raise ValueError("side must be PLAYER or BANKER")
        self.base_won = base_won
        self._side = side

    @property
    def side(self) -> Outcome:
        return self._side

    def next_bet(self) -> int:
        return self.base_won

    def update(self, hand_outcome: Outcome) -> None:
        return None


class Martingale:
    """Banker-priority pivot martingale (default) or classic martingale.

    Default behavior (pivot=True, primary=Banker, martin_steps=5):
        - Bet base on primary side (Banker).
        - On primary-side WIN: stay on primary side, base bet.
        - On primary-side LOSS: MARTIN START — pivot to opposite side, double bet.
        - During martin (on pivot side):
            - WIN  → MARTIN END, reset to primary side at base bet.
            - LOSS → double bet, stay on pivot side.
            - (martin_steps+1)-th total loss → GIVE UP, reset to primary, base.
        - TIE: ignored (no state change, same side/bet next hand).

    Bet sequence with default 5-martin, base=1k, all losses on Banker primary:
        1k(B), 2k(P), 4k(P), 8k(P), 16k(P), 32k(P) → reset → 1k(B), 2k(P), ...

    Set pivot=False for classic martingale (always bet primary side).
    """

    def __init__(
        self,
        base_won: int,
        primary_side: Outcome,
        martin_steps: int | None = None,
        pivot: bool = True,
    ) -> None:
        if base_won <= 0:
            raise ValueError("base_won must be > 0")
        if primary_side not in (Outcome.PLAYER, Outcome.BANKER):
            raise ValueError("primary_side must be PLAYER or BANKER")
        if martin_steps is not None and martin_steps < 1:
            raise ValueError("martin_steps must be >= 1 or None")
        self.base_won = base_won
        self.primary_side = primary_side
        self.pivot_side = (
            Outcome.PLAYER if primary_side == Outcome.BANKER else Outcome.BANKER
        )
        self.martin_steps = martin_steps
        self.pivot_enabled = pivot
        self._losses_in_a_row = 0
        self._current_side = primary_side

    @property
    def side(self) -> Outcome:
        return self._current_side

    @property
    def losses_in_a_row(self) -> int:
        return self._losses_in_a_row

    def next_bet(self) -> int:
        return self.base_won * (2 ** self._losses_in_a_row)

    def update(self, hand_outcome: Outcome) -> None:
        if hand_outcome == Outcome.TIE:
            return
        if hand_outcome == self._current_side:
            # Win — martin end (or never started)
            self._losses_in_a_row = 0
            self._current_side = self.primary_side
            return
        # Loss
        self._losses_in_a_row += 1
        if (
            self.martin_steps is not None
            and self._losses_in_a_row > self.martin_steps
        ):
            # (martin_steps + 1)-th loss — give up
            self._losses_in_a_row = 0
            self._current_side = self.primary_side
            return
        if self.pivot_enabled:
            self._current_side = self.pivot_side


def payout_won(side: Outcome, bet_won: int, hand_outcome: Outcome) -> int:
    """Return delta to capital (positive = win, negative = loss, 0 = tie/no bet).

    Banker win pays 0.95× (5% commission); fractional won is floored (house keeps it).
    """
    if hand_outcome == Outcome.TIE:
        return 0
    if hand_outcome == side:
        if side == Outcome.BANKER:
            return (bet_won * 95) // 100
        return bet_won
    return -bet_won
