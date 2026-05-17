# bcc-sim 웹 인터페이스 가이드

브라우저에서 바카라 마틴게일 시뮬레이션을 실행하고 시각적으로 관찰하기 위한 안내서.
CLI 라이브 모드와 동일한 게임을 같은 시드·옵션이면 byte-identical 한 시퀀스로 보여준다.

## 목차

- [한눈에 보기](#한눈에-보기)
- [실행](#실행)
  - [로컬 실행](#로컬-실행)
  - [LAN 공유 실행](#lan-공유-실행)
  - [개발용 자동 reload](#개발용-자동-reload)
  - [종료](#종료)
- [접속](#접속)
- [화면 구성](#화면-구성)
  - [좌측 Settings 패널](#좌측-settings-패널)
  - [우측 Dashboard](#우측-dashboard)
  - [컨트롤 버튼](#컨트롤-버튼)
- [사용 순서](#사용-순서)
  - [1. 옵션 설정](#1-옵션-설정)
  - [2. 시작 후 관찰](#2-시작-후-관찰)
  - [3. 일시정지 / 재개](#3-일시정지--재개)
  - [4. 세션 종료 후 다음 세션](#4-세션-종료-후-다음-세션)
  - [5. 옵션 바꿔서 다시 시작](#5-옵션-바꿔서-다시-시작)
- [화면 읽는 법](#화면-읽는-법)
  - [자본 게이지](#자본-게이지)
  - [현재 자본 + 누적 손익](#현재-자본--누적-손익)
  - [현재 핸드](#현재-핸드)
  - [최근 핸드](#최근-핸드)
  - [세션 통계 / 누계](#세션-통계--누계)
- [CLI 와의 관계](#cli-와의-관계)
- [트러블슈팅](#트러블슈팅)
- [고급: API / WebSocket 프로토콜](#고급-api--websocket-프로토콜)

## 한눈에 보기

```bash
uv sync                              # 첫 실행 전 1회
uv run python -m bcc_sim.web         # 서버 기동
# → http://localhost:8000 접속
# → 좌측 [▶ Apply & Start] 클릭
```

## 실행

### 로컬 실행

```bash
uv run python -m bcc_sim.web
```

기본 호스트는 `127.0.0.1`, 포트는 `8000`. 같은 컴퓨터에서만 접속 가능.

### LAN 공유 실행

다른 기기(휴대폰, 태블릿, 같은 네트워크의 다른 PC)에서 접속하려면:

```bash
uv run python -m bcc_sim.web --host 0.0.0.0 --port 8080
```

- `--host 0.0.0.0` 으로 모든 인터페이스에서 listen. 기동 시 경고가 출력된다.
- 접속 시 PC 의 LAN IP 를 사용 (`192.168.x.x:8080` 등).
- 방화벽이 해당 포트를 막고 있으면 허용해야 한다.

### 개발용 자동 reload

소스 변경 시 자동 재시작이 필요하면:

```bash
uv run python -m bcc_sim.web --reload
```

`bcc_sim/web/` 하위 파일 (Python, HTML, CSS, JS) 변경이 감지되면 서버가 다시 뜬다.

### 종료

서버 콘솔에서 `Ctrl+C`.

## 접속

- 같은 컴퓨터: <http://localhost:8000>
- 다른 기기 (LAN): `http://<서버 PC IP>:<포트>` — 예: `http://192.168.0.42:8080`
- 모바일·태블릿: 가로 화면 권장. 800px 이하 폭에서는 설정 패널이 상단으로 자동 재배치된다.

## 화면 구성

```
+--------------------+---------------------------------------------+
| ⚙ Settings  [<<]   |  바카라 마틴게일 시뮬레이터  (online/paused)|
| ─────────────────  |  ───────────────────────────────────────── |
| 전략                |  자본 게이지 [██████│░░░░░░░░░] 87,000원   |
|  ● martingale      |                                             |
| Primary Side       |  현재 자본: 87,000원   (이번 -13,000)      |
|  ● banker          |  누적 손익: -183,950원                     |
| 자본               |                                             |
|  initial / target  |  현재 핸드 #17        MARTIN START          |
|  / ruin            |  베팅: BANKER 2,000원                       |
| 베팅               |  Player:  7♠  8♥           = 5             |
|  base / table-max  |  Banker:  K♦  A♣  +3♠      = 4             |
| 마틴게일            |  결과: LOSS (PLAYER)  Δ -2,000원           |
|  steps / pivot     |                                             |
| 슈                  |  최근 핸드                                  |
|  decks / cut-off   |   #17 P 4k LOSS -4,000                     |
| 진행                |   #16 P 2k LOSS -2,000                     |
|  delay / auto      |   #15 B 1k LOSS -1,000 ← MARTIN START      |
|  seed              |                                             |
|                    |  세션 #3 시드 12345                         |
| [▶ Apply & Start]  |  핸드 17 · 베팅 16 · 최장연패 4             |
|                    |  누계: 승 0 · 파산 2 · 진행 1               |
|                    |                                             |
|                    |  [▶ Apply&Start] [⏸ Pause] [⏭ Next] [⏹ Stop]|
+--------------------+---------------------------------------------+
```

### 좌측 Settings 패널

CLI 옵션 전체가 폼으로 노출된다.

| 그룹 | 항목 | 설명 |
|------|------|------|
| 전략 | `flat` / `martingale` | 베팅 전략 (CLI `--strategy`) |
| Primary Side | `banker` / `player` | 시작 사이드. 피벗 모드에서는 복귀 사이드 |
| 자본 (원) | `initial` / `target` / `ruin` | 시작·승리 목표·파산 임계 |
| 베팅 (원) | `base-bet` / `table-max` | 기본 베팅·테이블 상한 |
| 마틴게일 | `steps` | 더블링 허용 횟수 (N+1번째 패배 시 reset) |
|         | `pivot` | 체크 시 Banker 패배 → Player 전환 |
| 슈 | `decks` / `cut-offset` | 슈 구성 |
| 진행 | `delay (ms)` | 핸드 간 지연 (CLI `--hand-delay` 의 ms 단위). 0 = 최대 속도 |
|     | `auto next` | 체크 시 세션 종료 즉시 다음 세션 시작 (CLI `--auto`) |
|     | `seed` | 마스터 시드 (재현용) |

`«` 버튼 — 패널을 접어 대시보드를 화면 전체로. 다시 열려면 우측 상단 `»` 버튼.

`[▶ Apply & Start]` — 현재 설정으로 시뮬레이션 시작. 이미 실행 중이면 끊고 새 세션부터 다시 시작.

### 우측 Dashboard

상단부터 차례로:

1. **헤더** — 제목 + 우측에 연결 상태 배지 (`offline` / `online` / `paused`)
2. **자본 게이지** — 파산 ↔ 시작 자본 마커 ↔ 목표 사이의 위치를 막대 폭으로 표시
3. **현재 자본 + 누적 손익** — 이번 세션 손익과 모든 종료 세션 합계
4. **현재 핸드** — 베팅 사이드/금액, P/B 카드 풀 핸드 + 토탈, 베팅 관점 결과 (WIN/LOSS/TIE)
5. **최근 핸드** — 위에서 아래로 새 핸드가 쌓이는 12개 짜리 리스트
6. **세션 통계** — 현재 세션의 핸드/베팅/최장연패, 모든 세션 누계
7. **컨트롤 버튼**
8. **에러 배너** (조건부) — 잘못된 설정이나 연결 오류 시 빨간 배너

### 컨트롤 버튼

| 버튼 | 동작 | 활성 조건 |
|------|------|-----------|
| ▶ Apply &amp; Start | 현재 설정으로 새 시뮬레이션 시작 | 항상 (실행 중이면 끊고 재시작) |
| ⏸ Pause | 다음 핸드 전송 중단 | 실행 중 |
| ▶ Resume | 일시정지 해제 | Pause 상태 |
| ⏭ Next Session | 다음 세션 시작 (`auto next` 꺼진 경우) | 세션 종료 후 대기 중 |
| ⏹ Stop | WebSocket 끊고 종료 | 실행 중 또는 세션 종료 대기 중 |

## 사용 순서

### 1. 옵션 설정

페이지 로드 시 `/api/defaults` 가 자동으로 호출되어 기본값이 채워진다 (CLI 와 동일).

원하는 옵션을 수정한다. 예시 시나리오:

- **고전적 5-마틴 데모**: 기본값 그대로 (initial 100,000원, target 500,000원, ruin 50,000원, base 1,000원, steps 5, pivot ON)
- **빠르게 보기**: `delay (ms)` 를 `50` 또는 `0` 으로
- **자동 무한 진행**: `auto next` 체크 + `delay` 짧게 → 누적 손익이 계속 녹는 것을 관찰
- **세션마다 다른 결과**: `seed` 를 변경하거나 매번 다른 값으로

### 2. 시작 후 관찰

`[▶ Apply & Start]` 클릭하면:
1. 연결 배지가 `online` 으로 바뀜
2. 게이지가 시작 자본 위치에서 출발
3. 매 핸드마다 카드가 한 장씩 나타나고, 자본·게이지가 갱신됨
4. 마틴 시작/종료 이벤트는 핸드 헤더에 강조 라벨로 표시

### 3. 일시정지 / 재개

- `⏸ Pause` — 현재 핸드를 보여준 상태로 멈춤. 연결 배지가 `paused` 로 변경.
- `▶ Resume` — 다음 핸드부터 계속.

### 4. 세션 종료 후 다음 세션

세션이 WIN 또는 RUIN 으로 끝나면:
- `auto next` ON → 다음 세션이 즉시 시작.
- `auto next` OFF → `⏭ Next Session` 버튼이 활성화. 클릭하면 다음 시드로 새 세션 시작. **누적 손익은 유지된다** (CLI 와 동일).

### 5. 옵션 바꿔서 다시 시작

언제든지 좌측 설정을 바꾸고 다시 `[▶ Apply & Start]` 를 누르면, 기존 연결이 닫히고 새 설정으로 다시 시작한다. 누적 손익은 0으로 리셋 (새 실험으로 간주).

## 화면 읽는 법

### 자본 게이지

```
[█████████│░░░░░░░░░░░░░░░░] 87,000원
 ruin       initial   target
 50,000원   100,000원 500,000원
```

- 막대 폭 = 현재 자본의 ruin↔target 사이 상대 위치
- 노란 세로선 `│` = 시작(initial) 자본 위치
- 자본 ≥ initial → 막대 색 **green**, 자본 < initial → **red**
- 막대가 0% 에 닿거나 줄어들지 못하면 RUIN 임박

### 현재 자본 + 누적 손익

```
현재 자본: 87,000원   (이번 세션 -13,000원)
누적 손익: -183,950원  (이전 2세션 -170,950원  +  이번 -13,000원)
```

- **현재 자본**: 마지막 핸드 직후의 자본
- **이번 세션**: 이번 세션 시작 시점 대비 손익
- **누적 손익**: 모든 종료된 세션 + 진행 중인 세션 손익의 합 — "이번 세션을 운 좋게 이겨도 그 전 손실은 회복 안 된다" 는 사실을 시각화

### 현재 핸드

```
현재 핸드 #17         MARTIN START
베팅: BANKER 2,000원
Player:  7♠  8♥                    = 5
Banker:  K♦  A♣  +3♠               = 4
결과: LOSS (PLAYER)  Δ -2,000원
```

- **MARTIN START / END · WIN / END · 포기**: 마틴게일 이벤트 라벨
- 카드: ♥♦ 는 빨강, ♠♣ 는 짙은 글씨
- 결과는 **베팅 관점**:
  - `WIN (XXX)` — 베팅한 사이드 적중
  - `LOSS (YYY)` — 베팅한 사이드 빗나감
  - `TIE` — Tie 결과 (베팅하지 않은 것으로 간주, Δ = 0)

### 최근 핸드

```
#17 P 4k    LOSS  -4,000원
#16 P 2k    LOSS  -2,000원
#15 B 1k    LOSS  -1,000원  ← START
#14 B 1k    WIN     +950원
#13 B 1k    WIN     +950원
```

위쪽이 최신. 12개까지 보관 (세션이 바뀌면 비워짐).

### 세션 통계 / 누계

```
세션  #3   시드 12345
진행  핸드 17 · 베팅 16 · 최장연패 4
누계  승 0 · 파산 2 · 진행 1
```

- 세션 번호는 1 부터 증가 (옵션 변경 후 재시작 시 1 부터)
- 시드는 마스터 시드에서 결정론적으로 파생
- 베팅 = 핸드에서 Tie 제외
- 누계는 모든 종료된 세션 + 현재 진행 중 1 세션

## CLI 와의 관계

| 요소 | CLI | 웹 |
|------|-----|-----|
| 실행 명령 | `uv run python main.py` | `uv run python -m bcc_sim.web` |
| 라이브 대시보드 | ANSI 터미널 in-place | 브라우저 DOM |
| 옵션 입력 | `--initial 100000` 등 | 좌측 폼 |
| 카드 표시 | `7♠` 단색 | `7♥` 빨강, `7♠` 짙은 글씨 |
| 핸드 간 지연 | `--hand-delay 0.3` (초) | `delay (ms)` (밀리초) |
| 세션 자동 진행 | `--auto` | `auto next` 체크박스 |
| 일시정지 | (없음, Ctrl+S) | `⏸ Pause` 버튼 |
| 세션 로그 파일 | 자동 (`./logs/...`) | (현재 미지원) |
| stats 모드 | `--mode stats --sessions 10000` | (현재 웹은 live 만) |

**결정론 동일성**: 같은 `seed` + 같은 설정이면 양쪽이 정확히 같은 카드 시퀀스·결과·자본 추이를 보인다. 같은 `_derive_session_seeds` 와 `run_session_traced` 를 호출하기 때문.

## 트러블슈팅

**서버는 떴는데 브라우저에서 안 열림**
- 콘솔에 나온 URL 확인. LAN 접속 시 `localhost` 가 아니라 PC 의 LAN IP.
- 방화벽이 포트를 막고 있는지 확인.

**"WebSocket 연결 오류" 배너**
- 서버가 죽었거나 네트워크 끊김. 서버 콘솔 확인 후 새로고침.

**카드 모양이 이모지로 표시 (♥ 가 빨간 하트 그림)**
- `style.css` 의 `font-variant-emoji: text` 가 적용되지 않은 구형 브라우저. 최신 Chrome/Edge/Firefox/Safari 권장.

**세션이 너무 짧음 / 너무 김**
- 마틴게일 기본값은 평균 수백 핸드. 더 길게 보려면 `--no-martin-limit` 대신 `martin steps` 값을 크게 (예: 10).
- 너무 빠르면 `delay (ms)` 를 `500` 이상으로.

**같은 시드인데 결과가 다름**
- 옵션이 한 글자라도 다른지 확인 (예: `target_won` 차이). 모든 옵션이 같아야 카드 시퀀스도 같다.

**ImportError: fastapi / uvicorn**
- `uv sync` 를 다시 실행. `pyproject.toml` 에 `fastapi`, `uvicorn[standard]` 가 runtime 의존성으로 추가되어 있어야 한다.

## 고급: API / WebSocket 프로토콜

### REST

| 경로 | 메소드 | 응답 |
|------|--------|------|
| `/` | GET | `index.html` |
| `/static/{file}` | GET | 정적 자산 |
| `/api/defaults` | GET | CLI 기본값 JSON (프론트 폼 초기값) |

### WebSocket `/ws/play`

**Client → Server**

```json
{ "action": "start", "config": {
  "initial_won": 100000, "target_won": 500000, "ruin_won": 50000,
  "table_max_won": 100000, "base_bet_won": 1000,
  "side": "banker", "strategy_name": "martingale",
  "martin_steps": 5, "pivot": true, "seed": 42,
  "n_decks": 8, "cut_offset": 14,
  "hand_delay_ms": 300, "auto_next": false
}}
{ "action": "pause" }
{ "action": "resume" }
{ "action": "next_session" }
{ "action": "stop" }
```

**Server → Client**

```json
{ "type": "banner", "config": { ... }, "hand_delay_ms": 300, "auto_next": false }
{ "type": "session_start", "session_num": 1, "seed": 12345, "config": { ... } }
{ "type": "hand", "record": {
  "hand_num": 17, "bet_side": "BANKER", "bet_won": 2000,
  "hand_outcome": "PLAYER",
  "player": { "cards": [{"rank":7,"suit":"S","label":"7♠","value":7}, ...], "total": 8 },
  "banker": { "cards": [...], "total": 5 },
  "capital_delta": -2000, "capital_after": 87000,
  "cycle_loss_count": 1, "martin_event": "start"
}}
{ "type": "session_end",
  "result": { "outcome": "RUIN", "final_won": 37150, ... },
  "session_pnl": -62850,
  "cumulative": { "sessions": 3, "wins": 0, "ruins": 3, "pnl": -183950 } }
{ "type": "error", "message": "..." }
```

세션 종료 후 `auto_next` 가 false 면 `next_session` 또는 `stop` 메시지를 기다린다.
서버는 모든 control 메시지를 핸드 사이에 처리하므로 응답성은 `hand_delay_ms` 에 비례.

`martin_event` 값: `""` (이벤트 없음) / `"start"` (마틴 시작) / `"end_win"` (승리로 종료) / `"end_giveup"` (N+1패로 포기).

`ruin_reason` 값: `"capital_depleted"` / `"bet_exceeds_capital"` / `"bet_exceeds_table_max"` / `"both"`.
