from __future__ import annotations

import requests

VERSION_MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"


def get_server_jar_url(mc_version: str) -> str:
    """Return the download URL for the vanilla server JAR for the given MC version."""
    manifest = requests.get(VERSION_MANIFEST_URL, timeout=30).json()
    for v in manifest["versions"]:
        if v["id"] == mc_version:
            version_data = requests.get(v["url"], timeout=30).json()
            return version_data["downloads"]["server"]["url"]
    available = [v["id"] for v in manifest["versions"][:20]]
    raise ValueError(
        f"Minecraft version '{mc_version}' not found. "
        f"Recent versions: {', '.join(available)}"
    )
