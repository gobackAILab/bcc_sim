from bcc_sim.baccarat import Outcome
from bcc_sim.deck import Card
from bcc_sim.session import HandRecord, SessionConfig, SessionResult
from bcc_sim.web.serialize import (
    DEFAULT_CONFIG,
    card_to_dict,
    hand_record_to_dict,
    session_config_from_dict,
    session_config_to_dict,
    session_result_to_dict,
)


def test_card_to_dict_number_card():
    assert card_to_dict(Card(7, "S")) == {
        "rank": 7, "suit": "S", "label": "7♠", "value": 7,
    }


def test_card_to_dict_face_card_value_zero():
    d = card_to_dict(Card(11, "H"))  # J
    assert d["label"] == "J♥"
    assert d["value"] == 0


def test_card_to_dict_ace_value_one():
    d = card_to_dict(Card(1, "C"))
    assert d["label"] == "A♣"
    assert d["value"] == 1


def test_session_config_round_trip_banker_martingale():
    cfg = SessionConfig(
        initial_won=100_000, target_won=500_000, ruin_won=50_000,
        table_max_won=100_000, base_bet_won=1_000,
        side=Outcome.BANKER, strategy_name="martingale",
        martin_steps=5, pivot=True, seed=42,
    )
    d = session_config_to_dict(cfg)
    assert d["side"] == "BANKER"
    assert session_config_from_dict(d) == cfg


def test_session_config_round_trip_player_flat_none_steps():
    cfg = SessionConfig(
        initial_won=200_000, target_won=300_000, ruin_won=100_000,
        table_max_won=50_000, base_bet_won=500,
        side=Outcome.PLAYER, strategy_name="flat",
        martin_steps=None, pivot=False, seed=7,
    )
    d = session_config_to_dict(cfg)
    assert d["martin_steps"] is None
    assert session_config_from_dict(d) == cfg


def test_session_config_from_dict_accepts_lowercase_side():
    d = dict(DEFAULT_CONFIG)
    d["side"] = "player"
    cfg = session_config_from_dict(d)
    assert cfg.side == Outcome.PLAYER


def test_hand_record_serialization_complete():
    rec = HandRecord(
        hand_num=17,
        bet_side=Outcome.BANKER,
        bet_won=2_000,
        hand_outcome=Outcome.PLAYER,
        player_total=8,
        banker_total=5,
        player_cards=(Card(7, "S"), Card(1, "H")),
        banker_cards=(Card(2, "D"), Card(3, "C"), Card(10, "S")),
        capital_delta=-2_000,
        capital_after=87_000,
        cycle_loss_count=1,
        martin_event="start",
    )
    d = hand_record_to_dict(rec)
    assert d["hand_num"] == 17
    assert d["bet_side"] == "BANKER"
    assert d["bet_won"] == 2_000
    assert d["hand_outcome"] == "PLAYER"
    assert d["player"]["total"] == 8
    assert [c["label"] for c in d["player"]["cards"]] == ["7♠", "A♥"]
    assert d["banker"]["total"] == 5
    assert [c["label"] for c in d["banker"]["cards"]] == ["2♦", "3♣", "10♠"]
    assert d["capital_delta"] == -2_000
    assert d["capital_after"] == 87_000
    assert d["cycle_loss_count"] == 1
    assert d["martin_event"] == "start"


def test_session_result_serialization():
    r = SessionResult(
        outcome="RUIN",
        final_won=37_150,
        hands_played=120,
        bets_placed=115,
        total_wagered_won=200_000,
        max_loss_streak=4,
        ruin_reason="bet_exceeds_capital",
    )
    d = session_result_to_dict(r)
    assert d["outcome"] == "RUIN"
    assert d["final_won"] == 37_150
    assert d["max_loss_streak"] == 4
    assert d["ruin_reason"] == "bet_exceeds_capital"


def test_default_config_matches_cli_defaults():
    # main.py defaults — keep in sync if either side changes.
    assert DEFAULT_CONFIG["initial_won"] == 100_000
    assert DEFAULT_CONFIG["target_won"] == 500_000
    assert DEFAULT_CONFIG["ruin_won"] == 50_000
    assert DEFAULT_CONFIG["table_max_won"] == 100_000
    assert DEFAULT_CONFIG["base_bet_won"] == 1_000
    assert DEFAULT_CONFIG["side"] == "BANKER"
    assert DEFAULT_CONFIG["strategy_name"] == "martingale"
    assert DEFAULT_CONFIG["martin_steps"] == 5
    assert DEFAULT_CONFIG["pivot"] is True
    assert DEFAULT_CONFIG["seed"] == 42
    assert DEFAULT_CONFIG["n_decks"] == 8
    assert DEFAULT_CONFIG["cut_offset"] == 14
