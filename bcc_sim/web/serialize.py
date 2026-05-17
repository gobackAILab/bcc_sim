from __future__ import annotations

from ..baccarat import Outcome
from ..deck import Card
from ..session import HandRecord, SessionConfig, SessionResult


# CLI 기본값과 동일하게 유지 — 변경 시 main.py 와 함께 갱신.
DEFAULT_CONFIG: dict = {
    "initial_won": 100_000,
    "target_won": 500_000,
    "ruin_won": 50_000,
    "table_max_won": 100_000,
    "base_bet_won": 1_000,
    "side": "BANKER",
    "strategy_name": "martingale",
    "martin_steps": 5,
    "pivot": True,
    "seed": 42,
    "n_decks": 8,
    "cut_offset": 14,
    "hand_delay_ms": 50,
    "auto_next": False,
}


def card_to_dict(card: Card) -> dict:
    return {
        "rank": card.rank,
        "suit": card.suit,
        "label": str(card),
        "value": card.baccarat_value,
    }


def hand_record_to_dict(record: HandRecord) -> dict:
    return {
        "hand_num": record.hand_num,
        "bet_side": record.bet_side.value,
        "bet_won": record.bet_won,
        "hand_outcome": record.hand_outcome.value,
        "player": {
            "cards": [card_to_dict(c) for c in record.player_cards],
            "total": record.player_total,
        },
        "banker": {
            "cards": [card_to_dict(c) for c in record.banker_cards],
            "total": record.banker_total,
        },
        "capital_delta": record.capital_delta,
        "capital_after": record.capital_after,
        "cycle_loss_count": record.cycle_loss_count,
        "martin_event": record.martin_event,
    }


def session_result_to_dict(result: SessionResult) -> dict:
    return {
        "outcome": result.outcome,
        "final_won": result.final_won,
        "hands_played": result.hands_played,
        "bets_placed": result.bets_placed,
        "total_wagered_won": result.total_wagered_won,
        "max_loss_streak": result.max_loss_streak,
        "ruin_reason": result.ruin_reason,
    }


def session_config_to_dict(config: SessionConfig) -> dict:
    return {
        "initial_won": config.initial_won,
        "target_won": config.target_won,
        "ruin_won": config.ruin_won,
        "table_max_won": config.table_max_won,
        "base_bet_won": config.base_bet_won,
        "side": config.side.value,
        "strategy_name": config.strategy_name,
        "martin_steps": config.martin_steps,
        "pivot": config.pivot,
        "seed": config.seed,
        "n_decks": config.n_decks,
        "cut_offset": config.cut_offset,
    }


def _parse_side(value) -> Outcome:
    s = str(value).upper()
    if s == "BANKER":
        return Outcome.BANKER
    if s == "PLAYER":
        return Outcome.PLAYER
    raise ValueError(f"side 는 banker/player 만 허용됩니다: {value!r}")


def session_config_from_dict(d: dict) -> SessionConfig:
    return SessionConfig(
        initial_won=int(d["initial_won"]),
        target_won=int(d["target_won"]),
        ruin_won=int(d["ruin_won"]),
        table_max_won=int(d["table_max_won"]),
        base_bet_won=int(d["base_bet_won"]),
        side=_parse_side(d["side"]),
        strategy_name=str(d["strategy_name"]),
        martin_steps=None if d.get("martin_steps") in (None, "") else int(d["martin_steps"]),
        pivot=bool(d.get("pivot", True)),
        seed=int(d.get("seed", 42)),
        n_decks=int(d.get("n_decks", 8)),
        cut_offset=int(d.get("cut_offset", 14)),
    )
