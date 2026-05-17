from __future__ import annotations

import random
from dataclasses import dataclass


_RANK_NAMES = {1: "A", 11: "J", 12: "Q", 13: "K"}
_SUIT_SYMBOLS = {"S": "♠", "H": "♥", "D": "♦", "C": "♣"}


@dataclass(frozen=True, slots=True)
class Card:
    rank: int  # 1-13 (A=1, J=11, Q=12, K=13)
    suit: str  # 'S','H','D','C'

    @property
    def baccarat_value(self) -> int:
        if self.rank >= 10:
            return 0
        return self.rank

    def __str__(self) -> str:
        rank = _RANK_NAMES.get(self.rank, str(self.rank))
        suit = _SUIT_SYMBOLS.get(self.suit, self.suit)
        return f"{rank}{suit}"


_SUITS = ("S", "H", "D", "C")


def _build_deck(n_decks: int) -> list[Card]:
    return [
        Card(rank, suit)
        for _ in range(n_decks)
        for suit in _SUITS
        for rank in range(1, 14)
    ]


class Shoe:
    def __init__(
        self,
        n_decks: int = 8,
        cut_offset: int = 14,
        rng: random.Random | None = None,
    ) -> None:
        if cut_offset < 0:
            raise ValueError("cut_offset must be >= 0")
        if n_decks < 1:
            raise ValueError("n_decks must be >= 1")
        self.n_decks = n_decks
        self.cut_offset = cut_offset
        self._rng = rng if rng is not None else random.Random()
        self._cards: list[Card] = []
        self._index = 0
        self._reshuffle()

    def _reshuffle(self) -> None:
        self._cards = _build_deck(self.n_decks)
        self._rng.shuffle(self._cards)
        self._index = 0

    def cards_remaining(self) -> int:
        return len(self._cards) - self._index

    def needs_reshuffle(self) -> bool:
        return self.cards_remaining() <= self.cut_offset

    def draw(self) -> Card:
        if self._index >= len(self._cards):
            self._reshuffle()
        card = self._cards[self._index]
        self._index += 1
        return card

    def maybe_reshuffle(self) -> bool:
        if self.needs_reshuffle():
            self._reshuffle()
            return True
        return False
