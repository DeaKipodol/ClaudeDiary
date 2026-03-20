# ClaudeDiary

Claude Code로 작업한 세션 기록을 한눈에 보고 바로 재개할 수 있는 로컬 웹 뷰어입니다.

![screenshot](https://github.com/user-attachments/assets/placeholder)

## 주요 기능

- **세션 카드 뷰** — 모든 Claude Code 세션을 카드 그리드로 표시
- **프로젝트 필터** — 좌측 사이드바에서 프로젝트별 필터링
- **디테일 패널** — 카드 클릭 시 우측 패널에서 대화 내용 확인 (스크롤로 전체 로드)
- **터미널에서 열기** — 클릭 한 번으로 iTerm2 / Terminal.app / Warp에서 세션 재개
- **실시간 감지** — 새 세션 생성 시 자동으로 목록 갱신 (SSE)
- **검색** — ⌘K로 세션 제목·프로젝트·대화 내용 검색
- **고정(Pin)** — 자주 쓰는 세션을 목록 최상단에 고정
- **라이트 / 다크 모드** — 설정에서 전환

---

## 설치 및 실행

### 사전 요구사항

- [Node.js](https://nodejs.org/) 18 이상
- [Claude Code](https://docs.anthropic.com/ko/docs/claude-code) 설치 및 최소 1회 실행 (세션 폴더 생성 필요)

---

### macOS

```bash
# 1. 저장소 클론
git clone https://github.com/YOUR_USERNAME/claude-session-viewer.git
cd claude-session-viewer

# 2. 의존성 설치
npm install

# 3. 서버 시작
npm start
```

브라우저가 자동으로 `http://localhost:3737` 을 엽니다.

> **nvm 사용 시** `node` 명령어를 찾지 못하는 경우:
> ```bash
> ~/.nvm/versions/node/$(nvm current)/bin/node server.js
> ```

#### 터미널 앱 설정 (macOS)

설정(⚙) → 터미널 앱에서 원하는 앱을 선택하세요.

| 앱 | 지원 여부 |
|---|---|
| iTerm2 | ✅ |
| Terminal.app | ✅ |
| Warp | ✅ |

---

### Windows

> ⚠️ Windows는 터미널 자동 열기 기능이 **미구현** 상태입니다. 명령어 복사 후 수동 실행이 필요합니다.

```powershell
# 1. 저장소 클론
git clone https://github.com/YOUR_USERNAME/claude-session-viewer.git
cd claude-session-viewer

# 2. 의존성 설치
npm install

# 3. 서버 시작
npm start
```

브라우저에서 `http://localhost:3737` 접속.

#### Claude 실행 경로 설정 (Windows)

설정(⚙) → Claude 실행 경로에 아래 경로를 입력하세요:

```
C:\Users\<사용자명>\AppData\Local\Programs\claude\claude.exe
```

또는 `where claude` 명령으로 경로를 확인할 수 있습니다.

---

### Linux

```bash
git clone https://github.com/YOUR_USERNAME/claude-session-viewer.git
cd claude-session-viewer
npm install
npm start
```

Claude 실행 경로: 설정에서 `/usr/local/bin/claude` 또는 `which claude` 결과값을 입력하세요.

> 터미널 자동 열기는 Linux에서 **미구현** 상태입니다.

---

## 설정

설정 아이콘(⚙)을 클릭해 아래 항목을 변경할 수 있습니다.

| 항목 | 설명 |
|---|---|
| 테마 | 라이트 / 다크 |
| Claude 실행 경로 | 자동 감지되지 않을 때 직접 입력 |
| 터미널 앱 | iTerm2 / Terminal.app / Warp (macOS) |
| 고정된 세션 | 고정 목록 관리 |

설정은 `settings.json`에 저장됩니다.

---

## 세션 데이터 위치

Claude Code는 세션을 아래 경로에 JSONL 형식으로 저장합니다.

```
~/.claude/projects/<인코딩된-프로젝트-경로>/<세션-UUID>.jsonl
```

이 앱은 해당 폴더를 직접 읽어 파싱하며, **외부 서버에 데이터를 전송하지 않습니다.**

---

## 미구현 / 향후 계획

| 기능 | 상태 |
|---|---|
| Windows 터미널 자동 열기 | 🔲 미구현 |
| Linux 터미널 자동 열기 | 🔲 미구현 |
| Anthropic Admin API 연동 (토큰 사용량 대시보드) | 🔲 미구현 (org 계정 필요) |
| 세션 삭제 기능 | 🔲 미구현 |
| 세션 이름 직접 수정 | 🔲 미구현 |
| 모바일 반응형 | 🔲 미구현 |
| 전체 대화 내보내기 (MD / TXT) | 🔲 미구현 |

---

## 기술 스택

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JS + CSS (프레임워크 없음)
- **실시간 갱신**: Server-Sent Events (SSE)
- **파일 감시**: `fs.watch()`

---

## 라이선스

MIT
