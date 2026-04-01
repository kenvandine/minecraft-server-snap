'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('launcher', {
  getManifest: () => ipcRenderer.invoke('app:manifest'),
  quit: () => ipcRenderer.invoke('app:quit'),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),

  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    onDeviceCode: (cb) => ipcRenderer.on('auth:device-code', (_e, data) => cb(data)),
  },

  game: {
    status: () => ipcRenderer.invoke('game:status'),
    install: () => ipcRenderer.invoke('game:install'),
    launch: () => ipcRenderer.invoke('game:launch'),
    onProgress: (cb) => ipcRenderer.on('game:progress', (_e, data) => cb(data)),
    onEvent: (cb) => ipcRenderer.on('game:event', (_e, data) => cb(data)),
  },
})
