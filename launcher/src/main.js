'use strict'

const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const GameManager = require('./game-manager')
const Auth = require('./auth')

const resourcesPath = process.resourcesPath || path.join(__dirname, '..', 'resources')
const manifest = require(path.join(resourcesPath, 'manifest.json'))

let mainWindow
let splashWindow
const gameManager = new GameManager(resourcesPath, app.getPath('userData'), manifest)
const auth = new Auth(manifest.azure_client_id)

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

ipcMain.handle('app:manifest', () => manifest)

ipcMain.handle('auth:status', () => auth.getStatus())

ipcMain.handle('auth:login', async () => {
  return auth.login((deviceCode) => {
    mainWindow.webContents.send('auth:device-code', deviceCode)
  })
})

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
  return gameManager.launch(authProfile, (event) => {
    mainWindow.webContents.send('game:event', event)
  })
})

ipcMain.handle('app:quit', () => app.quit())

ipcMain.handle('shell:open', (_e, url) => shell.openExternal(url))
