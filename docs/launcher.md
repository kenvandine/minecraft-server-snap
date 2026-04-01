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
- Python 3.11+ with `game-create` installed (see [game-create.md](./game-create.md#from-source))

### Steps

```bash
# 1. Build pack artifacts (run from the repo root, with venv active)
source .venv/bin/activate
game-create build pack.yaml --output ./dist-pack

# 2. Inject client artifact into launcher resources
cd /path/to/minecraft-server-snap/launcher
mkdir -p resources/mods
tar -xJf /path/to/dist-pack/client.tar.xz -C resources/

# 3. Update the app name in electron-builder.yml to match your pack
#    (sed example — or edit the file directly)
sed -i 's/^productName:.*/productName: "My Game Name"/' electron-builder.yml
sed -i 's/^appId:.*/appId: "com.minecraft.my-game-name"/' electron-builder.yml

# 4. Install dependencies
npm install

# 5. Run in development mode (no build needed — faster iteration)
npm start

# 6. Build distributable AppImage
npm run build:linux    # → dist/*.AppImage
npm run build:win      # → dist/*.exe  (run on Windows or use a Windows runner)
npm run build          # both
```

### Running the AppImage

AppImages require FUSE to mount themselves. If FUSE is not available on your system:

```bash
# Standard (requires libfuse2)
chmod +x "My\ Game-1.0.0.AppImage"
./"My Game-1.0.0.AppImage"

# Without FUSE (extracts to a temp dir and runs)
./"My Game-1.0.0.AppImage" --appimage-extract-and-run
```

To install FUSE on Ubuntu/Debian:
```bash
sudo apt install libfuse2
```

### Testing without Microsoft auth

If `azure_client_id` is not set in `pack.yaml`, the launcher shows a **Play Offline**
section instead of the Microsoft sign-in button. Enter any username (1–16 characters)
and click **Play Offline**. This generates a random UUID and uses `--userType legacy`,
which works for:
- Singleplayer worlds
- LAN servers
- Servers running with `online-mode=false`

Online-mode servers (the default for public servers) will reject connections without
a valid Microsoft access token.

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
