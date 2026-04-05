'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('launcher', {
  getManifest: () => ipcRenderer.invoke('app:manifest'),
  quit: () => ipcRenderer.invoke('app:quit'),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),

  auth: {
    restore: () => ipcRenderer.invoke('auth:restore'),
    status: () => ipcRenderer.invoke('auth:status'),
    login: () => ipcRenderer.invoke('auth:login'),
    offlineLogin: (username) => ipcRenderer.invoke('auth:offline-login', username),
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

  versions: {
    list: () => ipcRenderer.invoke('versions:list'),
    active: () => ipcRenderer.invoke('versions:active'),
    switch: (version) => ipcRenderer.invoke('versions:switch', version),
    fetch: () => ipcRenderer.invoke('versions:fetch'),
    onProgress: (cb) => ipcRenderer.on('versions:progress', (_e, data) => cb(data)),
  },
})
