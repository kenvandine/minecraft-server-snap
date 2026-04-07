const CACHE_NAME = 'mc-status-v2'
const APP_SHELL = ['/', '/app.js', '/style.css', '/manifest.json', '/icons/icon.svg', '/assets/shadowninjagames.png']

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Always fetch /api/status from network; fall back to offline response
  if (url.pathname === '/api/status') {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ online: false, offline: true, players: { online: 0, max: 0, list: [] } }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )
    return
  }

  // For everything else: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  )
})
