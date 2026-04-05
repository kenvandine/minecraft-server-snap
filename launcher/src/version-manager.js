'use strict'

const https = require('https')
const http = require('http')
const fs = require('fs')
const fsp = require('fs').promises
const path = require('path')
const { spawn } = require('child_process')

const STATE_FILE = 'pack-state.json'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'MinecraftLauncher/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`GitHub API returned ${res.statusCode}`))
      }
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)) }
      })
    }).on('error', reject)
  })
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    fsp.mkdir(path.dirname(dest), { recursive: true }).then(() => {
      const mod = url.startsWith('https') ? https : http
      mod.get(url, { headers: { 'User-Agent': 'MinecraftLauncher/1.0', Accept: 'application/octet-stream' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const out = fs.createWriteStream(dest + '.tmp')
        res.on('data', (chunk) => {
          received += chunk.length
          if (onProgress && total) onProgress(received / total)
        })
        res.pipe(out)
        out.on('finish', () => {
          fs.rename(dest + '.tmp', dest, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })
        out.on('error', reject)
      }).on('error', reject)
    }).catch(reject)
  })
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'MinecraftLauncher/1.0', Accept: 'application/octet-stream' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

class VersionManager {
  constructor(resourcesPath, userDataPath, bundledManifest) {
    this.resourcesPath = resourcesPath
    this.userDataPath = userDataPath
    this.bundledManifest = bundledManifest
    this.packsDir = path.join(userDataPath, 'game', 'packs')
    this.statePath = path.join(userDataPath, STATE_FILE)
    this._state = null
  }

  async _loadState() {
    if (this._state) return this._state
    try {
      const raw = await fsp.readFile(this.statePath, 'utf8')
      this._state = JSON.parse(raw)
    } catch {
      this._state = {
        activeVersion: this.bundledManifest.version,
        cachedReleases: [],
        lastFetchedAt: null,
      }
    }
    return this._state
  }

  async _saveState() {
    await fsp.writeFile(this.statePath, JSON.stringify(this._state, null, 2))
  }

  async getActiveVersion() {
    const state = await this._loadState()
    return state.activeVersion
  }

  async getActiveManifest() {
    const state = await this._loadState()
    const version = state.activeVersion

    // Check for a downloaded pack manifest
    const packManifest = path.join(this.packsDir, version, 'manifest.json')
    try {
      const raw = await fsp.readFile(packManifest, 'utf8')
      return JSON.parse(raw)
    } catch {
      // Fall back to bundled
      return this.bundledManifest
    }
  }

  /**
   * Fetch releases from GitHub API for the configured repo.
   * Returns array of { tag, version, publishedAt, clientAssetUrl, packYamlUrl }.
   */
  async fetchReleases() {
    const repo = this.bundledManifest.github_repo
    if (!repo) return []

    const state = await this._loadState()

    // Use cache if fresh enough
    if (state.lastFetchedAt && (Date.now() - new Date(state.lastFetchedAt).getTime()) < CACHE_TTL_MS) {
      return state.cachedReleases
    }

    const releases = await fetchJson(`https://api.github.com/repos/${repo}/releases`)

    const parsed = releases
      .filter(r => !r.draft)
      .map(r => {
        const clientAsset = r.assets.find(a => a.name === 'client.tar.xz')
        const packYamlAsset = r.assets.find(a => a.name === 'pack.yaml')
        if (!clientAsset) return null
        return {
          tag: r.tag_name,
          version: r.tag_name.replace(/^v/, ''),
          publishedAt: r.published_at,
          clientAssetUrl: clientAsset.url, // API URL, needs Accept header
          clientBrowserUrl: clientAsset.browser_download_url,
          packYamlUrl: packYamlAsset ? packYamlAsset.url : null,
          packYamlBrowserUrl: packYamlAsset ? packYamlAsset.browser_download_url : null,
        }
      })
      .filter(Boolean)

    state.cachedReleases = parsed
    state.lastFetchedAt = new Date().toISOString()
    await this._saveState()

    return parsed
  }

  /**
   * Get all available versions: bundled + remote releases.
   */
  async getAvailableVersions() {
    const state = await this._loadState()
    const releases = state.cachedReleases || []

    const versions = []
    const seen = new Set()

    // Bundled version is always first
    versions.push({
      version: this.bundledManifest.version,
      tag: `v${this.bundledManifest.version}`,
      bundled: true,
      installed: true,
    })
    seen.add(this.bundledManifest.version)

    // Remote versions
    for (const r of releases) {
      if (seen.has(r.version)) continue
      seen.add(r.version)
      const packDir = path.join(this.packsDir, r.version)
      versions.push({
        version: r.version,
        tag: r.tag,
        bundled: false,
        installed: fs.existsSync(path.join(packDir, 'manifest.json')),
        publishedAt: r.publishedAt,
      })
    }

    return versions
  }

  /**
   * Switch to a specific pack version. Downloads if not already cached locally.
   */
  async switchVersion(version, onProgress) {
    const report = (stage, pct) => onProgress && onProgress({ stage, pct })

    const state = await this._loadState()
    const packDir = path.join(this.packsDir, version)
    const packManifest = path.join(packDir, 'manifest.json')

    // If this is the bundled version, set up from resources
    if (version === this.bundledManifest.version) {
      await this._installBundledPack(version, report)
      state.activeVersion = version
      await this._saveState()
      return await this.getActiveManifest()
    }

    // If already downloaded, just activate
    if (fs.existsSync(packManifest)) {
      report('Activating pack...', 90)
      state.activeVersion = version
      await this._saveState()
      return await this.getActiveManifest()
    }

    // Find the release info
    const release = (state.cachedReleases || []).find(r => r.version === version)
    if (!release) throw new Error(`Version ${version} not found in releases`)

    report('Downloading pack...', 0)

    // Download client.tar.xz
    await fsp.mkdir(packDir, { recursive: true })
    const archivePath = path.join(packDir, 'client.tar.xz')
    await downloadFile(release.clientBrowserUrl, archivePath, (p) => {
      report('Downloading pack...', Math.round(p * 70))
    })

    // Extract client.tar.xz
    report('Extracting pack...', 70)
    await this._extractTarXz(archivePath, packDir)

    // Clean up the archive
    await fsp.unlink(archivePath).catch(() => {})

    // Download pack.yaml if available
    if (release.packYamlBrowserUrl) {
      report('Fetching pack config...', 85)
      try {
        const yaml = await fetchText(release.packYamlBrowserUrl)
        await fsp.writeFile(path.join(packDir, 'pack.yaml'), yaml)
      } catch { /* optional, don't fail */ }
    }

    report('Activating pack...', 90)
    state.activeVersion = version
    await this._saveState()

    report('Ready!', 100)
    return await this.getActiveManifest()
  }

  /**
   * Install the bundled pack into the packs directory.
   */
  async _installBundledPack(version, report) {
    const packDir = path.join(this.packsDir, version)
    await fsp.mkdir(path.join(packDir, 'mods'), { recursive: true })

    report('Installing bundled pack...', 10)

    // Copy manifest
    const manifestSrc = path.join(this.resourcesPath, 'manifest.json')
    await fsp.copyFile(manifestSrc, path.join(packDir, 'manifest.json'))

    // Copy mods
    const srcModsDir = path.join(this.resourcesPath, 'mods')
    if (fs.existsSync(srcModsDir)) {
      const files = await fsp.readdir(srcModsDir)
      for (const file of files) {
        if (!file.endsWith('.jar')) continue
        await fsp.copyFile(
          path.join(srcModsDir, file),
          path.join(packDir, 'mods', file)
        )
      }
    }

    // Copy shaderpacks
    const srcShadersDir = path.join(this.resourcesPath, 'shaderpacks')
    if (fs.existsSync(srcShadersDir)) {
      await fsp.mkdir(path.join(packDir, 'shaderpacks'), { recursive: true })
      const files = await fsp.readdir(srcShadersDir)
      for (const file of files) {
        if (!file.endsWith('.zip')) continue
        await fsp.copyFile(
          path.join(srcShadersDir, file),
          path.join(packDir, 'shaderpacks', file)
        )
      }
    }

    report('Ready!', 100)
  }

  /**
   * Sync the active pack's mods and shaders into the instance directory.
   * Removes files not in the active pack.
   */
  async activatePack(instanceDir) {
    const state = await this._loadState()
    const version = state.activeVersion
    const packDir = path.join(this.packsDir, version)

    // Ensure bundled pack is set up
    if (!fs.existsSync(path.join(packDir, 'manifest.json'))) {
      await this._installBundledPack(version, () => {})
    }

    // Sync mods
    const modsDir = path.join(instanceDir, 'mods')
    await fsp.mkdir(modsDir, { recursive: true })
    const packModsDir = path.join(packDir, 'mods')

    if (fs.existsSync(packModsDir)) {
      const packMods = (await fsp.readdir(packModsDir)).filter(f => f.endsWith('.jar'))
      const packModSet = new Set(packMods)

      // Copy new mods
      for (const file of packMods) {
        const dest = path.join(modsDir, file)
        if (!fs.existsSync(dest)) {
          await fsp.copyFile(path.join(packModsDir, file), dest)
        }
      }

      // Remove old mods
      const installedMods = (await fsp.readdir(modsDir)).filter(f => f.endsWith('.jar'))
      for (const file of installedMods) {
        if (!packModSet.has(file)) {
          await fsp.unlink(path.join(modsDir, file))
        }
      }
    }

    // Sync shaderpacks
    const shaderpacksDir = path.join(instanceDir, 'shaderpacks')
    await fsp.mkdir(shaderpacksDir, { recursive: true })
    const packShadersDir = path.join(packDir, 'shaderpacks')

    if (fs.existsSync(packShadersDir)) {
      const packShaders = (await fsp.readdir(packShadersDir)).filter(f => f.endsWith('.zip'))
      const packShaderSet = new Set(packShaders)

      for (const file of packShaders) {
        const dest = path.join(shaderpacksDir, file)
        if (!fs.existsSync(dest)) {
          await fsp.copyFile(path.join(packShadersDir, file), dest)
        }
      }

      const installedShaders = (await fsp.readdir(shaderpacksDir)).filter(f => f.endsWith('.zip'))
      for (const file of installedShaders) {
        if (!packShaderSet.has(file)) {
          await fsp.unlink(path.join(shaderpacksDir, file))
        }
      }
    }
  }

  /**
   * Extract a .tar.xz archive using system tar.
   */
  _extractTarXz(archivePath, destDir) {
    return new Promise((resolve, reject) => {
      const args = ['-xJf', archivePath, '-C', destDir]
      // --no-same-owner is only supported on Linux/macOS, not Windows tar
      if (process.platform !== 'win32') {
        args.push('--no-same-owner')
      }
      const proc = spawn('tar', args)
      proc.on('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`tar exited with code ${code}`))
      })
      proc.on('error', reject)
    })
  }
}

module.exports = VersionManager
