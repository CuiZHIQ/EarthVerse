"""Validate that the published EarthVerse Viewer is self-contained."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


DEFAULT_SITE_ROOT = Path(__file__).resolve().parents[1]
PAGES_SITE_LIMIT_BYTES = 1_000_000_000


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--site-root",
        type=Path,
        default=DEFAULT_SITE_ROOT,
        help="assembled GitHub Pages artifact root",
    )
    args = parser.parse_args()
    site_root = args.site_root.resolve()

    app_source = (site_root / "app.js").read_text(encoding="utf-8")
    if "../../${file.repository_path}" in app_source:
        raise SystemExit("app.js still emits URLs that escape the Pages artifact root")

    site_bytes = sum(
        path.stat().st_size
        for path in site_root.rglob("*")
        if path.is_file()
        and path.relative_to(site_root).parts[0] not in {".git", ".github"}
    )
    if site_bytes > PAGES_SITE_LIMIT_BYTES:
        raise SystemExit(
            f"Pages artifact is {site_bytes:,} bytes; limit is {PAGES_SITE_LIMIT_BYTES:,}"
        )

    checked_files = 0
    missing: list[str] = []
    escaped: list[str] = []

    for task_path in sorted((site_root / "data" / "tasks").glob("*.json")):
        task = json.loads(task_path.read_text(encoding="utf-8"))
        for item in task.get("event_files", []):
            published_path = item.get("preview_url") or item.get("viewer_path")
            if not published_path:
                missing.append(f"{task_path.name}: missing preview_url and viewer_path")
                continue

            target = (site_root / published_path).resolve()
            try:
                target.relative_to(site_root)
            except ValueError:
                escaped.append(f"{task_path.name}: {published_path}")
                continue

            checked_files += 1
            if not target.is_file():
                missing.append(f"{task_path.name}: {published_path}")

    if escaped:
        raise SystemExit(f"viewer paths escape the Pages root: {escaped[:5]}")
    if missing:
        raise SystemExit(f"viewer files are missing from the Pages artifact: {missing[:5]}")
    if checked_files == 0:
        raise SystemExit("no event-package files were checked")

    print(
        f"Verified {checked_files:,} event-file links inside {site_root} "
        f"({site_bytes:,} bytes)"
    )


if __name__ == "__main__":
    main()
