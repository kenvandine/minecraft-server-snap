from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def publish_release(
    tag: str,
    title: str,
    artifacts: list[Path],
    repo: str | None = None,
    notes: str = "",
    draft: bool = False,
) -> None:
    """Create a GitHub release and upload artifacts using the gh CLI."""
    cmd = ["gh", "release", "create", tag]
    if repo:
        cmd += ["--repo", repo]
    cmd += ["--title", title or tag]
    if notes:
        cmd += ["--notes", notes]
    if draft:
        cmd += ["--draft"]
    cmd += [str(p) for p in artifacts]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        raise RuntimeError(f"gh release create failed: {result.stderr.strip()}")
    print(result.stdout.strip())
