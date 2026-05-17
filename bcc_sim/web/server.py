from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, WebSocket
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .serialize import DEFAULT_CONFIG
from .session_runner import run_play_socket


_STATIC_DIR = Path(__file__).parent / "static"


def create_app() -> FastAPI:
    app = FastAPI(title="bcc-sim web", version="0.1.0")
    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(_STATIC_DIR / "index.html")

    @app.get("/api/defaults")
    async def defaults() -> dict:
        return DEFAULT_CONFIG

    @app.websocket("/ws/play")
    async def play(ws: WebSocket) -> None:
        await run_play_socket(ws)

    return app


app = create_app()
