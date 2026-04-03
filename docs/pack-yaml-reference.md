# Pack YAML Reference

The pack YAML file is the single source of truth for a modded Minecraft game experience.
It defines the Minecraft version, mod loader, mod list, and launcher appearance.
The `game-create` tool reads this file to produce the server and client artifacts.

---

## Full example

```yaml
name: "Kaden's Revenge"
version: "1.0.0"
minecraft_version: "1.21.1"
mod_loader: fabric
mod_loader_version: "latest"
installer_version: "latest"

azure_client_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

background_color: "#0d1117"
# background_image: "https://example.com/background.png"

java_args: "-Xms2G -Xmx4G"

mods:
  - name: "Fabric API"
    url: "https://cdn.modrinth.com/data/P7dR8mSH/versions/adK8OREi/fabric-api-0.105.0+1.21.1.jar"
    side: both

  - name: "Sodium"
    url: "https://cdn.modrinth.com/data/AANobbMI/versions/gmYFTMrX/sodium-fabric-0.6.0+mc1.21.1.jar"
    side: client

  - name: "Lithium"
    url: "https://cdn.modrinth.com/data/gvQqBUqZ/versions/aTKSXM8f/lithium-fabric-mc1.21.1-0.13.0.jar"
    side: both

  - name: "Iris Shaders"
    url: "https://cdn.modrinth.com/data/YL57xq9U/versions/.../iris-fabric-mc1.21.1.jar"
    side: client

shader_packs:
  - name: "Complementary Reimagined"
    url: "https://cdn.modrinth.com/data/HVnmMxH1/versions/.../ComplementaryReimagined_r5.4.zip"
```

---

## Fields

### `name` _(required)_
**Type**: string

The display name of the game or modpack. Used as the launcher window title and GitHub
release name.

```yaml
name: "Kaden's Revenge"
```

---

### `version` _(required)_
**Type**: string

The version of this modpack release. Should follow semantic versioning. This is separate
from the Minecraft version.

```yaml
version: "1.2.0"
```

---

### `minecraft_version` _(required)_
**Type**: string

The exact Minecraft Java Edition version to target. Must match a version ID from
[Mojang's version manifest](https://piston-meta.mojang.com/mc/game/version_manifest_v2.json).

```yaml
minecraft_version: "1.21.1"
```

---

### `mod_loader` _(required)_
**Type**: string — currently only `fabric` is supported

```yaml
mod_loader: fabric
```

---

### `mod_loader_version` _(required)_
**Type**: string

The Fabric loader version to use. Set to `"latest"` to automatically resolve the newest
loader version available for the specified `minecraft_version`.

```yaml
mod_loader_version: "latest"
# or pin to a specific version:
mod_loader_version: "0.16.9"
```

Available versions: [meta.fabricmc.net/v2/versions/loader](https://meta.fabricmc.net/v2/versions/loader)

---

### `installer_version` _(required)_
**Type**: string

The Fabric installer version used to generate the server launch JAR. Set to `"latest"`
to always use the newest installer.

```yaml
installer_version: "latest"
# or pin:
installer_version: "1.0.1"
```

Available versions: [meta.fabricmc.net/v2/versions/installer](https://meta.fabricmc.net/v2/versions/installer)

---

### `azure_client_id` _(optional)_
**Type**: string

The Azure Application (client) ID for Microsoft authentication. Required for players to
sign in with their Microsoft account for online play. See [azure-setup.md](./azure-setup.md)
for registration instructions.

If omitted, the launcher will not offer Microsoft sign-in and the game can only be
played on LAN or offline-mode servers.

```yaml
azure_client_id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

---

### `java_args` _(optional)_
**Type**: string  
**Default**: `"-Xms2G -Xmx4G"`

JVM memory and tuning arguments passed when launching the Minecraft client. The launcher
does not expose a memory slider UI, so set appropriate defaults here based on your
modpack's requirements.

```yaml
java_args: "-Xms2G -Xmx6G"
```

Heavier modpacks (50+ mods) typically benefit from `-Xmx6G` or more.

---

### `background_color` _(optional)_
**Type**: CSS hex color string  
**Default**: `"#0d1117"`

The background color of the launcher's hero panel. Used as the base of a gradient.

```yaml
background_color: "#1a0a2e"
```

---

### `background_image` _(optional)_
**Type**: URL string  
**Default**: none

Reserved for a future launcher version that will support a hero background image.
Has no effect currently.

---

### `mods` _(required)_
**Type**: list of mod entries

The list of mods to include. `game-create` downloads each mod JAR and splits them
between the server and client artifacts based on the `side` field.

#### Mod entry fields

| Field  | Type   | Required | Description |
|--------|--------|----------|-------------|
| `name` | string | yes      | Human-readable name, shown in the launcher mod list |
| `url`  | string | yes      | Direct download URL to the mod JAR file |
| `side` | string | no       | `both` (default), `server`, or `client` |

**`side` values:**

| Value    | Server artifact | Client artifact | Notes |
|----------|----------------|-----------------|-------|
| `both`   | included        | included        | Most mods — gameplay changes both sides need |
| `server` | included        | not included    | Server-only utilities (e.g. profiling, anti-cheat) |
| `client` | not included   | included        | Client-only enhancements (e.g. Sodium, shaders) |

```yaml
mods:
  - name: "Fabric API"
    url: "https://cdn.modrinth.com/data/P7dR8mSH/versions/adK8OREi/fabric-api-0.105.0+1.21.1.jar"
    side: both

  - name: "Sodium"
    url: "https://cdn.modrinth.com/data/AANobbMI/versions/gmYFTMrX/sodium-fabric-0.6.0+mc1.21.1.jar"
    side: client

  - name: "Chunky"
    url: "https://cdn.modrinth.com/data/fALzjamp/versions/.../chunky-fabric-1.4.12.jar"
    side: server
```

---

### `shader_packs` _(optional)_
**Type**: list of shader pack entries

Shader packs to bundle with the client. They are placed in `shaderpacks/` in the player's
game directory and are always client-only. A shader-compatible renderer mod such as
[Iris Shaders](https://modrinth.com/mod/iris) must also be included in `mods` for
shader packs to have any effect.

#### Shader pack entry fields

| Field  | Type   | Required | Description |
|--------|--------|----------|-------------|
| `name` | string | yes      | Human-readable name |
| `url`  | string | yes      | Direct download URL to the shader pack `.zip` file |

```yaml
mods:
  - name: "Iris Shaders"
    url: "https://cdn.modrinth.com/data/YL57xq9U/versions/.../iris-fabric-mc1.21.1.jar"
    side: client

shader_packs:
  - name: "Complementary Reimagined"
    url: "https://cdn.modrinth.com/data/HVnmMxH1/versions/.../ComplementaryReimagined_r5.4.zip"
```

---

## Finding mod and shader URLs

### Modrinth (recommended)
1. Open the mod or shader page on [modrinth.com](https://modrinth.com)
2. Click **"Versions"**
3. Find the version matching your `minecraft_version` and `fabric` loader
4. Right-click the download button → **"Copy link address"**

Mod URLs look like:
```
https://cdn.modrinth.com/data/{project-id}/versions/{version-id}/{filename}.jar
```

Shader pack URLs look like:
```
https://cdn.modrinth.com/data/{project-id}/versions/{version-id}/{filename}.zip
```

These are stable, permanent CDN URLs — safe to pin in your YAML.

### CurseForge
CurseForge direct download URLs require an API key. Instead, use the
[Modrinth mirror](https://modrinth.com) where most CurseForge mods are also published,
or host the file in your own GitHub release and link to that.

---

## Version pinning strategy

For a stable, reproducible modpack:

- **Pin `mod_loader_version`** and **`installer_version`** to specific versions rather
  than `"latest"`. This ensures every build of your artifacts uses the same Fabric version.
- **Use permanent CDN URLs** for mods (Modrinth CDN URLs are permanent per version).
- Commit `pack.yaml` changes as version bumps (e.g. `v1.1.0` when you update a mod).

For development and quick iteration, `"latest"` for loader/installer is convenient.
