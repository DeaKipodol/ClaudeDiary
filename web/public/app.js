/**
 * Claude Session Viewer — app.js
 * 세션 목록 로드, 필터링, 카드 렌더링, 설정 모달
 */

// ─── 상태 ─────────────────────────────────────────────────
let allSessions = []
let settings = {}
let activeProject = 'all'
let searchQuery = ''
let sortMode = 'date'
let selectedSessionId = null
let panelOffset = 0
let panelHasMore = false
let panelLoading = false
let panelSessionId = null

// ─── DOM ──────────────────────────────────────────────────
const grid = document.getElementById('session-grid')
const searchEl = document.getElementById('search')
const countEl = document.getElementById('session-count')
const projectList = document.getElementById('project-list')
const sortSelect = document.getElementById('sort-select')
const settingsModal = document.getElementById('settings-modal')
const detailPanel = document.getElementById('detail-panel')
const mainEl = document.querySelector('.main')

// ─── 초기화 ───────────────────────────────────────────────
async function init() {
  await loadSessions()
  applyTheme(settings.theme || 'light')
  applySettingsToModal()
  bindEvents()
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

// ─── API 호출 ──────────────────────────────────────────────
async function fetchSessions(refresh = false) {
  const url = refresh ? '/api/sessions/refresh' : '/api/sessions'
  const method = refresh ? 'POST' : 'GET'
  const res = await fetch(url, { method })
  return res.json()  // { status, sessions, claudeDir? }
}

async function fetchSettings() {
  const res = await fetch('/api/settings')
  return res.json()
}

async function patchSettings(patch) {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return res.json()
}

async function pinSession(id, pinned) {
  await fetch(`/api/sessions/${id}/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinned }),
  })
}

async function openSession(id, projectPath) {
  const res = await fetch(`/api/sessions/${id}/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath }),
  })
  const data = await res.json()
  if (!res.ok) {
    copyToClipboard(data.command)
    toast(`터미널 열기 실패. 명령어를 클립보드에 복사했습니다`)
  } else {
    toast(`터미널에서 세션을 열었습니다`)
  }
}

// ─── 세션 로드 ────────────────────────────────────────────
async function loadSessions(refresh = false) {
  if (refresh) {
    document.getElementById('btn-refresh').classList.add('spinning')
  }

  try {
    const [data, fetchedSettings] = await Promise.all([
      fetchSessions(refresh),
      fetchSettings(),
    ])

    if (data.status === 'not_installed') {
      renderNotInstalled(data.claudeDir)
      return
    }

    allSessions = data.sessions ?? data  // 하위호환
    settings = fetchedSettings
    renderProjectList()
    renderSessions()
  } catch (e) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <p class="empty-title">서버 연결 실패</p>
      <p class="empty-text">${escHtml(e.message)}</p>
    </div>`
  } finally {
    document.getElementById('btn-refresh').classList.remove('spinning')
  }
}

function renderNotInstalled(claudeDir) {
  countEl.textContent = '0개 세션'
  grid.innerHTML = `
    <div class="ni-wrap">
      <div class="ni-icon-wrap">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <path d="M8 21h8M12 17v4"/>
          <path d="M7 8l2 2-2 2M11 10h4"/>
        </svg>
      </div>

      <div class="ni-header">
        <h2 class="ni-title">Claude Code 세션을 찾을 수 없습니다</h2>
        <p class="ni-desc">아래 경로에 세션 폴더가 존재하지 않습니다</p>
        <div class="ni-path">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.5;flex-shrink:0"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <code>${escHtml(claudeDir)}</code>
        </div>
      </div>

      <div class="ni-steps">
        <div class="ni-step">
          <span class="ni-step-num">1</span>
          <div class="ni-step-body">
            <p class="ni-step-title">Claude Code 설치</p>
            <p class="ni-step-desc">터미널에서 아래 명령어를 실행하세요</p>
            <code class="ni-code">npm install -g @anthropic-ai/claude-code</code>
          </div>
        </div>
        <div class="ni-step">
          <span class="ni-step-num">2</span>
          <div class="ni-step-body">
            <p class="ni-step-title">최초 실행</p>
            <p class="ni-step-desc">설치 후 한 번 실행하면 세션 폴더가 자동으로 생성됩니다</p>
            <code class="ni-code">claude</code>
          </div>
        </div>
        <div class="ni-step">
          <span class="ni-step-num">3</span>
          <div class="ni-step-body">
            <p class="ni-step-title">여기서 새로고침</p>
            <p class="ni-step-desc">폴더가 생성되면 세션 목록이 자동으로 표시됩니다</p>
          </div>
        </div>
      </div>

      <button class="ni-refresh-btn" onclick="loadSessions(true)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
        새로고침
      </button>
    </div>
  `
}

// ─── 프로젝트 사이드바 렌더링 ─────────────────────────────
function renderProjectList() {
  // 프로젝트별 세션 수 집계
  const projectMap = new Map()
  for (const s of allSessions) {
    const count = projectMap.get(s.projectName) || 0
    projectMap.set(s.projectName, count + 1)
  }

  document.getElementById('count-all').textContent = allSessions.length

  // 기존 항목 제거 후 재생성
  const existingItems = projectList.querySelectorAll('[data-project]:not([data-project="all"])')
  existingItems.forEach(el => el.remove())

  const sorted = [...projectMap.entries()].sort((a, b) => b[1] - a[1])
  for (const [name, count] of sorted) {
    const li = document.createElement('li')
    li.className = `project-item${activeProject === name ? ' active' : ''}`
    li.dataset.project = name
    li.innerHTML = `<span class="project-name">${escHtml(name)}</span><span class="project-count">${count}</span>`
    li.addEventListener('click', () => setProject(name))
    projectList.appendChild(li)
  }

  // 전체 항목 업데이트
  const allItem = projectList.querySelector('[data-project="all"]')
  if (allItem) allItem.className = `project-item${activeProject === 'all' ? ' active' : ''}`
}

function setProject(name) {
  activeProject = name
  renderProjectList()
  renderSessions()
}

// ─── 세션 필터링 + 정렬 ───────────────────────────────────
function getFilteredSessions() {
  let list = allSessions

  // 프로젝트 필터
  if (activeProject !== 'all') {
    list = list.filter(s => s.projectName === activeProject)
  }

  // 검색 필터 (제목, 프로젝트, 첫 메시지)
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    list = list.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.projectName.toLowerCase().includes(q) ||
      (s.firstMessage || '').toLowerCase().includes(q) ||
      s.titleHistory.some(t => t.toLowerCase().includes(q))
    )
  }

  // 정렬
  const sorted = [...list]
  if (sortMode === 'name') {
    sorted.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return a.title.localeCompare(b.title, 'ko')
    })
  } else if (sortMode === 'project') {
    sorted.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return a.projectName.localeCompare(b.projectName, 'ko') || new Date(b.lastModified) - new Date(a.lastModified)
    })
  } else {
    // date: 고정 먼저, 그 다음 최신순 (서버 정렬과 동일)
    sorted.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.lastModified) - new Date(a.lastModified)
    })
  }

  return sorted
}

// ─── 세션 그리드 렌더링 ───────────────────────────────────
function renderSessions() {
  const list = getFilteredSessions()
  countEl.textContent = `${list.length}개 세션`

  if (list.length === 0) {
    const isSearch = !!searchQuery
    const isProjectFilter = activeProject !== 'all'
    let icon, title, desc
    if (isSearch) {
      icon = '🔍'; title = '검색 결과 없음'
      desc = `"${escHtml(searchQuery)}"와 일치하는 세션이 없습니다`
    } else if (isProjectFilter) {
      icon = '📂'; title = '세션 없음'
      desc = `${escHtml(activeProject)} 프로젝트에 세션이 없습니다`
    } else {
      icon = '📭'; title = '세션 없음'
      desc = 'Claude Code를 실행하면 세션이 여기에 표시됩니다'
    }
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <p class="empty-title">${title}</p>
      <p class="empty-text">${desc}</p>
    </div>`
    return
  }

  grid.innerHTML = ''
  for (const session of list) {
    grid.appendChild(buildCard(session))
  }

  // 선택 상태 복원
  if (selectedSessionId) {
    const selectedCard = grid.querySelector(`[data-id="${selectedSessionId}"]`)
    if (selectedCard) {
      selectedCard.classList.add('card--selected')
    }
  }
}

// 슬러그 패턴 판별: 단어-단어-단어 영문 소문자
const SLUG_PATTERN = /^[a-z]+-[a-z]+-[a-z]+/
const KOREAN_PATTERN = /[ㄱ-ㅎ가-힣]/
function isSlug(title) {
  return SLUG_PATTERN.test(title) && !KOREAN_PATTERN.test(title)
}

// ─── 카드 빌드 ────────────────────────────────────────────
function buildCard(s) {
  const card = document.createElement('div')
  card.className = `card${s.pinned ? ' pinned' : ''}`
  card.dataset.id = s.id

  const unnamed = isSlug(s.title) && s.titleHistory.length === 0

  // 이름 변경 이력 (2개 이상일 때만 표시)
  let historyHtml = ''
  if (s.titleHistory.length > 1) {
    const oldTitles = s.titleHistory.slice(0, -1)
    historyHtml = `
      <div class="title-history">
        <span class="title-history-label">이전:</span>
        ${oldTitles.map(t => `<span class="history-tag old">${escHtml(t)}</span>`).join('')}
        <span class="history-tag">→ ${escHtml(s.titleHistory.at(-1))}</span>
      </div>`
  }

  // 최근 대화 미리보기
  const hasRecent = s.lastUserMsg || s.lastAssistantMsg
  const previewHtml = hasRecent ? `
    <div class="card-preview">
      ${s.lastUserMsg ? `<div class="conv-row conv-user"><span class="conv-bubble conv-bubble-user">${escHtml(s.lastUserMsg)}</span></div>` : ''}
      ${s.lastAssistantMsg ? `<div class="conv-row conv-ai"><span class="conv-bubble conv-bubble-ai">${escHtml(s.lastAssistantMsg)}</span></div>` : ''}
    </div>` : ''

  card.innerHTML = `
    <div class="card-pin-badge" title="고정됨">📌</div>

    <div class="card-header">
      <div class="card-title${unnamed ? ' is-slug' : ''}">${escHtml(s.title)}${unnamed ? ' <span style="font-size:10px;color:var(--text-3);font-weight:400;font-style:normal">(미명명)</span>' : ''}</div>
      <div class="card-project">📁 ${escHtml(s.projectName)}</div>
    </div>

    ${historyHtml}
    ${previewHtml}

    <div class="card-meta">
      <span class="card-date">${formatDate(s.lastModified)}</span>
      <span class="card-size">${s.fileSizeMB}MB</span>
    </div>

    <div class="card-actions">
      <button class="btn-open">▶ 터미널에서 열기</button>
      <button class="btn-copy" title="명령어 복사">복사</button>
      <button class="btn-pin" title="${s.pinned ? '고정 해제' : '고정'}">📌</button>
    </div>
  `

  card.querySelector('.btn-open').addEventListener('click', () => openSession(s.id, s.projectPath))

  card.querySelector('.btn-copy').addEventListener('click', () => {
    copyToClipboard(`claude --resume ${s.id}`)
    toast('명령어를 클립보드에 복사했습니다')
  })

  card.querySelector('.btn-pin').addEventListener('click', () => handlePinToggle(s))

  // 카드 클릭 → 디테일 패널 열기 (버튼 제외)
  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-actions') || e.target.closest('.card-pin-badge')) return
    openDetailPanel(s)
  })

  return card
}

// ─── 디테일 패널 ─────────────────────────────────────────
function openDetailPanel(session) {
  selectedSessionId = session.id
  panelSessionId = session.id
  panelOffset = 0
  panelHasMore = true
  panelLoading = false

  // 이전 스크롤 리스너 정리
  if (window._panelScrollCleanup) {
    window._panelScrollCleanup()
    window._panelScrollCleanup = null
  }

  detailPanel.innerHTML = `
    <div class="dp-header">
      <div class="dp-title-wrap">
        <h2 class="dp-title">${escHtml(session.title)}</h2>
        <div class="dp-project">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          ${escHtml(session.projectName)}
        </div>
        <div class="dp-meta">${formatDate(session.lastModified)} · ${session.fileSizeMB} MB</div>
      </div>
      <button class="dp-close btn-icon" title="닫기">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="dp-body">
      <div id="dp-sentinel" class="dp-sentinel"></div>
      <div id="dp-loading-top" class="dp-loading-top hidden">
        <div class="spinner-sm"></div>
      </div>
      <div id="dp-conv" class="dp-conv"></div>
    </div>
    <div class="dp-footer">
      <button class="btn-open dp-btn-open">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        터미널에서 열기
      </button>
      <button class="btn-copy dp-btn-copy">복사</button>
      <button class="btn-pin dp-btn-pin${session.pinned ? ' active' : ''}" title="${session.pinned ? '고정 해제' : '고정'}">📌</button>
    </div>
  `

  detailPanel.querySelector('.dp-close').addEventListener('click', closeDetailPanel)
  detailPanel.querySelector('.dp-btn-open').addEventListener('click', () => openSession(session.id, session.projectPath))
  detailPanel.querySelector('.dp-btn-copy').addEventListener('click', () => {
    copyToClipboard(`claude --resume ${session.id}`)
    toast('명령어를 클립보드에 복사했습니다')
  })
  detailPanel.querySelector('.dp-btn-pin').addEventListener('click', () => handlePinToggle(session))

  detailPanel.classList.add('open')
  mainEl.classList.add('panel-open')

  // 선택 카드 강조
  document.querySelectorAll('.card').forEach(c => {
    c.classList.toggle('card--selected', c.dataset.id === session.id)
  })

  // 초기 메시지 로드 + 스크롤 감지 설정
  loadMoreMessages(session.id)
  setupPanelScroll(session.id)
}

async function loadMoreMessages(sessionId) {
  if (panelLoading || !panelHasMore || sessionId !== panelSessionId) return
  panelLoading = true

  const isFirst = panelOffset === 0
  const dpBody = detailPanel.querySelector('.dp-body')
  const conv = document.getElementById('dp-conv')
  const loadingEl = document.getElementById('dp-loading-top')
  const prevScrollHeight = dpBody?.scrollHeight ?? 0

  if (!isFirst && loadingEl) loadingEl.classList.remove('hidden')

  try {
    const res = await fetch(`/api/sessions/${sessionId}/messages?limit=10&offset=${panelOffset}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    if (sessionId !== panelSessionId || !conv) return

    if (data.messages.length === 0) {
      panelHasMore = false
    } else {
      const frag = document.createDocumentFragment()
      for (const msg of data.messages) {
        const row = document.createElement('div')
        row.className = `conv-row conv-${msg.role === 'user' ? 'user' : 'ai'}`
        const bubble = document.createElement('span')
        bubble.className = `conv-bubble conv-bubble-${msg.role === 'user' ? 'user' : 'ai'}`
        bubble.textContent = msg.text   // textContent로 XSS 방지 + pre-wrap 활용
        row.appendChild(bubble)
        frag.appendChild(row)
      }
      conv.insertBefore(frag, conv.firstChild)

      panelOffset = data.nextOffset
      panelHasMore = data.hasMore

      if (dpBody) {
        if (isFirst) {
          // 첫 로드: 최신 메시지(아래)로 스크롤
          requestAnimationFrame(() => { dpBody.scrollTop = dpBody.scrollHeight })
        } else {
          // 이후 로드: 스크롤 위치 유지 (위에 붙여넣기 후 점프 방지)
          dpBody.scrollTop += dpBody.scrollHeight - prevScrollHeight
        }
      }
    }

    // 처음이거나 모두 로드됐을 때 sentinel 처리
    if (!panelHasMore) {
      const sentinel = document.getElementById('dp-sentinel')
      if (sentinel) {
        const startEl = document.createElement('p')
        startEl.className = 'dp-start'
        startEl.textContent = '대화의 시작입니다'
        sentinel.replaceWith(startEl)
      }
    }
  } catch (e) {
    console.error('[panel] load messages failed:', e)
    if (isFirst && conv) {
      conv.innerHTML = '<div class="dp-empty">메시지를 불러오지 못했습니다</div>'
    }
  } finally {
    panelLoading = false
    if (loadingEl) loadingEl.classList.add('hidden')
  }
}

function setupPanelScroll(sessionId) {
  const dpBody = detailPanel.querySelector('.dp-body')
  if (!dpBody) return

  const onScroll = () => {
    if (dpBody.scrollTop < 80 && !panelLoading && panelHasMore) {
      loadMoreMessages(sessionId)
    }
  }

  dpBody.addEventListener('scroll', onScroll, { passive: true })
  window._panelScrollCleanup = () => dpBody.removeEventListener('scroll', onScroll)
}

function closeDetailPanel() {
  selectedSessionId = null
  panelSessionId = null
  if (window._panelScrollCleanup) {
    window._panelScrollCleanup()
    window._panelScrollCleanup = null
  }
  detailPanel.classList.remove('open')
  mainEl.classList.remove('panel-open')
  document.querySelectorAll('.card--selected').forEach(c => c.classList.remove('card--selected'))
}

async function handlePinToggle(session) {
  const newPinned = !session.pinned
  const prev = session.pinned
  session.pinned = newPinned  // 낙관적 업데이트
  renderSessions()
  renderPinnedList()

  // 패널 핀 버튼 즉시 반영
  if (selectedSessionId === session.id) {
    const pinBtn = detailPanel.querySelector('.dp-btn-pin')
    if (pinBtn) {
      pinBtn.classList.toggle('active', newPinned)
      pinBtn.title = newPinned ? '고정 해제' : '고정'
    }
  }

  try {
    await pinSession(session.id, newPinned)
    if (newPinned) {
      if (!settings.pinnedSessions.includes(session.id)) settings.pinnedSessions.push(session.id)
    } else {
      settings.pinnedSessions = settings.pinnedSessions.filter(id => id !== session.id)
    }
    updatePinnedBadge()
    toast(newPinned ? '📌 세션이 고정되었습니다' : '고정이 해제되었습니다')
  } catch {
    session.pinned = prev  // 실패 시 롤백
    renderSessions()
    renderPinnedList()
    toast('고정 변경에 실패했습니다')
  }
}

// ─── 날짜 포맷 ────────────────────────────────────────────
function formatDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d

  if (diff < 60_000) return '방금 전'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`

  const yy = d.getFullYear() === now.getFullYear() ? '' : `${d.getFullYear()}.`
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yy}${mm}.${dd} ${hh}:${min}`
}

// ─── 설정 모달 ────────────────────────────────────────────
function applySettingsToModal() {
  // Claude 경로
  const claudePathInput = document.getElementById('claude-path-input')
  if (claudePathInput) claudePathInput.value = settings.claudePath || ''

  // 터미널 선택
  document.querySelectorAll('.terminal-option').forEach(el => {
    const radio = el.querySelector('input[type="radio"]')
    const isSelected = radio.value === settings.terminal
    el.classList.toggle('selected', isSelected)
    radio.checked = isSelected
  })

  // 테마 선택
  const currentTheme = settings.theme || 'light'
  document.querySelectorAll('.theme-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.themeOpt === currentTheme)
  })

  renderPinnedList()
  updatePinnedBadge()
}

function renderPinnedList() {
  const pinnedList = document.getElementById('pinned-list')
  const pinned = allSessions.filter(s => s.pinned)

  if (pinned.length === 0) {
    pinnedList.innerHTML = `<li style="color:var(--text-3);font-size:12px;padding:4px 0">고정된 세션이 없습니다</li>`
    return
  }

  pinnedList.innerHTML = pinned.map(s => `
    <li class="pinned-item" data-id="${s.id}">
      <div style="flex:1;overflow:hidden">
        <div class="pinned-item-name">${escHtml(s.title)}</div>
        <div class="pinned-item-project">${escHtml(s.projectName)}</div>
      </div>
      <button class="btn-unpin" data-id="${s.id}">해제</button>
    </li>
  `).join('')

  pinnedList.querySelectorAll('.btn-unpin').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      const session = allSessions.find(s => s.id === id)
      if (!session) return
      handlePinToggle(session)
    })
  })
}

function updatePinnedBadge() {
  let count = 0
  for (const s of allSessions) { if (s.pinned) count++ }
  document.getElementById('pinned-count').textContent = count
}

// ─── 이벤트 바인딩 ────────────────────────────────────────
function bindEvents() {
  // 검색
  searchEl.addEventListener('input', () => {
    searchQuery = searchEl.value.trim()
    renderSessions()
  })

  // ⌘K 검색창 포커스 / ESC 패널 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selectedSessionId) {
      closeDetailPanel()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      searchEl.focus()
      searchEl.select()
    }
  })

  // 정렬
  sortSelect.addEventListener('change', () => {
    sortMode = sortSelect.value
    renderSessions()
  })

  // 새로고침
  document.getElementById('btn-refresh').addEventListener('click', () => loadSessions(true))

  // 설정 열기
  document.getElementById('btn-settings').addEventListener('click', () => {
    applySettingsToModal()
    settingsModal.classList.remove('hidden')
  })

  // 설정 닫기
  document.getElementById('modal-close').addEventListener('click', closeSettings)
  document.getElementById('modal-backdrop').addEventListener('click', closeSettings)

  // 테마 선택
  document.querySelectorAll('.theme-option').forEach(el => {
    el.addEventListener('click', async () => {
      const theme = el.dataset.themeOpt
      settings = await patchSettings({ theme })
      applyTheme(theme)
      document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.themeOpt === theme)
      })
      toast(`${theme === 'dark' ? '🌙 다크' : '☀️ 라이트'} 모드로 변경됐습니다`)
    })
  })

  // Claude 경로 저장
  document.getElementById('claude-path-save').addEventListener('click', async () => {
    const claudePath = document.getElementById('claude-path-input').value.trim()
    settings = await patchSettings({ claudePath })
    toast(`Claude 경로가 저장됐습니다`)
  })

  // 터미널 선택
  document.querySelectorAll('.terminal-option').forEach(el => {
    el.addEventListener('click', async () => {
      const terminal = el.dataset.terminal
      settings = await patchSettings({ terminal })
      document.querySelectorAll('.terminal-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.terminal === terminal)
      })
      toast(`터미널을 ${el.querySelector('.terminal-name').textContent}(으)로 설정했습니다`)
    })
  })

  // 전체 프로젝트 항목
  const allItem = document.querySelector('[data-project="all"]')
  if (allItem) allItem.addEventListener('click', () => setProject('all'))
}

function closeSettings() {
  settingsModal.classList.add('hidden')
}

// ─── 유틸 ─────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  })
}

let toastTimer = null
function toast(msg, duration = 2500) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.classList.remove('hidden')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration)
}

// ─── 새 세션 자동 감지 (SSE) ──────────────────────────────
function connectSSE() {
  const es = new EventSource('/api/events')

  es.onmessage = (e) => {
    if (e.data === 'refresh') {
      loadSessions(true).then(() => {
        toast('새 세션이 감지되어 목록을 갱신했습니다')
      })
    }
  }

  es.onerror = () => {
    es.close()
    // 연결 끊기면 5초 후 재연결
    setTimeout(connectSSE, 5000)
  }
}

// ─── 시작 ─────────────────────────────────────────────────
init()
connectSSE()
