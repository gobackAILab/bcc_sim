# Dev Log

## 목차

- [2026-05-17](#2026-05-17)
  - [_forAI 문서 초기 생성](#_forai-문서-초기-생성)
  - [룰 확정 (1차)](#룰-확정-1차)
  - [Phase 0~6 일괄 구현](#phase-06-일괄-구현)
  - [원화 단위 + martin_steps 리셋 동작](#원화-단위--martin_steps-리셋-동작)
  - [Banker 우선 피벗 동작 추가](#banker-우선-피벗-동작-추가)
  - [라이브 시뮬레이션 모드 (Phase 7 대체)](#라이브-시뮬레이션-모드-phase-7-대체)
  - [고정 대시보드 + 로그 파일](#고정-대시보드--로그-파일)
  - [문서 정리 (목차·통합)](#문서-정리-목차통합)
  - [누적 P&L 표시](#누적-pl-표시)
  - [Phase 9 — 웹 인터페이스](#phase-9--웹-인터페이스)
  - [사용자 가이드 + _forAI 갱신](#사용자-가이드--_forai-갱신)
  - [웹 UI NES.css 픽셀 스타일 개편 (21:00)](#웹-ui-nescss-픽셀-스타일-개편-2100)
  - [number input step 검증 버그 수정 (21:10)](#number-input-step-검증-버그-수정-2110)
  - [시뮬레이션 속도 + 체감시간 표시 (21:20)](#시뮬레이션-속도--체감시간-표시-2120)
  - [PM2 등록 + 버전 단일 출처 (21:30)](#pm2-등록--버전-단일-출처-2130)

## 2026-05-17

### _forAI 문서 초기 생성

- `forai-scaffold` 로 표준 문서 세트(`README.md`, `inventory.md`, `memo.md`, `plan.md`, `dev_log.md`)를 생성했다.
- 프로젝트 `readme.md` 의 목적(바카라 마틴게일 허구성 시뮬레이션)을 기반으로 7단계 구현 계획을 `plan.md` 에 정리.
- 바카라 도메인 룰(드로우 표, 배당, 슈 구성)과 마틴게일 베팅 정의를 `memo.md` 에 정리.
- 현재 코드 상태: `main.py` placeholder, 의존성 비어 있음.

### 룰 확정 (1차)

- Banker 승리 배당 = **0.95배** (5% 커미션) 확정.
- Tie 결과 = **베팅 없었던 것으로 간주** — 자본·시퀀스 모두 변화 없음. CLI 토글 없음.

### Phase 0~6 일괄 구현

승인된 플랜 (`/home/gbagent02/.claude/plans/quiet-wishing-coral.md`) 에 따라 7단계 구현:

- **Phase 0**: `uv add numpy matplotlib pytest`, `bcc_sim/` 패키지, `tests/`.
- **Phase 1**: `bcc_sim/deck.py` (`Card`, `Shoe`) + 6 테스트.
- **Phase 2**: `bcc_sim/baccarat.py` (`HandResult`, `play_hand`) + 18 테스트 (드로우 표 전체).
- **Phase 3**: `bcc_sim/strategy.py` (`FlatBet`, `Martingale`, `payout_cents`) + 13 테스트.
- **Phase 4**: `bcc_sim/session.py` (`SessionConfig`, `SessionResult`, `run_session`) + 13 테스트 (4가지 RUIN 사유).
- **Phase 5**: `bcc_sim/runner.py` (`ExperimentResult`, `run_experiment`) + 6 테스트 (시드 분기, 이론 엣지 ±1% 수렴).
- **Phase 6**: `main.py` argparse CLI + `bcc_sim/report.py` 텍스트 표 포맷터.
- 검증: 마틴게일 데모 (10k 세션) → 99.98% 파산률, -1.16% 평균 수익률 (이론 -1.06% 일치).
- 56 테스트 전체 통과.

### 원화 단위 + martin_steps 리셋 동작

사용자 룰 명확화:
- **단위 = 원화 (KRW)**: cents → won 전체 rename. CLI 입력은 정수 원, 출력은 `1,000원`.
- **martin_steps=N 의미 변경**: 기존 "N번 패배 후 cap" → "N번 더블링 허용, N+1번째 패배 시 base 로 리셋".
  - 예: martin_steps=5 → 베팅 1k → 2k → 4k → 8k → 16k → 32k → (6번째 패배 시) 1k 리셋
- 필드명 일괄 rename: `*_cents` → `*_won`, `payout_cents` → `payout_won`, `max_double` → `martin_steps`.
- CLI 기본값 갱신: initial 1,000,000원, target 2,000,000원, table-max 100,000원, base-bet 1,000원, martin-steps 5.
- 출력 포맷터 한국어화 (`이론값`, `시뮬레이션`, `승률`, `파산률`, `결론`).
- 60 테스트 통과.

### Banker 우선 피벗 동작 추가

사용자 룰 추가 명확화 ("마틴 뱅커 우선 피벗 베팅"):
- **피벗 룰**: Banker 가 지면 → Player 로 전환 (마틴 시작), 마틴 종료 (승리 또는 N+1패) 시 Banker 로 복귀.
- 전환 후 마틴 종료까지 Player 사이드 고정.
- `Martingale` 클래스 재설계:
  - `primary_side` (시작·복귀 사이드) + `pivot` (bool) + `martin_steps`
  - `side` 가 property — 매 핸드 동적으로 바뀜
  - `update()` 가 사이드 전환·복귀 로직 처리
- `Strategy` Protocol: `side` 를 property 로 변경 (FlatBet 도 호환)
- `Session`: 매 베팅마다 `bet_side = strategy.side` 캡처 (payout·streak 계산용)
- `SessionConfig` 에 `pivot: bool` 필드 추가, CLI `--pivot/--no-pivot` (기본 ON)
- Report 포맷터: `martingale(steps=5, pivot)` 형식 표시
- 사용자 22-핸드 트레이스 통합 테스트 (`test_session_pivot_full_user_example_22_hands`)
- 66 테스트 통과.
- 검증 결과: 피벗 92.80% vs no-pivot 92.60% 파산률 (피벗이 약간 더 안 좋음 — Player 사이드 엣지 -1.24% > Banker -1.06%).

### 라이브 시뮬레이션 모드 (Phase 7 대체)

사용자 핵심 요청 ("통계 보다 시뮬레이션 시각화가 중요, 교육적으로"):
- **방향 전환**: 통계 중심 → **교육용 라이브 시뮬레이션**
- 원래 Phase 7 (matplotlib 시각화) deferred, 대신 텍스트 라이브 모드 구축

#### 추가 기능

- **실제 카드 표시**: `Card.__str__` 으로 `7♠`, `A♣`, `K♦` 등 표기
- `HandResult` 에 `player_cards`, `banker_cards` 추가 (compare=False 라 기존 테스트 호환)
- `play_hand` 가 딜링한 카드 모두 수집
- `HandRecord` 에 카드·토탈 포함
- **tqdm 진행률 바**: `run_experiment` 가 라이브 stats (승률·파산률·평균자본) 표시
- **시작 배너**: 게임 룰·전략·자본 조건 모두 표시 (`format_banner`)
- **--mode {live, stats}**: 라이브 (카드 딜링) / 통계 (집계) 분리, 기본 live
- **세션 인터랙션**: 세션 끝나면 Enter = 다음, q = 종료 (`--auto` 로 자동 진행)

#### 검증

- 사용자 시나리오 (10만원 → 50만원, 5만원 파산) 500 세션:
  - 승률 6.80%, 파산률 93.20%, 평균 수익률 -1.41%/베팅
  - 평균 686 핸드/세션

### 고정 대시보드 + 로그 파일

사용자 추가 요청 ("스크롤 시키지말고 고정 게이지바로, 기록은 로그로"):
- `LiveDashboard` 클래스: ANSI 커서 제어 (`\033[H`, `\033[K`, `\033[2J`) 로 화면 in-place 갱신
- 대시보드 구성: 헤더 / 게이지 바 (크게) / 현재 자본 / 현재 핸드 카드 / 최근 핸드 6개 / 세션 통계
- 게이지 바: 시작 자본 위치 `│` 마커, 자본 ≥ 시작 → green, < 시작 → red
- `write_session_log`: 세션마다 ANSI 없는 plain text 로그 (grep 친화)
- 로그 경로: `./logs/session_NNNN_seed-XXX.log`
- TTY 자동 감지 → 대시보드 / 비-TTY (파이프/리디렉션) → 스크롤 폴백
- 새 CLI 옵션: `--log-dir`, `--no-log`, `--no-dashboard`, `--hand-delay` (기본 0.3초)
- 66 테스트 통과 유지 (대시보드는 출력만 변경, 로직 영향 없음).

### 문서 정리 (목차·통합)

- `readme.md` 와 `README.md` (빈 파일) 중복 → `readme.md` 로 통합, `pyproject.toml` 의 `readme` 필드도 매치.
- 6개 문서 (readme.md + _forAI/ 5개) 모두 `## 목차` 섹션 추가 (GitHub 앵커 링크).
- 사용자가 직접 readme.md 의 22-행 베팅 시퀀스 예시 표를 편집해서 피벗 동작 명확히 표현.

### 누적 P&L 표시

사용자 요청 ("지금 보면 50만원 벌었는데 지금까지 날린돈의 총합도 같이 보여줘서 실제 돈을 잃었다는것을 보여주는것을 넣어야할거같아요"):

- `LiveDashboard` 에 `set_cumulative(prev_pnl, prev_sessions, prev_wins, prev_ruins)` 추가
- 대시보드 자본 섹션에 두 줄 표시:
  - `현재 자본 ... (이번 세션 ±X)`
  - `누적 손익 ... (이전 N세션 ±A  +  이번 ±B)`
- `main.py`: `cumulative_pnl` 추적 → `cumulative_pnl += result.final_won - config.initial_won`
- 세션 간 input() 프롬프트, 최종 요약에도 누적 손익 노출
- `_fmt_pnl_plain` 헬퍼 (ANSI 없는 signed won 포맷)
- 검증: 3 세션 모두 RUIN 시 누적 -183,950원, 평균 -61,317원 정상 표시.

### Phase 9 — 웹 인터페이스

사용자 요청 ("이거 웹에서도 볼수있게 만들어 주세요 웹서버 띄워서 거의 같은 인터페이스로 보여주세요. 설정부분창(또는 프레임)을 따로 하나더 만들면 더욱 좋을것같네요"):

#### 백엔드 (Phase A)

- `uv add fastapi 'uvicorn[standard]'` + `uv add --dev httpx`
- [bcc_sim/web/serialize.py](../bcc_sim/web/serialize.py): Card/Outcome/HandRecord/SessionResult/SessionConfig ↔ dict, `DEFAULT_CONFIG` (CLI 동기)
- [bcc_sim/web/session_runner.py](../bcc_sim/web/session_runner.py): WebSocket 루프 — start/pause/resume/next_session/stop, 누적 P&L, `run_session_traced` 재사용
- [bcc_sim/web/server.py](../bcc_sim/web/server.py): FastAPI — `GET /`, `GET /api/defaults`, `WS /ws/play`, `/static` mount
- [bcc_sim/web/__main__.py](../bcc_sim/web/__main__.py): `python -m bcc_sim.web` 엔트리, argparse host/port/reload

#### 프론트엔드 (Phase B+C)

- Vanilla HTML/CSS/JS (빌드 도구 없음)
- [static/index.html](../bcc_sim/web/static/index.html): 2-frame (좌 Settings / 우 Dashboard), CLI 옵션 전체 노출
- [static/style.css](../bcc_sim/web/static/style.css): 다크 테마, 등폭 폰트, 게이지(green/red + 시작 자본 marker), 카드(♥♦ red), 패널 토글, 모바일 반응형
- [static/app.js](../bcc_sim/web/static/app.js): WebSocket 클라이언트, 폼↔config, DOM 갱신, 컨트롤 버튼, 누적 P&L (CLI 와 동일 메시지)

#### 테스트 + 검증

- 신규 15 테스트 (9 serialize + 6 server) — `tests/test_web_serialize.py`, `tests/test_web_server.py`
- 전체 81/81 통과 (기존 66 회귀 없음)
- 라이브 서버 (port 8765) 기동 + curl: `/api/defaults` JSON / `/` HTML / `/static/*` 정상
- WebSocket smoke 테스트: banner → session_start (seed 파생) → hand 카드 풀 → session_end (누적 P&L) → stop 정상 흐름

#### 결정론 동일성

CLI 와 웹 모두 `_derive_session_seeds(master, n)` + `run_session_traced` 사용 — 같은 seed 면 byte-identical. 별도 cross-check 스크립트 작성 불필요 (구조적으로 보장).

### 사용자 가이드 + _forAI 갱신

사용자 요청 ("실행법 이랑 접속법 사용법 문서 만들어주시고요 / forai 기반 문서 정리해주세요"):

- 신규 사용자 문서: [docs/web_guide.md](../docs/web_guide.md) — 실행(로컬/LAN/reload), 접속, 화면 구성, 사용 순서, 화면 읽는 법, CLI 와의 대응표, 트러블슈팅, WebSocket 프로토콜
- [readme.md](../readme.md): 웹 섹션에서 가이드로 링크
- `_forAI/README.md`: 스냅샷 갱신 (Phase 9, 81 테스트, 새 의존성, 사용자 가이드 위치)
- `_forAI/inventory.md`: 웹 모듈 7개 추가, 테스트 표에 2개 행 추가, 새 의존성 명시, Web usage 섹션 신설
- `_forAI/plan.md`: Phase 9 ✅ 추가, Structure decisions 에 웹 관련 결정 5개 추가, 차후 작업 후보에 웹 항목 추가
- `_forAI/memo.md`: "웹 인터페이스" 섹션 신설 (설계 결정, WebSocket actions 표, 누적 P&L 위치, 카드 색), "반복 금지" 4개 항목 추가 (DEFAULT_CONFIG 수동 동기, `asyncio.sleep(delay)` 무조건 호출, 폼 3군데 동기, `--mode web` 만들지 말기)

### 웹 UI NES.css 픽셀 스타일 개편 (21:00)

사용자 요청 ("NES.css 써서 전면적으로 웹 ui수정해주세요" → "다크말고 밝게" → SNES 컨트롤러 이미지 첨부, "이런 느낌으로" → "흰색배경"):

- [bcc_sim/web/static/index.html](../bcc_sim/web/static/index.html): NES.css 2.3.0 + IBM Plex Sans/Mono KR + Press Start 2P 폰트 CDN 로드. `<fieldset>` → `nes-container with-title is-rounded`, input → `nes-input`, radio/checkbox → `nes-radio`/`nes-checkbox`, 버튼 → `nes-btn is-primary/success/warning/error`, badge → `nes-badge`. 기존 id/구조는 유지(app.js 무수정).
- [bcc_sim/web/static/style.css](../bcc_sim/web/static/style.css): SNES 본체-회색 시도 → 사용자 피드백 따라 흰 배경(`#ffffff`) + 사이드바만 살짝 어두운 톤. SNES 4버튼 색(red/blue/green/yellow)을 컨트롤 버튼과 라벨/타이틀 색에 매핑. 게이지/카드/martin-tag 픽셀 보더 + 그림자.
- 결정: PM2 status 표시 가능 여부와 별개로, NES.css 자체는 라이트 테마가 기본이므로 흰 배경에서 가장 안정적. 다크 시도는 NES.css `is-dark` 변종이 일부 컴포넌트만 지원해서 폐기.

### number input step 검증 버그 수정 (21:10)

사용자 보고 ("초기값에 10만원 넣었는데 왜 거부되지요?" + 스크린샷 "가장 근접한 유효 값 2개는 99001 및 100001"):

- 원인: [bcc_sim/web/static/index.html](../bcc_sim/web/static/index.html) 의 `<input type="number" min="1" step="1000">` 조합 — 브라우저 native 검증이 step 의 배수만 허용해 `min=1` 기준에서 100,000(=999.999스텝)이 무효 처리됨. `/api/defaults` 의 모든 기본값이 사실상 폼 검증을 통과 못 하는 상태였음.
- 사용자 요청 ("스텝 컨트롤 빼주세요"): 자본/베팅 5개 필드(`initial_won`, `target_won`, `ruin_won`, `base_bet_won`, `table_max_won`)에서 `step` 속성 모두 제거. `hand_delay_ms` 의 `step="50"` 은 ms 단위로 자연스러워 유지.

### 시뮬레이션 속도 + 체감시간 표시 (21:20)

사용자 요청 ("웹 ui 에서 하는 시뮬레이션 속도를 높일수있을까요? 그리고 한게임을 40초 잡고 실제 경과시간도 표시해주세요"):

- [bcc_sim/web/serialize.py](../bcc_sim/web/serialize.py): `DEFAULT_CONFIG["hand_delay_ms"]` 300 → 0 으로 변경 (이후 사용자가 50 으로 미세 조정). `asyncio.sleep(0)` 시 이벤트 루프 yield 만 하므로 메시지/DOM 갱신 속도까지 풀어줌.
- [bcc_sim/web/static/index.html](../bcc_sim/web/static/index.html): 통계 패널에 "체감"(이번 세션) / "누계체감"(전체) 행 2개 추가.
- [bcc_sim/web/static/app.js](../bcc_sim/web/static/app.js):
  - `SECONDS_PER_HAND = 40` 상수 (실제 카지노 1핸드 ≈ 40초 환산).
  - `fmtRealTime(seconds)` — 일/시간/분/초 단계적 포맷 (`1일 3시간`, `45분 20초`).
  - `state.cumulativeHands` 추적 (session_end 의 `result.hands_played` 누적).
  - 매 핸드/세션 종료 시 `updateRealtimeStats()` 호출.

### PM2 등록 + 버전 단일 출처 (21:30)

사용자 요청 ("pm2 로 등록 시키는 스크립트 만들어주세요. 포트는 21037" → "버전 표시 해주세요. 버전 관리를 변수하나로도 가능 — 달로스는 그런식인듯" → 마지막 정리 "억지로 하실필요는 없습니다"):

- 신규 [ecosystem.config.cjs](../ecosystem.config.cjs): pm2 앱 `bcc-sim-web`, cwd=`/home/agent01/works/bcc_sim`, script=`/home/agent01/.local/bin/uv`(절대경로 — pm2 데몬 PATH 차이 회피), args=`run python -m bcc_sim.web --host 0.0.0.0 --port 21037`, `interpreter: "none"`, logs=`./logs/pm2-{out,err}.log`, `autorestart: true`, `max_restarts: 10`.
- 신규 [pm2-start.sh](../pm2-start.sh) / [pm2-stop.sh](../pm2-stop.sh): 등록·기동·정지 헬퍼.
- **버전 단일 출처**: `pyproject.toml` 의 `version = "0.1.0"` 하나만 고치면 어디서나 반영되도록 구성.
  - [bcc_sim/__init__.py](../bcc_sim/__init__.py): `importlib.metadata.version("bcc-sim")` 시도 → 실패 시 `tomllib` 로 `pyproject.toml` 직접 파싱 fallback. `uv sync` 가 본 패키지를 dist-info 로 설치하지 않는 환경에서도 동작.
  - [bcc_sim/web/server.py](../bcc_sim/web/server.py): `GET /api/version` → `{"version": __version__, "name": "bcc-sim"}`, FastAPI 앱 자체 version 도 `__version__`.
  - [bcc_sim/web/static/index.html](../bcc_sim/web/static/index.html) 헤더에 `<span id="app-version">` 배지, [bcc_sim/web/static/app.js](../bcc_sim/web/static/app.js) 가 `/api/version` 받아 표시.
  - [ecosystem.config.cjs](../ecosystem.config.cjs): `pyproject.toml` 정규식 파싱해 `BCC_SIM_VERSION` 환경변수로 노출.
- **PM2 status `version` 컬럼**: 외부 바이너리를 script 로 호출하는 경우 PM2 가 cwd 의 `package.json` 을 자동 감지하지 않음 (dalus_server 처럼 `.js` script 일 때만 작동). Node wrapper(`run.cjs`)로 우회 가능함은 확인했으나, 사용자 판단으로 wrapper 는 폐기하고 `N/A` 그대로 두기로 결정. UI/API/env 만으로 충분.
- 사고 기록: 작업 중 `pm2 kill` 실행 — daemon 전체가 죽어 dalus-server / dap3d-backend 도 함께 정지. `/home/agent01/.pm2/dump.pm2.bak` 에서 `cp ... dump.pm2 && pm2 resurrect` 로 복구. **이후 pm2 daemon 전체 영향 명령은 반드시 사전 확인할 것**.
