import pytest
from fastapi.testclient import TestClient

from bcc_sim.web.serialize import DEFAULT_CONFIG
from bcc_sim.web.server import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def test_get_defaults_returns_cli_defaults(client):
    r = client.get("/api/defaults")
    assert r.status_code == 200
    j = r.json()
    assert j["strategy_name"] == "martingale"
    assert j["initial_won"] == 100_000
    assert j["target_won"] == 500_000
    assert j["side"] == "BANKER"
    assert j["pivot"] is True


def test_get_index_serves_html(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "")


def _start_config(**overrides) -> dict:
    cfg = dict(DEFAULT_CONFIG)
    cfg["hand_delay_ms"] = 0
    cfg["auto_next"] = True
    cfg.update(overrides)
    return cfg


def test_ws_streams_banner_and_hands(client):
    with client.websocket_connect("/ws/play") as ws:
        ws.send_json({"action": "start", "config": _start_config()})

        banner = ws.receive_json()
        assert banner["type"] == "banner"
        assert banner["config"]["strategy_name"] == "martingale"

        ss = ws.receive_json()
        assert ss["type"] == "session_start"
        assert ss["session_num"] == 1

        hand = ws.receive_json()
        assert hand["type"] == "hand"
        rec = hand["record"]
        assert rec["hand_num"] == 1
        assert rec["bet_side"] in ("BANKER", "PLAYER")
        assert "cards" in rec["player"]
        assert "cards" in rec["banker"]

        ws.send_json({"action": "stop"})


def test_ws_invalid_config_target_below_initial(client):
    with client.websocket_connect("/ws/play") as ws:
        ws.send_json({"action": "start", "config": _start_config(target_won=50_000)})
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "target" in msg["message"]


def test_ws_invalid_first_action(client):
    with client.websocket_connect("/ws/play") as ws:
        ws.send_json({"action": "pause"})
        msg = ws.receive_json()
        assert msg["type"] == "error"


def test_ws_reaches_session_end_with_auto_next(client):
    # With seed=42 and the default martingale settings, the first session ends
    # in RUIN well before exhausting an 8-deck shoe — we should see session_end.
    with client.websocket_connect("/ws/play") as ws:
        ws.send_json({"action": "start", "config": _start_config()})
        saw_end = False
        # Drain up to a generous cap to avoid hanging if something regresses.
        for _ in range(20_000):
            msg = ws.receive_json()
            if msg["type"] == "session_end":
                saw_end = True
                assert msg["result"]["outcome"] in ("WIN", "RUIN")
                assert "cumulative" in msg
                assert msg["cumulative"]["sessions"] == 1
                break
        ws.send_json({"action": "stop"})
        assert saw_end, "session_end 메시지를 수신하지 못했습니다"
