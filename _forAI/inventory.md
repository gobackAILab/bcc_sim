# Inventory

## 목차

- [Repository](#repository)
- [Top-level structure](#top-level-structure)
- [Source modules](#source-modules)
- [Tests](#tests)
- [Build and validation commands](#build-and-validation-commands)
- [CLI usage](#cli-usage)
- [Web usage](#web-usage)
- [Notes](#notes)

## Repository

- Name: `bcc-sim` (바카라 확률·이율 시뮬레이터)
- Path: `/home/gbagent02/works/bcc_sim`
- 목적: 실제 카드덱 기반 바카라 시뮬레이션으로 마틴게일(피벗 변형) 의 허구성을 시각·통계로 입증. 교육용.

## Top-level structure

- [main.py](../main.py) — CLI 엔트리포인트 (argparse, live/stats 모드)
- [pyproject.toml](../pyproject.toml) — 프로젝트 메타, 의존성
  - 런타임: `numpy`, `matplotlib`, `tqdm`, **`fastapi`, `uvicorn[standard]`**
  - dev: `pytest`, **`httpx`** (FastAPI TestClient)
- [readme.md](../readme.md) — 사용자 문서 (CLI 사용법 + 웹 섹션 요약)
- [docs/web_guide.md](../docs/web_guide.md) — 웹 인터페이스 실행/접속/사용 상세 가이드
- [.python-version](../.python-version) — `3` (uv 가 3.11+ 잡도록)
- [.gitignore](../.gitignore) — `.venv`, `__pycache__`, build artifacts
- `_forAI/` — AI 작업 문맥 (이 디렉터리)
- `logs/` — CLI 라이브 모드 세션 로그 (런타임 생성, gitignore 안 됨, 수동 정리)
- `.venv/` — uv 가상환경

## Source modules

| 파일 | 역할 |
|------|------|
| [bcc_sim/__init__.py](../bcc_sim/__init__.py) | `__version__ = "0.1.0"` |
| [bcc_sim/deck.py](../bcc_sim/deck.py) | `Card` (rank·suit, `baccarat_value`, `__str__`), `Shoe` (8덱 무복원 셔플, 컷 오프셋, 시드 주입) |
| [bcc_sim/baccarat.py](../bcc_sim/baccarat.py) | `Outcome` enum, `HandResult` (cards 포함), `play_hand` (Punto Banco 룰, 카드 수집) |
| [bcc_sim/strategy.py](../bcc_sim/strategy.py) | `Strategy` Protocol, `FlatBet`, `Martingale` (pivot + martin_steps), `payout_won` |
| [bcc_sim/session.py](../bcc_sim/session.py) | `SessionConfig`, `SessionResult`, `HandRecord`, `run_session`, `run_session_traced` |
| [bcc_sim/runner.py](../bcc_sim/runner.py) | `ExperimentResult`, `run_experiment` (tqdm progress + live stats), `_derive_session_seeds` |
| [bcc_sim/report.py](../bcc_sim/report.py) | ANSI 색, `format_banner`, `format_report`, `iter_live_session_lines`, `iter_session_trace_lines`, `LiveDashboard`, `write_session_log` |
| [bcc_sim/web/__init__.py](../bcc_sim/web/__init__.py) | 웹 패키지 마커 |
| [bcc_sim/web/__main__.py](../bcc_sim/web/__main__.py) | `python -m bcc_sim.web` 엔트리포인트 (uvicorn 기동, host/port/reload 옵션) |
| [bcc_sim/web/server.py](../bcc_sim/web/server.py) | FastAPI app — `GET /`, `GET /api/defaults`, `WS /ws/play`, `/static` mount |
| [bcc_sim/web/session_runner.py](../bcc_sim/web/session_runner.py) | WebSocket 세션 루프 — 컨트롤(`start/pause/resume/next_session/stop`), 누적 P&L 추적, `run_session_traced` 재사용 |
| [bcc_sim/web/serialize.py](../bcc_sim/web/serialize.py) | `Card / Outcome / HandRecord / SessionResult / SessionConfig` ↔ dict 변환 + `DEFAULT_CONFIG` (CLI 와 동기) |
| [bcc_sim/web/static/index.html](../bcc_sim/web/static/index.html) | 2-frame 레이아웃 (좌 Settings / 우 Dashboard) |
| [bcc_sim/web/static/style.css](../bcc_sim/web/static/style.css) | 다크 테마, 등폭 폰트, 게이지 바, 카드 색(♥♦ red), 반응형 |
| [bcc_sim/web/static/app.js](../bcc_sim/web/static/app.js) | WebSocket 클라이언트, 폼↔config, DOM 갱신, 컨트롤 버튼, 패널 토글 |

## Tests

총 **81 테스트** 전체 통과. 7개 파일 (66 코어 + 15 웹).

| 파일 | 테스트 수 | 핵심 검증 |
|------|---------|----------|
| [tests/test_deck.py](../tests/test_deck.py) | 6 | 8덱=416장, 무복원, 결정론, 컷 리셔플 |
| [tests/test_baccarat.py](../tests/test_baccarat.py) | 18 | 네추럴, Player/Banker 드로우 룰 전체 row, 100k 핸드 빈도 (P/B/T ±1%) |
| [tests/test_strategy.py](../tests/test_strategy.py) | 21 | Classic martingale, pivot 시나리오 전체, Tie 보존, martin_steps 리셋, payout |
| [tests/test_session.py](../tests/test_session.py) | 15 | 결정론, 4가지 RUIN 사유, Tie 보존, 피벗 통합, 22-핸드 사용자 트레이스 |
| [tests/test_runner.py](../tests/test_runner.py) | 6 | 시드 분기 재현성, 집계 형식, flat-bet 이론 엣지 ±1% 수렴 |
| [tests/test_web_serialize.py](../tests/test_web_serialize.py) | 9 | Card/Outcome/HandRecord/SessionConfig dict 라운드트립, 카드 라벨 (♠♥♦♣), CLI 기본값 동기 검증 |
| [tests/test_web_server.py](../tests/test_web_server.py) | 6 | FastAPI TestClient — `/api/defaults`, `/`, WS 핸드 스트리밍, 잘못된 config 에러, 첫 액션 검증, session_end 도달 |

## Build and validation commands

```bash
# 환경 동기화
uv sync

# 테스트
uv run pytest                # 전체 (~95초, 100k 핸드 빈도 + 500세션 엣지 수렴 테스트 때문)
uv run pytest -q             # quiet
uv run pytest -v             # verbose
uv run pytest tests/test_strategy.py   # 특정 파일만

# 의존성 추가
uv add <pkg>                 # runtime
uv add --dev <pkg>           # dev
```

## CLI usage

### 라이브 모드 (기본 — 교육용)

```bash
uv run python main.py
# 시작 배너 → 고정 대시보드 (게이지 in-place 갱신) → 세션 종료 → Enter (다음) / q (종료)
# 로그는 ./logs/session_NNNN_seed-XXX.log 에 자동 저장
```

주요 옵션:
- `--initial WON` `--target WON` `--ruin WON` `--table-max WON` `--base-bet WON` (정수 원)
- `--martin-steps N` `--no-martin-limit` `--pivot/--no-pivot`
- `--side {banker,player}` (primary 사이드, 기본 banker)
- `--hand-delay SEC` (기본 0.3초)
- `--auto` (Enter 대기 없이 자동 진행)
- `--log-dir DIR` `--no-log` `--no-dashboard` `--no-color`
- `--seed N`

### 통계 모드

```bash
uv run python main.py --mode stats --sessions 10000
# tqdm 진행률 바 (라이브 stats) → 마지막에 통계 표
```

## Web usage

### 기본 실행

```bash
uv run python -m bcc_sim.web                              # 127.0.0.1:8000
uv run python -m bcc_sim.web --host 0.0.0.0 --port 8080   # LAN 공유 (경고 출력)
uv run python -m bcc_sim.web --reload                     # 개발용 자동 reload
```

브라우저: <http://localhost:8000>

### 화면 / 기능

- 좌측 Settings 패널 (`«`로 접기) + 우측 Dashboard
- Dashboard: 자본 게이지, 현재 자본 + 누적 P&L, 현재 핸드(P/B 카드 풀), 최근 12 핸드, 세션 통계 + 누계
- 컨트롤: `▶ Apply & Start` / `⏸ Pause` / `▶ Resume` / `⏭ Next Session` / `⏹ Stop`
- 옵션: CLI 와 모든 동일 옵션 노출 + `hand_delay_ms` (ms 단위), `auto_next` (= CLI `--auto`)
- 결정론 동일성: 같은 seed + 같은 설정 → CLI 와 byte-identical 한 카드/결과/자본 시퀀스 (양쪽 `_derive_session_seeds` + `run_session_traced` 재사용)

### 사용자 가이드

상세 사용법은 [docs/web_guide.md](../docs/web_guide.md) 참조.

## Notes

- 모든 금액은 **정수 원 (KRW)**. Banker 커미션은 `(bet × 95) // 100` (분 원은 하우스 보관).
- 마틴게일 기본 동작 = **Banker 우선 피벗** + 5번 더블링 (총 6베팅) 후 리셋. `--no-pivot` 으로 단방향 가능.
- Tie 는 베팅 무효 (자본·시퀀스·사이드 모두 변화 없음).
- 라이브 모드(CLI)는 ANSI 커서 제어 사용 → TTY 환경 필요. 비-TTY 자동 폴백 (스크롤).
- 로그 파일은 ANSI 색 없는 plain text, grep 친화 형식.
- max_hands 안전망 없음 → flat-bet 대용량 시나리오는 매우 오래 걸릴 수 있음 (사용자 의도적 결정).
- 웹은 단일 사용자 가정 (다중 탭 가능하나 각 연결 독립, 서버 상태 공유 없음).
- 웹 인증 없음 — 기본 127.0.0.1, `--host 0.0.0.0` 사용 시 경고 출력.
