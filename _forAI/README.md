# _forAI Guide

## 목차

- [한 줄 요약](#한-줄-요약)
- [현재 기준선](#현재-기준선)
- [읽는 순서](#읽는-순서)
- [문서 역할](#문서-역할)
- [두 웹 구현의 관계](#두-웹-구현의-관계)
- [작업 시작 체크리스트](#작업-시작-체크리스트)
- [유지 규칙](#유지-규칙)

## 한 줄 요약

`bcc_sim`은 실제 슈와 Punto Banco 규칙으로 마틴게일의 위험을 보여주는 교육용 바카라 시뮬레이터이며, 이 디렉터리는 Python 원본과 `static-web` TypeScript 배포판을 함께 유지하기 위한 AI 작업 기준서다.

## 현재 기준선

- 저장소: `C:\works\bcc_sim`
- 현재 작업 브랜치: `static-web`
- 기준 커밋: `8da4b6b` (`Add static web simulator`)
- 브랜치 정책: `main`과 병합하지 않고 당분간 `static-web`을 독립 운영한다.
- Python 런타임: CLI + FastAPI/WebSocket 웹, Python 3.11+, `uv`
- 정적 웹 런타임: React 19 + Vite 8 + TypeScript 6 + Web Worker, Node.js 24 + pnpm 11.1.0
- 공개 사이트: <https://gobackailab.github.io/bcc_sim/>
- 정적 웹 배포: `static-web` push → GitHub Actions → GitHub Pages
- 검증 기준:
  - Python: 81 tests
  - TypeScript: 81 tests, lint, type-check, production build
  - Python fixture와 TypeScript 엔진의 핸드별 결과 동등성

## 읽는 순서

1. [README.md](README.md) — 현재 기준과 문서 지도
2. [inventory.md](inventory.md) — 실제 파일 구조, 엔트리포인트, 명령
3. [memo.md](memo.md) — 확정 도메인 규칙과 구현 불변조건
4. [dev_log.md](dev_log.md) — 날짜별 변경 이력
5. [plan.md](plan.md) — 현재 목표, 다음 작업, 위험

## 문서 역할

| 문서 | 기록 대상 | 기록하지 않는 것 |
|---|---|---|
| `README.md` | 현재 기준선, 읽는 순서, 문서 운영 규칙 | 상세 파일 목록과 작업 일지 |
| `inventory.md` | 현재 저장소에 존재하는 구조·명령·엔트리포인트 | 미래 계획 |
| `memo.md` | 룰, 기본값, 동등성 조건, 반복 금지 사항 | 날짜별 작업 내역 |
| `dev_log.md` | 완료된 작업과 검증 결과 | 미확정 아이디어 |
| `plan.md` | 현재 목표, 다음 작업, 결정, 위험 | 과거 작업의 상세 서술 |

## 두 웹 구현의 관계

저장소에는 성격이 다른 웹 구현이 공존한다.

1. `bcc_sim/web/`: Python FastAPI + WebSocket 서버와 Vanilla UI다. Python 코어를 직접 호출하는 서버형 구현이며 로컬·PM2 운영 자산이다.
2. `web/`: Python 엔진을 TypeScript로 이식한 React/Vite 정적 앱이다. 브라우저 Web Worker 안에서 계산하며 서버 API와 WebSocket을 사용하지 않는다.

`static-web`의 제품 배포 대상은 두 번째 구현이다. 첫 번째 구현은 삭제하거나 정적 앱의 런타임 의존성으로 연결하지 않는다. Python 코어는 규칙의 기준 구현이자 fixture 생성 원본으로 계속 사용한다.

## 작업 시작 체크리스트

1. `git branch --show-current`로 브랜치가 `static-web`인지 확인한다.
2. `git status -sb`로 사용자 변경과 문서 변경을 구분한다.
3. Python 코어 변경이면 `uv run pytest -q`를 실행한다.
4. 정적 웹 변경이면 `cd web && pnpm check`를 실행한다.
5. 규칙·RNG·직렬화 shape 변경이면 Python fixture를 재생성하고 TypeScript parity test를 실행한다.
6. Pages 배포는 `static-web`에 push한 뒤 Actions와 공개 URL을 모두 확인한다.

## 유지 규칙

- 실제 구조가 바뀌면 `inventory.md`를 먼저 갱신한다.
- 도메인 규칙이나 구현 불변조건은 `memo.md`에 기록한다.
- 완료된 작업은 날짜와 검증 결과를 `dev_log.md`에 남긴다.
- 현재 할 일만 `plan.md`에 둔다.
- `_forAI` 문서는 사용자의 명시적 요청이 있을 때만 수정한다.
- `main` 병합, PR ready 전환, 정적 웹 브랜치 변경은 사용자 지시 없이 수행하지 않는다.
