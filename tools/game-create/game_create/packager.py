from __future__ import annotations

import io
import json
import tarfile
from pathlib import Path


def _add_json(tar: tarfile.TarFile, arcname: str, data: dict) -> None:
    content = json.dumps(data, indent=2).encode("utf-8")
    info = tarfile.TarInfo(name=arcname)
    info.size = len(content)
    tar.addfile(info, io.BytesIO(content))


def create_server_artifact(
    server_jar: Path,
    mod_paths: list[Path],
    manifest: dict,
    output: Path,
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(output, "w:xz") as tar:
        tar.add(server_jar, arcname="server/server.jar")
        for mod in mod_paths:
            tar.add(mod, arcname=f"server/mods/{mod.name}")
        _add_json(tar, "server/manifest.json", manifest)


def create_client_artifact(
    mod_paths: list[Path],
    manifest: dict,
    output: Path,
) -> None:
    """
    Creates client.tar.xz containing mods/ and manifest.json.
    This is extracted into the Electron app's resources/ directory at build time.
    """
    output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(output, "w:xz") as tar:
        for mod in mod_paths:
            tar.add(mod, arcname=f"mods/{mod.name}")
        _add_json(tar, "manifest.json", manifest)
