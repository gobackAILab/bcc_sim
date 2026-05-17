# bcc-sim — 바카라 마틴게일 시뮬레이터

## 목차

- [목적](#목적)
- [확정 룰](#확정-룰)
- [마틴게일 베팅 규칙](#마틴게일-베팅-규칙)
- [설치 / 실행 환경](#설치--실행-환경)
- [사용법](#사용법)
  - [기본 실행](#기본-실행)
  - [옵션 전체](#옵션-전체)
  - [실행 예](#실행-예)
- [출력 읽는 법](#출력-읽는-법)
- [웹 인터페이스](#웹-인터페이스)
- [테스트](#테스트)
- [프로젝트 구조](#프로젝트-구조)
- [핵심 설계 결정](#핵심-설계-결정)
- [라이선스](#라이선스)

## 목적

허황된 확률·이율 계산을 실제 카드덱 시뮬레이션으로 검증한다.
도박 중독자·이용자들에게 **마틴게일 룰(2배 베팅 회수 전략)이 수학적으로 망한다**는 사실을
숫자로 보여주는 것이 이 프로젝트의 한 줄 목적이다.

8덱 슈를 실제 카지노처럼 무복원으로 사용하고, 표준 Punto Banco 드로우 룰을 그대로 구현하며,
Banker 5% 커미션까지 반영한다. 1만 세션 단위로 돌리면 마틴게일이 99% 이상 파산하는 것을 직접 확인할 수 있다.

## 확정 룰

| 항목 | 값 |
|------|----|
| 통화 단위 | 원 (KRW) |
| 슈 구성 | 8 덱 (416 장), 컷 오프셋 14 장 |
| 베팅 대상 | Player 또는 Banker 만 (Tie 베팅 없음) |
| Player 승리 배당 | 1 : 1 (베팅 1,000원 → 수익 +1,000원) |
| Banker 승리 배당 | **0.95 : 1** (베팅 1,000원 → 수익 +950원, 5% 커미션) |
| Tie 결과 | **베팅 안 한 것으로 간주** — 자본 변화 없음, 마틴게일 시퀀스 유지 |
| 세션 종료 | WIN(목표 자본 도달) / RUIN(파산 또는 다음 베팅 불가) |
| 자본 단위 | 정수 원 (Banker 커미션의 분 단위는 하우스 보관) |
| 시드 | 고정 시 결정론적 재현 |

## 마틴게일 베팅 규칙( 변형 뱅커 피봇 규칙)

본 시뮬레이터의 마틴게일은 **"N번까지 더블링한 뒤 시퀀스 포기"** 방식이다.

기본 동작 (`--martin-steps 5` 의 경우):

```
1. 1,000원 (base) 으로 Banker 베팅
2. Banker 가 이기면 1,000원 유지 (Banker side)
3. Banker 가 지면 → Player 로 전환하고 베팅 2배로 (2k → 4k → 8k → 16k → 32k)
   (전환 후 마틴종료까지 Player 사이드 고정)
4. Player 베팅이 이기면 즉시 Banker base 1,000원으로 리셋 (마틴 종료)
5. Player 베팅도 5번 더 지면 (총 6연패) → 시퀀스 포기, Banker base 1,000원으로 리셋
6. Tie 가 나오면 베팅한 적 없는 것으로 간주 (자본·사이드·시퀀스 모두 유지)
7. 위 과정을 자본이 목표(WIN) 또는 파산(RUIN)에 도달할 때까지 반복
```

`martin_steps=5` 는 "5번 더블링 허용" = 베팅 시퀀스 6개 (1k → 2k → 4k → 8k → 16k → 32k).
6번째 패배(32k 까지 다 졌을 때)에서 시퀀스 포기.

베팅 시퀀스 예시 (모두 Banker 에 베팅):

| 핸드 | 결과 | 베팅 | 자본 변화 | 다음 베팅 | 비고 |
|------|------|------|-----------|----------|------|
| 1 | Banker (W) | 1,000 | +950 | 1,000 | 1번째 승리 유지 |
| 2 | Player (L) | 1,000 | -1,000 | 2,000 | 1번째 패배 → 더블  **마틴시작**|
| 3 | Player (L) | 2,000 | -2,000 | 4,000 | 2번째 패배 → 더블 |
| 4 | Player (L) | 4,000 | -4,000 | 8,000 | 3번째 패배 → 더블 |
| 5 | Player (L) | 8,000 | -8,000 | 16,000 | 4번째 패배 → 더블 |
| 6 | Player (L) | 16,000 | -16,000 | 32,000 | 5번째 패배 → 더블 |
| 7 | Player (W) | 32,000 | +32,000 | 1,000 | | 승리 → 리셋 **마틴종료**|
| 8 | Banker (L) | 1,000 | -1,000 | 2,000 | 1번째 패배 → 더블 **마틴시작**|
| 9 | Player (W) | 2,000 | +2,000 | 1,000 | 승리 → 리셋 **마틴종료**|
| 10 | Banker (W) | 1,000 | +950 | 1,000 | 승리 → 리셋 |
| 11 | Banker (T) | 1,000 | 0 | 1,000 | Tie → 시퀀스 유지 (베팅한 적 없는 것으로 간주) |
| 12 | Banker (W) | 1,000 | +950 | 1,000 | 승리 → 리셋 |
| 13 | Banker (W) | 1,000 | +950 | 1,000 | 승리 → 리셋 |
| 14 | Banker (W) | 1,000 | +950 | 1,000 | 승리 → 리셋 |
| 15 | Player (L) | 1,000 | -1,000 | 2,000 | 1번째 패배 → 더블 **마틴시작**|
| 16 | Player (L) | 2,000 | -2,000 | 4,000 | 2번째 패배 → 더블 |
| 17 | Player (T) | 4,000 | 0 | 4,000 | Tie → 시퀀스 유지 (베팅한 적 없는 것으로 간주) |
| 18 | Player (L) | 4,000 | -4,000 | | 8,000 | 3번째 패배 → 더블 |
| 19 | Player (L) | 8,000 | -8,000 | 16,000 | | 4번째 패배 → 더블 |
| 20 | Player (L) | 16,000 | -16,000 | 32,000 | 5번째 패배 → 더블 |
| 21 | Player (L) | 32,000 | -32,000 | 1,000 | 6번째 패배 → 시퀀스 포기 → 리셋 **마틴종료**|
| 22 | Banker (W) | 1,000 | +950 | 1,000 | 승리 → 리셋 |

핵심:
- **Tie**: 그 회차를 무시하고 동일 베팅으로 한 번 더 진행 (자본·시퀀스 모두 변화 없음).
- **승리**: 즉시 base 로 리셋.
- **N번째 연속 패배** (`martin_steps=5`): 시퀀스 포기, base 로 리셋. Tie 회차는 카운트 안 함.

`--no-martin-limit` 플래그를 주면 무한 더블링 (테이블 상한 또는 자본 한계까지).

## 설치 / 실행 환경

- Python 3.11+
- [uv](https://github.com/astral-sh/uv) 패키지 매니저

```bash
git clone <repo> bcc_sim
cd bcc_sim
uv sync         # 의존성 설치 (numpy, matplotlib, pytest)
```

## 사용법

### 기본 실행

```bash
uv run python main.py
```

옵션 없이 실행하면 기본값으로 5-마틴게일 데모가 돈다 (Banker, base 1,000원, 초기 1,000,000원 → 목표 2,000,000원, 테이블 상한 100,000원, 10,000 세션).

기본값으로 실행하면 결과가 매우 오래 걸린다 (세션 당 평균 3만+ 핸드).
빠른 검증을 위해서는 `--sessions 500` 정도로 시작 권장.

### 옵션 전체

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--strategy {flat,martingale}` | `martingale` | 베팅 전략 |
| `--side {player,banker}` | `banker` | 베팅 대상 |
| `--initial WON` | `1000000` | 시작 자본 (원) |
| `--target WON` | `2000000` | 목표 자본 (도달 시 WIN) |
| `--ruin WON` | `0` | 파산 임계 자본 (이하로 떨어지면 RUIN) |
| `--table-max WON` | `100000` | 테이블 베팅 상한 |
| `--base-bet WON` | `1000` | 기준 베팅 단위 |
| `--martin-steps N` | `5` | 마틴게일 최대 더블링 횟수 (N+1 번째 패배에서 reset) |
| `--no-martin-limit` | (off) | 마틴게일 reset 비활성화 — 무한 더블 |
| `--pivot` / `--no-pivot` | `--pivot` | 피벗 모드 (Banker 패배 시 Player 로 전환). `--no-pivot` 으로 한 사이드만 |
| `--sessions N` | `10000` | 시뮬레이션할 세션 수 |
| `--seed N` | `42` | 마스터 시드 (재현용) |
| `--n-decks N` | `8` | 슈에 들어갈 덱 수 |
| `--cut-offset N` | `14` | 슈 끝에 남겨두는 컷 카드 위치 |

모든 금액 입력은 **정수 원** (소수점 불가).

### 실행 예

5-마틴게일 데모 (가장 일반적인 사용, 500 세션으로 빠른 검증):
```bash
uv run python main.py --sessions 500
```

3-마틴게일 (더 보수적, 시퀀스 빨리 포기):
```bash
uv run python main.py --martin-steps 3 --sessions 500
```

마틴게일 무한 더블 (구식 마틴게일 — 테이블 상한까지 도달 빠름):
```bash
uv run python main.py --no-martin-limit --sessions 10000
```

피벗 비활성화 (한 사이드만 베팅, 구식 단방향 마틴게일):
```bash
uv run python main.py --no-pivot --sessions 500
```

기준선 비교를 위한 flat 베팅:
```bash
uv run python main.py \
  --strategy flat --side banker \
  --initial 1000000 --target 1001000 \
  --base-bet 1000 --sessions 500
```

Player 사이드 마틴게일 (Banker 보다 엣지가 더 큼):
```bash
uv run python main.py --side player --sessions 500
```

## 출력 읽는 법

```
바카라 시뮬레이션 결과
  세션 수: 500 | 전략: martingale(steps=5, pivot)(base=1,000원, side=banker)
  초기 자본: 1,000,000원 | 목표: 2,000,000원 | 파산: 0원 | 테이블 상한: 100,000원 | 시드: 42

                                               이론값         시뮬레이션
  하우스 엣지 (banker)                           -1.06%        -1.31%
  베팅 당 평균 수익률                                  n/a        -1.31%
  ------------------------------------------------------------
  승률 (목표 도달)                                   n/a         7.20%
  파산률                                          n/a        92.80%
  평균 최종 자본                              1,000,000원      157,324원
  평균 핸드 / 세션                                   n/a       23092.5
  평균 베팅 / 세션                                   n/a       20895.2
  최대 연속 패배 (p50/p95/max)                       n/a  13 / 17 / 23

  파산 사유:
    bet_exceeds_capital            464  (92.80%)

결론: martingale(steps=5, pivot) 을(를) banker 사이드에 적용해도 기대 수익은 음수다 (-1.31% / 베팅).
      92.80% 의 세션이 목표 자본 2,000,000원 에 도달하지 못하고 파산했다.
```

- **이론값 vs 시뮬레이션**: 이론 하우스 엣지와 시뮬레이션 측정 평균을 나란히 표시. 충분한 세션 수에서는 두 값이 ±0.3%p 이내로 수렴한다.
- **승률 / 파산률**: 합은 100% (모든 세션은 WIN 또는 RUIN 으로 종료).
- **최대 연속 패배 (p50/p95/max)**: 세션별 최장 연속 패배의 분포. 마틴게일이 시퀀스 포기를 하더라도 통계적으로 14연패 정도는 흔하다.
- **파산 사유**:
  - `bet_exceeds_capital` — 다음 베팅이 남은 자본 초과 (마틴게일 리셋이 작동해도 결국 base 베팅조차 못 함)
  - `bet_exceeds_table_max` — 다음 베팅이 테이블 상한 초과 (구식 무한 마틴게일에서 주로 발생)
  - `capital_depleted` — 베팅 후 자본이 ruin 임계 이하로 떨어짐
  - `both` — `bet_exceeds_table_max` 와 `bet_exceeds_capital` 동시 발생
- **결론**: 시뮬레이션 평균 수익률이 음수이면 고정 메시지 출력.

## 웹 인터페이스

CLI 와 거의 동일한 라이브 대시보드를 브라우저에서 실행할 수 있다. 좌측 **설정 프레임** 과 우측 **대시보드** 가 분리되어 있어 시뮬레이션을 보면서 옵션을 바꾸고 다시 시작할 수 있다.

```bash
uv run python -m bcc_sim.web                              # 기본 127.0.0.1:8000
uv run python -m bcc_sim.web --host 0.0.0.0 --port 8080   # LAN 공유 (경고 출력)
uv run python -m bcc_sim.web --reload                     # 개발용 자동 재시작
```

브라우저로 [http://localhost:8000](http://localhost:8000) 접속.

화면 구성:
- **좌측 Settings 패널**: CLI 옵션 전체를 폼으로 노출 (strategy, side, 자본 3종, 베팅, 마틴 steps/pivot, 슈, delay, auto-next, seed). `«` 버튼으로 접기 가능.
- **우측 Dashboard**: 자본 게이지(파산 ↔ 시작 ↔ 목표), 현재 자본, **누적 손익**, 현재 핸드 카드(P/B 풀 핸드, ♥♦는 빨강), 최근 핸드 12개, 세션 통계, 누계 (승/파산/진행).
- **컨트롤**: ▶ Apply & Start / ⏸ Pause / ▶ Resume / ⏭ Next Session / ⏹ Stop.

`auto next` 옵션은 CLI 의 `--auto` 와 같음. `delay (ms)` 는 `--hand-delay` 와 같음 (단위 ms).

**CLI 와 동일성**: 동일 시드·설정이면 카드·결과·자본 시퀀스가 byte-identical. 같은 `_derive_session_seeds` 와 `run_session_traced` 를 사용한다.

엔드포인트:
- `GET /api/defaults` — CLI 기본값과 동일한 설정 JSON (프론트 폼 초기값)
- `WS /ws/play` — 시뮬레이션 스트림 (`start`/`pause`/`resume`/`next_session`/`stop`)

자세한 실행/접속/사용법은 [docs/web_guide.md](docs/web_guide.md) 참조.

## 테스트

```bash
uv run pytest -v
```

전체 81 테스트 (66 코어 + 15 웹). 핵심 검증:
- 8덱 슈 무복원성, 결정론적 셔플
- Punto Banco 드로우 룰 전체 (Banker 3rd-card 표의 모든 row)
- 100k 핸드 → P/B/T 빈도가 이론(44.62/45.86/9.52%) ±1% 내
- 마틴게일 시퀀스 (LLLW → 1k,2k,4k,8k → 1k), Tie 시 시퀀스 유지
- **마틴게일 N번 더블링 리셋** (steps=5 → 1k,2k,4k,8k,16k,32k → 6번째 패배에서 reset)
- **피벗 모드**: Banker 패배 → Player 전환, Player 승리 → Banker 복귀, give-up → Banker 복귀
- 22-핸드 사용자 트레이스 전체 (피벗 + Tie + give-up 통합)
- Banker 0.95배 정수 floor, Player 1:1
- 세션 종료 4가지 RUIN 사유 분류
- 시드 분기 재현성, 이론 엣지 ±1% 수렴 (N=500)

## 프로젝트 구조

```
bcc_sim/
  __init__.py
  deck.py        # Card, Shoe (8덱, seeded shuffle, cut offset)
  baccarat.py    # Outcome, HandResult, play_hand (Punto Banco 룰)
  strategy.py    # Strategy Protocol, FlatBet, Martingale, payout_won
  session.py     # SessionConfig, SessionResult, run_session (cap 체크)
  runner.py      # ExperimentResult, run_experiment (집계, 시드 분기)
  report.py      # format_report (텍스트 표 출력, 원화)
  web/           # 웹 인터페이스 (FastAPI + WebSocket)
    server.py
    session_runner.py
    serialize.py
    __main__.py        # python -m bcc_sim.web
    static/            # index.html, style.css, app.js
tests/           # 81 테스트 (66 코어 + 15 웹)
main.py          # argparse CLI
_forAI/          # AI 작업 문맥 (계획·메모·이력)
```

## 핵심 설계 결정

상세 내역은 [_forAI/plan.md](_forAI/plan.md), [_forAI/memo.md](_forAI/memo.md) 참조.

- 자본은 모두 **정수 원** — Banker 0.95 커미션은 `(bet × 95) // 100` (카지노 룰처럼 분원은 하우스 보관).
- 베팅 상한 체크는 **Session** 레이어에서 (Strategy 는 순수 의도 베팅·사이드만 반환).
- 마틴게일은 **N번 더블링 + 피벗** 방식이 기본 — Banker 패배 시 Player 로 전환, 시퀀스 종료 시 Banker 복귀. `--no-pivot` 으로 단방향, `--no-martin-limit` 으로 무한 더블.
- Strategy 의 `side` 는 매 핸드마다 동적으로 변할 수 있음 (Protocol property). Session 이 베팅 직전 `strategy.side` 를 캡처해 payout 계산.
- 시드 분기: `random.Random(master).randrange(2**63) × N` — 세션 간 독립, 재현 가능.
- max_hands 안전망 없음 — 마틴게일에선 빠르게 RUIN 으로 수렴해 문제 없으나, flat-bet 대용량 시나리오는 매우 오래 걸릴 수 있다.

## 라이선스

TBD
