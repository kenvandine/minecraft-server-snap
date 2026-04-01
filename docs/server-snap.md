# Minecraft Server Snap

The `minecraft-server` snap provides the Linux server runtime. It bundles Java 21, Avahi
for local network discovery, and the `mcrcon` admin tool.

---

## Installing the snap

```bash
# From the Snap Store (when published)
sudo snap install minecraft-server

# From a local build
snapcraft
sudo snap install minecraft-server_*.snap --dangerous
```

---

## Commands

The snap exposes four commands:

| Command | Type | Description |
|---------|------|-------------|
| `minecraft-server.server` | daemon | The Minecraft server process |
| `minecraft-server.discovery` | daemon | Avahi mDNS broadcaster |
| `minecraft-server.mcron` | CLI | Send RCON commands to the running server |
| `minecraft-server.install-pack` | CLI | Install a modpack server artifact |

---

## Setting up a server with a modpack

### Option A: install-pack (recommended)

Use `install-pack` to download and install a `server.tar.xz` artifact produced by
`game-create`:

```bash
sudo minecraft-server.install-pack \
  https://github.com/your-org/your-game/releases/download/v1.0.0/server.tar.xz

sudo snap restart minecraft-server.server
sudo snap logs -f minecraft-server.server
```

`install-pack` validates the archive, shows the pack name and version from the embedded
manifest, then atomically replaces the server JAR and mods directory.

### Option B: manual JAR placement

For vanilla or self-managed servers:

```bash
sudo cp your-server.jar /var/snap/minecraft-server/common/server/server.jar
sudo snap restart minecraft-server
```

---

## install-pack command

```
minecraft-server.install-pack <url-or-path>
```

| Argument | Description |
|----------|-------------|
| URL | `https://` or `http://` URL to a `server.tar.xz` file |
| Local path | Absolute path to a local `server.tar.xz` file |

**What it does:**

1. Downloads the archive (if a URL) to a temporary directory
2. Validates that `server/server.jar` exists in the archive
3. Displays the pack name and version from `server/manifest.json`
4. Replaces `$SNAP_COMMON/server/server.jar` and `$SNAP_COMMON/server/mods/`
5. Copies `manifest.json` alongside for reference

The existing world data (`$SNAP_COMMON/server/world/`, `server.properties`, etc.)
is preserved — only the JAR and mods are replaced.

**Example:**

```bash
sudo minecraft-server.install-pack \
  https://github.com/kenvandine/kadens-revenge/releases/download/v1.2.0/server.tar.xz
```

Output:
```
Downloading https://github.com/.../server.tar.xz...
######################################################################## 100.0%
Extracting...
Installing: Kaden's Revenge 1.2.0
Done. Restart the server to apply:
  sudo snap restart minecraft-server.server
```

---

## mcron — RCON admin tool

Send commands to the running server via the RCON protocol:

```bash
# Give a player operator status
sudo minecraft-server.mcron "op Steve"

# Announce something
sudo minecraft-server.mcron "say Server restarting in 5 minutes"

# Change the time
sudo minecraft-server.mcron "time set day"

# Kick a player
sudo minecraft-server.mcron "kick BadPlayer"

# Stop the server gracefully
sudo minecraft-server.mcron stop
```

The RCON password is auto-generated on first start and stored at
`/var/snap/minecraft-server/common/rcon.secret` (mode 600).

---

## File locations

| Path | Contents |
|------|----------|
| `/var/snap/minecraft-server/common/server/` | Server working directory |
| `/var/snap/minecraft-server/common/server/server.jar` | Active server JAR |
| `/var/snap/minecraft-server/common/server/mods/` | Loaded mod JARs |
| `/var/snap/minecraft-server/common/server/world/` | World data |
| `/var/snap/minecraft-server/common/server/server.properties` | Server configuration |
| `/var/snap/minecraft-server/common/rcon.secret` | Auto-generated RCON password |

---

## Auto-configuration

On first start the snap automatically:

- Accepts the Minecraft EULA (`eula=true`)
- Generates a random RCON password and writes it to `rcon.secret`
- Enables RCON in `server.properties` with the generated password

---

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 25565 | TCP | Minecraft game traffic |
| 25575 | TCP | RCON (localhost only) |

Open port 25565 in your firewall for players to connect. Port 25575 should not be
exposed externally.

---

## Memory

The server starts with `-Xms2G -Xmx2G`. For modded servers with many players, increase
this by editing `start-server.sh` or by installing a modpack artifact whose
`manifest.json` specifies higher values (the `java_args` field propagates from
`pack.yaml` through `game-create` into the server manifest).

> A future version will expose memory as a snap configuration option.

---

## Monitoring

```bash
# Live log stream
sudo snap logs -f minecraft-server.server

# Recent logs only
sudo snap logs minecraft-server.server

# Check service status
sudo snap services minecraft-server
```
