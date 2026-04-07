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
const packNameEl    = document.getElementById('pack-name')
const packVersionEl = document.getElementById('pack-version')
const statusInd     = document.getElementById('status-indicator')
const statusLabel   = document.getElementById('status-label')
const statusText    = document.getElementById('status-text')
const versionText   = document.getElementById('version-text')
const playerCount   = document.getElementById('player-count')
const playerList    = document.getElementById('player-list')
const versionRow    = document.getElementById('version-row')
const countdownEl   = document.getElementById('countdown')
const refreshBtn    = document.getElementById('refresh-btn')

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
  document.querySelector('.offline-banner')?.remove()

  if (data.offline) {
    const banner = document.createElement('div')
    banner.className = 'offline-banner'
    banner.textContent = 'You are offline — showing last known state'
    document.querySelector('main').prepend(banner)
  }

  // Dynamic title: use pack name from MOTD if available
  const title = data.packName || 'Minecraft Server'
  packNameEl.textContent = title
  document.title = title

  packVersionEl.textContent = data.packVersion ? `v${data.packVersion}` : ''

  // Status indicator + label (in hero badge)
  statusInd.className = 'indicator ' + (data.online ? 'online' : 'offline')
  statusLabel.textContent = data.online ? 'Online' : 'Offline'

  // Status card
  statusText.textContent = data.online ? 'Online' : 'Offline'
  statusText.className = 'info-value ' + (data.online ? 'online-text' : 'offline-text')

  if (data.version) {
    versionText.textContent = data.version
    versionRow.style.display = ''
  } else {
    versionRow.style.display = 'none'
  }

  const players = data.players || { online: 0, max: 0, list: [] }
  playerCount.textContent = data.online
    ? `${players.online} / ${players.max}`
    : '—'

  // Player list
  playerList.innerHTML = ''
  if (!data.online) {
    playerList.innerHTML = '<li class="dim">Server is offline</li>'
  } else if (players.list && players.list.length > 0) {
    players.list.forEach(name => {
      const li = document.createElement('li')
      li.className = 'player-name'
      li.textContent = name
      playerList.appendChild(li)
    })
    if (players.online > players.list.length) {
      const li = document.createElement('li')
      li.className = 'dim'
      li.textContent = `…and ${players.online - players.list.length} more`
      playerList.appendChild(li)
    }
  } else if (players.online === 0) {
    playerList.innerHTML = '<li class="dim">No players online</li>'
  } else {
    playerList.innerHTML = '<li class="dim">Player list not available</li>'
  }
}

// ── Auto-refresh countdown ────────────────────────────────────────────────────
const REFRESH_INTERVAL = 15
let countdown = REFRESH_INTERVAL
let intervalId = null

function startCountdown() {
  clearInterval(intervalId)
  countdown = REFRESH_INTERVAL
  countdownEl.textContent = countdown
  intervalId = setInterval(() => {
    countdown--
    countdownEl.textContent = countdown
    if (countdown <= 0) refresh()
  }, 1000)
}

async function refresh() {
  refreshBtn.classList.add('spinning')
  const data = await fetchStatus()
  renderStatus(data)
  refreshBtn.classList.remove('spinning')
  startCountdown()
}

refreshBtn.addEventListener('click', refresh)

// ── Initial load ──────────────────────────────────────────────────────────────
refresh()
