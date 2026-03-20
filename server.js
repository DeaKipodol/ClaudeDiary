/**
 * Claude Session Viewer — server.js
 *
 * 세션 구조 (조사 결과):
 *   ~/.claude/projects/<프로젝트>/
 *     <UUID>.jsonl              ← 메인 세션 (여기서만 --resume 가능)
 *     <UUID>/subagents/         ← 서브에이전트 대화 (표시 안 함)
 *
 * 레코드 타입: user, assistant, custom-title, system, progress,
 *             file-history-snapshot, queue-operation, agent-name,
 *             last-prompt, pr-link
 *
 * 제목 전략:
 *   custom-title 레코드는 파일 전체에 분산 → 앞 + 뒤 양쪽 읽어야 함
 *   최신 customTitle = 파일 끝쪽에 있음
 */

const express = require('express')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { exec } = require('child_process')

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// ─── 경로 상수 ────────────────────────────────────────────
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')
const SETTINGS_PATH = path.join(__dirname, 'settings.json')

// 파일 앞부분: cwd, slug, 첫 메시지 추출용
const HEAD_LINES = 80
// 파일 끝부분: custom-title 최신값 추출용 (bytes)
const TAIL_BYTES = 30_000

// ─── 설정 ─────────────────────────────────────────────────
// claude 바이너리 자동 탐색 (서버 시작 시 1회)
function detectClaudePath() {
  const candidates = [
    '/opt/homebrew/bin/claude',   // macOS Apple Silicon
    '/usr/local/bin/claude',      // macOS Intel / Linux
    '/usr/bin/claude',            // Linux
    'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Programs\\claude\\claude.exe', // Windows
  ]
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p } catch {}
  }
  return 'claude' // PATH fallback
}

const DEFAULT_SETTINGS = {
  terminal: 'iterm2',
  claudePath: detectClaudePath(),
  pinnedSessions: [],
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) }
    }
  } catch {}
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2))
}

// ─── 첫 메시지 정제 ───────────────────────────────────────
// 시스템 태그, 슬래시 커맨드, 파일 경로만 있는 메시지 제거
const RE_HTML_BLOCK = /<[^>]+>[\s\S]*?<\/[^>]+>/g
const RE_HTML_TAG   = /<[^>]+>/g

function cleanFirstMessage(raw) {
  if (!raw) return null
  // 내부 시스템 태그 제거
  let text = raw.replace(RE_HTML_BLOCK, '').trim()
  text = text.replace(RE_HTML_TAG, '').trim()
  // 파일 경로만 있는 경우 제거
  if (text.startsWith('/') && !text.includes(' ')) return null
  // 슬래시 커맨드 제거
  if (text.startsWith('/') && text.split('\n')[0].length < 30) {
    text = text.split('\n').slice(1).join('\n').trim()
  }
  return text.slice(0, 160) || null
}

// ─── 파일 끝 N 바이트 읽기 ────────────────────────────────
function readTailBytes(filePath, bytes) {
  const stat = fs.statSync(filePath)
  const start = Math.max(0, stat.size - bytes)
  const buf = Buffer.alloc(Math.min(bytes, stat.size))
  const fd = fs.openSync(filePath, 'r')
  fs.readSync(fd, buf, 0, buf.length, start)
  fs.closeSync(fd)
  return buf.toString('utf8')
}

// ─── JSONL 줄 파싱 (에러 무시) ────────────────────────────
function parseLines(text) {
  const result = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { result.push(JSON.parse(line)) } catch {}
  }
  return result
}

// ─── 세션 메타데이터 추출 ─────────────────────────────────
// 전략:
//   - cwd, slug, 첫 메시지: 파일 앞 20KB (초반에 등장)
//   - custom-title: 파일 전체를 "custom-title" 문자열 포함 줄만 파싱
//     (JSON.parse 비용 줄이기 위해 문자열 검사 먼저)
function extractMetadata(filePath) {
  const stat = fs.statSync(filePath)

  // ① 앞 20KB: cwd, slug, 첫 메시지
  const headBuf = Buffer.alloc(Math.min(20_000, stat.size))
  const fd = fs.openSync(filePath, 'r')
  const bytesRead = fs.readSync(fd, headBuf, 0, headBuf.length, 0)
  fs.closeSync(fd)
  const headText = headBuf.slice(0, bytesRead).toString('utf8')

  let cwd = null
  let slug = null
  let firstUserMessage = null

  for (const d of parseLines(headText)) {
    if (d.cwd && !cwd) cwd = d.cwd
    if (d.slug && !slug) slug = d.slug
    if (d.type === 'user' && !firstUserMessage) {
      const content = d.message?.content
      let raw = null
      if (typeof content === 'string') raw = content
      else if (Array.isArray(content)) {
        const t = content.find(b => b.type === 'text')
        raw = t?.text ?? null
      }
      firstUserMessage = cleanFirstMessage(raw)
    }
  }

  // ② 파일 끝 30KB: custom-title + 최근 대화 동시 추출
  const titleHistory = []
  const tailText = readTailBytes(filePath, TAIL_BYTES)
  const tailLines = tailText.split('\n')

  // custom-title은 파일 전체에 분산될 수 있으므로 전체도 확인
  const fullText = fs.readFileSync(filePath, 'utf8')
  for (const line of fullText.split('\n')) {
    if (!line.includes('"custom-title"')) continue
    try {
      const d = JSON.parse(line)
      if (d.type === 'custom-title' && d.customTitle && !titleHistory.includes(d.customTitle)) {
        titleHistory.push(d.customTitle)
      }
    } catch {}
  }

  // 최근 대화: tail에서 마지막 user/assistant 메시지 추출
  // cleanFirstMessage(슬래시 커맨드 필터) 대신 간단한 정제만 적용
  let lastUserMsg = null
  let lastAssistantMsg = null
  for (const line of tailLines) {
    if (!line.includes('"type"')) continue
    try {
      const d = JSON.parse(line)
      if (d.type === 'user') {
        const content = d.message?.content
        let raw = null
        if (typeof content === 'string') raw = content
        else if (Array.isArray(content)) {
          const t = content.find(b => b.type === 'text')
          raw = t?.text ?? null
        }
        if (raw) {
          // HTML 태그 제거 후 순수 파일경로(공백없는 /)만 스킵
          let text = raw.replace(RE_HTML_BLOCK, '').replace(RE_HTML_TAG, '').trim()
          if (text && !(text.startsWith('/') && !text.includes(' ') && !text.includes('\n'))) {
            lastUserMsg = text.slice(0, 200)
          }
        }
      } else if (d.type === 'assistant') {
        const content = d.message?.content
        let text = null
        if (typeof content === 'string') text = content
        else if (Array.isArray(content)) {
          const t = content.find(b => b.type === 'text')
          text = t?.text ?? null
        }
        if (text) lastAssistantMsg = text.slice(0, 200).replace(/\n+/g, ' ').trim()
      }
    } catch {}
  }

  return {
    cwd,
    slug,
    firstUserMessage,
    lastUserMsg,
    lastAssistantMsg,
    titleHistory,
    currentTitle: titleHistory.at(-1) ?? slug ?? null,
  }
}

// ─── 프로젝트 디렉토리 이름 디코딩 ──────────────────────────
// Claude는 프로젝트를 ~/.claude/projects/<인코딩된경로>/ 에 저장
// 인코딩: 경로의 '/'를 '-'로 치환 (예: /Users/foo/Desktop/bar → -Users-foo-Desktop-bar)
// 이 함수는 폴더명에서 프로젝트 이름(마지막 경로 세그먼트)을 추출
// 프로젝트 폴더명이 진짜 소속 프로젝트의 ground truth이므로 cwd보다 우선
function decodeProjectDirName(dirName) {
  const homeEncoded = os.homedir().replace(/^\//, '-').replace(/\//g, '-')
  let rest = dirName.startsWith(homeEncoded)
    ? dirName.slice(homeEncoded.length)
    : dirName

  rest = rest.replace(/^-(Desktop|Developer|Documents|Downloads|Projects|Work|Code|Sites|ppt)/, '')
  rest = rest.replace(/^-+/, '')

  if (!rest || /^-+$/.test(rest)) return null
  return rest
}

// ─── 프로젝트 이름 추출 ───────────────────────────────────
// 프로젝트 폴더명을 우선 사용 (세션의 cwd는 세션 중에 바뀔 수 있어 부정확)
// 폴더명 디코딩 실패 시에만 cwd fallback
function getProjectName(cwd, dirName) {
  const decoded = decodeProjectDirName(dirName)
  if (decoded) return decoded

  // 폴더명 디코딩 실패 시: cwd의 basename 사용
  if (cwd) return path.basename(cwd)
  return dirName
}

// 프로젝트 전체 경로: 실제 파일시스템에서 존재하는 경로 탐색 후 cwd fallback
function getProjectPath(cwd, dirName) {
  // 홈 경로 기반으로 디코딩 시도 (알려진 경계 디렉토리 활용)
  const homeEncoded = os.homedir().replace(/^\//, '-').replace(/\//g, '-')
  if (dirName.startsWith(homeEncoded)) {
    const rest = dirName.slice(homeEncoded.length)
    const boundaries = ['Desktop', 'Developer', 'Documents', 'Downloads', 'Projects', 'Work', 'Code', 'Sites', 'ppt']
    for (const boundary of boundaries) {
      if (rest.startsWith('-' + boundary + '-')) {
        const projectPart = rest.slice(boundary.length + 2)
        const candidate = path.join(os.homedir(), boundary, projectPart)
        if (fs.existsSync(candidate)) return candidate
      }
    }
    // 경계 없이 홈 바로 아래
    const candidate = path.join(os.homedir(), rest.replace(/^-+/, ''))
    if (fs.existsSync(candidate)) return candidate
  }

  // fallback: cwd 또는 단순 치환
  if (cwd) return cwd
  return '/' + dirName.replace(/^-/, '').replace(/-/g, '/')
}

// ─── 세션 목록 빌드 ───────────────────────────────────────
let _cache = null
let _cacheTime = 0
const CACHE_TTL = 60_000

function buildSessionList() {
  const settings = loadSettings()
  const sessions = []

  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return []

  for (const projectDir of fs.readdirSync(CLAUDE_PROJECTS_DIR)) {
    const projectDirPath = path.join(CLAUDE_PROJECTS_DIR, projectDir)

    let dirStat
    try { dirStat = fs.statSync(projectDirPath) } catch { continue }
    if (!dirStat.isDirectory()) continue

    // 직접 하위 .jsonl 파일만 (subagents/ 제외)
    let files
    try { files = fs.readdirSync(projectDirPath).filter(f => f.endsWith('.jsonl')) }
    catch { continue }

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '')
      const filePath = path.join(projectDirPath, file)

      let fileStat
      try { fileStat = fs.statSync(filePath) } catch { continue }

      // 0바이트 파일 스킵
      if (fileStat.size === 0) continue

      try {
        const meta = extractMetadata(filePath)
        const projectName = getProjectName(meta.cwd, projectDir)

        sessions.push({
          id: sessionId,
          projectDir,
          projectName,
          projectPath: getProjectPath(meta.cwd, projectDir),
          title: meta.currentTitle || sessionId.slice(0, 8),
          titleHistory: meta.titleHistory,
          firstMessage: meta.firstUserMessage,
          lastUserMsg: meta.lastUserMsg,
          lastAssistantMsg: meta.lastAssistantMsg,
          lastModified: fileStat.mtime.toISOString(),
          fileSizeMB: (fileStat.size / 1024 / 1024).toFixed(1),
          pinned: settings.pinnedSessions.includes(sessionId),
        })
      } catch (e) {
        console.error(`[parse error] ${file}:`, e.message)
      }
    }
  }

  sessions.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.lastModified) - new Date(a.lastModified)
  })

  return sessions
}

function getSessions(forceRefresh = false) {
  if (!forceRefresh && _cache && Date.now() - _cacheTime < CACHE_TTL) return _cache
  _cache = buildSessionList()
  _cacheTime = Date.now()
  return _cache
}

// ─── 터미널에서 세션 열기 ─────────────────────────────────
function openInTerminal(sessionId, projectPath, terminal, claudeBin) {
  const safePath = (projectPath && fs.existsSync(projectPath)) ? projectPath : os.homedir()
  // shell에서 직접 실행할 명령어 (cd → claude)
  // 작은따옴표로 경로 감싸고 내부 작은따옴표는 '\'' 처리
  const escapedPath = safePath.replace(/'/g, "'\\''")
  const escapedBin  = claudeBin.replace(/'/g, "'\\''")
  const shellCmd = `cd '${escapedPath}' && '${escapedBin}' --resume ${sessionId}`

  // iTerm2: write text로 현재 shell에 직접 입력 → cwd가 정확하게 적용됨
  const iterm2Script = `
tell application "iTerm"
  activate
  set w to create window with default profile
  tell current session of w
    write text "${shellCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
  end tell
end tell`

  // Terminal.app: do script로 새 탭에서 실행
  const terminalScript = `
tell application "Terminal"
  activate
  do script "${shellCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
end tell`

  const scripts = {
    iterm2:   `osascript << 'APPLESCRIPT'\n${iterm2Script}\nAPPLESCRIPT`,
    terminal: `osascript << 'APPLESCRIPT'\n${terminalScript}\nAPPLESCRIPT`,
    warp:     `open "warp://action/new_tab?command=${encodeURIComponent(shellCmd)}"`,
  }

  return new Promise((resolve, reject) => {
    exec(scripts[terminal] || scripts.terminal, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

// ─── 파일 감시 + SSE ──────────────────────────────────────
// ~/.claude/projects/ 에 새 .jsonl 파일이 생기면 연결된 브라우저에 알림
const sseClients = new Set()

function watchProjects() {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return
  try {
    let debounceTimer = null
    fs.watch(CLAUDE_PROJECTS_DIR, { recursive: true }, (event, filename) => {
      if (!filename?.endsWith('.jsonl')) return
      // 연속 쓰기 이벤트를 3초로 묶어서 한 번만 전송
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        _cache = null
        for (const res of sseClients) {
          res.write('data: refresh\n\n')
        }
      }, 3000)
    })
  } catch (e) {
    console.error('[watch]', e.message)
  }
}

// ─── 메시지 페이지네이션 API 헬퍼 ────────────────────────────
function findSessionFile(sessionId) {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return null
  for (const projectDir of fs.readdirSync(CLAUDE_PROJECTS_DIR)) {
    const candidate = path.join(CLAUDE_PROJECTS_DIR, projectDir, sessionId + '.jsonl')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function parseConversationMessages(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const messages = []
  for (const line of text.split('\n')) {
    if (!line.includes('"type"')) continue
    try {
      const d = JSON.parse(line)
      if (d.type === 'user') {
        const content = d.message?.content
        let raw = null
        if (typeof content === 'string') raw = content
        else if (Array.isArray(content)) {
          const t = content.find(b => b.type === 'text')
          raw = t?.text ?? null
        }
        if (raw) {
          let txt = raw.replace(RE_HTML_BLOCK, '').replace(RE_HTML_TAG, '').trim()
          if (txt && !(txt.startsWith('/') && !txt.includes(' ') && !txt.includes('\n'))) {
            messages.push({ role: 'user', text: txt.slice(0, 2000) })
          }
        }
      } else if (d.type === 'assistant') {
        const content = d.message?.content
        let txt = null
        if (typeof content === 'string') txt = content
        else if (Array.isArray(content)) {
          const t = content.find(b => b.type === 'text')
          txt = t?.text ?? null
        }
        if (txt?.trim()) {
          messages.push({ role: 'assistant', text: txt.slice(0, 2000) })
        }
      }
    } catch {}
  }
  return messages
}

// 파일 수정 시간 기준 캐시
const _msgCache = new Map()

function getCachedMessages(sessionId) {
  const filePath = findSessionFile(sessionId)
  if (!filePath) return null
  const mtime = fs.statSync(filePath).mtime.getTime()
  const cached = _msgCache.get(sessionId)
  if (cached && cached.mtime === mtime) return cached.messages
  const messages = parseConversationMessages(filePath)
  _msgCache.set(sessionId, { messages, mtime })
  return messages
}

// ─── API ──────────────────────────────────────────────────
function buildSessionsResponse(forceRefresh = false) {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    return { status: 'not_installed', sessions: [], claudeDir: CLAUDE_PROJECTS_DIR }
  }
  const sessions = getSessions(forceRefresh)
  return { status: 'ok', sessions }
}

app.get('/api/sessions', (req, res) => {
  try { res.json(buildSessionsResponse()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/sessions/refresh', (req, res) => {
  try { res.json(buildSessionsResponse(true)) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// 메시지 페이지네이션: offset = 끝에서 몇 개 건너뛸지
// offset=0 → 마지막 limit개, offset=10 → 그 앞 limit개
app.get('/api/sessions/:id/messages', (req, res) => {
  const { id } = req.params
  const limit = Math.min(parseInt(req.query.limit) || 10, 30)
  const offset = parseInt(req.query.offset) || 0
  try {
    const messages = getCachedMessages(id)
    if (!messages) return res.status(404).json({ error: 'Session not found' })
    const total = messages.length
    const end = Math.max(0, total - offset)
    const start = Math.max(0, end - limit)
    res.json({
      messages: messages.slice(start, end),
      nextOffset: total - start,   // 다음 호출 때 쓸 offset
      hasMore: start > 0,
      total,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/sessions/:id/pin', (req, res) => {
  const { id } = req.params
  const { pinned } = req.body
  const settings = loadSettings()

  if (pinned) {
    if (!settings.pinnedSessions.includes(id)) settings.pinnedSessions.push(id)
  } else {
    settings.pinnedSessions = settings.pinnedSessions.filter(s => s !== id)
  }

  saveSettings(settings)
  _cache = null
  res.json({ ok: true })
})

app.post('/api/sessions/:id/open', async (req, res) => {
  const { id } = req.params
  const { projectPath } = req.body  // 프론트에서 전달
  const { terminal, claudePath } = loadSettings()
  const claudeBin = claudePath || detectClaudePath()
  const cmd = `cd ${JSON.stringify(projectPath || os.homedir())} && ${claudeBin} --resume ${id}`
  try {
    await openInTerminal(id, projectPath, terminal, claudeBin)
    res.json({ ok: true, command: cmd })
  } catch (e) {
    res.status(500).json({ error: e.message, command: cmd })
  }
})

// SSE 연결 — 브라우저가 구독, 새 세션 생기면 'refresh' 이벤트 수신
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.write('data: connected\n\n')

  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

app.get('/api/settings', (req, res) => res.json(loadSettings()))

app.post('/api/settings', (req, res) => {
  const updated = { ...loadSettings(), ...req.body }
  saveSettings(updated)
  _cache = null
  res.json(updated)
})

// ─── 서버 시작 ────────────────────────────────────────────
// 포트 3737 고정 — localStorage가 origin(포트) 기준으로 격리되므로
// 포트가 바뀌면 설정/고정 데이터가 초기화됨
const PORT = 3737
const URL = `http://localhost:${PORT}`

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`)
  console.log(`║  Claude Session Viewer  :${PORT}      ║`)
  console.log(`╚══════════════════════════════════════╝\n`)
  console.log(`  ${URL}`)
  console.log(`  세션 경로: ${CLAUDE_PROJECTS_DIR}\n`)

  // 브라우저 자동 오픈 (macOS)
  exec(`open ${URL}`, (err) => {
    if (err) console.log(`  브라우저를 직접 열어주세요: ${URL}`)
  })

  // 파일 감시 시작
  watchProjects()
  console.log(`  세션 파일 감시 중 (새 세션 자동 갱신)\n`)
})
