#!/bin/bash
set -euo pipefail

SERVER_DIR="$SNAP_COMMON/server"
TMP_DIR="$SNAP_COMMON/tmp/install-pack-$$"

usage() {
    echo "Usage: minecraft-server.install-pack <url-or-path>"
    echo ""
    echo "Downloads and installs a server.tar.xz artifact."
    echo ""
    echo "Examples:"
    echo "  minecraft-server.install-pack https://github.com/user/repo/releases/download/v1.0/server.tar.xz"
    echo "  minecraft-server.install-pack /path/to/server.tar.xz"
    exit 1
}

if [ $# -ne 1 ]; then
    usage
fi

ARTIFACT="$1"
mkdir -p "$TMP_DIR"

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# Download if URL
if [[ "$ARTIFACT" == http://* ]] || [[ "$ARTIFACT" == https://* ]]; then
    echo "Downloading $ARTIFACT..."
    ARCHIVE="$TMP_DIR/server.tar.xz"
    curl -L --fail --progress-bar -o "$ARCHIVE" "$ARTIFACT"
else
    if [ ! -f "$ARTIFACT" ]; then
        echo "Error: file not found: $ARTIFACT" >&2
        exit 1
    fi
    ARCHIVE="$ARTIFACT"
fi

# Extract to temp dir first to validate
echo "Extracting..."
EXTRACT_DIR="$TMP_DIR/extract"
mkdir -p "$EXTRACT_DIR"
tar -xJf "$ARCHIVE" -C "$EXTRACT_DIR" --no-same-owner

if [ ! -f "$EXTRACT_DIR/server/server.jar" ]; then
    echo "Error: archive does not contain server/server.jar — is this a valid server.tar.xz?" >&2
    exit 1
fi

# Show manifest info if present
if [ -f "$EXTRACT_DIR/server/manifest.json" ]; then
    NAME=$(python3 -c "import json,sys; d=json.load(open('$EXTRACT_DIR/server/manifest.json')); print(d.get('name','unknown'))" 2>/dev/null || echo "unknown")
    VERSION=$(python3 -c "import json,sys; d=json.load(open('$EXTRACT_DIR/server/manifest.json')); print(d.get('version','unknown'))" 2>/dev/null || echo "unknown")
    echo "Installing: $NAME $VERSION"
fi

# Swap in new server directory
mkdir -p "$SERVER_DIR"
rm -rf "$SERVER_DIR/server.jar" "$SERVER_DIR/mods"
cp "$EXTRACT_DIR/server/server.jar" "$SERVER_DIR/server.jar"
if [ -d "$EXTRACT_DIR/server/mods" ]; then
    cp -r "$EXTRACT_DIR/server/mods" "$SERVER_DIR/mods"
fi
if [ -f "$EXTRACT_DIR/server/manifest.json" ]; then
    cp "$EXTRACT_DIR/server/manifest.json" "$SERVER_DIR/manifest.json"
fi

# Set MOTD in server.properties to include pack name and version
if [ -f "$SERVER_DIR/manifest.json" ]; then
    PACK_NAME=$(python3 -c "import json; d=json.load(open('$SERVER_DIR/manifest.json')); print(d.get('name',''))" 2>/dev/null || true)
    PACK_VERSION=$(python3 -c "import json; d=json.load(open('$SERVER_DIR/manifest.json')); print(d.get('version',''))" 2>/dev/null || true)
    if [ -n "$PACK_NAME" ] && [ -n "$PACK_VERSION" ]; then
        MOTD="$PACK_NAME v$PACK_VERSION"
        PROPS_FILE="$SERVER_DIR/server.properties"
        touch "$PROPS_FILE"
        if grep -q "^motd=" "$PROPS_FILE"; then
            sed -i "s/^motd=.*/motd=$MOTD/" "$PROPS_FILE"
        else
            echo "motd=$MOTD" >> "$PROPS_FILE"
        fi
        echo "Server MOTD set to: $MOTD"
    fi
fi

echo "Done. Restart the server to apply:"
echo "  sudo snap restart minecraft-server.server"
