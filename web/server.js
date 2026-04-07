'use strict'

const http = require('http')
const net = require('net')
const path = require('path')
const fs = require('fs')

const PORT = parseInt(process.env.PORT || '8080', 10)
const MC_HOST = process.env.MC_HOST || 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT || '25565', 10)
const PUBLIC_DIR = path.join(__dirname, 'public')

// ---------------------------------------------------------------------------
// Minecraft Server List Ping (SLP) — modern protocol (1.7+)
// Adapted from launcher/src/server-ping.js
// ---------------------------------------------------------------------------

function writeVarInt(value) {
  const bytes = []
  while (true) {
    if ((value & ~0x7F) === 0) { bytes.push(value); break }
    bytes.push((value & 0x7F) | 0x80)
    value >>>= 7
  }
  return Buffer.from(bytes)
}

function readVarInt(buffer, offset) {
  let value = 0, length = 0, currentByte
  do {
    if (offset >= buffer.length) throw new Error('VarInt: buffer underflow')
    currentByte = buffer[offset++]
    value |= (currentByte & 0x7F) << (length * 7)
    if (++length > 5) throw new Error('VarInt: too long')
  } while ((currentByte & 0x80) !== 0)
  return { value, bytesRead: length }
}

function buildPacket(packetId, payload) {
  const idBuf = writeVarInt(packetId)
  const data = payload ? Buffer.concat([idBuf, payload]) : idBuf
  return Buffer.concat([writeVarInt(data.length), data])
}

function buildHandshake(host, port) {
  const hostBuf = Buffer.from(host, 'utf8')
  const portBuf = Buffer.alloc(2)
  portBuf.writeUInt16BE(port)
  return buildPacket(0x00, Buffer.concat([
    writeVarInt(-1), writeVarInt(hostBuf.length), hostBuf, portBuf, writeVarInt(1)
  ]))
}

function tryParseResponse(buffer) {
  let offset = 0
  const pktLen = readVarInt(buffer, offset); offset += pktLen.bytesRead
  if (buffer.length < offset + pktLen.value) return null
  const pktId = readVarInt(buffer, offset); offset += pktId.bytesRead
  if (pktId.value !== 0x00) throw new Error(`Unexpected packet ID: ${pktId.value}`)
  const strLen = readVarInt(buffer, offset); offset += strLen.bytesRead
  return JSON.parse(buffer.slice(offset, offset + strLen.value).toString('utf8'))
}

function pingServer(host, port, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false
    let buffer = Buffer.alloc(0)
    const socket = net.createConnection({ host, port }, () => {
      socket.write(buildHandshake(host, port))
      socket.write(buildPacket(0x00, Buffer.alloc(0)))
    })
    socket.setTimeout(timeoutMs)
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk])
      try {
        const result = tryParseResponse(buffer)
        if (result) { settled = true; socket.destroy(); resolve(result) }
      } catch (e) { settled = true; socket.destroy(); reject(e) }
    })
    socket.on('timeout', () => { if (!settled) { settled = true; socket.destroy(); reject(new Error('timeout')) } })
    socket.on('error', err => { if (!settled) { settled = true; reject(err) } })
    socket.on('close', () => { if (!settled) { settled = true; reject(new Error('connection closed')) } })
  })
}

function motdToText(description) {
  if (!description) return ''
  if (typeof description === 'string') return description
  let text = description.text || ''
  if (Array.isArray(description.extra)) {
    text += description.extra.map(p => typeof p === 'string' ? p : p.text || '').join('')
  }
  return text.replace(/§[0-9a-fk-or]/gi, '').trim()
}

// ---------------------------------------------------------------------------
// Minimal HTTP server (no framework dependency needed for routing)
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname === '/api/status') {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-cache')
    try {
      const status = await pingServer(MC_HOST, MC_PORT)
      const players = status.players || {}
      const sample = Array.isArray(players.sample)
        ? players.sample.map(p => p.name).filter(Boolean)
        : []
      res.end(JSON.stringify({
        online: true,
        motd: motdToText(status.description),
        version: status.version ? status.version.name : null,
        players: {
          online: players.online || 0,
          max: players.max || 0,
          list: sample,
        },
      }))
    } catch {
      res.end(JSON.stringify({ online: false, players: { online: 0, max: 0, list: [] } }))
    }
    return
  }

  // Serve static files
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname
  filePath = path.join(PUBLIC_DIR, filePath)

  // Security: prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end(); return
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') { res.writeHead(404); res.end('Not found') }
      else { res.writeHead(500); res.end('Server error') }
      return
    }
    const ext = path.extname(filePath)
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
    res.end(data)
  })
})

server.listen(PORT, () => {
  console.log(`Minecraft status dashboard running on http://0.0.0.0:${PORT}`)
})
