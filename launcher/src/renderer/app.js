'use strict'

let manifest = null
let gameInstalled = false
let authenticated = false
let logLines = []

async function init() {
  manifest = await launcher.getManifest()

  // Apply branding
  document.getElementById('game-title').textContent = manifest.name
  document.title = manifest.name
  document.getElementById('version-badge').textContent =
    `Minecraft ${manifest.minecraft_version} · Fabric ${manifest.mod_loader_version}`

  if (manifest.background_color) {
    document.getElementById('hero').style.background =
      `linear-gradient(135deg, ${manifest.background_color} 0%, #1c2333 100%)`
  }

  // Populate mod list
  refreshModList(manifest.mods)

  // Server status — only show if server is configured
  if (manifest.server) {
    document.getElementById('server-status').classList.remove('hidden')
    pingServerStatus()
    // Refresh server status every 60 seconds
    setInterval(pingServerStatus, 60000)
  }

  // Version selector — only show if github_repo is configured
  if (manifest.github_repo) {
    const activeVersion = await launcher.versions.active()
    const versions = await launcher.versions.list()
    populateVersionDropdown(versions, activeVersion)
    document.getElementById('version-selector').classList.remove('hidden')

    // Fetch fresh releases in the background
    launcher.versions.fetch().then(async () => {
      const freshVersions = await launcher.versions.list()
      const current = await launcher.versions.active()
      populateVersionDropdown(freshVersions, current)
    }).catch(() => {})
  }

  // Pre-fill saved offline username
  const savedUsername = localStorage.getItem('offline-username')
  if (savedUsername) document.getElementById('offline-username').value = savedUsername

  // Try to restore a cached session before showing the login UI
  if (manifest.azure_client_id) {
    await launcher.auth.restore()
  }

  const authStatus = await launcher.auth.status()
  updateAuthUI(authStatus)

  // Check game install
  const gameStatus = await launcher.game.status()
  gameInstalled = gameStatus.installed
  updatePlayBtn()

  // If not installed, start install automatically
  if (!gameInstalled) {
    installGame()
  }

  // Wire up events
  launcher.auth.onDeviceCode(showDeviceCode)
  launcher.game.onProgress(updateProgress)
  launcher.game.onEvent(handleGameEvent)
}

function updateAuthUI(status) {
  authenticated = status.authenticated
  const hasOnlineAuth = manifest && manifest.azure_client_id

  document.getElementById('account-info').classList.toggle('hidden', !status.authenticated)
  if (status.authenticated) {
    document.getElementById('account-name').textContent = status.username
    document.getElementById('online-auth').classList.add('hidden')
    document.getElementById('offline-section').classList.add('hidden')
  } else if (hasOnlineAuth) {
    document.getElementById('online-auth').classList.remove('hidden')
    document.getElementById('offline-section').classList.add('hidden')
  } else {
    document.getElementById('offline-section').classList.remove('hidden')
  }
  updatePlayBtn()
}

function updatePlayBtn() {
  const btn = document.getElementById('btn-play')
  btn.disabled = !gameInstalled || !authenticated
}

async function installGame() {
  document.getElementById('btn-play').disabled = true
  showProgress('Preparing game...', 0)
  try {
    await launcher.game.install()
    gameInstalled = true
    hideProgress()
    setStatus('Ready to play!')
    updatePlayBtn()
  } catch (e) {
    setStatus(`Install failed: ${e.message}`)
  }
}

function updateProgress({ stage, pct }) {
  showProgress(stage, pct)
}

function showProgress(label, pct) {
  document.getElementById('progress-label').classList.remove('hidden')
  document.getElementById('progress-label').textContent = label
  document.getElementById('progress-bar-wrap').classList.remove('hidden')
  document.getElementById('progress-bar').style.width = `${pct}%`
}

function hideProgress() {
  document.getElementById('progress-label').classList.add('hidden')
  document.getElementById('progress-bar-wrap').classList.add('hidden')
  document.getElementById('progress-bar').style.width = '0%'
}

function setStatus(msg) {
  document.getElementById('status-msg').textContent = msg
}

function showDeviceCode({ userCode, verificationUri }) {
  document.getElementById('device-code-section').classList.remove('hidden')
  document.getElementById('device-code').textContent = userCode
  document.getElementById('verification-url').textContent = verificationUri
  document.getElementById('btn-open-url').onclick = () => launcher.openExternal(verificationUri)
}

function hideDeviceCode() {
  document.getElementById('device-code-section').classList.add('hidden')
}

function handleGameEvent({ type, code, data }) {
  if (type === 'launching') {
    logLines = []
    document.getElementById('log-content').textContent = ''
    setStatus('Game launched!')
    document.getElementById('btn-play').textContent = 'PLAYING...'
    document.getElementById('btn-play').disabled = true
  }
  if (type === 'log') {
    logLines.push(data)
    const el = document.getElementById('log-content')
    el.textContent += data
    el.scrollTop = el.scrollHeight
  }
  if (type === 'exited') {
    document.getElementById('btn-play').textContent = 'PLAY'
    updatePlayBtn()
    setStatus(code === 0 ? 'Game closed.' : `Game exited (code ${code})`)
  }
}

function refreshModList(mods) {
  const ul = document.getElementById('mods-ul')
  ul.innerHTML = ''
  for (const mod of mods || []) {
    const li = document.createElement('li')
    li.textContent = mod.name
    ul.appendChild(li)
  }
}

async function pingServerStatus() {
  const indicator = document.getElementById('server-indicator')
  const label = document.getElementById('server-label')
  const packInfo = document.getElementById('server-pack-info')
  const packVersion = document.getElementById('server-pack-version')
  const playersDiv = document.getElementById('server-players')
  const playerCount = document.getElementById('server-player-count')

  label.textContent = 'Checking server...'
  indicator.className = 'indicator offline'

  try {
    const status = await launcher.server.ping()
    if (status.online) {
      indicator.className = 'indicator online'
      label.textContent = 'Online'

      if (status.packName && status.packVersion) {
        packInfo.classList.remove('hidden')
        const activeVersion = await launcher.versions.active()
        if (status.packVersion !== activeVersion) {
          packVersion.textContent = `Server: ${status.packName} v${status.packVersion} (mismatch)`
          packVersion.classList.add('version-mismatch')
        } else {
          packVersion.textContent = `${status.packName} v${status.packVersion}`
          packVersion.classList.remove('version-mismatch')
        }
      } else {
        packInfo.classList.add('hidden')
      }

      if (status.players) {
        playersDiv.classList.remove('hidden')
        playerCount.textContent = `${status.players.online} / ${status.players.max} players`
      }
    } else {
      indicator.className = 'indicator offline'
      label.textContent = 'Offline'
      packInfo.classList.add('hidden')
      playersDiv.classList.add('hidden')
    }
  } catch {
    indicator.className = 'indicator offline'
    label.textContent = 'Unreachable'
    packInfo.classList.add('hidden')
    playersDiv.classList.add('hidden')
  }
}

function populateVersionDropdown(versions, activeVersion) {
  const dropdown = document.getElementById('version-dropdown')
  dropdown.innerHTML = ''
  for (const v of versions) {
    const opt = document.createElement('option')
    opt.value = v.version
    opt.textContent = v.version + (v.bundled ? ' (bundled)' : '')
    if (v.version === activeVersion) opt.selected = true
    dropdown.appendChild(opt)
  }
}

// ── Event listeners ────────────────────────────────────────────────────────────

document.getElementById('version-dropdown').addEventListener('change', async (e) => {
  const version = e.target.value
  document.getElementById('btn-play').disabled = true
  showProgress('Switching version...', 0)
  try {
    const newManifest = await launcher.versions.switch(version)
    manifest = newManifest
    refreshModList(newManifest.mods)
    document.getElementById('version-badge').textContent =
      `Minecraft ${manifest.minecraft_version} · Fabric ${manifest.mod_loader_version}`
    await installGame()
    if (manifest.server) pingServerStatus()
  } catch (err) {
    setStatus(`Version switch failed: ${err.message}`)
    hideProgress()
    updatePlayBtn()
  }
})

document.getElementById('btn-refresh-versions').addEventListener('click', async () => {
  const btn = document.getElementById('btn-refresh-versions')
  btn.classList.add('spinning')
  btn.disabled = true
  try {
    await launcher.versions.fetch()
    const versions = await launcher.versions.list()
    const active = await launcher.versions.active()
    populateVersionDropdown(versions, active)
  } catch (err) {
    setStatus(`Failed to check for updates: ${err.message}`)
  } finally {
    btn.classList.remove('spinning')
    btn.disabled = false
  }
})

launcher.versions.onProgress(updateProgress)

document.getElementById('btn-close').addEventListener('click', () => launcher.quit())

document.getElementById('btn-copy-code').addEventListener('click', () => {
  const code = document.getElementById('device-code').textContent
  navigator.clipboard.writeText(code)
  const btn = document.getElementById('btn-copy-code')
  btn.classList.add('copied')
  document.getElementById('copy-icon').classList.add('hidden')
  document.getElementById('check-icon').classList.remove('hidden')
  setTimeout(() => {
    btn.classList.remove('copied')
    document.getElementById('copy-icon').classList.remove('hidden')
    document.getElementById('check-icon').classList.add('hidden')
  }, 2000)
})

document.getElementById('btn-login').addEventListener('click', async () => {
  document.getElementById('btn-login').disabled = true
  setStatus('Waiting for login...')
  try {
    const profile = await launcher.auth.login()
    hideDeviceCode()
    updateAuthUI({ authenticated: true, username: profile.username })
    setStatus(`Signed in as ${profile.username}`)
  } catch (e) {
    setStatus(`Login failed: ${e.message}`)
    document.getElementById('btn-login').disabled = false
  }
})

document.getElementById('btn-offline-login').addEventListener('click', async () => {
  const username = document.getElementById('offline-username').value.trim()
  if (!username) { setStatus('Enter a username first.'); return }
  localStorage.setItem('offline-username', username)
  const profile = await launcher.auth.offlineLogin(username)
  updateAuthUI({ authenticated: true, username: profile.username })
  setStatus(`Playing offline as ${profile.username}`)
})

document.getElementById('offline-username').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-offline-login').click()
})

document.getElementById('btn-logout').addEventListener('click', async () => {
  await launcher.auth.logout()
  updateAuthUI({ authenticated: false })
  setStatus('Signed out.')
})

document.getElementById('btn-mode-offline').addEventListener('click', () => {
  document.getElementById('online-auth').classList.add('hidden')
  document.getElementById('offline-section').classList.remove('hidden')
  document.getElementById('btn-mode-online').classList.remove('hidden')
})

document.getElementById('btn-mode-online').addEventListener('click', () => {
  document.getElementById('offline-section').classList.add('hidden')
  document.getElementById('online-auth').classList.remove('hidden')
})

document.getElementById('btn-toggle-log').addEventListener('click', () => {
  document.getElementById('log-viewer').classList.remove('hidden')
})

document.getElementById('btn-close-log').addEventListener('click', () => {
  document.getElementById('log-viewer').classList.add('hidden')
})

document.getElementById('btn-copy-log').addEventListener('click', () => {
  const text = document.getElementById('log-content').textContent
  navigator.clipboard.writeText(text)
  const btn = document.getElementById('btn-copy-log')
  const orig = btn.textContent
  btn.textContent = 'Copied!'
  setTimeout(() => { btn.textContent = orig }, 2000)
})

document.getElementById('btn-play').addEventListener('click', async () => {
  try {
    await launcher.game.launch()
  } catch (e) {
    setStatus(`Launch failed: ${e.message}`)
  }
})

init().catch(console.error)
