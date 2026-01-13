#!/bin/bash
SECRET_FILE="$SNAP_COMMON/rcon.secret"

if [ ! -f "$SECRET_FILE" ]; then
    echo "Error: Server has not generated an RCON secret yet."
    echo "Please start the server daemon first."
    exit 1
fi

PASS=$(cat "$SECRET_FILE")

# Connect to localhost:25575 using the generated password
# Pass any arguments (like "stop" or "say hello") directly to mcrcon
exec "$SNAP/bin/mcrcon" -H localhost -P 25575 -p "$PASS" -t "$@"
