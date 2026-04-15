# ClaudeDiary

> A local diary for your Claude Code conversations.

Claude Code로 작업한 세션 기록을 한눈에 보고 바로 재개할 수 있는 로컬 뷰어입니다.

---

## 두 가지 버전

이 레포는 **같은 문제를 두 가지 아키텍처로** 구현합니다.

```
ClaudeDiary/
├── web/          → Express 기반 로컬 웹서버 버전
└── desktop/      → Electron 기반 네이티브 데스크톱 앱 버전 (진행 중)
```

| | web/ | desktop/ |
|---|---|---|
| 실행 방식 | 터미널에서 `npm start` | 앱 더블클릭 |
| 진입점 | 브라우저 (localhost:3737) | 독립 창 |
| 필요 환경 | Node.js 설치 | 없음 (앱에 내장) |
| 대상 | 개발자 / 커스터마이징 | 일반 사용자 |
| 빌드 산출물 | `pkg` 바이너리 (옵션) | `.app` / `.exe` / `.AppImage` |

---

## 주요 기능

- 세션 카드 뷰 + 프로젝트 필터링
- 디테일 패널 — 대화 내용 스크롤 로드
- 터미널에서 세션 재개 (iTerm2 / Terminal.app / Warp)
- 실시간 새 세션 감지 (SSE)
- 검색 (`⌘K`)
- 세션 고정(Pin)
- 라이트 / 다크 모드

---

## 사용 방법

각 버전 폴더의 README를 참고하세요.

- **웹 서버 버전** → [`web/README.md`](web/README.md)
- **데스크톱 앱 버전** → `desktop/README.md` (준비 중)

---

## 세션 데이터 위치

Claude Code는 세션을 JSONL로 아래 경로에 저장합니다.

```
~/.claude/projects/<인코딩된-프로젝트-경로>/<세션-UUID>.jsonl
```

이 앱은 해당 폴더를 **로컬에서 직접** 읽습니다. 외부 서버 전송 없음.

---

## 라이선스

MIT
