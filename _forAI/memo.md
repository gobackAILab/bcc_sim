# Memo

## 목차

- [제품 기준선](#제품-기준선)
- [바카라 도메인 규칙](#바카라-도메인-규칙)
  - [카드 가치](#카드-가치)
  - [슈(Shoe) 구성](#슈shoe-구성)
  - [드로우 룰 (Punto Banco / 일반 카지노 룰)](#드로우-룰-punto-banco--일반-카지노-룰)
  - [베팅 배당 (이 프로젝트 확정 룰)](#베팅-배당-이-프로젝트-확정-룰)
- [마틴게일 베팅 룰](#마틴게일-베팅-룰)
  - [동작 (사용자 클리어)](#동작-사용자-클리어)
  - [`martin_steps` 의미](#martin_steps-의미)
  - [피벗 OFF (`--no-pivot`)](#피벗-off---no-pivot)
  - [마틴게일이 망하는 이유](#마틴게일이-망하는-이유)
- [기본 설정값 (CLI 디폴트, 원화)](#기본-설정값-cli-디폴트-원화)
  - [베팅 시퀀스 예 (5-마틴 피벗, base 1,000원)](#베팅-시퀀스-예-5-마틴-피벗-base-1000원)
- [런타임 구조 메모](#런타임-구조-메모)
- [동작 규칙](#동작-규칙)
- [라이브 모드 시각화](#라이브-모드-시각화)
- [웹 인터페이스](#웹-인터페이스)
- [반복 금지](#반복-금지)

## 제품 기준선

- Python 3.11+, uv 패키지 관리.
- **CLI 교육용 시뮬레이터** — 라이브 시각화(카드 딜링 + 게이지 바)가 1순위, 통계는 부차적.
  - 사용자 결정: 통계로 "퉁치는" 게 아니라 실제 카드를 보여줘야 호소력이 있다.
- 결정론적 재현(시드 지정) 지원이 기본 요구사항.
- 두 모드: `live` (대시보드/스크롤), `stats` (집계 통계).

## 바카라 도메인 규칙

### 카드 가치
- A = 1
- 2~9 = 액면 그대로
- 10, J, Q, K = 0
- 두 장 합산 후 **마지막 자리수만** 유효 (예: 7+8=15 → 5).

### 슈(Shoe) 구성
- 표준 카지노 바카라: 8 덱 = 416 장.
- 한 슈를 끝까지 사용하지 않고 **컷 카드** 뒤(보통 14장 정도)부터 새 슈로 교체.
- 시뮬레이터에선 일단 "슈 소진 시 새 슈" 로 단순화하되, `cut_card_offset` 파라미터로 확장 가능하게.

### 드로우 룰 (Punto Banco / 일반 카지노 룰)
- Player·Banker 각각 2장씩 받는다.
- **Natural**: 어느 한쪽이 처음 2장 합이 8 또는 9 → 즉시 종료.
- **Player 3rd card 룰**: Player 합이 0~5 → 한 장 더, 6~7 → 스탠드.
- **Banker 3rd card 룰** (Player 가 스탠드한 경우): Banker 0~5 → 드로우, 6~7 → 스탠드.
- **Banker 3rd card 룰** (Player 가 드로우한 경우, Player 의 3번째 카드 값에 따라 표):
  - Banker 0~2: 무조건 드로우.
  - Banker 3: Player 3rd card 가 8 이 아니면 드로우.
  - Banker 4: Player 3rd card 가 2~7 이면 드로우.
  - Banker 5: Player 3rd card 가 4~7 이면 드로우.
  - Banker 6: Player 3rd card 가 6~7 이면 드로우.
  - Banker 7: 스탠드.

### 베팅 배당 (이 프로젝트 확정 룰)
- Player 적중: 1:1 (베팅 1 → 수익 +1).
- Banker 적중: **0.95배 수익** (5% 커미션 적용, 베팅 1 → 수익 +0.95). **확정**.
- Tie 결과: **베팅하지 않은 것으로 간주**. 자본 변화 없음, 베팅 시퀀스(마틴게일 카운터) **유지**(증가도 리셋도 안 함). **확정**.
  - 즉 본 시뮬레이터는 "Tie 자체에 베팅하는 옵션" 을 제공하지 않는다. 베팅 대상은 Player 또는 Banker 만.
- 이론적 하우스 엣지(참고): Banker ≈ 1.06%, Player ≈ 1.24%.

## 마틴게일 베팅 룰

본 시뮬레이터의 마틴게일은 **"Banker 우선 피벗 + N번 더블링 리셋"** 방식. **확정**.

### 동작 (사용자 클리어)

```
1. base (예: 1,000원) 으로 Banker 베팅
2. Banker 승 → Banker base 유지 (마틴 없음)
3. Banker 패 → MARTIN START: Player 로 전환, 베팅 2배
4. Player 베팅 결과:
   - 승  → MARTIN END, Banker base 로 리셋
   - 패  → 2배로 더블링, Player 사이드 유지
   - Tie → 시퀀스·사이드·자본 모두 변화 없음 (베팅 무효)
5. (martin_steps + 1)번째 누적 패배 → MARTIN END (포기), Banker base 로 리셋
6. 위 과정을 자본이 목표(WIN) 또는 파산(RUIN) 에 도달할 때까지 반복
```

### `martin_steps` 의미

- `martin_steps=N` = **N번 더블링 허용** (총 N+1 베팅이 시퀀스에 들어감)
- 예: `martin_steps=5` → 베팅 시퀀스 `1k → 2k → 4k → 8k → 16k → 32k` (6 베팅), 6번째 패배 시 리셋
- `martin_steps=None` 이면 무한 더블 (옛 마틴게일 방식, 테이블 상한·자본까지 도달)

### 피벗 OFF (`--no-pivot`)

피벗 비활성 시 한 사이드 (primary) 에만 베팅. 패배해도 사이드 전환 없음.
구식 단방향 마틴게일과 같음.

### 마틴게일이 망하는 이유

- **장기 기대값은 음수** (하우스 엣지 -1.06% Banker / -1.24% Player).
- **피벗이 오히려 더 안 좋음** — Player 사이드 엣지가 Banker 보다 큼 (1.24 > 1.06). 피벗 92.8% vs no-pivot 92.6% 파산률 (500세션).
- **파산 확률은 자본 규모·베팅 상한에 따라 달라지지만 0이 아니다** — 5-마틴 100만원 자본에서도 93% 파산.
- **N번 리셋은 파산을 느리게 할 뿐 막지 못한다** — 매 사이클 평균 손실은 여전히 음수.
- **충분히 많은 세션 → 평균 손실은 하우스 엣지로 수렴**.

## 기본 설정값 (CLI 디폴트, 원화)

- 초기 자본: 100,000원 (10만원)
- 기본 베팅: 1,000원 (1k)
- 목표 자본 (WIN): 500,000원 (5배)
- 파산 임계 자본 (RUIN): 50,000원 (절반 손실) — 또는 다음 베팅 불가
- 테이블 상한: 100,000원
- 마틴게일 더블링 횟수: 5 (6번째 패배 시 reset)
- 피벗: ON (Banker 시작 → 패배 시 Player 전환)
- 슈 구성: 8덱, 컷 오프셋 14장
- 베팅 primary 사이드: Banker (가장 낮은 엣지 — 마틴게일에 가장 유리한 조건으로 잡고도 망함을 보여야 메시지가 산다)
- 라이브 모드 핸드 지연: 0.3초
- stats 모드 세션 수: 10,000

### 베팅 시퀀스 예 (5-마틴 피벗, base 1,000원)

```
Banker 1k 패배 → Player 2k 패배 → Player 4k → Player 8k → Player 16k → Player 32k (6번째)
→ 6번째 패배 시 Banker 1k 로 리셋
```

연속 패배 시 한 사이클 손실 = 1k + 2k + 4k + 8k + 16k + 32k = 63k. 10만 원 자본 ÷ 63k ≈ 1.6 사이클 분량.
사이클 도중 승리 확률이 있어 평균은 더 길지만, -1.0% 엣지 누적으로 결국 파산.

## 런타임 구조 메모

- 한 "세션" = 시드 1개로 자본이 목표 또는 파산에 도달할 때까지 베팅을 반복.
- 한 "실험" = N개 세션을 돌려 승률/평균 자본/평균 베팅 수/최대 연속 패배 등을 집계.
- 시드 관리: 실험 시드 → 세션별 시드 파생 (재현성).
- 슈는 세션 내부 상태 (세션 간에 슈를 공유하지 않는다).

## 동작 규칙

- **라이브가 기본**, 통계는 보조. `--mode live` 가 default, `--mode stats` 로 통계 전환.
- 모든 확률·이율은 시뮬레이션 결과로 보여야 하며, 하드코딩된 이론값과 **나란히** 출력해 비교 가능하게.
- 마틴게일 외에 추가 전략(파롤리, 피보나치)도 같은 인터페이스로 끼울 수 있게 `Strategy` Protocol 유지.
- `Strategy.side` 는 **property** — 매 핸드 동적으로 변경 가능 (피벗 지원).
- Session 은 매 베팅 직전 `bet_side = strategy.side` 캡처 → payout·streak 계산에 사용.
- 라이브 대시보드는 TTY 만 지원, 비-TTY 는 스크롤 폴백.
- 매 세션 로그 파일은 ANSI 없는 plain text (grep 친화).

## 라이브 모드 시각화

- **고정 게이지 바**: ANSI 커서 제어 (`\033[H`, `\033[K`) 로 in-place 갱신. 스크롤하지 않음.
- 게이지: 파산 ←→ 목표 사이 자본 위치. `│` 마커 = 시작 자본 위치.
- 색: 자본 ≥ 시작 = green, < 시작 = red.
- 매 핸드 표시: 베팅 (사이드·금액·마틴 이벤트), P/B 카드 + 토탈, 결과 + W/L/T, 자본 변화.
- 카드: `Card.__str__` 로 `7♠`, `A♣`, `K♦` 표기.

## 웹 인터페이스

CLI 와 거의 같은 화면을 브라우저에서 제공. 사용자 문서 [docs/web_guide.md](../docs/web_guide.md) 가 한 곳에 정리되어 있음.

### 설계 결정

- **프레임워크**: FastAPI + uvicorn. async + WebSocket 네이티브가 결정 요인 (pause/resume/next/stop 양방향 컨트롤 필요 → SSE 가 아닌 WebSocket).
- **프론트**: Vanilla HTML/CSS/JS. 빌드 도구 없이 `bcc_sim/web/static/` 한 폴더 — 디자인 수정은 그 자리에서.
- **CLI 와 결정론 동일성**: 양쪽 모두 `_derive_session_seeds` + `run_session_traced` 호출. 같은 seed + 같은 설정 → byte-identical.
- **history 사전 계산 후 스트리밍**: `run_session_traced` 가 history 를 다 만든 뒤 `asyncio.sleep(delay)` 로 한 핸드씩 전송. CLI `_animate_session_dashboard` 와 같은 패턴.
- **CLI 와 공존, `--mode web` 없음**: 의존성·기동방식이 다르므로 별도 엔트리 (`python -m bcc_sim.web`).
- **단일 사용자 가정**: 인증 없음, 기본 127.0.0.1. `--host 0.0.0.0` 시 경고만 출력.

### 컨트롤 (WebSocket actions)

| Client → Server | 의미 |
|------|------|
| `start` | 첫 메시지, config 포함 |
| `pause` | 다음 핸드 전송 중지 (현재 핸드는 이미 전송됨) |
| `resume` | 일시정지 해제 |
| `next_session` | `auto_next=false` 일 때 세션 종료 후 다음 세션 시작 |
| `stop` | WebSocket 종료 |

| Server → Client | 의미 |
|------|------|
| `banner` | 시작 시 1회 — 정규화된 config |
| `session_start` | 세션마다 — session_num, derived seed |
| `hand` | 매 핸드 — HandRecord dict (Card 포함) |
| `session_end` | 세션 종료 — result + session_pnl + cumulative |
| `error` | validation 실패 또는 첫 액션 오류 |

### 누적 P&L

세션 간 누적은 **서버 측에서** 집계 (`cumulative.pnl`), `session_end` 에 담아 전송. 프론트는 화면 표시만 담당. 옵션 바꿔 재시작 시 누적도 0 으로 리셋.

### 카드 색 (♥♦ red)

`<span class="card red">` vs `<span class="card">`. CSS `font-variant-emoji: text` 로 모바일에서 이모지 그림 렌더 방지.

## 반복 금지

- 카드 인출을 **복원 추출**(매번 무작위 카드)로 구현하지 말 것. 슈 단위 무복원이어야 시뮬레이션의 신뢰성이 산다 — 사용자가 명시한 핵심 요구사항.
- "마틴게일은 수학적으로 망한다" 만 코드 주석으로 박지 말고, 시뮬레이션 결과 출력으로 입증할 것 (라이브 모드가 핵심).
- 베팅 결과 계산에서 Banker 커미션(0.95배) 빠뜨리지 말 것 — 빠뜨리면 하우스 엣지가 왜곡됨.
- Tie 발생을 마틴게일의 "패배" 로 처리하지 말 것. 베팅 자체가 없었던 것으로 간주 → 자본·시퀀스 모두 변화 없음.
- 피벗 모드에서 `strategy.side` 를 instance attribute 로 저장하지 말 것. 반드시 property — `Strategy` Protocol 호환을 위해.
- `HandResult.player_cards/banker_cards` 는 `compare=False` 유지. 동등성 비교 깨지면 기존 테스트 다 깨짐.
- 라이브 모드에 추가하는 print 는 ANSI 색 코드 있을 수 있으니, 로그 파일에는 `write_session_log` (색 제거 plain) 사용.
- 웹 `DEFAULT_CONFIG` ([bcc_sim/web/serialize.py](../bcc_sim/web/serialize.py)) 는 CLI `main.py` 기본값과 **수동으로 동기화** 필요. 한쪽 변경 시 양쪽 다 갱신. `test_default_config_matches_cli_defaults` 가 일부 가드.
- 웹 session_runner 에서 `asyncio.sleep(delay)` 는 `delay=0` 이어도 **항상 호출** — 그래야 control reader task 가 핸드 사이에 메시지를 처리할 기회를 얻는다. 조건부 (`if delay > 0:`) 로 만들면 pause/stop 이 안 먹힘.
- 웹 프론트의 폼은 새 옵션 추가 시 `index.html` + `app.js readConfig` + `DEFAULT_CONFIG` 세 군데 동기 필요.
- 웹 인터페이스는 CLI 의 `--mode` 에 통합하지 말 것 — 의존성(uvicorn) 과 기동방식이 달라 별도 엔트리 (`python -m bcc_sim.web`) 유지. 사용자 합의된 분리.
