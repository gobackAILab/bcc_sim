from __future__ import annotations

import argparse
import os
import sys
import time
from dataclasses import replace

from bcc_sim.baccarat import Outcome
from bcc_sim.report import (
    LiveDashboard,
    disable_color,
    format_banner,
    format_report,
    iter_live_session_lines,
    write_session_log,
)
from bcc_sim.runner import _derive_session_seeds, run_experiment
from bcc_sim.session import SessionConfig, run_session_traced


def _positive_int(value: str) -> int:
    n = int(value)
    if n <= 0:
        raise argparse.ArgumentTypeError(f"양의 정수여야 합니다: {value!r}")
    return n


def _non_negative_int(value: str) -> int:
    n = int(value)
    if n < 0:
        raise argparse.ArgumentTypeError(f"음수가 아닌 정수여야 합니다: {value!r}")
    return n


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="bcc-sim",
        description="바카라 마틴게일 시뮬레이터 — 카드 한 장씩 딜링하며 자본이 녹는 과정을 보여줍니다.",
    )
    # Mode
    p.add_argument(
        "--mode",
        choices=["live", "stats"],
        default="live",
        help="live: 카드 딜링 라이브 시뮬레이션 (기본). stats: 다수 세션 통계 집계.",
    )
    # Strategy
    p.add_argument(
        "--strategy",
        choices=["flat", "martingale"],
        default="martingale",
    )
    p.add_argument(
        "--side",
        choices=["player", "banker"],
        default="banker",
        help="primary 사이드. 피벗 모드에서는 시작/복귀 사이드.",
    )
    # Capital
    p.add_argument("--initial", type=_non_negative_int, default=100_000,
                   help="초기 자본 (원, default 100,000)")
    p.add_argument("--target", type=_non_negative_int, default=500_000,
                   help="목표 자본 (원, default 500,000)")
    p.add_argument("--ruin", type=_non_negative_int, default=50_000,
                   help="파산 임계 자본 (원, default 50,000)")
    p.add_argument("--table-max", type=_non_negative_int, default=100_000,
                   help="테이블 베팅 상한 (원, default 100,000)")
    p.add_argument("--base-bet", type=_positive_int, default=1_000,
                   help="기준 베팅 (원, default 1,000)")
    # Martingale
    p.add_argument(
        "--martin-steps",
        type=_positive_int,
        default=5,
        help="마틴 더블링 최대 횟수 (N+1번째 패배에서 reset). default 5.",
    )
    p.add_argument(
        "--no-martin-limit",
        action="store_true",
        help="마틴 reset 비활성화 (무한 더블)",
    )
    pivot_group = p.add_mutually_exclusive_group()
    pivot_group.add_argument("--pivot", dest="pivot", action="store_true", default=True,
                             help="피벗 모드 (기본): Banker 패배 → Player 전환")
    pivot_group.add_argument("--no-pivot", dest="pivot", action="store_false",
                             help="피벗 비활성: 한 사이드만 베팅")
    # Live mode options
    p.add_argument("--hand-delay", type=float, default=0.3,
                   help="라이브 모드 핸드 간 지연 (초, default 0.3)")
    p.add_argument("--auto", action="store_true",
                   help="라이브 모드: 세션 사이 Enter 대기 없이 자동 진행")
    p.add_argument("--log-dir", default="./logs",
                   help="세션 로그 저장 디렉터리 (기본 ./logs). 세션마다 별도 파일.")
    p.add_argument("--no-log", action="store_true",
                   help="세션 로그 파일 작성 비활성화")
    p.add_argument("--no-dashboard", action="store_true",
                   help="고정 대시보드 비활성화 (스크롤 모드로 폴백)")
    # Stats mode options
    p.add_argument("--sessions", type=_positive_int, default=10_000,
                   help="stats 모드: 집계 세션 수 (default 10,000). live 모드에서는 무시.")
    p.add_argument("--no-progress", action="store_true",
                   help="stats 모드 tqdm 진행률 바 비활성화")
    # Shared
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--n-decks", type=_positive_int, default=8)
    p.add_argument("--cut-offset", type=_non_negative_int, default=14)
    p.add_argument("--no-color", action="store_true", help="ANSI 색 비활성화")
    return p


def _validate(args: argparse.Namespace) -> int | None:
    if args.target <= args.initial:
        print("error: --target 은 --initial 보다 커야 합니다.", file=sys.stderr)
        return 2
    if args.ruin >= args.initial:
        print("error: --ruin 은 --initial 보다 작아야 합니다.", file=sys.stderr)
        return 2
    if args.base_bet > args.table_max:
        print("error: --base-bet 이 --table-max 를 초과합니다.", file=sys.stderr)
        return 2
    if args.base_bet > args.initial:
        print("error: --base-bet 이 --initial 자본을 초과합니다.", file=sys.stderr)
        return 2
    return None


def _build_config(args: argparse.Namespace) -> SessionConfig:
    side = Outcome.BANKER if args.side == "banker" else Outcome.PLAYER
    martin_steps = None if args.no_martin_limit else args.martin_steps
    return SessionConfig(
        initial_won=args.initial,
        target_won=args.target,
        ruin_won=args.ruin,
        table_max_won=args.table_max,
        base_bet_won=args.base_bet,
        side=side,
        strategy_name=args.strategy,
        martin_steps=martin_steps,
        pivot=args.pivot,
        seed=args.seed,
        n_decks=args.n_decks,
        cut_offset=args.cut_offset,
    )


def _run_live(config: SessionConfig, args: argparse.Namespace) -> int:
    """라이브 모드: 고정 대시보드 + 로그 파일.

    TTY 가 아니거나 --no-dashboard 면 스크롤 모드로 폴백.
    """
    use_dashboard = sys.stdout.isatty() and not args.no_dashboard
    delay = max(0.0, args.hand_delay)
    session_count = 0
    wins = 0
    ruins = 0
    cumulative_pnl = 0  # 모든 종료된 세션의 (final_won - initial_won) 합
    log_dir = None
    if not args.no_log:
        log_dir = os.path.abspath(args.log_dir)
        os.makedirs(log_dir, exist_ok=True)

    # In dashboard mode, the banner is shown briefly before clearing for the dashboard.
    if not use_dashboard:
        print(format_banner(config, mode="live"))

    try:
        while True:
            session_count += 1
            session_seed = _derive_session_seeds(args.seed, session_count)[session_count - 1]
            trace_config = replace(config, seed=session_seed)
            result, history = run_session_traced(trace_config)

            log_path = None
            if log_dir is not None:
                log_path = os.path.join(
                    log_dir,
                    f"session_{session_count:04d}_seed-{session_seed}.log",
                )
                write_session_log(log_path, trace_config, session_count, result, history)

            if use_dashboard:
                _animate_session_dashboard(
                    trace_config, session_count, result, history, log_path, delay,
                    prev_pnl=cumulative_pnl,
                    prev_sessions=session_count - 1,
                    prev_wins=wins,
                    prev_ruins=ruins,
                )
            else:
                # Scrolling fallback
                for line in iter_live_session_lines(
                    trace_config, result, history, session_num=session_count
                ):
                    print(line, flush=True)
                    if delay > 0:
                        time.sleep(delay)
                if log_path:
                    print(f"  로그: {log_path}")

            # Update cumulative stats AFTER session completes
            session_pnl = result.final_won - config.initial_won
            cumulative_pnl += session_pnl
            if result.outcome == "WIN":
                wins += 1
            else:
                ruins += 1

            if not args.auto:
                pnl_str = _fmt_pnl_plain(cumulative_pnl)
                try:
                    response = input(
                        f"\n  [세션 {session_count} 완료 — "
                        f"승 {wins} / 파산 {ruins}  │  "
                        f"누적 손익 {pnl_str}]  "
                        f"Enter: 다음 │ q + Enter: 종료 > "
                    ).strip().lower()
                    if response == "q":
                        break
                except (EOFError, KeyboardInterrupt):
                    print()
                    break
    except KeyboardInterrupt:
        print("\n[중단됨]")

    print()
    print(f"  총 {session_count} 세션 — "
          f"승 {wins} ({wins / max(session_count, 1) * 100:.0f}%) / "
          f"파산 {ruins} ({ruins / max(session_count, 1) * 100:.0f}%)")
    if session_count > 0:
        invested = session_count * config.initial_won
        avg_pnl = cumulative_pnl / session_count
        print(f"  누적 손익: {_fmt_pnl_plain(cumulative_pnl)}  "
              f"(투입 {invested:,}원 / 세션 평균 {avg_pnl:+,.0f}원)")
    if log_dir:
        print(f"  로그 위치: {log_dir}/")
    return 0


def _fmt_pnl_plain(delta: int) -> str:
    """Plain (no ANSI) signed won — used for input() prompt and final summary."""
    if delta > 0:
        return f"+{delta:,}원"
    if delta < 0:
        return f"{delta:,}원"
    return "0원"


def _animate_session_dashboard(
    config: SessionConfig,
    session_num: int,
    result,
    history,
    log_path: str | None,
    delay: float,
    *,
    prev_pnl: int = 0,
    prev_sessions: int = 0,
    prev_wins: int = 0,
    prev_ruins: int = 0,
) -> None:
    """Animate session inside the LiveDashboard, hand by hand."""
    with LiveDashboard(config, is_tty=True) as dash:
        dash.set_cumulative(
            prev_pnl=prev_pnl,
            prev_sessions=prev_sessions,
            prev_wins=prev_wins,
            prev_ruins=prev_ruins,
        )
        if session_num > 1:
            dash.reset_for_next_session()

        for record in history:
            dash.render_hand(session_num, record, log_path=log_path)
            if delay > 0:
                time.sleep(delay)
        dash.render_session_end(session_num, result, log_path=log_path)


def _run_stats(config: SessionConfig, args: argparse.Namespace) -> int:
    """Stats 모드: N 세션 집계 + 진행률 바."""
    print(format_banner(config, mode="stats", n_sessions=args.sessions))
    result = run_experiment(
        config,
        n_sessions=args.sessions,
        master_seed=args.seed,
        show_progress=not args.no_progress,
    )
    print(format_report(config, result))
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    if args.no_color:
        disable_color()

    err = _validate(args)
    if err is not None:
        return err

    config = _build_config(args)

    if args.mode == "live":
        return _run_live(config, args)
    return _run_stats(config, args)


if __name__ == "__main__":
    raise SystemExit(main())
