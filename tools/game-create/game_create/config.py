from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional
import yaml


@dataclass
class Mod:
    name: str
    url: str
    side: str = "both"  # both | server | client

    def __post_init__(self):
        if self.side not in ("both", "server", "client"):
            raise ValueError(f"Mod '{self.name}': side must be both, server, or client")


@dataclass
class PackConfig:
    name: str
    version: str
    minecraft_version: str
    mod_loader: str
    mod_loader_version: str
    installer_version: str = "latest"
    mods: List[Mod] = field(default_factory=list)
    java_args: str = "-Xms2G -Xmx4G"
    background_color: str = "#0d1117"
    background_image: Optional[str] = None
    azure_client_id: Optional[str] = None

    @classmethod
    def from_yaml(cls, path: str) -> "PackConfig":
        with open(path) as f:
            data = yaml.safe_load(f)

        if data.get("mod_loader", "fabric") != "fabric":
            raise ValueError("Only 'fabric' mod_loader is supported")

        mods = [
            Mod(
                name=m["name"],
                url=m["url"],
                side=m.get("side", "both"),
            )
            for m in data.get("mods", [])
        ]

        return cls(
            name=data["name"],
            version=data["version"],
            minecraft_version=data["minecraft_version"],
            mod_loader=data.get("mod_loader", "fabric"),
            mod_loader_version=data.get("mod_loader_version", "latest"),
            installer_version=data.get("installer_version", "latest"),
            mods=mods,
            java_args=data.get("java_args", "-Xms2G -Xmx4G"),
            background_color=data.get("background_color", "#0d1117"),
            background_image=data.get("background_image"),
            azure_client_id=data.get("azure_client_id"),
        )

    def server_mods(self) -> List[Mod]:
        return [m for m in self.mods if m.side in ("both", "server")]

    def client_mods(self) -> List[Mod]:
        return [m for m in self.mods if m.side in ("both", "client")]
