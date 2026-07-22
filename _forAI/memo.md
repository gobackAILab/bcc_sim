# Memo

## 목차

- [제품 원칙](#제품-원칙)
- [바카라 규칙](#바카라-규칙)
- [마틴게일 규칙](#마틴게일-규칙)
- [세션 종료 규칙](#세션-종료-규칙)
- [기본 설정](#기본-설정)
- [결정론과 Python 동등성](#결정론과-python-동등성)
- [정적 웹 런타임 원칙](#정적-웹-런타임-원칙)
- [Python 서버 웹 원칙](#python-서버-웹-원칙)
- [버전과 문서 경계](#버전과-문서-경계)
- [반복 금지](#반복-금지)

## 제품 원칙

- 목적은 도박 자동화가 아니라 마틴게일의 위험을 실제 카드 진행으로 보여주는 교육용 시뮬레이션이다.
- 통계 수치만 제시하지 않고 카드, 베팅, 자본 변화를 핸드 단위로 보여준다.
- 결과를 원하는 방향으로 맞추는 하드코딩을 금지한다. 모든 결과는 규칙 엔진과 seed에서 계산한다.
- 동일한 설정과 seed는 재현 가능한 결과를 내야 한다.
- Python은 기준 구현이고 TypeScript는 독립 실행 가능한 포트다. 정적 웹이 Python 서버를 원격 호출하는 구조가 아니다.

## 바카라 규칙

### 카드와 슈

- A=1, 2~9=액면, 10/J/Q/K=0이다.
- 합계는 일의 자리만 사용한다.
- 기본 슈는 8덱 416장이며 무복원으로 뽑는다.
- 컷 오프셋 기본값은 14장이다. 컷 기준에 도달하면 새 슈를 셔플한다.

### Punto Banco 드로우

- Player와 Banker가 각각 두 장을 받는다.
- 어느 한쪽이 8 또는 9 natural이면 추가 카드를 뽑지 않는다.
- Player 0~5 draw, 6~7 stand다.
- Player가 stand하면 Banker 0~5 draw, 6~7 stand다.
- Player가 draw하면 Banker는 표준 third-card table을 따른다.
  - Banker 0~2: 항상 draw
  - Banker 3: Player third card가 8이 아니면 draw
  - Banker 4: Player third card가 2~7이면 draw
  - Banker 5: Player third card가 4~7이면 draw
  - Banker 6: Player third card가 6~7이면 draw
  - Banker 7: stand

### 배당과 Tie

- Player 적중 수익은 베팅액의 1배다.
- Banker 적중 수익은 `(bet_won * 95) // 100`이다. 5% 커미션과 정수 floor를 유지한다.
- Tie에는 배팅 수익·손실이 없다.
- Tie는 마틴게일 승패 카운터, 현재 side, 손실 연속 수를 변경하지 않는다.
- Tie 전용 베팅은 지원하지 않는다.

## 마틴게일 규칙

- 기본 primary side는 Banker다.
- `pivot=true`에서 primary가 패하면 반대 side로 전환하고 마틴 구간이 끝날 때까지 유지한다.
- 승리하면 즉시 base bet과 primary side로 돌아간다.
- `martin_steps=N`은 N번 더블링을 허용한다는 뜻이다. 총 N+1번 베팅 후에도 패하면 give-up하고 base로 돌아간다.
- 기본 `martin_steps=5`의 금액은 `1k → 2k → 4k → 8k → 16k → 32k`다.
- `martin_steps=null`은 전략 레벨에서는 무한 더블링이지만 자본·테이블 상한 종료조건은 계속 적용된다.
- `pivot=false`에서는 primary side를 바꾸지 않는 classic martingale이다.
- flat 전략은 같은 금액과 side를 유지한다.

## 세션 종료 규칙

- `capital >= target_won`: `WIN`
- `capital <= ruin_won`: `RUIN / capital_depleted`
- 다음 베팅이 자본 초과: `RUIN / bet_exceeds_capital`
- 다음 베팅이 테이블 상한 초과: `RUIN / bet_exceeds_table_max`
- 두 조건 동시 초과: `RUIN / both`
- `max_hands` 안전망은 없다. 이 결정은 Python과 TypeScript 모두 동일하다.
- 한 세션은 독립된 seed와 슈 상태를 가진다.
- master seed에서 세션 seed를 `random.Random(master).randrange(2**63)` 순서로 파생한다.

## 기본 설정

| 항목 | 값 |
|---|---:|
| initial | 100,000원 |
| target | 500,000원 |
| ruin | 50,000원 |
| base bet | 1,000원 |
| table max | 100,000원 |
| strategy | martingale |
| primary side | Banker |
| martin steps | 5 |
| pivot | true |
| decks | 8 |
| cut offset | 14 |
| master seed | 42 |
| browser hand delay | 50ms |
| browser auto next | false |

Python CLI의 live delay 기본값은 초 단위 옵션이며 브라우저 playback 설정과 같은 필드가 아니다.

## 결정론과 Python 동등성

정적 웹 포트의 신뢰성은 “비슷한 분포”가 아니라 record-level parity를 기준으로 한다.

- [pythonRandom.ts](../web/src/sim/pythonRandom.ts)는 CPython 3.11의 정수 seed 초기화와 MT19937 소비 순서를 재현한다.
- fixture는 53-bit를 넘는 양수·음수 seed, `getrandbits`, state boundary, `random`, `randrange`, shuffle을 포함한다.
- engine fixture는 파생 session seed, config, 모든 `HandRecord`, 최종 `SessionResult`를 저장한다.
- TypeScript 필드 shape는 Python `bcc_sim.web.serialize`의 snake_case JSON shape와 맞춘다.
- 규칙·RNG·seed 파생·직렬화가 바뀌면 fixture를 CPython 3.11에서 재생성해야 한다.
- fixture JSON은 테스트 기준 데이터다. UI 결과를 만들기 위한 런타임 데이터로 사용하지 않는다.
- `Math.random()`으로 대체하지 않는다.

## 정적 웹 런타임 원칙

- React는 입력과 표시만 담당하고 시뮬레이션 계산은 Dedicated Web Worker에서 수행한다.
- Worker와 UI는 [protocol.ts](../web/src/worker/protocol.ts)의 typed command/event로만 통신한다.
- Worker는 핸드 하나씩 `SessionStepper.step()`을 호출하므로 pause/stop이 실제 계산 경계에서 작동한다.
- `pause`는 다음 핸드 전에 멈추며 이미 전송된 핸드는 취소하지 않는다.
- `next_session`은 `auto_next=false`의 세션 종료 대기 상태를 해제한다.
- 설정 검증은 [validation.ts](../web/src/sim/validation.ts)를 단일 출처로 사용한다.
- 금액은 UI 편의를 위해 `number`지만 모든 연산 입력·결과가 JavaScript safe integer인지 검사한다.
- 정적 웹은 서버 API, WebSocket, 인증, 저장소를 사용하지 않는다.
- `web/dist/`는 빌드 산출물이며 커밋하지 않는다.

## Python 서버 웹 원칙

- `bcc_sim/web/`은 FastAPI + WebSocket 기반의 별도 서버형 UI다.
- Python 코어를 직접 재사용하므로 Python CLI와 구조적으로 같은 세션 엔진을 호출한다.
- pause/resume/next/stop 메시지 처리를 위해 `asyncio.sleep(0)`도 생략하지 않는다.
- 서버 웹의 `DEFAULT_CONFIG`를 바꾸면 CLI 기본값과 테스트를 함께 확인한다.
- PM2 설정과 포트 21037은 이 서버형 구현에만 해당한다.
- Pages 배포를 위해 FastAPI 서버나 PM2를 사용하지 않는다.

## 버전과 문서 경계

- Python 버전은 `pyproject.toml`이 기준이다.
- 정적 웹 버전은 `web/package.json`이 기준이다.
- 현재 둘 다 `0.1.0`이지만 자동 동기화되지 않는다. 릴리스 정책이 정해지기 전까지 동일해야 한다고 가정하지 않는다.
- root `readme.md`와 `docs/web_guide.md`는 Python CLI/FastAPI 문서다.
- 정적 웹의 실행·배포 문서는 `web/README.md`다.
- `static-web`은 `main`과 성격이 다른 독립 브랜치다. 사용자 승인 전 병합하거나 PR을 ready로 전환하지 않는다.

## 반복 금지

- 카드 추출을 복원 추출이나 `Math.random()`으로 단순화하지 않는다.
- Banker 커미션 floor와 Tie 상태 보존을 누락하지 않는다.
- 마틴게일 결과나 seed별 결과를 UI에 하드코딩하지 않는다.
- Python과 TypeScript의 RNG 호출 순서를 임의로 바꾸지 않는다.
- fixture가 실패할 때 기대 JSON만 고쳐 통과시키지 않는다. Python 기준과 구현 차이를 먼저 조사한다.
- Worker 계산을 React 메인 스레드로 옮기지 않는다.
- 정적 웹에 불필요한 백엔드 호출을 추가하지 않는다.
- 서버 웹과 정적 웹의 실행법·기본값·배포법을 한 구현처럼 섞어 쓰지 않는다.
- `web/vite.config.ts`의 `/bcc_sim/` base를 저장소명 확인 없이 바꾸지 않는다.
- `pm2 kill` 또는 `pm2 delete all`처럼 다른 앱까지 영향을 주는 명령을 사전 승인 없이 실행하지 않는다.
- `_forAI` 문서는 코드 작업의 부수 효과로 자동 수정하지 않는다.
