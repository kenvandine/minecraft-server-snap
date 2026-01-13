# Minecraft Server Snap

A strictly confined, easy-to-deploy Minecraft server wrapper for Linux, powered by **Java 21**.

This Snap packages the runtime environment required to run a Minecraft server but **does not include the server JAR itself**. This allows you to run any version you want (Vanilla, Paper, Fabric, etc.) simply by dropping the file in the right folder.

## Features

* **Java 21 Bundled**: Includes OpenJDE 21 with fully working SSL certificates, fixing common authentication issues with Minecraft 1.21+.
* **Auto-Configuration**: Automatically accepts the EULA and generates a secure RCON password.
* **Local Discovery**: Broadcasts the server via Avahi (mDNS), making it visible to local network players automatically.
* **Management CLI**: Includes a built-in command wrapper (`mcron`) to send commands to the server console.
* **Strict Confinement**: Runs in a secure sandbox, isolated from your host system.

## Installation

### From the Store (If published)

```bash
sudo snap install minecraft-server

```

### From Local Build

If you have built this snap locally:

```bash
sudo snap install minecraft-server_0.2_amd64.snap --dangerous

```

## Setup & Configuration

Because this snap is generic, **it will not start successfully until you provide a server JAR.**

1. **Download your preferred server JAR** (e.g., from [Minecraft.net](https://www.minecraft.net/download/server) or [PaperMC](https://papermc.io/)).
2. **Move the JAR to the snap's common directory**:
You must rename the file to `server.jar`.
```bash
# Example path (adjust 'minecraft-server' if your snap name differs)
sudo cp path/to/downloaded-server.jar /var/snap/minecraft-server/common/server/server.jar

```


3. **Restart the server**:
```bash
sudo snap restart minecraft-server

```


4. **Monitor the startup**:
```bash
sudo snap logs -f minecraft-server

```



## Managing the Server

Since the server runs as a background daemon, you cannot "attach" to the screen like a traditional manual install. Instead, use the bundled `mcron` tool to send commands via the local RCON interface.

### Sending Commands

Use `minecraft-server.mcron` followed by your command (without the slash).

**Examples:**

```bash
# Give a player operator status
sudo minecraft-server.mcron "op Steve"

# Say hello to the server
sudo minecraft-server.mcron "say Hello from the host console"

# Change time
sudo minecraft-server.mcron "time set day"

# Stop the server safely
sudo minecraft-server.mcron stop

```

### Server Properties

To configure game settings (difficulty, seeds, view-distance):

1. Edit the properties file:
```bash
sudo nano /var/snap/minecraft-server/common/server/server.properties

```


2. Restart the snap to apply changes:
```bash
sudo snap restart minecraft-server

```


*Note: Do not disable RCON or change the RCON password/port manually, as this will break the `mcron` command tool.*

## Technical Details

* **Memory Usage**: The server is currently configured with hardcoded flags `-Xms2G -Xmx2G`.
* **Network Ports**:
* **25565 (TCP)**: Main game port.
* **25575 (TCP)**: Local RCON port (protected by auto-generated secret).


* **Filesystem**:
* Server data is stored in `/var/snap/minecraft-server/common/server/`.
* RCON secret is stored in `/var/snap/minecraft-server/common/rcon.secret`.



## Troubleshooting

**"Login Failed: Authentication Servers are down"**
This snap includes a fix for Java 21 SSL certificates. If you still see this, ensure your server time is correct.

**"No server.jar found"**
Check the logs with `snap logs minecraft-server`. You must place a file named exactly `server.jar` in the `$SNAP_COMMON/server/` directory.

**Avahi Warnings**
The `discovery` service attempts to publish `_minecraft._tcp`. If you see warnings in the logs, ensure the `avahi-daemon` is running on your host system.
