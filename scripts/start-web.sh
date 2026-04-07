#!/bin/bash
set -e

# Read web port from snap config (default 8080)
PORT=$(snapctl get web-port 2>/dev/null || echo "")
PORT="${PORT:-8080}"

export PORT
export MC_HOST="localhost"
export MC_PORT="25565"

exec "$SNAP/bin/node" "$SNAP/server.js"
