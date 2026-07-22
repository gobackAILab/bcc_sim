# Inventory

## 목차

- [Repository](#repository)
- [Top-level structure](#top-level-structure)
- [Python implementation](#python-implementation)
- [Static web implementation](#static-web-implementation)
- [Tests and parity fixtures](#tests-and-parity-fixtures)
- [Build and validation commands](#build-and-validation-commands)
- [Runtime and deployment](#runtime-and-deployment)
- [Version and defaults](#version-and-defaults)
- [Known boundaries](#known-boundaries)

## Repository

- 이름: `bcc-sim`
- 로컬 경로: `C:\works\bcc_sim`
- 원격 저장소: `gobackAILab/bcc_sim`
- 기본 브랜치: `main`
- 현재 제품 브랜치: `static-web` (독립 운영, 미병합)
- 정적 웹 URL: <https://gobackailab.github.io/bcc_sim/>
- 목적: 실제 카드 슈 기반 바카라를 재현하고 마틴게일 전략의 손실 위험을 라이브 진행과 통계로 보여주는 교육용 시뮬레이터

## Top-level structure

| 경로 | 역할 |
|---|---|
| [main.py](../main.py) | Python CLI 엔트리포인트, `live`/`stats` 모드 |
| [bcc_sim/](../bcc_sim) | Python 규칙·전략·세션 엔진과 FastAPI 웹 |
| [tests/](../tests) | Python 코어 및 FastAPI/WebSocket 테스트 |
| [web/](../web) | React/Vite/TypeScript 정적 웹 애플리케이션 |
| [scripts/](../scripts) | Python 기준 fixture 생성기 |
| [.github/workflows/deploy-pages.yml](../.github/workflows/deploy-pages.yml) | 정적 웹 검증 및 GitHub Pages 배포 |
| [docs/web_guide.md](../docs/web_guide.md) | Python FastAPI 웹 사용 가이드; 정적 웹 가이드가 아님 |
| [readme.md](../readme.md) | Python CLI/FastAPI 중심 사용자 문서 |
| [web/README.md](../web/README.md) | 정적 웹 개발·검증·배포 문서 |
| [pyproject.toml](../pyproject.toml) / [uv.lock](../uv.lock) | Python 패키지·의존성 잠금 |
| [web/package.json](../web/package.json) / [web/pnpm-lock.yaml](../web/pnpm-lock.yaml) | 정적 웹 패키지·의존성 잠금 |
| [ecosystem.config.cjs](../ecosystem.config.cjs) | Python FastAPI 웹의 PM2 운영 설정; Pages에는 사용하지 않음 |
| `_forAI/` | AI 작업 문맥 표준 문서 세트 |

## Python implementation

### Core

| 파일 | 역할 |
|---|---|
| [bcc_sim/deck.py](../bcc_sim/deck.py) | `Card`, 8덱 기본 `Shoe`, 무복원 셔플, 컷 오프셋 |
| [bcc_sim/baccarat.py](../bcc_sim/baccarat.py) | Punto Banco 드로우 룰과 핸드 판정 |
| [bcc_sim/strategy.py](../bcc_sim/strategy.py) | Flat/Martingale, pivot, Banker 95% 배당 |
| [bcc_sim/session.py](../bcc_sim/session.py) | 세션 종료조건, `HandRecord`, traced 실행 |
| [bcc_sim/runner.py](../bcc_sim/runner.py) | master seed에서 세션 seed 파생, 다중 세션 통계 |
| [bcc_sim/report.py](../bcc_sim/report.py) | CLI 배너·대시보드·로그·리포트 포맷 |
| [bcc_sim/__init__.py](../bcc_sim/__init__.py) | Python 패키지 버전 노출 |

### Server web

| 파일 | 역할 |
|---|---|
| [bcc_sim/web/__main__.py](../bcc_sim/web/__main__.py) | `python -m bcc_sim.web` 실행 |
| [bcc_sim/web/server.py](../bcc_sim/web/server.py) | FastAPI routes, WebSocket, static mount |
| [bcc_sim/web/session_runner.py](../bcc_sim/web/session_runner.py) | 서버 측 세션 실행과 컨트롤 처리 |
| [bcc_sim/web/serialize.py](../bcc_sim/web/serialize.py) | Python 객체 ↔ JSON shape, 서버 웹 기본값 |
| [bcc_sim/web/static/](../bcc_sim/web/static) | 서버형 Vanilla HTML/CSS/JS UI |

## Static web implementation

### Architecture

```text
React UI
   ↕ typed postMessage
Dedicated Web Worker
   ↕ direct function calls
TypeScript simulation core
```

### Files

| 경로 | 역할 |
|---|---|
| [web/src/App.tsx](../web/src/App.tsx) | 설정 폼, 대시보드, 컨트롤, 최근 핸드 |
| [web/src/hooks/useSimulation.ts](../web/src/hooks/useSimulation.ts) | Worker 수명주기와 React 상태 reducer |
| [web/src/worker/protocol.ts](../web/src/worker/protocol.ts) | Worker command/event 단일 타입 정의 |
| [web/src/worker/simulator.worker.ts](../web/src/worker/simulator.worker.ts) | 세션 seed 파생, 핸드별 실행, pause/resume/next/stop |
| [web/src/sim/pythonRandom.ts](../web/src/sim/pythonRandom.ts) | CPython 3.11 정수 seed `random.Random` 호환 MT19937 |
| [web/src/sim/baccarat.ts](../web/src/sim/baccarat.ts) | 카드·슈·Punto Banco 룰 |
| [web/src/sim/strategy.ts](../web/src/sim/strategy.ts) | Flat/Martingale 전략과 배당 |
| [web/src/sim/session.ts](../web/src/sim/session.ts) | 한 핸드 단위 `SessionStepper`와 traced 실행 |
| [web/src/sim/types.ts](../web/src/sim/types.ts) | 설정·핸드·결과 타입과 정적 웹 기본값 |
| [web/src/sim/validation.ts](../web/src/sim/validation.ts) | 관계 검증과 JavaScript safe-integer 경계 |
| [web/vite.config.ts](../web/vite.config.ts) | `/bcc_sim/` base와 package version 주입 |

정적 앱은 실행 중 `fetch`, WebSocket, Python 서버를 호출하지 않는다. 설정과 결과는 React/Worker 메모리에만 있고 새로고침 시 초기화된다.

## Tests and parity fixtures

### Python

- 테스트 위치: [tests/](../tests)
- 현재 기준: 7 files, 81 tests
- 코어 66 + FastAPI/직렬화 15

### TypeScript

- 테스트 위치: `web/src/sim/*.test.ts`
- 현재 기준: 6 files, 81 tests
- 규칙·전략·세션·검증·RNG·Python end-to-end parity를 검증한다.

### Fixtures

| 파일 | 생성기 | 검증 대상 |
|---|---|---|
| [web/src/sim/fixtures/python-random.json](../web/src/sim/fixtures/python-random.json) | [scripts/generate_rng_fixture.py](../scripts/generate_rng_fixture.py) | CPython 3.11 RNG, state boundary, shuffle, `randrange(2**63)` |
| [web/src/sim/fixtures/python-engine.json](../web/src/sim/fixtures/python-engine.json) | [scripts/generate_engine_fixture.py](../scripts/generate_engine_fixture.py) | 파생 seed, 전체 HandRecord, SessionResult |

## Build and validation commands

### Python

```powershell
uv sync
uv run pytest -q
uv run python main.py
uv run python main.py --mode stats --sessions 10000
uv run python -m bcc_sim.web
```

### Static web

```powershell
cd web
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm preview
```

`pnpm check`는 `oxlint .` → `vitest run` → `tsc -b && vite build` 순서로 실행한다. 산출물은 `web/dist/`이며 Git에서 제외된다.

### Fixture regeneration

저장소 루트의 CPython 3.11 환경에서 실행한다.

```powershell
uv run python scripts/generate_rng_fixture.py
uv run python -m scripts.generate_engine_fixture
cd web
pnpm test
```

## Runtime and deployment

### Python server web

```powershell
uv run python -m bcc_sim.web                  # 127.0.0.1:8000
uv run python -m bcc_sim.web --host 0.0.0.0 --port 8080
```

Linux PM2 운영 자산은 포트 `21037`과 `pm2-start.sh`/`pm2-stop.sh`를 사용한다. 이 경로는 정적 Pages 배포와 독립이다.

### GitHub Pages

- workflow trigger: `static-web`의 `web/**` 또는 workflow 파일 변경, 수동 실행
- runner: Ubuntu, Node.js 24, pnpm 11.1.0
- pipeline: frozen install → `pnpm check` → Pages artifact upload → deploy
- Pages build type: GitHub Actions
- `github-pages` environment에서 `static-web` 브랜치를 배포 허용
- 공개 URL: <https://gobackailab.github.io/bcc_sim/>

## Version and defaults

- Python version source: `pyproject.toml`의 `project.version`
- 정적 웹 version source: `web/package.json`의 `version`
- 두 값은 현재 모두 `0.1.0`이지만 자동으로 서로 연결되어 있지 않다.
- Python 서버 웹 기본값: `bcc_sim/web/serialize.py::DEFAULT_CONFIG`
- 정적 웹 기본값: `web/src/sim/types.ts::DEFAULT_CONFIG`
- Python/정적 웹 기본값은 fixture와 parity test로 의미상 일치 여부를 확인한다.

## Known boundaries

- `main`에는 정적 웹 커밋이 병합되지 않았다.
- 정적 웹은 live session UI만 제공하며 Python CLI의 대규모 stats 모드는 제공하지 않는다.
- 정적 웹에는 결과 저장, 로그 다운로드, URL 공유 설정, PWA/offline cache가 없다.
- GitHub Pages는 정적 파일만 서비스한다. Node/Vite/Python 프로세스는 배포 환경에서 실행되지 않는다.
- root `readme.md`와 `docs/web_guide.md`의 “웹”은 Python FastAPI 구현을 가리킨다. 정적 웹은 `web/README.md`를 기준으로 한다.
