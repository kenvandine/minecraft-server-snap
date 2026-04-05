'use strict'

const net = require('net')

/**
 * Minecraft Server List Ping (SLP) — modern protocol (1.7+).
 *
 * Connects to a Minecraft server, sends a handshake + status request,
 * and returns the JSON status response which includes MOTD, version,
 * player count, etc.
 *
 * Reference: https://minecraft.wiki/w/Minecraft_Wiki:Projects/wiki.vg_merge/Server_List_Ping
 */

function writeVarInt(value) {
  const bytes = []
  while (true) {
    if ((value & ~0x7F) === 0) {
      bytes.push(value)
      break
    }
    bytes.push((value & 0x7F) | 0x80)
    value >>>= 7
  }
  return Buffer.from(bytes)
}

function readVarInt(buffer, offset) {
  let value = 0
  let length = 0
  let currentByte
  do {
    if (offset >= buffer.length) throw new Error('VarInt: buffer underflow')
    currentByte = buffer[offset++]
    value |= (currentByte & 0x7F) << (length * 7)
    length++
    if (length > 5) throw new Error('VarInt: too long')
  } while ((currentByte & 0x80) !== 0)
  return { value, bytesRead: length }
}

function buildPacket(packetId, payload) {
  const idBuf = writeVarInt(packetId)
  const data = payload ? Buffer.concat([idBuf, payload]) : idBuf
  const lengthBuf = writeVarInt(data.length)
  return Buffer.concat([lengthBuf, data])
}

function buildHandshake(host, port) {
  const parts = []
  // Protocol version (-1 = any, or use a modern one like 769 for 1.21.x)
  parts.push(writeVarInt(-1))
  // Server address (string: varint length + utf8)
  const hostBuf = Buffer.from(host, 'utf8')
  parts.push(writeVarInt(hostBuf.length))
  parts.push(hostBuf)
  // Port (unsigned short, big-endian)
  const portBuf = Buffer.alloc(2)
  portBuf.writeUInt16BE(port)
  parts.push(portBuf)
  // Next state: 1 = status
  parts.push(writeVarInt(1))
  return buildPacket(0x00, Buffer.concat(parts))
}

function buildStatusRequest() {
  return buildPacket(0x00, Buffer.alloc(0))
}

/**
 * Ping a Minecraft server and return its status.
 *
 * @param {string} host - Server hostname or IP
 * @param {number} [port=25565] - Server port
 * @param {number} [timeoutMs=5000] - Connection timeout
 * @returns {Promise<Object>} Server status JSON (version, players, description, etc.)
 */
function pingServer(host, port = 25565, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false
    let buffer = Buffer.alloc(0)

    const socket = net.createConnection({ host, port }, () => {
      socket.write(buildHandshake(host, port))
      socket.write(buildStatusRequest())
    })

    socket.setTimeout(timeoutMs)

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      try {
        const result = tryParseResponse(buffer)
        if (result) {
          settled = true
          socket.destroy()
          resolve(result)
        }
      } catch (e) {
        settled = true
        socket.destroy()
        reject(e)
      }
    })

    socket.on('timeout', () => {
      if (!settled) { settled = true; socket.destroy(); reject(new Error('Connection timed out')) }
    })
    socket.on('error', (err) => {
      if (!settled) { settled = true; reject(err) }
    })
    socket.on('close', () => {
      if (!settled) { settled = true; reject(new Error('Connection closed before response')) }
    })
  })
}

function tryParseResponse(buffer) {
  let offset = 0

  // Read packet length
  const pktLen = readVarInt(buffer, offset)
  offset += pktLen.bytesRead

  // Check if we have the full packet yet
  if (buffer.length < offset + pktLen.value) return null

  // Read packet ID
  const pktId = readVarInt(buffer, offset)
  offset += pktId.bytesRead
  if (pktId.value !== 0x00) throw new Error(`Unexpected packet ID: ${pktId.value}`)

  // Read JSON string length
  const strLen = readVarInt(buffer, offset)
  offset += strLen.bytesRead

  // Read JSON string
  const json = buffer.slice(offset, offset + strLen.value).toString('utf8')
  return JSON.parse(json)
}

/**
 * Parse pack name and version from a server MOTD.
 * Expects format: "PackName vX.Y.Z" (as set by install-pack.sh).
 *
 * @param {Object} status - Server status from pingServer()
 * @returns {{ packName: string|null, packVersion: string|null }}
 */
function parsePackFromStatus(status) {
  let motdText = ''

  if (!status || !status.description) return { packName: null, packVersion: null }

  // MOTD can be a string or a chat component object
  if (typeof status.description === 'string') {
    motdText = status.description
  } else if (status.description.text != null) {
    motdText = status.description.text
    // Append any "extra" components
    if (Array.isArray(status.description.extra)) {
      for (const part of status.description.extra) {
        motdText += (typeof part === 'string' ? part : part.text || '')
      }
    }
  }

  // Strip Minecraft formatting codes (§x)
  motdText = motdText.replace(/§[0-9a-fk-or]/gi, '').trim()

  // Match "PackName vX.Y.Z" pattern
  const match = motdText.match(/^(.+?)\s+v(\d+\.\d+\.\d+.*)$/)
  if (match) {
    return { packName: match[1].trim(), packVersion: match[2].trim() }
  }

  return { packName: null, packVersion: null, motd: motdText }
}

module.exports = { pingServer, parsePackFromStatus }
