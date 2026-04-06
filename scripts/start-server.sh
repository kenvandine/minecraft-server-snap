#!/bin/bash
SERVER_ROOT="$SNAP_COMMON/server"
JAR_FILE="$SERVER_ROOT/server.jar"
PROPS_FILE="$SERVER_ROOT/server.properties"
SECRET_FILE="$SNAP_COMMON/rcon.secret"

mkdir -p "$SNAP_COMMON/tmp"
mkdir -p "$SERVER_ROOT"
cd "$SERVER_ROOT" || exit 1

if [ ! -f "$JAR_FILE" ]; then
    echo "ERROR: No server.jar found in $SERVER_ROOT"
    echo "Please place your Vanilla/Forge/Fabric jar there and rename it to 'server.jar'."
    sleep 60
    exit 1
fi

if [ ! -f "eula.txt" ]; then
    echo "eula=true" > eula.txt
fi

if [ ! -f "$SECRET_FILE" ]; then
    # Generate a random 12-char password
    tr -dc A-Za-z0-9 </dev/urandom | head -c 12 > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
fi
RCON_PASS=$(cat "$SECRET_FILE")

# We use sed to ensure RCON is enabled and the password matches our secret file
touch "$PROPS_FILE"
if grep -q "enable-rcon" "$PROPS_FILE"; then
    sed -i "s/^enable-rcon=.*/enable-rcon=true/" "$PROPS_FILE"
else
    echo "enable-rcon=true" >> "$PROPS_FILE"
fi

if grep -q "rcon.password" "$PROPS_FILE"; then
    sed -i "s/^rcon.password=.*/rcon.password=$RCON_PASS/" "$PROPS_FILE"
else
    echo "rcon.password=$RCON_PASS" >> "$PROPS_FILE"
fi

# FIXME: Get rcon port from snap setting
# Ensure port is standard (optional, but good for avahi consistency)
if ! grep -q "rcon.port" "$PROPS_FILE"; then
    echo "rcon.port=25575" >> "$PROPS_FILE"
fi

# Read memory setting (default: 2G)
SERVER_MEMORY=$(snapctl get server-memory)
SERVER_MEMORY=${SERVER_MEMORY:-2G}

# Aikar's flags — optimized G1GC tuning for Minecraft servers
exec java \
  -Djava.io.tmpdir="$SNAP_COMMON/tmp" \
  -Xms${SERVER_MEMORY} -Xmx${SERVER_MEMORY} \
  -XX:+UseG1GC \
  -XX:+ParallelRefProcEnabled \
  -XX:MaxGCPauseMillis=200 \
  -XX:+UnlockExperimentalVMOptions \
  -XX:+DisableExplicitGC \
  -XX:G1NewSizePercent=30 \
  -XX:G1MaxNewSizePercent=40 \
  -XX:G1HeapRegionSize=8M \
  -XX:G1ReservePercent=20 \
  -XX:G1MixedGCCountTarget=4 \
  -XX:InitiatingHeapOccupancyPercent=15 \
  -XX:G1MixedGCLiveThresholdPercent=90 \
  -XX:SurvivorRatio=32 \
  -XX:+UseNUMA \
  -XX:+AlwaysPreTouch \
  -XX:+UseStringDeduplication \
  -jar "$JAR_FILE" nogui
