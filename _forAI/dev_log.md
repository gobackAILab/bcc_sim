# Dev Log

## 목차

- [2026-05-17](#2026-05-17)
- [2026-07-22](#2026-07-22)
  - [정적 웹 방향 결정](#정적-웹-방향-결정)
  - [React Vite TypeScript 구현](#react-vite-typescript-구현)
  - [Python 동등성 검증](#python-동등성-검증)
  - [브라우저 검증](#브라우저-검증)
  - [GitHub Pages 배포](#github-pages-배포)
  - [_forAI 전면 재정리](#_forai-전면-재정리)

## 2026-05-17

Python 기준 구현의 최초 제품화가 완료됐다.

- `_forAI` 표준 5개 문서 생성
- 실제 8덱 Shoe와 Punto Banco 규칙 구현
- Banker 95% 배당, Tie 보존, 정수 원화 확정
- Banker 우선 pivot martingale과 `martin_steps` 의미 확정
- 세션 엔진, 통계 runner, CLI live/stats 구현
- ANSI 고정 대시보드와 세션 로그 추가
- FastAPI + WebSocket 서버형 웹 및 Vanilla UI 추가
- 웹 설정 UI, pause/resume/next/stop, 누적 P&L 구현
- NES.css 기반 라이트 픽셀 UI와 PM2 운영 설정 추가
- Python 테스트 81개까지 확장

이 시기의 웹 문서는 모두 `bcc_sim/web/` Python 서버형 구현을 가리킨다. 당시 세부 작업 기록은 Git history와 기존 사용자 문서에 남아 있으며, 현재 `_forAI` 문서에서는 유지보수에 필요한 확정 규칙만 `memo.md`로 정리했다.

## 2026-07-22

### 정적 웹 방향 결정

GitHub Pages에서 설치 없이 시뮬레이터를 실행하기 위해 웹 구조를 재검토했다.

- React + Vite + TypeScript 채택
- 정적 build 자체는 Pages에 적합하며 Vite 개발 서버를 배포하는 구조가 아님을 확인
- Python 서버를 Pages에서 실행하려 하지 않고 엔진을 브라우저로 이식하기로 결정
- 기존 `main`과 성격이 다르므로 `static-web` 브랜치를 새로 만들고 독립 운영하기로 결정
- 결과 하드코딩과 간이 RNG를 사용하지 않고 Python 동등성을 테스트로 증명하기로 결정

### React Vite TypeScript 구현

- `web/`에 React/Vite/TypeScript 프로젝트 생성
- 카드·Shoe·Punto Banco·Flat/Martingale·세션 엔진 이식
- 한 핸드씩 실행 가능한 `SessionStepper` 추가
- JavaScript safe-integer 검증 추가
- Dedicated Web Worker와 typed command/event protocol 구현
- start/pause/resume/next/stop 및 auto-next 구현
- 설정 패널, 자본 게이지, 현재 카드, 최근 12핸드, 누적 통계 UI 구현
- Worker 로딩·runtime·message decoding 오류를 React 오류 상태로 전달
- `fetch`, WebSocket, 서버 저장소 없이 브라우저 메모리만 사용
- 정적 웹 버전은 `web/package.json`에서 Vite define으로 주입

### Python 동등성 검증

- CPython 3.11 integer-seed `random.Random` 호환 MT19937 구현
- 0, 음수, 53-bit 초과, 127/200-bit seed fixture 추가
- `getrandbits`, state boundary, `random`, `randrange(2**63)`, shuffle 검증
- Python 원본 엔진으로 end-to-end fixture 생성
- 파생 session seed, 모든 HandRecord, SessionResult를 TypeScript와 비교
- TypeScript 테스트 6 files / 81 tests 통과
- 기존 Python 테스트 7 files / 81 tests 통과
- `pnpm check`로 lint, test, type-check, production build 통과

### 브라우저 검증

Chrome DevTools MCP로 local preview와 최종 Pages 사이트를 검증했다.

- 입력 관계 검증 오류 확인
- start, pause, resume, next, stop 확인
- desktop/mobile 반응형 화면 확인
- seed 42의 첫 파생 세션이 Python fixture와 동일하게 8핸드, 최종 38,000원 RUIN으로 종료
- Worker resource 로드 확인
- console warning/error 없음
- local Lighthouse 접근성·Best Practices·SEO·Agentic Browsing 100점 확인

### GitHub Pages 배포

- 커밋 `8da4b6b` (`Add static web simulator`)
- `static-web`을 `origin/static-web`에 push
- `.github/workflows/deploy-pages.yml` 추가
- 첫 배포에서 Pages 미활성화로 `Configure Pages` 실패
- 저장소 Pages build type을 `workflow`로 활성화
- 자동 생성된 `github-pages` environment가 `static-web`을 차단한 문제 확인
- environment deployment policy에 `static-web` 브랜치 추가
- 재실행 Actions `29919166788` 성공
- 공개 URL <https://gobackailab.github.io/bcc_sim/> HTTP 200 및 실동작 확인
- draft PR #1 생성; 사용자 결정에 따라 병합·ready 전환 없이 유지

### _forAI 전면 재정리

사용자가 `forai-scaffold`를 명시적으로 요청하고 기존 문서 수정에 승인했다.

- 완료 시각: `2026-07-22 21:54:07 KST (UTC+09:00)`
- 표준 스크립트를 비파괴 실행해 5개 기존 문서 존재 확인
- 기존 문서가 Python/FastAPI 웹만 현재 웹으로 설명하는 정합성 문제 확인
- `README.md`, `inventory.md`, `memo.md`, `plan.md`, `dev_log.md` 전면 재작성
- Python 기준 구현과 TypeScript 정적 배포판의 역할 분리
- 현재 Windows 경로, `static-web` 정책, Pages URL, 실제 명령과 테스트 수 반영
- Python/정적 웹 version source가 독립이라는 사실 명시
- 배포·fixture·Worker·safe-integer 불변조건과 반복 금지 사항 정리
- 기존 2026-05-17 상세 일지는 현재 유지보수에 필요한 요약으로 압축
