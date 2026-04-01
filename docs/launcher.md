# Electron Launcher

The launcher is a cross-platform desktop app that provides an isolated, self-contained
Minecraft + Fabric environment for your modpack. Players download it once and click Play.

---

## What "isolated" means

The launcher manages its own game directory completely separate from any existing
Minecraft installation. It downloads and manages:

- **Java 21** — Mojang's own bundled JRE, downloaded directly from Mojang's CDN
- **Minecraft client** — the JAR, all libraries, and game assets (~500 MB first run)
- **Fabric loader** — installed via Fabric's meta API
- **Mods** — bundled directly inside the launcher binary at build time

Players do not need to install Java, the official Mojang launcher, or any other tools.

---

## First launch flow

```
Player opens launcher
  │
  ├─ Java not found?
  │     └─ Download Mojang Java 21 runtime (~80 MB)
  │
  ├─ Minecraft not installed?
  │     └─ Download client JAR + libraries + assets (~500 MB)
  │
  ├─ Fabric not installed?
  │     └─ Download Fabric version profile from meta.fabricmc.net
  │
  ├─ Mods not installed?
  │     └─ Copy bundled mods from app resources into instance/mods/
  │
  └─ Show main screen with PLAY button
```

All downloads are resumable — if interrupted, the launcher picks up where it left off
on the next launch (files are checked for existence before downloading).

---

## Authentication

Online play requires a Microsoft account that owns Minecraft Java Edition.

The launcher uses the **OAuth2 device code flow**:

1. Player clicks **Sign in with Microsoft**
2. A short code (e.g. `AB3X9K`) and URL (`microsoft.com/devicelogin`) appear
3. Player opens the URL in any browser, enters the code, and signs in
4. The launcher automatically completes the auth chain:
   `Microsoft → Xbox Live → XSTS → Minecraft`
5. Player's username and UUID are shown in the sidebar

No credentials are stored to disk. The Minecraft access token is held in memory
for the session only.

Requires an `azure_client_id` in your `pack.yaml`. See [azure-setup.md](./azure-setup.md).

---

## Game directory layout

The launcher stores all game data in the OS user data directory:

| Platform | Path |
|----------|------|
| Linux    | `~/.config/<AppName>/game/` |
| Windows  | `%APPDATA%\<AppName>\game\` |

Structure:
```
game/
  versions/
    1.21.1/
      1.21.1.jar
      1.21.1.json
    fabric-loader-0.16.9-1.21.1/
      fabric-loader-0.16.9-1.21.1.json
  libraries/       ← all Minecraft + Fabric library JARs
  assets/          ← game assets (sounds, textures, etc.)
  instance/        ← the active game instance
    mods/          ← mod JARs (copied from launcher resources)
    saves/         ← world saves
    logs/
    options.txt
    ...
java/              ← Mojang's Java 21 runtime
```

---

## Customizing the launcher per game

The launcher is a template — each game repo injects its own content at build time.
The injection happens in the GitHub workflow before `electron-builder` runs.

**What gets injected:**

| File | Source | Purpose |
|------|--------|---------|
| `resources/manifest.json` | `client.tar.xz` from `game-create build` | Game name, versions, mod list, branding |
| `resources/mods/*.jar` | `client.tar.xz` from `game-create build` | Bundled mod JARs |

**What you can customize in `pack.yaml`:**

| Field | Effect on launcher |
|-------|--------------------|
| `name` | Window title, title bar |
| `background_color` | Hero panel gradient base color |
| `azure_client_id` | Enables Microsoft sign-in |
| `java_args` | Memory flags passed to the JVM |
| `mods[].name` | Shown in the mod list sidebar |

---

## Building locally

### Prerequisites

- Node.js 20+
- npm 10+

### Steps

```bash
# 1. Build pack artifacts
game-create build pack.yaml --output ./dist

# 2. Inject into launcher resources
cd /path/to/minecraft-server-snap/launcher
mkdir -p resources/mods
tar -xJf /path/to/dist/client.tar.xz -C resources/

# 3. Install dependencies
npm install

# 4. Run in development mode
npm start

# 5. Build distributable
npm run build:linux    # → dist/*.AppImage
npm run build:win      # → dist/*.exe  (cross-compile or run on Windows)
npm run build          # both
```

### Testing without Microsoft auth

You can test the launcher UI and game launch by leaving `azure_client_id` out of
`pack.yaml`. The launcher will skip authentication. Note that without a valid access
token, online-mode servers will reject the connection — use a LAN world or an
offline-mode server for testing.

---

## Distributing to players

The GitHub workflow produces two files per release:

| File | Platform | How to run |
|------|----------|------------|
| `Kadens-Revenge-1.0.0.AppImage` | Linux | `chmod +x *.AppImage && ./*.AppImage` |
| `Kadens-Revenge-Setup-1.0.0.exe` | Windows | Double-click to install, then launch from Start Menu |

macOS is not currently a workflow target. To add it, add a `build-launcher-macos` job
to the reusable workflow using a `macos-latest` runner and the `dmg` electron-builder
target.

---

## Updating mods

When you update `pack.yaml` (new mod version, added mod, etc.) and publish a new
release, the new launcher binary contains the updated mods. Players re-download the
launcher to get the update.

The launcher does **not** auto-update itself or check for new versions. This is by
design — the release workflow creates a new versioned binary for each release.
