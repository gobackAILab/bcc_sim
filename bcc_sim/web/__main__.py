from __future__ import annotations

import argparse

import uvicorn


def main() -> int:
    p = argparse.ArgumentParser(
        prog="python -m bcc_sim.web",
        description="bcc-sim 웹 인터페이스 (FastAPI + WebSocket).",
    )
    p.add_argument("--host", default="127.0.0.1", help="기본 127.0.0.1 (로컬). LAN 공유는 0.0.0.0.")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--reload", action="store_true", help="개발용 자동 reload")
    args = p.parse_args()

    if args.host == "0.0.0.0":
        print(f"⚠ 모든 네트워크 인터페이스에서 접근 가능합니다 (0.0.0.0:{args.port}).")

    print(f"  → http://{'localhost' if args.host == '0.0.0.0' else args.host}:{args.port}")

    uvicorn.run(
        "bcc_sim.web.server:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
