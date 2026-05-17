from __future__ import annotations

import random
from collections import Counter

from bcc_sim.deck import Card, Shoe


def test_eight_deck_shoe_has_416_cards() -> None:
    shoe = Shoe(n_decks=8, cut_offset=0, rng=random.Random(0))
    assert shoe.cards_remaining() == 8 * 52


def test_no_card_drawn_twice_within_one_shoe() -> None:
    shoe = Shoe(n_decks=8, cut_offset=0, rng=random.Random(0))
    drawn: list[Card] = [shoe.draw() for _ in range(8 * 52)]
    counter = Counter(drawn)
    for card, count in counter.items():
        assert count == 8, f"{card} appeared {count} times (expected 8 across 8 decks)"


def test_same_seed_produces_same_draw_order() -> None:
    a = Shoe(n_decks=8, cut_offset=14, rng=random.Random(12345))
    b = Shoe(n_decks=8, cut_offset=14, rng=random.Random(12345))
    for _ in range(100):
        assert a.draw() == b.draw()


def test_reshuffle_triggers_when_remaining_below_cut_offset() -> None:
    shoe = Shoe(n_decks=1, cut_offset=10, rng=random.Random(0))
    assert shoe.cards_remaining() == 52
    while shoe.cards_remaining() > 10:
        shoe.draw()
    assert shoe.needs_reshuffle()
    assert shoe.maybe_reshuffle() is True
    assert shoe.cards_remaining() == 52


def test_card_baccarat_values() -> None:
    assert Card(1, "S").baccarat_value == 1
    assert Card(9, "S").baccarat_value == 9
    assert Card(10, "S").baccarat_value == 0
    assert Card(11, "S").baccarat_value == 0
    assert Card(12, "S").baccarat_value == 0
    assert Card(13, "S").baccarat_value == 0


def test_draw_auto_reshuffles_when_exhausted() -> None:
    shoe = Shoe(n_decks=1, cut_offset=0, rng=random.Random(0))
    for _ in range(52):
        shoe.draw()
    assert shoe.cards_remaining() == 0
    next_card = shoe.draw()
    assert isinstance(next_card, Card)
    assert shoe.cards_remaining() == 51
