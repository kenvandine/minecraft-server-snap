'use strict'

const https = require('https')
const http = require('http')
const fs = require('fs')
const fsp = require('fs').promises
const path = require('path')
const os = require('os')
const { spawn } = require('child_process')
const { createHash } = require('crypto')
const { pipeline } = require('stream/promises')

const VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const FABRIC_META = 'https://meta.fabricmc.net/v2'
const JAVA_MANIFEST = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    mod.get(url, { headers: { 'User-Agent': 'MinecraftLauncher/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJson(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error(`JSON parse error for ${url}: ${e.message}`)) }
      })
    }).on('error', reject)
  })
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    fsp.mkdir(path.dirname(dest), { recursive: true }).then(() => {
      const mod = url.startsWith('https') ? https : http
      mod.get(url, { headers: { 'User-Agent': 'MinecraftLauncher/1.0' } }, (res) => {
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

function getMojangPlatform() {
  const p = process.platform
  const a = process.arch
  if (p === 'win32') return a === 'x64' ? 'windows-x64' : 'windows-x86'
  if (p === 'darwin') return a === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  return 'linux'
}

function getLibraryPath(name) {
  const [group, artifact, version] = name.split(':')
  const groupPath = group.replace(/\./g, '/')
  return path.join(groupPath, artifact, version, `${artifact}-${version}.jar`)
}

function rulesMatch(rules) {
  if (!rules || rules.length === 0) return true
  let allow = false
  for (const rule of rules) {
    const match = !rule.os || rule.os.name === getPlatformName()
    if (match) allow = rule.action === 'allow'
  }
  return allow
}

function getPlatformName() {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'osx'
  return 'linux'
}

class GameManager {
  constructor(resourcesPath, userDataPath, manifest) {
    this.resourcesPath = resourcesPath
    this.manifest = manifest
    this.gameDir = path.join(userDataPath, 'game')
    this.versionsDir = path.join(this.gameDir, 'versions')
    this.librariesDir = path.join(this.gameDir, 'libraries')
    this.assetsDir = path.join(this.gameDir, 'assets')
    this.instanceDir = path.join(this.gameDir, 'instance')
    this.javaDir = path.join(userDataPath, 'java')
    this.logsDir = path.join(userDataPath, 'logs')
    this._installed = false
    this._gameProcess = null
  }

  get fabricVersionId() {
    const { minecraft_version, mod_loader_version, installer_version } = this.manifest
    return `fabric-loader-${mod_loader_version}-${minecraft_version}`
  }

  get javaExecutable() {
    const bin = process.platform === 'win32' ? 'javaw.exe' : 'java'
    return path.join(this.javaDir, 'bin', bin)
  }

  getStatus() {
    return {
      installed: this._installed || fs.existsSync(path.join(this.versionsDir, this.fabricVersionId)),
      running: this._gameProcess !== null,
    }
  }

  async install(onProgress) {
    const report = (stage, pct) => onProgress && onProgress({ stage, pct })

    report('Fetching version info...', 0)
    const versionJson = await this._fetchVersionJson()

    report('Checking Java...', 5)
    const javaComponent = versionJson.javaVersion?.component || 'java-runtime-delta'
    await this._ensureJava(javaComponent, (p) => report('Downloading Java...', 5 + p * 20))

    report('Downloading Minecraft client...', 25)
    await this._downloadClient(versionJson, (p) => report('Downloading Minecraft...', 25 + p * 20))

    report('Downloading libraries...', 45)
    await this._downloadLibraries(versionJson, (p) => report('Downloading libraries...', 45 + p * 20))

    report('Downloading assets...', 65)
    await this._downloadAssets(versionJson, (p) => report('Downloading assets...', 65 + p * 20))

    report('Installing Fabric...', 85)
    await this._installFabric()

    report('Installing mods...', 95)
    await this._installMods()
    await this._installShaders()

    this._installed = true
    report('Ready!', 100)
    return { ok: true }
  }

  async _ensureJava(runtimeKey, onProgress) {
    if (fs.existsSync(this.javaExecutable)) return

    const allRuntimes = await fetchJson(JAVA_MANIFEST)
    const platform = getMojangPlatform()
    const platformRuntimes = allRuntimes[platform] || allRuntimes['linux'] || {}

    const runtimeList = platformRuntimes[runtimeKey]
    if (!runtimeList || runtimeList.length === 0) {
      throw new Error(`No Java runtime found for platform ${platform} with component '${runtimeKey}'. Please install Java manually.`)
    }

    const runtimeMeta = await fetchJson(runtimeList[0].manifest.url)
    const files = runtimeMeta.files
    const entries = Object.entries(files)
    let done = 0

    await fsp.mkdir(this.javaDir, { recursive: true })

    for (const [filePath, fileInfo] of entries) {
      const dest = path.join(this.javaDir, filePath)
      if (fileInfo.type === 'directory') {
        await fsp.mkdir(dest, { recursive: true })
      } else if (fileInfo.type === 'file' && fileInfo.downloads?.raw) {
        if (!fs.existsSync(dest)) {
          await downloadFile(fileInfo.downloads.raw.url, dest)
        }
        if (fileInfo.executable) {
          await fsp.chmod(dest, 0o755)
        }
      } else if (fileInfo.type === 'link') {
        const target = path.join(this.javaDir, fileInfo.target)
        try {
          await fsp.symlink(target, dest)
        } catch {}
      }
      done++
      onProgress && onProgress(done / entries.length)
    }
  }

  async _fetchVersionJson() {
    const manifest = await fetchJson(VERSION_MANIFEST)
    const versionEntry = manifest.versions.find((v) => v.id === this.manifest.minecraft_version)
    if (!versionEntry) throw new Error(`Minecraft ${this.manifest.minecraft_version} not found`)
    return fetchJson(versionEntry.url)
  }

  async _downloadClient(versionJson, onProgress) {
    const clientJar = path.join(
      this.versionsDir,
      this.manifest.minecraft_version,
      `${this.manifest.minecraft_version}.jar`
    )
    await fsp.mkdir(path.dirname(clientJar), { recursive: true })

    // Save version JSON
    const versionJsonPath = path.join(
      this.versionsDir,
      this.manifest.minecraft_version,
      `${this.manifest.minecraft_version}.json`
    )
    await fsp.writeFile(versionJsonPath, JSON.stringify(versionJson, null, 2))

    if (!fs.existsSync(clientJar)) {
      await downloadFile(versionJson.downloads.client.url, clientJar, onProgress)
    }
  }

  async _downloadLibraries(versionJson, onProgress) {
    const libs = versionJson.libraries.filter((lib) => rulesMatch(lib.rules))
    let done = 0
    for (const lib of libs) {
      const artifact = lib.downloads?.artifact
      if (!artifact) { done++; continue }
      const dest = path.join(this.librariesDir, artifact.path)
      if (!fs.existsSync(dest)) {
        await downloadFile(artifact.url, dest)
      }
      done++
      onProgress && onProgress(done / libs.length)
    }
  }

  async _downloadAssets(versionJson, onProgress) {
    const assetIndex = versionJson.assetIndex
    const indexPath = path.join(this.assetsDir, 'indexes', `${assetIndex.id}.json`)
    await fsp.mkdir(path.dirname(indexPath), { recursive: true })

    if (!fs.existsSync(indexPath)) {
      await downloadFile(assetIndex.url, indexPath)
    }

    const index = JSON.parse(await fsp.readFile(indexPath, 'utf8'))
    const objects = Object.entries(index.objects)
    let done = 0

    for (const [, { hash }] of objects) {
      const prefix = hash.slice(0, 2)
      const dest = path.join(this.assetsDir, 'objects', prefix, hash)
      if (!fs.existsSync(dest)) {
        const url = `https://resources.download.minecraft.net/${prefix}/${hash}`
        await downloadFile(url, dest)
      }
      done++
      onProgress && onProgress(done / objects.length)
    }
  }

  async _installFabric() {
    const fabricJsonUrl = `${FABRIC_META}/versions/loader` +
      `/${this.manifest.minecraft_version}` +
      `/${this.manifest.mod_loader_version}` +
      `/profile/json`

    const fabricJson = await fetchJson(fabricJsonUrl)
    const versionDir = path.join(this.versionsDir, this.fabricVersionId)
    await fsp.mkdir(versionDir, { recursive: true })
    await fsp.writeFile(
      path.join(versionDir, `${this.fabricVersionId}.json`),
      JSON.stringify(fabricJson, null, 2)
    )

    // Download Fabric-specific libraries
    if (fabricJson.libraries) {
      for (const lib of fabricJson.libraries) {
        if (!lib.url && !lib.downloads?.artifact) continue
        const libPath = getLibraryPath(lib.name)
        const dest = path.join(this.librariesDir, libPath)
        if (fs.existsSync(dest)) continue
        const baseUrl = lib.url || 'https://libraries.minecraft.net/'
        const url = lib.downloads?.artifact?.url || `${baseUrl}${libPath}`
        await downloadFile(url, dest)
      }
    }
  }

  async _installMods() {
    const modsDir = path.join(this.instanceDir, 'mods')
    await fsp.mkdir(modsDir, { recursive: true })

    const srcModsDir = path.join(this.resourcesPath, 'mods')
    if (!fs.existsSync(srcModsDir)) return

    const files = await fsp.readdir(srcModsDir)
    for (const file of files) {
      if (!file.endsWith('.jar')) continue
      const src = path.join(srcModsDir, file)
      const dest = path.join(modsDir, file)
      if (!fs.existsSync(dest)) {
        await fsp.copyFile(src, dest)
      }
    }
  }

  async _installShaders() {
    const shaderpacksDir = path.join(this.instanceDir, 'shaderpacks')
    await fsp.mkdir(shaderpacksDir, { recursive: true })

    const srcShaderpacksDir = path.join(this.resourcesPath, 'shaderpacks')
    if (!fs.existsSync(srcShaderpacksDir)) return

    const files = await fsp.readdir(srcShaderpacksDir)
    for (const file of files) {
      if (!file.endsWith('.zip')) continue
      const src = path.join(srcShaderpacksDir, file)
      const dest = path.join(shaderpacksDir, file)
      if (!fs.existsSync(dest)) {
        await fsp.copyFile(src, dest)
      }
    }
  }

  async launch(authProfile, onEvent) {
    if (this._gameProcess) throw new Error('Game is already running')

    const versionJson = JSON.parse(
      await fsp.readFile(
        path.join(this.versionsDir, this.manifest.minecraft_version, `${this.manifest.minecraft_version}.json`),
        'utf8'
      )
    )
    const fabricJson = JSON.parse(
      await fsp.readFile(
        path.join(this.versionsDir, this.fabricVersionId, `${this.fabricVersionId}.json`),
        'utf8'
      )
    )

    await fsp.mkdir(this.instanceDir, { recursive: true })

    const classpath = this._buildClasspath(versionJson, fabricJson)
    const jvmArgs = this._buildJvmArgs(versionJson, fabricJson)
    const gameArgs = this._buildGameArgs(fabricJson, authProfile, versionJson)

    const java = this.javaExecutable
    const args = [...jvmArgs, fabricJson.mainClass || versionJson.mainClass, ...gameArgs]

    onEvent && onEvent({ type: 'launching' })

    await fsp.mkdir(this.logsDir, { recursive: true })
    const logStream = fs.createWriteStream(path.join(this.logsDir, 'game.log'))
    logStream.write(`=== Session started: ${new Date().toISOString()} ===\n`)

    this._gameProcess = spawn(java, args, {
      cwd: this.instanceDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this._gameProcess.stdout.on('data', (d) => {
      logStream.write(d)
      onEvent && onEvent({ type: 'log', data: d.toString() })
    })
    this._gameProcess.stderr.on('data', (d) => {
      logStream.write(d)
      onEvent && onEvent({ type: 'log', data: d.toString() })
    })
    this._gameProcess.on('exit', (code) => {
      logStream.write(`=== Session ended: ${new Date().toISOString()} (exit code ${code}) ===\n`)
      logStream.end()
      this._gameProcess = null
      onEvent && onEvent({ type: 'exited', code })
    })

    return { ok: true }
  }

  _buildClasspath(versionJson, fabricJson) {
    const jars = []

    // Vanilla libraries
    for (const lib of versionJson.libraries || []) {
      if (!rulesMatch(lib.rules)) continue
      const artifact = lib.downloads?.artifact
      if (artifact) jars.push(path.join(this.librariesDir, artifact.path))
    }

    // Fabric libraries
    for (const lib of fabricJson.libraries || []) {
      const libPath = getLibraryPath(lib.name)
      jars.push(path.join(this.librariesDir, libPath))
    }

    // Client JAR
    jars.push(path.join(
      this.versionsDir,
      this.manifest.minecraft_version,
      `${this.manifest.minecraft_version}.jar`
    ))

    const sep = process.platform === 'win32' ? ';' : ':'
    return jars.join(sep)
  }

  _buildJvmArgs(versionJson, fabricJson) {
    const memArgs = this.manifest.java_args
      ? this.manifest.java_args.split(' ').filter(Boolean)
      : ['-Xms2G', '-Xmx4G']

    const assetIndex = versionJson.assetIndex?.id || this.manifest.minecraft_version
    const nativesDir = path.join(this.versionsDir, this.manifest.minecraft_version, 'natives')

    return [
      ...memArgs,
      `-Djava.library.path=${nativesDir}`,
      `-Dminecraft.launcher.brand=modpack-launcher`,
      `-Dminecraft.launcher.version=1.0`,
      '-cp', this._buildClasspath(versionJson, fabricJson),
    ]
  }

  _buildGameArgs(fabricJson, authProfile, versionJson) {
    const assetIndex = versionJson.assetIndex?.id || this.manifest.minecraft_version
    return [
      '--username', authProfile.username,
      '--version', this.fabricVersionId,
      '--gameDir', this.instanceDir,
      '--assetsDir', this.assetsDir,
      '--assetIndex', assetIndex,
      '--uuid', authProfile.uuid,
      '--accessToken', authProfile.accessToken,
      '--userType', authProfile.userType || 'msa',
      '--versionType', 'release',
    ]
  }
}

module.exports = GameManager
