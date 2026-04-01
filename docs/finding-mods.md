# Finding and Adding Mods

This guide covers how to search for Fabric mods compatible with your Minecraft version,
get stable download URLs for `pack.yaml`, understand mod dependencies, and decide which
side (`both`, `server`, `client`) each mod belongs on.

---

## Where to find mods

### Modrinth (recommended)

[modrinth.com](https://modrinth.com) is the primary source for this framework.
Modrinth CDN URLs are permanent and work directly as `url:` values in `pack.yaml`.

### CurseForge

[curseforge.com](https://www.curseforge.com/minecraft) has a large catalog but
**does not provide stable direct download URLs** without a CurseForge API key.
Most popular CurseForge mods are also published on Modrinth — search there first.
If a mod is CurseForge-only, host the JAR in your own GitHub release and link to that.

---

## Searching Modrinth

### Filter for your target version and loader

1. Go to [modrinth.com/mods](https://modrinth.com/mods)
2. In the left sidebar, under **Loaders**, check **Fabric**
3. Under **Game versions**, check your `minecraft_version` (e.g. `1.21.1`)
4. The results now show only mods that work with your exact setup

### Search tips

- Search by function, not name: `"chunk loading"`, `"minimap"`, `"performance"`, `"inventory"`
- Use **Categories** in the sidebar to browse by type (optimization, decoration, adventure, etc.)
- Sort by **Download count** to find well-maintained, widely-used mods
- Check **Last updated** — mods updated recently for your MC version are actively maintained

---

## Getting the download URL

1. Open a mod page on Modrinth (e.g. [Sodium](https://modrinth.com/mod/sodium))
2. Click **Versions** in the left sidebar
3. Filter by your Minecraft version and **Fabric** loader if not already filtered
4. Click the version you want to use
5. In the **Files** section, **right-click** the primary download button → **Copy link address**

The URL will look like:
```
https://cdn.modrinth.com/data/AANobbMI/versions/u1OEbNKx/sodium-fabric-0.6.13%2Bmc1.21.1.jar
```

This URL is **permanent** — it will not break when newer versions are released.

> **Tip:** You can also use the Modrinth API to fetch the latest version URL
> programmatically (useful for automation):
> ```bash
> curl -s "https://api.modrinth.com/v2/project/sodium/version?\
> game_versions=%5B%221.21.1%22%5D&loaders=%5B%22fabric%22%5D" \
>   | python3 -c "import json,sys; v=json.load(sys.stdin)[0]; print(v['files'][0]['url'])"
> ```

---

## Choosing the right `side`

The `side` field controls which artifact a mod is included in:

| `side`   | `server.tar.xz` | `client.tar.xz` | When to use |
|----------|:--------------:|:--------------:|-------------|
| `both`   | ✓ | ✓ | Mod changes gameplay — both sides must agree |
| `server` | ✓ | ✗ | Server utility with no client component |
| `client` | ✗ | ✓ | Visual/UI enhancement the server doesn't need |

**How to tell which side a mod belongs on:**

Modrinth shows **Client** / **Server** badges on every mod page under the title.
A mod tagged "Client" only should use `side: client`. A mod tagged "Server" only
should use `side: server`. A mod tagged both should use `side: both`.

When in doubt, use `side: both` — it's always safe, just slightly larger artifacts.

---

## Checking dependencies

Most mods require **Fabric API**. Always include it unless a mod explicitly says it
doesn't need it.

On a mod's Modrinth page, scroll to the **Dependencies** section. Each dependency
listed as **Required** must also be in your `pack.yaml`. Add each dependency using
the same process: go to its Modrinth page, pick the matching version, copy the URL.

**Common dependency chain:**

```
Your mod
  └─ requires Fabric API     (modrinth.com/mod/fabric-api)
       └─ no further deps
```

Some mods have additional dependencies (e.g. Cloth Config, Architectury). Add all
required dependencies to your `pack.yaml` before testing.

---

## Verifying a URL works

Before adding a URL to `pack.yaml`, verify it actually downloads a JAR:

```bash
curl -L -I "https://cdn.modrinth.com/data/.../mod.jar" 2>/dev/null | head -5
```

Look for `HTTP/2 200` and `content-type: application/java-archive`. A 404 means the
URL is wrong or stale.

Or just run `game-create build` — it will exit with a clear error if any URL returns
a non-200 response.

---

## Recommended starter mods

These are well-maintained, widely used Fabric mods that work well together and are good
starting points for any modpack targeting 1.21.x.

### Performance (always include these)

| Mod | Side | What it does |
|-----|------|-------------|
| [Fabric API](https://modrinth.com/mod/fabric-api) | both | Required by nearly all Fabric mods |
| [Sodium](https://modrinth.com/mod/sodium) | client | Rendering engine rewrite — huge FPS gains |
| [Lithium](https://modrinth.com/mod/lithium) | both | Game logic optimisation (server tick, pathfinding) |
| [Iris Shaders](https://modrinth.com/mod/iris) | client | Shader support (works with Sodium) |
| [FerriteCore](https://modrinth.com/mod/ferrite-core) | both | Memory usage reduction |
| [Chunky](https://modrinth.com/mod/chunky) | server | Pre-generate chunks to eliminate server lag |

### Quality of life

| Mod | Side | What it does |
|-----|------|-------------|
| [Xaero's Minimap](https://modrinth.com/mod/xaeros-minimap) | client | In-game minimap |
| [Xaero's World Map](https://modrinth.com/mod/xaeros-world-map) | client | Full world map (works with minimap) |
| [Inventory Profiles Next](https://modrinth.com/mod/inventory-profiles-next) | client | Inventory sorting and management |
| [JEI](https://modrinth.com/mod/jei) / [REI](https://modrinth.com/mod/rei) | client | Recipe viewer |
| [AppleSkin](https://modrinth.com/mod/appleskin) | both | Food/hunger value display |
| [WTHIT](https://modrinth.com/mod/wthit) | both | What The Heck Is That — block/entity info on hover |

### Multiplayer

| Mod | Side | What it does |
|-----|------|-------------|
| [Carpet](https://modrinth.com/mod/carpet) | server | Server-side technical gameplay features and tweaks |
| [Spark](https://modrinth.com/mod/spark) | both | Performance profiler — great for diagnosing lag |
| [Ledger](https://modrinth.com/mod/ledger) | server | Block change logging (grief protection) |

---

## Example: adding a mod to your pack

1. Find the mod on Modrinth, filter to your MC version + Fabric
2. Copy the CDN URL from the version's Files section
3. Check the mod's Dependencies — add any required ones first
4. Determine the correct `side` from the Modrinth page badges
5. Add to `pack.yaml`:

```yaml
mods:
  - name: "Fabric API"
    url: "https://cdn.modrinth.com/data/P7dR8mSH/versions/yGAe1owa/fabric-api-0.116.9%2B1.21.1.jar"
    side: both

  - name: "Sodium"
    url: "https://cdn.modrinth.com/data/AANobbMI/versions/u1OEbNKx/sodium-fabric-0.6.13%2Bmc1.21.1.jar"
    side: client

  - name: "Iris Shaders"
    url: "https://cdn.modrinth.com/data/YL57xq9U/versions/.../iris-1.8.0+mc1.21.1.jar"
    side: client   # Iris is client-only

  - name: "Spark"
    url: "https://cdn.modrinth.com/data/l6YH9Als/versions/.../spark-fabric.jar"
    side: both     # Spark has both client and server components
```

6. Run `game-create build pack.yaml` — the tool will download and validate every URL
7. Test in development mode (`npm start` in the launcher directory) before building the AppImage
