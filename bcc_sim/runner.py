from __future__ import annotations

import random
import sys
from dataclasses import dataclass, replace

import numpy as np
from tqdm import tqdm

from .baccarat import Outcome
from .session import SessionConfig, SessionResult, run_session


# Theoretical house edge per bet for 8-deck baccarat (standard payouts).
THEORETICAL_EDGE: dict[Outcome, float] = {
    Outcome.BANKER: -0.0106,
    Outcome.PLAYER: -0.0124,
}


@dataclass(frozen=True, slots=True)
class ExperimentResult:
    n_sessions: int
    win_rate: float
    ruin_rate: float
    avg_final_won: float
    avg_hands: float
    avg_bets: float
    loss_streak_p50: int
    loss_streak_p95: int
    loss_streak_max: int
    avg_return_per_bet: float
    theoretical_edge: float
    ruin_reason_counts: dict[str, int]


def _derive_session_seeds(master_seed: int, n: int) -> list[int]:
    master = random.Random(master_seed)
    return [master.randrange(2**63) for _ in range(n)]


def _aggregate(
    config: SessionConfig,
    results: list[SessionResult],
) -> ExperimentResult:
    n = len(results)
    wins = sum(1 for r in results if r.outcome == "WIN")
    ruins = sum(1 for r in results if r.outcome == "RUIN")

    streaks = np.array([r.max_loss_streak for r in results], dtype=np.int64)
    finals = np.array([r.final_won for r in results], dtype=np.float64)
    hands = np.array([r.hands_played for r in results], dtype=np.float64)
    bets = np.array([r.bets_placed for r in results], dtype=np.float64)
    wagered = np.array([r.total_wagered_won for r in results], dtype=np.float64)

    total_pnl = float(finals.sum()) - float(n * config.initial_won)
    total_wagered = float(wagered.sum())
    avg_return_per_bet = (total_pnl / total_wagered) if total_wagered > 0 else 0.0

    reasons: dict[str, int] = {}
    for r in results:
        if r.ruin_reason is not None:
            reasons[r.ruin_reason] = reasons.get(r.ruin_reason, 0) + 1

    return ExperimentResult(
        n_sessions=n,
        win_rate=wins / n,
        ruin_rate=ruins / n,
        avg_final_won=float(finals.mean()),
        avg_hands=float(hands.mean()),
        avg_bets=float(bets.mean()),
        loss_streak_p50=int(np.percentile(streaks, 50)),
        loss_streak_p95=int(np.percentile(streaks, 95)),
        loss_streak_max=int(streaks.max()),
        avg_return_per_bet=avg_return_per_bet,
        theoretical_edge=THEORETICAL_EDGE.get(config.side, 0.0),
        ruin_reason_counts=reasons,
    )


def run_experiment(
    config: SessionConfig,
    n_sessions: int,
    master_seed: int,
    *,
    show_progress: bool = True,
) -> ExperimentResult:
    if n_sessions <= 0:
        raise ValueError("n_sessions must be > 0")
    session_seeds = _derive_session_seeds(master_seed, n_sessions)

    results: list[SessionResult] = []
    wins = 0
    ruins = 0
    capital_sum = 0

    iterator = session_seeds
    pbar = None
    if show_progress:
        pbar = tqdm(
            total=n_sessions,
            desc="시뮬레이션",
            unit="세션",
            file=sys.stderr,
            dynamic_ncols=True,
        )

    try:
        for s in iterator:
            r = run_session(replace(config, seed=s))
            results.append(r)
            if r.outcome == "WIN":
                wins += 1
            else:
                ruins += 1
            capital_sum += r.final_won

            if pbar is not None:
                n = len(results)
                pbar.set_postfix({
                    "승률": f"{wins / n * 100:.1f}%",
                    "파산률": f"{ruins / n * 100:.1f}%",
                    "평균자본": f"{capital_sum / n:,.0f}원",
                })
                pbar.update(1)
    finally:
        if pbar is not None:
            pbar.close()

    return _aggregate(config, results)
