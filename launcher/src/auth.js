'use strict'

const https = require('https')
const fs = require('fs')
const path = require('path')

// Microsoft OAuth2 endpoints for consumer accounts
const MS_DEVICE_CODE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode'
const MS_TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const XBOX_AUTH_URL = 'https://user.auth.xboxlive.com/user/authenticate'
const XSTS_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize'
const MC_AUTH_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox'
const MC_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile'

function httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : JSON.stringify(body)
    const isJson = typeof body !== 'string'
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': isJson ? 'application/json' : 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
        'Accept': 'application/json',
        ...headers,
      },
    }
    const req = https.request(options, (res) => {
      let raw = ''
      res.on('data', (c) => (raw += c))
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) }
        catch { resolve(raw) }
      })
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 'Accept': 'application/json', ...headers },
    }
    const req = https.request(options, (res) => {
      let raw = ''
      res.on('data', (c) => (raw += c))
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) }
        catch { resolve(raw) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

class Auth {
  constructor(clientId) {
    this.clientId = clientId
    this._profile = null
    this._accessToken = null
    this._tokenExpiry = 0
  }

  getStatus() {
    if (!this._profile) return { authenticated: false }
    const expired = Date.now() > this._tokenExpiry
    return {
      authenticated: !expired,
      username: this._profile.name,
      uuid: this._profile.id,
      expired,
    }
  }

  getProfile() {
    if (!this._profile || Date.now() > this._tokenExpiry) return null
    return {
      username: this._profile.name,
      uuid: this._profile.id,
      accessToken: this._accessToken,
    }
  }

  logout() {
    this._profile = null
    this._accessToken = null
    this._tokenExpiry = 0
  }

  async login(onDeviceCode) {
    if (!this.clientId) {
      throw new Error(
        'No Azure client ID configured. This pack does not support online auth. ' +
        'You can still play on LAN servers in offline mode.'
      )
    }

    // Step 1: Request device code
    const deviceResp = await httpsPost(
      MS_DEVICE_CODE_URL,
      `client_id=${encodeURIComponent(this.clientId)}&scope=XboxLive.signin%20offline_access`
    )
    if (deviceResp.error) throw new Error(`Device code error: ${deviceResp.error_description}`)

    onDeviceCode({
      userCode: deviceResp.user_code,
      verificationUri: deviceResp.verification_uri,
      expiresIn: deviceResp.expires_in,
    })

    // Step 2: Poll for token
    const interval = (deviceResp.interval || 5) * 1000
    const deadline = Date.now() + deviceResp.expires_in * 1000
    let msToken = null

    while (Date.now() < deadline) {
      await sleep(interval)
      const tokenResp = await httpsPost(
        MS_TOKEN_URL,
        `client_id=${encodeURIComponent(this.clientId)}` +
        `&grant_type=urn:ietf:params:oauth:grant-type:device_code` +
        `&device_code=${encodeURIComponent(deviceResp.device_code)}`
      )
      if (tokenResp.access_token) { msToken = tokenResp; break }
      if (tokenResp.error === 'expired_token') throw new Error('Login timed out')
      if (tokenResp.error && tokenResp.error !== 'authorization_pending') {
        throw new Error(`Auth error: ${tokenResp.error_description}`)
      }
    }
    if (!msToken) throw new Error('Login timed out')

    // Step 3: Xbox Live
    const xblResp = await httpsPost(XBOX_AUTH_URL, {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${msToken.access_token}`,
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    })
    const xblToken = xblResp.Token
    const userHash = xblResp.DisplayClaims?.xui?.[0]?.uhs

    // Step 4: XSTS
    const xstsResp = await httpsPost(XSTS_URL, {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT',
    })
    if (xstsResp.XErr) {
      const msg = xstsResp.XErr === 2148916233
        ? 'This Microsoft account does not have an Xbox account.'
        : xstsResp.XErr === 2148916238
        ? 'Child accounts must have parental approval.'
        : `XSTS error: ${xstsResp.XErr}`
      throw new Error(msg)
    }
    const xstsToken = xstsResp.Token

    // Step 5: Minecraft token
    const mcResp = await httpsPost(MC_AUTH_URL, {
      identityToken: `XBL3.0 x=${userHash};${xstsToken}`,
    })
    if (!mcResp.access_token) throw new Error('Failed to get Minecraft access token')
    this._accessToken = mcResp.access_token
    this._tokenExpiry = Date.now() + (mcResp.expires_in || 86400) * 1000

    // Step 6: Minecraft profile
    const profile = await httpsGet(MC_PROFILE_URL, {
      Authorization: `Bearer ${this._accessToken}`,
    })
    if (!profile.id) throw new Error('Failed to get Minecraft profile. Do you own Minecraft Java Edition?')
    this._profile = profile

    return { username: profile.name, uuid: profile.id }
  }
}

module.exports = Auth
