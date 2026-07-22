# Plan

## 목차

- [Current goal](#current-goal)
- [Current state](#current-state)
- [Completed milestones](#completed-milestones)
- [Near-term work](#near-term-work)
- [Decisions](#decisions)
- [Risks](#risks)
- [Definition of Done](#definition-of-done)

## Current goal

Python 기준 엔진과 결과가 일치하는 React/Vite/TypeScript 정적 시뮬레이터를 `static-web` 독립 브랜치에서 안정적으로 운영한다.

현재 우선순위는 기능 확대보다 다음 세 가지다.

1. Python과 TypeScript의 규칙·RNG 동등성을 깨뜨리지 않는다.
2. GitHub Pages 배포가 `static-web`에서 독립적으로 재현되게 유지한다.
3. Python 서버 웹과 정적 웹의 문서·운영 경계를 명확히 유지한다.

## Current state

- 브랜치: `static-web`, `origin/static-web` 추적
- `main` 병합: 하지 않음
- draft PR: `static-web → main`, 검토용으로만 유지
- 정적 웹 배포: <https://gobackailab.github.io/bcc_sim/>
- Pages: GitHub Actions build type, `static-web` 배포 허용
- 최신 제품 커밋: `8da4b6b`
- Python 검증: 81 tests 통과
- 정적 웹 검증: 81 tests + lint + TypeScript + Vite build 통과
- Chrome 실배포 검증: HTTP 200, Worker 로드, seed 42 세션 실행, console warn/error 없음

## Completed milestones

### Python baseline

- [x] 8덱 무복원 Shoe와 컷 오프셋
- [x] Punto Banco 전체 드로우 룰
- [x] Flat/Martingale, Banker commission, Tie 보존
- [x] 세션 종료와 4개 RUIN 사유
- [x] master seed → session seed 결정론
- [x] CLI live/stats와 ANSI 대시보드·로그
- [x] FastAPI/WebSocket 서버형 웹과 Vanilla UI
- [x] Python test suite 81개

### Static web

- [x] React/Vite/TypeScript 프로젝트
- [x] CPython 3.11 호환 integer-seed RNG
- [x] Python 규칙·전략·세션 엔진 포트
- [x] JavaScript safe-integer 검증
- [x] 한 핸드 단위 `SessionStepper`
- [x] Dedicated Web Worker와 typed protocol
- [x] pause/resume/next/stop/auto-next
- [x] 설정·자본·카드·통계·최근 핸드 반응형 UI
- [x] Python RNG 및 end-to-end golden fixtures
- [x] GitHub Pages Actions 배포
- [x] 공개 URL Chrome DevTools 검증

### Documentation

- [x] `_forAI` 표준 5개 문서를 두 런타임 기준으로 전면 재작성
- [x] `web/README.md`에 정적 웹 개발·검증·배포 설명
- [x] 기존 Python 웹 문서와 정적 웹 문서의 범위 분리

## Near-term work

사용자가 별도로 지시하기 전까지 아래 항목은 계획 후보이며 자동 착수하지 않는다.

1. `static-web`에서 추가 UX 피드백 반영
2. Python 코어 변경 시 fixture 재생성과 parity 회귀 확인
3. 정적 웹 설정 공유 또는 저장 기능 검토
4. stats mode의 브라우저 지원 여부 검토
5. root `readme.md`에 정적 웹 브랜치/공개 URL을 소개할지 결정
6. draft PR을 계속 유지할지 닫을지 결정

명시적으로 보류된 작업:

- `main` 병합
- PR ready 전환 또는 merge
- Python FastAPI 웹 제거
- 정적 웹을 Python 서버에 연결

## Decisions

- 정적 웹은 Vanilla가 아니라 React + Vite + TypeScript를 사용한다.
- Vite build 결과만 Pages에 배포한다. 배포 서버에서 Node.js를 실행하지 않는다.
- 계산은 브라우저 Worker에서 수행하고 UI 스레드와 분리한다.
- Python 엔진을 기준 구현으로 유지하며 TypeScript 결과를 fixture로 교차검증한다.
- 결과 하드코딩과 RNG 편법을 허용하지 않는다.
- `static-web`은 `main`과 성격이 달라 독립 브랜치로 운영한다.
- 기존 FastAPI 웹은 정적 웹과 공존한다.
- Python과 정적 웹의 version source는 현재 각각 독립이다.

## Risks

| 위험 | 현재 대응 |
|---|---|
| CPython RNG 소비 순서 이탈 | RNG fixture와 engine fixture 전체 비교 |
| Python/TS 기본값 drift | 두 DEFAULT_CONFIG와 parity case 검토 |
| JavaScript 정수 정밀도 | 모든 금액·카운터 safe-integer 검증 |
| 긴 세션의 UI 정지 | Dedicated Worker와 hand-step 실행 |
| Pages base path 오류 | Vite `base: '/bcc_sim/'` 고정 및 실URL 검증 |
| Pages 환경이 브랜치를 차단 | `github-pages` environment에 `static-web` 허용 |
| 두 웹 구현 문서 혼동 | root/docs는 Python 웹, `web/README.md`는 정적 웹으로 구분 |
| flat 또는 무한 martingale 장기 실행 | max_hands 없음이 확정 규칙임을 UI/문서에서 인지 |
| 브랜치 의도 훼손 | 사용자 승인 전 merge·ready 전환 금지 |

## Definition of Done

### Static web code change

- [ ] `cd web && pnpm check` 통과
- [ ] 규칙 변경이면 Python fixture parity 통과
- [ ] UI 변경이면 Chrome DevTools로 실제 컨트롤 확인
- [ ] console warn/error 확인
- [ ] 배포 대상 변경이면 Pages Actions와 공개 URL 확인

### Python core change

- [ ] `uv run pytest -q` 통과
- [ ] 정적 웹에 영향을 주는 shape/RNG/rule 변경 여부 판단
- [ ] 영향이 있으면 fixture 재생성과 `pnpm test` 수행

### Documentation change

- [x] 모든 `_forAI` 문서에 제목 바로 다음 `## 목차` 존재
- [x] 실제 경로·명령·브랜치·URL과 일치
- [x] Python 서버 웹과 정적 웹을 분리해서 설명
- [x] 완료 이력과 미래 계획을 서로 섞지 않음
- [ ] 사용자 요청 전 커밋·push하지 않음
