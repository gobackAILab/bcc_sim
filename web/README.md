# BCC-SIM 정적 웹

기존 Python BCC-SIM의 바카라 세션 엔진을 TypeScript로 옮겨, 브라우저에서 직접 실행하는 React 기반 정적 시뮬레이터다. 정적 파일만 배포하므로 GitHub Pages에서 별도의 Python·Node 백엔드 없이 실행할 수 있다.

## 개발과 검증

Node.js 24와 pnpm 11.1.0을 기준으로 한다. 저장소 루트에서 `web` 디렉터리로 이동한 뒤 실행한다.

```bash
cd web
pnpm install
pnpm dev
```

검증 명령은 다음과 같다.

```bash
pnpm test
pnpm build
pnpm check
```

- `pnpm test`: Vitest 테스트를 한 번 실행한다.
- `pnpm build`: TypeScript 프로젝트를 검사하고 Vite 정적 산출물을 `dist/`에 생성한다.
- `pnpm check`: lint, test, build를 순서대로 모두 실행한다.

## 구조

```text
React UI
  ↕ postMessage
Web Worker
  ↕ 함수 호출
TypeScript simulation core
```

- React UI는 설정 입력, 실행 제어, 현재 핸드와 누적 통계 표시를 담당한다.
- Web Worker는 세션 실행, 일시정지·재개·중지, 다음 세션 진행을 담당한다. 계산을 메인 UI 스레드와 분리하며 React와는 typed message protocol로 통신한다.
- TypeScript core는 카드와 슈, 바카라 판정, flat/martingale 전략, 세션 상태 전이를 구현한다.

시뮬레이션 중 HTTP API, WebSocket, Python 서버를 호출하지 않는다. 최초 HTML·CSS·JavaScript 파일을 받은 뒤의 계산은 브라우저 안에서만 수행되므로 백엔드와 네트워크 연결이 필요 없다.

현재 설정과 실행 결과는 React 및 Web Worker 메모리에만 존재한다. `localStorage`, IndexedDB 또는 서버 저장은 구현되어 있지 않으므로 페이지를 새로고침하거나 탭을 닫으면 초기화된다.

## GitHub Pages

Vite의 base path는 저장소 Pages 경로에 맞춰 `/bcc_sim/`으로 설정되어 있다. `static-web` 브랜치의 `web/**` 변경이 push되면 GitHub Actions가 `pnpm check`를 통과한 `web/dist`를 Pages artifact로 배포한다.

Pages는 빌드 결과인 HTML·CSS·JavaScript만 서비스한다. 배포 환경에서 Vite나 Node.js 서버가 실행되는 구조가 아니다.

## Python 결과와의 호환성

TypeScript RNG는 CPython 3.11의 정수 seed 기반 `random.Random` 동작을 재현한다. RNG 단위 fixture와 Python 엔진 end-to-end fixture로 seed, 셔플, 세션 결과 및 핸드 이력을 교차 검증한다.

fixture를 다시 만들 때는 **CPython 3.11 환경에서 저장소 루트**에서 다음 명령을 실행한다.

```bash
uv run python scripts/generate_rng_fixture.py
uv run python -m scripts.generate_engine_fixture
```

생성 후 `cd web && pnpm test`로 TypeScript 구현과 fixture의 일치 여부를 확인한다.
