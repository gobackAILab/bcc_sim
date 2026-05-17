from __future__ import annotations

import shutil
import sys

from .baccarat import Outcome
from .runner import ExperimentResult
from .session import HandRecord, SessionConfig, SessionResult


# --- ANSI cursor control ---

ANSI_CLEAR_SCREEN = "\033[2J"
ANSI_CURSOR_HOME = "\033[H"
ANSI_CLEAR_LINE = "\033[K"
ANSI_HIDE_CURSOR = "\033[?25l"
ANSI_SHOW_CURSOR = "\033[?25h"


# --- ANSI colors ---

class C:
    """ANSI color codes. Set USE_COLOR = False to disable."""
    USE_COLOR = sys.stdout.isatty()
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    GRAY = "\033[90m"
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RESET = "\033[0m"


def disable_color() -> None:
    C.USE_COLOR = False


def _c(color: str, text: str) -> str:
    if not C.USE_COLOR:
        return text
    return f"{color}{text}{C.RESET}"


def _fmt_won(amount: float) -> str:
    return f"{amount:,.0f}원"


def _fmt_pct(x: float) -> str:
    return f"{x * 100:.2f}%"


def format_banner(
    config: SessionConfig,
    *,
    mode: str = "live",
    n_sessions: int = 0,
) -> str:
    """Big startup banner that shows the user exactly what's about to run."""
    bar = _c(C.CYAN, "═" * 76)
    title = _c(C.BOLD + C.CYAN, "  바카라 마틴게일 시뮬레이터 — 교육용")
    primary = config.side.name.lower()
    secondary = "player" if primary == "banker" else "banker"
    martin_max = (
        config.base_bet_won * (2 ** config.martin_steps)
        if config.martin_steps is not None else None
    )
    strategy_desc = (
        f"마틴게일 ({'피벗 ON' if config.pivot else '피벗 OFF'})"
        if config.strategy_name == "martingale" else config.strategy_name
    )
    target_pct = (config.target_won - config.initial_won) / config.initial_won * 100
    ruin_pct = (config.ruin_won - config.initial_won) / config.initial_won * 100
    lines = [
        bar,
        title,
        bar,
        "",
        _c(C.BOLD, "  ◆ 게임"),
        "    슈 구성:     8덱 (416장) 무복원 셔플, 컷 오프셋 14장",
        "    드로우 룰:   Punto Banco (표준)",
        "    Banker 배당: 1:0.95 (5% 커미션)",
        "    Player 배당: 1:1",
        "    Tie:         베팅 무효 (자본·시퀀스 변화 없음)",
        "",
        _c(C.BOLD, "  ◆ 전략"),
        f"    유형:        {_c(C.YELLOW, strategy_desc)}",
        f"    기본 베팅:   {_c(C.YELLOW, _fmt_won(config.base_bet_won))}"
        f" ({primary} 시작" +
        (f", 패배 시 {secondary} 로 피벗" if config.pivot and config.strategy_name == "martingale"
         else "") + ")",
    ]
    if config.strategy_name == "martingale":
        if config.martin_steps is not None:
            lines.append(
                f"    마틴 스텝:   {_c(C.YELLOW, str(config.martin_steps))}단계"
                f" (최대 {_fmt_won(martin_max)} 까지 더블링,"
                f" {config.martin_steps + 1}번째 패배에서 리셋)"
            )
        else:
            lines.append("    마틴 스텝:   무제한 (테이블 상한까지 더블링)")
    lines += [
        "",
        _c(C.BOLD, "  ◆ 자본 조건 (원화)"),
        f"    시작 자본:   {_c(C.CYAN, _fmt_won(config.initial_won))}",
        f"    목표 (WIN):  {_c(C.GREEN, _fmt_won(config.target_won))}"
        f"  ({target_pct:+.0f}%)",
        f"    파산 (RUIN): {_c(C.RED, _fmt_won(config.ruin_won))}"
        f"  ({ruin_pct:+.0f}%)",
        f"    테이블 상한: {_c(C.YELLOW, _fmt_won(config.table_max_won))}",
        "",
        _c(C.BOLD, "  ◆ 실행"),
    ]
    if mode == "live":
        lines += [
            f"    모드:        {_c(C.BOLD + C.CYAN, 'LIVE')} (카드 딜링 시뮬레이션)",
            f"    조작:        Enter = 다음 세션 │ q + Enter = 종료",
        ]
    else:
        lines += [
            f"    모드:        {_c(C.BOLD + C.CYAN, 'STATS')} (집계 통계)",
            f"    총 세션:     {_c(C.CYAN, f'{n_sessions:,}')}",
        ]
    lines += [
        f"    시드:        {config.seed}",
        bar,
    ]
    return "\n".join(lines)


def _gauge_bar(value: int, low: int, high: int, width: int = 30,
               initial: int | None = None) -> str:
    """Return a colored `[██░░░░] 12%` gauge between low (파산) and high (목표).

    Color: filled portion is green when above initial capital, red when below.
    Marker `│` denotes the starting capital position.
    """
    span = high - low
    if span <= 0:
        return "[" + "?" * width + "] n/a"
    clamped = max(low, min(high, value))
    ratio = (clamped - low) / span
    filled = int(ratio * width)

    # Determine color based on whether we're above/below initial
    if initial is not None and value < initial:
        fill_color = C.RED
    elif initial is not None and value >= initial:
        fill_color = C.GREEN
    else:
        fill_color = C.CYAN

    filled_str = _c(fill_color, "█" * filled)
    empty_str = _c(C.GRAY, "░" * (width - filled))

    # Build cells with marker positioning
    if initial is not None and low <= initial <= high:
        init_pos = int(((initial - low) / span) * width)
        init_pos = max(0, min(width - 1, init_pos))
        # Reconstruct with marker
        if init_pos < filled:
            # marker inside filled region
            filled_str = (
                _c(fill_color, "█" * init_pos)
                + _c(C.YELLOW + C.BOLD, "│")
                + _c(fill_color, "█" * (filled - init_pos - 1))
            )
        elif init_pos < width:
            # marker inside empty region
            empty_chars = width - filled
            empty_pos = init_pos - filled
            empty_str = (
                _c(C.GRAY, "░" * empty_pos)
                + _c(C.YELLOW + C.BOLD, "│")
                + _c(C.GRAY, "░" * (empty_chars - empty_pos - 1))
            )

    bar = filled_str + empty_str
    pct = ratio * 100
    pct_color = C.GREEN if (initial is None or value >= initial) else C.RED
    return f"[{bar}] {_c(pct_color, f'{pct:5.1f}%')}"


def _outcome_kr(o: Outcome) -> str:
    return {Outcome.BANKER: "뱅", Outcome.PLAYER: "플", Outcome.TIE: "타"}[o]


def _wl_mark(bet_side: Outcome, hand_outcome: Outcome) -> str:
    if hand_outcome == Outcome.TIE:
        return _c(C.GRAY, "T")
    if hand_outcome == bet_side:
        return _c(C.GREEN + C.BOLD, "W")
    return _c(C.RED + C.BOLD, "L")


def _event_label(event: str) -> str:
    table = {
        "start": _c(C.YELLOW + C.BOLD, "[마틴시작]"),
        "end_win": _c(C.GREEN + C.BOLD, "[마틴종료-승]"),
        "end_giveup": _c(C.RED + C.BOLD, "[마틴종료-포기]"),
        "": "",
    }
    return table.get(event, "")


def _fmt_cards(cards: tuple) -> str:
    """Format a sequence of cards like '7♠ 8♥ +6♣' (3rd card separated)."""
    if not cards:
        return "—"
    parts = [str(c) for c in cards]
    if len(parts) == 2:
        return f"{parts[0]} {parts[1]}"
    # 3 cards: 2 initial + 1 drawn
    return f"{parts[0]} {parts[1]} +{parts[2]}"


def _hand_outcome_label(rec: HandRecord) -> str:
    if rec.hand_outcome == Outcome.TIE:
        return _c(C.GRAY + C.BOLD, "무승부 (Tie)")
    winner = "Banker" if rec.hand_outcome == Outcome.BANKER else "Player"
    return _c(C.BOLD, f"{winner} 승")


def iter_live_session_lines(
    config: SessionConfig,
    result: SessionResult,
    history: tuple[HandRecord, ...],
    *,
    session_num: int,
):
    """Yield lines for live/educational mode: each hand shows the dealt cards.

    Format per hand (3 lines):
      핸드 N | 베팅: 1,000원 (Banker)  [마틴 이벤트]
        P: 7♠ 8♥ +6♣ = 1   B: K♣ 9♦ = 9   → Banker 승   Δ: -1,000원
        자본: 99,000원   [█████│░░░░░░░...]  11.0%
    """
    yield ""
    yield _c(C.CYAN + C.BOLD,
             f"───────  세션 {session_num}  ───────  "
             f"(시드: {config.seed}, 슈 셔플 — 8덱 416장)")
    yield ""

    for rec in history:
        bet_side_kr = "Banker" if rec.bet_side == Outcome.BANKER else "Player"
        side_color = C.YELLOW if rec.bet_side == Outcome.BANKER else C.MAGENTA
        event = _event_label(rec.martin_event)
        # Line 1: hand number + bet info + event
        head = (
            f"핸드 {rec.hand_num:>3} │ 베팅 "
            f"{_c(side_color, f'{rec.bet_won:>6,}원 ({bet_side_kr})')}"
        )
        if event:
            head += f"   {event}"
        yield head

        # Line 2: cards + outcome + delta
        p_str = _fmt_cards(rec.player_cards)
        b_str = _fmt_cards(rec.banker_cards)
        outcome_label = _hand_outcome_label(rec)
        if rec.hand_outcome == Outcome.TIE:
            delta_str = _c(C.GRAY, "베팅 무효")
        elif rec.capital_delta > 0:
            delta_str = _c(C.GREEN, f"+{rec.capital_delta:,}원")
        else:
            delta_str = _c(C.RED, f"{rec.capital_delta:,}원")
        # WL marker (from bettor's POV)
        wl = _wl_mark(rec.bet_side, rec.hand_outcome)
        yield (
            f"      P: {p_str:<14} = {rec.player_total}    "
            f"B: {b_str:<14} = {rec.banker_total}    "
            f"→ {outcome_label} {wl}   {delta_str}"
        )

        # Line 3: capital + gauge bar
        gauge = _gauge_bar(
            rec.capital_after,
            config.ruin_won,
            config.target_won,
            width=32,
            initial=config.initial_won,
        )
        cap_color = (
            C.GREEN if rec.capital_after >= config.initial_won else C.RED
        )
        yield (
            f"      자본: {_c(cap_color + C.BOLD, f'{rec.capital_after:>10,}원')}   "
            f"{gauge}"
        )
        yield ""  # blank line between hands

    # Session result line
    outcome_str = result.outcome
    if outcome_str == "WIN":
        outcome_colored = _c(C.GREEN + C.BOLD, "🎯 WIN (목표 도달)")
    else:
        outcome_colored = _c(C.RED + C.BOLD,
                              f"💀 RUIN ({result.ruin_reason})")
    yield _c(C.CYAN, "─" * 70)
    yield (
        f"  세션 종료: {outcome_colored}  "
        f"│ 최종 {_fmt_won(result.final_won)}  "
        f"│ {result.hands_played} 핸드 / {result.bets_placed} 베팅  "
        f"│ 최대 연속 패배 {result.max_loss_streak}"
    )
    yield _c(C.CYAN, "─" * 70)


class LiveDashboard:
    """Fixed-position dashboard for live mode using ANSI cursor control.

    Each render redraws the full dashboard in-place (no scrolling).
    Use is_tty=False to fall back to a no-op (caller should scroll instead).
    """

    RECENT_LIMIT = 6

    def __init__(self, config: SessionConfig, *, is_tty: bool = True) -> None:
        self.config = config
        self.is_tty = is_tty
        self._first_paint = True
        self._cycle_count = 0  # martin cycles completed
        self._recent: list[HandRecord] = []
        # Cumulative P&L across PREVIOUS sessions (excluding current).
        # Caller updates these via set_cumulative() at session start.
        self._prev_pnl = 0
        self._prev_sessions = 0
        self._prev_wins = 0
        self._prev_ruins = 0

    def set_cumulative(
        self,
        *,
        prev_pnl: int,
        prev_sessions: int,
        prev_wins: int,
        prev_ruins: int,
    ) -> None:
        self._prev_pnl = prev_pnl
        self._prev_sessions = prev_sessions
        self._prev_wins = prev_wins
        self._prev_ruins = prev_ruins

    def __enter__(self) -> "LiveDashboard":
        if self.is_tty:
            sys.stdout.write(ANSI_HIDE_CURSOR)
            sys.stdout.write(ANSI_CLEAR_SCREEN + ANSI_CURSOR_HOME)
            sys.stdout.flush()
        return self

    def __exit__(self, *exc) -> None:
        if self.is_tty:
            sys.stdout.write(ANSI_SHOW_CURSOR)
            sys.stdout.flush()

    def render_hand(
        self,
        session_num: int,
        record: HandRecord,
        log_path: str | None = None,
    ) -> None:
        """Render dashboard with this hand as the current state."""
        self._recent.append(record)
        if record.martin_event in ("end_win", "end_giveup"):
            self._cycle_count += 1
        self._paint(session_num, record, None, log_path)

    def render_session_end(
        self,
        session_num: int,
        result: SessionResult,
        log_path: str | None = None,
    ) -> None:
        """Render dashboard at session end with the final result banner."""
        last_record = self._recent[-1] if self._recent else None
        self._paint(session_num, last_record, result, log_path)

    def reset_for_next_session(self) -> None:
        self._recent.clear()
        self._cycle_count = 0

    # --- internals ---

    def _paint(
        self,
        session_num: int,
        current_record: HandRecord | None,
        session_result: SessionResult | None,
        log_path: str | None,
    ) -> None:
        lines = self._build_lines(session_num, current_record, session_result, log_path)
        if not self.is_tty:
            return  # caller should use scrolling format instead
        # Move cursor home and rewrite each line (with line-clear)
        sys.stdout.write(ANSI_CURSOR_HOME)
        for line in lines:
            sys.stdout.write(ANSI_CLEAR_LINE + line + "\n")
        # Clear any leftover lines below (e.g., from a previous longer render)
        sys.stdout.write(ANSI_CLEAR_LINE)  # clear current line too
        # Also clear from cursor down to end of screen
        sys.stdout.write("\033[J")
        sys.stdout.flush()

    def _build_lines(
        self,
        session_num: int,
        current_record: HandRecord | None,
        session_result: SessionResult | None,
        log_path: str | None,
    ) -> list[str]:
        width = min(shutil.get_terminal_size((90, 24)).columns, 90)
        bar = _c(C.CYAN, "═" * width)
        thin = _c(C.GRAY, "─" * width)
        lines: list[str] = []

        # Header
        title = _c(C.BOLD + C.CYAN, "  바카라 마틴게일 시뮬레이터 — 교육용")
        hand_num = current_record.hand_num if current_record else 0
        meta = _c(C.DIM, f"세션 {session_num}  │  핸드 {hand_num}  │  시드 {self.config.seed}")
        lines.append(bar)
        # title left, meta right
        plain_title = "  바카라 마틴게일 시뮬레이터 — 교육용"
        plain_meta = f"세션 {session_num}  │  핸드 {hand_num}  │  시드 {self.config.seed}"
        pad = max(1, width - len(plain_title) - len(plain_meta) - 2)
        lines.append(f"{title}{' ' * pad}{meta}  ")
        lines.append(bar)
        lines.append("")

        # Gauge bar — prominent
        cap = current_record.capital_after if current_record else self.config.initial_won
        gauge_width = width - 14
        gauge = _gauge_bar(
            cap, self.config.ruin_won, self.config.target_won,
            width=gauge_width, initial=self.config.initial_won,
        )
        label_ruin = _c(C.RED, f"파산 {_fmt_won(self.config.ruin_won)}")
        label_target = _c(C.GREEN, f"목표 {_fmt_won(self.config.target_won)}")
        plain_ruin = f"파산 {_fmt_won(self.config.ruin_won)}"
        plain_target = f"목표 {_fmt_won(self.config.target_won)}"
        pad2 = max(1, width - len(plain_ruin) - len(plain_target) - 4)
        lines.append(f"  {label_ruin}{' ' * pad2}{label_target}  ")
        lines.append(f"  {gauge}")
        lines.append("")

        # Current capital row
        session_delta = cap - self.config.initial_won
        session_delta_str = self._fmt_pnl(session_delta)
        cap_color = C.GREEN if cap >= self.config.initial_won else C.RED
        lines.append(
            f"    현재 자본: {_c(cap_color + C.BOLD, _fmt_won(cap))}"
            f"    (이번 세션: {session_delta_str})"
        )

        # Cumulative P&L (across all sessions including current)
        combined_pnl = self._prev_pnl + session_delta
        total_sessions = self._prev_sessions + 1
        combined_str = self._fmt_pnl(combined_pnl)
        prev_str = self._fmt_pnl(self._prev_pnl)
        lines.append(
            f"    누적 손익: {combined_str}   "
            f"({total_sessions}세션 = 이전 {self._prev_sessions}세션 {prev_str}"
            f"  +  이번 {session_delta_str})"
        )
        lines.append("")

        # Current hand details
        lines.append(thin)
        if current_record is not None:
            side_label = "Banker" if current_record.bet_side == Outcome.BANKER else "Player"
            side_color = C.YELLOW if current_record.bet_side == Outcome.BANKER else C.MAGENTA
            event = _event_label(current_record.martin_event)
            lines.append(
                f"  현재 핸드  │  베팅 "
                f"{_c(side_color + C.BOLD, f'{current_record.bet_won:,}원 ({side_label})')}"
                f"   {event}"
            )
            p_str = _fmt_cards(current_record.player_cards)
            b_str = _fmt_cards(current_record.banker_cards)
            lines.append(
                f"    P: {p_str:<18} = {current_record.player_total}"
                f"      B: {b_str:<18} = {current_record.banker_total}"
            )
            outcome_label = _hand_outcome_label(current_record)
            wl = _wl_mark(current_record.bet_side, current_record.hand_outcome)
            if current_record.hand_outcome == Outcome.TIE:
                delta_h = _c(C.GRAY, "베팅 무효 (자본 변화 없음)")
            elif current_record.capital_delta > 0:
                delta_h = _c(C.GREEN + C.BOLD, f"+{current_record.capital_delta:,}원")
            else:
                delta_h = _c(C.RED + C.BOLD, f"{current_record.capital_delta:,}원")
            lines.append(f"    → {outcome_label}  {wl}    {delta_h}")
        else:
            lines.append("  현재 핸드  │  (시작 전)")
            lines.append("")
            lines.append("")
        lines.append(thin)

        # Recent hands tail
        lines.append("  최근 핸드:")
        recent = self._recent[-self.RECENT_LIMIT:]
        for rec in recent:
            side_short = "뱅" if rec.bet_side == Outcome.BANKER else "플"
            if rec.hand_outcome == Outcome.TIE:
                outcome_short = _c(C.GRAY, "타이")
                delta_short = _c(C.GRAY, "       0원")
            elif rec.hand_outcome == Outcome.BANKER:
                outcome_short = "뱅승"
                d = rec.capital_delta
                color = C.GREEN if d > 0 else C.RED
                delta_short = _c(color, f"{'+' if d > 0 else ''}{d:>7,}원")
            else:
                outcome_short = "플승"
                d = rec.capital_delta
                color = C.GREEN if d > 0 else C.RED
                delta_short = _c(color, f"{'+' if d > 0 else ''}{d:>7,}원")
            event = _event_label(rec.martin_event)
            lines.append(
                f"    H{rec.hand_num:>3}: {rec.bet_won:>6,}원 {side_short}"
                f" → {outcome_short}  {delta_short}   {event}"
            )
        # Pad recent to fixed height
        while len(recent) < self.RECENT_LIMIT:
            lines.append("")
            recent = list(recent) + [None]
        lines.append("")

        # Session stats + log path + session result
        lines.append(thin)
        if session_result is not None:
            if session_result.outcome == "WIN":
                outcome_colored = _c(C.GREEN + C.BOLD, "🎯 WIN (목표 도달)")
            else:
                outcome_colored = _c(
                    C.RED + C.BOLD,
                    f"💀 RUIN ({session_result.ruin_reason})"
                )
            lines.append(
                f"  세션 종료: {outcome_colored}"
                f"   최종 {_fmt_won(session_result.final_won)}"
                f"   {session_result.hands_played} 핸드 /"
                f" {session_result.bets_placed} 베팅"
                f"   최대 연패 {session_result.max_loss_streak}"
            )
        else:
            cur_streak = self._compute_current_streak()
            lines.append(
                f"  핸드 {len(self._recent)}  │  "
                f"마틴 사이클 {self._cycle_count}  │  "
                f"현재 연패 {cur_streak}"
            )
        if log_path:
            lines.append(f"  로그 파일: {_c(C.DIM, log_path)}")
        else:
            lines.append("")

        return lines

    @staticmethod
    def _fmt_pnl(delta: int) -> str:
        """Format a signed won amount with color."""
        if delta > 0:
            return _c(C.GREEN + C.BOLD, f"+{delta:,}원")
        if delta < 0:
            return _c(C.RED + C.BOLD, f"{delta:,}원")
        return _c(C.GRAY, "0원")

    def _compute_current_streak(self) -> int:
        s = 0
        for rec in reversed(self._recent):
            if rec.hand_outcome == Outcome.TIE:
                continue
            if rec.hand_outcome == rec.bet_side:
                break
            s += 1
        return s


def iter_session_trace_lines(
    config: SessionConfig,
    result: SessionResult,
    history: tuple[HandRecord, ...],
    *,
    limit: int | None = None,
):
    """Yield lines of the session trace one at a time (suitable for animation)."""
    yield "=" * 96
    yield f"세션 상세 (시드: {config.seed})"
    yield (
        f"  초기 {_fmt_won(config.initial_won)} / "
        f"목표 {_fmt_won(config.target_won)} / "
        f"파산 {_fmt_won(config.ruin_won)} / "
        f"테이블 {_fmt_won(config.table_max_won)}"
    )
    yield (
        f"  전략: {config.strategy_name}"
        f"{'(피벗 ON)' if config.pivot else '(피벗 OFF)'}"
        f" base={_fmt_won(config.base_bet_won)}"
        f" primary={config.side.name.lower()}"
        f" martin_steps={config.martin_steps}"
    )
    yield "-" * 96
    yield (
        "  #핸드 | 사이드 | 베팅      | 결과 |    Δ자본   |   누적자본   | "
        "게이지 (파산←→목표) 비고"
    )
    yield "  " + "─" * 94

    rows_to_show = history
    truncated = False
    if limit is not None and len(history) > limit:
        head = limit // 2 + limit % 2
        tail = limit // 2
        rows_to_show = history[:head] + history[-tail:]
        truncated = True

    last_shown_num = 0
    for i, rec in enumerate(rows_to_show):
        if truncated and i > 0 and rec.hand_num != last_shown_num + 1:
            gap = rec.hand_num - last_shown_num - 1
            yield f"  ... ({gap} 핸드 생략) ..."

        side_label = _outcome_kr(rec.bet_side)
        outcome_label = _outcome_kr(rec.hand_outcome)
        wl = _wl_mark(rec.bet_side, rec.hand_outcome)
        if rec.hand_outcome == Outcome.TIE:
            delta_str = _c(C.GRAY, "        —")
        else:
            sign = "+" if rec.capital_delta >= 0 else "−"
            raw = f"{sign}{abs(rec.capital_delta):>8,}원"
            color = C.GREEN if rec.capital_delta > 0 else C.RED if rec.capital_delta < 0 else C.GRAY
            delta_str = _c(color, raw)
        gauge = _gauge_bar(
            rec.capital_after,
            config.ruin_won,
            config.target_won,
            width=28,
            initial=config.initial_won,
        )
        event = _event_label(rec.martin_event)
        cap_color = (
            C.GREEN if rec.capital_after >= config.initial_won else C.RED
        )
        cap_str = _c(cap_color, f"{rec.capital_after:>10,}원")
        yield (
            f"  {rec.hand_num:>5} |"
            f"   {side_label}   |"
            f" {rec.bet_won:>7,}원 |"
            f"  {outcome_label}{wl} |"
            f" {delta_str} |"
            f" {cap_str} |"
            f" {gauge} {event}"
        )
        last_shown_num = rec.hand_num

    yield "  " + "─" * 94
    yield (
        f"  세션 결과: {result.outcome}"
        + (f" ({result.ruin_reason})" if result.ruin_reason else "")
        + f" | 최종 {_fmt_won(result.final_won)}"
        f" | 총 {result.hands_played:,} 핸드 / {result.bets_placed:,} 베팅"
        f" | 최대 연속 패배 {result.max_loss_streak}"
    )
    yield "=" * 96


def format_session_trace(
    config: SessionConfig,
    result: SessionResult,
    history: tuple[HandRecord, ...],
    *,
    limit: int | None = None,
) -> str:
    """Render hand-by-hand session trace with a capital gauge bar (single string)."""
    return "\n".join(iter_session_trace_lines(config, result, history, limit=limit))


def write_session_log(
    path: str,
    config: SessionConfig,
    session_num: int,
    result: SessionResult,
    history: tuple[HandRecord, ...],
) -> None:
    """Write a plain-text (no ANSI) session log to `path`.

    Format is grep-friendly: one line per hand with bet, cards, outcome,
    capital delta, and martin event.
    """
    pivot_str = "pivot" if config.pivot else "no-pivot"
    steps_str = config.martin_steps if config.martin_steps is not None else "unlimited"
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"=== Session {session_num} ===\n")
        f.write(f"Seed: {config.seed}\n")
        f.write(
            f"Initial: {config.initial_won:,}원  "
            f"Target: {config.target_won:,}원  "
            f"Ruin: {config.ruin_won:,}원  "
            f"Table-max: {config.table_max_won:,}원\n"
        )
        f.write(
            f"Strategy: {config.strategy_name} ({pivot_str}, steps={steps_str})\n"
        )
        f.write(
            f"Base bet: {config.base_bet_won:,}원  "
            f"Primary side: {config.side.name}\n"
        )
        f.write("\n")
        for rec in history:
            side_short = rec.bet_side.name
            p_str = " ".join(str(c) for c in rec.player_cards) if rec.player_cards else "-"
            b_str = " ".join(str(c) for c in rec.banker_cards) if rec.banker_cards else "-"
            outcome_str = rec.hand_outcome.name
            wl = "T" if rec.hand_outcome == Outcome.TIE else (
                "W" if rec.hand_outcome == rec.bet_side else "L"
            )
            if rec.hand_outcome == Outcome.TIE:
                delta_str = "    0원"
            else:
                sign = "+" if rec.capital_delta > 0 else ""
                delta_str = f"{sign}{rec.capital_delta:,}원"
            event_str = f"  [{rec.martin_event}]" if rec.martin_event else ""
            f.write(
                f"H{rec.hand_num:03d} | bet {rec.bet_won:>7,}원 {side_short:<6} | "
                f"P:{p_str}={rec.player_total}  "
                f"B:{b_str}={rec.banker_total}  "
                f"{outcome_str}({wl})  | "
                f"{delta_str} → {rec.capital_after:,}원"
                f"{event_str}\n"
            )
        f.write("\n")
        f.write(
            f"Result: {result.outcome}"
            + (f" ({result.ruin_reason})" if result.ruin_reason else "")
            + "\n"
        )
        f.write(
            f"Final: {result.final_won:,}원  "
            f"Hands: {result.hands_played}  "
            f"Bets: {result.bets_placed}  "
            f"Wagered: {result.total_wagered_won:,}원  "
            f"Max losing streak: {result.max_loss_streak}\n"
        )


def format_report(config: SessionConfig, result: ExperimentResult) -> str:
    side_name = config.side.name.lower()
    strategy_desc = config.strategy_name.lower()
    if strategy_desc == "martingale":
        parts = []
        if config.martin_steps is not None:
            parts.append(f"steps={config.martin_steps}")
        parts.append("pivot" if config.pivot else "no-pivot")
        strategy_desc = f"martingale({', '.join(parts)})"

    lines: list[str] = []
    lines.append("바카라 시뮬레이션 결과")
    lines.append(
        f"  세션 수: {result.n_sessions:,} | "
        f"전략: {strategy_desc}(base={_fmt_won(config.base_bet_won)}, side={side_name})"
    )
    lines.append(
        f"  초기 자본: {_fmt_won(config.initial_won)} | "
        f"목표: {_fmt_won(config.target_won)} | "
        f"파산: {_fmt_won(config.ruin_won)} | "
        f"테이블 상한: {_fmt_won(config.table_max_won)} | "
        f"시드: {config.seed}"
    )
    lines.append("")
    lines.append(f"  {'':<34}{'이론값':>14}{'시뮬레이션':>14}")
    lines.append(
        f"  {'하우스 엣지 (' + side_name + ')':<34}"
        f"{_fmt_pct(result.theoretical_edge):>14}"
        f"{_fmt_pct(result.avg_return_per_bet):>14}"
    )
    lines.append(
        f"  {'베팅 당 평균 수익률':<34}{'n/a':>14}{_fmt_pct(result.avg_return_per_bet):>14}"
    )
    lines.append("  " + "-" * 60)
    lines.append(
        f"  {'승률 (목표 도달)':<34}{'n/a':>14}{_fmt_pct(result.win_rate):>14}"
    )
    lines.append(
        f"  {'파산률':<34}{'n/a':>14}{_fmt_pct(result.ruin_rate):>14}"
    )
    lines.append(
        f"  {'평균 최종 자본':<34}"
        f"{_fmt_won(config.initial_won):>14}"
        f"{_fmt_won(result.avg_final_won):>14}"
    )
    lines.append(
        f"  {'평균 핸드 / 세션':<34}{'n/a':>14}{result.avg_hands:>14.1f}"
    )
    lines.append(
        f"  {'평균 베팅 / 세션':<34}{'n/a':>14}{result.avg_bets:>14.1f}"
    )
    streak_str = f"{result.loss_streak_p50} / {result.loss_streak_p95} / {result.loss_streak_max}"
    lines.append(
        f"  {'최대 연속 패배 (p50/p95/max)':<34}{'n/a':>14}{streak_str:>14}"
    )

    if result.ruin_reason_counts:
        lines.append("")
        lines.append("  파산 사유:")
        for reason, count in sorted(
            result.ruin_reason_counts.items(), key=lambda kv: -kv[1]
        ):
            pct = count / result.n_sessions
            lines.append(f"    {reason:<28}{count:>6}  ({_fmt_pct(pct)})")

    lines.append("")
    if result.avg_return_per_bet < 0:
        lines.append(
            f"결론: {strategy_desc} 을(를) {side_name} 사이드에 적용해도 "
            f"기대 수익은 음수다 ({_fmt_pct(result.avg_return_per_bet)} / 베팅)."
        )
        lines.append(
            f"      {_fmt_pct(result.ruin_rate)} 의 세션이 목표 자본 "
            f"{_fmt_won(config.target_won)} 에 도달하지 못하고 파산했다."
        )
    else:
        lines.append(
            f"참고: 시뮬레이션 평균 수익률이 {_fmt_pct(result.avg_return_per_bet)} 로 비음수 — "
            f"표본 노이즈 (이론값은 {_fmt_pct(result.theoretical_edge)})."
        )

    return "\n".join(lines)
