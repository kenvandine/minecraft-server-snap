# game-create CLI Tool

`game-create` is the command-line tool that reads a [pack YAML](./pack-yaml-reference.md)
and produces the server and client artifacts. It is the build tool at the center of the
modpack workflow.

---

## Installation

### From a GitHub release (recommended)

Download the pre-built binary from the
[minecraft-server-snap releases](https://github.com/kenvandine/minecraft-server-snap/releases/latest):

```bash
# Linux
curl -L -o /usr/local/bin/game-create \
  https://github.com/kenvandine/minecraft-server-snap/releases/latest/download/game-create-linux
chmod +x /usr/local/bin/game-create

# Windows (PowerShell)
Invoke-WebRequest -Uri https://github.com/kenvandine/minecraft-server-snap/releases/latest/download/game-create-windows.exe `
  -OutFile game-create.exe
```

### From source

Requires Python 3.11+. Use a virtual environment to avoid conflicts with system packages.

```bash
git clone https://github.com/kenvandine/minecraft-server-snap
cd minecraft-server-snap

python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -e tools/game-create/
game-create --help
```

The venv only needs to be created once. On subsequent sessions, just activate it:

```bash
source .venv/bin/activate
```

---

## Commands

### `game-create build`

Downloads all components and produces `server.tar.xz` and `client.tar.xz`.

```
game-create build CONFIG [OPTIONS]
```

| Argument / Option | Description | Default |
|---|---|---|
| `CONFIG` | Path to your pack YAML file | _(required)_ |
| `--output`, `-o` | Directory to write artifacts into | `./dist` |
| `--cache` | Directory for cached mod downloads | `./.game-create-cache` |

**Example:**

```bash
game-create build pack.yaml --output ./dist
```

**Output:**

```
Building Kaden's Revenge 1.0.0
Resolving Fabric versions...
  Loader:    0.16.9
  Installer: 1.0.1

Downloading Fabric server JAR...
  fabric-server.jar ████████████ 12.3 MB  8.2 MB/s

Downloading server mods (2 files)...
  [server] Fabric API ████████████ 2.1 MB
  [server] Lithium    ████████████ 890 KB

Downloading client mods (3 files)...
  [client] Fabric API ████████████ (cached)
  [client] Sodium     ████████████ 1.4 MB
  [client] Lithium    ████████████ (cached)

Creating server.tar.xz...
  → dist/server.tar.xz (14 MB)

Creating client.tar.xz...
  → dist/client.tar.xz (4 MB)

╭─ Done ────────────────────────────────────────────╮
│ Build complete!                                    │
│                                                    │
│ Server: dist/server.tar.xz                         │
│ Client: dist/client.tar.xz                         │
│                                                    │
│ Install server:                                    │
│   sudo minecraft-server.install-pack dist/server.  │
╰────────────────────────────────────────────────────╯
```

---

### `game-create publish`

Builds artifacts (same as `build`) then creates a GitHub release and uploads them.
Requires the [GitHub CLI (`gh`)](https://cli.github.com/) to be installed and authenticated.

```
game-create publish CONFIG --tag TAG [OPTIONS]
```

| Argument / Option | Description | Default |
|---|---|---|
| `CONFIG` | Path to your pack YAML file | _(required)_ |
| `--tag` | Git tag for the release (e.g. `v1.0.0`) | _(required)_ |
| `--repo` | GitHub repo in `owner/name` format | current repo |
| `--output`, `-o` | Directory to write artifacts into | `./dist` |
| `--cache` | Directory for cached mod downloads | `./.game-create-cache` |
| `--draft` | Create as a draft release | false |

**Example:**

```bash
game-create publish pack.yaml --tag v1.0.0
```

This is equivalent to running `build` then:

```bash
gh release create v1.0.0 \
  --title "Kaden's Revenge v1.0.0" \
  --notes "Minecraft 1.21.1 + Fabric modpack" \
  dist/server.tar.xz dist/client.tar.xz
```

> In most workflows, you won't call `publish` directly — the
> [reusable GitHub workflow](../github-workflows.md) handles the full build + publish
> pipeline including building the Electron launcher.

---

## Artifacts explained

### `server.tar.xz`

Used by the `minecraft-server` snap's `install-pack` command to set up the server.

Contents:
```
server/
  server.jar          ← Fabric server launch JAR (self-contained)
  mods/
    lithium-...jar
    fabric-api-...jar  ← only mods with side: both or side: server
  manifest.json       ← metadata (name, versions, mod list)
```

Install with:
```bash
sudo minecraft-server.install-pack https://github.com/.../server.tar.xz
sudo snap restart minecraft-server.server
```

---

### `client.tar.xz`

Used at build time to inject mods and metadata into the Electron launcher.
It is not distributed directly to players — the launcher binaries (AppImage / .exe)
already contain these files.

Contents:
```
mods/
  sodium-...jar
  lithium-...jar
  fabric-api-...jar   ← only mods with side: both or side: client
manifest.json         ← metadata read by the launcher at runtime
```

---

## Caching

Downloaded mod JARs are cached in `.game-create-cache/` by filename. If a file with the
same name already exists in the cache directory, it is reused without re-downloading.

To force a fresh download, delete the cache:

```bash
rm -rf .game-create-cache
```

The Fabric server JAR is always downloaded fresh (it is generated per
loader/installer/mc version combination).

---

## Using in CI without the binary

If you prefer not to use the pre-built binary, you can install from source in CI:

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: '3.11'

- name: Install game-create
  run: pip install git+https://github.com/kenvandine/minecraft-server-snap.git#subdirectory=tools/game-create

- name: Build
  run: game-create build pack.yaml
```
