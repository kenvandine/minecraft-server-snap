'use strict'

// ── PWA: service worker registration ────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(err => {
    console.warn('Service worker registration failed:', err)
  })
}

// ── PWA: install prompt ──────────────────────────────────────────────────────
let deferredPrompt = null
const installBtn = document.getElementById('install-btn')

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferredPrompt = e
  installBtn.classList.remove('hidden')
})

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  if (outcome === 'accepted') installBtn.classList.add('hidden')
  deferredPrompt = null
})

window.addEventListener('appinstalled', () => {
  installBtn.classList.add('hidden')
  deferredPrompt = null
})

// ── DOM refs ─────────────────────────────────────────────────────────────────
const badge      = document.getElementById('status-badge')
const label      = document.getElementById('status-label')
const motdEl     = document.getElementById('motd')
const versionEl  = document.getElementById('version')
const countEl    = document.getElementById('player-count')
const listEl     = document.getElementById('player-list')
const countdownEl= document.getElementById('countdown')
const refreshBtn = document.getElementById('refresh-btn')

// ── Status fetching ───────────────────────────────────────────────────────────
async function fetchStatus() {
  try {
    const res = await fetch('/api/status')
    return await res.json()
  } catch {
    return { online: false, offline: true, players: { online: 0, max: 0, list: [] } }
  }
}

function renderStatus(data) {
  // Remove any existing offline banner
  const existing = document.querySelector('.offline-banner')
  if (existing) existing.remove()

  if (data.offline) {
    // Can't reach the web server itself
    const banner = document.createElement('div')
    banner.className = 'offline-banner'
    banner.textContent = 'You are offline — showing last known state'
    document.querySelector('main').prepend(banner)
  }

  badge.className = 'status-badge ' + (data.online ? 'online' : 'offline')
  label.textContent = data.online ? 'Online' : 'Offline'

  motdEl.textContent  = data.motd    || ''
  versionEl.textContent = data.version ? `Minecraft ${data.version}` : ''

  const players = data.players || { online: 0, max: 0, list: [] }
  countEl.textContent = data.online
    ? `${players.online} / ${players.max}`
    : '—'

  listEl.innerHTML = ''
  if (!data.online) {
    listEl.innerHTML = '<li class="empty">Server is offline</li>'
  } else if (players.list && players.list.length > 0) {
    players.list.forEach(name => {
      const li = document.createElement('li')
      li.textContent = name
      listEl.appendChild(li)
    })
    if (players.online > players.list.length) {
      const li = document.createElement('li')
      li.className = 'empty'
      li.textContent = `… and ${players.online - players.list.length} more`
      listEl.appendChild(li)
    }
  } else if (players.online === 0) {
    listEl.innerHTML = '<li class="empty">No players online</li>'
  } else {
    listEl.innerHTML = '<li class="empty">Player list not available</li>'
  }
}

// ── Auto-refresh countdown ────────────────────────────────────────────────────
const REFRESH_INTERVAL = 15
let countdown = REFRESH_INTERVAL
let intervalId = null

function resetCountdown() {
  countdown = REFRESH_INTERVAL
  countdownEl.textContent = countdown
}

function startCountdown() {
  clearInterval(intervalId)
  resetCountdown()
  intervalId = setInterval(() => {
    countdown--
    countdownEl.textContent = countdown
    if (countdown <= 0) {
      refresh()
    }
  }, 1000)
}

async function refresh() {
  refreshBtn.style.opacity = '0.5'
  const data = await fetchStatus()
  renderStatus(data)
  refreshBtn.style.opacity = ''
  startCountdown()
}

refreshBtn.addEventListener('click', refresh)

// ── Initial load ──────────────────────────────────────────────────────────────
refresh()
