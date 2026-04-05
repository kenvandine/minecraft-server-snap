from __future__ import annotations

import shutil
import sys
from pathlib import Path

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from .config import PackConfig
from .downloader import download_file, download_mods
from .fabric import get_server_jar_url, resolve_installer_version, resolve_loader_version
from .packager import create_client_artifact, create_server_artifact
from .publisher import publish_release

console = Console()


def build_artifacts(config: PackConfig, output_dir: Path, cache_dir: Path) -> tuple[Path, Path]:
    """Download all components and produce server.tar.xz and client.tar.xz."""

    console.rule(f"[bold cyan]Building {config.name} {config.version}")

    # Resolve Fabric versions
    console.print("[cyan]Resolving Fabric versions...")
    loader_version = resolve_loader_version(config.minecraft_version, config.mod_loader_version)
    installer_version = resolve_installer_version(config.installer_version)
    console.print(f"  Loader:    {loader_version}")
    console.print(f"  Installer: {installer_version}")

    # Download Fabric server JAR
    server_jar_url = get_server_jar_url(
        config.minecraft_version, loader_version, installer_version
    )
    server_jar = cache_dir / "server.jar"
    console.print(f"\n[bold]Downloading Fabric server JAR...")
    download_file(server_jar_url, server_jar, label="fabric-server.jar")

    # Download server mods
    server_mods_dir = cache_dir / "server_mods"
    console.print(f"\n[bold]Downloading server mods ({len(config.server_mods())} files)...")
    server_mod_paths = download_mods(config.server_mods(), server_mods_dir, label_prefix="[server] ")

    # Download client mods
    client_mods_dir = cache_dir / "client_mods"
    console.print(f"\n[bold]Downloading client mods ({len(config.client_mods())} files)...")
    client_mod_paths = download_mods(config.client_mods(), client_mods_dir, label_prefix="[client] ")

    # Download shader packs
    shader_pack_paths = []
    if config.shader_packs:
        shader_packs_dir = cache_dir / "shaderpacks"
        console.print(f"\n[bold]Downloading shader packs ({len(config.shader_packs)} files)...")
        shader_pack_paths = download_mods(config.shader_packs, shader_packs_dir, label_prefix="[shader] ")

    manifest = {
        "name": config.name,
        "version": config.version,
        "minecraft_version": config.minecraft_version,
        "mod_loader": config.mod_loader,
        "mod_loader_version": loader_version,
        "installer_version": installer_version,
        "java_args": config.java_args,
        "background_color": config.background_color,
        "background_image": config.background_image,
        "azure_client_id": config.azure_client_id,
        "server": config.server,
        "port": config.port,
        "github_repo": config.github_repo,
        "mods": [
            {"name": m.name, "filename": p.name, "side": m.side}
            for m, p in zip(config.client_mods(), client_mod_paths)
        ],
        "shader_packs": [
            {"name": s.name, "filename": p.name}
            for s, p in zip(config.shader_packs, shader_pack_paths)
        ],
    }

    # Create server artifact
    server_artifact = output_dir / "server.tar.xz"
    console.print(f"\n[bold]Creating server.tar.xz...")
    create_server_artifact(server_jar, server_mod_paths, manifest, server_artifact)
    console.print(f"  -> {server_artifact} ({server_artifact.stat().st_size // 1024 // 1024} MB)")

    # Create client artifact
    client_artifact = output_dir / "client.tar.xz"
    console.print(f"\n[bold]Creating client.tar.xz...")
    create_client_artifact(client_mod_paths, manifest, client_artifact, shader_pack_paths)
    console.print(f"  -> {client_artifact} ({client_artifact.stat().st_size // 1024} KB)")

    return server_artifact, client_artifact


@click.group()
def main():
    """game-create: Build and publish Minecraft modpack artifacts."""


@main.command()
@click.argument("config_file", metavar="CONFIG")
@click.option("--output", "-o", default="./dist", help="Output directory", show_default=True)
@click.option("--cache", default="./.game-create-cache", help="Cache directory", show_default=True)
def build(config_file: str, output: str, cache: str):
    """Build server.tar.xz and client.tar.xz from CONFIG."""
    try:
        config = PackConfig.from_yaml(config_file)
    except Exception as e:
        console.print(f"[red]Error reading config: {e}")
        sys.exit(1)

    output_dir = Path(output)
    cache_dir = Path(cache)
    output_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)

    try:
        server_artifact, client_artifact = build_artifacts(config, output_dir, cache_dir)
        console.print(Panel(
            f"[green bold]Build complete![/]\n\n"
            f"[cyan]Server:[/] {server_artifact}\n"
            f"[cyan]Client:[/] {client_artifact}\n\n"
            f"Install server: [bold]sudo minecraft-server.install-pack {server_artifact}[/]\n"
            f"Build launcher: inject client.tar.xz into launcher/resources/",
            title="Done",
        ))
    except Exception as e:
        console.print(f"[red]Build failed: {e}")
        sys.exit(1)


@main.command()
@click.argument("config_file", metavar="CONFIG")
@click.option("--tag", required=True, help="Git tag for the release (e.g. v1.0.0)")
@click.option("--repo", default=None, help="GitHub repo (owner/name), defaults to current repo")
@click.option("--output", "-o", default="./dist", help="Output directory", show_default=True)
@click.option("--cache", default="./.game-create-cache", help="Cache directory", show_default=True)
@click.option("--draft", is_flag=True, help="Create as draft release")
def publish(config_file: str, tag: str, repo: str | None, output: str, cache: str, draft: bool):
    """Build artifacts and publish to a GitHub release."""
    try:
        config = PackConfig.from_yaml(config_file)
    except Exception as e:
        console.print(f"[red]Error reading config: {e}")
        sys.exit(1)

    output_dir = Path(output)
    cache_dir = Path(cache)
    output_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)

    try:
        server_artifact, client_artifact = build_artifacts(config, output_dir, cache_dir)
        console.print(f"\n[bold]Publishing to GitHub release {tag}...")
        publish_release(
            tag=tag,
            title=f"{config.name} {tag}",
            artifacts=[server_artifact, client_artifact],
            repo=repo,
            notes=f"Minecraft {config.minecraft_version} + Fabric modpack",
            draft=draft,
        )
        console.print("[green bold]Published!")
    except Exception as e:
        console.print(f"[red]Publish failed: {e}")
        sys.exit(1)
