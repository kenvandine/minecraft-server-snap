# minecraft-server-snap

A framework for creating, distributing, and playing **modded Minecraft experiences**
on Fabric — from a single YAML file to a published game with a server and a
cross-platform launcher.

---

## What this repo provides

| Component | What it is |
|-----------|------------|
| **`minecraft-server` snap** | Linux Minecraft server runtime (Java 21, Avahi, RCON) |
| **`game-create` CLI** | Builds server and client artifacts from a pack YAML |
| **Electron launcher** | Cross-platform isolated Minecraft launcher template |
| **Reusable workflow** | GitHub Actions workflow for game repos to publish releases |

---

## The big picture

A game repo (e.g. `kadens-revenge`) contains one file: `pack.yaml`.
A single git tag triggers a GitHub Actions workflow that produces:

```
server.tar.xz              ← installed on Linux with minecraft-server snap
Kadens-Revenge-1.0.0.AppImage   ← Linux client launcher
Kadens-Revenge-Setup-1.0.0.exe  ← Windows client launcher
```

Players download the launcher for their OS and click Play.
Server operators install the snap and run one command.

---

## Quick start — creating a new game

The fastest way to get started is the
**[minecraft-modded-game-template](https://github.com/kenvandine/minecraft-modded-game-template)**
repository. Click **Use this template**, then follow the README inside.

Or manually:

```bash
# 1. Install game-create
curl -L -o /usr/local/bin/game-create \
  https://github.com/kenvandine/minecraft-server-snap/releases/latest/download/game-create-linux
chmod +x /usr/local/bin/game-create

# 2. Create your pack YAML
cat > pack.yaml << 'EOF'
name: "My Awesome Modpack"
version: "1.0.0"
minecraft_version: "1.21.1"
mod_loader: fabric
mod_loader_version: "latest"
installer_version: "latest"
mods:
  - name: "Fabric API"
    url: "https://cdn.modrinth.com/data/P7dR8mSH/versions/adK8OREi/fabric-api-0.105.0+1.21.1.jar"
    side: both
EOF

# 3. Build artifacts
game-create build pack.yaml

# 4. Install on server
sudo minecraft-server.install-pack dist/server.tar.xz
```

---

## Quick start — server operators

### Install the snap

```bash
sudo snap install minecraft-server
```

### Install a modpack

```bash
sudo minecraft-server.install-pack \
  https://github.com/your-org/your-game/releases/download/v1.0.0/server.tar.xz

sudo snap restart minecraft-server.server
sudo snap logs -f minecraft-server.server
```

### Send server commands

```bash
sudo minecraft-server.mcron "op Steve"
sudo minecraft-server.mcron "say Hello!"
sudo minecraft-server.mcron stop
```

---

## Quick start — players

1. Go to the game's GitHub Releases page
2. Download the `.AppImage` (Linux) or `.exe` (Windows)
3. Run it — Java and Minecraft are downloaded automatically on first launch
4. Click **Sign in with Microsoft** and follow the prompts
5. Click **PLAY**

---

## Repository structure

```
minecraft-server-snap/
├── snap/
│   └── snapcraft.yaml           Server snap build config
├── scripts/
│   ├── start-server.sh          Server startup script
│   ├── install-pack.sh          install-pack snap command
│   ├── publish-service.sh       Avahi mDNS broadcaster
│   └── mcron-wrapper.sh         RCON CLI wrapper
├── tools/
│   └── game-create/             Python CLI tool (game-create)
├── launcher/                    Electron launcher template
│   ├── src/
│   │   ├── main.js              Electron main process
│   │   ├── preload.js           Context bridge
│   │   ├── auth.js              Microsoft auth (device code flow)
│   │   ├── game-manager.js      Java/MC/Fabric install + game launch
│   │   └── renderer/            HTML/CSS/JS UI
│   └── resources/
│       ├── manifest.json        Placeholder — replaced at build time
│       └── mods/                Placeholder — replaced at build time
├── examples/
│   └── example-pack.yaml        Annotated example pack YAML
├── docs/
│   ├── azure-setup.md           Microsoft Azure app registration guide
│   ├── pack-yaml-reference.md   Full YAML field reference
│   ├── game-create.md           game-create CLI usage
│   ├── launcher.md              Electron launcher internals
│   ├── server-snap.md           Snap commands and file locations
│   └── github-workflows.md      CI/CD workflow documentation
└── .github/workflows/
    ├── build-tools.yml           Builds game-create binaries on tag push
    └── reusable-pack-release.yml Reusable workflow for game repos
```

---

## Documentation

| Doc | Description |
|-----|-------------|
| [Pack YAML reference](docs/pack-yaml-reference.md) | All fields, mod `side` values, URL tips |
| [game-create CLI](docs/game-create.md) | Build and publish commands |
| [Electron launcher](docs/launcher.md) | How the launcher works, customization, building locally |
| [Server snap](docs/server-snap.md) | install-pack, mcron, file paths, ports |
| [GitHub workflows](docs/github-workflows.md) | Reusable workflow usage, triggering releases |
| [Azure setup](docs/azure-setup.md) | Microsoft auth app registration (5-minute guide) |

---

## How a game release works end to end

```
1. Game dev edits pack.yaml  →  adds/updates mods, bumps version
2. git tag v1.1.0 && git push origin v1.1.0
3. GitHub Actions triggers reusable-pack-release.yml:
     a. game-create downloads Fabric server JAR + mods
     b. Produces server.tar.xz  (Fabric JAR + server mods + manifest)
     c. Produces client.tar.xz  (client mods + manifest)
     d. [parallel] Injects client.tar.xz into Electron template → builds AppImage
     e. [parallel] Injects client.tar.xz into Electron template → builds .exe
     f. Creates GitHub release, attaches all three artifacts
4. Server operator: sudo minecraft-server.install-pack <server.tar.xz URL>
5. Players: download AppImage or .exe, run, click Play
```

---

## Building this snap

```bash
# Install snapcraft
sudo snap install snapcraft --classic

# Build
snapcraft

# Install locally
sudo snap install minecraft-server_*.snap --dangerous
```

---

## License

MIT
