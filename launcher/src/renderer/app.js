'use strict'

let manifest = null
let gameInstalled = false
let authenticated = false

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
  const ul = document.getElementById('mods-ul')
  for (const mod of manifest.mods || []) {
    const li = document.createElement('li')
    li.textContent = mod.name
    ul.appendChild(li)
  }

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

function handleGameEvent({ type, code }) {
  if (type === 'launching') {
    setStatus('Game launched!')
    document.getElementById('btn-play').textContent = 'PLAYING...'
    document.getElementById('btn-play').disabled = true
  }
  if (type === 'exited') {
    document.getElementById('btn-play').textContent = 'PLAY'
    updatePlayBtn()
    setStatus(code === 0 ? 'Game closed.' : `Game exited (code ${code})`)
  }
}

// ── Event listeners ────────────────────────────────────────────────────────────

document.getElementById('btn-close').addEventListener('click', () => launcher.quit())

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

document.getElementById('btn-play').addEventListener('click', async () => {
  try {
    await launcher.game.launch()
  } catch (e) {
    setStatus(`Launch failed: ${e.message}`)
  }
})

init().catch(console.error)
