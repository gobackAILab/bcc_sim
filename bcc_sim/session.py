from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Iterable, Iterator

from .baccarat import HandResult, Outcome, play_hand
from .deck import Shoe
from .strategy import FlatBet, Martingale, Strategy, payout_won


@dataclass(frozen=True, slots=True)
class SessionConfig:
    initial_won: int
    target_won: int
    ruin_won: int
    table_max_won: int
    base_bet_won: int
    side: Outcome  # primary side
    strategy_name: str  # "flat" | "martingale"
    martin_steps: int | None
    pivot: bool  # True = pivot martingale (Banker→Player on loss); only used by martingale
    seed: int
    n_decks: int = 8
    cut_offset: int = 14


@dataclass(frozen=True, slots=True)
class SessionResult:
    outcome: str  # "WIN" | "RUIN"
    final_won: int
    hands_played: int
    bets_placed: int  # Tie hands excluded (no bet considered placed)
    total_wagered_won: int  # sum of all (non-Tie) bets
    max_loss_streak: int
    ruin_reason: str | None


@dataclass(frozen=True, slots=True)
class HandRecord:
    """Per-hand snapshot for trace mode (run_session_traced)."""
    hand_num: int
    bet_side: Outcome
    bet_won: int
    hand_outcome: Outcome
    player_total: int
    banker_total: int
    player_cards: tuple
    banker_cards: tuple
    capital_delta: int
    capital_after: int
    cycle_loss_count: int  # losses_in_a_row BEFORE this hand (0 = first attempt)
    martin_event: str  # "" | "start" | "end_win" | "end_giveup"


def _build_strategy(config: SessionConfig) -> Strategy:
    name = config.strategy_name.lower()
    if name == "flat":
        return FlatBet(base_won=config.base_bet_won, side=config.side)
    if name == "martingale":
        return Martingale(
            base_won=config.base_bet_won,
            primary_side=config.side,
            martin_steps=config.martin_steps,
            pivot=config.pivot,
        )
    raise ValueError(f"unknown strategy: {config.strategy_name!r}")


def _hand_iterator_from_shoe(shoe: Shoe) -> Iterator[HandResult]:
    while True:
        shoe.maybe_reshuffle()
        yield play_hand(shoe)


def run_session_traced(
    config: SessionConfig,
    *,
    hands: Iterable[HandResult] | None = None,
) -> tuple[SessionResult, tuple[HandRecord, ...]]:
    """Same as run_session but also records per-hand history."""
    history: list[HandRecord] = []
    result = _run_session_impl(config, hands=hands, history=history)
    return result, tuple(history)


def run_session(
    config: SessionConfig,
    *,
    hands: Iterable[HandResult] | None = None,
) -> SessionResult:
    """Run a single session until WIN or RUIN.

    `hands` lets tests inject a fixed outcome sequence. Production passes None,
    in which case a seeded Shoe drives play_hand.
    """
    return _run_session_impl(config, hands=hands, history=None)


def _run_session_impl(
    config: SessionConfig,
    *,
    hands: Iterable[HandResult] | None,
    history: list[HandRecord] | None,
) -> SessionResult:
    strategy = _build_strategy(config)

    if hands is None:
        shoe = Shoe(
            n_decks=config.n_decks,
            cut_offset=config.cut_offset,
            rng=random.Random(config.seed),
        )
        hand_iter: Iterator[HandResult] = _hand_iterator_from_shoe(shoe)
    else:
        hand_iter = iter(hands)

    capital = config.initial_won
    hands_played = 0
    bets_placed = 0
    total_wagered = 0
    cur_streak = 0
    max_streak = 0

    while True:
        if capital >= config.target_won:
            return SessionResult(
                outcome="WIN",
                final_won=capital,
                hands_played=hands_played,
                bets_placed=bets_placed,
                total_wagered_won=total_wagered,
                max_loss_streak=max_streak,
                ruin_reason=None,
            )
        if capital <= config.ruin_won:
            return SessionResult(
                outcome="RUIN",
                final_won=capital,
                hands_played=hands_played,
                bets_placed=bets_placed,
                total_wagered_won=total_wagered,
                max_loss_streak=max_streak,
                ruin_reason="capital_depleted",
            )

        intended = strategy.next_bet()
        bet_side = strategy.side  # captured before update — payout/streak use this
        over_cap = intended > capital
        over_max = intended > config.table_max_won
        if over_cap or over_max:
            if over_cap and over_max:
                reason = "both"
            elif over_cap:
                reason = "bet_exceeds_capital"
            else:
                reason = "bet_exceeds_table_max"
            return SessionResult(
                outcome="RUIN",
                final_won=capital,
                hands_played=hands_played,
                bets_placed=bets_placed,
                total_wagered_won=total_wagered,
                max_loss_streak=max_streak,
                ruin_reason=reason,
            )

        try:
            result = next(hand_iter)
        except StopIteration as exc:  # pragma: no cover — defensive
            raise RuntimeError("hand source exhausted before session terminated") from exc

        # Capture state BEFORE strategy.update so we can detect martin transitions.
        losses_before = getattr(strategy, "losses_in_a_row", 0)
        delta = payout_won(bet_side, intended, result.outcome)
        capital += delta
        strategy.update(result.outcome)
        losses_after = getattr(strategy, "losses_in_a_row", 0)
        hands_played += 1

        martin_event = ""
        if losses_before == 0 and losses_after > 0:
            martin_event = "start"
        elif losses_before > 0 and losses_after == 0:
            if result.outcome == bet_side:
                martin_event = "end_win"
            else:
                martin_event = "end_giveup"

        if history is not None:
            history.append(HandRecord(
                hand_num=hands_played,
                bet_side=bet_side,
                bet_won=intended,
                hand_outcome=result.outcome,
                player_total=result.player_total,
                banker_total=result.banker_total,
                player_cards=result.player_cards,
                banker_cards=result.banker_cards,
                capital_delta=delta,
                capital_after=capital,
                cycle_loss_count=losses_before,
                martin_event=martin_event,
            ))

        if result.outcome != Outcome.TIE:
            bets_placed += 1
            total_wagered += intended
            if result.outcome == bet_side:
                cur_streak = 0
            else:
                cur_streak += 1
                if cur_streak > max_streak:
                    max_streak = cur_streak
