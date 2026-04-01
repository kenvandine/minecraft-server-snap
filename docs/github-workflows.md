# GitHub Workflows

This repository provides a reusable GitHub Actions workflow that game repositories
call to build and publish a complete modpack release — server artifact, Linux launcher,
and Windows launcher — all attached to a single GitHub release.

---

## Workflow overview

```
game repo triggers release
  │
  └─ reusable-pack-release.yml (this repo)
       │
       ├─ build-artifacts job
       │     ├─ install game-create binary
       │     ├─ run: game-create build pack.yaml
       │     └─ upload: server.tar.xz, client.tar.xz
       │
       ├─ build-launcher-linux job  (parallel)
       │     ├─ checkout launcher template (this repo)
       │     ├─ inject client.tar.xz into resources/
       │     ├─ npm ci && npm run build:linux
       │     └─ upload: *.AppImage
       │
       ├─ build-launcher-windows job  (parallel)
       │     ├─ checkout launcher template (this repo)
       │     ├─ inject client.tar.xz into resources/
       │     ├─ npm ci && npm run build:win
       │     └─ upload: *.exe
       │
       └─ publish-release job
             ├─ download all artifacts
             └─ gh release create → attaches server.tar.xz, AppImage, exe
```

The Linux and Windows launcher builds run in parallel after the artifact build, so
the full pipeline typically completes in 5–10 minutes.

---

## Using the reusable workflow in a game repo

Create `.github/workflows/release.yml` in your game repository:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    uses: kenvandine/minecraft-server-snap/.github/workflows/reusable-pack-release.yml@main
    with:
      config: pack.yaml
      tag: ${{ github.ref_name }}
    secrets:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Inputs:**

| Input | Required | Description |
|-------|----------|-------------|
| `config` | yes | Path to your pack YAML in the game repo |
| `tag` | yes | The release tag (e.g. `v1.0.0`) |
| `tools-version` | no | Version of `game-create` to use (`latest` by default) |

**Secrets:**

| Secret | Description |
|--------|-------------|
| `GH_TOKEN` | GitHub token for creating the release. `secrets.GITHUB_TOKEN` is sufficient for releases in the same repo. |

---

## Triggering a release

### Via git tag (automated)

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow triggers on any tag matching `v*`.

### Via GitHub UI (manual)

1. Go to your game repo → **Actions** → **Release**
2. Click **Run workflow**
3. Enter the tag (e.g. `v1.0.0`)

### Via GitHub CLI

```bash
gh workflow run release.yml --field tag=v1.0.0
```

---

## Release assets

After the workflow completes, your GitHub release will contain:

| Asset | Description |
|-------|-------------|
| `server.tar.xz` | Server artifact — installed with `minecraft-server.install-pack` |
| `Your-Game-1.0.0.AppImage` | Linux launcher |
| `Your-Game-Setup-1.0.0.exe` | Windows installer |

The release body is auto-generated with installation instructions for both server
operators and players.

---

## Pinning the tools version

By default, the workflow downloads the latest `game-create` binary. To pin to a
specific version for reproducible builds:

```yaml
jobs:
  release:
    uses: kenvandine/minecraft-server-snap/.github/workflows/reusable-pack-release.yml@main
    with:
      config: pack.yaml
      tag: ${{ github.ref_name }}
      tools-version: "v0.2.0"
    secrets:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## build-tools workflow (this repo)

When a new tag is pushed to `minecraft-server-snap`, the `build-tools.yml` workflow
runs automatically:

1. Builds `game-create` with PyInstaller on Linux and Windows runners
2. Produces `game-create-linux` and `game-create-windows.exe`
3. Attaches both to the GitHub release

Game repos download these binaries in the reusable workflow's `build-artifacts` job.
