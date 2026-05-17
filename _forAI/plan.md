# Plan

## 목차

- [Current goal](#current-goal)
- [Phase 진행 상황](#phase-진행-상황)
  - [Phase 0 — 의존성 / 기반 셋업 ✅](#phase-0--의존성--기반-셋업-)
  - [Phase 1 — 카드덱 / 슈 ✅](#phase-1--카드덱--슈-)
  - [Phase 2 — 바카라 규칙 ✅](#phase-2--바카라-규칙-)
  - [Phase 3 — 베팅 전략 ✅](#phase-3--베팅-전략-)
  - [Phase 4 — 세션 엔진 ✅](#phase-4--세션-엔진-)
  - [Phase 5 — 러너 / 통계 집계 ✅](#phase-5--러너--통계-집계-)
  - [Phase 6 — CLI ✅](#phase-6--cli-)
  - [Phase 7 — 라이브 시뮬레이션 모드 ✅ (Phase 7 대체)](#phase-7--라이브-시뮬레이션-모드--phase-7-대체)
  - [Phase 8 — 시각화 / 리포트 (deferred)](#phase-8--시각화--리포트-deferred)
  - [Phase 9 — 웹 인터페이스 ✅](#phase-9--웹-인터페이스-)
- [Structure decisions](#structure-decisions)
- [Risks](#risks)
- [Definition of Done](#definition-of-done)

## Current goal

마틴게일 베팅 전략의 허구성을 **실제 카드덱 기반 바카라 시뮬레이션** 으로 보여주는 교육용 CLI.

방향성 (대화에서 확정):
1. **시뮬레이션 시각화가 1순위, 통계는 2순위** — 사용자가 카드 한 장씩 딜링되며 자본이 녹아내리는 과정을 직접 시청해야 함.
2. **실전 게임 진행** — 슈 무복원, Punto Banco 룰, Banker 0.95 커미션, Tie 무효 모두 실제 카지노처럼.
3. **결정론적 재현** — 시드 고정 시 같은 결과.

## Phase 진행 상황

### Phase 0 — 의존성 / 기반 셋업 ✅
- [x] `uv add numpy matplotlib`, `uv add tqdm`, `uv add pytest --dev`
- [x] 패키지 `bcc_sim/`, 테스트 `tests/` 디렉터리
- [x] Python 3.11+ (uv 관리)

### Phase 1 — 카드덱 / 슈 ✅
- [x] [bcc_sim/deck.py](../bcc_sim/deck.py): `Card`, `Shoe`
  - `Card`: rank·suit dataclass, `baccarat_value` 프로퍼티
  - `Card.__str__`: `7♠`, `A♣`, `K♦` 등 사람 친화적 표기
  - `Shoe`: 8덱 무복원 셔플, 컷 오프셋 (기본 14), 시드 주입
- [x] [tests/test_deck.py](../tests/test_deck.py) — 6 테스트
  - 8덱=416장, 무복원, 시드 결정론, 컷 리셔플

### Phase 2 — 바카라 규칙 ✅
- [x] [bcc_sim/baccarat.py](../bcc_sim/baccarat.py): `Outcome`, `HandResult`, `play_hand`
  - 표준 Punto Banco 드로우 룰 전체 구현
  - `HandResult` 에 `player_cards`, `banker_cards` 포함 (compare=False — 기존 테스트 호환)
  - `play_hand` 가 딜링한 카드를 모두 수집해서 반환
- [x] [tests/test_baccarat.py](../tests/test_baccarat.py) — 18 테스트
  - 네추럴 8/9, Player 6/7 스탠드, Banker 3rd-card 표 전체 row 별 케이스
  - 100k 핸드 빈도 검증 (P≈44.62%, B≈45.86%, T≈9.52%, ±1%p)

### Phase 3 — 베팅 전략 ✅
- [x] [bcc_sim/strategy.py](../bcc_sim/strategy.py): `Strategy` Protocol, `FlatBet`, `Martingale`, `payout_won`
  - **확정 룰** (사용자 클리어):
    - `FlatBet(base_won, side)` — 항상 같은 금액·사이드
    - `Martingale(base_won, primary_side, martin_steps, pivot)`:
      - **피벗 모드 (기본)**: primary(Banker) 패배 시 → opposite(Player) 로 전환, martin 종료까지 유지
      - **martin_steps=N**: N번 더블링 허용 (총 N+1번 베팅), N+1번째 패배 시 give-up → primary 로 리셋
      - 승리 시 즉시 primary 로 리셋
      - Tie 는 무시 (시퀀스·자본·사이드 모두 유지)
  - `payout_won`: Player 1:1, Banker (bet × 95) // 100 (커미션, floor)
  - 모든 자본/베팅은 **정수 원** (KRW)
- [x] [tests/test_strategy.py](../tests/test_strategy.py) — 21 테스트
  - Classic martingale (no pivot), pivot 모드 모든 시나리오, Tie 보존, martin_steps 리셋

### Phase 4 — 세션 엔진 ✅
- [x] [bcc_sim/session.py](../bcc_sim/session.py): `SessionConfig`, `SessionResult`, `HandRecord`, `run_session`, `run_session_traced`
  - `SessionConfig` 필드: initial_won, target_won, ruin_won, table_max_won, base_bet_won, side(primary), strategy_name, martin_steps, pivot, seed, n_decks, cut_offset
  - 종료 조건: WIN(목표) / RUIN(파산·자본초과·테이블초과·동시)
  - 매 베팅마다 `strategy.side` 캡처 (피벗으로 사이드가 바뀌므로)
  - `run_session_traced` 는 핸드별 `HandRecord` 도 반환 (카드·토탈·이벤트 포함)
  - **종료 조건 결정 (사용자 확정)**: WIN/RUIN 만, max_hands 안전망 없음
- [x] [tests/test_session.py](../tests/test_session.py) — 15 테스트
  - 결정론, 4가지 RUIN 사유, Tie 보존, 피벗 통합, 22-핸드 사용자 트레이스

### Phase 5 — 러너 / 통계 집계 ✅
- [x] [bcc_sim/runner.py](../bcc_sim/runner.py): `ExperimentResult`, `run_experiment`
  - 시드 분기: `random.Random(master).randrange(2**63) × N` (numpy 의존 안 함)
  - `run_experiment(config, n, master_seed, show_progress=True)` — **tqdm 진행률 바**, 라이브 stats 표시 (승률·파산률·평균자본)
  - 집계: 승률, 파산률, 평균 최종 자본, 평균 핸드/베팅, 연속 패배 분위수, 이론 엣지 비교
- [x] [tests/test_runner.py](../tests/test_runner.py) — 6 테스트
  - 시드 분기 재현성, 집계 형식, flat-bet 이론 엣지 ±1% 수렴

### Phase 6 — CLI ✅
- [x] [main.py](../main.py): argparse 기반 CLI
- [x] **두 모드** (`--mode {live, stats}`, 기본 `live`)
  - **live**: 카드 딜링 시뮬레이션 (Phase 7 대체로 발전, 아래 참조)
  - **stats**: N 세션 집계 + tqdm 진행률 + 통계 표
- [x] 정수 원 입력, 유효성 검증, 자본 조건/베팅/시드 옵션 일체

### Phase 7 — 라이브 시뮬레이션 모드 ✅ (Phase 7 대체)

원래 Phase 7 (matplotlib 시각화) 은 deferred. 대신 사용자 요청에 따라
**텍스트 기반 라이브 교육용 시뮬레이션 모드** 를 구현했다.

- [x] [bcc_sim/report.py](../bcc_sim/report.py):
  - `format_banner` — 게임 룰·전략·자본 조건 시작 배너
  - `iter_live_session_lines` — 핸드당 3줄 (베팅/카드/게이지) 스크롤 모드
  - `LiveDashboard` — **ANSI 커서 제어로 고정 위치 갱신** (스크롤 없음)
  - `write_session_log` — 세션마다 ANSI 없는 grep 친화 텍스트 로그
  - `_gauge_bar` — 자본 게이지 (파산←→목표), `│` 마커로 시작 자본 위치 표시, 색 (자본 ≥ 시작 = green, < 시작 = red)
- [x] [main.py](../main.py):
  - TTY 자동 감지 → 대시보드 (고정 위치) / 비-TTY → 스크롤 폴백
  - 매 세션 별도 로그 파일 (`./logs/session_NNNN_seed-XXX.log`)
  - `--hand-delay` (기본 0.3초, 교육적 페이스)
  - `--auto` (Enter 대기 없이 자동), `--no-dashboard`, `--no-log`, `--log-dir`, `--no-color`
- [x] 카드 시각화:
  - 매 핸드 P/B 카드 전부 표시 (`P: 7♠ 8♥ +6♣ = 1`)
  - 결과 + 우리 베팅 outcome (W/L/T)
  - 자본 변화 + 게이지 바 in-place 갱신
  - 마틴 이벤트 라벨 (시작/종료-승/종료-포기)

### Phase 8 — 시각화 / 리포트 (deferred)

원래 plan 의 Phase 7. 현재는 deferred. 필요 시:
- [ ] matplotlib 자본 곡선 / 파산 분포 히스토그램 (`--plot path.png`)
- [ ] 마크다운 리포트 자동 생성 (`--report-md path`)
- [ ] HTML 리포트 (interactive)

### Phase 9 — 웹 인터페이스 ✅

사용자 요청 ("이거 웹에서도 볼수있게 만들어 주세요 웹서버 띄워서 거의 같은 인터페이스로 보여주세요. 설정부분창(또는 프레임)을 따로 하나더 만들면 더욱 좋을것같네요"):

- [x] **백엔드**: FastAPI + uvicorn — async, WebSocket 네이티브
  - [bcc_sim/web/server.py](../bcc_sim/web/server.py): FastAPI app, `GET /`, `GET /api/defaults`, `WS /ws/play`, `/static` mount
  - [bcc_sim/web/session_runner.py](../bcc_sim/web/session_runner.py): 세션 루프 (start/pause/resume/next_session/stop), 누적 P&L 추적, `run_session_traced` 재사용
  - [bcc_sim/web/serialize.py](../bcc_sim/web/serialize.py): Card/Outcome/HandRecord/SessionConfig ↔ dict + `DEFAULT_CONFIG`
  - [bcc_sim/web/__main__.py](../bcc_sim/web/__main__.py): `python -m bcc_sim.web` 엔트리, argparse host/port/reload
- [x] **프론트엔드**: Vanilla HTML/CSS/JS (빌드 도구 없음)
  - [bcc_sim/web/static/index.html](../bcc_sim/web/static/index.html): 2-frame 레이아웃 (좌 Settings / 우 Dashboard)
  - [bcc_sim/web/static/style.css](../bcc_sim/web/static/style.css): 다크 테마, 등폭 폰트, 게이지, 카드 색(♥♦ red)
  - [bcc_sim/web/static/app.js](../bcc_sim/web/static/app.js): WebSocket 클라이언트, 폼↔config, DOM 갱신
- [x] **CLI 와 결정론 동일성**: 양쪽 모두 `_derive_session_seeds` + `run_session_traced` → 같은 seed 면 byte-identical
- [x] **테스트**: 15 신규 ([test_web_serialize.py](../tests/test_web_serialize.py) 9 + [test_web_server.py](../tests/test_web_server.py) 6) — 81/81 통과
- [x] **사용자 가이드**: [docs/web_guide.md](../docs/web_guide.md) — 실행/접속/사용법/트러블슈팅/WebSocket 프로토콜
- [x] CLI 회귀 없음 — `main.py` 미수정, 기존 66 테스트 그대로 통과

#### 차후 작업 후보 (deferred)
- [ ] 매 핸드를 stream 으로 생성하는 generator API (현재는 history 사전 계산) — flat-bet 대용량 시 메모리 절감
- [ ] 웹에서 stats 모드 (현재는 live 만)
- [ ] 웹에서 세션 로그 다운로드 (CLI 는 자동 저장)
- [ ] 다중 사용자 / 세션 격리 (현재는 단일 사용자 가정)

## Structure decisions

- **카드덱은 직접 구현** — 외부 패키지 없음, ~50줄.
- **세션 단위 슈 분리** — 세션 1개 = 슈 시퀀스 1개.
- **베팅 사이드는 전략 내부에서 결정** — `strategy.side` property 동적 (피벗 지원).
- **자본은 정수 원** — `(bet × 95) // 100` floor (카지노 룰).
- **베팅 상한 체크는 Session 레이어** — Strategy 는 순수 의도 베팅·사이드만 반환.
- **시드 분기**: stdlib `random.Random(master).randrange(2**63)` × N — numpy 불필요.
- **HandResult.cards 는 compare=False** — 기존 outcome+total 비교 테스트와 호환.
- **로그 파일 = 자동, 화면 = in-place** — 사용자 의도 "기록은 로그로, 화면은 고정" 반영.
- **모드 분리**: live (교육) / stats (집계) — 둘 다 필요하지만 기본은 live.
- **웹 ≠ CLI 모드**: `--mode web` 추가하지 않고 별도 엔트리 (`python -m bcc_sim.web`). 의존성·기동방식이 다름 (uvicorn).
- **웹 프론트는 vanilla JS** — 빌드 도구 없이 `static/` 한 폴더. 사용자가 즉시 수정 가능.
- **WebSocket 단방향이 아닌 양방향** — pause/resume/next/stop 컨트롤 때문에 SSE 가 아닌 WebSocket 선택.
- **history 사전 계산 후 스트리밍** — `run_session_traced` 그대로 호출 후 `asyncio.sleep(delay)` 로 흘려보냄. CLI `_animate_session_dashboard` 와 동일 패턴.

## Risks

- ~~**드로우 룰 버그**~~: 100k 핸드 빈도 테스트로 검증 완료 (이론 ±1%p 내).
- ~~**시드 분기**~~: `_derive_session_seeds` 재현성 테스트 통과.
- ~~**마틴게일 종료 모호성**~~: 4가지 RUIN 사유 (`capital_depleted`, `bet_exceeds_capital`, `bet_exceeds_table_max`, `both`) 분류 + 테스트.
- ~~**Tie 처리 룰**~~: 확정 — Tie 는 베팅 없었음 처리. 시퀀스·사이드·자본 모두 유지.
- ~~**수치 정밀도**~~: 정수 원으로 해결.
- **flat-bet 무한 진동** (잔존): max_hands 안전망 없음 → 사용자가 의도적으로 제외. 마틴게일에선 빠르게 RUIN 으로 수렴해 실문제 안 됨.
- **대시보드 호환성** (잔존): ANSI 커서 코드는 일반 Unix 터미널에서 동작. Windows cmd 등 일부 환경은 폴백 필요할 수 있음 (현재 `--no-dashboard` 로 대응).

## Definition of Done

### ✅ 1차 완료 (통계 검증)
- `uv run python main.py --mode stats --sessions 10000` 실행 시
  - 승률, 평균 최종 자본, 평균 핸드, 파산률, 연속 패배 분위수 출력
  - 이론 하우스 엣지 vs 시뮬레이션 평균 수익률 나란히
  - tqdm 진행률 바로 실시간 stats 표시
- `pytest` 66/66 통과

### ✅ 2차 완료 (교육용 라이브)
- `uv run python main.py` 실행 시
  - 시작 배너 (게임 룰·전략·자본 조건 표시)
  - 고정 대시보드: 게이지 바 in-place 갱신, 카드 표시, 최근 핸드 tail
  - 세션마다 로그 파일 (`./logs/session_NNNN_seed-XXX.log`)
  - 세션 종료 후 Enter = 다음, q = 종료
- 핸드 1개 단위로 카드 딜링 → 자본 변화 → 게이지 시각적 갱신

### ✅ 3차 완료 (웹 인터페이스)
- `uv run python -m bcc_sim.web` 한 줄로 기동, 브라우저 http://localhost:8000 접속
- 좌측 Settings 패널 + 우측 Dashboard (게이지/카드/누적 P&L/컨트롤)
- WebSocket 으로 카드 한 장씩 라이브 스트리밍
- pause/resume/next_session/stop 양방향 컨트롤
- CLI 와 byte-identical (같은 seed/config)
- pytest 81/81 통과 (66 코어 + 15 웹)

### 🔄 차후 작업 후보
- matplotlib 자본 곡선
- HTML 리포트
- 다른 전략 (파롤리, 피보나치, 1326 등)
- 다중 동시 베팅 (Player + Banker)
- 웹: stats 모드, 세션 로그 다운로드, true streaming generator
