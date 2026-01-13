#!/bin/bash
# Wait for the server to likely be up (simple delay)
sleep 10

# FIXME: Replace port with snap setting
# -s: Service mode
# "Minecraft Server": The name people see
# _minecraft._tcp: The standard service type for Minecraft
# 25565: The port
exec avahi-publish -s "Minecraft Server ($HOSTNAME)" _minecraft._tcp 25565
