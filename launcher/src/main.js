'use strict'

const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const GameManager = require('./game-manager')
const VersionManager = require('./version-manager')
const Auth = require('./auth')
const { pingServer, parsePackFromStatus } = require('./server-ping')

// Enable Wayland support on Linux — auto-selects Wayland when WAYLAND_DISPLAY
// is set, falls back to X11 otherwise. Must be called before app.whenReady().
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations')
}

const resourcesPath = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..', 'resources')
const manifest = require(path.join(resourcesPath, 'manifest.json'))

let mainWindow
let splashWindow
const versionManager = new VersionManager(resourcesPath, app.getPath('userData'), manifest)
const gameManager = new GameManager(resourcesPath, app.getPath('userData'), manifest, versionManager)
const auth = new Auth(manifest.azure_client_id, app.getPath('userData'))

// ── Player settings ──────────────────────────────────────────────────────────

const settingsPath = path.join(app.getPath('userData'), 'player-settings.json')

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    return {}
  }
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 800,
    height: 450,
    frame: false,
    resizable: false,
    center: true,
    transparent: true,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'))
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    resizable: false,
    frame: false,
    show: false,
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    backgroundColor: manifest.background_color || '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close()
      splashWindow = null
    }
    mainWindow.show()
  })
}

app.whenReady().then(() => {
  createSplashWindow()
  // Give the splash a moment to render before starting the heavier main window
  setTimeout(createMainWindow, 400)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('app:manifest', () => versionManager.getActiveManifest())

ipcMain.handle('auth:restore', () => auth.restore())
ipcMain.handle('auth:status', () => auth.getStatus())

ipcMain.handle('auth:login', async () => {
  return auth.login((deviceCode) => {
    mainWindow.webContents.send('auth:device-code', deviceCode)
  })
})

ipcMain.handle('auth:offline-login', (_e, username) => auth.offlineLogin(username))

ipcMain.handle('auth:logout', () => {
  auth.logout()
  return { ok: true }
})

ipcMain.handle('game:status', () => gameManager.getStatus())

ipcMain.handle('game:install', async () => {
  return gameManager.install((progress) => {
    mainWindow.webContents.send('game:progress', progress)
  })
})

ipcMain.handle('game:launch', async () => {
  const authProfile = auth.getProfile()
  if (!authProfile) throw new Error('Not authenticated')
  const playerSettings = loadSettings()
  return gameManager.launch(authProfile, (event) => {
    mainWindow.webContents.send('game:event', event)
  }, playerSettings)
})

ipcMain.handle('settings:get', () => loadSettings())
ipcMain.handle('settings:save', (_e, settings) => {
  saveSettings(settings)
  return { ok: true }
})

ipcMain.handle('versions:list', () => versionManager.getAvailableVersions())
ipcMain.handle('versions:active', () => versionManager.getActiveVersion())
ipcMain.handle('versions:switch', async (_e, version) => {
  return versionManager.switchVersion(version, (progress) => {
    mainWindow.webContents.send('versions:progress', progress)
  })
})
ipcMain.handle('versions:fetch', () => versionManager.fetchReleases())

ipcMain.handle('server:ping', async () => {
  const currentManifest = await versionManager.getActiveManifest()
  if (!currentManifest.server) return { online: false, error: 'No server configured' }
  const host = currentManifest.server
  const port = currentManifest.port || 25565
  try {
    const status = await pingServer(host, port)
    const packInfo = parsePackFromStatus(status)
    return {
      online: true,
      host,
      port,
      players: status.players,
      version: status.version,
      ...packInfo,
    }
  } catch (err) {
    return { online: false, error: err.message }
  }
})

ipcMain.handle('app:quit', () => app.quit())

ipcMain.handle('shell:open', (_e, url) => shell.openExternal(url))
