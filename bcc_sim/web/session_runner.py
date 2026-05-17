from __future__ import annotations

import asyncio
from dataclasses import dataclass, replace

from fastapi import WebSocket, WebSocketDisconnect

from ..runner import _derive_session_seeds
from ..session import run_session_traced
from .serialize import (
    hand_record_to_dict,
    session_config_from_dict,
    session_config_to_dict,
    session_result_to_dict,
)


@dataclass
class ControlState:
    paused: bool = False
    stop_requested: bool = False
    next_requested: bool = False


def _validate_config(d: dict) -> str | None:
    required = (
        "initial_won", "target_won", "ruin_won",
        "table_max_won", "base_bet_won",
        "side", "strategy_name",
    )
    for key in required:
        if key not in d:
            return f"필수 설정 누락: {key}"
    try:
        initial = int(d["initial_won"])
        target = int(d["target_won"])
        ruin = int(d["ruin_won"])
        base = int(d["base_bet_won"])
        table_max = int(d["table_max_won"])
    except (ValueError, TypeError) as e:
        return f"잘못된 설정 값: {e}"
    if base <= 0:
        return "base-bet 은 양의 정수여야 합니다"
    if target <= initial:
        return "target 은 initial 보다 커야 합니다"
    if ruin >= initial:
        return "ruin 은 initial 보다 작아야 합니다"
    if base > table_max:
        return "base-bet 이 table-max 를 초과합니다"
    if base > initial:
        return "base-bet 이 initial 자본을 초과합니다"
    return None


async def _control_reader(ws: WebSocket, state: ControlState) -> None:
    """Listen for control messages until the socket closes or stop fires."""
    try:
        while not state.stop_requested:
            msg = await ws.receive_json()
            action = (msg or {}).get("action", "")
            if action == "pause":
                state.paused = True
            elif action == "resume":
                state.paused = False
            elif action == "next_session":
                state.next_requested = True
            elif action == "stop":
                state.stop_requested = True
                return
    except WebSocketDisconnect:
        state.stop_requested = True
    except Exception:
        state.stop_requested = True


async def run_play_socket(ws: WebSocket) -> None:
    await ws.accept()

    try:
        first = await ws.receive_json()
    except WebSocketDisconnect:
        return
    except Exception:
        await _safe_close(ws)
        return

    if (first or {}).get("action") != "start":
        await _safe_send(ws, {"type": "error", "message": "첫 메시지는 action=start 여야 합니다"})
        await _safe_close(ws)
        return

    cfg_dict = first.get("config", {}) or {}
    err = _validate_config(cfg_dict)
    if err is not None:
        await _safe_send(ws, {"type": "error", "message": err})
        await _safe_close(ws)
        return

    try:
        config = session_config_from_dict(cfg_dict)
    except (KeyError, ValueError, TypeError) as e:
        await _safe_send(ws, {"type": "error", "message": f"잘못된 설정: {e}"})
        await _safe_close(ws)
        return

    delay = max(0.0, float(cfg_dict.get("hand_delay_ms", 300))) / 1000.0
    auto_next = bool(cfg_dict.get("auto_next", False))
    master_seed = config.seed

    state = ControlState()
    reader = asyncio.create_task(_control_reader(ws, state))

    cumulative = {"sessions": 0, "wins": 0, "ruins": 0, "pnl": 0}
    try:
        await _safe_send(ws, {
            "type": "banner",
            "config": session_config_to_dict(config),
            "hand_delay_ms": int(delay * 1000),
            "auto_next": auto_next,
        })

        session_num = 0
        while not state.stop_requested:
            session_num += 1
            session_seed = _derive_session_seeds(master_seed, session_num)[session_num - 1]
            trace_config = replace(config, seed=session_seed)
            result, history = run_session_traced(trace_config)

            await _safe_send(ws, {
                "type": "session_start",
                "session_num": session_num,
                "seed": session_seed,
                "config": session_config_to_dict(trace_config),
            })

            for record in history:
                # Pause loop yields frequently so the reader can update state.
                while state.paused and not state.stop_requested:
                    await asyncio.sleep(0.05)
                if state.stop_requested:
                    break
                await _safe_send(ws, {
                    "type": "hand",
                    "record": hand_record_to_dict(record),
                })
                # Always yield (delay=0 → just yields control to the reader).
                await asyncio.sleep(delay)

            if state.stop_requested:
                break

            cumulative["sessions"] += 1
            session_pnl = result.final_won - config.initial_won
            cumulative["pnl"] += session_pnl
            if result.outcome == "WIN":
                cumulative["wins"] += 1
            else:
                cumulative["ruins"] += 1

            await _safe_send(ws, {
                "type": "session_end",
                "result": session_result_to_dict(result),
                "session_pnl": session_pnl,
                "cumulative": dict(cumulative),
            })

            if not auto_next:
                while not state.next_requested and not state.stop_requested:
                    await asyncio.sleep(0.05)
                state.next_requested = False
    finally:
        reader.cancel()
        try:
            await reader
        except (asyncio.CancelledError, Exception):
            pass
        await _safe_close(ws)


async def _safe_send(ws: WebSocket, payload: dict) -> None:
    try:
        await ws.send_json(payload)
    except Exception:
        # Connection closed mid-send — let the outer loop notice via state.
        pass


async def _safe_close(ws: WebSocket) -> None:
    try:
        await ws.close()
    except Exception:
        pass
