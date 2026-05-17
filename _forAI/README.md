# _forAI Guide

## 목차

- [한 줄 요약](#한-줄-요약)
- [읽는 순서](#읽는-순서)
- [문서 역할](#문서-역할)
- [현재 스냅샷](#현재-스냅샷)
- [프로젝트 목적 한 줄](#프로젝트-목적-한-줄)
- [유지 규칙](#유지-규칙)

## 한 줄 요약

이 디렉터리는 `bcc_sim` (바카라 확률·이율 시뮬레이터) 작업을 이어받을 때 필요한 AI 작업 문맥을 정리해 두는 곳이다.

## 읽는 순서

1. `README.md`
2. `inventory.md`
3. `memo.md`
4. `dev_log.md`
5. `plan.md`

## 문서 역할

- `inventory.md`: 저장소에 실제로 있는 구조, 엔트리포인트, 빌드/검증 명령을 기록한다.
- `plan.md`: 앞으로 진행할 개발 계획과 우선순위만 기록한다.
- `memo.md`: 바카라 규칙, 마틴게일 베팅 룰, 카드덱 구성 같은 도메인 참고 메모를 모은다.
- `dev_log.md`: 날짜별 작업 이력과 `_forAI` 정리 내역을 남긴다.

## 현재 스냅샷

- 저장소 경로: `/home/gbagent02/works/bcc_sim`
- 대상 플랫폼: Python 3.11 (uv 관리)
- 현재 버전: 0.1.0 — Phase 0~7 완료 + **Phase 9: 웹 인터페이스** 완료
- 메인 엔트리포인트:
  - CLI: [main.py](../main.py) — argparse, 두 모드 (live / stats)
  - 웹: `python -m bcc_sim.web` ([bcc_sim/web/__main__.py](../bcc_sim/web/__main__.py)) — FastAPI + WebSocket
- 테스트: **81/81 통과** (66 코어 + 15 웹) ([tests/](../tests/))
- 의존성:
  - 런타임: numpy, matplotlib, tqdm, **fastapi, uvicorn[standard]**
  - dev: pytest, **httpx** (TestClient)
- 사용자 문서: [readme.md](../readme.md) + [docs/web_guide.md](../docs/web_guide.md) (웹 실행/접속/사용법)

## 프로젝트 목적 한 줄

실제 카드덱으로 바카라를 시뮬레이션하여, 마틴게일(2배 베팅) 룰을 비롯한 "필승 베팅 전략" 의 허구성을 통계적으로 증명한다.

## 유지 규칙

- 계획이 아닌 참고 정보는 `plan.md`가 아니라 `memo.md`에 둔다.
- 저장소 구조나 실행 명령이 바뀌면 `inventory.md`를 먼저 갱신한다.
- 작업 이력은 날짜를 붙여 `dev_log.md`에만 남긴다.
- 새 작업을 시작할 때는 `inventory.md`와 `memo.md`를 먼저 읽고, 실제 할 일은 `plan.md`에서 확인한다.
