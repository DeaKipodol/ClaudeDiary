# ClaudeDiary — Web

Express 기반 로컬 웹서버 버전. 브라우저에서 세션 뷰어를 엽니다.

---

## 실행

### 사전 요구사항
- [Node.js](https://nodejs.org/) 18 이상
- [Claude Code](https://docs.anthropic.com/ko/docs/claude-code) 최소 1회 실행 (세션 폴더 생성)

### 설치

```bash
cd web
npm install
npm start
```

브라우저가 자동으로 `http://localhost:3737` 을 엽니다.

> **nvm 사용 시**
> ```bash
> ~/.nvm/versions/node/$(nvm current)/bin/node server.js
> ```

---

## 실행파일 빌드 (선택)

Node.js 없이 실행 가능한 바이너리를 만들 수 있습니다 (`@yao-pkg/pkg` 사용).

```bash
# macOS (Apple Silicon)
npm run build:mac

# macOS (Intel)
npm run build:mac-intel

# Windows
npm run build:win

# Linux
npm run build:linux

# 전체
npm run build
```

빌드 결과는 `dist/` 폴더에 생성됩니다.

### macOS `.app` 번들 만들기

CLI 바이너리를 `.app` 형태로 감싸면 터미널 창 없이 더블클릭으로 실행됩니다.

```
ClaudeDiary.app/
└── Contents/
    ├── Info.plist          # 앱 메타데이터 (LSUIElement=true)
    └── MacOS/
        ├── launcher        # 쉘 스크립트 (서버 백그라운드 실행 + 브라우저 오픈)
        └── claudediary     # pkg로 만든 바이너리
```

상세 제작 과정은 루트 `BUILD.md`(선택) 참고.

---

## 설정

설정(⚙)에서 아래 항목 변경 가능:

| 항목 | 설명 |
|---|---|
| 테마 | 라이트 / 다크 |
| Claude 실행 경로 | 자동 감지 안 될 때 직접 지정 |
| 터미널 앱 | iTerm2 / Terminal.app / Warp (macOS) |
| 고정된 세션 | 고정 목록 관리 |

설정 저장 위치:
- macOS: `~/Library/Application Support/ClaudeDiary/settings.json`
- Windows: `%APPDATA%/ClaudeDiary/settings.json`
- Linux: `~/.config/ClaudeDiary/settings.json`

---

## 미구현

| 기능 | 상태 |
|---|---|
| Windows 터미널 자동 열기 | 🔲 |
| Linux 터미널 자동 열기 | 🔲 |
| 세션 삭제 | 🔲 |
| 세션 이름 편집 | 🔲 |
| 대화 내보내기 (MD/TXT) | 🔲 |
| 모바일 반응형 | 🔲 |

---

## 기술 스택

- Node.js + Express
- Vanilla JS / CSS (프레임워크 없음)
- SSE (Server-Sent Events) — 실시간 갱신
- `fs.watch()` — 파일 변경 감지
- `@yao-pkg/pkg` — 실행파일 빌드
