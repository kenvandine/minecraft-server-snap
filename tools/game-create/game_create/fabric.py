from __future__ import annotations

import requests

FABRIC_META = "https://meta.fabricmc.net/v2"


def resolve_loader_version(mc_version: str, requested: str) -> str:
    if requested != "latest":
        return requested
    versions = requests.get(
        f"{FABRIC_META}/versions/loader/{mc_version}", timeout=30
    ).json()
    if not versions:
        raise ValueError(f"No Fabric loader versions found for Minecraft {mc_version}")
    return versions[0]["loader"]["version"]


def resolve_installer_version(requested: str) -> str:
    if requested != "latest":
        return requested
    versions = requests.get(f"{FABRIC_META}/versions/installer", timeout=30).json()
    if not versions:
        raise ValueError("No Fabric installer versions found")
    return versions[0]["version"]


def get_server_jar_url(mc_version: str, loader_version: str, installer_version: str) -> str:
    """Return URL for the self-contained Fabric server launch JAR."""
    return (
        f"{FABRIC_META}/versions/loader/{mc_version}"
        f"/{loader_version}/{installer_version}/server/jar"
    )
