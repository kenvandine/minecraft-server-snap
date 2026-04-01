from __future__ import annotations

import os
from pathlib import Path

import requests
from rich.progress import (
    BarColumn,
    DownloadColumn,
    Progress,
    TextColumn,
    TimeRemainingColumn,
    TransferSpeedColumn,
)


def download_file(url: str, dest: Path, label: str | None = None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    display = label or dest.name

    with Progress(
        TextColumn(f"[cyan]{display}"),
        BarColumn(),
        DownloadColumn(),
        TransferSpeedColumn(),
        TimeRemainingColumn(),
    ) as progress:
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()
        total = int(response.headers.get("content-length", 0))
        task = progress.add_task("", total=total or None)

        with open(dest, "wb") as f:
            for chunk in response.iter_content(chunk_size=65536):
                f.write(chunk)
                progress.advance(task, len(chunk))


def download_mods(mods, dest_dir: Path, label_prefix: str = "") -> list[Path]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for mod in mods:
        filename = mod.url.split("/")[-1].split("?")[0]
        dest = dest_dir / filename
        if not dest.exists():
            download_file(mod.url, dest, label=f"{label_prefix}{mod.name}")
        else:
            print(f"  [skip] {mod.name} (already downloaded)")
        paths.append(dest)
    return paths
